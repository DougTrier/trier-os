# Competency-Based WO Assignment Enforcement — Spec
> Trier OS P4 · Future enforcement layer for training requirements

---

## Current State

Training records (`training_records`), course library (`training_courses`), and assignment rules (`training_assignments`) are fully implemented in `routes/training.js`. The compliance query (`GET /api/training/compliance`) can compute whether any given user has all required certs for their role.

What is **not** yet implemented: blocking or warning on work order assignment when the assignee lacks a required certification.

---

## Desired Behavior

When a WO is assigned to a technician (via `PUT /api/work-orders/:id` with `AssignToID`), the system should:

1. Look up what certifications are required for that technician's role/department (from `training_assignments`)
2. Check the technician's `training_records` for each required cert — is it present and non-expired?
3. If any required cert is missing or expired:
   - **Soft enforcement (recommended first)**: return the update with a `warnings` array in the response body listing the missing certs. The assignment is allowed but flagged.
   - **Hard enforcement (future)**: block the assignment and return HTTP 422 with the missing cert list.

---

## Implementation Plan

### Phase 1 — Warning (non-blocking)

Add to `PUT /api/work-orders/:id` in `routes/workOrders.js`, after the status update succeeds:

```javascript
// Cert compliance check (non-blocking)
try {
    if (fields.AssignToID) {
        const required = db.query('SELECT CourseID FROM training_assignments WHERE ...');
        const held = db.query('SELECT CourseID FROM training_records WHERE UserID=? AND expires_date > date("now")');
        const missing = required.filter(r => !held.find(h => h.CourseID === r.CourseID));
        if (missing.length > 0) {
            return res.json({ success: true, message: 'Work order updated', warnings: missing });
        }
    }
} catch { /* non-blocking */ }
```

### Phase 2 — Equipment-Class Matrix

Extend `training_assignments` with an `EquipmentClass` column (via migration). Add assignment rules per equipment class (e.g., "Arc Flash cert required for all ELECTRICAL class assets"). When a WO is for an electrical asset, check the assignee against the equipment-class rules, not just role-level rules.

### Phase 3 — Hard Block

Gate the assignment entirely. This requires UI support: the WO assignment dialog must show which certs are missing and provide a link to the training record. Only implement after Phase 1 is validated in production.

---

## Dependencies

- `GET /api/training/compliance?userId=X` already returns compliance status per user — this is the lookup method
- The technician's role must be populated in the Users table for role-based lookups to work
- Equipment class field on Asset must be populated (already exists as `CriticalityClass`)

---

## Risk Note

Hard enforcement (Phase 3) must not be implemented for emergency WOs (high-priority reactive work). The enforcement gate should be skippable by users with the `supervisor` or above role, with the override logged to the audit trail.
