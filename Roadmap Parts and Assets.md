# Trier OS -- Active Roadmap: Parts, Assets & Open Items

> All open and planned items. Completed work is in ROADMAP.md.

---

## Status Legend

| Status        | Meaning                                    |
|---------------|--------------------------------------------|
| [IN PROGRESS] | Actively being built                       |
| [PLANNED]     | Scoped and queued -- not yet started       |
| [DISCUSSION]  | Further scoping needed before committing   |

---

## P1 -- Complete

All P1 items are shipped as of v3.4.1. See ROADMAP.md for full detail.

---

## P2 -- Pilot Blockers [COMPLETE]

> Required before any safety-critical plant deployment. These items answer the liability
> questions that determine whether a plant safety officer will engage. All items delivered.

### [COMPLETE] Failure Domain Isolation

Three-plane model:
- Control Plane: PLCs, safety PLCs, drives -- no runtime dependency on Trier OS
- Execution Plane: Trier OS runtime -- issues governed intents only via Gatekeeper
- Simulation Plane: Parallel Universe -- no write path to production

Trier OS must be able to go fully offline with zero plant impact.

Task list:
- [x] Define 3-plane architecture and document explicit boundaries
- [x] Produce data flow diagram (read paths vs. write paths separated)
- [x] Split core services into independent runtimes
- [x] Introduce message bus with backpressure (NATS or equivalent)
- [x] Add circuit breakers on all external connectors
- [x] Implement all four system states: Normal, Advisory-Only, Isolated, Offline
- [x] Failure injection testing: kill each subsystem, verify no cascade
- Deliverable: Isolation_Architecture_v1.md + Failure_Test_Report_v1.md

### [COMPLETE] Governed Write Path (Gatekeeper Service)

Trier OS must never write directly to field devices.
Architecture: Trier OS -> Gatekeeper -> Control Adapter -> PLC/SCADA

Task list:
- [x] Define Gatekeeper as a separate runtime (not embedded in main process)
- [x] Integrate LDAP/AD RBAC -- define Read-only, Advisory, Non-critical, Safety-critical classes
- [x] Implement PTW hook (action blocked without a valid active permit)
- [x] Implement MOC hook (safety-critical actions require an approved change record)
- [x] Change Validation Engine: validate against user role, system state, active permits
- [x] Immutable audit log: who, what, when, why -- linked to request ID and approval chain
- [x] Build control adapters: OPC-UA write proxy, Modbus command wrapper
- Deliverable: Write_Path_Architecture.pdf + RBAC_and_Action_Model.md

### [COMPLETE] Operational Support Model

Defines who to call at 2AM when a line is down. Without this, even technically sound
systems are blocked from production consideration.

Task list:
- [x] Define Tiered Support: Tier 0 (on-site operators), Tier 1 (local IT/OT), Tier 2 (Trier OS)
- [x] Define severity levels: Sev 1 (plant impact), Sev 2 (degraded), Sev 3 (non-critical)
- [x] Create runbooks for: system outage, data ingestion failure, auth failure
- [x] Implement system health monitoring and alerting
- [x] Define versioning model, one-click rollback, staged deployment
- [x] Write operator quick-start guide and troubleshooting guide
- Deliverable: Support_Model_v1.md + Incident_Runbooks/ + Deployment_and_Rollback.md

---

## P5 -- Growth & Revenue

### [COMPLETE] Scan-to-Segment Work Order (Digital Twin Pin Entry)
Scanning a machine tag today creates a WO against the top-level asset. For complex machines
(e.g., Q-11 with Blowmold and Filler segments), this loses sub-component context -- labor
and parts get attributed to the machine, not the segment that actually failed.

Flow:
  Scan asset QR (e.g., Q-11)
    -> Load Digital Twin schematic for that asset
    -> Tech taps a segment pin (e.g., Blowmold)
    -> Pin's LinkedAssetID resolves the child asset
    -> CommonFailureModes (from MasterEquipment) surfaced as job type options -- one tap
    -> Work order created against child AssetID
    -> AssetParts BOM auto-populates parts list

What this unlocks:
- Labor and parts attributed to the correct sub-component, not just the machine
- Per-segment MTBF and failure frequency over time
- CommonFailureModes drives job type suggestions -- no typing required
- Preserves zero-keystroke contract

Prerequisites: Digital Twin schematics loaded per asset with pins placed on sub-components.
No schema changes required -- digital_twin_pins.LinkedAssetID and asset hierarchy cover it.

### [COMPLETE] Shift Handover / Digital Turnover Log
Formal digital shift-to-shift transfer record. Outgoing shift documents what was completed,
what work orders are still open, what broke, and any active holds or safety concerns.
Incoming shift acknowledges before taking over.
"Outgoing shift didn't tell us" is one of the most common incident root causes -- this
closes that gap with a timestamped, signed record tied to the existing WO and scan state.
- Shift log entry: completed WOs, open WOs, active holds, safety flags, freetext notes
- Incoming shift acknowledgment (digital signature)
- Linked to plant, shift schedule, and supervisor
- Feeds into the existing causality and incident investigation chain

### [COMPLETE] SOP Re-Acknowledgment on MOC Change
MOC is shipped. The gap: when a MOC changes a procedure, there is no mechanism to
force technicians to read and acknowledge the updated SOP before their next job.
- On MOC close, flag all linked SOPs as requiring re-acknowledgment
- WO assignment blocked (warn or hard-block, configurable) if tech has unacknowledged SOP changes
- Acknowledgment record: tech, SOP version, timestamp -- linked to the originating MOC
- Feeds into Training & Competency compliance scorecard
- Closes the loop between the MOC system and field execution

### [COMPLETE] Supplier / Vendor Performance Scorecard
Purchase orders and parts catalog are already in the system -- this is a pure analytics
layer on top of existing data. No new schema required.
- On-time delivery rate per vendor (PO due date vs actual receipt date)
- Quality defect rate: NCR count attributed to vendor-supplied parts
- Lead time accuracy: promised vs actual
- Corporate rollup: worst performers by plant and by spend volume
- Vendor scorecard surfaced in the parts catalog and purchase order views

### [COMPLETE] Asset Lifecycle & Capital Replacement Planning
Answers the repair-vs-replace question with data instead of gut feel.
- Expected Useful Life (EUL) field per asset class in MasterEquipment
- Cumulative repair cost tracked per asset from WO history (already in system)
- Replacement cost field on Assets table
- Replacement recommendation triggered when: cumulative repair cost exceeds X% of
  replacement cost, or MTBF trend crosses threshold, or age exceeds EUL
- Payback period calculator: current annual repair cost vs annualized replacement cost
- Capital expenditure forecast: all assets projected to hit threshold in next 1/3/5 years
- Corporate rollup: total replacement liability by plant and by asset class

### [COMPLETE] Spare Parts Inventory Optimization
Right now parts can be stocked wrong and the system does not flag it.
Stocking recommendations driven by MTBF and vendor lead times -- works off existing data.
- Min/max reorder point calculation: (average daily usage x lead time days) + safety stock
- Dead stock identification: parts with zero WO consumption in 12+ months
- Critical spare flag: parts whose absence would cause Sev 1 downtime
- Stockout risk alert: quantity on hand below calculated safety stock for critical spares
- Reorder suggestion queue surfaced in Storeroom view
- Corporate rollup: dead stock value by plant, stockout risk count by site

---

## P5-B -- Industry Vertical Catalog Packs

> NEW (April 23, 2026)
> Extends the existing Master Data Catalog (dairy + IT already exist) to all five
> industry verticals identified as target markets.
> Architecture: shared core catalog + industry vertical catalogs + cross-reference layer.

### [COMPLETE] Industry Vertical Catalog -- Manufacturing & Automotive
Parts, assets, and equipment for advanced manufacturing and automotive production.
- Robotic arm components, end-effectors, servo drives
- CNC tooling, mold sets, press dies, fixturing
- Assembly line conveyor and actuation components
- CommonFailureModes seeded per equipment class
- Cross-referenced to shared core catalog SKUs

### [COMPLETE] Industry Vertical Catalog -- Mining & Extraction
Parts, assets, and equipment for surface and underground mining operations.
- Drill bits, rock bolts, shotcrete equipment
- Conveyor belt components, idlers, pulleys
- Haul truck drivetrain and hydraulic components
- Ventilation fans, refuge chambers
- GIS-linked asset locations (ties to 3D GIS module)

### [COMPLETE] Industry Vertical Catalog -- Energy Plants
Parts, assets, and equipment for power generation and distribution.
- Turbine blades, seals, bearings
- Switchgear, breakers, transformer components
- Instrumentation: pressure transmitters, RTDs, flow meters
- Cooling tower fill media, drift eliminators

### [COMPLETE] Industry Vertical Catalog -- Logistics & Ports
Parts, assets, and equipment for terminal and logistics operations.
- Crane wire rope, sheaves, spreaders
- RTG and reach stacker components
- Forklift mast and hydraulic components
- Dock equipment: levelers, seals, restraints

### [COMPLETE] Industry Vertical Catalog -- Agro-Industry
Parts, assets, and equipment for precision agriculture and food processing.
- Harvester blades, threshing components, grain augers
- Irrigation pumps, pivot components, drip fittings
- Food-grade seals, sanitary fittings, CIP components
- Cold storage refrigeration components

### [COMPLETE] Industry Vertical Catalog -- Water & Wastewater
Parts, assets, and equipment for municipal and industrial water treatment operations.
- Pumps, impellers, mechanical seals, and wet-end components
- Clarifier mechanisms, scrapers, and drive components
- Membrane filtration: elements, housings, and pressure vessels
- Chemical dosing systems: pumps, injectors, and metering valves
- Blower and aeration components
- SCADA instrument components: flow meters, level sensors, turbidity probes
- Cross-referenced to shared core catalog SKUs
Note: Heavily regulated (EPA, state DEQ). Underserved in the CMMS market. Natural fit
for existing compliance, PTW, and LOTO infrastructure.

### [COMPLETE] Cross-Catalog Reference Engine
Maps parts across verticals and to the shared core catalog. Prevents duplicate SKU creation
when the same physical part exists under different numbers across industries.
- OEM cross-reference: maps manufacturer part numbers to master SKU
- Industry-to-core mapping: vertical catalog entry -> shared core equivalent
- Corporate spend rollup uses core SKU regardless of originating vertical
- Search returns results from: own vertical + shared core + cross-ref matches

---

## P6 -- Platform Maturity & Ecosystem

### [COMPLETE] REST API Public Spec (OpenAPI 3.1)
Machine-readable OpenAPI spec for all route modules. Enables hardware vendors and
integrators to build certified connectors. API docs endpoint exists; formal openapi.yaml
file on disk not yet produced.

### [COMPLETE] Emissions & Carbon Intensity Tracking
Energy module is shipped. ESG reporting is becoming mandatory for publicly traded
companies and their supply chains -- this extends what is already built.
- Scope 1 emissions per asset (direct combustion: generators, boilers, fleet)
- Scope 2 emissions per line and per plant (electricity consumption x grid carbon intensity)
- Carbon intensity per unit of output (ties to production data)
- Monthly and annual ESG report export (PDF + CSV)
- Corporate rollup: total Scope 1+2 by site, trend vs prior year
- No new sensor infrastructure required -- uses existing Energy module readings

### [COMPLETE] SaaS Enablement Layer
Trier OS is not a SaaS product, but ecosystem builders may want to wrap it in a
SaaS offering. Building the right seams in now prevents a rewrite later and keeps
control over how the platform is extended.
- Usage metering endpoints: API call counts, active users, storage consumption per tenant
- Tenant boundary enforcement: API key scoped to plant or corporate role
- White-label configuration: logo, color scheme, instance name per tenant
- Billing data export: metered usage records in a format billing systems can consume
- Extension point documentation: formal SDK guide for ecosystem builders
- Trier OS does not operate the SaaS infrastructure -- it only provides the plumbing

### [COMPLETE] Native Mobile App (iOS / Android) — Architectural Decision: PWA
Evaluated Capacitor and React Native wrappers. Rejected both as net-negative for this
deployment model.

Rationale: Trier OS runs airgapped on an IT-managed LAN. The PWA already covers the
full capability set — QR/camera scanning via getUserMedia, offline operation via the LAN
hub and service worker, any-device access with zero install friction, and instant
zero-touch updates on every server deploy. Web Push covers iOS 16.4+ (all current MDM
fleets) and all Android targets.

A native build pipeline would introduce: Xcode/Android Studio toolchains, enterprise
signing certs, IPA/APK artifact management, and a mandatory IT deployment touchpoint on
every release — with no functional gain over the existing PWA.

Decision: PWA is the Trier OS mobile app. This is not a gap; it is a deliberate
architectural choice. See References/Mobile_App_Strategy.md for full tradeoff analysis.

### [COMPLETE] Digital Twin Integration
Two-way sync between Trier OS asset registry and external digital twin platforms.

---

## P7 -- Category-Defining Capabilities

> These capabilities move Trier OS from "advanced industrial platform" into a new product
> category. Each is defensible because it only works with a deterministic + unified
> architecture -- competitors cannot bolt them on.

### [COMPLETE] Deterministic Time Machine (Plant State Rollback + Branching Simulation)
Not just event replay -- controlled rewind to any point T-X, decision modification, and
deterministic forward simulation from that branch.

Answers: "What if we hadn't made that change at 14:32?"
Requires: immutable event log + state snapshots + replay engine + branching simulation layer.

### [COMPLETE] Safe Action Certification Layer (Pre-Execution Proof)
Before any write action executes through Gatekeeper, Trier OS proves via simulation that
the action will not violate defined constraints. Returns: certified safe (proceed) or
unsafe (blocked with full causal explanation). Certified actions get a proof receipt.

### [COMPLETE] Operator Trust Layer (Human-in-the-Loop Recommendations)
Every system recommendation surfaces: confidence level, plain-language explanation, and
record of past outcomes for similar recommendations. Operators can approve, reject, or
annotate. Every decision feeds back into the system.

### [COMPLETE] Distributed Edge Execution Mesh (Trier Network Mesh)
A P2P execution mesh utilizing secure relay nodes to distribute and cache artifacts
(like 3D Digital Twin models or large manual PDFs) across the plant floor. Reduces
network choke points by allowing devices to serve artifacts to each other locally,
guaranteeing offline resilience and speed.

---

*Copyright 2026 Doug Trier*
