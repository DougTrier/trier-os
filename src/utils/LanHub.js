/**
 * Trier OS — LAN Hub Client
 * =========================
 * PWA-side WebSocket client that connects to the Electron desktop hub
 * (server/lan_hub.js) on port 1940 when the central server is unreachable.
 *
 * Usage:
 *   import LanHub from './LanHub.js';
 *   LanHub.onWoStateChanged(handler);  // register listener
 *   LanHub.connect();                  // call after central server confirmed down
 *   LanHub.submitScan(payload);        // route a scan through the hub
 *   LanHub.disconnect();               // call when central server returns
 */

const HUB_PORT = 1940;
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;

let _ws               = null;
let _connected        = false;
let _reconnectTimer   = null;
let _reconnectAttempts = 0;
let _intentionalClose = false;

// Registered event handlers
const _handlers = {
    woStateChanged:  [],  // (data) => void
    deviceList:      [],  // (devices) => void
    serverOnline:    [],  // () => void
    scanAck:         [],  // (data) => void
    statusChange:    [],  // (connected: boolean) => void
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getHubUrl() {
    const ip    = localStorage.getItem('plantHubIp');
    const token = localStorage.getItem('hubToken');
    if (!ip || !token) return null;
    return `ws://${ip}:${HUB_PORT}?token=${encodeURIComponent(token)}`;
}

function emit(event, ...args) {
    (_handlers[event] || []).forEach(fn => { try { fn(...args); } catch (_) {} });
}

function setConnected(val) {
    _connected = val;
    emit('statusChange', val);
}

// ── Connection ────────────────────────────────────────────────────────────────

function connect() {
    if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;

    const url = getHubUrl();
    if (!url) {
        console.warn('[LanHub] No hub IP or token configured — cannot connect');
        return;
    }

    _intentionalClose = false;
    _reconnectAttempts = 0;
    _open(url);
}

function _open(url) {
    if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.warn('[LanHub] Max reconnect attempts reached — giving up');
        return;
    }

    console.log(`[LanHub] Connecting to hub at ${url.split('?')[0]}`);
    _ws = new WebSocket(url);

    _ws.onopen = () => {
        console.log('[LanHub] Connected to LAN hub');
        _reconnectAttempts = 0;
        setConnected(true);

        // Replay any queued scans from IndexedDB immediately
        _replayQueue();

        // Keepalive ping every 20 seconds
        _startPing();
    };

    _ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        _handleMessage(msg);
    };

    _ws.onclose = (event) => {
        setConnected(false);
        _stopPing();
        if (!_intentionalClose) {
            _reconnectAttempts++;
            const delay = RECONNECT_DELAY_MS * Math.min(_reconnectAttempts, 5);
            console.log(`[LanHub] Disconnected (${event.code}) — reconnecting in ${delay}ms`);
            _reconnectTimer = setTimeout(() => _open(url), delay);
        }
    };

    _ws.onerror = (err) => {
        console.warn('[LanHub] WebSocket error', err);
    };
}

function disconnect() {
    _intentionalClose = true;
    clearTimeout(_reconnectTimer);
    _stopPing();
    if (_ws) { _ws.close(); _ws = null; }
    setConnected(false);
    console.log('[LanHub] Disconnected (intentional)');
}

// ── Ping keepalive ────────────────────────────────────────────────────────────

let _pingInterval = null;

function _startPing() {
    _pingInterval = setInterval(() => {
        if (_ws?.readyState === WebSocket.OPEN) _ws.send(JSON.stringify({ type: 'PING' }));
    }, 20000);
}

function _stopPing() {
    clearInterval(_pingInterval);
    _pingInterval = null;
}

// ── Message handler ───────────────────────────────────────────────────────────

function _handleMessage(msg) {
    switch (msg.type) {
        case 'PONG':
            break;

        case 'SCAN_ACK':
            emit('scanAck', msg);
            break;

        case 'WO_STATE_CHANGED':
            emit('woStateChanged', msg);
            // Update IndexedDB cache so predictBranch stays current
            _updateLocalCache(msg);
            break;

        case 'DEVICE_LIST':
            emit('deviceList', msg.devices || []);
            break;

        case 'SERVER_ONLINE':
            console.log('[LanHub] Central server is back online');
            emit('serverOnline');
            // Disconnect from hub — main.jsx will resume normal fetch flow
            disconnect();
            break;

        default:
            break;
    }
}

// ── Scan submission ───────────────────────────────────────────────────────────

function submitScan(payload) {
    if (!_connected || _ws?.readyState !== WebSocket.OPEN) {
        console.warn('[LanHub] Not connected — scan will stay in IndexedDB queue');
        return false;
    }
    _ws.send(JSON.stringify({ type: 'SCAN', ...payload }));
    return true;
}

// ── Queue replay ──────────────────────────────────────────────────────────────

async function _replayQueue() {
    try {
        const { default: OfflineDB } = await import('./OfflineDB.js');
        const plantId = localStorage.getItem('nativePlantId') || localStorage.getItem('selectedPlantId');
        const pending = await OfflineDB.getPendingWrites();
        const scans   = pending.filter(e => e.endpoint === '/api/scan' && e.payload?.scanId);

        for (const entry of scans) {
            const sent = submitScan({
                ...entry.payload,
                plantId,
            });
            if (sent) console.log(`[LanHub] Replayed queued scan ${entry.payload.scanId} to hub`);
        }
    } catch (err) {
        console.warn('[LanHub] Queue replay failed:', err.message);
    }
}

// ── Local cache update ────────────────────────────────────────────────────────

async function _updateLocalCache(msg) {
    try {
        const { default: OfflineDB } = await import('./OfflineDB.js');
        const { assetId, wo, branch } = msg;
        if (!wo || !assetId) return;

        // Patch the affected work order in IndexedDB so predictBranch sees fresh state
        const allWos = await OfflineDB.getAll('work_orders');
        const existing = allWos.find(w => String(w.AstID) === String(assetId));
        if (existing) {
            const statusMap = {
                ROUTE_TO_ACTIVE_WO:  30,
                ROUTE_TO_WAITING_WO: 31,
                AUTO_CREATE_WO:      30,
            };
            existing.StatusID = statusMap[branch] ?? existing.StatusID;
            await OfflineDB.putAll('work_orders', [existing]);
        }
    } catch (_) {}
}

// ── Event registration ────────────────────────────────────────────────────────

function onWoStateChanged(fn)  { _handlers.woStateChanged.push(fn); }
function onDeviceList(fn)      { _handlers.deviceList.push(fn); }
function onServerOnline(fn)    { _handlers.serverOnline.push(fn); }
function onScanAck(fn)         { _handlers.scanAck.push(fn); }
function onStatusChange(fn)    { _handlers.statusChange.push(fn); }

function isConnected()         { return _connected; }

export default {
    connect,
    disconnect,
    submitScan,
    isConnected,
    onWoStateChanged,
    onDeviceList,
    onServerOnline,
    onScanAck,
    onStatusChange,
    HUB_PORT,
};
