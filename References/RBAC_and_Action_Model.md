<!-- Copyright © 2026 Trier OS. All Rights Reserved. -->
# Trier OS: RBAC & Action Model (v1)

## Context
This document defines the Role-Based Access Control (RBAC) classifications and how they intersect with the Gatekeeper Service to govern write intents to physical equipment.

## Role Classifications (LDAP/AD Integration)
Trier OS maps Active Directory groups to four primary privilege classes. (Note: Initial LDAP infrastructure exists in `server/routes/ldap.js` and will be expanded).

1. **Read-Only**
   - **Scope:** Dashboards, analytics, read-only telemetry.
   - **Write Path:** Blocked.
   - **Target Audience:** Corporate executives, external auditors.

2. **Advisory**
   - **Scope:** Read telemetry, acknowledge alerts, add notes to Work Orders.
   - **Write Path:** Blocked.
   - **Target Audience:** Shift supervisors monitoring operations remotely.

3. **Non-Critical Execution**
   - **Scope:** Create/close standard Work Orders, consume parts, update inventory.
   - **Write Path:** Permitted for non-safety-critical system states (e.g., updating a setpoint within standard operational bounds).
   - **Target Audience:** Floor operators, standard maintenance technicians.

4. **Safety-Critical Execution**
   - **Scope:** Modify safety parameters, override interlocks, execute LOTO/MOC/PTW workflows.
   - **Write Path:** Permitted, subject to active permit validation by the Gatekeeper.
   - **Target Audience:** Lead engineers, plant safety officers.

## Change Validation Engine Logic
When a write intent reaches the Gatekeeper, the Validation Engine executes the following logic:

1. **Identity Check:** Validate AD/LDAP token.
2. **Role Check:** Does the user hold the necessary role classification for the target asset?
3. **State Check:** Is the asset in a state that permits this action? (e.g., Not in LOTO). Note: The implementation must wire into the existing LOTO system (`server/routes/loto.js`) rather than building new state tracking.
4. **Permit Check (If Safety-Critical):** Does the user have an active, signed PTW/MOC authorizing this specific action?
5. **Audit:** Log result (Allow/Deny) immutably.

## Role Change Invalidation (Design Note)
If a user's role is downgraded mid-session, the Gatekeeper cannot simply trust a cached JWT. For all safety-critical actions, the Gatekeeper must force-revalidate the user's role against the current AD state to ensure privileges have not been revoked.
