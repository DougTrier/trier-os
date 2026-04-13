# Failure Injection Test Report v1
> Trier OS P2 · Validates failure domain isolation guarantees

---

## Test Protocol

Each test kills or corrupts a subsystem and verifies no cascade occurs. Tests are run against a staging instance with all plant connections active.

**Pass criteria:**
- Plant (PLC/SCADA) continues operating independently — zero impact
- Other Trier OS subsystems remain available
- System reaches a predictable, documented degraded state
- No data corruption in unaffected plant DBs

---

## Test Matrix

### T1 — Kill EdgeAgent Worker

**Action:** Stop the Modbus EdgeAgent worker for one plant  
**Expected:** That plant's sensor readings freeze. All other plants unaffected. Server healthy. WO workflows unaffected.  
**How to run:** Admin Console → Integrations → Stop Worker  
**Verify:** `GET /api/health` shows active workers reduced by 1, no other errors  
**Status:** ☐ Not yet run

---

### T2 — Kill ERP Outbox

**Action:** Kill the ERP outbox drain worker process while items are pending  
**Expected:** Outbox items stay in `retrying` state. Main server fully operational. No data lost.  
**How to run:** Comment out `startDrainWorker()` in index.js and restart  
**Verify:** Outbox items accumulate but all other API routes respond normally  
**Status:** ☐ Not yet run

---

### T3 — Corrupt a Connector Config

**Action:** Set an integration config to an unreachable IP  
**Expected:** That worker fails with connection error, retries every 15s, does not crash the server  
**How to run:** Admin Console → Integrations → Edit → set host to `192.168.254.254`  
**Verify:** Worker shows error in status; all other workers unaffected; server healthy  
**Status:** ☐ Not yet run

---

### T4 — Kill Full Trier OS Process

**Action:** Kill the Node.js process  
**Expected:** PLC/SCADA continues without any interruption. Plant produces normally.  
**How to run:** `taskkill /IM trier-os.exe /F`  
**Verify:** PLCs continue running (check SCADA HMI — no alarms related to Trier OS). Plant output unaffected.  
**Status:** ☐ Not yet run  
**Note:** This test must be coordinated with the controls engineer and run during a safe window.

---

### T5 — LDAP Server Unreachable

**Action:** Block LDAP port or shut down AD test server  
**Expected:** LDAP users fail LDAP auth but succeed via local auth fallback. System remains fully operational.  
**How to run:** Network ACL block on LDAP port 389/636  
**Verify:** Login with LDAP user succeeds (local fallback). Login with local-only user succeeds. `GET /api/health` healthy.  
**Status:** ☐ Not yet run

---

### T6 — Set Advisory-Only Mode

**Action:** `POST /api/health/mode` with `ADVISORY_ONLY`  
**Expected:** All GET requests succeed. All POST/PUT/DELETE requests return 503 with clear message. Login and health endpoints still work.  
**How to run:**
```
POST /api/health/mode
{ "mode": "ADVISORY_ONLY", "reason": "T6 failure isolation test" }
```
**Verify:** Try `POST /api/work-orders` → 503. Try `GET /api/assets` → 200. Try login → 200.  
**Status:** ☐ Not yet run

---

### T7 — Memory Pressure

**Action:** Artificially exhaust heap (test environment only)  
**Expected:** Health endpoint reports `memory.status: warning` but server continues operating  
**How to run:** Custom script allocating large arrays in test environment  
**Status:** ☐ Not yet run — test environment required

---

## Sign-Off Requirements

Before a safety-critical plant deployment:
- [ ] T1–T5 executed and passed with a controls engineer present for T4
- [ ] Results documented with pass/fail and any observations
- [ ] Any failures investigated and resolved before deployment proceeds
- [ ] Controls engineer confirms T4 result in writing

**Test sign-off:** _________________________ Date: _____________
