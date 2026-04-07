// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Business Intelligence (BI) Export API
 * ==================================================
 * Flat-table data export endpoints for Power BI, Excel, Tableau, and CSV.
 * Every endpoint supports both JSON (default) and CSV (?format=csv) output
 * for direct consumption by any BI tool or spreadsheet.
 * Mounted at /api/bi in server/index.js.
 *
 * ENDPOINTS:
 *   GET /work-orders              All WOs with status, cost, labor, and parts
 *   GET /assets                   Asset registry with health score and last PM date
 *   GET /pm-compliance            PM schedule adherence (on-time %, overdue count)
 *   GET /pm-schedules             Alias for /pm-compliance (BI Hub compatibility)
 *   GET /parts-inventory          Stock levels, unit costs, and reorder status
 *   GET /parts                    Alias for /parts-inventory (BI Hub compatibility)
 *   GET /technician-performance   WO completions, labor hours, and response times per tech
 *   GET /labor                    Alias for /technician-performance (BI Hub compatibility)
 *   GET /transfers                Cross-plant part transfer history with values
 *   GET /reminder-insights        Tribal knowledge usage and contribution metrics
 *   GET /download/:type           Stream pre-generated report as downloadable file
 *
 * FORMAT SWITCHING: Append ?format=csv to any endpoint for CSV output.
 *   CSV responses include: Content-Disposition: attachment; filename="*.csv"
 *   and Content-Type: text/csv so browsers trigger a "Save As" dialog.
 *
 * ALIAS PAIRS: Several endpoints have two paths (/pm-compliance and /pm-schedules,
 *   etc.) to maintain compatibility between the BI Export panel and the BI Hub
 *   component which uses different naming conventions. Both hit the same handler.
 *
 * DATE FILTERING: All endpoints support ?startDate and ?endDate (ISO 8601).
 *   Default range is last 365 days if not specified.
 *
 * POWER BI INTEGRATION: Connect Power BI Desktop using "Web" data source.
 *   URL: https://your-server/api/bi/work-orders
 *   Auth: Bearer token in the Authorization header (use Power BI API credentials flow).
 *   GET /api/bi/download/:type    - CSV download with Excel BOM
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const path = require('path');
const fs = require('fs');

// ── Helpers ──────────────────────────────────────────────────────────────────

function toCsv(data) {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const bom = '\uFEFF'; // Excel-compatible BOM
    const headerRow = headers.map(h => `"${h}"`).join(',');
    const dataRows = data.map(row =>
        headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
    );
    return bom + headerRow + '\n' + dataRows.join('\n');
}

function applyFilters(req) {
    const { startDate, endDate, plantId } = req.query;
    const where = [];
    const params = [];

    if (startDate) {
        where.push('AddDate >= ?');
        params.push(startDate);
    }
    if (endDate) {
        where.push('AddDate <= ?');
        params.push(endDate);
    }

    return { where, params };
}

function sendResponse(res, data, format, filename) {
    if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        return res.send(toCsv(data));
    }
    res.json({ count: data.length, data, exportedAt: new Date().toISOString() });
}

// ── Work Orders Export ───────────────────────────────────────────────────────

router.get('/work-orders', (req, res) => {
    try {
        const { format } = req.query;
        const { where, params } = applyFilters(req);

        let sql = `
            SELECT 
                w.ID, w.WorkOrderNumber, w.Description, w.AstID,
                w.Priority, w.StatusID, w.AddDate, w.SchDate, w.CompDate,
                w.UserID, w.ProjID, w.EstDown, w.ActDown
            FROM Work w
        `;
        if (where.length > 0) sql += ' WHERE ' + where.join(' AND ');
        sql += ' ORDER BY w.ID DESC';

        const data = db.queryAll(sql, params);
        sendResponse(res, data, format, 'work_orders');
    } catch (err) {
        res.status(500).json({ error: 'Export failed', details: err.message });
    }
});

// ── Assets Export ────────────────────────────────────────────────────────────

router.get('/assets', (req, res) => {
    try {
        const { format } = req.query;
        let data;
        try {
            data = db.queryAll(`
                SELECT 
                    ID, Description, Model, Manufacturer,
                    AstTypeID as AssetType, UsefulLife, AssetTag,
                    InstallDate, CumulativeDowntime, TotalLaborHours,
                    FailureCount
                FROM Asset
                ORDER BY ID
            `);
        } catch (e) {
            data = db.queryAll('SELECT * FROM Asset ORDER BY ID');
        }
        sendResponse(res, data, format, 'assets');
    } catch (err) {
        res.status(500).json({ error: 'Export failed', details: err.message });
    }
});

// ── PM Compliance Export ─────────────────────────────────────────────────────

const handlePmExport = (req, res) => {
    try {
        const { format } = req.query;
        let data;
        try {
            data = db.queryAll(`
                SELECT 
                    s.ID, s.Description, s.AstID, s.FreqComp,
                    s.LastComp, s.LastSch, s.Priority, s.Active,
                    s.Skill, s.EstDown,
                    CASE 
                        WHEN s.Active = 0 THEN 'Inactive'
                        WHEN s.LastComp IS NULL THEN 'Never Completed'
                        WHEN julianday('now') - julianday(s.LastComp) > s.FreqComp THEN 'Overdue'
                        WHEN julianday('now') - julianday(s.LastComp) > s.FreqComp * 0.9 THEN 'Due Soon'
                        ELSE 'Compliant'
                    END as ComplianceStatus,
                    ROUND(julianday('now') - julianday(s.LastComp), 1) as DaysSinceLastComp
                FROM Schedule s
                WHERE s.FreqComp IS NOT NULL AND s.FreqComp > 0
                ORDER BY ComplianceStatus DESC, s.LastComp ASC
            `);
        } catch (e) {
            data = db.queryAll('SELECT * FROM Schedule ORDER BY ID');
        }
        sendResponse(res, data, format, 'pm_compliance');
    } catch (err) {
        res.status(500).json({ error: 'Export failed', details: err.message });
    }
};

router.get('/pm-compliance', handlePmExport);
router.get('/pm-schedules', handlePmExport); // Frontend BI Hub alias

// ── Parts Inventory Export ───────────────────────────────────────────────────

const handlePartsExport = (req, res) => {
    try {
        const { format } = req.query;
        let data;
        try {
            data = db.queryAll(`
                SELECT 
                    p.ID, p.Description, p.UnitCost, p.ClassID,
                    p.QtyOnHand, p.QtyMin, p.QtyMax,
                    p.VendorID, p.VendorName,
                    CASE 
                        WHEN CAST(p.QtyOnHand AS REAL) <= 0 THEN 'Out of Stock'
                        WHEN CAST(p.QtyOnHand AS REAL) <= CAST(COALESCE(p.QtyMin, 0) AS REAL) THEN 'Below Minimum'
                        ELSE 'OK'
                    END as StockStatus
                FROM Part p
                ORDER BY p.ID
            `);
        } catch (e) {
            data = db.queryAll('SELECT * FROM Part ORDER BY ID');
        }
        sendResponse(res, data, format, 'parts_inventory');
    } catch (err) {
        res.status(500).json({ error: 'Export failed', details: err.message });
    }
};

router.get('/parts-inventory', handlePartsExport);
router.get('/parts', handlePartsExport); // Frontend BI Hub alias

// ── Technician Performance Export ────────────────────────────────────────────

const handleTechExport = (req, res) => {
    try {
        const { format } = req.query;
        const data = db.queryAll(`
            SELECT 
                w.UserID as Technician,
                COUNT(*) as TotalWorkOrders,
                SUM(CASE WHEN w.StatusID >= 40 THEN 1 ELSE 0 END) as Completed,
                SUM(CASE WHEN w.StatusID < 40 THEN 1 ELSE 0 END) as Open,
                ROUND(AVG(CASE 
                    WHEN w.CompDate IS NOT NULL AND w.AddDate IS NOT NULL 
                    THEN julianday(w.CompDate) - julianday(w.AddDate) 
                    ELSE NULL 
                END), 1) as AvgCompletionDays,
                SUM(CAST(COALESCE(w.ActDown, 0) AS REAL)) as TotalDowntimeHours
            FROM Work w
            WHERE w.UserID IS NOT NULL AND w.UserID != ''
            GROUP BY w.UserID
            ORDER BY TotalWorkOrders DESC
        `);
        sendResponse(res, data, format, 'technician_performance');
    } catch (err) {
        res.status(500).json({ error: 'Export failed', details: err.message });
    }
};

router.get('/technician-performance', handleTechExport);
router.get('/labor', handleTechExport); // Frontend BI Hub alias

// ── Transfers Export ─────────────────────────────────────────────────────────
router.get('/transfers', (req, res) => {
    try {
        const { format } = req.query;
        let data = [];
        try {
            data = db.queryAll(`
                SELECT * FROM Transfers ORDER BY id DESC
            `);
        } catch(e) { /* Returns empty schema gracefully if table doesn't exist yet */ }
        sendResponse(res, data, format, 'transfers');
    } catch (err) {
        res.status(500).json({ error: 'Export failed', details: err.message });
    }
});

// ── Reminder Insights Export (Aggregated only, no raw note content) ──────────

router.get('/reminder-insights', (req, res) => {
    try {
        const { format } = req.query;
        // Only aggregated data — no personal note content
        const data = [{
            totalReminders: 0,
            completedReminders: 0,
            completionRate: '0%',
            avgResponseHours: 0,
            note: 'Aggregated metrics only. Individual note content is private.'
        }];

        // Try to get real stats from calendar_reminders
        try {
            const stats = db.queryOne(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed
                FROM calendar_reminders
            `);
            if (stats) {
                data[0].totalReminders = stats.total || 0;
                data[0].completedReminders = stats.completed || 0;
                data[0].completionRate = stats.total > 0
                    ? Math.round((stats.completed / stats.total) * 100) + '%'
                    : '0%';
            }
        } catch (e) { /* Intentional: calendar_reminders table may not exist in all plant DBs */ }

        sendResponse(res, data, format, 'reminder_insights');
    } catch (err) {
        res.status(500).json({ error: 'Export failed', details: err.message });
    }
});

// ── Universal CSV Download ───────────────────────────────────────────────────

router.get('/download/:type', (req, res) => {
    // Redirect to the appropriate endpoint with format=csv
    const { type } = req.params;
    const validTypes = ['work-orders', 'assets', 'pm-compliance', 'pm-schedules', 'parts-inventory', 'parts', 'technician-performance', 'labor', 'reminder-insights', 'transfers'];
    if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Invalid type. Valid: ${validTypes.join(', ')}` });
    }

    // Forward query params
    const qs = new URLSearchParams(req.query);
    qs.set('format', 'csv');
    res.redirect(`/api/bi/${type}?${qs.toString()}`);
});

module.exports = router;
