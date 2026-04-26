# Trier OS — System Topology

One-page map of how the system is structured, followed by three concrete request traces.

---

## Full System Map

```
╔══════════════════════════════════════════════════════════════════════════╗
║                         CORPORATE HEADQUARTERS                           ║
║                                                                          ║
║  ┌─────────────────────────────────────────────────────────────────┐    ║
║  │                    TRIER OS SERVER (Node.js)                     │    ║
║  │                    HTTPS :1938  │  HTTP :1937 (dev)              │    ║
║  │                                                                  │    ║
║  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐   │    ║
║  │  │  Auth Mware │  │ Plant Router │  │  Route Handlers      │   │    ║
║  │  │  JWT verify │  │ x-plant-id → │  │  server/routes/*.js  │   │    ║
║  │  │  RBAC check │  │ AsyncLocal   │  │                      │   │    ║
║  │  │  Plant jail │  │ Storage      │  │                      │   │    ║
║  │  └─────────────┘  └──────────────┘  └──────────────────────┘   │    ║
║  │                                                                  │    ║
║  │  ┌────────────────────────────────────────────────────────────┐ │    ║
║  │  │                   DATABASE LAYER                           │ │    ║
║  │  │                                                            │ │    ║
║  │  │  trier_logistics.db    corporate_master.db                 │ │    ║
║  │  │  (auth, LOTO, audit,   (aggregated KPIs, asset index,      │ │    ║
║  │  │   ERP outbox, NATS)     rebuilt on boot)                   │ │    ║
║  │  │                                                            │ │    ║
║  │  │  Plant_1.db   Plant_2.db   ...Plant_N.db                   │ │    ║
║  │  │  (one SQLite file per plant, never shared)                 │ │    ║
║  │  └────────────────────────────────────────────────────────────┘ │    ║
║  │                                                                  │    ║
║  │  ┌─────────────────────┐  ┌───────────────────────────────────┐ │    ║
║  │  │  BACKGROUND ENGINES │  │  OUTBOUND INTEGRATIONS            │ │    ║
║  │  │                     │  │                                   │ │    ║
║  │  │  Silent Auto-Close  │  │  ERP Outbox (60s drain)           │ │    ║
║  │  │  HA Sync (60s)      │  │  → SAP / Oracle / Dynamics / any  │ │    ║
║  │  │  NATS bus           │  │  Webhook dispatcher               │ │    ║
║  │  │  ERP drain worker   │  │  → Slack / Teams / Discord        │ │    ║
║  │  │  Sensor threshold   │  │  Email service (SMTP)             │ │    ║
║  │  └─────────────────────┘  └───────────────────────────────────┘ │    ║
║  │                                                                  │    ║
║  │  ┌───────────────────────────────────────────────────────────┐  │    ║
║  │  │  LIVE STUDIO + PARALLEL UNIVERSE ENGINE (Creator only)    │  │    ║
║  │  │                                                           │  │    ║
║  │  │  Monaco IDE → sandbox branch → Parallel Universe replay   │  │    ║
║  │  │  → npm build → stable tag → optional PM2 reload          │  │    ║
║  │  │  StudioDeployLedger (append-only audit in logistics.db)   │  │    ║
║  │  └───────────────────────────────────────────────────────────┘  │    ║
║  └─────────────────────────────────────────────────────────────────┘    ║
║                                                                          ║
╠══════════════════════════════════════════════════════════════════════════╣
║                       SECONDARY SERVER (HA)                              ║
║  ha_sync.js pushes SQLite change ledger every 60s                        ║
║  POST /api/ha/promote for manual failover                                ║
╚══════════════════════════════════════════════════════════════════════════╝

          │  WAN / LAN  │
          ▼             ▼

╔══════════════════════════╗    ╔══════════════════════════╗
║     PLANT 1 (local)      ║    ║     PLANT 2 (local)      ║
║                          ║    ║                          ║
║  ┌────────────────────┐  ║    ║  ┌────────────────────┐  ║
║  │  LAN HUB :1940     │  ║    ║  │  LAN HUB :1940     │  ║
║  │  (Electron app)    │  ║    ║  │  (Electron app)    │  ║
║  │  WebSocket server  │  ║    ║  │  WebSocket server  │  ║
║  │  OfflineScanQueue  │  ║    ║  │  OfflineScanQueue  │  ║
║  └────────┬───────────┘  ║    ║  └────────┬───────────┘  ║
║           │              ║    ║           │              ║
║  ┌────────┴───────────┐  ║    ║           │              ║
║  │  FLOOR DEVICES     │  ║    ║  ┌────────┴───────────┐  ║
║  │                    │  ║    ║  │  FLOOR DEVICES     │  ║
║  │  Zebra TC77/TC78   │  ║    ║  │  Tablets / Mobile  │  ║
║  │  Tablets / Mobile  │  ║    ║  │  Workstations      │  ║
║  │  Workstations      │  ║    ║  └────────────────────┘  ║
║  │                    │  ║    ╚══════════════════════════╝
║  │  PWA (React SPA)   │  ║
║  │  IndexedDB queue   │  ║
║  │  HMAC offline auth │  ║
║  └────────────────────┘  ║
╚══════════════════════════╝
```

**Key rule:** Plants do not run their own Trier OS server. They connect to corporate.
The LAN Hub (port 1940) is a lightweight fallback for scan state only — it activates
automatically when the central server is unreachable and replays queued scans on reconnect.

---

## Request Trace 1 — Technician Scans a Machine

The most critical path in the system. Every other workflow branches from this.

```
Technician points Zebra TC77 at QR code on Pump-03
        │
        ▼
WebRTC camera captures frame → @zxing/library decodes barcode
        │
        ▼
POST /api/scan  { assetTag: "PMP-COOLING-03", scanId: "uuid-...", deviceTimestamp: ... }
   Headers: { x-plant-id: "Plant_1", Cookie: authToken=<jwt> }
        │
        ▼
Auth middleware
  → verify JWT signature + expiry
  → check tokenVersion against DB (revocation check)
  → resolve plant DB via AsyncLocalStorage (x-plant-id → Plant_1.db)
        │
        ▼
server/routes/scan.js — scan state machine
  → dedup guard: INSERT OR IGNORE on ScanAuditLog.scanId (UNIQUE INDEX)
    → duplicate? → return structured 200 { alreadyProcessed: true }
  → look up asset in Plant_1.db
    → unknown? → 404, no audit write
  → determine current WO state (IDLE / ACTIVE / WAITING)
  → branch:
      IDLE   → AUTO_CREATE_WO (new work order, assign to tech)
      ACTIVE → CONTINUE_WO   (surface current WO to tech)
      other  → ROUTE_TO_WAITING_WO, etc.
  → write WorkSegment (start timestamp, tech, device)
  → logInvariant() to trier_logistics.db (I-04 evidence)
  → insertOutboxEvent() to ERPOutbox (wo_create event, async drain)
        │
        ▼
Response: { action: "AUTO_CREATE_WO", workOrder: { ... }, nextStep: "START_WORK" }
        │
        ▼
React SPA renders ScanActionPrompt with single tap-to-confirm button
Technician taps → zero keystrokes total
```

**Files involved:** `src/components/ScanCapture.jsx`, `server/routes/scan.js`,
`server/middleware/auth.js`, `server/services/erp-outbox.js`, `server/logistics_db.js`

---

## Request Trace 2 — Offline Scan Queue Replays on Reconnect

What happens when a technician scans 14 assets during a 40-minute WAN outage.

```
WAN goes down → PWA detects server unreachable
        │
        ▼
PWA connects to LAN Hub at ws://[plant-lan-ip]:1940
  → JWT validated on upgrade
  → Hub sends current WO state from local SQLite cache
        │
        ▼
Technician scans asset (offline)
  → scan captured in IndexedDB OfflineDB (key: scanId)
  → HMAC-signed with device-bound 32-byte secret
  → written to LAN Hub via WebSocket (SCAN message)
  → Hub stores in OfflineScanQueue with deviceTimestamp
        │
        ▼
  ... (repeat for 13 more assets) ...
        │
        ▼
WAN restored → server sends SERVER_ONLINE broadcast
        │
        ▼
LAN Hub replays OfflineScanQueue to POST /api/scan/offline-sync
  → sorted by deviceTimestamp (I-03 invariant — ordering preserved)
  → each scan wrapped with { scanId, deviceTimestamp, assetTag, ... }
  → server processes each: INSERT OR IGNORE dedup, state machine, audit
        │
        ▼
PWA clients receive WO_STATE_CHANGED broadcast
  → UI reflects resolved state on all devices simultaneously
        │
        ▼
Hub marks replayed entries DEDUP_CLIENT
  → PWA replayQueue() skips them (C7 — no double-send)
```

**Files involved:** `server/lan_hub.js`, `src/utils/LanHub.js`,
`src/utils/offlineDB.js`, `server/routes/scan.js` (offline-sync endpoint)

---

## Request Trace 3 — Silent Auto-Close Cron

What happens to a work order left open by a missed close-out scan.

```
background_cron.js fires hourly
        │
        ▼
server/silent_close_engine.js iterates all plant DBs
  → SELECT WorkSegments WHERE Status='Active'
      AND StartTime < datetime('now', '-12 hours')
  → filter: skip exempt hold reasons
      (WAITING_ON_PARTS, WAITING_ON_VENDOR, WAITING_ON_APPROVAL, SCHEDULED_RETURN)
        │
        ▼
For each expired segment:
  → close WorkSegment: Status='TimedOut', EndTime=now()
  → find parent WorkOrder
  → if no existing reviewReason:
      SET needsReview=1, reviewReason='SILENT_AUTO_CLOSE', reviewStatus='FLAGGED'
  → logAudit() → AuditLog in trier_logistics.db
        │
        ▼
Supervisor sees flagged WO in Mission Control review queue
  → resolve: "tech left without scanning out" or "device lost connection"
  → no ghost records, no silent data loss
```

**Files involved:** `server/silent_close_engine.js`, `server/background_cron.js`,
`server/logistics_db.js`

---

## SQLite Scalability Note

A common question for multi-plant deployments: does SQLite scale?

At current data volumes (50 plants × ~500 assets each, ~200 scans/day/plant):
- Each plant DB stays under 100 MB
- `corporate_master.db` aggregates via the crawl engine on boot (~30–60s first boot)
- No cross-plant queries touch individual plant DBs — they go through `corporate_master`
- The write bottleneck (SQLite WAL mode) handles concurrent HTTP requests comfortably
  at the single-server, single-plant-file level
- Locking is per-file: Plant_1.db writes never block Plant_2.db reads

At 200+ plants or extremely high scan rates (industrial SCADA ingestion), the right path
is the existing sensor ingest endpoint with a Postgres backend option — not replacing
the per-plant SQLite model, but adding a separate time-series path for raw sensor data.
This is a documented roadmap item, not a current constraint.
