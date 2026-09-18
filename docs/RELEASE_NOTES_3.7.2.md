# Trier OS 3.7.2 — Preservation and Security Maintenance

Normal upgrades and reinstalls preserve your existing databases, user accounts, passwords, roles, groups, memberships and permissions. Uninstall retains persistent data by default; reinstall reuses it. Destructive reset remains a separate, explicitly confirmed action with a verified backup.

- Corrected Corporate Office/site reset selection, preview counts and rollback behavior while retaining EventLog, audit and replication history.
- Added bulk deletion across all four IT asset categories and corrected legacy IT authorization and misleading deletion success.
- Preserved small valid SQLite databases and corrected TOTP replay handling, SOP foreign keys and EventLog schema compatibility.
- Restored historical migration compatibility, with filename/checksum tracking and verified backups before migration. Historical migrations 001–061 were not rewritten; corrections use forward migrations 062–063.
- Corrected offline replay of destructive requests, work search and site-cache isolation, corporate aggregation and asset-status displays.
- Included the verified demo-scope, network-configuration, upload and authentication security maintenance.

The complete seven-project browser regression finished with **1,129 passed, 0 failed, 22 documented conditional skips and 0 not run**. All 23 unit-test files, 56 migration starting states, 21 isolated installer lifecycle scenarios and 11 integration checks passed. Database integrity, foreign-key, orphan, invariant and account/group preservation checks passed. Final packages passed focused smoke tests from the committed release source before [v3.7.2 publication](https://github.com/DougTrier/trier-os/releases/tag/v3.7.2). See that release's attached manifest and SHA256SUMS for exact build provenance and artifact hashes.

Use the same installer format as the existing installation. Stop Trier OS before an update. Portable distributions contain `seed-data`, not a replacement live `data` directory; use the included launcher to initialize or reconnect retained storage. Keep the deployment locator and retained storage intact when updating. See the installation guide for provisioning installation-specific secrets.
