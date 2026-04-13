# OPC-UA Native Device Driver — Spec
> Trier OS P6 · Direct PLC polling without third-party bridge

---

## Current State

Trier OS currently polls PLCs via Modbus TCP through the EdgeAgent worker. OPC-UA connections require a third-party bridge (e.g., Kepware, Ignition, or Cogent DataHub) to translate OPC-UA to Modbus/REST before Trier OS can read them. This adds cost, latency, and a single point of failure.

---

## What the Native Driver Provides

1. **Direct OPC-UA connection** — no bridge required. Connect directly to PLCs/SCADA servers that expose an OPC-UA endpoint (Siemens S7-1500, Allen-Bradley via UA wrapper, Beckhoff TwinCAT, etc.)
2. **Auto-discover tags** — browse the OPC-UA address space and import the tag tree into the Trier OS asset/sensor registry
3. **Subscription-based streaming** — use OPC-UA MonitoredItems (change-notification) rather than polling, reducing network traffic and improving response time
4. **Certificate-based security** — OPC-UA Basic256Sha256 security policy, mutual certificate authentication

---

## Implementation Plan

### Package

```bash
npm install node-opcua
```

`node-opcua` is MIT-licensed, battle-tested, and supports OPC-UA specification 1.04.

### Architecture

```
┌─────────────────────────────────────┐
│  OPC-UA Driver Worker               │
│  (separate Node.js process/cluster) │
│                                     │
│  OPCUAClient.connect(endpoint)      │
│  session.browse(nodeId)  →  tag tree│
│  session.createSubscription()       │
│      │                              │
│      └── MonitoredItem change       │
│              │                      │
│              ▼                      │
│  POST /api/sensor-readings (batch)  │
└─────────────────────────────────────┘
```

### Data Model Additions

```sql
-- Device registry: add OPC-UA endpoint type
ALTER TABLE device_registry ADD COLUMN OpcUaEndpoint TEXT;
ALTER TABLE device_registry ADD COLUMN OpcUaSecurityMode TEXT DEFAULT 'None';
ALTER TABLE device_registry ADD COLUMN OpcUaCertPath TEXT;

-- Tag import table
CREATE TABLE IF NOT EXISTS OpcUaTags (
    ID          INTEGER PRIMARY KEY AUTOINCREMENT,
    DeviceID    INTEGER REFERENCES device_registry(ID),
    NodeId      TEXT NOT NULL,          -- e.g. "ns=2;i=1001"
    DisplayName TEXT,
    DataType    TEXT,
    SensorTag   TEXT,                   -- Mapped Trier OS sensor tag
    Active      INTEGER DEFAULT 1
);
```

### Routes to Add

- `POST /api/opc-ua/connect` — validate + store endpoint config
- `GET  /api/opc-ua/browse/:deviceId` — return tag tree
- `POST /api/opc-ua/subscribe` — activate a MonitoredItem subscription
- `GET  /api/opc-ua/status` — driver health (connected nodes, subscription count, last value timestamps)

---

## Security Requirements

- Certificates generated at first run, stored in `data/certs/opcua/`
- Server certificate must be trusted before connection can be established (manual trust step)
- No plaintext mode (`SecurityMode: None`) allowed in production deployments — config flag required
- All OPC-UA credentials references use the same CredentialRef pattern as ERP connectors

---

## Build Prerequisites

- `node-opcua` installed
- OPC-UA server accessible on the plant LAN
- Network ACL allowing TCP port 4840 (default OPC-UA port)
- Certificate exchange between Trier OS driver and PLC server (one-time setup per device)
