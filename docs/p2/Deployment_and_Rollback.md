# Corporate deployment and rollback — 3.7.2

Trier OS is feature complete and maintained through confirmed break/fix, security and required compatibility changes. The verified security changes were committed and included in [the published v3.7.2 release](https://github.com/DougTrier/trier-os/releases/tag/v3.7.2). Existing published 3.7.1 artifacts must not be assumed to include them. See [maintenance policy](../MAINTENANCE.md).

## Topology and packaging

Deploy one corporate HQ instance; all plants connect there and HQ holds authoritative per-plant databases. Optional plant hub/cache fallback and a paired corporate secondary require separate configuration and recovery validation. The default Electron launcher starts a full local embedded server, not an automatically configured HQ thin client. [Architecture](../ARCHITECTURE.md).

Windows EXE/MSI and portable ZIP are separate build/distribution paths. The configured Electron targets are Windows; native Linux/macOS installer support is not established. For an authorized future build, the existing commands are:

```powershell
# Windows, using paths appropriate to the checkout and separate output folder
powershell -ExecutionPolicy Bypass -File "G:\Trier OS\build_portable.ps1" "G:\TrierOS-v3.7.2"
powershell -ExecutionPolicy Bypass -File "G:\Trier OS\build_installer.ps1"
```

`npm run electron:build` is the configured frontend/Electron build script; inspect `electron-builder.json` for its targets/output. The installer PowerShell script has its own staging/output handling. `npm run package` and `npm run preview` do not exist. Do not add scripts to reconcile old prose.

## Source corporate service

Preserve local changes before any authorized update. Install the reviewed lockfile's dependencies with `npm ci` in the intended checkout, build with `npm run build`, and configure protected secrets/environment before service start:

```powershell
# Windows PowerShell
$env:NODE_ENV = 'production'
$env:DISABLE_LIVE_STUDIO = 'true'
npm run start:cluster
```

```bash
# Linux/macOS source-server startup
NODE_ENV=production DISABLE_LIVE_STUDIO=true npm run start:cluster
```

The existing `start:prod` npm script uses Windows cmd `set` syntax. `npm start` runs `server/index.js`; `npm run dev:full` is API/Vite development mode, not a production service. `npm run seed` runs an exported seeder module without a seeding CLI; initialization/provisioning is performed by existing application paths.

Normal API ports are HTTP 1937 and HTTPS 1938; Vite development UI is 5173, and the portable script can configure HTTP 3000. Confirm the deployment's configured ports. Phones/scanners need trusted HTTPS for camera APIs. `GET /api/ping` includes readiness; a reachable login page alone is not full backend readiness. Review additional authenticated health diagnostics and the affected workflow.

## Portable first-run provisioning (Windows PowerShell)

Run from the extracted portable folder. This creates private, independent session/hub secrets on that installation; do not run over an existing .env or print/commit its values. HA is separately provisioned when used.

```powershell
if (Test-Path -LiteralPath '.env') { throw 'Existing configuration: review it instead of replacing secrets.' }
$installRandom = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$installJwtBytes = New-Object byte[] 32
$installHubBytes = New-Object byte[] 32
$installRandom.GetBytes($installJwtBytes)
$installRandom.GetBytes($installHubBytes)
$installJwtValue = ($installJwtBytes | ForEach-Object { $_.ToString('x2') }) -join ''
$installHubValue = ($installHubBytes | ForEach-Object { $_.ToString('x2') }) -join ''
@("JWT_SECRET=$installJwtValue", "HUB_TOKEN_SECRET=$installHubValue", 'PORT=3000', 'NODE_ENV=production', 'DISABLE_LIVE_STUDIO=true', 'ALLOWED_ORIGINS=http://localhost:3000') | Set-Content -LiteralPath '.env' -Encoding ASCII
$installRandom.Dispose()
```

Restrict .env access to the service/operator identities. Then double-click `Trier OS.bat` or run `runtime\node.exe server\index.js` from that folder. Review HTTPS certificate trust and production account handling before client use. EXE/MSI first-run session-secret generation is handled by the existing Electron launcher; no host TLS keys or HA credentials are shipped.

## Before an authorized deployment

1. Review the specific risk/defect removed and validate it on separate data. Use targeted regressions appropriate to a narrow change; new releases retain the full release gate. Documentation-only changes do not require executable testing.
2. Confirm production mode, independent session/hub secrets, disabled Live Studio, trusted TLS, host permissions and account review in [SECURITY.md](../../SECURITY.md).
3. If using HA, explicitly provision/rotate the paired peer credential using [HA provisioning](../HA_SECRET_PROVISIONING.md). Do not restore a retired distributed credential.
4. Take a consistent secured backup and validate the intended restore procedure separately. Record executable/source/lockfile version, configuration and migration coverage. Migration 047's export mismatch remains deferred; migrations are not guaranteed merely by numbering.
5. Plan the corporate maintenance window and rollback. Never replace operational data with packaged demo/reference datasets or overwrite protected local configuration.

## Consistent backup and rollback

Do not copy just a live `.db` file while SQLite WAL writes continue. Use an approved SQLite-consistent backup method, or cleanly stop every writer and preserve the complete data directory, including any remaining WAL files, auth/logistics/plant files and upload data. Back up protected environment, certificates and local HA configuration securely and separately from public distribution. Validate a restore using separate paths and restrictive permissions.

For rollback, stop the affected instance, preserve its data/logs for diagnosis, and restore the previously reviewed executable/source plus compatible lockfile/configuration. Do not overwrite a dirty checkout with an unreviewed `git checkout -- .` command. If schema/data changes prevent old code from safely using current data, use the pre-deployment consistent backup under an approved recovery plan; account for records created since that backup. Never claim rollback is lossless without reconciliation.

After restart, check readiness, trusted TLS, authorized login, the affected workflow and pending scan/integration items. HA ordering/deduplication, pooled connections after rollback and paired-server recovery are not fully validated. Escalate unresolved risk to the installation administrator/Doug Trier rather than bypassing authentication or inventing empty replacement databases. See [validation limits](../SECURITY_MAINTENANCE_VALIDATION.md).
