# Parallel Universe — Spec & Design Intent
> Trier OS P7 · Safe Action Certification Layer

---

## What It Is

The Parallel Universe (PU) is a simulation layer that **shadows every proposed control-layer write** through a deterministic copy of the plant's operating state before the write is executed. If the simulation detects a hazard — unsafe state transition, interlock violation, cascade risk — the Gatekeeper blocks the write and returns a signed proof receipt explaining why.

This is a **P7 capability**. It requires:
1. The P2 Gatekeeper (separate write proxy — not yet built)
2. A real-time digital twin of at least one plant's PLC state
3. A simulation engine that can step through PLC logic deterministically

---

## Current Implementation State

A stub exists at `server/routes/live_studio.js` (search for `parallel-universe`). It is a placeholder route that returns a mock "safe" response. No simulation logic is implemented. No PLC state is modeled.

This stub exists so the frontend can reference the endpoint concept without blocking other development.

---

## Design Intent

```
Write Request
     │
     ▼
┌──────────────────────────────────────┐
│  Gatekeeper (P2)                     │
│  - Role check                        │
│  - State check                       │
│  - Permit check                      │
│       │                              │
│       ▼                              │
│  ┌─────────────────────────────┐     │
│  │  Parallel Universe Engine   │     │
│  │  - Clone current PLC state  │     │
│  │  - Apply proposed write     │     │
│  │  - Run forward N steps      │     │
│  │  - Check safety invariants  │     │
│  │  - Return: SAFE | BLOCKED   │     │
│  │    + signed proof receipt   │     │
│  └─────────────────────────────┘     │
│       │                              │
│       ▼ (only if SAFE)               │
│  Execute write on real PLC           │
└──────────────────────────────────────┘
```

---

## What "Proof Receipt" Contains

```json
{
  "requestId": "uuid",
  "action": { "tag": "Pump_1_Start", "value": true },
  "simulatedAt": "2026-04-12T14:32:00Z",
  "stepsSimulated": 50,
  "result": "SAFE",
  "invariantsChecked": ["pressure_safe", "interlock_clear", "permit_active"],
  "invariantsPassed": ["pressure_safe", "interlock_clear", "permit_active"],
  "signedBy": "parallel-universe-engine-v1",
  "signature": "sha256:..."
}
```

---

## Build Prerequisites

Before PU can be implemented:

1. **P2 Gatekeeper** — PU runs inside Gatekeeper's write path
2. **PLC State Mirror** — real-time tag cache (OPC-UA or Modbus polling) for at least one plant
3. **Invariant Library** — plant-specific safety rules (e.g., "never start pump if discharge valve closed")
4. **Simulation Runtime** — lightweight state-step engine; could be WASM or a sandboxed Node worker

---

## Why This Matters

Without PU, the Gatekeeper can block writes based on static rules (role, state, permit). With PU, it can block writes based on **predicted future states** — catching second-order effects that static rules miss.

This is the capability that separates Trier OS from every other CMMS/SCADA integration platform. It is a P7 item because it requires significant infrastructure and cannot be safely implemented before the P2 Gatekeeper is in production.

---

## Related Documents

- `docs/p2/Write_Path_Architecture.md` — Gatekeeper design (prerequisite)
- `docs/p2/Isolation_Architecture_v1.md` — 3-plane separation (control plane must be isolated before PU can shadow it)
