<!-- Copyright © 2026 Trier OS. All Rights Reserved. -->

# Trier OS — 5-Minute Demo Script

**For the person running the demo.** This is a facilitator guide, not a marketing document.
Read it once before you present. Every step has a time budget, an exact click path, a line to
say out loud, and what you want the audience to notice.

Target runtime: 5 minutes. If you move at a comfortable pace and don't get pulled into
questions, you'll land it in 4:30. That's fine — better short than rushed.

---

## Before You Run This Demo

Do this before anyone is in the room.

1. **Server is running.** `node server/index.js` from the project root. Wait for
   `Trier OS server listening on port 5000` (or your configured port) in the terminal.
   Leave that terminal visible but minimized — you may want it for step 8.

2. **Plant is seeded.** The Demo Plant 1 database (`data/Demo_Plant_1.db`) must exist and
   be populated. If the file is missing or empty, run the seed script first.

3. **Browser is clean.** Open a fresh browser window (or incognito) pointed at the app.
   You do not want to start the demo already logged in as someone else.

4. **Plant selector is set to Demo Plant 1.** After you log in for the first time, confirm
   the plant selector in the top navigation bar reads "Demo Plant 1" before you begin the
   walkthrough. If it shows a different plant, click the selector and switch it now.

5. **DevTools is closed.** You will open it intentionally in step 8. Starting with it
   open looks sloppy.

6. **Know which asset you will use.** Any asset in Demo Plant 1 with a known tag ID works.
   Pick one that has a descriptive name — something like "Centrifugal Pump" or "Conveyor
   Drive" reads better on screen than a bare asset code. Find it ahead of time in
   Assets & Machinery and note the asset tag.

---

## Accounts

| Account | Password | Role |
|---|---|---|
| `ghost_admin` | `Trier3652!` | Full admin — use for most of the demo |
| `ghost_tech` | `Trier3292!` | Technician — use for step 2 onward if you want to show the floor-level view |
| `ghost_exec` | `Trier7969!` | Executive — use if you want to show Corporate Analytics at the end |

For a standard 5-minute run, stay on `ghost_admin` the whole time. Role-switching mid-demo
adds context you don't have time to explain.

---

## Step 1 — Login

**Cumulative time: 0:00 – 0:30**

**What you do:**
Navigate to the app root. The login screen is the first thing the audience sees.
Type `ghost_admin` into the username field. Type `Trier3652!` into the password field.
Click **Log In**.

**What to say:**
"This is the login screen — role determines what every user sees. Our tech today is an
admin, so he gets everything. A floor technician would see a smaller set of tiles."

**What the audience should notice:**
After login, Mission Control loads. It's a grid of module tiles — Safety, Quality,
Operations, SOPs, Supply Chain, and more. The layout is role-aware. Nothing looks like a
generic SaaS dashboard.

---

## Step 2 — Scan / Select an Asset

**Cumulative time: 0:30 – 1:15**

**What you do:**
Click the **Scan** button in the top navigation bar (it may appear as a barcode icon or the
text "SCAN" depending on screen width). The Smart Scanner view opens. In the asset ID input
field, type the asset tag you identified during setup — or, if you have a printed QR tag,
hold it up to the camera. Hit Enter or let the camera resolve it automatically.

If you prefer to skip the scanner and navigate directly: go to **Assets & Machinery**,
find the asset in the list, and click it to open the asset detail view. Then click
**Start Work Order** from there.

**What to say:**
"On the plant floor, a tech walks up to a machine and scans the QR tag with any device —
phone, tablet, Zebra gun. The system already knows what machine it is, what work orders
exist, and what parts are stocked for it. The tech never types anything."

**What the audience should notice:**
The scan resolves in under two seconds and immediately surfaces the work order context for
that asset. There's no search, no dropdown, no manual entry. One scan, one response.

---

## Step 3 — Start a Work Order

**Cumulative time: 1:15 – 2:00**

**What you do:**
After the scan resolves, the system presents action buttons based on the asset's current
state. If there is no active work order, you will see an **Open Work Order** or
**Create Work Order** option. Click it. The work order is created and opened — the asset
record, location, and priority are pre-populated. No form to fill out manually.

If the asset already has an active work order (which is likely in a seeded demo database),
the scan routes directly into that work order. That's the correct behavior — show it as
a feature, not a problem. Say: "The system sees an existing open work order and routes
straight to it. No duplicate, no confusion."

**What to say:**
"Every work order ties back to the asset automatically. Estimated time, assigned tech,
required parts, associated SOPs — all of it is pre-loaded. The tech's job is to do the
work, not fill out paperwork."

**What the audience should notice:**
The work order screen shows the asset context, the work order number, and the Parts panel
on the side. There is no blank form. Everything that can be pre-filled is pre-filled.

---

## Step 4 — Add Parts Used (Batch Scan Parts)

**Cumulative time: 2:00 – 2:45**

**What you do:**
On the active work order view, locate the **Parts** panel (right side or below, depending
on screen layout). Click **Add Parts** or **Batch Add Parts**. The parts scanner input
becomes active and auto-focuses — the cursor is ready for a barcode scan or manual entry.

Scan or type a part number. The part resolves from inventory and appears in the list with
its description, quantity available, and bin location. Scan the same part a second time —
notice the quantity increments rather than adding a duplicate row. Add a second distinct
part number.

Click **All Parts Added** (or the equivalent confirm button) to commit both parts to the
work order.

**What to say:**
"Parts are scanned directly from the storeroom shelf. Each scan auto-deducts from
inventory. If the same part gets scanned twice by accident, it just increments the count
rather than creating a duplicate line. The storeroom stays accurate without anyone
reconciling a spreadsheet."

**What the audience should notice:**
Duplicate scan handling is silent and correct. The inventory bin location is shown next to
each part — the tech knows exactly where to go. No part number memorization required.

---

## Step 5 — Return One Part

**Cumulative time: 2:45 – 3:10**

**What you do:**
In the Parts panel, find one of the parts you just added. Each issued part has a
**Return to Stock** button (a back-arrow or undo icon). Click it on one part. A
confirmation updates the part's status from "Issued" to "Returned" and the inventory
count is adjusted back immediately.

**What to say:**
"If a tech pulls a part and doesn't end up using it, they return it here. Inventory is
updated in real time. There's no paperwork lag, no end-of-shift reconciliation."

**What the audience should notice:**
The status pill on the part changes from "Issued" to "Returned" instantly. The other part
remains in "Issued" status. The system tracks which parts were used and which came back.

---

## Step 6 — Close the Work Order

**Cumulative time: 3:10 – 3:45**

**What you do:**
Click **Close Work Order** (or **Close Out** if the close-out wizard is visible). The
Close-Out Wizard opens. Walk through the steps:

- **Step 1 — Resolution Notes:** Type a one-line note, e.g., "Replaced mechanical seal,
  tested to spec." This is the only required field.
- **Step 2 — Labor Hours:** The estimated hours are pre-filled. Adjust if needed.
- **Step 3 — Parts Consumed:** The parts you added in step 4 are already listed.
- Click through the remaining steps and hit **Submit**.

**What to say:**
"Close-out takes thirty seconds. Resolution notes, actual labor hours, parts consumed —
all in one place. When it submits, every system updates at once: inventory, asset history,
downtime log, and the audit trail."

**What the audience should notice:**
The wizard is pre-populated. The tech is confirming data, not entering it from scratch.
The submit button is on step 6 — there is a deliberate review sequence before anything
is committed.

---

## Step 7 — Show Time Saved / Outcome

**Cumulative time: 3:45 – 4:20**

**What you do:**
After the work order closes, the system briefly shows a completion screen. This may include
a "time saved" figure and the total downtime cost for this event. Navigate to the closed
work order by going to **Work Orders** and filtering to "Completed" status, or find it in
the asset's history under **Asset Detail → History**.

Open the closed work order. Point at:
- The resolution notes
- Actual vs. estimated labor hours
- Parts consumed (and which were returned)
- Total downtime recorded

If Corporate Analytics is configured, click through to **Corporate Analytics** and show
the real-time update to the plant's OEE or maintenance cost metrics.

**What to say:**
"Every closed work order feeds the analytics layer automatically. Maintenance managers
see labor efficiency, parts consumption trends, and downtime costs — updated the moment
the tech hits Submit. No ERP export, no overnight batch job."

**What the audience should notice:**
The data is already in the analytics view. There is no manual step between the work order
closing and the metrics updating. The system is the source of truth.

---

## Step 8 — Drop Network and Show the Offline Queue Replay

**Cumulative time: 4:20 – 5:00**

**What you do:**

**Simulate going offline:**
1. Open browser DevTools: F12 (or right-click anywhere → Inspect).
2. Go to the **Network** tab.
3. Click the **No throttling** dropdown and select **Offline**.
4. Close DevTools (or just minimize it — leaving it open shows the audience the mechanism).

**Perform an offline scan:**
Navigate to the **Scan** view (`/scanner`). Type or scan an asset ID. The scan will queue
locally — you will see a visual indicator that the device is in offline mode (a banner or
icon near the top of the screen). The scan does not fail. It is stored in the browser's
offline queue.

**Come back online:**
1. Reopen DevTools → Network → change "Offline" back to **No throttling**.
2. Close DevTools.

Within a few seconds, the queued scan replays automatically against the server via
`POST /api/scan/offline-sync`. The banner clears and the scan resolves as if the network
had been up the whole time.

**What to say:**
"Plant floors lose connectivity. A tech in a steel structure or a remote building shouldn't
have to wait for Wi-Fi before they can work. Scans queue locally, the session stays alive,
and when the network comes back the replay is automatic. The tech never notices."

**What the audience should notice:**
The scan did not fail, did not show an error screen, and did not require the tech to retry
anything manually. The replay is silent and instant from the tech's perspective.

---

## Offline Replay Reference

This section is a condensed quick-reference version of step 8 for use during prep.

1. DevTools → Network → **Offline** (drop the connection)
2. Scan an asset in `/scanner` (watch for the offline banner)
3. DevTools → Network → **No throttling** (restore the connection)
4. Watch the banner clear and the scan commit automatically

The LAN Hub (port 1940) can also absorb scans if the Electron desktop app is running
at the plant site. For a browser-only demo, DevTools offline mode is the cleanest
simulation.

---

## What to Leave Them With

Trier OS is a full industrial operating system — work orders, safety permits, parts
inventory, quality logs, predictive analytics, and fleet management — running on a single
server, accessible from any device on the plant network, with no cloud dependency.

The scan flow you just saw is the core promise: a technician walks up to any machine,
scans a tag, and the system tells them exactly what to do next. No clipboard, no radio
call to dispatch, no spreadsheet to update afterward.

It is MIT-licensed and free to deploy. The only cost is the hardware it runs on.

---

*Trier OS v3.6.0 — docs/DEMO_SCRIPT.md*
