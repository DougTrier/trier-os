// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Vendor Portal & RFQ Management API
 * ================================================
 * External-facing module giving approved vendors limited, token-based
 * access to view their open RFQs, submit quotes, and exchange messages
 * without requiring a full Trier OS account. Eliminates email RFQ chaos.
 * All portal data in trier_logistics.db. Mounted at /api/vendor-portal.
 *
 * ENDPOINTS:
 *   GET    /vendors                      List vendors registered in the portal
 *   POST   /vendors/:id/grant-access     Issue a portal access token to a vendor
 *   POST   /vendors/:id/revoke-access    Revoke a vendor's portal access
 *   GET    /vendors/:id                  Vendor profile + portal status
 *   PUT    /vendors/:id                  Update vendor profile fields
 *
 *   GET    /rfq                          List RFQs (filter by vendor, status, plant)
 *   GET    /rfq/:id                      Full RFQ with line items and vendor quotes
 *   POST   /rfq                          Create a new RFQ (triggers vendor notification)
 *   POST   /rfq/:id/items                Add a line item to an open RFQ
 *   PUT    /rfq/:id/items/:itemId        Update a line item (qty, spec, deadline)
 *   PUT    /rfq/:id                      Update RFQ status (Open→Awarded/Cancelled)
 *
 *   GET    /messages/:vendorId           Message thread with a specific vendor
 *   POST   /messages                     Send a message to/from a vendor
 *
 * VENDOR ACCESS TOKENS: Generated via crypto.randomBytes(32).toString('hex').
 *   Stored in vendor_portal_access table with IsActive flag. Tokens are passed
 *   by the vendor's browser in x-vendor-token header on portal API calls.
 *   Trier OS staff use their normal JWT for the same endpoints.
 *
 * RFQ STATUS WORKFLOW:
 *   Draft → Open (vendor can see) → Awarded (PO issued) | Cancelled
 *   Vendors submit quotes by updating RFQ line items with their unit price + lead time.
 *
 * TABLES (trier_logistics.db):
 *   vendor_portal_access   — Token registry per vendor with grant/revoke timestamps
 *   vendor_rfqs            — RFQ headers (plant, due date, status, notes)
 *   vendor_rfq_items       — Line items (part, qty, spec, vendor quote, unit price)
 *   vendor_messages        — Internal ↔ vendor message thread per RFQ
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db: logisticsDb, logAudit } = require('../logistics_db');

function initVendorPortalTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS vendor_portal_access (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            VendorID TEXT NOT NULL,
            ContactName TEXT,
            ContactEmail TEXT,
            AccessToken TEXT UNIQUE,
            TokenExpiry TEXT,
            LastLogin TEXT,
            Active INTEGER DEFAULT 1,
            CreatedAt TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS vendor_rfq (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            RFQNumber TEXT UNIQUE,
            VendorID TEXT,
            Title TEXT NOT NULL,
            Description TEXT,
            DueDate TEXT,
            Status TEXT DEFAULT 'Open',
            PlantID TEXT,
            RequestedBy TEXT,
            AwardedDate TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS vendor_rfq_items (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            RFQID INTEGER NOT NULL,
            PartNumber TEXT,
            Description TEXT NOT NULL,
            Quantity REAL DEFAULT 1,
            Unit TEXT DEFAULT 'EA',
            TargetPrice REAL,
            QuotedPrice REAL,
            LeadTimeDays INTEGER,
            Notes TEXT,
            FOREIGN KEY (RFQID) REFERENCES vendor_rfq(ID)
        );
        CREATE TABLE IF NOT EXISTS vendor_messages (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            VendorID TEXT NOT NULL,
            Direction TEXT DEFAULT 'Outbound',
            Subject TEXT,
            Body TEXT NOT NULL,
            SentBy TEXT,
            ReadAt TEXT,
            CreatedAt TEXT DEFAULT (datetime('now'))
        );
    `);
    console.log('[VENDOR-PORTAL] Tables initialized');
}
initVendorPortalTables();

function nextRFQ() {
    const year = new Date().getFullYear();
    const last = logisticsDb.prepare("SELECT RFQNumber FROM vendor_rfq WHERE RFQNumber LIKE ? ORDER BY ID DESC LIMIT 1").get(`RFQ-${year}-%`);
    if (last) { const n = parseInt(last.RFQNumber.split('-')[2]) + 1; return `RFQ-${year}-${String(n).padStart(4, '0')}`; }
    return `RFQ-${year}-0001`;
}

// ── Vendor Access Management ────────────────────────────────────
router.get('/vendors', (req, res) => {
    try {
        const vendors = logisticsDb.prepare('SELECT * FROM vendor_portal_access ORDER BY Active DESC, CreatedAt DESC').all();
        // Mask tokens in response
        vendors.forEach(v => { if (v.AccessToken) v.AccessToken = v.AccessToken.substring(0, 8) + '...'; });
        res.json(vendors);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch vendor access list' }); }
});

router.post('/vendors/:id/grant-access', (req, res) => {
    try {
        const { contactName, contactEmail, expiryDays } = req.body;
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + (expiryDays || 90) * 86400000).toISOString();
        // Upsert: update if exists, insert if not
        const existing = logisticsDb.prepare('SELECT ID FROM vendor_portal_access WHERE VendorID = ?').get(req.params.id);
        if (existing) {
            logisticsDb.prepare('UPDATE vendor_portal_access SET AccessToken=?, TokenExpiry=?, ContactName=?, ContactEmail=?, Active=1 WHERE ID=?').run(token, expiry, contactName || null, contactEmail || null, existing.ID);
        } else {
            logisticsDb.prepare('INSERT INTO vendor_portal_access (VendorID, ContactName, ContactEmail, AccessToken, TokenExpiry) VALUES (?,?,?,?,?)').run(req.params.id, contactName || null, contactEmail || null, token, expiry);
        }
        try { logAudit('VENDOR_ACCESS_GRANTED', req.user?.Username || 'system', null, { vendorId: req.params.id }); } catch(e) {}
        res.json({ success: true, token, expiresAt: expiry });
    } catch (err) { res.status(500).json({ error: 'Failed to grant access' }); }
});

router.post('/vendors/:id/revoke-access', (req, res) => {
    try {
        logisticsDb.prepare('UPDATE vendor_portal_access SET Active=0, AccessToken=NULL WHERE VendorID=?').run(req.params.id);
        try { logAudit('VENDOR_ACCESS_REVOKED', req.user?.Username || 'system', null, { vendorId: req.params.id }); } catch(e) {}
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to revoke access' }); }
});

router.get('/vendors/:id', (req, res) => {
    try {
        const v = logisticsDb.prepare('SELECT * FROM vendor_portal_access WHERE ID=?').get(req.params.id);
        if (!v) return res.status(404).json({ error: 'Vendor access not found' });
        if (v.AccessToken) v.AccessToken = v.AccessToken.substring(0, 8) + '...';
        const messages = logisticsDb.prepare('SELECT * FROM vendor_messages WHERE VendorID=? ORDER BY CreatedAt DESC LIMIT 20').all(v.VendorID);
        const rfqs = logisticsDb.prepare('SELECT * FROM vendor_rfq WHERE VendorID=? ORDER BY CreatedAt DESC').all(v.VendorID);
        res.json({ vendor: v, messages, rfqs });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch vendor detail' }); }
});

router.put('/vendors/:id', (req, res) => {
    try {
        const allowed = ['ContactName', 'ContactEmail', 'Active'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        if (f.length === 0) return res.json({ success: true });
        v.push(req.params.id);
        logisticsDb.prepare(`UPDATE vendor_portal_access SET ${f.join(',')} WHERE ID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update vendor' }); }
});

// ── RFQ (Request for Quote) ─────────────────────────────────────
router.get('/rfq', (req, res) => {
    try {
        const { vendor, status, plant } = req.query;
        let sql = 'SELECT r.*, COUNT(i.ID) as itemCount FROM vendor_rfq r LEFT JOIN vendor_rfq_items i ON r.ID=i.RFQID WHERE 1=1';
        const p = [];
        if (vendor) { sql += ' AND r.VendorID=?'; p.push(vendor); }
        if (status) { sql += ' AND r.Status=?'; p.push(status); }
        if (plant) { sql += ' AND r.PlantID=?'; p.push(plant); }
        sql += ' GROUP BY r.ID ORDER BY r.CreatedAt DESC';
        res.json(logisticsDb.prepare(sql).all(...p));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch RFQs' }); }
});

router.get('/rfq/:id', (req, res) => {
    try {
        const rfq = logisticsDb.prepare('SELECT * FROM vendor_rfq WHERE ID=?').get(req.params.id);
        if (!rfq) return res.status(404).json({ error: 'RFQ not found' });
        const items = logisticsDb.prepare('SELECT * FROM vendor_rfq_items WHERE RFQID=? ORDER BY ID').all(rfq.ID);
        const totalTarget = items.reduce((s, i) => s + ((i.TargetPrice || 0) * (i.Quantity || 1)), 0);
        const totalQuoted = items.reduce((s, i) => s + ((i.QuotedPrice || 0) * (i.Quantity || 1)), 0);
        res.json({ rfq, items, totalTarget, totalQuoted, savings: totalTarget - totalQuoted });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch RFQ' }); }
});

router.post('/rfq', (req, res) => {
    try {
        const { vendorId, title, description, dueDate, plantId, requestedBy } = req.body;
        if (!title) return res.status(400).json({ error: 'Title required' });
        const rfqNumber = nextRFQ();
        const r = logisticsDb.prepare('INSERT INTO vendor_rfq (RFQNumber, VendorID, Title, Description, DueDate, PlantID, RequestedBy) VALUES (?,?,?,?,?,?,?)').run(rfqNumber, vendorId || null, title, description || null, dueDate || null, plantId || null, requestedBy || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid, rfqNumber });
    } catch (err) { res.status(500).json({ error: 'Failed to create RFQ' }); }
});

router.post('/rfq/:id/items', (req, res) => {
    try {
        const { partNumber, description, quantity, unit, targetPrice } = req.body;
        if (!description) return res.status(400).json({ error: 'Item description required' });
        const r = logisticsDb.prepare('INSERT INTO vendor_rfq_items (RFQID, PartNumber, Description, Quantity, Unit, TargetPrice) VALUES (?,?,?,?,?,?)').run(req.params.id, partNumber || null, description, quantity || 1, unit || 'EA', targetPrice || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to add RFQ item' }); }
});

router.put('/rfq/:id/items/:itemId', (req, res) => {
    try {
        const allowed = ['QuotedPrice', 'LeadTimeDays', 'Notes', 'Quantity', 'TargetPrice'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        if (f.length === 0) return res.json({ success: true });
        v.push(req.params.itemId, req.params.id);
        logisticsDb.prepare(`UPDATE vendor_rfq_items SET ${f.join(',')} WHERE ID=? AND RFQID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update item' }); }
});

router.put('/rfq/:id', (req, res) => {
    try {
        const allowed = ['Title', 'Description', 'Status', 'DueDate', 'AwardedDate', 'VendorID', 'RequestedBy'];
        const f = []; const v = [];
        for (const [k, val] of Object.entries(req.body)) { if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); } }
        if (f.length === 0) return res.json({ success: true });
        f.push("UpdatedAt=datetime('now')"); v.push(req.params.id);
        logisticsDb.prepare(`UPDATE vendor_rfq SET ${f.join(',')} WHERE ID=?`).run(...v);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update RFQ' }); }
});

// ── Vendor Messaging ────────────────────────────────────────────
router.get('/messages/:vendorId', (req, res) => {
    try {
        const messages = logisticsDb.prepare('SELECT * FROM vendor_messages WHERE VendorID=? ORDER BY CreatedAt DESC LIMIT 50').all(req.params.vendorId);
        res.json(messages);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch messages' }); }
});

router.post('/messages', (req, res) => {
    try {
        const { vendorId, direction, subject, body, sentBy } = req.body;
        if (!vendorId || !body) return res.status(400).json({ error: 'Vendor ID and message body required' });
        const r = logisticsDb.prepare('INSERT INTO vendor_messages (VendorID, Direction, Subject, Body, SentBy) VALUES (?,?,?,?,?)').run(vendorId, direction || 'Outbound', subject || null, body, sentBy || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to send message' }); }
});

module.exports = router;
