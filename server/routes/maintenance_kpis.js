// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * maintenance_kpis.js — P3 Maintenance KPI Analytics
 * =====================================================
 * Plant-scoped KPI endpoints for the four P3 Advisory Mode financial metrics.
 * All queries run against the requesting plant's DB (x-plant-id header).
 * Results are intentionally fast — no expensive joins, index-backed queries only.
 *
 * -- ROUTES ----------------------------------------------------
 *   GET /api/maintenance-kpis/summary           All four KPIs in one call
 *   GET /api/maintenance-kpis/planned-ratio      Planned vs. unplanned ratio
 *   GET /api/maintenance-kpis/pm-compliance      PM completion rate
 *   GET /api/maintenance-kpis/backlog-aging      Open WO aging buckets
 *   GET /api/maintenance-kpis/downtime-cost      Downtime cost accumulation
 *
 * -- P3 ROADMAP ITEMS COVERED ---------------------------------
 *   💰 Planned vs. Unplanned Maintenance Ratio
 *   💰 PM Compliance Rate
 *   💰 Work Order Backlog Aging
 *   💰 Downtime Cost Accumulation
 */

'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

// ── Status constants (matching existing WorkStatuses table) ──────────────────
const STATUS_OPEN      = 20;
const STATUS_STARTED   = 30;
const STATUS_COMPLETED = 40;

// ── Helper: safe numeric parse ────────────────────────────────────────────────
function n(v) { return parseFloat(v) || 0; }

// ── GET /api/maintenance-kpis/planned-ratio ───────────────────────────────────
// Planned vs. unplanned split for all WOs in the past 12 months.
router.get('/planned-ratio', (req, res) => {
    try {
        const conn = db.getDb();
        const cutoff = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0];

        const rows = conn.prepare(`
            SELECT
                COALESCE(WOSource, 'UNPLANNED') AS src,
                COUNT(*) AS cnt
            FROM Work
            WHERE AddDate >= ?
            GROUP BY COALESCE(WOSource, 'UNPLANNED')
        `).all(cutoff);

        let planned = 0, unplanned = 0;
        for (const r of rows) {
            if (r.src === 'PLANNED') planned = r.cnt;
            else unplanned += r.cnt;
        }
        const total = planned + unplanned;

        res.json({
            planned,
            unplanned,
            total,
            plannedPct:   total > 0 ? Math.round((planned   / total) * 100) : 0,
            unplannedPct: total > 0 ? Math.round((unplanned / total) * 100) : 0,
            worldClassTarget: 80, // % planned — world-class target per ROADMAP
        });
    } catch (err) {
        console.error('[maintenance-kpis] planned-ratio error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/maintenance-kpis/pm-compliance ───────────────────────────────────
// What % of scheduled PM WOs were completed on or before their due date,
// measured over the past 12 months.
router.get('/pm-compliance', (req, res) => {
    try {
        const conn = db.getDb();
        const cutoff = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0];

        // Scheduled PMs: WOs generated from a PM schedule (SchID not null)
        // with a SchDate in the window.
        const rows = conn.prepare(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE
                    WHEN StatusID = ${STATUS_COMPLETED}
                     AND CompDate IS NOT NULL
                     AND SchDate IS NOT NULL
                     AND date(CompDate) <= date(SchDate, '+3 days')  -- 3-day grace
                    THEN 1 ELSE 0
                END) AS onTime,
                SUM(CASE
                    WHEN StatusID != ${STATUS_COMPLETED}
                     AND SchDate IS NOT NULL
                     AND date(SchDate) < date('now')
                    THEN 1 ELSE 0
                END) AS overdue
            FROM Work
            WHERE SchID IS NOT NULL
              AND SchDate >= ?
        `).get(cutoff);

        const total   = n(rows?.total);
        const onTime  = n(rows?.onTime);
        const overdue = n(rows?.overdue);

        res.json({
            scheduledPMs: total,
            completedOnTime: onTime,
            overdue,
            complianceRate: total > 0 ? Math.round((onTime / total) * 100) : null,
        });
    } catch (err) {
        console.error('[maintenance-kpis] pm-compliance error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/maintenance-kpis/backlog-aging ───────────────────────────────────
// Open WO count and estimated labor hours by age bucket.
router.get('/backlog-aging', (req, res) => {
    try {
        const conn = db.getDb();

        const rows = conn.prepare(`
            SELECT
                ID,
                CAST(julianday('now') - julianday(COALESCE(AddDate, date('now'))) AS INTEGER) AS ageDays,
                COALESCE(ExpectedDuration, 0) AS estHours
            FROM Work
            WHERE StatusID IN (${STATUS_OPEN}, ${STATUS_STARTED})
        `).all();

        const buckets = { d0_7: 0, d8_30: 0, d31_90: 0, d90plus: 0 };
        const hours   = { d0_7: 0, d8_30: 0, d31_90: 0, d90plus: 0 };

        for (const r of rows) {
            const age = r.ageDays || 0;
            const hrs = n(r.estHours);
            if      (age <=  7) { buckets.d0_7++;    hours.d0_7    += hrs; }
            else if (age <= 30) { buckets.d8_30++;   hours.d8_30   += hrs; }
            else if (age <= 90) { buckets.d31_90++;  hours.d31_90  += hrs; }
            else                { buckets.d90plus++; hours.d90plus += hrs; }
        }

        res.json({
            totalOpen: rows.length,
            buckets,
            estimatedHours: {
                d0_7:   Math.round(hours.d0_7),
                d8_30:  Math.round(hours.d8_30),
                d31_90: Math.round(hours.d31_90),
                d90plus: Math.round(hours.d90plus),
                total:   Math.round(Object.values(hours).reduce((a, b) => a + b, 0)),
            },
        });
    } catch (err) {
        console.error('[maintenance-kpis] backlog-aging error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/maintenance-kpis/downtime-cost ───────────────────────────────────
// Total calculated downtime cost for closed WOs in the past 12 months.
router.get('/downtime-cost', (req, res) => {
    try {
        const conn = db.getDb();
        const cutoff = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0];

        const summary = conn.prepare(`
            SELECT
                COUNT(*) AS woCount,
                COALESCE(SUM(DowntimeCost), 0) AS totalCost,
                COALESCE(AVG(NULLIF(DowntimeCost, 0)), 0) AS avgCost
            FROM Work
            WHERE StatusID = ${STATUS_COMPLETED}
              AND CompDate >= ?
              AND DowntimeCost > 0
        `).get(cutoff);

        // Top 5 most expensive assets by total downtime cost
        const topAssets = conn.prepare(`
            SELECT
                w.AstID AS assetId,
                COALESCE(a.Description, w.AstID) AS assetName,
                COUNT(*) AS woCount,
                SUM(w.DowntimeCost) AS totalCost
            FROM Work w
            LEFT JOIN Asset a ON a.ID = w.AstID
            WHERE w.StatusID = ${STATUS_COMPLETED}
              AND w.CompDate >= ?
              AND w.DowntimeCost > 0
            GROUP BY w.AstID
            ORDER BY totalCost DESC
            LIMIT 5
        `).all(cutoff);

        res.json({
            woCount:    summary?.woCount    || 0,
            totalCost:  Math.round(n(summary?.totalCost)),
            avgCost:    Math.round(n(summary?.avgCost)),
            topAssets,
        });
    } catch (err) {
        console.error('[maintenance-kpis] downtime-cost error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/maintenance-kpis/summary ────────────────────────────────────────
// All four KPIs in one call. Used by the corporate analytics maintenance tab.
router.get('/summary', async (req, res) => {
    try {
        const conn = db.getDb();
        const cutoff = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0];

        // Planned ratio
        const srcRows = conn.prepare(`
            SELECT COALESCE(WOSource, 'UNPLANNED') AS src, COUNT(*) AS cnt
            FROM Work WHERE AddDate >= ? GROUP BY COALESCE(WOSource, 'UNPLANNED')
        `).all(cutoff);
        let planned = 0, unplanned = 0;
        for (const r of srcRows) {
            if (r.src === 'PLANNED') planned = r.cnt; else unplanned += r.cnt;
        }
        const woTotal = planned + unplanned;

        // PM compliance
        const pmRow = conn.prepare(`
            SELECT COUNT(*) AS total,
                SUM(CASE WHEN StatusID=${STATUS_COMPLETED} AND CompDate IS NOT NULL AND SchDate IS NOT NULL AND date(CompDate)<=date(SchDate,'+3 days') THEN 1 ELSE 0 END) AS onTime,
                SUM(CASE WHEN StatusID!=${STATUS_COMPLETED} AND SchDate IS NOT NULL AND date(SchDate)<date('now') THEN 1 ELSE 0 END) AS overdue
            FROM Work WHERE SchID IS NOT NULL AND SchDate >= ?
        `).get(cutoff);

        // Backlog
        const backlogRows = conn.prepare(`
            SELECT CAST(julianday('now')-julianday(COALESCE(AddDate,date('now'))) AS INTEGER) AS ageDays,
                COALESCE(ExpectedDuration,0) AS estHours
            FROM Work WHERE StatusID IN (${STATUS_OPEN},${STATUS_STARTED})
        `).all();
        let backlogTotal = 0, backlogCritical = 0;
        for (const r of backlogRows) { backlogTotal++; if ((r.ageDays||0)>30) backlogCritical++; }

        // Downtime cost
        const dtRow = conn.prepare(`
            SELECT COALESCE(SUM(DowntimeCost),0) AS totalCost, COUNT(*) AS cnt
            FROM Work WHERE StatusID=${STATUS_COMPLETED} AND CompDate>=? AND DowntimeCost>0
        `).get(cutoff);

        res.json({
            plannedRatio: {
                planned, unplanned, total: woTotal,
                plannedPct: woTotal > 0 ? Math.round((planned/woTotal)*100) : 0,
            },
            pmCompliance: {
                scheduledPMs: n(pmRow?.total),
                completedOnTime: n(pmRow?.onTime),
                overdue: n(pmRow?.overdue),
                complianceRate: n(pmRow?.total) > 0 ? Math.round((n(pmRow?.onTime)/n(pmRow?.total))*100) : null,
            },
            backlog: {
                totalOpen: backlogTotal,
                criticalAged: backlogCritical,
            },
            downtimeCost: {
                totalCost: Math.round(n(dtRow?.totalCost)),
                woCount:   dtRow?.cnt || 0,
            },
        });
    } catch (err) {
        console.error('[maintenance-kpis] summary error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
