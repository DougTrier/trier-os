// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Trier OS — LAN Hub Artifact Cache
 * ===================================
 * Edge node artifact caching layer. Attaches to the LAN Hub HTTP server (port 1940).
 * On corporate reconnect, polls pull-manifest, downloads new/updated artifacts,
 * verifies SHA-256 integrity, and reports sync status back to corporate.
 *
 * HTTP endpoints (added to existing hub HTTP server):
 *   HEAD /hub/artifact/:id  — 200 if cached, 404 if not
 *   GET  /hub/artifact/:id  — stream cached artifact file (JWT auth required)
 *   GET  /hub/artifacts     — JSON list of all cached artifacts (JWT auth required)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

let _syncInProgress = false;

function ensureArtifactCache(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS LocalArtifactCache (
            CacheID       INTEGER PRIMARY KEY,
            ArtifactID    INTEGER NOT NULL UNIQUE,
            ArtifactName  TEXT    NOT NULL,
            Type          TEXT    NOT NULL,
            Version       INTEGER NOT NULL,
            ContentHash   TEXT    NOT NULL,
            LocalPath     TEXT    NOT NULL,
            FileSize      INTEGER NOT NULL,
            CachedAt      TEXT    NOT NULL DEFAULT (datetime('now')),
            LastServedAt  TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_lac_artifactid ON LocalArtifactCache(ArtifactID);
    `);
}

function verifyToken(req, jwtSecret) {
    try {
        let token = null;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.slice(7);
        } else {
            const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            token = urlObj.searchParams.get('token');
        }
        if (!token) return false;
        jwt.verify(token, jwtSecret);
        return true;
    } catch (err) {
        return false;
    }
}

function handleRequest(req, res, cacheDir, plantDb, jwtSecret) {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;

    if (pathname === '/hub/artifacts') {
        if (req.method !== 'GET') return false;
        if (!verifyToken(req, jwtSecret)) {
            res.writeHead(401); res.end('Unauthorized');
            return true;
        }
        ensureArtifactCache(plantDb);
        const list = plantDb.prepare('SELECT ArtifactID as artifactId, ArtifactName as artifactName, Type as type, Version as version, FileSize as fileSize, CachedAt as cachedAt, LastServedAt as lastServedAt FROM LocalArtifactCache').all();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ artifacts: list }));
        return true;
    }

    if (pathname.startsWith('/hub/artifact/')) {
        const idMatch = pathname.match(/^\/hub\/artifact\/(\d+)$/);
        if (!idMatch) return false;
        
        const artifactId = parseInt(idMatch[1], 10);

        if (req.method === 'HEAD') {
            ensureArtifactCache(plantDb);
            const exists = plantDb.prepare('SELECT 1 FROM LocalArtifactCache WHERE ArtifactID = ?').get(artifactId);
            if (exists) {
                res.writeHead(200); res.end();
            } else {
                res.writeHead(404); res.end();
            }
            return true;
        }

        if (req.method === 'GET') {
            if (!verifyToken(req, jwtSecret)) {
                res.writeHead(401); res.end('Unauthorized');
                return true;
            }
            ensureArtifactCache(plantDb);
            const artifact = plantDb.prepare('SELECT LocalPath, FileSize, ContentHash FROM LocalArtifactCache WHERE ArtifactID = ?').get(artifactId);
            if (!artifact) {
                res.writeHead(404); res.end('Artifact not found in local cache');
                return true;
            }

            plantDb.prepare("UPDATE LocalArtifactCache SET LastServedAt = datetime('now') WHERE ArtifactID = ?").run(artifactId);

            res.writeHead(200, {
                'Content-Length': artifact.FileSize,
                'Content-Type': 'application/octet-stream',
                'ETag': `"${artifact.ContentHash}"`
            });

            const stream = fs.createReadStream(artifact.LocalPath);
            stream.pipe(res);
            stream.on('error', (err) => {
                console.error('[ARTIFACT_CACHE] Stream error:', err);
                if (!res.headersSent) {
                    res.writeHead(500); res.end('Read error');
                }
            });
            return true;
        }
    }

    return false;
}

async function reportSyncStatus(centralUrl, plantId, edgeMeshToken, artifactId, status, version, errorNote) {
    try {
        await fetch(`${centralUrl}/api/edge-mesh/sync-status/${plantId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${edgeMeshToken}`
            },
            body: JSON.stringify({ artifactId, status, version, errorNote }),
            signal: AbortSignal.timeout(5000)
        });
    } catch (err) {
        // Fire and forget
    }
}

async function syncManifest(centralUrl, plantId, edgeMeshToken, cacheDir, plantDb) {
    if (_syncInProgress) return;
    _syncInProgress = true;
    try {
        // 1. Fetch manifest from corporate
        const res = await fetch(`${centralUrl}/api/edge-mesh/pull-manifest?plantId=${plantId}`, {
            headers: { 'Authorization': `Bearer ${edgeMeshToken}` },
            signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) return;
        const { artifacts } = await res.json();

        ensureArtifactCache(plantDb);

        for (const artifact of (artifacts || [])) {
            const existing = plantDb.prepare(
                'SELECT Version, ContentHash FROM LocalArtifactCache WHERE ArtifactID = ?'
            ).get(artifact.artifactId);

            // Skip if already have this version
            if (existing && existing.Version === artifact.version && existing.ContentHash === artifact.contentHash) {
                continue;
            }

            // Download
            const dlRes = await fetch(artifact.downloadUrl, {
                headers: { 'Authorization': `Bearer ${edgeMeshToken}` },
                signal: AbortSignal.timeout(60000)
            });
            if (!dlRes.ok) {
                await reportSyncStatus(centralUrl, plantId, edgeMeshToken, artifact.artifactId, 'ERROR', artifact.version, 'Download failed');
                continue;
            }

            const buf = Buffer.from(await dlRes.arrayBuffer());

            // SHA-256 integrity check
            const actual = crypto.createHash('sha256').update(buf).digest('hex');
            if (actual !== artifact.contentHash) {
                await reportSyncStatus(centralUrl, plantId, edgeMeshToken, artifact.artifactId, 'ERROR', artifact.version, 'Hash mismatch');
                continue;
            }

            // Write to cache dir
            if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
            const localPath = path.join(cacheDir, `artifact_${artifact.artifactId}_v${artifact.version}`);
            fs.writeFileSync(localPath, buf);

            // Upsert LocalArtifactCache
            // TODO: delete previous localPath file before overwriting — stale files accumulate on version update, add cleanup pass in v2.
            plantDb.prepare(`
                INSERT INTO LocalArtifactCache (ArtifactID, ArtifactName, Type, Version, ContentHash, LocalPath, FileSize, CachedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(ArtifactID) DO UPDATE SET
                    ArtifactName = excluded.ArtifactName,
                    Version      = excluded.Version,
                    ContentHash  = excluded.ContentHash,
                    LocalPath    = excluded.LocalPath,
                    FileSize     = excluded.FileSize,
                    CachedAt     = excluded.CachedAt
            `).run(artifact.artifactId, artifact.artifactName, artifact.type, artifact.version, artifact.contentHash, localPath, buf.length);

            await reportSyncStatus(centralUrl, plantId, edgeMeshToken, artifact.artifactId, 'SYNCED', artifact.version, null);
            console.log(`[ARTIFACT_CACHE] Cached artifact ${artifact.artifactName} v${artifact.version}`);
        }
    } catch (err) {
        console.warn('[ARTIFACT_CACHE] syncManifest error:', err.message);
    } finally {
        _syncInProgress = false;
    }
}

module.exports = {
    handleRequest,
    syncManifest
};
