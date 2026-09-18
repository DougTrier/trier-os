# Preservation regression and repository audit — 2026-09-17

**Current release status:** [Trier OS v3.7.2 is published](https://github.com/DougTrier/trier-os/releases/tag/v3.7.2). The documented code-correctable defects were fixed and regression-verified before publication, and final committed-source artifact verification completed. Historical FAIL/BLOCKED/no-publication statements below describe the original audit, superseded by [the surgical audit](SURGICAL_REMEDIATION_AUDIT.md) and [current release notes](RELEASE_NOTES_3.7.2.md).

Copyright © 2026 Doug Trier. Licensed under the [MIT License](../LICENSE).

**Completed follow-up:** [SURGICAL_REMEDIATION_AUDIT.md](SURGICAL_REMEDIATION_AUDIT.md) supersedes the historical FAIL findings below. Small-database preservation, legacy IT authorization/false success, TOTP replay, SOP foreign keys, migration 047 and duplicate 017 handling are all **FIXED + VERIFIED**. The complete seven-project run finished with **1,129 passed, 0 failed, 22 documented skips, 0 not run**. All 23 unit-test files, 56 migration prefixes, 21 installer scenarios and 11 integration checks passed; production frontend/EXE/MSI verification builds passed. Final active-DB integrity/FK, invariant and original-source reconciliation passed. Accounts, roles, group membership and grants are preserved. This document retains the original before-fix findings.

**Historical audit disposition at the time of this run: release was blocked pending remediation. This disposition was later superseded by the completed surgical remediation and v3.7.2 release.**

## Historical audit run — build and evidence

Comparison commit: `2fa52f1487a6bf4443f9aa96a23b38e2f550db73`. Tested application version: **3.7.2**, with the existing uncommitted working tree plus the corrections below. The comparison commit is an identifiable baseline, not a newly certified good release. No version bump, commit, tag, upload, or publication was performed during this audit run. The following findings, tables and recommendations retain that intermediate run's evidence and scope.

Local evidence root: `G:\TrierOS-Regression-20260917-174558`. It contains the original working-tree status/diff, file hashes, verified offline backups, SQLite/table inventories, test logs, screenshots, fixture reconciliation, and build hashes. Evidence containing configuration or identity data is restricted to the current operator, Administrators, and SYSTEM; it must not be published.

Status meanings: **PASS** = directly verified; **FAIL** = reproduced defect; **BLOCKED** = required validation not completed; **NOT TESTED** = outside this pass's safe execution scope.

## Development environment protection

No Trier OS server/Electron process or listeners on 3000/1938/1940/5173 were running at initial inspection. The development `.env` has no `DATA_DIR` override; the source resolver therefore selects `G:\Trier OS\data`. No installed Trier OS persistence locator or matching Electron user-data folder was found in the inspected registry/default locations. This does not claim that every drive was exhaustively searched for unrelated archived copies.

The offline backup covers:

| Location | Treatment |
|---|---|
| `G:\Trier OS\data` | Complete directory, including DBs, WAL/SHM, certificates, uploads, branding, configuration, catalog files and existing recovery files |
| `G:\Trier OS\server\data` | Legacy application-relative persistent files |
| `C:\Trier OS\Data` | Separate existing data copy, also protected; no application lifecycle actions performed there |
| `G:\Trier OS\.env` | Byte-verified configuration copy; values are not reproduced in this report |
| Source connectors/uploads/public uploads/secondary/snapshot/log directories | Inventoried and copied when present; missing paths recorded in `sources.json` |

**PASS:** 127 files copied with SHA-256 comparison before and after copying. Forty `.db`/`.sqlite` files inventoried. The two existing zero-byte `auth_db*.sqlite` placeholders are recorded as empty files, not presented as healthy populated databases. All 38 nonempty databases returned SQLite `integrity_check = ok` in analysis copies. The immutable raw backup includes WAL sidecars; SQLite inspection opens a separate analysis copy so recovery/checkpoint activity cannot mutate either the source or raw backup.

Complete schema cookies, `user_version`, migration records, table counts and whole-table digests are in `backup/baseline.json`; `database-summary.json` summarizes the 24 development DB/placeholder files. Most operational databases record migration 46, with older auxiliary stores at 1. `user_version` is 0; it must not be mistaken for the numbered migration version.

The catalog vector extension was loaded on analysis copies for a supplemental check: both `mfg_master.db` copies contain 525 `equipment_vec` records with identical digests and healthy physical integrity (`vector-baseline-supplement.json`). The first inventory's missing-extension diagnostic was an inspection limitation, not a damaged database.

**PASS:** post-test source capture (`post-source/baseline.json`) and `source-reconciliation.json` report all 127 files byte-identical, with no changed recorded table counts/digests across the 40 database/placeholder files. Source databases were again inspected only through copies. The four pre-existing FK schema errors remain; they were not introduced or repaired by testing.

| Significant baseline | Count |
|---|---:|
| Auth users | 9 |
| User/plant role assignments | 10 |
| Auth AD group memberships | 0 |
| Gatekeeper group/permission mappings | 46 |
| Registered sites | 4 |
| IT software | 24 |
| IT hardware | 151 |
| IT infrastructure | 95 |
| IT mobile | 155 |
| Shared SystemSettings rows | 1 |

**FAIL, pre-existing:** `foreign_key_check` reports `SOPAcknowledgments` referencing a non-compatible `Procedures` key in `Corporate_Office.db` and `examples.db`, both in development and the separate C-drive copy. This existed before testing. It is a schema consistency failure even though physical SQLite integrity passes.

All destructive application tests use a full isolated application copy at the evidence root's `app` directory. A `DATA_DIR` override alone is insufficient isolation: older modules and migrations still resolve some paths relative to their own source directory. No development installation was upgraded, uninstalled, restored, reset, or started by this pass. The original development databases remain the preservation reference; application restart tests operate on their isolated copy.

The browser server uses `NODE_ENV=test`, generated test-only secrets, the existing `RATE_LIMIT_LOGIN_MAX=500` E2E setting, a loopback Gatekeeper URL and an explicit edge-mesh test token. Source `.env` credentials are not copied into this server. Production-mode authentication startup and exact existing identity/group preservation are separately exercised by the installer preservation tests. The original EXE/MSI hashes under `C:\Trier OS\Installers` were rechecked and remain unchanged (`original-artifacts-recheck.json`).

## Confirmed recent regression and correction

**FAIL reproduced → corrected and targeted verification PASS:** site reset rolled back on the real application schema because delete triggers refilled `EventLog` and `sync_ledger`. The old generic reset policy treated these as ordinary tables to empty. Depending on enumeration order, it could either fail final verification or erase replication tombstones and local history.

`server/plant_reset.js` now preserves both tables. Business-row deletes still generate their audit/replication records. Operational and scoped IT counts are still checked in the transaction; unexpected survivors still cause rollback. The diagnostic now names surviving tables and counts. The API and reset panel explicitly explain retention of local event/replication history. Existing numbered migrations and HA replication code were not changed.

Files changed for the correction: `server/plant_reset.js`, `server/routes/database.js`, `src/components/PlantResetPanel.jsx`, and the trigger-history regression in `tests/unit/database_reset.test.js`.

## Dedicated browser coverage

`tests/e2e/preservation-regression.spec.js` uses the real built SPA, normal administrative reset and IT inventory screens, real authentication, real API routes, and real SQLite stores. It refuses to seed fixtures without an explicit isolated-app marker. Each run has uniquely named reset and preservation sites.

Sentinels include `preservation_test`, `PRESERVATION-GROUP`, actual `UserADGroups` membership, plant roles, a Gatekeeper group grant, a `DO-NOT-TOUCH-SITE_<run>` site and `PRESERVATION-TEST-001-<category>` assets. Exact whole-row digests cover all users, memberships, plant roles, grants, settings, site definitions and unrelated IT rows. These are checked after each destructive group and after restart. The source data has no group memberships, so the added sentinel proves preservation of an actual membership rather than passing on an empty table.

| Scenario | Result |
|---|---|
| Preview site counts against actual DB tables; include all four IT categories | PASS |
| Cancel reset; require exact site and confirmation phrase | PASS |
| Confirm reset; verify both physical backups, SQLite integrity and targeted pre-operation rows | PASS |
| Exact removal, zero remaining operational targets, reload, empty-site reset | PASS |
| Injected SQL failure rolls back plant and shared IT changes; UI reports failure | PASS |
| Denied backup-file creation prevents deletion; UI reports failure; retry after permission restoration | PASS |
| Hardware, software, infrastructure and mobile: single/multiple selection and deletion | PASS |
| Each category: unfiltered Select All confirmation/cancel; filtered Select All deletion | PASS |
| Each category: no-selection disabled, counts, cancellation, unselected and other-category/site preservation | PASS |
| Each category: assignment cleanup, per-item DB failure, retained failed selection, retry and reload | PASS |
| Restart real server; retained accounts/groups/grants/settings/sites/IT visible and identical | PASS |
| Fixture cleanup removes only this suite's identities/site registrations/IT rows; original-row digests reconcile | PASS |
| Target/auth/logistics physical integrity and FK checks after targeted suite | PASS |

Final standalone targeted run: **8 passed**, `targeted-playwright-final.log`. Initial harness issues (sandbox identity guard, Windows ACL module/restoration compatibility, and restart process ownership) were corrected before this result; they are not counted as application passes. Generated target DBs and snapshots remain outside live data as recovery evidence after their registrations are removed.

## Historical results — existing suites, installers and builds

| Verification | Result/evidence |
|---|---|
| All 17 unit test files, including actual reset/API/DB tests and preservation edges | PASS — `unit-results.json`, per-file logs |
| Integration release-gate logic | PASS — 11 checks, including all nine blocking checks; `integration-release-gate.log` |
| Actual isolated MSI/NSIS lifecycle and offline helper matrix | PASS — 21 named scenarios; `installer-lifecycle.log`, TEMP `trier-preservation-EMxNbL` |
| Fresh seed; populated upgrade; same-version reinstall; retained-data uninstall/reinstall | PASS in isolated helper/package fixtures |
| Interrupted/failed upgrade, rollback, corrupt backup refusal, explicit confirmed reset and isolated restore | PASS in isolated fixtures |
| Locked/WAL DB, external DATA_DIR, unexpected links, existing build target protection | PASS — installer edge unit tests |
| Window-flash observation during relevant isolated tests | PASS for observed workflows — zero visible console show events; observer stopped normally, no observer errors |
| Vite production frontend build | PASS — `frontend-build.log` |
| Production-size EXE and MSI compilation | PASS — `production-packages.log` |
| Compiled MSI preservation/file-layout gate | PASS — 16 seed databases; preservation actions ordered before removal; no live-data payload paths |
| Complete desktop/mobile Playwright run | BLOCKED / incomplete — latest full attempt: 479 passed, 13 skipped, 1 failed because of invalid sandbox HA-key length, 654 not run; see diagnosis below |
| Focused desktop/mobile security verification after HA fixture correction | FAIL — 32 passed, 1 historical TOTP replay failure, 1 not run; valid HA peer check passed |
| Final API invariant report | PASS within the endpoint's stated coverage; HTTP 200, overallStatus PASS; `final-invariants.json` |
| Final isolated DB/IT-reference inspection | Physical integrity PASS; existing FK schema defects FAIL; zero current IT orphans or leftover active sentinel references |
| Historical migration-chain release gate | BLOCKED at this intermediate stage — known legacy export/ordering issues remained unresolved |
| Live development uninstall/upgrade/restore or release publication | NOT TESTED / intentionally not performed |

Historical unpublished verification build outputs are `C:\TR-c53fcc7b\artifacts\TrierOS-Setup-3.7.2.exe` and `.msi`. The EXE is unsigned. They were built with the then-current server/electron/frontend code and the previously staged compatible Electron runtime/dependencies; this is not a fresh dependency-download reproducibility claim. SHA-256:

- EXE: `3e71e3cc996f0ff71af2c96d7788bf1f26b018a0235d3492e54ba8a5238890ad`
- MSI: `e95fc5c471f2ea7e776487c17be841c5671db5fb6c0f2cc43f2ae0b9ad2ac305`

The full browser run includes all seven configured projects (desktop plus six mobile batches), one worker, zero retries and stop on first failure. Older conditional skips are retained and reported: desktop execution skips mobile-only cases, and several invariant checks need parts/PM/artifact fixtures absent from the copied data. Such skips are coverage gaps, not verified passes. The API invariant report returns `overallStatus: PASS`, but some assertions are non-queryable/deferred and its plant selection is not a replacement for whole-database integrity/FK inspection.

### Browser attempts and stop disposition

| Attempt | Passed | Skipped | Failed | Not run | Cause / disposition |
|---|---:|---:|---:|---:|---|
| Initial full run | 24 | 0 | 1 | 1122 | Sandbox used default login throttling; configured the existing E2E setting |
| Configured full run | 98 | 6 | 1 | 1042 | Missing sandbox Gatekeeper loopback URL; corrected, then all four Gatekeeper checks passed |
| Latest full run (`full-playwright-final.log`) | 479 | 13 | 1 | 654 | Sandbox generated a 96-character HA key; application requires exactly 64. Corrected generator to 32 random bytes and added fail-fast validity checks to both runners |
| Focused security rerun (`security-configuration-verification.log`) | 32 | 0 | 1 | 1 | Valid HA peer route passed. Second TOTP completion rejected by the historical replay cache; source/HEAD equality and audit event confirm the cause |

No application authentication check was weakened to accommodate the fixture errors. The dedicated preservation suite passed both standalone and within the latest full run. The later security failure is an actual historical defect, not another environment omission. Under the user's no-historical-fixes scope and the stop-at-first-failure rule, the full suite was not restarted to seek a green run. **The full Playwright completion criterion was unmet at this intermediate audit stage; the subsequent complete run is recorded in the surgical follow-up.** This attempt's unexecuted tests, including most mobile coverage, were not certified by the targeted passes. Earlier attempt logs are retained; Playwright's additional stop-limit error is not counted as a second application defect.

### Final database and cleanup reconciliation

After tests stopped, the final invariant API request passed, then the isolated server and console observer were stopped. No test listeners remained on 3000/1938/1940/4001. `postflight.json` inventories 33 isolated DB/placeholder files, with no physical integrity errors. The two known FK schema mismatches recur in `Corporate_Office.db` and `examples.db`, plus the HA backup of that same examples schema; no new FK issue was observed in other checked databases.

Nine current IT orphan checks (assignment/depreciation in four categories plus software/hardware installation links) were zero before and after. No regression site registrations, sentinel users or memberships remain. The only shared-table references to the removed regression registrations are **209 deliberately retained AuditLog rows** across the diagnostic runs. Generated isolated database/snapshot evidence is retained, not registered as active sites. `fixture-cleanup.json` confirms exact pre-fixture identity/settings/site/unrelated-asset reconciliation for the dedicated suite. The wider legacy suite mutates its disposable clone through normal test workflows; its entire clone is not claimed to remain byte-identical.

`final-source-hashes.json` rechecks all **127 original files and all 127 immutable raw-backup files** after the last test: **zero changes**. Earlier post-source table/integrity inspection therefore still describes the unchanged development data. The original production package hashes also remain unchanged. No live restore, uninstall or upgrade occurred.

## Fresh repository review

`repository-audit.json` inventories and hashes the changed/untracked tree against the comparison commit. Every changed JS/JSX source was parsed; no syntax failures were found. Relevant PowerShell files passed parser checks. Review covered the complete changed-file inventory and the interactions below; syntax success is not a claim that every reachable legacy route is secure.

| Area | Assessment |
|---|---|
| Reset frontend/API/SQLite | Correct explicit target binding, admin/import checks, preview, transaction failure semantics, scoped shared IT cleanup; trigger-history defect corrected |
| Bulk deletion | Global IT/creator gate, whitelisted selectors, parameterized values, per-item immediate transactions, dependency cleanup, audit, explicit NOT_FOUND/FAILED results; UI clears only verified deleted IDs |
| Startup identity handling | Recent change removes unconditional deletion/re-grant/profile overwrite; existing account/group/grant rows retained in tested fixtures |
| Installer/updater/uninstall | External retained store, manifest/backup verification, fail-closed locked DBs and unknown links, seed-only-on-new-store, conservative inventory removal, retained locator, same-version behavior verified in isolated packages |
| Backup/rollback boundaries | SQLite backup includes committed WAL; installer offline copies are hash-verified. Cross-file WAL commits are not power-loss atomic. |
| Security maintenance changes | Reviewed demo ALS guard, multipart bounds, image decoding/static headers, exact HA peer routes, pre-2FA rejection and array-based network command execution; unit regressions pass |
| Existing migration/protected files | No migration file differs from HEAD. `server/ha_sync.js` already differed before this pass; this pass did not modify it or other protected scan/master/hub files |
| Other prior work | Version/i18n/doc maintenance and untracked catalog/guide utilities recorded separately; manual catalog tools were not executed against source data |
| Header compliance | Existing modified/untracked files still lack parts of the mandated MIT/root-LICENSE header; exact review list in `repository-audit.json`. Newly added/edited files in this pass use the required header |

### Historical issues confirmed or retained

These pre-remediation findings and recommendations describe the original audit scope. Their code-correctable defects were subsequently fixed and verified in [the surgical follow-up](SURGICAL_REMEDIATION_AUDIT.md).

1. **FAIL — destructive small-file repair:** an isolated valid 8,192-byte SQLite plant DB passed integrity, then `database.getDb()` replaced it because it was under the size threshold; its sentinel table disappeared. The replacement path predates these changes. Evidence: `small-valid-database-probe.json`. Stop using file size as permission to destroy a DB in a separately scoped historical fix; never test that fix on live data.
2. **FAIL — existing FK schema mismatch:** listed above, present before the regression pass.
3. **BLOCKED — migration history:** migration 047 exports a bare function while the migrator calls `.up`; duplicate numbered migration 017 and historical schema coverage still need their separate release gate. Existing migrations remain immutable.
4. **FAIL — legacy single-item IT delete authorization and false success:** a real API probe with a technician assigned only to `DemoPlant1` deleted its isolated fixture asset in `Plant2` through the old single-item DELETE endpoint (HTTP 200). Repeating that delete returned HTTP 200 and `success: true` although no row remained. The new bulk endpoint rejected the same caller with HTTP 403 and preserved its fixture. Root cause: the unchanged legacy delete route lacks the bulk route's authorization/site checks and affected-row verification. `tests/regression-legacy-probe.js` creates/removes only its own isolated identities and assets; evidence is `legacy-api-probe.json`. Other legacy update/delete routes remain review risks, not a claim of verified exploitation of every route.
6. **FAIL — historical TOTP replay cache rejects distinct valid codes:** `server/routes/auth.js` stores the relative `totp.validate()` offset (`delta`, normally 0) and rejects the same offset for 90 seconds. That is not the absolute consumed time counter, so a fresh code or a newly enrolled secret can be rejected as replay. The focused desktop/mobile security run reproduced HTTP 401 on the second valid completion; the audit event records `LOGIN_2FA_REPLAY_REJECTED` with delta 0. `historical-totp-probe.json` also confirms this route is byte-equivalent to HEAD after newline normalization. It was not changed or bypassed here; a future fix must distinguish time counters and secret enrollment while still rejecting actual reuse.

No unrelated historical implementation was rewritten to force the audit green.

## Files added for this regression pass

- `tests/e2e/preservation-regression.spec.js`: real SPA reset/bulk/sentinel/restart coverage.
- `tests/regression-baseline.js`: immutable byte-verified backup plus separate-copy SQLite inventory.
- `tests/regression-sandbox.js`: isolated application/data startup and controlled restart supervisor.
- `tests/regression-browser.js`: full-suite runner with disposable security credentials/upload fixtures.
- `tests/regression-audit.js`: changed-file hashes, JS/JSX parsing and protected-file/migration review inventory.
- `tests/regression-legacy-probe.js`: isolated legacy authorization/false-success diagnostic and invariant report.
- `tests/console-window-monitor.ps1`: read-only visible console WinEvent observation.
- This report and follow-up entries in the reset/bulk and installer audit documents. Product correction files are listed above; earlier dirty workspace changes remain separately inventoried.

## Historical AGENTS.md compliance and disposition

For this pass's changes: route plant routing remains AsyncLocalStorage-based; direct SQLite paths are confined to isolated test/backup inspection tools. No existing migration, protected scanner/hub/master/HA file or Zero-Keystroke flow was changed. SQL values remain parameterized; fixture-only identifiers are internally generated. Original dirty workspace files were not reverted. No release was published during this audit run.

### AGENTS.md Compliance Check

- **No direct DB path usage — PASS for production route changes.** Routes retain AsyncLocalStorage routing; backup and isolated-test inspection tools necessarily use explicit verified filesystem paths.
- **No migration edits — PASS.** Existing numbered migrations remain unchanged.
- **No violation of protected files — PASS for this pass.** Earlier `ha_sync.js` changes are inventoried separately and were not edited here.
- **No SQL injection risk introduced — PASS.** SQL values remain bound; identifiers come from fixed/internal validated sources.
- **No invariant violations introduced — PASS for the correction.** Targeted rollback/history/scope checks passed; integrity/authentication defects were explicitly failed findings at this intermediate stage.
- **No unintended side effects introduced — PASS on the verified environment.** Source files and raw backups were unchanged; generated test services were stopped; nothing was published during this audit run.

**Historical change-level compliance status: PASS. Historical regression/release disposition at this intermediate run: FAIL / BLOCKED. This disposition was superseded by completed surgical remediation and the published v3.7.2 release.**

At the end of this intermediate run, the requested complete trusted baseline had **not** been achieved: the full browser suite was incomplete, integrity/authentication/data-loss defects remained, and migration gates were unresolved. The next scope was to address the historical TOTP cache, small-database replacement and legacy IT authorization/FK defects, then rerun the complete suite with migration-chain verification. That work was subsequently completed in [the surgical follow-up](SURGICAL_REMEDIATION_AUDIT.md), followed by final artifact verification and v3.7.2 publication. The historical verification packages listed above were not published; the release used separately rebuilt artifacts.
