// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * operator_care.js — Operator Care (Autonomous Maintenance)
 * ===========================================================
 * Mobile-first inspection checklists for operators performing daily/weekly
 * equipment checks. Each route defines an ordered sequence of pass/fail/NA
 * steps. When a step fails, a Work Order is automatically created.
 *
 * All data stored in trier_logistics.db with PlantID scoping.
 * Tables are created at startup with CREATE TABLE IF NOT EXISTS.
 *
 * -- ROUTES ----------------------------------------------------
 *   GET    /api/operator-care/routes              List inspection routes
 *   POST   /api/operator-care/routes              Create inspection route
 *   PUT    /api/operator-care/routes/:id          Update route
 *   DELETE /api/operator-care/routes/:id          Remove route (no results yet only)
 *   GET    /api/operator-care/routes/:id/steps    List steps for a route
 *   POST   /api/operator-care/routes/:id/steps    Add a step
 *   DELETE /api/operator-care/routes/:id/steps/:stepId  Remove a step
 *   POST   /api/operator-care/results             Submit inspection results (auto-WO on fail)
 *   GET    /api/operator-care/results             List results (filter: route, asset, plant)
 *   GET    /api/operator-care/dashboard           Summary: routes, completions, auto-WOs
 *
 * -- P5 ROADMAP ITEM COVERED ----------------------------------
 *   💰 Operator Care (Autonomous Maintenance)
 */

'use strict';

const express     = require('express');
const router      = express.Router();
const logisticsDb = require('../logistics_db').db;

// ── Table initialization (idempotent) ─────────────────────────────────────────
logisticsDb.exec(`
    CREATE TABLE IF NOT EXISTS InspectionRoutes (
        ID              INTEGER PRIMARY KEY AUTOINCREMENT,
        PlantID         TEXT    NOT NULL,
        Name            TEXT    NOT NULL,
        Description     TEXT,
        AssetID         TEXT,               -- Primary asset this route covers (optional)
        Frequency       TEXT    DEFAULT 'Daily',  -- Daily | Weekly | Monthly | Shift
        EstMinutes      INTEGER DEFAULT 15,
        Active          INTEGER DEFAULT 1,
        CreatedBy       TEXT,
        CreatedAt       TEXT    DEFAULT (datetime('now')),
        UpdatedAt       TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS InspectionSteps (
        ID              INTEGER PRIMARY KEY AUTOINCREMENT,
        RouteID         INTEGER NOT NULL REFERENCES InspectionRoutes(ID) ON DELETE CASCADE,
        AssetID         TEXT,               -- Specific asset this step applies to
        StepLabel       TEXT    NOT NULL,
        Instructions    TEXT,
        ControlLimit    TEXT,               -- Expected reading or acceptable range
        RequiresPhoto   INTEGER DEFAULT 0,
        SortOrder       INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS InspectionResults (
        ID              INTEGER PRIMARY KEY AUTOINCREMENT,
        RouteID         INTEGER NOT NULL,
        StepID          INTEGER NOT NULL,
        PlantID         TEXT    NOT NULL,
        Result          TEXT    NOT NULL,   -- Pass | Fail | NA
        Reading         TEXT,              -- Numeric or text reading
        Notes           TEXT,
        PhotoURL        TEXT,
        AutoWOID        TEXT,              -- Work order number created on Fail
        SubmittedBy     TEXT,
        SubmittedAt     TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS InspectionSessions (
        ID              INTEGER PRIMARY KEY AUTOINCREMENT,
        RouteID         INTEGER NOT NULL,
        PlantID         TEXT    NOT NULL,
        StartedAt       TEXT    NOT NULL,
        CompletedAt     TEXT,
        SubmittedBy     TEXT,
        TotalSteps      INTEGER DEFAULT 0,
        PassCount       INTEGER DEFAULT 0,
        FailCount       INTEGER DEFAULT 0,
        NACount         INTEGER DEFAULT 0,
        AutoWOsCreated  INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_inspect_route  ON InspectionResults(RouteID);
    CREATE INDEX IF NOT EXISTS idx_inspect_plant  ON InspectionResults(PlantID);
    CREATE INDEX IF NOT EXISTS idx_session_route  ON InspectionSessions(RouteID);
`);

// ── GET /api/operator-care/routes ─────────────────────────────────────────────
router.get('/routes', (req, res) => {
    try {
        const { plantId } = req.query;
        let sql = 'SELECT r.*, (SELECT COUNT(*) FROM InspectionSteps WHERE RouteID=r.ID) AS stepCount FROM InspectionRoutes r WHERE r.Active=1';
        const p = [];
        if (plantId) { sql += ' AND r.PlantID = ?'; p.push(plantId); }
        sql += ' ORDER BY r.Name ASC';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/operator-care/routes ────────────────────────────────────────────
router.post('/routes', (req, res) => {
    try {
        const { plantId, name, description, assetId, frequency = 'Daily', estMinutes = 15 } = req.body;
        if (!plantId || !name) return res.status(400).json({ error: 'plantId and name are required' });
        const r = logisticsDb.prepare(
            'INSERT INTO InspectionRoutes (PlantID, Name, Description, AssetID, Frequency, EstMinutes, CreatedBy) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(plantId, name, description || null, assetId || null, frequency, parseInt(estMinutes) || 15, req.user?.Username || 'system');
        res.status(201).json({ id: r.lastInsertRowid, ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/operator-care/routes/:id ─────────────────────────────────────────
router.put('/routes/:id', (req, res) => {
    try {
        const { name, description, assetId, frequency, estMinutes, active } = req.body;
        const fields = {};
        if (name        !== undefined) fields.Name        = name;
        if (description !== undefined) fields.Description = description;
        if (assetId     !== undefined) fields.AssetID     = assetId;
        if (frequency   !== undefined) fields.Frequency   = frequency;
        if (estMinutes  !== undefined) fields.EstMinutes  = parseInt(estMinutes) || 15;
        if (active      !== undefined) fields.Active      = active ? 1 : 0;
        if (!Object.keys(fields).length) return res.status(400).json({ error: 'No fields to update' });
        fields.UpdatedAt = new Date().toISOString();
        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        logisticsDb.prepare(`UPDATE InspectionRoutes SET ${sets} WHERE ID = ?`).run(...Object.values(fields), req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/operator-care/routes/:id ─────────────────────────────────────
router.delete('/routes/:id', (req, res) => {
    try {
        const hasResults = logisticsDb.prepare('SELECT COUNT(*) AS c FROM InspectionResults WHERE RouteID = ?').get(req.params.id);
        if (hasResults.c > 0) return res.status(403).json({ error: 'Cannot delete a route that has inspection history' });
        logisticsDb.prepare('DELETE FROM InspectionRoutes WHERE ID = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/operator-care/routes/:id/steps ───────────────────────────────────
router.get('/routes/:id/steps', (req, res) => {
    try {
        const steps = logisticsDb.prepare('SELECT * FROM InspectionSteps WHERE RouteID = ? ORDER BY SortOrder, ID').all(req.params.id);
        res.json(steps);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/operator-care/routes/:id/steps ─────────────────────────────────
router.post('/routes/:id/steps', (req, res) => {
    try {
        const { assetId, stepLabel, instructions, controlLimit, requiresPhoto = false, sortOrder = 0 } = req.body;
        if (!stepLabel) return res.status(400).json({ error: 'stepLabel is required' });
        const r = logisticsDb.prepare(
            'INSERT INTO InspectionSteps (RouteID, AssetID, StepLabel, Instructions, ControlLimit, RequiresPhoto, SortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(req.params.id, assetId || null, stepLabel, instructions || null, controlLimit || null, requiresPhoto ? 1 : 0, parseInt(sortOrder));
        res.status(201).json({ id: r.lastInsertRowid, ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/operator-care/routes/:id/steps/:stepId ───────────────────────
router.delete('/routes/:id/steps/:stepId', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM InspectionSteps WHERE ID = ? AND RouteID = ?').run(req.params.stepId, req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/operator-care/results ───────────────────────────────────────────
// Submit a batch of inspection step results for a session.
// Automatically creates a Work Order for any Fail result if the step has an AssetID.
router.post('/results', (req, res) => {
    try {
        const { routeId, plantId, submittedBy, steps = [] } = req.body;
        if (!routeId || !plantId || !steps.length) {
            return res.status(400).json({ error: 'routeId, plantId, and steps[] are required' });
        }

        const by  = submittedBy || req.user?.Username || 'system';
        const now = new Date().toISOString();
        let passCount = 0, failCount = 0, naCount = 0, autoWOs = 0;

        const insResult = logisticsDb.prepare(
            'INSERT INTO InspectionResults (RouteID, StepID, PlantID, Result, Reading, Notes, PhotoURL, AutoWOID, SubmittedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        const createdWOs = [];
        for (const step of steps) {
            const result = (step.result || 'NA').toUpperCase();
            let autoWOID = null;

            if (result === 'FAIL' && step.assetId) {
                // Auto-create a work order in the plant DB for failed steps
                try {
                    const db = require('../database');
                    const conn = db.getDb(plantId);
                    const desc = `Auto-WO from Operator Care inspection fail: ${step.stepLabel || 'Step ' + step.stepId}`;
                    const wo = conn.prepare(`
                        INSERT INTO Work (Description, AstID, StatusID, AddDate, WOSource)
                        VALUES (?, ?, 20, date('now'), 'UNPLANNED')
                    `).run(desc, step.assetId);
                    autoWOID = String(wo.lastInsertRowid);
                    autoWOs++;
                    createdWOs.push({ stepId: step.stepId, woId: autoWOID });
                } catch { /* non-blocking — WO table may vary */ }
            }

            insResult.run(routeId, step.stepId, plantId, result, step.reading || null, step.notes || null, step.photoUrl || null, autoWOID, by);

            if (result === 'PASS') passCount++;
            else if (result === 'FAIL') failCount++;
            else naCount++;
        }

        // Log the session
        logisticsDb.prepare(`
            INSERT INTO InspectionSessions (RouteID, PlantID, StartedAt, CompletedAt, SubmittedBy, TotalSteps, PassCount, FailCount, NACount, AutoWOsCreated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(routeId, plantId, req.body.startedAt || now, now, by, steps.length, passCount, failCount, naCount, autoWOs);

        res.status(201).json({ ok: true, passCount, failCount, naCount, autoWOsCreated: autoWOs, createdWOs });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/operator-care/results ────────────────────────────────────────────
router.get('/results', (req, res) => {
    try {
        const { routeId, plantId, result, limit = 200 } = req.query;
        let sql = 'SELECT * FROM InspectionResults WHERE 1=1';
        const p = [];
        if (routeId) { sql += ' AND RouteID = ?'; p.push(routeId); }
        if (plantId) { sql += ' AND PlantID = ?'; p.push(plantId); }
        if (result)  { sql += ' AND Result = ?';  p.push(result.toUpperCase()); }
        sql += ' ORDER BY SubmittedAt DESC LIMIT ?';
        p.push(parseInt(limit, 10) || 200);
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/operator-care/dashboard ──────────────────────────────────────────
router.get('/dashboard', (req, res) => {
    try {
        const { plantId } = req.query;
        let where = '1=1'; const p = [];
        if (plantId) { where = 'PlantID = ?'; p.push(plantId); }

        const routeCount = logisticsDb.prepare(`SELECT COUNT(*) AS c FROM InspectionRoutes WHERE Active=1 AND ${where.replace('PlantID', 'PlantID')}`).get(...p);
        const sessions30 = logisticsDb.prepare(`SELECT COUNT(*) AS c FROM InspectionSessions WHERE ${where} AND StartedAt >= date('now','-30 days')`).get(...p);
        const autoWOs30  = logisticsDb.prepare(`SELECT COALESCE(SUM(AutoWOsCreated),0) AS c FROM InspectionSessions WHERE ${where} AND StartedAt >= date('now','-30 days')`).get(...p);
        const failRate   = logisticsDb.prepare(`SELECT COALESCE(SUM(FailCount),0) AS fails, COALESCE(SUM(TotalSteps),0) AS total FROM InspectionSessions WHERE ${where} AND StartedAt >= date('now','-30 days')`).get(...p);

        res.json({
            activeRoutes:       routeCount?.c || 0,
            sessions30Days:     sessions30?.c || 0,
            autoWOsCreated30:   autoWOs30?.c  || 0,
            failRate30Days:     failRate?.total > 0 ? Math.round((failRate.fails / failRate.total) * 100) : null,
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
