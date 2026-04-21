# Changelog

All notable changes to Trier OS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.4.1] — 2026-04-21 — Offline Resilience, LAN Peer Sync & Silent Auto-Close

### P8 — LAN Peer Sync (Offline Multi-Device Resilience)

Full plant-local device sync when the central server is unreachable. All 9 tasks complete.

- **LAN Hub** (`server/lan_hub.js`) — Lightweight WebSocket server on port 1940, auto-activated when the central server goes down. Stores scans in local SQLite, broadcasts `WO_STATE_CHANGED` to all connected devices in real time.
- **PWA Client** (`src/utils/LanHub.js`) — Auto-discovers and connects to the hub. Replays IndexedDB queue to hub on connect; PING/PONG keepalive every 20s; exponential reconnect backoff (max 10 attempts).
- **Hub Replay** — On server return, hub replays full queue to central server preserving `deviceTimestamp` order. `SERVER_ONLINE` broadcast disconnects all PWA clients from hub gracefully.
- **JWT Authentication** — Hub validates token on WebSocket upgrade; invalid/expired tokens refused with code 1008. Tokens distributed at login with 7-day lifetime matching session cookie.
- **Conflict Resolution** — Second `AUTO_CREATE_WO` for same `assetId` within 30s is blocked at hub; rejected with `SCAN_ACK` error; `conflictAutoResolved=1` flagged in review queue.
- **`SYNC_PENDING` / `SYNC_ACK` Protocol** — PWA declares owned `scanId`s on reconnect; hub marks matching entries `DEDUP_CLIENT`; prevents double-replay 409 noise.
- **Plant Network Status Panel** (`src/components/PlantNetworkStatus.jsx`) — Live Mission Control widget: central server status, LAN hub status, port, per-device presence with connect times. Cache staleness badge (amber, >30 min) when server is down.

### P9 — Offline Resilience Hardening (12 Edge Cases)

- **C3 — HMAC Offline Auth** — Device-bound HMAC-SHA-256 signs user profile at login (32-byte secret in IndexedDB, never localStorage). Tampered credentials refused at offline login.
- **C8 — Scan Session Persistence** — Crash-recovery checkpoint written to IndexedDB before fetch; resume prompt on next launch for in-flight scans < 60s old.
- **C7 — Hub/Device Dedup** — Client marks hub-submitted entries in IndexedDB; `replayQueue()` skips them; `clearHubSubmitted()` called on `SERVER_ONLINE`. No scan sent twice.
- **C5 — WorkSegments Patch** — `LanHub._updateLocalCache()` closes active segments in IndexedDB on `CLOSE_WO`/`DESK_CLOSE`/`ROUTE_TO_WAITING_WO` branches so `predictBranch()` stays accurate offline.
- **C1 — Hub Token Expiry UX** — Client-side exp check before WebSocket open; `tokenExpired` event fires; OfflineStatusBar shows "Hub unavailable — local queue only" chip.
- **M3 — Sync Error Review Panel** — Failed replay scans persisted to IndexedDB `meta.syncErrors`; OfflineStatusBar "Review N issues" button; expandable panel with color-coded per-asset badges (amber = conflict, red = failure).
- **M2 — Status Map Caching** — `GET /api/config/statuses` endpoint; status IDs cached in IndexedDB at login; `predictBranch()` and hub's `predictBranch()` both use DB-driven IDs, no hardcoded values.
- **M6 — Cache Staleness Badge** — `PlantNetworkStatus` reads `OfflineDB.getMeta('lastSync')`; shows amber badge when offline + data > 30 min old.
- **C4, C2, C6, M1** — Asset lookup offline fallback, login timeout path, hub 30s duplicate block, hub-submitted IndexedDB marker.

### P1 — Silent Auto-Close Threshold (Complete)

- **`server/silent_close_engine.js`** — Hourly cron iterates all plant DBs; finds `Active` WorkSegments older than `autoReviewThresholdHours` (default 12h); closes as `TimedOut`; sets `needsReview=1 / reviewReason='SILENT_AUTO_CLOSE' / reviewStatus='FLAGGED'` on parent WO. Exempt hold reasons (`WAITING_ON_PARTS`, `WAITING_ON_VENDOR`, `WAITING_ON_APPROVAL`, `SCHEDULED_RETURN`) are skipped. Does not overwrite an existing `reviewReason`.

### Documentation

- **Part XXXIII — Offline Resilience & Plant LAN Sync** added to the Operational Intelligence Manual (6 subsections, 26 items covering hub architecture, zero-loss queue, JWT auth, conflict resolution, silent auto-close, cache staleness).
- All 11 i18n files updated with new `manual.s34.*` / `manual.sub.167–172` / `manual.item.1597–1622` keys.
- Playwright E2E suite (`tests/e2e/offline-lan-sync.spec.js`): 6 scenarios using `routeWebSocket()` mocking — hub connect, 2s timing, conflict queue, dedup, IndexedDB fallback, expired JWT.

### Build

- Version bumped 3.4.0 → 3.4.1 across package.json, AboutView.jsx, all i18n files, build scripts, and QA checklist.
- Artifacts: `TrierOS-Setup-3.4.1.exe` (NSIS), `TrierOS-Setup-3.4.1.msi`, `TrierOS-Setup-3.4.1.zip` — all code-signed.

---

## [3.3.0] — 2026-04-09 — Initial Open Source Release

This is the first public open-source release of **Trier OS**, an enterprise-grade, full-stack
Plant Operations Platform built for industrial manufacturing and processing facilities.

### Core Modules

- **Mission Control** — Unified role-aware dashboard with shift handoff log, predictive risk alerts, and real-time KPI cards across all plants.
- **Asset Registry** — Full equipment registry with work order history, MTBF/MTTR tracking, floor plan pinning, and multi-site asset transfer.
- **Corporate Analytics** — Enterprise-wide GIS map with 200+ asset pins, OEE dashboard, labor analytics, predictive foresight engine, and budget forecaster.
- **Supply Chain** — Parts inventory, purchase order history, vendor management, network price intelligence, and OCR snap-to-add.
- **IT Department** — Software license tracking, hardware inventory, network infrastructure management, mobile device management, and financial depreciation.
- **Safety & Compliance** — LOTO permit system, incident tracking, near-miss reporting, JSA/JHA templates, OSHA log management, and calibration tracking.
- **Fleet & Truck Shop** — DOT-compliant vehicle registry, DVIR inspections, fuel tracking, tire management, and CDL certification records.
- **Engineering Excellence** — RCA (5-Why), FMEA with auto-calculated RPN scores, Repair-vs-Replace calculator, CapEx project tracking, and lubrication routes.
- **SOP & Methods Library** — Structured operating procedures with AI generation, version control, and asset-linked deployment.
- **Underwriter Portal** — Insurance risk scoring (0–100), safety incident log, calibration status, LOTO audit trail, and Evidence Packet print.
- **Report Center** — 40+ pre-built reports plus a drag-and-drop custom report builder with CSV export.
- **Sensor Gateway** — Real-time SCADA/IoT integration via MQTT and REST with threshold alerting and automatic work order generation.
- **Floor Plans** — DXF CAD import, LiDAR 3D scan import, Google Maps satellite paste, multi-layer pin placement, zone drawing, and emergency mode.
- **Live Studio IDE** — Embedded Monaco-based code editor allowing authorized Creators to modify, sandbox, and hot-reload the application from within the UI.

### Architecture

- **Multi-tenant SQLite sharding** — Each plant facility has its own independent `.db` file; no cross-tenant data leakage.
- **AsyncLocalStorage request pinning** — Every HTTP request is automatically routed to the correct plant database without shared mutable state.
- **Role-Based Access Control (RBAC)** — 8 roles: Technician, Mechanic, Engineer, Manager, IT Admin, Lab Tech, Corporate, Creator.
- **CD Key / Invite Code system** — Walled-garden onboarding; new users require a single-use invite code to register.
- **HTTPS by default** — Auto-detected LAN IP with self-signed cert; mobile camera/scanner requires HTTPS.
- **Offline PWA support** — Technicians continue working when the server is unreachable; auto-sync on reconnect.
- **Parallel Universe Engine** — Deterministic simulation that replays historical plant event logs against sandboxed code changes for mathematical proof of safety before deployment.
- **Frictional Cost Engine** — Static UX analyzer that calculates the financial wrench-time cost of UI changes before they are promoted to production.

### Internationalization

- Full UI translation across **11 languages**: English, German, Spanish, French, Japanese, Korean, Portuguese, Arabic, Hindi, Turkish, and Chinese (Simplified).

### Tech Stack

- **Frontend:** React 19, Vite, Vanilla CSS
- **Backend:** Node.js, Express
- **Database:** SQLite via `better-sqlite3` (one file per plant)
- **Auth:** bcrypt, JWT, AsyncLocalStorage session pinning
- **Maps:** Cesium (3D GIS), Leaflet (2D floor plans)
- **Scanner:** WebRTC camera API, ZXing barcode library
- **IDE:** Monaco Editor (VS Code engine)

### Known Limitations (v3.3.0)

- `corporate_master.db` is generated on each boot by the crawl engine — first-boot index build may take 30–60 seconds on large multi-site deployments.
- HTTPS certificate is self-signed — browsers will show a security warning on first visit (expected for LAN deployments).
- Sensor Gateway OPC-UA connections require network access to OT/PLC equipment; consult your IT/OT security team before enabling.

---

## [Unreleased]

- Open Collective fiscal sponsorship integration
- GitHub Sponsors button in About modal
- Automated seed script for demo org chart (one user per RBAC role)

---

*Trier OS is open-source software released under the MIT License.*  
*© 2026 Doug Trier. Maintained at [github.com/DougTrier/trier-os](https://github.com/DougTrier/trier-os)*
