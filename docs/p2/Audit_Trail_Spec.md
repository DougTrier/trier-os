# Audit Trail Specification
> Trier OS P2 · Covers all existing and future audit records

---

## Existing Audit Infrastructure

### Scan State Machine Audit Log (`ScanAuditLog`)
Every scan event — regardless of outcome — produces an immutable record. Already implemented in `server/routes/scan.js`.

```sql
ScanAuditLog (
  auditEventId    TEXT PRIMARY KEY,
  scanId          TEXT NOT NULL,          -- client-generated UUID (idempotency key)
  assetId         TEXT NOT NULL,
  userId          TEXT NOT NULL,
  previousState   TEXT,
  nextState       TEXT,
  decisionBranch  TEXT,                   -- what the server decided
  deviceTimestamp TEXT,                   -- client clock (informational)
  serverTimestamp TEXT DEFAULT (datetime('now')),  -- authoritative
  offlineCaptured INTEGER DEFAULT 0,
  conflictAutoResolved INTEGER DEFAULT 0,
  resolvedMode    TEXT
)
```

### WO Segment Records
Each work segment is a first-class record. Labor truth record — not derived from open/close bookends. Already implemented.

### Immutability Contract
The `ScanAuditLog` has **no UPDATE or DELETE path** in the codebase. Any new route that touches audit records must maintain this constraint. Do not add edit or delete endpoints for audit tables.

---

## Required: General Write Audit Log (Future — Gatekeeper)

When the Gatekeeper is built, every approved action must produce an audit entry in a separate `GatekeeperAuditLog` table:

```sql
GatekeeperAuditLog (
  auditId         TEXT PRIMARY KEY,
  ticketId        TEXT,                   -- signed change ticket
  userId          TEXT NOT NULL,
  actionClass     TEXT NOT NULL,          -- READ / ADVISORY / WRITE_STD / WRITE_SAFETY
  targetDevice    TEXT,
  intent          TEXT,
  permitId        TEXT,                   -- PTW permit ID (if required)
  mocId           TEXT,                   -- MOC record ID (if required)
  outcome         TEXT,                   -- APPROVED / REJECTED / BLOCKED
  rejectReason    TEXT,
  serverTimestamp TEXT DEFAULT (datetime('now'))
)
```

**Enforcement rules:**
- No UPDATE or DELETE path on `GatekeeperAuditLog`
- Every Gatekeeper decision (approve or reject) writes a record — not just approvals
- Log entries are linked to: request ID, approval chain, resulting system state

---

## Audit Coverage Map

| Action | Audit record | Table | Status |
|---|---|---|---|
| Scan event (any outcome) | Full state transition + branch | `ScanAuditLog` | ✅ Implemented |
| WO segment open/close | Segment record | `WorkSegments` | ✅ Implemented |
| WO status change | Embedded in scan audit | `ScanAuditLog` | ✅ Implemented |
| LOTO permit issue/close | Permit lifecycle record | `LotoPermits` | ✅ Implemented |
| ERP write-back | Outbox status + retry history | `ErpOutbox` | ✅ Implemented |
| Gatekeeper decision | Governed intent record | `GatekeeperAuditLog` | 🔵 Future |
| Mode change (degraded mode) | Console log only | — | 🟡 Partial — log exists, no DB record yet |
| User login/logout | Auth event | `AuthLog` | ✅ Implemented |

---

## Forensic Query Examples

**Who changed WO state between 14:00–15:00 on a specific asset?**
```sql
SELECT userId, previousState, nextState, decisionBranch, serverTimestamp
FROM ScanAuditLog
WHERE assetId = 'PUMP-101'
  AND serverTimestamp BETWEEN '2026-04-12T14:00:00' AND '2026-04-12T15:00:00'
ORDER BY serverTimestamp;
```

**Which scans were captured offline and auto-resolved?**
```sql
SELECT scanId, assetId, userId, decisionBranch, deviceTimestamp, serverTimestamp
FROM ScanAuditLog
WHERE offlineCaptured = 1
ORDER BY serverTimestamp DESC;
```
