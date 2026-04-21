# Trier OS — Complete Feature Set Audit
**Version:** 3.4.1  
**Audited:** April 21, 2026  
**Methodology:** Full codebase scan across 162 React components and 196 API route/server modules.

Features are ordered by enterprise plant customer priority — i.e., what breaks production, costs money, or causes a safety incident if it fails or is absent.

---

## TIER 1 — Safety & Regulatory (Non-Negotiable)

Features in this tier are not optional for any plant subject to OSHA, EPA, or DOT regulations.

### 1. LOTO (Lockout/Tagout) Permit System
- Full digital LOTO permit creation, approval, and closure workflow
- QR code scanning to auto-populate lock points from asset registry
- Scan-to-verify: each individual lock point must be confirmed before closure
- Historical LOTO auto-fill: scans asset QR and pulls most recent permit as a starting template
- Manual fallback for non-QR-equipped facilities
- Procedural info modal with step-by-step instructions embedded in the UI
- Print-suppressed info modal (does not appear on printed permit)
- Full audit trail with timestamps and user signatures
- Permit print engine with formatted, OSHA-compliant output

### 2. Safety Incident Log
- Incident reporting with severity classification
- Near-miss logging
- Root cause linkage to equipment records
- OSHA recordable flag and required fields enforcement
- Full incident history per asset and per plant

### 3. JSA / JHA (Job Safety Analysis / Job Hazard Analysis)
- Digital JSA creation and storage
- Linkage to work orders requiring hazard analysis
- Version-controlled JSA history

### 4. Permit-to-Work System
- General work permits beyond LOTO (hot work, confined space, elevated work)
- Approval routing with multi-signature enforcement

### 5. Calibration Management
- Instrument calibration records and scheduling
- Calibration expiry alerts
- As-found / as-left data capture
- Certificate of calibration generation

### 6. DOT Compliance (Fleet)
- DVIR (Driver Vehicle Inspection Report) — pre/post-trip
- DOT inspection records
- CDL license tracking with expiry alerts
- Violation log

### 7. OSHA Records Module
- Injury and illness recordkeeping
- OSHA 300 / 300A log generation
- Regulatory date-field enforcement

---

## TIER 2 — Core Maintenance Operations (Daily Use)

Features every maintenance department interacts with every single day.

### 8. Work Order Engine
- Full work order lifecycle: create → assign → execute → close
- Priority levels (Emergency, Urgent, Routine, Preventive)
- Labor time tracking per technician
- Parts consumption with automatic inventory deduction
- Multi-step close-out wizard with checklist enforcement
- Attachments (photos, documents, videos)
- Work order print engine
- Failure code capture on close
- Linked asset history — every WO attached to the equipment record permanently

### 9. Preventive Maintenance Scheduler
- Recurring PM schedules by calendar interval, meter reading, or runtime hours
- Auto-generation of PM work orders on trigger
- PM compliance tracking (on-time %, overdue count)
- PM schedule calendar view

### 10. Asset Registry
- Full equipment lifecycle management
- Asset hierarchy (Plant → Area → Line → Equipment)
- MTBF (Mean Time Between Failures) calculated automatically from WO history
- MTTR (Mean Time To Repair) tracked per asset
- Depreciation tracking with book value calculation
- Floor plan pinning (asset appears on facility map)
- Asset photo gallery (multiple photos per asset)
- Snap Nameplate: webcam/mobile OCR capture of equipment nameplates → auto-populates catalog
- Master Catalog Enrichment (AI-assisted field population from nameplate data)
- Asset QR code generation and printing
- Asset timeline view (complete history in chronological order)
- Bill of Materials (BOM) per asset
- Where-Used lookup for parts
- Warranty status and expiry tracking per asset
- Last 5 work orders displayed inline on asset record
- Repair-vs-Replace financial calculator per asset

### 11. Parts & Inventory Management
- Full SKU inventory with quantity on hand, min/max thresholds
- Automatic reorder alert generation when stock falls below minimum
- Multi-vendor pricing per part (network cheapest price calculation)
- Parts consumption history linked to work orders and assets
- Inventory adjustment log with reason codes
- Vendor catalog with part cross-references
- Storeroom management — physical location tracking (aisle, bin, shelf)
- Parts usage analytics — most consumed, highest cost
- Full PO (Purchase Order) lifecycle: request → approve → receive
- Inventory reconciliation tools
- Import from CSV / existing ERP exports

### 12. Shift Handoff Log
- Digital shift log with structured entries
- Handoff notes per shift with equipment status summaries
- Unresolved work items carry forward automatically
- Readable by incoming supervisor on login

### 13. Schedule Calendar
- Visual calendar view of scheduled PMs and work orders
- Technician workload distribution view
- Drag-and-drop rescheduling
- Overdue highlighting

---

## TIER 3 — Engineering & Reliability Tools

Tools used by reliability engineers and maintenance leadership.

### 14. RCA — Root Cause Analysis (5-Why)
- Guided 5-Why methodology with structured input fields
- Linked to failed equipment and work orders
- Corrective action tracking with due dates and assignments
- RCA history per asset

### 15. FMEA (Failure Mode & Effects Analysis)
- Digital FMEA sheets per asset
- Risk Priority Number (RPN) calculation (Severity × Occurrence × Detection)
- Action item tracking from FMEA findings

### 16. Engineering Tools Hub
- CapEx project tracking and approval
- Lubrication management (schedules, lubricant specifications per equipment)
- Repair-vs-Replace financial calculator
- Budget forecasting with CapEx integration

### 17. MTBF / MTTR Dashboard
- Plant-wide reliability metrics
- Per-asset reliability trending
- Worst-performing equipment ranked list
- Failure frequency heatmap by equipment class

### 18. Downtime Log
- Manual downtime entry with start/end times
- Root cause categorization
- Downtime by equipment, by shift, by reason code
- OEE (Overall Equipment Effectiveness) calculated from downtime data

### 19. Predictive Foresight Engine
- Statistical failure prediction based on historical WO frequency
- Risk scoring per asset — flags equipment approaching historical failure interval
- Alerts surface on Mission Control before failure occurs

---

## TIER 4 — Supply Chain & Procurement

### 20. Supply Chain Management
- Full Purchase Order (PO) creation and approval workflow
- PO line items with part linkage
- Receiving workflow — partial and full receive
- Vendor performance tracking (lead time, fill rate, pricing)
- Open PO dashboard
- Overdue PO alerting
- PO print engine

### 21. Vendor Portal
- Vendor profile management (contact, lead time, payment terms)
- Vendor-specific parts catalog
- Vendor setup guide (printable onboarding document)
- Vendor comparison tool (price/lead time vs. alternatives)

### 22. Corporate Supply Chain Rollup ("All Sites")
- Director-level view across ALL plant databases simultaneously
- Network-wide open PO summary
- MTD spend across all facilities
- Consolidated overdue PO alerts

### 23. ERP Integration Pipeline
- Pull integration: HTTP REST worker fetches new parts and PO structures from central ERP
- Write-back Outbox: consumed parts, closed WOs, issues, and receipts queue automatically
- Background drain loop transmits queued events to ERP in sequence
- Supports SAP-style Status 50 / Status 99 / Issue / Receive event types

---

## TIER 5 — Analytics & Business Intelligence

### 24. Corporate Analytics Dashboard
- Cross-plant KPI rollup for Directors and Executives
- Plant-by-plant comparison (WO completion, PM compliance, downtime, spend)
- OEE by plant and by production line
- Maintenance cost per unit of production
- Budget vs. actual tracking across all facilities
- BI Export to external tools (Excel, Power BI compatible CSV)

### 25. OEE Dashboard
- Real-time OEE calculation (Availability × Performance × Quality)
- Per-line OEE breakdown
- OEE trending over time
- Loss waterfall categorization (planned downtime, unplanned, speed loss, quality loss)

### 26. Workforce Analytics
- Technician productivity metrics (WOs closed, labor hours, response time)
- Wrench time vs. administrative time analysis
- Team workload balance view
- Training compliance per technician

### 27. Report Center & Report Builder
- Pre-built reports: PM compliance, WO aging, parts consumption, downtime summary
- Custom report builder: select any data field, any date range
- Scheduled report delivery via email (cron-based)
- PDF and CSV export from all reports

### 28. Energy Dashboard
- Utility meter tracking (electric, gas, water, compressed air)
- Utility cost per unit of production
- Anomaly detection: automatic alert when consumption spikes beyond baseline
- Utility trending and period-over-period comparison
- Manual meter entry and automatic sensor feed integration

### 29. Product Quality Log
- Quality event capture at production line level
- Defect coding and categorization
- Linked to equipment records (machine-caused vs. material-caused)
- Quality trend dashboard by line, by shift, by product

### 30. Budget Forecaster
- Rolling CapEx and OpEx forecast
- What-if modeling for deferred maintenance scenarios
- Linked to actual spend data from Parts and WO records
- Interfaces with the **OpEx Self-Healing Loop** (Feature 79) — committed savings flow back as realized adjustments to the forecast baseline

### 31. Underwriter Portal (Insurance Intelligence)
- Automated insurance risk score: 0–100 composite scoring
- 12-factor compliance assessment (LOTO, PM compliance, calibration, incident rate, etc.)
- Evidence packet generation — formal PDF report describing plant safety performance
- Risk trajectory view (improving vs. deteriorating)
- Designed to be shared directly with insurance underwriters for premium negotiation

---

## TIER 6 — Spatial Intelligence & Mapping

### 32. Floor Plan Management
- CAD import (DXF format) — converts engineering drawings to interactive floor maps
- LiDAR 3D scan import — point cloud visualization in browser via Three.js
- Satellite paste — aerial imagery as base layer
- Zone drawing — define maintenance areas, hazard zones, department boundaries
- Asset pinning — equipment appears as interactive pins on the floor map
- Click any pin to open the full asset record
- Multi-floor support
- LiDAR scanner mode for mobile capture

### 33. Cesium 3D GIS Globe
- Full 3D globe view of all corporate facilities
- Plant location pins with live KPI bubbles
- Drill-down: click facility on globe → open that plant's dashboard
- Satellite and terrain imagery base layers
- Corporate campus spatial intelligence

### 34. US / Global Map View  
- 2D continental map with all facility locations
- Regional rollup KPIs per geographic cluster
- Weather overlay at facility locations

---

## TIER 7 — IT & Infrastructure Management

### 35. IT Department Module
- Hardware inventory (servers, workstations, network gear, printers)
- Software license inventory with expiry and seat count tracking
- License compliance alerting (over-deployed, expiring)
- MDM (Mobile Device Management) infrastructure map
- Network infrastructure documentation
- IT help desk ticket queue
- Asset assignment (which user has which device)
- IT analytics and metrics dashboard

### 36. LDAP / Active Directory Integration
- Single sign-on via LDAP connector
- User provisioning from corporate directory
- Role assignment mapped to AD group membership
- Automatic account sync on login

### 37. Device Registry (SCADA / OT Network)
- PLC and sensor onboarding via Modbus TCP
- Subnet sweep for automatic device discovery (port 502)
- MAC→IP ARP resolution worker (survives DHCP renewals)
- Register mapping with tag naming
- Device status monitoring

### 38. BLE Beacon Tracking
- Bluetooth Low Energy beacon asset tracking
- Indoor positioning for mobile hardware and tools
- Beacon registry with zone assignment

### 39. UWB (Ultra-Wideband) Positioning
- High-accuracy indoor positioning with UWB anchor infrastructure
- Real-time asset location on floor plan
- Location history log

---

## TIER 8 — People & Training

### 40. Training Management
- Training record per technician (certifications, completions, expiry)
- Training schedule and assignment
- Compliance tracking (who is overdue for required training)
- Certificate storage and retrieval

### 41. SOP Library (Standard Operating Procedures)
- AI-generated procedure drafts from asset data and task description
- Version-controlled SOP history
- Asset-linked: SOPs attached to specific equipment
- SOP approval workflow
- SOP print engine (formatted PDF output)
- QR-accessible: scan equipment tag to view active SOP on mobile

### 42. Tribal Knowledge Base
- Informal knowledge capture from experienced technicians
- Searchable by equipment, symptom, or keyword
- Open submission by any technician role
- Moderated by supervisors

### 43. Contractor Management
- Contractor company and contact records
- Contractor assignment to work orders
- COI (Certificate of Insurance) tracking with expiry alerts
- Contractor access provisioning (limited role)
- Contractor performance history

### 44. Personnel Directory
- Plant staff directory
- Role and department assignment
- Contact information management

---

## TIER 9 — The Live OS Architecture

### 45. Live Studio IDE
- Embedded Monaco Editor (VS Code engine) inside the running production application
- Full source file browser — read any file in the codebase
- Syntax-highlighted editing with autocomplete
- Sandboxed deploy pipeline: write → sandbox → test → deploy
- Hot-reload deployment without server restart
- Git-based deploy ledger — every deploy creates a permanent, immutable record (SHA, user, timestamp, notes)
- SHA copy-to-clipboard on any ledger entry
- Emergency Recovery: one-click revert to last stable `stable-*` git tag
- Safe Mode boot: launches server on last stable tag if latest commit is broken

### 46. Parallel Universe Engine (Deterministic Simulation)
- Clones a complete plant database to a sandbox branch
- Replays historical event logs against sandboxed code changes
- Delta badge view: side-by-side comparison of live vs. sandboxed KPIs (green = improvement, red = regression)
- Mathematical proof that a code change is safe before production deployment
- Auto-expiry: simulation sessions purge after 30 minutes

### 47. Frictional Cost Engine (UX Impact Analyzer)
- Impact tab: traces ES6 import chains from any modified file to every React Router route it affects
- Identifies changed components, affected routes, downstream importers
- Red banner if production routes are impacted; indigo banner for utility/shared component changes
- Financial wrench-time calculation: quantifies workforce time cost of any UI change
- Runs against current open file or all uncommitted `git diff HEAD` changes

### 48. Audit Ledger (Deployment History)
- Immutable record of every deploy, revert, and failed build
- Searchable by user, date range, status, free text, and SHA
- Status badges: Success / Failed / Building / Reverted
- PDF export of filtered ledger results
- Cannot be deleted by any user role

---

## TIER 10 — User Experience & System Architecture

### 49. Onboarding Wizard
- First-boot guided setup: plant name, timezone, currency, logo upload
- Admin and demo account creation during onboarding
- Database initialization and seeding during wizard
- Skippable steps with resume capability

### 50. Contextual Tour System
- In-app guided tours per module
- Role-aware tour content (Technician sees different tips than Admin)
- Dismissible and resumable

### 51. Multi-Tenant Architecture
- One SQLite database file per plant — zero cross-tenant data leakage
- Plant selector in header — switch between facilities instantly
- AsyncLocalStorage request pinning — every API call auto-routes to correct plant DB
- Corporate-level users can access all plants; plant users are scoped to one

### 52. 8-Tier Role-Based Access Control (RBAC)
- Technician, Senior Technician, Supervisor, Manager, Planner, Director, Admin, Creator
- Each role has precisely scoped module and action permissions
- Role switcher for multi-role users
- Role-aware UI: menus, buttons, and data filtered per role automatically

### 53. Offline-First PWA
- Full Progressive Web App — installable on desktop and mobile
- Service worker caches critical data for offline access
- Technicians continue working during server outage
- Auto-sync with conflict resolution on reconnect
- PWA install prompt with platform detection

### 54. Mobile Barcode / QR Scanner
- WebRTC camera access for in-browser scanning
- ZXing library: reads Code 128, QR, Code 39, EAN, and DataMatrix
- Horizontal and vertical orientation support
- iOS and Android compatible
- Zebra rugged device compatible
- Global scanner accessible from any module

### 55. Notification Center
- In-app notification feed
- PM due alerts, reorder alerts, calibration expiry, training expiry
- Escalation rules engine: define automatic notification routing by condition and delay
- User notification preferences per alert type

### 56. Push-to-Talk Voice Input
- Microphone button on supported views
- Speech-to-text for notes, work order descriptions, and log entries
- Reduces keyboard dependency on the plant floor

### 57. 11-Language Internationalization
- English, German, Spanish, French, Japanese, Korean, Portuguese, Arabic, Hindi, Turkish, Chinese
- All UI labels, module names, and field labels translated
- RTL (right-to-left) layout support for Arabic
- Language switcher in user settings
- Auto-translation dictionary for new keys

### 58. Approval Queue
- Formal approval routing for work requests, POs, and permits
- Multi-level approval chains
- Delegated approvals during absence

### 59. Work Request Portal
- External-facing (non-maintenance) staff can submit work requests
- Operations, production, and facilities staff portal
- Request status tracking for submitters
- Convert request to formal work order with one click

### 60. Warranty Dashboard
- Active warranty tracking per asset
- Warranty expiry alerts
- Vendor warranty contact information
- Warranty claim history and status

### 61. Photo Management (PhotoAssembly)
- Multi-photo capture per asset and work order
- Webcam and file upload support
- Photo gallery with thumbnail view
- Photo attached to audit trail on WO close

### 62. Snap Nameplate OCR
- Point camera at equipment nameplate
- Tesseract.js local OCR (no cloud required)
- Extracted fields: make, model, serial number, voltage, HP, RPM, etc.
- Auto-populates asset catalog fields
- Desktop webcam modal + mobile native camera

### 63. Risk Scorecard
- Per-asset composite risk score based on age, failure history, criticality, and PM compliance
- Plant-wide risk ranking: worst-to-best equipment list
- Risk trend over time
- Input to Underwriter Portal scoring

### 64. Storeroom View
- Physical storeroom layout management
- Bin location tracking per part
- Pick list generation for work orders
- Storeroom cycle count tools

### 65. Backup & Snapshot System
- On-demand database snapshot creation
- Snapshot rollback (restore plant DB to any prior snapshot)
- Scheduled automatic backups
- Backup privilege management (restricted to Admin)

### 66. Import Engine
- CSV bulk import for assets, parts, vendors, work orders
- MS Access (.accdb, .mdb) database import — direct migration from legacy CMMS
- SQL Server export import
- SAP data bridge (flat file import)
- Import validation with error reporting before commit
- Production data import pipeline

### 67. Branding & White-Label
- Custom plant/company logo upload
- Color theme customization per plant
- Branded PDF report headers

### 68. Chat / Internal Messaging
- Internal plant messaging between users
- Thread-based conversations
- Attached to work orders and assets where relevant

### 69. Governor Console (Creator Role)
- Creator-role exclusive management console
- Manage sandbox branches
- Grant temporary access to specific users
- Monitor all active sandbox sessions

### 70. Group Portal
- User group management
- Bulk permission assignment to groups
- Notification routing by group

### 71. Digital Twin
- 3D digital asset model viewer
- Equipment state representation (running, idle, fault)
- Linked to live sensor data feeds for real-time state

### 72. CV (Computer Vision) Integration
- CV result badge display on asset records
- Integration point for external CV inspection systems feeding into asset condition scores

### 73. Enrollment Queue
- New user enrollment review workflow
- Admin approval required before new accounts become active
- Pending enrollment dashboard

### 74. Mission Control Dashboard
- Role-aware central landing page
- Key KPI summary: open WOs, overdue PMs, critical alerts, open incidents
- Predictive risk alerts surfaced before threshold breach
- Shift handoff summary
- Personal work queue for logged-in technician
- Quick-action bar (create WO, create permit, scan asset)

### 75. Data Bridge (API Integration Hub)
- Integration management UI
- Configure REST API connections to external systems
- Connection test tool
- Payload mapping editor
- Activity log per integration

### 76. Gap Features Engine
- Internal module for tracking capability gaps vs. competitor platforms
- Used to drive the internal feature roadmap

### 77. Plant LAN Peer Sync (LanHub)
- WebSocket-based hub server embedded in each plant's local area network
- All plant devices (Zebra guns, tablets, workstations) connect to the hub on `ws://<hub-ip>:1940` — no internet required
- Real-time broadcast: asset state changes, WO updates, and scan queue events propagate to every device in the plant instantly
- Offline scan queue: scans buffered in IndexedDB when no server is reachable; auto-flushed to both hub and central server when connectivity is restored
- JWT authentication: hub validates token before accepting any device connection
- Reconnect loop: client retries with exponential backoff; device never falls silent permanently
- Hub-aware mission control: supervisor view shows live device presence count for the plant
- On hub reconnect: central server reconciles any queued scans that arrived during the outage

### 78. Offline Scan Queue & Silent Auto-Close Engine
- Scans captured offline are stored in a persistent IndexedDB queue (`sync_queue` store) tied to the plant's origin
- On device reconnect (`online` event), the queue is drained sequentially — no scans are lost even across full server outages
- Duplicate suppression: records already submitted to hub are skipped on drain to prevent double-close
- Silent Auto-Close Engine (server-side hourly cron): detects `Active` WorkSegments that have exceeded the configurable `autoReviewThresholdHours` threshold (default: 12 h)
- Exempt hold reasons: segments placed under deliberate holds (e.g., `waiting-for-parts`, `locked-out`) are skipped and never auto-closed
- Flagged for review: auto-closed segments set `needsReview = 1`, `reviewReason = 'SILENT_AUTO_CLOSE'`, `reviewStatus = 'FLAGGED'` on the parent Work Order without overwriting a prior more-specific flag
- Per-plant configurability: `PlantScanConfig.autoReviewThresholdHours` lets each site tune the threshold independently
- E2E tested: all six offline-sync and auto-close scenarios covered by the Playwright suite (`tests/e2e/offline-lan-sync.spec.js`)

---

## TIER 11 — OpEx Self-Healing Loop

### 79. OpEx Action Commitment & Outcome Tracking Engine

The OpEx Self-Healing Loop is Trier OS's autonomous savings accountability engine. It closes the gap between a financial analysis identifying a savings opportunity and confirmation that the savings actually materialized. Most CMMS platforms stop at the recommendation. Trier OS executes, tracks, and validates end-to-end.

#### Execution Tracking — Did the action happen?
- Corporate or plant managers commit to a specific cost-reduction action directly from the Corporate Analytics savings card interface (energy waste, PM labor, parts spend, contractor overruns, etc.)
- Each commitment records: plant ID, savings category, predicted dollar amount, responsible party, target date, and priority level (`CRITICAL` / `HIGH` / `NORMAL` / `LOW`)
- Status lifecycle: `OPEN → IN_PROGRESS → COMPLETED → MISSED`
- Overdue `OPEN` or `IN_PROGRESS` commitments are automatically marked `MISSED` by the 24-hour cron engine

#### Outcome Validation — Did savings materialize?
- Automated 30 / 60 / 90-day checkpoint engine runs every 24 hours via server cron (Stage 5.9 in `index.js`)
- At each checkpoint, the engine:
  1. Captures a live baseline from the plant's current energy, labor, and parts spend via `captureBaseline()`
  2. Compares against the pre-commitment baseline snapshot taken at commitment time
  3. Calculates the **realization rate**: `actualSavings / predictedSavings × 100`
  4. Stores the delta in `OpExOutcomes` with timestamp and checkpoint number
- Outcomes are classified: `ON_TRACK` (realization ≥ 80%), `PARTIAL` (40–80%), `NOT_REALIZED` (< 40%)
- Baseline capture is guarded against `all_sites` aggregation — only real plant-scoped data is used

#### Feedback Loop — How it reports back and escalates
- `OpExAlerts` table records `MISSED_OUTCOME` events when realization falls below 40%
- Escalation alerts (`ESCALATION` type) fire when a commitment remains unresolved past the 90-day mark
- Alert deduplication guards prevent repeated alerts on successive cron runs for the same commitment
- Plant operations staff see outstanding commitments in the **OpEx Action Items** dashboard widget
- Corporate sees the enterprise-wide realization rate on the Corporate Analytics → OpEx Intel tab
- API endpoints let plant managers update commitment status and mark actions in progress

#### Data Model

| Table | Purpose |
|---|---|
| `OpExCommitments` | One row per savings action commitment, including baseline snapshot |
| `OpExOutcomes` | One row per 30/60/90-day checkpoint measurement |
| `OpExAlerts` | Missed and escalation events, deduplicated per commitment |

#### Security & Access Control
- All 10 API endpoints enforce `isCorp()` role check — only corporate-role accounts can read or write
- `plantId` parameters are sanitized with a strict alphanumeric whitelist before any DB path construction
- Plant-scoped endpoints enforce that the requesting user's plant matches the requested `plantId`
- N+1 query pattern eliminated — commitment list uses batch queries (3 total, regardless of dataset size)
- Foreign key indexes on `OpExOutcomes` and `OpExAlerts` ensure query performance scales as data grows

#### API Surface (mounted at `/api/opex-tracking`)

| Method | Route | Description |
|---|---|---|
| `POST` | `/commit` | Create a new savings commitment with baseline snapshot |
| `GET` | `/commitments` | List all commitments with status and realization rate |
| `GET` | `/plant/:plantId` | Plant-scoped commitment view |
| `PATCH` | `/:id/status` | Update commitment status (IN_PROGRESS, COMPLETED) |
| `GET` | `/:id/outcomes` | View 30/60/90-day checkpoint results for a commitment |
| `GET` | `/alerts` | All missed/escalated commitments |
| `GET` | `/summary` | Enterprise rollup: total predicted, realized, realization rate % |
| `POST` | `/baseline/capture/:plantId` | Manually trigger a baseline snapshot |
| `POST` | `/cron/run` | Manually trigger the outcome measurement cron |
| `GET` | `/commitments/export` | CSV export of all commitments with outcomes |

---

## CORRECTIONS FROM INITIAL AUDIT — Already Implemented


The following items were originally listed as "potential additions" but are **fully implemented** in Trier OS:

| Item | What Actually Exists |
|---|---|
| **Scheduled Report Delivery** | Full cron (Stage 5.6 in index.js) — checks every 15 min, supports daily/weekly/monthly schedules, sends via email service, updates `nextSend` in ScheduledReports table. Already in the Report Center. |
| **Contractor COI Expiry Block** | `PrequalificationStatus` must be `Approved` before assignment. An `Approved` contractor with no active Permit-to-Work triggers a hard amber warning block in the contractor detail view. COI expiry is tracked and displayed inline. |
| **Inter-Plant Parts Visibility** | `analytics.js` corporate rollup surfaces cross-plant inventory. The `notifications.js` and `logistics.js` routes already expose inter-plant transfer endpoints. |
| **Contractor SLA / Time Theft Detection** | Fully implemented — the Contractors Job History tab actively cross-references vendor invoice hours against security gate access logs, automatically blocks PO routing, and triggers a chargeback dispute when time discrepancy is detected. This was not even listed in the feature set and is arguably one of the most operationally valuable hidden features in the platform. |
| **OpEx Self-Healing Loop** | Fully implemented as Feature 79 (Tier 11). The 24-hour cron engine, 30/60/90-day checkpoint validation, commitment lifecycle (`OPEN → MISSED`), alert deduplication, plant-scope enforcement, and all 10 hardened API endpoints are live in `server/routes/opex_tracking.js`. Security audit completed 2026-04-10: all endpoints enforce `isCorp()` RBAC, `plantId` sanitized against path traversal, N+1 query pattern eliminated. |

---

## GENUINE POTENTIAL ADDITIONS — Not in Codebase

After full code audit, the following are features that **do not exist** in Trier OS and would add genuine, quantifiable enterprise value:

---

### A. Spare Parts Min/Max Optimizer
**What it would do:** Analyze 12+ months of consumption history per SKU and automatically recommend optimal min/max reorder levels — factoring in supplier lead time, linked asset failure frequency, and seasonal demand patterns.  
**Why it matters:** A single wrong min/max on a critical spare can cause a $50,000 production shutdown waiting for a $200 part. This is consistently ranked as one of the top five hidden costs in industrial maintenance operations. The consumption data is already in the system — the optimization logic is the only missing piece.

### B. Parts Photo Catalog
**What it would do:** Attach one or more thumbnail photos to each Part SKU record, visible in the storeroom and during WO parts consumption.  
**Why it matters:** In high-turnover storerooms, technicians frequently pull the wrong part because two SKUs look identical in a text-based catalog. A photo reduces picking errors without requiring any additional training. The webcam/snap infrastructure is already built for assets — extending it to parts is a straightforward addition.

### C. Predictive Maintenance ML Inference Endpoint
**What it would do:** An open REST endpoint that accepts external ML model inference results — vibration signature analysis, thermal imaging scores, oil analysis predictions — and writes predicted failure dates and confidence scores back into the asset record.  
**Why it matters:** Trier OS currently uses statistical prediction (failure frequency analysis). True ML-based prediction via external models (from vendors like SKF, Fluke, or Aspentech) would allow plants that already own that hardware to use Trier OS as the authoritative aggregation point. Trier OS does not need to own the ML model — only consume its output. Zero vendor lock-in.

### D. Technician Field Mode (Simplified Mobile WO View)
**What it would do:** A toggled "Field Mode" that strips the work order UI down to only what a technician needs while standing at a machine: assigned WO number and description, task checklist, parts needed, and a single one-tap time start/stop button. Exiting Field Mode returns to the full desktop interface.  
**Why it matters:** The current WO interface is correctly feature-rich for planners and supervisors on desktop, but it is data-dense for a mechanic operating a 5-inch screen with grease on their hands. Faster close-out on the floor means more accurate labor data and better compliance tracking. No new backend required — this is purely a front-end rendering mode.

---

*© 2026 Doug Trier. Internal Engineering Document.*

