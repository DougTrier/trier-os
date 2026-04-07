/**
 * routes/gps.js
 * --------------
 * GPS & Location -- real-time GPS coordinate ingestion from fleet vehicles and mobile devices. Feeds the USMapView enterprise GIS dashboard.
 *
 * All routes in this file are mounted under /api/ in server/index.js
 * and require a valid JWT Bearer token (enforced by middleware/auth.js)
 * unless explicitly listed in the auth middleware's public allowlist.
 */

// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — GPS Ping & Geofence Routes
 * =======================================
 * Stores live GPS pings from authenticated users and manages plant geofences.
 *
 * Tables (in trier_logistics.db):
 *   gps_pings         — rolling 24-hour position log per user
 *   plant_geofences   — admin-defined circular alert zones per plant
 *
 * ENDPOINTS:
 *   POST   /api/gps/ping              Store a position update
 *   GET    /api/gps/live              Latest ping per user (last 10 minutes)
 *   GET    /api/gps/geofences         List geofences for a plant
 *   POST   /api/gps/geofences         Create a geofence
 *   PUT    /api/gps/geofences/:id     Update a geofence
 *   DELETE /api/gps/geofences/:id     Remove a geofence
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb } = require('../logistics_db');

// -- Create tables if they don't exist ----------------------------------------
function initGPSTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS gps_pings (
            ID          INTEGER PRIMARY KEY AUTOINCREMENT,
            UserID      TEXT,
            UserName    TEXT,
            Lat         REAL NOT NULL,
            Lng         REAL NOT NULL,
            Accuracy    REAL,
            Ts          TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS plant_geofences (
            ID          INTEGER PRIMARY KEY AUTOINCREMENT,
            PlantID     TEXT NOT NULL,
            Name        TEXT NOT NULL,
            CenterLat   REAL NOT NULL,
            CenterLng   REAL NOT NULL,
            RadiusMeters REAL NOT NULL DEFAULT 500,
            Active      INTEGER DEFAULT 1,
            CreatedAt   TEXT DEFAULT (datetime('now')),
            CreatedBy   TEXT
        );
    `);

    // Prune pings older than 24 hours on startup
    logisticsDb.exec("DELETE FROM gps_pings WHERE Ts < datetime('now', '-24 hours')");
}
initGPSTables();

// -- Helpers -------------------------------------------------------------------

/** Haversine distance in metres between two lat/lng pairs. */
function haversineMetres(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const f1 = lat1 * Math.PI / 180;
    const f2 = lat2 * Math.PI / 180;
    const ?f = (lat2 - lat1) * Math.PI / 180;
    const ?? = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(?f / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(?? / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// -- POST /api/gps/ping --------------------------------------------------------
router.post('/ping', (req, res) => {
    try {
        const { lat, lng, accuracy, userId, userName } = req.body;
        if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });

        logisticsDb.prepare(
            'INSERT INTO gps_pings (UserID, UserName, Lat, Lng, Accuracy) VALUES (?, ?, ?, ?, ?)'
        ).run(userId || null, userName || null, lat, lng, accuracy || null);

        // Prune stale pings for this user (keep only last 100 per user)
        logisticsDb.prepare(
            `DELETE FROM gps_pings WHERE UserID = ? AND ID NOT IN (
                SELECT ID FROM gps_pings WHERE UserID = ? ORDER BY ID DESC LIMIT 100
             )`
        ).run(userId, userId);

        // Check active geofences — insert a safety alert if breached
        const fences = logisticsDb.prepare('SELECT * FROM plant_geofences WHERE Active = 1').all();
        for (const fence of fences) {
            const dist = haversineMetres(lat, lng, fence.CenterLat, fence.CenterLng);
            if (dist > fence.RadiusMeters) {
                // Only alert if no breach alert was logged for this user+fence in the last 30 min
                const recentAlert = logisticsDb.prepare(
                    `SELECT ID FROM gps_geofence_alerts
                     WHERE UserID = ? AND GeofenceID = ? AND AlertedAt > datetime('now', '-30 minutes')
                     LIMIT 1`
                ).get(userId, fence.ID);

                if (!recentAlert) {
                    try {
                        logisticsDb.exec(`CREATE TABLE IF NOT EXISTS gps_geofence_alerts (
                            ID INTEGER PRIMARY KEY AUTOINCREMENT,
                            UserID TEXT, GeofenceID INTEGER, PlantID TEXT,
                            AlertedAt TEXT DEFAULT (datetime('now')),
                            DistanceMeters REAL
                        )`);
                        logisticsDb.prepare(
                            'INSERT INTO gps_geofence_alerts (UserID, GeofenceID, PlantID, DistanceMeters) VALUES (?, ?, ?, ?)'
                        ).run(userId, fence.ID, fence.PlantID, Math.round(dist));
                    } catch { /* table may not exist yet on first breach */ }
                }
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[GPS] POST /ping error:', err.message);
        res.status(500).json({ error: 'Failed to store ping' });
    }
});

// -- GET /api/gps/live ---------------------------------------------------------
// Returns the most recent ping per user from the last 10 minutes.
router.get('/live', (req, res) => {
    try {
        const rows = logisticsDb.prepare(`
            SELECT p.*
            FROM gps_pings p
            INNER JOIN (
                SELECT UserID, MAX(ID) AS MaxID
                FROM gps_pings
                WHERE Ts > datetime('now', '-10 minutes')
                GROUP BY UserID
            ) latest ON p.ID = latest.MaxID
            ORDER BY p.Ts DESC
        `).all();
        res.json(rows);
    } catch (err) {
        console.error('[GPS] GET /live error:', err.message);
        res.status(500).json({ error: 'Failed to fetch live pings' });
    }
});

// -- GET /api/gps/geofences ----------------------------------------------------
router.get('/geofences', (req, res) => {
    try {
        const { plantId } = req.query;
        const plant = plantId || req.headers['x-plant-id'];
        const rows = plant
            ? logisticsDb.prepare('SELECT * FROM plant_geofences WHERE PlantID = ? ORDER BY CreatedAt DESC').all(plant)
            : logisticsDb.prepare('SELECT * FROM plant_geofences ORDER BY CreatedAt DESC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch geofences' });
    }
});

// -- POST /api/gps/geofences ---------------------------------------------------
router.post('/geofences', (req, res) => {
    try {
        const { plantId, name, centerLat, centerLng, radiusMeters, createdBy } = req.body;
        if (!plantId || !name || !centerLat || !centerLng) {
            return res.status(400).json({ error: 'plantId, name, centerLat, and centerLng are required' });
        }
        const result = logisticsDb.prepare(
            'INSERT INTO plant_geofences (PlantID, Name, CenterLat, CenterLng, RadiusMeters, CreatedBy) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(plantId, name, centerLat, centerLng, radiusMeters || 500, createdBy || null);
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create geofence' });
    }
});

// -- PUT /api/gps/geofences/:id ------------------------------------------------
router.put('/geofences/:id', (req, res) => {
    try {
        const { name, centerLat, centerLng, radiusMeters, active } = req.body;
        logisticsDb.prepare(
            'UPDATE plant_geofences SET Name = COALESCE(?, Name), CenterLat = COALESCE(?, CenterLat), CenterLng = COALESCE(?, CenterLng), RadiusMeters = COALESCE(?, RadiusMeters), Active = COALESCE(?, Active) WHERE ID = ?'
        ).run(name ?? null, centerLat ?? null, centerLng ?? null, radiusMeters ?? null, active ?? null, req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update geofence' });
    }
});

// -- DELETE /api/gps/geofences/:id --------------------------------------------
router.delete('/geofences/:id', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM plant_geofences WHERE ID = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete geofence' });
    }
});

module.exports = router;
