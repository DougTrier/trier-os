# Security Policy

## Supported Versions
Security updates are strictly provided for the latest major version of Trier OS.

| Version | Supported          |
| ------- | ------------------ |
| 3.5.x   | :white_check_mark: |
| 3.4.x   | :white_check_mark: |
| < 3.4.0 | :x:                |

## Reporting a Vulnerability

**DO NOT OPEN A PUBLIC ISSUE FOR A SECURITY VULNERABILITY.**

Trier OS is an enterprise-grade Industrial Operating System governing physical manufacturing assets. Public disclosure of a zero-day exploit places real-world industrial infrastructure at immediate risk of failure or attack.

If you discover a vulnerability, please adhere strictly to the following protocol:

1. **Open a Private Advisory:** Go to [https://github.com/DougTrier/trier-os/security/advisories/new](https://github.com/DougTrier/trier-os/security/advisories/new) and submit a private security advisory. Only you and the reporter can see it.
2. **Details Required:** Please provide explicitly detailed steps to reproduce the exploit within the Trier OS Sandbox (`npm run dev:full`), the specific file path of the vulnerability, and (if applicable) a suggested architectural mitigation.
3. **Response SLA:** The Core Engineering Team will acknowledge receipt of your vulnerability report within 48 hours and outline an expected timeline for deploying a patch.

We take the security of manufacturing networks seriously and appreciate your responsible disclosure to keep the industrial sector safe.

---

## Authentication Architecture

Trier OS uses httpOnly cookie-based authentication for browser sessions.

| Property | Value |
|---|---|
| Token type | Signed JWT |
| Storage | `httpOnly` cookie — invisible to JavaScript |
| Cookie flags | `HttpOnly`, `SameSite: Lax`, `Secure` (on HTTPS), `Path: /` |
| Session check | `GET /api/auth/me` on page load |
| Logout | `POST /api/auth/logout` — clears cookie server-side |
| CSRF | `SameSite: Lax` blocks cross-origin POST/PATCH/DELETE; sufficient for private intranet deployment |

**Why httpOnly cookies?**
Tokens in `localStorage` are readable by any JavaScript on the page (XSS, browser extensions, DevTools on shared plant-floor machines). An httpOnly cookie is never exposed to JavaScript — it cannot be read, copied, or exfiltrated by a script.

**API integrations** (Power BI, http-edge-agent, HA sync agents) are not browser sessions and cannot use cookies. They pass the JWT as a `Bearer` token in the `Authorization` header. The auth middleware accepts both paths and falls back gracefully.

---

## Production Deployment Hardening

Before going live, verify each item below:

| Item | Action |
|---|---|
| `NODE_ENV=production` | Set in `.env`. Enables JWT fail-fast, suppresses ghost account seeding, and hardens the DB context fallback. |
| `JWT_SECRET` | Must be 64+ random hex characters. Server exits on boot if missing or weak in production. |
| Ghost test accounts | Set `NODE_ENV=production` — `ghost_tech`, `ghost_admin`, and `ghost_exec` are **not seeded** in production. If upgrading an existing install, delete these accounts manually via Settings → Accounts & Permissions. |
| Demo accounts | `demo_tech`, `demo_operator`, `demo_maint_mgr`, `demo_plant_mgr` use a public password (`TrierDemo2026!`) and are bound to the `examples` plant only. They cannot access real plant data but should be removed from customer-facing deployments. |
| Login rate limiter | Default is 8 attempts per 5 minutes per username. For parallel E2E environments only, set `RATE_LIMIT_LOGIN_MAX=500` in `.env`. Never set this in production. |
| `DISABLE_LIVE_STUDIO` | Set `DISABLE_LIVE_STUDIO=true` in production builds to strip the Monaco IDE from the API surface. |
| `HUB_TOKEN_SECRET` | Must be 64+ random hex characters, distinct from `JWT_SECRET`. Server exits on boot if missing, weak, or equal to `JWT_SECRET`. Signs the LAN-hub WebSocket token so a localStorage leak cannot be replayed against the main API. |
| `DISABLE_LAN_CORS` | Set `DISABLE_LAN_CORS=1` for air-gapped or hardened deployments. See the CORS trust-boundary section below. |

---

## CORS Trust Boundary

By default Trier OS accepts CORS requests from any origin whose hostname is an RFC1918 private address — `192.168.*.*`, `10.*.*.*`, and `172.16–31.*.*`. This is a deliberate trust-boundary decision to support the factory deployment model:

- Plant-floor mobile scanners connect from phones/tablets whose IP changes with the DHCP lease.
- Per-device origin registration would be operationally impossible at scale.
- Cookies still use `SameSite=Lax`, which blocks cross-origin POST/PATCH/DELETE even with a permissive CORS policy.

**When to disable LAN CORS:** set `DISABLE_LAN_CORS=1` in `.env` for:

- Air-gapped or PCI/HIPAA-scoped installs where the intranet is not trusted.
- Deployments where all legitimate origins are known at install time and can be listed in `ALLOWED_ORIGINS`.

With the flag set, any origin not explicitly on the `ALLOWED_ORIGINS` list (plus built-in localhost + desktop wrappers) is rejected with `CORS Error: Unauthorized Origin`.
