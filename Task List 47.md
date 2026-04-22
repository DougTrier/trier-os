# Trier OS — Task List 47

**Source:** `Audit 47.md` (v3.5.0 exploratory audit, 2026-04-21)
**Purpose:** Convert all 34 findings into executable engineering tasks, grouped into priority waves.

---

## Summary

- **Total Tasks:** 34
- **Completed:** 6
- **Remaining:** 28
- **Critical:** 0
- **High:** 8 (6 done, 2 remaining)
- **Medium:** 17 (0 done)
- **Low:** 9 (0 done)

Eight High-severity tasks block general-availability; most are small, surgical fixes. Medium-severity work is the bulk of the effort (17 tasks covering concurrency, delivery guarantees, rate-limit scoping, and secret handling). Lows are maintainability and future-proofing. None of the 34 tasks require architectural rework. Estimated total effort: 1 focused sprint for Wave 1, a second sprint for Wave 2, Waves 3 and 4 absorbable in backlog.

**Progress log (most recent first):**
- `56b3c01` — TASK-07 — ERP outbox idempotency
- `1fc0908` — TASK-06 — Part stock negative-decrement race
- `ab3208f` — TASK-05 — HA sync trigger race
- `fcda760` — TASK-04 — HUB_TOKEN_SECRET isolation
- `ee1cf44` — TASK-03 — Invite-code plant override
- `b23df21` — TASK-01 — WO delete status guard

---

## Priority Waves

### 🔴 Wave 1 — Immediate Fixes (Blockers / Data Integrity / Auth)

Eight High-severity tasks: a broken safety guard allowing destruction of completed WOs, token-lifetime gaps that keep demoted users privileged, an invite-code boundary bypass, concurrency/idempotency holes in HA sync and outbound delivery, a credential-isolation silent fallback, and a systemic audit-log coverage gap.

- [x] TASK-01 · H-1 · WO delete status guard — commit `b23df21`
- [ ] TASK-02 · H-5 · Token version claim for JWT revocation
- [x] TASK-03 · H-6 · Invite-code plant override — commit `ee1cf44`
- [x] TASK-04 · H-8 · HUB_TOKEN_SECRET isolation — commit `fcda760`
- [x] TASK-05 · H-2 · HA sync trigger race — commit `ab3208f`
- [x] TASK-06 · H-3 · Part stock negative-decrement race — commit `1fc0908`
- [x] TASK-07 · H-4 · ERP outbox idempotency — commit `56b3c01`
- [ ] TASK-08 · H-7 · Audit-log coverage sweep

---

### 🟠 Wave 2 — Core Hardening

Fifteen Medium tasks focused on correctness, concurrency, delivery guarantees, rate-limiting, and secret handling.

- TASK-09 · M-1 · Reduce JSON body limit
- TASK-10 · M-2 · TOTP replay cache
- TASK-11 · M-3 · Rate-limit /verify-2fa
- TASK-12 · M-4 · Rate-limit /enroll
- TASK-13 · M-5 · Encrypt SMTP password
- TASK-14 · M-7 · Tighten CSP
- TASK-15 · M-8 · Sensor rate-limit key
- TASK-16 · M-9 · lidar-source path containment
- TASK-17 · M-10 · HA snapshot filename collision
- TASK-18 · M-11 · Part adjustment .immediate()
- TASK-19 · M-12 · Webhook outbox retry queue
- TASK-20 · M-13 · Shorten LAN hub DEDUP_CLIENT window
- TASK-21 · M-14 · CostLedger plant-scope fallback
- TASK-22 · M-15 · Enrollment enumeration
- TASK-23 · M-16 · Password-reset response hygiene

---

### 🟡 Wave 3 — Stability & Observability

Four tasks focused on logging correctness, user notification, and audit-system integrity.

- TASK-24 · M-6 · Health endpoint error detail
- TASK-25 · M-17 · Notify users on password/role change
- TASK-26 · L-3 · logAudit failure visibility
- TASK-27 · L-4 · logAudit parameter-order consistency

---

### 🔵 Wave 4 — Improvements

Seven Low-severity polish items for maintainability and future-proofing.

- TASK-28 · L-1 · all_sites WHERE clause builder
- TASK-29 · L-2 · Longer API key prefix
- TASK-30 · L-5 · Conditional HSTS
- TASK-31 · L-6 · Global request timeout
- TASK-32 · L-7 · Creator password entropy
- TASK-33 · L-8 · Document CORS LAN policy
- TASK-34 · L-9 · Close hub WebSocket on role change

---

## Tasks

---

### TASK-01 ✅

**Status:** Completed — commit `b23df21`

**Source Finding:** H-1

**Severity:** High

**Category:** Data Integrity

**Description:**
The WO delete endpoint compares the string `'50'` against `wo.StatusID` to decide whether to block deletion of completed work orders. The platform-wide convention (see `costLedger.js:98`, all analytics queries using `StatusID >= 40`) is that `40 = Completed`. Any WO at StatusID 40 bypasses the guard and can be hard-deleted.

**Why It Matters:**
Completed WOs carry the cost, labor, and downtime history that feeds MTTR/OEE. Silent destruction of this data corrupts metrics retroactively and is undetectable after the fact. A technician using the delete action with no ill intent can currently wipe a completed record.

**Fix Strategy:**
Replace the string-equality check with a numeric compare against the platform's completion range:
```js
const statusNum = Number(wo.StatusID);
if (statusNum >= 40) {
    return res.status(403).json({ error: 'Cannot delete completed or cancelled work orders.' });
}
```
Simultaneously add a `logAudit` call before the DELETE so the action is recorded.

**Files Affected:**
- `server/routes/workOrders.js` (line 709)

**Acceptance Criteria:**
- A WO with `StatusID = 40` returns HTTP 403 on DELETE.
- A WO with `StatusID = 50` returns HTTP 403 on DELETE.
- A WO with `StatusID = 20/30` is still deletable.
- Every successful delete produces a `WO_DELETED` entry in AuditLog with the WO number, status, and plant.

---

### TASK-02

**Source Finding:** H-5

**Severity:** High

**Category:** Security / Auth

**Description:**
JWTs are minted with a 7-day expiry and carry a snapshot of `globalRole`, `plantRoles`, and boolean capability flags. On password change (`/change-password`), role edit (`/users/update-access`), or admin reset (`/reset-password`), existing tokens remain valid with the pre-change claims.

**Why It Matters:**
A user demoted from `it_admin` to `technician` keeps admin capabilities until their token expires. Password changes made in response to suspected compromise do not evict active sessions. Permission elevation is governed by data in the JWT, not by server state, so there is no in-band revocation path.

**Fix Strategy:**
1. Add `TokenVersion INTEGER DEFAULT 0` to the `Users` table in `auth_db`.
2. Include `tokenVersion: user.TokenVersion` in every JWT payload issued by `issueJWT()`.
3. In the auth middleware, reject tokens where the claim version is less than the current DB value for that user.
4. Increment `TokenVersion` inside the same transaction that runs on:
   - `/change-password`
   - `/reset-password`
   - `/users/update-access`
   - `/users/delete` (for completeness; deletion should also invalidate)

**Files Affected:**
- `server/auth_db.js` (schema)
- `server/routes/auth.js` (issueJWT, change-password, reset-password, users/update-access)
- `server/middleware/auth.js` (version check on every request)

**Acceptance Criteria:**
- Changing a user's password returns 401 on subsequent requests made with the pre-change token.
- Demoting a user from `it_admin` invalidates their existing session within 1 request.
- Token-version check performs a single SELECT per request (cacheable if hot path).
- Playwright suite still passes for login/logout/session flows.

---

### TASK-03 ✅

**Status:** Completed — commit `ee1cf44`

**Source Finding:** H-6

**Severity:** High

**Category:** Security / Auth

**Description:**
`/register` with an invite code does `resolvedPlantId = plantId || codeRow.PlantID`. A body-supplied `plantId` wins over the plant the invite was issued for. An attacker with a valid invite for Plant A can register into Plant B.

**Why It Matters:**
Invite codes are the primary self-service enrollment mechanism. A broken boundary here allows cross-plant account creation with legitimate-looking audit trail ("registered via invite X") but anomalous plant access.

**Fix Strategy:**
In the invite-code path, ignore the body value entirely:
```js
resolvedPlantId = codeRow.PlantID;
```
Leave the legacy plant-password path (Path B) unchanged, since that path already validates the plant password against the matching plant account.

**Files Affected:**
- `server/routes/auth.js` (line 445)

**Acceptance Criteria:**
- Registering with invite `X` for Plant A while passing `plantId: "Plant_B"` in the body creates the user under Plant A only.
- UserPlantRoles inserts exactly one row, for `codeRow.PlantID`.
- Existing happy-path registration tests still pass.

---

### TASK-04 ✅

**Status:** Completed — commit `fcda760`

**Source Finding:** H-8

**Severity:** High

**Category:** Security / Crypto

**Description:**
`HUB_TOKEN_SECRET` silently falls back to `JWT_SECRET`. The design intent — "a stolen localStorage hub token cannot be replayed against the main API because the signing key differs" — is not enforced at configuration time.

**Why It Matters:**
Default deployments without `HUB_TOKEN_SECRET` in `.env` collapse the two trust domains into one. The L-2 finding in the prior audit (hub token in localStorage) becomes critical under this condition because any XSS extraction yields a main-API-valid token.

**Fix Strategy:**
On server boot, fail fast:
```js
if (!process.env.HUB_TOKEN_SECRET) {
    console.error('FATAL: HUB_TOKEN_SECRET must be set');
    process.exit(1);
}
if (process.env.HUB_TOKEN_SECRET === process.env.JWT_SECRET) {
    console.error('FATAL: HUB_TOKEN_SECRET must not equal JWT_SECRET');
    process.exit(1);
}
```
Place the check next to the existing `JWT_SECRET` check in `middleware/auth.js` (or `index.js` boot). Remove the `|| JWT_SECRET` fallback in `routes/auth.js:235`.

**Files Affected:**
- `server/routes/auth.js` (line 235)
- `server/middleware/auth.js` or `server/index.js` (boot-time check)
- `.env.example` (add `HUB_TOKEN_SECRET`)
- `build_production.ps1` (ensure key is generated at install time)

**Acceptance Criteria:**
- Server refuses to start if `HUB_TOKEN_SECRET` is unset.
- Server refuses to start if `HUB_TOKEN_SECRET === JWT_SECRET`.
- A token signed with `JWT_SECRET` is rejected at the hub WebSocket upgrade handler.
- A token signed with `HUB_TOKEN_SECRET` is rejected at main-API requests.

---

### TASK-05 ✅

**Status:** Completed — commit `ab3208f`

**Source Finding:** H-2

**Severity:** High

**Category:** Concurrency / Distributed

**Description:**
`applyReplicatedEntries()` in `ha_sync.js` sequences `disableSyncTriggers(plantDb); applyTx(); enableSyncTriggers(plantDb);` outside of any transaction. Concurrent request traffic on the primary that writes to a TRACKED_TABLE during this window is not logged to `sync_ledger`.

**Why It Matters:**
The secondary diverges silently. Because foreground writes during the gap bypass the ledger, the primary's next replication cycle will not include them; the secondary never sees those changes. The divergence is invisible until a manual `VACUUM INTO` compare is run.

**Fix Strategy:**
Wrap the three operations in an immediate transaction:
```js
plantDb.transaction(() => {
    disableSyncTriggers(plantDb);
    applyTx();
    enableSyncTriggers(plantDb);
}).immediate();
```
Alternatively, if `applyReplicatedEntries` is only supposed to run on secondaries, gate the entry point on `SERVER_ROLE === 'secondary'` so disable/enable never executes on the primary.

**Files Affected:**
- `server/ha_sync.js` (lines 386–388)

**Acceptance Criteria:**
- Writes made by any concurrent request during a replication apply either land in `sync_ledger` or are fully blocked until apply completes.
- A deliberate test — force concurrent INSERT on Work while replication runs — shows either no divergence or a proper ledger entry.
- Existing HA replication tests still pass.

---

### TASK-06 ✅

**Status:** Completed — commit `1fc0908`

**Source Finding:** H-3

**Severity:** High

**Category:** Data Integrity / Concurrency

**Description:**
`costLedger.closeWorkOrderWithCosts()` decrements Part stock with `UPDATE Part SET Stock = COALESCE(Stock,0) - ? WHERE ID = ?`. No precondition check and no `.immediate()` on the transaction. Concurrent WO closes that consume the same part can both succeed and drive Stock negative.

**Why It Matters:**
Negative stock breaks reorder triggers, MRP planning, and supply-chain dashboards. A technician may see "3 on hand" and consume 2 while another consumes 2 simultaneously; both close successfully and Stock becomes -1 silently.

**Fix Strategy:**
Option A (preserves table structure):
```js
const updateStock = sqlite.prepare(`
    UPDATE "Part" SET "Stock" = COALESCE("Stock", 0) - ?
    WHERE "ID" = ? AND COALESCE("Stock", 0) >= ?
`);
const result = updateStock.run(qty, partId, qty);
if (result.changes === 0) {
    throw new Error(`Insufficient stock for part ${partId}`);
}
```
Change the transaction declaration to `.immediate()` so row locks are taken up front.

Option B (cleaner, larger refactor): insert an `InventoryLedger` row per consumption and compute Stock as a materialized sum (eventual consistency). Not required for this task.

**Files Affected:**
- `server/utils/costLedger.js` (lines 87–89, 155, 105)

**Acceptance Criteria:**
- Two concurrent closes consuming the same part cannot both succeed when stock is insufficient.
- A failing stock check surfaces a meaningful error to the client rather than silently going negative.
- Work-order close happy path still passes.
- Playwright scenario with low-stock part exercises both branches.

---

### TASK-07 ✅

**Status:** Completed — commit `56b3c01`

**Source Finding:** H-4

**Severity:** High

**Category:** Integration / Distributed

**Description:**
`ERPOutbox` has no idempotency column. A retry-induced double `insertOutboxEvent()` queues the same logical event twice, and both drain to the ERP. The outgoing POST body carries no idempotency key either, so downstream dedup is not possible.

**Why It Matters:**
Duplicate `wo_close` / `part_consume` events cause ERPs to double-count labor, parts, and downtime. The financial implications grow with deployment scale. Under crash-restart, recovery currently cannot distinguish "already sent" from "never queued."

**Fix Strategy:**
1. Add `IdempotencyKey TEXT UNIQUE` to `ERPOutbox`. Migration: `ALTER TABLE` + backfill with `PlantID || ':' || EventType || ':' || json_extract(Payload, '$.woNumber') || ':' || CreatedAt` for existing rows.
2. Change `insertOutboxEvent` to take an explicit `idempotencyKey` or derive one deterministically: `${plantId}:${eventType}:${payload.woNumber}:${payload.action || 'close'}`.
3. Use `INSERT OR IGNORE` — a duplicate insert becomes a silent no-op.
4. Forward the key as `X-Idempotency-Key` header in `sendToErp()`.

**Files Affected:**
- `server/services/erp-outbox.js` (lines 31–45, 48–57, 71–77, 91–112)

**Acceptance Criteria:**
- Calling `insertOutboxEvent` twice with the same logical inputs produces a single row.
- The outgoing HTTP POST includes `X-Idempotency-Key` with a stable value.
- Crash-restart cannot resend an already-sent event (idempotent re-queue is blocked).
- Existing drain tests still pass.

---

### TASK-08

**Source Finding:** H-7

**Severity:** High

**Category:** Observability / Compliance

**Description:**
Of 67 DELETE endpoints across 41 route files, only 23 files reference `logAudit`. Mutation routes across `workOrders.js`, `parts.js`, `floorplans.js`, `plant_setup.js`, `assets.js`, and others delete or modify data without recording who/when/what.

**Why It Matters:**
Partial audit coverage is worse than none: forensic review assumes completeness, so gaps produce false conclusions ("the audit log shows no DELETE, therefore no one deleted this"). Regulatory frameworks (21 CFR Part 11, ISO 27001) require complete mutation trails.

**Fix Strategy:**
1. Build an express middleware that wraps all mutation verbs (POST/PUT/PATCH/DELETE) on `/api/*` and logs a minimal action entry on `res.on('finish')` for successful 2xx responses.
2. Allow route handlers to set `req._auditOverride = { action, details }` to supplement with context.
3. Retire most inline `logAudit` calls that only log method + path; keep the ones that capture pre-change state (e.g., `PASSWORD_RESET_BY_ADMIN`).
4. Run a verification script that enumerates all mutation routes and asserts each produces at least one AuditLog entry per call.

**Files Affected:**
- `server/middleware/` (new file, e.g. `auditTrail.js`)
- `server/index.js` (mount the middleware)
- `server/routes/workOrders.js`, `parts.js`, `floorplans.js`, `plant_setup.js`, `assets.js`, `calibration.js`, and others (opportunistic `_auditOverride` adds)
- Test: `tests/audit-coverage.spec.js` (new)

**Acceptance Criteria:**
- Every 2xx response to a non-GET `/api/*` route produces an AuditLog entry.
- A coverage script returns zero uncovered mutation endpoints.
- No regression in existing route behavior.
- AuditLog growth rate is monitored; agreed retention policy in place.

---

### TASK-09

**Source Finding:** M-1

**Severity:** Medium

**Category:** DoS / Resource

**Description:**
`express.json({ limit: '50mb' })` is the global default. With 8 cluster workers each potentially holding a 50 MB buffer per concurrent request, the memory ceiling is reachable under legitimate heavy-import load and trivial under slow-loris attack.

**Why It Matters:**
Process OOM kills drop every in-flight request; recovery is brief but visible. A malicious client can tie up worker threads without producing a single complete request.

**Fix Strategy:**
1. Set the default to `'5mb'`.
2. For routes that legitimately accept larger bodies (import uploads, DXF/LiDAR), apply a route-scoped `express.json({ limit: '50mb' })` middleware in front of just that handler.

**Files Affected:**
- `server/index.js` (line 374)
- `server/routes/import_engine.js`, `dxf-import.js`, `lidar-import.js`, `production_import.js` (route-scoped large limits where needed)

**Acceptance Criteria:**
- Global body limit is ≤ 5 MB.
- Known large-upload routes still accept their expected payloads.
- A 10 MB request to any non-import endpoint returns HTTP 413.

---

### TASK-10

**Source Finding:** M-2

**Severity:** Medium

**Category:** Security / Auth

**Description:**
`totp.validate({ token: code, window: 1 })` accepts the current 30-second window and one adjacent window. No replay-cache is kept; the same code can be used multiple times within the ~60-second validity.

**Why It Matters:**
A captured TOTP code (shoulder-surf, malicious browser extension, man-in-the-browser) is replayable for nearly a minute. For the Creator account this is the only 2FA factor.

**Fix Strategy:**
Track the last successfully-consumed `delta` for the creator in `creator_settings`:
```js
const delta = totp.validate({ token: code, window: 1 });
if (delta === null) return 401;
const lastUsed = JSON.parse(logDb.prepare(
    "SELECT Value FROM creator_settings WHERE Key='totp_last_delta'").get()?.Value || '{}');
if (lastUsed.delta === delta && Date.now() - lastUsed.at < 90_000) {
    return res.status(401).json({ error: 'Code already used — wait for the next one.' });
}
logDb.prepare("INSERT OR REPLACE INTO creator_settings (Key, Value) VALUES ('totp_last_delta', ?)")
    .run(JSON.stringify({ delta, at: Date.now() }));
```

**Files Affected:**
- `server/routes/auth.js` (line 194)

**Acceptance Criteria:**
- Using the same TOTP value twice in succession returns 401 on the second attempt.
- Using the next TOTP value (after window rolls) succeeds normally.
- Creator 2FA verification Playwright test still passes.

---

### TASK-11

**Source Finding:** M-3

**Severity:** Medium

**Category:** Security / Auth

**Description:**
`/verify-2fa` accepts a pre-auth token valid for 5 minutes and a 6-digit code. No per-pre-auth-token attempt counter. An attacker holding a valid pre-auth token can brute-force all 1,000,000 codes inside the window.

**Why It Matters:**
TOTP brute force defeats 2FA. The pre-auth token may be obtained through session hijacking, CSRF on the login step, or client-side exfiltration during the brief `requires2FA` handoff.

**Fix Strategy:**
1. Generate a `jti` (JWT ID) when issuing the pre-auth token.
2. Maintain an in-memory `Map<jti, { attempts, firstSeen }>` in the auth route module.
3. On failure, increment; reject with 401 after 5 attempts and blacklist the `jti`.
4. On success, delete the entry.
5. GC entries older than 10 minutes on a periodic sweep.

**Files Affected:**
- `server/routes/auth.js` (lines 127–140, 151–208)

**Acceptance Criteria:**
- A 6th failed TOTP attempt on the same pre-auth token returns 401 and invalidates the token.
- A fresh login produces a new pre-auth token with a fresh counter.
- No persistent storage used (restart resets).

---

### TASK-12

**Source Finding:** M-4

**Severity:** Medium

**Category:** DoS / Auth

**Description:**
The public `/enroll` endpoint has no rate limit. An attacker can flood `enrollment_requests` with garbage submissions.

**Why It Matters:**
The admin review queue becomes unusable; the table grows unbounded. A motivated attacker can script thousands of submissions in minutes.

**Fix Strategy:**
Apply `express-rate-limit` scoped per-IP: 5 requests / hour with a clear 429 response message.
```js
const enrollLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => req.ip,
    message: { error: 'Enrollment rate limit exceeded. Contact your administrator.' }
});
router.post('/enroll', enrollLimiter, ...);
```

**Files Affected:**
- `server/routes/enrollment.js` (line 45)

**Acceptance Criteria:**
- 6th submission from the same IP within 1 hour returns 429.
- Normal admin workflows are unaffected.
- Rate limit observable via `RateLimit-*` response headers.

---

### TASK-13

**Source Finding:** M-5

**Severity:** Medium

**Category:** Secrets / Credentials

**Description:**
SMTP password is stored in `email_settings.smtp_pass` as plaintext. The admin UI masks display but the DB column is cleartext.

**Why It Matters:**
A DB export, backup, or HA snapshot exposes the SMTP credentials. An attacker with them can send email from the system's sender address — phishing launch pad.

**Fix Strategy:**
1. Reuse the AES-256-GCM helper that `creator_console.js` already uses for TOTP secrets. Extract into `server/utils/cryptoSecrets.js` with `encrypt(plain)` / `decrypt(ct)` functions.
2. On write (`PUT /api/email/settings`), encrypt before insert.
3. On read inside `sendEmail()`, decrypt just in time.
4. Add a one-time migration that re-encrypts any existing plaintext value detected at boot.

**Files Affected:**
- `server/email_service.js` (lines 54, 104, 180)
- `server/utils/cryptoSecrets.js` (new, extracted)
- `server/routes/creator_console.js` (refactor to import shared helper)

**Acceptance Criteria:**
- DB column never contains plaintext SMTP password (verified via SELECT).
- Admin can still save, retrieve, and use SMTP credentials.
- Test email still sends.

---

### TASK-14

**Source Finding:** M-7

**Severity:** Medium

**Category:** Security / Headers

**Description:**
CSP allows `'unsafe-inline'` and `'unsafe-eval'` in `scriptSrc`. These carve-outs defeat most of CSP's XSS protection.

**Why It Matters:**
Any XSS sink elsewhere in the app (a renderer that accepts HTML from the DB, a markdown field that does not sanitize) becomes exploitable with full script execution. CSP is supposed to make that class of bug non-exploitable; currently it doesn't.

**Fix Strategy:**
1. Audit at runtime which scripts actually need inline/eval. Cesium and Monaco are the likely offenders — confirm.
2. If Cesium/Monaco require eval, keep `'unsafe-eval'` only on the Live Studio sub-path via a route-scoped helmet middleware; remove from global CSP.
3. Replace `'unsafe-inline'` with nonce-based CSP: generate a nonce per request, inject into `<script nonce="...">` tags in the HTML template, add `'nonce-${nonce}'` to `scriptSrc`.

**Files Affected:**
- `server/index.js` (lines 300–323)
- `src/main.jsx` / `index.html` (nonce injection if any inline scripts exist)
- `server/routes/live_studio.js` (scoped CSP if Monaco needs eval)

**Acceptance Criteria:**
- Global CSP has no `'unsafe-inline'`.
- Global CSP has no `'unsafe-eval'` OR eval is scoped to Live Studio only with documentation.
- Application still functions: Cesium globe renders, Monaco editor loads, PWA loads.
- Playwright smoke test passes.

---

### TASK-15

**Source Finding:** M-8

**Severity:** Medium

**Category:** Rate Limiting

**Description:**
`sensorLimiter` keys on `req.ip`. In factory deployments all PLC gateways NAT to a single address; one misbehaving sensor consumes the entire 1,000/min budget and locks out legitimate sensors.

**Why It Matters:**
Sensor ingress failure is operationally visible — dashboards go stale, alarm detection lags. A chattier-than-expected device can silently DoS its peers.

**Fix Strategy:**
Change the key generator to an application-level identity:
```js
keyGenerator: (req) => {
    const plant = req.headers['x-plant-id'] || 'unknown';
    const sensor = req.body?.sensorId || req.body?.deviceId || req.ip;
    return `${plant}:${sensor}`;
}
```
Retain `req.ip` as a fallback when sensor identity is missing.

**Files Affected:**
- `server/index.js` (lines 423–431)

**Acceptance Criteria:**
- Two sensors behind the same NAT can each consume up to 1,000/min independently.
- A misbehaving sensor is throttled without impacting peers.
- Rate-limit headers reflect per-sensor budget.

---

### TASK-16

**Source Finding:** M-9

**Severity:** Medium

**Category:** Path Safety

**Description:**
`GET /:id/lidar-source` reads `lidarSourcePath` from the DB and joins it with `dataDir`, then `res.sendFile()` without any boundary containment check. A stored value of `../server/database.js` would exfiltrate source.

**Why It Matters:**
Defense-in-depth: if any other path ever writes a user-controlled string to this column, the endpoint becomes an arbitrary-file-read. Currently the column is populated only by the import flow, but that assumption is a fragile invariant.

**Fix Strategy:**
Add a resolve-and-contain check:
```js
const resolved = path.resolve(filePath);
if (!resolved.startsWith(path.resolve(dataDir) + path.sep)) {
    return res.status(403).json({ error: 'Boundary escape detected' });
}
```

**Files Affected:**
- `server/routes/floorplans.js` (lines 815–839)

**Acceptance Criteria:**
- A FloorPlan row with `lidarSourcePath = '../secret.txt'` returns 403, not the file contents.
- Legitimate PLY/OBJ files still serve correctly.

---

### TASK-17

**Source Finding:** M-10

**Severity:** Medium

**Category:** Distributed

**Description:**
HA snapshot filenames are derived from `new Date().toISOString().slice(0,19)` — second resolution. Two `applyReplicatedEntries` calls in the same second overwrite the first snapshot.

**Why It Matters:**
The retention policy (`keep last 5`) works but one rollback point is silently lost in the collision second. Loss is invisible unless the rollback is actually needed.

**Fix Strategy:**
Append milliseconds or a random suffix:
```js
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23);
// OR
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    + '-' + crypto.randomBytes(3).toString('hex');
```

**Files Affected:**
- `server/ha_sync.js` (lines 286, 299)

**Acceptance Criteria:**
- Two successive applies within the same second produce two distinct snapshot files.
- Existing snapshots remain readable (filename pattern backward-compatible with the `startsWith` cleanup loop).
- Retention trims older snapshots correctly.

---

### TASK-18

**Source Finding:** M-11

**Severity:** Medium

**Category:** Concurrency

**Description:**
Part-quantity adjustment transaction is `tx()` without `.immediate()`. Two concurrent adjustments on the same part can both apply, producing a double-adjust.

**Why It Matters:**
Inventory arithmetic becomes non-deterministic under concurrent edits; a receipt + issue colliding can leave Stock in an unexpected state.

**Fix Strategy:**
Invoke the transaction in immediate mode:
```js
tx.immediate();
```
Confirm the read of current stock happens inside the transaction body so the write is based on the locked view.

**Files Affected:**
- `server/routes/parts.js` (adjust endpoint, lines ~462–480)

**Acceptance Criteria:**
- Concurrent adjustments on the same part serialize correctly; final Stock equals sum of inputs.
- Load test with 10 concurrent adjust calls on a single part yields deterministic final value.

---

### TASK-19

**Source Finding:** M-12

**Severity:** Medium

**Category:** Integration / Delivery

**Description:**
`dispatchEvent()` sends webhooks synchronously with no retry queue. A transient 5xx or timeout drops the notification permanently; PM/WO webhook firings are at-most-once.

**Why It Matters:**
Slack/Teams alerting is advertised as reliable but is currently best-effort. A quiet Slack outage can hide the failure entirely since `dispatchEvent` runs inside a non-blocking try/catch at call sites.

**Fix Strategy:**
Mirror the ERP outbox pattern:
1. Create `WebhookOutbox` table in `trier_logistics.db` with `IdempotencyKey UNIQUE`, `Status`, `Attempts`, `NextRetryAt`.
2. `dispatchEvent()` becomes `INSERT INTO WebhookOutbox` only — no direct network call.
3. A drain worker polls every 30 s, sends via HTTPS POST, marks status, applies exponential backoff on failure, caps at 5 attempts.
4. Add a management endpoint to view failed rows.

**Files Affected:**
- `server/webhook_dispatcher.js` (full refactor)
- `server/routes/pm_engine.js` (callsite unchanged signature)
- Affected callsites: scan completion, PM auto-generation, safety permit events

**Acceptance Criteria:**
- Webhook send failure does not drop the event; it is retried.
- Duplicate submissions dedupe via `IdempotencyKey`.
- Successful sends record timestamp.
- Failed-after-5-attempts rows are visible via admin UI.

---

### TASK-20

**Source Finding:** M-13

**Severity:** Medium

**Category:** LAN Hub

**Description:**
The 10-minute `DEDUP_CLIENT → re-adopt` fallback is long enough that a device which sent SYNC_PENDING and then crashed before SYNC_COMPLETE causes the hub to re-replay scans the device *may* have already pushed directly to central. The UNIQUE index on ScanAuditLog.scanId absorbs duplicates, but FAILED status path does not distinguish "true failure" from "harmless replay of already-processed scan."

**Why It Matters:**
Operator confusion: the hub logs "failed to replay scan X" for scans that are actually already on the server. The signal-to-noise ratio on the hub logs degrades.

**Fix Strategy:**
1. Shorten the fallback window in `getPendingScans()` from `-10 minutes` to `-3 minutes`.
2. On client reconnect, re-issue SYNC_PENDING to reset the window — already present in the protocol; confirm.
3. Optional: when hub replays a DEDUP_CLIENT scan and receives SKIPPED, mark as `SYNCED_BY_CLIENT_LATE` rather than bumping it to PENDING.

**Files Affected:**
- `server/lan_hub.js` (line 144)

**Acceptance Criteria:**
- Realistic reconnect (within 2 minutes) does not trigger re-adoption.
- Hub log messages for replayed-but-already-processed scans use the "LATE" marker, not FAILED.

---

### TASK-21

**Source Finding:** M-14

**Severity:** Medium

**Category:** Multi-Tenancy

**Description:**
In `costLedger.closeWorkOrderWithCosts`, if the primary `UPDATE Work … WHERE ID = ?` finds no rows, the fallback runs `UPDATE Work … WHERE WorkOrderNumber = ?`. If the plant context resolved to Plant B but the WorkOrderNumber belongs to Plant A, the fallback will match and close the wrong WO.

**Why It Matters:**
Cross-plant WO closure corrupts two plants simultaneously: the intended close fails, and a foreign close happens. Detection requires a manual join across plants.

**Fix Strategy:**
Remove the fallback entirely (prefer loud failure) or scope it to the current plant:
```js
AND AstID IN (SELECT ID FROM Asset WHERE PlantID = ?)
```
Pass `plantId` explicitly into `closeWorkOrderWithCosts`.

**Files Affected:**
- `server/utils/costLedger.js` (lines 180–185)

**Acceptance Criteria:**
- A fallback update never matches a WO outside the requested plant.
- If no WO matches in the correct plant, the function throws a clear error rather than silently closing a foreign WO.

---

### TASK-22

**Source Finding:** M-15

**Severity:** Medium

**Category:** Enumeration / Privacy

**Description:**
`/enroll` returns "An enrollment request for this name is already pending" on duplicate `full_name`, enumerating existing enrollees.

**Why It Matters:**
Reconnaissance: an attacker can probe whether a specific employee has already registered. For larger organizations, iterating through a directory yields an HR-level leak.

**Fix Strategy:**
Return a generic success message regardless of duplicate state. Silently no-op on the duplicate insert. Log internally that a duplicate was suppressed for admin visibility.

**Files Affected:**
- `server/routes/enrollment.js` (lines 55–67)

**Acceptance Criteria:**
- Submitting a duplicate enrollment returns the same response body as a fresh submission.
- No DB-level duplicate row is inserted (silent no-op).
- Internal log records the suppression.

---

### TASK-23

**Source Finding:** M-16

**Severity:** Medium

**Category:** Secrets / Auth

**Description:**
`/reset-password` returns `message: "Password for X has been reset to: ${tempPassword}"` — plaintext temp password in the HTTP response body. Reverse proxy logs, error boundaries, and client-side response logging can capture it.

**Why It Matters:**
Temp password is a live credential. Any place that serializes the response body captures it. The admin UI currently needs this value, but it should be delivered via a secure local channel, not the general response envelope.

**Fix Strategy:**
1. Return only `{ success: true, tempPassword }` (avoid prose wrapping so logs that redact known fields can catch it).
2. Update admin UI to render the temp password via a "copy to clipboard" widget that lives in the same request — do not log it.
3. Confirm `MustChangePassword = 1` is set, forcing the user to change immediately on first login.
4. Rotate the temp password on first login; invalidate it after 24 hours unconsumed.

**Files Affected:**
- `server/routes/auth.js` (line 539)
- `src/App.jsx` or relevant admin UI (password-reset modal)

**Acceptance Criteria:**
- Response body exposes the temp password under a clearly-named field (`tempPassword`), not embedded in prose.
- Admin UI renders it in a one-shot copy widget.
- A second reset within 24 hours invalidates the first temp password.

---

### TASK-24

**Source Finding:** M-6

**Severity:** Medium

**Category:** Observability / Info Disclosure

**Description:**
`/api/health` returns `detail: e.message` on DB/integration failures. Error messages can leak schema paths, Windows user directories, SQLite error codes.

**Why It Matters:**
The health endpoint is reachable pre-auth (it must be). Detailed errors become reconnaissance.

**Fix Strategy:**
```js
catch (e) {
    console.error('[health] db probe failed:', e);
    checks.db = { status: 'error' };
}
```
Keep the full error in the server log; return only `{ status: 'error' }` to clients.

**Files Affected:**
- `server/routes/health.js` (lines 48, 63)

**Acceptance Criteria:**
- Response body never contains `e.message`, stack traces, or file paths.
- Server logs retain the full error for ops visibility.

---

### TASK-25

**Source Finding:** M-17

**Severity:** Medium

**Category:** Notification / Auth

**Description:**
Admin-initiated password reset and role change have no user-facing notification. A compromised admin can silently elevate or rotate a victim's credentials.

**Why It Matters:**
Out-of-band notification is the standard compensating control when admin actions cannot require victim consent. Its absence is the difference between a detectable attack and an invisible one.

**Fix Strategy:**
1. After successful `reset-password`, enqueue an email to the target user's registered address: "Your password was reset by admin {X} at {time} from IP {ip}. If you did not request this, contact your security team."
2. After successful `users/update-access` where role or capability flags change, enqueue a similar notification.
3. Send via the `email_service`. If SMTP is not configured, log a warning only (graceful degradation).

**Files Affected:**
- `server/routes/auth.js` (`/reset-password` line 511, `/users/update-access` line 618)
- `server/email_service.js` (reuse the send pipeline)

**Acceptance Criteria:**
- Password reset triggers exactly one email to the target user.
- Role change triggers exactly one email when role or capability flags changed.
- No email if no SMTP configured; warning is logged.

---

### TASK-26

**Source Finding:** L-3

**Severity:** Low

**Category:** Observability

**Description:**
`logAudit` swallows insert failures with `console.error` only. A broken or locked AuditLog produces false assurance that events are being recorded.

**Why It Matters:**
Audit-system failures are a regulated-industry incident in their own right. Silent failures undermine the trust assumption behind every other audit-dependent control.

**Fix Strategy:**
1. On INSERT failure, emit a process-level event (`process.emit('audit:failure', ...)`) that a monitoring hook can catch.
2. Bump a counter in a shared memory object the health endpoint reads.
3. For `severity === 'CRITICAL'` or `'WARNING'`, escalate: write to a fallback flat-file log (`logs/audit-failover.log`) and set `checks.audit = 'degraded'` in health.
4. Optionally: return HTTP 503 from the triggering request if the audit failed for a CRITICAL action.

**Files Affected:**
- `server/logistics_db.js` (lines 241–257)
- `server/routes/health.js` (expose audit health)

**Acceptance Criteria:**
- A simulated audit failure is visible via `/api/health`.
- CRITICAL actions that fail to audit are flagged in a fallback file.
- Ops alerting (if configured) receives a hook.

---

### TASK-27

**Source Finding:** L-4

**Severity:** Low

**Category:** Maintainability

**Description:**
`logAudit` is called with inconsistent parameter ordering across the codebase. Example: `calibration.js:152` passes the action as the first argument, violating the `(userId, action, plantId, details, severity, ip)` signature.

**Why It Matters:**
Audit entries end up with action strings in the UserID column. Search/query on AuditLog returns inconsistent results.

**Fix Strategy:**
1. Add a runtime assertion to `logAudit`: if the first argument looks like an ALL_CAPS_WITH_UNDERSCORES action name, log a console warning and abort or swap.
2. Grep the codebase for all `logAudit(` call sites; normalize to the documented signature.
3. Add JSDoc with explicit `@param` types.
4. Optional: migrate AuditLog history by detecting entries where `UserID` matches the ACTION pattern and reordering.

**Files Affected:**
- `server/logistics_db.js` (signature documentation + validation)
- `server/routes/calibration.js:152` and others identified by grep

**Acceptance Criteria:**
- All `logAudit` callers use `(userId, action, plantId, details, severity, ip)`.
- A lint check or runtime warning catches violations.
- Historical data either remains as-is (documented) or is migrated.

---

### TASK-28

**Source Finding:** L-1

**Severity:** Low

**Category:** API / Maintainability

**Description:**
The `all_sites` WHERE clause applies `.replace(/"/g, '')` to strip all double quotes from the single-plant query. Any future column name that requires quoting (reserved words, snake_case with SQL keywords) breaks silently.

**Why It Matters:**
A latent footgun. The current schema happens to have no quoted-identifier columns in the WHERE builder, but the next column addition could.

**Fix Strategy:**
Build the `all_sites` query via a dedicated path that is aware of cross-plant alias differences, rather than post-processing a single-plant string. Candidate: a `buildAllSitesQuery(filters)` helper alongside the existing single-plant builder.

**Files Affected:**
- `server/routes/workOrders.js` (line 163)
- `server/utils/queries.js` (if centralizing)

**Acceptance Criteria:**
- No `.replace(/"/g, '')` remains in the codebase.
- Adding a column requiring quotes does not break the `all_sites` rollup.
- `all_sites` query results match pre-change output for existing columns.

---

### TASK-29

**Source Finding:** L-2

**Severity:** Low

**Category:** Key Management

**Description:**
API key prefix shown in admin UI is `rawKey.substring(0, 10)` — `pm_` + 7 hex chars. Prefix collisions become possible at scale.

**Why It Matters:**
Admin cannot uniquely identify a key to revoke when two have identical prefixes.

**Fix Strategy:**
Increase the prefix to 16 characters or display the SHA-256 hash prefix:
```js
const keyPrefix = rawKey.substring(0, 16) + '...';
// OR
const displayHash = keyHash.substring(0, 12);
```

**Files Affected:**
- `server/routes/api_docs.js` (lines 225–227)
- Admin UI (`src/App.jsx` or related)

**Acceptance Criteria:**
- Prefix is at least 16 chars (or uses hash-prefix).
- Existing API keys continue to work (no data migration needed, just display change).

---

### TASK-30

**Source Finding:** L-5

**Severity:** Low

**Category:** Headers / TLS

**Description:**
HSTS is globally disabled because the server supports both HTTP (1937) and HTTPS (1938). A first-visit MITM can strip TLS before the client has cached the preference.

**Why It Matters:**
Minor given the intranet-first deployment, but easy to fix without breaking the HTTP port.

**Fix Strategy:**
Conditional middleware:
```js
app.use((req, res, next) => {
    if (req.secure) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});
```

**Files Affected:**
- `server/index.js` (lines 321–323)

**Acceptance Criteria:**
- HTTPS responses include the `Strict-Transport-Security` header.
- HTTP responses do not include it.
- No asset-loading regressions (verified via browser dev tools).

---

### TASK-31

**Source Finding:** L-6

**Severity:** Low

**Category:** DoS / Resource

**Description:**
No global request timeout is set. Combined with TASK-09's body-size reduction, this pairs naturally as a DoS hardening step.

**Why It Matters:**
Slow-loris attacks and legitimately stuck handlers tie up workers. A timeout releases the thread automatically.

**Fix Strategy:**
```js
const server = app.listen(PORT, ...);
server.setTimeout(30_000);
```
For routes that legitimately run longer (imports, analytics generation, backups), extend per-route via `req.setTimeout(300_000)`.

**Files Affected:**
- `server/index.js` (after `app.listen`)
- `server/routes/import_engine.js`, `corporate-analytics.js`, `database.js` (route-scoped longer timeouts where needed)

**Acceptance Criteria:**
- Default request timeout is 30 seconds.
- Long-running legitimate routes explicitly extend.
- A test client holding a connection open with no data returns 408 within 30 s.

---

### TASK-32

**Source Finding:** L-7

**Severity:** Low

**Category:** Crypto

**Description:**
Creator first-boot password uses `crypto.randomBytes(10)` (80 bits). Modern guidance for long-lived account secrets is ≥128 bits.

**Why It Matters:**
Low risk in practice (password is printed once, operator records it immediately), but trivial to raise.

**Fix Strategy:**
```js
const initialPassword = crypto.randomBytes(16).toString('base64url');
```

**Files Affected:**
- `server/auth_db.js` (line 118)

**Acceptance Criteria:**
- Creator password is generated from 16 random bytes (~22 base64url chars).
- First-boot flow still prints the password in the bordered box.

---

### TASK-33

**Source Finding:** L-8

**Severity:** Low

**Category:** CORS / Documentation

**Description:**
CORS permits any origin matching `192.168.*`, `10.*`, or `172.16–31.*`. This is an intentional intranet design but undocumented.

**Why It Matters:**
An implicit trust boundary that isn't written down is a ticking clock; the next developer may widen it unknowingly.

**Fix Strategy:**
1. Add a comment block in `server/index.js` above the CORS config explaining the LAN trust model.
2. Add an entry in `SECURITY.md` under "Deployment trust boundaries."
3. Add a `.env` flag `DISABLE_LAN_CORS=1` for air-gapped installations that want to turn it off.

**Files Affected:**
- `server/index.js` (lines 349–373)
- `SECURITY.md`
- `.env.example`

**Acceptance Criteria:**
- Inline comment explains the LAN ranges and why.
- `SECURITY.md` documents the trust assumption.
- `DISABLE_LAN_CORS=1` disables the private-IP shortcut.

---

### TASK-34

**Source Finding:** L-9

**Severity:** Low

**Category:** WebSocket

**Description:**
Hub WebSocket authenticates JWT at upgrade only. No per-message revocation. A hub token compromised via XSS remains valid for 24 h.

**Why It Matters:**
Depends on TASK-02 (TokenVersion). Once implemented, the hub should also evict active WebSocket connections when a user's TokenVersion changes.

**Fix Strategy:**
1. Track an open WebSocket per `UserID` in `_clients` (already partially present).
2. Expose an internal `evictUser(userId)` function on the hub module.
3. Call it from the routes that increment TokenVersion (TASK-02): password change, role change, user delete.
4. Close the socket with code 4001 ("session invalidated").

**Files Affected:**
- `server/lan_hub.js`
- `server/routes/auth.js` (call `evictUser` after TokenVersion bumps)

**Acceptance Criteria:**
- Changing a user's password closes their active hub WebSocket.
- Demoting a user closes their active hub WebSocket.
- Client receives close code 4001 and prompts for re-login.

---

## Execution Plan

### Recommended Order

**Sprint 1 — Wave 1 (Immediate Fixes)**
Order within the sprint:
1. TASK-01 (1h fix, prevents active data loss)
2. TASK-03 (trivial fix, closes auth bypass)
3. TASK-04 (half-day; includes build-script and env-example updates)
4. TASK-02 (largest Wave 1 item; schema migration + token version claim). Do this before Wave 3 so TASK-34 can build on it.
5. TASK-05 (isolated change to one file)
6. TASK-06 (concurrent-stock fix; include a load test)
7. TASK-07 (outbox idempotency; migration included)
8. TASK-08 (systematic audit-log middleware; larger but mostly additive)

**Checkpoint 1 (end of Sprint 1):**
- Run full Playwright suite.
- Run a focused concurrency test on TASK-05, TASK-06.
- Run HA replication failover test if environment available.
- Verify token revocation by manual demote-then-old-token test.
- Tag release as `v3.6.0-rc1`.

**Sprint 2 — Wave 2 (Core Hardening)**

Group order within Sprint 2:
- Auth / rate-limit cluster: TASK-10, TASK-11, TASK-12
- Secrets / credentials: TASK-13, TASK-23
- Delivery / concurrency: TASK-17, TASK-18, TASK-19, TASK-20, TASK-21
- Boundary / safety: TASK-09, TASK-15, TASK-16
- Enumeration: TASK-22
- Headers: TASK-14

**Checkpoint 2 (end of Sprint 2):**
- Run full Playwright suite.
- Run a 1-hour soak test on webhook outbox drain (TASK-19).
- Verify SMTP encryption round-trip (TASK-13).
- Browser smoke test with CSP tightened (TASK-14).
- Tag release as `v3.6.0-rc2`.

**Sprint 3 — Wave 3 + Wave 4 (Stability & Improvements)**

Wave 3 first:
- TASK-24, TASK-25, TASK-26, TASK-27

Then Wave 4:
- TASK-28, TASK-29, TASK-30, TASK-31, TASK-32, TASK-33, TASK-34

**Final Checkpoint:**
- Full Playwright suite.
- Integration test: HA primary failover, LAN hub offline/online cycle, cluster mode with 8 workers under sustained load.
- Audit-log coverage script (added in TASK-08) returns zero uncovered mutation routes.
- Tag release as `v3.6.0` (GA).

### Testing Strategy

- **After every Wave 1 task:** run the Playwright auth + WO close suites.
- **After TASK-05, TASK-06, TASK-18:** run concurrency-targeted tests (multiple parallel Playwright workers hitting the same endpoints).
- **After TASK-07, TASK-19:** integration test against a stub ERP / stub webhook server confirming at-least-once delivery and exactly-once consumption via idempotency key.
- **After TASK-14 (CSP):** full browser smoke of Cesium globe, Monaco editor, Leaflet maps.
- **After Wave 3:** verify the audit-coverage script passes and health endpoint reflects audit-system status.
- **Before GA tag:** one full 1-hour stress run with all previously reported edge-case scenarios from `Edge Cases.md`.

### Rollback Plan

- Each task should be a standalone commit; the commit-per-task cadence allows surgical reverts.
- Schema migrations (TASK-02, TASK-07) should be paired with a documented rollback SQL script checked into `server/migrations/`.
- After Sprint 1, if any regression is observed, revert to `v3.5.0` and cherry-pick only the non-regressing fixes forward.
