// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Preventative Maintenance Schedule API
 * =========================================================
 * Full CRUD for the Schedule table — the PM program backbone.
 * ENDPOINTS:
 *   GET    /api/pm-schedules           — List all PM schedules (plant-scoped)
 *   POST   /api/pm-schedules           — Create new PM schedule
 *   PUT    /api/pm-schedules/:id       — Update schedule (frequency, asset, procedure)
 *   DELETE /api/pm-schedules/:id       — Delete a PM schedule
 *   GET    /api/pm-schedules/due       — Schedules due in next N days
 *   POST   /api/pm-schedules/generate  — Manually trigger WO generation for due PMs
 *
 * TRIGGER TYPES:
 *   - Time-based triggers (FreqComp in days)
 *   - Meter-based triggers (MeterTrigger threshold)
 *   - Dual triggers (both time and meter)
 *   - Procedure linking (standard work instructions)
 *   - Asset association and priority assignment
 *
 * The PM Engine (pm_engine.js) reads these schedules on a daily
 * cron to auto-generate [PM-AUTO] work orders when due.
 */
const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/pm-schedules
// Fetch all active PM schedules
router.get('/', (req, res) => {
    try {
        const activePlant = req.headers['x-plant-id'] || 'Demo_Plant_1';

        if (activePlant === 'all_sites') {
            const path = require('path');
            const fs = require('fs');
            const dataDir = require('../resolve_data_dir');
            const plantsFile = path.join(dataDir, 'plants.json');
            const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

            let allSchedules = [];

            plants.forEach(p => {
                const dbPath = path.join(dataDir, `${p.id}.db`);
                if (fs.existsSync(dbPath)) {
                    try {
                        const tempDb = db.getDb(p.id);
                        const hasTbl = tempDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='Schedule'`).get();
                        if (hasTbl) {
                            const rows = tempDb.prepare('SELECT *, ? as plantId, ? as plantLabel FROM Schedule WHERE Active = 1 OR Active IS NULL ORDER BY ID ASC').all(p.id, p.label);
                            allSchedules.push(...rows);
                        }
                    } catch (e) { console.warn(`[PMSchedules] Skipping plant ${p.id}: ${e.message}`); }
                }
            });

            return res.json(allSchedules);
        }

        const rows = db.getDb().prepare('SELECT * FROM Schedule WHERE Active = 1 OR Active IS NULL ORDER BY ID ASC LIMIT 100').all();
        res.json(rows);
    } catch (err) {
        console.error('Error fetching schedules:', err.message);
        res.status(500).json({ error: 'Failed to fetch schedules' });
    }
});

// POST /api/pm-schedules
router.post('/', (req, res) => {
    try {
        const fields = { ...req.body };
        const virtualFields = ['plantId', 'plantLabel', 'LastSyncFromPlant'];
        virtualFields.forEach(f => delete fields[f]);

        const columns = Object.keys(fields);
        const placeholders = columns.map(() => '?').join(', ');
        const values = Object.values(fields);
        const colStr = columns.map(c => `"${c}"`).join(', ');
        db.getDb().prepare(`INSERT INTO Schedule (${colStr}) VALUES (${placeholders})`).run(...values);
        res.status(201).json({ success: true, message: 'PM Schedule created successfully' });
    } catch (err) {
        console.error('Error creating PM Schedule:', err.message);
        res.status(500).json({ error: 'Failed to create PM Schedule: ' + err.message });
    }
});

// ── GET /api/pm-schedules/calendar/events ────────────────────────────────
// IMPORTANT: Must be BEFORE /:id route so 'calendar' isn't treated as an ID
// Returns calendar events: PMs (from Schedule.NextDate) + ALL WOs (from Work)
router.get('/calendar/events', (req, res) => {
    try {
        const { month, year } = req.query;
        const activePlant = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const events = [];

        // Helper: scan a single plant DB
        const scanPlant = (plantDb, plantLabel) => {
            // 1. PM Schedules with NextDate
            try {
                const pms = plantDb.prepare(`
                    SELECT ID, Description, AstID, NextDate, Freq, FreqUnit, Priority, TypeID, AssignToID
                    FROM Schedule WHERE Active = 1 AND NextDate IS NOT NULL
                `).all();

                pms.forEach(pm => {
                    if (!pm.NextDate) return;
                    events.push({
                        id: `pm-${pm.ID}-${plantLabel}`,
                        title: pm.Description || pm.ID,
                        date: pm.NextDate.split('T')[0],
                        type: 'pm',
                        priority: pm.Priority || 100,
                        assetId: pm.AstID,
                        assignedTo: pm.AssignToID,
                        freq: pm.Freq,
                        freqUnit: pm.FreqUnit,
                        color: '#10b981',
                        plantLabel
                    });
                });
            } catch (e) { console.warn(`[Calendar] PM schedule scan failed: ${e.message}`); }

            // 2. ALL Work Orders (completed, open, cancelled — full history)
            try {
                const wos = plantDb.prepare(`
                    SELECT rowid, WorkOrderNumber, Description, AstID, TypeID, StatusID, AddDate, SchDate, CompDate, Priority, AssignToID
                    FROM Work WHERE AddDate IS NOT NULL OR SchDate IS NOT NULL
                `).all();

                wos.forEach(wo => {
                    // Calendar only shows completed or scheduled work — not just "created"
                    const date = wo.CompDate || wo.SchDate;
                    if (!date) return;

                    let color = '#6366f1';
                    let type = 'wo';
                    const desc = (wo.Description || '').toLowerCase();
                    const typeId = (wo.TypeID || '').toString().toLowerCase();
                    const statusId = String(wo.StatusID || '');

                    if (desc.includes('emergency') || typeId.includes('emergency') || wo.Priority <= 1) {
                        color = '#ef4444'; type = 'emergency';
                    } else if (desc.includes('corrective') || typeId.includes('corrective') || typeId.includes('repair')) {
                        color = '#f59e0b'; type = 'corrective';
                    } else if (desc.includes('[pm-auto]') || typeId === 'pm') {
                        color = '#10b981'; type = 'pm';
                    }

                    let statusLabel = 'Open';
                    if (statusId === '50' || statusId.toLowerCase() === 'completed' || statusId.toLowerCase() === 'complete' || statusId.toLowerCase() === 'closed') {
                        statusLabel = 'Completed';
                        if (type === 'wo') color = '#10b981';
                    } else if (statusId === '40' || statusId.toLowerCase() === 'plan') {
                        statusLabel = 'Plan';
                    } else if (statusId === '20') {
                        statusLabel = 'In Progress';
                    } else if (statusId === '10') {
                        statusLabel = 'Requested';
                    } else if (statusId.toLowerCase() === 'cancelled' || statusId.toLowerCase() === 'canceled') {
                        statusLabel = 'Cancelled';
                        color = '#64748b';
                    }

                    events.push({
                        id: `wo-${wo.WorkOrderNumber || wo.rowid}-${plantLabel}`,
                        dbId: wo.rowid,
                        title: wo.Description || wo.WorkOrderNumber || 'Work Order',
                        date: date.split('T')[0].split(' ')[0],
                        type,
                        priority: wo.Priority || 100,
                        assetId: wo.AstID,
                        assignedTo: wo.AssignToID,
                        status: statusLabel,
                        woNumber: wo.WorkOrderNumber,
                        color,
                        plantLabel
                    });
                });
            } catch (e) { console.warn(`[Calendar] WO scan failed: ${e.message}`); }
        };

        if (activePlant === 'all_sites') {
            const path = require('path');
            const fs = require('fs');
            const Database = require('better-sqlite3');
            const dataDir = require('../resolve_data_dir');
            const plantsFile = path.join(dataDir, 'plants.json');
            const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

            plants.forEach(p => {
                const dbPath = path.join(dataDir, `${p.id}.db`);
                if (!fs.existsSync(dbPath)) return;
                try {
                    const plantDb = new Database(dbPath, { readonly: true });
                    scanPlant(plantDb, p.label);
                    plantDb.close();
                } catch (e) { console.warn(`[Calendar] Skipping plant ${p.label}: ${e.message}`); }
            });
        } else {
            const plantDb = db.getDb();
            scanPlant(plantDb, activePlant);
        }

        events.sort((a, b) => a.date.localeCompare(b.date));
        res.json({ events, total: events.length });
    } catch (err) {
        console.error('Calendar events error:', err.message);
        res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
});

// GET /api/pm-schedules/:id
router.get('/:id', (req, res) => {
    try {
        const row = db.getDb().prepare('SELECT * FROM Schedule WHERE ID = ?').get(req.params.id);
        if (row) {
            res.json(row);
        } else {
            res.status(404).json({ error: 'Schedule not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch schedule details' });
    }
});

// PUT /api/pm-schedules/:id
router.put('/:id', (req, res) => {
    try {
        const fields = { ...req.body };
        // Remove virtual/non-db fields
        const virtualFields = ['plantId', 'plantLabel', 'LastSyncFromPlant'];
        virtualFields.forEach(f => delete fields[f]);

        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        const values = [...Object.values(fields), req.params.id];
        
        db.getDb().prepare(`UPDATE Schedule SET ${sets} WHERE ID = ?`).run(...values);
        res.json({ success: true, message: 'PM Schedule updated successfully' });
    } catch (err) {
        console.error('Error updating PM Schedule:', err.message);
        res.status(500).json({ error: 'Failed to update PM Schedule: ' + err.message });
    }
});

// DELETE /api/pm-schedules/:id
router.delete('/:id', (req, res) => {
    try {
        db.getDb().prepare('DELETE FROM Schedule WHERE ID = ?').run(req.params.id);
        res.json({ success: true, message: 'PM Schedule deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete PM Schedule' });
    }
});

module.exports = router;
