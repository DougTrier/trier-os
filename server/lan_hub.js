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
 *   Client → Hub:   { type: 'SYNC_PENDING', scanIds: string[], plantId } — dedup on reconnect
 *   Hub → Client:   { type: 'PONG' }
 *   Hub → Client:   { type: 'SCAN_ACK', scanId, ...branch, _hubBroadcast: true }
 *   Hub → Client:   { type: 'SYNC_ACK', acknowledged: string[] }
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

// ── Status ID helpers — read from WorkStatuses table, fallback to defaults ────
// Hardcoded values are kept as a safety net; the table query runs per-plant DB.
// Using description-pattern matching rather than fixed IDs means the hub stays
// correct even if a plant admin renames or renumbers their WorkStatuses rows.
// The fallback kicks in when WorkStatuses is empty or the query throws (e.g.
// during hub startup before the DB migration has run).
const _STATUS_DEFAULTS = { activeIds: [20, 30], waitingIds: [31, 32, 35] };
// Substring patterns matched case-insensitively against WorkStatuses.Description
const ACTIVE_PATTERNS  = ['open', 'in progress', 'in-progress'];
const WAITING_PATTERNS = ['waiting', 'on hold', 'hold', 'vendor', 'parts'];

// Called once per predictBranch invocation; the caller already holds an open DB
// connection so no extra open/close overhead is incurred here.
function getStatusIds(db) {
    try {
        const rows = db.prepare('SELECT ID, Description FROM WorkStatuses').all();
        const activeIds  = rows.filter(r => ACTIVE_PATTERNS.some(p  => r.Description.toLowerCase().includes(p))).map(r => r.ID);
        const waitingIds = rows.filter(r => WAITING_PATTERNS.some(p => r.Description.toLowerCase().includes(p))).map(r => r.ID);
        // Only substitute if we found at least one matching row; otherwise the
        // pattern list needs updating rather than silently using an empty array.
        return {
            activeIds:  activeIds.length  ? activeIds  : _STATUS_DEFAULTS.activeIds,
            waitingIds: waitingIds.length ? waitingIds : _STATUS_DEFAULTS.waitingIds,
        };
    } catch {
        return _STATUS_DEFAULTS;
    }
}

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
        // Normal path: PENDING rows the hub owns and will replay to central server.
        // Fallback path: DEDUP_CLIENT rows older than 10 minutes — the device declared
        // ownership via SYNC_PENDING but never followed up with SYNC_COMPLETE (crash,
        // power loss, or prolonged disconnect). The hub re-adopts them so no scan is lost.
        // R-10: SYNCED_BY_CLIENT rows are excluded — the device sent SYNC_COMPLETE,
        // confirming it already pushed those scans directly. Without that explicit signal
        // the hub was the only thing preventing a double-replay after the 10-minute timer.
        // Audit 47 / M-13: the DEDUP_CLIENT re-adopt window was 10 minutes —
        // long enough that a device which sent SYNC_PENDING and then legitimately
        // pushed to central directly before its SYNC_COMPLETE arrived would see
        // the hub also replay those scans on the next reconnect tick. Duplicates
        // are absorbed by ScanAuditLog.scanId UNIQUE, but the FAILED-vs-already
        // -processed log noise confused operators. Tighten to 3 minutes: most
        // offline sync flows complete within seconds; genuine crashes beyond
        // 3 min still get re-adopted, just with less operator-visible noise.
        return db.prepare(`
            SELECT * FROM OfflineScanQueue
            WHERE syncStatus = 'PENDING'
               OR (syncStatus = 'DEDUP_CLIENT' AND queuedAt < datetime('now', '-3 minutes'))
            ORDER BY queuedAt ASC
        `).all();
    } finally {
        db.close();
    }
}

// ── Branch prediction (server-side, mirrors OfflineDB.predictBranch) ─────────

function predictBranch(dataDir, plantId, assetId, userId) {
    const db = getPlantDb(dataDir, plantId);
    try {
        const { activeIds, waitingIds } = getStatusIds(db);

        const activeWo = db.prepare(`
            SELECT ID, WorkOrderNumber, Description FROM Work
            WHERE AstID = ? AND StatusID IN (${activeIds.join(',')})
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
            WHERE AstID = ? AND StatusID IN (${waitingIds.join(',')})
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

// ── Conflict detection — dual AUTO_CREATE for same asset within 30s window ────
// Returns true if another PENDING scan for this asset was queued in the last
// 30 seconds, meaning a second AUTO_CREATE would create a duplicate WO.

function checkRecentAutoCreate(dataDir, plantId, assetId) {
    const db = getPlantDb(dataDir, plantId);
    try {
        ensureQueue(db);
        const row = db.prepare(`
            SELECT COUNT(*) as cnt FROM OfflineScanQueue
            WHERE assetId    = ?
              AND syncStatus  = 'PENDING'
              AND queuedAt   > datetime('now', '-30 seconds')
        `).get(assetId);
        return row.cnt > 0;
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

// R-4: Prevents concurrent drains when the setInterval fires again before the
// previous async replay completes (e.g. central server is slow to respond).
// Without this guard a second drain starts on the same PENDING rows, causing
// each scan to be submitted twice and producing duplicate WOs on the server.
let _replayInProgress = false;

async function replayToServer(centralUrl, dataDir, jwtSecret) {
    if (_replayInProgress) {
        console.log('[LAN_HUB] Replay already in progress — skipping concurrent drain');
        return;
    }
    _replayInProgress = true;
    try {

    // Collect all pending scans across plants that connected to hub
    const seenPlants = new Set([..._clients.values()].map(c => c.plantId).filter(Boolean));

    for (const plantId of seenPlants) {
        const pending = getPendingScans(dataDir, plantId);
        for (const row of pending) {
            try {
                const payload = JSON.parse(row.payload);
                const body  = JSON.stringify({ scans: [payload] });
                const ts    = Date.now().toString();
                const nonce = crypto.randomBytes(16).toString('hex');
                const sig   = crypto.createHmac('sha256', jwtSecret)
                    .update(`${ts}.${nonce}.${plantId}.${body}`)
                    .digest('hex');

                const res = await fetch(`${centralUrl}/api/scan/offline-sync`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-plant-id':   plantId,
                        'x-hub-replay': '1',
                        'x-hub-ts':     ts,
                        'x-hub-nonce':  nonce,
                        'x-hub-sig':    sig,
                    },
                    body,
                    signal: AbortSignal.timeout(8000),
                });
                if (res.ok) {
                    const body = await res.json();
                    const item = (body.results || []).find(r => r.scanId === row.scanId);
                    // R-6: HTTP 200 is a transport acknowledgment, not per-scan success.
                    // SYNCED = processed now; SKIPPED = already processed (idempotent) — both safe to mark synced.
                    // FAILED = server could not process — leave as PENDING so the operator can see it and retry.
                    if (!item || item.status !== 'FAILED') {
                        markSynced(dataDir, plantId, row.scanId);
                        console.log(`[LAN_HUB] Replayed scan ${row.scanId} to central server`);
                    } else {
                        console.warn(`[LAN_HUB] Scan ${row.scanId} failed on server: ${item.reason} — left as PENDING for retry`);
                    }
                }
            } catch (err) {
                console.warn(`[LAN_HUB] Replay failed for scan ${row.scanId}:`, err.message);
            }
        }
    }

    } finally {
        _replayInProgress = false;
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

    // R-10: Two-phase dedup protocol:
    //   1. SYNC_PENDING — device declares the scanIds it owns on reconnect.
    //      Hub marks them DEDUP_CLIENT and skips them in replayToServer.
    //   2. SYNC_COMPLETE — device signals it successfully pushed those scans to
    //      central. Hub marks them SYNCED_BY_CLIENT, permanently removing them
    //      from the 10-minute fallback pool so the hub never re-replays them.
    //
    // The 10-minute fallback in getPendingScans still handles the case where the
    // device crashes or loses power after SYNC_PENDING but before SYNC_COMPLETE.
    if (msg.type === 'SYNC_PENDING') {
        const { scanIds, plantId: msgPlantId } = msg;
        // Always use the plantId from the JWT-authenticated connection — never trust
        // the plantId supplied in the message body. A mismatch is an exploit attempt.
        const plantId = client?.plantId;
        if (!Array.isArray(scanIds) || !plantId || scanIds.length === 0) return;
        if (msgPlantId && msgPlantId !== plantId) {
            console.warn(`[LAN_HUB] SECURITY: SYNC_PENDING plant override rejected user=${client?.userId} claimed=${msgPlantId} actual=${plantId}`);
            return;
        }

        const db = getPlantDb(dataDir, plantId);
        try {
            ensureQueue(db);
            const mark = db.prepare(`
                UPDATE OfflineScanQueue SET syncStatus = 'DEDUP_CLIENT'
                WHERE scanId = ? AND syncStatus = 'PENDING'
            `);
            const acked = [];
            for (const scanId of scanIds) {
                const info = mark.run(scanId);
                if (info.changes > 0) acked.push(scanId);
            }
            ws.send(JSON.stringify({ type: 'SYNC_ACK', acknowledged: acked }));
            if (acked.length > 0) {
                console.log(`[LAN_HUB] Deduped ${acked.length} client-owned scans for plant=${plantId}`);
            }
        } finally {
            db.close();
        }
        return;
    }

    // Phase 2 of the dedup protocol — device confirms it successfully pushed these
    // scans to central. Marks them SYNCED_BY_CLIENT so the 10-minute fallback in
    // getPendingScans never re-promotes them into the hub's replay queue.
    if (msg.type === 'SYNC_COMPLETE') {
        const { scanIds, plantId: msgPlantId } = msg;
        const plantId = client?.plantId;
        if (!Array.isArray(scanIds) || !plantId || scanIds.length === 0) return;
        if (msgPlantId && msgPlantId !== plantId) {
            console.warn(`[LAN_HUB] SECURITY: SYNC_COMPLETE plant override rejected user=${client?.userId} claimed=${msgPlantId} actual=${plantId}`);
            return;
        }

        const db = getPlantDb(dataDir, plantId);
        try {
            ensureQueue(db);
            const mark = db.prepare(`
                UPDATE OfflineScanQueue SET syncStatus = 'SYNCED_BY_CLIENT', syncedAt = datetime('now')
                WHERE scanId = ? AND syncStatus IN ('PENDING', 'DEDUP_CLIENT')
            `);
            const confirmed = [];
            for (const scanId of scanIds) {
                const info = mark.run(scanId);
                if (info.changes > 0) confirmed.push(scanId);
            }
            ws.send(JSON.stringify({ type: 'SYNC_COMPLETE_ACK', confirmed }));
            if (confirmed.length > 0) {
                console.log(`[LAN_HUB] Client confirmed sync for ${confirmed.length} scans, plant=${plantId}`);
            }
        } finally {
            db.close();
        }
        return;
    }

    if (msg.type === 'SCAN') {
        const { scanId, assetId, userId, plantId: msgPlantId, deviceTimestamp, action } = msg;
        // Always use the plantId from the JWT-authenticated connection — never trust
        // the plantId supplied in the message body. A mismatch is an exploit attempt.
        const plantId = client?.plantId;
        if (!scanId || !assetId || !plantId) return;
        if (msgPlantId && msgPlantId !== plantId) {
            console.warn(`[LAN_HUB] SECURITY: SCAN plant override rejected user=${client?.userId} claimed=${msgPlantId} actual=${plantId}`);
            return;
        }

        // Predict branch BEFORE queuing so we can gate on the result
        let branch;
        try {
            branch = predictBranch(dataDir, plantId, assetId, userId);
        } catch (err) {
            console.warn('[LAN_HUB] Branch prediction failed:', err.message);
            branch = { branch: 'AUTO_CREATE_WO', message: 'Work Started' };
        }

        // Block a second AUTO_CREATE for the same asset within a 30-second window.
        // Without this, two devices scanning simultaneously both create WOs and
        // a duplicate appears when the server replays the queue.
        if (branch.branch === 'AUTO_CREATE_WO' && checkRecentAutoCreate(dataDir, plantId, assetId)) {
            console.log(`[LAN_HUB] Blocked duplicate AUTO_CREATE for asset=${assetId} by user=${userId}`);
            ws.send(JSON.stringify({
                type:    'SCAN_ACK',
                scanId,
                branch:  'CONFLICT_AUTO_CREATE',
                _hubBroadcast: true,
                error:   'Another technician is already creating a work order for this asset. Please wait a moment and scan again to join.',
                options: ['WAIT_AND_RETRY'],
            }));
            return;
        }

        // Store in queue (idempotent on scanId)
        const result = queueScan(dataDir, plantId, { scanId, assetId, userId, deviceTimestamp, action });
        if (result.duplicate) {
            ws.send(JSON.stringify({ type: 'SCAN_ACK', scanId, duplicate: true }));
            return;
        }

        // Acknowledge to the sending device
        ws.send(JSON.stringify({ type: 'SCAN_ACK', ...branch, scanId, _hubBroadcast: true }));

        // Broadcast WO state change to all other connected devices
        broadcast({ type: 'WO_STATE_CHANGED', assetId, ...branch, _hubBroadcast: true });

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
