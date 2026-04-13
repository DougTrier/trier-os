# Runbook: System Outage (Trier OS Down)
> Severity: Sev 1 · Contact Trier OS Engineering if not resolved in 15 minutes

---

## Confirm the Outage

1. Browse to `http://<server-ip>:5173/`
   - Blank page or "Cannot connect" → server is down
   - Login page loads → server is up, issue is elsewhere
2. From the server machine, run: `curl http://localhost:5173/api/ping`
   - Returns `{"status":"ok"}` → server is running, check browser/network
   - Connection refused → Node process is not running

---

## Step 1 — Check the Process

**Windows (standalone `.exe` deployment):**
- Open Task Manager → look for `trier-os.exe` or `node.exe`
- If not running → go to Step 2

**From source:**
```bash
# Check if the process is running
tasklist | findstr node
# or
ps aux | grep node
```

---

## Step 2 — Restart the Server

**Windows standalone:**
- Double-click `trier-os.exe` (or the configured startup shortcut)
- Wait 30 seconds, then check `/api/ping`

**From source:**
```bash
cd "G:\Trier OS"
npm run preview
# or for development
npm run dev
```

**After restart:** Check `GET /api/health` — all subsystems should show `ok`.

---

## Step 3 — Check the Logs

If restart fails or the server crashes again immediately:

**Look for in the console output:**
- `[BOOT CRASH]` — a startup exception; the message will identify the module
- `FATAL ERROR: JWT_SECRET` — `.env` file is missing or JWT_SECRET is unset
- `SQLITE_CANTOPEN` — a database file is missing or permission denied
- Port already in use — another process is on port 5173

---

## Step 4 — Port Conflict

If port 5173 is in use:
```bash
# Windows
netstat -ano | findstr :5173
# Kill the blocking process (replace <PID> with the process ID from above)
taskkill /PID <PID> /F
```
Then restart the server.

---

## Step 5 — Database File Missing

If logs show `SQLITE_CANTOPEN`:
1. Verify the `data/` directory exists and is not empty
2. Check that `Plant_1.db`, `trier_logistics.db`, etc. are present
3. If a plant DB is missing, restore from most recent backup in `data/backups/`
4. **Do not create a new empty database** — contact Tier 2 (Trier OS Engineering)

---

## After Recovery

1. Confirm `GET /api/health` returns `status: "healthy"`
2. Test login with a known user account
3. Test one scan event if the scan system was in use
4. Note the time of outage and recovery in the incident log
5. If root cause is unknown, contact Trier OS Engineering before the next shift
