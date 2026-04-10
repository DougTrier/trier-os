const fs=require('fs');
const p='src/i18n/en.json';
const d=JSON.parse(fs.readFileSync(p,'utf8'));
Object.assign(d,{
'manual.s6.title':'Part VI: Integration & Enterprise Automation',
'manual.s6.content':'Connecting Trier OS to the outside world: ERP systems, Active Directory, and OT floor devices like PLCs and sensors.',
'manual.sub.31':'6.1 SCADA / PLC EdgeAgents & Device Registry (OT Network)',
'manual.sub.32':'6.2 Sensor Thresholds & Automated Work Orders',
'manual.sub.33':'6.3 Corporate Supply Chain "All Sites" Rollup',
'manual.sub.34':'6.4 ERP Synchronization Pipeline & Output Outbox',
'manual.sub.35':'6.5 IT Admin Configurations (LDAP, SQL Server, Access Imports)',
'manual.item.1580':'The Device Registry allows Plant Admins to quickly ingest and monitor OT assets connected to the local network via Modbus TCP.',
'manual.item.1581':'Device Discovery Wizard: In the Plant Setup > Integrations view, you can perform a subnet sweep to discover open Modbus devices (port 502).',
'manual.item.1582':'A background MAC→IP resolution worker maps IP addresses back to MAC addresses, guaranteeing device telemetry persists through DHCP renewals.',
'manual.item.1583':'The internal SCADA EdgeAgent automatically initializes mapped registers and streams telemetry back to the Trier OS interface.',
'manual.item.1584':'Plant Setup > Integrations tracks all incoming sensor telemetry from the SCADA EdgeAgents.',
'manual.item.1585':'You can attach operational thresholds to any mapped analog input (e.g., Temp > 150F).',
'manual.item.1586':'When a threshold violation occurs, the edge agent dispatches a hardcoded Auto-Work Order using Priority 1 or 2 as designated.',
'manual.item.1587':'Cooldowns automatically engage to prevent duplicating work orders if a machine bounces its temperature repeatedly.',
'manual.item.1588':'Corporate Directors can switch their context to "All Sites" from the navigation header.',
'manual.item.1589':'This loads the Corporate Rollup dashboard within the Supply Chain View.',
'manual.item.1590':'Data pulls asynchronously across all attached plant databases to surface network-wide open/overdue POs and MTD spend profiles.',
'manual.item.1591':'Trier OS operates a dual-bridge methodology for SAP/ERP interactions: Pull Integrations and Push Outboxes.',
'manual.item.1592':'ERP Pull Worker: Executes over standard HTTP REST. Routinely fetches new parts and purchase structures dropping from the central ERP.',
'manual.item.1593':'ERP Write-Back Outbox: Consumed parts and closed work orders queue seamlessly inside local erp_outbox tables automatically.',
'manual.item.1594':'A dedicated background drain loop transmits those events (Status 50, Status 99, Issue, Receive) off to the ERP, protecting local performance while guaranteeing sequence delivery.',
'manual.item.1595':'LDAP: Enable Active Directory integration to centralize logins. This removes the need to provision new mechanics manually.',
'manual.item.1596':'Legacy Migration: Import utility scripts allow bringing in direct relational data stores from MS Access (.accdb, .mdb), SQL Server exports, and obsolete systems directly into modern SQLite instances.'
});
fs.writeFileSync(p,JSON.stringify(d,null,2));
