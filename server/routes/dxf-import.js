// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — CAD/DXF Import Engine
 * ===================================
 * Converts AutoCAD DXF files into floor plan PNG images for use in
 * FloorPlanView.jsx. Enables facilities to import existing CAD drawings
 * directly — no re-drawing required.
 * Mounted at /api/dxf-import in server/index.js.
 *
 * ENDPOINTS:
 *   POST /    Upload and process a .dxf file (multipart/form-data, field: dxffile)
 *             Query params: ?plantId=Demo_Plant_1&floorName=Building+A
 *             Returns: { floorplanId, imageUrl, width, height, entityCount }
 *
 * PROCESSING PIPELINE (4 steps):
 *   1. Upload  — multer streams file to /data/uploads/floorplans/_temp/
 *   2. Parse   — DXF parser reads entity blocks (LINE, POLYLINE, CIRCLE, ARC, etc.)
 *   3. SVG     — Entities translated to SVG paths with coordinate normalization
 *   4. PNG     — SVG rasterized to PNG via sharp; saved to uploads/floorplans/{plantId}/
 *                Record written to floorplans table in logistics_db
 *
 * SUPPORTED DXF ENTITY TYPES:
 *   LINE, LWPOLYLINE, POLYLINE   — walls, partitions, structural lines
 *   CIRCLE, ARC, ELLIPSE         — columns, curved walls, equipment footprints
 *   TEXT, MTEXT                  — room labels (rendered as SVG text)
 *   DIMENSION                    — dimension annotations (optional, can be filtered)
 *   POINT                        — reference points
 *   INSERT                       — block references (expanded from BLOCK definitions)
 *
 * OUTPUT: PNG stored in /data/uploads/floorplans/{plantId}/{timestamp}.png
 *   Coordinate system: DXF model-space units mapped to pixel space.
 *   Viewbox auto-fitted to entity bounding box with 5% padding.
 *
 * FILE SIZE: Upload limit 100MB. Typical CAD floor plan: 0.5–20MB.
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db: logisticsDb } = require('../logistics_db');

const baseUploadDir = path.join(require('../resolve_data_dir'), 'uploads', 'floorplans');
if (!fs.existsSync(baseUploadDir)) fs.mkdirSync(baseUploadDir, { recursive: true });

// Multer — temp storage for DXF uploads
const tempDir = path.join(baseUploadDir, '_temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, tempDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB — CAD files can be large

// ── Standard AutoCAD ACI color table → hex ──
const DXF_COLORS = {
    0: '#000000', 1: '#FF0000', 2: '#FFFF00', 3: '#00FF00', 4: '#00FFFF',
    5: '#0000FF', 6: '#FF00FF', 7: '#000000', 8: '#808080', 9: '#C0C0C0',
    10: '#FF0000', 11: '#FF7F7F', 20: '#996633', 30: '#00FF00', 40: '#00FFFF',
    50: '#0000FF', 60: '#FF00FF', 250: '#333333', 251: '#545454',
    252: '#787878', 253: '#A0A0A0', 254: '#C8C8C8', 255: '#FFFFFF',
    256: '#000000' // BYLAYER default
};

// POST /api/floorplans/import-dxf — Import a .dxf CAD file as a floor plan
router.post('/', upload.single('dxffile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'DXF file required' });
        const { plantId, name, planType } = req.body;
        if (!plantId || !name) return res.status(400).json({ error: 'plantId and name are required' });

        const DxfParser = require('dxf-parser');
        const sharp = require('sharp');

        // ── 1. Parse the DXF file ──
        const dxfContent = fs.readFileSync(req.file.path, 'utf-8');
        const parser = new DxfParser();
        let dxf;
        try {
            dxf = parser.parseSync(dxfContent);
        } catch (parseErr) {
            try { fs.unlinkSync(req.file.path); } catch(e) {}
            return res.status(400).json({ error: 'Invalid DXF file: ' + parseErr.message });
        }

        if (!dxf || !dxf.entities || dxf.entities.length === 0) {
            try { fs.unlinkSync(req.file.path); } catch(e) {}
            return res.status(400).json({ error: 'DXF file contains no drawable entities' });
        }

        // ── 2. Compute bounding box ──
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const updateBounds = (x, y) => {
            if (x != null && y != null && isFinite(x) && isFinite(y)) {
                minX = Math.min(minX, x); minY = Math.min(minY, y);
                maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            }
        };

        for (const e of dxf.entities) {
            switch (e.type) {
                case 'LINE':
                    updateBounds(e.vertices?.[0]?.x, e.vertices?.[0]?.y);
                    updateBounds(e.vertices?.[1]?.x, e.vertices?.[1]?.y);
                    break;
                case 'LWPOLYLINE':
                case 'POLYLINE':
                    (e.vertices || []).forEach(v => updateBounds(v.x, v.y));
                    break;
                case 'CIRCLE':
                case 'ARC':
                    if (e.center && e.radius) {
                        updateBounds(e.center.x - e.radius, e.center.y - e.radius);
                        updateBounds(e.center.x + e.radius, e.center.y + e.radius);
                    }
                    break;
                case 'ELLIPSE':
                    if (e.center) {
                        const mx = Math.abs(e.majorAxisEndPoint?.x || 0) + Math.abs(e.majorAxisEndPoint?.y || 0);
                        updateBounds(e.center.x - mx, e.center.y - mx);
                        updateBounds(e.center.x + mx, e.center.y + mx);
                    }
                    break;
                case 'TEXT':
                    updateBounds(e.startPoint?.x, e.startPoint?.y);
                    break;
                case 'MTEXT':
                    updateBounds(e.position?.x, e.position?.y);
                    break;
                case 'INSERT':
                    updateBounds(e.position?.x, e.position?.y);
                    break;
                case 'DIMENSION':
                    if (e.anchorPoint) updateBounds(e.anchorPoint.x, e.anchorPoint.y);
                    if (e.middleOfText) updateBounds(e.middleOfText.x, e.middleOfText.y);
                    break;
                case 'POINT':
                    updateBounds(e.position?.x, e.position?.y);
                    break;
            }
        }

        if (!isFinite(minX) || !isFinite(minY)) {
            try { fs.unlinkSync(req.file.path); } catch(e) {}
            return res.status(400).json({ error: 'Could not determine drawing bounds from DXF entities' });
        }

        // ── 3. Color resolver ──
        const getEntityColor = (entity) => {
            if (entity.color !== undefined && entity.color !== 256) {
                return DXF_COLORS[entity.color] || '#333333';
            }
            if (entity.layer && dxf.tables?.layer?.layers?.[entity.layer]) {
                const lc = dxf.tables.layer.layers[entity.layer].color;
                if (lc !== undefined) return DXF_COLORS[lc] || '#333333';
            }
            return '#333333';
        };

        // ── 4. Generate SVG ──
        const PADDING = 40;
        const drawWidth = maxX - minX || 1;
        const drawHeight = maxY - minY || 1;
        const aspect = drawWidth / drawHeight;
        const IMG_WIDTH = Math.min(4000, Math.max(2000, Math.round(drawWidth)));
        const IMG_HEIGHT = Math.max(400, Math.round(IMG_WIDTH / aspect));
        const scaleX = (IMG_WIDTH - 2 * PADDING) / drawWidth;
        const scaleY = (IMG_HEIGHT - 2 * PADDING) / drawHeight;
        const scale = Math.min(scaleX, scaleY);

        // Transform DXF coords → SVG coords (DXF Y is up, SVG Y is down)
        const tx = (x) => PADDING + (x - minX) * scale;
        const ty = (y) => IMG_HEIGHT - PADDING - (y - minY) * scale;

        const svgParts = [];
        const layerStats = {};
        const entityCounts = {};

        const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        for (const e of dxf.entities) {
            const color = getEntityColor(e);
            const layer = e.layer || 'default';
            layerStats[layer] = (layerStats[layer] || 0) + 1;
            entityCounts[e.type] = (entityCounts[e.type] || 0) + 1;

            try {
                switch (e.type) {
                    case 'LINE': {
                        if (!e.vertices || e.vertices.length < 2) break;
                        const [v1, v2] = e.vertices;
                        svgParts.push(`<line x1="${tx(v1.x)}" y1="${ty(v1.y)}" x2="${tx(v2.x)}" y2="${ty(v2.y)}" stroke="${color}" stroke-width="1.5"/>`);
                        break;
                    }
                    case 'LWPOLYLINE':
                    case 'POLYLINE': {
                        if (!e.vertices || e.vertices.length < 2) break;
                        const pts = e.vertices.map(v => `${tx(v.x)},${ty(v.y)}`).join(' ');
                        const closed = e.shape ? ' Z' : '';
                        svgParts.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`);
                        break;
                    }
                    case 'CIRCLE': {
                        if (!e.center || !e.radius) break;
                        svgParts.push(`<circle cx="${tx(e.center.x)}" cy="${ty(e.center.y)}" r="${e.radius * scale}" fill="none" stroke="${color}" stroke-width="1.2"/>`);
                        break;
                    }
                    case 'ARC': {
                        if (!e.center || !e.radius) break;
                        const r = e.radius * scale;
                        const sa = (e.startAngle || 0) * Math.PI / 180;
                        const ea = (e.endAngle || 360) * Math.PI / 180;
                        const cx = tx(e.center.x), cy = ty(e.center.y);
                        // Y is flipped, so negate the angles
                        const x1 = cx + r * Math.cos(-sa);
                        const y1 = cy + r * Math.sin(-sa);
                        const x2 = cx + r * Math.cos(-ea);
                        const y2 = cy + r * Math.sin(-ea);
                        let sw = ea - sa;
                        if (sw < 0) sw += 2 * Math.PI;
                        const la = sw > Math.PI ? 1 : 0;
                        svgParts.push(`<path d="M ${x1} ${y1} A ${r} ${r} 0 ${la} 0 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="1.2"/>`);
                        break;
                    }
                    case 'ELLIPSE': {
                        if (!e.center) break;
                        const emx = e.majorAxisEndPoint?.x || 1;
                        const emy = e.majorAxisEndPoint?.y || 0;
                        const majorLen = Math.sqrt(emx * emx + emy * emy) * scale;
                        const minorLen = majorLen * (e.axisRatio || 0.5);
                        const ang = Math.atan2(-emy, emx) * 180 / Math.PI;
                        svgParts.push(`<ellipse cx="${tx(e.center.x)}" cy="${ty(e.center.y)}" rx="${majorLen}" ry="${minorLen}" transform="rotate(${ang} ${tx(e.center.x)} ${ty(e.center.y)})" fill="none" stroke="${color}" stroke-width="1.2"/>`);
                        break;
                    }
                    case 'TEXT': {
                        const x = tx(e.startPoint?.x || 0);
                        const y = ty(e.startPoint?.y || 0);
                        const fs = Math.max(8, Math.min(24, (e.textHeight || 1) * scale * 0.8));
                        const txt = esc(e.text);
                        if (txt.trim()) {
                            svgParts.push(`<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${fs}" fill="${color}">${txt}</text>`);
                        }
                        break;
                    }
                    case 'MTEXT': {
                        const mx2 = tx(e.position?.x || 0);
                        const my2 = ty(e.position?.y || 0);
                        const fs2 = Math.max(8, Math.min(20, (e.height || 1) * scale * 0.8));
                        // Strip MText formatting codes: \A1; \P \fArial|...; {}{} etc.
                        let mtxt = (e.text || '').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').replace(/\\P/g, ' ');
                        mtxt = esc(mtxt);
                        if (mtxt.trim()) {
                            svgParts.push(`<text x="${mx2}" y="${my2}" font-family="Arial,sans-serif" font-size="${fs2}" fill="${color}">${mtxt}</text>`);
                        }
                        break;
                    }
                    case 'DIMENSION': {
                        if (!e.middleOfText) break;
                        const dx = tx(e.middleOfText.x);
                        const dy = ty(e.middleOfText.y);
                        const dtxt = esc(e.text);
                        if (dtxt.trim()) {
                            svgParts.push(`<text x="${dx}" y="${dy}" font-family="Arial,sans-serif" font-size="10" fill="#666" text-anchor="middle">${dtxt}</text>`);
                        }
                        break;
                    }
                    case 'POINT': {
                        if (!e.position) break;
                        svgParts.push(`<circle cx="${tx(e.position.x)}" cy="${ty(e.position.y)}" r="2" fill="${color}"/>`);
                        break;
                    }
                }
            } catch (entErr) {
                // Skip malformed entities
            }
        }

        if (svgParts.length === 0) {
            try { fs.unlinkSync(req.file.path); } catch(e) {}
            return res.status(400).json({ error: 'No drawable entities found in DXF file' });
        }

        const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_WIDTH}" height="${IMG_HEIGHT}" viewBox="0 0 ${IMG_WIDTH} ${IMG_HEIGHT}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <g>
    ${svgParts.join('\n    ')}
  </g>
</svg>`;

        // ── 5. Render SVG → PNG via sharp ──
        const plantDir = path.join(baseUploadDir, plantId.replace(/[^a-zA-Z0-9_-]/g, '_'));
        if (!fs.existsSync(plantDir)) fs.mkdirSync(plantDir, { recursive: true });

        const filename = `cad_${Date.now()}.png`;
        const outputPath = path.join(plantDir, filename);
        const imgRelPath = `/uploads/floorplans/${plantId.replace(/[^a-zA-Z0-9_-]/g, '_')}/${filename}`;

        await sharp(Buffer.from(svgStr))
            .png({ quality: 95 })
            .toFile(outputPath);

        // ── 6. Save as floor plan in database ──
        const result = logisticsDb.prepare(
            'INSERT INTO FloorPlans (plantId, name, imagePath, createdBy, planType) VALUES (?, ?, ?, ?, ?)'
        ).run(plantId, name, imgRelPath, req.user?.username || 'system', planType || 'engineering');

        // Clean up temp DXF file
        try { fs.unlinkSync(req.file.path); } catch(e) {}

        console.log(`📐 [CAD Import] ${name}: ${dxf.entities.length} entities, ${Object.keys(layerStats).length} layers → ${IMG_WIDTH}x${IMG_HEIGHT}px PNG`);

        res.status(201).json({
            success: true,
            id: result.lastInsertRowid,
            imagePath: imgRelPath,
            stats: {
                totalEntities: dxf.entities.length,
                rendered: svgParts.length,
                layers: layerStats,
                entityTypes: entityCounts,
                imageSize: `${IMG_WIDTH}x${IMG_HEIGHT}`
            }
        });
    } catch (err) {
        console.error('📐 [CAD Import] Error:', err);
        if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch(e) {} }
        res.status(500).json({ error: 'DXF import failed: ' });
    }
});

module.exports = router;
