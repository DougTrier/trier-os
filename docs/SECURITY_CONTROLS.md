# Trier OS — Security Controls Reference

This document maps Trier OS security implementations to SOC2 Trust Service Criteria.
It is not a claim of SOC2 certification. It is a factual inventory of controls in place,
organized so that security reviewers and enterprise evaluators can assess posture without
reading source code.

All controls are implemented in the listed files. Line numbers reference v3.6.1.

---

## CC6 — Logical and Physical Access Controls

### CC6.1 — Access Restriction to Data and Systems

**Parameterized queries (SQL injection prevention)**
All database access uses `better-sqlite3` prepared statements. User input is never
interpolated into SQL strings. Mass-assignment filtered via `server/utils/sql_sanitizer.js`,
which validates payload keys against live `PRAGMA table_info()` before write.

**Plant scoping (multi-tenant isolation)**
Every HTTP request carries an `x-plant-id` header validated by middleware before any route
handler runs. The validated plant ID is stored in AsyncLocalStorage and used to resolve the
correct SQLite database. It is never taken from `req.body`. Routes cannot access a different
plant's data regardless of what the client sends.

**Route-level authorization**
`server/middleware/auth.js` enforces three layers before any route handler runs:
1. JWT token validity and `tokenVersion` freshness check
2. Enterprise path protection (IT Admin / Creator only for admin routes)
3. Plant jail enforcement — non-admin users cannot write to plants they have no assigned role for

**Feature flags**
Per-user capabilities (`CanImport`, `CanSensorConfig`, `CanViewAnalytics`, etc.) stored in
`auth_db.sqlite`. Creator and IT Admin auto-granted all flags. Granular control for other roles.

---

### CC6.2 — User Registration and Access Provisioning

**Role-based access control (RBAC)**
Eight roles: `technician`, `operator`, `manager`, `plant_manager`, `maintenance_manager`,
`general_manager`, `it_admin`, `creator`. Defined in `server/middleware/auth.js`.
Plant-specific role overrides stored in `UserPlantRoles` table — a user can be a technician
at one plant and a manager at another.

**LDAP / Active Directory integration**
`server/routes/ldap.js` supports full AD sync with configurable search filter (RFC 4515
escaped), TLS, group-to-role mapping, and automatic user provisioning. LDAP failure falls
back to local bcrypt auth. Protected system accounts (`admin`, `it_admin`, `trier`) always
use local auth regardless of LDAP config.

**Session revocation via TokenVersion**
Every JWT includes a `tokenVersion` claim matched against the current DB value on every
request (`server/middleware/auth.js` lines 80–95). Password changes, role edits, and admin
resets all increment `tokenVersion`, instantly invalidating all existing sessions for that
user. There is no need to wait for JWT expiry.

**JWT implementation**
Signed with `JWT_SECRET` (64+ hex chars). 7-day expiry. Claims include `UserID`, `Username`,
`globalRole`, `plantRoles`, `tokenVersion`, and feature flags. In production, server exits
at boot if `JWT_SECRET` is missing, weak (< 32 chars), or set to a known placeholder value
(`server/index.js` lines 65–96).

---

### CC6.3 — Authentication

**Password hashing**
bcrypt, 10 rounds. Applied to all user accounts including ghost/demo accounts in development.
Creator account password is 16 random bytes (hex) generated per deployment — no default
shared password (`server/auth_db.js` line 127).

**Session cookies**
`httpOnly: true` — invisible to JavaScript, blocks XSS exfiltration.
`Secure` flag set when served over HTTPS (`req.secure`).
`SameSite: Lax` — blocks cross-origin state-changing requests (CSRF mitigation).
Cookie cleared on logout (`res.clearCookie` with matching flags).

**Two-Factor Authentication (TOTP)**
Creator account requires TOTP (RFC 6238, compatible with Google Authenticator / Authy /
Microsoft Authenticator). Flow: password verified → pre-auth token (5-min TTL) issued →
TOTP code submitted → full session token issued. Controls:
- 5 failed TOTP attempts per pre-auth token before lockout
- TOTP replay cache: same delta rejected within 90 seconds
- Secret stored AES-256-GCM encrypted in `trier_logistics.db`

---

### CC6.4 — Restriction of Unauthorized Access

**Rate limiting — login**
8 attempts per 5 minutes per username (not per IP — factory floors NAT behind one address).
Configurable via `RATE_LIMIT_LOGIN_MAX` env var. (`server/index.js` lines 424–428)

**Rate limiting — sensors**
1,000 requests per 60 seconds keyed on plant + sensor identity. Prevents a chatty PLC from
exhausting the API budget for all users. Falls back to IP if sensor identity is malformed.

**Rate limiting — general API**
1,200 requests per 60 seconds per authenticated user. Falls back to IP for unauthenticated.

**Request timeout**
120-second wall-clock timeout on all requests (`server.requestTimeout`). Prevents slow-loris
attacks and stuck route handlers. (`server/index.js` lines 2091–2101)

---

### CC6.5 — Change Management

**Live Studio access control**
In-app code editor restricted to `creator` role only. All file writes are to a whitelist of
paths (`src/components`, `server/routes`). Core infrastructure files (`vite.config.js`,
`package.json`, `server/index.js`) cannot be overwritten via Studio.

Every deploy is recorded in `StudioDeployLedger` (append-only, in `trier_logistics.db`):
deployer, branch, commit SHA, stable tag, build status, build log, start/end timestamps.
Deploy pipeline: stage → commit sandbox branch → `npm run build` (120s timeout) → auto-tag
`stable-YYYY-MM-DD` → optional PM2 reload. Revert rolls back to last stable tag.

**Gatekeeper change control (safety-critical systems)**
`server/gatekeeper/engine.js` enforces a 7-step validation pipeline for any change touching
safety-critical equipment: Permit to Work (PTW) validation, Management of Change (MOC) state
check, constraint certification with SHA-256 proof receipts. All decisions appended to
`GatekeeperAuditLedger`.

---

## CC7 — System Operations

### CC7.1 — Vulnerability and Threat Detection

**Audit trail middleware**
`server/middleware/auditTrail.js` guarantees at least one audit record for every successful
POST/PUT/PATCH/DELETE request, even if the route handler doesn't explicitly call `logAudit`.
Coverage verified across 67 DELETE endpoints and 41 route files (v3.6.1).

Each record includes: `UserID`, `Username`, `Action`, `PlantID`, `Details` (JSON), `Severity`,
`IPAddress`, `Timestamp`. Written to `AuditLog` in `trier_logistics.db`. Secondary filesystem
write on DB failure — audit is never silently lost.

**Sensor threshold monitoring**
`server/routes/sensors.js` evaluates every inbound reading against configured thresholds.
Breach triggers automatic work order creation with templated description. 30-minute cooldown
(configurable) prevents duplicate WOs from chatty sensors. All threshold events flagged in
`sensor_readings`.

### CC7.2 — Monitoring of System Components

**System diagnostics**
`GET /api/creator/diagnostics` (Creator only): DB sizes, connection counts, server uptime,
memory usage. `GET /api/creator/audit`: full cross-plant audit log (last 500 entries).

**ERP outbox health**
`GET /api/integrations/outbox/summary`: counts pending/sent/failed events and age of oldest
pending. Surfaces integration delivery problems before they become data gaps.

### CC7.4 — Incident Response

**Audit log access**
Full cross-plant audit log accessible to Creator and IT Admin via `GET /api/creator/audit`.
Immutable — no route provides audit log deletion.

**Manual retry**
`POST /api/integrations/outbox/retry/:id` allows manual re-queue of failed ERP delivery
events without data loss or re-entry.

---

## CC9 — Risk Mitigation

### CC9.1 — Encryption in Transit

TLS priority order (auto-detected at boot):
1. Let's Encrypt certificate (if present from `scripts/certbot_setup.js`)
2. Custom CA-signed certificate in `data/certs/`
3. Auto-generated self-signed certificate (RSA 2048)

HTTPS server on port 1938. HTTP on port 1937 for development only.
HSTS header applied only on HTTPS responses (prevents TLS-strip attacks on downgrade).
Mobile camera and scanner APIs require HTTPS — enforced by browser WebRTC policy.

### CC9.2 — Encryption at Rest

Sensitive fields stored AES-256-GCM encrypted in SQLite:
- TOTP secret (`creator_settings.totp_secret` in `trier_logistics.db`)
- SMTP password (`creator_settings.smtp_pass`)

Key derivation: SHA-256 of `JWT_SECRET`. Format: `iv_hex:tag_hex:ciphertext_hex`.
Decryption occurs only at point of use (TOTP verify, email send) — plaintext never persisted.

**Note on key rotation:** Rotating `JWT_SECRET` invalidates all encrypted fields. A migration
path for key rotation is documented in code comments and is a planned tooling addition.

---

## A1 — Availability

### A1.1 — Availability Commitments

**HA replication**
`server/ha_sync.js`: unidirectional SQLite trigger-based replication from primary to secondary.
SQLite triggers capture every INSERT/UPDATE/DELETE on operational tables into `sync_ledger`.
Drain runs every 60 seconds. `POST /api/ha/promote` for failover. Auth via `HA_SYNC_KEY`
(separate 64-char hex key, distinct from JWT).

**LAN Hub fallback**
`server/lan_hub.js`: lightweight WebSocket server embedded in the Electron desktop app at
each plant (port 1940). When central server is unreachable, all plant devices connect to the
hub. Scans queued in local SQLite `OfflineScanQueue`. On central server return, hub replays
the full queue to `POST /api/scan/offline-sync` preserving `deviceTimestamp` order.
JWT-authenticated on WebSocket upgrade — expired or invalid tokens refused with code 1008.

**Client-side offline queue**
IndexedDB `OfflineDB` on every PWA client. Captures scans during hub or full offline state.
On reconnect, queue drains with dedup guard (`SYNC_PENDING`/`SYNC_ACK` protocol) to prevent
double-replay.

### A1.2 — Environmental Protections

**Silent auto-close engine**
`server/silent_close_engine.js`: hourly cron detects work segments left open past the
auto-review threshold (default 12 hours). Closes as `TimedOut`, flags parent WO for
supervisor review (`needsReview=1`, `reviewReason='SILENT_AUTO_CLOSE'`). Exempt hold
reasons (`WAITING_ON_PARTS`, `WAITING_ON_VENDOR`, `WAITING_ON_APPROVAL`, `SCHEDULED_RETURN`)
are never auto-closed. Does not overwrite an existing `reviewReason`.

---

## Secrets Checklist (Production Deployment)

| Secret | Requirement | Behavior if Missing |
|---|---|---|
| `JWT_SECRET` | 64+ hex chars | Server exits at boot |
| `HUB_TOKEN_SECRET` | 64+ hex chars, ≠ JWT_SECRET | Server exits at boot |
| `NODE_ENV=production` | Must be set | Security paths not hardened |
| `HA_SYNC_KEY` | 64-char hex | HA replication disabled |
| `DISABLE_LIVE_STUDIO` | Recommended | Live Studio API surface exposed |

---

## Known Gaps (Honest Assessment)

| Gap | Risk | Notes |
|---|---|---|
| JWT_SECRET rotation invalidates encrypted fields | Medium | Key rotation requires migration tooling (planned) |
| No formal SOC2 audit | High (for regulated buyers) | Controls are equivalent; audit not yet performed |
| No SSO / SAML / OIDC | Medium | LDAP covers AD; SAML roadmap item |
| Demo accounts with public password | Low | Gated behind `NODE_ENV !== production` |
| No secrets vault integration | Low | `.env` file; Vault/AWS Secrets Manager integration is roadmap |
| LDAP search filter (RFC 4515 escaped, not library-parameterized) | Low | Escaping is correct; library-level parameterization would be stronger |
