# P3-A Replay Coverage Metrics
> Trier OS P3 · Formal replay coverage definition and measurement

---

## Purpose

Replay coverage answers one question: **if the system is replayed from a stored state snapshot, what fraction of subsequent observable behavior can be deterministically reproduced?**

This metric governs whether the Deterministic Replay guarantee (P3-A) is meaningful for incident investigation and audit.

---

## Coverage Dimensions

### 1. Event Log Completeness

Every state-changing operation must produce a log entry to be replayable.

| Event Class | Table | Required Fields | Status |
|---|---|---|---|
| Scan segment open/close | `WorkSegments` | TechID, AssetID, WONumber, ts, ScanID (UUID) | ✅ Implemented |
| WO create / update / close | `Work` + `ScanAuditLog` | StatusID, CompDate, ActualHours, DowntimeCost | ✅ Implemented |
| Auth / login events | `ScanAuditLog` (type=auth) | Username, IP, result | ✅ Implemented |
| CAPA status changes | `CorrectiveActions` | UpdatedAt, Status, Owner | ✅ Implemented |
| Gatekeeper write commands | `GatekeeperLog` | action, signedTicket, outcome | ⏳ Pending (P2 Gatekeeper not yet built) |
| PLC/SCADA setpoint writes | External audit trail | tag, value, authorizedBy | ⏳ Pending (requires Gatekeeper) |

**Current completeness: ~80%** — all CMMS events covered; control-layer events require the P2 Gatekeeper to be built.

### 2. State Snapshot Frequency

A replay starting point requires a full state snapshot.

| Snapshot Type | Frequency | Storage |
|---|---|---|
| SQLite DB backup (per-plant) | On each deployment | `data/*.db.bak_<timestamp>` |
| Full DB dump | Manual (pre-upgrade) | Admin Console → Backup |
| Incremental WAL | SQLite WAL mode (always on) | Local filesystem |

**Gap:** No automated scheduled snapshots. A future cron job (`0 2 * * *`) should create daily `.db.bak` files. This is tracked as a P6 ops hardening item.

### 3. Scan Idempotency Coverage

Offline scans that replay through the queue must produce the same outcome as if submitted live.

- **ScanID UUID dedup**: implemented in `scan.js` — duplicate ScanIDs are a no-op
- **Auto-Join conflict rule**: implemented in `scan.js /offline-sync` — late-arriving segments merge to existing WO rather than creating duplicates
- **Multi-tech collisions**: resolved by timestamp ordering in segment merge logic

**Coverage: 100%** for scan-path events.

---

## Coverage Score Calculation

```
ReplayCoverage = (logged events / total state-changing events) × idempotency_factor
```

Where `idempotency_factor` = 1.0 if all logged events are idempotent on replay, otherwise < 1.0.

**Current score:** ~0.80 × 1.0 = **80%**

Target: ≥ 95% (requires Gatekeeper audit trail for control-layer events).

---

## Acceptance Criteria (P3-A Complete)

- [ ] Gatekeeper log table created and wired to all PLC write paths
- [ ] Automated daily DB snapshot job running
- [ ] Replay coverage score ≥ 95%
- [ ] A single replay test can reconstruct a known WO incident from a cold snapshot

---

## Related Documents

- `docs/p2/Audit_Trail_Spec.md` — schema for `ScanAuditLog` and `WorkSegments`
- `docs/p2/Write_Path_Architecture.md` — Gatekeeper design (when built, adds the missing 20%)
