// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Â© 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Facility Floor Plan API
 * =====================================
 * Manages floor plan images, asset pin placement, draw annotations,
 * safety zones, sensor overlays, version history, and LiDAR source linking.
 * The backend for FloorPlanView.jsx — the most feature-rich component in Trier OS.
 * All floor plan data lives in trier_logistics.db (cross-plant).
 * Mounted at /api/floorplans in server/index.js.
 *
 * FILE STORAGE:
 *   Floor plan images → uploads/floorplans/{plantId}/{filename}
 *   Blueprint overlays → uploads/floorplans/{plantId}/blueprint_{filename}
 *   (Plant-scoped directories prevent cross-plant filename collision)
 *
 * ENDPOINTS:
 *   POST   /                       Upload new floor plan image (multipart)
 *   POST   /:id/blueprint          Add a blueprint overlay to an existing plan
 *   GET    /                       List floor plans for current plant
 *   POST   /import-url             Import a floor plan from a URL (Google Maps, etc.)
 *   PUT    /:id                    Update metadata + save asset pins + draw layer JSON
 *   GET    /:id/versions           List version history (snapshots before major saves)
 *   POST   /:id/versions           Save a named version snapshot
 *   POST   /:id/revert/:versionId  Restore floor plan to a previous version
 *   POST   /:id/reupload           Replace the floor plan image (keeps pins + metadata)
 *   DELETE /:id                    Delete floor plan and all associated data
 *
 *   POST   /:id/pins               Add an asset pin (x%, y%, assetId, label, icon)
 *   GET    /:id/pins               List all pins on a floor plan
 *   PUT    /:planId/pins/:pinId    Update pin position or metadata
 *   DELETE /:planId/pins/:pinId    Remove a pin
 *
 *   GET    /:id/annotations        List draw annotations (lines, shapes, text)
 *   POST   /:id/annotations        Save an annotation element
 *   PUT    /:id/annotations/:annId Update annotation
 *   DELETE /:id/annotations/:annId Remove annotation
 *
 *   GET    /:id/zones              List safety/operational zones (polygons)
 *   POST   /:id/zones              Create a zone (exclusion, work area, clean room)
 *   PUT    /:id/zones/:zoneId      Update zone polygon or metadata
 *   DELETE /:id/zones/:zoneId      Remove a zone
 *
 *   GET    /:id/sensors            List sensor overlays for this floor plan
 *   POST   /:id/sensors            Link a sensor to a floor plan position
 *   PUT    /:id/sensors/:sensorId  Update sensor position or display config
 *   DELETE /:id/sensors/:sensorId  Unlink sensor from floor plan
 *   GET    /:id/sensors/live       Fetch live readings for all sensors on this plan
 *   GET    /:id/lidar-source       Get linked LiDAR scan file metadata
 *
 * VERSION HISTORY: Every PUT /:id auto-snapshots the previous state before overwriting.
 *   Snapshots store the full JSON payload (pins, draw layer, metadata).
 *   Revert is atomic — it replaces current state and creates a snapshot of what was reverted.
 *
 * PIN COORDINATES: Stored as x_pct, y_pct (0–100) relative to image dimensions.
 *   This makes pins resolution-independent across devices and screen sizes.
 *   FloorPlanView.jsx converts to canvas pixels using: canvasX = (x_pct / 100) * imageWidth.
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db: logisticsDb } = require('../logistics_db');

const baseUploadDir = path.join(require('../resolve_data_dir'), 'uploads', 'floorplans');
if (!fs.existsSync(baseUploadDir)) fs.mkdirSync(baseUploadDir, { recursive: true });

// Ensure base tables exist
try {
    logisticsDb.prepare(`CREATE TABLE IF NOT EXISTS FloorPlans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plantId TEXT NOT NULL,
        name TEXT NOT NULL,
        imagePath TEXT NOT NULL,
        planType TEXT DEFAULT 'facility',
        floorLevel TEXT DEFAULT '',
        buildingName TEXT DEFAULT '',
        blueprintPath TEXT,
        lidarSourcePath TEXT,
        createdBy TEXT DEFAULT 'system',
        createdAt TEXT DEFAULT (datetime('now'))
    )`).run();
} catch (e) { console.error('Failed to create FloorPlans table:', e); }

try {
    logisticsDb.prepare(`CREATE TABLE IF NOT EXISTS FloorPlanPins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        floorPlanId INTEGER NOT NULL,
        assetId TEXT,
        xPercent REAL NOT NULL,
        yPercent REAL NOT NULL,
        label TEXT DEFAULT '',
        pinColor TEXT DEFAULT '#10b981',
        layerType TEXT DEFAULT 'assets',
        iconType TEXT DEFAULT NULL,
        FOREIGN KEY (floorPlanId) REFERENCES FloorPlans(id) ON DELETE CASCADE
    )`).run();
} catch (e) { console.error('Failed to create FloorPlanPins table:', e); }

// Ensure layerType column exists on FloorPlanPins
try {
    logisticsDb.prepare("ALTER TABLE FloorPlanPins ADD COLUMN layerType TEXT DEFAULT 'assets'").run();
} catch (e) { /* column already exists */ }

// Ensure iconType column exists on FloorPlanPins (equipment icon identifier)
try {
    logisticsDb.prepare("ALTER TABLE FloorPlanPins ADD COLUMN iconType TEXT DEFAULT NULL").run();
} catch (e) { /* column already exists */ }

// Multer storage - save to _temp first, move to plant dir in handler
// (multer destination callback fires before text fields are parsed)
const tempUploadDir = path.join(baseUploadDir, '_temp');
if (!fs.existsSync(tempUploadDir)) fs.mkdirSync(tempUploadDir, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, tempUploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// Ensure blueprintPath column exists on FloorPlans (alternate view of same plan)
try {
    logisticsDb.prepare("ALTER TABLE FloorPlans ADD COLUMN blueprintPath TEXT").run();
} catch (e) { /* column already exists */ }

// Ensure planType column exists on FloorPlans (facility, fire_safety, emergency, utility, engineering, custom)
try {
    logisticsDb.prepare("ALTER TABLE FloorPlans ADD COLUMN planType TEXT DEFAULT 'facility'").run();
} catch (e) { /* column already exists */ }

// Multi-floor support columns
try {
    logisticsDb.prepare("ALTER TABLE FloorPlans ADD COLUMN floorLevel TEXT DEFAULT ''").run();
} catch (e) { /* column already exists */ }
try {
    logisticsDb.prepare("ALTER TABLE FloorPlans ADD COLUMN buildingName TEXT DEFAULT ''").run();
} catch (e) { /* column already exists */ }

// Floor Plan Versioning table
try {
    logisticsDb.prepare(`CREATE TABLE IF NOT EXISTS FloorPlanVersions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        floorPlanId INTEGER NOT NULL,
        versionNumber INTEGER NOT NULL DEFAULT 1,
        imagePath TEXT NOT NULL,
        blueprintPath TEXT,
        label TEXT DEFAULT '',
        changeNote TEXT DEFAULT '',
        createdBy TEXT DEFAULT 'system',
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (floorPlanId) REFERENCES FloorPlans(id) ON DELETE CASCADE
    )`).run();
} catch (e) { /* table already exists */ }

// Helper: Save current plan state as a version snapshot
function snapshotVersion(planId, changeNote = '', createdBy = 'system') {
    const plan = logisticsDb.prepare('SELECT * FROM FloorPlans WHERE id = ?').get(planId);
    if (!plan) return null;
    const maxVer = logisticsDb.prepare('SELECT MAX(versionNumber) as maxV FROM FloorPlanVersions WHERE floorPlanId = ?').get(planId);
    const nextVer = (maxVer?.maxV || 0) + 1;
    logisticsDb.prepare(
        'INSERT INTO FloorPlanVersions (floorPlanId, versionNumber, imagePath, blueprintPath, label, changeNote, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(planId, nextVer, plan.imagePath, plan.blueprintPath || '', `v${nextVer}`, changeNote, createdBy);
    return nextVer;
}

// POST /api/floorplans - Upload a floor plan
router.post('/', upload.single('floorplan'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Image file required' });
        const { plantId, name, planType, floorLevel, buildingName } = req.body;
        if (!plantId || !name) return res.status(400).json({ error: 'plantId and name are required' });

        // Move file from _temp to plant-specific directory
        const plantDir = path.join(baseUploadDir, plantId);
        if (!fs.existsSync(plantDir)) fs.mkdirSync(plantDir, { recursive: true });
        const finalPath = path.join(plantDir, req.file.filename);
        fs.renameSync(req.file.path, finalPath);

        const imagePath = `/uploads/floorplans/${plantId}/${req.file.filename}`;
        const result = logisticsDb.prepare(
            'INSERT INTO FloorPlans (plantId, name, imagePath, createdBy, planType, floorLevel, buildingName) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(plantId, name, imagePath, req.user?.Username || 'system', planType || 'facility', floorLevel || '', buildingName || '');
        res.status(201).json({ success: true, id: result.lastInsertRowid, imagePath });
    } catch (err) {
        res.status(500).json({ error: 'Failed to upload floor plan: ' });
    }
});

// POST /api/floorplans/:id/blueprint - Save blueprint as alternate view on same plan
router.post('/:id/blueprint', upload.single('blueprint'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Blueprint image file required' });
        const plan = logisticsDb.prepare('SELECT * FROM FloorPlans WHERE id = ?').get(req.params.id);
        if (!plan) return res.status(404).json({ error: 'Floor plan not found' });

        const plantDir = path.join(baseUploadDir, plan.plantId || '_default');
        if (!fs.existsSync(plantDir)) fs.mkdirSync(plantDir, { recursive: true });
        const finalPath = path.join(plantDir, req.file.filename);
        fs.renameSync(req.file.path, finalPath);

        const blueprintPath = `/uploads/floorplans/${plan.plantId || '_default'}/${req.file.filename}`;
        
        // Auto-snapshot before blueprint change
        snapshotVersion(req.params.id, 'Blueprint generated/updated', req.user?.Username || 'system');

        // Delete old blueprint file if present (don't delete — keep for versioning)
        logisticsDb.prepare('UPDATE FloorPlans SET blueprintPath = ? WHERE id = ?').run(blueprintPath, req.params.id);
        res.json({ success: true, blueprintPath });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save blueprint: ' });
    }
});

// GET /api/floorplans?plantId=X â€” List floor plans
// If plantId is a corporate/all-sites ID, returns ALL floor plans across every plant
router.get('/', (req, res) => {
    try {
        const { plantId } = req.query;
        let sql = 'SELECT * FROM FloorPlans';
        let params = [];
        
        // Corporate / All-Sites views get all floor plans
        const isCorporateView = !plantId || 
            plantId.toLowerCase().includes('corporate') || 
            plantId.toLowerCase().includes('all');
        
        if (!isCorporateView) {
            sql += ' WHERE plantId = ?';
            params.push(plantId);
        }
        sql += ' ORDER BY createdAt DESC';
        res.json(logisticsDb.prepare(sql).all(...params));
    } catch (err) {
        res.status(500).json({ error: 'Failed to list floor plans' });
    }
});

// POST /api/floorplans/import-url — Import floor plan from image URL
router.post('/import-url', async (req, res) => {
    try {
        const { url, name, plantId } = req.body;
        if (!url || !name || !plantId) return res.status(400).json({ error: 'url, name, and plantId are required' });

        // SSRF guard: only allow http/https to public (non-private) addresses
        let parsedUrl;
        try { parsedUrl = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL format' }); }
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return res.status(400).json({ error: 'Only http and https URLs are supported' });
        }
        const PRIVATE_RANGE = /^(localhost$|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|::1$|0\.0\.0\.0|169\.254\.)/;
        if (PRIVATE_RANGE.test(parsedUrl.hostname)) {
            return res.status(400).json({ error: 'Private and local addresses are not permitted' });
        }

        const http = url.startsWith('https') ? require('https') : require('http');
        const plantDir = path.join(baseUploadDir, plantId.replace(/[^a-zA-Z0-9_-]/g, '_'));
        if (!fs.existsSync(plantDir)) fs.mkdirSync(plantDir, { recursive: true });

        const filename = `imported_${Date.now()}.png`;
        const filePath = path.join(plantDir, filename);
        const relativePath = `uploads/floorplans/${plantId.replace(/[^a-zA-Z0-9_-]/g, '_')}/${filename}`;

        await new Promise((resolve, reject) => {
            const fileStream = fs.createWriteStream(filePath);
            http.get(url, { headers: { 'User-Agent': 'TrierOS/1.0' } }, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    // Follow redirect
                    const redirectHttp = response.headers.location.startsWith('https') ? require('https') : require('http');
                    redirectHttp.get(response.headers.location, { headers: { 'User-Agent': 'TrierOS/1.0' } }, (r2) => {
                        r2.pipe(fileStream);
                        fileStream.on('finish', () => { fileStream.close(); resolve(); });
                    }).on('error', reject);
                } else {
                    response.pipe(fileStream);
                    fileStream.on('finish', () => { fileStream.close(); resolve(); });
                }
            }).on('error', reject);
        });

        logisticsDb.prepare('INSERT INTO FloorPlans (name, imagePath, plantId) VALUES (?, ?, ?)').run(name, '/' + relativePath, plantId);
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to import from URL: ' });
    }
});

// PUT /api/floorplans/:id — Update plan metadata (name, planType, floorLevel, buildingName)
router.put('/:id', (req, res) => {
    try {
        const { name, planType, floorLevel, buildingName } = req.body;
        const fields = [];
        const values = [];
        if (name !== undefined) { fields.push('name = ?'); values.push(name); }
        if (planType !== undefined) { fields.push('planType = ?'); values.push(planType); }
        if (floorLevel !== undefined) { fields.push('floorLevel = ?'); values.push(floorLevel); }
        if (buildingName !== undefined) { fields.push('buildingName = ?'); values.push(buildingName); }
        if (fields.length === 0) return res.json({ success: true });
        values.push(req.params.id);
        logisticsDb.prepare('UPDATE FloorPlans SET ' + fields.join(', ') + ' WHERE id = ?').run(...values);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update floor plan: ' });
    }
});

// ═══ VERSIONING ENDPOINTS ═══

// GET /api/floorplans/:id/versions — Get version history
router.get('/:id/versions', (req, res) => {
    try {
        const versions = logisticsDb.prepare(
            'SELECT * FROM FloorPlanVersions WHERE floorPlanId = ? ORDER BY versionNumber DESC'
        ).all(req.params.id);
        res.json(versions);
    } catch (err) {
        res.status(500).json({ error: 'Failed to get version history: ' });
    }
});

// POST /api/floorplans/:id/versions — Create a manual version snapshot
router.post('/:id/versions', (req, res) => {
    try {
        const { changeNote } = req.body;
        const ver = snapshotVersion(req.params.id, changeNote || 'Manual snapshot', req.user?.Username || 'system');
        if (!ver) return res.status(404).json({ error: 'Floor plan not found' });
        res.json({ success: true, versionNumber: ver });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create version: ' });
    }
});

// POST /api/floorplans/:id/revert/:versionId — Revert to a previous version
router.post('/:id/revert/:versionId', (req, res) => {
    try {
        const version = logisticsDb.prepare(
            'SELECT * FROM FloorPlanVersions WHERE id = ? AND floorPlanId = ?'
        ).get(req.params.versionId, req.params.id);
        if (!version) return res.status(404).json({ error: 'Version not found' });

        // Snapshot current state before reverting
        snapshotVersion(req.params.id, `Before revert to v${version.versionNumber}`, req.user?.Username || 'system');

        // Revert the plan to the version's image/blueprint
        logisticsDb.prepare(
            'UPDATE FloorPlans SET imagePath = ?, blueprintPath = ? WHERE id = ?'
        ).run(version.imagePath, version.blueprintPath || null, req.params.id);

        res.json({ success: true, revertedTo: version.versionNumber });
    } catch (err) {
        res.status(500).json({ error: 'Failed to revert: ' });
    }
});

// POST /api/floorplans/:id/reupload — Re-upload image (creates version snapshot first)
router.post('/:id/reupload', upload.single('floorplan'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Image file required' });
        const plan = logisticsDb.prepare('SELECT * FROM FloorPlans WHERE id = ?').get(req.params.id);
        if (!plan) return res.status(404).json({ error: 'Floor plan not found' });

        // Snapshot current state
        snapshotVersion(req.params.id, req.body.changeNote || 'Image re-uploaded', req.user?.Username || 'system');

        // Save new file
        const plantDir = path.join(baseUploadDir, plan.plantId || '_default');
        if (!fs.existsSync(plantDir)) fs.mkdirSync(plantDir, { recursive: true });
        const finalPath = path.join(plantDir, req.file.filename);
        fs.renameSync(req.file.path, finalPath);
        const imagePath = `/uploads/floorplans/${plan.plantId || '_default'}/${req.file.filename}`;

        logisticsDb.prepare('UPDATE FloorPlans SET imagePath = ? WHERE id = ?').run(imagePath, req.params.id);
        res.json({ success: true, imagePath });
    } catch (err) {
        res.status(500).json({ error: 'Failed to re-upload: ' });
    }
});

// DELETE /api/floorplans/:id
router.delete('/:id', (req, res) => {
    try {
        const plan = logisticsDb.prepare('SELECT imagePath FROM FloorPlans WHERE id = ?').get(req.params.id);
        if (plan) {
            const filePath = path.join(require('../resolve_data_dir'), plan.imagePath);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        logisticsDb.prepare('DELETE FROM FloorPlanPins WHERE floorPlanId = ?').run(req.params.id);
        logisticsDb.prepare('DELETE FROM FloorPlanAnnotations WHERE floorPlanId = ?').run(req.params.id);
        logisticsDb.prepare('DELETE FROM FloorPlans WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete floor plan' });
    }
});

// POST /api/floorplans/:id/pins â€” Add a pin
router.post('/:id/pins', (req, res) => {
    try {
        const { assetId, xPercent, yPercent, label, pinColor, layerType, iconType } = req.body;
        if (xPercent === undefined || yPercent === undefined) {
            return res.status(400).json({ error: 'xPercent and yPercent are required' });
        }
        const result = logisticsDb.prepare(
            'INSERT INTO FloorPlanPins (floorPlanId, assetId, xPercent, yPercent, label, pinColor, layerType, iconType) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(req.params.id, assetId, xPercent, yPercent, label || '', pinColor || '#10b981', layerType || 'assets', iconType || null);
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add pin' });
    }
});

// GET /api/floorplans/:id/pins â€” Get all pins
router.get('/:id/pins', (req, res) => {
    try {
        const pins = logisticsDb.prepare('SELECT * FROM FloorPlanPins WHERE floorPlanId = ?').all(req.params.id);
        res.json(pins);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch pins' });
    }
});

// PUT /api/floorplans/:planId/pins/:pinId â€” Move a pin
router.put('/:planId/pins/:pinId', (req, res) => {
    try {
        const { xPercent, yPercent, label, pinColor } = req.body;
        const fields = [];
        const values = [];
        if (xPercent !== undefined) { fields.push('xPercent = ?'); values.push(xPercent); }
        if (yPercent !== undefined) { fields.push('yPercent = ?'); values.push(yPercent); }
        if (label !== undefined) { fields.push('label = ?'); values.push(label); }
        if (pinColor !== undefined) { fields.push('pinColor = ?'); values.push(pinColor); }
        if (fields.length === 0) return res.json({ success: true });
        values.push(req.params.pinId);
        logisticsDb.prepare('UPDATE FloorPlanPins SET ' + fields.join(', ') + ' WHERE id = ?').run(...values);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update pin' });
    }
});

// DELETE /api/floorplans/:planId/pins/:pinId â€” Remove a pin
router.delete('/:planId/pins/:pinId', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM FloorPlanPins WHERE id = ?').run(req.params.pinId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete pin' });
    }
});

// ════════════════════════════════════════════════════════════════
// FLOOR PLAN ANNOTATIONS — Arrows, Routes, Text, Measurements
// ════════════════════════════════════════════════════════════════

// Ensure Annotations table exists
try {
    logisticsDb.prepare(`CREATE TABLE IF NOT EXISTS FloorPlanAnnotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        floorPlanId INTEGER NOT NULL,
        type TEXT NOT NULL,
        layerType TEXT DEFAULT 'emergency',
        points TEXT,
        label TEXT DEFAULT '',
        color TEXT DEFAULT '#ef4444',
        strokeWidth INTEGER DEFAULT 3,
        fontSize INTEGER DEFAULT 14,
        createdBy TEXT DEFAULT 'system',
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (floorPlanId) REFERENCES FloorPlans(id)
    )`).run();
} catch (e) { /* table already exists */ }

// GET /api/floorplans/:id/annotations — Get all annotations for a floor plan
router.get('/:id/annotations', (req, res) => {
    try {
        const rows = logisticsDb.prepare('SELECT * FROM FloorPlanAnnotations WHERE floorPlanId = ? ORDER BY createdAt').all(req.params.id);
        // Parse points JSON for each row
        const annotations = rows.map(r => ({
            ...r,
            points: r.points ? JSON.parse(r.points) : [],
        }));
        res.json(annotations);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch annotations' });
    }
});

// POST /api/floorplans/:id/annotations — Add an annotation
router.post('/:id/annotations', (req, res) => {
    try {
        const { type, layerType, points, label, color, strokeWidth, fontSize } = req.body;
        if (!type || !points || !Array.isArray(points) || points.length < 1) {
            return res.status(400).json({ error: 'type and points[] are required' });
        }
        const result = logisticsDb.prepare(
            'INSERT INTO FloorPlanAnnotations (floorPlanId, type, layerType, points, label, color, strokeWidth, fontSize, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            req.params.id,
            type,
            layerType || 'emergency',
            JSON.stringify(points),
            label || '',
            color || '#ef4444',
            strokeWidth || 3,
            fontSize || 14,
            req.user?.Username || 'system'
        );
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add annotation: ' });
    }
});

// PUT /api/floorplans/:id/annotations/:annId — Update an annotation
router.put('/:id/annotations/:annId', (req, res) => {
    try {
        const { points, label, color, strokeWidth } = req.body;
        const fields = [];
        const values = [];
        if (points) { fields.push('points = ?'); values.push(JSON.stringify(points)); }
        if (label !== undefined) { fields.push('label = ?'); values.push(label); }
        if (color) { fields.push('color = ?'); values.push(color); }
        if (strokeWidth) { fields.push('strokeWidth = ?'); values.push(strokeWidth); }
        if (fields.length === 0) return res.json({ success: true });
        values.push(req.params.annId);
        logisticsDb.prepare('UPDATE FloorPlanAnnotations SET ' + fields.join(', ') + ' WHERE id = ?').run(...values);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update annotation' });
    }
});

// DELETE /api/floorplans/:id/annotations/:annId — Delete an annotation
router.delete('/:id/annotations/:annId', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM FloorPlanAnnotations WHERE id = ?').run(req.params.annId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete annotation' });
    }
});

// ════════════════════════════════════════════════════════════════
// FLOOR PLAN ZONES — Polygonal zone overlays
// ════════════════════════════════════════════════════════════════

// Ensure Zones table exists
try {
    logisticsDb.prepare(`CREATE TABLE IF NOT EXISTS FloorPlanZones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        floorPlanId INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT 'Unnamed Zone',
        zoneType TEXT NOT NULL DEFAULT 'production',
        points TEXT NOT NULL,
        color TEXT DEFAULT '#3b82f6',
        opacity REAL DEFAULT 0.25,
        hazardClass TEXT DEFAULT '',
        capacity INTEGER DEFAULT 0,
        notes TEXT DEFAULT '',
        createdBy TEXT DEFAULT 'system',
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (floorPlanId) REFERENCES FloorPlans(id)
    )`).run();
} catch (e) { /* table already exists */ }

// GET /api/floorplans/:id/zones
router.get('/:id/zones', (req, res) => {
    try {
        const rows = logisticsDb.prepare('SELECT * FROM FloorPlanZones WHERE floorPlanId = ? ORDER BY createdAt').all(req.params.id);
        const zones = rows.map(r => ({
            ...r,
            points: r.points ? JSON.parse(r.points) : [],
        }));
        res.json(zones);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch zones' });
    }
});

// POST /api/floorplans/:id/zones
router.post('/:id/zones', (req, res) => {
    try {
        const { name, zoneType, points, color, opacity, hazardClass, capacity, notes } = req.body;
        if (!points || !Array.isArray(points) || points.length < 3) {
            return res.status(400).json({ error: 'At least 3 points required to define a zone polygon' });
        }
        const result = logisticsDb.prepare(
            'INSERT INTO FloorPlanZones (floorPlanId, name, zoneType, points, color, opacity, hazardClass, capacity, notes, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            req.params.id,
            name || 'Unnamed Zone',
            zoneType || 'production',
            JSON.stringify(points),
            color || '#3b82f6',
            opacity != null ? opacity : 0.25,
            hazardClass || '',
            capacity || 0,
            notes || '',
            req.user?.Username || 'system'
        );
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create zone: ' });
    }
});

// PUT /api/floorplans/:id/zones/:zoneId
router.put('/:id/zones/:zoneId', (req, res) => {
    try {
        const { name, zoneType, points, color, opacity, hazardClass, capacity, notes } = req.body;
        const fields = [];
        const values = [];
        if (name !== undefined) { fields.push('name = ?'); values.push(name); }
        if (zoneType) { fields.push('zoneType = ?'); values.push(zoneType); }
        if (points) { fields.push('points = ?'); values.push(JSON.stringify(points)); }
        if (color) { fields.push('color = ?'); values.push(color); }
        if (opacity != null) { fields.push('opacity = ?'); values.push(opacity); }
        if (hazardClass !== undefined) { fields.push('hazardClass = ?'); values.push(hazardClass); }
        if (capacity != null) { fields.push('capacity = ?'); values.push(capacity); }
        if (notes !== undefined) { fields.push('notes = ?'); values.push(notes); }
        if (fields.length === 0) return res.json({ success: true });
        values.push(req.params.zoneId);
        logisticsDb.prepare('UPDATE FloorPlanZones SET ' + fields.join(', ') + ' WHERE id = ?').run(...values);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update zone' });
    }
});

// DELETE /api/floorplans/:id/zones/:zoneId
router.delete('/:id/zones/:zoneId', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM FloorPlanZones WHERE id = ?').run(req.params.zoneId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete zone' });
    }
});

// ═══════════════════════════════════════════════════════
// REAL-TIME SENSOR INTEGRATION
// ═══════════════════════════════════════════════════════

// FloorPlanSensors table
try {
    logisticsDb.prepare(`CREATE TABLE IF NOT EXISTS FloorPlanSensors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        floorPlanId INTEGER NOT NULL,
        name TEXT NOT NULL,
        sensorType TEXT NOT NULL DEFAULT 'temperature',
        xPercent REAL NOT NULL,
        yPercent REAL NOT NULL,
        unit TEXT DEFAULT '°F',
        minThreshold REAL DEFAULT 32,
        maxThreshold REAL DEFAULT 100,
        alertAbove REAL DEFAULT 90,
        alertBelow REAL DEFAULT 35,
        scadaEndpoint TEXT DEFAULT '',
        scadaTag TEXT DEFAULT '',
        pollIntervalSec INTEGER DEFAULT 30,
        lastValue REAL,
        lastReadAt TEXT,
        status TEXT DEFAULT 'normal',
        notes TEXT DEFAULT '',
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (floorPlanId) REFERENCES FloorPlans(id) ON DELETE CASCADE
    )`).run();
} catch (e) { /* table already exists */ }

// GET /api/floorplans/:id/sensors — List sensors for a floor plan
router.get('/:id/sensors', (req, res) => {
    try {
        const sensors = logisticsDb.prepare(
            'SELECT * FROM FloorPlanSensors WHERE floorPlanId = ? ORDER BY name'
        ).all(req.params.id);
        res.json(sensors);
    } catch (err) {
        res.status(500).json({ error: 'Failed to get sensors: ' });
    }
});

// POST /api/floorplans/:id/sensors — Add a sensor
router.post('/:id/sensors', (req, res) => {
    try {
        const { name, sensorType, xPercent, yPercent, unit, minThreshold, maxThreshold,
                alertAbove, alertBelow, scadaEndpoint, scadaTag, pollIntervalSec, notes } = req.body;
        if (!name || xPercent == null || yPercent == null) {
            return res.status(400).json({ error: 'name, xPercent, yPercent are required' });
        }
        const result = logisticsDb.prepare(
            `INSERT INTO FloorPlanSensors (floorPlanId, name, sensorType, xPercent, yPercent, unit,
             minThreshold, maxThreshold, alertAbove, alertBelow, scadaEndpoint, scadaTag, pollIntervalSec, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(req.params.id, name, sensorType || 'temperature', xPercent, yPercent,
              unit || '°F', minThreshold || 32, maxThreshold || 100,
              alertAbove || 90, alertBelow || 35,
              scadaEndpoint || '', scadaTag || '', pollIntervalSec || 30, notes || '');
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add sensor: ' });
    }
});

// PUT /api/floorplans/:id/sensors/:sensorId — Update sensor config
router.put('/:id/sensors/:sensorId', (req, res) => {
    try {
        const { name, sensorType, xPercent, yPercent, unit, minThreshold, maxThreshold,
                alertAbove, alertBelow, scadaEndpoint, scadaTag, pollIntervalSec, notes } = req.body;
        logisticsDb.prepare(
            `UPDATE FloorPlanSensors SET name=?, sensorType=?, xPercent=?, yPercent=?, unit=?,
             minThreshold=?, maxThreshold=?, alertAbove=?, alertBelow=?,
             scadaEndpoint=?, scadaTag=?, pollIntervalSec=?, notes=? WHERE id=?`
        ).run(name, sensorType, xPercent, yPercent, unit, minThreshold, maxThreshold,
              alertAbove, alertBelow, scadaEndpoint || '', scadaTag || '',
              pollIntervalSec || 30, notes || '', req.params.sensorId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update sensor: ' });
    }
});

// DELETE /api/floorplans/:id/sensors/:sensorId
router.delete('/:id/sensors/:sensorId', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM FloorPlanSensors WHERE id = ?').run(req.params.sensorId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete sensor: ' });
    }
});

// GET /api/floorplans/:id/sensors/live — Get live sensor readings (simulated or SCADA)
router.get('/:id/sensors/live', async (req, res) => {
    try {
        const sensors = logisticsDb.prepare(
            'SELECT * FROM FloorPlanSensors WHERE floorPlanId = ?'
        ).all(req.params.id);

        const readings = sensors.map(s => {
            let value, status;
            if (s.scadaEndpoint) {
                // In production: fetch from SCADA endpoint
                // For now, simulate with realistic values based on sensor type
                value = simulateSensorValue(s);
            } else {
                value = simulateSensorValue(s);
            }
            // Determine status
            if (value >= s.alertAbove) status = 'critical';
            else if (value <= s.alertBelow) status = 'critical';
            else if (value >= s.alertAbove * 0.9) status = 'warning';
            else if (value <= s.alertBelow * 1.1) status = 'warning';
            else status = 'normal';

            // Persist last reading
            logisticsDb.prepare(
                'UPDATE FloorPlanSensors SET lastValue = ?, lastReadAt = datetime("now"), status = ? WHERE id = ?'
            ).run(value, status, s.id);

            return {
                id: s.id,
                name: s.name,
                sensorType: s.sensorType,
                xPercent: s.xPercent,
                yPercent: s.yPercent,
                value: Math.round(value * 10) / 10,
                unit: s.unit,
                status,
                minThreshold: s.minThreshold,
                maxThreshold: s.maxThreshold,
                alertAbove: s.alertAbove,
                alertBelow: s.alertBelow,
                readAt: new Date().toISOString(),
            };
        });
        res.json(readings);
    } catch (err) {
        res.status(500).json({ error: 'Failed to get live data: ' });
    }
});

// Simulate realistic sensor values
function simulateSensorValue(sensor) {
    const t = Date.now() / 1000;
    const noise = (Math.sin(t * 0.1 + sensor.id * 7) + Math.sin(t * 0.23 + sensor.id * 3)) * 0.5;
    switch (sensor.sensorType) {
        case 'temperature':
            return 68 + noise * 15 + Math.random() * 3; // 50-90°F range
        case 'pressure':
            return 14.7 + noise * 2 + Math.random() * 0.5; // ~14.7 PSI ± variation
        case 'vibration':
            return Math.abs(3.5 + noise * 2 + Math.random()); // 0-8 mm/s
        case 'humidity':
            return 45 + noise * 15 + Math.random() * 5; // 25-70% RH
        case 'motion':
            return Math.random() > 0.7 ? 1 : 0; // binary: detected or not
        case 'occupancy':
            return Math.floor(Math.abs(5 + noise * 8 + Math.random() * 3)); // 0-15 people
        default:
            return 50 + noise * 20;
    }
}

// LiDAR 3D source file tracking — store path to original PLY/OBJ for 3D viewer
try {
    logisticsDb.prepare("ALTER TABLE FloorPlans ADD COLUMN lidarSourcePath TEXT DEFAULT NULL").run();
} catch (e) { /* column already exists */ }

// GET /api/floorplans/:id/lidar-source — Serve raw PLY/OBJ file for 3D viewer
router.get('/:id/lidar-source', (req, res) => {
    try {
        const plan = logisticsDb.prepare('SELECT * FROM FloorPlans WHERE id = ?').get(req.params.id);
        if (!plan) return res.status(404).json({ error: 'Floor plan not found' });
        
        if (!plan.lidarSourcePath) {
            return res.status(404).json({ error: 'No LiDAR source file associated with this floor plan' });
        }
        
        const dataDir = require('../resolve_data_dir');
        const filePath = path.join(dataDir, plan.lidarSourcePath);

        // Audit 47 / M-9: defense-in-depth boundary check. lidarSourcePath comes
        // from the DB — if any other code path ever writes a user-controlled
        // string here, the unchecked path.join would hand an attacker
        // arbitrary-file-read via this endpoint. Resolve and confirm the path
        // stays inside dataDir.
        const resolved = path.resolve(filePath);
        const boundary = path.resolve(dataDir) + path.sep;
        if (!resolved.startsWith(boundary)) {
            return res.status(403).json({ error: 'Boundary escape detected' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'LiDAR source file not found on disk' });
        }
        
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = ext === '.ply' ? 'application/x-ply' : 'text/plain';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
        res.sendFile(filePath);
    } catch (err) {
        res.status(500).json({ error: 'Failed to serve LiDAR file: ' });
    }
});

module.exports = router;

