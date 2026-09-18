# Installer data preservation audit — 2026-09-17

**Current release status:** [Trier OS v3.7.2 is published](https://github.com/DougTrier/trier-os/releases/tag/v3.7.2). The documented code-correctable defects were fixed and regression-verified, and final committed-source artifact verification completed before publication. Historical no-publication wording below records the earlier audit stages. See [release notes](RELEASE_NOTES_3.7.2.md) and the [published package manifest](https://github.com/DougTrier/trier-os/releases/download/v3.7.2/release-manifest.json).

Copyright © 2026 Doug Trier. Licensed under the [MIT License](../LICENSE).

**Completed September 17–18 surgical follow-up:** see [SURGICAL_REMEDIATION_AUDIT.md](SURGICAL_REMEDIATION_AUDIT.md) for implemented and regression-verified database/migration/authentication fixes. All **21 isolated installer scenarios passed again**, including populated upgrade, same-version repair, retained-data uninstall/reinstall, backup verification and failed/interrupted upgrade recovery. Exact existing accounts, password hashes, roles, groups and grants survived. The complete browser run finished with **1,129 passed, 0 failed, 22 documented skips, 0 not run**; all 23 unit-test files, 56 migration prefixes, 11 integration checks, invariant and final data reconciliation passed.

Pre-publication remediation verification packages are in `C:\TM-20260917\artifacts-verified`; production frontend, EXE and MSI builds passed. That MSI contains 16 seed databases, no managed live-data payload, and validated preservation/rollback action ordering. That packaged runtime passed fresh startup and same-version restart with populated account/group retention. These unpublished artifacts superseded earlier verification builds in this historical report; the published release used separately rebuilt artifacts identified in the manifest above:

| Historical verification artifact (unpublished) | SHA-256 |
|---|---|
| `TrierOS-Setup-3.7.2.exe` | `8F3255BC17EBC97166C49A987A0DB96B7810C33C8CCAD3272A820066501A3EAF` |
| `TrierOS-Setup-3.7.2.msi` | `5818928B328EBE2694330236BAFFB7FF9F2EADD54502DA20F451FDF7E6786119` |

Final remediation evidence: `G:\TrierOS-Remediation-20260917-185156`, including `installer-lifecycle-results.json`, `source-reconciliation.json`, `postflight.json`, `playwright-summary.json` and build logs. All 127 original files were unchanged; original packages in `C:\Trier OS\Installers` remained untouched during that remediation. Isolated installer registrations were removed after testing. Historical FAIL/NOT RUN entries below describe the earlier audit unless explicitly carried forward as remaining risks.

**Remediation and isolated preservation tests completed. Final committed-source artifact verification subsequently completed, and v3.7.2 was published.**
The original pre-fix local 3.7.2 packages described below were unsafe and were not
modified by this audit or published. The later release used separately rebuilt
artifacts, not those original packages or the intermediate verification builds.

This document records both the original failure and the implemented repair.
Testing used generated temporary installations, databases and unique per-user
Windows Installer identities. No production install/uninstall command was run.

Trier OS uses Electron and Node.js, not the Tauri/Rust architecture mentioned in the
pasted discussion. At the initial audit, packaged operational databases resolved to
`<installation>/resources/data`. Only launcher configuration/logs use Electron's
per-user application-data directory.

## Original confirmed findings

| Severity | Finding | Evidence and consequence |
| --- | --- | --- |
| Critical | Live data is stored in the replaceable application tree | `electron/main.js` → `getDataDir()` returns `process.resourcesPath/data`; `electron-builder.json` ships databases and configuration to the same directory. |
| Critical | EXE upgrade/uninstall lacks database preservation | `electron/installer.nsh` only sets the default install directory. The installed electron-builder NSIS `installSection.nsh` calls `uninstallOldVersion` before installing new files. Its `uninstaller.nsh` uses the default removal branch, including `RMDir /r $INSTDIR`; no application-specific preservation hook is present. Upgrade removal can temporarily move files for rollback, but that is not persistent-data retention after a successful upgrade. |
| Critical | Existing MSI does not mark mutable data for preservation | Read-only inspection of `C:\Trier OS\Installers\TrierOS-Setup-3.7.2.msi` found 16 database files and 3 JSON configuration files, each with component attributes `256` (64-bit only). None had Permanent (`16`) or NeverOverwrite (`128`). Its File attributes were `512`; making files writable does not establish an upgrade-preservation policy. |
| Critical | Installer build output collides with default install directory | `build_installer.ps1` sets `$OUTPUT_DIR = "C:\Trier OS"` and recursively removes it when producing the transport package. `electron/installer.nsh` sets that same location as the default installation directory. Running the build where an installation uses that path can delete live data even before an installer is run. |
| High | Portable output is a full data-bearing distribution, without an update procedure | `build_portable.ps1` recursively deletes its chosen output directory and packages full database files into `data`. It is a build script, not an updater. Building into an existing portable installation deletes it; extracting a ZIP with replacement enabled can overwrite its database files. |
| High | No complete pre-upgrade backup or rollback gate | `server/migrator.js` wraps each migration and version insert in a transaction. On a failure it logs a warning and stops further migrations for that database, rather than restoring all databases/application files or preventing startup. No automatic pre-upgrade backup was found in this path. Earlier successful migrations remain committed. |

Microsoft documents the component flags and their uninstall/reinstall effects in
the [Component Table reference](https://learn.microsoft.com/en-us/windows/win32/msi/component-table).
Simply adding flags to a new MSI would not prove that an older installed package's
uninstall actions are safe. Preserve legacy data before invoking them.

The inspected MSI includes `Corporate_Office.db`, `trier_logistics.db`,
`corporate_master.db`, plant databases, reference databases, `plants.json`,
`branding.json`, and `corporate_leadership.json`. Runtime-generated auth databases
are excluded from the payload, but that does not protect them from recursive EXE
installation-directory removal.

## Artifact identities

Existing local 3.7.2 artifacts were read, not modified or executed:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `TrierOS-Setup-3.7.2.exe` | 254039304 | `f7d2c29b08b5775a59dc50805b56e4a9ad59fea487cc32d90f1df1f2147a6d1d` |
| `TrierOS-Setup-3.7.2.msi` | 246231040 | `85d483c11ab25a46396e721f7da40c0e8ebc2da7138e9ef510a6da811c45372e` |

These artifacts predate the reset/bulk-deletion source changes from this task.

## Original remediation and acceptance gate

1. Separate persistent machine data from replaceable application files, or
   establish an equivalently tested preservation mechanism. Seed a clean install
   only when no existing deployment data is present.
2. Before an old EXE/MSI uninstall can run, discover and preserve legacy live data,
   configuration, users, uploads, keys, and SQLite WAL state. Fail safely on copy,
   integrity, permission, or ambiguity errors. Changing the new runtime path alone
   cannot rescue data already removed by the old uninstaller.
3. Move release staging/output away from installation directories and reject
   destructive build targets containing deployed data.
4. Make normal upgrade, repair, uninstall, and reinstall preserve data by default.
   A destructive reinstall is optional; it must require explicit user choice.
5. Back up and validate before migrations, and define failure handling for all
   already-applied steps rather than claiming a single migration rollback restores
   the whole upgrade.
6. Validate actual EXE/MSI/portable workflows in isolated temporary paths. Seed
   10,000 IT assets, accounts, sites, work orders and history, including serial
   `DO-NOT-DELETE-8675309`. Check data, keys, configuration, SQLite integrity and
   canary survival after same-version reinstall, newer-version upgrade, repair,
   cancellation, failed migration, uninstall with retention, and reinstall.

## Root cause and implemented behavior

Two independent paths caused the preservation failure. Live databases shared
the installer's replaceable directory, and startup code modified existing
identities even when the database file survived. `auth_db.js` deleted `it_admin`
and its plant roles, rewrote creator profiles and permissions, granted permissions
to existing administrators/managers, and could overwrite a password from stale
`auth.json` data. These destructive startup operations have been removed.

| Operation | Old behavior | New behavior |
| --- | --- | --- |
| Fresh install | Packaged databases installed directly into the live data location | Package contains `resources/seed-data`; the offline helper initializes a new persistent store exactly once, stages and verifies the copy, and records initialization durably. Auth identities are generated on first creation of the identity store. |
| Update Existing Installation | Old uninstaller or MSI file operations could delete/replace databases | `Prepare` executes before file replacement/removal, requires the application to be stopped, copies legacy data outside the program tree, hashes every copied file, and retains a complete program/data recovery archive. New package seeds are ignored for existing stores. |
| Same-version reinstall/repair | Could restore distribution database files | Uses the same preservation transaction as a version upgrade. MSI supports major upgrades with an equal version and a different package/product identity. |
| Accounts and groups | Startup could purge or rewrite identities and permissions | Existing user IDs, hashes, token versions, profile fields, grants, `UserPlantRoles`, `UserADGroups`, and `GatekeeperRoleMap` records are retained. Missing creator/demo identities are not automatically recreated in an existing identity store. |
| Ordinary uninstall | Recursive program removal could remove data | NSIS deletes only the packaged file inventory. MSI removes its code/seed components. Compatibility links are detached first; machine data, backups and per-user configuration remain. |
| Retained-data reinstall | Could reseed a deployment | A durable deployment manifest and retained registry locator select the existing directory/store. Legacy MSI directory discovery also reads the registered executable component when the old package lacks an install-location property. |
| Failed/interrupted update | No application-wide recovery archive | A pending transaction blocks the new launcher. Retry verifies the original backup. Rollback restores archived program files and reconnects retained data; MSI also executes its own transaction rollback. |
| Production startup after a code change | Migrations/initialization could write without a backup | Before database modules load, SQLite backup snapshots include committed WAL data and pass `integrity_check` plus SHA-256 verification. A server-code fingerprint covers same-version changes. The cluster primary completes the backup before starting workers. Failure stops startup. |
| Explicit reset | No installer-level confirmed preservation procedure | Separate offline `Reset` action requires the exact destructive confirmation, verifies a recovery copy, and retains the original data before resetting the live store. It is never part of ordinary install/uninstall. |
| Build cleanup | Could recursively erase `C:\Trier OS` or a portable deployment | Build destinations must be new directories outside the source. All three build scripts refuse existing destinations. Portable packages also ship `seed-data`, and initialize through the preservation helper. |

Historical migrations were **not edited**. This repair introduces no schema
replacement or new business schema migration. Future schema changes must use
numbered migrations and the verified startup backup gate; do not distribute an
updated database over an existing deployment.

## Protected database and persistent-data locations

Default machine storage is `%ProgramData%\TrierOS`. Its `deployment.json` records
the installation path, canonical data directory and compatibility mappings;
`live` holds mutable stores and `backups` holds recovery copies. New storage ACLs
grant access to SYSTEM, Administrators and the installing operator, not all local
users. MSI passes the installing user's SID to its elevated helper.

| Existing location / contents | Protection |
| --- | --- |
| `<install>\resources\data`, portable `<install>\data` | Entire directory adopted, not a fixed database-name allowlist. Covers all plant/site databases, `trier_auth.db`, `trier_logistics.db`, `corporate_master.db`, `mfg_master.db`, `it_master.db`, schema/reference/chat/translation/map/setup databases and customer-added databases. SQLite WAL/SHM/journal companions are included in stopped-system copies. |
| `<install>\resources\app\data`, `resources\app\server\data`, portable `server\data` | Existing distinct directories retained separately. Missing legacy application-relative locations link to the canonical store. This protects scan photos, digital-twin files and legacy consumers without editing the protected scan state machine. |
| Under the resolved data directory | Includes plants/branding/leadership/network JSON, auth configuration, first-login credentials, `.sync_key`, certificates/Let's Encrypt, edge keys, uploads, artifact caches, work-order/asset/procedure/floorplan/SKU files, snapshots, import/reset snapshots and backups. |
| Root/app `data_secondary`, `snapshots`, `uploads`, `public\uploads`, `server\connectors`, `logs`, `Legacy Databases`, `PMC` | Known directories are mapped out of the replaceable program tree. The complete old program tree is also archived, retaining unrecognized files and historical customizations. |
| Root/app `.env` | Archived before replacement and restored afterward; excluded from new distribution payloads. |
| Explicit external `.env` `DATA_DIR` | Backed up, kept in place and reused. An absent configured directory or a custom directory inside program files causes a safe stop instead of silently creating a replacement. Externally managed data is excluded from the reset/restore actions. |
| External `TLS_CERT_DIR`, other explicitly external paths | Installer cleanup does not enumerate or delete external paths. Their configuration is retained. Administrators remain responsible for external-service permissions and backups. |
| Electron `app.getPath('userData')\TrierOS\config.json` and logs; browser/session storage; optional `%APPDATA%\TrierOS\trier_local.db` | Outside program cleanup and retained on uninstall. The generic NSIS `--delete-app-data` bypass is rejected. Launcher secrets are not distributed. |
| Plant Hub Windows service | Its service uninstaller removes the service/firewall rules only; it does not erase application/data files. No service was changed during testing. |

Unexpected reparse points, changed link targets, overlapping install/storage roots,
locked database files, unverified backups, and mismatched deployment directories
stop the operation. Switching between EXE and MSI ownership is blocked for the
default machine deployment; use the same installer format as the existing install.

## Files changed for preservation

- `electron/preserve-data.ps1`: shared offline prepare/commit/rollback/uninstall/
  reset/restore lifecycle, verified copies, persistent mappings, ACLs and locking.
- `electron/installer.nsh`, `electron/msi-preservation.js`: NSIS/MSI lifecycle hooks,
  retained-directory discovery, failure handling, and hidden helper launches.
- `electron/storage.js`, `electron/main.js`: read the retained store and reject
  missing or unfinished deployments instead of creating replacement databases.
- `electron/program-inventory.js`, `electron/afterPack.js`, `electron-builder.json`:
  package-file inventory, separate seeds, compiled MSI hooks, conservative removal.
- `electron/portable-start.ps1`, `electron/portable-start.js`: portable adoption
  before Node starts, stable per-user storage and retained-data startup.
- `server/auth_db.js`: preserve existing identities, memberships and permissions.
- `server/preflight_backup.js`, `server/index.js`, `server/cluster.js`: verified
  SQLite backups before production initialization after executable-code changes.
- `scripts/build_directory_guard.ps1`, `build_installer.ps1`, `build_portable.ps1`,
  `build_production.ps1`: reject destructive build destinations; separate seeds.
- `scripts/package_msi_data.ps1`: replaced post-build MSI mutation with read-only
  verification of data locations and preservation-action ordering.
- `tests/unit/installer_preservation.test.js`, `installer_packages.js`,
  `installer_edges.test.js`: real SQLite and compiled Windows-installer regressions.

Pre-existing workspace changes, including the site-reset and IT bulk-delete fix,
remain separate from this list and were retained.

## Test matrix and evidence

Fixtures include seven real SQLite databases, two sites, **10,000 IT hardware
records**, other IT categories and associations, assets, work orders/history,
maintenance, training, quality, inventory, cost centers, safety/LOTO, corporate
records, audit history, chat and a customer-extension database. Canary values
include `DO-NOT-DELETE-8675309`. Tests compare complete table records and persistent
file hashes; SQLite sidecar coordination files are excluded from stable-record
comparisons and tested separately through WAL backup/locking cases.

Authentication fixtures initialize the actual `auth_db.js` schema and contain
customer users, `it_admin`, creator identities, restricted administrator grants,
nonzero token versions, multiple plant roles and multiple directory groups.
Production authentication startup must leave those existing rows exactly intact.

| Scenario | Result and scope |
| --- | --- |
| Clean install | PASS: helper creates the store from staged seeds and establishes runtime pointers. |
| Populated upgrade | PASS: every fixture record/configuration file survives. |
| Same-version reinstall | PASS: helper, compiled NSIS, MSI repair, and MSI equal-version/new-product upgrade. |
| Newer-version MSI upgrade | PASS: actual old MSI removal and new installation using isolated per-user product IDs. |
| Legacy NSIS recursive removal | PASS: compiled fixture performs the old recursive removal only inside its generated TEMP install directory, after the production preservation hook. |
| Uninstall retaining data | PASS: compiled NSIS and MSI; original records remain accessible in persistent storage. |
| Reinstall after uninstall | PASS: compiled NSIS/MSI reuse retained data; helper succeeds without needing seed files. |
| Explicit destructive reset | PASS: missing confirmation rejected; confirmed reset clears the live store while retaining a verified backup and original data. |
| Interrupted update | PASS: pending update blocks launcher; retry verifies the original backup; rollback restores original program files. |
| Failed MSI upgrade | PASS: injected failure exercises Windows Installer and preservation rollback. |
| Backup corruption | PASS: altered backup prevents commit and leaves persistent data unchanged. |
| Pre-migration backup and restore | PASS: SQLite backup is verified; confirmed restore reverses added schema/data changes and recovers exact original records. |
| Locked SQLite/WAL files | PASS: preparation aborts before removal; succeeds after the writer closes. |
| Committed WAL content / corrupt SQLite | PASS: startup snapshot contains WAL records; corrupt input prevents advancing the backup gate. |
| External data and unknown junctions | PASS: external store is retained; unknown junction causes safe rejection. |
| Existing build destination | PASS: build refuses it and its canary file is unchanged. |
| Complete unit regressions | PASS: all 17 `tests/unit/*.test.js` files (15 existing plus both new preservation test files), with isolated `DATA_DIR`. |
| Reset and IT bulk-delete browser regression | PASS: `node tests/unit/database_reset.test.js --ui`, including expected injected-failure rollback paths. |
| Full distribution seed backup | PASS: verified SQLite snapshots and integrity checks for all 16 actual distribution database files in a temporary copy. |
| Frontend production build | PASS: `npm run build`. |
| Production-size installer compilation | EXE and MSI compile locally. Read-only MSI gate confirms 16 seed databases, no managed live-data directory and correct action order. Final build evidence is recorded below. |

Reproduce the focused lifecycle tests with:

```powershell
node tests/unit/installer_preservation.test.js --installers
node tests/unit/installer_edges.test.js
npm run build
```

The lifecycle script prints the retained TEMP evidence directory, including MSI
logs and test databases. Latest completed lifecycle evidence at documentation
time: `C:\Users\Doug\AppData\Local\Temp\trier-preservation-ccGnQn` (21 scenarios).
Boundary evidence: `C:\Users\Doug\AppData\Local\Temp\trier-preservation-edges-jlks5O`.
Complete unit-suite log:
`C:\Users\Doug\AppData\Local\Temp\trier-complete-unit-393ec9837ca2448f9884b4c8984311de\results.log`.
Reset/UI log: `%TEMP%\trier-preservation-reset-ui.log`.
Distribution backup evidence:
`C:\Users\Doug\AppData\Local\Temp\trier-distribution-backup-T9C3Gd`.
Frontend build log: `%TEMP%\trier-preservation-production-build.log`.
Production-size packaging uses a copied cached Electron runtime and staged current
application source at `C:\TP-88fbdbff`; the real installed application is not used
as a test target. Build outputs are unpublished verification artifacts.
Final EXE and MSI compilation and read-only MSI preservation validation passed;
outputs are in `C:\TP-88fbdbff\final`, with log
`C:\TP-88fbdbff\final-build.log`. The original release artifact SHA-256 values
above were rechecked after all testing and are unchanged.

| Unpublished final verification artifact | SHA-256 |
| --- | --- |
| `C:\TP-88fbdbff\final\TrierOS-Setup-3.7.2.exe` | `883ef2b58e792f161df88ad2a032225171233378b71bb5d3091c2854cbc3d3ee` |
| `C:\TP-88fbdbff\final\TrierOS-Setup-3.7.2.msi` | `7501c3d45c2026ee3db53e0bc4e512d7d036eae355d21bbf1dbeba2c49276030` |

## Operator recovery and explicit reset

Stop all Trier OS processes/services before offline maintenance. Ordinary update
and uninstall need no deletion confirmation because they retain data. Do not run
the following destructive action as a routine update step.

```powershell
# WARNING: clears the live managed store, including users and group memberships.
# Verified recovery copies are retained. A subsequent installer run initializes
# a fresh store. Use the installation's actual path and helper location.
powershell -NoProfile -ExecutionPolicy Bypass -File "<helper>\preserve-data.ps1" `
  -Action Reset -InstallDir "<installation>" -Confirmation "DELETE TRIER OS DATA"

# Recover original program files after an unfinished installer transaction.
powershell -NoProfile -ExecutionPolicy Bypass -File "<helper>\preserve-data.ps1" `
  -Action Rollback -InstallDir "<installation>"

# Restore a verified pre-startup snapshot. This replaces current live data and
# retains its pre-restore contents. Restore matching application code as well.
powershell -NoProfile -ExecutionPolicy Bypass -File "<helper>\preserve-data.ps1" `
  -Action Restore -InstallDir "<installation>" -Backup "<data>\backups\before-startup-..." `
  -Confirmation "RESTORE TRIER OS DATA"
```

For portable/custom stores pass their recorded `-StateRoot` and `-Layout Portable`
where applicable. Backups are intentionally not pruned automatically. Preserve
the recovery helper separately before uninstall if planning offline recovery.

## Remaining risks and release disposition

1. The published release used newly rebuilt artifacts and completed isolated package validation.
2. **Resolved in the surgical follow-up:** historical migration 047 and other entry
   forms now execute through the tested compatibility adapter. Filename/checksum
   tracking distinguishes both 017 migrations. All 56 reconstructed ordered
   prefixes passed, with verified backups, transactional failure and interruption
   recovery. Existing migration files were not edited. Unknown customer-modified
   schemas remain outside the reconstructed-history proof and fail safely.
3. Legacy custom `DATA_DIR` inside program files, unknown links, ambiguous layouts,
   network/unsupported filesystem arrangements and installer-format changes are
   stopped for explicit maintenance rather than guessed or reset. A service run
   under another identity needs access to the persistent store before startup.
4. Offline file copies require sufficient free disk space and all writers stopped.
   SQLite backup verifies each database; it does not make simultaneous writes by
   other independently running servers a cross-database transaction. Real machine
   power-loss testing at every instruction boundary remains unperformed.
5. NSIS program-file rollback retains data and restores archived files; a failed
   installation can still require rerunning setup to repair Windows registration
   or shortcuts. MSI supplies its own registration rollback.
6. Whole-program archives preserve unknown custom files for recovery; that does
   not automatically merge customer edits to packaged application source into a
   new version. Persistent data in the documented mappings is reused directly.

## Historical intermediate regression follow-up — 2026-09-17

This section retains the intermediate audit state before the completed surgical
remediation and v3.7.2 publication described above.

The [full preservation regression audit](REGRESSION_PRESERVATION_AUDIT.md) records
a fresh application/repository review and isolated lifecycle retest. All 21 named
helper/package scenarios passed, including exact existing user accounts, group
memberships, role assignments and permission grants. All 17 unit files and the
11-check integration gate passed. New production-size EXE/MSI artifacts compiled
under `C:\TR-c53fcc7b\artifacts`; the compiled MSI gate passed with 16 seed DBs.
These historical verification builds remain unpublished; the later release used
separately rebuilt artifacts.

All 127 protected source-data/configuration files were compared against verified
offline backups and remained byte-identical. Eight real-SPA reset/bulk/sentinel
tests passed, including server restart. The linked report contains full-suite
results, command-window observation, exact artifact hashes and remaining gates.

The fresh audit also reproduced a historical startup path that replaces a valid
small SQLite plant database based on file size, and a legacy single-item IT delete
authorization/false-success defect. Those paths predate the preservation changes;
they were documented without broadening this regression pass into historical
repairs. Existing FK schema errors and migration-chain issues remained unresolved
at that stage. Consequently those passing isolated tests did not remove the
intermediate release block; the subsequent surgical remediation resolved it.

The full browser gate was incomplete at that stage: the latest full attempt stopped after
479 passes at an invalid sandbox HA-key fixture (corrected), and the focused
security rerun then reproduced the unchanged TOTP replay-cache defect after 32
passes. Historical repairs were not authorized in that regression scope. The
final source/raw-backup hash check passed, isolated IT orphan checks were zero,
and the console observer recorded zero visible console events. See the linked
report for failed/skipped/not-run counts and the follow-up scope, subsequently
completed in [the surgical remediation](SURGICAL_REMEDIATION_AUDIT.md) before
v3.7.2 publication.
