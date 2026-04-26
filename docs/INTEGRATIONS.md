# Trier OS — Integration & Connectivity Reference

This document is a factual inventory of external integrations in Trier OS.
Each entry lists its status, the implementing file, and what it actually does.

**Status definitions:**
- **Active** — ships and works with no additional setup beyond configuration
- **Optional** — works when the named npm package is installed; falls back to simulation if not
- **Framework** — registry and field mapping exist; no active client library (bring your own connector)

---

## Identity & Authentication

### LDAP / Active Directory
**Status:** Active — `server/routes/ldap.js`

Full AD sync and bind. Supports custom search filters (RFC 4515 escaped), TLS, group-to-role mapping via `GatekeeperRoleMap`, and automatic user provisioning. On LDAP failure, falls back to local bcrypt auth. Protected system accounts (Admin, IT_Admin, Trier) always use local auth regardless of LDAP config.

Endpoints: `GET/PUT /api/ldap/config`, `POST /api/ldap/test`, `POST /api/ldap/sync`

### API Keys
**Status:** Active — `server/routes/api_docs.js`

Scoped API keys for third-party integrations (Power BI, Tableau, edge agents, custom tooling). Format: `pm_live_` prefix + 32 random hex bytes, SHA-256 hashed at storage. Optional expiration. Managed per-deployment in `trier_logistics.db`.

### Two-Factor Authentication (TOTP)
**Status:** Active — `server/routes/auth.js`

TOTP-based 2FA for Creator accounts (the privileged role with Live Studio access). Pre-auth token (5 min) → POST 6-digit code → full session. Secret stored AES-256-GCM encrypted in `logistics_db`.

### OAuth2 Client Credentials
**Status:** Pattern — `server/integrations/http-edge-agent.js`

Machine-to-machine OAuth2 `client_credentials` grant with automatic token refresh. Used as the auth pattern for ERP and edge agent outbound calls.

---

## Messaging & Notifications

### Email (SMTP)
**Status:** Active — `server/email_service.js`

Nodemailer-based email service. SMTP credentials stored AES-256-GCM encrypted, decrypted only at send time. Configurable host, port, SSL/TLS, from address, and per-event enable flags. Event triggers include: critical work order created, PM overdue, approvals required, custom events. Full send log retained.

### Webhooks — Slack, Microsoft Teams, Discord, Custom HTTP
**Status:** Active — `server/webhook_dispatcher.js`

Outbound webhook delivery with exponential back-off (up to 5 retries), idempotency keys for dedup, and per-platform payload formatting (Slack blocks, Teams adaptive cards, Discord embeds, raw JSON for custom endpoints). Backed by `WebhookOutbox` table with retry state tracking.

Supported events: `CRITICAL_WO_CREATED`, `PM_DUE_TODAY`, `WO_COMPLETED`, `SENSOR_THRESHOLD`, `APPROVAL_REQUIRED`, `CUSTOM`

### NATS Pub/Sub
**Status:** Active — `server/services/bus.js`

NATS 2.x message bus for inter-process and cross-service event delivery. Used by `background_cron.js` (publisher) and `index.js` (subscriber). Default broker: `nats://localhost:4222` via `NATS_URL` env var. Example topic: `trier.anomaly.detected`.

---

## Industrial Protocols & SCADA

### Sensor Data Ingestion (REST)
**Status:** Active — `server/routes/sensors.js`

Generic sensor ingest endpoint that accepts readings from any device or gateway that can make an HTTP POST. Checks readings against configured thresholds and auto-generates a work order on breach (configurable priority, description template, 30-minute cooldown). Raw data retained 30 days; monthly summaries archived indefinitely.

Endpoints: `POST /api/sensors/ingest`, `GET/PUT /api/sensors/config`, `GET/PUT /api/sensors/thresholds`

Compatible with: MQTT-to-HTTP bridges, Node-RED, Ignition gateway scripts, Python polling scripts, PLC middleware.

### OPC-UA Client
**Status:** Optional — `server/gatekeeper/adapters/opcua.js`

Requires: `npm install node-opcua`

Connects to OPC-UA servers (Siemens, Rockwell, Kepware, etc.), creates sessions, and writes to named nodes. Used by the Gatekeeper setpoint enforcement engine to write lockout values directly to the PLC. Falls back to simulation mode if `node-opcua` is not installed.

### Modbus TCP/RTU Client
**Status:** Optional — `server/gatekeeper/adapters/modbus.js`

Requires: `npm install modbus-serial`

Modbus TCP client that writes to holding registers on RTU/TCP devices. Used by Gatekeeper for direct PLC write-back during setpoint enforcement. Falls back to simulation mode if `modbus-serial` is not installed.

### UWB Real-Time Location (RTLS)
**Status:** Active — `server/services/uwbBroker.js`

WebSocket broker for Ultra-Wideband positioning systems. Receives real-time location updates from UWB anchors, runs exclusion zone detection (ray-casting algorithm), and triggers lone worker safety alerts. Supported vendors: Pozyx, Sewio, Zebra MotionWorks, and simulated.

---

## Data Import

### Microsoft SQL Server
**Status:** Active — `server/routes/import_engine.js`

Browse SQL Server tables and import legacy CMMS/EAM data directly into Trier OS. Uses `mssql ^12.2.1`. Supports OAuth2 token refresh for cloud SQL Server instances (Azure SQL).

### Microsoft Access (.mdb / .accdb)
**Status:** Active — `server/routes/import_engine.js`

Parse Access database files via `mdb-reader`. Extracts table definitions and data for legacy system migration. OLEDB fallback for `.accdb` on Windows.

### CSV Import/Export
**Status:** Active — `server/routes/biExport.js`

RFC 4180 compliant CSV with UTF-8 BOM (Excel-compatible). All BI export endpoints support `?format=csv`. Data types: work orders, assets, PM compliance, parts, labor, asset transfers, reminder insights. Import parsing via `papaparse`.

### OCR — Nameplate & Label Recognition
**Status:** Active — `server/routes/ocr.js`

Tesseract.js OCR pipeline for equipment nameplates, barcodes, and labels. Pre-processing via Jimp: grayscale, normalize, sharpen, binary threshold for metal surfaces. Multi-rotation detection (0°/90°/180°/270°). Confidence scoring with multi-strategy fallback (soft/hard/binary). Also used for parts snap-to-add from invoice photos.

### DXF / AutoCAD Import
**Status:** Active — `server/routes/dxf-import.js`

Parses DXF entities (LINE, POLYLINE, CIRCLE, ARC, ELLIPSE, TEXT, INSERT) via `dxf-parser`, converts to SVG, rasterizes to PNG via `sharp`, and stores as a floor plan layer. Converts AutoCAD drawings to interactive floor plans with no manual redrawing.

### PDF Text Extraction
**Status:** Active — `server/routes/procedures.js`

Extracts text from PDF documents via `pdf-parse` for SOP digitization. Feeds into the SOP generation pipeline — upload a PDF maintenance manual, extract the procedure text, and generate a structured Trier OS SOP.

### LiDAR Point Cloud
**Status:** Reference — `server/routes/lidar-import.js`

Accepts PLY (ASCII) and OBJ mesh files from 3D laser scanners. Stores source path reference linked to a floor plan record. Point cloud rendering is client-side via Three.js.

---

## Outbound Event Stream (ERP-Compatible)

Trier OS does not integrate *into* ERP systems. It produces verified operational data that ERP systems consume.

> **ERP records what happened. Trier OS ensures what happened is correct before ERP ever sees it.**

When a work order closes, parts are consumed, or labor is posted, Trier OS emits a validated, structured event. That event is queued, deduplicated, and delivered reliably to any configured downstream system — including ERP.

### Event Delivery — Transactional Outbox
**Status:** Active — `server/services/erp-outbox.js` + `server/routes/integrations-outbox.js`

- Events queued in `ERPOutbox` with idempotency keys at DB layer (INSERT OR IGNORE)
- `X-Idempotency-Key` forwarded to receiving endpoint for downstream dedup
- Drain worker every 60 seconds; exponential back-off on failure (5 attempts, 2^n minute delays)
- Auth: API key, Bearer token, Basic auth per connector
- Admin routes: outbox status, manual retry of failed events, cleanup
- Survives ERP downtime — events queue locally and drain when the endpoint recovers

### Connector Registry
**Status:** Active — `server/routes/erp_connectors.js`

Per-connector config (host, auth, sync direction), field mapping per event type, health check (HTTP reachability). Supported target types: SAP S/4HANA (OData REST), Oracle EBS/Fusion (REST), Microsoft Dynamics 365 (Dataverse), Infor CloudSuite EAM (ION REST), and custom HTTP endpoints.

**What you configure:** The endpoint URL and credentials. The endpoint can be a direct ERP REST API, middleware (MuleSoft, Azure Integration Services, BizTalk), or a custom receiver. Trier OS does not call SAP RFC/BAPI — that is intentional. SAP S/4HANA OData REST supersedes RFC/BAPI for new integrations and is the recommended path.

---

## AI & Translation

### SOP Generation (OpenAI / Anthropic Claude / Ollama)
**Status:** Active — `server/ai_service.js`

AI-assisted SOP generation from equipment manuals, PDFs, or free-text descriptions. Configurable provider (OpenAI, Anthropic Claude, local Ollama), model, and API key stored per deployment. Rate-limited to 10 requests/minute. Used by `/api/procedures` SOP creation flow.

### Translation (Google Translate)
**Status:** Active — `server/routes/translate.js`

Google Translate API integration with SQLite-backed cache (99%+ cache hit rate after warmup). Plant-specific glossary pre-processing protects technical terms from mistranslation. Supports 100+ languages. Powers the Trier OS 11-language UI and field-level translation for plant-specific content.

Endpoints: `POST /api/translate`, `POST /api/translate/batch`, `GET /api/translate/stats`

---

## REST API & Documentation

### REST API (100+ Endpoints)
**Status:** Active — `server/routes/*`

Full JSON REST API across 80+ route files. Auth via JWT Bearer token or httpOnly cookie. Per-route rate limiting (login: 5/15 min, sensors: configurable, general API: configurable). `/api/v2/` prefix for extended features (hierarchy, reports, cross-plant sync).

### OpenAPI / Swagger Spec
**Status:** Active — `scripts/generate_openapi.js`, `/api/docs`

OpenAPI 3.1 spec generated from route annotations. Endpoint: `GET /api/docs` returns the live spec. Regenerate with `node scripts/generate_openapi.js`.

---

## Real-Time & Sync

### Plant LAN WebSocket Hub
**Status:** Active — `server/lan_hub.js`

WebSocket server on port 1940 embedded in each plant's local network. Keeps all floor devices synchronized (Zebra scanners, tablets, workstations) when the central server is unreachable. Broadcasts `WO_STATE_CHANGED` in real time. JWT-validated on upgrade. Offline scan queue replayed to central server on reconnect.

### HA Replication Sync
**Status:** Active — `server/ha_sync.js`

Server-to-server DB replication push to a secondary instance. `POST /api/ha/promote` for failover. Auth via `HA_SYNC_KEY` (64-char hex, separate from JWT secret).

---

## What Is Not Here

To be explicit about what requires external tooling:

| Capability | Status | Path Forward |
|---|---|---|
| MQTT broker client | Not included | Use Node-RED or Mosquitto bridge → `POST /api/sensors/ingest` |
| SAP RFC/BAPI direct calls | Not included (by design) | The outbox pattern targets SAP S/4HANA OData REST, which supersedes RFC/BAPI for new integrations |
| SSO / SAML / OIDC | Not included | LDAP covers Active Directory; OAuth2 client credentials available for M2M; SAML is a roadmap item |
| Native iOS/Android app | Not included | PWA runs on all mobile browsers including iOS Safari; Zebra devices use mobile web |
