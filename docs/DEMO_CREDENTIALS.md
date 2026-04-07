# Trier OS — Demo Credentials

## First Boot — Creator Account

On first boot, Trier OS automatically generates a secure random password for the `creator` account and prints it to the server console:

```
╔══════════════════════════════════════════════════════════════╗
║  🔑  Creator System Admin Account Created                   ║
║  Username: creator                                           ║
║  Password: <randomly generated>                              ║
║  ⚠️  SAVE THIS PASSWORD — it will not be shown again!       ║
╚══════════════════════════════════════════════════════════════╝
```

**Save this password immediately.** It will not be shown again. If lost, delete `data/trier_auth.db` and restart the server to regenerate.

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
6. **Live Studio** (Settings → About → Go to Code) — The embedded Monaco IDE.

---

## Resetting Credentials

If you lose the `creator` password, delete `data/trier_auth.db` and restart the server. A new password will be generated and printed to the console on next boot.
