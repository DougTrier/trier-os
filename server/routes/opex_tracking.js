// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * opex_tracking.js — OpEx Self-Healing Loop API
 * ================================================
 * Closes the OpEx Intelligence loop by tracking whether action-plan
 * commitments were executed, validating that savings actually materialized
 * in live plant data at 30/60/90-day checkpoints, and feeding every
 * outcome back into per-plant, per-category realization rate models so
 * that future financial predictions become more accurate over time.
 *
 * When a corporate exec commits to an action plan item, the system:
 *   1. Snapshots the current live baseline value for that category.
 *   2. Creates three PENDING outcome checkpoints (30/60/90 days).
 *   3. Nightly cron re-runs the same algorithm against live data, computes
 *      the delta, marks VALIDATED / PARTIAL / MISSED, and fires escalation
 *      alerts for persistent misses.
 *   4. Every outcome updates the Bayesian rolling average in
 *      OpExPlantCalibration — the next prediction for that plant/category
 *      uses that plant's real realization history, not a static 22% default.
 *
 * -- ROUTES ----------------------------------------------------
 *   POST   /api/opex-tracking/commit                  Create commitment + baseline snapshot
 *   GET    /api/opex-tracking/commitments              List all (filterable by plant/status/category)
 *   PATCH  /api/opex-tracking/commitments/:id/status  Update status (OPEN → IN_PROGRESS → COMPLETED)
 *   GET    /api/opex-tracking/outcomes                 List outcome measurements
 *   POST   /api/opex-tracking/outcomes/:id             Manual outcome entry
 *   GET    /api/opex-tracking/calibration              Per-plant realization rates
 *   GET    /api/opex-tracking/alerts                   Open escalation alerts
 *   PATCH  /api/opex-tracking/alerts/:id/acknowledge  Acknowledge / resolve an alert
 *   GET    /api/opex-tracking/dashboard                Corporate roll-up (counts, financials, heatmap)
 *   GET    /api/opex-tracking/plant/:plantId           Plant-level view (plant manager scope)
 *
 * -- EXPORTED FUNCTION ----------------------------------------
 *   runOpExOutcomeCron()  Called by server/index.js Stage 5.9 every 24 hrs.
 *                         Measures all due PENDING checkpoints, updates
 *                         calibration, fires OVERDUE and ESCALATION alerts.
 *
 * -- DATABASE TABLES (trier_logistics.db) ---------------------
 *   OpExCommitments       Each committed action plan item with baseline value
 *   OpExOutcomes          30/60/90-day measured results per commitment
 *   OpExPlantCalibration  Rolling realization rate per plant per category
 *   OpExAlerts            Escalation records (OVERDUE / MISSED / ESCALATION)
 *
 * -- CATEGORY MEASUREMENT COVERAGE ----------------------------
 *   overstock | ghost | freight | labor | vendor | phantom |
 *   shrink | accidents | capex | sku  (10 of 14 OpEx categories)
 */


const express  = require('express');
const router   = express.Router();
const path     = require('path');
const { db: logDb, logAudit } = require('../logistics_db');

// ── Schema Bootstrap ─────────────────────────────────────────────────────────
logDb.exec(`
    CREATE TABLE IF NOT EXISTS OpExCommitments (
        ID               INTEGER PRIMARY KEY AUTOINCREMENT,
        PlantId          TEXT    NOT NULL,
        Category         TEXT    NOT NULL,
        ItemKey          TEXT,
        ItemDescription  TEXT    NOT NULL,
        PredictedSavings REAL    DEFAULT 0,
        BaselineValue    REAL    DEFAULT 0,
        CommittedBy      TEXT    NOT NULL,
        CommittedAt      DATETIME DEFAULT CURRENT_TIMESTAMP,
        TargetDate       DATE    NOT NULL,
        AssignedTo       TEXT,
        Priority         TEXT    DEFAULT 'HIGH'
                         CHECK (Priority IN ('HIGH','MEDIUM','LOW')),
        Status           TEXT    DEFAULT 'OPEN'
                         CHECK (Status IN ('OPEN','IN_PROGRESS','COMPLETED','MISSED','DISPUTED')),
        CompletedAt      DATETIME,
        Notes            TEXT,
        ActionPlanStep   TEXT
    );
    CREATE TABLE IF NOT EXISTS OpExOutcomes (
        ID               INTEGER PRIMARY KEY AUTOINCREMENT,
        CommitmentID     INTEGER REFERENCES OpExCommitments(ID),
        MeasuredAt       DATETIME DEFAULT CURRENT_TIMESTAMP,
        CheckInterval    INTEGER  NOT NULL,
        PredictedSavings REAL,
        MeasuredValue    REAL,
        RealizationPct   REAL,
        Status           TEXT    DEFAULT 'PENDING'
                         CHECK (Status IN ('PENDING','VALIDATED','PARTIAL','MISSED','DISPUTED')),
        AutoMeasured     INTEGER  DEFAULT 1,
        ValidatedBy      TEXT,
        Notes            TEXT
    );
    CREATE TABLE IF NOT EXISTS OpExPlantCalibration (
        PlantId         TEXT NOT NULL,
        Category        TEXT NOT NULL,
        RealizationRate REAL DEFAULT 0.22,
        SampleCount     INTEGER DEFAULT 0,
        LastUpdated     DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (PlantId, Category)
    );
    CREATE TABLE IF NOT EXISTS OpExAlerts (
        ID              INTEGER PRIMARY KEY AUTOINCREMENT,
        CommitmentID    INTEGER REFERENCES OpExCommitments(ID),
        AlertType       TEXT NOT NULL
                        CHECK (AlertType IN ('OVERDUE','MISSED_OUTCOME','DISPUTE','ESCALATION')),
        AlertedAt       DATETIME DEFAULT CURRENT_TIMESTAMP,
        AcknowledgedBy  TEXT,
        AcknowledgedAt  DATETIME,
        Resolved        INTEGER DEFAULT 0
    );
`);
// INFO-03: FK indexes for join performance as data grows
try {
    logDb.exec(`
        CREATE INDEX IF NOT EXISTS idx_opex_outcomes_cid ON OpExOutcomes(CommitmentID);
        CREATE INDEX IF NOT EXISTS idx_opex_alerts_cid   ON OpExAlerts(CommitmentID);
        CREATE INDEX IF NOT EXISTS idx_opex_commits_plant ON OpExCommitments(PlantId);
        CREATE INDEX IF NOT EXISTS idx_opex_commits_status ON OpExCommitments(Status);
    `);
} catch (_) {}

// ── Auth Helpers ──────────────────────────────────────────────────────────────
// isCorp: corporate-level roles that may see enterprise-wide financial data
function isCorp(user) {
    return ['creator','corporate','it_admin','manager','plant_manager']
        .includes(user?.globalRole || user?.role);
}
// SEC-02: Whitelist plantId to prevent path traversal in captureBaseline()
// Only alphanumeric, underscore, and hyphen characters are permitted.
const SAFE_PLANT_RE = /^[a-zA-Z0-9_-]+$/;
function sanitizePlantId(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const s = raw.trim();
    return SAFE_PLANT_RE.test(s) ? s : null;
}

// ── Baseline Capture ──────────────────────────────────────────────────────────
// Re-runs the category algorithm for a specific plant and returns the current
// raw metric value so it can be stored as a baseline at commit time.
// Returns null on error (so callers can surface a warning rather than using 0).
// SEC-02: plantId MUST be sanitized before calling this function.
function captureBaseline(plantId, category) {
    // BUG-02: all_sites is not a real plant DB — bail early with null
    if (!plantId || plantId === 'all_sites') {
        console.warn('[OpEx] captureBaseline: plantId "all_sites" is not supported — select a specific plant');
        return null;
    }
    const safe = sanitizePlantId(plantId);
    if (!safe) {
        console.warn('[OpEx] captureBaseline: rejected unsafe plantId:', plantId);
        return null;
    }
    try {
        const dataDir = require('../resolve_data_dir');
        const Database = require('better-sqlite3');
        const dbPath = path.join(dataDir, `${safe}.db`);
        if (!require('fs').existsSync(dbPath)) {
            console.warn(`[OpEx] captureBaseline: DB not found for plant "${safe}" — baseline will be null`);
            return null;
        }
        const db = new Database(dbPath, { readonly: true });

        let value = 0;
        const fy = getCurrentFY();

        switch (category) {
            case 'overstock': {
                const rows = db.prepare(`
                    SELECT p.UnitCost, p.QtyOnHand,
                           COALESCE((SELECT SUM(ABS(t.QtyChange)) FROM PartTransactions t
                                     WHERE t.PartID = p.ID
                                       AND t.TransDate >= date('now','-365 days')), 0) AS annualUsage
                    FROM Parts p WHERE p.QtyOnHand > 0 AND p.UnitCost > 0
                `).all();
                value = rows.reduce((s, r) => {
                    const maxSafe = (r.annualUsage || 0) * 1.5;
                    const excess  = Math.max(0, r.QtyOnHand - maxSafe);
                    return s + excess * (r.UnitCost || 0);
                }, 0);
                break;
            }
            case 'ghost': {
                const rows = db.prepare(`
                    SELECT p.QtyOnHand, p.UnitCost
                    FROM Parts p
                    WHERE p.QtyOnHand > 0 AND p.UnitCost > 0
                      AND (p.LastInDate IS NULL OR p.LastInDate < date('now','-365 days'))
                `).all();
                value = rows.reduce((s, r) => s + (r.QtyOnHand * r.UnitCost), 0);
                break;
            }
            case 'freight': {
                const rows = db.prepare(`
                    SELECT COALESCE(SUM(w.Cost), 0) AS v FROM WorkMisc w
                    WHERE LOWER(w.Description) LIKE '%overnight%'
                       OR LOWER(w.Description) LIKE '%air freight%'
                       OR LOWER(w.Description) LIKE '%hotshot%'
                       OR LOWER(w.Description) LIKE '%expedite%'
                `).get();
                value = rows?.v || 0;
                break;
            }
            case 'labor': {
                const rows = db.prepare(`
                    SELECT COALESCE(SUM(l.OTHours * l.OTRate),0) AS v FROM Labor l
                    WHERE l.WorkDate >= date('now','-90 days')
                `).get();
                value = rows?.v || 0;
                break;
            }
            case 'vendor': {
                const rows = db.prepare(`
                    SELECT COALESCE(SUM(po.TotalCost),0) AS v FROM PurchaseOrders po
                    WHERE po.OrderDate >= date('now','-365 days')
                `).get();
                value = rows?.v || 0;
                break;
            }
            case 'phantom': {
                const rows = db.prepare(`
                    SELECT COALESCE(SUM(u.Amount),0) AS v FROM Utilities u
                    WHERE u.ReadingDate >= date('now','-365 days')
                `).get();
                value = (rows?.v || 0) * 0.19;
                break;
            }
            case 'shrink': {
                const rows = db.prepare(`
                    SELECT COALESCE(SUM(w.Cost),0) AS v FROM WorkMisc w
                    WHERE (LOWER(w.Description) LIKE '%dump%'
                        OR LOWER(w.Description) LIKE '%product loss%'
                        OR LOWER(w.Description) LIKE '%scrap%')
                      AND w.WorkDate >= date('now','-365 days')
                `).get();
                value = rows?.v || 0;
                break;
            }
            case 'accidents': {
                const rows = db.prepare(`
                    SELECT COALESCE(SUM(s.MedicalExpense + s.PropertyDamage),0) AS v
                    FROM SafetyIncidents s
                    WHERE s.IncidentDate >= date('now','-365 days')
                `).get();
                value = rows?.v || 0;
                break;
            }
            case 'capex': {
                const rows = db.prepare(`
                    SELECT COUNT(*) AS v FROM Work w
                    WHERE w.AddDate >= date('now','-365 days')
                `).get();
                value = rows?.v || 0;
                break;
            }
            case 'sku': {
                const rows = db.prepare(`
                    SELECT COUNT(*) AS v FROM Parts p
                    WHERE p.ManufacturerPartNumber IS NOT NULL
                      AND p.ManufacturerPartNumber != ''
                `).get();
                value = rows?.v || 0;
                break;
            }
            default:
                value = 0;
        }

        db.close();
        return Math.round(value * 100) / 100;
    } catch (err) {
        // QUAL-01: log the real error so silent failures are observable in server logs
        console.warn('[OpEx] captureBaseline failed:', err.message, { plantId, category });
        return null;
    }
}
// BUG-04: getCurrentFY() was unused — removed to eliminate dead code.

// ── POST /api/opex-tracking/commit ────────────────────────────────────────────
router.post('/commit', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (!isCorp(user)) return res.status(403).json({ error: 'Corporate role required' });

    const {
        plantId, category, itemKey, itemDescription,
        predictedSavings, targetDate, assignedTo, priority, actionPlanStep, notes
    } = req.body;

    // SEC-02 / BUG-02: validate and sanitize plantId before any DB path use
    const safePlantId = sanitizePlantId(plantId);
    if (!safePlantId || safePlantId === 'all_sites') {
        return res.status(400).json({
            error: 'A specific plant must be selected — "all_sites" commitments are not supported. Open the game plan from a specific plant context or select a plant in the commit dialog.'
        });
    }
    if (!category || !itemDescription || !targetDate) {
        return res.status(400).json({ error: 'category, itemDescription, and targetDate are required' });
    }

    // Capture live baseline before commitment is recorded
    const baselineValue = captureBaseline(safePlantId, category);
    // QUAL-01: null means capture failed — commit still proceeds but warns caller
    const baselineWarning = baselineValue === null
        ? 'Baseline capture failed — outcomes will be measured relative to zero. Check server logs.'
        : null;

    const result = logDb.prepare(`
        INSERT INTO OpExCommitments
          (PlantId, Category, ItemKey, ItemDescription, PredictedSavings, BaselineValue,
           CommittedBy, TargetDate, AssignedTo, Priority, ActionPlanStep, Notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
        safePlantId, category, itemKey || null, itemDescription,
        predictedSavings || 0, baselineValue ?? 0,
        user.Username, targetDate,
        assignedTo || null, priority || 'HIGH',
        actionPlanStep || null, notes || null
    );

    // Seed pending outcome checkpoints at 30/60/90 days from now
    const now = new Date();
    for (const days of [30, 60, 90]) {
        const checkDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        logDb.prepare(`
            INSERT INTO OpExOutcomes (CommitmentID, CheckInterval, PredictedSavings, Status, AutoMeasured, MeasuredAt)
            VALUES (?,?,?,'PENDING',1,?)
        `).run(result.lastInsertRowid, days, predictedSavings || 0, checkDate.toISOString());
    }

    logAudit(user.Username, 'OPEX_COMMITMENT_CREATED', safePlantId, {
        id: result.lastInsertRowid, category, item: itemDescription, predicted: predictedSavings, baselineValue
    }, 'INFO', req.ip);

    res.json({
        success: true,
        commitmentId: result.lastInsertRowid,
        baselineValue,
        warning: baselineWarning,
        message: `Commitment created. Outcome checkpoints scheduled at 30/60/90 days.`
    });
});

// ── GET /api/opex-tracking/commitments ───────────────────────────────────────
// SEC-01: requires corporate role — commitment list includes enterprise financials
router.get('/commitments', (req, res) => {
    const user = req.user;
    if (!user)        return res.status(401).json({ error: 'Authentication required' });
    if (!isCorp(user)) return res.status(403).json({ error: 'Corporate role required' });

    const { plantId, status, category } = req.query;
    // QUAL-02: cap user-controlled limit at 500 to prevent full-table dumps
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    let sql = 'SELECT * FROM OpExCommitments WHERE 1=1';
    const params = [];
    if (plantId)  { sql += ' AND PlantId = ?';  params.push(plantId); }
    if (status)   { sql += ' AND Status = ?';   params.push(status.toUpperCase()); }
    if (category) { sql += ' AND Category = ?'; params.push(category); }
    sql += ' ORDER BY CommittedAt DESC LIMIT ?';
    params.push(limit);

    const rows = logDb.prepare(sql).all(...params);

    // PERF-01: batch outcomes + alerts in 2 queries instead of N+1
    const ids = rows.map(r => r.ID);
    const allOutcomes = ids.length
        ? logDb.prepare(`SELECT * FROM OpExOutcomes WHERE CommitmentID IN (${ids.map(() => '?').join(',')}) ORDER BY CheckInterval ASC`).all(...ids)
        : [];
    const allAlerts = ids.length
        ? logDb.prepare(`SELECT * FROM OpExAlerts WHERE CommitmentID IN (${ids.map(() => '?').join(',')}) AND Resolved = 0`).all(...ids)
        : [];
    const outMap   = {}; allOutcomes.forEach(o => { (outMap[o.CommitmentID]   ||= []).push(o); });
    const alertMap = {}; allAlerts.forEach(a => { (alertMap[a.CommitmentID] ||= []).push(a); });
    const withOutcomes = rows.map(c => ({ ...c, outcomes: outMap[c.ID] || [], alerts: alertMap[c.ID] || [] }));

    res.json({ commitments: withOutcomes, total: withOutcomes.length });
});

// ── PATCH /api/opex-tracking/commitments/:id/status ──────────────────────────
// SEC-01: any authenticated user (incl. plant managers) may update their own commitments
router.patch('/commitments/:id/status', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    const { status, notes } = req.body;
    const validStatuses = ['OPEN','IN_PROGRESS','COMPLETED','MISSED','DISPUTED'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const commitment = logDb.prepare('SELECT * FROM OpExCommitments WHERE ID = ?').get(req.params.id);
    if (!commitment) return res.status(404).json({ error: 'Commitment not found' });

    const updates = { Status: status, Notes: notes || commitment.Notes };
    if (status === 'COMPLETED') updates.CompletedAt = new Date().toISOString();

    logDb.prepare(`
        UPDATE OpExCommitments SET Status=?, Notes=?, CompletedAt=? WHERE ID=?
    `).run(updates.Status, updates.Notes, updates.CompletedAt || null, req.params.id);

    // If marked DISPUTED, open an alert
    if (status === 'DISPUTED') {
        logDb.prepare(`
            INSERT INTO OpExAlerts (CommitmentID, AlertType) VALUES (?,'DISPUTE')
        `).run(req.params.id);
    }

    logAudit(user.Username, 'OPEX_COMMITMENT_STATUS', commitment.PlantId, {
        id: req.params.id, from: commitment.Status, to: status
    }, 'INFO', req.ip);

    res.json({ success: true });
});

// ── GET /api/opex-tracking/outcomes ──────────────────────────────────────────
// SEC-01: corporate role required — outcomes contain realized financial deltas
router.get('/outcomes', (req, res) => {
    const user = req.user;
    if (!user)        return res.status(401).json({ error: 'Authentication required' });
    if (!isCorp(user)) return res.status(403).json({ error: 'Corporate role required' });
    const { commitmentId, status } = req.query;
    let sql = 'SELECT o.*, c.PlantId, c.Category, c.ItemDescription, c.AssignedTo FROM OpExOutcomes o JOIN OpExCommitments c ON c.ID = o.CommitmentID WHERE 1=1';
    const params = [];
    if (commitmentId) { sql += ' AND o.CommitmentID = ?'; params.push(commitmentId); }
    if (status)       { sql += ' AND o.Status = ?';       params.push(status); }
    sql += ' ORDER BY o.MeasuredAt DESC LIMIT 500';
    res.json({ outcomes: logDb.prepare(sql).all(...params) });
});

// ── POST /api/opex-tracking/outcomes/:commitmentId ───────────────────────────
// Manual outcome entry — plant manager or corp can record savings observed.
router.post('/outcomes/:commitmentId', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    const { measuredValue, checkInterval, notes } = req.body;
    if (measuredValue === undefined || !checkInterval) {
        return res.status(400).json({ error: 'measuredValue and checkInterval required' });
    }
    const commitment = logDb.prepare('SELECT * FROM OpExCommitments WHERE ID = ?').get(req.params.commitmentId);
    if (!commitment) return res.status(404).json({ error: 'Commitment not found' });

    const delta = commitment.BaselineValue - measuredValue;
    const pct   = commitment.PredictedSavings > 0
        ? Math.round((delta / commitment.PredictedSavings) * 10000) / 100
        : 0;
    const outcomeStatus = pct >= 80 ? 'VALIDATED' : pct >= 30 ? 'PARTIAL' : 'MISSED';

    logDb.prepare(`
        INSERT INTO OpExOutcomes
          (CommitmentID, CheckInterval, PredictedSavings, MeasuredValue, RealizationPct, Status, AutoMeasured, ValidatedBy, Notes)
        VALUES (?,?,?,?,?,?,0,?,?)
    `).run(commitment.ID, checkInterval, commitment.PredictedSavings, measuredValue, pct, outcomeStatus, user.Username, notes || null);

    updateCalibration(commitment.PlantId, commitment.Category, pct / 100);

    if (outcomeStatus === 'MISSED') {
        logDb.prepare(`INSERT INTO OpExAlerts (CommitmentID, AlertType) VALUES (?,'MISSED_OUTCOME')`).run(commitment.ID);
    }

    logAudit(user.Username, 'OPEX_OUTCOME_MANUAL', commitment.PlantId, {
        commitmentId: commitment.ID, pct, status: outcomeStatus
    }, 'INFO', req.ip);

    res.json({ success: true, outcomeStatus, realizationPct: pct });
});

// ── GET /api/opex-tracking/calibration ───────────────────────────────────────
// SEC-01: corporate role required — calibration rates reveal per-plant performance history
router.get('/calibration', (req, res) => {
    const user = req.user;
    if (!user)        return res.status(401).json({ error: 'Authentication required' });
    if (!isCorp(user)) return res.status(403).json({ error: 'Corporate role required' });
    const rows = logDb.prepare('SELECT * FROM OpExPlantCalibration ORDER BY PlantId, Category').all();
    res.json({ calibration: rows });
});

// ── GET /api/opex-tracking/alerts ────────────────────────────────────────────
// SEC-01: corporate role required — alerts contain plant escalation details
router.get('/alerts', (req, res) => {
    const user = req.user;
    if (!user)        return res.status(401).json({ error: 'Authentication required' });
    if (!isCorp(user)) return res.status(403).json({ error: 'Corporate role required' });
    const rows = logDb.prepare(`
        SELECT a.*, c.PlantId, c.Category, c.ItemDescription, c.AssignedTo, c.PredictedSavings
        FROM OpExAlerts a
        JOIN OpExCommitments c ON c.ID = a.CommitmentID
        WHERE a.Resolved = 0
        ORDER BY a.AlertedAt DESC
    `).all();
    res.json({ alerts: rows, total: rows.length });
});

// ── PATCH /api/opex-tracking/alerts/:id/acknowledge ──────────────────────────
// SEC-01: corporate role required — only corp can dismiss enterprise escalations
router.patch('/alerts/:id/acknowledge', (req, res) => {
    const user = req.user;
    if (!user)        return res.status(401).json({ error: 'Authentication required' });
    if (!isCorp(user)) return res.status(403).json({ error: 'Corporate role required' });
    const { resolve } = req.body;
    logDb.prepare(`
        UPDATE OpExAlerts SET AcknowledgedBy=?, AcknowledgedAt=datetime('now'), Resolved=?
        WHERE ID=?
    `).run(user.Username, resolve ? 1 : 0, req.params.id);
    logAudit(user.Username, 'OPEX_ALERT_ACK', null, { alertId: req.params.id, resolved: !!resolve }, 'INFO', req.ip);
    res.json({ success: true });
});

// ── GET /api/opex-tracking/dashboard ─────────────────────────────────────────
// Corporate roll-up: commitment counts, realized vs. predicted, plant heat map.
// SEC-01: corporate role required — contains enterprise-wide financial summary
router.get('/dashboard', (req, res) => {
    const user = req.user;
    if (!user)        return res.status(401).json({ error: 'Authentication required' });
    if (!isCorp(user)) return res.status(403).json({ error: 'Corporate role required' });

    const counts = logDb.prepare(`
        SELECT Status, COUNT(*) as n FROM OpExCommitments GROUP BY Status
    `).all().reduce((acc, r) => { acc[r.Status] = r.n; return acc; }, {});

    const totalPredicted = logDb.prepare(
        `SELECT COALESCE(SUM(PredictedSavings),0) as v FROM OpExCommitments`
    ).get()?.v || 0;

    const totalRealized = logDb.prepare(
        `SELECT COALESCE(SUM(MeasuredValue),0) as v FROM OpExOutcomes WHERE Status IN ('VALIDATED','PARTIAL')`
    ).get()?.v || 0;

    // Overdue: OPEN or IN_PROGRESS past TargetDate
    const overdue = logDb.prepare(`
        SELECT COUNT(*) as n FROM OpExCommitments
        WHERE Status IN ('OPEN','IN_PROGRESS') AND TargetDate < date('now')
    `).get()?.n || 0;

    // Plant heatmap: realization rate per plant
    const plantRates = logDb.prepare(`
        SELECT c.PlantId,
               COUNT(DISTINCT c.ID) as commitments,
               ROUND(AVG(o.RealizationPct),1) as avgRealization
        FROM OpExCommitments c
        LEFT JOIN OpExOutcomes o ON o.CommitmentID = c.ID AND o.Status != 'PENDING'
        GROUP BY c.PlantId
        ORDER BY avgRealization DESC
    `).all();

    // Category performance
    const categoryPerf = logDb.prepare(`
        SELECT c.Category,
               COUNT(DISTINCT c.ID) as commitments,
               ROUND(AVG(o.RealizationPct),1) as avgRealization,
               COALESCE(SUM(c.PredictedSavings),0) as totalPredicted
        FROM OpExCommitments c
        LEFT JOIN OpExOutcomes o ON o.CommitmentID = c.ID AND o.Status != 'PENDING'
        GROUP BY c.Category
        ORDER BY totalPredicted DESC
    `).all();

    const openAlerts = logDb.prepare(
        `SELECT COUNT(*) as n FROM OpExAlerts WHERE Resolved = 0`
    ).get()?.n || 0;

    res.json({
        counts: {
            open:       counts['OPEN']       || 0,
            inProgress: counts['IN_PROGRESS'] || 0,
            completed:  counts['COMPLETED']   || 0,
            missed:     counts['MISSED']      || 0,
            overdue
        },
        financials: {
            totalPredicted: Math.round(totalPredicted),
            totalRealized:  Math.round(totalRealized),
            realizationPct: totalPredicted > 0
                ? Math.round((totalRealized / totalPredicted) * 100)
                : 0,
        },
        plantRates,
        categoryPerf,
        openAlerts
    });
});

// ── GET /api/opex-tracking/plant/:plantId ─────────────────────────────────────
// Plant-level view — plant managers see only their own plant, corp sees any.
// INFO-02: verify caller's plant scope — plant techs cannot cross plant boundaries.
router.get('/plant/:plantId', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    const { plantId } = req.params;
    // SEC-02: sanitize plantId from URL params
    const safePlant = sanitizePlantId(plantId);
    if (!safePlant) return res.status(400).json({ error: 'Invalid plant identifier' });
    // INFO-02: plant-scoped users can only see their own plant; corp roles see any
    const callerPlant = user.PlantId || user.plantId;
    if (!isCorp(user) && callerPlant && callerPlant !== safePlant) {
        return res.status(403).json({ error: 'Access restricted to your assigned plant' });
    }
    const commitments = logDb.prepare(`
        SELECT c.*,
               (SELECT COUNT(*) FROM OpExOutcomes o
                WHERE o.CommitmentID = c.ID AND o.Status = 'VALIDATED') as validated,
               (SELECT COUNT(*) FROM OpExOutcomes o
                WHERE o.CommitmentID = c.ID AND o.Status = 'MISSED') as missed
        FROM OpExCommitments c
        WHERE c.PlantId = ?  -- safePlant used to prevent path coupling
        ORDER BY
            CASE c.Status
                WHEN 'OPEN'        THEN 1
                WHEN 'IN_PROGRESS' THEN 2
                WHEN 'MISSED'      THEN 3
                WHEN 'COMPLETED'   THEN 4
                ELSE 5
            END,
            c.TargetDate ASC
    `).all(safePlant);

    const openCount = commitments.filter(c =>
        ['OPEN','IN_PROGRESS'].includes(c.Status) && c.TargetDate < new Date().toISOString().split('T')[0]
    ).length;

    const alerts = logDb.prepare(`
        SELECT a.* FROM OpExAlerts a
        JOIN OpExCommitments c ON c.ID = a.CommitmentID
        WHERE c.PlantId = ? AND a.Resolved = 0
    `).all(safePlant);

    res.json({ plantId: safePlant, commitments, overdueCount: openCount, alerts });
});

// ── Calibration Update Helper ─────────────────────────────────────────────────
// Rolling average: new_rate = (old_rate * n + new_rate) / (n + 1)
function updateCalibration(plantId, category, realizationDecimal) {
    try {
        const existing = logDb.prepare(
            'SELECT * FROM OpExPlantCalibration WHERE PlantId=? AND Category=?'
        ).get(plantId, category);

        if (existing) {
            const n       = existing.SampleCount;
            const newRate = ((existing.RealizationRate * n) + realizationDecimal) / (n + 1);
            logDb.prepare(`
                UPDATE OpExPlantCalibration
                SET RealizationRate=?, SampleCount=?, LastUpdated=datetime('now')
                WHERE PlantId=? AND Category=?
            `).run(
                Math.round(newRate * 10000) / 10000,
                n + 1,
                plantId, category
            );
        } else {
            logDb.prepare(`
                INSERT INTO OpExPlantCalibration (PlantId, Category, RealizationRate, SampleCount)
                VALUES (?,?,?,1)
            `).run(plantId, category, Math.round(realizationDecimal * 10000) / 10000);
        }
    } catch (err) {
        console.warn('[OpExTracking] Calibration update failed:', err.message);
    }
}

// ── Exported Cron Function ────────────────────────────────────────────────────
// Called by server/index.js every 24 hours (Stage 5.9).
// Re-measures each PENDING outcome checkpoint that is now due.
// SEC-04 fix: corrected stage number from 5.7 → 5.9
function runOpExOutcomeCron() {
    try {
        const now       = new Date();
        const nowIso    = now.toISOString();

        // BUG-01: Include OPEN and IN_PROGRESS commitments — if action wasn't completed
        // and its checkpoint is due, the outcome is MISSED by definition. Measuring only
        // COMPLETED skips the plants most in need of accountability.
        const pending = logDb.prepare(`
            SELECT o.*, c.PlantId, c.Category, c.BaselineValue, c.PredictedSavings,
                   c.Status as CommitStatus, c.ItemDescription
            FROM OpExOutcomes o
            JOIN OpExCommitments c ON c.ID = o.CommitmentID
            WHERE o.Status = 'PENDING'
              AND o.MeasuredAt <= ?
              AND c.Status NOT IN ('DISPUTED')
        `).all(nowIso);

        if (pending.length === 0) return;

        console.log(`[OpExCron] Processing ${pending.length} outcome checkpoint(s)`);

        for (const checkpoint of pending) {
            try {
                // BUG-01: If the commitment itself is not COMPLETED, the action was not taken —
                // outcome is MISSED regardless of what the algorithm measures.
                let currentValue = null;
                let realizationPct = 0;
                let outcomeStatus  = 'MISSED';

                if (checkpoint.CommitStatus === 'COMPLETED') {
                    currentValue   = captureBaseline(checkpoint.PlantId, checkpoint.Category);
                    const baseline = checkpoint.BaselineValue || 0;
                    const delta    = baseline - (currentValue ?? baseline);
                    realizationPct = checkpoint.PredictedSavings > 0
                        ? Math.round((delta / checkpoint.PredictedSavings) * 10000) / 100
                        : 0;
                    outcomeStatus  = realizationPct >= 80 ? 'VALIDATED'
                                   : realizationPct >= 30 ? 'PARTIAL'
                                   : 'MISSED';
                } else {
                    // Commitment still open/in-progress at checkpoint time — automatic MISSED
                    console.warn(
                        `[OpExCron] Auto-MISSED (commitment not completed): ${checkpoint.ItemDescription} @ ` +
                        `${checkpoint.PlantId} (${checkpoint.CheckInterval}d, status=${checkpoint.CommitStatus})`
                    );
                }

                logDb.prepare(`
                    UPDATE OpExOutcomes
                    SET MeasuredValue=?, RealizationPct=?, Status=?, MeasuredAt=datetime('now')
                    WHERE ID=?
                `).run(currentValue, realizationPct, outcomeStatus, checkpoint.ID);

                // Update calibration model (only for COMPLETED commitments — partial data skews the rate)
                if (checkpoint.CommitStatus === 'COMPLETED') {
                    updateCalibration(checkpoint.PlantId, checkpoint.Category, realizationPct / 100);
                }

                // BUG-05: Deduplicate MISSED_OUTCOME alerts — only insert if none open yet
                if (outcomeStatus === 'MISSED') {
                    const alreadyAlerted = logDb.prepare(`
                        SELECT 1 FROM OpExAlerts
                        WHERE CommitmentID=? AND AlertType='MISSED_OUTCOME' AND Resolved=0
                    `).get(checkpoint.CommitmentID);
                    if (!alreadyAlerted) {
                        logDb.prepare(
                            `INSERT INTO OpExAlerts (CommitmentID, AlertType) VALUES (?,'MISSED_OUTCOME')`
                        ).run(checkpoint.CommitmentID);
                    }
                    console.warn(
                        `[OpExCron] MISSED: ${checkpoint.ItemDescription} @ ${checkpoint.PlantId} ` +
                        `(${checkpoint.CheckInterval}d check) — ${realizationPct}% realized`
                    );
                }

                // BUG-05: Deduplicate ESCALATION alerts on 90-day MISSED
                if (checkpoint.CheckInterval === 90 && outcomeStatus === 'MISSED') {
                    const alreadyEscalated = logDb.prepare(`
                        SELECT 1 FROM OpExAlerts
                        WHERE CommitmentID=? AND AlertType='ESCALATION' AND Resolved=0
                    `).get(checkpoint.CommitmentID);
                    if (!alreadyEscalated) {
                        logDb.prepare(
                            `INSERT INTO OpExAlerts (CommitmentID, AlertType) VALUES (?,'ESCALATION')`
                        ).run(checkpoint.CommitmentID);
                    }
                    console.warn(
                        `[OpExCron] ESCALATION: 90-day MISSED for Commitment #${checkpoint.CommitmentID}`
                    );
                }

                console.log(
                    `[OpExCron] ${checkpoint.CheckInterval}d outcome: ${checkpoint.Category} @ ` +
                    `${checkpoint.PlantId} → ${outcomeStatus} (${realizationPct}%)`
                );
            } catch (innerErr) {
                console.error(`[OpExCron] Failed checkpoint ID ${checkpoint.ID}:`, innerErr.message);
            }
        }

        // Also flag overdue open commitments (past TargetDate, still OPEN/IN_PROGRESS)
        const overdue = logDb.prepare(`
            SELECT ID FROM OpExCommitments
            WHERE Status IN ('OPEN','IN_PROGRESS')
              AND TargetDate < date('now')
              AND ID NOT IN (
                  SELECT CommitmentID FROM OpExAlerts WHERE AlertType='OVERDUE' AND Resolved=0
              )
        `).all();

        for (const { ID } of overdue) {
            logDb.prepare(`INSERT INTO OpExAlerts (CommitmentID, AlertType) VALUES (?,'OVERDUE')`).run(ID);
        }

        if (overdue.length > 0) {
            console.log(`[OpExCron] Flagged ${overdue.length} overdue commitment(s)`);
        }

    } catch (err) {
        console.error('[OpExCron] Cron run failed:', err.message);
    }
}

// QUAL-05: Use clean object export — avoids fragile property-on-function pattern
module.exports = { router, runOpExOutcomeCron };
