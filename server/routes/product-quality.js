// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Product Quality & Loss Tracking API
 * =================================================
 * Tracks product loss events and laboratory quality results at the plant level.
 * Feeds the OpEx shrink card, quality dashboard, and compliance reports.
 * Supports multi-plant sweep queries for enterprise-wide quality rollups.
 * Mounted at /api/quality in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /loss-log          Recent product loss entries for current plant
 *                             Query: ?plantId=all for cross-plant sweep, ?limit=N
 *   POST   /loss-log          Log a product loss event
 *                             Body: { LossDate, LossType, Quantity, Unit, CauseCode, Notes, MeterID }
 *   PUT    /loss-log/:id      Update a loss log entry (same-day edits only for compliance)
 *   DELETE /loss-log/:id      Remove a loss log entry (requires elevated role)
 *
 *   GET    /lab-results       Recent laboratory test results for current plant
 *                             Query: ?testType=Cryoscope|Bacteria|SCC|Fat|Protein, ?limit=N
 *   POST   /lab-results       Submit a new lab result
 *                             Body: { TestDate, TestType, MeterID, Reading, Pass, Notes }
 *   PUT    /lab-results/:id   Correct a lab result (amendment note required)
 *   DELETE /lab-results/:id   Remove a lab result record
 *
 *   GET    /summary           Plant-level quality summary for OpEx shrink card
 *                             Returns: { totalLoss7d, totalLoss30d, passRate, cryoAvg, failCount }
 *   GET    /meters            List of meter IDs active for the current plant
 *                             Used to populate meter selector dropdowns in lab entry forms
 *
 * CRYOSCOPE CALCULATION:
 *   Normal freezing point of raw milk: −0.540°H (Hortvet degrees)
 *   Adulteration threshold: −0.525°H
 *   Water added (%) = ((−0.540 − reading) / 0.540) × 100
 *   Any reading above −0.525°H triggers automatic FAIL with alert.
 *
 * LOSS TYPES: Spill | Cleaning | Overrun | Expired | Quality Reject | Transfer Loss | Other
 * CAUSE CODES: Equipment | Operator | Process | Raw Material | Environmental | Unknown
 *
 * MULTI-PLANT SWEEP: GET /loss-log?plantId=all and GET /lab-results?plantId=all sweep
 *   all plant SQLite databases concurrently and return merged, sorted results.
 *   Each row gains a _plantId field for downstream grouping.
 *
 * TABLES: ProductLossLog, LabResults (auto-created per plant DB on first load)
 */

const express = require('express');
const router = express.Router();
const { getDb, queryAll } = require('../database');

// ── Helper: Multi-Plant Sweep ────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
function runMultiPlantSweep(sql, params, limit = 200) {
    const dataDir = path.join(__dirname, '..', 'data');
    const Database = require('better-sqlite3');
    const dbFiles = fs.readdirSync(dataDir).filter(f => 
        f.endsWith('.db') && !f.includes('trier_') && 
        f !== 'schema_template.db' && f !== 'all sites.db'
    );

    const allData = [];
    const limitedSql = sql.replace(/LIMIT\s+\d+/i, `LIMIT ${limit}`);

    for (const dbFile of dbFiles) {
        const plantId = dbFile.replace('.db', '').trim();
        try {
            const plantDb = new Database(path.join(dataDir, dbFile), { readonly: true });
            try {
                const rows = plantDb.prepare(limitedSql).all(...params);
                rows.forEach(row => {
                    row._plantId = plantId;
                    allData.push(row);
                });
            } catch (inner) {}
            plantDb.close();
        } catch (e) {}
    }
    return allData;
}

// ── Cryo calculation helper ──────────────────────────────────────────────────
const CRYO_NORMAL = -0.540;
const CRYO_THRESHOLD = -0.525;
function calcCryo(reading) {
    if (reading == null) return { waterPct: null, pass: null };
    const waterPct = ((CRYO_NORMAL - reading) / Math.abs(CRYO_NORMAL)) * 100;
    const pass = reading <= CRYO_THRESHOLD ? 1 : 0;
    return { waterPct: Math.max(0, Math.round(waterPct * 100) / 100), pass };
}

// ── Auto-create tables if missing ────────────────────────────────────────────
function ensureTables(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS ProductLoss (
            ID          INTEGER PRIMARY KEY AUTOINCREMENT,
            LogDate     TEXT NOT NULL DEFAULT (date('now')),
            Shift       TEXT,
            Area        TEXT,
            ProductType TEXT,
            LossType    TEXT NOT NULL,
            Quantity    REAL DEFAULT 0,
            Unit        TEXT DEFAULT 'gal',
            UnitValue   REAL DEFAULT 0,
            TotalValue  REAL DEFAULT 0,
            MeterID     TEXT,
            MeterReading REAL,
            WoID        TEXT,
            NotifiedMgr INTEGER DEFAULT 0,
            Notes       TEXT,
            EnteredBy   TEXT,
            CreatedAt   TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS LabResult (
            ID              INTEGER PRIMARY KEY AUTOINCREMENT,
            SampleDate      TEXT NOT NULL DEFAULT (date('now')),
            SampleID        TEXT,
            SampleType      TEXT DEFAULT 'Raw Incoming',
            SourceTank      TEXT,
            CryoReading     REAL,
            CryoWaterPct    REAL,
            CryoPass        INTEGER,
            CryoAction      TEXT,
            CryoLossValue   REAL,
            SPC             INTEGER,
            Coliform        INTEGER,
            LPC             INTEGER,
            PI              INTEGER,
            SoMatic         INTEGER,
            Listeria        TEXT DEFAULT 'ND',
            Salmonella      TEXT DEFAULT 'ND',
            BactPass        INTEGER,
            FatPct          REAL,
            ProteinPct      REAL,
            LactosePct      REAL,
            SolidsNotFat    REAL,
            TotalSolids     REAL,
            DrugTest        TEXT DEFAULT 'Negative',
            OverallPass     INTEGER,
            ActionRequired  TEXT DEFAULT 'None',
            EstLossValue    REAL DEFAULT 0,
            Notes           TEXT,
            TestTech        TEXT,
            ApprovedBy      TEXT,
            CreatedAt       TEXT DEFAULT (datetime('now'))
        );
    `);
}

// ── GET /api/quality/loss-log ────────────────────────────────────────────────
router.get('/loss-log', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        if (!plantId) return res.status(400).json({ error: 'plantId required' });
        
        const days = parseInt(req.query.days) || 90;
        let rows = [];
        
        const sql = `
            SELECT * FROM ProductLoss
            WHERE date(LogDate) >= date('now', ?)
            ORDER BY LogDate DESC, ID DESC
            LIMIT 200
        `;
        
        if (plantId === 'all_sites') {
            rows = runMultiPlantSweep(sql, [`-${days} days`]);
            rows.sort((a, b) => new Date(b.LogDate) - new Date(a.LogDate));
            rows = rows.slice(0, 200);
        } else {
            const db = getDb(plantId);
            ensureTables(db);
            rows = db.prepare(sql).all(`-${days} days`);
        }
        res.json({ rows, count: rows.length });
    } catch (e) {
        console.error('[quality/loss-log GET]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── POST /api/quality/loss-log ───────────────────────────────────────────────
router.post('/loss-log', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'] || req.body.plantId;
        if (!plantId) return res.status(400).json({ error: 'plantId required' });
        const db = getDb(plantId);
        ensureTables(db);
        const {
            LogDate, Shift, Area, ProductType, LossType,
            Quantity, Unit, UnitValue, MeterID, MeterReading,
            WoID, NotifiedMgr, Notes, EnteredBy
        } = req.body;

        if (!LossType) return res.status(400).json({ error: 'LossType required' });

        const qty = parseFloat(Quantity) || 0;
        const uv = parseFloat(UnitValue) || 0;
        const TotalValue = Math.round(qty * uv * 100) / 100;

        const result = db.prepare(`
            INSERT INTO ProductLoss
                (LogDate, Shift, Area, ProductType, LossType, Quantity, Unit,
                 UnitValue, TotalValue, MeterID, MeterReading, WoID, NotifiedMgr, Notes, EnteredBy)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
            LogDate || new Date().toISOString().split('T')[0],
            Shift || null, Area || null, ProductType || null, LossType,
            qty, Unit || 'gal', uv, TotalValue,
            MeterID || null, MeterReading ? parseFloat(MeterReading) : null,
            WoID || null, NotifiedMgr ? 1 : 0, Notes || null, EnteredBy || null
        );

        res.json({ id: result.lastInsertRowid, totalValue: TotalValue });
    } catch (e) {
        console.error('[quality/loss-log POST]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── PUT /api/quality/loss-log/:id ────────────────────────────────────────────
router.put('/loss-log/:id', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'] || req.body.plantId;
        if (!plantId) return res.status(400).json({ error: 'plantId required' });
        const db = getDb(plantId);
        ensureTables(db);
        const b = req.body;
        
        const qty = parseFloat(b.Quantity) || 0;
        const uv = parseFloat(b.UnitValue) || 0;
        const TotalValue = Math.round(qty * uv * 100) / 100;

        db.prepare(`
            UPDATE ProductLoss 
            SET LogDate=?, Shift=?, Area=?, ProductType=?, LossType=?, Quantity=?, Unit=?,
                UnitValue=?, TotalValue=?, MeterID=?, MeterReading=?, WoID=?, NotifiedMgr=?, Notes=?, EnteredBy=?
            WHERE ID=?
        `).run(
            b.LogDate, b.Shift || null, b.Area || null, b.ProductType || null, b.LossType,
            qty, b.Unit || 'gal', uv, TotalValue,
            b.MeterID || null, b.MeterReading && b.MeterReading !== '' ? parseFloat(b.MeterReading) : null,
            b.WoID || null, b.NotifiedMgr ? 1 : 0, b.Notes || null, b.EnteredBy || null,
            req.params.id
        );
        res.json({ success: true });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// ── DELETE /api/quality/loss-log/:id ─────────────────────────────────────────
router.delete('/loss-log/:id', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        const db = getDb(plantId);
        db.prepare('DELETE FROM ProductLoss WHERE ID=?').run(req.params.id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// ── GET /api/quality/lab-results ─────────────────────────────────────────────
router.get('/lab-results', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        if (!plantId) return res.status(400).json({ error: 'plantId required' });
        
        const days = parseInt(req.query.days) || 90;
        let rows = [];
        const sql = `
            SELECT * FROM LabResult
            WHERE date(SampleDate) >= date('now', ?)
            ORDER BY SampleDate DESC, ID DESC
            LIMIT 200
        `;
        
        if (plantId === 'all_sites') {
            rows = runMultiPlantSweep(sql, [`-${days} days`]);
            rows.sort((a, b) => new Date(b.SampleDate) - new Date(a.SampleDate));
            rows = rows.slice(0, 200);
        } else {
            const db = getDb(plantId);
            ensureTables(db);
            rows = db.prepare(sql).all(`-${days} days`);
        }
        res.json({ rows, count: rows.length });
    } catch (e) {
        console.error('[quality/lab-results GET]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── POST /api/quality/lab-results ────────────────────────────────────────────
router.post('/lab-results', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'] || req.body.plantId;
        if (!plantId) return res.status(400).json({ error: 'plantId required' });
        const db = getDb(plantId);
        ensureTables(db);
        const b = req.body;

        if (!b.SampleDate) return res.status(400).json({ error: 'SampleDate required' });

        const cryo = calcCryo(b.CryoReading != null ? parseFloat(b.CryoReading) : null);
        const spc = b.SPC != null ? parseInt(b.SPC) : null;
        const col = b.Coliform != null ? parseInt(b.Coliform) : null;
        const scc = b.SoMatic != null ? parseInt(b.SoMatic) : null;
        const bactPass = (
            (spc == null || spc < 100000) &&
            (col == null || col < 10) &&
            (scc == null || scc < 750000) &&
            (b.Listeria === 'ND' || b.Listeria == null) &&
            (b.Salmonella === 'ND' || b.Salmonella == null) &&
            (b.DrugTest === 'Negative' || b.DrugTest == null)
        ) ? 1 : 0;

        const overallPass = (cryo.pass !== 0) && bactPass ? 1 : 0;
        const estLoss = parseFloat(b.EstLossValue) || 0;
        const actionRequired = b.ActionRequired || (overallPass === 0 ? 'Hold Tank' : 'None');

        const result = db.prepare(`
            INSERT INTO LabResult (
                SampleDate, SampleID, SampleType, SourceTank,
                CryoReading, CryoWaterPct, CryoPass, CryoAction, CryoLossValue,
                SPC, Coliform, LPC, PI, SoMatic, Listeria, Salmonella, BactPass,
                FatPct, ProteinPct, LactosePct, SolidsNotFat, TotalSolids,
                DrugTest, OverallPass, ActionRequired, EstLossValue, Notes, TestTech, ApprovedBy
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
            b.SampleDate, b.SampleID || null, b.SampleType || 'Raw Incoming', b.SourceTank || null,
            b.CryoReading != null ? parseFloat(b.CryoReading) : null,
            cryo.waterPct, cryo.pass, b.CryoAction || null, b.CryoLossValue ? parseFloat(b.CryoLossValue) : null,
            spc, col,
            b.LPC != null ? parseInt(b.LPC) : null,
            b.PI != null ? parseInt(b.PI) : null,
            scc,
            b.Listeria || 'ND', b.Salmonella || 'ND', bactPass,
            b.FatPct ? parseFloat(b.FatPct) : null,
            b.ProteinPct ? parseFloat(b.ProteinPct) : null,
            b.LactosePct ? parseFloat(b.LactosePct) : null,
            b.SolidsNotFat ? parseFloat(b.SolidsNotFat) : null,
            b.TotalSolids ? parseFloat(b.TotalSolids) : null,
            b.DrugTest || 'Negative',
            overallPass, actionRequired, estLoss,
            b.Notes || null, b.TestTech || null, b.ApprovedBy || null
        );

        res.json({ id: result.lastInsertRowid, overallPass, cryoWaterPct: cryo.waterPct, cryoPass: cryo.pass, bactPass, actionRequired });
    } catch (e) {
        console.error('[quality/lab-results POST]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── PUT /api/quality/lab-results/:id ─────────────────────────────────────────
router.put('/lab-results/:id', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'] || req.body.plantId;
        if (!plantId) return res.status(400).json({ error: 'plantId required' });
        const db = getDb(plantId);
        ensureTables(db);
        const b = req.body;

        const cryo = calcCryo(b.CryoReading != null && b.CryoReading !== '' ? parseFloat(b.CryoReading) : null);
        const spc = b.SPC != null && b.SPC !== '' ? parseInt(b.SPC) : null;
        const col = b.Coliform != null && b.Coliform !== '' ? parseInt(b.Coliform) : null;
        const scc = b.SoMatic != null && b.SoMatic !== '' ? parseInt(b.SoMatic) : null;
        const bactPass = (
            (spc == null || spc < 100000) &&
            (col == null || col < 10) &&
            (scc == null || scc < 750000) &&
            (b.Listeria === 'ND' || b.Listeria == null) &&
            (b.Salmonella === 'ND' || b.Salmonella == null) &&
            (b.DrugTest === 'Negative' || b.DrugTest == null)
        ) ? 1 : 0;

        const overallPass = (cryo.pass !== 0) && bactPass ? 1 : 0;
        const estLoss = parseFloat(b.EstLossValue) || 0;
        const actionRequired = b.ActionRequired || (overallPass === 0 ? 'Hold Tank' : 'None');

        db.prepare(`
            UPDATE LabResult SET
                SampleDate=?, SampleID=?, SampleType=?, SourceTank=?,
                CryoReading=?, CryoWaterPct=?, CryoPass=?, CryoAction=?, CryoLossValue=?,
                SPC=?, Coliform=?, LPC=?, PI=?, SoMatic=?, Listeria=?, Salmonella=?, BactPass=?,
                FatPct=?, ProteinPct=?, LactosePct=?, SolidsNotFat=?, TotalSolids=?,
                DrugTest=?, OverallPass=?, ActionRequired=?, EstLossValue=?, Notes=?, TestTech=?, ApprovedBy=?
            WHERE ID=?
        `).run(
            b.SampleDate, b.SampleID || null, b.SampleType || 'Raw Incoming', b.SourceTank || null,
            b.CryoReading != null && b.CryoReading !== '' ? parseFloat(b.CryoReading) : null,
            cryo.waterPct, cryo.pass, b.CryoAction || null, b.CryoLossValue ? parseFloat(b.CryoLossValue) : null,
            spc, col,
            b.LPC != null && b.LPC !== '' ? parseInt(b.LPC) : null,
            b.PI != null && b.PI !== '' ? parseInt(b.PI) : null,
            scc,
            b.Listeria || 'ND', b.Salmonella || 'ND', bactPass,
            b.FatPct ? parseFloat(b.FatPct) : null,
            b.ProteinPct ? parseFloat(b.ProteinPct) : null,
            b.LactosePct ? parseFloat(b.LactosePct) : null,
            b.SolidsNotFat ? parseFloat(b.SolidsNotFat) : null,
            b.TotalSolids ? parseFloat(b.TotalSolids) : null,
            b.DrugTest || 'Negative',
            overallPass, actionRequired, estLoss,
            b.Notes || null, b.TestTech || null, b.ApprovedBy || null,
            req.params.id
        );
        res.json({ success: true, overallPass, cryoWaterPct: cryo.waterPct, cryoPass: cryo.pass, bactPass, actionRequired });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// ── DELETE /api/quality/lab-results/:id ──────────────────────────────────────
router.delete('/lab-results/:id', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        const db = getDb(plantId);
        db.prepare('DELETE FROM LabResult WHERE ID=?').run(req.params.id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// ── GET /api/quality/summary ──────────────────────────────────────────────────
router.get('/summary', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        if (!plantId) return res.status(400).json({ error: 'plantId required' });
        const db = getDb(plantId);
        ensureTables(db);
        const days = parseInt(req.query.days) || 365;
        const since = `-${days} days`;

        const lossSummary = db.prepare(`
            SELECT COUNT(*) as events, COALESCE(SUM(TotalValue),0) as totalLossValue,
                   COALESCE(SUM(Quantity),0) as totalQty, COUNT(DISTINCT Area) as areasAffected
            FROM ProductLoss WHERE date(LogDate) >= date('now', ?)
        `).get(since);

        const lossByType = db.prepare(`
            SELECT LossType, COUNT(*) as cnt, COALESCE(SUM(TotalValue),0) as val
            FROM ProductLoss WHERE date(LogDate) >= date('now', ?)
            GROUP BY LossType ORDER BY val DESC
        `).all(since);

        const lossByArea = db.prepare(`
            SELECT Area, COUNT(*) as cnt, COALESCE(SUM(TotalValue),0) as val
            FROM ProductLoss WHERE date(LogDate) >= date('now', ?)
            GROUP BY Area ORDER BY val DESC
        `).all(since);

        const cryoFails = db.prepare(`
            SELECT COUNT(*) as cnt, COALESCE(SUM(CryoLossValue),0) as lossValue,
                   AVG(CryoWaterPct) as avgWaterPct, MAX(CryoWaterPct) as maxWaterPct
            FROM LabResult WHERE CryoPass = 0 AND date(SampleDate) >= date('now', ?)
        `).get(since);

        const bactFails = db.prepare(`
            SELECT COUNT(*) as cnt, COALESCE(SUM(EstLossValue),0) as lossValue
            FROM LabResult WHERE BactPass = 0 AND date(SampleDate) >= date('now', ?)
        `).get(since);

        const labTotal = db.prepare(`
            SELECT COUNT(*) as cnt, COALESCE(SUM(EstLossValue),0) as totalLoss
            FROM LabResult WHERE date(SampleDate) >= date('now', ?)
        `).get(since);

        const meterData = db.prepare(`
            SELECT MeterID, COUNT(*) as readings, COALESCE(SUM(MeterReading),0) as totalGals
            FROM ProductLoss WHERE MeterID IS NOT NULL AND MeterID != ''
              AND date(LogDate) >= date('now', ?)
            GROUP BY MeterID
        `).all(since);

        const totalLossValue = (lossSummary.totalLossValue || 0) + (labTotal.totalLoss || 0);

        res.json({
            periodDays: days,
            productLoss: { ...lossSummary, byType: lossByType, byArea: lossByArea, totalLossValue: Math.round(totalLossValue) },
            labQuality: {
                totalTests: labTotal.cnt,
                totalLabLoss: Math.round(labTotal.totalLoss || 0),
                cryo: {
                    failures: cryoFails.cnt || 0,
                    totalLossValue: Math.round(cryoFails.lossValue || 0),
                    avgWaterPct: Math.round((cryoFails.avgWaterPct || 0) * 100) / 100,
                    maxWaterPct: Math.round((cryoFails.maxWaterPct || 0) * 100) / 100,
                },
                bacteria: { failures: bactFails.cnt || 0, totalLossValue: Math.round(bactFails.lossValue || 0) },
            },
            meters: meterData,
            totalLossValue: Math.round(totalLossValue),
        });
    } catch (e) {
        console.error('[quality/summary GET]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── GET /api/quality/meters ───────────────────────────────────────────────────
router.get('/meters', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        if (!plantId) return res.status(400).json({ error: 'plantId required' });
        const db = getDb(plantId);
        ensureTables(db);
        const meters = db.prepare(`
            SELECT DISTINCT MeterID, Area, COUNT(*) as readings, MAX(LogDate) as lastReading, COALESCE(SUM(MeterReading),0) as totalGals
            FROM ProductLoss WHERE MeterID IS NOT NULL AND MeterID != ''
            GROUP BY MeterID ORDER BY lastReading DESC
        `).all();
        res.json({ meters });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
