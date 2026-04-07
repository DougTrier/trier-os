// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS — Employee Training & Certification Tracking
 * ======================================================
 * Tracks training records and certification compliance for
 * internal employees — filling the gap that previously only
 * existed for contractors.
 *
 * Tables (in trier_logistics.db):
 *   training_courses     — Course library (OSHA 10, Forklift, LOTO, etc.)
 *   training_records     — Per-employee completion records with expiry
 *   training_assignments — Required training per role/department
 *
 * ENDPOINTS:
 *   GET  /api/training/courses             — List course library
 *   POST /api/training/courses             — Create a course
 *   PUT  /api/training/courses/:id         — Update a course
 *   DELETE /api/training/courses/:id       — Delete a course
 *
 *   GET  /api/training/records             — All records (filterable by employee, course, status)
 *   GET  /api/training/records/:userId     — All records for one employee
 *   POST /api/training/records             — Log a training completion
 *   PUT  /api/training/records/:id         — Update a record
 *   DELETE /api/training/records/:id       — Delete a record
 *
 *   GET  /api/training/expiring            — Certs expiring within N days
 *   GET  /api/training/expired             — Already-expired certs
 *   GET  /api/training/compliance          — Compliance scorecard per employee/department
 *   GET  /api/training/matrix              — Skills matrix (employees × required courses)
 *   GET  /api/training/dashboard           — Summary stats for HR/Safety dashboard
 *
 *   GET  /api/training/assignments         — Required training rules per role
 *   POST /api/training/assignments         — Create assignment rule
 *   DELETE /api/training/assignments/:id   — Delete assignment rule
 */

const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('../logistics_db');

// ── Initialize Training Tables ────────────────────────────────────────────
function initTrainingTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS training_courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT DEFAULT 'Safety',
            duration_hours REAL DEFAULT 1,
            validity_days INTEGER DEFAULT 365,
            is_recurring INTEGER DEFAULT 1,
            required_for_roles TEXT,
            provider TEXT,
            regulatory_ref TEXT,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            created_by TEXT
        );

        CREATE TABLE IF NOT EXISTS training_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            department TEXT,
            plant_id TEXT,
            course_id INTEGER NOT NULL,
            course_code TEXT NOT NULL,
            course_title TEXT,
            completed_date TEXT NOT NULL,
            expires_date TEXT,
            score REAL,
            passed INTEGER DEFAULT 1,
            trainer TEXT,
            training_location TEXT,
            certificate_number TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            created_by TEXT,
            FOREIGN KEY (course_id) REFERENCES training_courses(id)
        );

        CREATE TABLE IF NOT EXISTS training_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            role TEXT,
            department TEXT,
            plant_id TEXT,
            required INTEGER DEFAULT 1,
            grace_days INTEGER DEFAULT 30,
            created_at TEXT DEFAULT (datetime('now')),
            created_by TEXT,
            UNIQUE(course_id, role, department, plant_id),
            FOREIGN KEY (course_id) REFERENCES training_courses(id)
        );

        CREATE INDEX IF NOT EXISTS idx_training_records_user
            ON training_records(user_id);
        CREATE INDEX IF NOT EXISTS idx_training_records_course
            ON training_records(course_id);
        CREATE INDEX IF NOT EXISTS idx_training_records_expires
            ON training_records(expires_date);
    `);

    // Seed default course library if empty
    const count = logisticsDb.prepare('SELECT COUNT(*) as c FROM training_courses').get().c;
    if (count === 0) {
        const insert = logisticsDb.prepare(`
            INSERT OR IGNORE INTO training_courses
                (code, title, description, category, duration_hours, validity_days, is_recurring, regulatory_ref)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const defaults = [
            // Safety & OSHA
            ['OSHA10', 'OSHA 10-Hour General Industry', 'OSHA 10-hour general industry safety certification', 'Safety', 10, 1825, 0, 'OSHA 29 CFR 1910'],
            ['OSHA30', 'OSHA 30-Hour General Industry', 'OSHA 30-hour general industry safety certification', 'Safety', 30, 1825, 0, 'OSHA 29 CFR 1910'],
            ['LOTO-GEN', 'Lockout/Tagout — General', 'LOTO energy control procedures for all employees', 'Safety', 2, 365, 1, 'OSHA 29 CFR 1910.147'],
            ['LOTO-AUTH', 'Lockout/Tagout — Authorized', 'Advanced LOTO for technicians who apply locks', 'Safety', 4, 365, 1, 'OSHA 29 CFR 1910.147'],
            ['CONFINED', 'Confined Space Entry', 'Permit-required confined space entry and rescue', 'Safety', 8, 365, 1, 'OSHA 29 CFR 1910.146'],
            ['HOTWORK', 'Hot Work Permit & Fire Safety', 'Hot work permit procedures and fire watch training', 'Safety', 2, 365, 1, 'OSHA 29 CFR 1910.119'],
            ['FORKLIFT', 'Powered Industrial Truck (Forklift)', 'Forklift operation, inspection, and safety', 'Equipment', 8, 1095, 1, 'OSHA 29 CFR 1910.178'],
            ['HM-GEN', 'Hazmat Awareness — General', 'HAZMAT awareness and communication (Right-to-Know)', 'Safety', 2, 365, 1, 'OSHA 29 CFR 1910.1200'],
            ['HM-RESP', 'Hazmat First Responder Operations', 'Hazmat response at the operations level', 'Safety', 8, 365, 1, 'OSHA 29 CFR 1910.120'],
            ['ARC-FLASH', 'Arc Flash & Electrical Safety', 'Electrical safety and arc flash hazard awareness', 'Electrical', 4, 365, 1, 'NFPA 70E'],
            ['FALL-PROT', 'Fall Protection', 'Fall protection planning, equipment, and rescue', 'Safety', 4, 365, 1, 'OSHA 29 CFR 1910.28'],
            ['PPE-GEN', 'Personal Protective Equipment', 'PPE selection, use, and maintenance', 'Safety', 1, 365, 1, 'OSHA 29 CFR 1910.132'],
            ['FIRE-EXT', 'Fire Extinguisher Operation', 'Portable fire extinguisher use and selection', 'Safety', 1, 365, 1, 'OSHA 29 CFR 1910.157'],
            // Food Safety
            ['FDA-HACCP', 'HACCP Fundamentals', 'Hazard Analysis and Critical Control Points for food safety', 'Food Safety', 8, 730, 1, 'FDA 21 CFR 117'],
            ['FDA-PC', 'Preventive Controls (FSMA)', 'FSMA Preventive Controls for Human Food', 'Food Safety', 16, 730, 1, 'FDA 21 CFR 117.155'],
            ['GMP', 'Good Manufacturing Practices (GMP)', 'Food-grade GMP for production and maintenance', 'Food Safety', 4, 365, 1, 'FDA 21 CFR 117'],
            ['ALLERGEN', 'Allergen Awareness', 'Allergen control procedures and cross-contact prevention', 'Food Safety', 2, 365, 1, 'FDA FSMA'],
            // Equipment & Technical
            ['AERIAL', 'Aerial Lift Operation (Scissor/Boom)', 'Aerial work platform operation and inspection', 'Equipment', 4, 1095, 1, 'OSHA 29 CFR 1926.453'],
            ['RIGGING', 'Rigging & Crane Safety', 'Overhead crane, rigging, and sling safety', 'Equipment', 4, 365, 1, 'OSHA 29 CFR 1910.179'],
            ['WELDING', 'Welding Safety', 'Welding, cutting, and brazing safety procedures', 'Safety', 4, 365, 1, 'OSHA 29 CFR 1910.252'],
            ['CDL', 'Commercial Driver License (CDL)', 'Commercial vehicle operation and compliance', 'Licensing', 0, 730, 1, 'FMCSA 49 CFR 383'],
            // HR & Compliance
            ['HARASSMENT', 'Harassment & Discrimination Prevention', 'Equal opportunity and respectful workplace training', 'HR', 2, 730, 1, 'EEOC'],
            ['ETHICS', 'Code of Ethics & Business Conduct', 'Company ethics policy and compliance', 'HR', 1, 365, 1, 'Internal'],
        ];

        const addMany = logisticsDb.transaction((rows) => {
            for (const row of rows) insert.run(...row);
        });
        addMany(defaults);
        console.log(`📋 [Training] Seeded ${defaults.length} default training courses`);
    }
}

try { initTrainingTables(); } catch (e) { console.error('[Training] Table init error:', e.message); }


// ══════════════════════════════════════════════════════════════════════════
// COURSE LIBRARY CRUD
// ══════════════════════════════════════════════════════════════════════════

// GET /api/training/courses
router.get('/courses', (req, res) => {
    try {
        const { category, active } = req.query;
        let sql = 'SELECT * FROM training_courses WHERE 1=1';
        const params = [];
        if (category) { sql += ' AND category = ?'; params.push(category); }
        if (active !== undefined) { sql += ' AND active = ?'; params.push(active === 'false' ? 0 : 1); }
        sql += ' ORDER BY category, title';
        res.json(logisticsDb.prepare(sql).all(...params));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/training/courses
router.post('/courses', (req, res) => {
    try {
        const { code, title, description, category, duration_hours, validity_days, is_recurring, required_for_roles, provider, regulatory_ref } = req.body;
        if (!code || !title) return res.status(400).json({ error: 'code and title are required' });
        const result = logisticsDb.prepare(`
            INSERT INTO training_courses (code, title, description, category, duration_hours, validity_days, is_recurring, required_for_roles, provider, regulatory_ref, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(code.toUpperCase(), title, description || '', category || 'Safety', duration_hours || 1,
               validity_days || 365, is_recurring ? 1 : 0, required_for_roles || null, provider || null,
               regulatory_ref || null, req.user?.Username || 'system');
        logAudit(req.user?.Username || 'system', 'TRAINING_COURSE_CREATED', code, { title });
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Course code already exists' });
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/training/courses/:id
router.put('/courses/:id', (req, res) => {
    try {
        const { title, description, category, duration_hours, validity_days, is_recurring, required_for_roles, provider, regulatory_ref, active } = req.body;
        logisticsDb.prepare(`
            UPDATE training_courses SET
                title = COALESCE(?, title), description = COALESCE(?, description),
                category = COALESCE(?, category), duration_hours = COALESCE(?, duration_hours),
                validity_days = COALESCE(?, validity_days), is_recurring = COALESCE(?, is_recurring),
                required_for_roles = COALESCE(?, required_for_roles), provider = COALESCE(?, provider),
                regulatory_ref = COALESCE(?, regulatory_ref), active = COALESCE(?, active)
            WHERE id = ?
        `).run(title || null, description || null, category || null, duration_hours || null,
               validity_days || null, is_recurring !== undefined ? (is_recurring ? 1 : 0) : null,
               required_for_roles || null, provider || null, regulatory_ref || null,
               active !== undefined ? (active ? 1 : 0) : null, req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/training/courses/:id
router.delete('/courses/:id', (req, res) => {
    try {
        logisticsDb.prepare('UPDATE training_courses SET active = 0 WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════════════════
// TRAINING RECORDS CRUD
// ══════════════════════════════════════════════════════════════════════════

// GET /api/training/records
router.get('/records', (req, res) => {
    try {
        const { user_id, course_id, plant_id, department, status, limit } = req.query;
        let sql = `
            SELECT r.*, c.category, c.validity_days, c.regulatory_ref,
                   CASE
                       WHEN r.expires_date IS NULL THEN 'no-expiry'
                       WHEN r.expires_date < date('now') THEN 'expired'
                       WHEN r.expires_date < date('now', '+30 days') THEN 'expiring-soon'
                       ELSE 'current'
                   END as expiry_status,
                   CAST((julianday(COALESCE(r.expires_date, '9999-12-31')) - julianday('now')) AS INTEGER) as days_until_expiry
            FROM training_records r
            LEFT JOIN training_courses c ON r.course_id = c.id
            WHERE 1=1
        `;
        const params = [];

        if (user_id) { sql += ' AND r.user_id = ?'; params.push(user_id); }
        if (course_id) { sql += ' AND r.course_id = ?'; params.push(course_id); }
        if (plant_id && plant_id !== 'all_sites') { sql += ' AND r.plant_id = ?'; params.push(plant_id); }
        if (department) { sql += ' AND r.department LIKE ?'; params.push(`%${department}%`); }
        if (status === 'expired') { sql += " AND r.expires_date < date('now')"; }
        else if (status === 'expiring') { sql += " AND r.expires_date BETWEEN date('now') AND date('now', '+30 days')"; }
        else if (status === 'current') { sql += " AND (r.expires_date IS NULL OR r.expires_date >= date('now'))"; }

        sql += ' ORDER BY r.completed_date DESC';
        if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }

        res.json(logisticsDb.prepare(sql).all(...params));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/training/records/:userId — All records for one employee
router.get('/records/:userId', (req, res) => {
    try {
        const records = logisticsDb.prepare(`
            SELECT r.*, c.category, c.validity_days, c.regulatory_ref, c.is_recurring,
                   CASE
                       WHEN r.expires_date IS NULL THEN 'no-expiry'
                       WHEN r.expires_date < date('now') THEN 'expired'
                       WHEN r.expires_date < date('now', '+30 days') THEN 'expiring-soon'
                       ELSE 'current'
                   END as expiry_status,
                   CAST((julianday(COALESCE(r.expires_date, '9999-12-31')) - julianday('now')) AS INTEGER) as days_until_expiry
            FROM training_records r
            LEFT JOIN training_courses c ON r.course_id = c.id
            WHERE r.user_id = ?
            ORDER BY r.completed_date DESC
        `).all(req.params.userId);

        const expired = records.filter(r => r.expiry_status === 'expired').length;
        const expiringSoon = records.filter(r => r.expiry_status === 'expiring-soon').length;
        const current = records.filter(r => r.expiry_status === 'current' || r.expiry_status === 'no-expiry').length;

        res.json({
            userId: req.params.userId,
            userName: records[0]?.user_name || req.params.userId,
            summary: { total: records.length, current, expiringSoon, expired },
            records,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/training/records — Log a training completion
router.post('/records', (req, res) => {
    try {
        const {
            user_id, user_name, department, plant_id, course_id,
            completed_date, score, passed, trainer, training_location,
            certificate_number, notes
        } = req.body;

        if (!user_id || !user_name || !course_id || !completed_date) {
            return res.status(400).json({ error: 'user_id, user_name, course_id, and completed_date are required' });
        }

        const course = logisticsDb.prepare('SELECT * FROM training_courses WHERE id = ?').get(course_id);
        if (!course) return res.status(404).json({ error: 'Course not found' });

        // Calculate expiry date
        let expires_date = null;
        if (course.validity_days && course.validity_days > 0 && course.is_recurring) {
            const exp = new Date(completed_date);
            exp.setDate(exp.getDate() + course.validity_days);
            expires_date = exp.toISOString().split('T')[0];
        }

        const result = logisticsDb.prepare(`
            INSERT INTO training_records
                (user_id, user_name, department, plant_id, course_id, course_code, course_title,
                 completed_date, expires_date, score, passed, trainer, training_location,
                 certificate_number, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            user_id, user_name, department || '', plant_id || '',
            course_id, course.code, course.title,
            completed_date, expires_date,
            score !== undefined ? score : null,
            passed !== false ? 1 : 0,
            trainer || '', training_location || '',
            certificate_number || '', notes || '',
            req.user?.Username || 'system'
        );

        logAudit(req.user?.Username || 'system', 'TRAINING_RECORD_ADDED', user_id, {
            course: course.title, completedDate: completed_date, expiresDate: expires_date
        });

        console.log(`🎓 [Training] Recorded: ${user_name} → ${course.title} (expires: ${expires_date || 'no expiry'})`);
        res.status(201).json({ success: true, id: result.lastInsertRowid, expires_date });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/training/record/:id — Get single record
router.get('/record/:id', (req, res) => {
    try {
        const record = logisticsDb.prepare(`
            SELECT r.*, c.code as course_code, c.title as course_title, c.validity_days, c.regulatory_ref
            FROM training_records r
            LEFT JOIN training_courses c ON r.course_id = c.id
            WHERE r.id = ?
        `).get(req.params.id);
        if (!record) return res.status(404).json({ error: 'Record not found' });
        res.json({ record });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/training/records/:id
router.put('/records/:id', (req, res) => {
    try {
        const { completed_date, score, passed, trainer, training_location, certificate_number, notes, expires_date } = req.body;
        logisticsDb.prepare(`
            UPDATE training_records SET
                completed_date = COALESCE(?, completed_date),
                score = COALESCE(?, score),
                passed = COALESCE(?, passed),
                trainer = COALESCE(?, trainer),
                training_location = COALESCE(?, training_location),
                certificate_number = COALESCE(?, certificate_number),
                notes = COALESCE(?, notes),
                expires_date = COALESCE(?, expires_date)
            WHERE id = ?
        `).run(completed_date || null, score || null, passed !== undefined ? (passed ? 1 : 0) : null,
               trainer || null, training_location || null, certificate_number || null,
               notes || null, expires_date || null, req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/training/records/:id
router.delete('/records/:id', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM training_records WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════════════════
// EXPIRY & COMPLIANCE VIEWS
// ══════════════════════════════════════════════════════════════════════════

// GET /api/training/expiring?days=30
router.get('/expiring', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const plant_id = req.query.plant_id || req.headers['x-plant-id'];
        let sql = `
            SELECT r.*, 
                   r.user_name as employee_name, 
                   r.user_id as employee_id, 
                   r.course_title as course_name, 
                   r.certificate_number as cert_number, 
                   r.expires_date as expiry_date,
                   c.category, c.regulatory_ref,
                   CAST((julianday(r.expires_date) - julianday('now')) AS INTEGER) as days_until_expiry
            FROM training_records r
            LEFT JOIN training_courses c ON r.course_id = c.id
            WHERE r.expires_date BETWEEN date('now') AND date('now', '+${days} days')
              AND r.passed = 1
        `;
        const params = [];
        if (plant_id && plant_id !== 'all_sites') { sql += ' AND r.plant_id = ?'; params.push(plant_id); }
        sql += ' ORDER BY r.expires_date ASC';

        const records = logisticsDb.prepare(sql).all(...params);
        res.json({ days, count: records.length, expiring: records, records });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/training/expired
router.get('/expired', (req, res) => {
    try {
        const plant_id = req.query.plant_id;
        let sql = `
            SELECT r.*, c.category, c.regulatory_ref,
                   CAST((julianday('now') - julianday(r.expires_date)) AS INTEGER) as days_past_expiry
            FROM training_records r
            LEFT JOIN training_courses c ON r.course_id = c.id
            WHERE r.expires_date < date('now') AND r.passed = 1
        `;
        const params = [];
        if (plant_id && plant_id !== 'all_sites') { sql += ' AND r.plant_id = ?'; params.push(plant_id); }
        sql += ' ORDER BY r.expires_date ASC';

        const records = logisticsDb.prepare(sql).all(...params);
        res.json({ count: records.length, records });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/training/compliance — Per-employee compliance score against required courses
router.get('/compliance', (req, res) => {
    try {
        const plant_id = req.query.plant_id;

        // Get all unique employees with training records
        let empSql = 'SELECT DISTINCT user_id, user_name, department, plant_id FROM training_records';
        const empParams = [];
        if (plant_id && plant_id !== 'all_sites') {
            empSql += ' WHERE plant_id = ?';
            empParams.push(plant_id);
        }
        empSql += ' ORDER BY user_name';
        const employees = logisticsDb.prepare(empSql).all(...empParams);

        const results = employees.map(emp => {
            // Get their most recent record per course
            const records = logisticsDb.prepare(`
                SELECT r.course_id, r.course_title, r.course_code, r.completed_date, r.expires_date, r.passed,
                       CASE
                           WHEN r.expires_date IS NULL THEN 'current'
                           WHEN r.expires_date < date('now') THEN 'expired'
                           WHEN r.expires_date < date('now', '+30 days') THEN 'expiring-soon'
                           ELSE 'current'
                       END as status
                FROM training_records r
                WHERE r.user_id = ? AND r.passed = 1
                GROUP BY r.course_id
                HAVING r.completed_date = MAX(r.completed_date)
            `).all(emp.user_id);

            const current = records.filter(r => r.status === 'current').length;
            const expiringSoon = records.filter(r => r.status === 'expiring-soon').length;
            const expired = records.filter(r => r.status === 'expired').length;
            const total = records.length;
            const complianceScore = total > 0 ? Math.round((current / total) * 100) : 0;

            return {
                ...emp,
                totalCertifications: total,
                current,
                expiringSoon,
                expired,
                complianceScore,
                status: expired > 0 ? 'non-compliant' : expiringSoon > 0 ? 'at-risk' : 'compliant',
                records,
            };
        });

        res.json({
            totalEmployees: results.length,
            compliant: results.filter(e => e.status === 'compliant').length,
            atRisk: results.filter(e => e.status === 'at-risk').length,
            nonCompliant: results.filter(e => e.status === 'non-compliant').length,
            employees: results,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/training/matrix — Full skills matrix (employees × courses)
router.get('/matrix', (req, res) => {
    try {
        const plant_id = req.query.plant_id;
        const category = req.query.category;

        let courseFilter = 'WHERE c.active = 1';
        const courseParams = [];
        if (category) { courseFilter += ' AND c.category = ?'; courseParams.push(category); }

        const courses = logisticsDb.prepare(`SELECT * FROM training_courses ${courseFilter} ORDER BY category, title`).all(...courseParams);

        let empSql = 'SELECT DISTINCT user_id, user_name, department, plant_id FROM training_records';
        const empParams = [];
        if (plant_id && plant_id !== 'all_sites') {
            empSql += ' WHERE plant_id = ?';
            empParams.push(plant_id);
        }
        empSql += ' ORDER BY department, user_name';
        const employees = logisticsDb.prepare(empSql).all(...empParams);

        const matrix = employees.map(emp => {
            const certMap = {};
            const records = logisticsDb.prepare(`
                SELECT course_id, expires_date, completed_date,
                       CASE
                           WHEN expires_date IS NULL THEN 'current'
                           WHEN expires_date < date('now') THEN 'expired'
                           WHEN expires_date < date('now', '+30 days') THEN 'expiring-soon'
                           ELSE 'current'
                       END as status
                FROM training_records
                WHERE user_id = ? AND passed = 1
                GROUP BY course_id HAVING completed_date = MAX(completed_date)
            `).all(emp.user_id);
            records.forEach(r => { certMap[r.course_id] = r; });

            return {
                ...emp,
                certMap,
            };
        });

        res.json({ courses, employees: matrix });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/training/dashboard
router.get('/dashboard', (req, res) => {
    try {
        const plant_id = req.query.plant_id;
        const pf = (plant_id && plant_id !== 'all_sites') ? ' AND plant_id = ?' : '';
        const pp = (plant_id && plant_id !== 'all_sites') ? [plant_id] : [];

        const totalRecords = logisticsDb.prepare(`SELECT COUNT(*) as c FROM training_records WHERE 1=1${pf}`).get(...pp).c;
        const totalEmployees = logisticsDb.prepare(`SELECT COUNT(DISTINCT user_id) as c FROM training_records WHERE 1=1${pf}`).get(...pp).c;
        const expired = logisticsDb.prepare(`SELECT COUNT(*) as c FROM training_records WHERE expires_date < date('now')${pf}`).get(...pp).c;
        const expiringSoon = logisticsDb.prepare(`SELECT COUNT(*) as c FROM training_records WHERE expires_date BETWEEN date('now') AND date('now', '+30 days')${pf}`).get(...pp).c;
        const courses = logisticsDb.prepare('SELECT COUNT(*) as c FROM training_courses WHERE active = 1').get().c;

        // By category
        const byCategory = logisticsDb.prepare(`
            SELECT c.category, COUNT(r.id) as records
            FROM training_records r
            JOIN training_courses c ON r.course_id = c.id
            WHERE 1=1${pf}
            GROUP BY c.category ORDER BY records DESC
        `).all(...pp);

        // Most completed courses
        const topCourses = logisticsDb.prepare(`
            SELECT course_title, COUNT(*) as completions
            FROM training_records
            WHERE 1=1${pf}
            GROUP BY course_id ORDER BY completions DESC LIMIT 10
        `).all(...pp);

        // Upcoming expiries
        const upcoming = logisticsDb.prepare(`
            SELECT user_name, course_title, expires_date,
                   CAST((julianday(expires_date) - julianday('now')) AS INTEGER) as days_left
            FROM training_records
            WHERE expires_date BETWEEN date('now') AND date('now', '+60 days')
              AND passed = 1${pf}
            ORDER BY expires_date ASC LIMIT 15
        `).all(...pp);

        res.json({
            totalRecords,
            totalEmployees,
            activeCourses: courses,
            expired,
            expiringSoon,
            complianceRate: totalRecords > 0
                ? Math.round(((totalRecords - expired) / totalRecords) * 100)
                : 100,
            byCategory,
            topCourses,
            upcomingExpiries: upcoming,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════════════════
// TRAINING ASSIGNMENTS (required courses per role/department)
// ══════════════════════════════════════════════════════════════════════════

router.get('/assignments', (req, res) => {
    try {
        const assignments = logisticsDb.prepare(`
            SELECT a.*, c.code, c.title, c.category, c.validity_days
            FROM training_assignments a
            JOIN training_courses c ON a.course_id = c.id
            ORDER BY a.role, c.title
        `).all();
        res.json(assignments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/assignments', (req, res) => {
    try {
        const { course_id, role, department, plant_id, required, grace_days } = req.body;
        if (!course_id) return res.status(400).json({ error: 'course_id is required' });
        const result = logisticsDb.prepare(`
            INSERT OR IGNORE INTO training_assignments (course_id, role, department, plant_id, required, grace_days, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(course_id, role || null, department || null, plant_id || null,
               required !== false ? 1 : 0, grace_days || 30, req.user?.Username || 'system');
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/assignments/:id', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM training_assignments WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
