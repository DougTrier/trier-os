// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Distributed Edge Execution Mesh (P7-4)
 * ==================================================
 * Corporate server module. Manages artifact metadata in trier_logistics.db, stores artifact files on disk,
 * holds the Ed25519 private key, and exposes a REST API that edge nodes poll.
 *
 * ENDPOINTS:
 *   POST /api/edge-mesh/artifacts       — Register a new artifact (admin/corporate only)
 *   GET  /api/edge-mesh/artifacts       — List artifacts (admin UI)
 *   GET  /api/edge-mesh/sync-status     — Fleet-wide sync status (admin UI)
 *   POST /api/edge-mesh/sync-status/:id — Edge node reports its sync status (edge node auth)
 *   GET  /api/edge-mesh/pull-manifest   — Edge node polls for current manifests (edge node auth)
 *   GET  /api/edge-mesh/download/:id    — Edge node downloads artifact file (edge node auth)
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db: logisticsDb, logAudit } = require('../logistics_db');
const dataDir = require('../resolve_data_dir');

const SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/;

// -- Key Management --
const keysDir = path.join(dataDir, 'edge_keys');
const privPath = path.join(keysDir, 'private.pem');
const pubPath  = path.join(keysDir, 'public.pem');

function ensureKeyPair() {
    if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir, { recursive: true });
    if (!fs.existsSync(privPath)) {
        const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            publicKeyEncoding:  { type: 'spki', format: 'pem' }
        });
        fs.writeFileSync(privPath, privateKey, { mode: 0o600 });
        fs.writeFileSync(pubPath,  publicKey);
        console.log('   [edge-mesh] Generated new Ed25519 key pair.');
    }
}
ensureKeyPair();

function loadPrivateKey() { return fs.readFileSync(privPath, 'utf8'); }

// -- Local Artifact Storage --
const artifactsDir = path.join(dataDir, 'trier-artifacts');
if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
}

// -- Edge Node Authentication Middleware --
function requireEdgeMeshToken(req, res, next) {
    const token = process.env.EDGE_MESH_TOKEN;
    if (!token) return res.status(503).json({ error: 'EDGE_MESH_TOKEN not configured on server' });
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${token}`) return res.status(401).json({ error: 'Invalid edge mesh token' });
    next();
}

// -- Routes --

// POST /api/edge-mesh/artifacts — Register a new artifact (admin/corporate only, uses standard authMiddleware)
router.post('/artifacts', (req, res) => {
    try {
        const { name, type, plantId, filePath, expiresAt } = req.body;
        
        // Validation
        const validTypes = ['DIGITAL_TWIN', 'SOP_PDF', 'TRAINING_VIDEO'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid artifact type' });
        }
        
        let targetPlantId = null;
        if (plantId) {
            if (!SAFE_PLANT_ID.test(plantId)) {
                return res.status(400).json({ error: 'Invalid PlantID' });
            }
            targetPlantId = plantId;
        }

        if (!filePath) {
            return res.status(400).json({ error: 'filePath is required' });
        }

        // SSRF protection equivalent: verify path is within artifactsDir
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(artifactsDir)) {
            return res.status(400).json({ error: 'filePath must be within the artifacts directory' });
        }

        if (!fs.existsSync(resolvedPath)) {
            return res.status(400).json({ error: 'File does not exist at filePath' });
        }

        const buf = fs.readFileSync(resolvedPath);
        const fileSize = buf.length;
        const contentHash = crypto.createHash('sha256').update(buf).digest('hex');
        const sig = crypto.sign(null, Buffer.from(contentHash), loadPrivateKey()).toString('base64');

        // Next version
        const maxVerRow = logisticsDb.prepare(
            `SELECT MAX(Version) as maxV FROM ArtifactRegistry WHERE ArtifactName = ? AND (PlantID = ? OR (PlantID IS NULL AND ? IS NULL))`
        ).get(name, targetPlantId, targetPlantId);
        
        const nextVersion = (maxVerRow && maxVerRow.maxV ? maxVerRow.maxV : 0) + 1;

        logisticsDb.transaction(() => {
            // Soft-delete previous version
            logisticsDb.prepare(
                `UPDATE ArtifactRegistry SET Superseded = 1 WHERE ArtifactName = ? AND (PlantID = ? OR (PlantID IS NULL AND ? IS NULL))`
            ).run(name, targetPlantId, targetPlantId);

            // Insert new version
            const insertResult = logisticsDb.prepare(
                `INSERT INTO ArtifactRegistry (ArtifactName, Type, PlantID, Version, FilePath, ContentHash, Signature, FileSize, ExpiresAt, UploadedBy, UploadedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
                name, type, targetPlantId, nextVersion, resolvedPath, contentHash, sig, fileSize, 
                expiresAt || null, req.user?.Username || 'system', new Date().toISOString()
            );

            logAudit(req.user?.Username || 'system', 'ARTIFACT_REGISTERED', targetPlantId || 'ENTERPRISE', { name, type, version: nextVersion, contentHash });
            
            res.json({ success: true, artifactId: insertResult.lastInsertRowid, version: nextVersion, contentHash });
        })();
    } catch (err) {
        console.error('[EDGE-MESH] POST /artifacts error:', err);
        res.status(500).json({ error: 'Failed to register artifact' });
    }
});

// GET /api/edge-mesh/artifacts — List artifacts (admin UI, standard auth)
router.get('/artifacts', (req, res) => {
    try {
        const { plantId, type, includeSuperseded } = req.query;
        let query = `SELECT ArtifactID, ArtifactName, Type, PlantID, Version, ContentHash, FileSize, ExpiresAt, UploadedBy, UploadedAt FROM ArtifactRegistry WHERE 1=1`;
        const params = [];

        if (plantId) {
            query += ` AND PlantID = ?`;
            params.push(plantId);
        }
        if (type) {
            query += ` AND Type = ?`;
            params.push(type);
        }
        if (includeSuperseded !== 'true') {
            query += ` AND Superseded = 0`;
        }

        query += ` ORDER BY UploadedAt DESC`;

        const rows = logisticsDb.prepare(query).all(...params);
        res.json({ count: rows.length, artifacts: rows });
    } catch (err) {
        console.error('[EDGE-MESH] GET /artifacts error:', err);
        res.status(500).json({ error: 'Failed to fetch artifacts' });
    }
});

// GET /api/edge-mesh/sync-status — Fleet-wide sync status (admin UI)
router.get('/sync-status', (req, res) => {
    try {
        const rows = logisticsDb.prepare(`
            SELECT e.PlantID as plantId, a.ArtifactID as artifactId, a.ArtifactName as artifactName, 
                   e.EdgeVersion as version, e.Status as status, e.SyncedAt as syncedAt, e.LastCheckedAt as lastCheckedAt
            FROM EdgeNodeSync e
            JOIN ArtifactRegistry a ON e.ArtifactID = a.ArtifactID
            ORDER BY e.PlantID, a.ArtifactName
        `).all();
        res.json(rows);
    } catch (err) {
        console.error('[EDGE-MESH] GET /sync-status error:', err);
        res.status(500).json({ error: 'Failed to fetch sync status' });
    }
});

// POST /api/edge-mesh/sync-status/:plantId — Edge node reports its sync status
router.post('/sync-status/:plantId', requireEdgeMeshToken, (req, res) => {
    try {
        const { plantId } = req.params;
        if (!SAFE_PLANT_ID.test(plantId)) return res.status(400).json({ error: 'Invalid PlantID' });

        const { artifactId, status, version, errorNote } = req.body;
        if (!artifactId || !status) return res.status(400).json({ error: 'artifactId and status required' });

        const now = new Date().toISOString();
        const syncedAt = status === 'SYNCED' ? now : null;

        logisticsDb.prepare(`
            INSERT INTO EdgeNodeSync (PlantID, ArtifactID, Status, EdgeVersion, LastCheckedAt, SyncedAt, ErrorNote)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(PlantID, ArtifactID) DO UPDATE SET
                Status = excluded.Status,
                EdgeVersion = excluded.EdgeVersion,
                LastCheckedAt = excluded.LastCheckedAt,
                SyncedAt = COALESCE(excluded.SyncedAt, EdgeNodeSync.SyncedAt),
                ErrorNote = excluded.ErrorNote
        `).run(plantId, artifactId, status, version || null, now, syncedAt, errorNote || null);

        res.json({ success: true });
    } catch (err) {
        console.error('[EDGE-MESH] POST /sync-status error:', err);
        res.status(500).json({ error: 'Failed to report sync status' });
    }
});

// GET /api/edge-mesh/pull-manifest — Edge node polls for current manifests
router.get('/pull-manifest', requireEdgeMeshToken, (req, res) => {
    try {
        const { plantId } = req.query;
        if (!plantId || !SAFE_PLANT_ID.test(plantId)) {
            return res.status(400).json({ error: 'Valid plantId is required' });
        }

        const artifacts = logisticsDb.prepare(`
            SELECT ArtifactID as artifactId, ArtifactName as artifactName, Type as type, 
                   Version as version, ContentHash as contentHash, Signature as signature, 
                   FileSize as fileSize, ExpiresAt as expiresAt
            FROM ArtifactRegistry
            WHERE (PlantID = ? OR PlantID IS NULL)
              AND Superseded = 0
              AND (ExpiresAt IS NULL OR ExpiresAt > datetime('now'))
        `).all(plantId);

        const hostUrl = `${req.protocol}://${req.get('host')}`;
        
        const mapped = artifacts.map(a => ({
            ...a,
            downloadUrl: `${hostUrl}/api/edge-mesh/download/${a.artifactId}`
        }));

        res.json({ plantId, artifacts: mapped });
    } catch (err) {
        console.error('[EDGE-MESH] GET /pull-manifest error:', err);
        res.status(500).json({ error: 'Failed to generate manifest' });
    }
});

// GET /api/edge-mesh/download/:id — Edge node downloads artifact file
router.get('/download/:id', requireEdgeMeshToken, (req, res) => {
    try {
        const { id } = req.params;
        
        const artifact = logisticsDb.prepare(`
            SELECT ArtifactName, FilePath, Superseded, ExpiresAt, ContentHash, Type
            FROM ArtifactRegistry WHERE ArtifactID = ?
        `).get(id);

        if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
        
        if (artifact.Superseded) return res.status(410).json({ error: 'Artifact is superseded' });
        
        if (artifact.ExpiresAt && new Date(artifact.ExpiresAt) < new Date()) {
            return res.status(410).json({ error: 'Artifact has expired' });
        }

        if (!fs.existsSync(artifact.FilePath)) {
            console.error(`[EDGE-MESH] Artifact file missing on disk: ${artifact.FilePath}`);
            return res.status(404).json({ error: 'Artifact file not found on disk' });
        }

        const contentType = artifact.Type === 'SOP_PDF' ? 'application/pdf' : 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${artifact.ArtifactName}"`);
        res.setHeader('X-Content-Hash', artifact.ContentHash);

        res.sendFile(artifact.FilePath);
    } catch (err) {
        console.error('[EDGE-MESH] GET /download/:id error:', err);
        res.status(500).json({ error: 'Failed to download artifact' });
    }
});

module.exports = router;
