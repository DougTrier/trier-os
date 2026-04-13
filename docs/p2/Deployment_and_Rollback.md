# Deployment and Rollback
> Trier OS P2 · Version management and recovery procedures

---

## Versioning Model

Version format: `MAJOR.MINOR.PATCH` (semver) — defined in `package.json`.

| Increment | When | Examples |
|---|---|---|
| PATCH | Bug fixes, minor corrections, no schema changes | 3.3.1 → 3.3.2 |
| MINOR | New features, additive schema changes | 3.3.x → 3.4.0 |
| MAJOR | Breaking changes, major architecture shifts | 3.x.x → 4.0.0 |

Schema migrations are versioned separately in `server/migrations/` and are always additive (no column drops in production).

---

## Deployment Types

### Standalone Executable (Windows)
The primary deployment for pilot plants. A single `.exe` bundles Node.js + all dependencies.

**Build:**
```bash
npm run build           # Build React frontend
npm run package         # Package to .exe (electron-builder or pkg)
```

**Deploy:**
1. Copy new `.exe` to the server machine
2. Stop the running instance (Task Manager or service manager)
3. Rename old `.exe` as backup (`trier-os_v3.3.1.exe.bak`)
4. Start new `.exe`
5. Verify: `GET /api/health` returns healthy
6. Test login + one core workflow

**Data directory:** The `data/` folder is separate from the executable and survives updates. Never replace or move `data/` during deployment.

---

### From Source
```bash
git pull origin main
npm install
npm run build
npm run preview    # Production preview mode (Vite)
```

---

## Pre-Deployment Checklist

- [ ] `npm run build` — zero errors, zero warnings
- [ ] Version bumped in `package.json`
- [ ] Playwright E2E tests pass: `npx playwright test`
- [ ] Manual smoke test on staging instance (login, scan, WO create/close, asset view)
- [ ] Database backup taken on target machine before deployment
- [ ] Rollback plan confirmed (see below)

---

## Database Backup (Before Every Deployment)

```bash
# On the server machine, copy the data directory
xcopy "G:\Trier OS\data" "G:\Trier OS\data_backup_v3.3.1" /E /I /H

# Or backup individual plant DBs
copy "data\Plant_1.db" "data\Plant_1.db.bak_<timestamp>"
copy "data\trier_logistics.db" "data\trier_logistics.db.bak_<timestamp>"
```

---

## Rollback Procedure

If a deployment causes issues that can't be resolved in < 15 minutes, roll back:

### Standalone Executable Rollback
1. Stop the new `.exe`
2. Rename new `.exe` to `.broken` for inspection
3. Restore the `.bak` executable
4. If schema migrations ran: restore the DB backup taken pre-deployment
5. Start the old `.exe`
6. Verify: `GET /api/health`, test login, test affected workflow

### From Source Rollback
```bash
git log --oneline -10      # Find the commit to roll back to
git checkout <commit-hash> -- .
npm install
npm run build
npm run preview
```

**Important:** If migrations ran against the production DB, the DB cannot be rolled back without restoring from backup. Always take a DB backup before deploying a version with new migrations.

---

## Staged Deployment (Pilot)

For the initial pilot plant:
1. Deploy to `Demo_Plant_1` first — validate with Doug Trier
2. If stable for 24 hours → deploy to `Plant_1`
3. Monitor `GET /api/health` for 48 hours after production deployment
4. Keep rollback `.exe` on the server for 2 weeks post-deployment
