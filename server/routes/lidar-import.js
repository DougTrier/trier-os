// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — LiDAR 3D Scan Import Engine
 * =========================================
 * Converts LiDAR scan files (.ply, .obj) into overhead floor plan PNG images
 * for use in FloorPlanView.jsx. Enables any facility to generate accurate
 * floor plans directly from a mobile LiDAR scanner without CAD software.
 * Mounted at /api/lidar-import in server/index.js.
 *
 * ENDPOINTS:
 *   POST /    Upload and process a LiDAR scan file (multipart/form-data, field: lidarfile)
 *             Returns: { floorplanId, imageUrl, width, height, pointCount }
 *             Query params: ?plantId=Demo_Plant_1&floorName=Building+A
 *
 * PROCESSING PIPELINE (5 steps):
 *   1. Upload   — multer streams file to /data/uploads/floorplans/_temp/ (max 200MB)
 *   2. Parse    — PLY parser (ASCII point cloud) or OBJ parser (mesh vertices + faces)
 *   3. Project  — Discard Z axis; normalize X/Y to [0,1] bounding box
 *   4. Detect   — Density-based wall detection: grid cells above threshold → filled pixel
 *   5. Render   — Canvas-to-PNG: white background, black walls; saved to uploads/floorplans/
 *                 Record written to floorplans table in logistics_db for FloorPlanView
 *
 * SUPPORTED FORMATS:
 *   .ply  — Stanford Point Cloud (ASCII and binary-header with ASCII body)
 *           Reads `element vertex` count + property order from header; parses XYZ
 *   .obj  — Wavefront OBJ Mesh; reads `v` (vertex) lines, ignores normals/UVs/faces
 *
 * SCANNER APPS (tested):
 *   - Polycam (iOS/Android) — exports .ply
 *   - 3D Scanner App (iOS)  — exports .ply or .obj
 *   - RoomPlan (ARKit, iOS 16+) — exports .usdz → convert to .obj before upload
 *   - Scaniverse (iOS/Android) — exports .ply
 *
 * OUTPUT: PNG stored in /data/uploads/floorplans/{plantId}/{timestamp}.png
 *   Resolution scales with point density: denser scans → larger grid → sharper image.
 *   Grid resolution default: 1000×1000 pixels (oversampled for Retina displays).
 *
 * FILE SIZE: 200MB upload limit. Typical scan: 5–50MB PLY, 10–150MB OBJ.
 *   Large files may take 10–30 seconds to process (pure JS, no native bindings).
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db: logisticsDb } = require('../logistics_db');

const baseUploadDir = path.join(require('../resolve_data_dir'), 'uploads', 'floorplans');
if (!fs.existsSync(baseUploadDir)) fs.mkdirSync(baseUploadDir, { recursive: true });

const tempDir = path.join(baseUploadDir, '_temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, tempDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB — LiDAR scans can be very large

// ══════════════════════════════════════════════
// PLY Parser — ASCII Point Cloud Data
// ══════════════════════════════════════════════
function parsePLY(content) {
    const lines = content.split('\n');
    const vertices = [];
    let vertexCount = 0;
    let headerDone = false;
    let xIdx = 0, yIdx = 1, zIdx = 2;
    let propIndex = 0;
    const propNames = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!headerDone) {
            if (line.startsWith('element vertex')) {
                vertexCount = parseInt(line.split(/\s+/)[2]);
            } else if (line.startsWith('property')) {
                propNames.push(line.split(/\s+/).pop());
                propIndex++;
            } else if (line === 'end_header') {
                headerDone = true;
                // Determine x, y, z column indices from property names
                xIdx = propNames.indexOf('x');
                yIdx = propNames.indexOf('y');
                zIdx = propNames.indexOf('z');
                if (xIdx === -1) xIdx = 0;
                if (yIdx === -1) yIdx = 1;
                if (zIdx === -1) zIdx = 2;
            }
            continue;
        }

        if (vertices.length >= vertexCount) break;

        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
            const x = parseFloat(parts[xIdx]);
            const y = parseFloat(parts[yIdx]);
            const z = parseFloat(parts[zIdx]);
            if (isFinite(x) && isFinite(y) && isFinite(z)) {
                vertices.push({ x, y, z });
            }
        }
    }

    return { vertices, format: 'ply' };
}

// ══════════════════════════════════════════════
// OBJ Parser — Wavefront Mesh Data
// ══════════════════════════════════════════════
function parseOBJ(content) {
    const lines = content.split('\n');
    const vertices = [];
    const faces = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('v ')) {
            const parts = trimmed.split(/\s+/);
            const x = parseFloat(parts[1]);
            const y = parseFloat(parts[2]);
            const z = parseFloat(parts[3]);
            if (isFinite(x) && isFinite(y) && isFinite(z)) {
                vertices.push({ x, y, z });
            }
        } else if (trimmed.startsWith('f ')) {
            // Face indices (1-based, may contain texture/normal refs like "1/2/3")
            const parts = trimmed.split(/\s+/).slice(1);
            const faceVerts = parts.map(p => parseInt(p.split('/')[0]) - 1).filter(i => !isNaN(i));
            if (faceVerts.length >= 3) {
                faces.push(faceVerts);
            }
        }
    }

    return { vertices, faces, format: 'obj' };
}

// ══════════════════════════════════════════════
// Top-Down Floor Plan Renderer
// ══════════════════════════════════════════════
function renderFloorPlan(data, options = {}) {
    const { vertices, faces } = data;
    if (!vertices || vertices.length === 0) return null;

    // Step 1: Analyze Z distribution to find floor level
    const zValues = vertices.map(v => v.z).sort((a, b) => a - b);
    const zMin = zValues[0];
    const zMax = zValues[zValues.length - 1];
    const zRange = zMax - zMin;

    // Floor level: bottom 5-30% of Z range (where floor + lower walls are)
    const floorZ = zMin;
    const ceilingZ = zMax;
    // Keep points from floor to ~1.2m above floor (wall height for plan)
    const wallCutHeight = options.wallCutHeight || Math.min(zRange * 0.35, 1.5);
    const filterZMin = floorZ + zRange * 0.02; // Skip ground noise
    const filterZMax = floorZ + wallCutHeight;

    // Step 2: Filter vertices to wall-cut plane
    const wallPoints = vertices.filter(v => v.z >= filterZMin && v.z <= filterZMax);

    // If mesh has faces, also extract wall edges from face geometry
    const edgePoints = [];
    if (faces && faces.length > 0) {
        for (const face of faces) {
            for (let i = 0; i < face.length; i++) {
                const v1 = vertices[face[i]];
                const v2 = vertices[face[(i + 1) % face.length]];
                if (!v1 || !v2) continue;
                // Edge is vertical (wall) if both vertices are at different Z levels
                const dz = Math.abs(v1.z - v2.z);
                const dxy = Math.sqrt((v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2);
                if (dz > 0.1 && dxy < 0.5) {
                    // Vertical edge — wall segment, project midpoint
                    const midZ = (v1.z + v2.z) / 2;
                    if (midZ >= filterZMin && midZ <= filterZMax) {
                        edgePoints.push({ x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 });
                    }
                }
            }
        }
    }

    // Combine filtered wall points with edge-detected wall points
    const allPoints = [...wallPoints.map(v => ({ x: v.x, y: v.y })), ...edgePoints];
    if (allPoints.length === 0) return null;

    // Step 3: Compute bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of allPoints) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }

    const drawWidth = maxX - minX || 1;
    const drawHeight = maxY - minY || 1;

    // Step 4: Create density grid (rasterize points)
    const PADDING = 40;
    const GRID_RES = options.resolution || 2000; // pixels wide
    const aspect = drawWidth / drawHeight;
    const IMG_WIDTH = Math.min(4000, Math.max(1500, GRID_RES));
    const IMG_HEIGHT = Math.max(400, Math.round(IMG_WIDTH / aspect));
    const pixelsPerUnit = (IMG_WIDTH - 2 * PADDING) / drawWidth;

    // Create density grid
    const gridW = IMG_WIDTH;
    const gridH = IMG_HEIGHT;
    const density = new Float32Array(gridW * gridH);

    for (const p of allPoints) {
        const px = Math.round(PADDING + (p.x - minX) * pixelsPerUnit);
        const py = Math.round(IMG_HEIGHT - PADDING - (p.y - minY) * pixelsPerUnit); // Flip Y
        if (px >= 0 && px < gridW && py >= 0 && py < gridH) {
            density[py * gridW + px] += 1;
            // Spread to neighboring pixels for line connectivity
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const nx = px + dx, ny = py + dy;
                    if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
                        density[ny * gridW + nx] += 0.3;
                    }
                }
            }
        }
    }

    // Step 5: Determine wall threshold using Otsu-like method
    let maxDensity = 0;
    for (let i = 0; i < density.length; i++) {
        if (density[i] > maxDensity) maxDensity = density[i];
    }
    const wallThreshold = Math.max(1, maxDensity * 0.08); // Points denser than 8% of max = wall

    // Step 6: Generate SVG with wall rendering
    const svgParts = [];

    // Background
    svgParts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);

    // Render density as wall pixels
    // Group adjacent wall pixels into larger rectangles for efficiency
    const wallPixelSize = 2;
    for (let y = 0; y < gridH; y += wallPixelSize) {
        for (let x = 0; x < gridW; x += wallPixelSize) {
            let maxD = 0;
            for (let dy = 0; dy < wallPixelSize && y + dy < gridH; dy++) {
                for (let dx = 0; dx < wallPixelSize && x + dx < gridW; dx++) {
                    maxD = Math.max(maxD, density[(y + dy) * gridW + (x + dx)]);
                }
            }
            if (maxD >= wallThreshold) {
                const intensity = Math.min(1, maxD / (maxDensity * 0.5));
                const gray = Math.round(50 - intensity * 50); // Darker = more points
                svgParts.push(`<rect x="${x}" y="${y}" width="${wallPixelSize}" height="${wallPixelSize}" fill="rgb(${gray},${gray},${gray})"/>`);
            }
        }
    }

    // Add scale reference
    const metersPerPixel = drawWidth / (IMG_WIDTH - 2 * PADDING);
    // Draw 1m scale bar
    const scaleBarPixels = 1 / metersPerPixel; // 1 meter in pixels
    if (scaleBarPixels > 20 && scaleBarPixels < IMG_WIDTH * 0.4) {
        const sbX = IMG_WIDTH - PADDING - scaleBarPixels;
        const sbY = IMG_HEIGHT - 20;
        svgParts.push(`<line x1="${sbX}" y1="${sbY}" x2="${sbX + scaleBarPixels}" y2="${sbY}" stroke="#333" stroke-width="2"/>`);
        svgParts.push(`<line x1="${sbX}" y1="${sbY - 5}" x2="${sbX}" y2="${sbY + 5}" stroke="#333" stroke-width="1.5"/>`);
        svgParts.push(`<line x1="${sbX + scaleBarPixels}" y1="${sbY - 5}" x2="${sbX + scaleBarPixels}" y2="${sbY + 5}" stroke="#333" stroke-width="1.5"/>`);
        svgParts.push(`<text x="${sbX + scaleBarPixels / 2}" y="${sbY - 8}" font-family="Arial,sans-serif" font-size="11" fill="#333" text-anchor="middle">1 m</text>`);
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_WIDTH}" height="${IMG_HEIGHT}" viewBox="0 0 ${IMG_WIDTH} ${IMG_HEIGHT}">
  ${svgParts.join('\n  ')}
</svg>`;

    return {
        svg,
        width: IMG_WIDTH,
        height: IMG_HEIGHT,
        stats: {
            totalVertices: vertices.length,
            wallPoints: wallPoints.length,
            edgePoints: edgePoints.length,
            zRange: { min: zMin.toFixed(2), max: zMax.toFixed(2), range: zRange.toFixed(2) },
            wallCutHeight: wallCutHeight.toFixed(2),
            bounds: {
                width: drawWidth.toFixed(2),
                height: drawHeight.toFixed(2),
                unit: 'meters (estimated)'
            },
            imageSize: `${IMG_WIDTH}x${IMG_HEIGHT}`,
            facesProcessed: faces ? faces.length : 0,
        }
    };
}

// POST /api/floorplans/import-lidar — Import a LiDAR scan file as floor plan
router.post('/', upload.single('lidarfile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'LiDAR scan file required (.ply or .obj)' });
        const { plantId, name, planType } = req.body;
        if (!plantId || !name) return res.status(400).json({ error: 'plantId and name are required' });

        const sharp = require('sharp');
        const ext = path.extname(req.file.originalname).toLowerCase();

        // 1. Parse the 3D file
        let data;
        const content = fs.readFileSync(req.file.path, 'utf-8');

        if (ext === '.ply') {
            data = parsePLY(content);
        } else if (ext === '.obj') {
            data = parseOBJ(content);
        } else {
            try { fs.unlinkSync(req.file.path); } catch(e) {}
            return res.status(400).json({
                error: `Unsupported file format: ${ext}. Supported: .ply, .obj`,
                tip: 'Export your LiDAR scan as PLY or OBJ from Polycam, 3D Scanner App, or RoomPlan'
            });
        }

        if (!data.vertices || data.vertices.length === 0) {
            try { fs.unlinkSync(req.file.path); } catch(e) {}
            return res.status(400).json({ error: 'No 3D vertices found in the scan file' });
        }

        console.log(`📡 [LiDAR] Parsing ${ext}: ${data.vertices.length} vertices, ${(data.faces || []).length} faces`);

        // 2. Render top-down floor plan
        const result = renderFloorPlan(data);
        if (!result) {
            try { fs.unlinkSync(req.file.path); } catch(e) {}
            return res.status(400).json({ error: 'Could not generate floor plan from scan data — no wall geometry detected' });
        }

        // 3. Convert SVG to PNG
        const plantDir = path.join(baseUploadDir, plantId.replace(/[^a-zA-Z0-9_-]/g, '_'));
        if (!fs.existsSync(plantDir)) fs.mkdirSync(plantDir, { recursive: true });

        const filename = `lidar_${Date.now()}.png`;
        const outputPath = path.join(plantDir, filename);
        const imgRelPath = `/uploads/floorplans/${plantId.replace(/[^a-zA-Z0-9_-]/g, '_')}/${filename}`;

        await sharp(Buffer.from(result.svg))
            .png({ quality: 95 })
            .toFile(outputPath);

        // 3b. Keep original PLY/OBJ file for 3D viewer
        const lidarDir = path.join(plantDir, 'lidar_scans');
        if (!fs.existsSync(lidarDir)) fs.mkdirSync(lidarDir, { recursive: true });
        const lidarFilename = `lidar_${Date.now()}${ext}`;
        const lidarDestPath = path.join(lidarDir, lidarFilename);
        const lidarRelPath = `uploads/floorplans/${plantId.replace(/[^a-zA-Z0-9_-]/g, '_')}/lidar_scans/${lidarFilename}`;
        fs.copyFileSync(req.file.path, lidarDestPath);

        // 4. Save as floor plan (with lidarSourcePath for 3D viewer)
        const dbResult = logisticsDb.prepare(
            'INSERT INTO FloorPlans (plantId, name, imagePath, createdBy, planType, lidarSourcePath) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(plantId, name, imgRelPath, req.user?.username || 'system', planType || 'facility', lidarRelPath);

        // Clean up temp file
        try { fs.unlinkSync(req.file.path); } catch(e) {}

        console.log(`📡 [LiDAR] ${name}: ${data.vertices.length} vertices → ${result.width}x${result.height}px floor plan + 3D source saved`);

        res.status(201).json({
            success: true,
            id: dbResult.lastInsertRowid,
            imagePath: imgRelPath,
            stats: result.stats
        });
    } catch (err) {
        console.error('📡 [LiDAR] Error:', err);
        if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch(e) {} }
        res.status(500).json({ error: 'LiDAR import failed: ' + err.message });
    }
});

module.exports = router;
