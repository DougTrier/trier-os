// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * turnaround.js — Shutdown / Turnaround Management
 * =================================================
 * Project-shell management for planned plant shutdowns and turnarounds.
 * Tracks WO sequencing, contractor crew assignment, isolation schedules,
 * budget vs. actual cost, and daily progress against the critical path.
 *
 * All data stored in trier_logistics.db with PlantID scoping.
 * Tables are created at startup with CREATE TABLE IF NOT EXISTS.
 *
 * -- ROUTES ----------------------------------------------------
 *   GET    /api/turnaround/projects              List turnaround projects
 *   POST   /api/turnaround/projects              Create project
 *   PUT    /api/turnaround/projects/:id          Update project fields
 *   DELETE /api/turnaround/projects/:id          Delete PLANNING-status project only
 *   GET    /api/turnaround/projects/:id          Full project detail
 *   GET    /api/turnaround/projects/:id/tasks    List tasks (with dependency chain)
 *   POST   /api/turnaround/projects/:id/tasks    Add task
 *   PUT    /api/turnaround/tasks/:id             Update task (status, actual cost, hours)
 *   DELETE /api/turnaround/tasks/:id             Remove task (not started only)
 *   GET    /api/turnaround/projects/:id/progress Daily progress dashboard
 *   GET    /api/turnaround/projects/:id/budget   Budget vs. actual rollup
 *
 * -- P5 ROADMAP ITEM COVERED ----------------------------------
 *   💰 Shutdown / Turnaround Management
 */

'use strict';

const express     = require('express');
const router      = express.Router();
const logisticsDb = require('../logistics_db').db;

// ── Table initialization (idempotent) ─────────────────────────────────────────
logisticsDb.exec(`
    CREATE TABLE IF NOT EXISTS TurnaroundProjects (
        ID              INTEGER PRIMARY KEY AUTOINCREMENT,
        PlantID         TEXT    NOT NULL,
        Name            TEXT    NOT NULL,
        Description     TEXT,
        Status          TEXT    DEFAULT 'PLANNING',  -- PLANNING | ACTIVE | COMPLETE | CANCELLED
        PlannedStart    TEXT,
        PlannedEnd      TEXT,
        ActualStart     TEXT,
        ActualEnd       TEXT,
        BudgetAmt       REAL    DEFAULT 0,
        ActualSpend     REAL    DEFAULT 0,
        ManagerID       TEXT,
        Notes           TEXT,
        CreatedBy       TEXT,
        CreatedAt       TEXT    DEFAULT (datetime('now')),
        UpdatedAt       TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS TurnaroundTasks (
        ID                  INTEGER PRIMARY KEY AUTOINCREMENT,
        ProjectID           INTEGER NOT NULL REFERENCES TurnaroundProjects(ID) ON DELETE CASCADE,
        Title               TEXT    NOT NULL,
        Description         TEXT,
        SequenceOrder       INTEGER DEFAULT 0,
        DependsOnTaskID     INTEGER,                -- Task ID that must complete before this one
        Status              TEXT    DEFAULT 'PENDING',  -- PENDING | IN_PROGRESS | COMPLETE | BLOCKED | SKIPPED
        AssignedTo          TEXT,
        ContractorID        INTEGER,
        EstHours            REAL    DEFAULT 0,
        ActHours            REAL    DEFAULT 0,
        EstCost             REAL    DEFAULT 0,
        ActCost             REAL    DEFAULT 0,
        PlannedStart        TEXT,
        PlannedEnd          TEXT,
        ActualStart         TEXT,
        ActualEnd           TEXT,
        IsolationRequired   INTEGER DEFAULT 0,
        IsolationPermitID   TEXT,
        LinkedWOID          TEXT,
        CriticalPath        INTEGER DEFAULT 0,      -- 1 = on critical path
        Notes               TEXT,
        CreatedAt           TEXT    DEFAULT (datetime('now')),
        UpdatedAt           TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ta_project  ON TurnaroundProjects(PlantID);
    CREATE INDEX IF NOT EXISTS idx_ta_tasks    ON TurnaroundTasks(ProjectID);
    CREATE INDEX IF NOT EXISTS idx_ta_status   ON TurnaroundTasks(Status);
`);

// ── GET /api/turnaround/projects ──────────────────────────────────────────────
router.get('/projects', (req, res) => {
    try {
        const { plantId, status } = req.query;
        let sql = `
            SELECT p.*,
                (SELECT COUNT(*) FROM TurnaroundTasks WHERE ProjectID=p.ID) AS taskCount,
                (SELECT COUNT(*) FROM TurnaroundTasks WHERE ProjectID=p.ID AND Status='COMPLETE') AS completedTasks
            FROM TurnaroundProjects p WHERE 1=1
        `;
        const params = [];
        if (plantId) { sql += ' AND p.PlantID = ?'; params.push(plantId); }
        if (status)  { sql += ' AND p.Status = ?';  params.push(status); }
        sql += ' ORDER BY p.PlannedStart DESC';
        res.json(logisticsDb.prepare(sql).all(...params));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/turnaround/projects ─────────────────────────────────────────────
router.post('/projects', (req, res) => {
    try {
        const { plantId, name, description, plannedStart, plannedEnd, budgetAmt, managerId, notes } = req.body;
        if (!plantId || !name) return res.status(400).json({ error: 'plantId and name are required' });
        const r = logisticsDb.prepare(`
            INSERT INTO TurnaroundProjects (PlantID, Name, Description, PlannedStart, PlannedEnd, BudgetAmt, ManagerID, Notes, CreatedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(plantId, name, description || null, plannedStart || null, plannedEnd || null,
               parseFloat(budgetAmt) || 0, managerId || null, notes || null, req.user?.Username || 'system');
        res.status(201).json({ id: r.lastInsertRowid, ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/turnaround/projects/:id ─────────────────────────────────────────
router.get('/projects/:id', (req, res) => {
    try {
        const project = logisticsDb.prepare('SELECT * FROM TurnaroundProjects WHERE ID = ?').get(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        const tasks = logisticsDb.prepare('SELECT * FROM TurnaroundTasks WHERE ProjectID = ? ORDER BY SequenceOrder, ID').all(req.params.id);
        res.json({ ...project, tasks });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/turnaround/projects/:id ─────────────────────────────────────────
router.put('/projects/:id', (req, res) => {
    try {
        const allowed = ['Name', 'Description', 'Status', 'PlannedStart', 'PlannedEnd',
                         'ActualStart', 'ActualEnd', 'BudgetAmt', 'ManagerID', 'Notes'];
        const fields = {};
        for (const f of allowed) {
            if (Object.prototype.hasOwnProperty.call(req.body, f)) fields[f] = req.body[f];
        }
        if (!Object.keys(fields).length) return res.status(400).json({ error: 'No valid fields to update' });
        fields.UpdatedAt = new Date().toISOString();
        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        logisticsDb.prepare(`UPDATE TurnaroundProjects SET ${sets} WHERE ID = ?`).run(...Object.values(fields), req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/turnaround/projects/:id ──────────────────────────────────────
router.delete('/projects/:id', (req, res) => {
    try {
        const row = logisticsDb.prepare('SELECT Status FROM TurnaroundProjects WHERE ID = ?').get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Project not found' });
        if (row.Status !== 'PLANNING') return res.status(403).json({ error: 'Only PLANNING projects can be deleted' });
        logisticsDb.prepare('DELETE FROM TurnaroundProjects WHERE ID = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/turnaround/projects/:id/tasks ────────────────────────────────────
router.get('/projects/:id/tasks', (req, res) => {
    try {
        const tasks = logisticsDb.prepare('SELECT * FROM TurnaroundTasks WHERE ProjectID = ? ORDER BY SequenceOrder ASC, ID ASC').all(req.params.id);
        res.json(tasks);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/turnaround/projects/:id/tasks ───────────────────────────────────
router.post('/projects/:id/tasks', (req, res) => {
    try {
        const { title, description, sequenceOrder = 0, dependsOnTaskId,
                assignedTo, contractorId, estHours = 0, estCost = 0,
                plannedStart, plannedEnd, isolationRequired = false,
                linkedWOID, criticalPath = false, notes } = req.body;
        if (!title) return res.status(400).json({ error: 'title is required' });
        const r = logisticsDb.prepare(`
            INSERT INTO TurnaroundTasks
                (ProjectID, Title, Description, SequenceOrder, DependsOnTaskID,
                 AssignedTo, ContractorID, EstHours, EstCost, PlannedStart, PlannedEnd,
                 IsolationRequired, LinkedWOID, CriticalPath, Notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(req.params.id, title, description || null, parseInt(sequenceOrder),
               dependsOnTaskId || null, assignedTo || null, contractorId || null,
               parseFloat(estHours) || 0, parseFloat(estCost) || 0,
               plannedStart || null, plannedEnd || null,
               isolationRequired ? 1 : 0, linkedWOID || null, criticalPath ? 1 : 0, notes || null);
        res.status(201).json({ id: r.lastInsertRowid, ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/turnaround/tasks/:id ────────────────────────────────────────────
router.put('/tasks/:id', (req, res) => {
    try {
        const allowed = ['Title', 'Description', 'SequenceOrder', 'DependsOnTaskID', 'Status',
                         'AssignedTo', 'ContractorID', 'EstHours', 'ActHours', 'EstCost', 'ActCost',
                         'PlannedStart', 'PlannedEnd', 'ActualStart', 'ActualEnd',
                         'IsolationRequired', 'IsolationPermitID', 'LinkedWOID', 'CriticalPath', 'Notes'];
        const fields = {};
        for (const f of allowed) {
            if (Object.prototype.hasOwnProperty.call(req.body, f)) fields[f] = req.body[f];
        }
        if (!Object.keys(fields).length) return res.status(400).json({ error: 'No valid fields to update' });
        fields.UpdatedAt = new Date().toISOString();
        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        logisticsDb.prepare(`UPDATE TurnaroundTasks SET ${sets} WHERE ID = ?`).run(...Object.values(fields), req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/turnaround/tasks/:id ─────────────────────────────────────────
router.delete('/tasks/:id', (req, res) => {
    try {
        const row = logisticsDb.prepare('SELECT Status FROM TurnaroundTasks WHERE ID = ?').get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Task not found' });
        if (!['PENDING', 'BLOCKED'].includes(row.Status)) return res.status(403).json({ error: 'Only PENDING or BLOCKED tasks can be deleted' });
        logisticsDb.prepare('DELETE FROM TurnaroundTasks WHERE ID = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/turnaround/projects/:id/progress ─────────────────────────────────
router.get('/projects/:id/progress', (req, res) => {
    try {
        const project = logisticsDb.prepare('SELECT * FROM TurnaroundProjects WHERE ID = ?').get(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const stats = logisticsDb.prepare(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN Status='COMPLETE'   THEN 1 ELSE 0 END) AS complete,
                SUM(CASE WHEN Status='IN_PROGRESS' THEN 1 ELSE 0 END) AS inProgress,
                SUM(CASE WHEN Status='BLOCKED'    THEN 1 ELSE 0 END) AS blocked,
                SUM(CASE WHEN CriticalPath=1 AND Status!='COMPLETE' THEN 1 ELSE 0 END) AS criticalRemaining,
                COALESCE(SUM(EstHours),0) AS totalEstHours,
                COALESCE(SUM(ActHours),0) AS totalActHours
            FROM TurnaroundTasks WHERE ProjectID = ?
        `).get(req.params.id);

        const pct = stats.total > 0 ? Math.round((stats.complete / stats.total) * 100) : 0;

        res.json({
            project: { id: project.ID, name: project.Name, status: project.Status,
                       plannedEnd: project.PlannedEnd, actualEnd: project.ActualEnd },
            progress: { ...stats, completionPct: pct },
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/turnaround/projects/:id/budget ────────────────────────────────────
router.get('/projects/:id/budget', (req, res) => {
    try {
        const project = logisticsDb.prepare('SELECT BudgetAmt FROM TurnaroundProjects WHERE ID = ?').get(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const costs = logisticsDb.prepare(`
            SELECT COALESCE(SUM(EstCost),0) AS totalEst, COALESCE(SUM(ActCost),0) AS totalAct
            FROM TurnaroundTasks WHERE ProjectID = ?
        `).get(req.params.id);

        const budget = parseFloat(project.BudgetAmt) || 0;
        const actual = parseFloat(costs.totalAct) || 0;

        res.json({
            budgetAmt:   budget,
            estimatedCost: parseFloat(costs.totalEst) || 0,
            actualSpend:  actual,
            variance:     actual - budget,
            variancePct:  budget > 0 ? Math.round(((actual - budget) / budget) * 100) : null,
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
