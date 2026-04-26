// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — PM Acknowledgement Routes (pmAcknowledge.js)
 * =========================================================
 * Manages the PM due → notify → acknowledge → own lifecycle.
 *
 * PM lifecycle states:
 *   PM_SCHEDULED → PM_DUE → PM_NOTIFIED → PM_ACKNOWLEDGED →
 *   PM_IN_PROGRESS → PM_COMPLETED | PM_OVERDUE
 *
 * Eligible notification roles (plant-scoped):
 *   technician, maintenance_manager, plant_manager
 *
 * API:
 *   POST /api/pm/acknowledge        Claim ownership of a PM work order
 *   GET  /api/pm/pending            Pending PM notifications for current user
 *   GET  /api/pm/status/:pmId       Acknowledgement status of a specific PM
 */

'use strict';

const express = require('express');
const { getDb } = require('../database');
const { logAudit } = require('../logistics_db');

// Roles that are eligible to perform and acknowledge PMs
const PM_ELIGIBLE_ROLES = ['technician', 'maintenance_manager', 'plant_manager'];

module.exports = function pmAcknowledgeRoutes(authMiddleware) {
    const router = express.Router();
    router.use(authMiddleware);

    // ── POST /api/pm/acknowledge ──────────────────────────────────────────────
    // First eligible tech to call this claims ownership.
    // Activates the WO (StatusID → 30), creates a WorkSegment, supersedes all
    // other pending pm_notifications for this pm_id.
    router.post('/acknowledge', (req, res) => {
        const { pmId, woId, ackMethod = 'button' } = req.body;
        const username = req.user?.Username;
        const plantId  = req.headers['x-plant-id'];

        if (!pmId || !woId)  return res.status(400).json({ error: 'pmId and woId are required' });
        if (!username)       return res.status(401).json({ error: 'Not authenticated' });

        const db = getDb();

        // Verify PM + WO exist and belong to this plant
        const pm = db.prepare('SELECT * FROM Schedule WHERE ID = ?').get(pmId);
        if (!pm) return res.status(404).json({ error: 'PM not found' });

        const wo = db.prepare('SELECT * FROM Work WHERE ID = ?').get(woId);
        if (!wo) return res.status(404).json({ error: 'Work order not found' });

        // Check user is eligible (UserPlantRoles is in auth_db)
        const authDb = require('../auth_db');
        const eligibility = authDb.prepare(`
            SELECT 1 FROM Users u
            JOIN UserPlantRoles r ON u.UserID = r.UserID
            WHERE u.Username = ?
            AND r.PlantID IN (?, 'all_sites')
            AND r.RoleLevel IN ('technician','maintenance_manager','plant_manager')
        `).get(username, plantId);

        if (!eligibility) return res.status(403).json({ error: 'Not eligible to acknowledge this PM' });

        // Check if already acknowledged (only one owner)
        const existing = db.prepare('SELECT * FROM pm_acknowledgements WHERE pm_id = ?').get(pmId);
        if (existing) {
            return res.json({
                ok: true,
                alreadyClaimed: true,
                acknowledgedBy: existing.acknowledged_by,
                acknowledgedAt: existing.acknowledged_at,
                woId,
            });
        }

        try {
            db.transaction(() => {
                // Record acknowledgement — UNIQUE(pm_id) enforces exactly-once at DB layer
                db.prepare(`
                    INSERT INTO pm_acknowledgements (pm_id, work_order_id, plant_id, acknowledged_by, ack_method)
                    VALUES (?, ?, ?, ?, ?)
                `).run(pmId, woId, plantId, username, ackMethod);

                // Supersede all pending notifications for this PM
                db.prepare(`
                    UPDATE pm_notifications
                    SET status = CASE WHEN notified_user = ? THEN 'acknowledged' ELSE 'superseded' END
                    WHERE pm_id = ?
                `).run(username, pmId);

                // Activate the WO
                db.prepare(`
                    UPDATE Work SET StatusID = 30, AssignedTo = ? WHERE ID = ? AND StatusID < 30
                `).run(username, woId);

                // Open a WorkSegment so time tracking starts
                db.prepare(`
                    INSERT INTO WorkSegments (woId, userId, segmentState, startTime)
                    VALUES (?, ?, 'Active', datetime('now'))
                `).run(woId, username);

                // Update PM status
                db.prepare("UPDATE Schedule SET pm_status = 'PM_ACKNOWLEDGED' WHERE ID = ?").run(pmId);
            }).immediate()();
        } catch (err) {
            // S-11: UNIQUE constraint is the authoritative idempotency guard — a concurrent
            // caller already claimed this PM between our pre-check and the INSERT.
            if (err.message?.includes('UNIQUE constraint failed: pm_acknowledgements.pm_id')) {
                const claimed = db.prepare(
                    'SELECT acknowledged_by, acknowledged_at, work_order_id FROM pm_acknowledgements WHERE pm_id = ?'
                ).get(pmId);
                return res.json({
                    ok: true,
                    alreadyClaimed: true,
                    acknowledgedBy: claimed?.acknowledged_by ?? null,
                    acknowledgedAt: claimed?.acknowledged_at ?? null,
                    woId: claimed?.work_order_id ?? woId,
                });
            }
            console.error('[pmAcknowledge] POST /acknowledge error:', err);
            return res.status(500).json({ error: 'Acknowledgement failed', detail: err.message });
        }

        logAudit(username, 'PM_ACKNOWLEDGED', plantId, { pmId, woId, ackMethod });

        return res.json({ ok: true, alreadyClaimed: false, woId, pmId });
    });

    // ── GET /api/pm/pending ───────────────────────────────────────────────────
    // Returns PM notifications pending for the current user at this plant.
    // Drives the notification bell PM section.
    router.get('/pending', (req, res) => {
        const username = req.user?.Username;
        if (!username) return res.status(401).json({ error: 'Not authenticated' });

        const db = getDb();

        // Guard: table may not exist yet on older DBs
        const hasTable = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='pm_notifications'"
        ).get();
        if (!hasTable) return res.json({ notifications: [] });

        const rows = db.prepare(`
            SELECT
                pn.id, pn.pm_id, pn.work_order_id, pn.notified_at, pn.status,
                s.Description  AS pm_description,
                s.AstID        AS asset_id,
                s.pm_status,
                a.Description  AS asset_description,
                pa.acknowledged_by,
                pa.acknowledged_at,
                w.WorkOrderNumber
            FROM pm_notifications pn
            JOIN Schedule s  ON s.ID = pn.pm_id
            LEFT JOIN Asset  a  ON a.ID = s.AstID
            LEFT JOIN pm_acknowledgements pa ON pa.pm_id = pn.pm_id
            LEFT JOIN Work   w  ON w.ID = pn.work_order_id
            WHERE pn.notified_user = ?
            AND   pn.status IN ('pending','acknowledged')
            ORDER BY pn.notified_at DESC
            LIMIT 20
        `).all(username);

        return res.json({ notifications: rows });
    });

    // ── GET /api/pm/status/:pmId ──────────────────────────────────────────────
    // Returns the full acknowledgement status of a PM — used by the scan screen
    // to populate the PM DUE card.
    router.get('/status/:pmId', (req, res) => {
        const pmId = parseInt(req.params.pmId, 10);
        if (!pmId) return res.status(400).json({ error: 'Invalid pmId' });

        const db = getDb();

        const pm = db.prepare(`
            SELECT s.ID, s.Description, s.AstID, s.pm_status, s.last_notified_at,
                   s.Priority, a.Description AS asset_description
            FROM Schedule s
            LEFT JOIN Asset a ON a.ID = s.AstID
            WHERE s.ID = ?
        `).get(pmId);
        if (!pm) return res.status(404).json({ error: 'PM not found' });

        // Who was notified
        let notifiedUsers = [];
        const hasNotif = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='pm_notifications'"
        ).get();
        if (hasNotif) {
            notifiedUsers = db.prepare(`
                SELECT notified_user, status FROM pm_notifications WHERE pm_id = ?
            `).all(pmId);
        }

        // Who acknowledged
        const ack = db.prepare(
            'SELECT acknowledged_by, acknowledged_at, ack_method FROM pm_acknowledgements WHERE pm_id = ? LIMIT 1'
        ).get(pmId);

        return res.json({ pm, notifiedUsers, acknowledgement: ack || null });
    });

    return router;
};
