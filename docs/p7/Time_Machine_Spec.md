# Deterministic Time Machine — Architecture Spec
> Trier OS P7 · State rollback + branching simulation

---

## Concept

The Time Machine answers: **"What was the exact system state at time T, and what would have happened if we had done X differently?"**

Unlike a log viewer, it reconstitutes full operational state — open WOs, active permits, asset condition scores, vibration readings, CAPA status — at any historical timestamp, then allows branching simulation on top of that snapshot.

---

## Two Modes

| Mode | Description |
|---|---|
| **Replay** | Read-only view of system state at a past timestamp. No writes. |
| **Branch** | Forks from a replay snapshot; simulates hypothetical changes (e.g., "close this WO at 14:32") and shows downstream causality. Writes go to a shadow DB, never production. |

---

## State Snapshot Model

System state at time T is fully reconstructable from the event log + current state table:

```
StateSnapshot(T) = {
  openWorkOrders:    Work WHERE AddDate <= T AND (CompDate IS NULL OR CompDate > T),
  assetConditions:   latest CriticalityScoreTotal per asset AS OF T,
  activePermits:     SafetyPermits WHERE CreatedAt <= T AND ExpiresAt > T,
  openCAPAs:         CorrectiveActions WHERE CreatedAt <= T AND (CompletedAt IS NULL OR CompletedAt > T),
  vibrationReadings: latest VibrationReadings per asset, point AS OF T,
  openRCAs:          rca_investigations WHERE IncidentDate <= T AND Status != 'Closed',
  activeMOCs:        ManagementOfChange WHERE CreatedAt <= T AND Status NOT IN ('COMPLETED','CANCELLED'),
}
```

All source tables already carry timestamps; no new event sourcing infrastructure required for replay mode.

---

## Branch Simulation

1. Reconstruct `StateSnapshot(T)` for the branch point.
2. Copy snapshot into a transient SQLite shadow database (`:memory:` or temp file).
3. Apply the hypothetical mutation (e.g., mark WO as completed, close a permit).
4. Re-run the causality engine (`/api/causality/timeline`) against the shadow DB.
5. Compare resulting event chain against the actual historical chain.
6. Return a diff: events that appear in the simulation but not reality (prevented), and events in reality that don't appear in simulation (would-have-avoided).

---

## Prerequisites

| Requirement | Status |
|---|---|
| Event timestamps on all key tables | ✅ All source tables have `CreatedAt`/`AddDate`/`CompDate` |
| Causality engine (event stitching) | ✅ `/api/causality` — live |
| Immutable audit log | ✅ `ScanAuditLog`, `SafetyPermitAuditLog`, `MOCApproval` history |
| Shadow DB isolation | 🔵 New — create ephemeral SQLite copy at branch time |
| UI: timeline scrubber | 🔵 New — React component with time-range slider |

---

## Planned API

```
GET  /api/time-machine/snapshot?plantId=&at=ISO8601     Reconstruct state at timestamp
POST /api/time-machine/branch                            Create simulation branch
     Body: { plantId, branchPointAt, mutations: [...] }
GET  /api/time-machine/branch/:id/diff                  Compare branch vs actual history
DELETE /api/time-machine/branch/:id                     Discard shadow DB
```

---

## Implementation Notes

- Shadow DBs must be ephemeral — never persisted, never queryable after session ends.
- Branch mutations must be validated by Gatekeeper rules before being applied to shadow.
- No write path from Time Machine to production. Enforced at the route level.
- Branch IDs are UUIDs, stored in-memory only (Map in the server process), never in the DB.

---

## UI: Mission Control Integration

A timeline scrubber in Mission Control's asset detail view allows an operator to drag backwards through time. The causality panel re-renders against the reconstructed snapshot. A "Branch Here" button opens the simulation workflow.

---

*This spec is P7 roadmap — implementation requires UI work (timeline scrubber component) and the shadow DB isolation layer. The data infrastructure (timestamped events, causality engine) is already live.*
