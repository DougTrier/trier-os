# Trier OS — Manual QA Inspection Checklist
> Version 3.4.0 · Generated 2026-04-13
> Work top-to-bottom. Each section maps directly to a P-phase in the roadmap.
> Mark ✅ pass · ❌ fail (note symptom) · ⏭ skipped (note why)

---

## Setup Before Testing

- [ ] Server running: `npm start` — confirm `Trier OS server listening on port 3000`
- [ ] No console errors on startup (check terminal)
- [ ] Open app in browser, log in as a **maintenance_manager** role first
- [ ] Confirm plant selector shows at least one plant (e.g. Plant_1)
- [ ] Switch to **creator** role for corporate/admin sections

---

## P1 — Zero-Keystroke Execution (Scan Workflow)

**Location:** Header scan button (top-right) OR Sidebar → `/scanner`

- [ ] **Open scanner** — click the scan icon in the global header; modal opens
- [ ] **Numeric entry** — type a known asset ID; asset context loads correctly
- [ ] **Action prompt** — after scan, correct action buttons appear for asset type (e.g. Create WO, View Asset)
- [ ] **Create WO on first scan** — scan an asset with no open WO; confirm a new WO is auto-created
- [ ] **Mid-state options** — on an in-progress WO, scan again; verify Close / Waiting / Escalate / Continue Later buttons appear
- [ ] **Context flash** — confirm 1-second confirmation overlay fires on a successful scan action
- [ ] **Scan idempotency** — submit the same scanId twice; confirm only one record is created (no duplicate WO or segment)
- [ ] **Offline queue** — disable network (DevTools → Network → Offline); scan an asset; re-enable; confirm queued scan syncs automatically and no data is lost
- [ ] **Silent Auto-Close flag** — find an InProgress segment older than 12 hours; confirm `needsReview` flag is present; confirm it appears in the Mission Control supervisor queue

---

## P2 — Pilot Blockers

### Failure Domain Isolation
**Location:** Backend health endpoint — `GET /api/health`

- [ ] **Health endpoint** — `GET /api/health` returns `{ status: "ok", degradedMode: false }` (or degraded mode reason)
- [ ] **Advisory-only mode** — with Gatekeeper offline (conceptual — verify docs at `docs/p2/`) spec matches current architecture
- [ ] **Failure Test Report** — open `docs/p3/Failure_Test_Report_v1.md`; confirm T1–T7 test matrix is documented

### Governed Write Path
- [ ] **RBAC enforcement** — log in as `technician` role; attempt a plant-setup write (PUT /api/plant-settings); confirm 403 response
- [ ] **Audit trail** — perform any create/update action; navigate to `/governance` → Security Audit tab; confirm the event appears in the log with timestamp, user, and action

### Operational Support
- [ ] **Runbooks accessible** — verify `docs/p2/` directory contains incident runbook files
- [ ] **Versioning** — check `package.json` shows version `3.4.0`

---

## P3 — Advisory Mode Value

### Maintenance KPIs
**Location:** Sidebar → `/dashboard` (DashboardView) AND `/corp-analytics` → Maintenance KPIs tab

- [ ] **Planned vs Unplanned ratio** — `GET /api/maintenance-kpis/planned-ratio?plantId=Plant_1` returns `{ planned, unplanned, ratio }` with non-null values
- [ ] **PM Compliance rate** — `GET /api/maintenance-kpis/pm-compliance?plantId=Plant_1` returns `{ compliant, total, rate }` where rate is 0–100
- [ ] **Backlog Aging** — `GET /api/maintenance-kpis/backlog-aging?plantId=Plant_1` returns 4 buckets: `0_7`, `8_30`, `31_90`, `90_plus`
- [ ] **Downtime Cost** — `GET /api/maintenance-kpis/downtime-cost?plantId=Plant_1` returns aggregate cost figure
- [ ] **Dashboard KPI cards** — `/dashboard` renders 5 KPI cards (Open WOs, PM Compliance %, MTBF, Downtime Cost, Backlog)
- [ ] **Corp Analytics → Maintenance KPIs tab** — `/corp-analytics` → switch to Maintenance KPIs section; 4 KPI cards render, planned/unplanned chart appears, PM compliance table loads

### CAPA Tracking
**Location:** `GET /api/capa` and `/engineering-tools` → RCA tab

- [ ] **List CAPAs** — `GET /api/capa?plantId=Plant_1` returns array (may be empty — no error)
- [ ] **Create CAPA** — `POST /api/capa` with `{ title, plantId, rcaId, owner, dueDate }` returns 201 with new ID
- [ ] **Update CAPA** — `PUT /api/capa/:id` with `{ status: "Completed" }` returns updated record
- [ ] **Overdue escalation** — `GET /api/capa/overdue` returns list of CAPAs past due date with status auto-updated to `Overdue`
- [ ] **Delete CAPA** — `DELETE /api/capa/:id` returns 204

### Maintenance Budget
**Location:** `/analytics` → Budget tab AND `GET /api/maintenance-budget`

- [ ] **Create budget record** — `POST /api/maintenance-budget` with `{ plantId, year, month, category, budgetedAmount }` returns 201
- [ ] **Upsert (conflict)** — POST same plantId/year/month/category again with different amount; confirm record is updated, not duplicated
- [ ] **Variance report** — `GET /api/maintenance-budget/variance?plantId=Plant_1` returns 12-month grid with `budgeted`, `actual`, `variance` columns
- [ ] **Budget UI** — `/analytics` → Budget tab shows 12-month chart with budget vs actual bars

### Asset Criticality
**Location:** `/assets` → any asset → Edit

- [ ] **Criticality fields present** — open any asset edit form; confirm fields exist for Safety, Environmental, Production, Probability scores
- [ ] **CriticalityScoreTotal** — save an asset with all 4 dimension scores set; confirm `CriticalityScoreTotal` is stored (sum visible on asset card or API response)

---

## P4 — Safety & Compliance

### Permit to Work (PTW)
**Location:** Sidebar → `/safety` → Permits tab

- [ ] **Create HOT_WORK permit** — fill permit form with asset, type=HOT_WORK, issuedBy, expiresAt; submit; confirm permit number generated (format: `PTW-XXXXXX`)
- [ ] **Create COLD_WORK permit** — repeat with type=COLD_WORK; confirm checklist auto-populates (8 items including "no ignition sources", "PPE verified")
- [ ] **Simultaneous ops conflict** — create a second permit on the same asset with the same type while first is ACTIVE; expect **HTTP 409** with conflict details in response body
- [ ] **Permit approval workflow** — approve a DRAFT permit; status changes to ACTIVE
- [ ] **Auto-expiry** — set expiry in the past; GET that permit; confirm status shows EXPIRED
- [ ] **Permit audit trail** — every status change should appear in the permit's audit log array
- [ ] **LOTO workflow** — navigate `/loto`; create a lockout-tagout record; add isolation point; confirm status progression (DRAFT → ACTIVE → RELEASED)

### Management of Change (MOC)
**Location:** `GET/POST /api/moc` (no dedicated UI page yet — test via API or engineering tools)

- [ ] **Create MOC (standard)** — `POST /api/moc` with `{ title, plantId, changeType: "EQUIPMENT", requestedBy }` returns 201 with MOCNumber (format: `MOC-YYYY-XXXXXX`) and 3 approval stages auto-created
- [ ] **Create MOC (emergency)** — changeType=`EMERGENCY`; confirm only 1 approval stage created
- [ ] **Create MOC (temporary)** — changeType=`TEMPORARY`; confirm 2 approval stages created
- [ ] **Advance approval** — `POST /api/moc/:id/approve` with `{ approverEmail, decision: "APPROVED" }`; confirm stage advances; final approval sets MOC status to `APPROVED`
- [ ] **Reject approval** — `POST /api/moc/:id/approve` with `{ decision: "REJECTED", notes }`; confirm MOC status goes to `REJECTED`
- [ ] **Affected items** — `POST /api/moc/:id/affected` with `{ itemType: "ASSET", itemId }`; `GET /api/moc/:id/affected` returns that item
- [ ] **PSSR flag** — `PUT /api/moc/:id` with `{ PSSRRequired: 1, PSSRCompletedAt: "2026-04-12" }`; confirm stored

### Training & Competency
**Location:** Sidebar → `/training`

- [ ] **Course library loads** — Training → Course Library tab shows ≥ 24 default courses
- [ ] **Log completion** — add a training completion record for a user with course, completedAt, score, expiresAt
- [ ] **Expiry alert** — a cert expiring within 30 days shows amber indicator; expired cert shows red
- [ ] **Compliance matrix** — Training → Compliance Score tab shows % of required training current
- [ ] **`GET /api/training/expiring`** — returns list of certs expiring within 30 days

### Contractor Management
**Location:** Sidebar → `/contractors`

- [ ] **Contractor list loads** — page renders without error; at least one contractor visible or empty state shown cleanly
- [ ] **COI expiry** — a contractor with expired Certificate of Insurance shows expiry alert
- [ ] **Safety inductions** — `POST /api/contractors/:id/inductions` with `{ plantId, inductedBy, inductionType }`; returns 201
- [ ] **`GET /api/contractors/:id/inductions`** — returns induction records for that contractor
- [ ] **Job history** — `GET /api/contractors/:id/jobs` returns WO history for contractor

---

## P5 — Growth & Revenue

### Quality Control (QC / NCR)
**Location:** Sidebar → `/quality-log`

- [ ] **Quality dashboard loads** — page renders; Product Loss Log, Lab Results, Quality Summary tabs visible
- [ ] **Defect code library** — `GET /api/qc/defect-codes` returns ≥ 10 default codes (SURFACE_DEFECT, DIMENSIONAL_ERROR, etc.)
- [ ] **Create NCR** — `POST /api/qc/ncr` with `{ plantId, defectCodeId, title, severity }` returns 201 with NCRNumber (format: `NCR-YYYY-XXXXXX`)
- [ ] **Update NCR status** — `PUT /api/qc/ncr/:id` with `{ status: "Under Review" }`; confirm updated
- [ ] **Pareto analysis** — `GET /api/qc/pareto?plantId=Plant_1` returns defect codes ranked by count with cumulative % per row
- [ ] **First Pass Yield** — `GET /api/qc/fpy?plantId=Plant_1` returns `{ total, passed, failed, fpy }` (returns safe empty if no LabResult table)
- [ ] **Checksheet create/submit** — `POST /api/qc/checksheets` creates a checksheet; `POST /api/qc/checksheets/:id/results` submits pass/fail per item
- [ ] **Lab results tab** — enter a cryoscope reading below −0.525°H; confirm FAIL status and water % estimate

### Operator Care (Autonomous Maintenance)
**Location:** `GET/POST /api/operator-care` — no dedicated standalone UI page; routes/procedures module

- [ ] **Create inspection route** — `POST /api/operator-care/routes` with `{ name, plantId, frequency }` returns 201
- [ ] **Add steps** — `POST /api/operator-care/routes/:id/steps` with `{ stepOrder, instruction, assetId, expectedValue, passCriteria }`
- [ ] **Submit inspection session** — `POST /api/operator-care/sessions` creates a session; `POST /api/operator-care/results` with batch results including at least one `{ result: "Fail", assetId }`
- [ ] **Auto-WO creation** — confirm response includes `autoWOsCreated: 1` for the failing step; verify a new WO with `WOSource=UNPLANNED` and `StatusID=20` exists in the plant DB for that asset

### Shutdown / Turnaround Management
**Location:** `/api/turnaround` (no dedicated UI — test via API)

- [ ] **Create project** — `POST /api/turnaround/projects` with `{ name, plantId, startDate, endDate, plannedBudget }`; returns 201 with project ID
- [ ] **Add tasks** — `POST /api/turnaround/projects/:id/tasks` with `{ name, durationDays, assignedContractorId }`; returns 201
- [ ] **Critical path flag** — create task with `{ isCriticalPath: true }`; `GET /api/turnaround/projects/:id/progress` shows `criticalRemaining` count
- [ ] **Task dependency** — create task with `{ dependsOnTaskId: <existingTaskId> }`; verify foreign key accepted
- [ ] **Budget rollup** — `GET /api/turnaround/projects/:id/budget` returns `{ plannedBudget, taskSum, variance }`

### Predictive Maintenance
**Location:** Sidebar → `/dashboard` → Predictive Foresight widget AND `/analytics` → MTBF tab

- [ ] **MTBF endpoint** — `GET /api/predictive-maintenance/mtbf?plantId=Plant_1` returns array with `assetId, mtbfDays, nextPredicted` (may be empty if no unplanned WO history)
- [ ] **Risk ranking** — `GET /api/predictive-maintenance/risk-ranking?plantId=Plant_1` returns assets sorted by `riskScore` descending
- [ ] **Forecast** — `GET /api/predictive-maintenance/forecast?plantId=Plant_1` returns assets grouped into 30/60/90-day windows
- [ ] **Asset profile** — `GET /api/predictive-maintenance/asset/:assetId?plantId=Plant_1` returns `{ mtbfDays, mttr, failureCount, driftSeverity }`
- [ ] **Dashboard widget** — `/dashboard` renders a Predictive Foresight card with health score and risk level for at least one asset
- [ ] **MTBF Analytics tab** — `/analytics` → MTBF Dashboard shows risk-ranked asset list with predicted failure dates

### Energy / Sub-Metering
**Location:** Sidebar → `/utilities`

- [ ] **Readings tab** — navigate Utilities → Readings; enter a kWh reading; confirm it saves
- [ ] **Anomaly detection** — Utilities → Anomalies tab loads without error; shows any readings deviating >2σ
- [ ] **ESG report** — Utilities → ESG Report tab renders Scope 1/2/3 estimates
- [ ] **`GET /api/energy/summary?plantId=Plant_1`** — returns monthly totals by utility type
- [ ] **TOU / arbitrage** — `GET /api/energy/tou?plantId=Plant_1` returns time-of-use rate schedule if configured

---

## P6 — Platform Maturity

### Compliance Packs (ISO / OSHA / FDA)
**Location:** Sidebar → `/compliance`

- [ ] **Frameworks load** — Compliance page renders; OSHA, EPA, FDA frameworks visible (or can be created)
- [ ] **Create framework** — POST `/api/compliance/frameworks` with `{ name, code, plantId }` returns 201
- [ ] **Create checklist item** — POST `/api/compliance/checklists` linked to a framework returns 201
- [ ] **Schedule inspection** — POST `/api/compliance/inspections` with framework + date returns 201
- [ ] **Complete inspection** — PUT `/api/compliance/inspections/:id` with `{ status: "completed", score: 92 }` returns updated record
- [ ] **Compliance stats** — `GET /api/compliance/stats?plantId=Plant_1` returns `{ overallScore, overdueCount, byFramework }`

### Vibration & Condition Monitoring
**Location:** `/api/vibration` (data surfaced in asset detail and predictive widgets)

- [ ] **Create vibration profile** — `POST /api/vibration/profiles` with `{ plantId, assetId, measurementPoint: "DE", alertThreshold: 4.5, dangerThreshold: 11.2 }`; returns 201; duplicate POST updates via upsert (no duplicate error)
- [ ] **Submit reading (NORMAL)** — `POST /api/vibration/readings` with `velocityRms: 2.1`; confirm severity = `NORMAL`; no alert created
- [ ] **Submit reading (ALERT)** — `velocityRms: 6.5`; confirm severity = `ALERT`; check `VibrationAlerts` entry created with `Status=ACTIVE`
- [ ] **Submit reading (DANGER)** — `velocityRms: 12.0`; confirm severity = `DANGER`; alert created with `AlertType=DANGER`
- [ ] **Trending** — `GET /api/vibration/trending/:assetId?plantId=Plant_1` returns readings array with severity classification per point
- [ ] **Active alerts** — `GET /api/vibration/alerts?plantId=Plant_1&status=ACTIVE` returns unresolved alerts
- [ ] **Acknowledge alert** — `PUT /api/vibration/alerts/:id` with `{ status: "ACKNOWLEDGED" }` returns updated alert

### ERP Connectors
**Location:** Sidebar → `/import-api`

- [ ] **Connector catalog** — `GET /api/erp-connectors/catalog` returns 5 connectors (SAP S/4HANA, Oracle EBS, Dynamics 365, Infor CloudSuite, Custom REST)
- [ ] **Create connector instance** — `POST /api/erp-connectors` with `{ plantId, connectorType: "SAP", name, host }` returns 201
- [ ] **Test connection** — `POST /api/erp-connectors/:id/test`; returns `{ reachable: true/false, status }` (ACTIVE or ERROR depending on host reachability)
- [ ] **Field mappings** — `PUT /api/erp-connectors/:id/mappings` with array of `{ sourceField, targetField, eventType }` returns 200; re-PUT replaces all mappings for that eventType (no duplicates)
- [ ] **Import-API page loads** — `/import-api` renders without error; shows integration configuration UI

### Report Builder
**Location:** Sidebar → `/analytics`

- [ ] **Execute report** — `POST /api/report-builder/execute` with valid SQL query body (plant-scoped); returns rows array
- [ ] **CSV export** — add `?format=csv` to the same request; confirm response has `Content-Type: text/csv` and `Content-Disposition: attachment; filename="report_..."` header
- [ ] **Report UI** — `/analytics` → Report Builder tab; enter a query, run it, see results table
- [ ] **Saved reports** — save a report definition; retrieve it by ID
- [ ] **Security** — attempt a query with `DROP TABLE`; confirm it is rejected (query allowlist or read-only enforcement)

---

## P7 — Category-Defining Capabilities

### Plant Behavioral Baseline Engine
**Location:** `GET/POST /api/baseline`

- [ ] **Recalculate baselines** — `POST /api/baseline/recalculate` with `{ plantId: "Plant_1" }` returns `{ ok: true, calculated: N, skipped: M }` (N ≥ 0)
- [ ] **Asset baseline** — `GET /api/baseline/asset/:assetId?plantId=Plant_1` returns `{ failureFreq, meanLaborHours, mtbfDays, driftSeverity }` OR 404 with "Insufficient WO history" message (both are correct)
- [ ] **Drift list** — `GET /api/baseline/drift?plantId=Plant_1` returns array of assets with `DriftSeverity` = WARNING or ALERT (may be empty)
- [ ] **Dashboard summary** — `GET /api/baseline/dashboard?plantId=Plant_1` returns `{ total, alerts, warnings, stable }`
- [ ] **Drift severity logic** — if an asset has 2+ drift flags, confirm `DriftSeverity=ALERT`; 1 flag = `WARNING`; 0 flags = `NONE`

### Explainable Operations Engine / Causality Graph
**Location:** `GET /api/causality`

- [ ] **Asset timeline** — `GET /api/causality/timeline/:assetId?plantId=Plant_1` returns `{ eventCount, events[] }` with events sorted by timestamp ascending (may be empty array — no error)
- [ ] **Event types** — if events exist, confirm each has `{ type, timestamp, label, source }` fields
- [ ] **WO causal chain** — `GET /api/causality/chain/:woId?plantId=Plant_1` returns `{ wo, linkedRCA, linkedCAPAs, chain[] }`; `chain` contains events with `isAnchor: true` on the WO's own events
- [ ] **Cross-system summary** — `GET /api/causality/summary` returns `{ openRCAs, openCAPAs, newRCAs30, activeVibrationAlerts }` with integer values
- [ ] **ERP events in chain** — if ERPOutbox table has records for the asset, verify `ERP_SYNC` event type appears in timeline

### Failure Containment Scoring
**Location:** `GET /api/containment`

- [ ] **Score endpoint** — `GET /api/containment/score/:assetId?plantId=Plant_1` returns `{ score, tier, emoji, color, topFactor, computedAt }` — tier is one of ISOLATED/PARTIAL/CASCADING
- [ ] **Tier thresholds** — manually verify: score 0–3 = ISOLATED🟢 / 4–7 = PARTIAL🟡 / 8+ = CASCADING🔴
- [ ] **Blast radius** — `GET /api/containment/blast-radius/:assetId?plantId=Plant_1` returns full result plus `childAssets[]` array
- [ ] **Dashboard scan** — `GET /api/containment/dashboard?plantId=Plant_1` returns `{ summary: { cascading, partial, isolated }, assets[] }` sorted score descending
- [ ] **Factor scoring** — find an asset with `CriticalityScoreTotal ≥ 15` and at least 1 open WO; confirm score ≥ 4 (PARTIAL or CASCADING)

### Time Machine & Operator Trust Layer (Spec Review)
- [ ] **Time Machine spec** — open `docs/p7/Time_Machine_Spec.md`; confirm state snapshot model, shadow DB isolation plan, and planned API are documented
- [ ] **Operator Trust Layer spec** — open `docs/p7/Operator_Trust_Layer_Spec.md`; confirm trust signal anatomy, `OperatorDecisions` schema, confidence scoring table, and feedback loop are documented
- [ ] **Safe Action Certification spec** — open `docs/p3/Parallel_Universe_Spec.md`; confirm proof receipt JSON schema and Gatekeeper prerequisite list are present

---

## Corporate Analytics (Cross-Plant)

**Location:** Sidebar → `/corp-analytics` (requires creator or executive role)

- [ ] **Page loads** — switch to creator role; navigate `/corp-analytics`; all section tabs render without JS error
- [ ] **Overview section** — headline cards show total plants, assets, open WOs, PM compliance
- [ ] **Plant Rankings** — table renders with plants ranked by performance metric
- [ ] **Financial section** — cross-plant spend bar chart renders
- [ ] **Risk Matrix** — 2×2 heatmap renders with at least one plant plotted
- [ ] **Maintenance KPIs section** — 4 KPI cards appear; planned/unplanned ratio chart loads; PM compliance table populates
- [ ] **OpEx Intelligence** — phantom drain, product loss, expedited spend cards render
- [ ] **Forecast section** — 12-month projection chart with confidence bands renders

---

## Governance & Audit

**Location:** Sidebar → `/governance` (admin/creator role)

- [ ] **Security Audit tab** — shows append-only log; entries have timestamp, user, action, IP
- [ ] **Login Activity tab** — shows per-user login history
- [ ] **CSV export** — click Export; file downloads with correct Content-Disposition header
- [ ] **Filter by user** — filter audit log by a specific user; results narrow correctly
- [ ] **Immutability** — confirm there is no Delete button or bulk-clear option in the audit log UI

---

## Global / Cross-Cutting

- [ ] **Plant selector** — switch between plants; all data refreshes to the selected plant (no stale cross-plant data)
- [ ] **Role enforcement** — log in as `technician`; confirm corporate analytics tile is not visible / route shows 403
- [ ] **Offline banner** — disable network; red offline banner appears within ~5 seconds
- [ ] **Offline read** — while offline, navigate to Work Orders; cached data still displays
- [ ] **Reconnect sync** — re-enable network; offline queued actions sync; banner dismisses
- [ ] **Print portal** — trigger a print from any module (e.g. RCA detail → Print); confirm print preview opens without JS error
- [ ] **No duplicate API mounts** — `GET /api/compliance` resolves to one handler; no 404 or double-response
- [ ] **Build clean** — `npm run build` completes with exactly 3 pre-existing warnings (NODE_ENV, OfflineDB dynamic import, bundle size); zero new errors

---

## Regression Checks (Core Workflows)

These are existing features — confirm nothing broke during P1–P7 additions.

- [ ] **Create WO manually** — `/jobs` → New Work Order; fill form; save; confirm appears in list with correct status
- [ ] **Close WO** — change WO status to Completed; confirm `CompDate` populated; if asset has `HourlyProductionValue`, confirm `DowntimeCost` auto-calculated
- [ ] **PM schedule** — `/jobs` → PM Schedules tab; create a PM schedule; confirm it appears in the calendar view
- [ ] **Asset create/edit** — `/assets` → Add Asset; fill required fields; save; confirm asset appears with correct criticality score
- [ ] **Parts inventory** — `/parts` → add a part; adjust stock; confirm quantity updated
- [ ] **RCA create** — `/engineering-tools` → RCA tab; open a new RCA; add 5-Why entries; save; confirm status = Open
- [ ] **CAPA linked to RCA** — from the RCA record, create a linked CAPA; confirm CAPA appears in `/api/capa?rcaId=X`
- [ ] **Training log** — `/training` → log a completion record; confirm it appears in Training Records tab
- [ ] **Contractor record** — `/contractors` → add contractor; confirm COI expiry date saves and shows alert if past due

---

*Testing sequence recommended: P1 → Regression → P3 KPIs → P4 Safety → P5 QC → P6 Vibration → P7 APIs → Corporate → Governance*
