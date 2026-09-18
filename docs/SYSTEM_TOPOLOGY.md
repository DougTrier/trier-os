# Trier OS — System Topology

One-page map of the intended single-corporate deployment, followed by illustrative request traces. Optional integrations and fallback require configuration. The default Electron launcher actually starts a full embedded server on its host; it is not automatically an HQ thin client. See [architecture](ARCHITECTURE.md) and [validation limits](SECURITY_MAINTENANCE_VALIDATION.md).

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
║  │  │  (shared LOTO, audit,   (aggregated KPIs, asset index,      │ │    ║
║  │  │   ERP outbox, NATS)     crawl/write paths)                   │ │    ║
║  │  │                                                            │ │    ║
║  │  │  Plant_1.db   Plant_2.db   ...Plant_N.db                   │ │    ║
║  │  │  (one SQLite file per plant, authorized cross-search)                 │ │    ║
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

**Intended deployment:** Plants connect to the corporate instance. HQ also holds `trier_auth.db` for identities/roles. The optional LAN Hub provides local scan state, queues and cache reads. Current Electron/hub startup uses a local embedded API URL; verify actual routing and recovery rather than assuming remote HQ setup is automatic.

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

## Request Trace 2 — Offline capture and reconnect

PWA IndexedDB and hub-local OfflineScanQueue are separate stores. A valid 24-hour hub token authenticates the WebSocket; it is distinct from the 7-day corporate cookie session. Local capture/replay is intended to preserve scan context during outages.

On reconnect, the PWA and/or hub attempt replay to `POST /api/scan/offline-sync`. Scan-ID guards and client/hub ownership messages reduce duplicates. Confirm per-item semantic acceptance before clearing pending work; HTTP 200 is only transport acknowledgement. Device timestamps are supplied context, not a guarantee of global causal ordering.

Current hub startup uses HUB_TOKEN_SECRET for its HMAC replay argument, while the scan route checks JWT_SECRET, and generic route authentication also matters. Offline authentication/defaults, ACK handling and power-loss/restart recovery remain deferred review items. The authenticated hub PING check and browser tests with mocked/intercepted communication do not prove a real outage queue drain.

**Files involved:** `server/lan_hub.js`, `src/utils/LanHub.js`, `src/utils/offlineDB.js`, `server/routes/scan.js`.

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
  → flagged work is visible for review; recovery still requires verification
```

**Files involved:** `server/silent_close_engine.js`, `server/background_cron.js`,
`server/logistics_db.js`

---

## Capacity and maintenance limits

Per-file WAL/locking and the existing connection pool are design choices, not a certified plant-count or throughput guarantee. Corporate endpoints may query individual plants as well as master data. Measure the intended workload and review SQLite contention, storage and integration limits before deployment; no Postgres/time-series redesign or new capacity feature roadmap is planned.

Trier OS 3.7.1 is feature complete. [Maintenance policy](MAINTENANCE.md).
