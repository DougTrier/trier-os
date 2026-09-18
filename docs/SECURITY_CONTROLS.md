# Trier OS security control inventory — 3.7.2

This source-based inventory uses SOC2-style categories for reviewer navigation. It is **not** SOC2 certification, an equivalence assessment or proof that every route/failure path satisfies a control. The verified security maintenance was committed and included in [the published v3.7.2 release](https://github.com/DougTrier/trier-os/releases/tag/v3.7.2). See [SECURITY.md](../SECURITY.md) for deployment policy.

## Logical access and authentication

| Control | Current implementation / limit |
|---|---|
| Session verification | `server/middleware/auth.js`: JWT signature/expiry, current user/TokenVersion, route and plant checks |
| Browser credential handling | `server/routes/auth.js`: HttpOnly authToken cookie, SameSite=Lax, Secure on `req.secure`, 7-day absolute expiry |
| Integration tokens | Appropriate routes can accept valid Bearer session JWTs; HA and API-key paths have separate controls |
| Password hashing | `server/auth_db.js` / auth routes: bcrypt; fresh creator password is randomly generated, not a shared default |
| Creator TOTP | Optional enrolled/enforced flow; 5-minute pre2fa challenge, dedicated completion, generic protected auth rejects challenge tokens |
| Session invalidation | Applicable password/account changes advance TokenVersion; logout only clears cookie and does not revoke a copied token |
| Hub token | Separate 24-hour localStorage token signed by HUB_TOKEN_SECRET; not a corporate API session |
| User/plant roles and feature flags | `trier_auth.db`; UI tile availability is distinct from server authorization |
| LDAP | Optional configured integration; validate intended mapping, transport and local fallback in the deployment |

HttpOnly does not prevent XSS from making authenticated requests. SameSite mitigates some cross-site requests, not every cross-origin/same-site case. Broad default LAN CORS is a browser policy, not authentication or network segmentation.

## Data and input boundaries

Ordinary plant requests use validated AsyncLocalStorage context. Internal explicit DB selectors exist; unchecked external inputs must not be passed to them. Authorized staff cross-plant search/read is intentional within the organization. Shared logistics rows need route-specific role/plant/object checks. [Architecture](ARCHITECTURE.md).

Public demo identities are server-confined to examples, with foreign/all-sites header/query/body rejection and a demo-context explicit-selector guard (`server/demo_scope.js`, middleware and database helper). `server/routes/floorplans.js` checks decoded plan IDs and actual nested-object owning plans. This is targeted verified scope, not a claim of exhaustive proof for every shared endpoint.

Bound SQL values, validated dynamic identifiers and write-field allowlists are required by [server standards](../server/standards.md). Those standards do not justify declaring SQL injection impossible without review of the specific route.

Static-IP administration requires authorized global IT Admin/Creator or selected-plant IT Admin. `server/network_config.js` validates host adapter inventory and IPv4 fields and invokes fixed executables with argument arrays, without a shell. Tests observe commands rather than modifying host networking.

Floorplan rasters require PNG/JPEG/GIF/WebP signature checks and decoding (`server/upload_safety.js` and floorplan routes). Active/disguised formats are rejected, including SVG floorplans; use safe raster conversion. Shared active/unknown attachments are downloads with nosniff and sandbox headers; supported raster/PDF/media remains inline. Execution protection does not itself authenticate attachment URLs.

## Change control and observability

Live Studio is elevated optional development functionality. Disable it with DISABLE_LIVE_STUDIO=true in production; Electron sets this flag. Existing path/role controls and deploy ledgers are not permission to edit production code during maintenance or a guarantee of safe rollback.

Audit middleware and route-level logging provide attribution in `AuditLog` / domain ledgers within `trier_logistics.db`. Filesystem fallback and logging reduce silent failures; storage/permission failures still need monitoring. No absolute “audit can never be lost” or cryptographic tamper-proof guarantee is asserted. Gatekeeper records permit/change decisions and proof receipts for configured safety-critical paths; it does not certify legal compliance automatically.

Use readiness/health diagnostics, audit records and pending/failed integration summaries alongside operator checks. Retry/outbox mechanisms are recovery controls, not universal exactly-once delivery guarantees.

## Encryption, availability and deployment

HTTPS normally listens on 1938; plaintext HTTP normally remains on 1937 (portable configuration may differ). Operators must restrict exposure and trust certificates. The application supports certificate selection/generation; trusted client setup and renewal are deployment responsibilities. A Secure cookie depends on actual request/proxy handling.

TOTP and SMTP encrypted fields use AES-256-GCM and JWT_SECRET-derived key material. This is field encryption, not whole-database encryption. Rotating JWT_SECRET can make existing encrypted fields unreadable; plan and test recovery/re-enrollment before rotation. No future rotation tooling is promised.

Optional HA has explicit fresh 64-hex peer-key provisioning, environment precedence, fail-closed invalid/missing/retired credentials and three narrowly permitted peer endpoints (`server/ha_key.js`, HA routes, index and sync engine). [HA provisioning](HA_SECRET_PROVISIONING.md). Historical ZIP credentials require coordinated operator rotation; deleting source does not revoke them. Replication ordering/deduplication and rollback connection lifecycle remain deferred.

Optional LAN Hub supports authenticated local WebSockets, scan state and a separate SQLite queue; PWA IndexedDB is another queue/cache mechanism. Real replay authentication/defaults/per-item acknowledgements and outage/restart recovery remain deferred integration limits. Do not advertise universally ordered/lossless fallback from a transport PING test.

## Production requirements and honest gaps

Provision production mode, independently random 64+ hex session/hub secrets, disabled Live Studio, trusted TLS, appropriate network/origin restrictions, reviewed accounts and secured consistent backups. Boot enforcement rejects missing/short/recognized placeholders, not all low-entropy values. Public demos are also seeded in production; ghost seeding is non-production only, and mode changes do not remove existing accounts.

Only current maintained 3.7.2 is covered by the policy unless Doug documents otherwise. Feature freeze does not end risk-based security maintenance. Remaining dependency advisories need reachability assessment and narrow compatible patches with regressions; no blanket forced upgrades.

No formal SOC2/ISO security certification, all-route isolation proof, fully validated physical outage/restart or paired-server recovery is claimed. Migration 047 coverage and zero-coverage invariant PASS are also deferred. See [validation evidence](SECURITY_MAINTENANCE_VALIDATION.md) and [threat model](THREAT_MODEL.md).

## Browser inactivity behavior

The React App implements a 15-minute inactivity timer, a warning during the last minute, and client logout. Client logout makes a best-effort shift-log lock request before clearing the cookie/local session state. This UI timer is separate from the server JWT's 7-day absolute expiry and does not revoke a copied token. Browser sleep, closed clients and failed requests are not a server-enforced inactivity/revocation guarantee.
