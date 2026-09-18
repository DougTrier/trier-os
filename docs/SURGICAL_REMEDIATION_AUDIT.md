# Surgical preservation remediation — September 17–18, 2026

Copyright © 2026 Doug Trier. Licensed under the [MIT License](../LICENSE).

**Current release status: [Trier OS v3.7.2 is published](https://github.com/DougTrier/trier-os/releases/tag/v3.7.2), following completed remediation, regression verification and final committed-source packaging checks.** All original code-correctable defects A–E are **FIXED + VERIFIED**, including legacy single-delete false success, migration 047 and both 017 files. This follow-up supersedes their historical FAIL findings in [REGRESSION_PRESERVATION_AUDIT.md](REGRESSION_PRESERVATION_AUDIT.md). See [release notes](RELEASE_NOTES_3.7.2.md).

Comparison commit: `2fa52f1487a6bf4443f9aa96a23b38e2f550db73`. The pre-existing dirty working tree was inventoried separately; it was not reverted. Evidence: `G:\TrierOS-Remediation-20260917-185156`. Initial backup: 127 files, 40 database/SQLite files, with SHA-256 verification and integrity checks on separate analysis copies. All 38 nonempty source databases passed physical integrity; two pre-existing empty placeholder files remain recorded as such. Interim reconciliation found all 127 originals byte-identical.

## Confirmed defects and corrections

| Defect | Reproduction and root cause | Surgical correction | Current evidence |
|---|---|---|---|
| Valid small database replaced | A valid 8,192-byte customer DB lost its sentinel because `getDb()` used a size threshold to unlink/reseed it. | `server/database.js`: existing files receive a read-only SQLite integrity check; corruption throws without replacing the file. Only missing files use the existing initialization path. | **FIXED + VERIFIED**: seven real SQLite cases cover small, normal, empty-valid, missing, corrupt, customer tables and supported normalization; exact sentinel preservation. `small-db-before.log`, `database_preservation.test.log`. |
| Legacy IT cross-site deletion and false success | A Site A technician could delete Site B hardware. Nonexistent IDs returned success. Related legacy mutations had the same missing gate and unchecked affected-row behavior. | `server/routes/it.js`: single and bulk deletion share the existing IT Admin/Creator gate, transaction, authoritative ownership, dependency cleanup and audit. Missing/repeated deletion returns 404; suppressed deletion fails and rolls back. | **FIXED + VERIFIED**: `it_legacy_security.test.log`; all four categories, both roles, unauthorized requests, dependencies, audit actor/site, repeat/missing rows and unrelated records. |
| UI hid failed single deletes | Hardware closed its form after any HTTP response; other paths relied only on HTTP status. | `src/components/ITDepartmentView.jsx`: one helper requires server success, `DELETED`, and matching ID before closing/refetching. | **FIXED + VERIFIED**: `reset-and-single-ui.log`; actual SQL-trigger failure preserves row/form, successful retry removes both. |
| TOTP relative-delta replay cache | A later valid code with delta 0 was rejected after an earlier delta-0 code. | `server/totp_replay.js`, `server/routes/auth.js`, `server/routes/creator_console.js`: transactional persistent absolute counters keyed by account and secret fingerprint; legacy cache adoption; new enrollment removes ambiguous legacy state. Storage failure denies completion. Existing ±1 window and lockout remain. | **FIXED + VERIFIED**: unit clock/restart/audit/lockout cases and full-app security regression. `totp-before.log`, `totp_replay.test.log`, `focused-browser-after.log`. |
| Invalid SOP acknowledgement FK | Application joins and acknowledgement writes establish `Procedures.ID` as the parent. Corporate Office/examples had an FK to that non-unique column. | New forward `062_sop_parent_key.js` adds a unique parent index; duplicate IDs/orphan acknowledgements stop migration without deleting rows. No table rebuild or disabled foreign keys. | **FIXED + VERIFIED**: real broken-FK fixture, exact rows, idempotence, duplicate/orphan rollback; copied active databases pass FK/integrity. `sop_parent_key.test.log`, `sop-schema-before.json`, `migrations-copied-data.log`. |
| Migration 047, duplicate 017, wrong paths/scopes and swallowed failures | Runner expected `.up`; several files export bare functions, 017 executes on require, 022 expects a path, and later scripts open source-relative or multiple databases outside the runner's transaction. Integer-only ledger cannot distinguish both 017s. | `server/migrator.js`, `server/migration_compat.js`: stable number/filename ordering, filename/checksum ledger, scoped runner-owned connections, bare-function/side-effect compatibility, scoped legacy entry points, preserved existing seeds/classifications, fail-closed SQL errors and atomic per-DB upgrade. Historical files remain unchanged. | **FIXED + VERIFIED for reconstructed supported states**: 56 ordered-prefix fixtures, pre-047/catalog execution, both 017s, current rerun, rollback, process interruption/resume and fresh missing-auth group schema. Exact paths/outcomes in migration fixture `results.json`. |
| Existing EventLog triggers block ordinary writes | Corporate Office's Work, Part and ProductLoss triggers and Plant 2's Part triggers reference absent columns. A real copied-DB Work INSERT failed with `no such column: NEW.ActualHours`. | New forward `063_eventlog_required_columns.js` adds only known missing nullable fields referenced by existing EventLog triggers, using canonical template types. The recovered 017 backfill invokes this prerequisite when old 045 triggers already exist; everything remains in the same backed-up transaction. | **FIXED + VERIFIED**: failing SQL reproduction, existing-row/history checks and restored event capture in `eventlog-schema.log`; real Corporate Office/Plant 2 write statements compile and FK/integrity pass. |
| Destructive maintenance entered offline replay queue | Full SPA reset exceeded the global three-second timeout while creating backups. Server completed reset, UI received synthetic queued success, and request could be replayed later. | `src/main.jsx`: reset and IT deletion/bulk-deletion wait for the actual online result and bypass the offline write queue. Scan/offline-sync behavior is unchanged. | **FIXED + VERIFIED**: first full-app run failed with a 4.371-second reset; regression now delays real server responses by 3.5 seconds and passes. `focused-browser.log`, `focused-browser-after.log`. |
| New migration ledger erased by reset/new-plant clearing | Both preservation lists retained `schema_version` but not the newly introduced filename ledger. | `server/plant_reset.js`, `server/database.js`: retain `migration_history` alongside existing schema metadata. | **FIXED + VERIFIED**: reset and missing-plant fixture assertions preserve exact ledger rows; failing new-plant reproduction retained in `new-plant-ledger-before.log`. |
| Local search silently empty | Server-log review found `ambiguous column name: Description`; the Work/WorkStatuses join used an unqualified filter and caught the error while returning HTTP 200. A seeded real API search returned no matching work or asset. | `server/index.js`: qualify the two work-search filter columns with `w.`. | **FIXED + VERIFIED**: exact work/asset results now returned; `corporate-before-search.log`, `corporate-after-verified.log`. |
| Corporate search cache reused for a local request | A real corporate search followed by the same query scoped to Plant 1 returned Plant 2 rows from the shared cache. | `server/index.js`: include the validated selected site in the cache key. | **FIXED + VERIFIED**: cross-site result contamination reproduced and rejected by the new regression; `corporate-before-cache.log`. |
| Corporate parts rollup opens auxiliary/archive stores | Directory scanning treated every non-excluded `.db` as a plant, including unregistered Location 1, map/translation stores and retained regression archives, producing error rows and misleading aggregates. | `server/routes/spare-parts-optimization.js`: use validated registered plants, retain the existing corporate/demo exclusions, and resolve each through AsyncLocalStorage. | **FIXED + VERIFIED**: exact Plant 1/Plant 2 rollup with no error rows; `corporate-before-registry.log`, `corporate-after-verified.log`. |
| Corporate asset status badges fail or mix duplicate IDs | Asset view sent `all_sites` to the plant-scoped scan status API; its read-only template lacks WorkSegments. Both real fixture rows had no badge. | `src/components/AssetsView.jsx`: batch by each returned asset's site, key statuses by site plus ID, and clear stale statuses on refresh. No scan route/state-machine edit. | **FIXED + VERIFIED**: identical IDs at Plant 1/Plant 2 show their own In Progress/Waiting badges and successful site-specific requests; `corporate-before-badges.log`, `corporate-after-verified.log`. |
| Interrupted test runner reports zero exit | Killing the Playwright child supplies a null exit code; `code || 0` incorrectly treated it as success. The interrupted runs were nevertheless recorded as incomplete, not PASS. | `tests/regression-browser.js`: only an actual zero child exit is success. | **FIXED + VERIFIED**: a real terminated child plus isolated SQLite fixture returns exit 1 and still restores credentials/removes upload probes; before/after logs `runner-interruption-*.log`. This harness-only correction does not alter any application code or browser assertion. |
| Quality table test depends on aging seed dates | The complete run reached the Quality dashboard but no event was within its documented last-90-days filter. The correct empty state has no table headers, so the test's unconditional header assertion failed. | `tests/e2e/stress-test.spec.js`: create a current dated loss event through the authenticated API, retain every column assertion and verify the row, then delete it and verify absence. No application change or skipped assertion. | **FIXED + VERIFIED**: six desktop/mobile Quality checks pass; `quality-fixture-after.log`. The failed broad run is retained separately with 591 passed, 1 failed, 13 skipped and 546 not run. |

## Additional IT routes changed, and evidence

The inspection found the same concrete defect in each listed route: a mutation reachable without the bulk endpoint's global IT Admin/Creator gate, plus success without confirming an existing row/affected-row count. The shared checked transaction now also records the actor and authoritative owner. These changes do not grant any additional role access.

| Routes | Before | Verification |
|---|---|---|
| `PUT /api/it/{software,hardware,infrastructure,mobile}/:id` | Technician could update arbitrary global ID; missing row reported success. | Technician 403, valid admin mutation, missing 404. |
| `PUT /api/it/vendors/:id`, `DELETE /api/it/vendors/:id` | Same missing role gate/result check. | Technician 403, missing/repeated 404, authorized success. |
| `DELETE /api/it/links/software-hardware/:id`, `/links/workorders/:id`, `/links/users/:id` | Same missing role gate/result check. | Technician 403, authorized deletion and repeated 404. |
| `PUT /api/it/links/infrastructure-location/:id` | Same missing role gate/result check. | Technician 403, missing 404, authorized success. |

`server/validators.js` adds static whitelists matching the existing editable columns for these PUT paths. Table/category identifiers remain internally selected; SQL values remain bound. The legacy diagnostic is retained as an observational probe; authoritative regression assertions are in `tests/unit/it_legacy_security.test.js`.

## Migration compatibility and recovery

No historical migration was edited or renumbered. Existing `schema_version` rows remain intact. The new ledger distinguishes filenames, checks applied-file hashes, and imports explicit legacy entries rather than trusting `MAX(version)` to prove every migration ran. Migration 022's falsely successful ledger entry is checked against the actual column. Existing artifact seeds and normalized customer classifications are not repeated merely because old scripts lacked a ledger.

Registered plant files and `schema_template.db` receive plant migrations. Catalog, logistics and auth receive only their applicable scopes. When `plants.json` is absent, the runner recognizes plant schemas by their Asset/Part/Work tables. Auxiliary/custom-only files and archived backups are not treated as plants. Historical scripts cannot open their own source-relative target connections through the compatibility adapter. This adapter executes trusted repository code; it is not a security sandbox for uploaded scripts.

`server/preflight_backup.js` creates a verified SQLite backup before a pending migration plan, in test and production modes. The gate incorporates pending plan and executable-code fingerprints. Backup validation loads sqlite-vec when needed. WAL-aware snapshots and SHA-256 manifests must succeed before migration writes. Each database's pending operations and ledger changes commit in one immediate transaction; any failure stops startup. Different database files are not one crash-atomic transaction: previously completed files remain committed, the failing file rolls back, the verified backup remains available, and rerun resumes by filename ledger. Full deployment rollback requires the documented verified backup restore procedure with the application stopped.

Historical fixture limitations: the tests reconstruct every ordered prefix using the shipped base-table schema plus immutable migrations. They are not claimed to be byte-for-byte archived installations from every past release. Custom duplicate procedure IDs, orphan acknowledgements, unknown schema corruption, or changed applied migration files fail safely for operator recovery; no customer rows are removed to force a green gate. Unregistered archival/demo copies remain preserved, not silently upgraded.

## Preservation paths and account membership

Production persistence protection remains as documented in [INSTALLER_PRESERVATION_AUDIT.md](INSTALLER_PRESERVATION_AUDIT.md): external retained state/data roots and explicitly configured `DATA_DIR`, legacy install-relative data during adoption, portable data, auth/logistics/catalog/plant DBs, configuration, certificates, uploads, and recovery copies. Installer cleanup uses program-file inventory and retained-data locators. Accounts, password hashes, plant roles, AD groups and group grants are compared exactly in isolated installer fixtures. Default uninstall retains those stores; reinstall reuses them. Explicit reset requires confirmation and a verified backup.

This task additionally protects `G:\Trier OS\data`, `G:\Trier OS\server\data`, `C:\Trier OS\Data`, source `.env`, connectors/uploads/secondary/snapshot/log locations listed in `sources.json`. No live install, original development database or original `C:\Trier OS\Installers` artifact is an upgrade/uninstall target.

## Final verification matrix

| Gate | Result |
|---|---|
| Focused full-SPA reset/bulk/restart and security | 25 passed, 0 failed, 0 skipped. |
| Focused corporate/search regressions | 4 passed, 0 failed, 0 skipped after individually reproduced failures. An initial test assertion incorrectly included the unfiltered page's examples batch; it was corrected to compare the fixture-containing batches while retaining the no-error/no-all-sites assertion for every batch. |
| Current-dated Quality fixture | 6 desktop/mobile checks passed, including verified cleanup; no product code changed. |
| Unit regression files | All 23 existing `*.test.js` files completed: 20-file unit run passed, migration chain and installer suites below passed, and the real LAN-hub transport test passed after server shutdown. `unit-results.json`, `lan-hub-final.log`. |
| Migration chain | 56 prefixes plus failed transaction, process interruption/resume, fresh auth-group initialization passed. Latest evidence: `C:\Users\Doug\AppData\Local\Temp\trier-migration-chain-NVPiT7`. |
| Integration release gate | 11 passed, 0 failed (9 blocking + 2 non-blocking). |
| Isolated installer lifecycles | All 21 passed again after the final corporate/search fixes. Final evidence: `C:\Users\Doug\AppData\Local\Temp\trier-preservation-9AE3C8`; result list retained in `installer-lifecycle-results.json`. |
| Production frontend | Build passed; existing large-chunk warning remains. |
| Complete Playwright, all seven projects | **1,129 passed, 0 failed, 22 skipped, 0 not run**, no retries/flaky results. Unfiltered run completed in 56.4 minutes; `full-playwright-final.log`, `playwright-summary.json`. |
| Production EXE/MSI verification builds | Final remediation rebuild including all corporate/search fixes passed in `C:\TM-20260917\artifacts-verified`. Read-only MSI inspection passed: 16 seed databases, no managed live-data files, backup/rollback action ordering verified. These were unpublished remediation verification builds; the later release used separately rebuilt artifacts. An interrupted earlier build left a partial NSIS archive; rebuilding in a fresh output directory resolved that tooling failure. |
| Populated real development copy upgrade | All 22 DB files reconciled with no lost/changed original rows, except controlled 017 work-order-number backfills (1,200 examples, 73 Plant 1, 794 Plant 2). Added actual account/role/group/grant, four IT-category, SOP/procedure, custom-table and history sentinels remain. `copied-upgrade-preservation.json`. |
| Separate `C:\Trier OS\Data` copy upgrade | PASS on an isolated copy, including both corrected FK databases and EventLog write compilation; original directory unchanged. `separate-data-final.json`. |
| Packaged production runtime | Final runtime including corporate/search fixes passed fresh startup and same-version restart with exact account, role and group membership preservation. `packaged-smoke-final.log`, isolated `packaged-fresh-final-p4SDSW` evidence. |
| Final DB/orphan/fixture/invariant/source reconciliation | PASS: 41 active test DBs have no physical/FK issues; nine IT orphan checks remain zero; dedicated fixtures removed and history retained. Invariant API HTTP 200, `overallStatus: PASS`. All 127 original files and 4,340 table digests in 40 source DB files reconcile unchanged. Details below. |

The complete suite finished with zero failures and zero unrun cases. Existing conditional skips are enumerated below and are not counted as passes. At the time this regression run completed, publication still required final committed-source artifact verification. Those packaging checks were subsequently completed and v3.7.2 was published.

Three earlier broad browser attempts are explicitly incomplete: the first was stopped for the EventLog trigger-schema defect, the second after server-log audit found the search/corporate errors even though browser assertions had not failed, and the third stopped at the aging Quality-data fixture failure. None is a full PASS. The final unfiltered run includes the four new corporate regressions and the repaired Quality fixture. These tests use actual SQLite records and HTTP responses; they do not replace API responses with mocks.

### Complete Playwright results

Run: September 18, 2026, 01:44:54–02:41:21 UTC (September 17 local time), one worker, all configured projects, no grep/project filters, retries zero, stop on first failure.

| Project | Passed | Failed | Skipped | Not run |
|---|---:|---:|---:|---:|
| Desktop Chrome | 656 | 0 | 13 | 0 |
| Mobile Chrome — Batch 1 / Security | 83 | 0 | 0 | 0 |
| Mobile Chrome — Batch 2 / UX & Smoke | 93 | 0 | 0 | 0 |
| Mobile Chrome — Batch 3 / Data & Scan | 62 | 0 | 8 | 0 |
| Mobile Chrome — Batch 4 / QA Suite | 74 | 0 | 0 | 0 |
| Mobile Chrome — Batch 5 / Stress-A | 68 | 0 | 0 | 0 |
| Mobile Chrome — Batch 6 / Stress-B | 93 | 0 | 1 | 0 |
| **Total** | **1,129** | **0** | **22** | **0** |

The following pre-existing source conditions account for every skip. These tests were not changed to avoid failures. Their bare `test.skip()` annotations do not identify which alternative branch fired; all applicable source conditions are retained here rather than inventing a more precise cause.

| Test/source | Instances | Retained skip condition |
|---|---:|---|
| `dual-mode.spec.js:404,422,439,450,462`: touch targets, table scrolling, Fleet width, scanner, map overflow | 5 Desktop | Entire suite is mobile-only; desktop `beforeEach` skips it. |
| `invariants.spec.js:154`: unresolved-parts response | 2, Desktop + Data/Scan | No work orders or no sampled work order with returnable parts. |
| `invariants.spec.js:216`: CloseOutWizard warning | 2 | No unresolved-parts work order, or required close button/wizard/confirmation control unavailable. |
| `invariants.spec.js:296,350`: receiving resolution and repeated resolution | 4 | Receiving cache contains no parts. |
| `invariants.spec.js:402`: excess return rejected | 2 | No work orders or no sampled issued part with positive returnable quantity. |
| `invariants.spec.js:491`: artifact normalized fields | 2 | Sampled entities have no artifact rows. |
| `invariants.spec.js:536`: concurrent PM acknowledgement | 2 | Pending-PM endpoint not 200 or no unclaimed pending notification. |
| `invariants.spec.js:577`: sequential PM acknowledgement | 2 | Pending-PM endpoint not 200 or no notification. |
| `stress-test.spec.js:1136`: header logo navigation | 1, Stress-B | Desktop-only header-logo test explicitly skips mobile. |

### Final data and environment reconciliation

- `postflight.json`: 41 active sandbox databases, zero physical-integrity issues, zero FK issues. Recovery backups retain their original historical schemas and are excluded from active-schema checks. All nine current IT dependency-orphan counts are zero before and after.
- Original identity/IT rows match exactly: nine Users, ten UserPlantRoles, 46 GatekeeperRoleMap grants, 151 hardware, 24 software, 95 infrastructure and 155 mobile records. Users comparison excludes only TokenVersion, which normal successful 2FA deliberately changes; password hashes, identity/profile fields and authorization fields match. The original UserADGroups table was empty; separate populated account/group/grant fixtures prove nonempty membership preservation across migration, reset and all installer lifecycles.
- The existing `gatekeeper-g3.spec.js` leaves role-map entries it creates. Five proven additions from broad test attempts were archived and removed by exact ID/group/timestamp from the stopped isolated copy only; all 46 original grants remained unchanged. `security-grant-fixture-cleanup.json` records the rows and cleanup. No application code or test assertion was changed for this cleanup.
- No dedicated preservation test users, memberships, registered sites, corporate asset/work fixtures or current-dated Quality fixture remain. The 260 matching AuditLog entries are intentionally retained history. Legacy regression tests write operational data in the isolated evidence copy; that copy is not claimed to be byte-identical to its starting state.
- `source-reconciliation.json`: 127 original/current files, 40 database/SQLite files, 4,340 table digests, zero differences or new source files. Original data was not migrated, reset or used as an installer target. Original EXE/MSI hashes also remain unchanged.
- `final-invariants.json`: authenticated invariant report HTTP 200, overall PASS. Final server-log inspection found no recurrence of the corrected SQL/search/corporate errors.
- `console-events.jsonl`: observer active throughout verification, zero visible console-window events, observer stopped. The test application and LAN hub are stopped; no listeners remain on 3000/1938/1940/33000/33001. Isolated MSI product identities report uninstalled and their temporary registration key is absent (`installer-registration-cleanup.json`).

### Remaining risks and disposition

Historical-prefix fixtures demonstrate the supported shipped migration chain; they cannot establish compatibility with every unknown customer-modified schema. Unsupported/corrupt layouts fail safely with recovery evidence. Cross-database rollback and installer registration limits remain as described above and in the installer audit. Existing conditional browser skips remain coverage limitations. No verified code-correctable defect from this remediation remains failing. Final committed-source artifact checks were subsequently completed before v3.7.2 publication.

### AGENTS.md Compliance Check

- DB routing: PASS; request-scoped plant access remains through AsyncLocalStorage. Direct connections are limited to the existing migration/backup infrastructure and isolated test tooling; no client-selected database path was introduced.
- Migration policy: PASS; immutable historical files 001–061 unchanged; 062 and 063 are forward corrections with backup and rollback coverage.
- Protected files: PASS; no task changes to scan, LAN hub, HA sync or canonical master data. The pre-existing HA difference is unchanged from the initial inventory.
- SQL injection: PASS; bound values and internal static identifier maps retained.
- Authorization/security invariants: PASS; IT role boundary, authoritative ownership, TOTP replay/lockout/audit and zero-keystroke scan behavior retained and regression-tested.
- Persistent-data invariants: PASS; originals unchanged; tested accounts, memberships, permissions, sites, IT records, history and recovery copies preserved as documented.
- Unintended side effects: none detected by the completed tests, source reconciliation and scoped audit. Existing conditional skips are explicitly recorded.

**Compliance status: PASS. Final artifact verification completed; v3.7.2 is published.**

## Exact remediation files

The initial dirty-tree inventory distinguishes this task from earlier installer/reset/security work. This task changes the following production files; each maps to a reproduced defect above:

- `server/database.js`: safe existing-database validation and preservation of the migration ledger during missing-plant initialization.
- `server/routes/it.js`, `server/validators.js`, `src/components/ITDepartmentView.jsx`: checked and authorized legacy IT mutations and confirmed UI deletion.
- `server/totp_replay.js`, `server/routes/auth.js`, `server/routes/creator_console.js`: absolute persistent TOTP consumption and enrollment handling.
- `server/migrator.js`, `server/migration_compat.js`, `server/preflight_backup.js`: historical execution compatibility, deterministic filename ledger, verified backup and transaction recovery.
- New `server/migrations/062_sop_parent_key.js`, `server/migrations/063_eventlog_required_columns.js`: forward-only corrections for the demonstrated FK and trigger-schema defects.
- `server/plant_reset.js`: retain migration metadata during an explicitly requested operational reset.
- `src/main.jsx`: keep destructive maintenance requests out of offline replay and await their real result.
- `server/index.js`: qualify local work-search columns and separate cached results by selected site.
- `server/routes/spare-parts-optimization.js`: enumerate registered production plants instead of arbitrary database files.
- `src/components/AssetsView.jsx`: query and display corporate work-order badges using each asset's site.

Regression additions/changes: `tests/unit/database_preservation.test.js`, `database_reset.test.js`, `eventlog_schema.test.js`, `it_legacy_security.test.js`, `migration_chain.test.js`, `reset_ui.js`, `sop_parent_key.test.js`, `totp_replay.test.js`, `tests/e2e/preservation-regression.spec.js`, `tests/e2e/corporate-regression.spec.js`, `tests/e2e/stress-test.spec.js`, and `tests/regression-browser.js`. Documentation changes: this report, the three starting audit/validation documents, `docs/DATABASE_SCHEMA.md`, and the obsolete migration-behavior paragraph in `AGENTS.md`.

The installer/updater/uninstaller implementation already present at the initial inventory was regression-tested and repackaged without additional production edits in this remediation. Historical migrations 001–061 are unchanged. The pre-existing `server/ha_sync.js` working-tree difference is not a change made by this task; its initial and final hashes are compared separately. No scan, LAN-hub, HA, or canonical master-data implementation was edited here.

The fresh inventory identifies 35 files changed during this task: 17 production files, 12 test files, and six documentation files. Changed executable files pass syntax/header checks and targeted whitespace validation. Manual review covers bound SQL values, static identifier selection, the retained IT role boundary, absolute TOTP counters, migration backup/rollback, preserved reset metadata, and site-scoped corporate queries. The 17 production files and all 534 production frontend files match between source, the browser sandbox, and the packaged application (`tested-code-consistency.json`). This is a scoped remediation audit, not a claim that syntax checks prove the entire historical application secure.

Historical remediation verification package SHA-256 values (unpublished, `C:\TM-20260917\artifacts-verified`):

- EXE: `8F3255BC17EBC97166C49A987A0DB96B7810C33C8CCAD3272A820066501A3EAF`
- MSI: `5818928B328EBE2694330236BAFFB7FF9F2EADD54502DA20F451FDF7E6786119`

## Complete migration scope map

| Immutable filename (062–063 are new) | Applied scope | Historical entry form |
|---|---|---|
| `001_initial_normalization.js` | plant | object .up |
| `002_add_global_sync_meta.sql` | plant | SQL |
| `012_add_manuf_id.js` | plant | object .up |
| `013_normalize_part_stock_columns.js` | plant | object .up |
| `014_add_asset_operational_status.js` | plant | object .up |
| `015_add_vendor_website_to_part.js` | plant | object .up |
| `016_standardize_schedule_table.sql` | plant | SQL |
| `017_calendar_reminders.sql` | plant | SQL |
| `017_seed_cost_centers.js` | plant | require-time side effects |
| `018_tribal_knowledge.js` | plant | object .up |
| `019_record_locks.sql` | plant | SQL |
| `020_failure_modes.js` | plant | object .up |
| `021_warranty_tracker.js` | plant | object .up |
| `022_part_number.js` | plant | object .up |
| `023_asset_criticality_classification.js` | plant | object .up |
| `024_warranty_claims.js` | plant | object .up |
| `025_add_gps_fields.js` | plant | object .up |
| `026_ble_beacon_mac.js` | plant | object .up |
| `027_cv_tables.js` | plant | object .up |
| `028_p3_work_asset_additions.js` | plant | object .up |
| `029_p4_moc.js` | plant | object .up |
| `030_add_critical_spare_flag.js` | plant | object .up |
| `031_shift_handover.js` | plant | object .up |
| `032_sop_acknowledgment.js` | plant | object .up |
| `033_asset_lifecycle.js` | plant, catalog | object .up |
| `034_catalog_cross_ref.js` | catalog | object .up |
| `035_emissions.js` | plant, logistics | object .up |
| `036_saas_enablement.js` | logistics | object .up |
| `037_dt_sync.js` | logistics | object .up |
| `038_operator_trust.js` | logistics | object .up |
| `039_edge_mesh.js` | logistics | object .up |
| `040_gatekeeper_audit.js` | logistics | object .up |
| `041_gatekeeper_role_map.js` | logistics, auth | object .up |
| `042_audit_ledger_triggers.js` | logistics | object .up |
| `043_adapter_config.js` | logistics | object .up |
| `044_proof_receipts.js` | logistics | object .up |
| `045_eventlog_and_triggers.js` | plant | object .up |
| `046_usagemeter_unique_index.js` | logistics | object .up |
| `047_catalog_digital_twins.js` | catalog | bare function |
| `048_peer_twins_and_aas.js` | catalog, logistics | bare function |
| `049_equipment_embeddings.js` | catalog | bare function |
| `050_failure_normalization.js` | plant | bare function |
| `051_asset_live_state.js` | plant | bare function |
| `052_failure_cross_plant.js` | logistics | bare function |
| `053_unified_artifacts.js` | plant, catalog | bare function |
| `054_artifact_loop.js` | plant, catalog | bare function |
| `055_outcome_tracking.js` | plant, catalog | bare function |
| `056_artifact_local_storage.js` | plant, catalog | object .up |
| `057_work_order_parts_lifecycle.js` | plant | object .up |
| `058_pm_acknowledgement.js` | plant | object .up |
| `059_offline_receiving.js` | plant | object .up |
| `060_pm_acknowledgement_unique.js` | plant | object .up |
| `061_guide_execution_log.js` | logistics | object .up |
| `062_sop_parent_key.js` | plant | object .up |
| `063_eventlog_required_columns.js` | plant | object .up |
