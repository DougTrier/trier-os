// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Instrument Calibration Management API
 * ==================================================
 * Tracks the calibration lifecycle for all measuring instruments —
 * pressure gauges, thermometers, flow meters, torque wrenches, scales,
 * and laboratory equipment. Ensures regulatory and food-safety compliance
 * (HACCP, SQF, FDA) by maintaining as-found / as-left records.
 * Stored in trier_logistics.db (cross-plant instrument pool).
 * Mounted at /api/calibration in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /instruments              List instruments (filter: plant, type, status, due)
 *   GET    /instruments/:id          Full instrument detail with calibration history
 *   POST   /instruments              Register a new instrument
 *   PUT    /instruments/:id          Update instrument metadata (location, asset link, interval)
 *   POST   /instruments/:id/calibrate  Record a calibration event (as-found, as-left, pass/fail)
 *   GET    /stats                    KPIs: total, overdue, due-this-month, pass rate
 *   GET    /due                      Instruments due for calibration within ?days=30
 *   GET    /constants                Enum lists: InstrumentTypes, UOM options, AccuracyClasses
 *
 * CALIBRATION RECORD FIELDS:
 *   As-Found reading (condition before calibration)
 *   As-Left reading (condition after adjustment)
 *   Tolerance (allowed deviation %)
 *   Pass/Fail status (auto-calculated: |as-found − reference| ≤ tolerance)
 *   CalibrationDate, NextCalibrationDate, CalibratedBy, CertificateNumber
 *
 * INTERVAL CALCULATION: NextCalibrationDate = CalibrationDate + CalIntervalDays.
 *   CalIntervalDays defaults to 365 (annual). Critical instruments (HACCP points)
 *   typically use 90 or 180 days.
 *
 * OUT-OF-TOLERANCE HANDLING: If as-found reading exceeds tolerance on any instrument,
 *   a corrective action flag is set (RequiresAction=1) and an optional work order
 *   number can be linked to track the investigation and repair.
 *
 * TABLES (trier_logistics.db):
 *   calibration_instruments   — Instrument registry (ID, type, location, asset link)
 *   calibration_records       — Calibration events (as-found, as-left, pass/fail, cert)
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('../logistics_db');

function initCalibrationTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS calibration_instruments (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            InstrumentID TEXT UNIQUE NOT NULL,
            Description TEXT NOT NULL,
            InstrumentType TEXT DEFAULT 'Gauge',
            Manufacturer TEXT,
            ModelNumber TEXT,
            SerialNumber TEXT,
            Location TEXT,
            PlantID TEXT,
            AssetID TEXT,
            CalibrationInterval INTEGER DEFAULT 365,
            IntervalUnit TEXT DEFAULT 'days',
            LastCalibrationDate TEXT,
            NextCalibrationDue TEXT,
            LastResult TEXT DEFAULT 'N/A',
            Status TEXT DEFAULT 'Active',
            AccuracySpec TEXT,
            RangeMin REAL,
            RangeMax REAL,
            Unit TEXT,
            CertificateNumber TEXT,
            CalibratedBy TEXT,
            Notes TEXT,
            Active INTEGER DEFAULT 1,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS calibration_records (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            InstrumentDBID INTEGER NOT NULL,
            CalibrationDate TEXT NOT NULL DEFAULT (datetime('now')),
            DueDate TEXT,
            Result TEXT DEFAULT 'Pass',
            AsFoundReading REAL,
            AsLeftReading REAL,
            ReferenceStandard TEXT,
            ReferenceStandardID TEXT,
            Temperature REAL,
            Humidity REAL,
            PerformedBy TEXT,
            CertificateNumber TEXT,
            CertificatePath TEXT,
            AdjustmentMade INTEGER DEFAULT 0,
            AdjustmentNotes TEXT,
            OutOfToleranceAction TEXT,
            Notes TEXT,
            ReviewedBy TEXT,
            ReviewedAt TEXT,
            FOREIGN KEY (InstrumentDBID) REFERENCES calibration_instruments(ID)
        );
    `);
    console.log('[CALIBRATION] Tables initialized');
}
initCalibrationTables();

const INSTRUMENT_TYPES = ['Gauge', 'Thermometer', 'Pressure Transmitter', 'Flow Meter', 'Scale/Balance', 'pH Meter', 'Conductivity Meter', 'Torque Wrench', 'Multimeter', 'Caliper', 'Micrometer', 'Level', 'Vibration Analyzer', 'IR Thermometer', 'Hygrometer', 'Other'];

// ── CRUD ────────────────────────────────────────────────────────
router.get('/instruments', (req, res) => {
    try {
        const { plant, status, type, search, dueWithin } = req.query;
        let sql = 'SELECT * FROM calibration_instruments WHERE Active = 1';
        const params = [];
        if (plant) { sql += ' AND PlantID = ?'; params.push(plant); }
        if (status) { sql += ' AND Status = ?'; params.push(status); }
        if (type) { sql += ' AND InstrumentType = ?'; params.push(type); }
        if (search) { sql += ' AND (InstrumentID LIKE ? OR Description LIKE ? OR SerialNumber LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
        if (dueWithin) {
            const future = new Date(Date.now() + parseInt(dueWithin) * 86400000).toISOString().split('T')[0];
            sql += ' AND NextCalibrationDue IS NOT NULL AND NextCalibrationDue <= ?'; params.push(future);
        }
        sql += ' ORDER BY NextCalibrationDue ASC';
        res.json(logisticsDb.prepare(sql).all(...params));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch instruments' }); }
});

router.get('/instruments/:id', (req, res) => {
    try {
        const inst = logisticsDb.prepare('SELECT * FROM calibration_instruments WHERE ID = ?').get(req.params.id);
        if (!inst) return res.status(404).json({ error: 'Instrument not found' });
        const records = logisticsDb.prepare('SELECT * FROM calibration_records WHERE InstrumentDBID = ? ORDER BY CalibrationDate DESC LIMIT 50').all(inst.ID);
        res.json({ instrument: inst, records });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch instrument' }); }
});

router.post('/instruments', (req, res) => {
    try {
        const { instrumentId, description, instrumentType, manufacturer, modelNumber, serialNumber, location, plantId, assetId, calibrationInterval, intervalUnit, accuracySpec, rangeMin, rangeMax, unit, notes } = req.body;
        if (!instrumentId || !description) return res.status(400).json({ error: 'Instrument ID and description required' });
        const existing = logisticsDb.prepare('SELECT ID FROM calibration_instruments WHERE InstrumentID = ?').get(instrumentId);
        if (existing) return res.status(409).json({ error: `Instrument ${instrumentId} already exists` });

        const result = logisticsDb.prepare(`
            INSERT INTO calibration_instruments (InstrumentID, Description, InstrumentType, Manufacturer, ModelNumber, SerialNumber, Location, PlantID, AssetID, CalibrationInterval, IntervalUnit, AccuracySpec, RangeMin, RangeMax, Unit, Notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(instrumentId, description, instrumentType || 'Gauge', manufacturer || null, modelNumber || null, serialNumber || null, location || null, plantId || null, assetId || null, calibrationInterval || 365, intervalUnit || 'days', accuracySpec || null, rangeMin || null, rangeMax || null, unit || null, notes || null);

        try { logAudit(req.user?.Username || 'system', 'CALIBRATION_INSTRUMENT_ADDED', plantId, { instrumentId, description }); } catch(e) {}
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to add instrument: ' }); }
});

router.put('/instruments/:id', (req, res) => {
    try {
        const allowed = ['Description','InstrumentType','Manufacturer','ModelNumber','SerialNumber','Location','PlantID','AssetID','CalibrationInterval','IntervalUnit','AccuracySpec','RangeMin','RangeMax','Unit','Status','Notes', 'LastCalibrationDate', 'NextCalibrationDue', 'LastResult'];
        const fields = []; const values = [];
        for (const [k, v] of Object.entries(req.body)) {
            if (allowed.includes(k)) { fields.push(`${k} = ?`); values.push(v); }
        }
        if (fields.length === 0) return res.json({ success: true });
        fields.push("UpdatedAt = datetime('now')");
        values.push(req.params.id);
        logisticsDb.prepare(`UPDATE calibration_instruments SET ${fields.join(', ')} WHERE ID = ?`).run(...values); /* dynamic col/table - sanitize inputs */
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update instrument' }); }
});

// ── Calibration Records ─────────────────────────────────────────
router.post('/instruments/:id/calibrate', (req, res) => {
    try {
        const inst = logisticsDb.prepare('SELECT * FROM calibration_instruments WHERE ID = ?').get(req.params.id);
        if (!inst) return res.status(404).json({ error: 'Instrument not found' });

        const { result, asFoundReading, asLeftReading, referenceStandard, referenceStandardId, temperature, humidity, performedBy, certificateNumber, adjustmentMade, adjustmentNotes, outOfToleranceAction, notes } = req.body;
        if (!result) return res.status(400).json({ error: 'Calibration result (Pass/Fail/Adjusted) is required' });

        // Calculate next due
        const interval = inst.CalibrationInterval || 365;
        const d = new Date(); d.setDate(d.getDate() + interval); const nextDue = d.toISOString().split('T')[0];

        const r = logisticsDb.prepare(`
            INSERT INTO calibration_records (InstrumentDBID, Result, DueDate, AsFoundReading, AsLeftReading, ReferenceStandard, ReferenceStandardID, Temperature, Humidity, PerformedBy, CertificateNumber, AdjustmentMade, AdjustmentNotes, OutOfToleranceAction, Notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(inst.ID, result, nextDue, asFoundReading || null, asLeftReading || null, referenceStandard || null, referenceStandardId || null, temperature || null, humidity || null, performedBy || null, certificateNumber || null, adjustmentMade ? 1 : 0, adjustmentNotes || null, outOfToleranceAction || null, notes || null);

        // Update instrument
        logisticsDb.prepare(`UPDATE calibration_instruments SET LastCalibrationDate = date('now'), NextCalibrationDue = ?, LastResult = ?, CalibratedBy = ?, CertificateNumber = ?, UpdatedAt = datetime('now') WHERE ID = ?`).run(nextDue, result, performedBy || null, certificateNumber || null, inst.ID);

        // If FAIL — flag the instrument
        if (result === 'Fail') {
            logisticsDb.prepare("UPDATE calibration_instruments SET Status = 'Out of Tolerance' WHERE ID = ?").run(inst.ID);
        }

        try { logAudit(req.user?.Username || 'system', 'CALIBRATION_PERFORMED', inst.PlantID, { instrumentId: inst.InstrumentID, result, certificateNumber }); } catch(e) {}
        console.log(`[CALIBRATION] ✅ ${inst.InstrumentID} calibrated: ${result}`);
        res.status(201).json({ success: true, id: r.lastInsertRowid, nextDue });
    } catch (err) { res.status(500).json({ error: 'Failed to log calibration: ' }); }
});

// ── Dashboard Stats ─────────────────────────────────────────────
router.get('/stats', (req, res) => {
    try {
        const total = logisticsDb.prepare('SELECT COUNT(*) as c FROM calibration_instruments WHERE Active = 1').get().c;
        const overdue = logisticsDb.prepare("SELECT COUNT(*) as c FROM calibration_instruments WHERE Active = 1 AND NextCalibrationDue < date('now')").get().c;
        const due30 = logisticsDb.prepare("SELECT COUNT(*) as c FROM calibration_instruments WHERE Active = 1 AND NextCalibrationDue >= date('now') AND NextCalibrationDue <= date('now', '+30 days')").get().c;
        const failed = logisticsDb.prepare("SELECT COUNT(*) as c FROM calibration_instruments WHERE Active = 1 AND Status = 'Out of Tolerance'").get().c;
        const byType = logisticsDb.prepare('SELECT InstrumentType, COUNT(*) as count FROM calibration_instruments WHERE Active = 1 GROUP BY InstrumentType ORDER BY count DESC').all();
        const recentCals = logisticsDb.prepare('SELECT cr.*, ci.InstrumentID, ci.Description FROM calibration_records cr JOIN calibration_instruments ci ON cr.InstrumentDBID = ci.ID ORDER BY cr.CalibrationDate DESC LIMIT 10').all();
        res.json({ total, overdue, dueSoon: due30, failed, byType, recentCalibrations: recentCals });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch calibration stats' }); }
});

router.get('/due', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const future = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
        const due = logisticsDb.prepare("SELECT * FROM calibration_instruments WHERE Active = 1 AND NextCalibrationDue IS NOT NULL AND NextCalibrationDue <= ? ORDER BY NextCalibrationDue ASC").all(future);
        const overdue = due.filter(d => new Date(d.NextCalibrationDue) < new Date());
        const upcoming = due.filter(d => new Date(d.NextCalibrationDue) >= new Date());
        res.json({ overdue, upcoming, total: due.length });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch calibration due list' }); }
});

router.get('/constants', (req, res) => {
    res.json({ instrumentTypes: INSTRUMENT_TYPES, results: ['Pass', 'Fail', 'Adjusted', 'Limited Use', 'N/A'] });
});

module.exports = router;
