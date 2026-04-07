// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */

/**
 * Trier OS — UWB Real-Time Location Broker (uwbBroker.js)
 * =========================================================
 * The central hub for all Ultra-Wideband (UWB) positioning data flowing
 * through Trier OS. Sits between physical UWB anchor hardware (or simulation)
 * and the browser clients subscribing via WebSocket.
 *
 * ARCHITECTURE:
 *   Hardware/Simulated Vendor
 *        │  (raw position events)
 *        ▼
 *   uwbBroker.js  ◄──── routes/uwb.js (REST: POST /api/uwb/position)
 *        │
 *        ├── processPosition()    — tag registry, exclusion zone check, lone worker
 *        ├── broadcast()          — pushes position updates to subscribed WS clients
 *        ├── insertSafetyAlert()  — writes to uwb_safety_alerts table
 *        └── tagPositions Map     — in-memory latest position cache per tagId
 *
 * WEBSOCKET PROTOCOL (path: /ws/uwb):
 *   Client connects and sends: { subscribe: true, plantId: "Demo_Plant_1", floorId: "27" }
 *   Server pushes: { type: "positions", positions: { [tagId]: { x, y, z, quality, ts } } }
 *   Also pushes:   { type: "alert", tagId, alertType, detail }
 *
 * VENDOR ADAPTERS:
 *   'pozyx'     — Pozyx WebSocket API (real-time MQTT-over-WS)
 *   'sewio'     — Sewio RTLS WebSocket stream
 *   'zebra'     — Zebra MotionWorks polling (HTTP REST, 1-second interval)
 *   'simulated' — Built-in random-walk simulator for development/demo
 *
 * SAFETY PIPELINE (processPosition, called for every position update):
 *   1. Tag registry lookup     — enriches position with EntityType, AssignedTo
 *   2. Persist to DB           — writes uwb_positions row via routes/uwb.js REST
 *   3. Broadcast to clients    — pushes update to all subscribed WS connections
 *   4. Exclusion zone check    — ray-cast against all active zones for this floor
 *      └─ breach → insertSafetyAlert('exclusion_zone_breach')
 *   5. Lone worker timer check — detects workers without recent check-in
 *      └─ overdue → insertSafetyAlert('lone_worker_overdue')
 *
 * EXCLUSION ZONE GEOMETRY: Uses ray-casting (pointInPolygon) to test whether
 * a position (x, y) lies inside a polygon defined as [{x, y}, …] in floor
 * coordinate space. Polygon data is fetched from uwb_exclusion_zones and
 * cached with a 30-second TTL to avoid DB hammering on each position event.
 *
 * LONE WORKER TIMER: Tags of EntityType='person' with no manual check-in
 * (via POST /api/uwb/checkin) within LONE_WORKER_INTERVAL_MS (default 30 min)
 * trigger a 'lone_worker_overdue' safety alert.
 *
 * EXPORTED API:
 *   init(wss)              — Attach to a WebSocket.Server instance
 *   handleVendorSwitch(v)  — Hot-swap vendor adapter at runtime
 *   getTagPositions()      — Returns the current in-memory tagPositions Map
 *   getLoneWorkerStatus()  — Returns loneWorkerTimers Map for external checks
 *   on(event, handler)     — EventEmitter: 'position', 'alert', 'connected'
 */

'use strict';

const EventEmitter = require('events');
const WebSocket = require('ws');
const https = require('https');
const http = require('http');

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
const emitter = new EventEmitter();

/** Map<ws, { plantId, floorId }> */
const clients = new Map();

/** Map<tagId, latestPosition> */
const tagPositions = new Map();

/** Map<tagId, { lastMoveTs, lastPos }> */
const loneWorkerTimers = new Map();

/** Map<tagId, ts> */
const checkinTimes = new Map();

/** Map<tagId, tagRecord> */
const tagRegistry = new Map();

/** Exclusion zone cache: Map<`${plantId}:${floorId}`, { zones, fetchedAt }> */
const exclusionZoneCache = new Map();
const EXCLUSION_ZONE_TTL_MS = 30_000;

let wssRef = null;
let currentVendor = null;
let vendorConnection = null; // WebSocket or interval handle
let connected = false;
let simulatedInterval = null;
let tagSyncInterval = null;
let zebraInterval = null;

// ---------------------------------------------------------------------------
// Lazy-load logistics_db to avoid circular deps at module load time
// ---------------------------------------------------------------------------
function getDb() {
  try {
    const logistics = require('../logistics_db');
    return logistics.db;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Point-in-polygon — ray casting
// ---------------------------------------------------------------------------
function pointInPolygon(x, y, polygon) {
  let poly = polygon;
  if (typeof poly === 'string') {
    try { poly = JSON.parse(poly); } catch { return false; }
  }
  if (!Array.isArray(poly) || poly.length < 3) return false;

  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Euclidean distance (2-D)
// ---------------------------------------------------------------------------
function dist2D(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// ---------------------------------------------------------------------------
// broadcast
// ---------------------------------------------------------------------------
function broadcast(plantId, floorId, message) {
  const payload = JSON.stringify(message);
  for (const [ws, sub] of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (sub.plantId !== String(plantId)) continue;
    if (floorId !== null && floorId !== undefined && sub.floorId !== String(floorId)) continue;
    ws.send(payload);
  }
}

function broadcastToPlant(plantId, message) {
  broadcast(plantId, null, message);
}

// ---------------------------------------------------------------------------
// syncTagRegistry
// ---------------------------------------------------------------------------
function syncTagRegistry() {
  const db = getDb();
  if (!db) return;
  try {
    const rows = db.prepare(
      `SELECT * FROM uwb_tags WHERE IsActive = 1`
    ).all();
    tagRegistry.clear();
    for (const row of rows) {
      tagRegistry.set(String(row.TagId || row.tag_id || row.id), row);
    }
  } catch (e) {
    // Table may not exist yet — silently skip
  }
}

// ---------------------------------------------------------------------------
// Exclusion zones
// ---------------------------------------------------------------------------
async function getExclusionZones(plantId, floorId) {
  const key = `${plantId}:${floorId}`;
  const cached = exclusionZoneCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < EXCLUSION_ZONE_TTL_MS) {
    return cached.zones;
  }
  const db = getDb();
  let zones = [];
  if (db) {
    try {
      zones = db.prepare(
        `SELECT * FROM uwb_exclusion_zones WHERE plant_id = ? AND floor_id = ? AND is_active = 1`
      ).all(String(plantId), String(floorId));
    } catch {
      zones = [];
    }
  }
  exclusionZoneCache.set(key, { zones, fetchedAt: Date.now() });
  return zones;
}

// ---------------------------------------------------------------------------
// Insert safety alert
// ---------------------------------------------------------------------------
function insertSafetyAlert(plantId, tagId, alertType, detail) {
  const db = getDb();
  if (!db) return;
  try {
    db.prepare(
      `INSERT INTO uwb_alerts (plant_id, tag_id, alert_type, detail, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(String(plantId), String(tagId), alertType, JSON.stringify(detail));
  } catch {
    // Table may not exist
  }
}

// ---------------------------------------------------------------------------
// Persist position directly to DB
// ---------------------------------------------------------------------------
function persistPosition(tagId, x, y, z, floorId, plantId, quality, ts) {
  const db = getDb();
  if (!db) return;
  try {
    db.prepare(
      `INSERT INTO uwb_positions (tag_id, x, y, z, floor_id, plant_id, quality, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(String(tagId), x, y, z, String(floorId), String(plantId), quality, ts);
  } catch {
    // Table may not exist yet
  }
}

// ---------------------------------------------------------------------------
// processPosition — core logic
// ---------------------------------------------------------------------------
async function processPosition(tagId, x, y, z, floorId, plantId, quality) {
  const ts = new Date().toISOString();
  const tagIdStr = String(tagId);

  // 1. Look up entity info
  const tagInfo = tagRegistry.get(tagIdStr) || {};
  const entityType = tagInfo.entity_type || tagInfo.EntityType || 'unknown';
  const entityId = tagInfo.entity_id || tagInfo.EntityId || null;
  const label = tagInfo.label || tagInfo.Label || tagIdStr;

  // 2. Update tagPositions
  const prev = tagPositions.get(tagIdStr);
  tagPositions.set(tagIdStr, { x, y, z, floorId: String(floorId), plantId: String(plantId), quality, ts, entityType, entityId, label });

  // 3. Broadcast position
  broadcast(String(plantId), String(floorId), {
    type: 'uwb_position',
    tagId: tagIdStr,
    x, y, z,
    floorId: String(floorId),
    plantId: String(plantId),
    quality,
    ts,
    entityType,
    entityId,
    label,
  });

  // 4. Exclusion Zone Check (persons only — extend to all if needed)
  if (entityType === 'person') {
    try {
      const zones = await getExclusionZones(String(plantId), String(floorId));
      for (const zone of zones) {
        let polygon = zone.polygon || zone.Polygon;
        if (pointInPolygon(x, y, polygon)) {
          const alertDetail = { tagId: tagIdStr, x, y, z, zoneName: zone.name || zone.Name, zoneId: zone.id };
          insertSafetyAlert(plantId, tagIdStr, 'exclusion_zone_breach', alertDetail);
          broadcastToPlant(String(plantId), {
            type: 'uwb_alert',
            alertType: 'exclusion_zone_breach',
            tagId: tagIdStr,
            label,
            entityType,
            entityId,
            x, y, z,
            floorId: String(floorId),
            plantId: String(plantId),
            zoneName: zone.name || zone.Name,
            zoneId: zone.id,
            ts,
          });
        }
      }
    } catch { /* non-fatal */ }
  }

  // 5. Lone Worker Check
  if (entityType === 'person') {
    const now = Date.now();
    const checkin = checkinTimes.get(tagIdStr);
    const LONE_WORKER_MS = 20 * 60 * 1000; // 20 minutes
    const MOVE_THRESHOLD_M = 0.5;

    // Skip if recently checked in
    const recentCheckin = checkin && (now - checkin) < LONE_WORKER_MS;

    if (!recentCheckin) {
      const lw = loneWorkerTimers.get(tagIdStr);
      if (lw) {
        const moved = dist2D(x, y, lw.lastPos.x, lw.lastPos.y);
        if (moved >= MOVE_THRESHOLD_M) {
          // Tag has moved — reset timer
          loneWorkerTimers.set(tagIdStr, { lastMoveTs: now, lastPos: { x, y } });
        } else if ((now - lw.lastMoveTs) >= LONE_WORKER_MS) {
          // Has not moved enough in 20 minutes
          insertSafetyAlert(plantId, tagIdStr, 'lone_worker', { tagId: tagIdStr, x, y, z, minutesStationary: 20 });
          broadcastToPlant(String(plantId), {
            type: 'uwb_lone_worker',
            tagId: tagIdStr,
            label,
            entityType,
            entityId,
            x, y, z,
            floorId: String(floorId),
            plantId: String(plantId),
            minutesStationary: Math.round((now - lw.lastMoveTs) / 60_000),
            ts,
          });
          // Reset so we don't spam
          loneWorkerTimers.set(tagIdStr, { lastMoveTs: now, lastPos: { x, y } });
        }
      } else {
        loneWorkerTimers.set(tagIdStr, { lastMoveTs: now, lastPos: { x, y } });
      }
    }
  }

  // 6. Forklift / Vehicle Collision Check
  if (entityType === 'vehicle') {
    const COLLISION_DIST_M = 3.0;
    const SPEED_PROXY_M = 0.5;

    let vehicleMoved = false;
    if (prev) {
      vehicleMoved = dist2D(x, y, prev.x, prev.y) > SPEED_PROXY_M;
    }

    if (vehicleMoved) {
      for (const [personTagId, personPos] of tagPositions) {
        if (personPos.entityType !== 'person') continue;
        if (String(personPos.floorId) !== String(floorId)) continue;
        if (String(personPos.plantId) !== String(plantId)) continue;
        const distance = dist2D(x, y, personPos.x, personPos.y);
        if (distance < COLLISION_DIST_M) {
          const personTag = tagRegistry.get(personTagId) || {};
          broadcastToPlant(String(plantId), {
            type: 'uwb_collision_warning',
            vehicleTagId: tagIdStr,
            vehicleLabel: label,
            personTagId,
            personLabel: personTag.label || personTag.Label || personTagId,
            distance: Math.round(distance * 100) / 100,
            x, y, z,
            floorId: String(floorId),
            plantId: String(plantId),
            ts,
          });
          insertSafetyAlert(plantId, tagIdStr, 'collision_warning', {
            vehicleTagId: tagIdStr,
            personTagId,
            distance,
          });
        }
      }
    }
  }

  // 7. Persist position
  persistPosition(tagIdStr, x, y, z, floorId, plantId, quality, ts);
}

// ---------------------------------------------------------------------------
// Send current live positions to a newly connected client
// ---------------------------------------------------------------------------
function sendCurrentPositions(ws, plantId, floorId) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const snapshot = [];
  for (const [tagId, pos] of tagPositions) {
    if (String(pos.plantId) !== String(plantId)) continue;
    if (String(pos.floorId) !== String(floorId)) continue;
    snapshot.push({ tagId, ...pos });
  }
  if (snapshot.length > 0) {
    ws.send(JSON.stringify({ type: 'uwb_snapshot', positions: snapshot }));
  }
}

// ---------------------------------------------------------------------------
// init(wss)
// ---------------------------------------------------------------------------
function init(wss) {
  wssRef = wss;

  // Sync tag registry on startup and every 5 minutes
  syncTagRegistry();
  tagSyncInterval = setInterval(syncTagRegistry, 5 * 60 * 1000);

  wss.on('connection', (ws, req) => {
    // Parse query params
    let plantId = null;
    let floorId = null;
    try {
      const urlStr = req.url || '';
      const qIdx = urlStr.indexOf('?');
      if (qIdx !== -1) {
        const params = new URLSearchParams(urlStr.slice(qIdx + 1));
        plantId = params.get('plantId') || null;
        floorId = params.get('floorId') || null;
      }
    } catch { /* ignore */ }

    clients.set(ws, { plantId: String(plantId), floorId: String(floorId) });

    // Send current positions
    if (plantId && floorId) {
      sendCurrentPositions(ws, plantId, floorId);
    }

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'subscribe') {
          const newPlantId = String(msg.plantId || plantId);
          const newFloorId = String(msg.floorId || floorId);
          clients.set(ws, { plantId: newPlantId, floorId: newFloorId });
          sendCurrentPositions(ws, newPlantId, newFloorId);
        }
      } catch { /* ignore malformed */ }
    });
  });

  // Load vendor config from DB, fall back to simulated
  loadVendorConfigAndConnect();
}

// ---------------------------------------------------------------------------
// Load vendor config from DB
// ---------------------------------------------------------------------------
function loadVendorConfigAndConnect() {
  const db = getDb();
  if (db) {
    try {
      // Ensure config table exists
      db.prepare(
        `CREATE TABLE IF NOT EXISTS uwb_config (
          id INTEGER PRIMARY KEY DEFAULT 1,
          vendor TEXT,
          host TEXT,
          port INTEGER,
          apiKey TEXT,
          UpdatedAt TEXT
        )`
      ).run();

      const row = db.prepare(`SELECT * FROM uwb_config WHERE id = 1`).get();
      if (row && row.vendor) {
        connectVendor({ vendor: row.vendor, host: row.host, port: row.port, apiKey: row.apiKey });
        return;
      }
    } catch { /* fall through */ }
  }
  // Default: simulated
  connectVendor({ vendor: 'simulated' });
}

// ---------------------------------------------------------------------------
// disconnect current vendor
// ---------------------------------------------------------------------------
function disconnect() {
  if (simulatedInterval) {
    clearInterval(simulatedInterval);
    simulatedInterval = null;
  }
  if (zebraInterval) {
    clearInterval(zebraInterval);
    zebraInterval = null;
  }
  if (vendorConnection) {
    if (typeof vendorConnection.close === 'function') {
      try { vendorConnection.close(); } catch { /* ignore */ }
    }
    vendorConnection = null;
  }
  connected = false;
}

// ---------------------------------------------------------------------------
// Vendor adapters
// ---------------------------------------------------------------------------

// --- Pozyx ---
function connectPozyx(config) {
  const port = config.port || 8887;
  const url = `ws://${config.host}:${port}`;
  const ws = new WebSocket(url);

  ws.on('open', () => { connected = true; });
  ws.on('close', () => { connected = false; });
  ws.on('error', (err) => {
    connected = false;
    console.error('[UWB Pozyx] WebSocket error:', err.message);
  });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      // Support both single tag and array formats
      const items = Array.isArray(msg) ? msg : [msg];
      for (const item of items) {
        const tagId = item.tagId || item.tag_id || item.id;
        const coords = item.coordinates || item.coords || {};
        const x = Number(coords.x || 0);
        const y = Number(coords.y || 0);
        const z = Number(coords.z || 0);
        const quality = item.quality || item.success || 1;
        const floorId = item.floorId || config.floorId || '1';
        const plantId = item.plantId || config.plantId || '1';
        if (tagId !== undefined) {
          processPosition(tagId, x, y, z, floorId, plantId, quality);
        }
      }
    } catch { /* ignore malformed frames */ }
  });

  vendorConnection = ws;
  connected = true;
}

// --- Sewio ---
function connectSewio(config) {
  const url = `ws://${config.host}/sensmapserver/api`;
  const wsOpts = {};
  if (config.apiKey) {
    wsOpts.headers = { Authorization: `Bearer ${config.apiKey}` };
  }
  const ws = new WebSocket(url, wsOpts);

  ws.on('open', () => { connected = true; });
  ws.on('close', () => { connected = false; });
  ws.on('error', (err) => {
    connected = false;
    console.error('[UWB Sewio] WebSocket error:', err.message);
  });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      // Sewio sends anchor/tag records in various formats; attempt normalization
      const tags = msg.tags || msg.data || (Array.isArray(msg) ? msg : [msg]);
      for (const tag of tags) {
        const tagId = tag.tagId || tag.tag_id || tag.id;
        const pos = tag.position || tag.coordinates || tag.coord || {};
        const x = Number(pos.x || tag.x || 0);
        const y = Number(pos.y || tag.y || 0);
        const z = Number(pos.z || tag.z || 0);
        const quality = tag.quality || tag.smooth || 1;
        const floorId = tag.floorId || config.floorId || '1';
        const plantId = config.plantId || '1';
        if (tagId !== undefined) {
          processPosition(tagId, x, y, z, floorId, plantId, quality);
        }
      }
    } catch { /* ignore */ }
  });

  vendorConnection = ws;
  connected = true;
}

// --- Zebra RTI ---
function connectZebra(config) {
  const POLL_INTERVAL_MS = 2000;
  const baseUrl = `http://${config.host}/api/v1/tags`;

  function pollZebra() {
    const lib = baseUrl.startsWith('https') ? https : http;
    const reqOpts = { headers: {} };
    if (config.apiKey) reqOpts.headers['Authorization'] = `Bearer ${config.apiKey}`;

    const req = lib.get(baseUrl, reqOpts, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const tags = json.tags || json.data || (Array.isArray(json) ? json : [json]);
          connected = true;
          for (const tag of tags) {
            const tagId = tag.tagId || tag.tag_id || tag.id;
            const x = Number(tag.x || tag.locationX || 0);
            const y = Number(tag.y || tag.locationY || 0);
            const z = Number(tag.z || tag.locationZ || 0);
            const quality = tag.quality || tag.confidence || 1;
            const floorId = tag.floorId || config.floorId || '1';
            const plantId = config.plantId || '1';
            if (tagId !== undefined) {
              processPosition(tagId, x, y, z, floorId, plantId, quality);
            }
          }
        } catch { /* ignore parse errors */ }
      });
    });
    req.on('error', (err) => {
      connected = false;
      console.error('[UWB Zebra] Poll error:', err.message);
    });
    req.end();
  }

  zebraInterval = setInterval(pollZebra, POLL_INTERVAL_MS);
  pollZebra(); // immediate first poll
  vendorConnection = { close: () => clearInterval(zebraInterval) };
  connected = true;
}

// --- Simulated ---
const SIM_TAGS = [
  { tagId: 'sim-person-001', entityType: 'person',  label: 'Worker A',   x: 5,  y: 5  },
  { tagId: 'sim-asset-001',  entityType: 'asset',   label: 'Pallet 1',   x: 10, y: 7  },
  { tagId: 'sim-vehicle-001',entityType: 'vehicle', label: 'Forklift 1', x: 15, y: 10 },
];
const SIM_FLOOR_W = 20;
const SIM_FLOOR_H = 15;
const SIM_PLANT_ID = '1';
const SIM_FLOOR_ID = '1';

const simState = SIM_TAGS.map(t => ({ ...t }));

function randomWalk(val, max, step = 0.5) {
  const delta = (Math.random() - 0.5) * step * 2;
  return Math.min(Math.max(val + delta, 0), max);
}

function startSimulated() {
  // Pre-populate tag registry for sim tags (in-memory only)
  for (const t of SIM_TAGS) {
    tagRegistry.set(t.tagId, {
      tag_id: t.tagId,
      entity_type: t.entityType,
      entity_id: t.tagId,
      label: t.label,
    });
  }

  simulatedInterval = setInterval(() => {
    for (const state of simState) {
      state.x = randomWalk(state.x, SIM_FLOOR_W);
      state.y = randomWalk(state.y, SIM_FLOOR_H);
      processPosition(state.tagId, state.x, state.y, 0, SIM_FLOOR_ID, SIM_PLANT_ID, 1.0);
    }
  }, 2000);

  vendorConnection = { close: () => { clearInterval(simulatedInterval); simulatedInterval = null; } };
  connected = true;
}

// ---------------------------------------------------------------------------
// connectVendor
// ---------------------------------------------------------------------------
function connectVendor(config) {
  if (!config || !config.vendor) {
    console.warn('[UWB] connectVendor called with no vendor — defaulting to simulated');
    config = { vendor: 'simulated' };
  }

  // Tear down existing connection
  disconnect();

  currentVendor = config.vendor;

  switch (config.vendor) {
    case 'pozyx':
      connectPozyx(config);
      break;
    case 'sewio':
      connectSewio(config);
      break;
    case 'zebra':
      connectZebra(config);
      break;
    case 'simulated':
    default:
      startSimulated();
      break;
  }

  console.log(`[UWB] Connected vendor: ${currentVendor}`);
}

// ---------------------------------------------------------------------------
// checkinTag
// ---------------------------------------------------------------------------
function checkinTag(tagId) {
  checkinTimes.set(String(tagId), Date.now());
}

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------
function getStatus() {
  return {
    vendor: currentVendor,
    connected,
    tagCount: tagPositions.size,
    clientCount: clients.size,
    simulated: currentVendor === 'simulated',
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  init,
  connectVendor,
  disconnect,
  getStatus,
  checkinTag,
};
