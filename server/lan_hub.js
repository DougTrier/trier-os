/**
 * Trier OS — LAN Hub
 * ==================
 * Lightweight WebSocket broadcast server that runs inside the Electron desktop app.
 * When the central server is unreachable, PWA devices on the same plant LAN connect
 * here instead, keeping scan state visible across all devices in real time.
 *
 * Port:     1940 (fixed, configured once per plant install)
 * Auth:     JWT validation on WebSocket upgrade (same secret as embedded server)
 * Storage:  OfflineScanQueue table in local plant SQLite DB
 * Replay:   Queued scans are forwarded to POST /api/scan/offline-sync when the
 *           central server returns.
 *
 * Message protocol (JSON over WebSocket):
 *   Client → Hub:   { type: 'PING' }
 *   Client → Hub:   { type: 'SCAN', scanId, assetId, userId, plantId, deviceTimestamp, action? }
 *   Hub → Client:   { type: 'PONG' }
 *   Hub → Client:   { type: 'WO_STATE_CHANGED', assetId, branch, wo, options, _hubBroadcast: true }
 *   Hub → Client:   { type: 'SERVER_ONLINE' }
 *   Hub → All:      { type: 'DEVICE_LIST', devices: [{deviceId, userId, connectedAt}] }
 */

'use strict';

const { WebSocketServer } = require('ws');
const http               = require('http');
const jwt                = require('jsonwebtoken');
const path               = require('path');
const crypto             = require('crypto');

const HUB_PORT = 1940;

// ── Status codes mirrored from server/routes/scan.js ─────────────────────────
const STATUS = { OPEN: 20, IN_PROGRESS: 30, WAITING_PARTS: 31, WAITING_VENDOR: 32, ON_HOLD: 35 };

let _hub  = null; // WebSocketServer instance
let _http = null; // Underlying HTTP server

// Connected devices: ws → { deviceId, userId, plantId, connectedAt }
const _clients = new Map();

// ── DB helpers ────────────────────────────────────────────────────────────────

function getPlantDb(dataDir, plantId) {
    const Database = require('better-sqlite3');
    const dbPath = path.join(dataDir, `${plantId}.db`);
    return new Database(dbPath);
}

function ensureQueue(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS OfflineScanQueue (
            queueId         TEXT PRIMARY KEY,
            scanId          TEXT NOT NULL UNIQUE,
            assetId         TEXT,
            userId          TEXT,
            deviceTimestamp TEXT,
            userAction      TEXT,
            payload         TEXT,
            queuedAt        TEXT DEFAULT (datetime('now')),
            syncedAt        TEXT,
            syncStatus      TEXT DEFAULT 'PENDING',
            failReason      TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_hubq_status ON OfflineScanQueue(syncStatus);
    `);
}

function queueScan(dataDir, plantId, scanPayload) {
    const db = getPlantDb(dataDir, plantId);
    try {
        ensureQueue(db);
        const existing = db.prepare('SELECT queueId FROM OfflineScanQueue WHERE scanId = ?').get(scanPayload.scanId);
        if (existing) return { duplicate: true };
        db.prepare(`
            INSERT INTO OfflineScanQueue (queueId, scanId, assetId, userId, deviceTimestamp, payload, syncStatus)
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
        `).run(
            crypto.randomUUID(),
            scanPayload.scanId,
            scanPayload.assetId,
            scanPayload.userId,
            scanPayload.deviceTimestamp,
            JSON.stringify(scanPayload)
        );
        return { queued: true };
    } finally {
        db.close();
    }
}

function markSynced(dataDir, plantId, scanId) {
    const db = getPlantDb(dataDir, plantId);
    try {
        db.prepare(`UPDATE OfflineScanQueue SET syncStatus='SYNCED', syncedAt=datetime('now') WHERE scanId=?`).run(scanId);
    } finally {
        db.close();
    }
}

function getPendingScans(dataDir, plantId) {
    const db = getPlantDb(dataDir, plantId);
    try {
        ensureQueue(db);
        return db.prepare(`SELECT * FROM OfflineScanQueue WHERE syncStatus='PENDING' ORDER BY queuedAt ASC`).all();
    } finally {
        db.close();
    }
}

// ── Branch prediction (server-side, mirrors OfflineDB.predictBranch) ─────────

function predictBranch(dataDir, plantId, assetId, userId) {
    const db = getPlantDb(dataDir, plantId);
    try {
        const activeWo = db.prepare(`
            SELECT ID, WorkOrderNumber, Description FROM Work
            WHERE AstID = ? AND StatusID IN (${STATUS.IN_PROGRESS}, ${STATUS.OPEN})
            ORDER BY ID DESC LIMIT 1
        `).get(assetId);

        if (activeWo) {
            const segments = db.prepare(`
                SELECT segmentId, userId FROM WorkSegments WHERE woId = ? AND segmentState = 'Active'
            `).all(String(activeWo.ID));

            const mine   = segments.find(s => s.userId === userId);
            const others = segments.filter(s => s.userId !== userId);

            let context, options;
            if (mine && others.length > 0) {
                context = 'MULTI_TECH';
                options = ['LEAVE_WORK', 'TEAM_CLOSE', 'WAITING', 'ESCALATE', 'CONTINUE_LATER'];
            } else if (!mine && others.length > 0) {
                context = 'OTHER_USER_ACTIVE';
                options = ['JOIN', 'TAKE_OVER', 'ESCALATE'];
            } else {
                context = 'RESUMED_NO_SEGMENT';
                options = ['CLOSE_WO', 'WAITING', 'ESCALATE', 'CONTINUE_LATER'];
            }

            return {
                branch: 'ROUTE_TO_ACTIVE_WO', context,
                wo: { id: activeWo.WorkOrderNumber, number: activeWo.WorkOrderNumber, description: activeWo.Description },
                activeUsers: others.map(s => s.userId),
                options,
            };
        }

        const waitingWo = db.prepare(`
            SELECT ID, WorkOrderNumber, Description, holdReason, returnAt FROM Work
            WHERE AstID = ? AND StatusID IN (${STATUS.WAITING_PARTS}, ${STATUS.WAITING_VENDOR}, ${STATUS.ON_HOLD})
            ORDER BY ID DESC LIMIT 1
        `).get(assetId);

        if (waitingWo) {
            return {
                branch: 'ROUTE_TO_WAITING_WO',
                wo: { id: waitingWo.WorkOrderNumber, number: waitingWo.WorkOrderNumber,
                      description: waitingWo.Description, holdReason: waitingWo.holdReason,
                      returnAt: waitingWo.returnAt },
                options: ['RESUME_WAITING_WO', 'CREATE_NEW_WO', 'VIEW_STATUS'],
            };
        }

        const asset = db.prepare('SELECT ID, Description FROM Asset WHERE ID = ? LIMIT 1').get(assetId);
        if (!asset) return { branch: 'ASSET_NOT_FOUND', error: 'Asset not found in plant database' };

        return { branch: 'AUTO_CREATE_WO', message: 'Work Started', wo: { description: asset.Description } };

    } finally {
        db.close();
    }
}

// ── Conflict detection — dual AUTO_CREATE for same asset ─────────────────────

function checkConflict(dataDir, plantId, assetId) {
    const db = getPlantDb(dataDir, plantId);
    try {
        const pending = db.prepare(`
            SELECT COUNT(*) as cnt FROM OfflineScanQueue
            WHERE assetId = ? AND syncStatus = 'PENDING'
        `).get(assetId);
        return pending.cnt > 1;
    } finally {
        db.close();
    }
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────

function broadcast(message) {
    const payload = JSON.stringify(message);
    for (const [ws] of _clients) {
        if (ws.readyState === ws.OPEN) ws.send(payload);
    }
}

function broadcastDeviceList() {
    const devices = [..._clients.values()].map(({ deviceId, userId, connectedAt }) =>
        ({ deviceId, userId, connectedAt })
    );
    broadcast({ type: 'DEVICE_LIST', devices });
}

// ── Central server reconnect watcher ─────────────────────────────────────────

function startReconnectWatcher(centralUrl, dataDir, jwtSecret) {
    const http_ = centralUrl.startsWith('https') ? require('https') : require('http');

    setInterval(() => {
        const req = http_.get(`${centralUrl}/api/ping`, { timeout: 3000 }, (res) => {
            if (res.statusCode === 200) {
                console.log('[LAN_HUB] Central server back online — replaying queued scans');
                replayToServer(centralUrl, dataDir, jwtSecret);
                broadcast({ type: 'SERVER_ONLINE' });
            }
        });
        req.on('error', () => {}); // still offline, ignore
        req.on('timeout', () => req.destroy());
    }, 30 * 1000); // check every 30 seconds
}

async function replayToServer(centralUrl, dataDir, jwtSecret) {
    // Collect all pending scans across plants that connected to hub
    const seenPlants = new Set([..._clients.values()].map(c => c.plantId).filter(Boolean));

    for (const plantId of seenPlants) {
        const pending = getPendingScans(dataDir, plantId);
        for (const row of pending) {
            try {
                const payload = JSON.parse(row.payload);
                const res = await fetch(`${centralUrl}/api/scan/offline-sync`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-plant-id': plantId,
                        'x-hub-replay': '1',
                    },
                    body: JSON.stringify({ scans: [payload] }),
                    signal: AbortSignal.timeout(8000),
                });
                if (res.ok) {
                    markSynced(dataDir, plantId, row.scanId);
                    console.log(`[LAN_HUB] Replayed scan ${row.scanId} to central server`);
                }
            } catch (err) {
                console.warn(`[LAN_HUB] Replay failed for scan ${row.scanId}:`, err.message);
            }
        }
    }
}

// ── Message handler ───────────────────────────────────────────────────────────

function handleMessage(ws, raw, dataDir) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const client = _clients.get(ws);

    if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
        return;
    }

    if (msg.type === 'SCAN') {
        const { scanId, assetId, userId, plantId: msgPlantId, deviceTimestamp, action } = msg;
        const plantId = msgPlantId || client?.plantId;
        if (!scanId || !assetId || !plantId) return;

        // Store in queue (idempotent)
        const result = queueScan(dataDir, plantId, { scanId, assetId, userId, deviceTimestamp, action });
        if (result.duplicate) {
            ws.send(JSON.stringify({ type: 'SCAN_ACK', scanId, duplicate: true }));
            return;
        }

        // Detect dual auto-create conflict
        const hasConflict = checkConflict(dataDir, plantId, assetId);

        // Predict branch from live plant DB
        let branch;
        try {
            branch = predictBranch(dataDir, plantId, assetId, userId);
        } catch (err) {
            console.warn('[LAN_HUB] Branch prediction failed:', err.message);
            branch = { branch: 'AUTO_CREATE_WO', message: 'Work Started' };
        }

        const response = {
            ...branch,
            scanId,
            _hubBroadcast: true,
            _conflictDetected: hasConflict,
        };

        // Acknowledge to the sending device
        ws.send(JSON.stringify({ type: 'SCAN_ACK', ...response }));

        // Broadcast WO state change to all other connected devices
        broadcast({
            type: 'WO_STATE_CHANGED',
            assetId,
            ...branch,
            _hubBroadcast: true,
        });

        console.log(`[LAN_HUB] Scan queued: ${scanId} asset=${assetId} user=${userId} plant=${plantId} branch=${branch.branch}`);
    }
}

// ── Start / Stop ──────────────────────────────────────────────────────────────

function start({ dataDir, jwtSecret, centralUrl }) {
    if (_hub) return;

    _http = http.createServer((req, res) => {
        // Simple health endpoint so PWA can detect the hub without a WS connection
        if (req.url === '/hub/ping') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ hub: true, clients: _clients.size }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    _hub = new WebSocketServer({ server: _http });

    _hub.on('connection', (ws, req) => {
        // ── JWT auth on upgrade ───────────────────────────────────────────────
        const url   = new URL(req.url, `http://localhost:${HUB_PORT}`);
        const token = url.searchParams.get('token');

        if (!token) {
            ws.close(4001, 'Token required');
            return;
        }

        let decoded;
        try {
            decoded = jwt.verify(token, jwtSecret);
        } catch {
            ws.close(4003, 'Invalid token');
            return;
        }

        const deviceId = `${decoded.Username || decoded.username || 'device'}-${Date.now()}`;
        const client   = {
            deviceId,
            userId:      decoded.Username || decoded.username || decoded.UserID,
            plantId:     decoded.nativePlantId || null,
            connectedAt: new Date().toISOString(),
        };
        _clients.set(ws, client);
        broadcastDeviceList();
        console.log(`[LAN_HUB] Device connected: ${client.userId} (${_clients.size} total)`);

        ws.on('message', (raw) => handleMessage(ws, raw, dataDir));

        ws.on('close', () => {
            _clients.delete(ws);
            broadcastDeviceList();
            console.log(`[LAN_HUB] Device disconnected (${_clients.size} remaining)`);
        });

        ws.on('error', (err) => console.warn('[LAN_HUB] WS error:', err.message));
    });

    _http.listen(HUB_PORT, '0.0.0.0', () => {
        console.log(`[LAN_HUB] ✅ LAN Hub listening on port ${HUB_PORT}`);
    });

    _http.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`[LAN_HUB] Port ${HUB_PORT} already in use — hub not started`);
        } else {
            console.error('[LAN_HUB] HTTP server error:', err.message);
        }
    });

    if (centralUrl) startReconnectWatcher(centralUrl, dataDir, jwtSecret);
}

function stop() {
    if (_hub)  { _hub.close();  _hub  = null; }
    if (_http) { _http.close(); _http = null; }
    _clients.clear();
    console.log('[LAN_HUB] Stopped');
}

function getStatus() {
    return {
        running:  !!_hub,
        port:     HUB_PORT,
        clients:  _clients.size,
        devices:  [..._clients.values()].map(({ deviceId, userId, connectedAt }) =>
            ({ deviceId, userId, connectedAt })
        ),
    };
}

module.exports = { start, stop, getStatus, HUB_PORT };
