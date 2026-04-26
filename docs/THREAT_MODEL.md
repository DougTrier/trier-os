<!-- Copyright © 2026 Trier OS. All Rights Reserved. -->

# Trier OS — Threat Model

**Audience:** Enterprise and OT security reviewers, IT administrators, and security architects evaluating Trier OS for deployment in industrial environments.

**Version:** v3.6.0
**Last reviewed:** 2026-04-26

See also: `server/standards.md` (coding security rules), `SECURITY.md` (deployment hardening checklist and CORS trust boundary), `CONTRIBUTING.md` (header standard).

---

## 1. Overview

This document describes the assets Trier OS protects, the trust boundaries in the deployment architecture, known threat scenarios and their mitigations, and the assumptions required for the stated mitigations to hold.

Trier OS is deployed as a single corporate server instance. It is not SaaS, not multi-tenant across organizational boundaries, and not cloud-hosted. All network exposure is intranet-only by design. This document does not cover network perimeter defense, endpoint OS hardening, or physical access controls — those are out of scope and are called out explicitly in Section 10.

---

## 2. Assets Protected

| Asset | Description | Storage Location |
|---|---|---|
| Work order and maintenance records | Active and historical WOs, PM schedules, labor records | Per-plant SQLite DB (`Plant_N.db`) |
| Asset registry | Equipment inventory, criticality scores, specifications | Per-plant SQLite DB |
| Safety permits | LOTO, PTW, MOC permits — legally significant in industrial jurisdictions | `trier_logistics.db` |
| Audit trail | All write-path operations: who, what, when, per plant | `trier_logistics.db` (`AuditLog` table) |
| Quality control records | Inspections, non-conformances, disposition decisions | Per-plant SQLite DB |
| Contractor records | Contractor profiles, qualifications, insurance records | `trier_logistics.db` |
| User accounts and credentials | Hashed passwords, JWT signing key, role assignments | `auth_db.sqlite` |
| LAN hub connection token secret | Signs WebSocket upgrade tokens for plant-floor scanner devices | Environment variable (`HUB_TOKEN_SECRET`) |
| Predictive maintenance and sensor data | Readings, thresholds, trend history | Per-plant SQLite DB |
| Energy monitoring data | Consumption logs, cost allocations | Per-plant SQLite DB |
| Compliance documents and SOPs | Procedure documents, acknowledgment records | Per-plant SQLite DB |

---

## 3. Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│  INTERNET                                                           │
│  (untrusted — no Trier OS surface is exposed here by design)        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  FIREWALL   │
                    │  (customer- │
                    │  managed)   │
                    └──────┬──────┘
                           │  Private intranet only
          ┌────────────────▼─────────────────────┐
          │  CORPORATE SERVER                    │
          │  Node.js / Express (single instance) │
          │  ├── trier_logistics.db              │
          │  ├── corporate_master.db             │
          │  ├── auth_db.sqlite                  │
          │  ├── Plant_1.db                      │
          │  ├── Plant_2.db  ...                 │
          │  └── schema_template.db              │
          │                                      │
          │  Trust level: AUTHENTICATED ONLY     │
          │  All routes require valid JWT except  │
          │  /api/auth/login and /api/health      │
          └──────────────────┬───────────────────┘
                             │  Plant WAN/LAN segment
          ┌──────────────────▼───────────────────┐
          │  PLANT LAN  (per physical location)  │
          │  RFC 1918 address space              │
          │  192.168.x.x / 10.x.x.x /           │
          │  172.16–31.x.x                       │
          │                                      │
          │  Trust level: RFC 1918 origin        │
          │  (CORS allows; JWT still required)   │
          └──────┬───────────────────────────────┘
                 │
          ┌──────▼──────────────────────────────┐
          │  LAN HUB  (port 1940, WebSocket)    │
          │  Electron app — one per plant        │
          │  ├── Offline scan state cache        │
          │  ├── Local plant DB read-only copy   │
          │  └── Replay queue → POST /offline-   │
          │       sync on reconnect              │
          │                                      │
          │  Trust level: UNTRUSTED INPUT        │
          │  JWT validated on WS upgrade;        │
          │  message payloads treated as         │
          │  untrusted (Rule A-6)                │
          └──────┬──────────────────────────────┘
                 │  Local plant LAN only (no internet path)
          ┌──────▼──────────────────────────────┐
          │  SCANNER DEVICES                    │
          │  Mobile / Zebra / browser clients   │
          │  ├── IndexedDB offline queue         │
          │  └── QR tag scan → WS to LAN Hub    │
          │       or HTTP to Corporate Server    │
          │                                      │
          │  Trust level: AUTHENTICATED DEVICE  │
          │  Per-device: JWT required for all    │
          │  API calls; hub token separate       │
          └─────────────────────────────────────┘
```

**Key boundary properties:**

- **Internet → Corporate Server:** No path exists by design. Trier OS carries no internet-facing listener. Exposing the server to the internet is a customer infrastructure decision and is explicitly not supported or recommended.
- **Corporate Server → Plant LAN:** The server is the authority. Plants do not run their own Trier OS server instance. LAN Hub is a lightweight relay only.
- **Plant LAN → LAN Hub:** Hub validates JWTs on WebSocket upgrade. All hub message payloads are treated as untrusted input regardless of origin IP.
- **LAN Hub → Corporate Server:** Offline replay authenticates with the hub token, which is signed by `HUB_TOKEN_SECRET` — a separate secret from `JWT_SECRET`. A stolen browser/localStorage JWT cannot be replayed against the hub.

---

## 4. Threat Scenarios

| Threat | Likelihood | Mitigation |
|---|---|---|
| **SQL Injection** — attacker submits malicious SQL via API request body or query parameter | Low | All queries use `better-sqlite3` prepared statements with bound parameters. Template literal SQL interpolation is prohibited by Rule S-4. Column names for dynamic queries must pass `SAFE_TABLE_NAME` regex whitelist before use. Periodic grep audits enforced. |
| **Stolen JWT cookie** — attacker extracts session token from a compromised device or XSS | Medium (shared plant-floor devices) | JWT stored in `httpOnly` cookie — inaccessible to JavaScript, browser extensions, and DevTools. `SameSite=Lax` blocks cross-origin POST/PATCH/DELETE. Cookie has `Secure` flag enforced on HTTPS. Short session TTL. Logout clears cookie server-side. |
| **Malicious plantId traversal** — attacker passes `../../etc/passwd` or an arbitrary DB filename as the plant identifier | Low | `plantId` validated against `SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/` at the route boundary (Rule S-1) before being passed to `getDb()`. `getDb()` additionally applies its own sanitization. Path traversal structurally impossible: DB files are resolved via `AsyncLocalStorage` context set by middleware — client input never directly opens a file. |
| **LAN hub token replay** — attacker captures a hub WebSocket token and replays it against the corporate API | Low | Hub tokens are signed with `HUB_TOKEN_SECRET`, which is required to differ from `JWT_SECRET` and must be 64+ hex characters. The corporate API auth middleware validates token type; a hub token is rejected on main API routes. Server exits on startup if `HUB_TOKEN_SECRET` is missing, weak, or equal to `JWT_SECRET`. |
| **Live Studio abuse** — attacker uses the embedded Monaco IDE to read arbitrary server files or execute code | Low (if properly configured) | `DISABLE_LIVE_STUDIO=true` removes the Live Studio API surface entirely in production. When enabled in development, file path access requires `path.resolve()` + null-byte check + extension validation before any `fs` operation (Rule S-1). This must not be enabled in production. |
| **AI boundary bypass** — attacker attempts to use the AI chat interface to issue unauthorized DB writes or extract data across plant boundaries | Low | The AI chat interface is human-mediated. The AI does not have autonomous write access to any database. It surfaces recommendations and answers; all resulting actions require a human to explicitly trigger the corresponding API call through the normal authenticated route. There is no mechanism for the AI to directly write records. |
| **Offline queue tampering** — attacker modifies IndexedDB scan queue on a compromised device to inject false scan records | Medium (physical device access) | Offline queue contents are submitted via `POST /api/scan/offline-sync` using the device's JWT. Each replayed scan must pass the same route validation as a live scan: asset existence check, valid scan state machine transition, parameterized writes. A UNIQUE INDEX on `ScanAuditLog.scanId` (Rule S-11) prevents duplicate injection. Status update and WO creation are in the same database transaction (Rule S-9); a partial write cannot create a WO without the corresponding audit record. |
| **Unauthorized plant DB access** — authenticated user from Plant A attempts to access Plant B data | Low | Plant DB context is set by middleware via `AsyncLocalStorage` using the `x-plant-id` header. The header value is validated against the authenticated user's plant assignment before context is set. `db()` resolves to the validated plant DB — not to any path derived from raw client input. A user authenticated to Plant A cannot get the Plant B DB context regardless of what `x-plant-id` they submit. |
| **Unauthorized cross-plant data exfiltration via logistics DB** — authenticated user queries LOTO/audit records for plants they do not manage | Medium | Routes that query `trier_logistics.db` must explicitly filter by `PlantID` (Rule A-2). Role-based access control enforced by `authMiddleware` restricts cross-plant reads to corporate admin roles. Audit log entries record every write with `req.user.Username`, plant ID, timestamp. |
| **Brute-force login** | Medium | Login endpoint rate-limited to 8 attempts per 5 minutes per username by default. `RATE_LIMIT_LOGIN_MAX` must not be set to elevated values in production. |
| **Ghost/demo account exploitation** — attacker uses test credentials left active in production | Low (if hardened) | Ghost accounts (`ghost_tech`, `ghost_admin`, `ghost_exec`) are not seeded when `NODE_ENV=production`. Demo accounts use a public password (`TrierDemo2026!`) and are restricted to the `examples` plant — they cannot access real plant data. Must be removed from customer-facing deployments. |
| **SSRF via outbound HTTP** — attacker causes the server to make requests to internal services | Low | Outbound HTTP calls validate destination URL with `new URL()` parse and block private/loopback IP ranges (`127.x`, `10.x`, `172.16-31.x`, `192.168.x`, `::1`, `169.254.x`) before any request is made (Rule S-6). |
| **Duplicate WO injection via concurrent replay** — two replay processes submit the same offline scan simultaneously | Low | Reentrance guard (`_replayInProgress` boolean) prevents concurrent `replayToServer` invocations in `lan_hub.js` (Rule S-8). UNIQUE INDEX on `ScanAuditLog.scanId` is the final backstop (Rule S-11). |

---

## 5. LAN Scanner Assumptions

The following trust assumptions are extended to devices on the plant LAN. Security reviewers should confirm these assumptions are met by the physical and network environment.

**What Trier OS trusts about plant-LAN devices:**

1. **Device authentication, not device identity.** Trier OS does not trust a device because it is on the LAN. It trusts a device because it holds a valid JWT signed by `JWT_SECRET`. Any device on the LAN without a valid JWT receives a 401 on all protected routes.

2. **CORS is relaxed for RFC 1918 origins.** By default, any browser session originating from a `192.168.x.x`, `10.x.x.x`, or `172.16–31.x.x` address passes CORS. This is a deliberate operational decision (scanner devices receive dynamic DHCP addresses; per-device origin registration is not operationally feasible). The JWT requirement is not relaxed alongside CORS.

3. **LAN Hub messages are untreated.** The hub validates the JWT on WebSocket upgrade but does not vouch for the content of individual messages. Every hub message payload is validated by the same input rules as direct HTTP requests (Rule A-6). A compromised device that holds a valid JWT can submit malformed payloads — these are rejected at the validation layer, not silently accepted.

4. **Physical QR tag integrity is assumed.** Trier OS cannot detect a forged or substituted QR tag at the scanner. A device that scans a legitimate-looking QR code for a non-existent or wrong asset receives an error from the route; it does not silently create records for an unknown asset.

**What Trier OS does NOT assume:**

- That all devices on the plant LAN are managed or trustworthy.
- That the plant LAN is isolated from untrusted segments (this must be enforced at the network layer).
- That a device holding a valid JWT has not been compromised at the OS level. Endpoint device management is out of scope.

---

## 6. Offline Queue Risks and Mitigations

Scanner devices maintain an IndexedDB queue for scans captured when the corporate server is unreachable. On reconnect, the LAN hub drains this queue via `POST /api/scan/offline-sync`.

**Risks:**

- **Queue contents are stored on the device.** IndexedDB is accessible to JavaScript on the device. A compromised device or a malicious browser extension running on a shared plant-floor device could modify queue entries before replay.
- **Replay delay.** A scan captured offline and replayed hours or days later carries a stale timestamp. The audit trail records the original scan time (device-reported) alongside the replay time. Reviewers should treat device-reported timestamps as informational, not authoritative, for forensic purposes.
- **Duplicate replay.** If a device both replays itself and the hub concurrently replays the same queue entry, a duplicate submission is possible at the transport layer.

**Mitigations in place:**

- All replayed scans are validated by the same route logic as live scans: asset existence, state machine validity, parameterized writes.
- UNIQUE INDEX on `ScanAuditLog.scanId` (Rule S-11) ensures that a scan ID can only be committed once regardless of how many times the same entry is replayed. The second insert raises a constraint error; the route returns a DUPLICATE status for that item.
- WO creation and queue status update are in the same database transaction (Rule S-9). A crash between the WO write and the queue mark cannot leave the queue in a state that causes a duplicate WO on the next replay.
- The hub's `replayToServer` is guarded by `_replayInProgress` (Rule S-8) to prevent concurrent drain from a single hub instance.
- The `SYNC_COMPLETE` protocol (Rule S-10): a device sends an explicit completion message after successfully pushing its queue to the server. The hub removes those entries from its retry pool without waiting for a timeout. This closes the window where both the device and hub attempt the same submission.
- Per-item result inspection (Rule S-7): the hub inspects individual result statuses in the server response. Only items with a successful per-item status are marked synced. Items that failed at the server remain in the queue for operator visibility or manual resolution.

---

## 7. Live Studio Risks and Mitigations

Live Studio embeds a Monaco IDE in the Trier OS UI, intended for development and simulation authoring.

**Risks:**

- File system read access: the Live Studio API can read files from the server filesystem within the configured root. A misconfigured or exploited endpoint could expose server-side code or configuration files.
- Code execution surface: Live Studio is a development tool. It provides capabilities that are inappropriate in a production manufacturing environment.
- Expanded attack surface: any enabled IDE-related route is an additional entry point.

**Mitigations:**

- **`DISABLE_LIVE_STUDIO=true` is required in production.** This environment variable strips all Live Studio routes from the API surface at startup. No Live Studio endpoints are reachable when this flag is set. This is not optional for production deployments.
- When enabled in development, file path handling follows Rule S-1: `path.resolve()`, null-byte rejection, and extension validation are applied before any `fs` operation.
- Live Studio routes are authenticated — they require a valid JWT with appropriate role. There is no anonymous access path.

**Security reviewers should verify** that `DISABLE_LIVE_STUDIO=true` is set in the production environment before signing off on deployment. This is a hard requirement.

---

## 8. AI Boundary

Trier OS includes an AI chat interface for surface operations guidance (maintenance recommendations, SOP lookup, anomaly flagging).

**What the AI can do:**

- Answer questions using data retrieved by the server on behalf of the authenticated user.
- Surface recommendations, flag anomalies, and summarize records.
- Render output in the UI.

**What the AI cannot do:**

- Write directly to any database. There is no API path from the AI inference layer to a DB write method.
- Initiate any action autonomously. All actions resulting from AI recommendations require a human to explicitly trigger the corresponding UI interaction, which then calls the normal authenticated route.
- Access data outside the authenticated user's plant scope. AI queries are executed under the same `AsyncLocalStorage` plant context as any other authenticated request.
- Bypass role-based access control. The AI does not have a privileged identity; it operates as the authenticated user.

**Boundary enforcement:**

The AI boundary is architectural, not just policy. The inference component does not hold a database handle. It requests data through the same route layer that enforces authentication, plant scoping, and parameterized queries. A jailbroken or adversarially prompted AI response that "says" it will write a record cannot write that record — there is no code path for it to do so.

---

## 9. Deployment Hardening Checklist

This checklist must be satisfied before any production deployment. See `SECURITY.md` for full detail on each item.

| Item | Required Action | Failure Mode if Skipped |
|---|---|---|
| `NODE_ENV=production` | Set in `.env` or process environment | Ghost accounts seeded; JWT fail-fast disabled; DB context fallback not hardened |
| `JWT_SECRET` | 64+ random hex characters; must not be the default dev value | Server exits on boot — this is a hard startup check in production |
| `HUB_TOKEN_SECRET` | 64+ random hex characters; must differ from `JWT_SECRET` | Server exits on boot — enforced at startup; if bypassed, LAN hub and API share the same signing secret, collapsing the trust boundary between them |
| `DISABLE_LIVE_STUDIO=true` | Set in production `.env` | Monaco IDE API surface exposed; file read paths accessible to authenticated users |
| Ghost account removal | Set `NODE_ENV=production` (prevents seeding) or manually delete `ghost_tech`, `ghost_admin`, `ghost_exec` via Settings → Accounts & Permissions if upgrading from dev | Known credentials with elevated roles exist in the system |
| Demo account removal | Delete `demo_tech`, `demo_operator`, `demo_maint_mgr`, `demo_plant_mgr` for customer-facing deployments | Accounts with public password `TrierDemo2026!` exist; restricted to `examples` plant but should not be present |
| `DISABLE_LAN_CORS=1` | Set for air-gapped or hardened deployments where all legitimate client origins are known | Any device on the plant LAN subnet can make CORS requests; JWT is still required, but the origin surface is wider than necessary |
| `ALLOWED_ORIGINS` | If `DISABLE_LAN_CORS=1`, populate with explicit allowed origins | All non-listed origins rejected; missing a legitimate client breaks connectivity |
| Login rate limiter | Do not set `RATE_LIMIT_LOGIN_MAX` in production; default is 8 attempts / 5 minutes / username | Brute-force login attacks unconstrained |
| HTTPS / TLS | Terminate TLS at a reverse proxy (nginx, Caddy) in front of Node.js | JWT cookie `Secure` flag has no effect over plaintext HTTP; session tokens transmit in cleartext |
| HA sync key | If using HA replication: `HA_SYNC_KEY` must be a 64-character hex string | Server-to-server replication unauthenticated; secondary can receive data from any caller |
| Database file permissions | `data/*.db` files should be readable only by the Trier OS process user | Any OS-level user on the server host can read all plant data directly from the SQLite files |
| Backup encryption | SQLite DB files should be encrypted at rest in the backup pipeline | A stolen backup file is a plaintext copy of all plant and safety data |

---

## 10. Out of Scope

The following are explicitly not protected by Trier OS itself. These must be addressed at the infrastructure, network, or physical layer by the deploying organization.

**Network perimeter.** Trier OS does not expose any internet-facing listener and assumes it runs behind a firewall. Perimeter defense, VPN segmentation, plant-to-corporate WAN security, and firewall rule management are the customer's responsibility.

**Endpoint OS security.** Trier OS cannot detect or prevent exploitation of the device OS running a scanner client or the server OS hosting the Node.js process. Endpoint detection, device management (MDM), and OS patching are out of scope.

**Physical access.** Trier OS does not control who can physically touch a scanner device, a plant-floor workstation, or the server hardware. A person with physical access to a logged-in device holds whatever session that device has. Physical access controls, screen-lock policies, and device tethering are the deploying organization's responsibility.

**Network-layer isolation.** The `DISABLE_LAN_CORS` flag and the JWT requirement limit which clients can make authenticated API calls, but they cannot prevent a device on the plant LAN from attempting connections. VLAN segmentation between plant-floor device subnets and the corporate server subnet must be configured at the network layer.

**SQLite file-level access.** If an attacker gains OS-level access to the server host, the SQLite database files are accessible directly — bypassing all application-layer controls. Disk encryption, OS user permission hardening, and host intrusion detection are infrastructure-level controls outside Trier OS.

**Certificate management.** TLS termination is handled by a customer-managed reverse proxy. Certificate provisioning, renewal, and trust chain management are out of scope.

**Third-party integrations.** Power BI connectors, CMMS imports, and other integration endpoints that use Bearer token authentication are configured and secured by the customer. Trier OS validates the token on receipt but does not control how tokens are stored or transmitted by the external system.

**Backup and recovery.** Trier OS does not include backup tooling. Database file backup, encryption of backup archives, and recovery procedures are the deploying organization's responsibility.
