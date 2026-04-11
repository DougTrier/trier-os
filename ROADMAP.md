# Trier OS — Public Roadmap

> This roadmap reflects planned development priorities for Trier OS. Items are subject to change based on community feedback, contributor capacity, and industrial customer requirements.
>
> **Have a feature request?** Open a [GitHub Discussion](https://github.com/DougTrier/trier-os/discussions) or upvote an existing one.

---

## Status Legend

| Status | Meaning |
|---|---|
| 🔵 Planned | Scoped and queued — not yet started |
| 🟡 In Progress | Actively being built |
| ✅ Shipped | Available in a released version |
| 💬 Under Discussion | Community input being gathered |

---

## v3.4.0 — Quality & Operations Intelligence

### 🔵 Quality Control (QA) Module
The most significant gap in v3.3.0 for heavy manufacturing customers. Tracks production quality at the plant level and rolls up enterprise-wide.

**Planned capabilities:**
- Non-Conformance Reports (NCRs) — creation, routing, disposition
- First-Pass Yield (FPY) tracking by line, shift, and product
- Defect codes + Pareto chart analysis
- Scrap and rework rate trending
- Inspection checksheets linked to Work Orders
- Corporate rollup: rejection rate, yield rate, and NCR count across all plants
- Integration with Work Orders — auto-generate WO on NCR creation

---

## v3.5.0 — Integrations & Ecosystem

### 🔵 ERP Connector Marketplace
Certified connectors for SAP, Oracle EBS, Microsoft Dynamics 365, and Infor CloudSuite. Pre-built field mappings, two-way sync (WO close, parts consumption, labor posting).

### 🔵 OPC-UA Native Device Driver
Direct OPC-UA polling without a third-party bridge. Auto-discover tags from PLC address space and map to Sensor Gateway.

### 🔵 REST API Public Spec (OpenAPI 3.1)
Machine-readable OpenAPI spec for all 80 route modules. Enables hardware vendors and integrators to build certified connectors against a stable contract.

---

## v3.6.0 — Analytics Depth

### 🔵 Predictive Maintenance Engine
Statistical failure prediction (Weibull / MTBF curves) driven by sensor history and work order data. Surfaces predicted failure windows on Mission Control.

### 🔵 Energy Intelligence Rollup
Plant-level and corporate energy consumption dashboards. kWh per unit of output, baseline vs. actuals, utility cost trending, demand spike detection.

### 🔵 Custom Report Builder
Drag-and-drop report designer for corporate users. Select metrics, group by plant/shift/date, export to PDF or CSV, schedule email delivery.

---

## Long-Term / Under Discussion

### 💬 Native Mobile App (iOS / Android)
Currently Trier OS ships as an offline-capable PWA. A native shell (Capacitor or React Native) would unlock push notifications, deeper camera integration, and app store distribution for enterprise MDM deployment.

### 💬 Cloud-Hosted Option
An optional managed hosting tier for organizations that cannot self-host. Air-gapped OT deployments would remain fully local — this is additive, not a replacement.

### 💬 Certification & Compliance Packs
Pre-built module configurations and report templates for ISO 9001, ISO 45001, OSHA 300, and FDA 21 CFR Part 11 regulated facilities.

### 💬 Digital Twin Integration
Two-way sync between Trier OS asset registry and external digital twin platforms. Asset state changes in Trier OS push to the twin; simulation results pull back in.

---

## Already Shipped — v3.3.0

| Feature | Module |
|---|---|
| 15 core operational modules | Mission Control through IT Department |
| SCADA/PLC Modbus TCP EdgeAgent | Sensor Gateway |
| LDAP / Active Directory login | Authentication |
| Sensor threshold → Auto Work Order | Work Orders + Sensor Gateway |
| ERP pull sync worker (HTTP/REST) | Integrations |
| ERP write-back outbox with retry | Integrations |
| Supply Chain corporate all-sites rollup | Corporate Analytics |
| OPC-UA device registry with ARP scanning | Plant Setup |
| OpEx Self-Healing Loop with outcome validation | Corporate Analytics |
| Live Studio IDE (Monaco embedded) | Creator Tools |
| Parallel Universe deterministic sandbox | Creator Tools |
| Offline PWA with auto-sync | Core |
| 11-language i18n | Core |
| 470-test Playwright E2E gauntlet | Quality Assurance |

---

*© 2026 Doug Trier — [Discussions & Support](https://github.com/DougTrier/trier-os/discussions)*
