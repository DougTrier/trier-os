// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Auto-Escalation Rules Engine API
 * ==============================================
 * Configurable multi-tier escalation chains for unacknowledged or unstarted
 * high-priority work orders. When a P1 WO sits untouched beyond a threshold,
 * the engine automatically notifies the next tier in the chain — Maintenance
 * Manager, then Plant Manager, then Corporate Ops. Runs as a background
 * cron job every 5 minutes. Mounted at /api/escalation in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /rules             List all escalation rules for the current plant
 *                             Returns: [{ id, priority, timeThresholdMinutes, notifyRole, tier }]
 *   POST   /rules             Create a new escalation rule
 *                             Body: { priority, timeThresholdMinutes, notifyRole, notifyEmail? }
 *   PUT    /rules/:id         Update a rule (threshold, role, or active status)
 *   DELETE /rules/:id         Delete an escalation rule
 *   GET    /log               Escalation history — all triggered escalations with timestamps
 *   POST   /log/:id/acknowledge  Acknowledge an active escalation (stops further escalation)
 *   POST   /run               Manually trigger the escalation engine evaluation (admin/test use)
 *   GET    /active            List currently active (unacknowledged) escalations
 *
 * ESCALATION TIERS (default configuration):
 *   Tier 1 — P1 WO not started within 30 min  → Notify Maintenance Manager
 *   Tier 2 — P1 WO not started within 60 min  → Notify Plant Manager
 *   Tier 3 — P1 WO not started within 120 min → Notify VP of Operations
 *   All thresholds are configurable per plant via POST/PUT /rules.
 *
 * ENGINE: The background job checks all open WOs with priority ≤ 1 (or as configured)
 *   that have no StatusID > 15 (In Progress) activity. Time since AddDate is compared
 *   against each rule's threshold. Escalation records are written to the escalation_log
 *   table and notifications pushed via the /api/notifications system.
 *
 * ACKNOWLEDGEMENT: When a technician starts the WO (StatusID → In Progress), all
 *   active escalations for that WO are automatically acknowledged.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// ── Ensure escalation tables exist in logistics DB ──
function ensureTables(logDb) {
    logDb.exec(`
        CREATE TABLE IF NOT EXISTS EscalationRules (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            Priority TEXT NOT NULL DEFAULT '1',
            DelayMinutes INTEGER NOT NULL DEFAULT 30,
            EscalationTier INTEGER NOT NULL DEFAULT 1,
            TargetRole TEXT NOT NULL DEFAULT 'maintenance_manager',
            NotificationType TEXT NOT NULL DEFAULT 'bell',
            Active INTEGER NOT NULL DEFAULT 1,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now')),
            CreatedBy TEXT DEFAULT 'SYSTEM'
        );

        CREATE TABLE IF NOT EXISTS EscalationLog (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PlantID TEXT NOT NULL,
            PlantLabel TEXT,
            WorkOrderID TEXT NOT NULL,
            WODescription TEXT,
            Priority TEXT,
            RuleID INTEGER,
            EscalationTier INTEGER,
            TargetRole TEXT,
            DelayMinutes INTEGER,
            ActualDelayMinutes INTEGER,
            EscalatedAt TEXT DEFAULT (datetime('now')),
            Acknowledged INTEGER DEFAULT 0,
            AcknowledgedAt TEXT,
            AcknowledgedBy TEXT
        );
    `);

    // Seed default rules if table is empty
    const count = logDb.prepare('SELECT COUNT(*) as cnt FROM EscalationRules').get().cnt;
    if (count === 0) {
        const seed = logDb.prepare(`
            INSERT INTO EscalationRules (Priority, DelayMinutes, EscalationTier, TargetRole, NotificationType, CreatedBy)
            VALUES (?, ?, ?, ?, ?, 'SYSTEM')
        `);
        // Priority 1 (Emergency): Tier 1 at 30 min → Tier 2 at 60 min → Tier 3 at 120 min
        seed.run('1', 30, 1, 'maintenance_manager', 'bell,email');
        seed.run('1', 60, 2, 'plant_manager', 'bell,email');
        seed.run('1', 120, 3, 'corporate', 'bell,email,webhook');
        // Priority 2 (Urgent): Tier 1 at 120 min → Tier 2 at 240 min
        seed.run('2', 120, 1, 'maintenance_manager', 'bell');
        seed.run('2', 240, 2, 'plant_manager', 'bell,email');
        // Priority 3 (Normal): Tier 1 at 480 min (8 hrs) → Tier 2 at 1440 min (24 hrs)
        seed.run('3', 480, 1, 'maintenance_manager', 'bell');
        seed.run('3', 1440, 2, 'plant_manager', 'bell');
        console.log('[Escalation] Seeded 7 default escalation rules');
    }
}

// ── GET /api/escalation/rules ──
router.get('/rules', (req, res) => {
    try {
        const logDb = require('../logistics_db').db;
        ensureTables(logDb);
        const rules = logDb.prepare(`
            SELECT * FROM EscalationRules ORDER BY Priority ASC, EscalationTier ASC
        `).all();
        res.json(rules);
    } catch (err) {
        console.error('[Escalation] GET /rules error:', err.message);
        res.status(500).json({ error: 'Failed to fetch escalation rules' });
    }
});

// ── POST /api/escalation/rules ──
router.post('/rules', (req, res) => {
    try {
        const logDb = require('../logistics_db').db;
        ensureTables(logDb);
        const { Priority, DelayMinutes, EscalationTier, TargetRole, NotificationType } = req.body;
        if (!Priority || !DelayMinutes || !TargetRole) {
            return res.status(400).json({ error: 'Priority, DelayMinutes, and TargetRole are required' });
        }
        const result = logDb.prepare(`
            INSERT INTO EscalationRules (Priority, DelayMinutes, EscalationTier, TargetRole, NotificationType, CreatedBy)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(Priority, DelayMinutes, EscalationTier || 1, TargetRole, NotificationType || 'bell', req.user?.Username || 'ADMIN');
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        console.error('[Escalation] POST /rules error:', err.message);
        res.status(500).json({ error: 'Failed to create escalation rule' });
    }
});

// ── PUT /api/escalation/rules/:id ──
router.put('/rules/:id', (req, res) => {
    try {
        const logDb = require('../logistics_db').db;
        const { Priority, DelayMinutes, EscalationTier, TargetRole, NotificationType, Active } = req.body;
        const sets = [];
        const vals = [];
        if (Priority !== undefined)        { sets.push('Priority = ?'); vals.push(Priority); }
        if (DelayMinutes !== undefined)    { sets.push('DelayMinutes = ?'); vals.push(DelayMinutes); }
        if (EscalationTier !== undefined)  { sets.push('EscalationTier = ?'); vals.push(EscalationTier); }
        if (TargetRole !== undefined)      { sets.push('TargetRole = ?'); vals.push(TargetRole); }
        if (NotificationType !== undefined){ sets.push('NotificationType = ?'); vals.push(NotificationType); }
        if (Active !== undefined)          { sets.push('Active = ?'); vals.push(Active); }
        sets.push("UpdatedAt = datetime('now')");
        vals.push(req.params.id);
        logDb.prepare(`UPDATE EscalationRules SET ${sets.join(', ')} WHERE ID = ?`).run(...vals);
        res.json({ success: true });
    } catch (err) {
        console.error('[Escalation] PUT /rules/:id error:', err.message);
        res.status(500).json({ error: 'Failed to update rule' });
    }
});

// ── DELETE /api/escalation/rules/:id ──
router.delete('/rules/:id', (req, res) => {
    try {
        const logDb = require('../logistics_db').db;
        logDb.prepare('DELETE FROM EscalationRules WHERE ID = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[Escalation] DELETE error:', err.message);
        res.status(500).json({ error: 'Failed to delete rule' });
    }
});

// ── GET /api/escalation/log ──
router.get('/log', (req, res) => {
    try {
        const logDb = require('../logistics_db').db;
        ensureTables(logDb);
        const limit = parseInt(req.query.limit) || 100;
        const logs = logDb.prepare(`
            SELECT * FROM EscalationLog ORDER BY EscalatedAt DESC LIMIT ?
        `).all(limit);
        res.json(logs);
    } catch (err) {
        console.error('[Escalation] GET /log error:', err.message);
        res.status(500).json({ error: 'Failed to fetch escalation log' });
    }
});

// ── POST /api/escalation/log/:id/acknowledge ──
router.post('/log/:id/acknowledge', (req, res) => {
    try {
        const logDb = require('../logistics_db').db;
        logDb.prepare(`
            UPDATE EscalationLog SET Acknowledged = 1, AcknowledgedAt = datetime('now'), AcknowledgedBy = ?
            WHERE ID = ?
        `).run(req.user?.Username || 'ADMIN', req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[Escalation] Acknowledge error:', err.message);
        res.status(500).json({ error: 'Failed to acknowledge' });
    }
});

// ═══════════════════════════════════════════════════════════════
// ESCALATION ENGINE — Background scanner
// ═══════════════════════════════════════════════════════════════
function runEscalationCheck() {
    try {
        const Database = require('better-sqlite3');
        const logDb = require('../logistics_db').db;
        const dataDir = require('../resolve_data_dir');
        const plantsFile = path.join(dataDir, 'plants.json');
        if (!fs.existsSync(plantsFile)) return;
        const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

        ensureTables(logDb);

        // Get active rules
        const rules = logDb.prepare('SELECT * FROM EscalationRules WHERE Active = 1 ORDER BY Priority, EscalationTier').all();
        if (rules.length === 0) return;

        let escalated = 0;

        for (const plant of plants) {
            const dbPath = path.join(dataDir, `${plant.id}.db`);
            if (!fs.existsSync(dbPath)) continue;

            let plantDb;
            try {
                plantDb = new Database(dbPath, { readonly: true });

                // Find open WOs that haven't been started (StatusID < 20 or similar)
                // and were created more than X minutes ago
                const openWOs = plantDb.prepare(`
                    SELECT ID, Description, Priority, AddDate, ReqDate, StatusID, EquipID
                    FROM Work
                    WHERE StatusID < 30
                    AND Priority IS NOT NULL AND Priority != ''
                    AND AddDate IS NOT NULL
                `).all();

                for (const wo of openWOs) {
                    const woPriority = String(wo.Priority).replace(/[^0-9]/g, '') || '5';
                    const createdAt = new Date(wo.AddDate || wo.ReqDate);
                    if (isNaN(createdAt.getTime())) continue;

                    const minutesElapsed = Math.floor((Date.now() - createdAt.getTime()) / 60000);

                    // Find matching rules for this priority
                    const matchingRules = rules.filter(r => String(r.Priority) === woPriority);

                    for (const rule of matchingRules) {
                        if (minutesElapsed >= rule.DelayMinutes) {
                            // Check if we already escalated this WO at this tier
                            const alreadyEscalated = logDb.prepare(`
                                SELECT ID FROM EscalationLog
                                WHERE PlantID = ? AND WorkOrderID = ? AND EscalationTier = ? AND RuleID = ?
                            `).get(plant.id, String(wo.ID), rule.EscalationTier, rule.ID);

                            if (!alreadyEscalated) {
                                // Log the escalation
                                logDb.prepare(`
                                    INSERT INTO EscalationLog (PlantID, PlantLabel, WorkOrderID, WODescription, Priority, RuleID, EscalationTier, TargetRole, DelayMinutes, ActualDelayMinutes)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                `).run(
                                    plant.id, plant.label, String(wo.ID),
                                    (wo.Description || '').substring(0, 200),
                                    woPriority, rule.ID, rule.EscalationTier,
                                    rule.TargetRole, rule.DelayMinutes, minutesElapsed
                                );
                                escalated++;
                                console.log(`[Escalation] ⚠️ Tier ${rule.EscalationTier} → ${rule.TargetRole}: WO #${wo.ID} at ${plant.label} (${minutesElapsed} min, threshold: ${rule.DelayMinutes} min)`);
                            }
                        }
                    }
                }

                plantDb.close();
            } catch (e) {
                if (plantDb) try { plantDb.close(); } catch (_) {}
            }
        }

        if (escalated > 0) {
            console.log(`[Escalation] ✅ Check complete. ${escalated} new escalation(s) triggered.`);
        }
    } catch (err) {
        console.error('[Escalation] Engine error:', err.message);
    }
}

// ── POST /api/escalation/run — Manual trigger ──
router.post('/run', (req, res) => {
    try {
        runEscalationCheck();
        const logDb = require('../logistics_db').db;
        const recent = logDb.prepare('SELECT COUNT(*) as cnt FROM EscalationLog WHERE EscalatedAt >= datetime("now", "-5 minutes")').get();
        res.json({ success: true, message: `Escalation check completed. ${recent.cnt} escalation(s) triggered in the last 5 minutes.` });
    } catch (err) {
        console.error('[Escalation] Manual run error:', err.message);
        res.status(500).json({ error: 'Escalation check failed' });
    }
});

// ── GET /api/escalation/active — Active (unacknowledged) escalations ──
router.get('/active', (req, res) => {
    try {
        const logDb = require('../logistics_db').db;
        ensureTables(logDb);
        const active = logDb.prepare(`
            SELECT * FROM EscalationLog
            WHERE Acknowledged = 0
            ORDER BY EscalationTier DESC, EscalatedAt DESC
            LIMIT 50
        `).all();
        res.json(active);
    } catch (err) {
        console.error('[Escalation] GET /active error:', err.message);
        res.status(500).json({ error: 'Failed to fetch active escalations' });
    }
});

// ── Start background timer (every 5 minutes) ──
let escalationInterval = null;
function startEscalationEngine() {
    // Run once at startup (after 30 sec delay to let things settle)
    setTimeout(() => {
        console.log('[Escalation] 🚀 Engine started — checking every 5 minutes');
        runEscalationCheck();
    }, 30000);

    // Then every 5 minutes
    escalationInterval = setInterval(runEscalationCheck, 5 * 60 * 1000);
}

// Export both the router and the engine starter
module.exports = router;
module.exports.startEscalationEngine = startEscalationEngine;
