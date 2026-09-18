# Trier OS quick facts — 3.7.2

Copyright © 2026 Doug Trier. [MIT License](../LICENSE); [branding policy](../TRADEMARKS.md).

Trier OS is a feature-complete industrial operations system in maintenance mode. It covers work orders, assets, parts, safety, quality, training, contractors, energy, compliance and corporate analytics without a mandatory SaaS service. Optional external integrations need their configured network access.

| Fact | Current implementation |
|---|---|
| Deployment | One corporate HQ instance; all plants connect there |
| Frontend | React 19, Vite 7 |
| API | Node.js / Express 4; `server/index.js` |
| Corporate service supervisor | `server/cluster.js`; `npm run start:cluster` |
| Databases | Per-plant SQLite at HQ, `trier_auth.db`, `trier_logistics.db`, `corporate_master.db`, `schema_template.db` |
| Data path | Resolved by `server/resolve_data_dir.js`; normally `data/` in source installs, overridden by `DATA_DIR` / packaged configuration |
| Browser session | HttpOnly authToken cookie; 7-day absolute JWT expiry |
| Hub session | Separate localStorage hubToken; 24 hours; independent HUB_TOKEN_SECRET |
| Default API listeners | HTTP 1937 / HTTPS 1938; portable HTTP may be configured as 3000 |
| Development UI | Vite 5173 via `npm run dev:full` |
| Optional local hub | WebSocket 1940, enabled by Electron or LAN_HUB_ENABLED=true |
| Desktop packaging | Electron embedded server; configured installer targets are Windows |
| Languages | 11 translation sets |
| Maintained version | 3.7.2; no documented older-release support promise |

## Optional capabilities and production settings

Live Studio is development functionality; disable it with DISABLE_LIVE_STUDIO=true in production. Electron sets that flag. Creator TOTP is optional when enrolled/enforced. HA, LDAP, SMTP, ERP, sensors, AI services and device/platform integrations require their own provisioning and validation. Do not infer active availability merely from a module being present.

Provision independent JWT_SECRET and HUB_TOKEN_SECRET values of at least 64 random hex characters. Production checks enforce missing/short/recognized default or placeholder rejection, not a 64-hex entropy proof. Explicit HA provisioning requires exactly 64 hex characters and is separate from session secrets. [Security policy](../SECURITY.md) and [HA provisioning](HA_SECRET_PROVISIONING.md).

## Verified testing

The complete gate ran 1,137 instances across 42 specs / 7 projects: 1,113 passed, 24 skipped, no failed/retried/flaky/unexecuted instances, 55.6 minutes. Current enumeration is 1,139 after a final regression added two instances. Later targeted security validation passed 34, and related floorplan/map/XSS validation passed 5 with 1 unchanged conditional skip. That is not a complete run of all 1,139. Original 55 test files/assertions stayed unchanged. Physical scanner/phone testing and browser emulation are distinct. [Evidence and limits](SECURITY_MAINTENANCE_VALIDATION.md).

Deterministic simulation supplies evidence for replayed scenarios, not mathematical proof of all future behavior. Offline/HA recovery is not fully validated for every real transport, outage/restart or paired-server path. Dependency advisory inventory remains subject to reachability review; no blanket CVE-free or certified-security claim is made.

See [architecture](ARCHITECTURE.md), [installation](INSTALL_GUIDE.html), [deployment/rollback](p2/Deployment_and_Rollback.md) and [maintenance policy](MAINTENANCE.md).
