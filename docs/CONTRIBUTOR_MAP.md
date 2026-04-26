# Trier OS — Contributor Map

This document tells you where things live and what to do when you need to add or change them.
Read this before adding a new rule, route, invariant, or deferred decision.

---

## Adding a new correctness rule (invariant)

A correctness rule is something the system must never violate — not "should avoid" but "cannot happen."

**Steps:**

1. **Document it** in `docs/ARCHITECTURE_INVARIANTS.md`
   - Add a row to the status table with `PARTIAL` status
   - Describe the invariant, the enforcement layer, and the failure mode it prevents

2. **Enforce it at the DB layer** (preferred)
   - Add a `UNIQUE INDEX`, `CHECK`, or `PRIMARY KEY` in a new numbered migration (`server/migrations/NNN_description.js`)
   - Never modify an existing migration — always create a new one

3. **Enforce it at the service layer** (where DB layer alone isn't sufficient)
   - Use an `IMMEDIATE` transaction so check and write share the same write lock (eliminates TOCTOU)
   - Map the constraint violation to a structured response — never let it surface as a 500

4. **Wire an observation event** via `logInvariant()` from `server/logistics_db.js`
   - Call it at the prevention point, not before or after
   - Use the canonical event name format: `I-XX:EVENT_NAME_IN_CAPS`
   - Add a comment `// I-XX:EVENT_NAME` at the call site so the invariant is traceable in code

   ```js
   logInvariant('I-10', 'I-10:PM_DOUBLE_ACK_PREVENTED', {
       plantId, entityType: 'pm', entityId: String(pmId), actor: username,
       metadata: { woId },
   });
   ```

5. **Add an assertion + evidence query** to the `INVARIANTS` registry in `server/routes/invariants.js`
   - `assertionQuery`: SQL that returns rows when the invariant is violated (violations > 0 → FAIL)
   - `assertionType` + `assertionReason` if there is no per-row DB query (structural/nonQueryable)
   - `codeRefs`: files that enforce the invariant
   - `tests`: test file + describe-block anchors that prove it

6. **Write a targeted E2E test** in `tests/e2e/invariants.spec.js`
   - Test the adversarial condition, not the happy path
   - Concurrent requests, duplicate IDs, over-quantity attempts — whatever the failure mode is

7. **Mark FIXED** in `docs/ARCHITECTURE_INVARIANTS.md` once all steps are complete

---

## Deferring a rule (controlled follow-up)

If enforcement needs to be deferred (feature dependency, compliance gating, infrastructure not ready):

1. **Document the tradeoff** in `docs/ARCHITECTURE_INVARIANTS.md`
   - What the current state is and why it's acceptable temporarily
   - What the hardened path looks like when the trigger is met

2. **Register in `docs/followups.yaml`**
   - `trigger`: human-readable condition that unlocks this item
   - `triggerEnvVar`: the env var CI will check — if set while status=deferred, CI fails
   - `acceptance`: what "done" looks like (concrete, checkable)
   - `decisionLog`: append an entry with `at`, `change`, `reason` — never edit existing entries
   - `lastReviewedAt`: today's date

3. **CI will enforce the gate** via `node scripts/check_followups.js`
   - Fails if `lastReviewedAt` > 90 days (staleness)
   - Fails if `triggerEnvVar` is active but status ≠ completed (accidental rollout)

---

## Adding a new route

1. Create `server/routes/your_feature.js` with the standard file header (see `CONTRIBUTING.md`)
2. Export a function: `module.exports = function(authMiddleware) { ... }`
3. Mount in `server/index.js`: `app.use('/api/your-feature', require('./routes/your_feature')(require('./middleware/auth')))`
4. Add auth middleware: `router.use(authMiddleware)` at the top of the router
5. All SQL must use parameterized queries — never template literal interpolation
6. Plant ID comes from `getDb()` via AsyncLocalStorage — never from `req.body.plantId`
7. Write-path operations write an audit record via `logAudit()` from `server/logistics_db.js`

---

## Where things live

| What | Where |
|---|---|
| Correctness rules | `docs/ARCHITECTURE_INVARIANTS.md` |
| Deferred decisions | `docs/followups.yaml` |
| Invariant enforcement | `server/routes/*.js` + migrations |
| Observation events | `server/logistics_db.js` → `invariant_log` table |
| Proof endpoint | `GET /api/invariants/report` |
| CI gate | `scripts/check_followups.js` |
| Invariant tests | `tests/e2e/invariants.spec.js` |
| Security rules | `server/standards.md` |
| Architecture decisions | `docs/ARCHITECTURE_INVARIANTS.md` + `docs/followups.yaml` decisionLog |

---

## The invariant lifecycle

```
Identify → Document (ARCHITECTURE_INVARIANTS.md)
         → Enforce (DB constraint + service guard)
         → Observe (logInvariant → invariant_log)
         → Prove   (assertion query + evidence query in /api/invariants/report)
         → Gate    (followups.yaml + check_followups.js for deferred items)
```

Every step is machine-checkable except the initial identification.
That's the goal: knowledge in structure, not knowledge in people.
