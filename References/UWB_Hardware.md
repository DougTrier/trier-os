# UWB Hardware Selection Guide
## Trier OS — Trier OS Platform

> **Status:** Reference document — created 2026-04-03  
> **Scope:** Ultra-Wideband RTLS hardware for indoor asset and personnel tracking

---

## Supported Ecosystems

Trier OS's UWB broker (`server/services/uwbBroker.js`) ships with adapters for four vendor ecosystems. Select one based on facility size, existing infrastructure, and budget.

| Vendor | Protocol | Coverage | Accuracy | Cost Tier | Best For |
|---|---|---|---|---|---|
| **Pozyx** | WebSocket / REST | Up to 400m² per anchor set | 10–30 cm | $$ | Proof of concept, small facilities |
| **Sewio** | WebSocket (Bearer auth) | Enterprise warehouse scale | 10–30 cm | $$$ | Mid-size to large facilities |
| **Zebra RTI** | REST poll (2s interval) | Large distribution centers | 30–50 cm | $$$$ | Facilities already on Zebra hardware |
| **Qorvo / Decawave DWM1001** | Custom (DIY firmware required) | Flexible | 10 cm | $ | Lowest cost, highest integration effort |

---

## Recommended Path

### Proof of Concept — Pozyx Creator Kit

- **Hardware:** 4× Pozyx UWB anchors + tags (starter kit ~$800–$1,200 USD)
- **Software interface:** WebSocket stream at `ws://<pozyx-host>:8887`
- **No middleware required** — raw JSON position stream
- **Pozyx adapter** already active in `uwbBroker.js` when `vendorType = 'pozyx'` is set in `uwb_config`

**Minimum anchor count:** 3 anchors for 2D positioning, 4 for 3D (recommended)  
**Tag battery life:** ~2–3 weeks at 10 Hz update rate

### Enterprise — Sewio RTLS

- **Hardware:** Sewio anchors (TREK1000 or UWB3000 series) + Active Tags
- **Software interface:** Sewio RTLS Studio WebSocket with Bearer token
- **Sewio adapter** in `uwbBroker.js` uses `Authorization: Bearer <token>` header
- **Scale:** 10,000+ m² with anchor mesh

### Enterprise — Zebra RTI

- **Hardware:** Zebra MC93/MC9300 with UWB module, or Zebra MPact anchors
- **Software interface:** REST API polled every 2 seconds (respects Zebra rate limits)
- **Zebra RTI adapter** in `uwbBroker.js` polls `GET /api/v1/location/current`
- **Best for:** Facilities already running Zebra Workforce Connect or VisibilityIQ

---

## Configuration

Vendor selection and credentials are stored in the `uwb_config` table in `trier_logistics.db`. Set via `PUT /api/uwb/config` or directly in the database:

```sql
INSERT OR REPLACE INTO uwb_config (plantId, vendorType, host, port, apiKey, pollIntervalMs)
VALUES ('Demo_Plant_1', 'pozyx', '192.168.1.100', 8887, NULL, 2000);
```

| Column | Description |
|---|---|
| `vendorType` | `pozyx` / `sewio` / `zebra` / `simulated` |
| `host` | Vendor server hostname or IP |
| `port` | WebSocket/REST port |
| `apiKey` | Bearer token or API key (Sewio/Zebra) |
| `pollIntervalMs` | REST poll interval (Zebra only; default 2000) |

**Simulated mode** is the default when no `uwb_config` record exists. Three tags walk random paths — useful for development and UI testing without hardware.

---

## Tag Assignment

After hardware is powered on and anchors are calibrated:

1. Register each tag in Trier OS via `POST /api/uwb/tags`:
   ```json
   {
     "tagId": "POZYX-A3F2",
     "entityType": "person",
     "entityId": "EMP-00142",
     "label": "John Smith",
     "plantId": "Demo_Plant_1"
   }
   ```
2. `entityType` must be one of: `person`, `asset`, `vehicle`
3. `entityId` maps to a Trier OS record (employee ID, asset ID, or fleet vehicle ID)

---

## Tag Procurement

| Tag Type | Recommended Model | Notes |
|---|---|---|
| Personnel | Pozyx Tag (wristband or badge clip) | Ruggedized; IP67 |
| Asset | Pozyx Tag (zip-tie or epoxy mount) | Self-adhesive bracket available |
| Vehicle (forklift) | Pozyx Tag + magnetic mount | Vibration-rated bracket required |

**UWB tag update rates:**
- Personnel tracking: 4 Hz (safety-adequate; conserves battery)
- Asset tracking: 0.5–1 Hz (battery life weeks–months)
- Vehicle tracking: 10 Hz (collision warning requires high rate)

---

## Vendor Contact

| Vendor | URL |
|---|---|
| Pozyx | pozyx.io |
| Sewio | sewio.net |
| Zebra RTI | zebra.com/us/en/products/location-technologies |
| Qorvo / Decawave | qorvo.com/innovation/ultra-wideband |
