# Trier OS — Active Task List

> This file is the source of truth for in-progress and planned work.
> Update status and notes here as tasks are completed.
> Created: 2026-04-09 | Last updated: 2026-04-09

---

## How to use this file

Each task includes:
- **Status** — `✅ Done` | `🔄 In Progress` | `⏳ Pending` | `🔒 Blocked`
- **Where** — exact files and line numbers affected
- **How** — implementation approach (enough context to start without reading the full codebase)
- **Depends on** — prerequisite tasks that must be done first

---

## Completed

### ✅ Task 1 — SCADA/PLC EdgeAgent Pull Worker (Phase 1)
Built the full Modbus TCP integration pipeline:
- `server/integrations/modbus-simulator.js` — 16-register TCP simulator on configurable port
- `server/integrations/modbus-client.js` — FC03 holding register reader
- `server/integrations/edge-agent.js` — polling worker, writes SensorReadings to plant DB
- `server/integrations/integration-manager.js` — singleton worker lifecycle manager
- `server/routes/plant_setup.js` — ApiIntegrationsTab endpoints (toggle simulator, start/stop worker)
- `src/components/PlantSetupView.jsx` — API Integrations tab with live status polling
- `server/test-integrations.js` — 41-assertion end-to-end test (run: `node server/test-integrations.js`)

### ✅ Task 4 — Device Registry (PLC/SCADA onboarding)
Full OT device onboarding pipeline with corporate analytics auto-wiring:
- `server/integrations/arp-scanner.js` — MAC→IP resolution via `arp -a`, optional /24 ping sweep
- `server/services/metric-rollup.js` — aggregates SensorReadings → PlantMetricSummary at 8am & 3pm
- `server/routes/device-registry.js` — CRUD + ARP probe + Modbus probe + worker start/stop
- `server/routes/plant_setup.js` — PlantDevices + DeviceMetricMap DDL added to initPlantSetupTables()
- `server/master_index.js` — PlantMetricSummary table added to corporate_master.db
- `server/routes/corporate-analytics.js` — /equipment-intelligence + /sync endpoints
- `server/index.js` — /api/devices mounted; 8am/3pm metric rollup cron added
- `src/components/DeviceRegistryTab.jsx` — 5-step wizard + device card list
- `src/components/EquipmentIntelligenceSection.jsx` — KPI grid + per-plant table + Sync Now
- `src/components/PlantSetupView.jsx` — Devices tab added (tab id: 'devices')
- `src/components/CorporateAnalyticsView.jsx` — Equipment Intel nav section added

### ✅ Task 5 — Lightweight Edge Agent
See Task 1 — delivered together.

---

## Up Next (execute in this order)

### ✅ Task 7 — Wire LDAP Login Validation into Auth Flow
Already complete from prior session — `attemptLdapAuth()` at `server/routes/auth.js:263`, full LDAP-first
flow with local fallback, auto user creation, and protected-account bypass at lines 73–107.

### ✅ Task 8 — Sensor Threshold Crossing → Auto Work Order
Already complete from prior session — `createAutoWorkOrder()` at `server/routes/sensors.js:381`,
called from ingest handler at line 287. Full cooldown guard, duplicate open-WO check, webhook dispatch,
and audit trail included.

### ✅ Task 9 — Supply Chain Corporate "All Sites" Rollup
- `server/routes/supply-chain.js` — added `GET /all-sites` endpoint (lines ~598–695):
  sweeps all plant DBs via `getAllSupplyChainDbs()`, aggregates open POs, overdue POs, inventory value,
  MTD spend, per-vendor open spend; 15-minute in-memory cache
- `src/components/SupplyChainView.jsx` — replaced "Select a Plant" placeholder with `<AllSitesView>`
  component: 4-KPI row, per-plant table (inv value, MTD spend, open POs, overdue), top-10 vendor table
- `src/i18n/en.json` — 14 new `supplyChain.allSites.*` keys; machine-translated to 10 languages

### ✅ Task 6 — Enable Access DB and SQL Server Imports
**Effort:** ~30 minutes
**Priority:** High (unblocks LDAP task below)

**Where:**
- `server/routes/import_engine.js` lines 71–99 — conditional requires already written,
  just log warnings if packages missing. Code path is fully implemented.

**How:**
```bash
npm install mdb-reader mssql
```
Then verify the three boot warnings no longer appear:
- `⚠️ mdb-reader not available — Access imports disabled`
- `⚠️ OLEDB driver not available — .accdb files unsupported`
- `⚠️ mssql not available — SQL Server imports disabled`

No code changes needed — the import paths activate automatically once packages are installed.
Add `mdb-reader` and `mssql` to `package.json` dependencies if not already present.

**Depends on:** Nothing

---

### ✅ Task 7 — Wire LDAP Login Validation into Auth Flow
**Effort:** ~3 hours
**Priority:** High (enterprise customers on Active Directory need this)

**Where:**
- `server/routes/auth.js` around line 73 — the POST /login handler
- `server/routes/ldap.js` — LDAP config + sync already implemented
- `server/auth_db.js` — LDAPConfig table exists with host, port, bindDN, baseDN, useTLS fields

**How:**
1. In the login handler, after receiving `{ username, password }`, check if an LDAPConfig row
   exists for this plant/org with `enabled = 1`.
2. If yes, attempt `ldap.bind(userDN, password)` using the `ldapjs` package (already in package.json).
3. On LDAP success → issue JWT as normal (skip bcrypt check).
4. On LDAP failure → fall through to local user lookup (graceful degradation).
5. On no LDAP config → existing local-only path unchanged.

Pattern to follow: `server/routes/ldap.js` already shows how to construct the ldapjs client.

**Depends on:** Task 6 (install step confirms environment is healthy)

---

### ✅ Task 8 — Sensor Threshold Crossing → Auto Work Order
**Effort:** ~4 hours
**Priority:** Medium (closes the SCADA→alert→WO loop)

**Where:**
- `server/routes/sensors.js` line 11 — scaffold exists with POST /ingest and threshold config
- `server/integrations/edge-agent.js` — already detects downtime increases and creates WOs
  (see the `_checkThresholds()` method around line 95) — reuse this exact pattern

**How:**
1. Add a `SensorThresholds` table (if not exists) in the plant DB:
   `TagName TEXT, Operator TEXT (gt/lt/eq), Value REAL, Severity TEXT, WOTitle TEXT`
2. In POST /api/sensors/ingest, after writing the reading, query SensorThresholds for this TagName.
3. If threshold crossed (and not already an open WO for this tag+threshold within last 24h),
   INSERT into Work table: `{ Title, Priority, Status:'Pending', Source:'sensor-alert', TagName }`
4. Return `{ stored: true, alertFired: true/false }` in the response.
5. Add threshold config UI in the API Integrations tab (simple add/remove threshold rows).

**Depends on:** Task 7

---

### ✅ Task 2 — ERP Pull Sync Worker (HTTP/REST EdgeAgent)
**Effort:** ~4 hours
**Priority:** High

**Where (new files):**
- `server/integrations/http-edge-agent.js` — new class, mirrors edge-agent.js but over HTTP
- `server/routes/plant_setup.js` — extend ApiIntegrationsTab endpoints for ERP worker controls

**Where (existing files to modify):**
- `server/integrations/integration-manager.js` — already supports multiple workers; just needs
  to accept `type: 'http'` in startWorker() and instantiate HttpEdgeAgent instead of EdgeAgent

**How:**
```
HttpEdgeAgent:
  constructor(plantId, integrationId, { baseUrl, authType, apiKey, bearerToken,
               basicUser, basicPass, pollIntervalSeconds, endpoints })
  poll() → fetch(baseUrl + endpoints.workOrders) → normalize → upsert into plant DB
  Supported endpoints map: { workOrders, parts, inventory, employees }
  Each endpoint config: { path, method, bodyTemplate, responseMap }
  responseMap: array of { srcField, destTable, destColumn } mappings
```

Response normalization: map ERP field names to Trier OS schema
(e.g. SAP `AUFNR` → `WorkOrderNumber`, Oracle `WO_NUM` → `WorkOrderNumber`)

Add an ERP preset selector in the UI: SAP / Oracle / Dynamics 365 / Generic REST
Each preset pre-fills the endpoint paths and field mappings.

**Depends on:** Nothing (independent of Tasks 6-8)

---

### ✅ Task 3 — ERP/SCADA Write-back Outbox Worker
**Effort:** ~3 hours
**Priority:** Medium

**Where (new files):**
- `server/services/erp-outbox.js` — queue drain worker with retry + backoff
- `server/routes/integrations-outbox.js` — GET /api/integrations/outbox (status + history)

**Where (existing files to modify):**
- `server/routes/workOrders.js` — on WO status → 'Completed', insert outbox record
- `server/routes/parts.js` — on part consumption (PUT /consume), insert outbox record
- `server/index.js` — mount outbox route; start drain worker on boot

**How:**
```
ERPOutbox table (in trier_logistics.db):
  ID, PlantID, IntegrationID, EventType (wo_close/part_consume/labor_post),
  Payload TEXT (JSON), Status (pending/sent/failed), Attempts INT,
  NextRetryAt TEXT, CreatedAt TEXT, SentAt TEXT

Drain worker (runs every 60s):
  SELECT pending rows where NextRetryAt <= now()
  For each: POST to ERP endpoint (from PlantIntegrations config)
  On 200: mark sent
  On failure: increment Attempts, set NextRetryAt = now + (2^Attempts * 60s)
  Give up after 5 attempts → mark failed, log
```

**Depends on:** Task 2 (need HTTP connection/auth established first)

---

### ✅ Task 9 — Supply Chain Corporate "All Sites" Rollup
**Effort:** ~6 hours
**Priority:** Medium (independent — can be done any time)

**Where:**
- `server/routes/supply-chain.js` line 270 — returns `{ stub: true }` for `plantId = 'all_sites'`
- Pattern to follow: `server/routes/corporate-analytics.js` `getAllPlantDbs()` function —
  opens every *.db in the data directory, validates it has the right tables, sweeps data

**How:**
1. Replace the stub with a `getAllPlantDbs()` sweep (copy pattern from corporate-analytics.js).
2. For each plant DB, query: open POs, vendor spend MTD, overdue orders, parts on order.
3. Aggregate into: `{ vendors: [], topSpend: [], openOrders: int, overdueOrders: int,
   spendByPlant: [], spendByVendor: [] }`
4. Cache result in memory for 15 minutes (same pattern as crawl_engine.js).
5. Wire into the Supply Chain view's "All Sites" tab.

**Depends on:** Nothing

---

## Architecture Quick Reference

### Key patterns used throughout the codebase

**Multi-tenant DB routing:**
Every API request carries `x-plant-id` header → routes to `data/{plantId}.db`

**Worker lifecycle:**
`integration-manager.js` singleton → `startWorker(plantId, integrationId, opts)` / `stopWorker()`
One EdgeAgent instance per plant × integration. Status via `getWorkerStatus()`.

**Corporate rollup pattern:**
`getAllPlantDbs()` in corporate-analytics.js → opens each *.db readonly → sweeps → aggregates
Excludes: corporate_master.db, trier_logistics.db, examples.db, schema_template.db

**i18n:**
All user-visible strings: `t('namespace.key', 'English fallback')`
Add new keys to `src/i18n/en.json` then run `node src/i18n/auto_translate_dictionary.js es fr de zh pt ja ko ar hi tr`

**Auth:**
JWT in `Authorization: Bearer <token>` header. Secret in `.env JWT_SECRET`.
`server/middleware/auth.js` validates on all `/api/*` routes except `/api/auth/*` and `/api/enrollment`.

**File/code standards (CONTRIBUTING.md):**
- Line 1: `// Copyright © 2026 Trier OS. All Rights Reserved.`
- JSDoc header block with description, endpoint list (routes), or component description (components)
- Section dividers: `// ── Section Name ─────────────...`
- ~12% comment density (Contextual Density Ratio)
