# Trier OS — Code Cleanup Audit

**Date:** 2026-04-21  
**Auditor:** Engineering (deep-read audit, no subagents)  
**Scope:** Second-pass audit following v3.4.3 fixes. Focus: auth flow, route logic, data handling, code quality.  
**Result:** All 20 actionable findings (Critical → Low) fixed in the same session. 4 Info observations documented; no code change required.

---

## Files Reviewed

| File | Lines |
|------|-------|
| `server/routes/auth.js` | ~600 |
| `server/routes/creator_console.js` | ~350 |
| `server/routes/database.js` | ~600 |
| `server/routes/assets.js` | ~1150 |
| `server/routes/parts.js` | ~740 |
| `server/routes/workOrders.js` | ~100 (partial) |
| `server/routes/analytics.js` | ~350 (partial) |
| `server/routes/enrichment.js` | ~80 |
| `server/routes/scan.js` | ~100 (partial) |
| `server/routes/health.js` | ~full (prior session) |
| `server/enrichment_engine.js` | ~full (prior session) |
| `server/validators.js` | ~140 |

---

## Summary Table

| ID | Severity | File | Description | Status |
|----|----------|------|-------------|--------|
| C-1 | **Critical** | `routes/auth.js` | Login privilege escalation: unknown username + it_admin password authenticates as it_admin | ✅ Fixed |
| C-2 | **Critical** | `enrichment_engine.js` | Shell command injection via unescaped part ID and manufacturer values | ✅ Fixed |
| H-1 | High | `routes/auth.js` | Login error messages distinguish "user not found" from "wrong password" — username enumeration | ✅ Fixed |
| H-2 | High | `routes/auth.js` | LDAP TLS certificate not verified — vulnerable to MITM in production | ✅ Fixed |
| H-3 | High | `routes/parts.js` | Part delete authorization uses `req.user.DefaultRole` — wrong JWT field, only hardcoded username works | ✅ Fixed |
| H-4 | High | `routes/database.js` | Plant ID from request body used as filesystem path without sanitization | ✅ Fixed |
| M-1 | Medium | `routes/parts.js` | `error_debug.log` debug artifact left in production — unbounded growth, leaks query params | ✅ Fixed |
| M-2 | Medium | `routes/auth.js` | Hub token returned in response body and stored in localStorage — XSS accessible | ✅ Fixed |
| M-3 | Medium | `routes/assets.js` | WHERE clause double-quote stripping before SQL — removes column identifier quoting | ✅ Fixed |
| M-4 | Medium | `routes/assets.js` | File upload validates by extension only — MIME type not checked | ✅ Fixed |
| M-5 | Medium | `routes/parts.js` | GET `/enterprise/low-stock` is unreachable — defined after `/:id` route | ✅ Fixed |
| M-6 | Medium | `routes/analytics.js` | `sanitizePlantId()` defined but not called in `/narrative` handler | ✅ Fixed |
| M-7 | Medium | `routes/analytics.js` | Plant name replace uses non-global regex — first underscore only | ✅ Fixed |
| M-8 | Medium | `routes/database.js` | Snapshot listing auth check placed after filesystem read | ✅ Fixed |
| M-9 | Medium | `routes/enrichment.js` | `execFile` calls have no timeout — hung Python process blocks indefinitely | ✅ Fixed |
| L-1 | Low | `routes/database.js` | `req.user.role` stale field checked alongside `req.user.globalRole` | ✅ Fixed |
| L-2 | Low | `routes/assets.js` | 500 error messages have trailing `: ` — actual error not surfaced | ✅ Fixed |
| L-3 | Low | `routes/auth.js` | `validatePassword()` not called in `/register` endpoint | ✅ Fixed |
| L-4 | Low | `validators.js` | Work order whitelist uses `WorkTypeID` but DB column is `TypeID` | ✅ Fixed |
| L-5 | Low | `routes/analytics.js` | `NON_PLANT` set has `'schema_template'` duplicated | ✅ Fixed |
| I-1 | Info | Multiple | `require()` called inside request handlers on every request | ℹ️ Noted |
| I-2 | Info | `routes/assets.js` | `console.log` dumps full SQL WHERE clause and params on every request | ℹ️ Noted |
| I-3 | Info | `routes/auth.js` | `req.user.username` vs `req.user.Username` case inconsistency in audit log calls | ℹ️ Noted |
| I-4 | Info | `enrichment_engine.js` | Python binary hardcoded to `python` — should be `python3` or `PYTHON_PATH` env | ℹ️ Noted |

---

## Critical Findings

### C-1 — Login Privilege Escalation via it_admin Fallback
**File:** `server/routes/auth.js`  
**Severity:** Critical — **Fixed**

The login flow contained a fallback block: if a username was not found in Users or as `${username}_user`, the code fetched the `it_admin` account and compared the submitted password against its hash. On success it set `user = adminUser`, then the password comparison block below re-compared the same password against the same hash and issued an `it_admin` JWT. Any actor who knew the admin password could log in as it_admin under any unrecognized username.

**Resolution:** The entire fallback block was removed. An unrecognized username now immediately logs a `LOGIN_FAILURE` audit entry and returns 401. No password comparison is performed when the user does not exist.

---

### C-2 — Shell Command Injection in Enrichment Engine
**File:** `server/enrichment_engine.js`  
**Severity:** Critical — **Fixed**

The background enrichment cron built a shell command string by interpolating `id` and `manuf` directly:
```js
const cmd = `${pythonPath} "${scriptPath}" enrich "${id}" "${manuf || ''}"`;
exec(cmd, ...);
```
Values containing `"`, `;`, `|`, or backticks from Part records would be executed by the shell.

**Resolution:** Replaced `exec` with `execFile`. Arguments are now passed as a discrete array — no shell is invoked and metacharacters in values are inert. A 30-second timeout was also added so a hung process does not block the cron indefinitely:
```js
execFile(pythonPath, [scriptPath, 'enrich', id, manuf || ''], { timeout: 30000 }, (error) => { ... });
```

---

## High Findings

### H-1 — Login Error Messages Enable Username Enumeration
**File:** `server/routes/auth.js`  
**Severity:** High — **Fixed**

Two distinct 401 messages allowed attackers to determine whether a username existed:
- User not found: `'Invalid username or location'`
- Wrong password: `'Invalid password'`

**Resolution:** Both failure paths now return `'Invalid credentials'`. The internal audit log still records the real reason (`'User not found'` / `'Invalid password'`) for operator visibility, but nothing distinguishing is returned to the caller.

---

### H-2 — LDAP TLS Certificate Not Verified
**File:** `server/routes/auth.js`  
**Severity:** High — **Fixed**

The LDAP client was created with `tlsOptions: { rejectUnauthorized: false }`, accepting any certificate including attacker-controlled ones. This enabled MITM interception of LDAP bind credentials on the intranet.

**Resolution:** Changed to `rejectUnauthorized: !config.TLSIgnoreCert`. Secure by default (`true`). An admin can set `TLSIgnoreCert = 1` in the `ldap_config` row for environments that genuinely use self-signed domain controller certificates — an explicit, auditable opt-out rather than an invisible insecure default.

---

### H-3 — Part Delete Authorization Uses Wrong JWT Claim
**File:** `server/routes/parts.js`  
**Severity:** High — **Fixed**

The delete handler read `req.user?.DefaultRole` (a database column name) instead of `req.user?.globalRole` (the actual JWT claim). `DefaultRole` is always `undefined` in the JWT, so `userRole` was always `'technician'` and the first guard always blocked. The only functional bypass was `req.user?.Username === 'Doug Trier'` — a hardcoded personal name that also didn't match the JWT (`Username` is `'creator'`, not `'Doug Trier'`). In practice, nobody could delete parts.

**Resolution:** Changed to `req.user?.globalRole` and `req.user?.globalRole === 'creator'`. Both it_admin and creator accounts can now actually delete parts as intended.

---

### H-4 — Plant ID Used as Filesystem Path Without Sanitization
**File:** `server/routes/database.js`  
**Severity:** High — **Fixed**

`plant.id` from the PUT `/plants` request body was used directly in `path.join(dataDir, `${plant.id}.db`)` without validation. A crafted value like `../../../etc/injected` could have resolved outside the data directory.

**Resolution:** Added a `SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/` regex check before any path is constructed. Invalid IDs are skipped with a server-side warning. A secondary boundary check (`path.resolve(newDbPath).startsWith(path.resolve(dataDir))`) catches any edge case that passes the regex.

---

## Medium Findings

### M-1 — Debug Log File Left in Production Code
**File:** `server/routes/parts.js`  
**Severity:** Medium — **Fixed**

The `GET /api/parts` error handler called `fs.appendFileSync('error_debug.log', ...)`, writing the error message, stack trace, and full `req.query` (including user search terms) to a relative-path file with no size limit.

**Resolution:** Removed the `fs.appendFileSync` block entirely. The `console.error` call directly above it already captures everything useful in the server log stream, which has proper rotation.

---

### M-2 — Hub Token Stored in localStorage (XSS Accessible)
**File:** `server/routes/auth.js`, `server/index.js`  
**Severity:** Medium — **Fixed**

The hub token was signed with the same `JWT_SECRET` as the main session and had a 7-day expiry. It was returned in the response body (not an httpOnly cookie) and stored in localStorage, making it readable by any XSS. The architecture requires this — the PWA needs the token for LAN hub WebSocket connections when offline and cannot use httpOnly cookies for that path.

**Resolution:** Two mitigations applied:
1. The hub token is now signed with `process.env.HUB_TOKEN_SECRET || JWT_SECRET`. When a dedicated secret is configured, a stolen localStorage token cannot be replayed against the main API (different key = different attack surface).
2. Expiry reduced from `7d` to `24h`. Plant floor users log in daily, so offline sessions longer than 24h are rare; the shorter window limits stolen-token utility.
`lan_hub.start()` in `index.js` was updated to match: `jwtSecret: process.env.HUB_TOKEN_SECRET || process.env.JWT_SECRET`.

---

### M-3 — WHERE Clause Quote Stripping Before SQL
**File:** `server/routes/assets.js`  
**Severity:** Medium — **Fixed**

The all-sites asset query appended `.replace(/"/g, '')` to the WHERE clause before concatenating it into SQL. The double-quotes are column identifier quotes (e.g., `"IsDeleted" = 1`), not value quotes — stripping them removed safety quoting from column names and could break queries on columns that are SQLite reserved words.

**Resolution:** Removed the `.replace(/"/g, '')` call. All values remain bound via `?` placeholders; the column identifier quotes are preserved as intended.

---

### M-4 — File Upload Filter Validates by Extension Only
**File:** `server/routes/assets.js`  
**Severity:** Medium — **Fixed**

The multer `fileFilter` only checked the file extension, allowing any file renamed to `.jpg` to pass validation and be stored in `data/uploads/assets/`.

**Resolution:** The filter now requires both a valid extension AND a matching MIME type — both conditions must pass. Added `image/heif` alongside `image/heic` since browsers report HEIC files under both MIME types:
```js
const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];
const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype)) cb(null, true);
```

---

### M-5 — `/enterprise/low-stock` Route Unreachable
**File:** `server/routes/parts.js`  
**Severity:** Medium — **Fixed**

`GET /enterprise/low-stock` was declared after `GET /:id`. Express matched the former as `/:id` with `id = 'enterprise'`, returning 404 since no part has that ID. The enterprise low-stock handler was never reached.

**Resolution:** Moved the handler to before `GET /:id`, matching the pattern of the correctly-placed `GET /next-id`. Added a comment marking the ordering requirement to prevent regression.

---

### M-6 — `sanitizePlantId()` Not Wired Into `/narrative`
**File:** `server/routes/analytics.js`  
**Severity:** Medium — **Fixed**

The `sanitizePlantId()` function was defined at the top of the file with an explicit `SEC-05` comment indicating it was meant for plant header sanitization, but the `/narrative` handler read `req.headers['x-plant-id']` directly without calling it. The raw value was used in cache keys and DB file path filtering.

**Resolution:** Applied the sanitizer: `const requestedPlant = sanitizePlantId(req.headers['x-plant-id']) || 'all_sites';`. An invalid or traversal-attempt value returns `null` from the sanitizer and safely falls back to `'all_sites'`.

---

### M-7 — Plant Name Underscore Replacement Non-Global
**File:** `server/routes/analytics.js`  
**Severity:** Medium — **Fixed**

`.replace('_', ' ')` with a string literal replaces only the first underscore. `Demo_Plant_1.db` became `Demo Plant_1` in narrative report entries instead of `Demo Plant 1`.

**Resolution:** Changed to `.replace(/_/g, ' ')` (global regex flag). All underscores in plant names are now replaced.

---

### M-8 — Snapshot Listing Auth Check After Filesystem Read
**File:** `server/routes/database.js`  
**Severity:** Medium — **Fixed**

The `GET /snapshots` handler performed a full `fs.readdirSync` and `fs.statSync` loop before checking whether the user had admin rights. An authenticated technician triggered real filesystem work before receiving a 403.

**Resolution:** Role check moved to the top of the handler — before any filesystem operations. Unauthorized users are rejected immediately.

---

### M-9 — `execFile` Calls Have No Timeout
**File:** `server/routes/enrichment.js`  
**Severity:** Medium — **Fixed**

All three `execFile` calls in the enrichment route had no `timeout` option. A hung Python process would never call the callback, leaving the HTTP request open indefinitely.

**Resolution:** Added `{ timeout: 15000 }` to the manufacturers list call and `{ timeout: 30000 }` to both enrich calls. A hung process is now killed and the callback fires with an error rather than blocking.

---

## Low Findings

### L-1 — Stale `req.user.role` in Auth Checks
**File:** `server/routes/database.js`  
**Severity:** Low — **Fixed**

Both the `PUT /plants` and `DELETE /plants/:id` handlers included `req.user.role !== 'it_admin'` in their conditions. `role` is not a JWT claim — the payload uses `globalRole`. The dead check evaluated as `undefined !== 'it_admin'` (always `true`) and added noise that could mislead future editors.

**Resolution:** Removed `req.user.role !== 'it_admin' &&` from both checks. The guards now read cleanly as `req.user.globalRole !== 'it_admin' && req.user.globalRole !== 'creator'`.

---

### L-2 — 500 Error Messages Have Trailing `: `
**File:** `server/routes/assets.js`  
**Severity:** Low — **Fixed**

Five error response strings ended with `: ` (e.g., `'Failed to fetch assets: '`), indicating the actual `err.message` was removed but the trailing colon-space was left behind.

**Resolution:** Cleaned up all five — fetch, create, update, delete, and restore. Trailing `: ` removed. The full error is still logged by `console.error` above each one.

---

### L-3 — Password Complexity Not Enforced on Self-Registration
**File:** `server/routes/auth.js`  
**Severity:** Low — **Fixed**

`validatePassword()` was imported but not called in the `/register` handler. Users could self-register with any password, bypassing the OWASP complexity rules (8+ chars, upper, lower, digit, special character) enforced everywhere else.

**Resolution:** Added `validatePassword(password)` check immediately after the `!username || !password` guard, before any DB operations. A failing password returns 400 with the specific requirement message.

---

### L-4 — Work Whitelist Uses Wrong Column Name
**File:** `server/validators.js`  
**Severity:** Low — **Fixed**

The work order whitelist included `WorkTypeID` — a database column name that does not exist in the `Work` table. The actual column is `TypeID`. Any PUT/POST sending `TypeID` had it stripped by the whitelist. Also missing: `CompDate` and `ReasonID`, both written during WO completion flows.

**Resolution:** Replaced `WorkTypeID` with `TypeID`. Added `CompDate` and `ReasonID` to the whitelist.

---

### L-5 — `NON_PLANT` Set Has Duplicate Entry
**File:** `server/routes/analytics.js`  
**Severity:** Low — **Fixed**

`'schema_template'` appeared twice in the `NON_PLANT` Set literal. Sets deduplicate silently so there was no runtime effect, but it was a copy-paste error.

**Resolution:** Removed the duplicate entry.

---

## Info Observations

These are code quality notes. No security risk; no immediate fix required.

### I-1 — `require()` Inside Request Handlers
**Files:** `routes/assets.js`, `routes/parts.js`, `routes/analytics.js`

`require('path')`, `require('fs')`, `require('better-sqlite3')` are called inside handler functions rather than at module top-level. Node.js caches `require()` after the first call so there is no performance penalty, but the pattern suggests incremental additions rather than planned structure. Worth hoisting when these files are next touched for other reasons.

---

### I-2 — SQL Diagnostic Log on Every Asset Request
**File:** `server/routes/assets.js`

```js
console.log(`🔍 Assets Query: WHERE [${whereClause}] Params: [${params}]`);
```

Fires on every `GET /api/assets` call. On a busy plant floor this generates significant log volume and exposes the SQL structure in log files. Should be removed or gated behind a `DEBUG` environment flag when the file is next touched.

---

### I-3 — Mixed Case in Audit Log Username Lookup
**File:** `server/routes/database.js`

```js
logAudit(req.user?.username || req.user?.Username || 'admin', ...);
```

The JWT payload uses `Username` (capital U). `req.user.username` is always `undefined` — the fallback to `req.user.Username` saves it, but the mixed-case chain is a latent bug for any future audit call that only checks `username`.

---

### I-4 — Python Binary Hardcoded to `python`
**Files:** `server/routes/enrichment.js`, `server/enrichment_engine.js`

```js
const pythonPath = 'python';
```

On modern Linux systems `python` is Python 2 or absent — Python 3 is invoked as `python3`. The enrichment engine would fail silently on a standard production Linux deployment. Should be changed to `process.env.PYTHON_PATH || 'python3'` to support both explicit override and the modern default.
