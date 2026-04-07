# Trier OS — Database Schema Reference

## Overview

Trier OS uses **SQLite** (`better-sqlite3`) with a **multi-tenant sharding model**. Each plant facility has its own isolated `.db` file under the `data/` directory. No plant can access another plant's database.

## Database Files

| File | Purpose |
|---|---|
| `data/Demo_Plant_1.db` | Fully seeded demo plant (delete when going live) |
| `data/Plant_2.db` | Second demo plant for multi-site testing |
| `data/Corporate_Office.db` | Corporate HQ facility database |
| `data/corporate_master.db` | Read-only aggregate crawled from all plants at boot |
| `data/examples.db` | Protected reference database — excluded from all math |
| `data/schema_template.db` | Blank prototype used when provisioning new plants |
| `data/trier_logistics.db` | Cross-plant logistics and inter-site transfer ledger |

> `auth_db.sqlite` (root level) stores user accounts and JWT session data separately from plant data.

---

## Core Plant Tables

These tables exist in every plant `.db` file.

### `Work` — Work Orders
| Column | Type | Notes |
|---|---|---|
| `ID` | INTEGER | Primary key, auto-increment |
| `Description` | TEXT | Work order title |
| `Status` | TEXT | `OPEN`, `IN_PROGRESS`, `COMPLETE`, `CANCELLED` |
| `Priority` | TEXT | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `AssetID` | TEXT | FK → `Asset.ID` |
| `AssignedTo` | TEXT | FK → user identifier |
| `CreatedBy` | TEXT | Creator user ID |
| `DeptID` | TEXT | FK → `Departments.id` |
| `WoTypeID` | TEXT | Corrective, Preventive, Predictive, etc. |
| `EstDowntime` | INTEGER | Estimated downtime in minutes |
| `ActDowntime` | INTEGER | Actual downtime in minutes |
| `LaborCost` | REAL | Calculated from labor entries |
| `PartCost` | REAL | Calculated from parts used |
| `CreatedAt` | TEXT | ISO datetime |
| `UpdatedAt` | TEXT | ISO datetime |
| `CompletedAt` | TEXT | ISO datetime (null if open) |

### `Asset` — Equipment Registry
| Column | Type | Notes |
|---|---|---|
| `ID` | TEXT | Primary key (e.g. `ASSET-0042`) |
| `Description` | TEXT | Equipment name |
| `AssetType` | TEXT | FK → `asset_types` lookup |
| `LocationID` | TEXT | FK → `Locations.ID` |
| `DeptID` | TEXT | FK → `Departments.id` |
| `Status` | TEXT | `ACTIVE`, `INACTIVE`, `DELETED` |
| `Manufacturer` | TEXT | |
| `Model` | TEXT | |
| `SerialNumber` | TEXT | |
| `PurchaseDate` | TEXT | ISO date |
| `PurchaseCost` | REAL | Original purchase price |
| `DepreciationYears` | INTEGER | Useful life for book value calc |
| `Notes` | TEXT | |
| `FloorPlanX` | REAL | Pin X coordinate on floor plan |
| `FloorPlanY` | REAL | Pin Y coordinate on floor plan |
| `FloorPlanID` | TEXT | FK → `FloorPlans.ID` |

### `Part` — Parts Inventory
| Column | Type | Notes |
|---|---|---|
| `ID` | TEXT | Part number / SKU |
| `Description` | TEXT | Part name |
| `Stock` | INTEGER | Quantity on hand |
| `MinStock` | INTEGER | Reorder point threshold |
| `MaxStock` | INTEGER | Maximum stocking level |
| `UnitCost` | REAL | Cost per unit |
| `LocationBin` | TEXT | Physical bin/shelf location |
| `VendorID` | TEXT | FK → `Vendors.ID` |
| `PartNumber` | TEXT | Manufacturer part number |
| `Barcode` | TEXT | Scannable barcode value |
| `Notes` | TEXT | |

### `LaborEntry` — Time & Labor Tracking
| Column | Type | Notes |
|---|---|---|
| `ID` | INTEGER | Primary key |
| `WorkOrderID` | INTEGER | FK → `Work.ID` |
| `UserID` | TEXT | Technician user ID |
| `Hours` | REAL | Hours worked |
| `HourlyRate` | REAL | Rate at time of entry |
| `WorkDate` | TEXT | ISO date |
| `Notes` | TEXT | |

### `PartsUsed` — Parts Consumed per Work Order
| Column | Type | Notes |
|---|---|---|
| `ID` | INTEGER | Primary key |
| `WorkOrderID` | INTEGER | FK → `Work.ID` |
| `PartID` | TEXT | FK → `Part.ID` |
| `Quantity` | INTEGER | Units consumed |
| `UnitCost` | REAL | Cost at time of use |
| `UsedAt` | TEXT | ISO datetime |

---

## Safety & Compliance Tables

### `loto_permits` — Lockout/Tagout
| Column | Type | Notes |
|---|---|---|
| `ID` | INTEGER | Primary key |
| `PermitNumber` | TEXT | Auto-generated permit ID |
| `PermitType` | TEXT | LOTO, Hot Work, Confined Space, etc. |
| `AssetID` | TEXT | FK → `Asset.ID` |
| `Status` | TEXT | `ACTIVE`, `COMPLETED`, `CANCELLED` |
| `CreatedBy` | TEXT | Issuing supervisor |
| `AuthorizedBy` | TEXT | Safety officer sign-off |
| `StartDate` | TEXT | ISO datetime |
| `EndDate` | TEXT | ISO datetime |
| `IsolationPoints` | TEXT | JSON array of energy sources |

### `safety_incidents` — Incident Log
| Column | Type | Notes |
|---|---|---|
| `ID` | INTEGER | Primary key |
| `Title` | TEXT | Incident description |
| `Type` | TEXT | Near Miss, Injury, Property Damage, etc. |
| `Severity` | TEXT | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `Location` | TEXT | Where it occurred |
| `ReportedBy` | TEXT | |
| `IncidentDate` | TEXT | ISO datetime |
| `RootCause` | TEXT | |
| `CorrectiveAction` | TEXT | |

---

## Lookup / Reference Tables

These small tables drive dropdowns across the UI.

| Table | Purpose |
|---|---|
| `Locations` | Plant zones and physical locations |
| `Departments` | Organizational departments |
| `asset_types` | Equipment category classifications |
| `Vendors` | Supplier and vendor directory |
| `FailureMode` | RCA failure mode library |
| `Procedures` | SOP and task procedure records |
| `Schedule` | Preventative maintenance schedules |
| `AuditLog` | System-wide change audit trail |

---

## Corporate Master Database

`corporate_master.db` is **read-only and regenerated at every server boot**. It is never written to directly — the Express server crawls all plant databases and assembles an aggregate snapshot for the Corporate Analytics, Underwriter Portal, and Executive Dashboard.

---

## Adding a New Plant

The easiest way to provision a new plant is through the Admin Console UI (**Settings → Edit Locations → + Add New Plant**). Under the hood, the server copies `data/schema_template.db` and registers the new plant in the routing layer automatically.

To provision manually:
```bash
cp data/schema_template.db data/My_New_Plant.db
```
Then add the plant record via the Admin Console or directly via the API:
```
POST /api/plants  { "id": "My_New_Plant", "label": "My New Plant" }
```
