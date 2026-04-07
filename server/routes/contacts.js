// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Enterprise Contact Directory API
 * ============================================
 * Plant-level address book for employees, vendors, and contractors.
 * Supports full-text search and type filtering for quick lookup in
 * the field — "who do I call to get this part fast?"
 * All contacts live in the plant SQLite database (one per plant).
 * Mounted at /api/contacts in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /         List contacts (paginated, sortable, filter by type + search text)
 *   GET    /stats    Contact counts grouped by ContactType
 *   GET    /:id      Single contact detail
 *   POST   /         Create a new contact record
 *   PUT    /:id      Update contact fields
 *
 * CONTACT TYPES: Employee | Vendor | Contractor | Emergency | Other
 *
 * SEARCH: Full-text across FirstName, LastName, Company, Email, Phone,
 * Notes — standard SQL LIKE with wildcard wrapping.
 *
 * PAGINATION: ?page=1&limit=50 (defaults). Returns { contacts, total, page, pages }.
 */

const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
    try {
        const { page = 1, limit = 50, sort = 'ID', order = 'ASC', search = '', type = '' } = req.query;
        let where = [];
        let params = [];

        if (search) {
            where.push(`("ID" LIKE ? OR "FirstName" LIKE ? OR "LastName" LIKE ? OR "Company" LIKE ?)`);
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (type) {
            where.push(`"AddrType" = ?`);
            params.push(type);
        }

        const result = db.queryPaginated('Vendors', {
            page: parseInt(page), limit: parseInt(limit), orderBy: sort, order,
            where: where.length ? where.join(' AND ') : '', params,
        });
        res.json(result);
    } catch (err) {
        console.error('GET /api/contacts error:', err);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

router.get('/stats', (req, res) => {
    try {
        const total = db.queryOne('SELECT COUNT(*) as count FROM Vendors');
        res.json({ total: total.count });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch contact stats' });
    }
});

router.get('/:id', (req, res) => {
    try {
        const contact = db.queryOne('SELECT * FROM Vendors WHERE ID = ?', [req.params.id]);
        if (!contact) return res.status(204).send();
        res.json(contact);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch contact' });
    }
});

router.post('/', (req, res) => {
    try {
        const fields = req.body;
        const columns = Object.keys(fields);
        const placeholders = columns.map(() => '?').join(', ');
        const values = Object.values(fields);
        const colStr = columns.map(c => `"${c}"`).join(', ');
        const result = db.run(`INSERT INTO Vendors (${colStr}) VALUES (${placeholders})`, values);
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create contact' });
    }
});

router.put('/:id', (req, res) => {
    try {
        const fields = req.body;
        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        const values = [...Object.values(fields), req.params.id];
        db.run(`UPDATE Vendors SET ${sets} WHERE ID = ?`, values);
        res.json({ success: true, message: 'Contact updated' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update contact' });
    }
});

module.exports = router;
