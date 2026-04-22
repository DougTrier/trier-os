# Trier OS — Server Security Standards

**Maintained by:** Engineering  
**Last updated:** 2026-04-21  

These are hard rules, not suggestions. Violations found in code review must be fixed before merge.

---

## Rule S-1: Explicit Boundary Validation for Client-Controlled Selectors

**Rule:** Any client-controlled selector (plant ID, file path, user ID, table name) used in a privileged context **must pass an explicit route-level allowlist or regex check before it reaches shared helpers** (database.js getDb(), fs methods, SQL builders).

Do not rely on downstream sanitization alone. Defense in depth requires validation at the route boundary AND sanitization at the helper boundary.

**Applies to:**
- `plantId` / `sourcePlant` — must match `SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/` before being passed to `getDb()` or used in `path.join()`
- `filePath` — must be resolved with `path.resolve()`, checked for null bytes, and extension-validated before `fs.readFileSync()` or `fs.existsSync()`
- `userId` for audit trails — must come from `req.user.UserID` or `req.user.Username` (JWT), never from `req.body`
- `tableName` for dynamic SQL — must match `SAFE_TABLE_NAME = /^[\w\s]+$/` and use parameterized queries in INFORMATION_SCHEMA lookups
- `column names` for mass assignment — must pass through `whitelist(req.body, type)` in validators.js before building SET or INSERT SQL

**Grep audit command (run periodically):**
```sh
# Find routes that accept plantId/filePath/userId from body without explicit validation
grep -rn "req\.body\.\(plantId\|sourcePlant\|filePath\|userId\)" server/routes/ | grep -v "SAFE_PLANT_ID\|validateImport\|req\.user"
```

**Why this rule exists:**  
The 2026-04 second-pass security audit found that multiple routes relied entirely on `getDb()`'s internal sanitization (`plantId.replace(/[^a-zA-Z0-9_\s-]/g, '')`) rather than explicit route-level validation. One route (`live_studio.js simulation/create`) built a file path inline without calling `getDb()` at all, creating a traversal vector the centralized helper never saw. Inconsistent layering means any refactor that skips one layer exposes a previously "safe" path.

---

## Rule S-2: Username Field Casing in JWT Claims

**Rule:** Always use `req.user.Username` (capital U) when reading the authenticated user's name from the JWT payload. Never use `req.user.username` (lowercase).

**Why:** The JWT is issued with `Username` (capital U) by `auth_db.js`. Lowercase `username` is always `undefined`, causing audit log entries to be written as `'system'` instead of the real user name.

**Grep audit command:**
```sh
grep -rn "req\.user\?\.username\b" server/routes/
```

---

## Rule S-3: Never Commit Credentials to Source

**Rule:** Passwords, API keys, and tokens must never appear as string literals in source code. Use `SystemSettings` in `trier_logistics.db` for configurable credentials, or environment variables.

**Why:** Hardcoded fallback passwords were found in `import_engine.js:getKnownPasswords()` during the 2026-04 audit. Even "fallback" credentials committed to source are exposed in git history permanently.

---

## Rule S-4: Parameterized Queries for All External DB Lookups

**Rule:** `INFORMATION_SCHEMA` and other metadata queries against SQL Server must use `pool.request().input()` parameterized syntax, not template literal interpolation. Bracket-quoting `[tableName]` is insufficient when `tableName` contains `]`.

**Why:** The `browse-sql-table` endpoint used string interpolation for `INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}'`. Table name allowlist validation (`/^[\w\s]+$/`) is the outer guard; parameterization is the inner guard.

---

## Rule S-5: Multer fileFilter Required for All Upload Endpoints

**Rule:** Every `multer()` instance must include a `fileFilter` that validates file extension before accepting the upload. Do not rely only on `limits.fileSize`.

**Why:** `dxf-import.js` and `lidar-import.js` had no `fileFilter`, accepting any file type and relying on downstream extension checks after the file was already written to disk.

---

## Rule S-7: Batch Operations Must Validate Per-Item Results

**Rule:** HTTP 200 is not sufficient to mark batch work complete. Every batch operation that submits multiple items and receives a structured result must:

1. Inspect each item's result status in the response body
2. Mark only items with a successful per-item status as complete
3. Leave failed items in their prior state so they are retried or surfaced for manual resolution

**Applies to:**
- `ha_sync.js pushChangesToSecondary` — must check `result.errors` before calling `markApplied` on each ledger entry. Entries that errored on the secondary must remain at `applied = 0`.
- `lan_hub.js replayToServer` — must parse `res.json().results[]` and only call `markSynced(scanId)` for entries where `status !== 'FAILED'`. Scans that the server cannot process (asset not found, DB error) must remain PENDING or transition to a named FAILED state for operator visibility.
- Any future endpoint that submits a batch and receives per-item statuses.

**Grep audit command:**
```sh
# Find batch reply handlers that check only res.ok without inspecting item-level results
grep -n "res.ok\|response.ok" server/ha_sync.js server/lan_hub.js
```

**Why this rule exists:**  
The 2026-04 Pass 3 audit (R-5, R-6) found that both the HA sync engine and the LAN hub replay marked entire batches as complete on HTTP 200, silently discarding per-item failures. On the HA path, this causes permanent primary/secondary divergence for records that errored on the secondary. On the hub path, this causes silent scan loss — a physical floor scan that the server could not process is permanently discarded with no recovery path. "Batch 200" is a transport acknowledgment, not a semantic success.

---

## Rule S-6: SSRF — Outbound HTTP Requests Must Validate Destination

**Rule:** Before making any outbound HTTP/HTTPS request from a server-side route, validate that the destination:
1. Uses `http:` or `https:` protocol only
2. Does not resolve to private/loopback ranges (127.x, 10.x, 172.16-31.x, 192.168.x, ::1, 169.254.x)

Use `new URL(url)` to parse and `PRIVATE_RANGE` regex to block before calling `http.get()` or `https.get()`.

---

## Rule S-8: Async Interval Functions Must Carry a Reentrance Guard

**Rule:** Any `async function` invoked by `setInterval` (or equivalent scheduler) without `await` must carry a module-level boolean guard (`let _inProgress = false`) checked at entry and reset in a `finally` block. The guard prevents a second invocation from starting before the first completes.

**Applies to:**
- `lan_hub.js replayToServer` — guarded with `_replayInProgress`
- Any future scheduled async function that performs DB writes or outbound HTTP calls

**Why this rule exists:**
The Pass 3 audit (R-4) found that `replayToServer` was called by `setInterval` without `await`. If the central server responded slowly (>30 seconds), a second drain started on the same PENDING rows before the first finished, causing each scan to be submitted twice and producing duplicate WOs.

---

## Rule S-9: Paired State Writes Must Be Atomic

**Rule:** Any write pair where both sides must agree on outcome (e.g., "WO created" + "queue entry marked SYNCED") must occur inside the same transaction. Neither write is allowed to succeed while the other fails or is skipped.

**Applies to:**
- `scan.js offline-sync` — `OfflineScanQueue` status update must be inside the same transaction as the WO create/segment open
- Any future endpoint that maintains a shadow queue or status table alongside a primary write

**Grep audit command:**
```sh
# Find queue status updates that occur outside of a transaction block
grep -n "OfflineScanQueue\|syncStatus" server/routes/scan.js | grep -v "transaction\|#"
```

**Why this rule exists:**
The Pass 3 audit (R-9) found that `OfflineScanQueue SET syncStatus` ran after the WO-creation transaction committed but before any rollback safety net. A crash in that window left the WO created and the queue entry still PENDING, causing a duplicate WO on the next reconnect replay.

---

## Rule S-10: Timer-Based Dedup Must Have an Explicit Completion Signal

**Rule:** Any protocol that uses a timer as the sole mechanism to stop a fallback retry (e.g., "if client hasn't synced in 10 minutes, hub re-adopts the scan") must also provide an explicit completion message that the client sends after it successfully completes the action. The timer becomes a crash-recovery fallback, not the primary control path.

**Applies to:**
- `lan_hub.js` DEDUP_CLIENT / SYNC_COMPLETE protocol — device sends `SYNC_COMPLETE` after successfully pushing to central; hub marks rows `SYNCED_BY_CLIENT` and removes them from the timer pool
- Any future hub-assisted relay protocol where client and hub may both attempt the same action

**Why this rule exists:**
The Pass 3 audit (R-10) found that the 10-minute DEDUP_CLIENT timer was the only thing preventing the hub from re-submitting scans that the client was still in the process of syncing. A device that took >10 minutes to push to a slow central server would have its scans submitted by both itself and the hub, producing a duplicate WO. An explicit `SYNC_COMPLETE` message closes the race window regardless of how long the client sync takes.

---

## Rule S-11: Idempotency Must Be Enforced at the Database Layer

**Rule:** Any operation that must be idempotent under concurrent or replay execution must enforce that idempotency with a UNIQUE INDEX on the natural dedup key, not only with an application-layer pre-check SELECT.

When both a pre-check and a mutating write exist in the same handler, the write must occur inside a `.immediate()` transaction that re-checks the dedup condition under write lock. The outer pre-check is a performance optimization (early return without a lock); the inner re-check is the authoritative guard.

**Applies to:**
- `scan.js POST /` — UNIQUE INDEX on `ScanAuditLog.scanId` + inner re-check inside `.immediate()`
- `scan.js POST /offline-sync` — same UNIQUE INDEX must be present (requires `ensureScanColumns(conn)` to be called at handler entry); per-event transaction should use `.immediate()`
- Any future endpoint that processes an event with a natural dedup key

**Grep audit command:**
```sh
# Find transaction() calls without .immediate() in scan-path handlers
grep -n "conn\.transaction\|\.immediate" server/routes/scan.js
```

**Why this rule exists:**
Application-layer pre-checks are not atomic. Two cluster workers can both pass the check before either commits. The UNIQUE constraint is the final backstop that makes data corruption structurally impossible regardless of application logic.

---

## Rule S-12: Workflow Identifiers Must Be Collision-Resistant

**Rule:** Any identifier that serves as a unique key in a workflow (work order number, job ID, batch ID) must incorporate a cryptographically random component in addition to any timestamp. Timestamps alone are not unique under concurrent execution — two workers on the same millisecond produce an identical value.

Use `Date.now() + '-' + crypto.randomBytes(3).toString('hex')` or `uuid.v4()`. Never use `Date.now()` alone as a unique identifier.

**Applies to:**
- `scan.js` auto-created WO numbers — `AUTO-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
- Any future auto-generated identifier used as a DB key or referenced in audit trails

**Why this rule exists:**
The Pass 3 audit (R-7) found that `AUTO-${Date.now()}` WO numbers collided when two workers hit the same millisecond, producing duplicate work order numbers that would violate UNIQUE constraints or corrupt reporting.
