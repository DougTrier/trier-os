<!-- Copyright © 2026 Trier OS. All Rights Reserved. -->
# Runbook: Data Ingestion Failure (Message Bus Backpressure)

## Symptoms
- Dashboards show stale telemetry.
- Sensors appear offline but physically have power.
- Outbound integrations are queuing in `server/routes/integrations-outbox.js`.

## Immediate Actions (Current Architecture)
1. **Check Sensor Routes:** Inspect logs for `server/routes/sensors.js` to see if ingestion traffic is failing at the API boundary.
2. **Verify Modbus Client:** Ensure `server/integrations/modbus-client.js` is successfully polling. A single unresponsive PLC could cause thread blockage if timeouts are misconfigured.
3. **Restart Service:** Perform a graceful restart of the Express telemetry route if the Node event loop is stuck.

## Implemented State [IMPLEMENTED — P2-1]

The following mechanisms replaced the deferred placeholders above as of v3.5.1 / P2-1 delivery:

### NATS Message Bus
- NATS broker runs at `localhost:4222` (or `NATS_URL` env var).
- `background_cron.js` publishes `trier.anomaly.detected` after every utility anomaly check cycle.
- `erp_sync.js` publishes `trier.system.state` when the ERP circuit breaker opens or closes.
- `index.js` subscribes to both subjects and routes state changes to `setMode()`.

### Circuit Breakers
- **ERP connector** (`server/runtimes/erp_sync.js`): opossum breaker wrapping `probeErp()`. Trips after 50% failure rate over ≥3 calls within 8s. Sets system to ISOLATED on open; recovers to NORMAL on close. Reset timeout: 30s.
- **Email/SMTP** (`server/runtimes/background_cron.js`): opossum breaker wrapping `sendEmailAttempt()`. Trips on 50% failure over ≥2 calls within 15s. **Does NOT change system mode** — SMTP failure suppresses emails only. Reset timeout: 60s.

### Diagnostic Procedure (Backpressure / Ingestion Failure)
1. **Check system mode:** `GET /api/health` → `status` field. If `ISOLATED`, an external connector tripped the ERP circuit breaker.
2. **Check runtime logs:**
   - `[ERP_SYNC] Circuit OPEN` — ERP endpoint unreachable.
   - `[BACKGROUND_CRON] Email circuit OPEN` — SMTP unreachable (writes not affected).
   - `[BUS] Could not connect to NATS` — NATS broker is down; bus-dependent alerting disabled but core API unaffected.
3. **Manual mode override (admin):** `POST /api/health/mode` with body `{ "mode": "NORMAL", "reason": "Manual recovery after investigation" }`.
4. **NATS backpressure confirmed safe (Scenario 2, F5):** 100,000-message flood against `trier.load.test` produced no event loop stall and no impact on `GET /api/ping` or Gatekeeper response times. The core API is not a NATS consumer — it subscribes only to `trier.anomaly.detected` and `trier.system.state`, which are low-volume control subjects.
