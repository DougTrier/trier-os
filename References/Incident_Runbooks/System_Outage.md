<!-- Copyright © 2026 Trier OS. All Rights Reserved. -->
# Runbook: Total System Outage

## Symptoms
- Clients cannot connect to the primary Trier OS runtime.
- Gatekeeper denies all intents.
- PWA falls back to offline mode.

## Immediate Actions
1. **Verify Control Plane:** Ensure PLCs and SCADA are operating autonomously (Fail-Closed contract active).
2. **Check Primary Node Health:** Query `GET /api/health` to receive structured subsystem state. If unresponsive, then fall back to `pm2 status` or `systemctl status trieros` to check for memory exhaustion or fatal crashes.
3. **Check Network Links:** Verify the core switch connecting the Execution Plane to the edge gateways.

## Recovery
- If the primary node is unrecoverable, promote the HA secondary node (`ha_sync.js`) to primary.
- Instruct operators to use LAN Hubs until central connectivity is restored.
