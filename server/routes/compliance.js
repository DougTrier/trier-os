// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Compliance & Regulatory Tracking API
 * ==================================================
 * Manages regulatory compliance frameworks, inspection checklists,
 * findings, and compliance score analytics. Supports OSHA, EPA,
 * FDA (food safety / FSMA), and fully customizable compliance frameworks.
 * Mounted at /api/compliance in server/index.js.
 *
 * ENDPOINTS:
 *   Frameworks (regulatory program definitions)
 *   GET    /frameworks              List all compliance frameworks for the current plant
 *   POST   /frameworks              Create a new framework (OSHA, EPA, FDA, custom)
 *                                   Body: { name, agency, description, renewalCycle }
 *
 *   Checklists (requirement items within a framework)
 *   GET    /checklists              List checklists (filter: ?frameworkId=N, ?status=)
 *   POST   /checklists              Create a checklist for a framework
 *   GET    /checklists/:id/items    All line items for a specific checklist
 *   DELETE /checklists/:id          Remove a checklist and its items
 *
 *   Inspections (scheduled compliance audits)
 *   GET    /inspections             List inspections (filter: ?status=scheduled|completed|failed)
 *   POST   /inspections             Schedule an inspection
 *                                   Body: { frameworkId, checklistId, scheduledDate, inspector }
 *   GET    /inspections/:id         Single inspection with all findings
 *   PUT    /inspections/:id         Update inspection result (complete, score, notes)
 *
 *   Findings (non-conformances identified during inspection)
 *   PUT    /findings/:id            Update a finding (status, corrective action, due date)
 *
 *   Analytics
 *   GET    /stats                   Compliance score: % items current, overdue count, trend
 *                                   Returns: { overallScore, byFramework[], overdueCount, trend }
 *
 * COMPLIANCE SCORE: (compliant items / total active items) × 100.
 *   Overdue items reduce the score proportionally to their severity tier.
 *   Score is displayed on the compliance dashboard and executive KPI cards.
 *
 * FRAMEWORKS: OSHA 29 CFR 1910 (General Industry), EPA 40 CFR (environmental),
 *   FDA 21 CFR Part 117 (FSMA / food safety), plus unlimited custom frameworks.
 *   Each framework has its own checklist templates and inspection cadence.
 */
/**
 * Compliance & Regulatory Module (Task 4.2)
 * Tracks OSHA, FDA, EPA, and custom regulatory compliance with audit trails.
 * 
 * Tables:
 *   compliance_frameworks  — Regulatory bodies (OSHA, FDA, EPA, custom)
 *   compliance_checklists  — Templates of inspection items per framework
 *   compliance_inspections — Scheduled/completed inspections with evidence
 *   compliance_findings    — Individual findings/items from inspections
 */

const express = require('express');
const router = express.Router();

function getLogisticsDb() {
    return require('../logistics_db').db;
}

// ── Initialize compliance tables ──
function initComplianceTables() {
    const db = getLogisticsDb();
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS compliance_frameworks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            description TEXT,
            color TEXT DEFAULT '#6366f1',
            icon TEXT DEFAULT '📋',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS compliance_checklists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            framework_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            frequency TEXT DEFAULT 'monthly',
            plant_id TEXT,
            is_template INTEGER DEFAULT 1,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (framework_id) REFERENCES compliance_frameworks(id)
        );

        CREATE TABLE IF NOT EXISTS compliance_checklist_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            checklist_id INTEGER NOT NULL,
            item_text TEXT NOT NULL,
            category TEXT,
            sort_order INTEGER DEFAULT 0,
            required INTEGER DEFAULT 1,
            FOREIGN KEY (checklist_id) REFERENCES compliance_checklists(id)
        );

        CREATE TABLE IF NOT EXISTS compliance_inspections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            checklist_id INTEGER NOT NULL,
            framework_id INTEGER NOT NULL,
            plant_id TEXT NOT NULL,
            inspector TEXT,
            status TEXT DEFAULT 'scheduled',
            scheduled_date DATE,
            completed_date DATETIME,
            score REAL,
            total_items INTEGER DEFAULT 0,
            passed_items INTEGER DEFAULT 0,
            failed_items INTEGER DEFAULT 0,
            na_items INTEGER DEFAULT 0,
            notes TEXT,
            evidence_photos TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (checklist_id) REFERENCES compliance_checklists(id),
            FOREIGN KEY (framework_id) REFERENCES compliance_frameworks(id)
        );

        CREATE TABLE IF NOT EXISTS compliance_findings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            inspection_id INTEGER NOT NULL,
            item_id INTEGER,
            item_text TEXT,
            status TEXT DEFAULT 'pass',
            severity TEXT DEFAULT 'low',
            corrective_action TEXT,
            due_date DATE,
            resolved_date DATETIME,
            resolved_by TEXT,
            notes TEXT,
            photo_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (inspection_id) REFERENCES compliance_inspections(id)
        );
    `);

    // Seed default frameworks if empty
    const count = db.prepare('SELECT COUNT(*) as c FROM compliance_frameworks').get();
    if (count.c === 0) {
        const insert = db.prepare('INSERT INTO compliance_frameworks (name, code, description, color, icon) VALUES (?, ?, ?, ?, ?)');
        insert.run('OSHA', 'OSHA', 'Occupational Safety and Health Administration — workplace safety standards', '#ef4444', '🛡️');
        insert.run('FDA', 'FDA', 'Food and Drug Administration — food safety and manufacturing compliance', '#3b82f6', '🏥');
        insert.run('EPA', 'EPA', 'Environmental Protection Agency — environmental and waste management regulations', '#10b981', '🌿');
        insert.run('PSM', 'PSM', 'Process Safety Management — high-hazard chemical process requirements (OSHA 1910.119)', '#f59e0b', '⚠️');
        insert.run('Internal', 'INTERNAL', 'Company-specific internal audit and quality standards', '#8b5cf6', '📊');
    }
}

// Initialize on load
try { initComplianceTables(); } catch (e) { console.error('Compliance tables init error:', e.message); }

// ═══════════════════════════════════════════════════════════════
// GET /api/compliance/frameworks — List all regulatory frameworks
// ═══════════════════════════════════════════════════════════════
router.get('/frameworks', (req, res) => {
    try {
        const db = getLogisticsDb();
        const frameworks = db.prepare('SELECT * FROM compliance_frameworks ORDER BY name').all();
        res.json(frameworks);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/compliance/frameworks — Create a new framework
// ═══════════════════════════════════════════════════════════════
router.post('/frameworks', (req, res) => {
    try {
        const db = getLogisticsDb();
        const { name, code, description, color, icon } = req.body;
        if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });
        
        const result = db.prepare('INSERT INTO compliance_frameworks (name, code, description, color, icon) VALUES (?, ?, ?, ?, ?)')
            .run(name, code, description || '', color || '#6366f1', icon || '📋');
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/compliance/checklists — List checklists (optionally by framework)
// ═══════════════════════════════════════════════════════════════
router.get('/checklists', (req, res) => {
    try {
        const db = getLogisticsDb();
        const { framework_id, plant_id } = req.query;
        let sql = `SELECT c.*, f.name as framework_name, f.code as framework_code, f.color as framework_color, f.icon as framework_icon,
                    (SELECT COUNT(*) FROM compliance_checklist_items WHERE checklist_id = c.id) as item_count
                   FROM compliance_checklists c
                   JOIN compliance_frameworks f ON c.framework_id = f.id
                   WHERE 1=1`;
        const params = [];
        if (framework_id) { sql += ' AND c.framework_id = ?'; params.push(framework_id); }
        if (plant_id && plant_id !== 'all_sites' && plant_id !== 'undefined' && plant_id !== 'null') { sql += ' AND (c.plant_id = ? OR c.plant_id IS NULL)'; params.push(plant_id); }
        sql += ' ORDER BY f.name, c.title';
        
        const checklists = db.prepare(sql).all(...params);
        res.json(checklists);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/compliance/checklists — Create a checklist with items
// ═══════════════════════════════════════════════════════════════
router.post('/checklists', (req, res) => {
    try {
        const db = getLogisticsDb();
        const { framework_id, title, description, frequency, plant_id, items } = req.body;
        if (!framework_id || !title) return res.status(400).json({ error: 'Framework and title are required' });
        
        const result = db.prepare(`INSERT INTO compliance_checklists (framework_id, title, description, frequency, plant_id, created_by) 
            VALUES (?, ?, ?, ?, ?, ?)`).run(framework_id, title, description || '', frequency || 'monthly', plant_id || null, req.headers['x-user'] || 'system');
        
        const checklistId = result.lastInsertRowid;
        
        if (items && Array.isArray(items)) {
            const insertItem = db.prepare('INSERT INTO compliance_checklist_items (checklist_id, item_text, category, sort_order, required) VALUES (?, ?, ?, ?, ?)');
            items.forEach((item, idx) => {
                insertItem.run(checklistId, item.text || item, item.category || '', idx, item.required !== false ? 1 : 0);
            });
        }
        
        res.json({ success: true, id: checklistId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/compliance/checklists/:id/items — Get items for a checklist
// ═══════════════════════════════════════════════════════════════
router.get('/checklists/:id/items', (req, res) => {
    try {
        const db = getLogisticsDb();
        const items = db.prepare('SELECT * FROM compliance_checklist_items WHERE checklist_id = ? ORDER BY sort_order').all(req.params.id);
        res.json(items);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/compliance/inspections — List inspections with filters
// ═══════════════════════════════════════════════════════════════
router.get('/inspections', (req, res) => {
    try {
        const db = getLogisticsDb();
        const { plant_id, framework_id, status, limit } = req.query;
        let sql = `SELECT i.*, c.title as checklist_title, f.name as framework_name, f.code as framework_code, f.color as framework_color, f.icon as framework_icon
                   FROM compliance_inspections i
                   JOIN compliance_checklists c ON i.checklist_id = c.id
                   JOIN compliance_frameworks f ON i.framework_id = f.id
                   WHERE 1=1`;
        const params = [];
        if (plant_id && plant_id !== 'all_sites' && plant_id !== 'undefined' && plant_id !== 'null') { sql += ' AND i.plant_id = ?'; params.push(plant_id); }
        if (framework_id) { sql += ' AND i.framework_id = ?'; params.push(framework_id); }
        if (status) { sql += ' AND i.status = ?'; params.push(status); }
        sql += ' ORDER BY i.scheduled_date DESC';
        if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }
        
        const inspections = db.prepare(sql).all(...params);
        res.json(inspections);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/compliance/inspections — Schedule a new inspection
// ═══════════════════════════════════════════════════════════════
router.post('/inspections', (req, res) => {
    try {
        const db = getLogisticsDb();
        const { checklist_id, plant_id, inspector, scheduled_date } = req.body;
        if (!checklist_id || !plant_id) return res.status(400).json({ error: 'Checklist and plant are required' });
        
        // Get framework from checklist
        const checklist = db.prepare('SELECT framework_id FROM compliance_checklists WHERE id = ?').get(checklist_id);
        if (!checklist) return res.status(404).json({ error: 'Checklist not found' });
        
        // Count items
        const itemCount = db.prepare('SELECT COUNT(*) as c FROM compliance_checklist_items WHERE checklist_id = ?').get(checklist_id);
        
        const result = db.prepare(`INSERT INTO compliance_inspections 
            (checklist_id, framework_id, plant_id, inspector, scheduled_date, status, total_items) 
            VALUES (?, ?, ?, ?, ?, 'scheduled', ?)`).run(
            checklist_id, checklist.framework_id, plant_id, 
            inspector || '', scheduled_date || new Date().toISOString().split('T')[0],
            itemCount.c
        );
        
        // Auto-create finding entries for each checklist item
        const items = db.prepare('SELECT * FROM compliance_checklist_items WHERE checklist_id = ? ORDER BY sort_order').all(checklist_id);
        const insertFinding = db.prepare('INSERT INTO compliance_findings (inspection_id, item_id, item_text, status) VALUES (?, ?, ?, ?)');
        items.forEach(item => {
            insertFinding.run(result.lastInsertRowid, item.id, item.item_text, 'pending');
        });
        
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/compliance/inspections/:id — Get inspection detail with findings
// ═══════════════════════════════════════════════════════════════
router.get('/inspections/:id', (req, res) => {
    try {
        const db = getLogisticsDb();
        const inspection = db.prepare(`SELECT i.*, c.title as checklist_title, f.name as framework_name, f.code as framework_code, f.color as framework_color, f.icon as framework_icon
            FROM compliance_inspections i
            JOIN compliance_checklists c ON i.checklist_id = c.id
            JOIN compliance_frameworks f ON i.framework_id = f.id
            WHERE i.id = ?`).get(req.params.id);
        if (!inspection) return res.status(404).json({ error: 'Inspection not found' });
        
        const findings = db.prepare('SELECT * FROM compliance_findings WHERE inspection_id = ? ORDER BY id').all(req.params.id);
        res.json({ ...inspection, findings });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/compliance/inspections/:id — Update inspection (complete, add notes)
// ═══════════════════════════════════════════════════════════════
router.put('/inspections/:id', (req, res) => {
    try {
        const db = getLogisticsDb();
        const { status, notes, inspector } = req.body;
        const updates = [];
        const params = [];
        
        if (status) { updates.push('status = ?'); params.push(status); }
        if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
        if (inspector) { updates.push('inspector = ?'); params.push(inspector); }
        
        if (status === 'completed') {
            updates.push('completed_date = CURRENT_TIMESTAMP');
            
            // Calculate score from findings
            const findings = db.prepare('SELECT status FROM compliance_findings WHERE inspection_id = ?').all(req.params.id);
            const total = findings.length;
            const passed = findings.filter(f => f.status === 'pass').length;
            const failed = findings.filter(f => f.status === 'fail').length;
            const na = findings.filter(f => f.status === 'na').length;
            const scoreable = total - na;
            const score = scoreable > 0 ? Math.round((passed / scoreable) * 100) : 100;
            
            updates.push('score = ?', 'passed_items = ?', 'failed_items = ?', 'na_items = ?');
            params.push(score, passed, failed, na);
        }
        
        if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
        
        params.push(req.params.id);
        db.prepare(`UPDATE compliance_inspections SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/compliance/findings/:id — Update a single finding (pass/fail/na)
// ═══════════════════════════════════════════════════════════════
router.put('/findings/:id', (req, res) => {
    try {
        const db = getLogisticsDb();
        const { status, severity, corrective_action, notes, due_date } = req.body;
        const updates = [];
        const params = [];
        
        if (status) { updates.push('status = ?'); params.push(status); }
        if (severity) { updates.push('severity = ?'); params.push(severity); }
        if (corrective_action !== undefined) { updates.push('corrective_action = ?'); params.push(corrective_action); }
        if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
        if (due_date) { updates.push('due_date = ?'); params.push(due_date); }
        
        if (status === 'pass' || status === 'na') {
            updates.push('resolved_date = CURRENT_TIMESTAMP');
        }
        
        params.push(req.params.id);
        db.prepare(`UPDATE compliance_findings SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/compliance/stats — Compliance dashboard stats
// ═══════════════════════════════════════════════════════════════
router.get('/stats', (req, res) => {
    try {
        const db = getLogisticsDb();
        const { plant_id } = req.query;
        
        let whereClause = '';
        const params = [];
        if (plant_id && plant_id !== 'all_sites' && plant_id !== 'undefined' && plant_id !== 'null') {
            whereClause = 'WHERE i.plant_id = ?';
            params.push(plant_id);
        }
        
        // Overall compliance rate
        const overallSql = `SELECT 
            COUNT(*) as total_inspections,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue,
            ROUND(AVG(CASE WHEN score IS NOT NULL THEN score END), 1) as avg_score
            FROM compliance_inspections i ${whereClause}`;
        const overall = db.prepare(overallSql).get(...params);
        
        // By framework
        const byFrameworkSql = `SELECT f.name, f.code, f.color, f.icon,
            COUNT(i.id) as inspections,
            ROUND(AVG(CASE WHEN i.score IS NOT NULL THEN i.score END), 1) as avg_score,
            SUM(CASE WHEN i.status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN i.status = 'scheduled' OR i.status = 'overdue' THEN 1 ELSE 0 END) as pending
            FROM compliance_frameworks f
            LEFT JOIN compliance_inspections i ON f.id = i.framework_id ${whereClause ? 'AND ' + whereClause.replace('WHERE ', '') : ''}
            GROUP BY f.id ORDER BY f.name`;
        const byFramework = db.prepare(byFrameworkSql).all(...params);
        
        // Open findings
        const findingsSql = `SELECT 
            COUNT(*) as total_findings,
            SUM(CASE WHEN cf.status = 'fail' AND cf.resolved_date IS NULL THEN 1 ELSE 0 END) as open_findings,
            SUM(CASE WHEN cf.severity = 'critical' AND cf.resolved_date IS NULL THEN 1 ELSE 0 END) as critical_findings
            FROM compliance_findings cf
            JOIN compliance_inspections i ON cf.inspection_id = i.id ${whereClause}`;
        const findings = db.prepare(findingsSql).get(...params);
        
        // Upcoming inspections
        const upcomingSql = `SELECT i.*, c.title as checklist_title, f.name as framework_name, f.code as framework_code, f.color as framework_color, f.icon as framework_icon
            FROM compliance_inspections i
            JOIN compliance_checklists c ON i.checklist_id = c.id
            JOIN compliance_frameworks f ON i.framework_id = f.id
            WHERE i.status IN ('scheduled', 'in_progress') ${plant_id && plant_id !== 'all_sites' && plant_id !== 'undefined' && plant_id !== 'null' ? 'AND i.plant_id = ?' : ''}
            ORDER BY i.scheduled_date ASC LIMIT 10`;
        const upcoming = db.prepare(upcomingSql).all(...(plant_id && plant_id !== 'all_sites' && plant_id !== 'undefined' && plant_id !== 'null' ? [plant_id] : []));
        
        // Mark overdue inspections
        db.prepare(`UPDATE compliance_inspections SET status = 'overdue' 
            WHERE status = 'scheduled' AND scheduled_date < date('now')`).run();
        
        res.json({
            overall: overall || {},
            byFramework,
            findings: findings || {},
            upcoming
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/compliance/checklists/:id — Delete a checklist and its items
// ═══════════════════════════════════════════════════════════════
router.delete('/checklists/:id', (req, res) => {
    try {
        const db = getLogisticsDb();
        db.prepare('DELETE FROM compliance_checklist_items WHERE checklist_id = ?').run(req.params.id);
        db.prepare('DELETE FROM compliance_checklists WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
