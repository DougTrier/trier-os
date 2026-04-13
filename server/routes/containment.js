// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * containment.js — Failure Containment Scoring
 * ==============================================
 * Computes a real-time blast-radius score for a given asset failure.
 * Answers: if this asset fails right now, how contained or cascading
 * is the impact? Returns a three-tier score with a plain-language
 * explanation for display on Mission Control.
 *
 * Scoring inputs (all from existing data):
 *   1. Asset criticality score (CriticalityScoreTotal from Asset table)
 *   2. Number of open WOs on the same asset and its children
 *   3. Active safety permits on the same asset (concurrent exposure)
 *   4. Asset hierarchy depth (child assets multiply the radius)
 *   5. Open CAPA items linked to related RCAs (unresolved systemic issues)
 *
 * Score tiers:
 *   🟢 ISOLATED  — score 0–3:  Failure self-contained, low cross-system impact
 *   🟡 PARTIAL   — score 4–7:  Moderate impact, 1–2 downstream systems affected
 *   🔴 CASCADING — score 8+:   High criticality or multiple open vectors
 *
 * -- ROUTES ----------------------------------------------------
 *   GET /api/containment/score/:assetId       Current containment score for an asset
 *   GET /api/containment/blast-radius/:assetId Full blast-radius analysis
 *   GET /api/containment/dashboard            Plant-wide containment status
 *
 * -- P7 ROADMAP ITEM COVERED ----------------------------------
 *   Failure Containment Scoring (live blast-radius meter)
 */

'use strict';

const express     = require('express');
const router      = express.Router();
const logisticsDb = require('../logistics_db').db;
const db          = require('../database');

// ── Score tier classification ─────────────────────────────────────────────────
function classifyScore(score) {
    if (score >= 8) return { tier: 'CASCADING', emoji: '🔴', color: '#ef4444' };
    if (score >= 4) return { tier: 'PARTIAL',   emoji: '🟡', color: '#f59e0b' };
    return           { tier: 'ISOLATED',  emoji: '🟢', color: '#10b981' };
}

// ── Core scoring function ─────────────────────────────────────────────────────
function computeContainmentScore(conn, assetId, plantId) {
    const factors = [];
    let score = 0;

    // ── Factor 1: Asset criticality ────────────────────────────────────────────
    let criticalityScore = 0;
    let assetName = assetId;
    try {
        const asset = conn.prepare('SELECT Description, CriticalityScoreTotal FROM Asset WHERE AstID = ? OR ID = ? LIMIT 1').get(assetId, assetId);
        if (asset) {
            assetName = asset.Description || assetId;
            criticalityScore = parseInt(asset.CriticalityScoreTotal) || 0;
            if (criticalityScore >= 15) { score += 3; factors.push({ factor: 'CRITICALITY_CRITICAL', weight: 3, detail: `Criticality score ${criticalityScore}/20` }); }
            else if (criticalityScore >= 10) { score += 2; factors.push({ factor: 'CRITICALITY_HIGH', weight: 2, detail: `Criticality score ${criticalityScore}/20` }); }
            else if (criticalityScore >= 5)  { score += 1; factors.push({ factor: 'CRITICALITY_MEDIUM', weight: 1, detail: `Criticality score ${criticalityScore}/20` }); }
        }
    } catch { /* ok */ }

    // ── Factor 2: Open WOs on this asset (concurrent work) ────────────────────
    try {
        const openWOs = conn.prepare('SELECT COUNT(*) AS c FROM Work WHERE AstID = ? AND StatusID IN (20, 30)').get(assetId);
        const count = openWOs?.c || 0;
        if (count >= 3) { score += 2; factors.push({ factor: 'CONCURRENT_WORK_HIGH', weight: 2, detail: `${count} open WOs on this asset` }); }
        else if (count >= 1) { score += 1; factors.push({ factor: 'CONCURRENT_WORK', weight: 1, detail: `${count} open WO(s) on this asset` }); }
    } catch { /* ok */ }

    // ── Factor 3: Child assets with open WOs (hierarchy propagation) ──────────
    try {
        const childWOs = conn.prepare(`
            SELECT COUNT(*) AS c FROM Work w
            JOIN Asset a ON a.AstID = w.AstID
            WHERE a.ParentAssetID = ? AND w.StatusID IN (20,30)
        `).get(assetId);
        const count = childWOs?.c || 0;
        if (count >= 2) { score += 2; factors.push({ factor: 'CHILD_ASSET_EXPOSURE', weight: 2, detail: `${count} open WOs on child assets` }); }
        else if (count === 1) { score += 1; factors.push({ factor: 'CHILD_ASSET_EXPOSURE', weight: 1, detail: '1 open WO on a child asset' }); }
    } catch { /* ok */ }

    // ── Factor 4: Active safety permits on this asset ─────────────────────────
    try {
        const permits = logisticsDb.prepare(
            "SELECT COUNT(*) AS c FROM SafetyPermits WHERE AssetID = ? AND PlantID = ? AND Status IN ('ACTIVE','DRAFT')"
        ).get(assetId, plantId);
        const count = permits?.c || 0;
        if (count >= 2) { score += 2; factors.push({ factor: 'MULTIPLE_ACTIVE_PERMITS', weight: 2, detail: `${count} active safety permits — simultaneous ops risk` }); }
        else if (count === 1) { score += 1; factors.push({ factor: 'ACTIVE_PERMIT', weight: 1, detail: '1 active safety permit on this asset' }); }
    } catch { /* ok */ }

    // ── Factor 5: Open CAPAs linked to this asset's RCAs (systemic risk) ──────
    try {
        const rcas = logisticsDb.prepare(
            "SELECT ID FROM rca_investigations WHERE AssetID = ? AND Status != 'Closed'"
        ).all(assetId);
        const rcaIds = rcas.map(r => r.ID);
        if (rcaIds.length > 0) {
            const ph = rcaIds.map(() => '?').join(',');
            const openCAPAs = logisticsDb.prepare(
                `SELECT COUNT(*) AS c FROM CorrectiveActions WHERE RCAID IN (${ph}) AND Status IN ('Open','InProgress','Overdue')`
            ).get(...rcaIds);
            const count = openCAPAs?.c || 0;
            if (count >= 2) { score += 2; factors.push({ factor: 'UNRESOLVED_CAPAS_MULTIPLE', weight: 2, detail: `${count} open CAPAs from prior RCAs — systemic issue unresolved` }); }
            else if (count === 1) { score += 1; factors.push({ factor: 'UNRESOLVED_CAPA', weight: 1, detail: '1 open CAPA from a prior RCA' }); }
        }
    } catch { /* ok */ }

    const classification = classifyScore(score);

    return {
        assetId, assetName, plantId,
        score,
        ...classification,
        factors,
        computedAt: new Date().toISOString(),
    };
}

// ── GET /api/containment/score/:assetId ───────────────────────────────────────
router.get('/score/:assetId', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        if (!plantId) return res.status(400).json({ error: 'plantId or x-plant-id header required' });

        const conn = db.getDb(plantId);
        const result = computeContainmentScore(conn, req.params.assetId, plantId);

        // Return condensed score for Mission Control widget
        res.json({
            assetId:  result.assetId,
            assetName: result.assetName,
            score:    result.score,
            tier:     result.tier,
            emoji:    result.emoji,
            color:    result.color,
            topFactor: result.factors[0]?.detail || null,
            computedAt: result.computedAt,
        });
    } catch (err) {
        console.error('[containment] score error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/containment/blast-radius/:assetId ────────────────────────────────
router.get('/blast-radius/:assetId', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        if (!plantId) return res.status(400).json({ error: 'plantId or x-plant-id header required' });

        const conn   = db.getDb(plantId);
        const result = computeContainmentScore(conn, req.params.assetId, plantId);

        // Fetch child assets for the full radius map
        let childAssets = [];
        try {
            childAssets = conn.prepare('SELECT AstID, Description FROM Asset WHERE ParentAssetID = ?').all(req.params.assetId);
        } catch { /* ok */ }

        res.json({ ...result, childAssets });
    } catch (err) {
        console.error('[containment] blast-radius error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/containment/dashboard ────────────────────────────────────────────
// Scan all assets with high criticality scores and return a ranked containment list.
router.get('/dashboard', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        if (!plantId) return res.status(400).json({ error: 'plantId or x-plant-id header required' });

        const conn = db.getDb(plantId);

        // Get high-criticality assets (score ≥ 5) as the scan candidates
        let candidates = [];
        try {
            candidates = conn.prepare(
                'SELECT AstID, Description, CriticalityScoreTotal FROM Asset WHERE CriticalityScoreTotal >= 5 ORDER BY CriticalityScoreTotal DESC LIMIT 30'
            ).all();
        } catch {
            // Fallback: assets with the most recent open WOs
            candidates = conn.prepare(
                'SELECT DISTINCT AstID, AstID AS Description FROM Work WHERE StatusID IN (20,30) AND AstID IS NOT NULL LIMIT 20'
            ).all().map(r => ({ AstID: r.AstID, Description: r.AstID, CriticalityScoreTotal: 0 }));
        }

        const scores = candidates.map(a => {
            const s = computeContainmentScore(conn, a.AstID, plantId);
            return { assetId: a.AstID, assetName: a.Description, score: s.score, tier: s.tier, emoji: s.emoji, color: s.color };
        }).sort((a, b) => b.score - a.score);

        const summary = {
            cascading: scores.filter(s => s.tier === 'CASCADING').length,
            partial:   scores.filter(s => s.tier === 'PARTIAL').length,
            isolated:  scores.filter(s => s.tier === 'ISOLATED').length,
        };

        res.json({ plantId, summary, assets: scores });
    } catch (err) {
        console.error('[containment] dashboard error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
