# Trier OS — Demo Database Guide

When you first launch Trier OS, the **Plant Location Selector** in the top navigation can show pre-configured demonstration locations, depending on the installed data. This document explains what each one is, why it exists, and when to delete it.

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
**Purpose:** A reference/demo database showing exactly how all forms, assets, work orders, parts, and procedures should be filled out correctly.
**Important:** Corporate aggregation paths are intended to exclude `examples`; this is not a proof that every route-specific metric excludes all demonstration records. Keep real data out of demo/reference locations.
**Who uses it:** New administrators learning the system, and operators who need a reference when setting up their real plant data.  
**Do not delete.** Keep it as a permanent reference. Some demo actions intentionally update example state; it is not universally read-only. Public demos cannot select real plant databases.

---

### 🏭 Plant 1 & Plant 2
**Purpose:** Fully seeded demo databases containing realistic assets, work orders, parts inventory, fleet vehicles, safety incidents, quality logs, and staff directories.  
**Why they exist:** To provide demonstration records in distributions that include those datasets; availability depends on the installed data and enabled integrations.
**Do not use for production.** These are demonstration datasets only.  
**Delete when ready:** When you are ready to go live, navigate to **Settings → Edit Locations**, remove Plant 1 and Plant 2, and add your own real facility. Review the resulting template-derived data before production; provisioning may copy reference/template records.

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

1. Log in as `creator` (credentials in `data/first_login.txt` on first boot)
2. Navigate to **Settings → Edit Locations**
3. Delete **Plant 1** and **Plant 2**
4. Click **+ Add New Plant** and enter your facility name
5. Review the new template-derived plant database, accounts and enabled integrations before production use

## Account and deployment boundary

The four public `demo_*` accounts are distinct from development ghost accounts. Public demo seeding also occurs in production, and switching mode does not clean existing accounts. See [demo credentials](DEMO_CREDENTIALS.md). One corporate HQ instance holds all authoritative plant databases; demo cleanup is data preparation within that instance, not deployment of an independent server per plant. Back up existing data and confirm a dataset is disposable before deleting a location.
