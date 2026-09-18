<!-- Copyright © 2026 Doug Trier. Licensed under MIT; see ../LICENSE. -->

# Trier OS architecture invariants

Invariants describe intended correctness, not universal guarantees under every network, concurrency or hardware failure. Their historical static-review status from April 2026 is not a current certification. This reference preserves the design vocabulary while distinguishing code controls from evidence. Trier OS is feature frozen; no new hardening roadmap is created here.

| ID | Intended property | Implementation / evidence to inspect |
|---|---|---|
| I-01 | Returned quantity does not exceed issued quantity | `WorkParts.qty_returned`, scan return-part validation and transaction boundaries |
| I-02 | Stock is not decremented below available quantity | Cost/stock ledger guards and the actual plant schema; no universal DB CHECK guarantee is asserted |
| I-03 | Offline lifecycle events preserve causal order | Device timestamps and replay ordering; real recovery remains deferred |
| I-04 | A scan ID is not committed twice | ScanAuditLog uniqueness and scan transactions; this does not prove every queue acknowledgement is correct |
| I-05 | One active scanner handles an input | Client scanner ownership/interceptor controls and hardware/browser regressions |
| I-06 | Work lifecycle transitions follow permitted state changes | `server/routes/scan.js`: IDLE → ACTIVE → WAITING → CLOSED/AUTO_CLOSED; related work/segment state is separate |
| I-07 | Outcome windows use relevant event time | Outcome tracker and replay timestamps; device-reported time is not an authoritative clock |
| I-08 | Each query uses its validated authorized plant scope | AsyncLocalStorage, demo explicit-selector guard and shared-row ownership; intended authorized staff cross-plant reads remain supported |
| I-09 | Barcode resolution does not apply inventory twice | Offline receiving endpoint/ledger and DB idempotency controls; historical missing-endpoint notes are not current facts |
| I-10 | A PM acknowledgement has one owner | PM acknowledgement service, numbered migrations and actual DB constraint coverage |
| I-11 | Close-out accounts for issued parts | Unresolved-parts check and CloseOutWizard resolution/override paths; unavailable-network behavior is an availability tradeoff, not an absolute guarantee |
| I-12 | Explain-cache state is keyed by plant and asset | Plant-scoped explain-cache keys and invalidation |
| I-13 | Artifact availability distinguishes local/external data | Catalog response fields and client labels; external availability depends on connectivity/permissions |

## Reading the runtime report

`GET /api/invariants/report` is an authenticated observation endpoint. Read individual assertions, dataset/DB coverage and violations along with `overallStatus`. A zero-coverage report can return PASS; that is not proof that workflows were exercised (deferred OPS-05). A UNIQUE index proves a specific stored-key constraint, not ordering, global exactly-once delivery, physical scanner ownership or all crash-recovery paths.

Some online scan guards are independently covered by regressions, while offline queue/replay recovery and HA ordering/idempotency remain deferred. A complete browser gate includes conditional skips and mocked/intercepted communication, so do not infer physical power-loss, restart or paired-server recovery from it. [Evidence and limits](SECURITY_MAINTENANCE_VALIDATION.md).

## Maintenance interpretation

Separate a reproducible invariant violation with meaningful impact from a theoretical architectural preference. Preserve Doug's proven physical scanner/phone and operational behavior. Diagnose first, establish severity/blast radius and prefer narrow remediation only when justified. Do not treat older proposed constraints, endpoints or UI steps as an active feature roadmap. [Maintenance policy](MAINTENANCE.md), [architecture](ARCHITECTURE.md), [database reference](DATABASE_SCHEMA.md).
