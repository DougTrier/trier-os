# RBAC and Action Model
> Trier OS P2 · Complements `Write_Path_Architecture.md`

---

## Current RBAC (Implemented)

LDAP/Active Directory integration is fully implemented in `server/routes/ldap.js`.

| Role | Access level | Plant scope |
|---|---|---|
| `creator` | Full platform access — all plants, all modules, system console | All plants |
| `admin` | Full plant access — all modules, user management | Assigned plants |
| `manager` | Operational modules — WOs, assets, PM, analytics, Mission Control supervisor queue | Assigned plants |
| `technician` | Execution modules — WOs, assets, scan, storeroom, LOTO | Assigned plants |
| `viewer` | Read-only across all modules | Assigned plants |
| `contractor` | Limited WO and asset access — no LOTO, no compliance write | Assigned plants |

**Plant Jail:** Users can only access plants they have an explicit role on. The auth middleware enforces this via `x-plant-id` header validation against the user's `plant_roles` record.

**LDAP Group Mapping:** AD groups map to Trier OS roles via JSON config in `auth_db.ldap_config.roleMapping`. Example:
```json
{
  "CN=Maintenance_Supervisors,OU=Groups,DC=plant,DC=local": "manager",
  "CN=Maintenance_Techs,OU=Groups,DC=plant,DC=local": "technician"
}
```

---

## Action Classification Model (For Gatekeeper — Future)

When the Gatekeeper is built, every action request carries a class that determines the approval path.

| Class | Code | Who can execute | Approval path |
|---|---|---|---|
| Read-only | `READ` | All authenticated roles | None |
| Advisory | `ADVISORY` | All authenticated roles | None — recommendation only, operator acts |
| Non-critical write | `WRITE_STD` | `technician` and above | Standard RBAC check |
| Safety-critical write | `WRITE_SAFETY` | `manager` and above | PTW + MOC + second approver |

**Safety-critical write examples:**
- Equipment isolation command
- Setpoint change above defined threshold
- Safety interlock override
- Emergency stop reset

**Non-critical write examples:**
- WO status update
- Sensor threshold change (within normal operating range)
- ERP sync trigger

---

## Action Authorization Flow (Future Gatekeeper)

```
Request arrives at Gatekeeper
│
├─ Is user authenticated? (LDAP/AD JWT check)
│   └─ No → Reject 401
│
├─ Does user role allow this action class?
│   └─ No → Reject 403 with explicit reason
│
├─ Is action class WRITE_SAFETY?
│   ├─ Is there an active PTW covering this action?
│   │   └─ No → Reject — "No active permit for this operation"
│   └─ Is there an approved MOC record?
│       └─ No → Reject — "Change record required for safety-critical actions"
│
├─ Run Parallel Universe pre-proof (when Safe Action Layer is built)
│   └─ Unsafe → Reject with causal explanation
│
├─ Generate signed change ticket
├─ Write audit entry
└─ Pass to Control Adapter
```

---

## Signed Change Ticket Schema

Every approved write action gets a signed ticket attached to its audit record:

```json
{
  "ticketId": "<uuid>",
  "issuedAt": "<serverTimestamp>",
  "issuedToUserId": "<userId>",
  "actionClass": "WRITE_STD",
  "targetDevice": "<assetId or device address>",
  "intent": "<human-readable description>",
  "approvedByUserId": "<null for WRITE_STD, userId for WRITE_SAFETY>",
  "permitId": "<null or PTW permit ID>",
  "mocId": "<null or MOC record ID>",
  "signature": "<HMAC of ticket fields>"
}
```
