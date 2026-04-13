# Trier OS — Troubleshooting Guide
> Common issues and how to resolve them. See Incident_Runbooks/ for full procedures.

---

## Quick Diagnosis

**Is the server up?**
```
GET http://<server-ip>:5173/api/ping
Expected: { "status": "ok", "ready": true }
```

**What's the overall system state?**
```
GET http://<server-ip>:5173/api/health
Look at: status, mode, subsystems
```

---

## Login and Authentication

| Problem | Check | Fix |
|---|---|---|
| "Invalid credentials" | Caps Lock? Correct plant? | Re-enter credentials carefully |
| All LDAP users can't log in | AD connectivity, LDAP config | See `Incident_Runbooks/auth_failure.md` Section B |
| "Too many login attempts" | Rate limiter | Wait 5 minutes, try again |
| Logged out unexpectedly | JWT token expired (8hr default) | Log back in |
| Can't find my username | Account not created | Admin creates account in User Management |

---

## Scanning

| Problem | Check | Fix |
|---|---|---|
| Scan does nothing | Is the scanner focused on the hidden input? | Click anywhere on the scan page, try again |
| Camera won't open | Browser camera permission | Allow camera when prompted; use numeric fallback |
| Camera shows but won't decode | Label too damaged or dark | Use numeric fallback — type asset number |
| "Server error" on scan | Server connectivity | Check `/api/ping`; scan queues offline if offline |
| Wrong WO opened | Wrong asset scanned | Supervisor closes incorrect WO from Mission Control |
| Confirmation flash is too fast | Expected behavior — 1 second is by design | Watch for the asset name in the flash |

---

## Work Orders

| Problem | Check | Fix |
|---|---|---|
| WO won't close | Other active techs on same WO? | Use "Close for Team" option |
| WO stuck in "On Hold" | Timer-eligible hold with no resume scan | Scan the asset → "Resume Work" |
| WO showing as "Needs Review" | Auto-review flag raised | Supervisor resolves from Review Queue |
| Duplicate WO on same asset | Offline sync conflict (auto-resolved) | Supervisor merges or closes one from Mission Control |
| Can't find a WO | Wrong plant selected | Check the plant selector at the top |

---

## Offline and Sync

| Problem | Check | Fix |
|---|---|---|
| "Working Offline" banner not going away | Still no connectivity | Move device into Wi-Fi range |
| Banner says "X pending" for a long time | Sync retrying on bad connection | Check network; sync runs automatically on reconnect |
| Sync failed with conflicts | Two techs scanned same asset offline | Supervisor reviews OFFLINE_CONFLICT items in Review Queue |
| Sync succeeded but data looks wrong | Stale cache | Hard refresh browser (Ctrl+Shift+R) |

---

## Sensor Data / Dashboards

| Problem | Check | Fix |
|---|---|---|
| Sensor readings not updating | EdgeAgent worker down | See `Incident_Runbooks/ingestion_failure.md` |
| ERP data stale | ERP outbox backing up | Check `/api/integrations/outbox/status` |
| Analytics show no data | Wrong date range or plant filter | Adjust filters |
| Dashboard blank after login | JavaScript error | Open browser console (F12) and report the error |

---

## Performance

| Problem | Check | Fix |
|---|---|---|
| Pages loading slowly | `GET /api/health` → check memory | If heap > 90%, restart the server (off-shift) |
| Specific query very slow | Which page/query? | Report to Trier OS Engineering with the page name and time |
| Server unresponsive | Possible memory leak or deadlock | Restart server (saves all DB state), report to Engineering |

---

## Reporting an Issue

When contacting Trier OS Engineering, include:
1. What you were doing when the issue occurred
2. The exact error message (screenshot if possible)
3. Time of occurrence
4. Which plant and which user
5. What you already tried

Check `GET /api/health` and include the full JSON response in your report.
