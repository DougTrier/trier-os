# Trier OS — Demo Credentials

## First Boot — Creator Account

On first boot, Trier OS automatically generates a secure random password for the `creator` account and saves it to **`data/first_login.txt`**.

- **EXE / MSI installs:** The file opens automatically in Notepad when the app first starts.
- **ZIP / Portable:** The file opens automatically in Notepad when the BAT server first starts.
- **From Source:** Look for `data/first_login.txt` in your project folder.

```
Trier OS - First Login Credentials
====================================

  Username : creator
  Password : <randomly generated>

  IMPORTANT: Save this password -- it will not be shown again.
  Delete this file after you have logged in and changed your password.
```

**Save this password before closing the file.** You will be required to set a new password on first login. After doing so, delete `first_login.txt`.

The `creator` account has full god-mode access across all modules and all plant sites.

---

## Demo Accounts

The following accounts are pre-seeded for testing role-based access control (RBAC):

| Username | Password | Role | Access |
|---|---|---|---|
| `demo_tech` | `TrierDemo2026!` | Technician | Work orders, assets, parts, LOTO only |
| `demo_operator` | `TrierDemo2026!` | Operator | Production floor view |
| `demo_maint_mgr` | `TrierDemo2026!` | Maintenance Manager | Shift oversight, reports, analytics |
| `demo_plant_mgr` | `TrierDemo2026!` | Plant Manager | Single-plant view, no IT console |

> Demo accounts are scoped to the `examples` database only and cannot access real plant data.

---

## What to Explore First

1. **Mission Control** (`/`) — The central gateway. Role determines which tiles appear.
2. **Assets & Machinery** (`/assets`) — Full equipment registry with AI OpEx alerts.
3. **LOTO Permits** (`/underwriter` → LOTO tab) — Digital lockout/tagout with audit trail.
4. **Corporate Analytics** (`/corp-analytics`) — Executive financial intelligence aggregated across all plants.
5. **SOP Library** (`/procedures`) — Standard Operating Procedures with AI generation.
6. **Live Studio** (Settings → About → Go to Code) — The embedded Monaco IDE. Available on source and ZIP portable installs only; disabled in the EXE and MSI installers.

---

## Resetting Credentials

If you lose the `creator` password, delete `data/trier_auth.db` and restart the server. A new password will be generated and saved to `data/first_login.txt` on next boot.
