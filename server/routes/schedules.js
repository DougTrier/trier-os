// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — PM Schedule (Frequency Table) Routes
 * =================================================
 * CRUD for the Schedule table — the frequency configuration layer that
 * backs the PM program. While pmSchedules.js handles the full PM workflow,
 * this module provides simpler access to the raw schedule frequency records
 * with pagination, search, and asset-based filtering.
 * All schedule data lives in the plant SQLite database.
 * Mounted at /api/schedules in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /         List schedules (paginated, sortable, search by number/description/asset)
 *   GET    /stats    Schedule KPIs: total active, due this week, overdue, by priority
 *   GET    /:id      Single schedule detail
 *   POST   /         Create a new schedule (ScheduleNumber auto-generated if blank)
 *   PUT    /:id      Update schedule fields (frequency, meter trigger, asset, procedure)
 *
 * RELATIONSHIP TO pmSchedules.js:
 *   schedules.js  → raw CRUD for the Schedule table (frequency config)
 *   pmSchedules.js → higher-level PM operations: due-date forecasting, all-sites view,
 *                    compliance stats, and the PM engine trigger interface
 *
 * SCHEDULE FIELDS (key columns):
 *   ScheduleNumber    — Unique identifier (e.g. PM-001, LUBE-102)
 *   FreqComp          — Frequency in days (e.g. 90 = quarterly)
 *   MeterTrigger      — Meter-based threshold (e.g. trigger every 5000 hours)
 *   LastDoneDate      — Date of last completion (used to calculate next due)
 *   AssetID           — Linked asset (drives context on work order)
 *   ProcedureID       — Linked standard procedure (instructions for the technician)
 *   Priority          — 1 (Emergency) → 5 (Planned/Routine)
 */

const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
    try {
        const { page = 1, limit = 50, sort = 'ScheduleNumber', order = 'ASC', search = '', asset = '' } = req.query;
        let where = [];
        let params = [];

        if (search) {
            where.push(`("ScheduleNumber" LIKE ? OR "Description" LIKE ? OR "AssetID" LIKE ?)`);
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (asset) {
            where.push(`"AssetID" = ?`);
            params.push(asset);
        }

        const result = db.queryPaginated('Schedule', {
            page: parseInt(page), limit: parseInt(limit), orderBy: sort, order,
            where: where.length ? where.join(' AND ') : '', params,
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch schedules' });
    }
});

router.get('/stats', (req, res) => {
    try {
        const activePlant = req.headers['x-plant-id'] || 'Demo_Plant_1';

        // ── All Sites: Aggregate across every plant DB ──
        if (activePlant === 'all_sites') {
            const path = require('path');
            const fs = require('fs');
            const Database = require('better-sqlite3');
            const dataDir = require('../resolve_data_dir');
            const plantsFile = path.join(dataDir, 'plants.json');
            const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

            let totalCount = 0;
            plants.forEach(p => {
                const dbPath = path.join(dataDir, `${p.id}.db`);
                if (!fs.existsSync(dbPath)) return;
                try {
                    const tempDb = new Database(dbPath, { readonly: true });
                    const hasTbl = tempDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='Schedule'`).get();
                    if (hasTbl) {
                        totalCount += tempDb.prepare('SELECT COUNT(*) as count FROM Schedule').get().count || 0;
                    }
                    tempDb.close();
                } catch (e) { console.warn(`[Schedules/stats] Skipping ${p.id}: ${e.message}`); }
            });

            return res.json({ total: totalCount });
        }

        // ── Single Plant: Auto-resolved via AsyncLocalStorage middleware ──
        const total = db.queryOne('SELECT COUNT(*) as count FROM Schedule');
        res.json({ total: total.count });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch schedule stats' });
    }
});

router.get('/:id', (req, res) => {
    try {
        const schedule = db.queryOne('SELECT * FROM Schedule WHERE ScheduleNumber = ?', [req.params.id]);
        if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
        res.json(schedule);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch schedule' });
    }
});

router.post('/', (req, res) => {
    try {
        const fields = req.body;
        const columns = Object.keys(fields);
        const placeholders = columns.map(() => '?').join(', ');
        const values = Object.values(fields);
        const colStr = columns.map(c => `"${c}"`).join(', ');
        const result = db.run(`INSERT INTO Schedule (${colStr}) VALUES (${placeholders})`, values);
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create schedule' });
    }
});

router.put('/:id', (req, res) => {
    try {
        const fields = req.body;
        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        const values = [...Object.values(fields), req.params.id];
        db.run(`UPDATE Schedule SET ${sets} WHERE ScheduleNumber = ?`, values);
        res.json({ success: true, message: 'Schedule updated' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update schedule' });
    }
});

module.exports = router;
