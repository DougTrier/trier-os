// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Safety Incident Management API
 * ==========================================
 * Full OSHA-aligned safety incident lifecycle: reporting, investigation,
 * corrective actions, expense tracking, and dashboard analytics.
 * All data stored in trier_logistics.db so incidents are cross-plant.
 * Mounted at /api/safety-incidents in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /                       List incidents (filter: plant, status, type, severity, search)
 *   GET    /:id                    Single incident with all related actions + expenses
 *   POST   /                       Create incident (auto-generates INC-YYYY-NNNN number)
 *   PUT    /:id                    Update incident fields (investigation, closure, etc.)
 *   POST   /:id/actions            Add corrective or preventive action to an incident
 *   PUT    /actions/:actionId      Update action status/completion
 *   POST   /:id/expenses           Log a medical or remediation expense
 *   DELETE /expenses/:expenseId    Remove an expense record
 *   GET    /dashboard/stats        KPI rollup: total counts, OSHA recordables, open actions
 *   GET    /constants              Return all enums (types, severities, injury types, body parts)
 *
 * INCIDENT NUMBER FORMAT: INC-{YEAR}-{SEQ:4} — auto-incremented per calendar year.
 *   e.g. INC-2026-0001 is the first incident of 2026.
 *
 * INCIDENT TYPES: Near Miss | First Aid | Recordable Injury | Lost Time Injury |
 *   Property Damage | Environmental Release | Fire | Vehicle Incident |
 *   Slip/Trip/Fall | Electrical | Chemical Exposure | Confined Space | Other
 *
 * SEVERITY TIERS: Low → Medium → High → Critical
 *   Critical incidents auto-flag OSHARecordable and trigger immediate supervisor notification.
 *
 * TABLES:
 *   safety_incidents          — Primary incident record (injury details, investigation, WO link)
 *   safety_incident_actions   — Corrective/preventive actions with owner + due date
 *   safety_incident_expenses  — Medical bills, remediation costs tied to an incident
 *
 * CORRECTIVE WORK ORDERS: When a CorrectiveWOID is set on an incident, the incident
 * record links directly to that work order number for full traceability.
 *
 * ROOT CAUSE CATEGORIES: Unsafe Act | Unsafe Condition | Inadequate Training |
 *   Inadequate Procedure | Equipment Failure | PPE Not Used | PPE Inadequate |
 *   Housekeeping | Fatigue | Complacency | Design Deficiency |
 *   Communication Failure | Management System | Other
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('../logistics_db');

function initIncidentTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS safety_incidents (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            IncidentNumber TEXT UNIQUE,
            IncidentType TEXT DEFAULT 'Near Miss',
            Severity TEXT DEFAULT 'Low',
            Status TEXT DEFAULT 'Open',
            Title TEXT NOT NULL,
            Description TEXT,
            IncidentDate TEXT NOT NULL,
            IncidentTime TEXT,
            ReportedBy TEXT NOT NULL,
            ReportedDate TEXT DEFAULT (datetime('now')),
            PlantID TEXT,
            Location TEXT,
            Department TEXT,
            AssetID TEXT,
            InjuredPerson TEXT,
            InjuryType TEXT,
            BodyPart TEXT,
            FirstAidGiven INTEGER DEFAULT 0,
            MedicalTreatment INTEGER DEFAULT 0,
            LostTime INTEGER DEFAULT 0,
            LostDays INTEGER DEFAULT 0,
            OSHARecordable INTEGER DEFAULT 0,
            RootCause TEXT,
            ContributingFactors TEXT,
            CorrectiveAction TEXT,
            PreventiveAction TEXT,
            CorrectiveWOID TEXT,
            InvestigatedBy TEXT,
            InvestigationDate TEXT,
            InvestigationNotes TEXT,
            ClosedBy TEXT,
            ClosedDate TEXT,
            PhotoPaths TEXT,
            DirectCost REAL DEFAULT 0,
            IndirectCost REAL DEFAULT 0,
            Attachments TEXT,
            JobClassification TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS safety_incident_actions (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            IncidentID INTEGER NOT NULL,
            ActionType TEXT DEFAULT 'Corrective',
            Description TEXT NOT NULL,
            AssignedTo TEXT,
            DueDate TEXT,
            Status TEXT DEFAULT 'Open',
            CompletedDate TEXT,
            CompletedBy TEXT,
            Notes TEXT,
            FOREIGN KEY (IncidentID) REFERENCES safety_incidents(ID)
        );

        CREATE TABLE IF NOT EXISTS safety_incident_expenses (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            IncidentID INTEGER NOT NULL,
            ExpenseDate TEXT,
            ProviderName TEXT,
            BillNumber TEXT,
            Amount REAL DEFAULT 0,
            DateReceived TEXT,
            DatePaid TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(IncidentID) REFERENCES safety_incidents(ID) ON DELETE CASCADE
        );
    `);
    
    // ALTER TABLE for existing databases
    try { logisticsDb.prepare("ALTER TABLE safety_incidents ADD COLUMN DirectCost REAL DEFAULT 0").run(); } catch(e) {}
    try { logisticsDb.prepare("ALTER TABLE safety_incidents ADD COLUMN IndirectCost REAL DEFAULT 0").run(); } catch(e) {}
    try { logisticsDb.prepare("ALTER TABLE safety_incidents ADD COLUMN Attachments TEXT").run(); } catch(e) {}
    try { logisticsDb.prepare("ALTER TABLE safety_incidents ADD COLUMN JobClassification TEXT").run(); } catch(e) {}

    console.log('[SAFETY-INCIDENTS] Tables initialized');
}
initIncidentTables();

const INCIDENT_TYPES = ['Near Miss', 'First Aid', 'Recordable Injury', 'Lost Time Injury', 'Property Damage', 'Environmental Release', 'Fire', 'Vehicle Incident', 'Slip/Trip/Fall', 'Electrical', 'Chemical Exposure', 'Confined Space', 'Other'];
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const INJURY_TYPES = ['Cut/Laceration', 'Burn', 'Fracture', 'Strain/Sprain', 'Contusion/Bruise', 'Amputation', 'Chemical Burn', 'Inhalation', 'Electric Shock', 'Hearing Loss', 'Eye Injury', 'Heat Stress', 'Cold Stress', 'Other'];
const BODY_PARTS = ['Head', 'Eyes', 'Face', 'Neck', 'Shoulder', 'Arm', 'Elbow', 'Wrist', 'Hand', 'Finger(s)', 'Chest', 'Back (Upper)', 'Back (Lower)', 'Abdomen', 'Hip', 'Leg', 'Knee', 'Ankle', 'Foot', 'Toe(s)', 'Multiple', 'Other'];
const ROOT_CAUSES = ['Unsafe Act', 'Unsafe Condition', 'Inadequate Training', 'Inadequate Procedure', 'Equipment Failure', 'PPE Not Used', 'PPE Inadequate', 'Housekeeping', 'Fatigue', 'Complacency', 'Design Deficiency', 'Communication Failure', 'Management System', 'Other'];

// Generate incident number
function nextIncidentNumber() {
    const year = new Date().getFullYear();
    const last = logisticsDb.prepare("SELECT IncidentNumber FROM safety_incidents WHERE IncidentNumber LIKE ? ORDER BY ID DESC LIMIT 1").get(`INC-${year}-%`);
    if (last) {
        const num = parseInt(last.IncidentNumber.split('-')[2]) + 1;
        return `INC-${year}-${String(num).padStart(4, '0')}`;
    }
    return `INC-${year}-0001`;
}

// ── Incidents CRUD ──────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const { plant, status, type, severity, search, limit } = req.query;
        let sql = 'SELECT * FROM safety_incidents WHERE 1=1';
        const params = [];
        if (plant) { sql += ' AND PlantID = ?'; params.push(plant); }
        if (status) { sql += ' AND Status = ?'; params.push(status); }
        if (type) { sql += ' AND IncidentType = ?'; params.push(type); }
        if (severity) { sql += ' AND Severity = ?'; params.push(severity); }
        if (search) { sql += ' AND (Title LIKE ? OR Description LIKE ? OR IncidentNumber LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
        sql += ' ORDER BY IncidentDate DESC LIMIT ?';
        params.push(parseInt(limit) || 100);
        res.json(logisticsDb.prepare(sql).all(...params));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch incidents' }); }
});

router.get('/:id', (req, res) => {
    try {
        const incident = logisticsDb.prepare('SELECT * FROM safety_incidents WHERE ID = ?').get(req.params.id);
        if (!incident) return res.status(404).json({ error: 'Incident not found' });
        const actions = logisticsDb.prepare('SELECT * FROM safety_incident_actions WHERE IncidentID = ? ORDER BY DueDate ASC').all(incident.ID);
        const expenses = logisticsDb.prepare('SELECT * FROM safety_incident_expenses WHERE IncidentID = ? ORDER BY ExpenseDate ASC').all(incident.ID);
        
        // Sum expenses and sync to DirectCost
        const totalExp = expenses.reduce((s, e) => s + (e.Amount || 0), 0);
        if (totalExp !== incident.DirectCost) {
            logisticsDb.prepare('UPDATE safety_incidents SET DirectCost = ? WHERE ID = ?').run(totalExp, incident.ID);
            incident.DirectCost = totalExp;
        }

        res.json({ incident, actions, expenses });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch incident' }); }
});

router.post('/', (req, res) => {
    try {
        const { incidentType, severity, title, description, incidentDate, incidentTime, reportedBy, plantId, location, department, assetId, injuredPerson, injuryType, bodyPart, firstAidGiven, medicalTreatment, lostTime, lostDays, oshaRecordable, witnessNames, autoCreateWO, directCost, indirectCost, attachments, jobClassification } = req.body;
        if (!title || !reportedBy || !incidentDate) return res.status(400).json({ error: 'Title, reported by, and incident date are required' });

        const incidentNumber = nextIncidentNumber();
        const result = logisticsDb.prepare(`
            INSERT INTO safety_incidents (IncidentNumber, IncidentType, Severity, Title, Description, IncidentDate, IncidentTime, ReportedBy, PlantID, Location, Department, AssetID, InjuredPerson, InjuryType, BodyPart, FirstAidGiven, MedicalTreatment, LostTime, LostDays, OSHARecordable, WitnessNames, DirectCost, IndirectCost, Attachments, JobClassification)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(incidentNumber, incidentType || 'Near Miss', severity || 'Low', title, description || null, incidentDate, incidentTime || null, reportedBy, plantId || null, location || null, department || null, assetId || null, injuredPerson || null, injuryType || null, bodyPart || null, firstAidGiven ? 1 : 0, medicalTreatment ? 1 : 0, lostTime ? 1 : 0, lostDays || 0, oshaRecordable ? 1 : 0, witnessNames || null, directCost || 0, indirectCost || 0, attachments || null, jobClassification || null);

        // Auto-create corrective action placeholder
        if (autoCreateWO || severity === 'Critical' || severity === 'High') {
            logisticsDb.prepare('INSERT INTO safety_incident_actions (IncidentID, ActionType, Description, DueDate) VALUES (?, ?, ?, ?)').run(
                result.lastInsertRowid, 'Corrective',
                `Investigate and correct: ${title}`,
                new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
            );
        }

        try { logAudit(reportedBy, 'SAFETY_INCIDENT_REPORTED', plantId, { incidentNumber, type: incidentType, severity, title }); } catch(e) {}
        console.log(`[SAFETY] ⚠️ Incident ${incidentNumber} reported: ${title} (${severity})`);
        res.status(201).json({ success: true, id: result.lastInsertRowid, incidentNumber });
    } catch (err) { res.status(500).json({ error: 'Failed to report incident: ' }); }
});

router.put('/:id', (req, res) => {
    try {
        const allowed = ['IncidentType','Severity','Status','Title','Description','Location','Department','AssetID','RootCause','ContributingFactors','CorrectiveAction','PreventiveAction','CorrectiveWOID','InvestigatedBy','InvestigationDate','InvestigationNotes','ClosedBy','ClosedDate','InjuredPerson','InjuryType','BodyPart','FirstAidGiven','MedicalTreatment','LostTime','LostDays','OSHARecordable','Notes','DirectCost','IndirectCost','Attachments','JobClassification'];
        const fields = []; const values = [];
        for (const [k, v] of Object.entries(req.body)) {
            if (allowed.includes(k)) { fields.push(`${k} = ?`); values.push(v); }
        }
        if (fields.length === 0) return res.json({ success: true });
        fields.push("UpdatedAt = datetime('now')");
        values.push(req.params.id);
        logisticsDb.prepare(`UPDATE safety_incidents SET ${fields.join(', ')} WHERE ID = ?`).run(...values); /* dynamic col/table - sanitize inputs */

        // Auto-close if status is Closed
        if (req.body.Status === 'Closed' && !req.body.ClosedDate) {
            logisticsDb.prepare("UPDATE safety_incidents SET ClosedDate = datetime('now'), ClosedBy = ? WHERE ID = ?").run(req.user?.Username || 'system', req.params.id);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update incident' }); }
});

// ── Corrective Actions ──────────────────────────────────────────
router.post('/:id/actions', (req, res) => {
    try {
        const { actionType, description, assignedTo, dueDate, notes } = req.body;
        if (!description) return res.status(400).json({ error: 'Action description is required' });
        const r = logisticsDb.prepare('INSERT INTO safety_incident_actions (IncidentID, ActionType, Description, AssignedTo, DueDate, Notes) VALUES (?,?,?,?,?,?)').run(req.params.id, actionType || 'Corrective', description, assignedTo || null, dueDate || null, notes || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to add action' }); }
});

router.put('/actions/:actionId', (req, res) => {
    try {
        const { status, completedBy, notes } = req.body;
        const updates = [];
        const vals = [];
        if (status) { updates.push('Status = ?'); vals.push(status); }
        if (completedBy) { updates.push('CompletedBy = ?'); vals.push(completedBy); }
        if (status === 'Completed') { updates.push("CompletedDate = datetime('now')"); }
        if (notes) { updates.push('Notes = ?'); vals.push(notes); }
        if (updates.length === 0) return res.json({ success: true });
        vals.push(req.params.actionId);
        logisticsDb.prepare(`UPDATE safety_incident_actions SET ${updates.join(', ')} WHERE ID = ?`).run(...vals);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update action' }); }
});

router.post('/:id/expenses', (req, res) => {
    try {
        const { expenseDate, providerName, billNumber, amount, dateReceived, datePaid } = req.body;
        if (!providerName || !amount) return res.status(400).json({ error: 'Provider name and amount are required' });
        const r = logisticsDb.prepare('INSERT INTO safety_incident_expenses (IncidentID, ExpenseDate, ProviderName, BillNumber, Amount, DateReceived, DatePaid) VALUES (?,?,?,?,?,?,?)')
            .run(req.params.id, expenseDate || new Date().toISOString().split('T')[0], providerName, billNumber || null, amount, dateReceived || null, datePaid || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to add expense' }); }
});

router.delete('/expenses/:expenseId', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM safety_incident_expenses WHERE ID = ?').run(req.params.expenseId);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to delete expense' }); }
});

// ── Dashboard Stats ─────────────────────────────────────────────
router.get('/dashboard/stats', (req, res) => {
    try {
        const total = logisticsDb.prepare('SELECT COUNT(*) as c FROM safety_incidents').get().c;
        const open = logisticsDb.prepare("SELECT COUNT(*) as c FROM safety_incidents WHERE Status = 'Open' OR Status = 'Under Investigation'").get().c;
        const thisMonth = logisticsDb.prepare("SELECT COUNT(*) as c FROM safety_incidents WHERE IncidentDate >= date('now', 'start of month')").get().c;
        const thisYear = logisticsDb.prepare("SELECT COUNT(*) as c FROM safety_incidents WHERE IncidentDate >= date('now', 'start of year')").get().c;
        const nearMisses = logisticsDb.prepare("SELECT COUNT(*) as c FROM safety_incidents WHERE IncidentType = 'Near Miss' AND IncidentDate >= date('now', 'start of year')").get().c;
        const recordable = logisticsDb.prepare("SELECT COUNT(*) as c FROM safety_incidents WHERE OSHARecordable = 1 AND IncidentDate >= date('now', 'start of year')").get().c;
        const lostTimeDays = logisticsDb.prepare("SELECT COALESCE(SUM(LostDays), 0) as d FROM safety_incidents WHERE IncidentDate >= date('now', 'start of year')").get().d;
        const byType = logisticsDb.prepare('SELECT IncidentType, COUNT(*) as count FROM safety_incidents GROUP BY IncidentType ORDER BY count DESC').all();
        const bySeverity = logisticsDb.prepare('SELECT Severity, COUNT(*) as count FROM safety_incidents GROUP BY Severity ORDER BY count DESC').all();
        const byMonth = logisticsDb.prepare("SELECT strftime('%Y-%m', IncidentDate) as month, COUNT(*) as count FROM safety_incidents WHERE IncidentDate >= date('now', '-12 months') GROUP BY month ORDER BY month").all();
        const openActions = logisticsDb.prepare("SELECT COUNT(*) as c FROM safety_incident_actions WHERE Status = 'Open'").get().c;
        const recent = logisticsDb.prepare('SELECT ID, IncidentNumber, Title, IncidentType, Severity, Status, IncidentDate, PlantID FROM safety_incidents ORDER BY IncidentDate DESC LIMIT 10').all();

        // Days since last recordable
        const lastRecordable = logisticsDb.prepare("SELECT IncidentDate FROM safety_incidents WHERE OSHARecordable = 1 ORDER BY IncidentDate DESC LIMIT 1").get();
        const daysSinceRecordable = lastRecordable ? Math.floor((Date.now() - new Date(lastRecordable.IncidentDate)) / 86400000) : null;

        res.json({ total, open, thisMonth, thisYear, nearMisses, recordable, lostTimeDays, daysSinceRecordable, byType, bySeverity, byMonth, openActions, recent });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch incident stats' }); }
});

router.get('/constants', (req, res) => {
    res.json({ incidentTypes: INCIDENT_TYPES, severities: SEVERITIES, injuryTypes: INJURY_TYPES, bodyParts: BODY_PARTS, rootCauses: ROOT_CAUSES, statuses: ['Open', 'Under Investigation', 'Corrective Action', 'Closed'] });
});

module.exports = router;
