# Trier OS — ERP Integration Guide

Trier OS does not integrate *into* ERP systems. It produces verified operational events
that ERP systems consume.

> **The plant floor is the source of operational truth. Trier OS enforces correctness.
> ERP records the verified result.**

This guide shows exactly what events are emitted, what the payloads look like, and how to
configure a receiving endpoint for SAP S/4HANA, Microsoft Dynamics 365, Oracle Fusion,
and custom HTTP endpoints.

---

## How It Works

```
Work order closed / parts consumed / labor posted
        ↓
insertOutboxEvent() called in Trier OS route handler
        ↓
ERPOutbox table (trier_logistics.db)
  - Idempotency key derived and stored (DB-layer UNIQUE constraint)
  - Status: pending
        ↓
Drain worker runs every 60 seconds
  - SELECT pending rows where NextRetryAt <= now
  - POST JSON to configured ERP endpoint
  - 200 response → Status: sent
  - Error → Attempts++, NextRetryAt = now + (2^n minutes), max 5 attempts
        ↓
Your ERP endpoint receives the event
```

No data is lost if the ERP endpoint is down. Events queue until delivery succeeds.
The same `X-Idempotency-Key` header is forwarded to your ERP so it can dedup on its side.

---

## Event Types

| Event | Trigger | Key Fields |
|---|---|---|
| `wo_close` | Work order reaches Completed or Closed status | `woNumber`, `assetId`, `plantId`, `closedBy`, `closedAt`, `laborHours`, `outcome` |
| `part_consume` | Negative quantity adjustment recorded against a WO | `partId`, `partNumber`, `woNumber`, `qty`, `unitCost`, `consumedAt` |
| `labor_post` | Actual hours updated on a work order | `woNumber`, `techId`, `workDate`, `hours`, `laborType` |

---

## Payload Formats

### `wo_close`

```json
{
  "eventType": "wo_close",
  "plantId": "Plant_1",
  "integrationId": "erp",
  "sentAt": "2026-04-26T18:00:00.000Z",
  "payload": {
    "woNumber": "WO-2026-04847",
    "assetId": "ASSET-1042",
    "assetTag": "PMP-COOLING-03",
    "description": "Cooling pump bearing replacement",
    "priority": "High",
    "status": "Completed",
    "closedBy": "j.smith",
    "openedAt": "2026-04-26T10:15:00.000Z",
    "closedAt": "2026-04-26T17:45:00.000Z",
    "laborHours": 2.5,
    "outcome": "Resolved",
    "plantId": "Plant_1"
  }
}
```

### `part_consume`

```json
{
  "eventType": "part_consume",
  "plantId": "Plant_1",
  "integrationId": "erp",
  "sentAt": "2026-04-26T17:46:00.000Z",
  "payload": {
    "partId": 4821,
    "partNumber": "6205-2RS-SKF",
    "description": "Bearing, deep groove, 25mm ID",
    "woNumber": "WO-2026-04847",
    "qty": 2,
    "unitCost": 18.50,
    "totalCost": 37.00,
    "consumedAt": "2026-04-26T17:46:00.000Z",
    "plantId": "Plant_1"
  }
}
```

### `labor_post`

```json
{
  "eventType": "labor_post",
  "plantId": "Plant_1",
  "integrationId": "erp",
  "sentAt": "2026-04-26T17:47:00.000Z",
  "payload": {
    "woNumber": "WO-2026-04847",
    "techId": "USR-0042",
    "techName": "j.smith",
    "workDate": "2026-04-26",
    "hours": 2.5,
    "laborType": "Regular",
    "plantId": "Plant_1"
  }
}
```

---

## Configuration

### Step 1 — Register a connector

```http
POST /api/erp-connectors
Authorization: Bearer <token>
Content-Type: application/json

{
  "plantId": "Plant_1",
  "connectorType": "SAP",
  "name": "SAP S/4HANA Plant 1",
  "host": "https://your-s4hana-host.example.com",
  "apiVersion": "2023",
  "authType": "BEARER",
  "credentialRef": "sap-plant1-token",
  "syncDirection": "OUTBOUND",
  "syncEvents": ["wo_close", "part_consume", "labor_post"]
}
```

### Step 2 — Configure field mappings

```http
PUT /api/erp-connectors/:id/mappings
Authorization: Bearer <token>
Content-Type: application/json

{
  "eventType": "wo_close",
  "mappings": [
    { "trierOSField": "woNumber",    "erpField": "MaintenanceOrder",  "required": true },
    { "trierOSField": "closedAt",    "erpField": "ActualFinishDate",  "required": true },
    { "trierOSField": "laborHours",  "erpField": "ActualWork",        "required": false },
    { "trierOSField": "assetTag",    "erpField": "Equipment",         "required": true },
    { "trierOSField": "outcome",     "erpField": "SystemStatus",      "required": false,
      "transform": "toUpperCase" }
  ]
}
```

### Step 3 — Verify connectivity

```http
POST /api/erp-connectors/:id/test
Authorization: Bearer <token>
```

Response:
```json
{ "ok": true, "result": "REACHABLE", "message": "HTTP 200", "testedAt": "2026-04-26T18:00:00Z" }
```

---

## SAP S/4HANA — Recommended Integration Path

SAP S/4HANA exposes OData REST APIs for Plant Maintenance. Configure Trier OS to POST
to your S/4HANA OData endpoint.

**Recommended endpoint pattern:**
```
https://<s4hana-host>/sap/opu/odata/sap/API_MAINTORDER_SRV/MaintenanceOrder
```

**Auth:** OAuth2 Bearer token (client credentials flow via your SAP BTP or API Management layer)

**`wo_close` → SAP Maintenance Order TECO (Technically Complete)**

Your receiving endpoint should translate the Trier OS `wo_close` event into:
```
PATCH /MaintenanceOrder('WO-2026-04847')
{ "SystemStatus": "TECO", "ActualFinishDate": "2026-04-26T17:45:00Z" }
```

**`part_consume` → SAP Goods Issue (Movement Type 261)**

Your receiver maps to:
```
POST /GoodsMovement
{
  "GoodsMovementType": "261",
  "OrderID": "WO-2026-04847",
  "Material": "6205-2RS-SKF",
  "Quantity": "2",
  "BaseUnit": "EA"
}
```

**Note on RFC/BAPI:** Trier OS does not use RFC or BAPI. SAP's OData REST APIs
(available on S/4HANA 2020+) are the recommended path. For older SAP ECC or ERP 6.0
installations, an SAP PI/PO or BTP Integration Suite middleware layer can receive the
Trier OS HTTP POST and translate to RFC/BAPI on the SAP side.

---

## Microsoft Dynamics 365 — Recommended Integration Path

Dynamics 365 Field Service uses the Dataverse REST API.

**Base URL:**
```
https://<your-org>.crm.dynamics.com/api/data/v9.2/
```

**Auth:** OAuth2 client credentials via Azure AD app registration.

**`wo_close` → Dynamics Work Order Complete**

```
PATCH /msdyn_workorders(<work-order-guid>)
Content-Type: application/json
Authorization: Bearer <token>

{
  "msdyn_systemstatus": 690970004,
  "msdyn_timetofix": 150,
  "msdyn_actualduration": 150
}
```

**`part_consume` → Dynamics Work Order Product**

```
POST /msdyn_workorderproducts
{
  "msdyn_WorkOrder@odata.bind": "/msdyn_workorders(<guid>)",
  "msdyn_Product@odata.bind": "/products(<product-guid>)",
  "msdyn_quantity": 2,
  "msdyn_linestatus": 690970001
}
```

Configure a Trier OS `DYNAMICS365` connector with:
- Host: `https://<your-org>.crm.dynamics.com`
- Auth type: `BEARER` (obtain token from Azure AD and rotate on schedule)
- Map `woNumber` to your Dynamics work order lookup field

---

## Oracle Fusion Cloud — Recommended Integration Path

Oracle Maintenance Cloud (part of Oracle Fusion ERP) exposes REST APIs.

**Base URL:**
```
https://<your-oracle-host>/fscmRestApi/resources/11.13.18.05/maintenanceWorkOrders
```

**Auth:** Basic auth or OAuth2 (Oracle IDCS).

**`wo_close` → Oracle Work Order Status Update**

```
PATCH /maintenanceWorkOrders/<workOrderId>
{
  "WorkOrderStatus": "Complete",
  "ActualCompletionDate": "2026-04-26T17:45:00.000Z"
}
```

---

## Custom HTTP Endpoint

For any system that exposes an HTTP endpoint, configure a `CUSTOM` connector:

```json
{
  "connectorType": "CUSTOM",
  "name": "Custom MES Integration",
  "host": "https://your-mes.internal/api/trier-events",
  "authType": "API_KEY",
  "credentialRef": "mes-api-key"
}
```

Your endpoint receives the standard Trier OS event envelope (see payload formats above)
and handles the `X-Idempotency-Key` header to prevent duplicate processing.

**Minimal receiver (Node.js example):**

```js
app.post('/api/trier-events', express.json(), (req, res) => {
  const idempotencyKey = req.headers['x-idempotency-key'];
  const { eventType, plantId, payload } = req.body;

  // Check if already processed
  if (idempotencyKey && alreadyProcessed(idempotencyKey)) {
    return res.json({ ok: true, status: 'DUPLICATE_IGNORED' });
  }

  switch (eventType) {
    case 'wo_close':
      // Update your system with payload.woNumber, payload.closedAt, etc.
      break;
    case 'part_consume':
      // Deduct payload.qty of payload.partNumber
      break;
    case 'labor_post':
      // Post payload.hours for payload.techId on payload.workDate
      break;
  }

  markProcessed(idempotencyKey);
  res.json({ ok: true });
});
```

---

## Monitoring Outbox Health

```http
GET /api/integrations/outbox/summary
Authorization: Bearer <token>
```

Response:
```json
{
  "pending": 0,
  "sent": 1847,
  "failed": 2,
  "oldestPending": null
}
```

Retry a failed event:
```http
POST /api/integrations/outbox/retry/42
```

View recent delivery history:
```http
GET /api/integrations/outbox/history?status=failed&limit=20
```

---

## Idempotency Key Reference

| Event | Key Format |
|---|---|
| `wo_close` | `{plantId}:wo_close:{woNumber}` |
| `part_consume` | `{plantId}:part_consume:{partId}:{consumedAt}` |
| `labor_post` | `{plantId}:labor_post:{woNumber}:{workDate}` |

The same key is forwarded in the `X-Idempotency-Key` request header so your ERP endpoint
can dedup independently — essential when Trier OS retries a delivery that your ERP already
processed but returned an error for.
