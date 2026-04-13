# Management of Change (MOC) — Design & Implementation
> Trier OS P4 · Digital change request workflow

---

## Purpose

MOC provides a controlled process for reviewing and approving changes before they are implemented. Every process change, equipment modification, procedure update, or temporary deviation goes through a documented approval chain before it affects plant operations.

Stored in `trier_logistics.db` with `PlantID` scoping — all plants visible in corporate view.

---

## Change Types & Default Approval Chains

| Change Type | Stages | Use Case |
|---|---|---|
| `PROCESS` | Safety → Engineering → Management | Process parameter changes, chemical substitutions |
| `EQUIPMENT` | Safety → Engineering → Management | Hardware modifications, new installations |
| `PROCEDURE` | Safety → Engineering → Management | SOP changes, work instruction updates |
| `TEMPORARY` | Safety → Supervisor | Short-duration deviations with defined revert date |
| `EMERGENCY` | Safety Sign-Off only | Immediate safety-driven changes, post-hoc documentation required |

---

## Status Lifecycle

```
DRAFT
  │
  └─── POST /api/moc/:id/approve (first approver) ──► UNDER_REVIEW
                │
                ├── further approvals ──► UNDER_REVIEW (still stages pending)
                │
                └── all stages approved ──► APPROVED
                        │
                        ├── PUT Status=IMPLEMENTING ──► IMPLEMENTING
                        │
                        └── PUT Status=COMPLETED ──► COMPLETED

  Any stage REJECTED ──► REJECTED (terminal)
  Manual cancel ──► CANCELLED (terminal, any non-terminal status)
```

---

## PSSR (Pre-Startup Safety Review)

When `PSSRRequired = 1`, the MOC cannot be marked COMPLETED until `PSSRCompleted`, `PSSRCompletedBy`, and `PSSRCompletedAt` are set. PSSR is enforced at the application level via the PUT `/api/moc/:id` endpoint — callers set these fields explicitly when the physical review is done.

---

## Affected Items

Any asset, work order, SOP, or procedure document can be linked to an MOC via `POST /api/moc/:id/affected`. Item types: `ASSET` · `WORK_ORDER` · `SOP` · `PROCEDURE`.

```json
{ "itemType": "ASSET", "itemId": "AST-001", "itemLabel": "Pump P-101", "notes": "Impeller replaced" }
```

This creates a traceable link so that anyone viewing the asset, WO, or SOP can see what MOCs have affected it (query by ItemType + ItemID in MOCAffectedItems).

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/moc` | List MOCs (filter: plantId, status, type) |
| `GET` | `/api/moc/:id` | Full MOC detail with approvals + affected items |
| `POST` | `/api/moc` | Create MOC (auto-assigns MOC number, creates approval stages) |
| `PUT` | `/api/moc/:id` | Update fields (Title, Risk, PSSR, Notes, Status) |
| `DELETE` | `/api/moc/:id` | Delete DRAFT only |
| `POST` | `/api/moc/:id/approve` | Submit APPROVED or REJECTED for current pending stage |
| `GET` | `/api/moc/:id/affected` | List affected items |
| `POST` | `/api/moc/:id/affected` | Link an affected item |
| `DELETE` | `/api/moc/:id/affected/:itemId` | Remove an affected item link |

---

## Tables (trier_logistics.db)

- `ManagementOfChange` — primary record
- `MOCApprovals` — one row per approval stage; foreign-keyed to MOC
- `MOCAffectedItems` — linked assets/WOs/SOPs; foreign-keyed to MOC (CASCADE delete)
