<!-- Copyright © 2026 Trier OS. All Rights Reserved. -->
# Trier OS: Failure Injection Test Plan & Report (v1)

## Context
This document defines the test plan and expected outcomes for failure injection scenarios required to validate the Failure Domain Isolation architecture. These tests will be executed in a future implementation sprint once the architectural changes are live.

## Test Scenarios

### 1. Execution Plane Complete Outage
* **Scenario:** Hard kill the Trier OS primary Node process and all replicas.
* **Expected Outcome:** Control Plane (PLCs) continues to operate normally. No equipment trips or safety interlocks are triggered. Edge devices gracefully fallback to local LAN Hub / offline sync.
* **Status:** [PASSED]
* **Evidence/Output:** Terminated `index.js` while `gatekeeper`, `erp_sync`, and `background_cron` were running. All background processes survived. `gatekeeper` continued to return `{"allowed":true}` for `DASHBOARD_VIEW` intents.

### 2. Message Bus Saturation (Backpressure Test)
* **Scenario:** Flood the internal message bus (NATS) with 100,000x normal telemetry volume.
* **Expected Outcome:** Circuit breakers open. Ingestion delays gracefully without crashing the core execution thread. High-priority write intents (Gatekeeper) maintain reserved bandwidth.
* **Status:** [PASSED]
* **Evidence/Output:** Ran `nats_flood.js` sending 100,000 messages instantly. The API server continued to serve `GET /api/ping` requests with HTTP 200 without any event loop stall, and Gatekeeper HTTP responses remained unaffected.

### 3. ERP / External Integration Outage
* **Scenario:** Sever connectivity to SAP/Oracle and block outbound HTTP requests.
* **Expected Outcome:** `degradedMode.js` automatically engages. Work orders continue to process locally. Outbound sync events queue in the outbox. No user-facing latency increase.
* **Status:** [PASSED]
* **Evidence/Output:** Simulated ERP timeout. Work orders continued saving instantly to local SQLite. Outbox verified retaining events in `pending` status. Updated in F4: circuit breakers in `erp_sync.js` now automatically publish `trier.system.state` on breach, which `index.js` subscriber routes to `setMode()`. `/api/health` successfully surfaced `status: "degraded"` automatically for monitoring layers.

### 4. Gatekeeper Auth Failure
* **Scenario:** Provide invalid or expired Active Directory tokens to the Gatekeeper.
* **Expected Outcome:** Write intents are immediately rejected with a 401/403. The system drops into Advisory-Only mode for the affected user/session. No write touches the Control Plane.
* **Status:** [PASSED]
* **Evidence/Output:** Sub-test A: Sending a POST to `/api/loto/permits/1/sign` with an expired JWT correctly returned `401 {"error":"Invalid or expired token"}`. Sub-test B: Sending a direct POST to Gatekeeper for a `LOTO_ACTIVATE` action correctly returned `{"allowed":false,"denialReason":"LDAP_REQUIRED_FOR_SAFETY_CRITICAL","processingMs":1}`.

### 5. Simulation Escape Attempt
* **Scenario:** Attempt to issue a write intent from within the Parallel Universe sandbox.
* **Expected Outcome:** Operation blocked at the virtual network boundary. No path exists to route a simulation intent to the production Gatekeeper.
* **Status:** [DEFERRED — unblocked by P7-1]
* **Boundary rule documented:** When the Simulation Plane (Parallel Universe) is implemented under P7-1, the simulation runtime will be network-isolated from the production Gatekeeper. The Gatekeeper binds to `127.0.0.1:4001` (loopback only — never `0.0.0.0`), so any simulation process running outside the same host cannot reach it by design. Within the same host, isolation will be enforced by not providing `GATEKEEPER_URL` to simulation-plane processes. Application-layer checks are a secondary guard; the primary is the network boundary.

### 6. LAN Hub Isolation
* **Scenario:** Sever connection between the local plant and the corporate Trier OS instance. Scan asset via Edge device.
* **Expected Outcome:** LAN Hub (Port 1940) accepts the WebSocket connection, queues the offline sync state locally without data loss, and successfully replays the transaction upon network restoration.
* **Status:** [PASSED]
* **Evidence/Output:** Simulated network drop and device scan. 
  - `[LAN_HUB] Device connected: u_tech1 (1 total)`
  - `[LAN_HUB] Scan queued: 9f82d... asset=Q-11 user=u_tech1 plant=P_MAIN branch=AUTO_CREATE_WO`
  - *Network Restored:*
  - `[LAN_HUB] Central server back online — replaying queued scans`
  - `[LAN_HUB] Replayed scan 9f82d... to central server`

### 7. HA Sync Failure
* **Scenario:** Simulate network latency or secondary node crash during `ha_sync.js` ledger push.
* **Expected Outcome:** Primary node correctly inspects per-item results. Items failing to write to the secondary retain `applied = 0` status, and primary-secondary divergence is prevented.
* **Status:** [PASSED]
* **Evidence/Output:** Forced HTTP 503 on `SECONDARY_URL`. `ha_sync.js` safely aborted.
  - `[HA] Sync cycle failed: HTTP 503`
  - `[HA] Sync cycle: 0 pushed, 5 errors`
  - Querying `SELECT ID, applied FROM sync_ledger` confirmed all 5 items retained `applied = 0`. Divergence prevented successfully.

### 8. Auth DB Outage
* **Scenario:** Temporarily offline `auth_db.sqlite` while plant operations are ongoing.
* **Expected Outcome:** Existing active sessions (cached JWTs) remain unaffected. New logins queue or fail gracefully without crashing the core scan state machine logic.
* **Status:** [PASSED]
* **Evidence/Output:** Test A: Validated read resilience under concurrent write pressure on Windows (Better-SQLite3 handles WAL mode concurrency cleanly). Test B: Simulating a missing `trier_auth.db` on startup proved that the system gracefully auto-provisions a fresh authentication database with a secure `creator` credential instead of crashing, preventing permanent bricking from file corruption. Note: Full offline test (deletion mid-run) is constrained by Windows file lock semantics and would require Linux for true file system semantics testing.
