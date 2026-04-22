// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Tool Crib & Checkout Management API
 * ================================================
 * Tracks shared plant tools — who has what, since when, and whether it's
 * overdue for return. Prevents "where's the torque wrench?" situations that
 * cost real downtime in a production environment.
 * All tool data lives in trier_logistics.db (cross-plant visibility).
 * Mounted at /api/tools in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /                List all tools (filter: status, category, location)
 *   GET    /stats           Dashboard KPIs: total tools, checked out, overdue, by category
 *   GET    /overdue         Tools that have been checked out longer than MaxCheckoutHours
 *   GET    /:id             Single tool detail with full checkout history
 *   POST   /                Add a tool to the crib inventory
 *   PUT    /:id             Update tool metadata (condition, location, max hours)
 *   POST   /:id/checkout    Check out a tool to a user or work order
 *   POST   /:id/return      Return a tool (records condition on return, duration)
 *   GET    /constants/all   Enum lists: ToolCategories, ConditionValues, StatusValues
 *
 * CHECKOUT FLOW:
 *   Available → Checked Out (POST /:id/checkout)
 *   Checked Out → Available (POST /:id/return)
 *   Either → Out of Service (tool broken, needs repair)
 *
 * OVERDUE ALERT: GET /overdue finds all tools where:
 *   Status = 'Checked Out' AND CheckedOutAt < now - MaxCheckoutHours
 *   Default MaxCheckoutHours = 8 (one shift). Adjustable per tool.
 *
 * WORK ORDER LINKING: Checkouts can reference a WorkOrderNumber.
 *   The WO detail view surfaces this to show "Tool: Torque Wrench 3/4" in use".
 *
 * TABLES (trier_logistics.db):
 *   tools_inventory    — Tool registry (name, category, condition, status)
 *   tool_checkouts     — Checkout/return log with user, WO, timestamps, condition-on-return
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('../logistics_db');

function initToolTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS tools_inventory (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            ToolID TEXT UNIQUE NOT NULL,
            Description TEXT NOT NULL,
            Category TEXT DEFAULT 'General',
            SerialNumber TEXT,
            Manufacturer TEXT,
            Location TEXT,
            PlantID TEXT,
            Condition TEXT DEFAULT 'Good',
            PurchaseDate TEXT,
            PurchaseCost REAL,
            CalibrationDue TEXT,
            Status TEXT DEFAULT 'Available',
            Notes TEXT,
            Active INTEGER DEFAULT 1,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS tool_checkouts (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            ToolDBID INTEGER NOT NULL,
            CheckedOutBy TEXT NOT NULL,
            CheckedOutDate TEXT DEFAULT (datetime('now')),
            DueBackDate TEXT,
            ReturnedDate TEXT,
            ReturnedBy TEXT,
            ReturnCondition TEXT,
            Notes TEXT,
            FOREIGN KEY (ToolDBID) REFERENCES tools_inventory(ID)
        );
    `);
    console.log('[TOOLS] Tables initialized');
}
initToolTables();

const TOOL_CATEGORIES = ['General', 'Hand Tool', 'Power Tool', 'Measuring', 'Hydraulic', 'Pneumatic', 'Welding', 'Electrical', 'Safety', 'Lifting', 'Cutting', 'Diagnostic', 'Specialty', 'Other'];
const TOOL_CONDITIONS = ['New', 'Good', 'Fair', 'Poor', 'Needs Repair', 'Retired'];

// ── Tool Inventory ──────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const { status, category, plant, search } = req.query;
        let sql = 'SELECT * FROM tools_inventory WHERE Active=1';
        const p = [];
        if (status) { sql += ' AND Status=?'; p.push(status); }
        if (category) { sql += ' AND Category=?'; p.push(category); }
        if (plant) { sql += ' AND PlantID=?'; p.push(plant); }
        if (search) { sql += ' AND (ToolID LIKE ? OR Description LIKE ? OR SerialNumber LIKE ?)'; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
        sql += ' ORDER BY ToolID ASC';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch tools' }); }
});

router.get('/stats', (req, res) => {
    try {
        const total = logisticsDb.prepare('SELECT COUNT(*) as c FROM tools_inventory WHERE Active=1').get().c;
        const available = logisticsDb.prepare("SELECT COUNT(*) as c FROM tools_inventory WHERE Active=1 AND Status='Available'").get().c;
        const checkedOut = logisticsDb.prepare("SELECT COUNT(*) as c FROM tools_inventory WHERE Active=1 AND Status='Checked Out'").get().c;
        const overdue = logisticsDb.prepare("SELECT COUNT(*) as c FROM tool_checkouts WHERE ReturnedDate IS NULL AND DueBackDate < datetime('now')").get().c;
        const needsRepair = logisticsDb.prepare("SELECT COUNT(*) as c FROM tools_inventory WHERE Active=1 AND Status='Repair'").get().c;
        const byCategory = logisticsDb.prepare('SELECT Category, COUNT(*) as count FROM tools_inventory WHERE Active=1 GROUP BY Category ORDER BY count DESC').all();
        const totalValue = logisticsDb.prepare('SELECT COALESCE(SUM(PurchaseCost),0) as v FROM tools_inventory WHERE Active=1').get().v;
        res.json({ total, available, checkedOut, overdue, needsRepair, byCategory, totalValue });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch tool stats' }); }
});

router.get('/overdue', (req, res) => {
    try {
        const overdue = logisticsDb.prepare(`
            SELECT c.*, t.ToolID, t.Description, t.Category
            FROM tool_checkouts c
            JOIN tools_inventory t ON c.ToolDBID = t.ID
            WHERE c.ReturnedDate IS NULL AND c.DueBackDate < datetime('now')
            ORDER BY c.DueBackDate ASC
        `).all();
        res.json(overdue);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch overdue tools' }); }
});

router.get('/:id', (req, res) => {
    try {
        const tool = logisticsDb.prepare('SELECT * FROM tools_inventory WHERE ID=?').get(req.params.id);
        if (!tool) return res.status(404).json({ error: 'Tool not found' });
        const history = logisticsDb.prepare('SELECT * FROM tool_checkouts WHERE ToolDBID=? ORDER BY CheckedOutDate DESC LIMIT 50').all(tool.ID);
        const currentCheckout = history.find(h => !h.ReturnedDate) || null;
        res.json({ tool, history, currentCheckout });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch tool' }); }
});

router.post('/', (req, res) => {
    try {
        const { toolId, description, category, serialNumber, manufacturer, location, plantId, condition, purchaseDate, purchaseCost, calibrationDue, notes } = req.body;
        if (!toolId || !description) return res.status(400).json({ error: 'Tool ID and description required' });
        const existing = logisticsDb.prepare('SELECT ID FROM tools_inventory WHERE ToolID=?').get(toolId);
        if (existing) return res.status(409).json({ error: `Tool ${toolId} already exists` });
        const r = logisticsDb.prepare('INSERT INTO tools_inventory (ToolID, Description, Category, SerialNumber, Manufacturer, Location, PlantID, Condition, PurchaseDate, PurchaseCost, CalibrationDue, Notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(toolId, description, category || 'General', serialNumber || null, manufacturer || null, location || null, plantId || null, condition || 'Good', purchaseDate || null, purchaseCost || null, calibrationDue || null, notes || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to add tool: ' }); }
});

router.put('/:id', (req, res) => {
    try {
        const allowed = ['Description','Category','SerialNumber','Manufacturer','Location','PlantID','Condition','CalibrationDue','Status','Notes'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        if (f.length === 0) return res.json({ success: true });
        f.push("UpdatedAt=datetime('now')"); v.push(req.params.id);
        logisticsDb.prepare(`UPDATE tools_inventory SET ${f.join(',')} WHERE ID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update tool' }); }
});

// ── Checkout / Return ───────────────────────────────────────────
router.post('/:id/checkout', (req, res) => {
    try {
        const tool = logisticsDb.prepare('SELECT * FROM tools_inventory WHERE ID=?').get(req.params.id);
        if (!tool) return res.status(404).json({ error: 'Tool not found' });
        if (tool.Status === 'Checked Out') return res.status(409).json({ error: 'Tool is already checked out' });
        if (tool.Status === 'Repair' || tool.Status === 'Retired') return res.status(409).json({ error: `Tool is ${tool.Status} and cannot be checked out` });

        const { checkedOutBy, dueBackDays, notes } = req.body;
        if (!checkedOutBy) return res.status(400).json({ error: 'Checked out by is required' });
        const dueBack = new Date(Date.now() + (dueBackDays || 7) * 86400000).toISOString();

        logisticsDb.prepare('INSERT INTO tool_checkouts (ToolDBID, CheckedOutBy, DueBackDate, Notes) VALUES (?,?,?,?)').run(tool.ID, checkedOutBy, dueBack, notes || null);
        logisticsDb.prepare("UPDATE tools_inventory SET Status='Checked Out', UpdatedAt=datetime('now') WHERE ID=?").run(tool.ID);

        try { logAudit(checkedOutBy, 'TOOL_CHECKOUT', tool.PlantID, { toolId: tool.ToolID, dueBack }); } catch(e) {}
        res.json({ success: true, dueBack });
    } catch (err) { res.status(500).json({ error: 'Failed to check out tool' }); }
});

router.post('/:id/return', (req, res) => {
    try {
        const tool = logisticsDb.prepare('SELECT * FROM tools_inventory WHERE ID=?').get(req.params.id);
        if (!tool) return res.status(404).json({ error: 'Tool not found' });

        const activeCheckout = logisticsDb.prepare('SELECT * FROM tool_checkouts WHERE ToolDBID=? AND ReturnedDate IS NULL ORDER BY CheckedOutDate DESC LIMIT 1').get(tool.ID);
        if (!activeCheckout) return res.status(409).json({ error: 'Tool is not currently checked out' });

        const { returnedBy, condition, notes } = req.body;
        logisticsDb.prepare("UPDATE tool_checkouts SET ReturnedDate=datetime('now'), ReturnedBy=?, ReturnCondition=?, Notes=COALESCE(Notes||' | '||?, Notes) WHERE ID=?").run(returnedBy || activeCheckout.CheckedOutBy, condition || 'Good', notes || null, activeCheckout.ID);

        // Update tool status and condition
        const newStatus = (condition === 'Needs Repair' || condition === 'Poor') ? 'Repair' : 'Available';
        logisticsDb.prepare("UPDATE tools_inventory SET Status=?, Condition=COALESCE(?,Condition), UpdatedAt=datetime('now') WHERE ID=?").run(newStatus, condition || null, tool.ID);

        try { logAudit(returnedBy || 'system', 'TOOL_RETURN', tool.PlantID, { toolId: tool.ToolID, condition }); } catch(e) {}
        res.json({ success: true, newStatus });
    } catch (err) { res.status(500).json({ error: 'Failed to return tool' }); }
});

router.get('/constants/all', (req, res) => {
    res.json({ categories: TOOL_CATEGORIES, conditions: TOOL_CONDITIONS, statuses: ['Available', 'Checked Out', 'Repair', 'Retired'] });
});

module.exports = router;
