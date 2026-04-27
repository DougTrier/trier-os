# Guided Execution Design

**Status:** Planned — schema and contracts locked, implementation not yet started  
**Pilot workflow:** Close Out a Work Order  
**Version:** 1.0 — April 2026

---

## 1. Purpose

Guided Execution Mode turns the Operational Intelligence Manual into an interactive
step-by-step workflow engine. A user opens a manual section, clicks **Start Guided Mode**,
and Trier OS walks them through the related process one step at a time — navigating to
the correct screen, highlighting the correct UI element, and validating that each step
was actually completed before advancing.

This is not a help tooltip system or a product tour. It is a **declarative execution
layer** for human-driven processes. Every step is:

- targeted by a stable anchor, not a CSS class or translated string
- completed by proven state, not by a click event
- gated by verified context, not by assumptions
- auditable as a sequence of deliberate human actions, not system assists

The manual section and the workflow are the same artifact. The guide cannot be
completed incorrectly. Supervisors can review that every step in a high-risk procedure
was confirmed — not just that the final result was recorded.

---

## 2. Architectural Summary

```
Schema = declared intent
    ↓
Registries = executable logic
    ↓
Engine = orchestration
    ↓
Playwright = proof
```

Each layer has one job and does not know about the others:

| Layer | File | Responsibility |
|---|---|---|
| Schema | `src/data/guidedWorkflows.js` | Declares what a workflow is — steps, targets, validations, eligibility, risk |
| Validation registry | `src/utils/guideValidation.js` | Executes completion checks — pure functions, read-only, keyed by string |
| Context registry | `src/utils/guideContext.js` | Resolves runtime context by source (`session`, `selection`) |
| Anchor resolver | `src/utils/guideAnchor.js` | Queries `[data-guide="..."]` in the DOM — stateless |
| Risk gate | `src/utils/guideRiskGate.js` | Evaluates role + risk level, returns a decision with a reason |
| Navigation resolver | `src/utils/guideNavigation.js` | Validates schema routes against an allowlist and returns the resolved path — the engine calls `navigate()` via `useNavigate()`; the resolver never navigates directly |
| Engine | `src/components/GuidedExecution.jsx` | Orchestrates all layers — no logic of its own |
| Proof | `tests/e2e/guided-execution.spec.js` | Playwright — proves invariants hold against a running instance |

---

## 3. Non-Negotiable Invariants

These five invariants govern every workflow, every step, every engine decision.
They are not configurable. A workflow that cannot be expressed while respecting all
five is a workflow that is not ready to be guided.

**I-GE1 — Stable anchors only**  
Step targets are resolved exclusively via `data-guide` attributes. CSS class names,
element order, and DOM structure are never used as selectors. A style refactor or
component restructure must never break a workflow.

**I-GE2 — Language-independent targeting**  
Translated text is never used as a selector, instruction source, or validation input.
All instruction text is i18n keys resolved at render time. A translation change must
never break a workflow.

**I-GE3 — State proves completion**  
A step is complete when its `validation.check` function returns `true` against the
registered validator. A click event, a form submission, or a navigation event is
evidence — not proof. The resulting state is proof.

**I-GE4 — Context proves eligibility**  
Before a workflow starts, the engine verifies: correct role, correct plant/tenant
context, and all `prerequisiteChecks` pass. If any check fails, the workflow does not
start. The engine blocks with a clear message or redirects to the prerequisite step.
A workflow never starts in an unverified state.

**I-GE5 — Guidance must never block execution**  
The guide panel may instruct, highlight, and navigate, but it must never prevent the
user from seeing or interacting with the active target control.

Rules:
- The active target element must remain fully visible at all times
- The active target must remain clickable and tappable — never covered by the panel
- On desktop: the guide panel docks to the side opposite the active target (right, left,
  or bottom) and repositions automatically when the target changes
- On mobile: guidance defaults to a collapsible bottom sheet; tapping the sheet collapses
  it to a compact step bar so the full screen is available for the target interaction
- If the panel cannot be positioned without covering the active target, it collapses to
  compact step bar mode automatically before the step is activated
- The engine evaluates positioning before advancing to each step — not after
- The engine must determine a safe placement for guidance before rendering the step —
  reactive repositioning after obstruction detection is not sufficient; reposition
  before render, not after failure

Proof: Playwright must validate each step at both desktop (1280×800) and mobile
(390×844) viewports. Each step test must assert the target element is visible and
not occluded by the guide panel before the user action is simulated.

**Audit rule (enforced by `allowAutoAction: false`)**  
The guided engine can instruct, block, redirect, and explain. It cannot perform user-intent
actions on the user's behalf. No auto-select, no auto-fill, no auto-submit. Every action
that advances a workflow must be a deliberate human choice. This keeps the completion
record defensible, testable, and supervisor-reviewable.

---

## 4. Canonical Workflow Schema

All workflows in `src/data/guidedWorkflows.js` must conform to this shape exactly.

```js
{
  id:              String,   // stable, unique — never changes after creation
  title:           String,   // i18n key for display name
  manualSectionId: String,   // links to enterpriseManual[n].id in AboutView.jsx

  eligibility: {
    roles: String[],             // e.g. ["Technician", "Supervisor", "Manager"]
    requiredContext: [            // declared — engine resolves at runtime via contextRegistry
      { key: String, source: String }
      // source: "session" | "selection" | "route" | "api"
    ],
    prerequisiteChecks: String[] // keys into validationRegistry — all must return true
  },

  risk: {
    level:                String,  // "low" | "medium" | "high" | "critical"
    requiresConfirmation: Boolean, // if true: show risk warning modal before start
    allowAutoAction:      false    // INVARIANT — hardcoded false, never override
  },

  steps: [
    {
      id:          String,   // stable step identifier — never changes after creation
      instruction: String,   // i18n key for the instruction shown to the user

      target: {
        route:  String,   // React Router path — engine navigates here before activating step
        anchor: String    // data-guide attribute value — e.g. "closeout-button"
      },

      action: {
        type: String      // "navigate" | "click" | "fill" | "select" | "confirm"
      },

      validation: {
        type:  String,    // "state" | "dom" | "api" | "composite"
        check: String     // key into validationRegistry — must return true for step to advance
      },

      onFailure: {
        message:  String, // i18n key — shown when validation fails
        recovery: String  // "retry" | "block" | "redirect" | "exit"
      }
    }
  ]
}
```

**Schema-completeness test (run before writing any component code):**

> Can the guided engine be fully implemented using only this schema plus the four
> registries, with zero component assumptions hardcoded in the engine?

If yes: proceed. If no: the schema is missing a field — fix the schema, not the component.

---

## 5. Registry Contracts

### 5.1 `validationRegistry`

**File:** `src/utils/guideValidation.js`

Maps string keys to pure validation functions. Every function in this registry must
satisfy I-G5: read-only, idempotent, no side effects.

```js
// Contract
type ValidationFn = (ctx: ValidationContext) => boolean

type ValidationContext = {
  state: {
    selectedWorkOrder: object | null,
    activeModal: string | null,
    currentRoute: string,
    plantId: string | null,
  },
  user: {
    role: string,
    plantId: string,
  }
}

// Registry shape
const validationRegistry: Record<string, ValidationFn> = {
  workOrderSelected:   (ctx) => ctx.state.selectedWorkOrder != null,
  workOrderNotClosed:  (ctx) => ctx.state.selectedWorkOrder?.StatusID !== 40,
  closeoutWizardOpen:  (ctx) => ctx.state.activeModal === 'closeout',
  onJobsRoute:         (ctx) => ctx.state.currentRoute === '/jobs',
  plantContextValid:   (ctx) => ctx.user.plantId != null,
  // ... one entry per check key used in any schema
}
```

**Rules:**
- Every key used in `eligibility.prerequisiteChecks` or `validation.check` must have an entry here
- Functions receive a `ValidationContext` — never direct component refs or DOM handles
- No function may call `setState`, `navigate`, fetch, or produce any observable effect
- New checks are added here first, then referenced in schema — never the reverse

---

### 5.2 `contextResolverRegistry`

**File:** `src/utils/guideContext.js`

Resolves `requiredContext[].source` values to runtime data. Called by the engine
during the eligibility check phase before a workflow starts.

```js
// Contract
type ContextResolver = () => Record<string, any>

type ContextSource = "session" | "selection" | "route" | "api"

// Registry shape
const contextResolverRegistry: Record<ContextSource, ContextResolver> = {
  session: () => ({
    plantId:  localStorage.getItem('selectedPlantId'),
    userId:   localStorage.getItem('currentUser'),
    userRole: localStorage.getItem('userRole'),
  }),
  selection: () => ({
    workOrderId:       state.selectedWorkOrder?.ID ?? null,
    workOrderStatusId: state.selectedWorkOrder?.StatusID ?? null,
    assetId:           state.selectedWorkOrder?.AstID ?? null,
  }),
  route: () => ({
    currentRoute: window.location.pathname,
  }),
  api: () => ({
    // reserved for async context that must be pre-fetched before workflow start
  }),
}
```

**Rules:**
- Resolvers are called once at workflow start — results are frozen into an eligibility snapshot
- Resolvers are synchronous where possible; async resolvers must complete before start gate
- Resolver functions do not modify state — they read and return only
- If a required context key resolves to `null`, the engine blocks with a specific message

---

### 5.3 `anchorResolver`

**File:** `src/utils/guideAnchor.js`

Resolves a `data-guide` anchor string to the target DOM element. Stateless. Called
by the engine when activating each step.

```js
// Contract
type AnchorResolver = (anchor: string) => HTMLElement | null

const resolveAnchor: AnchorResolver = (anchor) =>
  document.querySelector(`[data-guide="${anchor}"]`)
```

**Rules:**
- Never queries by class name, id, element type, or text content
- Returns `null` if the element is not found — never throws
- The engine treats a `null` result as a missing anchor error and shows the `onFailure` message
- Anchor strings must be lowercase kebab-case and globally unique across the application
- Naming convention: `{module}-{element}` — e.g. `closeout-button`, `parts-search-input`

**Anchor catalog (grows as workflows are added):**

| Anchor string | Element | Module |
|---|---|---|
| `closeout-button` | "Complete with Costs" / "Update Costs" button | WorkOrdersView |
| `closeout-labor-hours` | First labor hours input, wizard step 1 | CloseOutWizard |
| `closeout-parts-search` | Parts search input, wizard step 2 | CloseOutWizard |
| `closeout-submit-button` | "Confirm & Close Out" button, wizard step 3 | CloseOutWizard |
| `wo-list-row` | Work order list row (targets first match) | WorkOrdersView |

---

### 5.4 `riskGateEvaluator`

**File:** `src/utils/guideRiskGate.js`

Evaluates whether the current user is permitted to start a workflow at a given risk
level, and what confirmation behavior is required. Returns a decision object — never
performs any navigation or state mutation.

```js
// Contract
type RiskDecision = {
  allowed:              boolean,
  requiresConfirmation: boolean,
  blockedReason:        string | null  // i18n key, null if allowed without block
}

type RiskGateEvaluator = (risk: WorkflowRisk, user: UserContext) => RiskDecision

// Risk level → minimum role required
const RISK_ROLE_REQUIREMENTS = {
  low:      [],                                         // any authenticated user
  medium:   ['Technician','Supervisor','Manager','maintenance_manager','plant_manager','general_manager','it_admin','creator'],
  high:     ['Supervisor','Manager','maintenance_manager','plant_manager','general_manager','it_admin','creator'],
  critical: ['it_admin', 'creator'],
}

const evaluateRiskGate: RiskGateEvaluator = (risk, user) => {
  const permitted = RISK_ROLE_REQUIREMENTS[risk.level]
  const allowed = permitted.length === 0 || permitted.includes(user.role)
  return {
    allowed,
    requiresConfirmation: allowed && risk.requiresConfirmation,
    blockedReason: allowed ? null : 'guide.error.insufficientRole'
  }
}
```

**Rules:**
- The evaluator never modifies state — it returns a decision, the engine acts on it
- `blockedReason` is always an i18n key — never a raw string
- `critical` risk workflows additionally require the user to type a confirmation phrase
  (defined per-workflow in the schema as `risk.confirmationPhrase`)
- The evaluator is called once at workflow start, before any navigation occurs

---

## 6. Engine Lifecycle

`src/components/GuidedExecution.jsx` orchestrates all four registries. It owns no
logic of its own — every decision is delegated to a registry or derived from the schema.

```
LOAD
  └── Receive workflowId prop
  └── Look up schema from guidedWorkflows.js

ELIGIBILITY GATE
  └── Resolve requiredContext via contextResolverRegistry
  └── Run prerequisiteChecks against validationRegistry
  └── Evaluate risk via riskGateEvaluator
  └── If any check fails → BLOCKED state (show message, offer redirect if recovery exists)
  └── If requiresConfirmation → CONFIRM state (show modal, wait for explicit user proceed)

ACTIVE (per step)
  └── Navigate to target.route if not already there
  └── Resolve target.anchor via anchorResolver
  └── If anchor not found → show onFailure.message, apply onFailure.recovery
  └── Highlight resolved element (CSS outline, scroll into view)
  └── Show instruction (resolve i18n key) + step counter
  └── Wait for user action — engine does not trigger the action
  └── After user acts: run validation.check against validationRegistry
  └── If check returns false → show onFailure.message, apply recovery
  └── If check returns true → advance to next step (or COMPLETE if last)

COMPLETE
  └── Clear highlight
  └── Show completion message
  └── Log completion to audit trail (step sequence, timestamps, user, workflow id)
  └── Dismiss panel or return to manual section

EXIT (user-initiated at any step)
  └── Clear highlight
  └── No state modification
  └── No partial audit record written
  └── Panel dismissed

PAUSED (context lost mid-workflow — e.g. navigation away)
  └── Detect route change that does not match current step's target.route
  └── Pause workflow, dim panel
  └── Offer: Resume (navigate back) or Exit
```

**Engine rules:**
- The engine never calls `setState` on any component outside its own panel
- The engine never submits a form, clicks a button, or fills a field on the user's behalf
- Navigation is the only action the engine may perform autonomously — and only to reach
  the `target.route` declared in the step schema, never beyond
- The panel is a floating overlay — it does not mount inside the target component

---

## 7. Failure and Recovery Behavior

Each step's `onFailure.recovery` field declares what happens when `validation.check`
returns false after a user action.

| Recovery | Behavior |
|---|---|
| `retry` | Show failure message. Keep current step active. User tries again. |
| `block` | Show failure message. Step cannot advance. User must exit or resolve externally. |
| `redirect` | Navigate to the route where the prerequisite can be satisfied. Step does not advance. |
| `exit` | Show failure message. Guided mode exits cleanly. No partial audit record. |

**Context failure (eligibility check fails at start):**

| Failure | Behavior |
|---|---|
| Role insufficient | Block with `guide.error.insufficientRole` message. No redirect. |
| Required context null | Block with specific message for each missing key. Offer redirect if `source` implies a navigable prerequisite. |
| Prerequisite check fails | Block or redirect depending on which check failed. Each check key maps to a recovery strategy defined in `validationRegistry`. |

---

## 8. Audit Rules

A guided workflow completion is an auditable record of deliberate human actions.
The audit record must reflect exactly what the user did — not what the system did
on their behalf.

**What is recorded on successful completion:**
- `workflowId`
- `userId`, `userRole`, `plantId`
- Per-step: `stepId`, `completedAt` (timestamp), `validationResult`
- Total elapsed time
- Whether a risk confirmation was shown and accepted

**What is never recorded:**
- Partial completions (user exited before last step)
- Steps completed by system action rather than user action

**Audit destination:** `trier_logistics.db → AuditLog` table — same destination as all
other operational write-path audit records, for cross-plant visibility.

**The no-silent-autofix rule in audit terms:**
If the system performed any part of a step on the user's behalf, the audit record
cannot honestly represent that step as "user-completed." Therefore, the engine never
performs user-intent actions — not because it is technically difficult, but because
doing so would produce a fraudulent audit record.

---

## 9. Playwright Proof Requirements

`tests/e2e/guided-execution.spec.js`

The Playwright suite is the proof layer. It must demonstrate that all five invariants
hold against a running instance, not just that the UI renders.

**Required test coverage:**

| Test | What it proves |
|---|---|
| Start guided mode from manual section | Manual integration is wired |
| Eligibility block — wrong role | I-GE4: role gate works |
| Eligibility block — no work order selected | I-GE4: prerequisite check works |
| Step 1: navigate to `/jobs` | Engine navigates correctly |
| Step 1: anchor resolves and highlights | I-GE1: anchor targeting works |
| Step 1: validation fails on wrong state | I-GE3: state check, not click |
| Step 1: validation passes on correct state | I-GE3: correct state advances step |
| Step N: back navigation works | Engine state is reversible |
| Exit at any step: no side effects | Clean exit |
| Risk confirmation modal appears for medium+ | Risk gate works |
| High-risk: workflow blocked for Technician role | I-G4: risk level enforcement |
| Workflow completes: audit record written | Audit trail works |
| Refresh mid-workflow: exits or pauses safely | No zombie state |
| Anchor missing from DOM: shows failure message | Graceful anchor failure |
| Desktop (1280×800): target visible + panel not occluding at each step | I-GE5: panel docks away from target |
| Mobile (390×844): bottom sheet collapses before step activates | I-GE5: compact mode on constrained layout |

**Test discipline:**
- Tests run against a live server with real authentication — no mocks
- Playwright `fill()` for form fields; `keyboard.press` loop not used (see scanner testing memory)
- Stop on first failure. Fix root cause before continuing.
- Passing all tests is the acceptance gate for pilot completion

---

## 10. Preflight Gates (Phase 1.5)

Before any component code is written, these gates must be documented, verified by inspection,
and covered by Playwright stubs. Phase 2 does not start until all gates pass.

**The big rule:** Guided Execution must never become a second execution path. It guides the
user through the existing path — it does not create a shortcut around it.

---

### 10.1 Regression Gates

| Gate | Requirement |
|---|---|
| Additive only | Adding guided mode changes no existing behavior — no component logic, no route, no API |
| Manual paths unchanged | Search, filter, print, Go There, Go to Code all work identically with guided mode disabled |
| Close-out works without guide | The existing close-out workflow completes end-to-end with guided mode off |
| Anchors are passive | All `data-guide` attributes are inert data attributes — no event listeners, no CSS targeting |
| No guide-dependent business logic | No route, API call, or state transition may check whether the guide is active |
| No test replacement | No existing Playwright test is modified or deleted to accommodate guided mode |
| Fail closed | If schema, anchor, context, or validation is missing or malformed, guided mode exits — it does not degrade silently |

---

### 10.2 Edge-Case Gates

Each of these scenarios must have a defined, tested behavior before Phase 2 begins.

| Scenario | Required behavior |
|---|---|
| Missing anchor | Show `onFailure.message`, apply `onFailure.recovery` — never crash |
| Duplicate anchor | Engine uses the first match; log a console warning in development |
| Target hidden | Scroll into view; if still hidden after scroll, treat as missing anchor |
| Target disabled | Show `onFailure.message` with guidance to enable it — do not auto-enable |
| Target off-screen | Scroll into view before activating step |
| Mobile viewport obstruction | Panel collapses to compact step bar before step activates (I-GE5) |
| User loses role mid-flow | Re-evaluate eligibility; block with role error if role no longer qualifies |
| Work order closed from another session | Prerequisite check fails on next validation; show recovery message |
| Plant context changes mid-flow | Detect context mismatch; pause workflow and prompt user to exit |
| Network/API failure during validation | `api` validation check returns false; apply `onFailure.recovery` |
| Browser refresh mid-guide | Guided mode exits; no zombie state; user returns to normal view |
| User exits guide mid-step | Clean exit — no side effects, no partial audit record |
| Language changes mid-guide | i18n keys re-resolve at render; no selector breaks; workflow continues |
| Viewport shift during step | On resize, orientation change, or mobile keyboard open, the engine re-evaluates anchor visibility and repositions the guide panel before allowing step continuation — I-GE5 applies dynamically, not just at step start |

---

### 10.3 Security Gates

| Gate | Requirement |
|---|---|
| No permission elevation | Guided mode cannot grant access to a route or action the user's role cannot reach directly |
| No RBAC bypass | Risk gate and role check run before any navigation or instruction renders |
| No auto-submit | The engine never calls submit, POST, PUT, PATCH, or DELETE on the user's behalf |
| No session mutation | The engine never modifies `localStorage`, auth tokens, plant context, or user session |
| No schema code execution | Schema is declarative data only — no `eval`, no dynamic `require`, no function literals |
| Validation registry allowlist | Only keys registered in `validationRegistry` at build time are callable — unknown keys fail closed |
| Workflow ID allowlist | Only workflow IDs registered in `guidedWorkflows.js` at build time are startable — unknown IDs fail closed |
| Risk gates before render | `riskGateEvaluator` runs before any step instruction or navigation is shown to the user |
| Critical workflow confirmation | `critical`-risk workflows require an explicit typed confirmation phrase before starting |
| Writes use existing paths | Guided mode completion triggers no new write paths — all audit records, status changes, and cost records go through the same API routes used without guided mode |
| Schema integrity | Workflow schema is static and version-controlled — it is never user-editable at runtime; workflow IDs, validation keys, and context sources are resolved from allowlisted registries only; no `eval`, `Function()`, or dynamic import is permitted from any schema field |

---

### 10.4 Playwright Preflight Coverage

These tests are added as stubs in Phase 1.5 and completed in Phase 9. No test may be marked
passing until it runs against a live instance with real auth.

| Test | Gate category |
|---|---|
| Guided mode disabled: manual search/filter/print/Go There work | Regression |
| Guided mode disabled: close-out workflow completes end-to-end | Regression |
| Guided mode enabled: close-out workflow completes (desktop, 1280×800) | Regression + I-GE5 |
| Guided mode enabled: close-out workflow completes (mobile, 390×844) | Regression + I-GE5 |
| Missing anchor: guided mode fails closed with message | Edge-case |
| Permission denied: guided mode blocks before navigation | Security + I-GE4 |
| Context loss mid-flow: guided mode pauses or exits cleanly | Edge-case |
| Auto-submit assertion: no POST/PUT/PATCH/DELETE triggered by engine | Security |
| Console errors: zero errors on any guided or normal path | Regression |

---

## 11. Pilot Workflow: Close Out a Work Order

The pilot workflow is the proof of pattern. Every subsequent workflow is replication
of this one. It must pass every invariant check and every Playwright test before any
other workflow is started.

**Workflow schema:**

```js
{
  id:              'close-out-work-order',
  title:           'guide.closeout.title',
  manualSectionId: 'work-order-closeout',

  eligibility: {
    roles: ['Technician', 'Supervisor', 'Manager', 'maintenance_manager', 'plant_manager', 'general_manager'],
    requiredContext: [
      { key: 'plantId',      source: 'session'   },
      { key: 'workOrderId',  source: 'selection' }
    ],
    prerequisiteChecks: ['workOrderSelected', 'workOrderNotClosed', 'plantContextValid']
  },

  risk: {
    level:                'medium',
    requiresConfirmation: false,
    allowAutoAction:      false
  },

  steps: [
    {
      id:          'navigate-to-jobs',
      instruction: 'guide.closeout.step1',
      target:   { route: '/jobs',  anchor: 'wo-list-row'         },
      action:   { type: 'navigate' },
      validation: { type: 'dom',   check: 'onJobsRoute'          },
      onFailure: { message: 'guide.closeout.step1.fail', recovery: 'retry' }
    },
    {
      id:          'select-work-order',
      instruction: 'guide.closeout.step2',
      target:   { route: '/jobs',  anchor: 'wo-list-row'         },
      action:   { type: 'click'    },
      validation: { type: 'state', check: 'workOrderSelected'    },
      onFailure: { message: 'guide.closeout.step2.fail', recovery: 'retry' }
    },
    {
      id:          'open-closeout-wizard',
      instruction: 'guide.closeout.step3',
      target:   { route: '/jobs',  anchor: 'closeout-button'     },
      action:   { type: 'click'    },
      validation: { type: 'dom',   check: 'closeoutWizardOpen'   },
      onFailure: { message: 'guide.closeout.step3.fail', recovery: 'retry' }
    },
    {
      id:          'record-labor',
      instruction: 'guide.closeout.step4',
      target:   { route: '/jobs',  anchor: 'closeout-labor-hours' },
      action:   { type: 'fill'    },
      validation: { type: 'state', check: 'closeoutLaborEntered'  },
      onFailure: { message: 'guide.closeout.step4.fail', recovery: 'retry' }
    },
    {
      id:          'add-parts',
      instruction: 'guide.closeout.step5',
      target:   { route: '/jobs',  anchor: 'closeout-parts-search' },
      action:   { type: 'fill'    },
      validation: { type: 'state', check: 'closeoutPartsAdded'    },
      onFailure: { message: 'guide.closeout.step5.fail', recovery: 'retry' }
    },
    {
      id:          'submit-closeout',
      instruction: 'guide.closeout.step6',
      target:   { route: '/jobs',  anchor: 'closeout-submit-button' },
      action:   { type: 'click'    },
      validation: { type: 'api',   check: 'closeoutSubmitSucceeded' },
      onFailure: { message: 'guide.closeout.step6.fail', recovery: 'retry' }
    }
  ]
}
```

**Acceptance criteria (pilot complete when all pass):**
- [ ] Guided mode starts from the manual section for the close-out workflow
- [ ] Eligibility gate blocks users without a selected work order
- [ ] Eligibility gate blocks users without a valid plant context
- [ ] Engine navigates to `/jobs` if not already there
- [ ] Each step highlights the correct element via `data-guide` anchor
- [ ] Step validation checks state — not click events
- [ ] User can go Back through any step
- [ ] User can Exit at any step with no side effects
- [ ] Successful completion writes an audit record to `trier_logistics.db`
- [ ] Playwright test suite passes with zero failures
- [ ] No console errors during any path through the workflow

---

*Trier OS v3.6.2 — docs/GUIDED_EXECUTION_DESIGN.md*  
*© 2026 Doug Trier — Released under the MIT License*
