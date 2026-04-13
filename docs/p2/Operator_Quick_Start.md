# Trier OS — Operator Quick Start Guide
> For maintenance technicians, leads, and supervisors on the plant floor

---

## Logging In

1. Open the browser on the shared terminal or your device
2. Browse to `http://<server-ip>:5173/`
3. Enter your username and password
4. Select your plant from the dropdown if prompted

If you see "Working Offline" at the top of the screen — your device has no connection to the server. You can still scan and take actions. They will sync automatically when connectivity is restored.

---

## Scanning an Asset

**Hardware scanner (Zebra or equivalent):**
Just scan. The work order opens automatically — no navigation needed.

**Phone or tablet:**
1. Go to the Scanner view (scan icon in the navigation)
2. Tap "Scan QR Code" — aim the rear camera at the asset label
3. The work order opens automatically

**If the label is damaged or you don't have a scanner:**
1. Go to the Scanner view
2. Type the asset number in the field at the bottom and tap the submit button

---

## What Happens When You Scan

The system checks the asset's current state and responds:

| What you see | What it means |
|---|---|
| "Work Started ✓" flash | No WO existed — one was created, clock started |
| Action prompt with numbered options | A WO is already open — tap your action |
| "Scan queued offline" | No connection — scan saved, will sync when connected |

---

## The Action Prompt

After scanning an asset with an open WO, you'll see numbered options:

**If you're alone on the job:**
1. Close Work Order
2. Waiting on Parts
3. Escalate
4. Continue Later

**If other techs are also on the job:**
1. Leave Work (you leave, others stay)
2. Close for Team (closes for everyone — confirmation required)
3. Waiting on Parts
4. Escalate
5. Continue Later

Tap the number. One tap. No keyboard.

---

## Finding Work Orders

Mission Control → Work Orders tab shows all open WOs for your plant.

Filters: by status, by asset, by date, by assigned tech.

---

## If Something Looks Wrong

- **Wrong asset scanned:** You have 1 second after the scan to see the confirmation — if it's wrong, wait and try again
- **WO created on wrong asset:** Tell your supervisor — they can close it from Mission Control
- **Can't connect to server:** Use numeric fallback mode and the scan will queue offline
- **System won't load:** Try refreshing. If it's still down, contact your site IT team

---

## For Supervisors — Mission Control Review Queue

If any WOs are flagged for review (auto-timeout, offline conflict), they appear in the Review Queue on Mission Control. From there:
- **Confirm Close** — if work is done and the WO just wasn't closed properly
- **Reopen / Resume** — if work is still ongoing
- **Dismiss Flag** — if you've reviewed and no action is needed
