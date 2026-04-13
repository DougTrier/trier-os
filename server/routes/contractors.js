// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Contractor Management API
 * ======================================
 * Full lifecycle contractor tracking: company profile, insurance certificates,
 * trade certifications, job history, and performance ratings.
 * Contractors link to Safety Permits (GET /:id/permits) for full
 * accountability on who performed hazardous work.
 * All data stored in trier_logistics.db (cross-plant contractor pool).
 * Mounted at /api/contractors in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /                   List contractors (filter: status, trade, search)
 *   GET    /stats              Dashboard counts: active, expiring certs, jobs this month
 *   GET    /expiring           Contractors with insurance or certs expiring within N days
 *   GET    /:id/permits        All safety permits linked to this contractor
 *   GET    /:id                Full contractor profile
 *   POST   /                   Create contractor profile
 *   PUT    /:id                Update contractor fields
 *   POST   /:id/certs          Add a certification or insurance document
 *   PUT    /:id/certs/:certId  Update cert expiry / status
 *   POST   /:id/jobs           Log a completed job at a plant
 *   PUT    /:id/jobs/:jobId    Update job record (close out, add notes)
 *   GET    /jobs/all           All contractor jobs across all contractors (for reporting)
 *   GET    /constants/all      Enum lists: TradeTypes, CertTypes, StatusValues
 *
 * EXPIRY ALERTING: GET /expiring returns contractors whose InsuranceExpiry or
 * CertExpiry falls within ?days=30 (default 30 days). The frontend highlights
 * these in the Contractor Dashboard to prevent lapsed-insurance incidents.
 *
 * PERFORMANCE RATINGS: Each job log includes a PerformanceRating (1–5 stars).
 * The contractor's AverageRating is computed dynamically from all job logs.
 *
 * TABLES (trier_logistics.db):
 *   contractors              — Primary contractor record
 *   contractor_certs         — Certifications + insurance documents (expiry dates)
 *   contractor_jobs          — Work history per plant (linked to WO or Permit)
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('../logistics_db');

function initContractorTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS contractors (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            CompanyName TEXT NOT NULL,
            ContactName TEXT,
            ContactEmail TEXT,
            ContactPhone TEXT,
            Address TEXT,
            TradeSpecialty TEXT,
            HourlyRate REAL,
            DayRate REAL,
            InsuranceExpiry TEXT,
            LiabilityLimit REAL,
            TaxID TEXT,
            PrequalificationStatus TEXT DEFAULT 'Pending',
            SafetyRating REAL DEFAULT 0,
            OverallRating REAL DEFAULT 0,
            Notes TEXT,
            PlantID TEXT,
            Active INTEGER DEFAULT 1,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS contractor_certs (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            ContractorID INTEGER NOT NULL,
            CertName TEXT NOT NULL,
            CertNumber TEXT,
            IssuedDate TEXT,
            ExpiryDate TEXT,
            IssuingBody TEXT,
            DocumentPath TEXT,
            Status TEXT DEFAULT 'Active',
            FOREIGN KEY (ContractorID) REFERENCES contractors(ID)
        );
        CREATE TABLE IF NOT EXISTS contractor_jobs (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            ContractorID INTEGER NOT NULL,
            WorkOrderID TEXT,
            Description TEXT NOT NULL,
            StartDate TEXT,
            EndDate TEXT,
            AgreedRate REAL,
            ActualCost REAL,
            HoursWorked REAL,
            PerformanceRating INTEGER,
            SafetyIncidents INTEGER DEFAULT 0,
            Notes TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (ContractorID) REFERENCES contractors(ID)
        );
    `);
    console.log('[CONTRACTORS] Tables initialized');
}
initContractorTables();

const TRADE_SPECIALTIES = ['Electrical', 'Plumbing', 'HVAC', 'Welding', 'Fabrication', 'Millwright', 'Instrumentation', 'Painting/Coating', 'Insulation', 'Roofing', 'Concrete', 'Structural', 'Rigging/Crane', 'Fire Protection', 'Environmental', 'IT/Networking', 'General Labor', 'Other'];
const PREQUAL_STATUSES = ['Pending', 'Approved', 'Conditional', 'Expired', 'Suspended', 'Blacklisted'];

// ── Contractor CRUD ─────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const { trade, status, plant, search, minRating } = req.query;
        let sql = 'SELECT * FROM contractors WHERE Active=1';
        const p = [];
        if (trade) { sql += ' AND TradeSpecialty=?'; p.push(trade); }
        if (status) { sql += ' AND PrequalificationStatus=?'; p.push(status); }
        if (plant) { sql += ' AND PlantID=?'; p.push(plant); }
        if (search) { sql += ' AND (CompanyName LIKE ? OR ContactName LIKE ? OR TradeSpecialty LIKE ?)'; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
        if (minRating) { sql += ' AND OverallRating >= ?'; p.push(parseFloat(minRating)); }
        sql += ' ORDER BY CompanyName ASC';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch contractors' }); }
});

router.get('/stats', (req, res) => {
    try {
        const total = logisticsDb.prepare('SELECT COUNT(*) as c FROM contractors WHERE Active=1').get().c;
        const approved = logisticsDb.prepare("SELECT COUNT(*) as c FROM contractors WHERE Active=1 AND PrequalificationStatus='Approved'").get().c;
        const avgRating = logisticsDb.prepare('SELECT COALESCE(AVG(OverallRating),0) as r FROM contractors WHERE Active=1 AND OverallRating > 0').get().r;
        const totalSpend = logisticsDb.prepare('SELECT COALESCE(SUM(ActualCost),0) as s FROM contractor_jobs').get().s;
        const ytdSpend = logisticsDb.prepare("SELECT COALESCE(SUM(ActualCost),0) as s FROM contractor_jobs WHERE StartDate >= date('now','start of year')").get().s;
        const byTrade = logisticsDb.prepare('SELECT TradeSpecialty, COUNT(*) as count FROM contractors WHERE Active=1 GROUP BY TradeSpecialty ORDER BY count DESC').all();
        const expiringInsurance = logisticsDb.prepare("SELECT COUNT(*) as c FROM contractors WHERE Active=1 AND InsuranceExpiry IS NOT NULL AND InsuranceExpiry <= date('now', '+30 days')").get().c;
        const expiringCerts = logisticsDb.prepare("SELECT COUNT(*) as c FROM contractor_certs WHERE Status='Active' AND ExpiryDate IS NOT NULL AND ExpiryDate <= date('now', '+30 days')").get().c;
        res.json({ total, approved, avgRating: Math.round(avgRating * 10) / 10, totalSpend, ytdSpend, byTrade, expiringInsurance, expiringCerts });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch stats' }); }
});

router.get('/expiring', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 60;
        const cutoff = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
        const insurance = logisticsDb.prepare('SELECT ID, CompanyName, InsuranceExpiry FROM contractors WHERE Active=1 AND InsuranceExpiry IS NOT NULL AND InsuranceExpiry <= ? ORDER BY InsuranceExpiry ASC').all(cutoff);
        const certs = logisticsDb.prepare(`
            SELECT cc.*, c.CompanyName
            FROM contractor_certs cc
            JOIN contractors c ON cc.ContractorID = c.ID
            WHERE cc.Status='Active' AND cc.ExpiryDate IS NOT NULL AND cc.ExpiryDate <= ?
            ORDER BY cc.ExpiryDate ASC
        `).all(cutoff);
        res.json({ expiringInsurance: insurance, expiringCerts: certs });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch expiring items' }); }
});

// ── GET /api/contractors/:id/permits — Active permits linked to contractor ──
router.get('/:id/permits', (req, res) => {
    try {
        const permits = logisticsDb.prepare(`
            SELECT ID, PermitNumber, PermitType, Location, Status, IssuedAt, ExpiresAt, PlantID, IssuedBy
            FROM SafetyPermits WHERE ContractorID = ? ORDER BY IssuedAt DESC LIMIT 50
        `).all(req.params.id);
        res.json({ permits });
    } catch (err) {
        // SafetyPermits table may not exist in older installs
        res.json({ permits: [] });
    }
});

router.get('/:id', (req, res) => {
    try {
        const contractor = logisticsDb.prepare('SELECT * FROM contractors WHERE ID=?').get(req.params.id);
        if (!contractor) return res.status(404).json({ error: 'Contractor not found' });
        const certs = logisticsDb.prepare('SELECT * FROM contractor_certs WHERE ContractorID=? ORDER BY ExpiryDate ASC').all(contractor.ID);
        const jobs = logisticsDb.prepare('SELECT * FROM contractor_jobs WHERE ContractorID=? ORDER BY StartDate DESC LIMIT 50').all(contractor.ID);
        const totalSpend = jobs.reduce((s, j) => s + (j.ActualCost || 0), 0);
        const totalHours = jobs.reduce((s, j) => s + (j.HoursWorked || 0), 0);
        const avgPerformance = jobs.length > 0 ? jobs.reduce((s, j) => s + (j.PerformanceRating || 0), 0) / jobs.filter(j => j.PerformanceRating).length : 0;
        res.json({ contractor, certs, jobs, totalSpend, totalHours, avgPerformance: Math.round(avgPerformance * 10) / 10 });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch contractor' }); }
});

router.post('/', (req, res) => {
    try {
        const { companyName, contactName, contactEmail, contactPhone, address, tradeSpecialty, hourlyRate, dayRate, insuranceExpiry, liabilityLimit, taxId, notes, plantId } = req.body;
        if (!companyName) return res.status(400).json({ error: 'Company name required' });
        const r = logisticsDb.prepare('INSERT INTO contractors (CompanyName, ContactName, ContactEmail, ContactPhone, Address, TradeSpecialty, HourlyRate, DayRate, InsuranceExpiry, LiabilityLimit, TaxID, Notes, PlantID) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(companyName, contactName || null, contactEmail || null, contactPhone || null, address || null, tradeSpecialty || null, hourlyRate || null, dayRate || null, insuranceExpiry || null, liabilityLimit || null, taxId || null, notes || null, plantId || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to add contractor: ' }); }
});

router.put('/:id', (req, res) => {
    try {
        const allowed = ['CompanyName','ContactName','ContactEmail','ContactPhone','Address','TradeSpecialty','HourlyRate','DayRate','InsuranceExpiry','LiabilityLimit','PrequalificationStatus','SafetyRating','OverallRating','Notes'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        if (f.length === 0) return res.json({ success: true });
        f.push("UpdatedAt=datetime('now')"); v.push(req.params.id);
        logisticsDb.prepare(`UPDATE contractors SET ${f.join(',')} WHERE ID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update contractor' }); }
});

// ── Certifications ──────────────────────────────────────────────
router.post('/:id/certs', (req, res) => {
    try {
        const { certName, certNumber, issuedDate, expiryDate, issuingBody, documentPath } = req.body;
        if (!certName) return res.status(400).json({ error: 'Certificate name required' });
        const r = logisticsDb.prepare('INSERT INTO contractor_certs (ContractorID, CertName, CertNumber, IssuedDate, ExpiryDate, IssuingBody, DocumentPath) VALUES (?,?,?,?,?,?,?)').run(req.params.id, certName, certNumber || null, issuedDate || null, expiryDate || null, issuingBody || null, documentPath || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to add cert' }); }
});

router.put('/:id/certs/:certId', (req, res) => {
    try {
        const allowed = ['CertName','CertNumber','IssuedDate','ExpiryDate','IssuingBody','DocumentPath','Status'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        if (f.length === 0) return res.json({ success: true });
        v.push(req.params.certId, req.params.id);
        logisticsDb.prepare(`UPDATE contractor_certs SET ${f.join(',')} WHERE ID=? AND ContractorID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update cert' }); }
});

// ── Job History ─────────────────────────────────────────────────
router.post('/:id/jobs', (req, res) => {
    try {
        const { workOrderId, description, startDate, endDate, agreedRate, actualCost, hoursWorked, performanceRating, safetyIncidents, notes } = req.body;
        if (!description) return res.status(400).json({ error: 'Job description required' });
        const r = logisticsDb.prepare('INSERT INTO contractor_jobs (ContractorID, WorkOrderID, Description, StartDate, EndDate, AgreedRate, ActualCost, HoursWorked, PerformanceRating, SafetyIncidents, Notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(req.params.id, workOrderId || null, description, startDate || null, endDate || null, agreedRate || null, actualCost || null, hoursWorked || null, performanceRating || null, safetyIncidents || 0, notes || null);

        // Auto-update contractor overall rating
        if (performanceRating) {
            const avg = logisticsDb.prepare('SELECT AVG(PerformanceRating) as r FROM contractor_jobs WHERE ContractorID=? AND PerformanceRating IS NOT NULL').get(req.params.id);
            if (avg?.r) logisticsDb.prepare('UPDATE contractors SET OverallRating=? WHERE ID=?').run(Math.round(avg.r * 10) / 10, req.params.id);
        }
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to add job' }); }
});

router.put('/:id/jobs/:jobId', (req, res) => {
    try {
        const allowed = ['EndDate','ActualCost','HoursWorked','PerformanceRating','SafetyIncidents','Notes'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        if (f.length === 0) return res.json({ success: true });
        v.push(req.params.jobId, req.params.id);
        logisticsDb.prepare(`UPDATE contractor_jobs SET ${f.join(',')} WHERE ID=? AND ContractorID=?`).run(...v);

        // Re-calc rating
        if (req.body.PerformanceRating) {
            const avg = logisticsDb.prepare('SELECT AVG(PerformanceRating) as r FROM contractor_jobs WHERE ContractorID=? AND PerformanceRating IS NOT NULL').get(req.params.id);
            if (avg?.r) logisticsDb.prepare('UPDATE contractors SET OverallRating=? WHERE ID=?').run(Math.round(avg.r * 10) / 10, req.params.id);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update job' }); }
});

// ── All Jobs (for Job History tab) ──────────────────────────────
router.get('/jobs/all', (req, res) => {
    try {
        const { search } = req.query;
        let sql = `SELECT j.*, c.CompanyName, c.TradeSpecialty FROM contractor_jobs j JOIN contractors c ON j.ContractorID = c.ID WHERE 1=1`;
        const p = [];
        if (search) { sql += ' AND (j.Description LIKE ? OR c.CompanyName LIKE ? OR j.WorkOrderID LIKE ?)'; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
        sql += ' ORDER BY j.StartDate DESC LIMIT 100';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch jobs' }); }
});

router.get('/constants/all', (req, res) => {
    res.json({ tradeSpecialties: TRADE_SPECIALTIES, prequalStatuses: PREQUAL_STATUSES });
});

// ── Safety Induction Records ──────────────────────────────────────────────────
// Track site safety inductions: when a contractor/worker completed plant-specific
// safety orientation, who conducted it, and when it expires.

logisticsDb.exec(`
    CREATE TABLE IF NOT EXISTS contractor_inductions (
        ID              INTEGER PRIMARY KEY AUTOINCREMENT,
        ContractorID    INTEGER NOT NULL REFERENCES contractors(ID) ON DELETE CASCADE,
        PlantID         TEXT    NOT NULL,
        WorkerName      TEXT,                   -- Individual worker name (optional if company-level)
        InductionType   TEXT    DEFAULT 'SITE_SAFETY',  -- SITE_SAFETY | HAZMAT | CONFINED_SPACE | CUSTOM
        ConductedBy     TEXT,
        ConductedAt     TEXT,
        ExpiresAt       TEXT,
        Passed          INTEGER DEFAULT 1,
        Notes           TEXT,
        CreatedAt       TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_inductions_contractor ON contractor_inductions(ContractorID);
    CREATE INDEX IF NOT EXISTS idx_inductions_plant      ON contractor_inductions(PlantID);
`);

// GET /api/contractors/:id/inductions
router.get('/:id/inductions', (req, res) => {
    try {
        const rows = logisticsDb.prepare(
            'SELECT * FROM contractor_inductions WHERE ContractorID = ? ORDER BY ConductedAt DESC'
        ).all(req.params.id);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/contractors/:id/inductions
router.post('/:id/inductions', (req, res) => {
    try {
        const { plantId, workerName, inductionType = 'SITE_SAFETY', conductedBy, conductedAt, expiresAt, passed = true, notes } = req.body;
        if (!plantId) return res.status(400).json({ error: 'plantId is required' });

        const result = logisticsDb.prepare(`
            INSERT INTO contractor_inductions
                (ContractorID, PlantID, WorkerName, InductionType, ConductedBy, ConductedAt, ExpiresAt, Passed, Notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(req.params.id, plantId, workerName || null, inductionType, conductedBy || null, conductedAt || null, expiresAt || null, passed ? 1 : 0, notes || null);

        res.status(201).json({ id: result.lastInsertRowid, ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
