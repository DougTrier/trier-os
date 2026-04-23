# Trier OS — Quick Facts & Project Specifications

**Version:** 3.5.1  
**Development Started:** March 7, 2026  
**Development Completed:** April 22, 2026  
**Public Release:** April 9, 2026  
**Total Build Time:** 37 days  
**License:** MIT  
**Classification:** Enterprise-Grade Open-Source  
**Repository:** [github.com/DougTrier/trier-os](https://github.com/DougTrier/trier-os)  

---

## At a Glance

| Metric | Value |
|---|---|
| Core Application Logic (`.js`, `.jsx`) | **158,221 lines** |
| React UI Components | **142 modular interfaces** |
| Backend API Routes | **201 server modules · 91 route files · 62,348 lines** |
| i18n Translations | **11 languages · 100,661 lines** |
| Production Dependencies | **34 vetted packages** |
| Languages Supported | **11** (EN, DE, ES, FR, JA, KO, PT, AR, HI, TR, ZH) |
| Database Architecture | **Multi-tenant SQLite sharding** (one `.db` per plant) |
| E2E Test Coverage | **8,731 lines · 17 spec files · 559 mobile / 700 desktop passing** |
| Development Started | **March 7, 2026** |
| Public Release | **April 9, 2026** |
| Total Build Time | **33 days** (pure Agentic Coding, single developer) |

---

## What It Is

**Trier OS** is a full-stack, enterprise-grade **Plant Operations Platform** built to command heavy industrial facilities. It is not a lightweight SaaS widget — it is a complete, production-hardened operating system for the plant floor.

Designed as a **local-first, cloud-free** system, it runs entirely within the plant's internal network, making it suitable for air-gapped OT (Operational Technology) environments where cloud connectivity is a security disqualifier.

---

## Core Module Inventory (15 Modules)

| Module | Capability |
|---|---|
| **Mission Control** | Role-aware central gateway, shift handoff, predictive risk alerts |
| **Asset Registry** | Equipment lifecycle, MTBF/MTTR, floor plan pinning, depreciation |
| **Work Orders** | Full work order engine, labor tracking, parts consumption, sign-offs |
| **Parts & Inventory** | SKU management, reorder thresholds, vendor pricing intelligence |
| **Safety & Compliance** | LOTO permits, incident log, JSA/JHA, OSHA records, calibration |
| **Fleet & Truck Shop** | DOT compliance, DVIR inspections, fuel, tires, CDL certs |
| **SOP Library** | AI-generated procedures, version control, asset-linked deployment |
| **Engineering Tools** | RCA (5-Why), FMEA, Repair-vs-Replace, CapEx projects, lubrication |
| **Corporate Analytics** | Cross-plant GIS map, OEE dashboard, financial intelligence, forecasting |
| **Underwriter Portal** | Insurance risk scoring (0–100), evidence packet generation |
| **Fleet Intelligence** | Vehicle registry, service history, fuel management |
| **Sensor Gateway** | SCADA/IoT via MQTT and REST, threshold alerting, auto-WO generation |
| **Floor Plans** | CAD import (DXF), LiDAR 3D, satellite paste, zone drawing |
| **IT Department** | License tracking, hardware inventory, MDM, network infrastructure |
| **Live Studio IDE** | Embedded Monaco editor for authorized in-app code modification |

---

## The Unique Technical Differentiators

### The Parallel Universe Engine
A deterministic simulation engine that replays historical plant event logs against sandboxed code changes—providing mathematical proof that a modification won't cause failures on the plant floor before it is ever deployed.

### The Frictional Cost Engine
A static UX analyzer that calculates the exact financial "wrench-time" cost of UI changes by measuring how long workflow interactions take. Throws automated warnings if a code change statistically slows down the workforce.

### The Live Studio IDE
An embedded Monaco-based code editor (the same engine powering VS Code) that allows authorized Creator-role operators to write, sandbox, and hot-reload source code directly inside the running production application—without external servers or deployment pipelines.

### Human Airgap Security
All AI assistance is architecturally decoupled from the plant network and strictly human-mediated. The system enforces a hard security boundary ensuring no AI model has autonomous write access to plant data.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, Vanilla CSS |
| Backend | Node.js 22, Express 5 |
| Database | SQLite (`better-sqlite3`) — one file per plant |
| Authentication | bcrypt, JWT, AsyncLocalStorage session pinning |
| 3D GIS Maps | Cesium (3D globe), Leaflet (2D floor plans) |
| Barcode Scanning | WebRTC Camera API, ZXing library |
| IDE Engine | Monaco Editor (VS Code core) |
| E2E Testing | Playwright with Chromium |
| i18n | Custom key-based translation engine (11 languages) |

---

## Architecture Highlights

- **Multi-tenant SQLite sharding** — Zero cross-tenant data leakage, one file per plant
- **AsyncLocalStorage request pinning** — Every API request auto-routes to the correct plant DB
- **8-tier RBAC** — Technician → Creator, each with a precisely scoped module set
- **Offline-first PWA** — Technicians continue operating when the server is unreachable; auto-sync on reconnect
- **EDR-Safe local mode** — Fully disconnected from the internet; runs on strictly firewalled OT networks
- **Zero Obfuscation standard** — 10% minimum contextual density ratio enforced; all architecture documented inline

---

## Quality & Security Validation

- Playwright E2E gauntlet executed across **44 simultaneous multi-site database instances**
- Multi-round penetration testing with documented results
- Security audit sweeps performed March 24, 2026 and March 30, 2026
- Phase 0 sanitization completed prior to open-source release (all PII and proprietary plant data removed)
- All 34 production dependencies vetted for license compliance and known CVEs

---

## Strategic Value

Trier OS is released open-source as a **community anchor**. The 1.5M-line codebase is the loss-leader that enables:

1. **Universal industry auditing** — The community validates the security and logic of a system running real industrial equipment
2. **Ecosystem enablement** — External hardware vendors and integrators can build certified connectors
3. **Enterprise pipeline** — Organizations that adopt the platform create a natural path to paid hosting, support contracts, and sponsored development
4. **Proof of concept** — Demonstrates the ceiling of Advanced Agentic Coding: a single developer orchestrating enterprise-scale software in under 30 days

---

*© 2026 Doug Trier. Released under the MIT License.*
