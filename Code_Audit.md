# Trier OS — Full Code Audit
**Date:** 2026-04-21  
**Auditor:** Claude (Sonnet 4.6)  
**Scope:** All server-side logic files, middleware, engines, and utilities  
**Version audited:** v3.4.3  
**Mandate:** Document findings only. No code changes made.

---

## Executive Summary

The codebase is architecturally mature with strong fundamentals: parameterized queries throughout, RBAC enforced at the middleware level, HMAC-signed replay authentication (v3.4.3), TOTP 2FA, WAL mode on all databases, and a deterministic scan state machine. The audit found **two functional bugs that cause silent, unchecked failures** (both in background engines), **two architectural risks in cluster mode**, and several medium/low issues worth tracking. No evidence of SQL injection exposure in user-facing routes. Safety-critical workflows (LOTO, safety permits) have correct lifecycle enforcement.

---

## CRITICAL

### C-1 — PM Engine Duplicate-Check Bug Never Fires
**Files:** `server/pm_engine.js:88`, `server/pm_engine.js:164`

Both the time-based and meter-based PM engines attempt to prevent duplicate work order injection with a guard query:

```js
// Time-based (line 88)
const existingOpen = db.prepare(
    "SELECT 1 FROM Work WHERE Description LIKE ? AND StatusID < 40"
).get(`%[PM-AUTO] ?%`, [pm.Description]);

// Meter-based (line 164)
const existingOpen = db.prepare(
    "SELECT 1 FROM Work WHERE Description LIKE ? AND StatusID < 40"
).get(`%[PM-METER] ?%`, [pm.Description]);
```

**The bug:** `better-sqlite3`'s `.get()` takes positional bind arguments (`stmt.get(arg1, arg2)`), not an `(literal, array)` pair. Passing `[pm.Description]` as the second argument is silently ignored. The LIKE pattern evaluated is the literal string `%[PM-AUTO] ?%` — which will never match any real description.

**Impact:** The duplicate check always returns `undefined` (no match found). Every cron run injects PM work orders regardless of whether open ones already exist. On a plant with 50 scheduled PMs running an hourly cron for 30 days, this generates ~36,000 phantom WOs. This silently inflates the work order table, corrupts OEE metrics, and degrades database query performance.

**In cluster mode:** N workers × 1 cron each = N duplicate injections per hour.

---

### C-2 — VACUUM INTO Snapshot Never Executes (HA Sync)
**File:** `server/ha_sync.js:258`

The pre-replication snapshot block calls:

```js
plantDb.exec('VACUUM INTO ?', [snapshotFile])
```

**The bug:** `better-sqlite3`'s `.exec()` does not accept bind parameters. The correct API for parameterized statements is `.prepare(...).run(...)`. The `exec()` call with a bind array either silently discards the argument or throws (depending on better-sqlite3 version), but either way the `VACUUM INTO` never executes against the correct file path.

**Impact:** The pre-sync snapshot feature (described as a rollback mechanism in the code comment) has never worked. If a bad batch of replication entries corrupts a secondary plant database, there is no snapshot to roll back to. The false confidence in a non-existent safety net is the primary concern.

---

## HIGH

### H-1 — Cluster Mode: Every Worker Runs Independent Crons
**Files:** `server/cluster.js`, `server/pm_engine.js`, `server/silent_close_engine.js`, `server/routes/safety_permits.js`

The cluster spawns one worker per CPU core (capped at 8). Each worker independently registers:
- Hourly PM cron (`runPMCron`)
- Hourly silent auto-close cron (`runSilentCloseCron`)
- 5-minute safety permit expiry interval (`checkExpiredSafetyPermits`)

None of these are cluster-aware. An 8-core server runs 8 simultaneous PM injections and 8 simultaneous auto-close sweeps against the same SQLite WAL files every hour.

**SQLite WAL behavior:** WAL allows concurrent readers and one writer. The crons are writers. They don't deadlock (busy_timeout = 5s handles lock contention), but the serialization means 7 of the 8 workers block waiting, then each runs the same sweep again after the first one completes. This creates:
- Redundant and wasted I/O
- Compounded with C-1: 8× duplicate PM WO injection
- The silent close engine's transaction wrapping does prevent double-close of the same segment, but only because it re-reads state within the transaction. Performance cost is still 8× the intended work.

**Recommended fix (documentation only):** Cluster-mode crons should use a primary-worker election pattern (already partially in place with `global._preservedLeaders` — see H-2) or run crons in the primary process only using `cluster.isPrimary`.

---

### H-2 — `global._preservedLeaders` Does Not Cross Worker Boundaries
**File:** `server/database.js` (connection pool / leader preservation logic)

The code stores preserved HA leader state in `global._preservedLeaders`. In Node.js cluster mode, each worker is a separate process with separate memory. `global` in worker A is not shared with worker B.

**Impact:** If a worker resolves and preserves a plant's HA leader, that information is invisible to all other workers. Subsequent requests routed to a different worker will re-evaluate leader state from scratch. This can cause:
- Inconsistent leader routing for HA-enabled deployments
- Multiple workers independently claiming or promoting leaders
- HA sync instability under concurrent load

---

### H-3 — EXEMPT_HOLD_REASONS Dual Source of Truth
**Files:** `server/routes/scan.js:127–132`, `server/silent_close_engine.js` (EXEMPT_HOLD_REASONS Set)

The same set of hold reason codes that exempt a WO from auto-close timeout is defined independently in two places. The comment in `silent_close_engine.js` acknowledges this explicitly: "must manually mirror scan.js."

```js
// scan.js
const EXEMPT_HOLD_REASONS = new Set([
    'WAITING_ON_PARTS', 'WAITING_ON_VENDOR',
    'WAITING_ON_APPROVAL', 'SCHEDULED_RETURN',
]);

// silent_close_engine.js — separate definition
```

**Impact:** If a developer adds a new hold reason to `scan.js` that should be exempt (e.g., `AWAITING_INSPECTION`) and forgets to update `silent_close_engine.js`, the auto-close engine will silently close WOs that are legitimately on hold. This could interrupt in-progress safety-critical holds. The risk is latent now but increases with every new hold reason added.

---

## MEDIUM

### M-1 — `getDb()` Falls Back to Demo_Plant_1 Silently
**File:** `server/database.js`

When `AsyncLocalStorage` context is not set (i.e., a route handler does not go through the plant-binding middleware), `getDb()` falls back to the `Demo_Plant_1` database. This fallback is logged at debug level but is not an error.

**Impact:** Any route handler that calls `db.getDb()` without the middleware having run (middleware misconfiguration, a new route mounted at the wrong level, or a background job calling getDb without context) will read from and write to Demo_Plant_1 regardless of which plant the user is authorized for. In a multi-plant deployment this is a silent data-exposure and data-corruption risk. No current routes appear to be affected, but it is a silent failure mode rather than a hard error.

---

### M-2 — Ghost Test Accounts Seeded in All Deployments with Fixed Passwords
**File:** `server/auth_db.js:173+`

Three accounts (`ghost_tech`, `ghost_admin`, `ghost_exec`) are seeded idempotently on every server start with hardcoded plaintext passwords (`Trier3292!`, `Trier3652!`, `Trier7969!`). These exist for Playwright E2E test compatibility.

**Impact:** Every production deployment — including customer sites — contains three functional accounts with public-knowledge passwords. `ghost_admin` has `GlobalAccess=1` and `it_admin` role. A customer who does not know to delete these accounts has a permanent backdoor with global plant access. The demo accounts (`demo_tech`, etc.) are similarly fixed-password but are constrained to the `examples` plant only — lower blast radius.

**Recommended documentation note:** The production build process should document that ghost_* accounts must be manually removed before go-live, or the build script should conditionally omit them when `NODE_ENV=production`.

---

### M-3 — Degraded Mode State is Per-Process (Cluster-Unaware)
**File:** `server/middleware/degradedMode.js:39–43`

`_currentMode`, `_modeSince`, `_modeReason`, and `_modeSetBy` are module-level variables. In cluster mode, each worker maintains an independent mode state.

**Impact:** If an operator calls `POST /api/health/mode` to put the system into `ADVISORY_ONLY` mode during an incident, only the worker that handled that request changes state. The next request load-balanced to a different worker continues accepting writes. An operator who believes the system is write-locked is not actually protected. This affects incident response reliability.

---

### M-4 — 32KB Database Repair Threshold May Destroy Valid Databases
**File:** `server/database.js`

If a plant database file exists but is smaller than 32KB, the connection pool deletes and recreates it. This threshold was set to catch corrupted or truncated databases.

**Impact:** A freshly created plant database with no data yet (schema only, no rows) can legitimately be under 32KB. If the server restarts before any data is written, the database is silently deleted and recreated from scratch. Schema-only databases created by the admin panel could be lost before the plant goes live. No error is raised — the pool simply returns a fresh empty database as if nothing happened.

---

### M-5 — `ha_sync.js` Trigger SQL Built with Schema-Derived String Interpolation
**File:** `server/ha_sync.js:97–127`

The WAL trigger creation in `installSyncInfrastructure` builds SQL strings by interpolating table names and column names retrieved from `PRAGMA table_info()`:

```js
json_object(${columns.map(c => `'${c.name}', NEW."${c.name}"`).join(', ')})
```

**Current risk level:** Low, because these values come from the database schema, not user input. However:
- If a future migration adds a column with a name containing a SQL metacharacter (e.g., a column named `value'; DROP TABLE sync_ledger; --`), this would be directly injectable into trigger DDL.
- The comment on line 86 says "sanitize inputs" but no sanitization is performed. Column names from `PRAGMA table_info` are trusted implicitly.

This is an internal risk vector that becomes relevant if schema management ever becomes less controlled (e.g., user-defined custom fields).

---

## LOW

### L-1 — Creator Account Password Logged to stdout at First Boot
**File:** `server/auth_db.js:128–133`

When the `creator` account is created for the first time, the generated password is printed to the terminal in a bordered box. In containerized or log-aggregated environments (Docker, Kubernetes, systemd journald, cloud CloudWatch), this means the credential appears in the log stream and may be persisted indefinitely.

**Current posture:** The password is randomly generated per deployment and only printed once. The risk is real in log-aggregated environments but low in the target use case (on-premises, local terminal access). Documentation should note that operators should capture this password before the terminal session is closed or the log is rotated.

---

### L-2 — Hub Authentication Token Stored in localStorage
**File:** `src/utils/OfflineDB.js` / LAN hub authentication flow

The hub WebSocket token (used for offline/LAN device authentication) is stored in `localStorage` rather than an `httpOnly` cookie. This is documented as a design decision — the hub token must survive browser restarts without requiring re-auth when the main server is offline.

**Impact:** An XSS vulnerability anywhere in the application could extract the hub token and impersonate a plant device on the LAN. This is a known trade-off. The httpOnly session cookie protects the main API token; the hub token is the weaker surface. The Human Airgap Security design (AI strictly decoupled from the plant network) limits the blast radius of a successful XSS in the Live Studio context.

---

### L-3 — Live Studio File Search Is Non-Recursive
**File:** `server/routes/live_studio.js:156–183`

The `/api/studio/search` endpoint uses `fs.readdirSync(dir)` without recursive traversal. Only files in the top-level of each whitelisted directory are indexed. Files in subdirectories of whitelisted directories (e.g., `src/components/`) do not appear in search results.

**Impact:** Studio users searching for symbols in subdirectory files get incomplete results and may conclude a symbol doesn't exist when it does. This is a UX defect, not a security issue. The whitelist still correctly blocks access to files outside the whitelisted tree.

---

### L-4 — all_sites Work Order Query Strips Double Quotes from WHERE Clause
**File:** `server/routes/workOrders.js:163`

When aggregating work orders across all plants in `all_sites` mode, the WHERE clause constructed from the single-plant query is applied with a `.replace(/"/g, '')` stripping all double-quote characters:

```js
sql += ' WHERE ' + where.join(' AND ').replace(/"/g, '');
```

This was added to handle column aliases that differ between single-plant and multi-plant queries. However, stripping all quotes is fragile: if a column name requires quoting (e.g., a column with a reserved word), the query would silently break. The `validateSort()` guard prevents injection but not this structural fragility.

---

### L-5 — Auth Middleware Bypasses All `/auth/*` Subpaths
**File:** `server/middleware/auth.js`

The auth middleware skips all requests where `req.path.startsWith('/auth')`. This is correct for the current routes (login, logout, refresh, verify-totp). However, the bypass is at the prefix level, not an explicit allowlist.

**Impact:** A future developer who adds a route like `/api/auth/admin-reset-password` or `/api/auth/impersonate` without noticing this pattern creates an unauthenticated endpoint. The pattern is a latent footgun. An explicit route-level allowlist would be safer.

---

### L-6 — Safety Permit Expiry Timer Runs on Every Cluster Worker
**File:** `server/routes/safety_permits.js:49`

`checkExpiredSafetyPermits()` runs every 5 minutes via `setInterval`. In an 8-worker cluster, this fires 8 times every 5 minutes against `trier_logistics.db`. Each run issues a `UPDATE SafetyPermits SET Status='EXPIRED' WHERE ...` for all newly-expired permits.

**Impact:** The update is idempotent (already-EXPIRED rows are not re-matched by the WHERE clause), so there is no data corruption. The cost is 8× the intended database writes and 8× the WAL contention. Low practical impact today; degrades with worker count.

---

## INFO — Architecture Observations (No Action Required)

These observations document correct design decisions for future reference.

**I-1: RBAC Tiering is Sound**  
`server/middleware/auth.js` enforces three gates in sequence: (1) enterprise path authorization checks role against required level, (2) plant jail pins `req.plantId` from JWT — users cannot self-assign a plant, (3) write permission gate blocks non-manager roles on mutation endpoints. The separation is clean and difficult to bypass.

**I-2: TOTP 2FA Implementation is Correct**  
AES-256-GCM encrypts TOTP secrets at rest. The IV and auth tag are stored alongside the ciphertext. Verification uses a standard 30-second TOTP window. No timing attack vectors observed.

**I-3: SQL Injection Posture is Strong**  
All user-facing data mutations go through either parameterized queries or `whitelist()` (server/validators.js). `validateSort()` prevents ORDER BY injection (documented as triggered by a 2026 penetration test finding). No raw user input is concatenated into SQL strings in user-facing routes.

**I-4: LOTO and Safety Permit Cross-Plant Storage is Correct**  
Storing LOTO and safety permit records in `trier_logistics.db` (not per-plant databases) means permits survive plant database operations (deletion, recreation, migration) and provide a genuine cross-plant audit trail for compliance. Orphaned permit records are an acceptable trade-off for OSHA 29 CFR 1910.147 auditability.

**I-5: Offline Queue 401 Halt Pattern is Correct**  
`src/utils/OfflineDB.js` implements a halt on 401 response during queue drain. This prevents a worker whose session expired during an extended outage from replaying scans to a different user's session after re-login. The queue is preserved and resumes after re-auth.

**I-6: HMAC Replay Authentication (v3.4.3) is Correct**  
`replayToServer` in `server/lan_hub.js` signs with `HMAC-SHA256(ts.nonce.plantId.canonicalBody)`. The `/offline-sync` route in `server/routes/scan.js` verifies with a 5-minute timestamp window and `crypto.timingSafeEqual()`. The canonical body re-serialization approach (re-JSON-stringifying rather than using raw request body) is consistent between signer and verifier.

**I-7: Demo Accounts are Correctly Constrained**  
The four `demo_*` accounts (`demo_tech`, `demo_operator`, `demo_maint_mgr`, `demo_plant_mgr`) are bound exclusively to the `examples` plant via `UserPlantRoles`. Even with their public-knowledge password (`TrierDemo2026!`), they cannot access any real plant data. This is a correct isolation design.

**I-8: PM Criticality Adjustment is Intentional**  
`server/pm_engine.js` applies a 0.8× interval multiplier for Class A (critical) assets and 1.2× for Class C assets. This is a deliberate design to service critical assets more frequently. The calculation occurs at interval check time, not at WO creation, so interval changes retroactively affect all future PM scheduling without data migration.

**I-9: WAL Mode Configuration is Correct Across All Databases**  
All three database tiers (`trier_auth.db`, `trier_logistics.db`, per-plant `.db` files) are opened with `journal_mode = WAL` and `busy_timeout = 5000`. `trier_logistics.db` additionally sets `wal_autocheckpoint = 200` to keep the WAL file small under sustained E2E load. This is appropriate for the concurrent read/write patterns in play.

**I-10: Live Studio Path Security is Layered Correctly**  
`resolveWhitelisted()` in `server/routes/live_studio.js` applies: (1) null-byte rejection, (2) `path.resolve()` to normalize traversal sequences, (3) symlink rejection via `fs.realpathSync()` comparison, (4) whitelist directory prefix check, (5) file extension whitelist. Five independent layers means no single check bypass grants file system access.

---

## Summary Table

| ID | Severity | File | Issue | Status |
|----|----------|------|-------|--------|
| C-1 | CRITICAL | pm_engine.js:88,164 | PM duplicate check never fires — unbounded WO injection | ✅ Fixed |
| C-2 | CRITICAL | ha_sync.js:258 | VACUUM INTO snapshots never created — rollback safety net is broken | ✅ Fixed |
| H-1 | HIGH | cluster.js + cron files | Every worker runs independent crons — N× redundant DB writes | ✅ Fixed |
| H-2 | HIGH | database.js | global._preservedLeaders not shared across cluster workers | ✅ Fixed |
| H-3 | HIGH | scan.js + silent_close_engine.js | EXEMPT_HOLD_REASONS duplicated manually — drift risk on safety-critical auto-close | ✅ Fixed |
| M-1 | MEDIUM | database.js | getDb() falls back to Demo_Plant_1 silently if AsyncLocalStorage context missing | ✅ Fixed |
| M-2 | MEDIUM | auth_db.js | Ghost test accounts with fixed public passwords seeded in all deployments | ✅ Fixed |
| M-3 | MEDIUM | degradedMode.js | Degraded mode state is per-process — cluster workers not synchronized | ✅ Fixed |
| M-4 | MEDIUM | database.js | 32KB threshold may delete valid newly-created plant databases | ✅ Fixed |
| M-5 | MEDIUM | ha_sync.js | Trigger SQL uses string interpolation for schema-derived column names | ✅ Fixed |
| L-1 | LOW | auth_db.js | Creator password logged to stdout — risk in log-aggregated environments | ⬜ Pending |
| L-2 | LOW | OfflineDB.js | Hub token in localStorage — XSS-extractable (known design trade-off) | ⬜ Pending |
| L-3 | LOW | live_studio.js | Studio search is non-recursive — subdirectory files not indexed | ✅ Fixed |
| L-4 | LOW | workOrders.js:163 | all_sites WHERE clause strips all double-quotes — fragile but not injectable | ⬜ Pending |
| L-5 | LOW | auth.js middleware | /auth/* prefix bypass is pattern-based, not explicit allowlist | ✅ Fixed |
| L-6 | LOW | safety_permits.js | Expiry timer runs on every cluster worker — 8× redundant writes | ✅ Fixed (H-1) |

---

*Audit performed by reading source files directly. No subagents were used.*
