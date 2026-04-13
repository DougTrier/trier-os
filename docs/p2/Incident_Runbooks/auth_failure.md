# Runbook: Authentication Failure
> Severity: Sev 1 if all users are locked out · Sev 2 if partial

---

## Symptom Types

| Symptom | Likely cause | See section |
|---|---|---|
| All users get "Invalid credentials" | JWT_SECRET changed, DB issue | Section A |
| LDAP users can't log in, local users can | LDAP sync or AD connectivity | Section B |
| One user locked out | Wrong password, account issue | Section C |
| "Too many login attempts" message | Login rate limiter triggered | Section D |

---

## Section A — All Users Locked Out

**Immediate check:**
1. Confirm the server is running: `GET /api/ping`
2. Try the default admin account (see `docs/DEMO_CREDENTIALS.md` for pilot credentials)

**If default admin also fails:**
1. Check the `.env` file — `JWT_SECRET` must be set
   - If `JWT_SECRET` changed since users logged in, all existing tokens are invalid → users must log in again (not a lockout — just re-authentication required)
2. Check `auth_db` is accessible:
   - Server logs will show `auth_db` errors on startup if the auth database is missing or corrupt

**Resolution:**
- If JWT_SECRET was accidentally changed: restore to previous value (requires server restart)
- If auth_db is missing: restore from `data/backups/`
- **Contact Trier OS Engineering before attempting any auth_db repair**

---

## Section B — LDAP Users Can't Log In

Trier OS falls back to local auth automatically when LDAP is unreachable. If LDAP users can't log in:

**Step 1 — Test AD connectivity:**
Admin Console → User Management → LDAP Settings → Test Connection

**Step 2 — Check LDAP sync log:**
```
GET /api/ldap/config
```
Look at `lastSyncAt` and `lastSyncStatus`.

**Step 3 — Disable LDAP temporarily:**
If AD is down and you need access, disable LDAP in Admin Console → LDAP Settings → toggle off. Users with local accounts can then log in. Re-enable when AD is restored.

**Step 4 — Manual LDAP sync:**
Admin Console → LDAP Settings → Sync Now

Note: LDAP auto-syncs every 5–15 minutes (configurable). A brief AD outage self-recovers.

---

## Section C — Individual User Locked Out

1. Admin can reset password: Admin Console → User Management → [user] → Reset Password
2. If user's plant assignment is wrong: Admin Console → User Management → [user] → Edit Plant Roles
3. If user account is disabled: Admin Console → User Management → [user] → Enable Account

---

## Section D — Rate Limiter Triggered

Login is limited to 500 attempts per 5 minutes **per username** (not per IP — factory users share one NAT IP).

A triggered rate limit means either:
- Someone is running a brute-force attack against a specific username
- Automated testing or integration is hammering the login endpoint

**Wait 5 minutes** — the limiter resets automatically. If it keeps triggering, investigate the source.

---

## After Recovery

1. Confirm a test login with the affected account
2. Check `GET /api/health` shows healthy
3. If a security incident is suspected (brute force, credential stuffing), contact Trier OS Engineering immediately before clearing the incident
