# Trier OS 3.7.2 release preparation

Application behavior is frozen at the completed surgical-remediation baseline. Release preparation changes documentation and packaging inputs only. The owner explicitly authorized commit, tag, push and publication,.

## Packaging defect and correction

A clean-checkout inspection reproduced two release-input failures: the required manufacturing reference catalog was ignored and absent from Git, and the tracked logistics seed contained old test grants and credential/configuration rows. The former build scripts also read the working `data` directory, making a build depend on local mutable databases.

The corrected EXE/MSI and portable build scripts materialize committed, hash-verified `release-data/*.db.gz` archives into new staging directories. They do not read live SQLite files. Raw `data/*.db` files are removed from Git tracking while the original files remain untouched on disk. Their intentional demo/reference replacements are committed compressed archives, each below GitHub's per-file limit.

Distribution-only sanitization removed populated invite codes, creator/email settings, vendor access records, ERP connectors, digital-twin sync configuration/logs, test role grants, Gatekeeper audit fixtures, instance configuration, edge fixture state, proof receipts, deployment/settings rows and the known dummy artifact. Empty credential tables remain empty. Sanitization operated on copies of the old Git seed blobs; no original operational database was changed. Existing trigger definitions were retained, including immutable-ledger protections. The manufacturing catalog archive expands byte-for-byte to the original required reference catalog; it was not sanitized, reseeded or modified.

There are 11 committed database seed/reference archives. The old 16-file verification payload additionally included local auxiliary stores; those untracked runtime copies are not release inputs. Missing operational stores are created through existing application startup paths. Final isolated artifact startup verifies that the committed seeds support normal initialization.

`tests/unit/release_packaging.test.js` passed: real archive/hash verification, required catalog inclusion, no distributed credential/test-grant rows, retained demo assets, refusal to overwrite existing/source directories and corrupt-archive rejection. This packaging-specific test supplements the completed 23-file application unit baseline; it does not replace or weaken any application assertion.

The first committed-source portable build also reproduced a PowerShell packaging failure: a normal Vite diagnostic on stderr became a terminating `NativeCommandError` under `ErrorActionPreference=Stop`. The portable builder now uses the same native-output capture pattern as the installer builder and checks each native command's actual exit code. Warnings no longer abort a successful build, while real Vite/npm/native-rebuild failures stop packaging. Application code and dependencies were not changed for this correction; final artifacts are rebuilt from the subsequent commit.

## Reproducible release inputs

Build from a clean checkout of the release commit, with the committed lockfile dependencies and the existing Windows Node/Electron build toolchain. Use fresh destinations through the existing build-directory guards:

- `build_portable.ps1 <new-output-directory>` produces the portable folder; archive it as the ZIP distribution and the separately named portable archive.
- `build_installer.ps1` creates unique staging/output directories and compiles EXE/MSI with the existing preservation hooks.
- Generate `Install Instructions.pdf` from committed `docs/INSTALL_GUIDE.html`, then render and inspect the PDF.
- The release manifest records exact commit, dependency/runtime provenance, seed hashes, artifact byte sizes, SHA-256 values and final isolated smoke results. Publish that manifest and `SHA256SUMS.txt` with the artifacts.

The older `build_production.ps1` clean-database recipe is not used by this release; the supported release pipeline is the EXE/MSI and portable pipeline above. No live installation, original database, old verification executable or unsafe local installer is a final artifact input. Evidence, credentials, cached test authentication, registry exports and personal files remain local and are excluded from Git staging and packages.
