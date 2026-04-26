<!-- Copyright © 2026 Trier OS. All Rights Reserved. -->

# Trier OS — Architecture Invariants

Invariants are correctness guarantees the system must never violate, regardless of
network conditions, concurrency, or hardware failures. Each invariant is stated as
a formal rule, tied to where it is enforced, and cross-referenced to its test coverage.

Enforcement status reflects findings from `High Risk Edge Cases.md` (2026-04-26).

---

## Enforcement Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Enforced at this layer |
| ⚠️ | Partially enforced — gap documented |
| ❌ | Not enforced at this layer |
| — | Not applicable at this layer |

---

## I-01 · Part Return Cannot Exceed Issued Quantity

```
INVARIANT: qty_returned ≤ qty_issued   for every WorkParts row
```

**Why it exists:** Returning more parts than were issued creates negative inventory and corrupts the audit trail. Stock can become a positive number that no longer reflects physical reality.

**Failure scenario:** Tech A issues 5 units offline. Tech B returns 8 units online before the issue syncs. Stock is incremented by 8 with no corresponding issue record.

| Layer | Enforcement | Status |
|-------|------------|--------|
| DB constraint | `CHECK (qty_returned <= EstQty)` on WorkParts | ❌ Missing |
| Service — online path | `returnable` check before `return-part` transaction (`scan.js:1585`) | ⚠️ Check is outside the transaction (TOCTOU) |
| Service — offline path | Same return-part logic; no additional guard | ⚠️ Same gap |
| UI | Parts return UI limits qty to `returnable` | ✅ |

**Enforcement gap:** The `returnable` check must move inside the transaction body after acquiring the write lock. A DB-level `CHECK` constraint is the safety net.

**Test that proves it:** `qa-quality.spec.js` — "inspection result submission auto-creates WO on Fail" exercises the parts flow. A targeted test is needed: issue qty=5, attempt return of qty=6, expect 400.

**Reference:** `High Risk Edge Cases.md` — Cases 4 and 5.

---

## I-02 · Part Stock Is Never Negative

```
INVARIANT: Part.Stock ≥ 0   at all times
```

**Why it exists:** Negative stock is physically impossible and indicates a double-return, a race condition, or a missed issue record.

**Failure scenario:** Two devices return the last remaining qty simultaneously. Both pass the pre-transaction check. Both commit. Stock goes below zero.

| Layer | Enforcement | Status |
|-------|------------|--------|
| DB constraint | None | ❌ Missing |
| Service | `COALESCE("Stock",0) >= qty` guard in costLedger (`costLedger.js:167`) | ✅ |
| Service | `returnable` boundary in return-part | ⚠️ TOCTOU (see I-01) |
| UI | — | — |

**Enforcement gap:** Add `CHECK (Stock >= 0)` to the Part table schema. This makes SQLite the last line of defense if a race bypasses the service-layer check.

**Test that proves it:** Concurrent return of identical qty from two connections; verify `Part.Stock` never goes negative and second request receives a 400.

**Reference:** `High Risk Edge Cases.md` — Case 5.

---

## I-03 · Offline Events Replay in Device-Timestamp Order

```
INVARIANT: within a single WO lifecycle,
           event[n].deviceTimestamp < event[n+1].deviceTimestamp
           when replayed
```

**Why it exists:** The scan state machine is a sequential state machine. If a WO close replays before its part-issue events, the state machine transitions to a terminal state with incomplete history. Work records, inventory counts, and outcome tracking all derive from this sequence.

**Failure scenario:** Network returns events in arrival order rather than capture order. WO close processes first. Part issue is then rejected as invalid against a closed WO. The issued parts are never recorded. Inventory is incorrect. Outcome window may be wrong.

| Layer | Enforcement | Status |
|-------|------------|--------|
| DB constraint | — | — |
| Service — offline-sync | No timestamp-based sort before processing (`scan.js:1289`) | ❌ Missing |
| Service — audit timestamps | Server writes `datetime('now')`, not `deviceTimestamp` (`scan.js:1173`) | ❌ Wrong timestamp source |
| UI — queue capture | Events captured with `deviceTimestamp` at scan time | ✅ |

**Enforcement gap (Critical):** Sort events by `deviceTimestamp` ascending before the processing loop at `scan.js:1289`. Write `deviceTimestamp` as the semantic audit timestamp instead of `datetime('now')`.

**Test that proves it:** Submit an offline-sync batch with events in reverse chronological order; verify the resulting WO history reflects device-capture order, not submission order.

**Reference:** `High Risk Edge Cases.md` — Case 3 (Critical).

---

## I-04 · A Scan ID Is Processed Exactly Once

```
INVARIANT: ∀ scanId, exactly one WO action results
```

**Why it exists:** Duplicate scan processing creates duplicate work orders, duplicate part issues, or duplicate receiving events — any of which corrupts operational state.

**Failure scenario:** Same barcode arrives via hardware wedge and camera scanner within 200ms. Both carry different `scanId` UUIDs. Both race through the pre-check SELECT before either inserts. Both attempt to create a WO.

| Layer | Enforcement | Status |
|-------|------------|--------|
| DB constraint | `UNIQUE INDEX` on `ScanAuditLog.scanId` (`scan.js:117`) | ✅ |
| Service | Pre-check SELECT + `.immediate()` re-check inside transaction (`scan.js:284`, `725`) | ✅ |
| Service — exception handling | UNIQUE constraint error caught but not mapped to idempotency response (`scan.js:818`) | ⚠️ Returns 500 instead of structured idempotency response |
| UI | No frontend dedup guard | ❌ |

**Enforcement gap:** Detect `SQLITE_CONSTRAINT_UNIQUE` in the catch block at `scan.js:818` and return a clean idempotency response (200 or 409) rather than a 500.

**Test that proves it:** `gatekeeper-g6.spec.js` — duplicate requestId test. Extend to cover concurrent scan dedup via the HTTP scan endpoint.

**Reference:** `High Risk Edge Cases.md` — Case 1.

---

## I-05 · Only One Scanner Owns Input at a Time

```
INVARIANT: at most one scan input handler is active per browser session
```

**Why it exists:** Two active scan handlers processing the same hardware input simultaneously can create duplicate WO actions, conflicting UI state, or phantom scan events in an unrelated workflow.

**Failure scenario:** User is on `/scanner` (ScanCapture active). Hardware wedge fires. `App.jsx` guard checks `isScannerOpenRef.current` (false) and `window.trierActiveScannerInterceptor` (unset — ScanCapture never sets it). Global scanner opens. Both process the same barcode.

| Layer | Enforcement | Status |
|-------|------------|--------|
| DB constraint | Covered by I-04 (scanId uniqueness) | ✅ |
| Service | — | — |
| App orchestration | Guard at `App.jsx:625` checks `trierActiveScannerInterceptor` | ⚠️ Flag exists but ScanCapture never sets it |
| Component | ScanCapture keeps hidden input focused for wedge routing | ⚠️ Focus strategy not backed by ownership claim |

**Enforcement gap (2 lines):** `ScanCapture.jsx` must set `window.trierActiveScannerInterceptor = true` on mount and clear it on unmount. This closes the gap with minimal change.

**Test that proves it:** Mount ScanCapture, fire `hw-scan-inject`, verify GlobalScanner does not open and the event is handled exclusively by ScanCapture.

**Reference:** `High Risk Edge Cases.md` — Case 15.

---

## I-06 · WO Lifecycle Transitions Are Monotonic

```
INVARIANT: WO state transitions follow OPEN → IN_PROGRESS → CLOSED
           No backwards transitions without explicit supervisor override
```

**Why it exists:** A WO that moves backwards in state (e.g., from CLOSED back to OPEN without an explicit reopen) corrupts outcome tracking, audit trails, and technician dispatch logic.

**Failure scenario:** Offline replay sends a WO open event after its close event due to ordering failure (see I-03). Without monotonic enforcement, the WO could appear to reopen itself.

| Layer | Enforcement | Status |
|-------|------------|--------|
| DB constraint | None | ❌ |
| Service — scan state machine | State transitions validated in `scan.js` (`IDLE → ACTIVE → WAITING → CLOSED`) | ✅ |
| Service — offline path | Dependent on I-03 (replay ordering) | ⚠️ |
| UI | Status badges reflect state; no backwards navigation offered | ✅ |

**Enforcement gap:** Fixing I-03 (replay ordering) resolves the primary failure path here. A DB `CHECK` constraint on `WorkOrders.Status` allowed transitions would add a hard backstop.

**Test that proves it:** Attempt to set `Status = 'OPEN'` on a closed WO directly via API; expect 400 or 403.

---

## I-07 · Outcome Window Uses Event Timestamp, Not Sync Timestamp

```
INVARIANT: resolution window = f(WO.CompletedAt), not f(row.InsertedAt)
```

**Why it exists:** A follow-up WO created offline within the resolution window must still count as a reopen, even if it syncs hours later. Using sync timestamp would incorrectly mark the original WO as Resolved=1.

**Failure scenario:** WO closes at 10:00. Follow-up created offline at 10:05 (within a 15-min window). Tech doesn't sync until 11:00. If the window is checked against sync time, the follow-up fails the check and the original is permanently marked resolved — hiding a recurring failure.

| Layer | Enforcement | Status |
|-------|------------|--------|
| DB constraint | — | — |
| Service — outcomeTracker | Window computed from `WO.CompletedAt` (`outcomeTracker.js:121–125`) | ✅ |
| Service — expiration cron | Anchored to `CompletedAt` via SQLite datetime arithmetic (`outcomeTracker.js:165`) | ✅ |
| Offline sync | `openedAt` from device timestamp passed at sync time (`scan.js:800`) | ✅ |

**Status: COVERED.** All enforcement paths use event timestamps. No action required.

**Test that proves it:** `qa-advanced.spec.js` — causality chain tests exercise the outcome window.

**Reference:** `High Risk Edge Cases.md` — Case 6.

---

## I-08 · Plant Queries Are Scoped to the Authenticated Plant

```
INVARIANT: a request authenticated to Plant_1 can never read or write Plant_2 data
```

**Why it exists:** Per-plant SQLite databases are the isolation boundary. A leak allows one plant to read another plant's asset data, work history, safety records, or personnel data — a serious confidentiality and operational integrity failure.

| Layer | Enforcement | Status |
|-------|------------|--------|
| DB isolation | Separate SQLite files per plant | ✅ |
| Service — middleware | `AsyncLocalStorage` set from `x-plant-id` header before all routes (`index.js:401–406`) | ✅ |
| Service — db resolution | `getDb()` resolves from `AsyncLocalStorage` context; no route can pass a raw path (`database.js:93`) | ✅ |
| Cache | Cache keys scoped by `plantId:assetId` (`explainCache.js:30`) | ✅ |
| Auth | Plant-role jail in auth middleware as secondary layer (`auth.js:132`) | ✅ |

**Status: COVERED.** `AsyncLocalStorage` context is set before routes and cannot be overridden per-request. No action required.

**Test that proves it:** `qa-corporate.spec.js` — role enforcement tests. Extend to send `x-plant-id: Plant_2` on a Plant_1-authenticated session and verify 404 or 403.

**Reference:** `High Risk Edge Cases.md` — Case 8.

---

## I-09 · Unknown Barcode Resolution Is Idempotent

```
INVARIANT: resolving an unknown barcode applies stock update exactly once
```

**Why it exists:** An admin resolving a `needsReview` barcode event must trigger exactly one stock increment. Calling the resolution endpoint twice (double-click, retry) must not double-credit stock.

**Failure scenario:** Admin resolves unknown barcode. Network hiccup causes a retry. Second POST applies the stock update again. Inventory shows ghost stock that was never physically received.

| Layer | Enforcement | Status |
|-------|------------|--------|
| DB constraint | No guard on re-apply | ❌ |
| Service — resolution endpoint | **Resolution endpoint does not exist** | ❌ |
| Service — applyStockUpdate | No existence check before incrementing stock | ❌ |
| UI | Admin review queue exists (GET); no resolve action | ❌ |

**Enforcement gap:** Implement `POST /api/offline/receiving-events/:eventId/resolve`. Inside a transaction: verify `syncStatus = 'needsReview'`, update to `accepted`, call `applyStockUpdate`. Add a UNIQUE constraint on the inventory movement for this event to prevent double-apply.

**Test that proves it:** POST resolve twice for the same eventId; verify stock increments by exactly 1× qty and the second POST returns an idempotency response.

**Reference:** `High Risk Edge Cases.md` — Case 10.

---

## I-10 · PM Is Acknowledged by Exactly One Technician

```
INVARIANT: ∀ PM, |acknowledgements| ≤ 1
```

**Why it exists:** If two technicians both believe they own a PM, both may dispatch to the same machine, creating duplicated labor, missed PMs elsewhere, and conflicting work segment records.

**Failure scenario:** Two techs tap "Acknowledge" at exactly the same time. Both pass the SELECT existence check (none exists yet). Both INSERT. Two acknowledgement records exist for the same PM. Both techs are dispatched.

| Layer | Enforcement | Status |
|-------|------------|--------|
| DB constraint | No `UNIQUE(pm_id)` on `pm_acknowledgements` | ❌ Missing |
| Service | Check-then-insert pattern without IMMEDIATE transaction (`pmAcknowledge.js:67–84`) | ⚠️ TOCTOU window |
| UI | "Already claimed" response shown to second requester | ✅ (when service-layer check fires) |

**Enforcement gap:** Add `UNIQUE(pm_id)` to `pm_acknowledgements` via migration. Map the resulting UNIQUE constraint error in the catch block to `{ alreadyClaimed: true }`. This is a one-migration, one-catch-block change.

**Test that proves it:** Send two simultaneous POST requests to the acknowledge endpoint for the same PM; verify exactly one succeeds and the other returns `alreadyClaimed: true`.

**Reference:** `High Risk Edge Cases.md` — Case 11.

---

## I-11 · WO Cannot Close with Untracked Issued Parts

```
INVARIANT: WO close records the disposition of every issued part
           (used, returned, or supervisor-overridden with reason)
```

**Why it exists:** Parts issued to a WO are debited from stock. If a WO closes without returning or accounting for unused parts, those units disappear from inventory with no audit trail. This corrupts physical stock counts and makes audits impossible.

**Failure scenario:** Tech issues 5 units, uses 3, and closes the WO without returning the 2 unused. Stock shows 5 fewer units. The 2 units exist nowhere in the ledger.

| Layer | Enforcement | Status |
|-------|------------|--------|
| DB constraint | `WorkParts.status` column exists (`issued \| partial_return \| fully_returned`) | ✅ (data exists) |
| Service — WO close | No pre-close check for `qty_returnable > 0` (`v2_integration.js:588`) | ❌ Missing |
| Service — costLedger | Stock guard prevents negative stock but does not enforce return completeness | ⚠️ |
| UI — CloseOutWizard | No unresolved parts warning shown before close | ❌ Missing |

**Enforcement gap:** Add `GET /api/work-orders/:id/unresolved-parts` endpoint. Call it in `CloseOutWizard` before rendering the close step. Warn if any `qty_returnable > 0`. Offer: return unused parts, or supervisor override with reason (creates `RETURN_TO_STOCK` records with `supervisor_override` status).

**Test that proves it:** Issue parts to a WO, close without returning; verify a warning is surfaced and a clean close requires either a return or a supervisor override reason.

**Reference:** `High Risk Edge Cases.md` — Case 14.

---

## I-12 · Explain Cache Never Serves Cross-Plant State

```
INVARIANT: cache.get(plantId, assetId) returns data for plantId only
```

**Why it exists:** If a cache key collision or missing scope causes Plant_1's explain state to serve for Plant_2's request, technicians see incorrect NEXT actions — potentially dangerous in safety-critical scan contexts.

**Failure scenario:** Cache key is constructed without plant scope. `asset-PUMP-001` is present in both plants. Plant_2 warms the cache. Plant_1 reads the stale Plant_2 state.

| Layer | Enforcement | Status |
|-------|------------|--------|
| DB | Per-plant isolation (see I-08) | ✅ |
| Cache keys | `${plantId}:${assetId}` format (`explainCache.js:30`) | ✅ |
| Invalidation | `explainCache.invalidate(plantId, assetId)` always passes plantId | ✅ |

**Status: COVERED.** Plant-scoped cache keys enforced at all call sites. No action required.

---

## I-13 · Artifact Availability Is Explicitly Labeled

```
INVARIANT: every artifact response includes a source field:
           local | external | candidate
```

**Why it exists:** A technician opening an artifact link that requires internet access (or authentication) from an air-gapped plant floor gets a dead link with no explanation. In a safety-critical context this creates confusion and erodes trust.

| Layer | Enforcement | Status |
|-------|------------|--------|
| DB | `is_local`, `local_path`, `external_url` columns exist in `catalog_artifacts` | ✅ |
| Service — serve endpoint | Returns 404 for non-local artifacts (`catalog.js:1120`) | ✅ |
| Service — list endpoint | `/artifacts/for/:entityId` does not include `is_local` in response (`catalog.js:1239`) | ❌ Missing |
| UI | Frontend infers availability from URL presence (fragile) | ⚠️ |

**Enforcement gap:** Add `source: is_local ? 'local' : 'external'` to the `/artifacts/for/:entityId` response serialization. One line.

**Test that proves it:** Fetch `/artifacts/for/:entityId` with a mix of local and external artifacts; verify every row includes a `source` field.

**Reference:** `High Risk Edge Cases.md` — Case 13.

---

## Enforcement Coverage Summary

| Invariant | DB | Service | UI | Status |
|-----------|----|---------|----|--------|
| I-01 Part return ≤ issued | ❌ | ⚠️ | ✅ | PARTIAL |
| I-02 Stock ≥ 0 | ❌ | ✅ | — | PARTIAL |
| I-03 Offline event ordering | — | ❌ | ✅ | GAP — Critical |
| I-04 Scan processed once | ✅ | ⚠️ | ❌ | PARTIAL |
| I-05 One scanner owner | — | — | ⚠️ | GAP |
| I-06 WO transitions monotonic | ❌ | ✅ | ✅ | PARTIAL |
| I-07 Outcome uses event timestamp | — | ✅ | ✅ | COVERED |
| I-08 Plant query scoping | ✅ | ✅ | ✅ | COVERED |
| I-09 Barcode resolution idempotent | ❌ | ❌ | ❌ | GAP |
| I-10 PM acknowledged once | ❌ | ⚠️ | ✅ | PARTIAL |
| I-11 WO close accounts for parts | ❌ | ❌ | ❌ | GAP |
| I-12 Cache plant-scoped | — | ✅ | — | COVERED |
| I-13 Artifact source labeled | ✅ | ⚠️ | ⚠️ | PARTIAL |

---

## Hardening Roadmap (by enforcement layer)

### DB Layer — add these constraints
- `CHECK (qty_returned <= EstQty)` on WorkParts (I-01)
- `CHECK (Stock >= 0)` on Part (I-02)
- `UNIQUE(pm_id)` on pm_acknowledgements (I-10)
- `UNIQUE(event_id, movement_type)` on inventory_movements (I-09)

### Service Layer — targeted fixes
- Sort offline-sync events by `deviceTimestamp` before processing loop — `scan.js:1289` (I-03)
- Write `deviceTimestamp` as audit timestamp instead of `datetime('now')` — `scan.js:1173` (I-03)
- Move `returnable` check inside transaction body — `scan.js:1594` (I-01, I-02)
- Map `SQLITE_CONSTRAINT_UNIQUE` to idempotency response — `scan.js:818` (I-04)
- Add `POST /api/offline/receiving-events/:eventId/resolve` with idempotency guard (I-09)
- Add `GET /api/work-orders/:id/unresolved-parts` (I-11)
- Map UNIQUE pm constraint error to `alreadyClaimed` response — `pmAcknowledge.js` catch block (I-10)
- Add `source` field to `/artifacts/for/:entityId` response — `catalog.js:1239` (I-13)

### UI Layer — targeted fixes
- `ScanCapture.jsx` sets `window.trierActiveScannerInterceptor = true` on mount, clears on unmount (I-05)
- `CloseOutWizard` calls unresolved-parts endpoint before rendering close step; shows warning (I-11)

---

*Document generated from static code review — `High Risk Edge Cases.md` (2026-04-26)*
*Update this document when enforcement layers change.*
