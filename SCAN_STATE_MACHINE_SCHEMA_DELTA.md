# Scan State Machine — Schema Delta

> Build document. Answers one question: what fields, tables, and relationships must exist for the scan state machine to work cleanly?
>
> Derived from the formal spec in ROADMAP.md — P1 Scan State Machine section.
> All new fields unless marked **existing**.

---

## 1. Work Order Table — New Fields

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `holdReason` | enum | Yes | Required when WO enters `On Hold`. See Hold Reason lookup. |
| `needsReview` | boolean | No | Default `false`. Set by auto-timeout or offline conflict logic. |
| `reviewReason` | enum | Yes | Why `needsReview` was set. See Review Reason lookup. |
| `reviewStatus` | enum | Yes | Null while not flagged. See Review Status lookup. |
| `acknowledgedByUserId` | FK → Users | Yes | Set when a floor tech acknowledges flag with a timeout-eligible hold reason. |
| `acknowledgedAt` | timestamp | Yes | Server timestamp of on-device acknowledgement. |
| `returnAt` | timestamp | Yes | Set when `holdReason = SCHEDULED_RETURN`. Timer does not start until this passes. |
| `scheduledByUserId` | FK → Users | Yes | User who set the `SCHEDULED_RETURN`. |
| `scheduledAt` | timestamp | Yes | Server timestamp when `SCHEDULED_RETURN` was set. |
| `relatedOpenWoId` | FK → WorkOrders | Yes | Set when a new WO is created while a waiting WO exists on the same asset. |
| `relationshipType` | enum | Yes | `PARALLEL_OPEN_WHILE_WAITING`. Null if no related WO. |
| `closeMode` | enum | Yes | Set on WO closure. See Close Mode lookup. Null while WO is open. |
| `closedByUserId` | FK → Users | Yes | User who performed the close action. |

> `activeUsersAtClose` — stored in child table `wo_close_participants`, not a serialized field. See Section 4.

---

## 2. Segment Table — New Table

Each contiguous block of active work by one technician is a first-class record.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `segmentId` | UUID | No | Primary key. |
| `woId` | FK → WorkOrders | No | Parent work order. |
| `userId` | FK → Users | No | Owning technician. Never mutated after creation. |
| `startTime` | timestamp | No | Server timestamp at segment open. |
| `endTime` | timestamp | Yes | Server timestamp at segment close. Null while active. |
| `segmentState` | enum | No | `Active` / `Ended` / `ReviewNeeded` |
| `segmentReason` | enum | Yes | Why this segment started or ended. See Segment Reason lookup. |
| `endedByUserId` | FK → Users | Yes | User who closed this segment. May differ from `userId` on team close. |
| `holdReason` | enum | Yes | Mirrors WO `holdReason` at time segment ended — preserves per-segment context. |
| `origin` | enum | Yes | `SCAN` (normal) / `OFFLINE_SYNC` (synced from offline queue). |
| `conflictAutoResolved` | boolean | No | Default `false`. `true` if segment was auto-joined due to offline multi-tech conflict. |

---

## 3. Scan Audit Log — New Table

Every scan event — regardless of outcome — produces an immutable append-only record.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `auditEventId` | UUID | No | Primary key. |
| `scanId` | UUID | No | Client-generated UUID. Used for idempotency check. |
| `woId` | FK → WorkOrders | Yes | Null if scan rejected before WO resolution. |
| `assetId` | FK → Assets | No | Asset that was scanned. |
| `userId` | FK → Users | No | Scanning user. |
| `previousState` | varchar | Yes | WO state before this scan. Null if no WO existed. |
| `nextState` | varchar | Yes | WO state after this scan. Null if rejected. |
| `decisionBranch` | varchar | No | Server branch taken. See Decision Branch lookup. |
| `deviceTimestamp` | timestamp | No | Timestamp from scanning device. Stored as-is. |
| `serverTimestamp` | timestamp | No | Authoritative server receipt time. Used for all ordering and duration. |
| `offlineCaptured` | boolean | No | Default `false`. `true` if scan was queued offline and synced later. |
| `conflictAutoResolved` | boolean | No | Default `false`. `true` if server applied Auto-Join due to offline multi-tech conflict. |
| `resolvedMode` | enum | Yes | `AUTO_JOIN` if conflict auto-resolved. Null otherwise. |

> No update or delete path exists on this table. Immutable by design.

---

## 4. WO Close Participants — New Child Table

Stores which users and segments were active at the moment of a close action. Replaces any serialized `closedSegmentIds` field on the WO.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `closeEventId` | UUID | No | Groups all participants from one close action. Server-generated. |
| `woId` | FK → WorkOrders | No | |
| `userId` | FK → Users | No | User whose segment was closed by this event. |
| `segmentId` | FK → Segments | No | Segment that was closed. |
| `closedByUserId` | FK → Users | No | User who initiated the close (may differ from `userId` on team close). |
| `closeMode` | enum | No | `SELF_ONLY` / `TEAM_CLOSE` / `LAST_ACTIVE_CLOSE` |
| `serverTimestamp` | timestamp | No | |

---

## 5. Supporting Lookup Tables / Enums

### Hold Reason

| Code | Label | Selectable | Timeout Policy |
|---|---|---|---|
| `WAITING_ON_PARTS` | Waiting on Parts | On-device | Exempt |
| `WAITING_ON_VENDOR` | Waiting on Vendor | On-device | Exempt |
| `WAITING_ON_APPROVAL` | Waiting on Approval | On-device | Exempt (label only in v1 — no workflow) |
| `SCHEDULED_RETURN` | Scheduled Return | On-device | Exempt until `returnAt` passes |
| `CONTINUE_LATER` | Continue Later | On-device | Timeout-eligible |
| `SHIFT_END_UNRESOLVED` | Shift End — Unresolved | On-device (v1 manual) | Timeout-eligible |
| `UNKNOWN_HOLD` | Unknown | **System-assigned only** | Timeout-eligible |

### Close Mode

| Code | Meaning |
|---|---|
| `SELF_ONLY` | Only active tech; closed own segment and WO |
| `LAST_ACTIVE_CLOSE` | Last remaining active tech; normal close |
| `TEAM_CLOSE` | Closed WO on behalf of multiple active techs; requires confirmation |

### Review Reason

| Code | Meaning |
|---|---|
| `AUTO_TIMEOUT` | No scan activity for threshold duration on timeout-eligible hold reason |
| `OFFLINE_CONFLICT` | Auto-Join applied during offline sync — concurrent segments may need review |

### Review Status

| Code | Meaning |
|---|---|
| `FLAGGED` | Flag set; awaiting resolution |
| `ACKNOWLEDGED_BY_FIELD` | Tech acknowledged on-device with timeout-eligible hold reason; timer reset |
| `RESOLVED_BY_FIELD` | Tech cleared flag on-device via Resume or exempt hold reason update |
| `DISMISSED` | Authorized desk action; flag cleared without corrective action |

### Relationship Type

| Code | Meaning |
|---|---|
| `PARALLEL_OPEN_WHILE_WAITING` | New WO created while a waiting WO existed on the same asset |

### Segment State

| Code | Meaning |
|---|---|
| `Active` | Segment open; tech actively on this WO |
| `Ended` | Segment closed cleanly |
| `ReviewNeeded` | Flagged by auto-timeout; awaiting resolution |

### Segment Reason

| Code | Meaning |
|---|---|
| `TAKEOVER` | Prior user's segment closed; this segment opened by new user |
| `JOIN` | Concurrent segment opened alongside existing active segment |
| `RESUME` | WO resumed from On Hold; new segment opened |
| `AUTO_TIMEOUT` | Segment flagged or closed by auto-review threshold |

### Segment Origin

| Code | Meaning |
|---|---|
| `SCAN` | Normal real-time scan |
| `OFFLINE_SYNC` | Synced from offline queue after connectivity restored |

### Resolved Mode (Audit Log)

| Code | Meaning |
|---|---|
| `AUTO_JOIN` | Server applied Join to resolve offline multi-tech conflict |

### Decision Branch

Formal controlled vocabulary for the `decisionBranch` field in the Scan Audit Log. Captures the server-side routing outcome for the scan event — not a UI label, not a human note. No ad-hoc strings permitted.

**Creation / routing:**

| Code | Meaning |
|---|---|
| `AUTO_CREATE_WO` | No WO existed — new WO auto-created and segment opened |
| `ROUTE_TO_ACTIVE_WO` | Active WO found — routed into active WO flow |
| `ROUTE_TO_WAITING_WO` | No active WO, waiting WO found — branch prompt surfaced |
| `ROUTE_TO_ESCALATED_WO` | WO in Escalated state — escalation response card surfaced |
| `ROUTE_TO_REVIEW_WO` | WO has `needsReview = true` — review prompt surfaced |

**Prompt-driven choices (user selected an action):**

| Code | Meaning |
|---|---|
| `PROMPT_RESUME_EXISTING` | User chose to resume the waiting WO |
| `PROMPT_CREATE_NEW` | User chose to create a new WO while a waiting WO existed |
| `PROMPT_JOIN_EXISTING` | User chose Join on an active WO owned by another tech |
| `PROMPT_TAKE_OVER` | User chose Take Over — prior segment closed, new segment opened |
| `PROMPT_TEAM_CLOSE` | User chose Close for Team — all active segments and WO closed |
| `PROMPT_SELF_CLOSE` | User closed their own segment and WO (last active or solo) |
| `PROMPT_LEAVE_WORK` | User closed own segment only — other active segments remain |

**Auto-resolutions (server resolved without user prompt):**

| Code | Meaning |
|---|---|
| `AUTO_JOIN_OFFLINE_CONFLICT` | Offline sync conflict — Auto-Join applied, no prompt possible |
| `AUTO_REJECT_DUPLICATE_SCAN` | `scanId` already seen — rejected with no state change |
| `AUTO_FLAG_NEEDS_REVIEW` | Auto-timeout threshold reached — `needsReview` flag set |
| `AUTO_TIMEOUT_FLAGGED` | Segment flagged as `ReviewNeeded` by timeout logic |
| `AUTO_TIMEOUT_ACKNOWLEDGED` | Tech acknowledged flag on-device with timeout-eligible reason — timer reset |

**State outcomes (what the server wrote):**

| Code | Meaning |
|---|---|
| `STATE_SET_ON_HOLD` | WO transitioned to `On Hold` |
| `STATE_SET_ESCALATED` | WO transitioned to `Escalated` |
| `STATE_RESUMED` | WO resumed from `On Hold` to `Open` |
| `STATE_CLOSED` | WO closed |
| `STATE_SEGMENT_OPENED` | New segment opened |
| `STATE_SEGMENT_CLOSED` | Segment closed |

> A single scan event may produce multiple audit entries if it triggers both a segment action and a WO state change (e.g., `PROMPT_SELF_CLOSE` + `STATE_SEGMENT_CLOSED` + `STATE_CLOSED`). Each entry has the same `scanId` — the sequence is reconstructable from `serverTimestamp` ordering.

---

## 6. Plant Configuration — New Fields

Per-plant settings. Required before go-live.

| Field | Type | Default | Notes |
|---|---|---|---|
| `shiftLengthHours` | integer | 8 | Used to derive `laterThisShift` and `nextShift` offsets |
| `shiftChangeoverMinutes` | integer | 30 | Buffer between shifts added to `nextShift` offset |
| `autoReviewThresholdHours` | integer | 12 | Hours of inactivity before `needsReview` flag set on timeout-eligible WOs |
| `returnOffset_laterThisShift` | integer | derived | Default: `shiftLengthHours / 2` |
| `returnOffset_nextShift` | integer | derived | Default: `shiftLengthHours + (shiftChangeoverMinutes / 60)` |
| `returnOffset_tomorrow` | integer | 24 | Hours from now |

> Defaults are safe baselines only. Must be reviewed and overridden per plant before go-live.

---

## 7. Scan Payload — API Contract

`POST /scan`

```json
{
  "scanId": "<UUID — client generated>",
  "assetId": "<FK>",
  "userId": "<FK>",
  "deviceTimestamp": "<ISO 8601>"
}
```

All other fields (`serverTimestamp`, state resolution, segment writes, audit log) are server-owned. The device sends exactly four fields regardless of input mode.

---

## 8. Client Scan Acquisition — Implementation Requirements

The backend is device-agnostic. Three client input modes all submit to the same endpoint.

### Input mode stack

```
1. Hardware scanner (Zebra or equivalent)
   → Scan lands as keyboard wedge input
   → Auto-submits immediately — no tap required

2. Phone / tablet camera
   → User taps "Scan Asset"
   → Open rear camera: facingMode: "environment"
   → Decode QR from video stream
   → Auto-submit on successful decode

3. Numeric fallback
   → Camera fails or label damaged
   → User enters short asset number
   → Same POST /scan submission
```

### Camera API stack

```
Try:    BarcodeDetector (native browser API — fastest where available)
Else:   JS frame decoder via getUserMedia() + canvas frame extraction
Else:   Numeric manual entry
```

`getUserMedia()` requires HTTPS (secure context). App must run over HTTPS on all environments including local plant network deployments.

### Device acceptance criteria

- [ ] Hardware barcode/QR scanner (keyboard wedge input)
- [ ] Android phone — camera scan
- [ ] Android tablet — camera scan
- [ ] iPhone / iPad — camera scan (Safari PWA)
- [ ] All devices — numeric fallback
- [ ] All devices — offline queue with sync indicator

### UX requirement across all devices

After successful scan decode, show a 1-second confirmation overlay before presenting the action prompt:
- Asset name
- Asset ID
- Current WO state

Prevents wrong-asset actions, especially on camera devices where aiming is less precise than laser scanners.

---

## Next Steps

1. Schema delta — this document ✓
2. API contract — state machine endpoint behavior per branch (derive from ROADMAP state transition table)
3. State transition tests — one test per row in the transition table
4. UI build — on-device action prompts, Mission Control flags, overdue scheduled return view, offline conflict review queue

---

*Derived from ROADMAP.md — P1 Scan State Machine formal spec. © 2026 Doug Trier*
