# Trier OS security policy

Copyright © 2026 Doug Trier. Source code is licensed under [MIT](LICENSE); [branding rights](TRADEMARKS.md) are separate.

## Maintained version

**[3.7.2](https://github.com/DougTrier/trier-os/releases/tag/v3.7.2)** is the published, feature-complete maintained release. Security maintenance is provided for the current maintained release unless Doug Trier explicitly documents otherwise. No support promise is made for older 3.4.x or 3.5.x releases. See the [maintenance policy](docs/MAINTENANCE.md).

The validated security changes were committed and published in v3.7.2. A previously downloaded 3.7.1 installer or ZIP is not evidence that it contains those changes.

## Private reporting

Do not publish vulnerability details in a public issue. Submit a [private security advisory](https://github.com/DougTrier/trier-os/security/advisories/new) with the affected version, deployment configuration, reproducible steps in a disposable copy, impact and any proposed narrow mitigation. Repository maintainers triage reports; this policy does not promise a staffed response SLA. Do not include real credentials or production data.

## Authentication and authorization

Browser login issues a signed JWT in an **HttpOnly `authToken` cookie**, with `SameSite=Lax`, path `/`, `Secure` when `req.secure` is true, and a **7-day absolute expiry**. The session JWT is not stored in browser localStorage. Protected APIs also accept an appropriate valid `Authorization: Bearer` session JWT for integrations; browser login does not return that session JWT in JSON. HA peers use a separate credential and API-key integrations have their own route controls.

`GET /api/auth/me` checks the session. Middleware validates signatures, expiry, the current user and `TokenVersion`, then applies route and plant permissions. Password/reset and relevant account changes can advance `TokenVersion`. **Logout clears the browser cookie; it does not revoke a separately copied JWT.** Such a token remains usable until expiry or an applicable account/version/signing-key change. Shared devices need browser/OS locking and account controls in addition to logout.

Creator TOTP is optional and applies when enrolled/enforced. Its password stage issues a 5-minute `pre2fa` challenge; generic protected API authentication rejects it. Dedicated `POST /api/auth/verify-2fa` checks the challenge and TOTP before issuing the full cookie session. This does not claim that every enrollment/configuration failure path has been formally verified.

The returned **hubToken** is separate: localStorage is used so the PWA can authenticate a LAN WebSocket connection. It expires after 24 hours and is signed by `HUB_TOKEN_SECRET`, not `JWT_SECRET`. Hub-token possession does not grant a corporate session. Endpoint compromise or XSS can still access this local token and make requests using an existing browser session.

Plants are scopes within one organization, not mutually isolated SaaS tenants. AsyncLocalStorage routes ordinary plant queries; authorized staff cross-plant reads/search remain intentional. Cross-plant logistics/floorplan data also requires route-level authorization and ownership checks.

## Public demo boundary

`demo_tech`, `demo_operator`, `demo_maint_mgr` and `demo_plant_mgr` intentionally use the public password `TrierDemo2026!`. They are low-trust identities confined by the **server** to `examples`. Foreign or `all_sites` selectors in headers, parsed query/body fields and explicit demo-context DB selection are rejected. Shared floorplan IDs are validated after decoding, and nested pins, annotations, zones and sensors are checked against their actual owning plan. UI visibility is not the security boundary. Authorized staff retain intended cross-plant behavior.

Public demo accounts are seeded outside the production-mode conditional; `NODE_ENV=production` does not remove them. Ghost accounts (`ghost_tech`, `ghost_admin`, `ghost_exec`) are only seeded outside production, but an existing account is not removed merely by changing mode. Review and remove/disable public or test identities as appropriate for the installation, and check subsequent startup behavior. See [demo credentials](docs/DEMO_CREDENTIALS.md).

## Production provisioning

| Setting / action | Operator requirement and actual behavior |
|---|---|
| `NODE_ENV=production` | Enables production startup checks and suppresses new ghost-account seeding. It does not clean existing accounts. |
| `JWT_SECRET` | Provision at least 64 cryptographically random hex characters. Production rejects missing values, values shorter than 32 characters, a known default and recognized placeholders. The code does not enforce a 64-hex entropy guarantee. |
| `HUB_TOKEN_SECRET` | Independently provision at least 64 random hex characters. Production rejects missing, short or recognized placeholder values; equality with JWT_SECRET is fatal in every mode. |
| `DISABLE_LIVE_STUDIO=true` | Disable the optional development IDE API in production; Electron sets this flag. Source/ZIP packaging alone does not guarantee it. |
| TLS and HTTP exposure | Trust certificates on clients, restrict plaintext port 1937, and use HTTPS port 1938 or correctly configured TLS termination. Verify proxy handling of `req.secure` and cookie flags rather than assuming them. |
| Account review | Remove/disable existing ghost identities and review intentionally public demos; protect and remove first-login credential files after use. |
| Login limiter | Keep the normal 8 attempts / 5 minutes / username policy. Do not carry test-only elevated `RATE_LIMIT_LOGIN_MAX` into production. |
| Host / backups | Restrict DB, .env, certificate/private-key and local HA-key access to the service/operator identities; use consistent encrypted backups and verify restore on separate data. |
| Optional integrations | Enable only configured LDAP, SMTP, sensors, ERP, AI and other required integrations; review credentials, destinations and plant/role access. |

`SameSite=Lax` mitigates some **cross-site** cookie requests; it is not a blanket block on all cross-origin requests, nor proof that CSRF is impossible. HttpOnly prevents ordinary page JavaScript from reading the cookie; it does not prevent an XSS payload from making authenticated requests or a privileged host user from obtaining a token.

By default CORS accepts built-in local/desktop origins and RFC1918 host origins, with configured `ALLOWED_ORIGINS` additions. Set `DISABLE_LAN_CORS=1` to disable the broad LAN allowance and explicitly configure required origins. No-Origin clients have separate handling. CORS is a browser response-access policy, not authentication, a firewall or host trust.

## Network, HA and uploads

Static-IP changes require global IT Admin/Creator or IT Admin in the selected plant. Adapter names are checked against the host inventory, mode/address inputs are validated, and fixed executables receive argument arrays without shell interpolation. OS privilege and deployment connectivity still matter; tests do not reconfigure a real host.

HA uses explicit fresh **64-character hexadecimal** provisioning on the paired corporate servers, with environment precedence over the resolved data directory's `.sync_key`. Missing, unreadable, invalid or retired provisioning denies peer authentication. The current reviewed source ships no active HA key. Rotate any historically distributed credential; earlier published portable ZIPs may retain it. Only three peer paths accept the HA key; administration still requires session authorization. See [HA provisioning and rotation](docs/HA_SECRET_PROVISIONING.md).

Floorplans accept actual **PNG, JPEG, GIF and WebP** signatures with pixel decoding. HTML, JavaScript, SVG and disguised active files are rejected; convert an SVG plan to a safe raster image before upload. Existing active/unknown shared attachments are download responses with octet-stream, attachment disposition, `nosniff` and a sandbox policy, limiting same-origin execution. Normal allowed raster/PDF/media serving remains inline. These controls are not a new blanket access-control policy for attachment URLs.

## Maintenance and validation limits

Dependency maintenance uses targeted compatible patches, runtime reachability review and regressions for affected paths. Remaining dependency advisories are inventory, not demonstrated exploits. No blanket forced upgrades are authorized.

Offline replay/restart recovery, HA ordering/deduplication and rollback connection lifecycle, migration 047 behavior, zero-coverage invariant PASS, and copied-token logout semantics remain limitations or deferred review items. Physical outage/restart and paired-server recovery are not fully validated by browser tests. This does not invalidate Doug's established functional scanner/phone validation. See [current validation evidence and limits](docs/SECURITY_MAINTENANCE_VALIDATION.md), [threat model](docs/THREAT_MODEL.md) and [control inventory](docs/SECURITY_CONTROLS.md). No formal SOC2 or ISO security certification is claimed.

## Browser inactivity behavior

The React App implements a 15-minute inactivity timer, a warning during the last minute, and client logout. Client logout makes a best-effort shift-log lock request before clearing the cookie/local session state. This UI timer is separate from the server JWT's 7-day absolute expiry and does not revoke a copied token. Browser sleep, closed clients and failed requests are not a server-enforced inactivity/revocation guarantee.
