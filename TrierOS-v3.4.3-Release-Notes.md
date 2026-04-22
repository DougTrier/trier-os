# Trier OS v3.4.3 — Security Patch Release

**Release Date:** April 21, 2026
**Type:** Security Patch (server-side only — no database migrations required)
**Upgrade from v3.4.2:** Drop-in replacement. Restart the server. No data changes.

---

## Security Fixes

### Fix 1 — CRITICAL: Plant ID Override in LAN Hub (server/lan_hub.js)

**Severity:** Critical  
**Impact:** A device authenticated to one plant could inject scans into a different plant's database by supplying an arbitrary `plantId` in the WebSocket message body.

**Fix:** The hub now always derives `plantId` from the JWT-authenticated connection (`client.plantId`). Any message that supplies a `plantId` field differing from the connection's JWT-bound plant is silently rejected and logged as a `[SECURITY]` warning. Applies to both `SYNC_PENDING` and `SCAN` message handlers.

---

### Fix 2 — Login Rate Limiter Restored (server/index.js)

**Severity:** Medium  
**Impact:** The login rate limiter was set to `max: 500` — a test accommodation that was never reverted — creating a real brute-force window in production.

**Fix:** Default is now `8 attempts per 5 minutes per username`. For parallel E2E test environments, set `RATE_LIMIT_LOGIN_MAX=500` in the environment. A commented-out example is included in `.env`.

---

### Fix 3 — Hub-to-Central Replay HMAC Authentication (server/lan_hub.js + server/routes/scan.js)

**Severity:** High  
**Impact (a):** The LAN hub forwarded queued scans to `/api/scan/offline-sync` with no authentication header — any process that could reach the endpoint could replay arbitrary scan data without credentials.

**Impact (b):** The hub sent `{ scans: [...] }` but the route read `req.body.events`, causing every hub replay to silently return HTTP 400. Hub-originated scans have never been persisted via this path.

**Fix:** `replayToServer` now signs each request with `HMAC-SHA256(ts.nonce.plantId.canonicalBody)` using the shared `jwtSecret`. The route verifies the signature (5-minute timestamp window, timing-safe comparison) when `x-hub-replay: 1` is present. The `scans`/`events` field mismatch is also resolved — the route now accepts `req.body.events || req.body.scans`.

---

### Fix 4 — JWT Secret Fail-Fast in Production (server/index.js)

**Severity:** Medium  
**Impact:** On boot, if `JWT_SECRET` was missing or weak, the server auto-generated a new secret and wrote it to `.env`. In production this silently invalidated every active session. In multi-instance or read-only-filesystem deployments it could cause a boot loop or silent auth failure.

**Fix:** If `NODE_ENV=production` and the secret is missing or weak, the server logs a clear error and calls `process.exit(1)` rather than rewriting `.env`. The auto-generation behavior is preserved for development environments.

---

## Files Changed

| File | Change |
|---|---|
| `server/lan_hub.js` | Fix 1 (plantId), Fix 3a (HMAC signing in replayToServer) |
| `server/routes/scan.js` | Fix 3b (HMAC verification + scans/events unification) |
| `server/index.js` | Fix 2 (rate limiter), Fix 4 (JWT fail-fast) |

No frontend changes. No database schema changes. No migration required.

---

## Upgrade Instructions

### From v3.4.2 (portable or production build)
1. Replace the `server/` directory with the v3.4.3 version.
2. Verify `.env` has a strong `JWT_SECRET` (64+ hex characters).
3. Restart: `runtime\node.exe server\index.js` (or `Trier OS.bat`).

### From source
```bash
git pull origin main
# Server restarts automatically if using npm run dev
```

---

## Build Artifacts

| Artifact | Description |
|---|---|
| `TrierOS-v3.4.3.zip` | Portable build — full demo data, self-contained Node.js runtime |
| `TrierOS-v3.4.3-production.zip` | Production build — clean databases, Creator account only |
