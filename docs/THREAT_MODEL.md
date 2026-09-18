# Trier OS threat model — 3.7.2

This describes the current reviewed implementation and deployment assumptions, not formal certification or an exhaustive proof of exploit absence. The security maintenance in the working tree is not yet published. See [security policy](../SECURITY.md) and [maintenance policy](MAINTENANCE.md).

## Assets and trust boundaries

One corporate HQ instance holds authoritative per-plant work orders, assets, inventory, quality and maintenance data; `trier_logistics.db` holds shared safety/audit/operational data, `corporate_master.db` holds corporate master/aggregate data and `trier_auth.db` holds identities, password hashes, plant roles and token versions. Signing secrets are protected environment/configuration, not plaintext user records in the auth DB. Uploads, TLS keys, first-login credentials and backups are also sensitive assets.

```text
Untrusted network / client / device input
    → customer-managed perimeter, TLS and client trust
    → corporate Express authentication / role / plant controls
    → AsyncLocalStorage plant DB or explicitly filtered shared DB

Optional plant LAN fallback: authenticated hub WebSocket + local queue/cache
Optional corporate secondary: explicit HA-key peer authentication
Optional external integrations: their configured transport / credential boundaries
```

The intended model is one organization with authorized cross-plant search, not separate SaaS tenants. The default Electron package starts an embedded full server on its host; installing it per plant does not automatically implement a single-HQ topology. [Architecture](ARCHITECTURE.md) explains this distinction.

Private-intranet deployment is an operator assumption, not an application guarantee that no internet path exists. Listener binding, firewall rules, remote access, proxy configuration and integration destinations must be reviewed by the deploying organization. LAN-origin CORS acceptance does not authenticate a device.

## Authentication threats

Browser sessions are 7-day absolute-expiry JWTs in HttpOnly `authToken` cookies; valid Bearer JWTs are supported for appropriate integrations. Cookie Secure is conditional on `req.secure`. HttpOnly blocks ordinary page-script token reads but not authenticated requests by XSS, privileged host access or every extension threat. SameSite=Lax mitigates some cross-site requests, not all cross-origin/same-site scenarios. HTTPS and origin policy remain deployment controls.

Current-user/TokenVersion checks can revoke stale sessions after applicable account changes. Logout clears the cookie but leaves a separately copied JWT valid until expiry or applicable account/version/signing-key change. Shared scanner/workstation sessions require screen locking, device management and credential hygiene.

Creator TOTP is optional when enrolled/enforced. Password verification then returns a 5-minute `pre2fa` challenge; protected generic auth rejects it. Dedicated verification exchanges a valid challenge/TOTP for a full session. Successful-flow tests and purpose restriction are not a formal proof of every settings/enrollment failure path. TOTP secret encryption depends on the JWT signing key; rotate that key only with a tested encrypted-field recovery plan.

The separate 24-hour hubToken is stored in localStorage and signed by HUB_TOKEN_SECRET. The secrets must differ. Production checks reject missing/short/recognized placeholder session/hub secrets; they do not establish entropy or enforce the recommended 64+ random-hex provisioning standard.

## Authorization and public identities

Bound SQL values, whitelisted dynamic identifiers, input validation and request-context DB routing are required standards. Internal explicit DB selection exists and must not receive unchecked external input. Shared DB rows need appropriate plant and object-ownership filters. Do not equate separate SQLite files with a ban on intended staff cross-plant reads.

Public `demo_*` accounts are intentionally low trust and server-confined to `examples`. Foreign/all-sites header, query and parsed-body selectors are rejected; explicit selection is guarded in demo context. Shared floorplan URL IDs are decoded and checked, including actual ownership of nested pins, annotations, zones and sensors. UI restrictions do not establish isolation. This targeted boundary review does not claim every shared endpoint has been formally verified.

Public demo seeding occurs in production too. Ghost fixture seeding is non-production only, but existing ghosts remain after a mode change. Review identities and startup behavior before deployment. [Demo accounts](DEMO_CREDENTIALS.md).

## Administrative and file surfaces

Static-IP changes require the existing authorized IT Admin/Creator boundary, validated host adapters/IPv4 inputs, and fixed executable argument arrays without shell interpolation. Tests inspect commands without changing real host networking.

Floorplan uploads require valid PNG/JPEG/GIF/WebP signatures and decoding. Active HTML/JS/SVG and disguised content are rejected; SVG plans require safe raster conversion. Historical active/unknown shared attachments download with attachment disposition, octet-stream, nosniff and sandbox headers. Normal allowed images/PDF/media remain inline. These are execution protections, not proof of blanket attachment confidentiality; review URL access against deployment needs.

Live Studio is optional development functionality. Set `DISABLE_LIVE_STUDIO=true` in production. When enabled it is an elevated file/code surface, even with role and path controls. The Electron launcher disables it. AI assistance is intended to be human-mediated, with route-level permissions governing data access; prompts, retrieved data and returned links remain untrusted input. No claim of formal model isolation or universal prevention of exfiltration is made.

## Offline and HA recovery

PWA IndexedDB and hub-local SQLite queues are distinct. Device timestamps are client-supplied context, not authoritative forensic clocks. Scan-ID uniqueness and drain guards are useful controls but do not prove global exactly-once recovery. Current hub/scan HMAC-key and generic-auth integration, queue defaults, missing/per-item ACK handling and restart recovery remain deferred review items. Inspect semantic per-item success, not HTTP 200 alone. Some regression communication is mocked/intercepted.

HA authenticates exactly the permitted peer paths with an explicitly provisioned fresh 64-hex key. Missing/invalid/unreadable/retired provisioning denies peer auth. Rotate credentials retained in historical portable distributions; removing a source file does not revoke copies. See [HA provisioning](HA_SECRET_PROVISIONING.md). Ordering/idempotency and rollback pooled-connection behavior remain deferred; no fully validated paired-server recovery or zero-data-loss guarantee is claimed.

## Deployment controls and evidence limits

Use production mode, independent strong session/hub secrets, explicit HA provisioning when enabled, trusted TLS, restricted plaintext/network access, narrow origins where practical, protected filesystem permissions and consistent encrypted backups. Keep login limiting at normal production values, remove/disable existing ghosts and review public demos. Enable optional LDAP/SMTP/sensors/ERP/AI only after configuring and validating their access and destinations.

The operator owns perimeter/VPN segmentation, device OS/MDM, physical access, certificate trust/renewal, host/disk security and backup/restore validation. The application has backup-related capabilities; their existence does not prove every physical recovery path. Third-party data and credential handling requires separate review.

Migration 047 coverage, zero-coverage invariant PASS and remaining dependency advisories remain known review limits. Do not infer overall assurance from a PASS label alone. [Validation evidence](SECURITY_MAINTENANCE_VALIDATION.md) distinguishes the complete 1,137-instance run from the later 1,139 enumeration and targeted runs, and from Doug's physical hardware testing.

## Browser inactivity behavior

The React App implements a 15-minute inactivity timer, a warning during the last minute, and client logout. Client logout makes a best-effort shift-log lock request before clearing the cookie/local session state. This UI timer is separate from the server JWT's 7-day absolute expiry and does not revoke a copied token. Browser sleep, closed clients and failed requests are not a server-enforced inactivity/revocation guarantee.
