<!-- Copyright © 2026 Trier OS. All Rights Reserved. -->
# Trier OS: Governed Write Path Architecture (v1)

## Context & Overview
Trier OS must never write directly to field devices from the core application logic. This document defines the **Gatekeeper Service**, the strict architectural boundary that sits between the Execution Plane and the Control Plane. All governed intents (write operations) must pass through the Gatekeeper for validation before reaching physical PLCs or SCADA systems.

## Architecture
```text
[ Edge Clients / Core Runtime ]
          │
          ▼ (Intent Request)
  ┌────────────────────────┐
  │  Gatekeeper Service    │  <-- Isolated Runtime
  │  - Auth/RBAC Validation│
  │  - PTW/MOC Validation  │
  │  - Audit Logging       │
  └────────────────────────┘
          │
          ▼ (Validated Command)
  ┌────────────────────────┐
  │   Control Adapters     │
  │  - OPC-UA Write Proxy  │
  │  - Modbus Wrapper      │
  └────────────────────────┘
          │
          ▼ (Physical Action)
[ PLC / SCADA / Field Device ]
```

## Gatekeeper Responsibilities
The Gatekeeper acts as the final defense layer. It does not generate commands; it only validates intents against current plant state.

1. **Authentication & RBAC:** Validates Active Directory / LDAP groups. Note: Partial implementation already exists via `server/routes/ldap.js`.
2. **Permit to Work (PTW) Validation:** Checks if a safety-critical action is covered by an active, unexpired PTW for that specific user and asset.
3. **Management of Change (MOC) Validation:** Prevents structural parameter changes unless a validated MOC record is approved.
4. **Immutable Audit Logging:** Records Who, What, When, Why, and the Request ID for every intent that passes or is rejected by the Gatekeeper. Per Rule A-2, this cross-plant audit data must be routed to `trier_logistics.db` via `logistics_db.js`.

## Failure Mode (Fail-Closed Contract)
The Gatekeeper Service represents a critical safety boundary. If the Gatekeeper service itself crashes, becomes unreachable, or enters an indeterminate state, the system **MUST fail closed**. All governed write intents will be immediately denied, and the physical control plane will remain untouched. A system that fails open on its safety enforcement layer is not deployable.

## Implementation Roadmap (Future Sprints)
The following implementation tasks have been completed in the P2-2 sprint:
- **[IMPLEMENTED]** Isolate Gatekeeper as a separate physical runtime.
- **[IMPLEMENTED]** Define Inter-Process Communication (IPC) strategy between the main Trier OS process and the isolated Gatekeeper (e.g., HTTP on a loopback port, Unix socket, or Named pipe).
- **[IMPLEMENTED]** Fully integrate LDAP/AD RBAC classes into Gatekeeper intent validation.
- **[IMPLEMENTED]** Implement PTW and MOC validation hooks inside the Gatekeeper logic.
- **[IMPLEMENTED]** Build the Change Validation Engine to cross-reference roles, state, and permits.
- **[IMPLEMENTED]** Enforce immutable audit logging tied to request IDs at the Gatekeeper level.
- **[IMPLEMENTED]** Build physical control adapters (OPC-UA Write Proxy, Modbus Wrapper).

> **Note:** Full write-path interception (every SQLite mutation emits to Gatekeeper) is the next increment required before P7-1 (Time Machine) and P7-2 (Safe Action Cert) can proceed to implementation.
