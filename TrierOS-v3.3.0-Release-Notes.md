# Trier OS v3.3.0 — Initial Public Release

**The first open-source release of Trier OS** — a full-stack, enterprise-grade Plant Operations Platform built for industrial manufacturing and processing facilities. Local-first, cloud-free, and designed for air-gapped OT environments.

---

### What's Included

| | |
|---|---|
| **15 Core Modules** | Mission Control, Asset Registry, Work Orders, Parts & Inventory, Safety & Compliance, Fleet & Truck Shop, SOP Library, Engineering Tools, Corporate Analytics, Underwriter Portal, Sensor Gateway, Floor Plans, IT Department, Live Studio IDE, and more |
| **134 React Components** | Full React 19 frontend with offline PWA support |
| **11 Languages** | English, German, Spanish, French, Japanese, Korean, Portuguese, Arabic, Hindi, Turkish, Chinese |
| **50,000+ Lines of Server Logic** | Express 5 backend with 78 API route modules |
| **Multi-tenant Architecture** | One SQLite database per plant — zero cross-tenant data leakage |
| **Offline PWA** | Technicians keep working when the server is unreachable |
| **Live Studio IDE** | Embedded Monaco editor (VS Code engine) — inspect, edit, and hot-reload the app from inside the UI |
| **Parallel Universe Engine** | Deterministic simulation that mathematically proves code changes are safe before deployment |

---

### Quick Start

```bash
npm install
npm run dev:full
```

Open `http://localhost:5173` — demo credentials in `docs/DEMO_CREDENTIALS.md`

---

### Portable Build

A self-contained portable build with bundled Node.js runtime is available as a release asset. No installation required — extract and run `Trier OS.bat`.

---

### Tech Stack

React 19 · Node.js 22 · SQLite · Express 5 · Cesium GIS · Monaco Editor · Playwright · 11-language i18n

---

### Requirements

- Node.js 18+
- Windows, Linux, or macOS

---

### Known Limitations

- First-boot corporate index build may take 30–60 seconds on large multi-site deployments
- HTTPS uses a self-signed cert — browsers will warn on first visit (expected for LAN deployments)
- Sensor Gateway OPC-UA requires access to OT/PLC network equipment
- Live Studio deploy pipeline requires Git to be installed on the host machine

---

*Released under the MIT License · © 2026 Doug Trier · [Discussions & Support](https://github.com/DougTrier/trier-os/discussions)*
