# Site reset and IT bulk deletion

**Current release decision:** release 3.7.2 is authorized after final committed-source artifact checks. Earlier blocked/no-publication wording below records the pre-release audit decision; see [current release notes](RELEASE_NOTES_3.7.2.md).

Copyright © 2026 Doug Trier. Licensed under the [MIT License](../LICENSE).

**Completed September 17–18 follow-up:** [SURGICAL_REMEDIATION_AUDIT.md](SURGICAL_REMEDIATION_AUDIT.md) records verified legacy single-delete authorization/result correction, delayed-reset offline-queue correction, migration-ledger retention, and repeated reset/bulk preservation tests. The 25 focused SPA/security tests passed, followed by the complete seven-project run: **1,129 passed, 0 failed, 22 documented skips, 0 not run**. Final checks confirm zero IT dependency orphans, preserved accounts/roles/groups/grants and IT records, retained audit/history, removed dedicated fixtures, and unchanged original data.

The reported Corporate Office reset defect was reproduced against a disposable
running API with the real SQLite schema and JWT middleware. A foreign-key parent
survived deletion while the old endpoint returned success. IT assets were never
included because they live in the shared logistics database. The administrative
panel also confirmed the current site while submitting the export selector's site.

The corrected reset previews the exact selected site's counts, requires its exact
name, backs up both resolved database connections, and deletes within one attached
SQLite transaction. Foreign-key checks are deferred until commit; errors and
nonzero remaining counts reject the reset. Virtual-table shadow storage is managed
through its owning virtual table. Unregistered and system database targets fail
before a plant connection is opened.

Reset scope includes the existing plant operational-table policy and IT software,
hardware, infrastructure, mobile, site-assigned vendor contracts, current assignment
and installation links, and computed depreciation. Reference tables, auth accounts,
corporate catalogs, shared safety records, audit logs, IT movement history, and
shared IT work-order links are retained. It is not a wipe of every shared record
mentioning a site. IT records with an unassigned site are not owned by Corporate
Office merely because a corporate user sees them in the enterprise inventory.

The user explicitly requested bulk deletion alongside the repair. All four IT asset
tabs support checkbox selection and selecting all filtered rows, with a confirmation
showing the number selected by site. Only IT Admins and Creators can execute it.
The server checks each asset's observed site, uses one transaction per asset, and
returns per-item outcomes. The UI clears only verified deletions and retains failed
selections. Existing hard-delete semantics for IT assets are preserved; shared
movement and work-order history is retained.

## Validation

Run `node tests/unit/database_reset.test.js --ui` and `npm run build`.
The regression uses a generated temporary DATA_DIR and stops at the first failure.
It covers dry runs, invalid targets, permissions, two-site isolation, all IT asset
categories, foreign-key ordering, FTS shadow storage, overlapping links, retained
history and users, backups, injected SQL failures, ignored deletes, empty resets,
partial bulk outcomes, moved assets, retry, and audited actors. Browser checks use
the actual components and API: target changes, confirmation, reset results,
filtered selection, cancellation, partial failure, and retry. Screenshots are saved
with the disposable fixture. No production data is reset by these tests.

## Recovery limits

Both databases use WAL. The transaction rolls back SQL/verification failures, but
SQLite does not guarantee crash-atomic commit across attached WAL databases. Keep
both returned pre-reset snapshots for recovery; a power-loss/failover scenario is
not validated here. Shared snapshots contain other sites as well: do not overwrite
a running shared database or use the plant-only restore UI on that snapshot.
Recovery must account for newer records at every site. Backups precede execution,
and concurrent activity can change preview counts. Perform administrative resets
during a maintenance window. No installer or release artifacts were built by this
regression, and the full release test suite remains a separate gate.

## Full application regression follow-up — 2026-09-17

The later [preservation regression audit](REGRESSION_PRESERVATION_AUDIT.md)
extends the component harness above with eight tests using the real built SPA and
an isolated copy of development data. Those tests pass for reset preview/cancel,
backup contents and failure refusal, SQL rollback, all four IT categories,
partial deletion/retry, sentinel accounts/groups/grants and server restart.

That pass found and fixed a real-schema regression: delete triggers append to
`EventLog` and `sync_ledger`, so attempting to empty those tables caused reset
verification failure or erased retained history/replication tombstones. The reset
plan now retains both; the API/UI describe this, and a trigger-based database
regression verifies it. No existing migration or HA module was changed by this fix.

Production-size EXE/MSI verification artifacts were built in the later pass and
remain unpublished. See the linked audit for the complete browser-suite outcome,
source-data reconciliation. Current completed results are in the surgical follow-up.
