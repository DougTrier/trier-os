# Trier OS — High Risk Edge Cases
**Architecture-specific edge cases identified and investigated against current codebase.**
**No code changes made — documentation and findings only.**
**Investigated: 2026-04-26**

---

## Summary

| # | Case | Status | Priority |
|---|------|--------|----------|
| 1 | Duplicate scans across paths | ⚠️ PARTIAL | High |
| 2 | Mode confusion — asset vs part scan | ⚠️ PARTIAL | High |
| 3 | Offline replay ordering | ❌ GAP | Critical |
| 4 | Two techs on same WO | ⚠️ PARTIAL | High |
| 5 | Inventory race conditions | ⚠️ PARTIAL | High |
| 6 | Outcome tracking false positives | ✅ COVERED | — |
| 7 | Cache stale trust issue | ⚠️ PARTIAL | Medium |
| 8 | Plant context leakage | ✅ COVERED | — |
| 9 | Offline receiving duplicate sync (different eventId) | ✅ COVERED | — |
| 10 | Unknown barcode resolution applies twice | ❌ GAP | High |
| 11 | PM acknowledgement race | ⚠️ PARTIAL | Medium |
| 12 | Parts suggestion learning pollution | ❌ GAP | Low |
| 13 | Artifact trust drift | ⚠️ PARTIAL | Low |
| 14 | Close WO with unresolved material state | ⚠️ PARTIAL | High |
| 15 | Global scan while modal is open | ❌ GAP | High |

**Legend:** ✅ COVERED · ⚠️ PARTIAL (protection exists, gap documented) · ❌ GAP (no protection)

**Totals:** 3 Covered · 8 Partial · 4 Gaps

---

## ❌ GAP — Case 3: Offline Replay Ordering
**Risk:** Part returned before issue syncs. WO close syncs before parts sync. Follow-up WO syncs before original close.
**Expected:** WO lifecycle events before part movements. Issue before return. Close after pending material events. Event timestamp (not sync timestamp) used throughout.

**Finding: GAP**

Events in the offline-sync batch are processed sequentially in array arrival order with no timestamp-based reordering (`scan.js:1289` — `for (const event of events)`). Additionally, server writes `datetime('now')` as the audit timestamp (`scan.js:1173`) rather than the device's captured timestamp.

**Scenario:** Tech A's offline queue contains WO creation (10:00), part issue (10:05), WO close (10:10). If the network returns them as [close, issue, creation], they replay out-of-order. The state machine does not validate temporal ordering — a WO close can record before its part-issue events exist.

**Scope of change required:**
Before the main processing loop (`scan.js:1289`), sort the events array by `deviceTimestamp` ascending. In the transaction block, validate that the WO's last recorded segment activity predates the current event's `deviceTimestamp`. Write `deviceTimestamp` (not `datetime('now')`) as the semantic audit timestamp. Estimated: medium — confined to the offline-sync loop in `scan.js`.

---

## ❌ GAP — Case 10: Unknown Barcode Resolution Applies Twice
**Risk:** Admin resolves an unknown barcode. Resolution applies twice, or original qty never applies at all.
**Expected:** Resolution applies once. Event status moves `needsReview → accepted`. Stock update idempotent.

**Finding: GAP**

`offline_receiving.js` correctly sets unknown barcodes to `syncStatus = 'needsReview'` (line 176). However, **there is no POST endpoint to resolve them**. The admin review queue (GET `/api/offline/receiving-events`) exists to display them, but there is no endpoint for an admin to assign a `resolvedPartId` and transition the event to `accepted`. Unknown barcodes stay in `needsReview` indefinitely — their stock updates never apply.

Additionally, the existing `applyStockUpdate` function (lines 210–229) contains no guard against re-applying the same event's stock movement. If a resolution endpoint were added without idempotency, calling it twice would double-increment stock.

**Scope of change required:**
Add `POST /api/offline/receiving-events/:eventId/resolve` accepting `{ resolvedPartId }`. Inside a transaction: verify current `syncStatus = 'needsReview'`, update `resolvedPartId` and `syncStatus = 'accepted'`, then call `applyStockUpdate`. Add a UNIQUE constraint or existence check inside `applyStockUpdate` to prevent double-apply. Estimated: small-medium — new endpoint plus one migration adding a constraint.

---

## ❌ GAP — Case 12: Parts Suggestion Learning Pollution
**Risk:** Wrong part accidentally saved as "common for this asset," suggested forever.
**Expected:** Common mappings reversible. New learned mappings start as candidates until approved.

**Finding: GAP**

There is no auto-learning suggestion system in the codebase. Parts are sorted by raw usage frequency (`SELECT COUNT(*) FROM WorkParts WHERE PartID = ?`). Manual substitutes can be linked/unlinked via `POST/DELETE /api/parts/:id/substitutes`. Master Catalog cross-references exist (read-only). No confidence levels, no approval gates, no candidate state, and no mechanism to demote a wrong suggestion.

**Scope of change required (if desired):**
New `part_usage_suggestions` table: `(asset_id, part_id, usage_count, positive_feedback, negative_feedback, auto_learned)`. Confidence threshold before surfacing (e.g., 0.7). Technician feedback button. Admin bulk-demote UI. This is a new feature — not a bug fix. Low urgency; current behavior (frequency sort + manual substitutes) is safe, just unsophisticated. Estimated: large — new table, API, and UI.

---

## ❌ GAP — Case 15: Global Scan While Modal Is Open
**Risk:** Hardware scanner input fires while confirmation modal, More Options, or Add Parts screen is open — two scanner inputs process the same barcode simultaneously.
**Expected:** Only one scanner owner active at a time. Global scanner disabled while focused scanner mode owns input.

**Finding: GAP**

`App.jsx:625` guards `hw-scan-inject` with: `if (isScannerOpenRef.current || window.trierActiveScannerInterceptor)`. The `trierActiveScannerInterceptor` flag is the intended claim mechanism — but `ScanCapture.jsx` never sets it. When `ScanCapture` is mounted (e.g., on the `/scanner` route), `isScannerOpen` is false and `window.trierActiveScannerInterceptor` is undefined, so a hardware wedge scan opens the global scanner alongside the active `ScanCapture` input. A single barcode can be processed by both components simultaneously.

**Scope of change required:**
`ScanCapture.jsx` must set `window.trierActiveScannerInterceptor = true` on mount and clear it on unmount. This is a one-line fix per lifecycle hook. Optionally, a dedicated scanner manager (claim/release with priority queue) would be the robust long-term solution, but the flag approach closes the immediate gap. Estimated: small — 2–4 lines in `ScanCapture.jsx`.

---

## ⚠️ PARTIAL — Case 1: Duplicate Scans Across Paths
**Risk:** Same physical scan creates duplicate WO, part issue, or receiving event via multiple entry paths.
**Expected:** One accepted action, rest deduped/idempotent.

**Finding: PARTIAL — DB layer protects, exception handling has a gap**

Strong protection exists: UNIQUE INDEX on `ScanAuditLog.scanId` (`scan.js:117`), pre-check SELECT (`scan.js:284–294`), and inner `.immediate()` transaction re-check before any mutation (`scan.js:725–727`). Offline receiving uses `INSERT OR IGNORE` on `eventId` PRIMARY KEY (`offline_receiving.js:67`).

**Gap:** The UNIQUE constraint exception in the catch block (`scan.js:818–821`) is logged as a generic error rather than being mapped to an idempotency response. A second caller racing through gets an unhandled 500 rather than a clean "already processed" 200/409. Also, no explicit time-window dedup exists — the same `scanId` from months ago would still be rejected (safe but inflexible).

**Scope of change:** In the catch block at `scan.js:818`, detect SQLite UNIQUE constraint errors (code `SQLITE_CONSTRAINT_UNIQUE`) and return a structured idempotency response rather than a 500. Estimated: very small.

---

## ⚠️ PARTIAL — Case 2: Mode Confusion — Asset Scan vs Part Scan
**Risk:** Asset QR scanned during batch parts mode gets processed as a part or misroutes.
**Expected:** Batch mode = parts only. Active WO = part first, fallback asset. No WO = asset first.

**Finding: PARTIAL — routing exists, batch-mode gate missing**

`GlobalScanner.jsx` tries part lookup first, then asset (`lines 397–401`). The server scan endpoint checks for an active WO and routes accordingly. However, there is no batch-mode gate — if a user is in batch parts mode (`ScanActionPrompt.jsx:185`) and scans an asset QR, the server processes it as `ASSET_NOT_FOUND` or `ROUTE_TO_ASSET` rather than rejecting it as an invalid input for the current mode. A hardware wedge injection (`GlobalScanner.jsx:316–325`) can also interrupt an active batch session, creating two overlapping scan contexts.

**Scope of change:** Server scan endpoint needs a `mode` parameter (e.g., `batchParts`, `assetLookup`) sent by the client. When `mode=batchParts`, the endpoint rejects non-part barcodes immediately. `ScanActionPrompt` must pass this context on every scan. Estimated: small-medium.

---

## ⚠️ PARTIAL — Case 4: Two Techs on Same WO
**Risk:** Tech A issues part offline, Tech B returns same part online, Tech A syncs later — negative inventory or duplicate usage.
**Expected:** No negative inventory. No duplicate usage. Conflict → Needs Review.

**Finding: PARTIAL — return protected, issue not serialized**

The return-part endpoint (`scan.js:1585`) validates `qty <= returnable` before committing. The `returnable` calculation (`EstQty - qty_used - qty_returned`) prevents returning more than was issued — when running online.

**Gap:** If Tech A issues part X (qty=10) offline and Tech B returns part X (qty=15) online before the issue syncs, the return passes the check (nothing issued yet from DB's perspective) and `qty_returned` becomes 15. When Tech A's offline issue syncs later, `EstQty` becomes 10 but `qty_returned` is already 15, violating the invariant. Additionally, concurrent part-checkout calls are not wrapped in `.immediate()` mode, so two simultaneous issues are not serialized.

**Scope of change:** Wrap `return-part` transaction to re-query `returnable` inside the transaction body (not before it). Add `.immediate()` to the `parts-checkout` transaction. Add a DB-level `CHECK (qty_returned <= EstQty)` constraint as a safety net. Estimated: small — targeted changes to two transaction blocks in `scan.js`.

---

## ⚠️ PARTIAL — Case 5: Inventory Race Conditions
**Risk:** Two devices return the same remaining qty simultaneously. Batch commit and return-to-stock collide.
**Expected:** `returnable = issued - used - returned` enforced at DB layer. Frontend qty not trusted.

**Finding: PARTIAL — TOCTOU window in return-part; adjustments protected**

Parts adjustments in `parts.js:462` correctly use `.immediate()` mode, acquiring the write lock upfront. SQLite WAL mode and 5s busy timeout are configured (`database.js:181`).

**Gap:** The return-part endpoint (`scan.js:1585–1594`) performs the `returnable` check OUTSIDE the transaction, then opens the transaction to commit. Two concurrent requests can both read the same `qty_returnable`, both pass the check, and both commit — over-returning parts and over-crediting `Part.Stock`.

**Scope of change:** Move the `returnable` re-calculation inside the transaction body after the write lock is acquired. The transaction already exists (`scan.js:1594`) — the fix is moving 3 lines inside it. Estimated: very small.

---

## ⚠️ PARTIAL — Case 7: Cache Stale Trust Issue
**Risk:** Asset state changes, cache invalidation misses the event, tech sees stale NEXT action for up to 60 seconds.
**Expected:** State-changing event invalidates cache before UI reads it. Fallback prefers minimal truth over stale detail.

**Finding: PARTIAL — TTL and 4 triggers exist; fallback serves stale detail**

Four invalidation triggers exist: WO creation (`scan.js:807`), outcome reopened (`outcomeTracker.js:135`), outcome finalized (`outcomeTracker.js:186`), and a 60s TTL fallback (`explainCache.js:28`). Cache keys are plant-scoped (`explainCache.js:30`).

**Gap:** Asset state changes made outside the tracked scan flow (e.g., status updates, criticality changes, asset reassignment via other routes) do not trigger cache invalidation. When invalidation fires, warmup is `setImmediate` (fire-and-forget) — a brief window exists where the old value is evicted but the new value isn't warm yet, and the TTL fallback serves the full stale payload rather than a minimal safe state.

**Scope of change:** Add `explainCache.invalidate()` calls to asset write routes outside the scan flow. Reduce TTL from 60s to 15s. On cache miss or stale fallback, return a `{ stale: true }` flag so the client can display a "refreshing..." indicator rather than presenting stale data as current. Estimated: small — adding invalidation calls to 3–5 routes.

---

## ⚠️ PARTIAL — Case 11: PM Acknowledgement Race
**Risk:** Two techs acknowledge the same PM at exactly the same time; both succeed.
**Expected:** First acknowledgement wins transactionally. Others see "already claimed."

**Finding: PARTIAL — check-then-insert pattern without DB constraint**

The endpoint (`pmAcknowledge.js:67–84`) checks for an existing acknowledgement via SELECT, then conditionally INSERTs. The INSERT is inside a `db.transaction()` block. However, there is **no UNIQUE constraint on `pm_acknowledgements(pm_id)`**, and the SELECT is outside the transaction — creating a TOCTOU window where two concurrent requests both pass the existence check and both INSERT successfully.

The notification supersession logic (lines 87–91) does fire correctly to mark other notifications as superseded after a successful acknowledgement, but if both succeed, both notifications would be marked identically, creating an ambiguous ownership state.

**Scope of change:** Add `UNIQUE(pm_id)` to `pm_acknowledgements` via a new migration. This is a single-line schema change that makes SQLite enforce the constraint, turning the second concurrent INSERT into a constraint error that the catch block maps to `{ alreadyClaimed: true }`. Estimated: very small — one migration, one catch-block update.

---

## ⚠️ PARTIAL — Case 13: Artifact Trust Drift
**Risk:** External reference (URL to CAD file, digital twin link) displayed as a locally-available artifact.
**Expected:** Local = usable. External = internet-required, clearly labeled. Candidate = not primary truth.

**Finding: PARTIAL — DB model correct; API response omits the distinction**

The data model is solid: `catalog_artifacts` has `is_local`, `local_path`, `external_url` columns. The serve endpoint (`catalog.js:1120`) correctly returns 404 for non-local artifacts — you cannot accidentally stream an external URL through the proxy.

**Gap:** The `GET /artifacts/for/:entityId` endpoint (`catalog.js:1239`) returns raw artifact rows but does not expose `is_local` as a labeled field. A frontend developer receiving the response must infer availability from the presence of `local_path` vs `external_url`. If the frontend renders both as equal-confidence artifacts, a tech could attempt to open a URL that requires authentication or is unavailable offline.

**Scope of change:** Add `"source": is_local ? "local" : "external"` to the `/artifacts/for/:entityId` response serialization. One line change. Optionally add `requiresInternet: !is_local` for clarity. Estimated: very small.

---

## ⚠️ PARTIAL — Case 14: Close WO with Unresolved Material State
**Risk:** Tech closes WO while parts are issued but not used/returned — parts disappear from inventory without audit trail.
**Expected:** Close screen warns about unresolved parts. Options: return unused / mark used / close with reason.

**Finding: PARTIAL — stock guard exists; pre-close check and UI warning missing**

The cost ledger (`costLedger.js:167`) guards against negative stock on close. The `WorkParts` table has `status` (`issued | partial_return | fully_returned`) and `qty_returned` columns. The data to detect unresolved parts exists.

**Gap:** The WO close endpoint (`v2_integration.js:588`) calls `closeWorkOrderWithCosts()` with no prior check for `WorkParts` rows where `status != 'fully_returned'`. `CloseOutWizard.jsx` (step 2, lines 457–558) has no API call to fetch unresolved parts before rendering and no warning banner. A tech can close a WO with issued-but-unreturned parts — stock is decremented but `inventory_movements` has no `RETURN_TO_STOCK` record, making the units unaccountable.

**Scope of change:**
1. Add `GET /api/work-orders/:id/unresolved-parts` endpoint — queries `WorkParts` for `qty_returnable > 0`
2. Call it from `CloseOutWizard` before rendering step 2
3. If results exist, show warning: "N parts issued but not returned"
4. Offer two paths: navigate to parts return, or supervisor override with reason (creates `RETURN_TO_STOCK` records with `supervisor_override` status)

Estimated: medium — new endpoint + CloseOutWizard UI changes.

---

## ✅ COVERED — Case 6: Outcome Tracking False Positives
**Risk:** Follow-up WO synced late incorrectly marks original WO as Resolved=1.
**Status: COVERED**

Window is calculated from `WO.CompletedAt` (the close event timestamp), not from the sync/insert timestamp (`outcomeTracker.js:121–125`). When a follow-up WO is created offline and syncs late, `outcomeTracker.markReopened()` compares the device timestamp against `CompletedAt` — correctly extending the window regardless of when the sync occurs. Background expiration also anchors to `CompletedAt` via SQLite datetime arithmetic (`outcomeTracker.js:165–170`). No action needed.

---

## ✅ COVERED — Case 8: Plant Context Leakage
**Risk:** Plant_1 scan opens Plant_2 asset or cached explain result.
**Status: COVERED**

`AsyncLocalStorage` context is set per-request at `index.js:401–406`, before authentication and before all route handlers, inside a closure that wraps `next()`. All `db.getDb()` calls resolve from this context. Cache keys are plant-scoped (`explainCache.js:30`: `` `${plantId}:${assetId}` ``). Auth middleware adds a secondary plant-role jail. No cross-plant leakage path identified. No action needed.

---

## ✅ COVERED — Case 9: Offline Receiving Duplicate Sync (Different eventId)
**Risk:** Same barcode + same timestamp + different eventId creates two stock increments.
**Status: COVERED (with a noted edge case)**

`eventId` is the PRIMARY KEY on the `offline_receiving_events` table. `INSERT OR IGNORE` (`offline_receiving.js:67`) silently rejects re-posts of the same `eventId`. If a scanner genuinely double-submits with two different UUIDs for the same scan, both would insert. However, this requires the scanner to regenerate a UUID mid-submission — modern Zebra devices use sequence numbers that make this scenario operationally unlikely. The current architecture is correct for the stated contract (eventId = idempotency key). No action needed unless scanner hardware is confirmed to exhibit this behavior.

---

## Prioritized Action List

### Critical (fix before next release)
1. **Case 3** — Offline replay ordering: Sort events by `deviceTimestamp` before processing in `scan.js` offline-sync loop

### High (fix in next sprint)
2. **Case 15** — Global scan ownership: `ScanCapture.jsx` must set `window.trierActiveScannerInterceptor` on mount/unmount
3. **Case 14** — Close WO with unresolved parts: Add pre-close check endpoint + CloseOutWizard warning
4. **Case 10** — Unknown barcode resolution: Add admin resolve endpoint with idempotency guard
5. **Case 5** — Inventory TOCTOU: Move `returnable` check inside transaction in `scan.js:1594`
6. **Case 4** — Two-tech part race: Add `.immediate()` to parts-checkout transaction; re-query inside return-part transaction
7. **Case 1** — Dedup exception handling: Map UNIQUE constraint errors to idempotency response in `scan.js:818`

### Medium
8. **Case 11** — PM race: Add `UNIQUE(pm_id)` migration to `pm_acknowledgements`
9. **Case 2** — Mode confusion: Pass `mode` context from client; reject non-part barcodes in batch mode
10. **Case 7** — Cache stale fallback: Add invalidation to asset write routes; reduce TTL; add `stale` flag

### Low
11. **Case 13** — Artifact source labeling: Add `source` field to `/artifacts/for/:entityId` response
12. **Case 12** — Parts suggestion system: New feature; current frequency-sort behavior is safe

---

*Investigation completed: 2026-04-26*
*Method: Static code review of server/routes, src/components, server/services*
*No code was modified during this investigation*
