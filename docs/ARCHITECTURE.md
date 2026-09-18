# Trier OS architecture — 3.7.2

Trier OS is a feature-complete industrial operations system for one organization, deployed as **one corporate instance at headquarters**. All plants connect to that instance. Cross-plant search is intentional; this is not a mutually isolated SaaS tenancy model. The source is MIT licensed; see [maintenance policy](MAINTENANCE.md).

## Intended deployment

```text
Plant browsers / phones / scanners
    └── corporate HQ: React UI + Node/Express API
          ├── server/index.js (or server/cluster.js supervisor)
          ├── trier_auth.db: identities / roles / TokenVersion
          ├── trier_logistics.db: shared operational / audit data
          ├── corporate_master.db: corporate master data / aggregation
          ├── one SQLite file per plant
          └── schema_template.db: plant provisioning template

Optional plant fallback: LAN Hub :1940 + local DB/cache/scan queue
Optional corporate secondary: HA replication / controlled promotion
```

The HQ per-plant DBs are authoritative operational files. A plant-local DB/cache is fallback data, not a separate corporate rollout. Optional integrations need their configured connectivity; the core does not require a hosted SaaS service.

**Packaging distinction:** `electron/main.js` starts `server/index.js` as a child process on its host, sets production mode and disables Live Studio, then opens the embedded UI at HTTPS port 1938 (HTTP port 3000 is used for readiness). The Windows distributions bundle the existing OpenSSL certificate-generation prerequisite; keys are generated per installation, not distributed. OpenSSL retains its separate Apache-2.0 license. It is not automatically a thin client pointed at a remote HQ. `server/index.js` starts the LAN Hub for `ELECTRON_EMBEDDED=true` or `LAN_HUB_ENABLED=true` and currently gives it the local API URL. Operators must verify actual client/back-end routing and fallback configuration against the single-HQ deployment model; installing independent default Electron packages at every plant does not establish that topology.

## Data routing

The resolved data directory is selected by `server/resolve_data_dir.js`; source installations normally use `data/`, and packaged paths/`DATA_DIR` can differ. Authentication uses `trier_auth.db`, not a root `auth_db.sqlite`.

Middleware validates authentication/plant selection and sets AsyncLocalStorage. Ordinary plant routes call the exported database helper without constructing a client-selected path. `getDb()` also supports explicit internal selectors; do not pass unvalidated request fields directly to it. In demo context, its explicit-selector guard rejects selection outside `examples`. In production a missing implicit plant context throws rather than silently falling back.

`all_sites` is a virtual corporate selection. Its generic DB handle is read-only template/fallback data; aggregate endpoints separately enumerate/query plant or corporate data. It is not an independently writable all-sites plant DB. `corporate_master.db` has provisioning/crawl/write paths and is not a universally read-only boot-generated view. Shared logistics data needs explicit plant/ownership filtering appropriate to each route.

## Authentication and authorization

Browser sessions use the HttpOnly `authToken` cookie, signed by `JWT_SECRET`, with a 7-day absolute expiry. JWT claims include `UserID`, `Username`, `globalRole`, `plantRoles`, `nativePlantId`, `tokenVersion` and feature flags. A separate 24-hour localStorage hubToken is signed by `HUB_TOKEN_SECRET`. Appropriate integration routes can accept a valid Bearer session JWT. Creator TOTP is optional when enrolled/enforced; the 5-minute pre-2FA challenge is rejected by generic protected API auth. Logout clears the cookie without revoking a copied token. See [SECURITY.md](../SECURITY.md).

Role/feature permissions and plant write permissions are enforced server-side. Ordinary authorized staff cross-plant reads/search remain supported. The public demo identities are a separate low-trust class: only `examples`, no foreign/all-sites selectors, and actual shared floorplan/nested-object ownership checks. UI tiles and plant selectors are not the authorization boundary.

## Offline and HA limits

PWA IndexedDB and the optional hub's local `OfflineScanQueue` are separate mechanisms. The hub authenticates WebSockets with the hub secret and submits replay with HMAC headers. Current startup passes the hub secret into that replay path, while the scan route verifies its replay HMAC using the session secret; routing/authentication and acknowledgement recovery remain deferred integration review items. Do not describe a real queue drain as proved by an authenticated WebSocket PING test.

HA replicates toward a secondary corporate host; explicit peer-secret provisioning is separate from browser auth. Ordering/deduplication and rollback pooled-connection lifecycle remain deferred, and paired-server recovery is not fully validated. No universal zero-loss guarantee is made. See [HA provisioning](HA_SECRET_PROVISIONING.md) and [validation limits](SECURITY_MAINTENANCE_VALIDATION.md).

## Repository map

| Path | Purpose |
|---|---|
| `src/` | React UI, hooks, translations and client queues |
| `server/` | API, authentication, DB routing and operational engines |
| `data/` | Source-install SQLite files and protected operational configuration |
| `electron/` | Embedded-server desktop packaging |
| `public/` | Static product assets |
| `tests/e2e/` | Live-instance browser regressions |
| `docs/` | Architecture, security, installation and operational documentation |

See [database reference](DATABASE_SCHEMA.md), [system traces](SYSTEM_TOPOLOGY.md) and [invariant definitions](ARCHITECTURE_INVARIANTS.md).

## Browser inactivity behavior

The React App implements a 15-minute inactivity timer, a warning during the last minute, and client logout. Client logout makes a best-effort shift-log lock request before clearing the cookie/local session state. This UI timer is separate from the server JWT's 7-day absolute expiry and does not revoke a copied token. Browser sleep, closed clients and failed requests are not a server-enforced inactivity/revocation guarantee.
