// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — SCADA/PLC Sensor Gateway & Auto-WO Engine
 * ================================================================
 * Task 3.1: Accept real-time sensor data from PLCs/SCADA systems and 
 * auto-generate Work Orders when thresholds are exceeded.
 *
 * Supported PLC integrations:
 *   - Allen-Bradley/Rockwell → Ignition MQTT bridge
 *   - Siemens S7 → Node-RED OPC-UA connector
 *   - Generic Modbus → Python polling script → POST to API
 *   - MQTT Broker → Subscribe to topics, forward to API
 *
 * ENDPOINTS:
 *   POST /api/sensors/ingest          — Receive sensor reading from PLC/SCADA bridge
 *   GET  /api/sensors/config          — List registered sensors for plant
 *   GET  /api/sensors/thresholds      — Get alert thresholds per sensor
 *   GET  /api/sensors/readings/:id    — Recent readings for a sensor (chart data)
 *
 * TABLES (in trier_logistics.db):
 *   - sensor_readings:    Time-series data with 30-day retention
 *   - sensor_thresholds:  Configurable min/max per sensor/metric
 *   - sensor_config:      Sensor registry (name, asset link, plant)
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('../logistics_db');
const { dispatchEvent } = require('../webhook_dispatcher');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// ── Ensure Tables Exist ──────────────────────────────────────────────────
function ensureTables() {
    try {
        logisticsDb.exec(`
            CREATE TABLE IF NOT EXISTS sensor_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id TEXT NOT NULL UNIQUE,
                sensor_name TEXT NOT NULL,
                asset_id TEXT DEFAULT '',
                asset_name TEXT DEFAULT '',
                plant_id TEXT DEFAULT '',
                plant_name TEXT DEFAULT '',
                metric TEXT NOT NULL DEFAULT 'temperature',
                unit TEXT DEFAULT '°F',
                location TEXT DEFAULT '',
                protocol TEXT DEFAULT 'http',
                enabled INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                last_reading_at TEXT,
                last_value REAL,
                status TEXT DEFAULT 'offline'
            );

            CREATE TABLE IF NOT EXISTS sensor_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id TEXT NOT NULL,
                asset_id TEXT DEFAULT '',
                metric TEXT NOT NULL,
                value REAL NOT NULL,
                unit TEXT DEFAULT '',
                plant_id TEXT DEFAULT '',
                threshold_exceeded INTEGER DEFAULT 0,
                timestamp TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS sensor_thresholds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id TEXT NOT NULL,
                asset_id TEXT DEFAULT '',
                metric TEXT NOT NULL,
                min_value REAL,
                max_value REAL,
                wo_priority INTEGER DEFAULT 1,
                wo_description_template TEXT DEFAULT 'SENSOR ALERT: {metric} reading of {value}{unit} on {assetName} exceeded threshold',
                enabled INTEGER DEFAULT 1,
                cooldown_minutes INTEGER DEFAULT 30,
                last_triggered_at TEXT,
                auto_wo INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS sensor_monthly_summary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id TEXT NOT NULL,
                plant_id TEXT DEFAULT '',
                metric TEXT NOT NULL,
                unit TEXT DEFAULT '',
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                avg_value REAL,
                min_value REAL,
                max_value REAL,
                reading_count INTEGER DEFAULT 0,
                threshold_exceeded_count INTEGER DEFAULT 0,
                archived_at TEXT DEFAULT (datetime('now')),
                UNIQUE(sensor_id, metric, year, month)
            );

            CREATE INDEX IF NOT EXISTS idx_summary_sensor 
                ON sensor_monthly_summary(sensor_id, year, month);
        `);
    } catch (e) {
        console.warn('Sensor tables init warning:', e.message);
    }
}
ensureTables();

// ── Archive & Purge (30-day raw retention + monthly summaries) ───────────
// Before deleting old readings, compress them into monthly summaries
// so historical data can still be searched and referenced.
function archiveAndPurge() {
    try {
        // Step 1: Find months that have data older than 30 days and haven't been archived yet
        const oldMonths = logisticsDb.prepare(`
            SELECT sensor_id, metric, unit, plant_id,
                   CAST(strftime('%Y', timestamp) AS INTEGER) as year,
                   CAST(strftime('%m', timestamp) AS INTEGER) as month,
                   AVG(value) as avg_value,
                   MIN(value) as min_value,
                   MAX(value) as max_value,
                   COUNT(*) as reading_count,
                   SUM(CASE WHEN threshold_exceeded = 1 THEN 1 ELSE 0 END) as exceeded_count
            FROM sensor_readings
            WHERE timestamp < datetime('now', '-30 days')
            GROUP BY sensor_id, metric, strftime('%Y-%m', timestamp)
        `).all();

        if (oldMonths.length > 0) {
            // Step 2: Upsert monthly summaries
            const upsert = logisticsDb.prepare(`
                INSERT INTO sensor_monthly_summary 
                    (sensor_id, plant_id, metric, unit, year, month, avg_value, min_value, max_value, reading_count, threshold_exceeded_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(sensor_id, metric, year, month) DO UPDATE SET
                    avg_value = excluded.avg_value,
                    min_value = MIN(sensor_monthly_summary.min_value, excluded.min_value),
                    max_value = MAX(sensor_monthly_summary.max_value, excluded.max_value),
                    reading_count = reading_count + excluded.reading_count,
                    threshold_exceeded_count = threshold_exceeded_count + excluded.threshold_exceeded_count,
                    archived_at = datetime('now')
            `);

            const archiveMany = logisticsDb.transaction((rows) => {
                for (const r of rows) {
                    upsert.run(r.sensor_id, r.plant_id || '', r.metric, r.unit || '', 
                               r.year, r.month, r.avg_value, r.min_value, r.max_value,
                               r.reading_count, r.exceeded_count);
                }
            });

            archiveMany(oldMonths);
            console.log(`[Sensors] Archived ${oldMonths.length} monthly summaries`);
        }

        // Step 3: Now safe to delete old raw readings
        const result = logisticsDb.prepare(
            "DELETE FROM sensor_readings WHERE timestamp < datetime('now', '-30 days')"
        ).run();

        if (result.changes > 0) {
            console.log(`[Sensors] Purged ${result.changes} readings older than 30 days`);
        }
    } catch (e) { 
        console.warn('[Sensors] Archive & purge failed:', e.message); 
    }
}
// Run on startup and every 6 hours
archiveAndPurge();
setInterval(archiveAndPurge, 6 * 60 * 60 * 1000);

// ══════════════════════════════════════════════════════════════════════════
// SENSOR READING INGESTION
// ══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/sensors/reading
 * Accept a single sensor reading from PLC/SCADA
 * Body: { sensorId, assetId?, metric, value, unit?, plantId? }
 */
router.post('/reading', async (req, res) => {
    try {
        const { sensorId, assetId, metric, value, unit, plantId } = req.body;

        if (!sensorId || !metric || value === undefined) {
            return res.status(400).json({ 
                error: 'Required fields: sensorId, metric, value' 
            });
        }

        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
            return res.status(400).json({ error: 'value must be a number' });
        }

        const now = new Date().toISOString();

        // 1. Store the reading
        logisticsDb.prepare(`
            INSERT INTO sensor_readings (sensor_id, asset_id, metric, value, unit, plant_id, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(sensorId, assetId || '', metric, numValue, unit || '', plantId || '', now);

        // 2. Update sensor config (auto-register if new)
        const existingSensor = logisticsDb.prepare(
            'SELECT id FROM sensor_config WHERE sensor_id = ?'
        ).get(sensorId);

        if (existingSensor) {
            logisticsDb.prepare(`
                UPDATE sensor_config 
                SET last_reading_at = ?, last_value = ?, status = 'online'
                WHERE sensor_id = ?
            `).run(now, numValue, sensorId);
        } else {
            // Auto-register sensor
            logisticsDb.prepare(`
                INSERT INTO sensor_config (sensor_id, sensor_name, asset_id, metric, unit, plant_id, last_reading_at, last_value, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'online')
            `).run(sensorId, sensorId, assetId || '', metric, unit || '', plantId || '', now, numValue);
        }

        // 3. Check thresholds
        let thresholdExceeded = false;
        let autoWoCreated = null;

        const thresholds = logisticsDb.prepare(`
            SELECT * FROM sensor_thresholds 
            WHERE sensor_id = ? AND metric = ? AND enabled = 1
        `).all(sensorId, metric);

        for (const threshold of thresholds) {
            const exceeded = (threshold.min_value !== null && numValue < threshold.min_value) ||
                           (threshold.max_value !== null && numValue > threshold.max_value);

            if (exceeded) {
                // Check cooldown
                if (threshold.last_triggered_at) {
                    const lastTriggered = new Date(threshold.last_triggered_at);
                    const cooldownMs = (threshold.cooldown_minutes || 30) * 60000;
                    if (Date.now() - lastTriggered.getTime() < cooldownMs) {
                        continue; // Still in cooldown
                    }
                }

                thresholdExceeded = true;

                // Mark threshold exceeded on the reading
                logisticsDb.prepare(`
                    UPDATE sensor_readings SET threshold_exceeded = 1 
                    WHERE sensor_id = ? AND timestamp = ?
                `).run(sensorId, now);

                // Update last triggered
                logisticsDb.prepare(`
                    UPDATE sensor_thresholds SET last_triggered_at = ? WHERE id = ?
                `).run(now, threshold.id);

                // Get sensor config for names
                const sensorInfo = logisticsDb.prepare(
                    'SELECT * FROM sensor_config WHERE sensor_id = ?'
                ).get(sensorId);

                const direction = (threshold.min_value !== null && numValue < threshold.min_value) ? 'LOW' : 'HIGH';
                const thresholdValue = direction === 'LOW' ? threshold.min_value : threshold.max_value;

                // Build WO description from template
                const woDesc = (threshold.wo_description_template || 
                    'SENSOR ALERT: {metric} reading of {value}{unit} on {assetName} exceeded threshold')
                    .replace('{metric}', metric)
                    .replace('{value}', numValue)
                    .replace('{unit}', unit || '')
                    .replace('{assetName}', sensorInfo?.asset_name || sensorInfo?.sensor_name || sensorId)
                    .replace('{sensorId}', sensorId)
                    .replace('{threshold}', thresholdValue)
                    .replace('{direction}', direction);

                // 4. Auto-create Work Order if enabled
                if (threshold.auto_wo) {
                    const woResult = createAutoWorkOrder(
                        sensorInfo?.plant_id || plantId || '',
                        sensorInfo?.asset_id || assetId || '',
                        threshold.wo_priority || 1,
                        `[SENSOR-AUTO] ${woDesc}`,
                        sensorId,
                        metric,
                        numValue,
                        unit || ''
                    );
                    if (woResult) autoWoCreated = woResult;
                }

                // 5. Fire webhook notification
                try {
                    dispatchEvent('SENSOR_THRESHOLD', {
                        sensorId,
                        assetId: sensorInfo?.asset_id || assetId || '',
                        description: woDesc,
                        value: numValue,
                        unit: unit || '',
                        metric,
                        plant: sensorInfo?.plant_name || plantId || '',
                        priority: direction === 'LOW' ? 'LOW THRESHOLD' : 'HIGH THRESHOLD',
                        message: `${direction} alert: ${numValue}${unit || ''} (limit: ${thresholdValue}${unit || ''})`
                    });
                } catch (e) { console.warn(`[Sensors] Webhook dispatch failed: ${e.message}`); /* non-blocking */ }

                // 6. Log to audit trail
                logAudit('SENSOR_GATEWAY', 'THRESHOLD_EXCEEDED', sensorId, {
                    metric, value: numValue, unit, direction, thresholdValue,
                    autoWo: autoWoCreated ? autoWoCreated.woNumber : null
                });

                // Update sensor status
                logisticsDb.prepare(`
                    UPDATE sensor_config SET status = 'alert' WHERE sensor_id = ?
                `).run(sensorId);
            }
        }

        res.status(201).json({
            success: true,
            sensorId,
            value: numValue,
            thresholdExceeded,
            autoWoCreated,
            timestamp: now
        });

    } catch (err) {
        console.error('POST /api/sensors/reading error:', err);
        res.status(500).json({ error: 'Failed to process sensor reading' });
    }
});

/**
 * POST /api/sensors/reading/batch
 * Accept multiple sensor readings at once
 * Body: { readings: [{ sensorId, metric, value, unit?, plantId?, assetId? }, ...] }
 */
router.post('/reading/batch', async (req, res) => {
    try {
        const { readings } = req.body;
        if (!Array.isArray(readings) || readings.length === 0) {
            return res.status(400).json({ error: 'readings array required' });
        }

        const results = [];
        const insert = logisticsDb.prepare(`
            INSERT INTO sensor_readings (sensor_id, asset_id, metric, value, unit, plant_id, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `);

        const batchInsert = logisticsDb.transaction((items) => {
            for (const r of items) {
                if (!r.sensorId || !r.metric || r.value === undefined) continue;
                insert.run(r.sensorId, r.assetId || '', r.metric, parseFloat(r.value), r.unit || '', r.plantId || '');
                results.push({ sensorId: r.sensorId, status: 'ok' });
            }
        });

        batchInsert(readings);
        res.status(201).json({ success: true, processed: results.length });

    } catch (err) {
        res.status(500).json({ error: 'Batch ingestion failed' });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// AUTO WORK ORDER CREATION
// ══════════════════════════════════════════════════════════════════════════

function createAutoWorkOrder(plantId, assetId, priority, description, sensorId, metric, value, unit) {
    try {
        if (!plantId) return null;

        const dbPath = path.join(require('../resolve_data_dir'), `${plantId}.db`);
        if (!fs.existsSync(dbPath)) {
            console.warn(`[Sensor] Plant DB not found: ${plantId}`);
            return null;
        }

        const plantDb = new Database(dbPath);
        
        // Check for duplicate — don't create if there's already an open sensor WO for this asset
        const existingOpen = plantDb.prepare(
            "SELECT 1 FROM Work WHERE Description LIKE ? AND StatusID < 40"
        ).get(`%[SENSOR-AUTO]%${sensorId}%`);

        if (existingOpen) {
            plantDb.close();
            return { skipped: true, reason: 'Open sensor WO already exists' };
        }

        const woNumber = `SNS-${Date.now().toString().slice(-6)}-${sensorId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`;

        plantDb.prepare(`
            INSERT INTO Work (WorkOrderNumber, Description, AstID, Priority, StatusID, AddDate)
            VALUES (?, ?, ?, ?, 10, CURRENT_TIMESTAMP)
        `).run(woNumber, description, assetId, priority);

        plantDb.close();

        console.log(`  🌡️ [Sensor→WO] Auto-created ${woNumber} for ${sensorId} (${metric}: ${value}${unit})`);
        
        logAudit('SENSOR_GATEWAY', 'AUTO_WO_CREATED', plantId, {
            woNumber, sensorId, metric, value, unit, assetId
        });

        return { woNumber, plantId, assetId };

    } catch (err) {
        console.error('Auto-WO creation failed:', err.message);
        return null;
    }
}

// ══════════════════════════════════════════════════════════════════════════
// SENSOR READING QUERIES
// ══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/sensors/readings/:sensorId
 * Reading history for a sensor (default: last 24 hours)
 */
router.get('/readings/:sensorId', (req, res) => {
    try {
        const { sensorId } = req.params;
        const hours = parseInt(req.query.hours) || 24;
        
        const readings = logisticsDb.prepare(`
            SELECT * FROM sensor_readings 
            WHERE sensor_id = ? AND timestamp >= datetime('now', '-${hours} hours')
            ORDER BY timestamp DESC
            LIMIT 1000
        `).all(sensorId);

        res.json({ sensorId, hours, readings });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch readings' });
    }
});

/**
 * GET /api/sensors/readings/:sensorId/latest
 * Most recent reading for a sensor
 */
router.get('/readings/:sensorId/latest', (req, res) => {
    try {
        const reading = logisticsDb.prepare(`
            SELECT * FROM sensor_readings 
            WHERE sensor_id = ? 
            ORDER BY timestamp DESC LIMIT 1
        `).get(req.params.sensorId);

        res.json(reading || null);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch latest reading' });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// SENSOR STATUS & CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/sensors/status
 * Current status of monitored sensors (filtered by plant_id if provided)
 */
router.get('/status', (req, res) => {
    try {
        const { plant_id } = req.query;
        const filterByPlant = plant_id && plant_id !== 'all_sites';
        const plantFilter = filterByPlant ? 'WHERE c.plant_id = ?' : '';
        const params = filterByPlant ? [plant_id] : [];

        const sensors = logisticsDb.prepare(`
            SELECT c.*, 
                   t.min_value, t.max_value, t.wo_priority, t.cooldown_minutes, t.auto_wo,
                   (SELECT COUNT(*) FROM sensor_readings r WHERE r.sensor_id = c.sensor_id AND r.timestamp >= datetime('now', '-24 hours')) as readings_24h,
                   (SELECT COUNT(*) FROM sensor_readings r WHERE r.sensor_id = c.sensor_id AND r.threshold_exceeded = 1 AND r.timestamp >= datetime('now', '-24 hours')) as alerts_24h
            FROM sensor_config c
            LEFT JOIN sensor_thresholds t ON c.sensor_id = t.sensor_id AND c.metric = t.metric
            ${plantFilter}
            ORDER BY c.status DESC, c.sensor_name ASC
        `).all(...params);

        // Mark sensors as offline if no reading in 5 minutes
        const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
        for (const sensor of sensors) {
            if (sensor.status !== 'alert' && sensor.last_reading_at && sensor.last_reading_at < fiveMinAgo) {
                sensor.status = 'offline';
                logisticsDb.prepare("UPDATE sensor_config SET status = 'offline' WHERE sensor_id = ?").run(sensor.sensor_id);
            }
        }

        res.json(sensors);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch sensor status' });
    }
});

/**
 * GET /api/sensors/config
 * List sensor configurations (filtered by plant_id if provided)
 */
router.get('/config', (req, res) => {
    try {
        const { plant_id } = req.query;
        const filterByPlant = plant_id && plant_id !== 'all_sites';
        const sql = filterByPlant
            ? 'SELECT * FROM sensor_config WHERE plant_id = ? ORDER BY sensor_name'
            : 'SELECT * FROM sensor_config ORDER BY sensor_name';
        const sensors = logisticsDb.prepare(sql).all(...(filterByPlant ? [plant_id] : []));
        res.json(sensors);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch sensor config' });
    }
});

/**
 * POST /api/sensors/config
 * Create/update a sensor configuration
 */
router.post('/config', (req, res) => {
    try {
        const { sensor_id, sensor_name, asset_id, asset_name, plant_id, plant_name, metric, unit, location, protocol } = req.body;
        if (!sensor_id || !sensor_name) {
            return res.status(400).json({ error: 'sensor_id and sensor_name required' });
        }

        const existing = logisticsDb.prepare('SELECT id FROM sensor_config WHERE sensor_id = ?').get(sensor_id);
        
        if (existing) {
            logisticsDb.prepare(`
                UPDATE sensor_config 
                SET sensor_name = ?, asset_id = ?, asset_name = ?, plant_id = ?, plant_name = ?,
                    metric = ?, unit = ?, location = ?, protocol = ?
                WHERE sensor_id = ?
            `).run(sensor_name, asset_id || '', asset_name || '', plant_id || '', plant_name || '',
                   metric || 'temperature', unit || '°F', location || '', protocol || 'http', sensor_id);
        } else {
            logisticsDb.prepare(`
                INSERT INTO sensor_config (sensor_id, sensor_name, asset_id, asset_name, plant_id, plant_name, metric, unit, location, protocol)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(sensor_id, sensor_name, asset_id || '', asset_name || '', plant_id || '', plant_name || '',
                   metric || 'temperature', unit || '°F', location || '', protocol || 'http');
        }

        logAudit(req.user?.username || 'system', 'SENSOR_CONFIG', sensor_id, { sensor_name, asset_id, metric });
        res.status(201).json({ success: true, sensor_id });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save sensor config' });
    }
});

/**
 * DELETE /api/sensors/config/:sensorId
 * Remove a sensor
 */
router.delete('/config/:sensorId', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM sensor_config WHERE sensor_id = ?').run(req.params.sensorId);
        logisticsDb.prepare('DELETE FROM sensor_thresholds WHERE sensor_id = ?').run(req.params.sensorId);
        logisticsDb.prepare('DELETE FROM sensor_readings WHERE sensor_id = ?').run(req.params.sensorId);
        logAudit(req.user?.username || 'system', 'SENSOR_REMOVED', req.params.sensorId, {});
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete sensor' });
    }
});

/**
 * PUT /api/sensors/config/:sensorId/toggle
 * Enable/disable a sensor
 */
router.put('/config/:sensorId/toggle', (req, res) => {
    try {
        const sensor = logisticsDb.prepare('SELECT enabled FROM sensor_config WHERE sensor_id = ?').get(req.params.sensorId);
        if (!sensor) return res.status(404).json({ error: 'Sensor not found' });
        const newState = sensor.enabled ? 0 : 1;
        logisticsDb.prepare('UPDATE sensor_config SET enabled = ? WHERE sensor_id = ?').run(newState, req.params.sensorId);
        res.json({ success: true, enabled: !!newState });
    } catch (err) {
        res.status(500).json({ error: 'Failed to toggle sensor' });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// THRESHOLD MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/sensors/thresholds
 * List thresholds (filtered by plant_id via sensor_config join if provided)
 */
router.get('/thresholds', (req, res) => {
    try {
        const { plant_id } = req.query;
        const filterByPlant = plant_id && plant_id !== 'all_sites';
        const sql = filterByPlant
            ? `SELECT t.* FROM sensor_thresholds t
               JOIN sensor_config c ON t.sensor_id = c.sensor_id
               WHERE c.plant_id = ? ORDER BY t.sensor_id`
            : 'SELECT * FROM sensor_thresholds ORDER BY sensor_id';
        const thresholds = logisticsDb.prepare(sql).all(...(filterByPlant ? [plant_id] : []));
        res.json(thresholds);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch thresholds' });
    }
});

/**
 * POST /api/sensors/thresholds
 * Create or update a threshold rule
 */
router.post('/thresholds', (req, res) => {
    try {
        const { sensor_id, asset_id, metric, min_value, max_value, wo_priority, wo_description_template, cooldown_minutes, auto_wo } = req.body;
        if (!sensor_id || !metric) {
            return res.status(400).json({ error: 'sensor_id and metric required' });
        }

        // Upsert
        const existing = logisticsDb.prepare(
            'SELECT id FROM sensor_thresholds WHERE sensor_id = ? AND metric = ?'
        ).get(sensor_id, metric);

        if (existing) {
            logisticsDb.prepare(`
                UPDATE sensor_thresholds 
                SET min_value = ?, max_value = ?, wo_priority = ?, wo_description_template = ?, 
                    cooldown_minutes = ?, auto_wo = ?, asset_id = ?
                WHERE id = ?
            `).run(
                min_value !== undefined ? min_value : null,
                max_value !== undefined ? max_value : null,
                wo_priority || 1,
                wo_description_template || 'SENSOR ALERT: {metric} reading of {value}{unit} on {assetName} exceeded threshold',
                cooldown_minutes || 30,
                auto_wo !== undefined ? (auto_wo ? 1 : 0) : 1,
                asset_id || '',
                existing.id
            );
            res.json({ success: true, id: existing.id, updated: true });
        } else {
            const result = logisticsDb.prepare(`
                INSERT INTO sensor_thresholds (sensor_id, asset_id, metric, min_value, max_value, wo_priority, wo_description_template, cooldown_minutes, auto_wo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                sensor_id, asset_id || '', metric,
                min_value !== undefined ? min_value : null,
                max_value !== undefined ? max_value : null,
                wo_priority || 1,
                wo_description_template || 'SENSOR ALERT: {metric} reading of {value}{unit} on {assetName} exceeded threshold',
                cooldown_minutes || 30,
                auto_wo !== undefined ? (auto_wo ? 1 : 0) : 1
            );
            res.status(201).json({ success: true, id: result.lastInsertRowid });
        }

        logAudit(req.user?.username || 'system', 'THRESHOLD_CONFIG', sensor_id, { metric, min_value, max_value });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save threshold' });
    }
});

/**
 * DELETE /api/sensors/thresholds/:id
 */
router.delete('/thresholds/:id', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM sensor_thresholds WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete threshold' });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD SUMMARY & RECENT EVENTS
// ══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/sensors/dashboard
 * Aggregated sensor dashboard data (filtered by plant_id if provided)
 */
router.get('/dashboard', (req, res) => {
    try {
        const { plant_id } = req.query;
        const filterByPlant = plant_id && plant_id !== 'all_sites';
        const pf = filterByPlant ? ' AND plant_id = ?' : '';  // config filter
        const rf = filterByPlant ? ' AND r.plant_id = ?' : ''; // readings filter
        const cp = filterByPlant ? [plant_id] : [];

        const totalSensors = logisticsDb.prepare('SELECT COUNT(*) as count FROM sensor_config WHERE 1=1' + pf).get(...cp).count;
        const onlineSensors = logisticsDb.prepare("SELECT COUNT(*) as count FROM sensor_config WHERE status = 'online'" + pf).get(...cp).count;
        const alertSensors = logisticsDb.prepare("SELECT COUNT(*) as count FROM sensor_config WHERE status = 'alert'" + pf).get(...cp).count;
        const offlineSensors = logisticsDb.prepare("SELECT COUNT(*) as count FROM sensor_config WHERE status = 'offline'" + pf).get(...cp).count;
        
        const readings24h = logisticsDb.prepare(
            "SELECT COUNT(*) as count FROM sensor_readings r WHERE r.timestamp >= datetime('now', '-24 hours')" + rf
        ).get(...cp).count;

        const alerts24h = logisticsDb.prepare(
            "SELECT COUNT(*) as count FROM sensor_readings r WHERE r.threshold_exceeded = 1 AND r.timestamp >= datetime('now', '-24 hours')" + rf
        ).get(...cp).count;

        const recentAlertsSql = filterByPlant
            ? `SELECT r.*, c.sensor_name, c.asset_name, c.plant_name
               FROM sensor_readings r
               LEFT JOIN sensor_config c ON r.sensor_id = c.sensor_id
               WHERE r.threshold_exceeded = 1 AND c.plant_id = ?
               ORDER BY r.timestamp DESC LIMIT 10`
            : `SELECT r.*, c.sensor_name, c.asset_name, c.plant_name
               FROM sensor_readings r
               LEFT JOIN sensor_config c ON r.sensor_id = c.sensor_id
               WHERE r.threshold_exceeded = 1
               ORDER BY r.timestamp DESC LIMIT 10`;
        const recentAlerts = logisticsDb.prepare(recentAlertsSql).all(...cp);

        res.json({
            totalSensors,
            onlineSensors,
            alertSensors,
            offlineSensors,
            readings24h,
            alerts24h,
            recentAlerts
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

/**
 * POST /api/sensors/simulate
 * Generate a test reading to verify the pipeline (dev/testing only)
 */
router.post('/simulate', (req, res) => {
    try {
        const { sensorId, metric, value, unit, plantId } = req.body;
        const testSensorId = sensorId || 'TEST-TEMP-001';
        const testMetric = metric || 'temperature';
        const testValue = value !== undefined ? parseFloat(value) : 195 + Math.random() * 20;
        const testUnit = unit || '°F';
        const testPlantId = plantId || 'test_plant';
        const testPlantName = testPlantId.replace(/_/g, ' ');
        const now = new Date().toISOString();

        logisticsDb.prepare(`
            INSERT INTO sensor_readings (sensor_id, asset_id, metric, value, unit, plant_id, timestamp)
            VALUES (?, 'TEST-ASSET', ?, ?, ?, ?, ?)
        `).run(testSensorId, testMetric, testValue, testUnit, testPlantId, now);

        // Auto-register if needed
        const exists = logisticsDb.prepare('SELECT id FROM sensor_config WHERE sensor_id = ?').get(testSensorId);
        if (!exists) {
            logisticsDb.prepare(`
                INSERT INTO sensor_config (sensor_id, sensor_name, asset_id, asset_name, metric, unit, plant_id, plant_name, status, last_reading_at, last_value)
                VALUES (?, 'Test Temperature Sensor', 'TEST-ASSET', 'Boiler Pump #3', ?, ?, ?, ?, 'online', ?, ?)
            `).run(testSensorId, testMetric, testUnit, testPlantId, testPlantName, now, testValue);
        } else {
            logisticsDb.prepare(`
                UPDATE sensor_config SET last_reading_at = ?, last_value = ?, status = 'online' WHERE sensor_id = ?
            `).run(now, testValue, testSensorId);
        }

        res.json({ 
            success: true, 
            message: `Simulated ${testMetric} reading: ${testValue.toFixed(1)}${testUnit}`,
            sensorId: testSensorId,
            value: testValue 
        });
    } catch (err) {
        res.status(500).json({ error: 'Simulation failed' });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// SENSOR MONTHLY HISTORY — Query archived monthly summaries
// ══════════════════════════════════════════════════════════════════════════
router.get('/history', (req, res) => {
    try {
        const { sensor_id, plant_id, year, metric } = req.query;

        let where = [];
        let params = [];

        if (sensor_id) { where.push('sensor_id = ?'); params.push(sensor_id); }
        if (plant_id) { where.push('plant_id = ?'); params.push(plant_id); }
        if (year) { where.push('year = ?'); params.push(parseInt(year)); }
        if (metric) { where.push('metric = ?'); params.push(metric); }

        const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

        const summaries = logisticsDb.prepare(`
            SELECT * FROM sensor_monthly_summary 
            ${clause}
            ORDER BY year DESC, month DESC
            LIMIT 500
        `).all(...params);

        res.json(summaries);
    } catch (err) {
        console.error('GET /api/sensors/history error:', err);
        res.status(500).json({ error: 'Failed to fetch sensor history' });
    }
});

module.exports = router;
