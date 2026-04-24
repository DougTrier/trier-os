// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Trier OS — Deterministic Time Machine
 * =======================================
 * Read-only timeline inspection, snapshot anchoring, and shadow branch simulation.
 * All routes require JWT auth. Creator and it_admin roles only.
 *
 * ENDPOINTS:
 *   GET  /api/time-machine/timeline          — EventLog rows, paginated and filtered
 *   GET  /api/time-machine/snapshots         — list StateSnapshot records for a plant
 *   GET  /api/time-machine/seek              — nearest snapshot + events-to-replay count
 *   POST /api/time-machine/snapshot          — create a manual snapshot anchor now
 *   POST /api/time-machine/branch            — open a shadow branch at a past timestamp
 *   GET  /api/time-machine/branch/:branchId/diff     — events that diverged after branch point
 *   POST /api/time-machine/branch/:branchId/simulate — apply a hypothetical change to branch
 *   DELETE /api/time-machine/branch/:branchId        — clean up branch DB file
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { recordStateSnapshot } = require('../ha_sync');
const dataDir = require('../resolve_data_dir');
const validators = require('../validators');

const SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const UUID_REGEX = /^[0-9a-f-]{36}$/i;

// In-memory branch registry
// Structure per entry: { branchId, plantId, dbPath, fromTimestamp, snapshotAt, eventsReplayed, createdAt }
const activeBranches = new Map();

// Helper to replay an event on the branch DB
function replayEvent(branchDb, event) {
    try {
        if (event.EventType === 'INSERT') {
            const payload = typeof event.PayloadAfter === 'string'
                ? JSON.parse(event.PayloadAfter) : event.PayloadAfter;
            if (!payload) return;
            const cols = Object.keys(payload);
            branchDb.prepare(
                `INSERT OR REPLACE INTO "${event.TableName}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`
            ).run(...cols.map(c => payload[c]));

        } else if (event.EventType === 'UPDATE') {
            const after = typeof event.PayloadAfter === 'string'
                ? JSON.parse(event.PayloadAfter) : event.PayloadAfter;
            if (!after) return;
            const pkInfo = branchDb.prepare(`PRAGMA table_info("${event.TableName}")`).all();
            const pk = pkInfo.find(c => c.pk > 0);
            if (!pk) return;
            const setCols = Object.keys(after).filter(c => c !== pk.name);
            if (!setCols.length) return;
            branchDb.prepare(
                `UPDATE "${event.TableName}" SET ${setCols.map(c => `"${c}" = ?`).join(',')} WHERE "${pk.name}" = ?`
            ).run(...setCols.map(c => after[c]), after[pk.name]);

        } else if (event.EventType === 'DELETE') {
            const before = typeof event.PayloadBefore === 'string'
                ? JSON.parse(event.PayloadBefore) : event.PayloadBefore;
            if (!before) return;
            const pkInfo = branchDb.prepare(`PRAGMA table_info("${event.TableName}")`).all();
            const pk = pkInfo.find(c => c.pk > 0);
            if (!pk) return;
            branchDb.prepare(
                `DELETE FROM "${event.TableName}" WHERE "${pk.name}" = ?`
            ).run(before[pk.name]);
        }
    } catch (err) {
        console.warn(`[TIME_MACHINE] replayEvent failed for EventID ${event.EventID}:`, err.message);
    }
}

module.exports = function(db) {

    // Access control — all routes require creator or it_admin
    router.use((req, res, next) => {
        if (!['creator', 'it_admin'].includes(req.user?.role)) {
            return res.status(403).json({ error: 'Time Machine requires creator or it_admin role' });
        }
        next();
    });

    // ── GET /api/time-machine/timeline ──
    router.get('/timeline', (req, res) => {
        try {
            const { plantId, from, to, aggregateType, aggregateId } = req.query;
            let page = parseInt(req.query.page, 10) || 1;
            let limit = parseInt(req.query.limit, 10) || 100;

            if (!plantId || !SAFE_PLANT_ID.test(plantId)) {
                return res.status(400).json({ error: 'Invalid plantId' });
            }

            if (from && isNaN(new Date(from).getTime())) return res.status(400).json({ error: 'Invalid from date' });
            if (to && isNaN(new Date(to).getTime())) return res.status(400).json({ error: 'Invalid to date' });
            if (limit < 1 || limit > 500) limit = 100;

            const allowedAggregates = ['Asset','WorkOrder','WorkOrderTask','MaintenanceSchedule','Part','PurchaseOrder','ProductionLog','EnergyReading'];
            if (aggregateType && !allowedAggregates.includes(aggregateType)) {
                return res.status(400).json({ error: 'Invalid aggregateType' });
            }

            const plantDb = db.getDb(plantId);
            
            let query = 'SELECT * FROM EventLog WHERE 1=1';
            const params = [];
            if (from) { query += ' AND Timestamp >= ?'; params.push(from); }
            if (to) { query += ' AND Timestamp <= ?'; params.push(to); }
            if (aggregateType) { query += ' AND AggregateType = ?'; params.push(aggregateType); }
            if (aggregateId) { query += ' AND AggregateID = ?'; params.push(parseInt(aggregateId, 10)); }
            
            query += ' ORDER BY EventID DESC LIMIT ? OFFSET ?';
            params.push(limit, (page - 1) * limit);

            const events = plantDb.prepare(query).all(...params);
            
            const parsedEvents = events.map(e => ({
                ...e,
                PayloadBefore: e.PayloadBefore ? JSON.parse(e.PayloadBefore) : null,
                PayloadAfter: e.PayloadAfter ? JSON.parse(e.PayloadAfter) : null
            }));

            res.json({ events: parsedEvents, page, limit, hasMore: events.length === limit });
        } catch (err) {
            console.error('[TIME_MACHINE] GET /timeline error:', err.message);
            res.status(500).json({ error: 'Failed to fetch timeline' });
        }
    });

    // ── GET /api/time-machine/snapshots ──
    router.get('/snapshots', (req, res) => {
        try {
            const { plantId } = req.query;
            if (!plantId || !SAFE_PLANT_ID.test(plantId)) return res.status(400).json({ error: 'Invalid plantId' });
            
            const plantDb = db.getDb(plantId);
            const hasTable = plantDb.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='StateSnapshot'"
            ).get();
            if (!hasTable) return res.json({ snapshots: [] });
            
            const snapshots = plantDb.prepare(
                'SELECT * FROM StateSnapshot ORDER BY SnapshotAt DESC LIMIT 50'
            ).all();
            
            res.json({ snapshots });
        } catch (err) {
            console.error('[TIME_MACHINE] GET /snapshots error:', err.message);
            res.status(500).json({ error: 'Failed to fetch snapshots' });
        }
    });

    // ── GET /api/time-machine/seek ──
    router.get('/seek', (req, res) => {
        try {
            const { plantId, timestamp } = req.query;
            if (!plantId || !SAFE_PLANT_ID.test(plantId)) return res.status(400).json({ error: 'Invalid plantId' });
            if (!timestamp || isNaN(new Date(timestamp).getTime())) return res.status(400).json({ error: 'Invalid timestamp' });
            if (new Date(timestamp) > new Date()) return res.status(400).json({ error: 'Timestamp cannot be in the future' });

            const plantDb = db.getDb(plantId);
            const snapshot = plantDb.prepare(
                `SELECT * FROM StateSnapshot WHERE SnapshotAt <= ? ORDER BY SnapshotAt DESC LIMIT 1`
            ).get(timestamp);

            if (!snapshot) {
                return res.json({ canSeek: false, reason: 'No snapshot anchor before that timestamp. Create a snapshot first.' });
            }

            const eventsToReplay = plantDb.prepare(
                `SELECT COUNT(*) as c FROM EventLog WHERE EventID > ? AND Timestamp <= ?`
            ).get(snapshot.EventWatermark, timestamp).c;

            res.json({
                canSeek: true,
                snapshot,
                eventsToReplay,
                targetTimestamp: timestamp
            });
        } catch (err) {
            console.error('[TIME_MACHINE] GET /seek error:', err.message);
            res.status(500).json({ error: 'Failed to seek' });
        }
    });

    // ── POST /api/time-machine/snapshot ──
    router.post('/snapshot', (req, res) => {
        try {
            const { plantId } = req.body;
            if (!plantId || !SAFE_PLANT_ID.test(plantId)) return res.status(400).json({ error: 'Invalid plantId' });

            const plantDb = db.getDb(plantId);

            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23) + '-' + crypto.randomBytes(3).toString('hex');
            const snapshotDir = path.join(dataDir, 'ha_snapshots');
            if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
            const snapshotFile = path.join(snapshotDir, `${plantId}_manual_${ts}.db`);

            plantDb.prepare('VACUUM INTO ?').run(snapshotFile);
            recordStateSnapshot(plantDb, snapshotFile);

            const newSnap = plantDb.prepare(`SELECT * FROM StateSnapshot ORDER BY SnapshotID DESC LIMIT 1`).get();
            res.json({ success: true, snapshot: newSnap });
        } catch (err) {
            console.error('[TIME_MACHINE] POST /snapshot error:', err.message);
            res.status(500).json({ error: 'Failed to create snapshot' });
        }
    });

    // ── POST /api/time-machine/branch ──
    router.post('/branch', (req, res) => {
        try {
            const { plantId, fromTimestamp } = req.body;
            if (!plantId || !SAFE_PLANT_ID.test(plantId)) return res.status(400).json({ error: 'Invalid plantId' });
            if (!fromTimestamp || isNaN(new Date(fromTimestamp).getTime())) return res.status(400).json({ error: 'Invalid fromTimestamp' });
            if (new Date(fromTimestamp) > new Date()) return res.status(400).json({ error: 'Timestamp cannot be in the future' });

            const plantDb = db.getDb(plantId);
            
            // Step 1: Find nearest snapshot at or before fromTimestamp
            const snapshot = plantDb.prepare(
                `SELECT * FROM StateSnapshot WHERE SnapshotAt <= ? ORDER BY SnapshotAt DESC LIMIT 1`
            ).get(fromTimestamp);

            if (!snapshot) return res.status(400).json({ error: 'No snapshot available for that timestamp' });
            if (!fs.existsSync(snapshot.FilePath)) return res.status(500).json({ error: 'Snapshot file is missing from disk' });

            // Step 2: Copy snapshot file
            const branchId = crypto.randomUUID();
            const branchesDir = path.join(dataDir, 'tm_branches');
            if (!fs.existsSync(branchesDir)) fs.mkdirSync(branchesDir, { recursive: true });
            
            const branchPath = path.join(branchesDir, `${branchId}.db`);
            // Ensure branchPath stays within dataDir/tm_branches/
            if (!branchPath.startsWith(path.resolve(branchesDir))) {
                return res.status(400).json({ error: 'Path resolution error' });
            }
            fs.copyFileSync(snapshot.FilePath, branchPath);

            // Step 3: Open branch DB
            const branchDb = new Database(branchPath);

            // Step 4: DROP all el_* triggers on the branch DB
            const triggers = branchDb.prepare(
                `SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'el_%'`
            ).all();
            for (const t of triggers) {
                branchDb.exec(`DROP TRIGGER IF EXISTS "${t.name}"`);
            }

            // Step 5: Replay EventLog events
            const events = plantDb.prepare(
                `SELECT * FROM EventLog WHERE EventID > ? AND Timestamp <= ? ORDER BY EventID ASC`
            ).all(snapshot.EventWatermark, fromTimestamp);

            branchDb.transaction(() => {
                for (const event of events) {
                    replayEvent(branchDb, event);
                }
            })();

            // Step 6: Recreate triggers
            try {
                const migration045 = require('../migrations/045_eventlog_and_triggers');
                migration045.up(branchDb);
            } catch (err) {
                console.warn('[TIME_MACHINE] Failed to recreate triggers on branch:', err.message);
            }
            
            branchDb.close();

            // Step 7: Store branch in activeBranches Map
            activeBranches.set(branchId, {
                branchId,
                plantId,
                dbPath: branchPath,
                fromTimestamp,
                snapshotAt: snapshot.SnapshotAt,
                eventsReplayed: events.length,
                createdAt: new Date().toISOString()
            });

            // Step 8: Return branch info
            res.json({ branchId, plantId, fromTimestamp, snapshotAt: snapshot.SnapshotAt, eventsReplayed: events.length });

        } catch (err) {
            console.error('[TIME_MACHINE] POST /branch error:', err.message);
            res.status(500).json({ error: 'Failed to create branch' });
        }
    });

    // ── GET /api/time-machine/branch/:branchId/diff ──
    router.get('/branch/:branchId/diff', (req, res) => {
        try {
            const branchId = req.params.branchId;
            if (!UUID_REGEX.test(branchId)) return res.status(400).json({ error: 'Invalid branch ID format' });

            const branch = activeBranches.get(branchId);
            if (!branch) return res.status(404).json({ error: 'Branch not found or expired' });
            
            if (!SAFE_PLANT_ID.test(branch.plantId)) return res.status(400).json({ error: 'Invalid plantId in branch' });
            const plantDb = db.getDb(branch.plantId);

            const events = plantDb.prepare(
                `SELECT * FROM EventLog WHERE Timestamp > ? ORDER BY EventID ASC LIMIT 200`
            ).all(branch.fromTimestamp);

            const parsed = events.map(e => ({
                ...e,
                PayloadBefore: e.PayloadBefore ? JSON.parse(e.PayloadBefore) : null,
                PayloadAfter:  e.PayloadAfter  ? JSON.parse(e.PayloadAfter)  : null
            }));

            res.json({ branchId: branch.branchId, fromTimestamp: branch.fromTimestamp, divergedEvents: parsed, count: parsed.length });
        } catch (err) {
            console.error('[TIME_MACHINE] GET /branch/diff error:', err.message);
            res.status(500).json({ error: 'Failed to fetch branch diff' });
        }
    });

    // ── POST /api/time-machine/branch/:branchId/simulate ──
    router.post('/branch/:branchId/simulate', (req, res) => {
        try {
            const branchId = req.params.branchId;
            if (!UUID_REGEX.test(branchId)) return res.status(400).json({ error: 'Invalid branch ID format' });

            const branch = activeBranches.get(branchId);
            if (!branch) return res.status(404).json({ error: 'Branch not found or expired' });

            const { table, operation, payload } = req.body;
            const allowedTables = ['Asset','Work','WorkTask','Schedule','Part','PO','ProductLoss','MeterReadings'];
            
            if (!allowedTables.includes(table)) return res.status(400).json({ error: 'Invalid table' });
            if (!['INSERT', 'UPDATE', 'DELETE'].includes(operation)) return res.status(400).json({ error: 'Invalid operation' });
            if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'Invalid payload' });

            const branchDb = new Database(branch.dbPath);

            const fakeEvent = {
                TableName: table,
                AggregateType: table,
                AggregateID: payload.ID || payload.id || 0,
                EventType: operation,
                PayloadBefore: operation !== 'INSERT' ? payload : null,
                PayloadAfter: operation !== 'DELETE' ? payload : null,
                EventID: 0 // Dummy ID
            };

            replayEvent(branchDb, fakeEvent);

            const lastEvent = branchDb.prepare('SELECT * FROM EventLog ORDER BY EventID DESC LIMIT 1').get();
            branchDb.close();

            if (lastEvent) {
                lastEvent.PayloadBefore = lastEvent.PayloadBefore ? JSON.parse(lastEvent.PayloadBefore) : null;
                lastEvent.PayloadAfter = lastEvent.PayloadAfter ? JSON.parse(lastEvent.PayloadAfter) : null;
            }

            res.json({ success: true, simulatedEvent: lastEvent });
        } catch (err) {
            console.error('[TIME_MACHINE] POST /branch/simulate error:', err.message);
            res.status(500).json({ error: 'Failed to simulate event' });
        }
    });

    // ── DELETE /api/time-machine/branch/:branchId ──
    router.delete('/branch/:branchId', (req, res) => {
        try {
            const branchId = req.params.branchId;
            if (!UUID_REGEX.test(branchId)) return res.status(400).json({ error: 'Invalid branch ID format' });

            const branch = activeBranches.get(branchId);
            if (!branch) return res.status(404).json({ error: 'Branch not found' });

            try {
                if (fs.existsSync(branch.dbPath)) {
                    fs.unlinkSync(branch.dbPath);
                }
            } catch (err) {
                console.warn('[TIME_MACHINE] Branch file delete failed:', err.message);
            }

            activeBranches.delete(branchId);
            res.json({ success: true, branchId });
        } catch (err) {
            console.error('[TIME_MACHINE] DELETE /branch error:', err.message);
            res.status(500).json({ error: 'Failed to delete branch' });
        }
    });

    return router;
};
