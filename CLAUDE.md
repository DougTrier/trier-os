# Trier OS — Claude Code Guide

This file is the primary reference for AI-assisted development on Trier OS.
Read this before writing any code. It overrides general defaults.

---

## What Trier OS Is

Trier OS is an enterprise Industrial Operating System for manufacturing and industrial
plant operations. It covers work order management, asset management, safety (PTW/MOC/LOTO),
predictive maintenance, quality control, training, contractor management, energy monitoring,
compliance, and corporate analytics.

It is not a SaaS product. It is deployed once at corporate headquarters. All plants connect
to that single instance. Everything is cross-searchable by design.

---

## Deployment Architecture

```
Corporate HQ
  └── Trier OS Server (single instance, all plants connect here)
        ├── trier_logistics.db   (cross-plant: auth, LOTO, safety permits, audit log)
        ├── corporate_master.db  (corporate-wide master data)
        ├── Plant_1.db           (Plant 1 scoped data)
        ├── Plant_2.db           (Plant 2 scoped data)
        └── schema_template.db   (template for new plant provisioning)

Each Plant (physical location)
  └── Electron Desktop App (installed on one local server per plant)
        └── LAN Hub (port 1940, WebSocket)
              ├── Keeps scan state alive when corporate is unreachable
              ├── Local plant .db file for offline reads
              └── Replays queued scans to POST /api/scan/offline-sync on reconnect
```

**Key facts:**
- One corporate server instance, not per-plant instances
- Plants do NOT run their own Trier OS server — they connect to corporate
- The LAN Hub (port 1940) is a lightweight fallback only: scan state + local DB reads
- HA replication (ha_sync.js) pushes to a secondary; POST /api/ha/promote for failover
- All cross-plant data (LOTO, safety permits, global audit trail) lives in trier_logistics.db

---

## Database Pattern

Trier OS uses SQLite (better-sqlite3) with a multi-database architecture.

### Per-plant databases
Routes access the correct plant DB through AsyncLocalStorage context — never hardcode a
plant DB path or pass plantId directly to getDb() from req.body.

```js
// Correct — context is set by middleware, getDb() resolves automatically
const db = require('../database');
const rows = db().prepare('SELECT * FROM Assets').all();

// Wrong — never do this
const db = require('better-sqlite3')(`data/${req.body.plantId}.db`);
```

The db() call resolves to the plant SQLite file for the authenticated user's current plant.
The `x-plant-id` request header (set by the frontend) is validated by middleware and
stored in AsyncLocalStorage before any route handler runs.

### Cross-plant database (trier_logistics.db)
Data that must be visible across all plants uses trier_logistics.db via logistics_db.js.
Examples: LOTO permits, safety incidents, contractor records, audit trail, API keys.

```js
const logisticsDb = require('../logistics_db');
const permits = logisticsDb().prepare('SELECT * FROM SafetyPermits WHERE PlantID = ?').all(plantId);
```

### Auth database (auth_db.sqlite)
User accounts, roles, and JWT management only. Never mix operational data into auth_db.

### Migrations
- All schema changes go through numbered migrations in server/migrations/
- Never modify an existing migration file — always create a new one
- Migration files are named NNN_description.js (e.g. 029_add_criticality_score.js)
- The migrator runs all pending migrations in numeric order on startup

---

## Security Rules

All security rules are in server/standards.md. The most critical:

- **S-1:** Validate plantId at route boundary with SAFE_PLANT_ID regex before getDb()
- **S-2:** Use req.user.Username (capital U) — lowercase is always undefined
- **S-4:** Parameterized queries only — no template literal SQL interpolation
- **S-11:** Idempotency enforced at DB layer (UNIQUE INDEX), not just app-layer pre-check
- **S-12:** Collision-resistant identifiers — Date.now() alone is not unique

Read server/standards.md in full before writing any route that touches external input.

---

## File Header Standard

Every .js, .jsx, and .css file must begin with the standard header. No exceptions.
See CONTRIBUTING.md for the exact format.

Minimum required:
1. Copyright line: `// Copyright © 2026 Trier OS. All Rights Reserved.`
2. Module title and description
3. All exposed API routes (for server files) or API dependencies (for client files)

---

## Route Conventions

### Adding a new route file
1. Create server/routes/your_feature.js with full header
2. Export a function that receives db: `module.exports = function(db) { ... }`
3. Mount in server/index.js: `app.use('/api/your-feature', require('./routes/your_feature')(db))`
4. Add appropriate auth middleware: most routes use `authMiddleware` before the router

### Input validation
- All req.body fields that go into SQL must pass through validators.js whitelist()
- plantId from any client source must match SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/
- userId for audit trails must come from req.user.UserID (JWT), never req.body

### Response format
Routes return JSON. Errors follow: `{ error: 'Human-readable message' }` with appropriate
HTTP status. Success responses return the data directly or `{ success: true, ... }`.

---

## The Zero-Keystroke Contract

The scan flow (scan a QR tag on a machine) must require zero keyboard input from the tech.
This is a core product promise — every scan should resolve to a work order in one tap.

Never add a step to the scan flow that requires the tech to type anything. If a field is
required, it must be pre-populated from the asset record, the tech's profile, or the
work order context.

**Files that implement this contract:**
- server/routes/scan.js — the full scan state machine
- server/lan_hub.js — offline scan relay
- server/routes/scan.js POST /offline-sync — replay on reconnect

Do not modify the scan state machine without reading all three files and understanding
the full state graph (IDLE -> ACTIVE -> WAITING -> CLOSED/AUTO_CLOSED).

---

## Files That Must Not Be Modified Without Full Context

| File | Why |
|---|---|
| server/UNTOUCHABLE_dairy_master.js | Canonical dairy industry master data. Changes break master catalog seeding. |
| server/scan.js (state machine core) | Any change to state transitions must be validated against the full offline + replay + HA path |
| server/lan_hub.js | Touches concurrent scan state across multiple devices; race conditions are non-obvious |
| server/ha_sync.js | DB replication; a bug here causes silent primary/secondary divergence |
| server/migrations/ (existing files) | Never edit. Create a new numbered migration instead. |

---

## Key Patterns in the Codebase

### Soft deletes
Most tables use an IsDeleted or IsActive flag rather than hard DELETE. Check before adding
a new DELETE route — the pattern is almost always a soft delete.

### Audit trail
Write-path operations (create, update, close, approve) must write an audit record.
The audit log lives in trier_logistics.db (AuditLog table) for cross-plant visibility.
Use: `who = req.user.Username`, `what = action description`, `when = new Date().toISOString()`

### Plant scoping
Every query against a per-plant DB is automatically scoped by the AsyncLocalStorage
context. For cross-plant queries (logistics_db), always filter by PlantID explicitly.

### Batch operations (Rule S-7)
HTTP 200 from a batch endpoint is a transport ACK, not semantic success.
Always inspect per-item result status. Only mark items complete if their individual
result succeeded.

---

## Frontend Architecture

- React (Vite build)
- Single-page app — all views are top-level components loaded by App.jsx
- Plant selection drives the x-plant-id header on every API call
- No Redux — local useState + useEffect patterns throughout
- Tailwind CSS for utility classes, custom CSS for complex component styles
- Monaco Editor embedded for Live Studio (disable in production via DISABLE_LIVE_STUDIO)

---

## Testing

- Playwright for E2E tests (tests/e2e/)
- Test against a running instance — no mocking the database
- Stop at first failure, fix root cause before re-running the full suite
- Ghost test accounts (ghost_tech, ghost_admin, ghost_exec) are available in dev only

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| JWT_SECRET | Yes (prod) | 64+ hex chars. Server exits if missing/weak in production |
| HUB_TOKEN_SECRET | Yes (prod) | 64+ hex chars, must differ from JWT_SECRET. Signs LAN hub tokens |
| NODE_ENV | Yes (prod) | Set to `production` to harden all security paths |
| HA_SYNC_KEY | If using HA | 64-char hex. Server-to-server replication auth |
| DISABLE_LIVE_STUDIO | Recommended (prod) | Strips Monaco IDE from API surface |
| DISABLE_LAN_CORS | Optional | Air-gapped/hardened deployments only |
| LAN_HUB_ENABLED | Dev/test | Force-start LAN hub outside Electron |

---

## Current Version

v3.6.1 — See CHANGELOG.md and ROADMAP.md for history.
Completed roadmaps and task lists archived in References/.
