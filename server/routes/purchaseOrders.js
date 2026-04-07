// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Purchase Order (PO) API
 * ====================================
 * Manages vendor purchase orders from requisition through receipt.
 * POs link parts replenishment to vendor pricing and work order cost tracking.
 * All PO data lives in the plant SQLite database (one DB per plant).
 * Mounted at /api/purchase-orders in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /               List all POs for the current plant (all statuses)
 *   POST   /               Create a new PO with line items
 *   PUT    /:partId/:vendorId   Update PO pricing or status for a part–vendor pair
 *   DELETE /:partId/:vendorId   Remove a PO line item
 *
 * PO STATUS WORKFLOW (PurchaseStatuses table):
 *   Draft → Submitted → Approved → Ordered → Partially Received → Received → Closed
 *   Cancelled (terminal state, can be set from any active state)
 *
 * LINKING:
 *   - POs are linked to Parts (PartID foreign key) for auto-replenishment tracking
 *   - POs can reference WorkOrderNumber for direct WO cost attribution
 *   - Vendor pricing from POs updates PartVendor.UnitCost for future quotes
 *
 * LINE ITEMS: Each PO has one or more line items (PartID, Qty, UnitCost, VendorID).
 * The PO total is the sum of all line item subtotals.
 */
const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/purchase-orders
// Fetches Part Vendors and Purchase details
router.get('/', (req, res) => {
    try {
        const d = db.getDb();
        // Safe migrations for Expedited Freight Tracking
        try { d.exec('ALTER TABLE PartVendors ADD COLUMN FreightCost REAL DEFAULT 0'); } catch(e){}
        try { d.exec('ALTER TABLE PartVendors ADD COLUMN IsExpedited INTEGER DEFAULT 0'); } catch(e){}

        const rows = d.prepare(`
            SELECT 
                pv.PartID, 
                pv.VendorID, 
                pv.Manufacturer, 
                pv.ManufNum, 
                pv.VendNum, 
                pv.PurchaseCost, 
                pv.FreightCost,
                pv.IsExpedited,
                pv.PurchaseDate, 
                pv.Comment,
                p.Description as PartDesc
            FROM PartVendors pv
            LEFT JOIN Part p ON pv.PartID = p.ID
            ORDER BY pv.PurchaseDate DESC
            LIMIT 100
        `).all();
        res.json(rows);
    } catch (err) {
        console.error('Error fetching PartVendors:', err.message);
        res.status(500).json({ error: 'Failed to fetch purchase logic: ' + err.message });
    }
});

// POST /api/purchase-orders
router.post('/', (req, res) => {
    try {
        const fields = req.body;
        const columns = Object.keys(fields);
        const placeholders = columns.map(() => '?').join(', ');
        const values = Object.values(fields);
        const colStr = columns.map(c => `"${c}"`).join(', ');
        db.getDb().prepare(`INSERT INTO PartVendors (${colStr}) VALUES (${placeholders})`).run(...values);
        res.status(201).json({ success: true, message: 'Vendor record created successfully' });
    } catch (err) {
        console.error('Error creating PartVendors record:', err.message);
        res.status(500).json({ error: 'Failed to create vendor record: ' + err.message });
    }
});

// PUT /api/purchase-orders/:partId/:vendorId
router.put('/:partId/:vendorId', (req, res) => {
    try {
        const { partId, vendorId } = req.params;
        const fields = req.body;
        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        const values = [...Object.values(fields), partId, vendorId];
        db.getDb().prepare(`UPDATE PartVendors SET ${sets} WHERE PartID = ? AND VendorID = ?`).run(...values);
        res.json({ success: true, message: 'Vendor record updated successfully' });
    } catch (err) {
        console.error('Error updating PartVendors record:', err.message);
        res.status(500).json({ error: 'Failed to update vendor record: ' + err.message });
    }
});

// DELETE /api/purchase-orders/:partId/:vendorId
router.delete('/:partId/:vendorId', (req, res) => {
    try {
        const { partId, vendorId } = req.params;
        db.getDb().prepare('DELETE FROM PartVendors WHERE PartID = ? AND VendorID = ?').run(partId, vendorId);
        res.json({ success: true, message: 'Vendor record deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete vendor record: ' + err.message });
    }
});

module.exports = router;
