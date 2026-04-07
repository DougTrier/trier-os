// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Engineering Excellence Module
 * ==========================================
 * Advanced reliability engineering tools covering the full lifecycle of
 * equipment analysis, design change control, capital investment tracking,
 * and predictive maintenance programs.
 * All data stored in trier_logistics.db (cross-plant).
 * Mounted at /api/engineering in server/index.js.
 *
 * ENDPOINTS:
 *   Root Cause Analysis (RCA) — 5-Why + Ishikawa Fishbone
 *   GET    /rca                          List all RCA investigations
 *   GET    /rca/:id                      Single RCA with why-steps and fishbone
 *   POST   /rca                          Open a new RCA investigation
 *   PUT    /rca/:id                      Update investigation (status, root cause, corrective action)
 *   POST   /rca/:id/why                  Add a 5-Why step to an investigation
 *   POST   /rca/:id/fishbone             Add a cause to the fishbone diagram
 *   DELETE /rca/:id/fishbone/:causeId    Remove a fishbone cause
 *
 *   FMEA — Failure Mode & Effects Analysis
 *   GET    /fmea                         List all FMEA studies
 *   GET    /fmea/:id                     Single FMEA with all failure modes
 *   POST   /fmea                         Create a new FMEA study
 *   POST   /fmea/:id/modes               Add a failure mode (Severity/Occurrence/Detection → RPN)
 *   PUT    /fmea/:id/modes/:modeId       Update a failure mode record
 *   DELETE /fmea/:id/modes/:modeId       Remove a failure mode
 *
 *   Repair vs. Replace Calculator
 *   POST   /repair-replace               Submit analysis (repair cost, replacement cost, asset age)
 *   GET    /repair-replace               List all repair/replace analyses
 *   GET    /repair-replace/:id           Single analysis result
 *   PUT    /repair-replace/:id           Update analysis decision or notes
 *
 *   Engineering Change Notice (ECN)
 *   GET    /ecn                          List all ECNs (filterable by status/plant)
 *   GET    /ecn/:id                      Single ECN with approval chain
 *   POST   /ecn                          Initiate a new ECN
 *   PUT    /ecn/:id                      Update ECN description or scope
 *   POST   /ecn/:id/approve             Add an approver signature
 *   PUT    /ecn/:id/approvals/:appId     Update approver decision (approve/reject)
 *
 *   Capital Project Tracker
 *   GET    /projects                     List capital projects (active/completed)
 *   GET    /projects/:id                 Single project with milestones
 *   POST   /projects                     Create a new capital project
 *   PUT    /projects/:id                 Update project details or budget
 *   POST   /projects/:id/milestones      Add a milestone
 *   PUT    /projects/:id/milestones/:mid Update milestone completion status
 *
 *   Lubrication Management
 *   GET    /lube/routes                  List all lube routes
 *   GET    /lube/routes/:id              Single route with lube points
 *   POST   /lube/routes                  Create a lube route
 *   POST   /lube/routes/:id/points       Add a lube point to a route
 *   PUT    /lube/routes/:id              Update route metadata
 *   PUT    /lube/routes/:routeId/points/:pointId  Update a lube point
 *   POST   /lube/routes/:id/complete     Record a route completion event
 *   GET    /lube/due                     Assets with lube intervals coming due
 *
 *   Oil Analysis
 *   GET    /oil-analysis                 List oil sample submissions
 *   GET    /oil-analysis/:id             Single sample with lab results
 *   POST   /oil-analysis                 Submit a new oil sample
 *   POST   /oil-analysis/:id/results     Record lab results for a sample
 *   PUT    /oil-analysis/:id             Update sample metadata
 *   PUT    /oil-analysis/:sampleId/results/:resId  Update a result record
 *   GET    /oil-analysis/alerts/active   Samples with out-of-spec results requiring action
 *
 *   Reference Data
 *   GET    /constants                    FMEA severity/occurrence/detection scale definitions
 *
 * RPN SCORING: Risk Priority Number = Severity × Occurrence × Detection (1–10 each).
 *   RPN ≥ 200 triggers a mandatory corrective action workflow.
 *   RPN ≥ 125 generates a high-priority FMEA alert.
 *
 * REPAIR vs. REPLACE ALGORITHM:
 *   Cost Ratio = RepairCost / ReplacementCost.
 *   If ratio > 0.5 AND asset age > 80% of useful life → Recommend Replace.
 *   Result stored with recommendation text and net-present-value comparison.
 *
 * ECN APPROVAL CHAIN: ECNs require sign-off from Engineering + Maintenance Manager.
 *   Status lifecycle: Draft → Pending Approval → Approved → Implemented → Closed.
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('../logistics_db');

// ══════════════════════════════════════════════════════════════════
// TABLE INITIALIZATION
// ══════════════════════════════════════════════════════════════════
function initEngineeringTables() {
    logisticsDb.exec(`
        -- RCA
        CREATE TABLE IF NOT EXISTS rca_investigations (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            Title TEXT NOT NULL,
            IncidentDate TEXT,
            AssetID TEXT,
            WorkOrderID TEXT,
            PlantID TEXT,
            Investigator TEXT,
            Status TEXT DEFAULT 'Open',
            Summary TEXT,
            RootCause TEXT,
            CorrectiveAction TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS rca_why_steps (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            RCAID INTEGER NOT NULL,
            StepNumber INTEGER NOT NULL,
            Question TEXT,
            Answer TEXT,
            EvidenceNotes TEXT,
            FOREIGN KEY (RCAID) REFERENCES rca_investigations(ID)
        );
        CREATE TABLE IF NOT EXISTS rca_fishbone (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            RCAID INTEGER NOT NULL,
            Category TEXT NOT NULL,
            Cause TEXT NOT NULL,
            SubCause TEXT,
            FOREIGN KEY (RCAID) REFERENCES rca_investigations(ID)
        );

        -- FMEA
        CREATE TABLE IF NOT EXISTS fmea_worksheets (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            Title TEXT NOT NULL,
            AssetID TEXT,
            SystemComponent TEXT,
            PlantID TEXT,
            CreatedBy TEXT,
            Status TEXT DEFAULT 'Draft',
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS fmea_modes (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            WorksheetID INTEGER NOT NULL,
            FailureMode TEXT NOT NULL,
            FailureEffect TEXT,
            FailureCause TEXT,
            Severity INTEGER DEFAULT 1,
            Occurrence INTEGER DEFAULT 1,
            Detection INTEGER DEFAULT 1,
            RPN INTEGER DEFAULT 1,
            RecommendedAction TEXT,
            ActionOwner TEXT,
            ActionDueDate TEXT,
            ActionStatus TEXT DEFAULT 'Open',
            RevisedSeverity INTEGER,
            RevisedOccurrence INTEGER,
            RevisedDetection INTEGER,
            RevisedRPN INTEGER,
            FOREIGN KEY (WorksheetID) REFERENCES fmea_worksheets(ID)
        );

        -- Repair vs Replace
        CREATE TABLE IF NOT EXISTS repair_replace_analyses (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            AssetID TEXT,
            Title TEXT NOT NULL,
            CurrentAge REAL,
            UsefulLife REAL,
            ReplacementCost REAL,
            AnnualRepairCost REAL,
            RepairCostTrend REAL DEFAULT 0,
            DowntimeCostPerHour REAL DEFAULT 0,
            AvgDowntimeHours REAL DEFAULT 0,
            BreakEvenYear REAL,
            Recommendation TEXT,
            AnalyzedBy TEXT,
            PlantID TEXT,
            Notes TEXT,
            CreatedAt TEXT DEFAULT (datetime('now'))
        );

        -- ECN
        CREATE TABLE IF NOT EXISTS engineering_changes (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            ECNNumber TEXT UNIQUE,
            Title TEXT NOT NULL,
            Description TEXT,
            AssetID TEXT,
            ChangeType TEXT DEFAULT 'Design',
            BeforeSpec TEXT,
            AfterSpec TEXT,
            Justification TEXT,
            RequestedBy TEXT,
            Status TEXT DEFAULT 'Draft',
            PlantID TEXT,
            ImplementedDate TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS ecn_approvals (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            ECNID INTEGER NOT NULL,
            ApproverName TEXT NOT NULL,
            ApproverRole TEXT,
            Decision TEXT,
            Comments TEXT,
            DecisionDate TEXT,
            FOREIGN KEY (ECNID) REFERENCES engineering_changes(ID)
        );

        -- Capital Projects
        CREATE TABLE IF NOT EXISTS capital_projects (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            ProjectNumber TEXT UNIQUE,
            Title TEXT NOT NULL,
            Description TEXT,
            PlantID TEXT,
            Category TEXT DEFAULT 'New Equipment',
            Budget REAL DEFAULT 0,
            ActualSpend REAL DEFAULT 0,
            StartDate TEXT,
            TargetEndDate TEXT,
            ActualEndDate TEXT,
            Status TEXT DEFAULT 'Planning',
            ProjectManager TEXT,
            Sponsor TEXT,
            ROIEstimate REAL,
            Notes TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS project_milestones (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            ProjectID INTEGER NOT NULL,
            Title TEXT NOT NULL,
            DueDate TEXT,
            CompletedDate TEXT,
            Status TEXT DEFAULT 'Pending',
            Notes TEXT,
            FOREIGN KEY (ProjectID) REFERENCES capital_projects(ID)
        );

        -- Lubrication
        CREATE TABLE IF NOT EXISTS lube_routes (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            RouteName TEXT NOT NULL,
            Description TEXT,
            PlantID TEXT,
            Frequency TEXT DEFAULT 'Weekly',
            LastCompleted TEXT,
            NextDue TEXT,
            AssignedTo TEXT,
            Active INTEGER DEFAULT 1,
            CreatedAt TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS lube_points (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            RouteID INTEGER NOT NULL,
            AssetID TEXT,
            PointDescription TEXT NOT NULL,
            LubeType TEXT,
            Quantity REAL,
            Unit TEXT DEFAULT 'oz',
            Method TEXT DEFAULT 'Grease Gun',
            IntervalHours INTEGER,
            Notes TEXT,
            FOREIGN KEY (RouteID) REFERENCES lube_routes(ID)
        );
        CREATE TABLE IF NOT EXISTS lube_records (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PointID INTEGER NOT NULL,
            RouteID INTEGER NOT NULL,
            CompletedDate TEXT DEFAULT (datetime('now')),
            CompletedBy TEXT,
            QuantityUsed REAL,
            Condition TEXT DEFAULT 'Normal',
            Notes TEXT,
            FOREIGN KEY (PointID) REFERENCES lube_points(ID),
            FOREIGN KEY (RouteID) REFERENCES lube_routes(ID)
        );

        -- Oil Analysis
        CREATE TABLE IF NOT EXISTS oil_analysis_samples (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            AssetID TEXT,
            SampleDate TEXT NOT NULL DEFAULT (datetime('now')),
            SamplePoint TEXT,
            OilType TEXT,
            OilAgeHours REAL,
            LabName TEXT,
            LabSampleNumber TEXT,
            SampledBy TEXT,
            PlantID TEXT,
            OverallStatus TEXT DEFAULT 'Pending',
            Notes TEXT,
            CreatedAt TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS oil_analysis_results (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            SampleID INTEGER NOT NULL,
            Parameter TEXT NOT NULL,
            Value REAL,
            Unit TEXT,
            LimitValue REAL,
            Status TEXT DEFAULT 'Normal',
            Notes TEXT,
            FOREIGN KEY (SampleID) REFERENCES oil_analysis_samples(ID)
        );
    `);
    console.log('[ENGINEERING] All tables initialized');
}
initEngineeringTables();

// ══════════════════════════════════════════════════════════════════
// FEATURE 20: ROOT CAUSE ANALYSIS (RCA)
// ══════════════════════════════════════════════════════════════════
const FISHBONE_CATEGORIES = ['Man', 'Machine', 'Method', 'Material', 'Measurement', 'Environment'];

router.get('/rca', (req, res) => {
    try {
        const { status, search } = req.query;
        const plant = req.query.plant || req.headers['x-plant-id'];
        let sql = 'SELECT * FROM rca_investigations WHERE 1=1';
        const p = [];
        if (plant) { sql += ' AND PlantID = ?'; p.push(plant); }
        if (status) { sql += ' AND Status = ?'; p.push(status); }
        if (search) { sql += ' AND (Title LIKE ? OR Summary LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
        sql += ' ORDER BY IncidentDate DESC, CreatedAt DESC LIMIT 100';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch RCAs' }); }
});

router.get('/rca/:id', (req, res) => {
    try {
        const rca = logisticsDb.prepare('SELECT * FROM rca_investigations WHERE ID = ?').get(req.params.id);
        if (!rca) return res.status(404).json({ error: 'RCA not found' });
        const whySteps = logisticsDb.prepare('SELECT * FROM rca_why_steps WHERE RCAID = ? ORDER BY StepNumber').all(rca.ID);
        const fishbone = logisticsDb.prepare('SELECT * FROM rca_fishbone WHERE RCAID = ? ORDER BY Category, ID').all(rca.ID);
        res.json({ rca, whySteps, fishbone });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch RCA' }); }
});

router.post('/rca', (req, res) => {
    try {
        const { title, incidentDate, assetId, workOrderId, plantId, investigator } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });
        const r = logisticsDb.prepare('INSERT INTO rca_investigations (Title, IncidentDate, AssetID, WorkOrderID, PlantID, Investigator) VALUES (?,?,?,?,?,?)').run(title, incidentDate || null, assetId || null, workOrderId || null, plantId || null, investigator || null);
        // Pre-populate 5 Why steps
        const ins = logisticsDb.prepare('INSERT INTO rca_why_steps (RCAID, StepNumber, Question) VALUES (?, ?, ?)');
        for (let i = 1; i <= 5; i++) ins.run(r.lastInsertRowid, i, `Why #${i}?`);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to create RCA' }); }
});

router.put('/rca/:id', (req, res) => {
    try {
        const allowed = ['Title','Status','Summary','RootCause','CorrectiveAction','Investigator'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        if (f.length === 0) return res.json({ success: true });
        f.push("UpdatedAt=datetime('now')"); v.push(req.params.id);
        logisticsDb.prepare(`UPDATE rca_investigations SET ${f.join(',')} WHERE ID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update RCA' }); }
});

router.post('/rca/:id/why', (req, res) => {
    try {
        const { stepNumber, question, answer, evidenceNotes } = req.body;
        if (!stepNumber || stepNumber < 1 || stepNumber > 5) return res.status(400).json({ error: 'Step must be 1-5' });
        logisticsDb.prepare('UPDATE rca_why_steps SET Question=?, Answer=?, EvidenceNotes=? WHERE RCAID=? AND StepNumber=?').run(question || `Why #${stepNumber}?`, answer || null, evidenceNotes || null, req.params.id, stepNumber);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update why step' }); }
});

router.post('/rca/:id/fishbone', (req, res) => {
    try {
        const { category, cause, subCause } = req.body;
        if (!category || !cause) return res.status(400).json({ error: 'Category and cause required' });
        if (!FISHBONE_CATEGORIES.includes(category)) return res.status(400).json({ error: `Invalid category. Use: ${FISHBONE_CATEGORIES.join(', ')}` });
        const r = logisticsDb.prepare('INSERT INTO rca_fishbone (RCAID, Category, Cause, SubCause) VALUES (?,?,?,?)').run(req.params.id, category, cause, subCause || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to add fishbone cause' }); }
});

router.delete('/rca/:id/fishbone/:causeId', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM rca_fishbone WHERE ID=? AND RCAID=?').run(req.params.causeId, req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to remove cause' }); }
});

// ══════════════════════════════════════════════════════════════════
// FEATURE 21: FMEA (Failure Mode & Effects Analysis)
// ══════════════════════════════════════════════════════════════════

router.get('/fmea', (req, res) => {
    try {
        const { status, search } = req.query;
        const plant = req.query.plant || req.headers['x-plant-id'];
        let sql = 'SELECT w.*, COUNT(m.ID) as modeCount, MAX(m.RPN) as maxRPN FROM fmea_worksheets w LEFT JOIN fmea_modes m ON w.ID = m.WorksheetID WHERE 1=1';
        const p = [];
        if (plant) { sql += ' AND w.PlantID = ?'; p.push(plant); }
        if (status) { sql += ' AND w.Status = ?'; p.push(status); }
        if (search) { sql += ' AND w.Title LIKE ?'; p.push(`%${search}%`); }
        sql += ' GROUP BY w.ID ORDER BY w.CreatedAt DESC';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch FMEA worksheets' }); }
});

router.get('/fmea/:id', (req, res) => {
    try {
        const ws = logisticsDb.prepare('SELECT * FROM fmea_worksheets WHERE ID=?').get(req.params.id);
        if (!ws) return res.status(404).json({ error: 'FMEA worksheet not found' });
        const modes = logisticsDb.prepare('SELECT * FROM fmea_modes WHERE WorksheetID=? ORDER BY RPN DESC').all(ws.ID);
        res.json({ worksheet: ws, modes });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch FMEA' }); }
});

router.post('/fmea', (req, res) => {
    try {
        const { title, assetId, systemComponent, plantId, createdBy } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });
        const r = logisticsDb.prepare('INSERT INTO fmea_worksheets (Title, AssetID, SystemComponent, PlantID, CreatedBy) VALUES (?,?,?,?,?)').run(title, assetId || null, systemComponent || null, plantId || null, createdBy || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to create FMEA' }); }
});

router.post('/fmea/:id/modes', (req, res) => {
    try {
        const { failureMode, failureEffect, failureCause, severity, occurrence, detection, recommendedAction, actionOwner, actionDueDate } = req.body;
        if (!failureMode) return res.status(400).json({ error: 'Failure mode is required' });
        const s = Math.min(10, Math.max(1, parseInt(severity) || 1));
        const o = Math.min(10, Math.max(1, parseInt(occurrence) || 1));
        const d = Math.min(10, Math.max(1, parseInt(detection) || 1));
        const rpn = s * o * d;
        const r = logisticsDb.prepare('INSERT INTO fmea_modes (WorksheetID, FailureMode, FailureEffect, FailureCause, Severity, Occurrence, Detection, RPN, RecommendedAction, ActionOwner, ActionDueDate) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(req.params.id, failureMode, failureEffect || null, failureCause || null, s, o, d, rpn, recommendedAction || null, actionOwner || null, actionDueDate || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid, rpn });
    } catch (err) { res.status(500).json({ error: 'Failed to add failure mode' }); }
});

router.put('/fmea/:id/modes/:modeId', (req, res) => {
    try {
        const allowed = ['FailureMode','FailureEffect','FailureCause','Severity','Occurrence','Detection','RecommendedAction','ActionOwner','ActionDueDate','ActionStatus','RevisedSeverity','RevisedOccurrence','RevisedDetection'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        // Auto-calc RPN
        const current = logisticsDb.prepare('SELECT Severity, Occurrence, Detection FROM fmea_modes WHERE ID=?').get(req.params.modeId);
        const s = parseInt(req.body.Severity) || current?.Severity || 1;
        const o = parseInt(req.body.Occurrence) || current?.Occurrence || 1;
        const d = parseInt(req.body.Detection) || current?.Detection || 1;
        f.push('RPN=?'); v.push(s * o * d);
        // Revised RPN
        if (req.body.RevisedSeverity || req.body.RevisedOccurrence || req.body.RevisedDetection) {
            const rs = parseInt(req.body.RevisedSeverity) || current?.Severity || 1;
            const ro = parseInt(req.body.RevisedOccurrence) || current?.Occurrence || 1;
            const rd = parseInt(req.body.RevisedDetection) || current?.Detection || 1;
            f.push('RevisedRPN=?'); v.push(rs * ro * rd);
        }
        v.push(req.params.modeId, req.params.id);
        logisticsDb.prepare(`UPDATE fmea_modes SET ${f.join(',')} WHERE ID=? AND WorksheetID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update mode' }); }
});

router.delete('/fmea/:id/modes/:modeId', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM fmea_modes WHERE ID=? AND WorksheetID=?').run(req.params.modeId, req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to delete mode' }); }
});

// ══════════════════════════════════════════════════════════════════
// FEATURE 22: REPAIR VS. REPLACE CALCULATOR
// ══════════════════════════════════════════════════════════════════

router.post('/repair-replace', (req, res) => {
    try {
        const { assetId, title, currentAge, usefulLife, replacementCost, annualRepairCost, repairCostTrend, downtimeCostPerHour, avgDowntimeHours, analyzedBy, plantId, notes } = req.body;
        if (!title || !replacementCost || !annualRepairCost) return res.status(400).json({ error: 'Title, replacement cost, and annual repair cost required' });

        const rc = parseFloat(replacementCost);
        const arc = parseFloat(annualRepairCost);
        const trend = parseFloat(repairCostTrend) || 5; // % annual increase
        const dtCost = parseFloat(downtimeCostPerHour) || 0;
        const dtHrs = parseFloat(avgDowntimeHours) || 0;
        const age = parseFloat(currentAge) || 0;
        const life = parseFloat(usefulLife) || 20;

        // Calculate break-even: when cumulative future repair costs exceed replacement
        let cumRepair = 0;
        let breakEvenYear = null;
        for (let y = 1; y <= 20; y++) {
            const yearCost = arc * Math.pow(1 + trend / 100, y) + (dtCost * dtHrs * (1 + y * 0.1));
            cumRepair += yearCost;
            if (cumRepair >= rc && !breakEvenYear) {
                breakEvenYear = y;
            }
        }

        const remainingLife = Math.max(0, life - age);
        let recommendation;
        if (!breakEvenYear || breakEvenYear > remainingLife) {
            recommendation = 'REPAIR — Repair costs remain below replacement cost within useful life';
        } else if (breakEvenYear <= 2) {
            recommendation = 'REPLACE — Repair costs will exceed replacement within 2 years';
        } else if (breakEvenYear <= 5) {
            recommendation = 'PLAN REPLACEMENT — Break-even within 5 years, begin budgeting';
        } else {
            recommendation = 'REPAIR — Break-even is beyond 5 years';
        }

        const r = logisticsDb.prepare('INSERT INTO repair_replace_analyses (AssetID, Title, CurrentAge, UsefulLife, ReplacementCost, AnnualRepairCost, RepairCostTrend, DowntimeCostPerHour, AvgDowntimeHours, BreakEvenYear, Recommendation, AnalyzedBy, PlantID, Notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(assetId || null, title, age, life, rc, arc, trend, dtCost, dtHrs, breakEvenYear, recommendation, analyzedBy || null, plantId || null, notes || null);

        res.status(201).json({ success: true, id: r.lastInsertRowid, breakEvenYear, recommendation });
    } catch (err) { res.status(500).json({ error: 'Failed to run analysis: ' + err.message }); }
});

router.get('/repair-replace', (req, res) => {
    try {
        const plant = req.query.plant || req.headers['x-plant-id'];
        let sql = 'SELECT * FROM repair_replace_analyses WHERE 1=1';
        const p = [];
        if (plant) { sql += ' AND PlantID = ?'; p.push(plant); }
        sql += ' ORDER BY CreatedAt DESC LIMIT 50';
        res.json(logisticsDb.prepare(sql).all(...p));
    }
    catch (err) { res.status(500).json({ error: 'Failed to fetch analyses' }); }
});

router.get('/repair-replace/:id', (req, res) => {
    try {
        const a = logisticsDb.prepare('SELECT * FROM repair_replace_analyses WHERE ID=?').get(req.params.id);
        if (!a) return res.status(404).json({ error: 'Analysis not found' });
        res.json(a);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch analysis' }); }
});

router.put('/repair-replace/:id', (req, res) => {
    try {
        const allowed = ['Title','AssetID','CurrentAge','UsefulLife','ReplacementCost','AnnualRepairCost','RepairCostTrend','DowntimeCostPerHour','AvgDowntimeHours','Recommendation','AnalyzedBy','Notes'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        if (f.length === 0) return res.json({ success: true });
        v.push(req.params.id);
        logisticsDb.prepare(`UPDATE repair_replace_analyses SET ${f.join(',')} WHERE ID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update analysis' }); }
});

// ══════════════════════════════════════════════════════════════════
// FEATURE 23: ENGINEERING CHANGE NOTICE (ECN)
// ══════════════════════════════════════════════════════════════════

function nextECN() {
    const year = new Date().getFullYear();
    const last = logisticsDb.prepare("SELECT ECNNumber FROM engineering_changes WHERE ECNNumber LIKE ? ORDER BY ID DESC LIMIT 1").get(`ECN-${year}-%`);
    if (last) { const n = parseInt(last.ECNNumber.split('-')[2]) + 1; return `ECN-${year}-${String(n).padStart(4, '0')}`; }
    return `ECN-${year}-0001`;
}

router.get('/ecn', (req, res) => {
    try {
        const { status, search } = req.query;
        const plant = req.query.plant || req.headers['x-plant-id'];
        let sql = 'SELECT * FROM engineering_changes WHERE 1=1';
        const p = [];
        if (status) { sql += ' AND Status=?'; p.push(status); }
        if (plant) { sql += ' AND PlantID=?'; p.push(plant); }
        if (search) { sql += ' AND (Title LIKE ? OR ECNNumber LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
        sql += ' ORDER BY CreatedAt DESC LIMIT 100';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch ECNs' }); }
});

router.get('/ecn/:id', (req, res) => {
    try {
        const ecn = logisticsDb.prepare('SELECT * FROM engineering_changes WHERE ID=?').get(req.params.id);
        if (!ecn) return res.status(404).json({ error: 'ECN not found' });
        const approvals = logisticsDb.prepare('SELECT * FROM ecn_approvals WHERE ECNID=? ORDER BY DecisionDate DESC').all(ecn.ID);
        res.json({ ecn, approvals });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch ECN' }); }
});

router.post('/ecn', (req, res) => {
    try {
        const { title, description, assetId, changeType, beforeSpec, afterSpec, justification, requestedBy, plantId } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });
        const ecnNumber = nextECN();
        const r = logisticsDb.prepare('INSERT INTO engineering_changes (ECNNumber, Title, Description, AssetID, ChangeType, BeforeSpec, AfterSpec, Justification, RequestedBy, PlantID) VALUES (?,?,?,?,?,?,?,?,?,?)').run(ecnNumber, title, description || null, assetId || null, changeType || 'Design', beforeSpec || null, afterSpec || null, justification || null, requestedBy || null, plantId || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid, ecnNumber });
    } catch (err) { res.status(500).json({ error: 'Failed to create ECN' }); }
});

router.put('/ecn/:id', (req, res) => {
    try {
        const allowed = ['Title','Description','ChangeType','BeforeSpec','AfterSpec','Justification','Status','ImplementedDate'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        if (f.length === 0) return res.json({ success: true });
        f.push("UpdatedAt=datetime('now')"); v.push(req.params.id);
        logisticsDb.prepare(`UPDATE engineering_changes SET ${f.join(',')} WHERE ID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update ECN' }); }
});

router.post('/ecn/:id/approve', (req, res) => {
    try {
        const { approverName, approverRole, decision, comments } = req.body;
        if (!approverName || !decision) return res.status(400).json({ error: 'Approver name and decision required' });
        logisticsDb.prepare("INSERT INTO ecn_approvals (ECNID, ApproverName, ApproverRole, Decision, Comments, DecisionDate) VALUES (?,?,?,?,?,datetime('now'))").run(req.params.id, approverName, approverRole || null, decision, comments || null);
        // Auto-update ECN status
        if (decision === 'Approved') {
            const pending = logisticsDb.prepare("SELECT COUNT(*) as c FROM ecn_approvals WHERE ECNID=? AND Decision='Rejected'").get(req.params.id);
            if (pending.c === 0) logisticsDb.prepare("UPDATE engineering_changes SET Status='Approved', UpdatedAt=datetime('now') WHERE ID=?").run(req.params.id);
        } else if (decision === 'Rejected') {
            logisticsDb.prepare("UPDATE engineering_changes SET Status='Rejected', UpdatedAt=datetime('now') WHERE ID=?").run(req.params.id);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to record approval' }); }
});

router.put('/ecn/:id/approvals/:appId', (req, res) => {
    try {
        const { ApproverName, Status, Comments, DecisionDate } = req.body;
        const f = []; const v = [];
        if (ApproverName !== undefined) { f.push('ApproverName=?'); v.push(ApproverName); }
        if (Status !== undefined) { f.push('Decision=?'); v.push(Status); }
        if (Comments !== undefined) { f.push('Comments=?'); v.push(Comments); }
        if (DecisionDate !== undefined) { f.push('DecisionDate=?'); v.push(DecisionDate); }
        if (f.length === 0) return res.json({ success: true });
        v.push(req.params.appId, req.params.id);
        logisticsDb.prepare(`UPDATE ecn_approvals SET ${f.join(',')} WHERE ID=? AND ECNID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update approval' }); }
});

// ══════════════════════════════════════════════════════════════════
// FEATURE 24: CAPITAL PROJECT TRACKER
// ══════════════════════════════════════════════════════════════════

function nextProjectNumber() {
    const year = new Date().getFullYear();
    const last = logisticsDb.prepare("SELECT ProjectNumber FROM capital_projects WHERE ProjectNumber LIKE ? ORDER BY ID DESC LIMIT 1").get(`CP-${year}-%`);
    if (last) { const n = parseInt(last.ProjectNumber.split('-')[2]) + 1; return `CP-${year}-${String(n).padStart(3, '0')}`; }
    return `CP-${year}-001`;
}

router.get('/projects', (req, res) => {
    try {
        const { status } = req.query;
        const plant = req.query.plant || req.headers['x-plant-id'];
        let sql = 'SELECT * FROM capital_projects WHERE 1=1';
        const p = [];
        if (status) { sql += ' AND Status=?'; p.push(status); }
        if (plant) { sql += ' AND PlantID=?'; p.push(plant); }
        sql += ' ORDER BY StartDate DESC, CreatedAt DESC';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch projects' }); }
});

router.get('/projects/:id', (req, res) => {
    try {
        const proj = logisticsDb.prepare('SELECT * FROM capital_projects WHERE ID=?').get(req.params.id);
        if (!proj) return res.status(404).json({ error: 'Project not found' });
        const milestones = logisticsDb.prepare('SELECT * FROM project_milestones WHERE ProjectID=? ORDER BY DueDate ASC').all(proj.ID);
        const budgetUsed = proj.Budget > 0 ? Math.round((proj.ActualSpend / proj.Budget) * 100) : 0;
        res.json({ project: proj, milestones, budgetUsed });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch project' }); }
});

router.post('/projects', (req, res) => {
    try {
        const { title, description, plantId, category, budget, startDate, targetEndDate, projectManager, sponsor, roiEstimate, notes } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });
        const pn = nextProjectNumber();
        const r = logisticsDb.prepare('INSERT INTO capital_projects (ProjectNumber, Title, Description, PlantID, Category, Budget, StartDate, TargetEndDate, ProjectManager, Sponsor, ROIEstimate, Notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(pn, title, description || null, plantId || null, category || 'New Equipment', budget || 0, startDate || null, targetEndDate || null, projectManager || null, sponsor || null, roiEstimate || null, notes || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid, projectNumber: pn });
    } catch (err) { res.status(500).json({ error: 'Failed to create project' }); }
});

router.put('/projects/:id', (req, res) => {
    try {
        const allowed = ['Title','Description','Category','Budget','ActualSpend','StartDate','TargetEndDate','ActualEndDate','Status','ProjectManager','Sponsor','ROIEstimate','Notes'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        if (f.length === 0) return res.json({ success: true });
        f.push("UpdatedAt=datetime('now')"); v.push(req.params.id);
        logisticsDb.prepare(`UPDATE capital_projects SET ${f.join(',')} WHERE ID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update project' }); }
});

router.post('/projects/:id/milestones', (req, res) => {
    try {
        const { title, dueDate, notes } = req.body;
        if (!title) return res.status(400).json({ error: 'Milestone title required' });
        const r = logisticsDb.prepare('INSERT INTO project_milestones (ProjectID, Title, DueDate, Notes) VALUES (?,?,?,?)').run(req.params.id, title, dueDate || null, notes || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to add milestone' }); }
});

router.put('/projects/:id/milestones/:mid', (req, res) => {
    try {
        const { status, completedDate, notes } = req.body;
        const f = []; const v = [];
        if (status) { f.push('Status=?'); v.push(status); }
        if (completedDate) { f.push('CompletedDate=?'); v.push(completedDate); }
        if (status === 'Complete' && !completedDate) { f.push("CompletedDate=date('now')"); }
        if (notes !== undefined) { f.push('Notes=?'); v.push(notes); }
        v.push(req.params.mid, req.params.id);
        logisticsDb.prepare(`UPDATE project_milestones SET ${f.join(',')} WHERE ID=? AND ProjectID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update milestone' }); }
});

// ══════════════════════════════════════════════════════════════════
// FEATURE 25: LUBRICATION MANAGEMENT
// ══════════════════════════════════════════════════════════════════

router.get('/lube/routes', (req, res) => {
    try {
        const plant = req.query.plant || req.headers['x-plant-id'];
        let sql = "SELECT r.*, COUNT(p.ID) as pointCount FROM lube_routes r LEFT JOIN lube_points p ON r.ID=p.RouteID WHERE r.Active=1";
        const p = [];
        if (plant) { sql += ' AND r.PlantID = ?'; p.push(plant); }
        sql += " GROUP BY r.ID ORDER BY r.NextDue ASC";
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch lube routes' }); }
});

router.get('/lube/routes/:id', (req, res) => {
    try {
        const route = logisticsDb.prepare('SELECT * FROM lube_routes WHERE ID=?').get(req.params.id);
        if (!route) return res.status(404).json({ error: 'Route not found' });
        const points = logisticsDb.prepare('SELECT * FROM lube_points WHERE RouteID=? ORDER BY ID').all(route.ID);
        const recentRecords = logisticsDb.prepare('SELECT lr.*, lp.PointDescription FROM lube_records lr JOIN lube_points lp ON lr.PointID=lp.ID WHERE lr.RouteID=? ORDER BY lr.CompletedDate DESC LIMIT 50').all(route.ID);
        res.json({ route, points, recentRecords });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch route' }); }
});

router.post('/lube/routes', (req, res) => {
    try {
        const { routeName, description, plantId, frequency, assignedTo } = req.body;
        if (!routeName) return res.status(400).json({ error: 'Route name required' });
        const freqDays = { Daily: 1, Weekly: 7, Biweekly: 14, Monthly: 30, Quarterly: 90 };
        const d = new Date(); d.setDate(d.getDate() + (freqDays[frequency] || 7)); const nextDue = d.toISOString().split('T')[0];
        const r = logisticsDb.prepare('INSERT INTO lube_routes (RouteName, Description, PlantID, Frequency, NextDue, AssignedTo) VALUES (?,?,?,?,?,?)').run(routeName, description || null, plantId || null, frequency || 'Weekly', nextDue, assignedTo || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to create route' }); }
});

router.post('/lube/routes/:id/points', (req, res) => {
    try {
        const { assetId, pointDescription, lubeType, quantity, unit, method, intervalHours, notes } = req.body;
        if (!pointDescription) return res.status(400).json({ error: 'Point description required' });
        const r = logisticsDb.prepare('INSERT INTO lube_points (RouteID, AssetID, PointDescription, LubeType, Quantity, Unit, Method, IntervalHours, Notes) VALUES (?,?,?,?,?,?,?,?,?)').run(req.params.id, assetId || null, pointDescription, lubeType || null, quantity || null, unit || 'oz', method || 'Grease Gun', intervalHours || null, notes || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to add lube point' }); }
});

router.put('/lube/routes/:id', (req, res) => {
    try {
        const { RouteName, Description, Frequency, AssignedTo } = req.body;
        const f = []; const v = [];
        if (RouteName !== undefined) { f.push('RouteName=?'); v.push(RouteName); }
        if (Description !== undefined) { f.push('Description=?'); v.push(Description); }
        if (Frequency !== undefined) { f.push('Frequency=?'); v.push(Frequency); }
        if (AssignedTo !== undefined) { f.push('AssignedTo=?'); v.push(AssignedTo); }
        if (f.length === 0) return res.json({ success: true });
        v.push(req.params.id);
        logisticsDb.prepare(`UPDATE lube_routes SET ${f.join(',')} WHERE ID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update route' }); }
});

router.put('/lube/routes/:routeId/points/:pointId', (req, res) => {
    try {
        const { PointDescription, LubeType, Quantity, Unit, Method, AssetID } = req.body;
        const f = []; const v = [];
        if (PointDescription !== undefined) { f.push('PointDescription=?'); v.push(PointDescription); }
        if (LubeType !== undefined) { f.push('LubeType=?'); v.push(LubeType); }
        if (Quantity !== undefined) { f.push('Quantity=?'); v.push(Quantity); }
        if (Unit !== undefined) { f.push('Unit=?'); v.push(Unit); }
        if (Method !== undefined) { f.push('Method=?'); v.push(Method); }
        if (AssetID !== undefined) { f.push('AssetID=?'); v.push(AssetID); }
        if (f.length === 0) return res.json({ success: true });
        v.push(req.params.pointId, req.params.routeId);
        logisticsDb.prepare(`UPDATE lube_points SET ${f.join(',')} WHERE ID=? AND RouteID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update lube point' }); }
});

router.post('/lube/routes/:id/complete', (req, res) => {
    try {
        const { completedBy, pointResults } = req.body;
        if (!completedBy) return res.status(400).json({ error: 'Completed by is required' });
        const points = logisticsDb.prepare('SELECT * FROM lube_points WHERE RouteID=?').all(req.params.id);
        const ins = logisticsDb.prepare('INSERT INTO lube_records (PointID, RouteID, CompletedBy, QuantityUsed, Condition, Notes) VALUES (?,?,?,?,?,?)');
        const results = pointResults || {};
        points.forEach(pt => {
            const pr = results[pt.ID] || {};
            ins.run(pt.ID, req.params.id, completedBy, pr.quantityUsed || pt.Quantity || null, pr.condition || 'Normal', pr.notes || null);
        });
        // Update route
        const route = logisticsDb.prepare('SELECT Frequency FROM lube_routes WHERE ID=?').get(req.params.id);
        const freqDays = { Daily: 1, Weekly: 7, Biweekly: 14, Monthly: 30, Quarterly: 90 };
        const d = new Date(); d.setDate(d.getDate() + (freqDays[route?.Frequency] || 7)); const nextDue = d.toISOString().split('T')[0];
        logisticsDb.prepare("UPDATE lube_routes SET LastCompleted=date('now'), NextDue=? WHERE ID=?").run(nextDue, req.params.id);
        res.json({ success: true, pointsLogged: points.length, nextDue });
    } catch (err) { res.status(500).json({ error: 'Failed to complete route' }); }
});

router.get('/lube/due', (req, res) => {
    try {
        const due = logisticsDb.prepare("SELECT r.*, COUNT(p.ID) as pointCount FROM lube_routes r LEFT JOIN lube_points p ON r.ID=p.RouteID WHERE r.Active=1 AND (r.NextDue IS NULL OR r.NextDue <= date('now', '+7 days')) GROUP BY r.ID ORDER BY r.NextDue ASC").all();
        res.json(due);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch due routes' }); }
});

// ══════════════════════════════════════════════════════════════════
// FEATURE 26: OIL ANALYSIS INTEGRATION
// ══════════════════════════════════════════════════════════════════
const OIL_PARAMETERS = [
    { name: 'Iron (Fe)', unit: 'ppm', limit: 100 },
    { name: 'Copper (Cu)', unit: 'ppm', limit: 25 },
    { name: 'Lead (Pb)', unit: 'ppm', limit: 15 },
    { name: 'Tin (Sn)', unit: 'ppm', limit: 10 },
    { name: 'Aluminum (Al)', unit: 'ppm', limit: 25 },
    { name: 'Chromium (Cr)', unit: 'ppm', limit: 10 },
    { name: 'Silicon (Si)', unit: 'ppm', limit: 20 },
    { name: 'Sodium (Na)', unit: 'ppm', limit: 25 },
    { name: 'Potassium (K)', unit: 'ppm', limit: 15 },
    { name: 'Viscosity @ 40°C', unit: 'cSt', limit: null },
    { name: 'Viscosity @ 100°C', unit: 'cSt', limit: null },
    { name: 'TAN', unit: 'mgKOH/g', limit: 3.0 },
    { name: 'TBN', unit: 'mgKOH/g', limit: null },
    { name: 'Water', unit: 'ppm', limit: 500 },
    { name: 'Fuel Dilution', unit: '%', limit: 2.0 },
    { name: 'Particle Count', unit: 'ISO', limit: null },
];

router.get('/oil-analysis', (req, res) => {
    try {
        const { asset } = req.query;
        const plant = req.query.plant || req.headers['x-plant-id'];
        let sql = 'SELECT * FROM oil_analysis_samples WHERE 1=1';
        const p = [];
        if (asset) { sql += ' AND AssetID=?'; p.push(asset); }
        if (plant) { sql += ' AND PlantID=?'; p.push(plant); }
        sql += ' ORDER BY SampleDate DESC LIMIT 100';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch samples' }); }
});

router.get('/oil-analysis/:id', (req, res) => {
    try {
        const sample = logisticsDb.prepare('SELECT * FROM oil_analysis_samples WHERE ID=?').get(req.params.id);
        if (!sample) return res.status(404).json({ error: 'Sample not found' });
        const results = logisticsDb.prepare('SELECT * FROM oil_analysis_results WHERE SampleID=? ORDER BY ID').all(sample.ID);
        res.json({ sample, results });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch sample' }); }
});

router.post('/oil-analysis', (req, res) => {
    try {
        const { assetId, sampleDate, samplePoint, oilType, oilAgeHours, labName, labSampleNumber, sampledBy, plantId, notes } = req.body;
        if (!assetId) return res.status(400).json({ error: 'Asset ID required' });
        const r = logisticsDb.prepare('INSERT INTO oil_analysis_samples (AssetID, SampleDate, SamplePoint, OilType, OilAgeHours, LabName, LabSampleNumber, SampledBy, PlantID, Notes) VALUES (?,?,?,?,?,?,?,?,?,?)').run(assetId, sampleDate || new Date().toISOString().split('T')[0], samplePoint || null, oilType || null, oilAgeHours || null, labName || null, labSampleNumber || null, sampledBy || null, plantId || null, notes || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to create sample' }); }
});

router.post('/oil-analysis/:id/results', (req, res) => {
    try {
        const { results } = req.body; // Array of { parameter, value, unit, limitValue }
        if (!results || !Array.isArray(results)) return res.status(400).json({ error: 'Results array required' });
        const ins = logisticsDb.prepare('INSERT INTO oil_analysis_results (SampleID, Parameter, Value, Unit, LimitValue, Status) VALUES (?,?,?,?,?,?)');
        let criticalCount = 0, watchCount = 0;
        results.forEach(r => {
            let status = 'Normal';
            if (r.limitValue && r.value) {
                if (parseFloat(r.value) > parseFloat(r.limitValue) * 1.5) { status = 'Critical'; criticalCount++; }
                else if (parseFloat(r.value) > parseFloat(r.limitValue)) { status = 'Watch'; watchCount++; }
            }
            ins.run(req.params.id, r.parameter, r.value || null, r.unit || null, r.limitValue || null, status);
        });
        // Update overall sample status
        const overall = criticalCount > 0 ? 'Critical' : watchCount > 0 ? 'Watch' : 'Normal';
        logisticsDb.prepare('UPDATE oil_analysis_samples SET OverallStatus=? WHERE ID=?').run(overall, req.params.id);
        if (criticalCount > 0) console.log(`[OIL ANALYSIS] ⚠️ ${criticalCount} CRITICAL results for sample #${req.params.id}`);
        res.json({ success: true, resultsLogged: results.length, criticalCount, watchCount, overallStatus: overall });
    } catch (err) { res.status(500).json({ error: 'Failed to record results' }); }
});

router.put('/oil-analysis/:id', (req, res) => {
    try {
        const { SamplePoint, OilType, OilAgeHours, OverallStatus, Notes } = req.body;
        const f = []; const v = [];
        if (SamplePoint !== undefined) { f.push('SamplePoint=?'); v.push(SamplePoint); }
        if (OilType !== undefined) { f.push('OilType=?'); v.push(OilType); }
        if (OilAgeHours !== undefined) { f.push('OilAgeHours=?'); v.push(OilAgeHours); }
        if (OverallStatus !== undefined) { f.push('OverallStatus=?'); v.push(OverallStatus); }
        if (Notes !== undefined) { f.push('Notes=?'); v.push(Notes); }
        if (f.length === 0) return res.json({ success: true });
        v.push(req.params.id);
        logisticsDb.prepare(`UPDATE oil_analysis_samples SET ${f.join(',')} WHERE ID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update sample' }); }
});

router.put('/oil-analysis/:sampleId/results/:resId', (req, res) => {
    try {
        const { Parameter, Value, Unit, LimitValue, Status } = req.body;
        const f = []; const v = [];
        if (Parameter !== undefined) { f.push('Parameter=?'); v.push(Parameter); }
        if (Value !== undefined) { f.push('Value=?'); v.push(Value); }
        if (Unit !== undefined) { f.push('Unit=?'); v.push(Unit); }
        if (LimitValue !== undefined) { f.push('LimitValue=?'); v.push(LimitValue); }
        if (Status !== undefined) { f.push('Status=?'); v.push(Status); }
        if (f.length === 0) return res.json({ success: true });
        v.push(req.params.resId, req.params.sampleId);
        logisticsDb.prepare(`UPDATE oil_analysis_results SET ${f.join(',')} WHERE ID=? AND SampleID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update result' }); }
});

router.get('/oil-analysis/alerts/active', (req, res) => {
    try {
        const plant = req.query.plant || req.headers['x-plant-id'];
        let sql = `
            SELECT r.*, s.AssetID, s.SampleDate, s.OilType, s.PlantID
            FROM oil_analysis_results r
            JOIN oil_analysis_samples s ON r.SampleID = s.ID
            WHERE r.Status IN ('Critical', 'Watch')
        `;
        const p = [];
        if (plant) { sql += ' AND s.PlantID = ?'; p.push(plant); }
        sql += " ORDER BY CASE r.Status WHEN 'Critical' THEN 0 ELSE 1 END, s.SampleDate DESC LIMIT 50";
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch alerts' }); }
});

// ── Constants ───────────────────────────────────────────────────
router.get('/constants', (req, res) => {
    res.json({
        fishboneCategories: FISHBONE_CATEGORIES,
        oilParameters: OIL_PARAMETERS,
        changeTypes: ['Design', 'Process', 'Material', 'Specification', 'Software', 'Tooling'],
        projectCategories: ['New Equipment', 'Upgrade', 'Expansion', 'Renovation', 'Safety', 'Environmental', 'Automation', 'IT/Software'],
        projectStatuses: ['Planning', 'Approved', 'In Progress', 'Complete', 'On Hold', 'Cancelled'],
        lubeMethods: ['Grease Gun', 'Oil Can', 'Auto-Lube', 'Drain & Fill', 'Spray', 'Brush', 'Drip Oiler'],
        lubeFrequencies: ['Daily', 'Weekly', 'Biweekly', 'Monthly', 'Quarterly'],
    });
});

module.exports = router;
