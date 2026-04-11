Read this in other languages: English | Español | Français | Deutsch | 中文 | Português | 日本語 | 한국어 | العربية | हिन्दी | Türkçe |

<div align="center">
  <img src="./public/assets/TrierOS_Logo.png" alt="Trier OS Banner" width="600">

  # Trier OS
  
  **The Self-Modifying, Deterministic Industrial Operating System**

  [![React](https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
  [![Node.js](https://img.shields.io/badge/Node.js-Express-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
  [![SQLite](https://img.shields.io/badge/SQLite-EDR%20Safe-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org/)
  [![Cesium](https://img.shields.io/badge/Cesium-GIS%20Analytics-60A5FA?style=for-the-badge&logo=cesium&logoColor=white)](https://cesium.com/)

  [Features](#sparkles-the-advanced-engines) •
  [Installation](#gear-installation--quick-start) •
  [Architecture](#triangular_ruler-zero-obfuscation-architecture) •
  [Security](#shield-security--funding) •
  [Demo Data](./docs/DEMO_DATA.md) •
  [Quick Facts](./docs/QUICK_FACTS.md) •
  [Docs](./docs/ARCHITECTURE.md)

  ---

  *If this project creates value, please star the repo — it helps unlock funding to continue development.*
</div>

---

## 🎬 Demo

[![Trier OS — First-Time Onboarding](https://img.youtube.com/vi/cOxjyI-GKOo/maxresdefault.jpg)](https://www.youtube.com/watch?v=cOxjyI-GKOo)

## 📸 Screenshots

<div align="center">

| Mission Control | Assets & Machinery |
|---|---|
| ![Mission Control](./docs/screenshots/mission-control.jpg) | ![Assets](./docs/screenshots/assets.jpg) |

| Corporate Analytics | Floor Plans |
|---|---|
| ![Analytics](./docs/screenshots/analytics.jpg) | ![Floor Plans](./docs/screenshots/floor-plans.jpg) |

<img src="./docs/screenshots/live-studio.jpg" alt="Live Studio IDE" width="100%">

*Live Studio — Embedded Monaco IDE with deploy pipeline, blast-radius mapper, and deterministic simulation engine*

</div>

---

## 📖 Overview

**Trier OS** is an enterprise-grade, full-stack Plant Operations system built to command heavy industry facilities. It is not just maintenance software—it is a "Living OS." 

Designed for scale, strict determinism, and zero-trust security, Trier OS combines central operational controls with a built-in sandbox IDE, allowing authorized operators to modify the system directly from the plant floor without relying on external cloud infrastructure.

---

## :sparkles: The Advanced Engines

- 🛠️ **The Live Studio Sandbox:** An embedded Monaco-based IDE allowing authorized "Creators" to write, sandbox, and hot-reload source code directly inside the production app. No external servers required.
- 🌌 **The Parallel Universe Engine:** Forget AI hallucinations. This deterministic simulation engine replays historical plant event logs against your sandboxed code changes, providing mathematical proof that a code change won't crash the factory floor.
- 💰 **The Frictional Cost Engine:** A static UX analyzer that calculates the exact financial "wrench-time" cost of UI changes, throwing warnings if a code modification slows down the workforce.
- 🛡️ **Human Airgap Security:** The system mandates a hard security boundary. All AI-assistance is decoupled from the plant network and strictly human-mediated, avoiding liability nightmares.
- 🌍 **GIS Spatial Intelligence:** Fully integrated 3D spatial intelligence maps (powered by Cesium) to pinpoint hardware across corporate campuses.
- 📱 **Mobile Hardware Scanning:** Embedded WebRTC barcode scanning for real-time audit sweeps on iOS/Android or Zebra rugged devices.
- 🔒 **EDR-Safe Local Mode:** Runs entirely disconnected from the cloud using a self-contained `better-sqlite3` instance natively built for strictly firewalled Operational Technology (OT) networks.

---

## :gear: Installation & Quick Start

Because Trier OS requires its architectural source to power the Live Studio, you must clone the raw repository.

### 1. Requirements
*   Node.js (v22+)
*   Git

### 2. Clone & Build
```bash
git clone https://github.com/DougTrier/trier-os.git
cd trier-os
npm install
```

### 3. Start the Environment
Boot up the API and UI in the concurrent development environment.
```bash
npm run dev:full
```
The application will automatically ignite at `http://localhost:5173`.

### Keeping Trier OS Updated
```bash
git pull origin main
```

---

## :triangular_ruler: Zero Obfuscation Architecture

Trier OS is built on extreme contextual transparency. We enforce a hard **10% minimum Contextual Density Ratio** across 153,000+ lines of core application logic.

Every logic file contains the mandatory **Trier OS Architecture Header Pattern**, meaning over 16,000 lines of context documentation exist purely to bridge the gap between engineering scripts and physical Plant Floor Operations.

**Notice to Contributors:** Any pull request that drops the core contextual coverage below 100% will be rejected automatically. See `CONTRIBUTING.md` for our strict header templates.

---

## :shield: Security & Funding

### Security Protocols
Because this software operates physical manufacturing assets, we handle vulnerabilities with extreme caution. **Do not** report exploits in the public GitHub issues. Please read `SECURITY.md` for our responsible disclosure email protocols.

### Support the Project
Trier OS is completely free and open-source. If this software runs your warehouse or manufacturing facility, consider supporting our ongoing development!

Click the **Sponsor** button at the top of the repository to view our Funding Gateway (GitHub Sponsors, Open Collective for corporate B2B tax receipts, and Ko-Fi).

---

## 📜 Legal & License
Released openly under the **MIT License**. You are free to use, modify, and distribute this platform within your corporation.
