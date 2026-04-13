// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Custom Report Builder API
 * =======================================
 * Backend for the drag-and-drop report builder. Users select a data source,
 * choose columns from a whitelisted field catalog, apply filters, and execute
 * ad-hoc queries against the current plant database — all without writing SQL.
 * Saved reports can be recalled or shared with other users at the same plant.
 * Mounted at /api/report-builder in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /fields       Return the whitelisted field catalog for all data sources
 *                        (work-orders, assets, pm-schedules, parts, technicians)
 *   POST   /execute      Execute a report query
 *                        Body: { source, columns[], filters[], sortBy, limit }
 *                        Returns: { columns[], rows[], rowCount, executedAt }
 *   POST   /save         Save a report definition for later use
 *                        Body: { name, description, source, columns[], filters[] }
 *   GET    /saved        List saved report definitions for the current plant
 *   DELETE /saved/:id    Delete a saved report definition
 *
 * SECURITY MODEL: Column selection is validated against a server-side whitelist
 *   (fieldCatalog). Users cannot query arbitrary columns or tables — only
 *   pre-approved fields are accessible. Filter values are parameterized to
 *   prevent SQL injection.
 *
 * DATA SOURCES:
 *   work-orders   — Work table: WO number, description, status, dates, assignee
 *   assets        — Asset table: description, model, install date, health
 *   pm-schedules  — Schedule table: frequency, last/next completion, compliance
 *   parts         — Part table: description, quantity, cost, vendor, stock status
 *   technicians   — Aggregated from Work: WO count, completion rate, hours
 *
 * CONSUMERS: ReportBuilder.jsx (drag-and-drop UI), SavedReports.jsx panel.
 */
const express = require('express');
const router = express.Router();
const db = require('../database');
const { db: logisticsDb } = require('../logistics_db');

// Field catalog — whitelisted columns by data source
const fieldCatalog = {
    'work-orders': {
        table: 'Work',
        fields: {
            WorkOrderNumber: { label: 'WO Number', type: 'text' },
            Description: { label: 'Description', type: 'text' },
            StatusID: { label: 'Status', type: 'number' },
            Priority: { label: 'Priority', type: 'number' },
            AstID: { label: 'Asset ID', type: 'text' },
            AssignToID: { label: 'Assigned To', type: 'text' },
            AddDate: { label: 'Date Created', type: 'date' },
            SchDate: { label: 'Scheduled Date', type: 'date' },
            CompDate: { label: 'Completed Date', type: 'date' },
        }
    },
    assets: {
        table: 'Asset',
        fields: {
            ID: { label: 'Asset ID', type: 'text' },
            Description: { label: 'Description', type: 'text' },
            AssetType: { label: 'Type', type: 'text' },
            LocationID: { label: 'Location', type: 'text' },
            Serial: { label: 'Serial Number', type: 'text' },
            Model: { label: 'Model', type: 'text' },
            InstallCost: { label: 'Install Cost', type: 'number' },
            PurchaseDate: { label: 'Purchase Date', type: 'date' },
            MeterReading: { label: 'Meter Reading', type: 'number' },
            MeterType: { label: 'Meter Type', type: 'text' },
            ParentAssetID: { label: 'Parent Asset', type: 'text' },
            AssetLevel: { label: 'Hierarchy Level', type: 'text' },
        }
    },
    parts: {
        table: 'Part',
        fields: {
            ID: { label: 'Part ID', type: 'text' },
            Description: { label: 'Description', type: 'text' },
            Stock: { label: 'Stock Qty', type: 'number' },
            UnitCost: { label: 'Unit Cost', type: 'number' },
            Location: { label: 'Location', type: 'text' },
            VendorName: { label: 'Vendor', type: 'text' },
            OrdMin: { label: 'Reorder Point', type: 'number' },
        }
    },
    schedules: {
        table: 'Schedule',
        fields: {
            ID: { label: 'Schedule ID', type: 'text' },
            Description: { label: 'Description', type: 'text' },
            AstID: { label: 'Asset ID', type: 'text' },
            FreqComp: { label: 'Frequency (Days)', type: 'number' },
            LastComp: { label: 'Last Completed', type: 'date' },
            Priority: { label: 'Priority', type: 'number' },
            Active: { label: 'Active', type: 'number' },
            TriggerType: { label: 'Trigger Type', type: 'text' },
            MeterTrigger: { label: 'Meter Trigger', type: 'number' },
        }
    }
};

// GET /api/report-builder/fields — Return available fields
router.get('/fields', (req, res) => {
    res.json(fieldCatalog);
});

// POST /api/report-builder/execute — Run a custom report
router.post('/execute', (req, res) => {
    try {
        const { source, fields, filters, groupBy, sortBy, sortOrder, limit = 200 } = req.body;
        const catalog = fieldCatalog[source];
        if (!catalog) return res.status(400).json({ error: 'Invalid data source' });

        // Validate all requested fields against whitelist
        const validFields = fields.filter(f => catalog.fields[f]);
        if (validFields.length === 0) return res.status(400).json({ error: 'No valid fields selected' });

        const selectCols = validFields.map(f => '"' + f + '"').join(', ');
        let sql = 'SELECT ' + selectCols + ' FROM "' + catalog.table + '"';
        const params = [];

        // Apply filters
        if (filters && filters.length > 0) {
            const whereClauses = [];
            for (const filter of filters) {
                if (!catalog.fields[filter.field]) continue; // skip invalid fields
                const col = '"' + filter.field + '"';
                switch (filter.operator) {
                    case '=': whereClauses.push(col + ' = ?'); params.push(filter.value); break;
                    case '!=': whereClauses.push(col + ' != ?'); params.push(filter.value); break;
                    case '>': whereClauses.push(col + ' > ?'); params.push(filter.value); break;
                    case '<': whereClauses.push(col + ' < ?'); params.push(filter.value); break;
                    case '>=': whereClauses.push(col + ' >= ?'); params.push(filter.value); break;
                    case '<=': whereClauses.push(col + ' <= ?'); params.push(filter.value); break;
                    case 'contains': whereClauses.push(col + ' LIKE ?'); params.push('%' + filter.value + '%'); break;
                    case 'is null': whereClauses.push(col + ' IS NULL'); break;
                    case 'is not null': whereClauses.push(col + ' IS NOT NULL'); break;
                }
            }
            if (whereClauses.length > 0) sql += ' WHERE ' + whereClauses.join(' AND ');
        }

        // Group by
        if (groupBy && catalog.fields[groupBy]) {
            sql += ' GROUP BY "' + groupBy + '"';
        }

        // Sort
        if (sortBy && catalog.fields[sortBy]) {
            sql += ' ORDER BY "' + sortBy + '" ' + (sortOrder === 'DESC' ? 'DESC' : 'ASC');
        }

        // Limit
        sql += ' LIMIT ' + Math.min(parseInt(limit) || 200, 5000);

        const rows = db.queryAll(sql, params);

        // ── CSV export: ?format=csv returns a downloadable file ──
        if (req.query.format === 'csv' || req.body.format === 'csv') {
            if (rows.length === 0) return res.status(200).send('');
            const headers = Object.keys(rows[0]);
            const escape  = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
            const csv     = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\r\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="report_${Date.now()}.csv"`);
            return res.send(csv);
        }

        res.json({ data: rows, total: rows.length, sql: sql.replace(/\?/g, '?') });
    } catch (err) {
        res.status(500).json({ error: 'Report execution failed: ' });
    }
});

// POST /api/report-builder/save — Save report template
router.post('/save', (req, res) => {
    try {
        const { name, description, config } = req.body;
        if (!name || !config) return res.status(400).json({ error: 'Name and config required' });
        const result = logisticsDb.prepare(
            'INSERT INTO SavedReports (name, description, config, createdBy) VALUES (?, ?, ?, ?)'
        ).run(name, description || '', JSON.stringify(config), req.user?.username || 'system');
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save report' });
    }
});

// GET /api/report-builder/saved — List saved reports
router.get('/saved', (req, res) => {
    try {
        const rows = logisticsDb.prepare('SELECT * FROM SavedReports ORDER BY lastUsed DESC, createdAt DESC').all();
        rows.forEach(r => { try { r.config = JSON.parse(r.config); } catch(e) { /* Intentional: config may not be valid JSON in legacy data */ } });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list saved reports' });
    }
});

// DELETE /api/report-builder/saved/:id
router.delete('/saved/:id', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM SavedReports WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete report' });
    }
});

module.exports = router;
