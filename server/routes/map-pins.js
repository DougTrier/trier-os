// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */

/**
 * Trier OS — US Map Plant Pin API
 * =================================
 * Manages the enterprise plant location pins shown on the USMapView
 * (Cesium globe / Leaflet map). Each pin marks a Trier OS plant or
 * facility on the enterprise map with status, label, and metadata.
 * Data stored in a dedicated map_pins.db file (separate from plant DBs
 * to allow cross-plant access without a plant context header).
 * Mounted at /api/map-pins in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /       List all map pins (all plants / facilities)
 *   POST   /       Add a new map pin (lat, lng, label, pinType, metadata)
 *   PUT    /:id    Update pin position, label, or status
 *   DELETE /:id    Remove a pin
 *
 * PIN TYPES: Plant | Warehouse | Office | Vendor | Other
 *
 * FIELDS: lat, lng, label, pinType, status, plantId, description, metadata (JSON)
 *   status — Active | Inactive | Under Construction | Closed
 *   metadata — free-form JSON for extra context shown in the map tooltip
 *
 * STORAGE: map_pins.db in the data directory (not per-plant).
 *   This allows the enterprise map to load without a plant context (x-plant-id header).
 *
 * FRONTEND: USMapView.jsx and CesiumGlobeView.jsx consume this endpoint
 *   to render plant markers on the 3D globe and 2D map overlays.
 */

const express = require('express');
const router = express.Router();
const path = require('path');

// ── SQLite DB for map pins ──
const Database = require('better-sqlite3');
const dataDir = require('../resolve_data_dir');
const DB_PATH = path.join(dataDir, 'map_pins.db');
const db = new Database(DB_PATH);

// Create table if not exists
db.exec(`
    CREATE TABLE IF NOT EXISTS map_pins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        pinType TEXT NOT NULL DEFAULT 'Plant',
        address TEXT DEFAULT '',
        city TEXT DEFAULT '',
        state TEXT DEFAULT '',
        zip TEXT DEFAULT '',
        county TEXT DEFAULT '',
        acreage TEXT DEFAULT '',
        parcelId TEXT DEFAULT '',
        gisUrl TEXT DEFAULT '',
        recorderOfDeedsUrl TEXT DEFAULT '',
        taxRecordsUrl TEXT DEFAULT '',
        taxAmount TEXT DEFAULT '',
        legalDescription TEXT DEFAULT '',
        propertyClass TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        plantId TEXT DEFAULT '',
        createdBy TEXT DEFAULT '',
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
    );
`);

// GET all pins (everyone can see all pins)
router.get('/', (req, res) => {
    try {
        const pins = db.prepare('SELECT * FROM map_pins ORDER BY createdAt DESC').all();
        res.json(pins);
    } catch (err) {
        console.error('[MapPins] GET error:', err);
        res.status(500).json({ error: 'Failed to fetch map pins' });
    }
});

// POST create a new pin
router.post('/', (req, res) => {
    try {
        const {
            lat, lng, label, pinType, address, city, state, zip,
            county, acreage, parcelId, gisUrl, recorderOfDeedsUrl,
            taxRecordsUrl, taxAmount, legalDescription, propertyClass,
            notes, plantId, createdBy, propertyValue
        } = req.body;

        const stmt = db.prepare(`
            INSERT INTO map_pins (lat, lng, label, pinType, address, city, state, zip,
                county, acreage, parcelId, gisUrl, recorderOfDeedsUrl, taxRecordsUrl,
                taxAmount, propertyValue, legalDescription, propertyClass, notes, plantId, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            lat, lng, label || '', pinType || 'Plant',
            address || '', city || '', state || '', zip || '',
            county || '', acreage || '', parcelId || '',
            gisUrl || '', recorderOfDeedsUrl || '', taxRecordsUrl || '',
            taxAmount || '', propertyValue || '', legalDescription || '', propertyClass || '',
            notes || '', plantId || '', createdBy || ''
        );

        const newPin = db.prepare('SELECT * FROM map_pins WHERE id = ?').get(result.lastInsertRowid);
        res.json(newPin);
    } catch (err) {
        console.error('[MapPins] POST error:', err);
        res.status(500).json({ error: 'Failed to create pin' });
    }
});

// PUT update a pin
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const fields = req.body;
        
        const allowedFields = [
            'lat', 'lng', 'label', 'pinType', 'address', 'city', 'state', 'zip',
            'county', 'acreage', 'parcelId', 'gisUrl', 'recorderOfDeedsUrl',
            'taxRecordsUrl', 'taxAmount', 'propertyValue', 'legalDescription', 'propertyClass',
            'notes', 'plantId'
        ];

        const updates = [];
        const values = [];
        for (const [key, val] of Object.entries(fields)) {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = ?`);
                values.push(val);
            }
        }

        if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

        updates.push("updatedAt = datetime('now')");
        values.push(id);

        db.prepare(`UPDATE map_pins SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        const updated = db.prepare('SELECT * FROM map_pins WHERE id = ?').get(id);
        res.json(updated);
    } catch (err) {
        console.error('[MapPins] PUT error:', err);
        res.status(500).json({ error: 'Failed to update pin' });
    }
});

// DELETE a pin
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM map_pins WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[MapPins] DELETE error:', err);
        res.status(500).json({ error: 'Failed to delete pin' });
    }
});

module.exports = router;
