# Trier OS Deterministic Time Machine: Scoping & Architecture

## 1. Problem Statement
The deterministic time machine capability aims to reconstruct the exact state of a Trier OS plant at any point in past time, replay forward from that point, and run "what-if" branches. In an industrial plant context, the highest value use cases are ranked as follows:
1. Incident Reconstruction (Root Cause Analysis): Replaying the exact sequence of work orders, sensor alerts, and configuration changes leading up to a critical failure.
2. Regulatory Audit Replay: Providing verifiable proof of system state and compliance at specific historical timestamps.
3. Change Simulation ("What-If"): Branching from current state to forecast the impact of delaying maintenance or rerouting production.
4. Training Simulators: Using historical plant incidents as interactive training environments for new operators.

Incident reconstruction and audit replays provide the highest immediate ROI and are structurally feasible as read-only operations. Change simulation introduces extreme complexity due to divergent state branching and is less critical for v1.

## 2. Event Log Schema
The existing `AuditLog` is unstructured and insufficient for deterministic state reconstruction. A replay-ready event log must capture complete state transitions. This requires a new dedicated table, `EventLog`, rather than a modification to `AuditLog`. The `EventLog` schema must include:
- `EventID`: Primary Key, Monotonic Integer
- `Timestamp`: ISO-8601 UTC timestamp
- `AggregateType`: The entity domain (Asset, WorkOrder, Part)
- `AggregateID`: The UUID or ID of the specific entity
- `EventType`: The semantic action (WORK_ORDER_COMPLETED, ASSET_STATUS_CHANGED)
- `PayloadBefore`: JSON snapshot of the aggregate state prior to the write
- `PayloadAfter`: JSON snapshot of the aggregate state after the write
- `CausedBy`: Self-referencing `EventID` linking to the upstream trigger event if part of a cascading chain
- `UserID`: The actor responsible for the mutation

This schema ensures that any state change can be rolled forward (applying `PayloadAfter`) or rolled backward (applying `PayloadBefore`) with absolute determinism.

## 3. Snapshot Strategy
Three approaches were evaluated for historical state reconstruction:
- Option A: Full DB Snapshot on Schedule. Copies the SQLite `.db` file hourly. Highly storage-intensive (1.2-4.8GB per plant daily) and limits replay granularity to hourly intervals. It provides zero step-by-step visibility for root cause analysis. Retrofit cost: Low.
- Option B: Snapshot + Event Log Delta. Combines a daily full DB file copy with the granular `EventLog` defined above. To restore, the system loads the midnight snapshot and replays events sequentially up to the target timestamp. Retrofit cost: Extremely High. Requires intercepting every single SQL write across the entire application to emit `PayloadBefore` and `PayloadAfter`.
- Option C: Pure Event Sourcing. No DB file snapshots; state is rebuilt entirely from genesis using the `EventLog`. Unbound replay time and massive storage requirements for long-lived plants. Retrofit cost: Prohibitive.

Recommendation: Option B (Snapshot + Event Log Delta) is the only strategy that balances storage efficiency with the required millisecond granularity for incident reconstruction. However, the retrofitting cost is immense because the application currently uses direct SQLite queries scattered across routing files.

## 4. Replay Engine Design
Under Option B, the replay algorithm for a specific timestamp (e.g., March 15 at 14:32) operates as follows:
1. Identify the nearest daily DB snapshot preceding March 15 at 14:32.
2. Copy the snapshot to a temporary in-memory database or a transient file.
3. Query the `EventLog` for all entries between the snapshot timestamp and the target timestamp, ordered by `EventID` ASC.
4. Apply the `PayloadAfter` JSON sequentially to the target aggregates in the transient DB.

Determinism Guarantees: Replays are guaranteed deterministic because they apply literal JSON payload overrides rather than re-executing the original business logic. Non-deterministic operations (email dispatch, external API calls, SCADA hardware writes, webhook triggers) are completely bypassed because the replay engine only processes storage mutations.

## 5. Branching Model
To support "what-if" change simulations, the system must allow state divergence.
- Shallow Branch: Copies the canonical `.db` file at a snapshot point, applies hypothetical operations strictly to the copy, and isolates it from the primary read/write paths. The branch is temporary, read-only, and discarded after the simulation session.
- Deep Branch: Implements full copy-on-write at the storage tier, allowing branched realities to be merged back into the canonical timeline. Requires complex conflict resolution protocols for overlapping entity modifications.

Recommendation: Shallow Branching. Deep branching introduces catastrophic complexity to a standard SQLite architecture and conflicts with the single-source-of-truth requirement for compliance. Shallow branching fulfills the "what-if" forecasting requirement safely.

## 6. HA Relationship
The existing `ha.js` script replicates the full plant `.db` file to a secondary server on a schedule. This existing infrastructure can and should be heavily leveraged to fulfill the daily snapshot requirement of Option B.
To serve as the snapshot foundation, `ha.js` requires one modification: instead of exclusively overwriting the secondary replica, it must retain a historical archive copy (e.g., `Plant_1_20260315.db`) on a persistent storage volume before executing the sync. The `EventLog` stream will remain independently housed inside the plant DB file.

## 7. Storage and Retention Policy
The retention policy balances compliance requirements with disk storage constraints:
- EventLog Retention: Immutable forever. Event entries are lightweight JSON strings; retaining them indefinitely guarantees complete system audibility.
- Snapshot Retention: Daily DB snapshots are retained on a sliding 30-day window. Snapshots older than 30 days are automatically purged by a nightly cron job.
- Deep Archival: If a plant requires audits beyond 30 days, a monthly snapshot is retained in cold storage (AWS S3 or Azure Blob) indefinitely.

## 8. Decision
Decision: NO-GO

Reasoning: The deterministic time machine capability requires Option B (Snapshot + Event Log Delta) to be viable. Implementing Option B mandates that every write operation in the system emits a perfectly structured `PayloadBefore` and `PayloadAfter` event. Trier OS currently executes database mutations via raw SQLite `INSERT`/`UPDATE` queries scattered directly inside Express route handlers. Attempting to bolt an `EventLog` emitter onto these disjointed write paths will result in missed events, race conditions, and corrupted historical timelines.

Blocking Prerequisite: The deferred P2-2 Gatekeeper (Command Dispatcher) must be fully implemented. Until a centralized write-intercept layer exists that automatically captures and wraps all database mutations into standardized `EventLog` objects before committing the transaction, the time machine cannot guarantee determinism. Once the Gatekeeper routes 100% of mutations, this feature can proceed to implementation.
