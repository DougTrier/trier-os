// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * moc.js — Management of Change (MOC)
 * =====================================
 * Digital workflow for plant change requests: process changes, equipment
 * modifications, procedure updates, and temporary deviations. Each MOC
 * record tracks the full approval chain, risk assessment, Pre-Startup
 * Safety Review (PSSR) checklist, and links to affected assets/WOs/SOPs.
 *
 * All data stored in trier_logistics.db (cross-plant, with PlantID scope).
 * Tables are created at startup with CREATE TABLE IF NOT EXISTS.
 *
 * -- ROUTES ----------------------------------------------------
 *   GET    /api/moc                  List MOC records (filter: plantId, status, type)
 *   GET    /api/moc/:id              Full MOC detail with approvals + affected items
 *   POST   /api/moc                  Create a new MOC request (Draft)
 *   PUT    /api/moc/:id              Update MOC fields (title, description, risk, PSSR)
 *   DELETE /api/moc/:id              Remove MOC (Draft only)
 *   POST   /api/moc/:id/approve      Submit approval (Approve/Reject) for current stage
 *   GET    /api/moc/:id/affected     List items linked to this MOC
 *   POST   /api/moc/:id/affected     Link an asset, WO, or SOP to this MOC
 *   DELETE /api/moc/:id/affected/:itemId  Remove an affected item link
 *
 * -- P4 ROADMAP ITEM COVERED ----------------------------------
 *   Management of Change (MOC)
 */

'use strict';

const express     = require('express');
const router      = express.Router();
const logisticsDb = require('../logistics_db').db;
const requireGatekeeper = require('../middleware/require_gatekeeper');

// ── Table initialization (idempotent) ─────────────────────────────────────────
logisticsDb.exec(`
    CREATE TABLE IF NOT EXISTS ManagementOfChange (
        ID                  INTEGER PRIMARY KEY AUTOINCREMENT,
        MOCNumber           TEXT    UNIQUE,
        PlantID             TEXT    NOT NULL,
        ChangeType          TEXT    NOT NULL,  -- PROCESS | EQUIPMENT | PROCEDURE | TEMPORARY | EMERGENCY
        Title               TEXT    NOT NULL,
        Description         TEXT,
        Justification       TEXT,
        Status              TEXT    DEFAULT 'DRAFT',
            -- DRAFT | UNDER_REVIEW | APPROVED | IMPLEMENTING | COMPLETED | REJECTED | CANCELLED
        RiskLevel           TEXT    DEFAULT 'MEDIUM',  -- LOW | MEDIUM | HIGH | CRITICAL
        RiskDescription     TEXT,
        PSSRRequired        INTEGER DEFAULT 0,         -- 1 if Pre-Startup Safety Review required
        PSSRCompleted       INTEGER DEFAULT 0,
        PSSRCompletedBy     TEXT,
        PSSRCompletedAt     TEXT,
        TargetDate          TEXT,
        CompletedAt         TEXT,
        RejectedAt          TEXT,
        RejectedBy          TEXT,
        RejectionReason     TEXT,
        RequestedBy         TEXT,
        Notes               TEXT,
        CreatedAt           TEXT    DEFAULT (datetime('now')),
        UpdatedAt           TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS MOCApprovals (
        ID          INTEGER PRIMARY KEY AUTOINCREMENT,
        MOCID       INTEGER NOT NULL REFERENCES ManagementOfChange(ID) ON DELETE CASCADE,
        Stage       INTEGER NOT NULL,          -- 1 = Safety Review, 2 = Engineering, 3 = Management
        StageLabel  TEXT    NOT NULL,
        Status      TEXT    DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED
        ApprovedBy  TEXT,
        ApprovedAt  TEXT,
        Comments    TEXT,
        CreatedAt   TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS MOCAffectedItems (
        ID          INTEGER PRIMARY KEY AUTOINCREMENT,
        MOCID       INTEGER NOT NULL REFERENCES ManagementOfChange(ID) ON DELETE CASCADE,
        ItemType    TEXT    NOT NULL,  -- ASSET | WORK_ORDER | SOP | PROCEDURE
        ItemID      TEXT    NOT NULL,
        ItemLabel   TEXT,
        Notes       TEXT,
        AddedBy     TEXT,
        AddedAt     TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_moc_plant   ON ManagementOfChange(PlantID);
    CREATE INDEX IF NOT EXISTS idx_moc_status  ON ManagementOfChange(Status);
    CREATE INDEX IF NOT EXISTS idx_moc_approvals_moc ON MOCApprovals(MOCID);
    CREATE INDEX IF NOT EXISTS idx_moc_affected_moc  ON MOCAffectedItems(MOCID);
`);

// ── Helper: generate MOC number ───────────────────────────────────────────────
function generateMOCNumber(plantId) {
    const prefix = (plantId || 'PLT').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4);
    const ts     = Date.now().toString(36).toUpperCase().slice(-6);
    return `MOC-${prefix}-${ts}`;
}

// ── Default approval stages by change type ────────────────────────────────────
const APPROVAL_STAGES = {
    EMERGENCY: [
        { stage: 1, label: 'Safety Sign-Off' }
    ],
    TEMPORARY: [
        { stage: 1, label: 'Safety Review' },
        { stage: 2, label: 'Supervisor Approval' }
    ],
    DEFAULT: [
        { stage: 1, label: 'Safety Review' },
        { stage: 2, label: 'Engineering Review' },
        { stage: 3, label: 'Management Approval' }
    ]
};

// ── GET /api/moc ──────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const { plantId, status, type } = req.query;
        let sql = 'SELECT * FROM ManagementOfChange WHERE 1=1';
        const params = [];
        if (plantId) { sql += ' AND PlantID = ?';    params.push(plantId); }
        if (status)  { sql += ' AND Status = ?';     params.push(status); }
        if (type)    { sql += ' AND ChangeType = ?'; params.push(type); }
        sql += ' ORDER BY CreatedAt DESC';
        res.json(logisticsDb.prepare(sql).all(...params));
    } catch (err) {
        console.error('[moc] GET / error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/moc/:id ──────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
    try {
        const moc = logisticsDb.prepare('SELECT * FROM ManagementOfChange WHERE ID = ?').get(req.params.id);
        if (!moc) return res.status(404).json({ error: 'MOC not found' });

        const approvals     = logisticsDb.prepare('SELECT * FROM MOCApprovals WHERE MOCID = ? ORDER BY Stage ASC').all(req.params.id);
        const affectedItems = logisticsDb.prepare('SELECT * FROM MOCAffectedItems WHERE MOCID = ? ORDER BY AddedAt ASC').all(req.params.id);

        res.json({ ...moc, approvals, affectedItems });
    } catch (err) {
        console.error('[moc] GET /:id error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/moc ─────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
    try {
        const {
            plantId, changeType = 'PROCESS', title, description, justification,
            riskLevel = 'MEDIUM', riskDescription, pssrRequired = false,
            targetDate, notes
        } = req.body;

        if (!plantId || !title) return res.status(400).json({ error: 'plantId and title are required' });

        const mocNumber = generateMOCNumber(plantId);
        const requestedBy = req.user?.Username || 'system';

        const result = logisticsDb.prepare(`
            INSERT INTO ManagementOfChange
                (MOCNumber, PlantID, ChangeType, Title, Description, Justification,
                 RiskLevel, RiskDescription, PSSRRequired, TargetDate, Notes, RequestedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            mocNumber, plantId, changeType.toUpperCase(), title,
            description || null, justification || null,
            riskLevel.toUpperCase(), riskDescription || null,
            pssrRequired ? 1 : 0, targetDate || null, notes || null, requestedBy
        );

        const mocId = result.lastInsertRowid;

        // Auto-create approval stages based on change type
        const stages = APPROVAL_STAGES[changeType.toUpperCase()] || APPROVAL_STAGES.DEFAULT;
        const insStage = logisticsDb.prepare(
            'INSERT INTO MOCApprovals (MOCID, Stage, StageLabel) VALUES (?, ?, ?)'
        );
        for (const s of stages) {
            insStage.run(mocId, s.stage, s.label);
        }

        res.status(201).json({ id: mocId, mocNumber, MOCNumber: mocNumber, approvalStages: stages, ok: true });
    } catch (err) {
        console.error('[moc] POST / error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /api/moc/:id ──────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
    try {
        const allowed = ['Title', 'Description', 'Justification', 'ChangeType', 'RiskLevel',
                         'RiskDescription', 'PSSRRequired', 'PSSRCompleted', 'PSSRCompletedBy',
                         'PSSRCompletedAt', 'TargetDate', 'Notes', 'Status'];
        const fields = {};
        for (const f of allowed) {
            if (Object.prototype.hasOwnProperty.call(req.body, f)) fields[f] = req.body[f];
        }
        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        fields.UpdatedAt = new Date().toISOString();

        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        logisticsDb.prepare(`UPDATE ManagementOfChange SET ${sets} WHERE ID = ?`)
            .run(...Object.values(fields), req.params.id);

        if (fields.Status === 'COMPLETED') {
            const moc = logisticsDb.prepare('SELECT PlantID FROM ManagementOfChange WHERE ID = ?').get(req.params.id);
            if (moc) {
                const affectedProcs = logisticsDb.prepare("SELECT ItemID FROM MOCAffectedItems WHERE MOCID = ? AND ItemType IN ('SOP', 'PROCEDURE')").all(req.params.id);
                if (affectedProcs.length > 0) {
                    const { getDb } = require('../database');
                    const plantDb = getDb(moc.PlantID);
                    const updateProc = plantDb.prepare('UPDATE Procedures SET SOPAcknowledgmentRequired = 1 WHERE ID = ?');
                    const clearAcks = plantDb.prepare('DELETE FROM SOPAcknowledgments WHERE ProcedureID = ?');
                    plantDb.transaction(() => {
                        for (const p of affectedProcs) {
                            try { 
                                updateProc.run(p.ItemID); 
                                clearAcks.run(p.ItemID);
                            } catch(e) {}
                        }
                    })();
                }
            }
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('[moc] PUT /:id error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── DELETE /api/moc/:id ───────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
    try {
        const moc = logisticsDb.prepare('SELECT Status FROM ManagementOfChange WHERE ID = ?').get(req.params.id);
        if (!moc) return res.status(404).json({ error: 'MOC not found' });
        if (moc.Status !== 'DRAFT') {
            return res.status(403).json({ error: 'Only DRAFT MOCs can be deleted' });
        }
        logisticsDb.prepare('DELETE FROM ManagementOfChange WHERE ID = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        console.error('[moc] DELETE /:id error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/moc/:id/approve ─────────────────────────────────────────────────
// Advance or reject the current pending approval stage.
router.post('/:id/approve',
    requireGatekeeper('MOC_APPROVE', req => req.params.id, 'MOC_RECORD'),
    (req, res) => {
    try {
        const { decision, approvedBy, comments } = req.body;
        if (!decision || !['APPROVED', 'REJECTED'].includes(decision.toUpperCase())) {
            return res.status(400).json({ error: 'decision must be APPROVED or REJECTED' });
        }

        const moc = logisticsDb.prepare('SELECT * FROM ManagementOfChange WHERE ID = ?').get(req.params.id);
        if (!moc) return res.status(404).json({ error: 'MOC not found' });
        if (!['DRAFT', 'UNDER_REVIEW'].includes(moc.Status)) {
            return res.status(400).json({ error: `Cannot approve an MOC in ${moc.Status} status` });
        }

        const pendingStage = logisticsDb.prepare(
            "SELECT * FROM MOCApprovals WHERE MOCID = ? AND Status = 'PENDING' ORDER BY Stage ASC LIMIT 1"
        ).get(req.params.id);

        if (!pendingStage) return res.status(400).json({ error: 'No pending approval stages' });

        const now = new Date().toISOString();
        const by  = approvedBy || req.user?.Username || 'system';

        logisticsDb.prepare(
            `UPDATE MOCApprovals SET Status = ?, ApprovedBy = ?, ApprovedAt = ?, Comments = ? WHERE ID = ?`
        ).run(decision.toUpperCase(), by, now, comments || null, pendingStage.ID);

        if (decision.toUpperCase() === 'REJECTED') {
            logisticsDb.prepare(
                `UPDATE ManagementOfChange SET Status = 'REJECTED', RejectedAt = ?, RejectedBy = ?, RejectionReason = ?, UpdatedAt = ? WHERE ID = ?`
            ).run(now, by, comments || null, now, req.params.id);
            return res.json({ ok: true, newStatus: 'REJECTED' });
        }

        // Check if all stages are now approved
        const remaining = logisticsDb.prepare(
            "SELECT COUNT(*) AS cnt FROM MOCApprovals WHERE MOCID = ? AND Status = 'PENDING'"
        ).get(req.params.id);

        const newStatus = remaining.cnt === 0 ? 'APPROVED' : 'UNDER_REVIEW';
        logisticsDb.prepare(
            `UPDATE ManagementOfChange SET Status = ?, UpdatedAt = ? WHERE ID = ?`
        ).run(newStatus, now, req.params.id);

        res.json({ ok: true, newStatus });
    } catch (err) {
        console.error('[moc] POST /:id/approve error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/moc/:id/affected ─────────────────────────────────────────────────
router.get('/:id/affected', (req, res) => {
    try {
        const rows = logisticsDb.prepare('SELECT * FROM MOCAffectedItems WHERE MOCID = ? ORDER BY AddedAt ASC').all(req.params.id);
        res.json(rows);
    } catch (err) {
        console.error('[moc] GET /:id/affected error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/moc/:id/affected ────────────────────────────────────────────────
router.post('/:id/affected', (req, res) => {
    try {
        const { itemType, itemId, itemLabel, notes } = req.body;
        if (!itemType || !itemId) return res.status(400).json({ error: 'itemType and itemId are required' });

        const result = logisticsDb.prepare(
            'INSERT INTO MOCAffectedItems (MOCID, ItemType, ItemID, ItemLabel, Notes, AddedBy) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(req.params.id, itemType.toUpperCase(), itemId, itemLabel || null, notes || null, req.user?.Username || 'system');

        res.status(201).json({ id: result.lastInsertRowid, ok: true });
    } catch (err) {
        console.error('[moc] POST /:id/affected error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── DELETE /api/moc/:id/affected/:itemId ─────────────────────────────────────
router.delete('/:id/affected/:itemId', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM MOCAffectedItems WHERE ID = ? AND MOCID = ?')
            .run(req.params.itemId, req.params.id);
        res.json({ ok: true });
    } catch (err) {
        console.error('[moc] DELETE /:id/affected/:itemId error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
