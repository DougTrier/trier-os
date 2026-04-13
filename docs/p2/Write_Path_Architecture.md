# Governed Write Path — Gatekeeper Architecture
> Trier OS P2 · Required before any PLC/SCADA write authority is granted

---

## Current State

Trier OS has **no PLC write path today.** All field device interaction is read-only:
- Modbus EdgeAgent polls registers (read)
- OPC-UA device registry discovers tags (read)
- ERP Write-Back Outbox writes to ERP REST APIs (outbound HTTP, not to field devices)

The Gatekeeper is the required architecture for **when write authority is needed.** It does not need to exist until a write path is being built. This document defines the architecture so the write path is never built without it.

---

## The Governed Intent Model

Trier OS never issues raw commands to field devices. It submits **governed intents** to the Gatekeeper. The Gatekeeper validates, approves, and hands off to the Control Adapter.

```
Trier OS → Gatekeeper → Control Adapter → PLC/SCADA
```

If Gatekeeper is unavailable → system drops to ADVISORY_ONLY → all writes blocked.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Trier OS API / Automation Engine                               │
│  Submits: GoverneIntent { action, target, userId, permitId }    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ governed intent (not raw command)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  GATEKEEPER SERVICE (separate runtime)                          │
│                                                                 │
│  1. Verify user identity (LDAP/AD RBAC)                         │
│  2. Classify action (Read-only / Advisory / Non-critical /      │
│        Safety-critical)                                         │
│  3. Check PTW (active permit required for relevant actions)     │
│  4. Check MOC (change record required for safety-critical)      │
│  5. Run Parallel Universe pre-proof (P7 Safe Action Layer)      │
│  6. Generate signed change ticket                               │
│  7. Write immutable audit entry                                 │
│  8. Pass to Control Adapter — OR — reject with explanation      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ validated, signed intent only
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  CONTROL ADAPTER                                                │
│  OPC-UA write proxy / Modbus command wrapper                    │
│  Rate limiting · command validation · fail-safe defaults        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
                    PLC / SCADA (Control Plane)
```

---

## Action Classification

| Class | Examples | Approval required |
|---|---|---|
| Read-only | Sensor read, asset query | None |
| Advisory | Recommendation surfaced to operator | None — operator acts |
| Non-critical write | WO status update, ERP sync | Standard RBAC |
| Safety-critical write | Setpoint change, valve command, isolation | PTW + MOC + elevated approval |

Safety-critical actions are **blocked by default** until the Gatekeeper + PTW + MOC modules exist.

---

## Gatekeeper — Not Yet Built

The Gatekeeper is a **future separate runtime.** Until it exists:
- No write path to field devices is allowed
- Any future feature proposing direct PLC writes must be blocked at design review
- The `ADVISORY_ONLY` degraded mode enforces this at the API layer

**Deliverable when built:** `Write_Path_Architecture.pdf` reviewed by controls engineer before any write authority is activated.

---

## Acceptance Criteria (when Gatekeeper is built)

- [ ] 100% of write actions pass through Gatekeeper — zero bypass paths
- [ ] No direct PLC/SCADA writes from any Trier OS service
- [ ] Full traceability for every change (who, what, when, why, approved by)
- [ ] Any action can be replayed and audited deterministically
- [ ] Gatekeeper unavailability triggers automatic ADVISORY_ONLY mode
