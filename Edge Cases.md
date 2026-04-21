# Trier OS — Edge Cases & Offline Resilience Audit
> Focused on: **What breaks at a plant if the central server (HQ) goes down?**
> Audited: 2026-04-21 | Severity: 🔴 Critical · 🟡 Major · 🟢 Minor

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical — plant halts or loses scan data | 8 |
| 🟡 Major — degrades plant function | 6 |
| 🟢 Minor — UX friction, no data loss | 8 |

---

## 🔴 Critical Issues

---

### C1 — Hub Token Expires Mid-Shift, Plant Goes Dark
**Files:** `src/utils/LanHub.js:37-41`, `src/components/LoginView.jsx:154-157`, `server/lan_hub.js:343-348`

**What happens:**
- Tech logs in; server issues a `hubToken` and stores it in localStorage
- Server goes down while the token is still valid — hub connects fine
- Token expires **while the server is still down** (hub is the only path)
- Hub rejects the WebSocket on next reconnect attempt (401)
- `submitScan()` returns `false`; scan falls to IndexedDB queue silently
- Tech sees "saved offline" banner and thinks the scan went through — it didn't

**Why it's stop-work:**
The PWA has no way to tell the tech the hub is gone. Scans pile up on the device and never reach anyone. If the tech's device dies, those scans are lost.

**Fix:** Before calling `submitScan()`, check token age against its `exp` claim. If expired, skip hub and fall back to IndexedDB-only queue. Show amber banner: *"Hub unavailable — scanning in local-only mode."*

---

### C2 — Login Hangs Forever When Server Is Down
**File:** `src/components/LoginView.jsx:118-166`

**What happens:**
- Day shift arrives; server is down
- Tech clicks "Sign In"; POST `/api/auth/login` has **no timeout**
- Browser waits 30–90 seconds before throwing a network error
- Error message: *"Unable to reach the server"* — no offline path offered
- Tech cannot log in at all; plant is dead until server returns

**Fix:**
1. Add a 3-second `AbortController` timeout to the login fetch
2. If login fails AND localStorage has a cached credential hash for that username, offer offline login (bcrypt hash stored at last successful login)
3. Offline-logged-in users get a persistent amber banner: *"Offline mode — scans will sync when server returns"*

---

### C3 — Auth Session Accepted With No Validation
**File:** `src/App.jsx:206-224`

**What happens:**
- Server goes down; tech's JWT cookie is still valid
- On app reload, `/api/auth/me` fails (server down)
- Catch block checks: `!!(localStorage.getItem('userId'))` — if truthy, sets `isAuthenticated = true`
- **Any user who edits localStorage can impersonate any other user offline**
- All scans are attributed to the wrong person

**Fix:** At login, store a HMAC of `userId + nativePlantId` signed with a device-local secret. On offline auth, verify this HMAC rather than just checking if a key exists.

---

### C4 — Asset Lookup Falls Through Silently When Server Is Down
**File:** `src/App.jsx:617-636`

**What happens:**
- Tech scans a barcode
- App tries `fetch('/api/assets/PUMP-001')` with no timeout
- Server down → request hangs, then throws
- `catch {}` swallows the error and navigates to the scanner anyway
- Scanner submits with whatever offline prediction it can make
- If the asset has never had a work order, prediction returns `ASSET_NOT_FOUND`
- Scan is queued with no valid asset ID — effectively lost

**Fix:** Fall back to `OfflineDB.getAll('assets')` for lookup. If the asset is found in cache, proceed normally. If not found anywhere, show a modal: *"Asset not found in offline cache — verify the barcode."*

---

### C5 — Work Segment Cache Goes Stale; Wrong Branch Predicted
**Files:** `src/utils/OfflineDB.js:269-284`, `src/App.jsx:563-571`

**What happens:**
- Work segments (who is actively working on what) are cached at login
- Periodic refresh runs every 15 minutes — but **only if the server is reachable**
- If server goes down at 8 AM and Tech 1 closes their segment at 9 AM:
  - Tech 2's device still shows Tech 1 as active (stale cache)
  - Tech 2 scans same asset, gets `OTHER_USER_ACTIVE` context
  - UI shows *"Join existing work"* — but that work order is already closed
  - Action fails silently on server sync

**Fix:** When returning from hub `WO_STATE_CHANGED` events, update the work_segments cache in IndexedDB immediately (`_updateLocalCache` already patches work_orders but not segments). Add segment patch to that function.

---

### C6 — Dual-Device AUTO_CREATE Conflict Creates Duplicate Work Orders
**Files:** `server/lan_hub.js:280-282`, `src/utils/OfflineDB.js:436-512`

**What happens:**
- Server is down; two techs both offline at same plant
- Tech 1 scans "PUMP-001" (no active WO) → hub predicts `AUTO_CREATE_WO`
- Tech 2 scans "PUMP-001" 3 seconds later → also gets `AUTO_CREATE_WO`
- Hub sets `_conflictDetected: true` on the second scan but **does not block it**
- Both get `SCAN_ACK` confirmations
- When server comes back, both scans replay → **two open WOs for the same equipment**

**Fix:** Hub should reject the second `AUTO_CREATE` for the same `assetId` within a 30-second window. Return an error `SCAN_ACK` with message: *"Another technician is creating a work order for this asset."* Allow Join instead.

---

### C7 — Hub Crash Splits Scan Queue Across Two Locations
**Files:** `server/lan_hub.js:315-385`, `src/utils/LanHub.js:68-108`

**What happens:**
- Server down, plant running on hub
- Hub crashes (memory, port conflict, etc.)
- Scans before the crash: in hub's SQLite `OfflineScanQueue`
- Scans after the crash: in each device's IndexedDB
- Hub restarts; its queue replays to server when server returns
- Each device replays its own queue
- **Result:** Two separate queues, no deduplication, potential duplicates or gaps

**Fix:** When the hub comes back online and a PWA reconnects, hub should request the PWA's pending `scanId` list and cross-check against its own queue. Dedup on `scanId` before replaying to server.

---

### C8 — Scan Session Lost If App Crashes During Submission
**File:** `src/components/ScannerWorkspace.jsx:49-70`

**What happens:**
- Tech submits a scan; app is in "submitting" state
- Session save only fires when `step` changes to `'prompt'` (after response received)
- App crashes during the in-flight request
- On reload, `scanSession` is null (nothing was saved for `submitting` state)
- Tech has to re-scan from scratch; no indication the previous scan may have gone through

**Fix:** Save session to IndexedDB the moment submission begins (before the fetch), with a `submittedAt` timestamp. On reload, if a `submitting` session is found that is less than 60 seconds old, show: *"Your last scan may not have completed — do you want to check status or re-scan?"*

---

## 🟡 Major Issues

---

### M1 — Race Condition: Duplicate Scans on Server Reconnect
**Files:** `src/main.jsx:334-354`, `src/utils/LanHub.js:76-87`

**What happens:**
- Tech submits scan; fetch fails; scan goes into IndexedDB queue
- 2 seconds later, server comes back; `LanHub._replayQueue()` fires immediately on connect
- The same scan is replayed through the hub AND through the normal IndexedDB offline-sync path
- Server may receive the same `scanId` twice

**Current protection:** Server deduplicates on `scanId` — this prevents double-processing, but wastes a roundtrip and could cause a second 409 that confuses the retry logic.

**Fix:** When hub reconnects and replays the queue, mark those entries in IndexedDB as `status: 'hub-submitted'` so the normal sync path skips them.

---

### M2 — Status ID Codes Are Hardcoded; Schema Change Breaks Prediction
**Files:** `src/utils/OfflineDB.js:440-442`, `server/lan_hub.js:116-119`

**What happens:**
- `predictBranch()` filters work orders by `[30, 20].includes(Number(w.StatusID))`
- These match `IN_PROGRESS=30`, `OPEN=20` in the current DB
- If a migration ever renumbers these or adds new statuses, the offline prediction silently breaks
- Techs get wrong branch decisions (e.g., routed to create a new WO when one is already open)

**Fix:** Cache the status lookup table in IndexedDB at login (`GET /api/config/statuses`). Use symbolic names (`STATUS.IN_PROGRESS`) resolved from that cache in `predictBranch()`.

---

### M3 — Sync Queue Conflicts Not Surfaced to User
**File:** `src/utils/OfflineDB.js:367-417`

**What happens:**
- Tech works offline; 5 scans queued
- On reconnect, scans 1, 2, 4, 5 succeed; scan 3 returns `409 CONFLICT` (WO already closed)
- Error is caught, logged to console; scan 3 is marked failed in IndexedDB
- **Tech has no idea scan 3 was rejected; work may be incomplete**

**Fix:** After queue replay completes, if any scans failed, show a persistent notification: *"2 offline scans had conflicts — tap to review."* Link to a simple list of the failed scan IDs and reasons.

---

### M4 — No Offline Fallback for Branding / Config
**File:** `src/App.jsx` (branding fetch)

**What happens:**
- App fetches company logo, colors, plant name from server on load
- Server is down → branding fails; UI may show blank logo or fall back to defaults
- Plant name in the header may read "Plant 1" (the DB key) instead of the configured display name

**Fix:** Cache branding and plant config in IndexedDB at login as part of `fullCacheRefresh()`. On load failure, use cached values.

---

### M5 — Offline Asset Lookup Returns Incomplete Data
**File:** `src/utils/OfflineDB.js:501-512`

**What happens:**
- `predictBranch()` finds the asset in the local `assets` store
- But the `assets` cache is populated from `/api/assets` which returns a subset of fields
- Location, maintenance history, criticality score are not included
- Tech sees asset name but not location — has to physically search for the equipment

**Fix:** Ensure the asset cache payload includes Location, AssetTag, and CriticalityScoreTotal at minimum.

---

### M6 — Periodic Cache Refresh Fails Silently
**File:** `src/App.jsx:563-571`

**What happens:**
- `fullCacheRefresh()` runs every 15 minutes via `setInterval`
- If the server is down, it throws and is swallowed by `.catch(() => {})`
- No indicator that the cache is now stale; tech has no idea how old their data is

**Fix:** Track `lastSuccessfulRefresh` in IndexedDB. Show a subtle banner on Mission Control: *"Offline data last updated 2h ago"* so techs know to be cautious.

---

## 🟢 Minor Issues

---

### m1 — Confirmation Overlay Cannot Be Dismissed Early
**File:** `src/components/ScanCapture.jsx:232-236`
Tech scans wrong asset; 1-second confirmation overlay plays out with no cancel. Add tap-to-dismiss.

### m2 — LAN Hub IP Becomes Invalid If Network Changes
Hub IP is cached at login. If the plant switches WiFi networks (e.g., maintenance on main AP), the stored IP is wrong with no way to update short of re-logging in. Add a manual "Reconnect to Hub" button in the offline status bar.

### m3 — Hub JWT Claims Not Fully Verified
`server/lan_hub.js:344` verifies the JWT signature but does not check the `exp` claim separately. A token with a forged far-future `exp` would pass. Use `jwt.verify()` with `{ ignoreExpiration: false }` explicitly.

### m4 — No Rate Limiting on Sync Queue Replay
After a long outage, a device might replay 200 scans instantly. Add a 100ms delay between replayed requests to avoid spiking the server on reconnect.

### m5 — Case Sensitivity in Asset ID Matching
`String(a.ID) === String(assetId)` is case-sensitive. A barcode scanner returning `pump-001` vs `PUMP-001` will miss the cache entry. Normalize both to uppercase before comparison.

### m6 — Malformed Hub Messages Silently Dropped
`LanHub.js:91` catches JSON parse errors silently. After 3+ consecutive parse failures, log a warning and surface it in the Plant Network status panel so IT can detect a corrupt hub.

### m7 — Work Segment Cache Update Doesn't Handle Unknown Branches
`LanHub._updateLocalCache()` maps branch names to StatusID values with a hardcoded object. An unknown branch leaves StatusID unchanged, which may be wrong. Fall through to `null` and skip the patch rather than leaving stale data.

### m8 — Session Restore Error Is Swallowed
`ScannerWorkspace.jsx:60` — if `OfflineDB.getMeta()` throws (corrupt IndexedDB), the catch is silent. Tech gets no warning. Show: *"Could not restore previous session."*

---

## Remediation Priority Order

| Priority | Fix | Est. Time |
|----------|-----|-----------|
| 1 | C2 — Login timeout + offline login path | 2h |
| 2 | C1 — Hub token expiry check + amber banner | 1h |
| 3 | C6 — Block second AUTO_CREATE on hub | 1h |
| 4 | C4 — Asset lookup offline fallback | 1h |
| 5 | C8 — Save session on submit start | 45m |
| 6 | C3 — Auth validation (HMAC) | 2h |
| 7 | C5 — Patch work segments on WO_STATE_CHANGED | 1h |
| 8 | M3 — Surface sync conflicts to user | 1h |
| 9 | C7 — Hub/device queue deduplication | 2h |
| 10 | M1 — Mark hub-submitted scans in IndexedDB | 45m |
| 11 | M2 — Cache status ID table | 1h |
| 12 | M6 — Show cache staleness indicator | 30m |

---

*This document is a living audit. Check off items as they are fixed and re-audit after major changes to the offline/scan flow.*
