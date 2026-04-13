# Digital Twin Integration — External Platform Sync Spec
> Trier OS P6 · Two-way sync with external digital twin platforms

---

## Current State: Internal Digital Twin

The internal digital twin (`routes/digitalTwin.js`, mounted at `/api/digital-twin`) provides:
- Schematic image upload per asset
- Interactive pin placement on schematics
- Live data overlay: sensor readings, WO status, part counts per pin
- Health status aggregation per asset

This is the **visualization layer** — a plant-floor schematic with live data overlaid. It is not a full physics-based digital twin (no 3D model, no simulation).

---

## External Platform Integration Targets

| Platform | Integration Type | API |
|---|---|---|
| **Azure Digital Twins** | Two-way asset registry sync | Azure DT REST API + Event Grid |
| **AWS IoT TwinMaker** | Component model sync + sensor data push | TwinMaker REST API + IoT Core |
| **Bentley iTwin** | 3D model asset linking | iTwin Platform API |
| **PTC Vuforia / ThingWorx** | Asset property sync + AR overlay | ThingWorx REST API |
| **Siemens MindSphere** | Asset model + time-series sync | MindSphere Asset Management API |

---

## Sync Architecture

```
Trier OS Asset Registry
        │
        │ (two-way sync via ERPConnectors pattern)
        ▼
External DT Platform
        │
        ├── Asset model (physical properties, hierarchy)
        ├── Sensor time-series (forwarded from Trier OS ingestion)
        └── Maintenance events (WO open/close forwarded via ERP outbox)
```

### Outbound (Trier OS → External DT)

Events already flowing through `erp-outbox.js` can be forwarded to DT platforms by adding an outbox connector type `DIGITAL_TWIN` alongside the existing ERP connectors. Field mappings defined in `ERPFieldMappings` translate Trier OS events to the target platform's data model.

### Inbound (External DT → Trier OS)

External DT platforms that detect anomalies or generate work recommendations can POST to a new webhook endpoint:

```
POST /api/digital-twin/webhook
{ "source": "azure-dt", "assetTwinId": "...", "event": "anomaly_detected", "payload": {...} }
```

This creates a Trier OS work order or alert in response. The webhook handler is the recommended pattern rather than Trier OS polling the external platform.

---

## Data Model Additions

```sql
-- Link internal assets to external twin IDs
ALTER TABLE Asset ADD COLUMN ExternalTwinID TEXT;    -- e.g. Azure DT twin ID
ALTER TABLE Asset ADD COLUMN ExternalTwinPlatform TEXT; -- azure | aws | bentley | ptc | siemens
ALTER TABLE Asset ADD COLUMN ExternalTwinSyncedAt TEXT;
```

---

## Implementation Order

1. Add `ExternalTwinID` columns to Asset (single migration, additive safe)
2. Add `DIGITAL_TWIN` connector type to `ERPConnectors` catalog — connector registry is already built
3. Add outbox event forwarding for DT connector type in `erp-outbox.js`
4. Build webhook receiver endpoint in `digitalTwin.js`
5. Platform-specific field mapping profiles per DT platform (reuses `ERPFieldMappings` table)

---

## Prerequisites

- External DT platform account + API credentials
- Asset registry must have consistent AstIDs for reliable twin linking
- Sensor data must be flowing through Trier OS ingestion (Modbus or OPC-UA) to make the DT useful
