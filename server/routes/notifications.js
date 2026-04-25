// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Notification Intelligence Engine
 * ============================================
 * Real-time notification aggregator: scans multiple data sources each
 * request and assembles a prioritized alert feed for the current plant.
 * Mounted at /api/notifications in server/index.js.
 *
 * ENDPOINTS:
 *   GET /    Unified notification feed — aggregates all categories below
 *
 * NOTIFICATION CATEGORIES (assembled in priority order):
 *   EMERGENCY_WO       — Priority-1 open work orders at the current plant
 *   TRANSFER_PENDING   — Inter-plant part transfer requests awaiting approval
 *   LOW_STOCK          — Parts below MinStock threshold at the current plant
 *   PM_OVERDUE         — Scheduled PMs past their due date
 *   SENSOR_ALARM       — Active sensor readings outside safe thresholds
 *
 * SEVERITY LEVELS: CRITICAL > WARNING > INFO
 *   CRITICAL = P1 work orders, out-of-range sensor alarms
 *   WARNING  = Low stock, overdue PMs, pending transfers
 *   INFO     = General informational items
 *
 * Each notification includes: type, title, message, date, severity, link
 *   The `link` field is a client-side route for one-click navigation.
 *
 * DESIGN NOTE: This endpoint intentionally runs live queries on every call
 * rather than maintaining a persistent notification table. This ensures
 * notifications always reflect current state (no stale data). For high-traffic
 * deployments, add a short TTL cache (30–60s) in front of this handler.
 *
 * MULTI-SITE: Pass x-plant-id: all_sites to get a cross-plant aggregate
 * (currently only EMERGENCY_WO is skipped for all_sites to avoid noise).
 */
const express = require('express');
const router = express.Router();
const db = require('../database');
const logisticsDb = require('../logistics_db').db;

router.get('/', (req, res) => {
    try {
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';

        const notifications = [];

        // 1. Check for Emergency (P1) Work Orders at this plant
        if (plantId !== 'all_sites') {
            const emergencyWOs = db.queryAll(`
                SELECT WorkOrderNumber, Description, AddDate 
                FROM Work 
                WHERE Priority = '1' AND StatusID NOT IN (7, 8, 9) -- Not Closed/Cancelled
                ORDER BY AddDate DESC LIMIT 5
            `);
            
            emergencyWOs.forEach(wo => {
                notifications.push({
                    type: 'EMERGENCY_WO',
                    title: `P1 Emergency: ${wo.WorkOrderNumber}`,
                    message: wo.Description,
                    date: wo.AddDate,
                    severity: 'CRITICAL',
                    link: `/jobs?search=${wo.WorkOrderNumber}`
                });
            });
        }

        // 2. Check for PENDING inter-plant transfers for this plant
        if (plantId !== 'all_sites') {
            const pendingTransfers = logisticsDb.prepare(`
                SELECT * FROM Transfers 
                WHERE FulfillingPlant = ? AND Status = 'PENDING'
                ORDER BY ReqDate DESC LIMIT 5
            `).all(plantId);

            pendingTransfers.forEach(t => {
                notifications.push({
                    type: 'TRANSFER_REQ',
                    title: `Part Request from ${t.RequestingPlant}`,
                    message: `Needs Part ${t.PartID} (Qty: ${t.Quantity})`,
                    date: t.ReqDate,
                    severity: 'WARNING',
                    link: `/parts?tab=logistics`
                });
            });
        }

        // 3. System-wide Critical Alerts (Audit Log)
        const criticalAudit = logisticsDb.prepare(`
            SELECT * FROM AuditLog 
            WHERE Severity IN ('CRITICAL', 'ERROR') 
            AND (PlantID = ? OR PlantID IS NULL)
            ORDER BY Timestamp DESC LIMIT 5
        `).all(plantId);

        criticalAudit.forEach(a => {
            notifications.push({
                type: 'SYSTEM_ALERT',
                title: `System Alert: ${a.Action}`,
                message: a.Details ? JSON.parse(a.Details).message || a.Action : a.Action,
                date: a.Timestamp,
                severity: a.Severity,
                link: '#'
            });
        });

        // 4. Predictive Risk Alerts — from MasterAssetIndex
        try {
            const path = require('path');
            const Database = require('better-sqlite3');
            const masterDbPath = path.join(require('../resolve_data_dir'), 'master_index.db');
            const fs = require('fs');
            if (fs.existsSync(masterDbPath)) {
                const masterDb = new Database(masterDbPath, { readonly: true });
                
                // Critical: assets with health < 50 or predicted failure in < 14 days
                const riskyAssets = masterDb.prepare(`
                    SELECT assetId, plantLabel, healthScore, riskLevel, mtbfDays, predictedFailureDate, mtbfTrend
                    FROM MasterAssetIndex 
                    WHERE (healthScore < 50 OR (predictedFailureDate IS NOT NULL AND predictedFailureDate <= date('now', '+14 days')))
                    ORDER BY healthScore ASC 
                    LIMIT 8
                `).all();

                riskyAssets.forEach(asset => {
                    const daysUntilFailure = asset.predictedFailureDate 
                        ? Math.ceil((new Date(asset.predictedFailureDate) - new Date()) / (1000 * 60 * 60 * 24))
                        : null;

                    const isCritical = asset.healthScore < 30 || (daysUntilFailure !== null && daysUntilFailure < 7);
                    
                    notifications.push({
                        type: 'PREDICTIVE_ALERT',
                        title: `⚠️ Predictive Alert: ${asset.assetId}`,
                        message: daysUntilFailure !== null && daysUntilFailure <= 14
                            ? `Predicted failure in ${daysUntilFailure} day${daysUntilFailure !== 1 ? 's' : ''} at ${asset.plantLabel}. Health: ${asset.healthScore}%. Trend: ${asset.mtbfTrend || 'unknown'}`
                            : `Health score ${asset.healthScore}% (${asset.riskLevel}) at ${asset.plantLabel}. MTBF: ${asset.mtbfDays || '?'} days`,
                        date: new Date().toISOString(),
                        severity: isCritical ? 'CRITICAL' : 'WARNING',
                        link: `/assets?search=${encodeURIComponent(asset.assetId)}`
                    });
                });

                masterDb.close();
            }
        } catch (e) {
            // Master index may not exist yet — that's ok
        }

        // 5. Active Escalation Alerts (unacknowledged)
        try {
            const hasEscLog = logisticsDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='EscalationLog'`).get();
            if (hasEscLog) {
                const escalations = logisticsDb.prepare(`
                    SELECT * FROM EscalationLog
                    WHERE Acknowledged = 0
                    ORDER BY EscalationTier DESC, EscalatedAt DESC
                    LIMIT 10
                `).all();

                const ROLE_LABELS = {
                    maintenance_manager: 'Maintenance Manager',
                    plant_manager: 'Plant Manager',
                    general_manager: 'General Manager',
                    corporate: 'Corporate',
                };

                escalations.forEach(e => {
                    notifications.push({
                        type: 'ESCALATION',
                        title: `⚡ Tier ${e.EscalationTier} Escalation: WO #${e.WorkOrderID}`,
                        message: `${e.WODescription || 'Work order'} at ${e.PlantLabel || e.PlantID} — escalated to ${ROLE_LABELS[e.TargetRole] || e.TargetRole}. Unstarted for ${e.ActualDelayMinutes || '?'} min.`,
                        date: e.EscalatedAt,
                        severity: e.EscalationTier >= 3 ? 'CRITICAL' : 'WARNING',
                        link: `/settings?tab=notifications`,
                        escalationId: e.ID
                    });
                });
            }
        } catch (e) {
            // EscalationLog table may not exist yet
        }

        // 6. Warranty Expiry Alerts (cross-plant scan for warranties expiring within 60 days)
        try {
            const path = require('path');
            const fs = require('fs');
            const Database = require('better-sqlite3');
            const dataDir = require('../resolve_data_dir');
            const plantsFile = path.join(dataDir, 'plants.json');
            if (fs.existsSync(plantsFile)) {
                const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
                const today = new Date().toISOString().split('T')[0];
                const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const now = new Date();

                plants.forEach(p => {
                    const dbPath = path.join(dataDir, `${p.id}.db`);
                    if (!fs.existsSync(dbPath)) return;
                    try {
                        const tempDb = new Database(dbPath, { readonly: true });
                        const cols = tempDb.prepare(`PRAGMA table_info(Asset)`).all();
                        if (cols.some(c => c.name === 'WarrantyEnd')) {
                            const expiring = tempDb.prepare(`
                                SELECT ID, Description, WarrantyEnd, WarrantyVendor
                                FROM Asset
                                WHERE WarrantyEnd IS NOT NULL AND WarrantyEnd != ''
                                  AND WarrantyEnd >= ? AND WarrantyEnd <= ?
                                  AND (IsDeleted IS NULL OR IsDeleted = 0)
                                ORDER BY WarrantyEnd ASC
                                LIMIT 5
                            `).all(today, futureDate);

                            expiring.forEach(a => {
                                const endDate = new Date(a.WarrantyEnd);
                                const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
                                const isCritical = daysLeft <= 14;
                                notifications.push({
                                    type: 'WARRANTY_EXPIRY',
                                    title: `🛡️ Warranty ${isCritical ? 'Expiring!' : 'Ending Soon'}: ${a.Description || a.ID}`,
                                    message: `${a.Description || 'Asset'} at ${p.label} — warranty expires ${a.WarrantyEnd} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left).${a.WarrantyVendor ? ` Vendor: ${a.WarrantyVendor}` : ''}`,
                                    date: new Date(Date.now() - daysLeft * 1000).toISOString(), // Urgency-weighted date
                                    severity: isCritical ? 'CRITICAL' : 'WARNING',
                                    link: `/assets?search=${encodeURIComponent(a.ID)}`
                                });
                            });
                        }
                        tempDb.close();
                    } catch (e) { /* skip plants without Asset table */ }
                });
            }
        } catch (e) {
            // Warranty scan is best-effort
        }

        // ── PM Due notifications for this user ───────────────────────────────
        try {
            const username = req.user?.Username;
            if (username && plantId !== 'all_sites') {
                const plantDb = db(); // resolves to the plant DB via AsyncLocalStorage context
                const hasPmNotif = plantDb.prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='pm_notifications'"
                ).get();

                if (hasPmNotif) {
                    const pmNotifs = plantDb.prepare(`
                        SELECT pn.pm_id, pn.work_order_id, pn.notified_at,
                               s.Description AS pm_description,
                               s.AstID       AS asset_id,
                               a.Description AS asset_description,
                               pa.acknowledged_by,
                               w.WorkOrderNumber
                        FROM pm_notifications pn
                        JOIN Schedule s ON s.ID = pn.pm_id
                        LEFT JOIN Asset a  ON a.ID = s.AstID
                        LEFT JOIN pm_acknowledgements pa ON pa.pm_id = pn.pm_id
                        LEFT JOIN Work   w  ON w.ID = pn.work_order_id
                        WHERE pn.notified_user = ?
                        AND   pn.status = 'pending'
                        ORDER BY pn.notified_at DESC LIMIT 10
                    `).all(username);

                    pmNotifs.forEach(n => {
                        const claimed = n.acknowledged_by && n.acknowledged_by !== username;
                        notifications.push({
                            type: 'PM_DUE',
                            title: `PM Due: ${n.pm_description}`,
                            message: claimed
                                ? `Acknowledged by ${n.acknowledged_by}. Tap to view WO.`
                                : `${n.asset_description || n.asset_id || 'Asset'} — tap to acknowledge`,
                            date: n.notified_at,
                            severity: claimed ? 'INFO' : 'WARNING',
                            link: n.asset_id ? `/scanner?asset=${encodeURIComponent(n.asset_id)}` : '/jobs',
                        });
                    });
                }
            }
        } catch (_) { /* non-blocking */ }

        // Sort by date descending
        notifications.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(notifications);
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

module.exports = router;
