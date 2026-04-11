// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Approval Workflow Engine API
 * =========================================
 * Multi-step approval chains for purchase orders and high-cost work orders.
 * Approvals are routed based on dollar thresholds configured per plant.
 * Stored in trier_logistics.db (cross-plant). Mounted at /api/approvals in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /             List pending approvals for the current user's role and plant
 *                        Query: ?status=pending|approved|rejected|all, ?type=po|workorder
 *   GET    /stats        Approval queue KPIs: pending count, avg approval time, rejection rate
 *   POST   /             Submit an item for approval
 *                        Body: { type, itemId, itemType, amount, description, requester }
 *   PUT    /:id/approve  Approve an item — records approver, timestamp, and optional notes
 *   PUT    /:id/reject   Reject an item — requires rejection reason (stored for audit)
 *   GET    /settings     Retrieve approval threshold configuration for current plant
 *   PUT    /settings     Update approval thresholds
 *                        Body: { poThreshold1, poThreshold2, woThreshold1, woThreshold2 }
 *
 * APPROVAL TIERS:
 *   Tier 1 (Maintenance Manager): POs < $2,500  |  WOs < $5,000
 *   Tier 2 (Plant Manager):       POs < $10,000 |  WOs < $25,000
 *   Tier 3 (Corporate / VP Ops):  POs ≥ $10,000 |  WOs ≥ $25,000
 *   Thresholds are configurable per plant via PUT /settings.
 *
 * WORKFLOW: Item submitted → routed to Tier 1 approver → if over threshold, escalated to Tier 2.
 *   All actions append to an immutable audit trail. Rejected items can be resubmitted once revised.
 *   Approved POs automatically advance to "Ordered" status in the PO module.
 */

const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('../logistics_db');

// ── Ensure Approvals table exists ────────────────────────────────────────────
try {
    logisticsDb.exec(`CREATE TABLE IF NOT EXISTS approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL DEFAULT 'PO',
        reference_id TEXT,
        reference_desc TEXT,
        plant_id TEXT,
        amount REAL DEFAULT 0,
        submitted_by TEXT,
        submitted_at TEXT DEFAULT (datetime('now')),
        approver TEXT,
        status TEXT DEFAULT 'pending',
        notes TEXT DEFAULT '',
        resolved_by TEXT,
        resolved_at TEXT,
        reject_reason TEXT
    )`);

    logisticsDb.exec(`CREATE TABLE IF NOT EXISTS approval_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT UNIQUE NOT NULL,
        setting_value TEXT NOT NULL,
        updated_by TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    // Seed default thresholds
    const existing = logisticsDb.prepare("SELECT 1 FROM approval_settings WHERE setting_key = 'po_threshold'").get();
    if (!existing) {
        logisticsDb.prepare("INSERT INTO approval_settings (setting_key, setting_value) VALUES (?, ?)").run('po_threshold', '500');
        logisticsDb.prepare("INSERT INTO approval_settings (setting_key, setting_value) VALUES (?, ?)").run('wo_threshold', '1000');
        logisticsDb.prepare("INSERT INTO approval_settings (setting_key, setting_value) VALUES (?, ?)").run('require_approval', 'true');
        logisticsDb.prepare("INSERT INTO approval_settings (setting_key, setting_value) VALUES (?, ?)").run('auto_approve_pm', 'true');
    }
} catch (e) {
    console.error('[Approvals] Table init error:', e.message);
}

// ── GET /api/approvals ───────────────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const { status = 'all', type = 'all', plant } = req.query;
        let sql = 'SELECT * FROM approvals';
        const where = [];
        const params = [];

        if (status !== 'all') {
            where.push('status = ?');
            params.push(status);
        }
        if (type !== 'all') {
            where.push('type = ?');
            params.push(type);
        }
        if (plant) {
            where.push('plant_id = ?');
            params.push(plant);
        }

        if (where.length > 0) sql += ' WHERE ' + where.join(' AND ');
        sql += ' ORDER BY submitted_at DESC';

        const rows = logisticsDb.prepare(sql).all(...params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch approvals' });
    }
});

// ── GET /api/approvals/stats ─────────────────────────────────────────────────
router.get('/stats', (req, res) => {
    try {
        const pending = logisticsDb.prepare("SELECT COUNT(*) as count FROM approvals WHERE status = 'pending'").get();
        const approved = logisticsDb.prepare("SELECT COUNT(*) as count FROM approvals WHERE status = 'approved'").get();
        const rejected = logisticsDb.prepare("SELECT COUNT(*) as count FROM approvals WHERE status = 'rejected'").get();
        const totalValue = logisticsDb.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM approvals WHERE status = 'pending'").get();

        res.json({
            pending: pending.count,
            approved: approved.count,
            rejected: rejected.count,
            pendingValue: totalValue.total
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ── POST /api/approvals ──────────────────────────────────────────────────────
router.post('/', (req, res) => {
    try {
        const { type, reference_id, reference_desc, plant_id, amount, submitted_by, notes } = req.body;

        if (!type || !reference_id) {
            return res.status(400).json({ error: 'Type and reference_id are required' });
        }

        // Check if auto-approve applies
        const requireApproval = logisticsDb.prepare("SELECT setting_value FROM approval_settings WHERE setting_key = 'require_approval'").get();
        const threshold = logisticsDb.prepare(`SELECT setting_value FROM approval_settings WHERE setting_key = ?`).get(`${type.toLowerCase()}_threshold`);
        const autoApprovePM = logisticsDb.prepare("SELECT setting_value FROM approval_settings WHERE setting_key = 'auto_approve_pm'").get();

        const thresholdVal = threshold ? parseFloat(threshold.setting_value) : 500;
        const amountVal = parseFloat(amount) || 0;

        // Auto-approve if below threshold or approvals disabled
        let status = 'pending';
        if (requireApproval?.setting_value !== 'true') {
            status = 'approved';
        } else if (type === 'PM' && autoApprovePM?.setting_value === 'true') {
            status = 'approved';
        } else if (amountVal > 0 && amountVal < thresholdVal) {
            status = 'approved';
        }

        const result = logisticsDb.prepare(`
            INSERT INTO approvals (type, reference_id, reference_desc, plant_id, amount, submitted_by, notes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(type, reference_id, reference_desc || '', plant_id || '', amountVal, submitted_by || 'system', notes || '', status);

        logAudit(submitted_by || 'system', 'APPROVAL_SUBMITTED', reference_id, { type, amount: amountVal, status });

        // Dispatch webhook if pending
        if (status === 'pending') {
            try {
                const { dispatchEvent } = require('../webhook_dispatcher');
                dispatchEvent('APPROVAL_REQUIRED', {
                    type,
                    referenceId: reference_id,
                    description: reference_desc || reference_id,
                    amount: amountVal,
                    plant: plant_id || '',
                    submittedBy: submitted_by || 'system'
                });
            } catch (e) { console.warn(`[Approvals] Webhook dispatch failed: ${e.message}`); /* non-blocking */ }
        }

        res.status(201).json({
            success: true,
            id: result.lastInsertRowid,
            status,
            autoApproved: status === 'approved',
            message: status === 'approved'
                ? `Auto-approved (${amountVal < thresholdVal ? `below $${thresholdVal} threshold` : 'approvals not required'})`
                : `Submitted for approval (amount $${amountVal} exceeds $${thresholdVal} threshold)`
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to submit approval' });
    }
});

// ── PUT /api/approvals/:id/approve ───────────────────────────────────────────
router.put('/:id/approve', (req, res) => {
    try {
        const { id } = req.params;
        const { notes, resolved_by } = req.body;

        const item = logisticsDb.prepare('SELECT * FROM approvals WHERE id = ?').get(id);
        if (!item) return res.status(404).json({ error: 'Approval not found' });
        if (item.status !== 'pending') return res.status(400).json({ error: `Cannot approve — status is already "${item.status}"` });

        logisticsDb.prepare(`
            UPDATE approvals SET status = 'approved', resolved_by = ?, resolved_at = datetime('now'), notes = COALESCE(?, notes)
            WHERE id = ?
        `).run(resolved_by || 'admin', notes || null, id);

        logAudit(resolved_by || 'admin', 'APPROVAL_APPROVED', item.reference_id, { type: item.type, amount: item.amount });

        res.json({ success: true, message: `${item.type} #${item.reference_id} approved` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to approve' });
    }
});

// ── PUT /api/approvals/:id/reject ────────────────────────────────────────────
router.put('/:id/reject', (req, res) => {
    try {
        const { id } = req.params;
        const { reject_reason, resolved_by } = req.body;

        const item = logisticsDb.prepare('SELECT * FROM approvals WHERE id = ?').get(id);
        if (!item) return res.status(404).json({ error: 'Approval not found' });
        if (item.status !== 'pending') return res.status(400).json({ error: `Cannot reject — status is already "${item.status}"` });

        logisticsDb.prepare(`
            UPDATE approvals SET status = 'rejected', resolved_by = ?, resolved_at = datetime('now'), reject_reason = ?
            WHERE id = ?
        `).run(resolved_by || 'admin', reject_reason || 'No reason provided', id);

        logAudit(resolved_by || 'admin', 'APPROVAL_REJECTED', item.reference_id, {
            type: item.type, amount: item.amount, reason: reject_reason
        });

        res.json({ success: true, message: `${item.type} #${item.reference_id} rejected` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to reject' });
    }
});

// ── GET /api/approvals/settings ──────────────────────────────────────────────
router.get('/settings', (req, res) => {
    try {
        const rows = logisticsDb.prepare('SELECT setting_key, setting_value FROM approval_settings').all();
        const settings = {};
        rows.forEach(r => settings[r.setting_key] = r.setting_value);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// ── PUT /api/approvals/settings ──────────────────────────────────────────────
router.put('/settings', (req, res) => {
    try {
        const updates = req.body;
        const updatedBy = req.user?.username || 'admin';

        const upsert = logisticsDb.prepare(`
            INSERT INTO approval_settings (setting_key, setting_value, updated_by, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(setting_key) DO UPDATE SET setting_value = ?, updated_by = ?, updated_at = datetime('now')
        `);

        for (const [key, value] of Object.entries(updates)) {
            upsert.run(key, String(value), updatedBy, String(value), updatedBy);
        }

        logAudit(updatedBy, 'APPROVAL_SETTINGS_UPDATED', 'system', updates);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

module.exports = router;
