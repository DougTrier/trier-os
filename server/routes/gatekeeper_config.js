// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * gatekeeper_config.js — Adapter Configuration API
 * ==================================================
 * Admin CRUD for AdapterConfig. Manages per-plant control system
 * adapter settings. Requires IT admin session (enforced by auth.js
 * adminOnlyRoutes via the /gatekeeper prefix).
 *
 * ROUTES:
 *   GET    /api/gatekeeper/adapter-config           — List all adapter configs
 *   GET    /api/gatekeeper/adapter-config/:id       — Single config by ConfigID
 *   POST   /api/gatekeeper/adapter-config           — Create config
 *   PUT    /api/gatekeeper/adapter-config/:id       — Update config
 *   DELETE /api/gatekeeper/adapter-config/:id       — Delete config
 *   POST   /api/gatekeeper/adapter-config/:id/test  — Test adapter connectivity
 */

'use strict';

const express = require('express');
const router = express.Router();
const logisticsDb = require('../logistics_db').db;

const VALID_ADAPTER_TYPES = ['SIMULATED', 'OPC_UA', 'MODBUS'];
const SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/;

function maskCredentials(row) {
    if (!row) return row;
    if (row.Credentials) {
        row.Credentials = '••••';
    }
    return row;
}

// GET /adapter-config — List all adapter configs
router.get('/adapter-config', (req, res) => {
    try {
        const rows = logisticsDb.prepare('SELECT * FROM AdapterConfig ORDER BY PlantID').all();
        res.json(rows.map(maskCredentials));
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /adapter-config/:id — Single config by ConfigID
router.get('/adapter-config/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 1) {
            return res.status(400).json({ error: 'Invalid ConfigID' });
        }

        const row = logisticsDb.prepare('SELECT * FROM AdapterConfig WHERE ConfigID = ?').get(id);
        if (!row) {
            return res.status(404).json({ error: 'Adapter config not found' });
        }

        res.json(maskCredentials(row));
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /adapter-config — Create config
router.post('/adapter-config', (req, res) => {
    try {
        const { plantId, adapterType } = req.body;
        
        if (!plantId || !SAFE_PLANT_ID.test(plantId)) {
            return res.status(400).json({ error: 'Invalid plantId' });
        }
        
        if (!adapterType || !VALID_ADAPTER_TYPES.includes(adapterType)) {
            return res.status(400).json({ error: 'Invalid adapterType' });
        }

        const simulationMode = req.body.simulationMode !== undefined ? req.body.simulationMode : 1;
        const createdBy = req.user?.Username || 'system';

        const info = logisticsDb.prepare(`
            INSERT OR IGNORE INTO AdapterConfig (PlantID, AdapterType, SimulationMode, CreatedBy)
            VALUES (?, ?, ?, ?)
        `).run(plantId, adapterType, simulationMode, createdBy);

        if (info.changes === 0) {
            return res.status(409).json({ error: 'Adapter config already exists for this plant' });
        }

        res.json({ ok: true, id: info.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /adapter-config/:id — Update config
router.put('/adapter-config/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 1) {
            return res.status(400).json({ error: 'Invalid ConfigID' });
        }

        const fields = [];
        const values = [];

        const allowedParams = [
            'AdapterType', 'Endpoint', 'NodeID', 'Register', 'UnitID',
            'SecurityMode', 'Credentials', 'TimeoutMs', 'SimulationMode', 'Notes'
        ];

        for (const field of allowedParams) {
            if (req.body[field] !== undefined) {
                if (field === 'AdapterType' && !VALID_ADAPTER_TYPES.includes(req.body[field])) {
                    return res.status(400).json({ error: 'Invalid AdapterType' });
                }
                fields.push(`${field} = ?`);
                values.push(req.body[field]);
            }
        }

        if (fields.length === 0) {
            return res.json({ ok: true }); // Nothing to update
        }

        fields.push(`UpdatedAt = datetime('now')`);
        values.push(id);

        const stmt = logisticsDb.prepare(`
            UPDATE AdapterConfig SET ${fields.join(', ')} WHERE ConfigID = ?
        `);
        
        const info = stmt.run(...values);
        if (info.changes === 0) {
            return res.status(404).json({ error: 'Adapter config not found' });
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /adapter-config/:id — Delete config
router.delete('/adapter-config/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 1) {
            return res.status(400).json({ error: 'Invalid ConfigID' });
        }

        const info = logisticsDb.prepare('DELETE FROM AdapterConfig WHERE ConfigID = ?').run(id);
        if (info.changes === 0) {
            return res.status(404).json({ error: 'Adapter config not found' });
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /adapter-config/:id/test — Test adapter connectivity
router.post('/adapter-config/:id/test', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 1) {
            return res.status(400).json({ error: 'Invalid ConfigID' });
        }

        const config = logisticsDb.prepare('SELECT * FROM AdapterConfig WHERE ConfigID = ?').get(id);
        if (!config) {
            return res.status(404).json({ error: 'Adapter config not found' });
        }

        let adapter;
        switch (config.AdapterType) {
            case 'OPC_UA':
                adapter = require('../gatekeeper/adapters/opcua');
                break;
            case 'MODBUS':
                adapter = require('../gatekeeper/adapters/modbus');
                break;
            case 'SIMULATED':
            default:
                adapter = require('../gatekeeper/adapters/simulated');
                break;
        }

        const result = await adapter.testConnection(config);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
