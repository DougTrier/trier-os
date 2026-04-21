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
- [ ] 🟡 Silent Auto-Close Threshold — 12-hour cron timer on InProgress segments; raises `needsReview` flag; Mission Control queue already done, timer not yet running

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
| 2 | Build plant-local sync server (LAN hub) in Electron | 🔵 Planned | #1 |
| 3 | Add LAN hub discovery to PWA client | 🔵 Planned | #2 |
| 4 | Sync hub state back to central server on reconnect | 🔵 Planned | #2, #3 |
| 5 | Real-time WO state push from hub to all plant devices | 🔵 Planned | #2, #3 |
| 6 | Handle hub conflict resolution (dual WO auto-create) | 🔵 Planned | #5 |
| 7 | Show live plant-device presence in Mission Control | 🔵 Planned | #2, #3 |
| 8 | Security — authenticate devices on the LAN hub | 🔵 Planned | #2 |
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
