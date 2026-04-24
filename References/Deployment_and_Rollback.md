<!-- Copyright © 2026 Trier OS. All Rights Reserved. -->
# Trier OS: Deployment and Rollback Procedure (v1)

## Context
Safety-critical systems require strict change management. This document defines the deployment pipeline and recovery mechanisms for Trier OS releases.

## Versioning Model
Trier OS follows Semantic Versioning (SemVer) with a strict schema-breaking indicator.
- **Major (X.y.z):** Breaking change to the Execution Plane or Gatekeeper boundaries. Requires recertification.
- **Minor (x.Y.z):** New features, non-breaking schema additions (e.g., new tables).
- **Patch (x.y.Z):** Bug fixes, catalog additions.

## Staged Deployment Procedure
1. **Simulation (Parallel Universe):** The build is first deployed to the `sandbox` environment and exercised against a cloned snapshot of production data.
2. **Staging:** Deployed to a physical QA environment connected to simulated PLCs. Full failure injection test suite is executed.
3. **Canary (Advisory-Only):** Deployed to production but locked in Advisory-Only mode. Telemetry is ingested, but write intents are blocked.
4. **Full Production:** Gatekeeper write path is unblocked.

## One-Click Rollback
Because Trier OS maintains an active `ha_sync.js` replication ledger, rollbacks are handled via state replay or snapshot restoration, rather than basic file restoration.
- **HA Resync Procedure:** The deployment automation gracefully halts the primary node, restores the previous binary/Docker image, and commands the node to resync its state from the secondary HA replica up to the last known good transaction block.
- **Snapshot Rollback (`POST /api/ha/rollback`):** For undoing a bad migration or logically corrupt state without a secondary to resync from, Trier OS utilizes snapshot-based rollback. This rewinds the local ledger to a known good state.
- **Condition:** Database schema migrations must be strictly backward-compatible (A-3 rule: no destructive column drops) to ensure the older binary can still read the database post-rollback.
