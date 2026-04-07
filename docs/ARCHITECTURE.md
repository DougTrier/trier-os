# Trier OS — Architecture Overview

## System Topology

Trier OS is a full-stack, local-first web application. It is intentionally designed to operate **without a cloud dependency**, making it suitable for air-gapped OT (Operational Technology) networks in industrial plants.

```
┌─────────────────────────────────────┐
│         Browser / Mobile Client     │
│         React 19 SPA (Vite)         │
└──────────────┬──────────────────────┘
               │  HTTP / REST
┌──────────────▼──────────────────────┐
│         Node.js / Express API       │
│         server/server.js            │
└──────────────┬──────────────────────┘
               │  better-sqlite3
┌──────────────▼──────────────────────┐
│         SQLite Database Layer       │
│         data/*.db  (per-plant)      │
└─────────────────────────────────────┘
```

## Multi-Tenancy Model

Each plant site runs from its own isolated `.db` file under the `data/` directory. The Express server reads the `x-plant-id` request header on every API call to route queries to the correct database. A `corporate_master.db` aggregates cross-plant intelligence for the Executive Analytics portal.

## Key Directories

| Path | Purpose |
|---|---|
| `src/` | All React components, hooks, and i18n translations |
| `server/` | Express API routes, middleware, and authentication |
| `data/` | SQLite databases (one per plant + corporate master) |
| `public/` | Static assets served by Vite |
| `tests/e2e/` | Playwright end-to-end test suites |
| `electron/` | Electron wrapper for desktop deployment |
| `docs/` | This documentation directory |

## Authentication

JWT-based. On login the server issues a signed token (stored in `localStorage`) carrying:
- `role` — determines which modules render
- `plantId` — pins the user to a specific plant database
- `globalAccess` — allows cross-plant reads for corporate roles
- `isCreator` — god-mode access including the Live Studio IDE

Tokens expire after 15 minutes of inactivity. The server locks any open shift log entries on logout.

## Role Hierarchy

```
creator → it_admin → plant_manager / manager → maintenance_manager → technician / mechanic
```

Each role maps to a curated set of Mission Control workspace tiles defined in `MissionControl.jsx`.

## Offline Support

`OfflineDB.js` populates IndexedDB on login. When `navigator.onLine` is `false`, read operations fall back to the local IndexedDB cache. The `OfflineStatusBar` component displays a red banner alerting users to degraded connectivity.
