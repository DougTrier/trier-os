// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * qc.js — Quality Control (QA) Module
 * ======================================
 * Non-Conformance Reports (NCRs), First-Pass Yield (FPY), defect code library,
 * Pareto analysis, and inspection checksheets linked to Work Orders.
 * Extends the existing product-quality.js (loss log + lab results) with a
 * structured defect management workflow.
 *
 * All data stored in trier_logistics.db with PlantID scoping.
 * Tables are created at startup with CREATE TABLE IF NOT EXISTS.
 *
 * -- ROUTES ----------------------------------------------------
 *   GET    /api/qc/ncr                 List NCRs (filter: plantId, status, defectCode)
 *   POST   /api/qc/ncr                 Create NCR (optionally auto-creates a WO)
 *   PUT    /api/qc/ncr/:id             Update NCR (status, root cause, disposition)
 *   DELETE /api/qc/ncr/:id             Remove NCR (Open only)
 *   GET    /api/qc/pareto              Defect code Pareto ranking (last 90/365 days)
 *   GET    /api/qc/fpy                 First-Pass Yield (from lab results in product-quality)
 *   GET    /api/qc/defect-codes        List defect codes
 *   POST   /api/qc/defect-codes        Create defect code
 *   GET    /api/qc/summary             Corporate QA rollup (NCR counts, top defects, FPY)
 *
 * -- P5 ROADMAP ITEM COVERED ----------------------------------
 *   💰 Quality Control (QA) Module
 */

'use strict';

const express     = require('express');
const router      = express.Router();
const logisticsDb = require('../logistics_db').db;

// ── Table initialization (idempotent) ─────────────────────────────────────────
logisticsDb.exec(`
    CREATE TABLE IF NOT EXISTS QualityDefectCodes (
        ID          INTEGER PRIMARY KEY AUTOINCREMENT,
        Code        TEXT    NOT NULL UNIQUE,
        Description TEXT    NOT NULL,
        Category    TEXT    DEFAULT 'General',   -- Process | Equipment | Material | Packaging | Lab | Other
        Active      INTEGER DEFAULT 1,
        CreatedAt   TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS QualityNCR (
        ID                  INTEGER PRIMARY KEY AUTOINCREMENT,
        NCRNumber           TEXT    UNIQUE,
        PlantID             TEXT    NOT NULL,
        Title               TEXT    NOT NULL,
        DefectCode          TEXT,               -- References QualityDefectCodes.Code
        Description         TEXT,
        Severity            TEXT    DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH | CRITICAL
        Status              TEXT    DEFAULT 'OPEN',   -- OPEN | UNDER_REVIEW | RESOLVED | CLOSED | VOIDED
        Quantity            REAL,               -- Quantity of product affected
        Unit                TEXT,               -- kg, L, units, etc.
        BatchLot            TEXT,               -- Batch or lot number
        DetectedAt          TEXT,               -- ISO datetime of detection
        DetectedBy          TEXT,
        LinkedAssetID       TEXT,               -- Asset where defect occurred
        LinkedWOID          TEXT,               -- Work order created in response
        AutoWOCreated       INTEGER DEFAULT 0,
        RootCause           TEXT,
        Disposition         TEXT,               -- Scrap | Rework | Use-As-Is | Return
        CorrectiveAction    TEXT,
        ResolvedBy          TEXT,
        ResolvedAt          TEXT,
        Notes               TEXT,
        CreatedBy           TEXT,
        CreatedAt           TEXT    DEFAULT (datetime('now')),
        UpdatedAt           TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS QualityChecksheets (
        ID          INTEGER PRIMARY KEY AUTOINCREMENT,
        PlantID     TEXT    NOT NULL,
        Name        TEXT    NOT NULL,
        WorkTypeID  TEXT,                       -- Links to Work type (optional)
        Active      INTEGER DEFAULT 1,
        CreatedBy   TEXT,
        CreatedAt   TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS QualityChecksheetItems (
        ID              INTEGER PRIMARY KEY AUTOINCREMENT,
        ChecksheetID    INTEGER NOT NULL REFERENCES QualityChecksheets(ID) ON DELETE CASCADE,
        ItemText        TEXT    NOT NULL,
        ControlLimit    TEXT,                   -- Spec limit or acceptable range
        SortOrder       INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS QualityCheckResults (
        ID              INTEGER PRIMARY KEY AUTOINCREMENT,
        ChecksheetID    INTEGER NOT NULL,
        WorkOrderID     TEXT,
        PlantID         TEXT    NOT NULL,
        OverallPass     INTEGER,                -- 1 = pass, 0 = fail
        SubmittedBy     TEXT,
        SubmittedAt     TEXT    DEFAULT (datetime('now')),
        Notes           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_qncr_plant   ON QualityNCR(PlantID);
    CREATE INDEX IF NOT EXISTS idx_qncr_status  ON QualityNCR(Status);
    CREATE INDEX IF NOT EXISTS idx_qncr_defect  ON QualityNCR(DefectCode);
    CREATE INDEX IF NOT EXISTS idx_qcheck_plant ON QualityCheckResults(PlantID);
`);

// ── Seed default defect codes (idempotent) ────────────────────────────────────
const DEFAULT_CODES = [
    ['FOREIGN-MATERIAL', 'Foreign material contamination', 'Process'],
    ['TEMP-DEVIATION',   'Temperature out of spec',         'Process'],
    ['LABEL-ERROR',      'Incorrect or missing label',       'Packaging'],
    ['WEIGHT-SHORT',     'Underweight / short fill',         'Process'],
    ['MICRO-FAIL',       'Microbiological failure',          'Lab'],
    ['EQUIP-DAMAGE',     'Equipment-caused product damage',  'Equipment'],
    ['RAW-MATERIAL',     'Non-conforming raw material',      'Material'],
    ['PACKAGING-DEFECT', 'Packaging defect (seal, leak)',    'Packaging'],
    ['SENSORY-FAIL',     'Sensory / organoleptic failure',   'Lab'],
    ['OTHER',            'Other / uncategorized defect',     'Other'],
];
for (const [code, desc, cat] of DEFAULT_CODES) {
    try {
        logisticsDb.prepare('INSERT OR IGNORE INTO QualityDefectCodes (Code, Description, Category) VALUES (?, ?, ?)').run(code, desc, cat);
    } catch { /* ok */ }
}

// ── Helper: NCR number ────────────────────────────────────────────────────────
function generateNCRNumber(plantId) {
    const prefix = (plantId || 'PLT').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4);
    const ts     = Date.now().toString(36).toUpperCase().slice(-6);
    return `NCR-${prefix}-${ts}`;
}

// ── GET /api/qc/defect-codes ──────────────────────────────────────────────────
router.get('/defect-codes', (req, res) => {
    try {
        const rows = logisticsDb.prepare('SELECT * FROM QualityDefectCodes WHERE Active=1 ORDER BY Category, Code').all();
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/qc/defect-codes ─────────────────────────────────────────────────
router.post('/defect-codes', (req, res) => {
    try {
        const { code, description, category = 'Other' } = req.body;
        if (!code || !description) return res.status(400).json({ error: 'code and description are required' });
        const r = logisticsDb.prepare('INSERT INTO QualityDefectCodes (Code, Description, Category) VALUES (?, ?, ?)').run(code.toUpperCase(), description, category);
        res.status(201).json({ id: r.lastInsertRowid, ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/qc/ncr ───────────────────────────────────────────────────────────
router.get('/ncr', (req, res) => {
    try {
        const { plantId, status, defectCode, severity } = req.query;
        let sql = 'SELECT * FROM QualityNCR WHERE 1=1';
        const p = [];
        if (plantId)    { sql += ' AND PlantID = ?';    p.push(plantId); }
        if (status)     { sql += ' AND Status = ?';     p.push(status); }
        if (defectCode) { sql += ' AND DefectCode = ?'; p.push(defectCode); }
        if (severity)   { sql += ' AND Severity = ?';   p.push(severity); }
        sql += ' ORDER BY CreatedAt DESC';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/qc/ncr ──────────────────────────────────────────────────────────
router.post('/ncr', (req, res) => {
    try {
        const {
            plantId, title, defectCode, description, severity = 'MEDIUM',
            quantity, unit, batchLot, detectedAt, detectedBy,
            linkedAssetId, notes, createWO = false
        } = req.body;
        if (!plantId || !title) return res.status(400).json({ error: 'plantId and title are required' });

        const ncrNumber = generateNCRNumber(plantId);
        const createdBy = req.user?.Username || 'system';

        const result = logisticsDb.prepare(`
            INSERT INTO QualityNCR
                (NCRNumber, PlantID, Title, DefectCode, Description, Severity,
                 Quantity, Unit, BatchLot, DetectedAt, DetectedBy, LinkedAssetID, Notes, CreatedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            ncrNumber, plantId, title, defectCode || null, description || null,
            severity.toUpperCase(), quantity || null, unit || null, batchLot || null,
            detectedAt || new Date().toISOString(), detectedBy || createdBy,
            linkedAssetId || null, notes || null, createdBy
        );

        res.status(201).json({ id: result.lastInsertRowid, ncrNumber, ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/qc/ncr/:id ───────────────────────────────────────────────────────
router.put('/ncr/:id', (req, res) => {
    try {
        const allowed = ['Title', 'DefectCode', 'Description', 'Severity', 'Status',
                         'Quantity', 'Unit', 'BatchLot', 'LinkedWOID', 'RootCause',
                         'Disposition', 'CorrectiveAction', 'ResolvedBy', 'ResolvedAt', 'Notes'];
        const fields = {};
        for (const f of allowed) {
            if (Object.prototype.hasOwnProperty.call(req.body, f)) fields[f] = req.body[f];
        }
        if (!Object.keys(fields).length) return res.status(400).json({ error: 'No valid fields to update' });
        fields.UpdatedAt = new Date().toISOString();
        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        logisticsDb.prepare(`UPDATE QualityNCR SET ${sets} WHERE ID = ?`).run(...Object.values(fields), req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/qc/ncr/:id ────────────────────────────────────────────────────
router.delete('/ncr/:id', (req, res) => {
    try {
        const row = logisticsDb.prepare('SELECT Status FROM QualityNCR WHERE ID = ?').get(req.params.id);
        if (!row) return res.status(404).json({ error: 'NCR not found' });
        if (row.Status !== 'OPEN') return res.status(403).json({ error: 'Only OPEN NCRs can be deleted' });
        logisticsDb.prepare('DELETE FROM QualityNCR WHERE ID = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/qc/pareto ────────────────────────────────────────────────────────
// Defect code Pareto: ranked by occurrence count for period.
router.get('/pareto', (req, res) => {
    try {
        const { plantId, days = 90 } = req.query;
        const cutoff = new Date(Date.now() - parseInt(days, 10) * 86400000).toISOString().split('T')[0];
        let sql = `
            SELECT n.DefectCode, COALESCE(d.Description, n.DefectCode) AS defectLabel,
                   d.Category, COUNT(*) AS count,
                   COALESCE(SUM(n.Quantity), 0) AS totalQty
            FROM QualityNCR n
            LEFT JOIN QualityDefectCodes d ON d.Code = n.DefectCode
            WHERE n.DefectCode IS NOT NULL AND n.CreatedAt >= ?
        `;
        const p = [cutoff];
        if (plantId) { sql += ' AND n.PlantID = ?'; p.push(plantId); }
        sql += ' GROUP BY n.DefectCode ORDER BY count DESC LIMIT 20';

        const rows = logisticsDb.prepare(sql).all(...p);
        const total = rows.reduce((s, r) => s + r.count, 0);

        let cumulative = 0;
        const withCumulative = rows.map(r => {
            cumulative += r.count;
            return { ...r, cumulativePct: Math.round((cumulative / total) * 100) };
        });

        res.json({ period: `${days}d`, total, items: withCumulative });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/qc/fpy ───────────────────────────────────────────────────────────
// First-Pass Yield: fraction of lab results that passed on first submission,
// computed from the LabResult table in each plant's DB.
router.get('/fpy', (req, res) => {
    try {
        // FPY is plant-scoped — use x-plant-id header or query param
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        const days = parseInt(req.query.days, 10) || 90;
        if (!plantId) return res.status(400).json({ error: 'plantId or x-plant-id header required' });

        const db = require('../database');
        const conn = db.getDb(plantId);
        const cutoff = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

        let total = 0, passed = 0;
        try {
            const r = conn.prepare(`
                SELECT COUNT(*) AS total,
                       SUM(CASE WHEN OverallPass = 1 THEN 1 ELSE 0 END) AS passed
                FROM LabResult WHERE LogDate >= ?
            `).get(cutoff);
            total  = r?.total  || 0;
            passed = r?.passed || 0;
        } catch { /* LabResult table may not exist in this plant */ }

        res.json({
            plantId, days,
            total,
            passed,
            failed: total - passed,
            fpy: total > 0 ? Math.round((passed / total) * 100) : null,
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/qc/summary ───────────────────────────────────────────────────────
// Corporate QA rollup: open NCR counts, top defect codes, severity breakdown.
router.get('/summary', (req, res) => {
    try {
        const { plantId } = req.query;
        let whereClause = '1=1';
        const p = [];
        if (plantId) { whereClause = 'PlantID = ?'; p.push(plantId); }

        const counts = logisticsDb.prepare(`
            SELECT Status, COUNT(*) AS cnt FROM QualityNCR WHERE ${whereClause} GROUP BY Status
        `).all(...p);

        const bySeverity = logisticsDb.prepare(`
            SELECT Severity, COUNT(*) AS cnt FROM QualityNCR WHERE ${whereClause} GROUP BY Severity
        `).all(...p);

        const topDefects = logisticsDb.prepare(`
            SELECT DefectCode, COUNT(*) AS cnt FROM QualityNCR
            WHERE ${whereClause} AND DefectCode IS NOT NULL
            GROUP BY DefectCode ORDER BY cnt DESC LIMIT 5
        `).all(...p);

        const statusMap = {};
        for (const r of counts) statusMap[r.Status] = r.cnt;

        res.json({
            open:       statusMap['OPEN']         || 0,
            underReview: statusMap['UNDER_REVIEW'] || 0,
            resolved:   statusMap['RESOLVED']     || 0,
            closed:     statusMap['CLOSED']       || 0,
            bySeverity: Object.fromEntries(bySeverity.map(r => [r.Severity, r.cnt])),
            topDefects,
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
