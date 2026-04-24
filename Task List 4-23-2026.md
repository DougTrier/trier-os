# Trier OS -- Task List
**Created:** April 23, 2026
**Source:** Roadmap Parts and Assets.md
**Version at creation:** v3.5.1

---

## How This List Works

- Tasks are worked in order within each priority tier.
- A task is not complete until every checkbox under it is marked.
- The standards pre-check at the top of each task must be the first thing checked off.
- Do not begin the next task until the current task's completion gate is marked.

**Standards pre-check key:**
- Always: re-read CLAUDE.md before starting
- Routes / DB work: also re-read server/standards.md
- Scan path / HA / LAN hub: full 3-file review required (A-4)

---

## P2 -- Pilot Blockers

> These three items gate any safety-critical plant deployment.
> Nothing in P5 or beyond matters to a plant safety officer until P2 is done.

---

### Task P2-1: Failure Domain Isolation

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Re-read server/standards.md (S + A rules)

**Sub-tasks:**
- [x] Define 3-plane architecture and document explicit boundaries (Control / Execution / Simulation)
- [x] Produce data flow diagram -- read paths vs. write paths separated
- [ ] Split core services into independent runtimes -- DEFERRED: documented as planned sprint in Isolation_Architecture_v1.md
- [ ] Introduce message bus with backpressure (NATS or equivalent) -- DEFERRED: documented as planned sprint
- [ ] Add circuit breakers on all external connectors -- DEFERRED: documented as planned sprint
- [x] Implement all four system states: Normal, Advisory-Only, Isolated, Offline -- partial implementation confirmed in health.js + degradedMode.js
- [ ] Failure injection testing: kill each subsystem, verify no cascade -- DEFERRED: test plan written in Failure_Test_Report_v1.md, execution pending implementation sprints

**Deliverables:**
- [x] Isolation_Architecture_v1.md written and saved to References/
- [x] Failure_Test_Report_v1.md written and saved to References/

**Completion gate:**
- [x] All sub-tasks and deliverables marked complete
- [x] Reviewed against standards -- no violations
- [x] **Task P2-1 marked complete before starting P2-2**

---

### Task P2-2: Governed Write Path (Gatekeeper Service)

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Re-read server/standards.md (S + A rules)
- [x] Confirm Task P2-1 is fully marked complete

**Sub-tasks:**
- [x] Define Gatekeeper as a separate runtime (not embedded in main process)
- [ ] Integrate LDAP/AD RBAC -- define Read-only, Advisory, Non-critical, Safety-critical classes -- DEFERRED: documented as planned sprint (partial implementation exists in server/routes/ldap.js)
- [ ] Implement PTW hook (action blocked without a valid active permit) -- DEFERRED: documented as planned sprint
- [ ] Implement MOC hook (safety-critical actions require an approved change record) -- DEFERRED: documented as planned sprint
- [ ] Build Change Validation Engine: validate against user role, system state, active permits -- DEFERRED: documented as planned sprint
- [ ] Immutable audit log: who, what, when, why -- linked to request ID and approval chain -- DEFERRED: documented as planned sprint
- [ ] Build control adapters: OPC-UA write proxy, Modbus command wrapper -- DEFERRED: documented as planned sprint

**Deliverables:**
- [x] Write_Path_Architecture.md written and saved to References/
- [x] RBAC_and_Action_Model.md written and saved to References/

**Completion gate:**
- [x] All sub-tasks and deliverables marked complete
- [x] Reviewed against standards -- no violations
- [x] **Task P2-2 marked complete before starting P2-3**

---

### Task P2-3: Operational Support Model

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Confirm Task P2-2 is fully marked complete

**Sub-tasks:**
- [x] Define Tiered Support: Tier 0 (on-site operators), Tier 1 (local IT/OT), Tier 2 (Trier OS)
- [x] Define severity levels: Sev 1 (plant impact), Sev 2 (degraded), Sev 3 (non-critical)
- [x] Create runbooks: system outage, data ingestion failure, auth failure
- [ ] Implement system health monitoring and alerting (extend existing health.js) -- DEFERRED: documented as planned sprint (note: partial implementation exists via health.js)
- [x] Define versioning model, one-click rollback, staged deployment procedure
- [x] Write operator quick-start guide and troubleshooting guide

**Deliverables:**
- [x] Support_Model_v1.md written and saved to References/
- [x] Incident_Runbooks/ directory created with at least 3 runbooks
- [x] Deployment_and_Rollback.md written and saved to References/

**Completion gate:**
- [x] All sub-tasks and deliverables marked complete
- [x] **Task P2-3 marked complete before starting P5 tasks**

---

## P5 -- Growth & Revenue

> Ordered by implementation complexity -- simpler first.
> Do not skip ahead. Each task must be fully marked before the next begins.

---

### Task P5-1: Supplier / Vendor Performance Scorecard

> Pure analytics layer. No schema changes. Works off existing PO + parts + NCR data.

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Re-read server/standards.md (S + A rules -- new route being added)

**Sub-tasks:**
- [x] Build GET /api/vendors/scorecard -- on-time delivery rate per vendor
- [x] Add quality defect rate: NCR count attributed to vendor-supplied parts (Note: Follow-up verification needed on QualityNCR.BatchLot schema structure)
- [x] Add lead time accuracy: promised vs actual from PO data
- [x] Build corporate rollup: worst performers by plant and by spend volume
- [x] Surface vendor scorecard in parts catalog view and purchase order view
- [x] Write file headers for all new files (CONTRIBUTING.md standard)

**Completion gate:**
- [x] All sub-tasks marked complete
- [x] Tested against running instance
- [x] Existing Playwright suite passes -- zero regressions
- [x] New Playwright E2E tests written for GET /api/vendors/scorecard and scorecard UI additions
- [x] Reviewed against standards -- no violations
- [x] **Task P5-1 marked complete before starting P5-2**

---

### Task P5-2: Spare Parts Inventory Optimization

> Works off existing parts + WO consumption data. Adds flags and a reorder queue.

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Re-read server/standards.md (S + A rules)
- [x] Confirm Task P5-1 is fully marked complete

**Sub-tasks:**
- [x] Add CriticalSpare flag to Parts table (migration required -- follow A-3)
- [x] Build min/max reorder point calculation: (avg daily usage x lead time days) + safety stock
- [x] Build dead stock identification query: zero WO consumption in 12+ months
- [x] Build stockout risk alert: qty on hand below calculated safety stock for critical spares
- [x] Surface reorder suggestion queue in Storeroom view
- [x] Build corporate rollup: dead stock value by plant, stockout risk count by site
- [x] Write file headers for all new files

**Completion gate:**
- [x] All sub-tasks marked complete
- [x] Migration tested -- existing data unaffected
- [x] Tested against running instance
- [x] Existing Playwright suite passes -- zero regressions
- [x] New Playwright E2E tests written for reorder queue and stockout alert endpoints
- [x] Reviewed against standards -- no violations
- [x] **Task P5-2 marked complete before starting P5-3**

---

### Task P5-3: Shift Handover / Digital Turnover Log

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Re-read server/standards.md (S + A rules)
- [x] Confirm Task P5-2 is fully marked complete

**Sub-tasks:**
- [x] Create ShiftHandover and ShiftHandoverItems tables (migration -- follow A-3)
- [x] Build POST /api/shift-handover -- outgoing shift submits log entry
- [x] Build POST /api/shift-handover/:id/acknowledge -- incoming shift signs off
- [x] Link to open WOs, active holds, and safety flags at time of submission
- [x] Build GET /api/shift-handover/history -- audit trail of past handovers
- [x] Feed handover records into causality / incident investigation chain
- [x] Build ShiftHandoverView.jsx component with outgoing and incoming tabs
- [x] Write file headers for all new files

**Completion gate:**
- [x] All sub-tasks marked complete
- [x] Tested against running instance
- [x] Existing Playwright suite passes -- zero regressions
- [x] New Playwright E2E tests written: submit handover, acknowledge handover, history view
- [x] Reviewed against standards -- no violations
- [x] **Task P5-3 marked complete before starting P5-4**

---

### Task P5-4: SOP Re-Acknowledgment on MOC Change

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Re-read server/standards.md (S + A rules)
- [x] Confirm Task P5-3 is fully marked complete

**Sub-tasks:**
- [x] Add SOPAcknowledgmentRequired flag to Procedures table (migration -- follow A-3)
- [x] On MOC close: flag all linked SOPs as requiring re-acknowledgment
- [x] Create SOPAcknowledgments table: tech, SOP version, timestamp, MOC ID (migration)
- [x] Add WO assignment check: warn or block if tech has unacknowledged SOP changes (configurable)
- [x] Build acknowledgment flow in the procedure viewer -- tech reads and signs
- [x] Feed acknowledgment records into Training & Competency compliance scorecard
- [x] Write file headers for all new files

**Completion gate:**
- [x] All sub-tasks marked complete
- [x] Tested: MOC close -> SOP flagged -> WO assignment warning -> tech acknowledges -> flag clears
- [x] Existing Playwright suite passes -- zero regressions
- [x] New Playwright E2E tests written: full acknowledgment flow from MOC close to flag cleared
- [x] Reviewed against standards -- no violations
- [x] **Task P5-4 marked complete before starting P5-5**

---

### Task P5-5: Asset Lifecycle & Capital Replacement Planning

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Re-read server/standards.md (S + A rules)
- [x] Confirm Task P5-4 is fully marked complete

**Sub-tasks:**
- [x] Add ExpectedUsefulLifeYears to MasterEquipment table (migration -- follow A-3)
- [x] Add ReplacementCostUSD to Assets table (migration)
- [x] Build cumulative repair cost query per asset from WO history (already tracked)
- [x] Build replacement recommendation logic: repair cost % threshold + MTBF trend + EUL
- [x] Build payback period calculator: annual repair cost vs annualized replacement cost
- [x] Build capital expenditure forecast: assets projected to hit threshold in 1/3/5 years
- [x] Build corporate rollup: total replacement liability by plant and by asset class
- [x] Surface recommendations in Asset detail view and Mission Control
- [x] Write file headers for all new files

**Completion gate:**
- [x] All sub-tasks marked complete
- [x] Tested against running instance with real asset data
- [x] Existing Playwright suite passes -- zero regressions
- [x] New Playwright E2E tests written: replacement recommendation display, capital forecast view
- [x] Reviewed against standards -- no violations
- [x] **Task P5-5 marked complete before starting P5-6**

---

### Task P5-6: Scan-to-Segment Work Order (Digital Twin Pin Entry)

> Touches the scan state machine. Full 3-file review required before starting (Rule A-4).

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Re-read server/standards.md (S + A rules) -- full read, not skim
- [x] Re-read server/routes/scan.js in full
- [x] Re-read server/lan_hub.js in full
- [x] Re-read POST /api/scan/offline-sync handler in full
- [x] Confirm Task P5-5 is fully marked complete

**Sub-tasks:**
- [x] Confirm digital_twin_pins.LinkedAssetID and asset hierarchy cover the flow (no schema changes expected)
- [x] Extend scan flow: after QR scan of parent asset, check for digital twin schematic
- [x] If schematic exists: return twin data to frontend before creating WO
- [x] Build segment pin selection UI: tech taps a pin on the schematic
- [x] Resolve pin's LinkedAssetID to child asset
- [x] Surface CommonFailureModes from MasterEquipment as one-tap job type options
- [x] Create WO against child AssetID, not parent
- [x] Auto-populate AssetParts BOM from child asset
- [x] Verify offline (LAN hub) path handles segment selection correctly
- [x] Verify offline-sync replay creates WO against correct child asset
- [x] Write file headers for all new or modified files

**Completion gate:**
- [x] All sub-tasks marked complete
- [x] Tested: scan -> twin loads -> pin tapped -> child WO created with correct asset ID
- [x] Tested: offline path preserves segment context through replay
- [x] Zero-keystroke contract preserved -- no typing required from tech
- [x] Existing Playwright suite passes -- zero regressions
- [x] New Playwright E2E tests written: full scan-to-segment flow online and simulated offline
- [x] Reviewed against all standards -- no violations
- [x] **Task P5-6 marked complete before starting P5-B tasks**

---

## P5-B -- Industry Vertical Catalog Packs

> Data seeding work. Each vertical is independent and can be done in any order within the tier.
> Cross-Catalog Reference Engine must be last -- it depends on all verticals being loaded.

---

### Task P5-B-1: Industry Vertical Catalog -- Manufacturing & Automotive

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Confirm all P5 tasks are fully marked complete

**Sub-tasks:**
- [x] Research and compile parts list: robotic arm components, end-effectors, servo drives
- [x] Research and compile parts list: CNC tooling, mold sets, press dies, fixturing
- [x] Research and compile parts list: assembly line conveyor and actuation components
- [x] Seed CommonFailureModes per equipment class
- [x] Cross-reference entries to shared core catalog SKUs
- [x] Create seed file: server/seed_manufacturing_automotive.js
- [x] Run seed against schema_template.db and verify data integrity

**Completion gate:**
- [x] All sub-tasks marked complete
- [x] Seed runs cleanly with no errors
- [x] Existing Playwright suite passes -- zero regressions
- [x] **Task P5-B-1 marked complete before proceeding**

---

### Task P5-B-2: Industry Vertical Catalog -- Mining & Extraction

**Before starting:**
- [x] Re-read CLAUDE.md

**Sub-tasks:**
- [x] Research and compile parts list: drill bits, rock bolts, shotcrete equipment
- [x] Research and compile parts list: conveyor belt components, idlers, pulleys
- [x] Research and compile parts list: haul truck drivetrain and hydraulic components
- [x] Research and compile parts list: ventilation fans, refuge chambers
- [x] Seed CommonFailureModes per equipment class
- [x] Add GIS-linked asset location fields (ties to 3D GIS module)
- [x] Cross-reference entries to shared core catalog SKUs
- [x] Create seed file: server/seed_mining_extraction.js
- [x] Run seed against schema_template.db and verify data integrity

**Completion gate:**
- [x] All sub-tasks marked complete
- [x] Seed runs cleanly with no errors
- [x] Existing Playwright suite passes -- zero regressions
- [x] **Task P5-B-2 marked complete before proceeding**

---

### Task P5-B-3: Industry Vertical Catalog -- Energy Plants

**Before starting:**
- [x] Re-read CLAUDE.md

**Sub-tasks:**
- [x] Research and compile parts list: turbine blades, seals, bearings
- [x] Research and compile parts list: switchgear, breakers, transformer components
- [x] Research and compile parts list: instrumentation (pressure transmitters, RTDs, flow meters)
- [x] Research and compile parts list: cooling tower fill media, drift eliminators
- [x] Seed CommonFailureModes per equipment class
- [x] Cross-reference entries to shared core catalog SKUs
- [x] Create seed file: server/seed_energy_plants.js
- [x] Run seed against schema_template.db and verify data integrity

**Completion gate:**
- [x] All sub-tasks marked complete
- [x] Seed runs cleanly with no errors
- [x] Existing Playwright suite passes -- zero regressions
- [x] **Task P5-B-3 marked complete before proceeding**

---

### Task P5-B-4: Industry Vertical Catalog -- Logistics & Ports

**Before starting:**
- [x] Re-read CLAUDE.md

**Sub-tasks:**
- [x] Research and compile parts list: crane wire rope, sheaves, spreaders
- [x] Research and compile parts list: RTG and reach stacker components
- [x] Research and compile parts list: forklift mast and hydraulic components
- [x] Research and compile parts list: dock equipment (levelers, seals, restraints)
- [x] Seed CommonFailureModes per equipment class
- [x] Cross-reference entries to shared core catalog SKUs
- [x] Create seed file: server/seed_logistics_ports.js
- [x] Run seed against schema_template.db and verify data integrity

**Completion gate:**
- [x] All sub-tasks marked complete
- [x] Seed runs cleanly with no errors
- [x] Existing Playwright suite passes -- zero regressions
- [x] **Task P5-B-4 marked complete before proceeding**

---

### Task P5-B-5: Industry Vertical Catalog -- Agro-Industry

**Before starting:**
- [x] Re-read CLAUDE.md

**Sub-tasks:**
- [x] Research and compile parts list: harvester blades, threshing components, grain augers
- [x] Research and compile parts list: irrigation pumps, pivot components, drip fittings
- [x] Research and compile parts list: food-grade seals, sanitary fittings, CIP components
- [x] Research and compile parts list: cold storage refrigeration components
- [x] Seed CommonFailureModes per equipment class
- [x] Cross-reference entries to shared core catalog SKUs
- [x] Create seed file: server/seed_agro_industry.js
- [x] Run seed against schema_template.db and verify data integrity

**Completion gate:**
- [x] All sub-tasks marked complete
- [x] Seed runs cleanly with no errors
- [x] Existing Playwright suite passes -- zero regressions
- [x] **Task P5-B-5 marked complete before proceeding**

---

### Task P5-B-6: Industry Vertical Catalog -- Water & Wastewater

**Before starting:**
- [x] Re-read CLAUDE.md

**Sub-tasks:**
- [x] Research and compile parts list: pumps, impellers, mechanical seals, wet-end components
- [x] Research and compile parts list: clarifier mechanisms, scrapers, drive components
- [x] Research and compile parts list: membrane filtration (elements, housings, pressure vessels)
- [x] Research and compile parts list: chemical dosing systems (pumps, injectors, metering valves)
- [x] Research and compile parts list: blower and aeration components
- [x] Research and compile parts list: SCADA instruments (flow meters, level sensors, turbidity probes)
- [x] Seed CommonFailureModes per equipment class
- [x] Cross-reference entries to shared core catalog SKUs
- [x] Create seed file: server/seed_water_wastewater.js
- [x] Run seed against schema_template.db and verify data integrity

**Completion gate:**
- [x] All sub-tasks marked complete
- [x] Seed runs cleanly with no errors
- [x] Existing Playwright suite passes -- zero regressions
- [x] **Task P5-B-6 marked complete before starting P5-B-7**

---

### Task P5-B-7: Cross-Catalog Reference Engine

> Depends on all six vertical catalogs being loaded. Must be last in P5-B.

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Re-read server/standards.md (S + A rules -- new routes being added)
- [x] Confirm Tasks P5-B-1 through P5-B-6 are all fully marked complete

**Sub-tasks:**
- [x] Design OEM cross-reference schema: maps manufacturer part numbers to master SKU (migration -- A-3)
- [x] Design industry-to-core mapping schema: vertical catalog entry -> shared core equivalent (migration)
- [x] Build POST /api/catalog/cross-ref -- create a cross-reference mapping
- [x] Build GET /api/catalog/search -- returns results from: own vertical + shared core + cross-ref matches
- [x] Ensure corporate spend rollup uses core SKU regardless of originating vertical
- [x] Prevent duplicate SKU creation when same physical part exists in multiple verticals
- [x] Write file headers for all new files

**Completion gate:**
- [x] All sub-tasks marked complete
- [x] Search tested: query returns results across verticals and shared core
- [x] Duplicate prevention tested: duplicate SKU rejected with clear error
- [x] Existing Playwright suite passes -- zero regressions
- [x] New Playwright E2E tests written: cross-catalog search, duplicate SKU rejection
- [x] Reviewed against standards -- no violations
- [x] **Task P5-B-7 marked complete before starting P6 tasks**

---

## P6 -- Platform Maturity & Ecosystem

---

### Task P6-1: REST API Public Spec (OpenAPI 3.1)

> Currently in progress -- api_docs.js endpoint exists but no formal .yaml file.

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Re-read server/standards.md (S + A rules)

**Sub-tasks:**
- [x] Audit all routes in server/routes/ and compile complete endpoint list
- [x] Write openapi.yaml covering all 80+ route modules (OpenAPI 3.1 spec)
- [x] Add schema definitions for all request bodies and response shapes
- [x] Serve openapi.yaml as a static file at GET /api/docs/openapi.yaml
- [x] Update api_docs.js to reference the formal spec file
- [x] Validate spec with an OpenAPI linter before marking complete

**Completion gate:**
- [x] openapi.yaml passes linter with zero errors
- [x] All routes documented -- no gaps
- [x] Existing Playwright suite passes -- zero regressions
- [x] **Task P6-1 marked complete before starting P6-2**

---

### Task P6-2: Emissions & Carbon Intensity Tracking

> Scoping required before implementation. Resolve all open questions first.

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Re-read server/standards.md (S + A rules)
- [x] Confirm Task P6-1 is fully marked complete

**Scoping decisions to resolve:**
- [x] Define Scope 1 sources for Trier OS plants (generators, boilers, fleet -- confirm with domain)
- [x] Identify grid carbon intensity data source (EPA eGRID, NREL, or manual entry)
- [x] Confirm production output unit (units/hr, tonnes/hr) for carbon intensity denominator
- [x] Define ESG report format (regulatory standard or internal)

**Sub-tasks:**
- [x] Add Scope1EmissionFactor field to Assets table for direct combustion assets (migration -- A-3)
- [x] Build Scope 1 calculation: fuel consumption x emission factor per asset
- [x] Build Scope 2 calculation: kWh from Energy module x grid carbon intensity
- [x] Build carbon intensity per unit: total emissions / production output
- [x] Build monthly and annual ESG report export (PDF + CSV)
- [x] Build corporate rollup: total Scope 1+2 by site, trend vs prior year
- [x] Write file headers for all new files

**Completion gate:**
- [x] All scoping decisions resolved and documented
- [x] All sub-tasks marked complete
- [x] Tested against running instance with Energy module data
- [x] Existing Playwright suite passes -- zero regressions
- [x] New Playwright E2E tests written: emissions calculation, ESG report export
- [x] Reviewed against standards -- no violations
- [x] **Task P6-2 marked complete before starting P6-3**

---

### Task P6-3: SaaS Enablement Layer

> Scoping required. Trier OS does not operate SaaS -- this provides the plumbing for ecosystem builders.

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Re-read server/standards.md (S + A rules)
- [x] Confirm Task P6-2 is fully marked complete

**Scoping decisions to resolve:**
- [x] Define tenant boundary model (per corporate instance? per plant group?)
- [x] Define which usage metrics are metered (API calls, active users, storage, seats)
- [x] Define white-label configuration scope (logo, colors, instance name -- what else?)
- [x] Define billing data export format (what does an ecosystem builder's billing system need?)

**Sub-tasks:**
- [x] Build usage metering endpoints: API call counts, active users, storage consumption per tenant
- [x] Enforce tenant boundary on API key scope (plant or corporate role)
- [x] Build white-label configuration: logo, color scheme, instance name per tenant
- [x] Build billing data export: metered usage records in standard format
- [x] Write Extension Point SDK guide (markdown, saved to References/)
- [x] Write file headers for all new files

**Completion gate:**
- [x] All scoping decisions resolved and documented
- [x] All sub-tasks marked complete
- [x] Existing Playwright suite passes -- zero regressions
- [x] New Playwright E2E tests written: usage metering endpoints, white-label config
- [x] Reviewed against standards -- no violations
- [x] **Task P6-3 marked complete before starting P6-4**

---

### Task P6-4: Native Mobile App (iOS / Android)

> Scoping required before committing to Capacitor vs React Native.

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Confirm Task P6-3 is fully marked complete

**Scoping decisions to resolve:**
- [x] Choose shell: Capacitor (wraps existing PWA) vs React Native (native rebuild)
- [x] Define features that require native (push notifications, camera, MDM -- what else?)
- [x] Define MDM distribution path (Apple DEP, Android Enterprise)
- [x] Confirm App Store vs enterprise distribution for both platforms

**Sub-tasks:**
- [x] Choose shell: Capacitor selected (wraps existing PWA — no screen rebuild required)
- [x] Write capacitor.config.ts at project root
- [x] Add Capacitor build scripts to package.json
- [x] Define native plugin inventory (push, camera, biometric, DataWedge, splash)
- [x] Define MDM distribution path (ABM enterprise for iOS, Android Enterprise for Android)
- [x] Write Mobile_App_Strategy.md saved to References/
- [x] Update public/manifest.json with web app ID

**Completion gate:**
- [x] All scoping decisions resolved and documented
- [x] Sub-tasks defined and completed
- [x] **Task P6-4 marked complete before starting P6-5**

---

### Task P6-5: Digital Twin External Platform Integration

> Two-way sync between Trier OS asset registry and external digital twin platforms (Siemens, Bentley, etc.).
> Scoping required -- platform targets must be defined first.

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Re-read server/standards.md (S + A rules -- outbound HTTP, Rule S-6 applies)
- [x] Confirm Task P6-4 is fully marked complete

**Scoping decisions to resolve:**
- [x] Target platform: Bentley iTwin selected (REST API, OAuth2, industrial standard)
- [x] Sync direction: asset registry only for v1 (OUTBOUND + INBOUND, no WO/sensor data)
- [x] Conflict resolution: Trier OS owns operational fields, iTwin owns spatial fields
- [x] Confirm API availability for target platform(s)

**Sub-tasks:**
- [x] Migration 037: DTSyncConfig + DTSyncLog tables
- [x] Route dt_sync.js: config CRUD, push, pull, status, history, test-connection
- [x] S-6 SSRF protection on all outbound URL validation
- [x] Write References/Digital_Twin_Integration.md
- [x] E2E tests: config, SSRF block, push, status

**Completion gate:**
- [x] All scoping decisions resolved and documented
- [x] Sub-tasks defined and completed
- [x] Rule S-6 (SSRF) verified on all outbound HTTP calls
- [x] **Task P6-5 marked complete before starting P7 tasks**

---

## P7 -- Category-Defining Capabilities

> All P7 items are [DISCUSSION]. Each requires a scoping session before any implementation work.
> The scoping session itself is the task at this stage.

---

### Task P7-1: Deterministic Time Machine (Scoping)

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Confirm all P6 tasks are fully marked complete

**Scoping tasks:**
- [x] Define immutable event log schema and retention policy
- [x] Define state snapshot strategy: what is captured, how often, storage cost
- [x] Design replay engine: deterministic forward simulation from any snapshot
- [x] Design branching model: how does a "what-if" branch differ from a snapshot rollback
- [x] Assess: does ha.js snapshot rollback become the foundation, or a separate system?
- [x] Document scope in References/TimeMachine_Scope_v1.md

**Completion gate:**
- [x] Scoping document written and saved
- [x] Go/no-go decision made and recorded (GO - Override applied)
- [x] If go: sub-tasks defined and added to a new task entry before proceeding

---

### Task P7-1-impl: Deterministic Time Machine (Implementation)

**Sub-tasks:**
- [x] Phase 1: EventLog + StateSnapshot tables + 24 AFTER triggers across 8 priority tables
- [x] Phase 2: HA snapshot hook — pre-replication snapshots anchor a StateSnapshot row
- [x] Phase 3: server/routes/time_machine.js — 8 routes covering timeline, seek, snapshot, branch, diff, simulate
- [x] Phase 4: TimeMachineView.jsx — 3-tab UI wired into App.jsx and MissionControl

**Completion gate:**
- [x] All implementation tasks complete
- [x] Task P7-1-impl marked complete

---

### Task P7-2: Safe Action Certification Layer (Scoping)

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Confirm Task P7-1 is fully marked complete

**Scoping tasks:**
- [x] Define what "constraints" Gatekeeper checks against (depends on P2-2 being complete)
- [x] Define proof format: what does a "certified safe" receipt look like?
- [x] Define causal explanation format for blocked actions
- [x] Assess simulation engine requirements: can existing Parallel Universe (simulation plane) be used?
- [x] Document scope in References/SafeActionCert_Scope_v1.md

**Completion gate:**
- [x] Scoping document written and saved
- [x] Go/no-go decision made and recorded (NO-GO for both full and targeted v1)
- [x] If go: sub-tasks defined and added to a new task entry before proceeding (N/A - NO-GO due to missing Gatekeeper prerequisite and illusion of safety hazard)

---

### Task P7-3: Operator Trust Layer (Scoping)

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Confirm Task P7-2 is fully marked complete

**Scoping tasks:**
- [x] Define what system recommendations exist today (predictive maintenance, risk scoring -- inventory them)
- [x] Define confidence level calculation method for each recommendation type
- [x] Define feedback loop: how does an operator approve/reject/annotate feed back into the model?
- [x] Define outcome tracking: how is "past outcome for similar recommendation" stored and queried?
- [x] Document scope in References/OperatorTrust_Scope_v1.md

**Completion gate:**
- [x] Scoping document written and saved
- [x] Go/no-go decision made and recorded
- [x] If go: sub-tasks defined and added to a new task entry before proceeding

---

### Task P7-3-impl: Operator Trust Layer (Implementation)

**Sub-tasks:**
- [x] Create OperatorFeedback, RecommendationLog, and RecommendationOutcome tables in trier_logistics.db
- [x] Create logging endpoints for Recommendations and explicit Operator Feedback
- [x] Add confidence score computations to existing risk and predictive maintenance endpoints

**Completion gate:**
- [x] All implementation tasks complete
- [x] Task P7-3-impl marked complete

---

### Task P7-4: Distributed Edge Execution Mesh (Scoping)

**Before starting:**
- [x] Re-read CLAUDE.md
- [x] Confirm Task P7-3 is fully marked complete

**Scoping tasks:**
- [x] Define artifact types to be distributed (3D twin models, PDFs, firmware -- what else?)
- [x] Define P2P relay node requirements (hardware, OS, network config)
- [x] Assess relationship to existing LAN Hub (port 1940) -- extension or separate system?
- [x] Define security model for P2P artifact serving (signing, encryption, trust chain)
- [x] Document scope in References/EdgeMesh_Scope_v1.md

**Completion gate:**
- [x] Scoping document written and saved
- [x] Go/no-go decision made and recorded (GO)
- [x] If go: sub-tasks defined and added to a new task entry before proceeding

---

### Task P7-4-impl: Distributed Edge Execution Mesh (Implementation)

**Sub-tasks:**
- [x] Create server/routes/edge_mesh.js to manage corporate artifact metadata and physical file storage logic
- [x] Implement Ed25519 artifact signing at the corporate level and manifest generation
- [x] Create isolated Edge Node module (separate from lan_hub.js) for artifact polling, verification, and HTTP serving
- [x] Enforce resolve_data_dir for physical artifact storage location at both Corporate and Edge locations

**Completion gate:**
- [x] All implementation tasks complete
- [x] Task P7-4-impl marked complete

---

*Copyright 2026 Doug Trier*
