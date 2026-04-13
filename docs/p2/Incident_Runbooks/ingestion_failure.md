# Runbook: Data Ingestion Failure (Sensor/ERP Sync)
> Severity: Sev 2 · Plant continues normally — this is advisory data only

---

## What This Covers

- Modbus EdgeAgent not polling PLC data
- OPC-UA device reads failing
- ERP sync worker not processing outbox
- Sensor readings not updating in dashboards

**Plant impact: Zero.** PLC/SCADA continues independently. This runbook covers Trier OS data feeds only.

---

## Diagnose — Which Feed Is Failing?

### Option A: Check the health endpoint
```
GET /api/health
```
Look at `subsystems.integrations` — any `errored` workers will be listed.

### Option B: Check integration status in the UI
Admin Console → Plant Setup → Integrations → Worker Status

### Option C: Check the sensor readings
Assets & Machinery → select an asset → Sensor Readings tab
If readings are stale (timestamp not updating), the EdgeAgent for that plant is failing.

---

## Modbus EdgeAgent Failure

**Symptoms:** Sensor readings frozen, no new SensorReadings rows, EdgeAgent shows error in worker status.

**Step 1 — Check connectivity:**
```bash
# From the server, test TCP connection to the PLC
nc -z <plc-ip> <port>    # Linux/Mac
Test-NetConnection -ComputerName <plc-ip> -Port <port>  # Windows PowerShell
```
- If connection fails → network issue. Check with controls/IT team. The EdgeAgent will retry automatically.
- If connection succeeds → go to Step 2

**Step 2 — Restart the worker:**
- Admin Console → Plant Setup → Integrations → [integration name] → Stop Worker → Start Worker
- Worker restarts from scratch and begins polling immediately

**Step 3 — Check TAG_DEFINITIONS:**
If worker starts but no data flows, verify register addresses in the integration config match the actual PLC program. Address mismatch produces silent no-data (not an error).

**Worker auto-recovery:** The EdgeAgent has a 4-second socket timeout and retries every 15 seconds automatically. A brief network blip self-recovers without intervention.

---

## ERP Outbox Failure

**Symptoms:** ERP outbox shows items stuck in `pending` or `retrying` state.

```
GET /api/integrations/outbox/status
```

**Retry policy:** 5 attempts with exponential backoff (max 2 hours between retries). Items marked `failed` after 5 attempts will not auto-retry.

**Step 1 — Check ERP endpoint reachability:**
- Admin Console → Plant Setup → Integrations → [ERP integration] → Test Connection

**Step 2 — Manual retry:**
- Admin Console → Integrations → Outbox → select failed items → Retry

**Step 3 — If ERP is down:**
Items stay in the outbox queue and will sync when the ERP comes back up. No data is lost. This is expected behavior — the outbox is a durable write buffer.

---

## After Recovery

1. Confirm sensor readings are updating (check timestamp freshness)
2. Confirm ERP outbox shows 0 pending items (or expected queue depth)
3. Note the duration of the gap in readings for any compliance reporting that requires continuous sensor data
