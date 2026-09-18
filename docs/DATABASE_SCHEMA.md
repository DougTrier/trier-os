# Trier OS database reference — 3.7.2

Trier OS uses better-sqlite3 with authoritative per-plant files on the single corporate HQ host. Authorized staff cross-plant search is intentional; separate files are not mutually isolated SaaS tenants. This is a selected current schema reference, not a guarantee that every installed DB has identical migration coverage.

## Files and routing

| File | Purpose |
|---|---|
| `trier_auth.db` | Users, password hashes, UserPlantRoles and TokenVersion |
| `trier_logistics.db` | Shared operational, safety, audit and floorplan records |
| `corporate_master.db` | Corporate master/aggregate data; existing crawl/provision/write paths mean it is not universally read-only |
| Plant `.db` files | Plant-scoped work, assets, parts, schedules, quality and related operational data |
| `examples.db` | Public demo/reference scope; some actions write demonstration state |
| `schema_template.db` | Provisioning template, not a promise of empty user tables |

Paths are relative to the directory selected by `server/resolve_data_dir.js` (normally `data/` for source installations). Demo datasets and their exact file names depend on the installed distribution. `Demo_Plant_1.db`, `Plant_2.db` and `Corporate_Office.db` are sample facility files, not mandatory production names.

Authenticated middleware sets validated AsyncLocalStorage context. Ordinary routes use the database helper rather than creating a path from req.body. Internal explicit getDb selectors exist and require validation; the demo-context guard refuses selection outside examples. `all_sites` is virtual: the generic DB handle uses read-only template/fallback data, while corporate/aggregate routes query their appropriate stores.

## Selected plant columns

The following names/types were checked against the current plant schema without changing it. Use actual PRAGMA/schema coverage for an installation; route APIs may map fields and statuses differently.

| Table | Selected actual columns |
|---|---|
| `Work` | `ID INTEGER`, `Descript TEXT`, `Description TEXT`, `AstID TEXT`, `StatusID INTEGER`, `Priority INTEGER`, `AddDate TEXT`, `StartDate TEXT`, `CompDate TEXT`, `AssignToID TEXT`, `EstDown REAL`, `ActDown REAL`, `holdReason TEXT`, `needsReview INTEGER`, `reviewReason TEXT` |
| `Asset` | `ID TEXT`, `Description TEXT`, `AssetType TEXT`, `LocationID TEXT`, `DeptID TEXT`, `Manufacturer TEXT`, `Model TEXT`, `Serial TEXT`, `AssetTag TEXT`, `Active INTEGER`, `IsDeleted INTEGER`, `GpsLat REAL`, `GpsLng REAL` |
| `Part` | `ID TEXT`, `Descript TEXT`, `Description TEXT`, `Stock INTEGER`, `UnitCost TEXT`, `Location TEXT`, `VendorID TEXT`, `OrdMin REAL`, `OrdMax REAL`, `CriticalSpare INTEGER` |
| `WorkParts` | `WoID INTEGER`, `PartID TEXT`, `EstQty REAL`, `ActQty REAL`, `UnitCost TEXT`, `qty_returned REAL`, `status TEXT`, `issued_by TEXT`, `returned_by TEXT`, `returned_at TEXT` |
| `WorkSegments` | `segmentId TEXT`, `woId TEXT`, `userId TEXT`, `startTime TEXT`, `endTime TEXT`, `segmentState TEXT`, `segmentReason TEXT`, `holdReason TEXT` |
| `ScanAuditLog` | `auditEventId TEXT`, `scanId TEXT`, `woId TEXT`, `assetId TEXT`, `userId TEXT`, `previousState TEXT`, `nextState TEXT`, `deviceTimestamp TEXT`, `serverTimestamp TEXT`, `offlineCaptured INTEGER` |

The old `LaborEntry` and `PartsUsed` definitions were not tables in the checked plant schema. Work/labor/parts APIs use their existing operational tables; do not create those obsolete tables to match old prose. Numeric StatusID/work-status lookups are distinct from the scan state graph. Do not infer a DB foreign-key constraint merely from a logical relationship in a route.

## Shared schemas

`server/logistics_db.js` exports an object containing `db`, not a callable logistics DB helper. For example:

```js
const { db: logisticsDb } = require('../logistics_db');
const rows = logisticsDb.prepare('SELECT * FROM AuditLog WHERE PlantID = ?').all(plantId);
```

`server/routes/loto.js` maintains `LotoPermits`, `LotoIsolationPoints`, `LotoSignatures` and `LotoAuditLog` in logistics storage; the old lowercase `loto_permits` schema was not the current route definition. Shared floorplans and child tables are also logistics data, with plan ownership checked separately from per-plant DB context. See the actual route schema for fields and lifecycle values; safety modules do not all share one generic permit table.

## Provisioning and migrations

Use the existing authorized Settings/Edit Locations workflow to provision plants, rather than an obsolete `/api/plants` example or a manual unregistered file copy. Provisioning copies the schema template, with a demo-baseline fallback if necessary; inspect resulting reference records before real use. Back up existing data before deleting demonstration locations.

Numbered SQL/JavaScript migrations are in `server/migrations/`. Never edit an existing migration; new JavaScript migrations export `.up(db)`. The runner uses number/filename ordering and a filename/checksum ledger while retaining legacy version records. Historical bare-function/path irregularities (including 047 and both 017 files) use a scoped compatibility adapter. Verified backups precede pending upgrades; a failure rolls back that database's pending changes and stops startup. Forward migrations 062 and 063 repair the SOP parent key and missing EventLog prerequisite columns without removing existing rows. See [the remediation audit](SURGICAL_REMEDIATION_AUDIT.md) for reconstructed historical coverage and recovery limits.

SQLite WAL files matter for consistent backup/recovery. Do not copy only a live DB and assume it captures all current writes. [Deployment/rollback](p2/Deployment_and_Rollback.md), [architecture](ARCHITECTURE.md) and [validation limits](SECURITY_MAINTENANCE_VALIDATION.md).
