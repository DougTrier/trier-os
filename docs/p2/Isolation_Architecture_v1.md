# Failure Domain Isolation — Architecture v1
> Trier OS P2 Pilot Blocker · Reviewed before any safety-critical plant deployment

---

## The Three-Plane Model

Trier OS operates in the **Execution Plane** only. It never touches the Control Plane.

| Plane | What it owns | Runtime dependency on Trier OS |
|---|---|---|
| **Control Plane** | PLCs, safety PLCs, VFDs, actuators — all physical actuation | **None.** Operates independently at all times via PLC/SCADA ladder logic. |
| **Execution Plane** | Trier OS — workflows, WO lifecycle, analytics, integrations | Issues governed intents only (via Gatekeeper, P2). No direct device writes. |
| **Simulation Plane** | Parallel Universe — deterministic sandbox, forward simulation | No write path to production. Isolated by design. |

**The contract:** If Trier OS is fully offline, the plant continues running. PLC programs execute independently. SCADA HMIs operate independently. Zero plant impact from any Trier OS process failure.

---

## Data Flow — Read vs. Write Paths

```
┌─────────────────────────────────────────────────────────────────┐
│  CONTROL PLANE (PLC / SCADA)                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │  PLC-A   │  │  PLC-B   │  │  PLC-C   │  ← ladder logic only │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                      │
│       │              │              │                            │
└───────┼──────────────┼──────────────┼────────────────────────────┘
        │ READ ONLY (Modbus TCP poll, OPC-UA read)
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  EXECUTION PLANE (Trier OS)                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  EdgeAgent (Modbus/OPC-UA reader)                        │   │
│  │  → SensorReadings table → PM Engine → WO auto-creation  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Trier OS API server (Express)                           │   │
│  │  → SQLite per-plant DBs                                  │   │
│  │  → Advisory mode middleware (degradedMode.js)            │   │
│  │  → GET /api/health (monitoring)                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ERP Write-Back Outbox (erp-outbox.js)                   │   │
│  │  → Outbound only, exponential backoff, 5-attempt cap     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
        │ GOVERNED WRITE PATH (future — Gatekeeper P2)
        ▼ (not yet active — no PLC write path exists today)
┌─────────────────────────────────────────────────────────────────┐
│  SIMULATION PLANE (Parallel Universe)                           │
│  Read-only shadow of production state                           │
│  No write path back to Control or Execution planes             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Subsystem Independence

Each subsystem is designed to fail without cascading:

| Subsystem | Failure behavior | Plant impact |
|---|---|---|
| Modbus EdgeAgent | Logs error, retries next 15s poll cycle | None — PLC continues |
| ERP Write-Back Outbox | Exponential backoff (5 attempts, max 2h) | None — queued in DB |
| LDAP Sync | Falls back to local auth, logs failure | None — login still works |
| PM Cron | Skips current run, retries next scheduled interval | None |
| Enrichment Engine | Non-blocking, caught per-record | None |
| Email Service | Marked 'skipped' in ScheduledReports | None |
| Full process crash | PLCs continue independently | **Zero** |

---

## Current State vs. Full Spec

| Component | Spec requires | Current state |
|---|---|---|
| Control Plane independence | No Trier OS runtime dependency | ✅ Met — PLC/SCADA fully independent |
| Execution Plane isolation | Subsystems fail independently | ✅ Met — all engines non-blocking |
| Degraded mode | 4 modes with write-block enforcement | ✅ Implemented — `degradedMode.js` |
| Health aggregation | Single endpoint reporting all subsystems | ✅ Implemented — `GET /api/health` |
| Governed write path | Gatekeeper for PLC writes | 🔵 Not yet needed — no PLC write path |
| Process/container isolation | Independent runtimes per subsystem | 🔵 Future — single Node process today |
| Message bus (NATS) | Backpressure + circuit breakers | 🔵 Future — direct function calls today |

---

## Acceptance Criteria Status

- [x] Zero plant impact from any Trier OS failure — Control Plane independent by design
- [x] No cascading failures across subsystems — each engine wrapped, non-blocking
- [x] All failures result in predictable degraded state — modes documented + enforced
- [ ] Full process isolation per subsystem — future milestone (NATS + containerization)
- [ ] Failure injection test suite — see `Failure_Test_Report_v1.md`
