<!-- Copyright © 2026 Trier OS. All Rights Reserved. -->
# Trier OS: Operational Support Model (v1)

## Context
This document defines the tiered support structure, incident severity levels, and health monitoring baseline for Trier OS.

## Tiered Support Structure
1. **Tier 0 (On-Site Operators):** Floor personnel and shift supervisors. First line of defense. Handles basic troubleshooting, sensor resets, and LAN Hub power cycling. Relies on the Operator Quick-Start Guide.
2. **Tier 1 (Local IT/OT):** Plant-level network engineers and systems administrators. Handles AD/LDAP sync issues, physical network outages, and primary server/edge gateway reboots.
3. **Tier 2 (Trier OS Core Team):** Centralized engineering team. Handles database corruption, P1 bug fixes, HA sync divergences, and Gatekeeper anomalies.

## Incident Severity Levels
- **Sev 1 (Plant Impact):** Core Execution Plane down or Gatekeeper blocking all writes. Operations halted or safety compromised. Requires immediate Tier 2 escalation.
- **Sev 2 (Degraded):** ERP connectivity lost, `degradedMode.js` active. Work orders continue locally but corporate visibility is delayed. Tier 1 handles with Tier 2 monitoring.
- **Sev 3 (Non-Critical):** Analytics dashboard down, non-critical sensor reporting stale data. Addressed in normal sprint planning or shift maintenance.

## System Health Monitoring Baseline
Trier OS currently implements robust system state tracking via `server/routes/health.js`, which accurately monitors all subsystems.
- **Current State:** The system tracks Healthy, Degraded, Advisory-Only, and Isolated states.
- **Deferred Implementation:** The missing component is proactive *alerting and notifications* (e.g., SMS/email/Slack to on-call engineers) when `health.js` detects a state degradation. This implementation task is deferred to a future sprint.
