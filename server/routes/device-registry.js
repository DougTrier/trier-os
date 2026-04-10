// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Device Registry API
 * ================================
 * Manages the OT device inventory (PLCs, SCADA controllers, sensors, HMIs)
 * for a plant. Wires discovered devices into the corporate analytics pipeline
 * automatically via DeviceMetricMap.
 *
 * Mounted at /api/devices in server/index.js.
 * All endpoints require an X-Plant-ID header to scope results to one plant.
 *
 * ENDPOINTS:
 *   GET    /                  List all PlantDevices for this plant
 *   GET    /:id               Single device detail + its DeviceMetricMap entries
 *   POST   /lookup-serial     Check if a serial/barcode already exists in this plant
 *   POST   /arp-probe         Resolve a MAC address → IP using the host ARP table
 *   POST   /modbus-probe      FC03 Modbus probe to confirm a device is reachable
 *   POST   /                  Create a new device (auto-wires DeviceMetricMap)
 *   PUT    /:id               Update device fields (does NOT change the metric map)
 *   DELETE /:id               Remove device + its metric map entries
 *   POST   /:id/start-worker  Start an EdgeAgent polling worker for this device
 *   POST   /:id/stop-worker   Stop the running EdgeAgent worker for this device
 *
 * AUTO-WIRING:
 *   When a new device is created (POST /), the handler iterates TAG_DEFINITIONS
 *   from the Modbus simulator and inserts a DeviceMetricMap row for each tag,
 *   using tagToBucket() to assign the corporate metric bucket.  This means the
 *   device contributes to PlantMetricSummary rollups immediately — no manual
 *   mapping step required.
 *
 * NETWORK NOTE:
 *   /arp-probe runs `arp -a` on the host machine. The Trier OS server must be
 *   on the same Layer-2 subnet as the PLCs for ARP discovery to work. Devices
 *   on a separate OT VLAN reachable only via a router cannot be discovered this
 *   way; enter their IP addresses manually and use /modbus-probe to verify.
 */

'use strict';

const express        = require('express');
const router         = express.Router();
const { db: logisticsDb } = require('../logistics_db');
const { lookupMac, normalizeMac } = require('../integrations/arp-scanner');
const modbusClient   = require('../integrations/modbus-client');
const { TAG_DEFINITIONS } = require('../integrations/modbus-simulator');
const { tagToBucket } = require('../services/metric-rollup');
const integrationManager = require('../integrations/integration-manager');

// ── Helpers ───────────────────────────────────────────────────────────────────

const getPlantId = (req) => req.headers['x-plant-id'] || 'Plant_1';

/**
 * Derives the /24 subnet base string from an IP address.
 * "192.168.1.42" → "192.168.1"
 * Returns null if the IP doesn't look like a valid IPv4 address.
 *
 * @param {string} ip
 * @returns {string|null}
 */
function subnetFrom(ip) {
    if (!ip || typeof ip !== 'string') return null;
    const parts = ip.trim().split('.');
    if (parts.length !== 4) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

// ── GET / — list devices ──────────────────────────────────────────────────────

router.get('/', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const devices = logisticsDb.prepare(
            `SELECT * FROM PlantDevices WHERE PlantID = ? ORDER BY CreatedAt DESC`
        ).all(plantId);
        res.json(devices);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list devices', detail: err.message });
    }
});

// ── GET /:id — single device + metric map ─────────────────────────────────────

router.get('/:id', (req, res) => {
    try {
        const plantId  = getPlantId(req);
        const device   = logisticsDb.prepare(
            `SELECT * FROM PlantDevices WHERE ID = ? AND PlantID = ?`
        ).get(req.params.id, plantId);
        if (!device) return res.status(404).json({ error: 'Device not found' });

        const metricMap = logisticsDb.prepare(
            `SELECT * FROM DeviceMetricMap WHERE DeviceID = ? AND PlantID = ?`
        ).all(req.params.id, plantId);

        res.json({ ...device, metricMap });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch device', detail: err.message });
    }
});

// ── POST /lookup-serial — check if barcode exists ────────────────────────────

router.post('/lookup-serial', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { serial } = req.body;
        if (!serial) return res.status(400).json({ error: 'serial is required' });

        const existing = logisticsDb.prepare(
            `SELECT ID, SerialNumber, MACAddress, IPAddress, Status, Function
             FROM PlantDevices
             WHERE PlantID = ? AND (SerialNumber = ? OR BarcodeRaw = ?)`
        ).all(plantId, serial, serial);

        res.json({ found: existing.length > 0, matches: existing });
    } catch (err) {
        res.status(500).json({ error: 'Lookup failed', detail: err.message });
    }
});

// ── POST /arp-probe — MAC → IP discovery ─────────────────────────────────────

router.post('/arp-probe', async (req, res) => {
    try {
        const { mac, subnetHint, sweep } = req.body;
        if (!mac) return res.status(400).json({ error: 'mac is required' });

        let normalizedMac;
        try {
            normalizedMac = normalizeMac(mac);
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }

        // Derive subnetHint from any hint provided, or from the server's own
        // IP address as a reasonable default. Sweep adds ~8s but finds devices
        // that haven't talked recently.
        const result = await lookupMac(normalizedMac, {
            sweep:      !!sweep,
            subnetHint: subnetHint || null,
        });

        res.json({
            mac:   normalizedMac,
            ip:    result.ip,
            found: result.found,
            error: result.error || null,
        });
    } catch (err) {
        res.status(500).json({ error: 'ARP probe failed', detail: err.message });
    }
});

// ── POST /modbus-probe — confirm device is live ───────────────────────────────

router.post('/modbus-probe', async (req, res) => {
    try {
        const { ip, port } = req.body;
        if (!ip) return res.status(400).json({ error: 'ip is required' });

        const modbusPort = parseInt(port, 10) || 502;
        const startMs = Date.now();

        let values, probeError;
        try {
            // Read the first 4 holding registers — enough to confirm the device
            // is a Modbus TCP server without pulling a full register bank.
            values = await modbusClient.readHoldingRegisters(ip, modbusPort, 0, 4);
        } catch (err) {
            probeError = err.message;
        }

        const latencyMs = Date.now() - startMs;
        const reachable = !probeError && Array.isArray(values);

        res.json({
            reachable,
            latencyMs,
            registers: reachable ? values : null,
            error: probeError || null,
        });
    } catch (err) {
        res.status(500).json({ error: 'Modbus probe failed', detail: err.message });
    }
});

// ── POST / — create device + auto-wire metric map ────────────────────────────

router.post('/', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const {
            serialNumber, barcodeRaw, macAddress, ipAddress, port,
            deviceType, manufacturer, model, firmwareVersion,
            function: deviceFunction, assetId, partId, integrationId,
            status, notes,
        } = req.body;

        // Normalize MAC before saving so lookups are consistent
        let normalizedMac = macAddress || null;
        if (normalizedMac) {
            try { normalizedMac = normalizeMac(normalizedMac); } catch (_) {}
        }

        // Insert the device record
        const insert = logisticsDb.prepare(`
            INSERT INTO PlantDevices
                (PlantID, SerialNumber, BarcodeRaw, MACAddress, IPAddress, Port,
                 DeviceType, Manufacturer, Model, FirmwareVersion, Function,
                 AssetID, PartID, IntegrationID, Status, Notes, UpdatedAt)
            VALUES
                (@plantId, @serialNumber, @barcodeRaw, @macAddress, @ipAddress, @port,
                 @deviceType, @manufacturer, @model, @firmwareVersion, @deviceFunction,
                 @assetId, @partId, @integrationId, @status, @notes, datetime('now'))
        `);

        const result = insert.run({
            plantId,
            serialNumber:     serialNumber || null,
            barcodeRaw:       barcodeRaw || null,
            macAddress:       normalizedMac,
            ipAddress:        ipAddress || null,
            port:             parseInt(port, 10) || 502,
            deviceType:       deviceType || 'PLC',
            manufacturer:     manufacturer || null,
            model:            model || null,
            firmwareVersion:  firmwareVersion || null,
            deviceFunction:   deviceFunction || null,
            assetId:          assetId || null,
            partId:           partId || null,
            integrationId:    integrationId || null,
            status:           status || 'Pending',
            notes:            notes || null,
        });

        const deviceId = result.lastInsertRowid;

        // ── Auto-wire DeviceMetricMap ─────────────────────────────────────────
        // Insert one row per TAG_DEFINITION so this device appears in corporate
        // PlantMetricSummary rollups without any manual configuration step.
        const mapInsert = logisticsDb.prepare(`
            INSERT OR IGNORE INTO DeviceMetricMap
                (PlantID, DeviceID, TagName, MetricBucket, Scale, Offset, Unit)
            VALUES
                (@plantId, @deviceId, @tagName, @bucket, @scale, 0, @unit)
        `);

        const wireMetrics = logisticsDb.transaction(() => {
            for (const tag of TAG_DEFINITIONS) {
                mapInsert.run({
                    plantId,
                    deviceId,
                    tagName: tag.name,
                    bucket:  tagToBucket(tag.name),
                    scale:   tag.scale || 1,
                    unit:    tag.unit || '',
                });
            }
        });
        wireMetrics();

        // Return the newly created device
        const device = logisticsDb.prepare(
            `SELECT * FROM PlantDevices WHERE ID = ?`
        ).get(deviceId);

        res.status(201).json({ ok: true, device, metricMapCount: TAG_DEFINITIONS.length });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create device', detail: err.message });
    }
});

// ── PUT /:id — update device fields ──────────────────────────────────────────

router.put('/:id', (req, res) => {
    try {
        const plantId  = getPlantId(req);
        const { id }   = req.params;

        const existing = logisticsDb.prepare(
            `SELECT ID FROM PlantDevices WHERE ID = ? AND PlantID = ?`
        ).get(id, plantId);
        if (!existing) return res.status(404).json({ error: 'Device not found' });

        const allowed = [
            'SerialNumber', 'BarcodeRaw', 'MACAddress', 'IPAddress', 'Port',
            'DeviceType', 'Manufacturer', 'Model', 'FirmwareVersion', 'Function',
            'AssetID', 'PartID', 'IntegrationID', 'Status', 'Notes',
        ];

        const updates = [];
        const params  = {};

        for (const key of allowed) {
            // Accept both camelCase and PascalCase from the client
            const camel = key.charAt(0).toLowerCase() + key.slice(1);
            if (req.body[camel] !== undefined) {
                let val = req.body[camel];
                // Re-normalize MAC if changed
                if (key === 'MACAddress' && val) {
                    try { val = normalizeMac(val); } catch (_) {}
                }
                updates.push(`${key} = @${camel}`);
                params[camel] = val;
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        updates.push(`UpdatedAt = datetime('now')`);
        params.id      = id;
        params.plantId = plantId;

        logisticsDb.prepare(
            `UPDATE PlantDevices SET ${updates.join(', ')} WHERE ID = @id AND PlantID = @plantId`
        ).run(params);

        const updated = logisticsDb.prepare(
            `SELECT * FROM PlantDevices WHERE ID = ?`
        ).get(id);

        res.json({ ok: true, device: updated });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update device', detail: err.message });
    }
});

// ── DELETE /:id — remove device + metric map ─────────────────────────────────

router.delete('/:id', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { id }  = req.params;

        const existing = logisticsDb.prepare(
            `SELECT ID FROM PlantDevices WHERE ID = ? AND PlantID = ?`
        ).get(id, plantId);
        if (!existing) return res.status(404).json({ error: 'Device not found' });

        // Remove metric map first (no FK cascade in SQLite unless PRAGMA on)
        logisticsDb.prepare(
            `DELETE FROM DeviceMetricMap WHERE DeviceID = ? AND PlantID = ?`
        ).run(id, plantId);

        logisticsDb.prepare(
            `DELETE FROM PlantDevices WHERE ID = ? AND PlantID = ?`
        ).run(id, plantId);

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete device', detail: err.message });
    }
});

// ── POST /:id/start-worker — launch EdgeAgent for this device ─────────────────

router.post('/:id/start-worker', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { id }  = req.params;

        const device = logisticsDb.prepare(
            `SELECT * FROM PlantDevices WHERE ID = ? AND PlantID = ?`
        ).get(id, plantId);
        if (!device) return res.status(404).json({ error: 'Device not found' });

        const integrationId = device.IntegrationID || `device_${id}`;
        const result = integrationManager.startWorker(plantId, integrationId, {
            simulatorMode:       !device.IPAddress,   // fall back to sim if no IP yet
            simulatorPort:       null,
            ipAddress:           device.IPAddress || '127.0.0.1',
            port:                device.Port || 502,
            pollIntervalSeconds: 15,
        });

        // Mark device as Active once worker starts
        if (result.ok) {
            logisticsDb.prepare(
                `UPDATE PlantDevices SET Status = 'Active', UpdatedAt = datetime('now') WHERE ID = ?`
            ).run(id);
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to start worker', detail: err.message });
    }
});

// ── POST /:id/stop-worker — stop the EdgeAgent for this device ────────────────

router.post('/:id/stop-worker', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { id }  = req.params;

        const device = logisticsDb.prepare(
            `SELECT * FROM PlantDevices WHERE ID = ? AND PlantID = ?`
        ).get(id, plantId);
        if (!device) return res.status(404).json({ error: 'Device not found' });

        const integrationId = device.IntegrationID || `device_${id}`;
        const result = integrationManager.stopWorker(plantId, integrationId);

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to stop worker', detail: err.message });
    }
});

module.exports = router;
