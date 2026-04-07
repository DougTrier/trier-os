# Trier OS — Demo Database Guide

When you first launch Trier OS, the **Plant Location Selector** in the top navigation will show five pre-configured locations. This document explains what each one is, why it exists, and when to delete it.

---

## The Five Demo Locations

### 🏢 Corporate (All Sites)
**Purpose:** Executive command center — aggregates every plant simultaneously.  
**Who uses it:** CEO, CFO, COO, VPs, and any corporate-level role.  
**What it shows:** Total operating spend, fleet counts, work order completion rates, safety incident scores, quality metrics, and risk matrices pulled live from **every plant database in parallel**.  
**Do not delete.** This view is always present and dynamically reflects whatever plant databases exist in your deployment.

---

### 🏬 Corporate Office
**Purpose:** A dedicated plant-level database for the corporate headquarters facility itself.  
**Who uses it:** Corporate facility managers tracking their own building's assets, IT hardware, and maintenance work orders — separate from the manufacturing plants they oversee.  
**What it shows:** The same full Trier OS feature set as any plant, scoped to the corporate office location.  
**Delete when:** You are ready to replace it with your actual corporate office location data.

---

### 📋 Example Location *(Protected)*
**Purpose:** A read-only reference database showing exactly how all forms, assets, work orders, parts, and procedures should be filled out correctly.  
**Important:** This location is intentionally **excluded from all financial and operational calculations**. It does not affect Corporate Analytics totals, risk scores, or any aggregate metrics.  
**Who uses it:** New administrators learning the system, and operators who need a reference when setting up their real plant data.  
**Do not delete.** Keep it as a permanent reference. It will never pollute your real data.

---

### 🏭 Plant 1 & Plant 2
**Purpose:** Fully seeded demo databases containing realistic assets, work orders, parts inventory, fleet vehicles, safety incidents, quality logs, and staff directories.  
**Why they exist:** So you can explore every feature of the platform immediately after cloning — no setup required.  
**Do not use for production.** These are demonstration datasets only.  
**Delete when ready:** When you are ready to go live, navigate to **Settings → Edit Locations**, remove Plant 1 and Plant 2, and add your own real facility. Your real plant will start with a clean, empty database.

---

## Quick Reference

| Location | Counts in Analytics | Delete When Ready? | Purpose |
|---|---|---|---|
| Corporate (All Sites) | N/A — aggregator | Never | Executive overview of all plants |
| Corporate Office | ✅ Yes | When replacing with real data | HQ facility management |
| Example Location | ❌ No | Never | Reference template |
| Plant 1 | ✅ Yes | Yes — when going live | Demo data only |
| Plant 2 | ✅ Yes | Yes — when going live | Demo data only |

---

## Going Live

1. Log in as `ghost_admin`
2. Navigate to **Settings → Edit Locations**
3. Delete **Plant 1** and **Plant 2**
4. Click **+ Add New Plant** and enter your facility name
5. Your new plant database is created instantly and ready for data entry
