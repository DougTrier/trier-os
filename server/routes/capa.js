// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * capa.js — Closed-Loop Corrective Action (CAPA) Tracking
 * =========================================================
 * Extends the existing RCA module (engineering.js) with a proper
 * CorrectiveActions table. Each CAPA record has an owner, due date,
 * status, and optional verification WO link — closing the loop from
 * root cause to confirmed resolution.
 *
 * All data stored in trier_logistics.db (cross-plant, with PlantID scope).
 * Tables are created at startup with CREATE TABLE IF NOT EXISTS.
 *
 * -- ROUTES ----------------------------------------------------
 *   GET    /api/capa              List CAPA records (filter: rcaId, plantId, status)
 *   POST   /api/capa              Create a new CAPA record
 *   PUT    /api/capa/:id          Update CAPA (status, notes, verificationWOId)
 *   DELETE /api/capa/:id          Remove a CAPA record (open status only)
 *   GET    /api/capa/overdue      List overdue open CAPAs for escalation review
 *
 * -- P3 ROADMAP ITEM COVERED ----------------------------------
 *   💰 Closed-Loop CAPA Tracking
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const logisticsDb  = require('../logistics_db').db;

// ── Table initialization (idempotent) ─────────────────────────────────────────
logisticsDb.exec(`
    CREATE TABLE IF NOT EXISTS CorrectiveActions (
        ID              INTEGER PRIMARY KEY AUTOINCREMENT,
        RCAID           INTEGER,                    -- Links to rca_investigations.ID (nullable for standalone CAPAs)
        PlantID         TEXT NOT NULL,
        Title           TEXT NOT NULL,
        Description     TEXT,
        Owner           TEXT,                       -- Username responsible for completion
        DueDate         TEXT,                       -- ISO date string
        Status          TEXT DEFAULT 'Open',        -- Open | InProgress | Completed | Overdue | Cancelled
        Priority        TEXT DEFAULT 'Medium',      -- Low | Medium | High | Critical
        VerificationWOID TEXT,                      -- Work Order ID that verified the fix
        VerifiedAt      TEXT,
        VerifiedBy      TEXT,
        CompletedAt     TEXT,
        Notes           TEXT,
        CreatedBy       TEXT,
        CreatedAt       TEXT DEFAULT (datetime('now')),
        UpdatedAt       TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_capa_rca      ON CorrectiveActions(RCAID);
    CREATE INDEX IF NOT EXISTS idx_capa_plant    ON CorrectiveActions(PlantID);
    CREATE INDEX IF NOT EXISTS idx_capa_status   ON CorrectiveActions(Status);
    CREATE INDEX IF NOT EXISTS idx_capa_owner    ON CorrectiveActions(Owner);
    CREATE INDEX IF NOT EXISTS idx_capa_duedate  ON CorrectiveActions(DueDate);
`);

// ── GET /api/capa ─────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const { rcaId, plantId, status } = req.query;
        let sql = 'SELECT * FROM CorrectiveActions WHERE 1=1';
        const params = [];
        if (rcaId)  { sql += ' AND RCAID = ?';   params.push(rcaId); }
        if (plantId){ sql += ' AND PlantID = ?';  params.push(plantId); }
        if (status) { sql += ' AND Status = ?';   params.push(status); }
        sql += ' ORDER BY DueDate ASC, Priority DESC, CreatedAt DESC';

        // Auto-flag overdue items before returning
        logisticsDb.prepare(`
            UPDATE CorrectiveActions
            SET Status = 'Overdue', UpdatedAt = datetime('now')
            WHERE Status = 'Open' AND DueDate < date('now')
        `).run();

        const rows = logisticsDb.prepare(sql).all(...params);
        res.json(rows);
    } catch (err) {
        console.error('[capa] GET / error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/capa/overdue ─────────────────────────────────────────────────────
router.get('/overdue', (req, res) => {
    try {
        const { plantId } = req.query;
        let sql = `SELECT * FROM CorrectiveActions WHERE Status IN ('Open','Overdue') AND DueDate < date('now')`;
        const params = [];
        if (plantId) { sql += ' AND PlantID = ?'; params.push(plantId); }
        sql += ' ORDER BY DueDate ASC';
        const rows = logisticsDb.prepare(sql).all(...params);
        res.json({ count: rows.length, items: rows });
    } catch (err) {
        console.error('[capa] GET /overdue error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/capa ────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
    try {
        const { rcaId, plantId, title, description, owner, dueDate, priority, notes } = req.body;
        if (!plantId || !title) return res.status(400).json({ error: 'plantId and title are required' });

        const result = logisticsDb.prepare(`
            INSERT INTO CorrectiveActions
                (RCAID, PlantID, Title, Description, Owner, DueDate, Priority, Notes, CreatedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            rcaId || null, plantId, title, description || null, owner || null,
            dueDate || null, priority || 'Medium', notes || null,
            req.user?.Username || 'system'
        );

        res.status(201).json({ id: result.lastInsertRowid, ok: true });
    } catch (err) {
        console.error('[capa] POST / error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /api/capa/:id ─────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
    try {
        const allowed = ['Title', 'Description', 'Owner', 'DueDate', 'Status', 'Priority',
                         'VerificationWOID', 'VerifiedAt', 'VerifiedBy', 'CompletedAt', 'Notes'];
        const fields = {};
        for (const f of allowed) {
            if (Object.prototype.hasOwnProperty.call(req.body, f)) fields[f] = req.body[f];
        }
        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        // Auto-set CompletedAt when status is being set to Completed
        if (fields.Status === 'Completed' && !fields.CompletedAt) {
            fields.CompletedAt = new Date().toISOString();
        }
        fields.UpdatedAt = new Date().toISOString();

        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        logisticsDb.prepare(`UPDATE CorrectiveActions SET ${sets} WHERE ID = ?`)
            .run(...Object.values(fields), req.params.id);

        res.json({ ok: true });
    } catch (err) {
        console.error('[capa] PUT /:id error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── DELETE /api/capa/:id ──────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
    try {
        const row = logisticsDb.prepare('SELECT Status FROM CorrectiveActions WHERE ID = ?').get(req.params.id);
        if (!row) return res.status(404).json({ error: 'CAPA record not found' });
        if (row.Status === 'Completed') {
            return res.status(403).json({ error: 'Cannot delete completed CAPA records — they are part of your audit trail' });
        }
        logisticsDb.prepare('DELETE FROM CorrectiveActions WHERE ID = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        console.error('[capa] DELETE /:id error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
