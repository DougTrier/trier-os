# Changelog

All notable changes to Trier OS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.3.0] — 2026-04-09 — Initial Open Source Release

This is the first public open-source release of **Trier OS**, an enterprise-grade, full-stack
Plant Operations Platform built for industrial manufacturing and processing facilities.

### Core Modules

- **Mission Control** — Unified role-aware dashboard with shift handoff log, predictive risk alerts, and real-time KPI cards across all plants.
- **Asset Registry** — Full equipment registry with work order history, MTBF/MTTR tracking, floor plan pinning, and multi-site asset transfer.
- **Corporate Analytics** — Enterprise-wide GIS map with 200+ asset pins, OEE dashboard, labor analytics, predictive foresight engine, and budget forecaster.
- **Supply Chain** — Parts inventory, purchase order history, vendor management, network price intelligence, and OCR snap-to-add.
- **IT Department** — Software license tracking, hardware inventory, network infrastructure management, mobile device management, and financial depreciation.
- **Safety & Compliance** — LOTO permit system, incident tracking, near-miss reporting, JSA/JHA templates, OSHA log management, and calibration tracking.
- **Fleet & Truck Shop** — DOT-compliant vehicle registry, DVIR inspections, fuel tracking, tire management, and CDL certification records.
- **Engineering Excellence** — RCA (5-Why), FMEA with auto-calculated RPN scores, Repair-vs-Replace calculator, CapEx project tracking, and lubrication routes.
- **SOP & Methods Library** — Structured operating procedures with AI generation, version control, and asset-linked deployment.
- **Underwriter Portal** — Insurance risk scoring (0–100), safety incident log, calibration status, LOTO audit trail, and Evidence Packet print.
- **Report Center** — 40+ pre-built reports plus a drag-and-drop custom report builder with CSV export.
- **Sensor Gateway** — Real-time SCADA/IoT integration via MQTT and REST with threshold alerting and automatic work order generation.
- **Floor Plans** — DXF CAD import, LiDAR 3D scan import, Google Maps satellite paste, multi-layer pin placement, zone drawing, and emergency mode.
- **Live Studio IDE** — Embedded Monaco-based code editor allowing authorized Creators to modify, sandbox, and hot-reload the application from within the UI.

### Architecture

- **Multi-tenant SQLite sharding** — Each plant facility has its own independent `.db` file; no cross-tenant data leakage.
- **AsyncLocalStorage request pinning** — Every HTTP request is automatically routed to the correct plant database without shared mutable state.
- **Role-Based Access Control (RBAC)** — 8 roles: Technician, Mechanic, Engineer, Manager, IT Admin, Lab Tech, Corporate, Creator.
- **CD Key / Invite Code system** — Walled-garden onboarding; new users require a single-use invite code to register.
- **HTTPS by default** — Auto-detected LAN IP with self-signed cert; mobile camera/scanner requires HTTPS.
- **Offline PWA support** — Technicians continue working when the server is unreachable; auto-sync on reconnect.
- **Parallel Universe Engine** — Deterministic simulation that replays historical plant event logs against sandboxed code changes for mathematical proof of safety before deployment.
- **Frictional Cost Engine** — Static UX analyzer that calculates the financial wrench-time cost of UI changes before they are promoted to production.

### Internationalization

- Full UI translation across **11 languages**: English, German, Spanish, French, Japanese, Korean, Portuguese, Arabic, Hindi, Turkish, and Chinese (Simplified).

### Tech Stack

- **Frontend:** React 19, Vite, Vanilla CSS
- **Backend:** Node.js, Express
- **Database:** SQLite via `better-sqlite3` (one file per plant)
- **Auth:** bcrypt, JWT, AsyncLocalStorage session pinning
- **Maps:** Cesium (3D GIS), Leaflet (2D floor plans)
- **Scanner:** WebRTC camera API, ZXing barcode library
- **IDE:** Monaco Editor (VS Code engine)

### Known Limitations (v3.3.0)

- `corporate_master.db` is generated on each boot by the crawl engine — first-boot index build may take 30–60 seconds on large multi-site deployments.
- HTTPS certificate is self-signed — browsers will show a security warning on first visit (expected for LAN deployments).
- Sensor Gateway OPC-UA connections require network access to OT/PLC equipment; consult your IT/OT security team before enabling.

---

## [Unreleased]

- Open Collective fiscal sponsorship integration
- GitHub Sponsors button in About modal
- Automated seed script for demo org chart (one user per RBAC role)

---

*Trier OS is open-source software released under the MIT License.*  
*© 2026 Doug Trier. Maintained at [github.com/DougTrier/trier-os](https://github.com/DougTrier/trier-os)*
