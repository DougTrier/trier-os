// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * predictive_maintenance.js — Predictive Maintenance Engine (MTBF Tier)
 * ========================================================================
 * Computes asset reliability metrics (MTBF, MTTR, failure rate) from
 * historical Work Order data. Surfaces a risk-ranked asset list and
 * predicted failure windows for the next 30/60/90 days.
 *
 * This is the deterministic tier of the Predictive Maintenance Engine —
 * no ML required, runs entirely from WO history already in the plant DB.
 * The full Weibull/degradation curve tier is documented in
 * docs/p5/Predictive_Maintenance_Spec.md and requires sensor time-series data.
 *
 * All queries run against the requesting plant DB (x-plant-id header).
 *
 * -- ROUTES ----------------------------------------------------
 *   GET /api/predictive-maintenance/mtbf         MTBF for all assets or one asset
 *   GET /api/predictive-maintenance/risk-ranking Top assets by predicted failure risk
 *   GET /api/predictive-maintenance/forecast     Assets predicted to fail in 30/60/90 days
 *   GET /api/predictive-maintenance/asset/:id    Full reliability profile for one asset
 *
 * -- P5 ROADMAP ITEM COVERED ----------------------------------
 *   💰 Predictive Maintenance Engine (deterministic MTBF tier)
 */

'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

// ── Constants ──────────────────────────────────────────────────────────────────
const STATUS_COMPLETED = 40;
const UNPLANNED_SOURCE = 'UNPLANNED';

// ── Helper: compute MTBF stats from a sorted list of failure timestamps ────────
// Returns { mtbfDays, stdDevDays, failureCount, totalDays }
function computeMTBF(dates) {
    if (dates.length < 2) return null;
    const sorted = [...dates].sort();
    const intervals = [];
    for (let i = 1; i < sorted.length; i++) {
        const diffMs = new Date(sorted[i]) - new Date(sorted[i - 1]);
        intervals.push(diffMs / 86400000); // convert to days
    }
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
    return {
        mtbfDays:    Math.round(mean * 10) / 10,
        stdDevDays:  Math.round(Math.sqrt(variance) * 10) / 10,
        failureCount: dates.length,
        totalDays:   Math.round((new Date(sorted[sorted.length - 1]) - new Date(sorted[0])) / 86400000),
    };
}

function computePredictiveConfidence(failureCount, stdDevDays, mtbfDays, lastFailureDate) {
    const dataVolume = Math.min(failureCount / 10, 1.0);

    let volatilityScore = 0.5;
    if (mtbfDays > 0 && stdDevDays != null) {
        volatilityScore = Math.max(0, 1.0 - (stdDevDays / mtbfDays));
    }

    let recencyScore = 0.5;
    if (lastFailureDate) {
        const daysSinceLast = (Date.now() - new Date(lastFailureDate).getTime()) / 86400000;
        recencyScore = Math.max(0, 1.0 - daysSinceLast / 548);
    }

    const score = Math.min(1.0, dataVolume * 0.5 + volatilityScore * 0.3 + recencyScore * 0.2);
    const rounded = Math.round(score * 100) / 100;
    const band = rounded >= 0.75 ? 'HIGH' : rounded >= 0.40 ? 'MEDIUM' : 'LOW';
    return { confidenceScore: rounded, confidenceBand: band };
}

function computeRankingConfidence(failuresLastYear, daysSinceLast) {
    const dataVolume = Math.min(failuresLastYear / 10, 1.0);
    const recencyScore = Math.max(0, 1.0 - daysSinceLast / 365);
    const score = Math.round(Math.min(1.0, dataVolume * 0.6 + recencyScore * 0.4) * 100) / 100;
    const band = score >= 0.75 ? 'HIGH' : score >= 0.40 ? 'MEDIUM' : 'LOW';
    return { confidenceScore: score, confidenceBand: band };
}

// ── GET /api/predictive-maintenance/mtbf ──────────────────────────────────────
// Returns MTBF per asset for all assets with ≥ 2 unplanned failures in the DB.
router.get('/mtbf', (req, res) => {
    try {
        const conn = db.getDb();
        const { assetId } = req.query;

        let sql = `
            SELECT AstID, CompDate FROM Work
            WHERE StatusID = ${STATUS_COMPLETED}
              AND WOSource = '${UNPLANNED_SOURCE}'
              AND CompDate IS NOT NULL
              AND AstID IS NOT NULL
        `;
        const params = [];
        if (assetId) { sql += ' AND AstID = ?'; params.push(assetId); }
        sql += ' ORDER BY AstID, CompDate ASC';

        const rows = conn.prepare(sql).all(...params);

        // Group by asset
        const byAsset = {};
        for (const r of rows) {
            if (!byAsset[r.AstID]) byAsset[r.AstID] = [];
            byAsset[r.AstID].push(r.CompDate);
        }

        // Fetch asset names in one query
        const assetIds = Object.keys(byAsset);
        let nameMap = {};
        if (assetIds.length) {
            try {
                const placeholders = assetIds.map(() => '?').join(',');
                const assets = conn.prepare(
                    `SELECT ID AS AstID, Description FROM Asset WHERE ID IN (${placeholders})`
                ).all(...assetIds);
                for (const a of assets) nameMap[a.AstID] = a.Description;
            } catch { /* Asset table column name may differ */ }
        }

        const result = [];
        for (const [astId, dates] of Object.entries(byAsset)) {
            const stats = computeMTBF(dates);
            if (!stats) continue;
            result.push({
                assetId: astId,
                assetName: nameMap[astId] || astId,
                ...stats,
                lastFailure: dates[dates.length - 1],
                nextPredicted: stats.mtbfDays
                    ? new Date(new Date(dates[dates.length - 1]).getTime() + stats.mtbfDays * 86400000).toISOString().split('T')[0]
                    : null,
            });
        }

        result.sort((a, b) => (a.mtbfDays || 9999) - (b.mtbfDays || 9999));
        res.json({ count: result.length, assets: result });
    } catch (err) {
        console.error('[predictive-maintenance] mtbf error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/predictive-maintenance/risk-ranking ───────────────────────────────
// Top 20 assets sorted by failure risk score: combines failure frequency,
// recency, and criticality score (if set).
router.get('/risk-ranking', (req, res) => {
    try {
        const conn    = db.getDb();
        const cutoff  = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];

        const rows = conn.prepare(`
            SELECT
                w.AstID AS assetId,
                COALESCE(a.Description, w.AstID) AS assetName,
                COALESCE(a.CriticalityScoreTotal, 0) AS criticalityScore,
                COUNT(*) AS failuresLastYear,
                MAX(w.CompDate) AS lastFailure,
                COALESCE(AVG(w.DowntimeCost), 0) AS avgDowntimeCost
            FROM Work w
            LEFT JOIN Asset a ON a.ID = w.AstID
            WHERE w.StatusID = ${STATUS_COMPLETED}
              AND w.WOSource = '${UNPLANNED_SOURCE}'
              AND w.CompDate >= ?
              AND w.AstID IS NOT NULL
            GROUP BY w.AstID
            ORDER BY failuresLastYear DESC, avgDowntimeCost DESC
            LIMIT 20
        `).all(cutoff);

        // Compute a simple risk score: (failures × (1 + criticality/10)) × recency factor
        const today = Date.now();
        const ranked = rows.map(r => {
            const daysSinceLast = r.lastFailure
                ? Math.round((today - new Date(r.lastFailure).getTime()) / 86400000)
                : 365;
            const recencyFactor = Math.max(0, 1 - daysSinceLast / 365);
            const riskScore = Math.round(
                r.failuresLastYear * (1 + (r.criticalityScore || 0) / 10) * (0.5 + recencyFactor * 0.5)
            );
            return { 
                ...r, 
                daysSinceLastFailure: daysSinceLast, 
                riskScore,
                ...computeRankingConfidence(r.failuresLastYear, daysSinceLast)
            };
        });

        ranked.sort((a, b) => b.riskScore - a.riskScore);
        res.json({ count: ranked.length, assets: ranked });
    } catch (err) {
        console.error('[predictive-maintenance] risk-ranking error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/predictive-maintenance/forecast ──────────────────────────────────
// Assets where the predicted next failure falls within 30, 60, or 90 days.
router.get('/forecast', (req, res) => {
    try {
        const conn = db.getDb();

        const rows = conn.prepare(`
            SELECT AstID, CompDate FROM Work
            WHERE StatusID = ${STATUS_COMPLETED}
              AND WOSource = '${UNPLANNED_SOURCE}'
              AND CompDate IS NOT NULL
              AND AstID IS NOT NULL
            ORDER BY AstID, CompDate ASC
        `).all();

        const byAsset = {};
        for (const r of rows) {
            if (!byAsset[r.AstID]) byAsset[r.AstID] = [];
            byAsset[r.AstID].push(r.CompDate);
        }

        let nameMap = {};
        try {
            const ids = Object.keys(byAsset);
            if (ids.length) {
                const ph = ids.map(() => '?').join(',');
                const assets = conn.prepare(`SELECT AstID, Description FROM Asset WHERE AstID IN (${ph})`).all(...ids);
                for (const a of assets) nameMap[a.AstID] = a.Description;
            }
        } catch { /* ok */ }

        const today = Date.now();
        const windows = { d30: [], d60: [], d90: [] };

        for (const [astId, dates] of Object.entries(byAsset)) {
            const stats = computeMTBF(dates);
            if (!stats || !stats.mtbfDays) continue;
            const lastMs = new Date(dates[dates.length - 1]).getTime();
            const predictedMs = lastMs + stats.mtbfDays * 86400000;
            const daysUntil = Math.round((predictedMs - today) / 86400000);

            const entry = {
                assetId: astId,
                assetName: nameMap[astId] || astId,
                mtbfDays: stats.mtbfDays,
                lastFailure: dates[dates.length - 1],
                predictedFailureDate: new Date(predictedMs).toISOString().split('T')[0],
                daysUntilPredicted: daysUntil,
                failureCount: stats.failureCount,
                ...computePredictiveConfidence(stats.failureCount, stats.stdDevDays, stats.mtbfDays, dates[dates.length - 1])
            };

            if (daysUntil >= 0 && daysUntil <= 30)  windows.d30.push(entry);
            if (daysUntil >= 0 && daysUntil <= 60)  windows.d60.push(entry);
            if (daysUntil >= 0 && daysUntil <= 90)  windows.d90.push(entry);
        }

        for (const key of Object.keys(windows)) {
            windows[key].sort((a, b) => a.daysUntilPredicted - b.daysUntilPredicted);
        }

        res.json(windows);
    } catch (err) {
        console.error('[predictive-maintenance] forecast error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/predictive-maintenance/asset/:id ─────────────────────────────────
// Full reliability profile for a single asset.
router.get('/asset/:id', (req, res) => {
    try {
        const conn = db.getDb();
        const assetId = req.params.id;

        const wos = conn.prepare(`
            SELECT ID, CompDate, ActualHours, DowntimeCost, WOSource
            FROM Work
            WHERE AstID = ? AND StatusID = ${STATUS_COMPLETED} AND CompDate IS NOT NULL
            ORDER BY CompDate ASC
        `).all(assetId);

        const unplanned = wos.filter(w => w.WOSource === UNPLANNED_SOURCE);
        const mtbf = computeMTBF(unplanned.map(w => w.CompDate));

        const mttr = unplanned.length > 0
            ? Math.round((unplanned.reduce((s, w) => s + (parseFloat(w.ActualHours) || 0), 0) / unplanned.length) * 10) / 10
            : null;

        const totalDowntimeCost = unplanned.reduce((s, w) => s + (parseFloat(w.DowntimeCost) || 0), 0);

        res.json({
            assetId,
            totalWOs:       wos.length,
            unplannedCount: unplanned.length,
            plannedCount:   wos.length - unplanned.length,
            mtbf:           mtbf || null,
            mttrHours:      mttr,
            totalDowntimeCost: Math.round(totalDowntimeCost),
            history:        unplanned.slice(-20).map(w => ({ date: w.CompDate, hours: w.ActualHours, cost: w.DowntimeCost })),
        });
    } catch (err) {
        console.error('[predictive-maintenance] asset/:id error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
