// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */

/**
 * Trier OS — SaaS Enablement Layer
 * ==================================
 * Provides usage metering, white-label instance configuration, API key scoping,
 * and billing data export for ecosystem builders deploying Trier OS.
 * Mounted at /api/saas in server/index.js.
 *
 * ENDPOINTS:
 *   GET /api/saas/usage               - Get live usage metrics
 *   GET /api/saas/usage/breakdown     - Get usage metrics by plant
 *   GET /api/saas/billing-export      - Export usage metrics (JSON/CSV)
 *   GET /api/saas/instance-config     - Get white-label instance config
 *   PUT /api/saas/instance-config     - Update instance config
 *   GET /api/saas/api-keys            - List API keys and scopes
 *   PUT /api/saas/api-keys/:id/scope  - Update API key plant scope
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logisticsDb = require('../logistics_db').db;
const authDb = require('../auth_db');
const { logAudit } = require('../logistics_db');

const dataDir = require('../resolve_data_dir');
const SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/;

function requireAdmin(req, res, next) {
    const role = req.user?.globalRole;
    if (role === 'creator' || role === 'it_admin' || role === 'admin') {
        return next();
    }
    return res.status(403).json({ error: 'Requires admin or creator role' });
}

router.get('/usage', (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Missing startDate or endDate' });

        // API Calls
        const apiRow = logisticsDb.prepare('SELECT SUM(request_count) as total FROM api_keys').get();
        const apiCalls = apiRow?.total || 0;

        // Active Users
        const usersRow = logisticsDb.prepare('SELECT COUNT(DISTINCT UserID) as total FROM AuditLog WHERE Timestamp >= ? AND Timestamp <= ?').get(startDate, endDate);
        const activeUsers = usersRow?.total || 0;

        // Storage MB
        let storageBytes = 0;
        try {
            const files = fs.readdirSync(dataDir);
            for (const f of files) {
                if (f.endsWith('.db') || f.endsWith('.sqlite')) {
                    const stat = fs.statSync(path.join(dataDir, f));
                    storageBytes += stat.size;
                }
            }
            const uploadsDir = path.join(dataDir, 'uploads');
            if (fs.existsSync(uploadsDir)) {
                const uploadFiles = fs.readdirSync(uploadsDir);
                for (const f of uploadFiles) {
                    const stat = fs.statSync(path.join(uploadsDir, f));
                    if (stat.isFile()) storageBytes += stat.size;
                }
            }
        } catch (e) {
            console.warn('Could not read all data files for storage metrics', e);
        }
        const storageMb = Number((storageBytes / (1024 * 1024)).toFixed(2));

        // Seat Count
        const seatRow = authDb.prepare('SELECT COUNT(*) as total FROM Users').get();
        const seatCount = seatRow?.total || 0;

        res.json({
            period: { start: startDate, end: endDate },
            metrics: {
                api_calls: { value: apiCalls, unit: 'requests' },
                active_users: { value: activeUsers, unit: 'users' },
                storage_mb: { value: storageMb, unit: 'MB' },
                seat_count: { value: seatCount, unit: 'seats' }
            }
        });
    } catch (err) {
        console.error('GET /api/saas/usage error:', err.message);
        res.status(500).json({ error: 'Failed to calculate usage' });
    }
});

router.get('/usage/breakdown', (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Missing startDate or endDate' });

        const plantsRows = logisticsDb.prepare('SELECT DISTINCT PlantID FROM AuditLog WHERE Timestamp >= ? AND Timestamp <= ? AND PlantID IS NOT NULL').all(startDate, endDate);
        
        const plants = [];
        for (const r of plantsRows) {
            const pid = r.PlantID;
            if (!SAFE_PLANT_ID.test(pid)) continue;

            const uRow = logisticsDb.prepare('SELECT COUNT(DISTINCT UserID) as total FROM AuditLog WHERE Timestamp >= ? AND Timestamp <= ? AND PlantID = ?').get(startDate, endDate, pid);
            const activeUsers = uRow?.total || 0;

            let storageMb = 0;
            try {
                const p = path.join(dataDir, pid + '.db');
                if (fs.existsSync(p)) {
                    const stat = fs.statSync(p);
                    storageMb = Number((stat.size / (1024 * 1024)).toFixed(2));
                }
            } catch(e) {}

            plants.push({
                plantId: pid,
                active_users: activeUsers,
                storage_mb: storageMb
            });
        }

        res.json({
            period: { start: startDate, end: endDate },
            plants
        });
    } catch (err) {
        console.error('GET /api/saas/usage/breakdown error:', err.message);
        res.status(500).json({ error: 'Failed to calculate breakdown' });
    }
});

router.get('/billing-export', requireAdmin, (req, res) => {
    try {
        const { startDate, endDate, format } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Missing startDate or endDate' });

        const apiRow = logisticsDb.prepare('SELECT SUM(request_count) as total FROM api_keys').get();
        const apiCalls = apiRow?.total || 0;

        const usersRow = logisticsDb.prepare('SELECT COUNT(DISTINCT UserID) as total FROM AuditLog WHERE Timestamp >= ? AND Timestamp <= ?').get(startDate, endDate);
        const activeUsers = usersRow?.total || 0;

        let storageBytes = 0;
        try {
            const files = fs.readdirSync(dataDir);
            for (const f of files) {
                if (f.endsWith('.db') || f.endsWith('.sqlite')) {
                    storageBytes += fs.statSync(path.join(dataDir, f)).size;
                }
            }
        } catch(e) {}
        const storageMb = Number((storageBytes / (1024 * 1024)).toFixed(2));

        const seatRow = authDb.prepare('SELECT COUNT(*) as total FROM Users').get();
        const seatCount = seatRow?.total || 0;

        const records = [
            { period_start: startDate, period_end: endDate, metric: 'api_calls', value: apiCalls, unit: 'requests' },
            { period_start: startDate, period_end: endDate, metric: 'active_users', value: activeUsers, unit: 'users' },
            { period_start: startDate, period_end: endDate, metric: 'storage_mb', value: storageMb, unit: 'MB' },
            { period_start: startDate, period_end: endDate, metric: 'seat_count', value: seatCount, unit: 'seats' }
        ];

        if (format === 'csv') {
            const headers = ['period_start', 'period_end', 'metric', 'value', 'unit'];
            const lines = records.map(r => headers.map(h => r[h]).join(','));
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=billing-${startDate}-${endDate}.csv`);
            return res.send(headers.join(',') + '\n' + lines.join('\n') + '\n');
        }

        res.json(records);
    } catch (err) {
        console.error('GET /api/saas/billing-export error:', err.message);
        res.status(500).json({ error: 'Failed to export billing' });
    }
});

router.get('/instance-config', (req, res) => {
    try {
        const row = logisticsDb.prepare('SELECT * FROM InstanceConfig ORDER BY ConfigID DESC LIMIT 1').get();
        if (row) {
            return res.json({
                instanceName: row.InstanceName,
                primaryColor: row.PrimaryColor,
                secondaryColor: row.SecondaryColor,
                supportEmail: row.SupportEmail,
                supportURL: row.SupportURL,
                poweredByVisible: row.PoweredByVisible === 1
            });
        }
        res.json({
            instanceName: 'Trier OS',
            primaryColor: '#2563eb',
            secondaryColor: '#1e40af',
            supportEmail: null,
            supportURL: null,
            poweredByVisible: true
        });
    } catch (err) {
        console.error('GET /api/saas/instance-config error:', err.message);
        res.status(500).json({ error: 'Failed to fetch config' });
    }
});

router.put('/instance-config', requireAdmin, (req, res) => {
    try {
        const { instanceName, primaryColor, secondaryColor, supportEmail, supportURL, poweredByVisible } = req.body;
        
        const hexValid = /^#[0-9a-fA-F]{6}$/;
        if (primaryColor && !hexValid.test(primaryColor)) return res.status(400).json({ error: 'Invalid primaryColor' });
        if (secondaryColor && !hexValid.test(secondaryColor)) return res.status(400).json({ error: 'Invalid secondaryColor' });
        if (poweredByVisible !== undefined && typeof poweredByVisible !== 'boolean') return res.status(400).json({ error: 'poweredByVisible must be boolean' });

        const iName = instanceName ? instanceName.replace(/<[^>]*>?/gm, '').substring(0, 80) : 'Trier OS';
        const pColor = primaryColor || '#2563eb';
        const sColor = secondaryColor || '#1e40af';
        const pVisible = poweredByVisible !== false ? 1 : 0;

        const row = logisticsDb.prepare('SELECT ConfigID FROM InstanceConfig ORDER BY ConfigID DESC LIMIT 1').get();
        
        const username = req.user?.Username || 'admin';
        
        if (row) {
            logisticsDb.prepare(`
                UPDATE InstanceConfig 
                SET InstanceName = ?, PrimaryColor = ?, SecondaryColor = ?, SupportEmail = ?, SupportURL = ?, PoweredByVisible = ?, UpdatedBy = ?, UpdatedAt = datetime('now')
                WHERE ConfigID = ?
            `).run(iName, pColor, sColor, supportEmail || null, supportURL || null, pVisible, username, row.ConfigID);
        } else {
            logisticsDb.prepare(`
                INSERT INTO InstanceConfig (InstanceName, PrimaryColor, SecondaryColor, SupportEmail, SupportURL, PoweredByVisible, UpdatedBy, UpdatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).run(iName, pColor, sColor, supportEmail || null, supportURL || null, pVisible, username);
        }

        logAudit(username, 'INSTANCE_CONFIG_UPDATED', null, { instanceName: iName, primaryColor: pColor });

        res.json({ success: true });
    } catch (err) {
        console.error('PUT /api/saas/instance-config error:', err.message);
        res.status(500).json({ error: 'Failed to update config' });
    }
});

router.get('/api-keys', (req, res) => {
    try {
        const keys = logisticsDb.prepare('SELECT * FROM api_keys').all();
        const formatted = keys.map(row => ({
            id: row.id,
            key_prefix: row.key_prefix,
            label: row.label,
            created_by: row.created_by,
            created_at: row.created_at,
            last_used_at: row.last_used_at,
            permissions: row.permissions,
            enabled: row.enabled,
            request_count: row.request_count,
            scope_plants: row.scope_plants ? JSON.parse(row.scope_plants) : null
        }));
        res.json(formatted);
    } catch (err) {
        console.error('GET /api/saas/api-keys error:', err.message);
        res.status(500).json({ error: 'Failed to fetch api keys' });
    }
});

router.put('/api-keys/:id/scope', (req, res) => {
    try {
        const { id } = req.params;
        const { scope_plants } = req.body;
        
        if (scope_plants !== null && !Array.isArray(scope_plants)) {
            return res.status(400).json({ error: 'scope_plants must be null or an array' });
        }

        if (Array.isArray(scope_plants)) {
            for (const pid of scope_plants) {
                if (!SAFE_PLANT_ID.test(pid)) return res.status(400).json({ error: 'Invalid plant ID format' });
            }
        }

        const scopeJson = scope_plants === null ? null : JSON.stringify(scope_plants);
        
        logisticsDb.prepare('UPDATE api_keys SET scope_plants = ? WHERE id = ?').run(scopeJson, id);

        const username = req.user?.Username || 'admin';
        logAudit(username, 'API_KEY_SCOPE_UPDATED', null, { keyId: id, scope_plants });

        res.json({ success: true });
    } catch (err) {
        console.error('PUT /api/saas/api-keys/:id/scope error:', err.message);
        res.status(500).json({ error: 'Failed to update key scope' });
    }
});

module.exports = router;
