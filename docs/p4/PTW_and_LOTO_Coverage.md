# Permit to Work (PTW) & LOTO — P4 Coverage Summary
> Trier OS P4 · Safety Permit lifecycle and Lockout/Tagout

---

## Implementation Status

Both PTW and LOTO are fully implemented. Routes are mounted at startup; all tables are created with `CREATE TABLE IF NOT EXISTS` (idempotent).

| Module | Route File | Mount Point | Tables |
|---|---|---|---|
| Safety Permits (PTW) | `routes/safety_permits.js` | `/api/safety-permits` | SafetyPermits, SafetyPermitChecklist, SafetyPermitSignatures, SafetyPermitGasLog, SafetyPermitAuditLog |
| LOTO | `routes/loto.js` | `/api/loto` | LotoPermits, LotoIsolationPoints, LotoSignatures, LotoAuditLog |

---

## Permit Types (PTW)

`HOT_WORK` · `CONFINED_SPACE` · `COLD_WORK` · `EXCAVATION` · `ELECTRICAL` · `WORKING_AT_HEIGHTS` · `LINE_BREAKING` · `CRANE_RIGGING` · `CHEMICAL_HANDLING` · `RADIATION` · `ROOF_ACCESS` · `ENERGY_ISOLATION` · `CUSTOM`

Each type has a default checklist pre-populated on permit creation. COLD_WORK was added in P4.

---

## Approval Workflow

```
CREATE (DRAFT)
    │
    ├── Issuer Signature → ACTIVE
    │
    ├── Worker/Entrant Signatures (added as work proceeds)
    │
    ├── Gas Readings logged (CONFINED_SPACE, CHEMICAL_HANDLING)
    │
    ├── Checklist items checked off
    │
    └── CLOSE (enforces fire watch completion for HOT_WORK)
            or VOID (emergency abort with reason)
            or auto-EXPIRE (5-min interval check vs. ExpiresAt)
```

---

## Simultaneous Operations Conflict Detection

Added in P4. When creating a new permit for an asset with an `AssetID`, the system checks for any ACTIVE or DRAFT permit of the same type on that asset. If found, the request is rejected with HTTP 409:

```json
{
  "error": "Simultaneous operations conflict: an HOT_WORK permit (HW-PLT1-ABC123) is already ACTIVE for this asset.",
  "conflict": { "permitNumber": "...", "issuedBy": "...", "expiresAt": "..." }
}
```

To issue a new permit, the existing one must be closed or voided first.

---

## LOTO (Lockout/Tagout) Workflow

```
CREATE (DRAFT) → Issuer signature → ACTIVE
    │
    ├── Isolation points verified one by one (POST /permits/:id/verify-point)
    │
    └── CLOSE (releases all points) or VOID (emergency)
```

Each isolation point tracks: `EnergyType`, `Location`, `LockNumber`, `VerifiedBy`, `VerifiedAt`.

Energy types: Electrical, Mechanical, Pneumatic, Hydraulic, Thermal, Chemical, Gravitational, Stored Kinetic, Steam, Radiation.

---

## Audit Trail

Every state change writes to `SafetyPermitAuditLog` / `LotoAuditLog`. Both tables are append-only — no UPDATE or DELETE routes exist for audit records.

---

## Outstanding Gaps (Future Work)

- **Cross-asset conflict detection**: current conflict check only covers identical PermitType + AssetID combinations. A future enhancement could detect spatial conflicts (e.g., two hot work permits in the same zone).
- **Mobile permit scanning**: QR code on printed permit for field verification is a P5/P6 item.
