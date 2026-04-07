// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS — Digital Twin API Routes
 * ====================================
 * Interactive asset schematics with live sensor data overlays,
 * health-status pins, and work order integration.
 *
 * ENDPOINTS:
 *   GET    /api/digital-twin/:assetId       — Get all schematics + pins for asset
 *   POST   /api/digital-twin/schematic      — Upload/create schematic for an asset
 *   PUT    /api/digital-twin/schematic/:id   — Update schematic metadata
 *   DELETE /api/digital-twin/schematic/:id   — Delete schematic
 *   POST   /api/digital-twin/pin            — Add a pin to a schematic
 *   PUT    /api/digital-twin/pin/:id        — Update pin position, label, or links
 *   DELETE /api/digital-twin/pin/:id        — Remove a pin
 *   GET    /api/digital-twin/pin/:id/live   — Get live data for a pin
 *   GET    /api/digital-twin/stats          — Overview stats for Mission Control
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

module.exports = function(db) {

    // ── Ensure tables exist ──
    const ensureTables = (pdb) => {
        pdb.exec(`
            CREATE TABLE IF NOT EXISTS digital_twin_schematics (
                ID INTEGER PRIMARY KEY AUTOINCREMENT,
                AssetID TEXT NOT NULL,
                PlantID TEXT DEFAULT '',
                SchematicPath TEXT,
                SchematicType TEXT DEFAULT 'photo',
                Label TEXT DEFAULT 'Default View',
                CreatedAt TEXT DEFAULT (datetime('now')),
                UpdatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS digital_twin_pins (
                ID INTEGER PRIMARY KEY AUTOINCREMENT,
                SchematicID INTEGER NOT NULL,
                PinLabel TEXT NOT NULL,
                PinType TEXT DEFAULT 'component',
                XPercent REAL NOT NULL,
                YPercent REAL NOT NULL,
                LinkedSensorID TEXT,
                LinkedPartID TEXT,
                LinkedAssetID TEXT,
                HealthStatus TEXT DEFAULT 'healthy',
                HealthThresholds TEXT DEFAULT '{}',
                Notes TEXT DEFAULT '',
                CreatedAt TEXT DEFAULT (datetime('now')),
                UpdatedAt TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (SchematicID) REFERENCES digital_twin_schematics(ID)
            );
        `);
    };

    // ── File upload for schematic images ──
    const uploadDir = path.join(__dirname, '..', 'data', 'digital-twin');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname) || '.png';
            cb(null, `twin_${Date.now()}${ext}`);
        }
    });
    const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

    // ── GET /api/digital-twin/:assetId — Get schematics + pins ──
    router.get('/:assetId', (req, res) => {
        try {
            const pdb = db.getDb();
            ensureTables(pdb);

            const schematics = pdb.prepare(`
                SELECT * FROM digital_twin_schematics
                WHERE AssetID = ?
                ORDER BY CreatedAt
            `).all(req.params.assetId);

            // Attach pins to each schematic
            const getPins = pdb.prepare(`
                SELECT * FROM digital_twin_pins WHERE SchematicID = ? ORDER BY ID
            `);
            const result = schematics.map(s => ({
                ...s,
                pins: getPins.all(s.ID)
            }));

            res.json({
                assetId: req.params.assetId,
                schematics: result,
                count: result.length
            });
        } catch (err) {
            console.error('[Digital Twin] GET error:', err.message);
            res.status(500).json({ error: 'Failed to fetch digital twin data' });
        }
    });

    // ── POST /api/digital-twin/schematic — Create/upload schematic ──
    router.post('/schematic', upload.single('schematic'), (req, res) => {
        try {
            const pdb = db.getDb();
            ensureTables(pdb);

            const { assetId, label, schematicType } = req.body;
            if (!assetId) return res.status(400).json({ error: 'assetId is required' });

            let schematicPath = '';
            if (req.file) {
                schematicPath = `/api/digital-twin/image/${req.file.filename}`;
            }

            const result = pdb.prepare(`
                INSERT INTO digital_twin_schematics (AssetID, SchematicPath, SchematicType, Label, PlantID)
                VALUES (?, ?, ?, ?, ?)
            `).run(
                assetId,
                schematicPath,
                schematicType || 'photo',
                label || 'Default View',
                req.headers['x-plant-id'] || 'Demo_Plant_1'
            );

            console.log(`[Digital Twin] Schematic created for asset ${assetId} (ID: ${result.lastInsertRowid})`);
            res.status(201).json({
                success: true,
                id: Number(result.lastInsertRowid),
                schematicPath
            });
        } catch (err) {
            console.error('[Digital Twin] Schematic upload error:', err.message);
            res.status(500).json({ error: 'Failed to create schematic' });
        }
    });

    // ── PUT /api/digital-twin/schematic/:id — Update schematic metadata ──
    router.put('/schematic/:id', (req, res) => {
        try {
            const pdb = db.getDb();
            ensureTables(pdb);
            const { label, schematicType } = req.body;
            pdb.prepare(`
                UPDATE digital_twin_schematics
                SET Label = COALESCE(?, Label),
                    SchematicType = COALESCE(?, SchematicType),
                    UpdatedAt = datetime('now')
                WHERE ID = ?
            `).run(label || null, schematicType || null, req.params.id);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to update schematic' });
        }
    });

    // ── DELETE /api/digital-twin/schematic/:id ──
    router.delete('/schematic/:id', (req, res) => {
        try {
            const pdb = db.getDb();
            ensureTables(pdb);
            // Delete pins first
            pdb.prepare('DELETE FROM digital_twin_pins WHERE SchematicID = ?').run(req.params.id);
            // Delete schematic
            const schematic = pdb.prepare('SELECT SchematicPath FROM digital_twin_schematics WHERE ID = ?').get(req.params.id);
            pdb.prepare('DELETE FROM digital_twin_schematics WHERE ID = ?').run(req.params.id);
            // Clean up file
            if (schematic && schematic.SchematicPath) {
                const filename = schematic.SchematicPath.split('/').pop();
                const filepath = path.join(uploadDir, filename);
                if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete schematic' });
        }
    });

    // ── POST /api/digital-twin/pin — Add pin to schematic ──
    router.post('/pin', (req, res) => {
        try {
            const pdb = db.getDb();
            ensureTables(pdb);
            const {
                schematicId, pinLabel, pinType,
                xPercent, yPercent,
                linkedSensorId, linkedPartId, linkedAssetId,
                healthThresholds, notes
            } = req.body;

            if (!schematicId || !pinLabel || xPercent === undefined || yPercent === undefined) {
                return res.status(400).json({ error: 'schematicId, pinLabel, xPercent, yPercent are required' });
            }

            const result = pdb.prepare(`
                INSERT INTO digital_twin_pins
                (SchematicID, PinLabel, PinType, XPercent, YPercent,
                 LinkedSensorID, LinkedPartID, LinkedAssetID,
                 HealthThresholds, Notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                schematicId, pinLabel, pinType || 'component',
                xPercent, yPercent,
                linkedSensorId || null, linkedPartId || null, linkedAssetId || null,
                typeof healthThresholds === 'object' ? JSON.stringify(healthThresholds) : (healthThresholds || '{}'),
                notes || ''
            );

            res.status(201).json({
                success: true,
                id: Number(result.lastInsertRowid)
            });
        } catch (err) {
            console.error('[Digital Twin] Pin creation error:', err.message);
            res.status(500).json({ error: 'Failed to create pin' });
        }
    });

    // ── PUT /api/digital-twin/pin/:id — Update pin ──
    router.put('/pin/:id', (req, res) => {
        try {
            const pdb = db.getDb();
            ensureTables(pdb);
            const {
                pinLabel, pinType, xPercent, yPercent,
                linkedSensorId, linkedPartId, linkedAssetId,
                healthStatus, healthThresholds, notes
            } = req.body;

            const fields = [];
            const values = [];

            if (pinLabel !== undefined) { fields.push('PinLabel = ?'); values.push(pinLabel); }
            if (pinType !== undefined) { fields.push('PinType = ?'); values.push(pinType); }
            if (xPercent !== undefined) { fields.push('XPercent = ?'); values.push(xPercent); }
            if (yPercent !== undefined) { fields.push('YPercent = ?'); values.push(yPercent); }
            if (linkedSensorId !== undefined) { fields.push('LinkedSensorID = ?'); values.push(linkedSensorId); }
            if (linkedPartId !== undefined) { fields.push('LinkedPartID = ?'); values.push(linkedPartId); }
            if (linkedAssetId !== undefined) { fields.push('LinkedAssetID = ?'); values.push(linkedAssetId); }
            if (healthStatus !== undefined) { fields.push('HealthStatus = ?'); values.push(healthStatus); }
            if (healthThresholds !== undefined) { fields.push('HealthThresholds = ?'); values.push(typeof healthThresholds === 'object' ? JSON.stringify(healthThresholds) : healthThresholds); }
            if (notes !== undefined) { fields.push('Notes = ?'); values.push(notes); }

            if (fields.length === 0) return res.json({ success: true });

            fields.push("UpdatedAt = datetime('now')");
            values.push(req.params.id);

            pdb.prepare(`UPDATE digital_twin_pins SET ${fields.join(', ')} WHERE ID = ?`).run(...values); /* dynamic col/table - sanitize inputs */
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to update pin' });
        }
    });

    // ── DELETE /api/digital-twin/pin/:id ──
    router.delete('/pin/:id', (req, res) => {
        try {
            const pdb = db.getDb();
            ensureTables(pdb);
            pdb.prepare('DELETE FROM digital_twin_pins WHERE ID = ?').run(req.params.id);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete pin' });
        }
    });

    // ── GET /api/digital-twin/pin/:id/live — Live data for a pin ──
    router.get('/pin/:id/live', (req, res) => {
        try {
            const pdb = db.getDb();
            ensureTables(pdb);

            const pin = pdb.prepare('SELECT * FROM digital_twin_pins WHERE ID = ?').get(req.params.id);
            if (!pin) return res.status(404).json({ error: 'Pin not found' });

            const liveData = {
                pin,
                sensor: null,
                recentWorkOrders: [],
                linkedPart: null
            };

            // Get linked sensor data
            if (pin.LinkedSensorID) {
                try {
                    const logDb = require('../logistics_db').db;
                    const sensor = logDb.prepare('SELECT * FROM sensor_config WHERE sensor_id = ?').get(pin.LinkedSensorID);
                    const reading = logDb.prepare('SELECT * FROM sensor_readings WHERE sensor_id = ? ORDER BY timestamp DESC LIMIT 1').get(pin.LinkedSensorID);
                    liveData.sensor = { config: sensor, latestReading: reading };
                } catch (e) {}
            }

            // Get recent work orders for the linked asset
            if (pin.LinkedAssetID) {
                try {
                    const wos = pdb.prepare(`
                        SELECT WO, Description, Status, Priority, AddDate, CompletionDate
                        FROM Work WHERE AssetID = ? ORDER BY AddDate DESC LIMIT 5
                    `).all(pin.LinkedAssetID);
                    liveData.recentWorkOrders = wos;
                } catch (e) {}
            }

            // Get linked part info
            if (pin.LinkedPartID) {
                try {
                    const part = pdb.prepare('SELECT * FROM Part WHERE ID = ?').get(pin.LinkedPartID);
                    liveData.linkedPart = part;
                } catch (e) {}
            }

            res.json(liveData);
        } catch (err) {
            console.error('[Digital Twin] Live data error:', err.message);
            res.status(500).json({ error: 'Failed to fetch live pin data' });
        }
    });

    // ── GET /api/digital-twin/stats — Overview stats ──
    router.get('/stats/overview', (req, res) => {
        try {
            const pdb = db.getDb();
            ensureTables(pdb);

            const totalSchematics = pdb.prepare('SELECT COUNT(*) as count FROM digital_twin_schematics').get().count;
            const totalPins = pdb.prepare('SELECT COUNT(*) as count FROM digital_twin_pins').get().count;
            const uniqueAssets = pdb.prepare('SELECT COUNT(DISTINCT AssetID) as count FROM digital_twin_schematics').get().count;

            // Count by health status
            let healthCounts = { healthy: 0, warning: 0, critical: 0 };
            try {
                healthCounts.healthy = pdb.prepare("SELECT COUNT(*) as c FROM digital_twin_pins WHERE HealthStatus = 'healthy'").get().c;
                healthCounts.warning = pdb.prepare("SELECT COUNT(*) as c FROM digital_twin_pins WHERE HealthStatus = 'warning'").get().c;
                healthCounts.critical = pdb.prepare("SELECT COUNT(*) as c FROM digital_twin_pins WHERE HealthStatus = 'critical'").get().c;
            } catch (e) {}

            res.json({
                totalSchematics,
                totalPins,
                uniqueAssets,
                healthCounts
            });
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch Digital Twin stats' });
        }
    });

    // ── Serve uploaded schematic images ──
    router.get('/image/:filename', (req, res) => {
        const safeName = path.basename(req.params.filename); // Prevent directory traversal
        const filepath = path.join(uploadDir, safeName);
        if (fs.existsSync(filepath)) {
            res.sendFile(filepath);
        } else {
            res.status(404).json({ error: 'Image not found' });
        }
    });

    return router;
};
