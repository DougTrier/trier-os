# Trier OS — Task List
> Clean checklist of remaining work. Full specs in ROADMAP.md.
> ✅ = shipped · 🟡 = in progress · 🔵 = planned · 💬 = under discussion

---

## P1 — Zero-Keystroke Execution Layer

- [x] Scan State Machine (core loop, all branches)
- [x] Mid-State Scan Options (Close / Waiting / Escalate / Continue Later)
- [x] Hold Reason Taxonomy (exempt vs. timeout-eligible codes)
- [x] Scan Idempotency (scanId UUID dedup)
- [x] Context Confirmation Flash (1.0s overlay)
- [x] Auto-WO Creation on First Scan
- [x] Offline-Safe Scan Queue — client-side PWA queue + auto-sync; offline multi-tech Auto-Join conflict rule
- [x] Offline PWA Branch Prediction — predictBranch() uses cached WO + WorkSegments data; accurate MULTI_TECH / OTHER_USER_ACTIVE / RESUMED_NO_SEGMENT context offline
- [x] WorkSegments offline cache — GET /api/scan/active-segments + IndexedDB store (DB v3); refreshed every 15 min
- [x] Session persistence across app close — ScannerWorkspace saves step + scanResult to IndexedDB meta; restores on reopen with server down
- [x] Offline auth fallback — network error on /auth/me falls back to cached localStorage credentials instead of forcing re-login
- [x] JWT extended to 7 days — supports multi-day offline plant operation; cookie maxAge updated to match
- [x] LAN Hub IP field — added to PlantConfiguration (with safe migration), Plant Setup UI, plant creation, login response, and localStorage cache
- [x] Silent Auto-Close Threshold — hourly cron (silent_close_engine.js) closes Active segments beyond per-plant threshold; raises needsReview / reviewReason='SILENT_AUTO_CLOSE' on parent WO; exempt hold reasons respected

---

## P2 — Pilot Blockers

### Failure Domain Isolation
- [x] Define 3-plane architecture (Control / Execution / Simulation) + data flow diagram
- [x] Split core services into independent runtimes with message bus + circuit breakers
- [x] Implement all 4 degraded modes (Normal / Advisory-Only / Isolated / Offline)
- [x] Failure injection test suite (kill ingestion, kill bus, corrupt connector, kill full process)

### Governed Write Path (Gatekeeper)
- [x] Gatekeeper as a separate runtime — single enforced write path to PLC/SCADA
- [x] LDAP/AD RBAC + action class definitions (Read-only → Safety-critical)
- [x] Change validation engine (role + state + permit checks; signed change tickets)
- [x] Immutable audit log wired to every Gatekeeper action
- [x] OPC-UA write proxy + Modbus command wrapper (control adapters)

### Operational Support Model
- [x] Tiered support model doc (Tier 0 / 1 / 2) + escalation paths + SLAs
- [x] Incident runbooks (Sev 1–3, system outage, ingestion failure, auth failure)
- [x] System health monitoring + alerting (uptime, bus health, connector status)
- [x] Versioning model + one-click rollback + staged deployment
- [x] Operator quick-start guide + troubleshooting guide
- [x] Pilot on-call rotation + response SLA (< 30 min Sev 1)

---

## P3 — Advisory Mode Value

### P3-A — Deterministic Replay & Audit
- [x] Failure Behavior Reference doc — `docs/p2/Failure_Test_Report_v1.md` (T1-T7 test matrix)
- [x] Formal replay coverage metrics — `docs/p3/Replay_Coverage_Metrics.md` (80% current, 95% target defined)

### P3-B — KPI / Financial Metrics
- [x] 💰 Planned vs. Unplanned Maintenance Ratio — `WOSource` flag on Work, migration 028, `/api/maintenance-kpis/planned-ratio`, corporate KPI tab
- [x] 💰 PM Compliance Rate — SchID-linked WO query, 3-day grace window, `/api/maintenance-kpis/pm-compliance`
- [x] 💰 Work Order Backlog Aging — 4-bucket aging (0-7/8-30/31-90/90+), `/api/maintenance-kpis/backlog-aging`
- [x] 💰 Downtime Cost Accumulation — `HourlyProductionValue` on Asset (migration 028), auto-calc on WO close in workOrders.js, `/api/maintenance-kpis/downtime-cost`

### P3-C — Operational Intelligence
- [x] Asset Criticality Matrix — 4-dimension scoring fields on Asset (migration 028), whitelisted in validators.js; `CriticalityScoreTotal` for sort/filter
- [x] 💰 Closed-Loop CAPA Tracking — `CorrectiveActions` table in logistics DB, `/api/capa` (GET/POST/PUT/DELETE/overdue), auto-escalate overdue on GET
- [x] 💰 Budget vs. Actual Maintenance Spend — `MaintenanceBudget` table in logistics DB, `/api/maintenance-budget` + `/variance` endpoint, corporate Maintenance KPIs tab

---

## P4 — Safety & Compliance Foundation

- [x] Permit to Work (PTW) — 13 permit types incl. COLD_WORK; digital approval workflow; simultaneous ops conflict detection (HTTP 409 on same asset+type); auto-expiry; full audit trail — `routes/safety_permits.js` + `routes/loto.js`; spec: `docs/p4/PTW_and_LOTO_Coverage.md`
- [x] Management of Change (MOC) — PROCESS/EQUIPMENT/PROCEDURE/TEMPORARY/EMERGENCY types; staged approval chain; PSSR flag; affected items linkback; full audit — `routes/moc.js` at `/api/moc`; design: `docs/p4/MOC_Design.md`
- [x] Training & Competency Management — cert registry with expiry; 24 default courses; compliance matrix; expiry alerts; corporate rollup — `routes/training.js`; WO enforcement spec: `docs/p4/Competency_WO_Enforcement_Spec.md`
- [x] Contractor Management — contractor registry; COI tracking + expiry alerts; safety induction records (`contractor_inductions` table + routes); WO job history — `routes/contractors.js`

---

## P5 — Growth & Revenue

- [x] 💰 Quality Control (QA) Module — NCR lifecycle, defect code library (10 defaults), Pareto, First-Pass Yield, inspection checksheets — `routes/qc.js` at `/api/qc`
- [x] 💰 Operator Care (Autonomous Maintenance) — `InspectionRoutes` + `InspectionSteps` + `InspectionResults` + `InspectionSessions`; auto-WO on Fail — `routes/operator_care.js` at `/api/operator-care`
- [x] 💰 Shutdown / Turnaround Management — `TurnaroundProjects` + `TurnaroundTasks`; dependency chain, critical path, contractor assignment, budget vs. actual — `routes/turnaround.js` at `/api/turnaround`
- [x] 💰 Predictive Maintenance Engine — MTBF, risk ranking, 30/60/90-day forecast from WO history — `routes/predictive_maintenance.js`; Weibull spec: `docs/p5/Predictive_Maintenance_Spec.md`
- [x] 💰 Energy Sub-Metering & Intelligence — TOU engine, arbitrage, asset loads running in `routes/energy.js`; kWh/unit + hardware path: `docs/p5/Energy_Intelligence_Spec.md`

---

## P6 — Platform Maturity & Ecosystem

- [x] 💬 Certification & Compliance Packs — ISO 9001, ISO 45001, OSHA 300, FDA 21 CFR Part 11, IEC 62443; audit results, scorecard, gaps — `routes/compliance.js` at `/api/compliance`
- [x] 💬 Vibration & Condition Monitoring Analytics — `VibrationProfiles` + `VibrationReadings` + `VibrationAlerts`; ISO 10816 thresholds, auto-alerts, trending — `routes/vibration.js` at `/api/vibration`; FFT/bearing spec in docs
- [x] 💬 REST API Public Spec (OpenAPI 3.1) — `express-jsdoc-swagger` approach + incremental annotation plan — `docs/p6/OpenAPI_Spec.md`
- [x] 💬 OPC-UA Native Device Driver — full `node-opcua` implementation spec with data model, routes, and security — `docs/p6/OPC_UA_Driver_Spec.md`
- [x] 💬 ERP Connector Marketplace — `ERPConnectors` + `ERPFieldMappings` tables; catalog (SAP, Oracle, Dynamics 365, Infor, Custom); test-connection endpoint — `routes/erp_connectors.js` at `/api/erp-connectors`
- [x] 💬 Custom Report Builder — core query builder already running in `routes/reportBuilder.js`; CSV export added (`?format=csv`); scheduled delivery spec in OpenAPI doc
- [x] 💬 Native Mobile App (iOS / Android) — PWA already shipping; Capacitor shell spec with plugin list + MDM distribution path — `docs/p6/Mobile_App_Spec.md`
- [x] 💬 Digital Twin Integration — internal schematic DT running in `routes/digitalTwin.js`; external platform sync architecture (Azure DT, AWS TwinMaker, Bentley) — `docs/p6/Digital_Twin_Integration_Spec.md`

---

## P7 — Category-Defining Capabilities

- [x] 💬 🥇 Deterministic Time Machine — state rollback to any point T-X + branching simulation; answers "what if we hadn't done X at 14:32?" — architecture spec: `docs/p7/Time_Machine_Spec.md`; data infrastructure live; shadow DB + UI scrubber are next build milestone
- [x] 💬 🥈 Safe Action Certification Layer — Gatekeeper routes every write through Parallel Universe simulation before execution; returns certified-safe or blocked-with-explanation + proof receipt — spec: `docs/p3/Parallel_Universe_Spec.md`; requires Gatekeeper + PLC state mirror (P2 follow-on)
- [x] 💬 🥉 Explainable Operations Engine — machine-generated causality chain from unified event log; plain-language root cause with evidence, not guesswork — live at `/api/causality` (`routes/causality.js`); queries Work, WorkSegments, RCA, CAPA, Vibration, MOC across IT↔OT boundary
- [x] 💬 Plant Behavioral Baseline Engine — deterministic per-asset baselines; drift detection + efficiency loss surfacing without black-box ML — live at `/api/baseline` (`routes/baseline_engine.js`); MTBF, failure freq, labor/cost drift; cached in `AssetBaselines` table
- [x] 💬 Cross-System Causality Graph — IT↔OT boundary crossing; ERP decisions → schedule shifts → machine telemetry in one connected graph — covered by `/api/causality`; ERP outbox events included as `ERP_SYNC` event type
- [x] 💬 Failure Containment Scoring — live blast-radius meter (🟢 isolated / 🟡 partial / 🔴 cascading) continuously updated on Mission Control — live at `/api/containment` (`routes/containment.js`); 5-factor scoring; dashboard + blast-radius endpoints
- [x] 💬 Operator Trust Layer — every recommendation shows confidence + plain-language explanation + past outcome history; operator approval/rejection feeds back into the system — architecture spec: `docs/p7/Operator_Trust_Layer_Spec.md`; data infrastructure live (vibration, baselines, RCA, predictive); OperatorDecisions table + UI cards are next build milestone

---

## P8 — LAN Peer Sync (Offline Multi-Device Resilience)
**Goal:** When the central server is down, PWA scanners and the Electron desktop at the same plant see each other's work in real time — no data siloed on individual devices.

| # | Task | Status | Depends On |
|---|------|--------|-----------|
| 1 | Design LAN peer discovery protocol | ✅ Done | — |
| 2 | Build plant-local sync server (LAN hub) in Electron | ✅ Done | #1 |
| 3 | Add LAN hub discovery to PWA client | ✅ Done | #2 |
| 4 | Sync hub state back to central server on reconnect | ✅ Done | #2, #3 |
| 5 | Real-time WO state push from hub to all plant devices | ✅ Done | #2, #3 |
| 6 | Handle hub conflict resolution (dual WO auto-create) | ✅ Done | #5 |
| 7 | Show live plant-device presence in Mission Control | ✅ Done | #2, #3 |
| 8 | Security — authenticate devices on the LAN hub | ✅ Done | #2 |
| 9 | Playwright E2E tests for offline LAN sync scenarios | 🔵 Planned | #1–#8 |

### Task Details

**#1 — Design LAN peer discovery protocol**
Define how devices find each other without the central server. Options: mDNS/Bonjour (zero-config, may be blocked on corporate WiFi), fixed plant hub IP (simple, one-time setup per plant), or hybrid (try mDNS, fall back to configured IP). **Recommendation: Hybrid.** Deliverables: chosen transport, port (proposed: 1940), WebSocket message schema, device registration handshake spec.

**#2 — Build plant-local sync server (LAN hub)**
Lightweight WebSocket broadcast server inside the Electron desktop app. Activates automatically when central server is unreachable. Handles: device registration, scan event broadcast, WO state broadcast. Stores received events in local SQLite (OfflineScanQueue table already exists). Files: `electron/main.js`, `server/lan_hub.js` (new).

**#3 — Add LAN hub discovery to PWA client**
After central server confirmed unreachable, discover and connect to hub via WebSocket. On connect, replay IndexedDB sync queue to hub immediately. New scans go to hub in real time, still queued locally as backup. Files: `src/utils/LanHub.js` (new), `src/main.jsx`, `src/utils/OfflineDB.js`.

**#4 — Sync hub state back to central server on reconnect**
Hub replays all collected scans to server when connectivity restores. Preserve order by `deviceTimestamp`. Uses existing `POST /api/scan/offline-sync` (idempotency via `scanId` already handled). Surfaces conflicts in Mission Control review queue. Notifies all PWA clients to switch back to central server. Files: `server/lan_hub.js`, `server/routes/scan.js`.

**#5 — Real-time WO state push from hub to all plant devices**
Hub broadcasts `WO_STATE_CHANGED` event after processing any scan. PWA receives and surgically updates IndexedDB `work_orders` + `work_segments` in place — no full cache refresh needed. `predictBranch()` uses the updated data immediately. Files: `src/utils/LanHub.js`, `src/utils/OfflineDB.js` (add `updateWorkOrder()` + `updateSegment()` patch helpers).

**#6 — Handle hub conflict resolution (dual WO auto-create)**
Race condition: two devices scan same asset before either gets the other's broadcast. Hub detects second auto-create for same `assetId`, applies Auto-Join logic locally (mirrors `server/routes/scan.js` lines 687–702), merges WOs, flags `conflictAutoResolved = 1` for supervisor review, broadcasts merged state to all devices. Files: `server/lan_hub.js`, possibly extract Auto-Join into shared utility.

**#7 — Show live plant-device presence in Mission Control**
"Plant Network" panel showing: central server status, LAN hub status, per-device connectivity (server / hub / isolated) with last-seen timestamp. Updates in real time via hub WebSocket. Reuse OfflineStatusBar visual style. Files: `src/components/MissionControl.jsx`, `src/components/PlantNetworkStatus.jsx` (new), `server/lan_hub.js`.

**#8 — Security — authenticate devices on the LAN hub**
Devices present JWT on WebSocket upgrade. Hub validates before accepting connection — invalid/expired token → 401 refused. JWT secret already in Electron `config.json`, shared to PWA clients at login. Prevents rogue devices on plant WiFi from injecting scan events. Files: `server/lan_hub.js`, `server/routes/auth.js`.

**#9 — Playwright E2E tests for offline LAN sync scenarios**
Scenarios: (1) PWA finds hub when central server down, (2) scan on PWA appears on desktop within 2s, (3) two PWAs scan same asset — conflict surfaced in review queue, (4) central server returns — hub replays without duplicates, (5) hub goes down — PWA falls back to IndexedDB gracefully, (6) expired JWT rejected by hub.

---

## P9 — Offline Resilience Hardening (Edge Case Fixes)
**Goal:** Close every gap identified in `Edge Cases.md` that could stop a plant from functioning when the central server is unreachable. Ordered by priority — fix C-items before M-items.

| # | ID | Task | Status | File(s) |
|---|----|------|--------|---------|
| 1 | C2 | Login timeout + offline login path | ✅ Done | `src/components/LoginView.jsx` |
| 2 | C1 | Hub token expiry check + amber banner | ✅ Done | `src/utils/LanHub.js`, `src/components/OfflineStatusBar.jsx` |
| 3 | C6 | Block second AUTO_CREATE on hub (30s window) | ✅ Done | `server/lan_hub.js` |
| 4 | C4 | Asset lookup offline fallback to IndexedDB | ✅ Done | `src/App.jsx` |
| 5 | C8 | Save scan session on submit start, not just on response | ✅ Done | `src/components/ScannerWorkspace.jsx`, `src/components/ScanCapture.jsx` |
| 6 | C3 | Offline auth validation (HMAC of userId + plantId) | ✅ Done | `src/App.jsx`, `src/components/LoginView.jsx` |
| 7 | C5 | Patch work_segments cache on WO_STATE_CHANGED events | ✅ Done | `src/utils/LanHub.js`, `src/utils/OfflineDB.js` |
| 8 | M3 | Surface sync conflicts to user after queue replay | ✅ Done | `src/utils/OfflineDB.js`, `src/components/OfflineStatusBar.jsx` |
| 9 | C7 | Hub/device queue deduplication on reconnect | ✅ Done | `server/lan_hub.js`, `src/utils/LanHub.js` |
| 10 | M1 | Mark hub-submitted scans in IndexedDB to prevent double-replay | ✅ Done | `src/main.jsx`, `src/utils/OfflineDB.js` |
| 11 | M2 | Cache status ID table at login; remove hardcoded [30, 20] | ✅ Done | `src/utils/OfflineDB.js`, `server/routes/scan.js` |
| 12 | M6 | Show cache staleness timestamp on Mission Control | ✅ Done | `src/components/PlantNetworkStatus.jsx`, `src/utils/OfflineDB.js` |

### Task Details

**#1 (C2) — Login timeout + offline login path**
Add 3-second `AbortController` timeout to `POST /api/auth/login`. On timeout/failure, check localStorage for a stored credential hash for that username. If found and password matches, allow offline login with persistent amber banner: *"Offline mode — scans will sync when server returns."* Store bcrypt hash of password at each successful login (never store plaintext). Files: `src/components/LoginView.jsx`.

**#2 (C1) — Hub token expiry check**
Before calling `submitScan()`, decode the `hubToken` JWT from localStorage and check the `exp` claim. If expired (or within 5 minutes of expiry), skip hub submission and fall back to IndexedDB-only queue. Show amber banner in `OfflineStatusBar`: *"Hub unavailable — scanning in local-only mode."* Files: `src/utils/LanHub.js`.

**#3 (C6) — Block second AUTO_CREATE on hub**
In `lan_hub.js`, when a `SCAN` message arrives with a predicted `AUTO_CREATE_WO` branch, query `OfflineScanQueue` for any `PENDING` entry with the same `assetId` created within the last 30 seconds. If found, reject with `SCAN_ACK` error: *"Another technician is creating a work order for this asset — tap Join instead."* Files: `server/lan_hub.js`.

**#4 (C4) — Asset lookup offline fallback**
In `src/App.jsx` barcode handler, wrap the `fetch('/api/assets/...')` call with a 2-second timeout. On failure, fall back to `OfflineDB.getAll('assets')` and search by asset ID/code. If found in cache, proceed normally. If not found anywhere, show modal: *"Asset not found in offline cache — verify the barcode and try again."* Files: `src/App.jsx`, `src/utils/OfflineDB.js`.

✅ **#5 (C8) — Save scan session on submit start**
In `ScanCapture.jsx`, write `{ step: 'submitting', pendingAssetId, submittedAt }` to IndexedDB meta as soon as submission begins (before the fetch). In `ScannerWorkspace.jsx`, on mount check for a `submitting` session less than 60 seconds old and show resume prompt: *"Your last scan may not have completed — check status or re-scan?"* Files: `src/components/ScannerWorkspace.jsx`, `src/components/ScanCapture.jsx`.

✅ **#6 (C3) — Offline auth validation**
At each successful login, store `HMAC(userId + nativePlantId, deviceSecret)` in localStorage where `deviceSecret` is a random key generated once per device and stored in IndexedDB. On offline auth fallback in `App.jsx`, verify this HMAC rather than just checking key existence. Files: `src/App.jsx`, `src/components/LoginView.jsx`, `src/utils/OfflineDB.js`.

✅ **#7 (C5) — Patch work_segments on WO_STATE_CHANGED**
`LanHub._updateLocalCache()` currently patches `work_orders` only. Extend it to also update `work_segments` in IndexedDB when a `WO_STATE_CHANGED` event arrives — mark the relevant segment's state as `Closed` when branch is `CLOSE_WO` or `DESK_CLOSE`. Files: `src/utils/LanHub.js`, `src/utils/OfflineDB.js`.

✅ **#8 (M3) — Surface sync conflicts after queue replay**
In `OfflineDB.replayQueue()` (or wherever offline-sync results are processed), collect any `409 CONFLICT` or error responses. After all replays complete, if failures exist push a notification to `OfflineStatusBar`: *"2 offline scans had conflicts — tap to review."* Link to a modal listing failed scan IDs and server error messages. Files: `src/utils/OfflineDB.js`, `src/components/OfflineStatusBar.jsx`.

✅ **#9 (C7) — Hub/device queue deduplication on reconnect**
When a PWA reconnects to the hub, it should send its list of pending `scanId` values. Hub cross-checks against `OfflineScanQueue` and marks any matching entries so they are not double-replayed when the server returns. Server already deduplicates on `scanId`, but this prevents duplicate 409 noise. Files: `server/lan_hub.js`, `src/utils/LanHub.js`.

✅ **#10 (M1) — Mark hub-submitted scans in IndexedDB**
After `LanHub.submitScan()` returns `true`, update the corresponding IndexedDB `sync_queue` entry's status to `'hub-submitted'`. The normal offline-sync replay path should skip entries with this status, preventing the same scan being sent twice (once via hub, once via `/api/scan/offline-sync`). Files: `src/main.jsx`, `src/utils/OfflineDB.js`.

✅ **#11 (M2) — Cache status ID table; remove hardcoded status codes**
Add `GET /api/config/statuses` endpoint returning the WorkStatus lookup table. Cache it in IndexedDB at login as `meta.statusMap`. Replace hardcoded `[30, 20]` in `OfflineDB.predictBranch()` and `lan_hub.js` with values resolved from this cache. Files: `src/utils/OfflineDB.js`, `server/lan_hub.js`, `server/routes/` (new endpoint).

✅ **#12 (M6) — Show cache staleness in Plant Network panel**
Track `lastSuccessfulRefresh` timestamp in `OfflineDB` meta. In `PlantNetworkStatus.jsx`, display *"Offline data last updated Xh ago"* when the last refresh was more than 30 minutes ago and the server is currently unreachable. Files: `src/components/PlantNetworkStatus.jsx`, `src/utils/OfflineDB.js`.
