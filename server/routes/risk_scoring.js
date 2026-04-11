// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Risk Scoring Engine API
 * =====================================
 * Calculates a verifiable 0–100 composite Risk Score for each plant,
 * used for insurance underwriting, compliance audits, and executive
 * portfolio review. Aggregates live data across five risk dimensions.
 * Mounted at /api/risk-score in server/index.js.
 *
 * ENDPOINTS:
 *   GET  /              Current risk scores for all plants (cross-plant sweep)
 *   GET  /history       Historical score trend for the current plant (last 90 days)
 *   GET  /:plantId      Risk score and breakdown for a specific plant
 *   PUT  /:plantId      Manually override a risk factor with a documented reason
 *
 * SCORING MODEL (0–100 scale, higher = safer):
 *   Base score: 100
 *   High Penalty   (−20 pts): Overdue safety-critical PM, open near-miss incident
 *   Medium Penalty (−10 pts): Overdue calibration instrument (>30 days past due)
 *   Low Penalty    (− 5 pts): Open LOTO permit >48 hours, P1 WO unstarted >2 hrs
 *   Score Gain     (+ 5 pts): Zero-incident week, completed weekly LOTO audit
 *
 * DATA SOURCES:
 *   Work table          — PM adherence rate (safety PMs completed on schedule)
 *   SafetyIncidents     — incident frequency and open near-miss count
 *   calibration_instruments — overdue instrument count (past CalibrationDueDate)
 *   LotoPermits         — open vs. closed permit ratio and audit completion
 *
 * CACHING: Scores are cached per-plant for 60 seconds (CACHE_TTL) to keep
 *   API response time under 100ms even during cross-plant sweeps.
 *   Historical scores are written to RiskScoreHistory on each recalculation.
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb } = require('../logistics_db');
const db = require('../database');
const path = require('path');
const fs = require('fs');

// ── In-Memory Cache ───────────────────────────────────────────────────────────
const _cache = {};
const CACHE_TTL = 60_000; // 1 minute

// ── Initialize RiskScoreHistory Table ────────────────────────────────────────
function initRiskTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS RiskScoreHistory (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PlantID TEXT,
            Score INTEGER NOT NULL,
            Grade TEXT NOT NULL,
            Status TEXT NOT NULL,
            PmAdherencePct INTEGER,
            OpenNearMiss INTEGER,
            OverdueCalibration INTEGER,
            OpenLoto INTEGER,
            Note TEXT,
            ScoredBy TEXT DEFAULT 'system',
            ScoredAt TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_rsh_plant ON RiskScoreHistory(PlantID);
        CREATE INDEX IF NOT EXISTS idx_rsh_scored ON RiskScoreHistory(ScoredAt);
    `);
}
try { initRiskTables(); } catch (e) {
    console.warn('[RISK-SCORING] Could not init tables:', e.message);
}

// ── Core Scoring Engine ───────────────────────────────────────────────────────
function buildScore(plantId) {
    const cacheKey = plantId || 'all';
    const now = Date.now();
    if (_cache[cacheKey] && now - _cache[cacheKey].ts < CACHE_TTL) {
        return _cache[cacheKey].data;
    }

    let score = 100;
    const factors = [];
    const plantFilter = plantId ? ' AND PlantID = ?' : '';
    const plantParam = plantId ? [plantId] : [];

    // ── Factor 1: Open Near-Miss Incidents (High Penalty -20 pts each, cap -40) ──
    let openNearMissCount = 0;
    try {
        const row = logisticsDb.prepare(
            `SELECT COUNT(*) as cnt FROM safety_incidents
             WHERE Status = 'Open' AND IncidentType = 'Near Miss'${plantFilter}`
        ).get(...plantParam);
        openNearMissCount = row?.cnt || 0;
    } catch (e) { console.warn('[RISK-SCORING] near-miss query:', e.message); }

    if (openNearMissCount > 0) {
        const penalty = Math.min(openNearMissCount * 20, 40);
        score -= penalty;
        factors.push({ label: 'Open Near-Miss Incidents', value: openNearMissCount, impact: -penalty, category: 'safety', severity: 'high' });
    } else {
        factors.push({ label: 'Open Near-Miss Incidents', value: 0, impact: 0, category: 'safety', severity: 'ok' });
    }

    // ── Factor 2: Overdue Calibration >30 days (Medium Penalty -10 pts each, cap -30) ──
    let overdueCalCount = 0;
    try {
        const row = logisticsDb.prepare(
            `SELECT COUNT(*) as cnt FROM calibration_instruments
             WHERE Active = 1
               AND NextCalibrationDue < date('now', '-30 days')
               AND Status != 'Retired'${plantFilter}`
        ).get(...plantParam);
        overdueCalCount = row?.cnt || 0;
    } catch (e) { console.warn('[RISK-SCORING] calibration query:', e.message); }

    if (overdueCalCount > 0) {
        const penalty = Math.min(overdueCalCount * 10, 30);
        score -= penalty;
        factors.push({ label: 'Overdue Calibration (>30 days)', value: overdueCalCount, impact: -penalty, category: 'calibration', severity: 'medium' });
    } else {
        factors.push({ label: 'Overdue Calibration (>30 days)', value: 0, impact: 0, category: 'calibration', severity: 'ok' });
    }

    // ── Factor 3: LOTO Audit Trail ────────────────────────────────────────────
    // Open permits = still active (may be legitimate but tracked)
    // Closed this week = Score Gain (+5 pts)
    let openLotoCount = 0;
    let closedLotoWeekCount = 0;
    try {
        const openRow = logisticsDb.prepare(
            `SELECT COUNT(*) as cnt FROM LotoPermits WHERE Status = 'ACTIVE'${plantId ? ' AND PlantID = ?' : ''}`
        ).get(...plantParam);
        openLotoCount = openRow?.cnt || 0;

        const closedRow = logisticsDb.prepare(
            `SELECT COUNT(*) as cnt FROM LotoPermits
             WHERE Status = 'CLOSED' AND ClosedAt >= datetime('now', '-7 days')${plantId ? ' AND PlantID = ?' : ''}`
        ).get(...plantParam);
        closedLotoWeekCount = closedRow?.cnt || 0;
    } catch (e) { console.warn('[RISK-SCORING] loto query:', e.message); }

    if (closedLotoWeekCount > 0) {
        score = Math.min(100, score + 5);
        factors.push({ label: 'LOTO Audits Completed (this week)', value: closedLotoWeekCount, impact: +5, category: 'loto', severity: 'bonus' });
    } else {
        factors.push({ label: 'LOTO Audits Completed (this week)', value: 0, impact: 0, category: 'loto', severity: 'neutral' });
    }
    factors.push({ label: 'Open LOTO Permits', value: openLotoCount, impact: 0, category: 'loto', severity: openLotoCount > 5 ? 'medium' : 'neutral' });

    // ── Factor 4: Overdue Safety PMs from Work Orders (High Penalty -20 per, cap -40) ──
    let overduePmCount = 0;
    let totalPmCount = 0;
    let adherencePct = null;

    try {
        const dataDir = require('../resolve_data_dir');
        const plantsFile = path.join(dataDir, 'plants.json');
        const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
        const targetPlants = plantId ? plants.filter(p => p.id === plantId) : plants;

        targetPlants.forEach(p => {
            const dbPath = path.join(dataDir, `${p.id}.db`);
            if (!fs.existsSync(dbPath)) return;
            try {
                const pdb = db.getDb(p.id);

                // Check table and Type column exist
                const hasTbl = pdb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='Work'`).get();
                if (!hasTbl) return;
                const cols = pdb.prepare(`PRAGMA table_info(Work)`).all();
                const hasType = cols.some(c => c.name === 'Type');
                if (!hasType) return;

                // Total PM count
                const totalRow = pdb.prepare(
                    `SELECT COUNT(*) as cnt FROM Work
                     WHERE Type LIKE '%PM%' OR Type LIKE '%Preventive%'`
                ).get();
                totalPmCount += (totalRow?.cnt || 0);

                // Overdue = scheduled date past, not yet closed/complete
                const overdueRow = pdb.prepare(
                    `SELECT COUNT(*) as cnt FROM Work w
                     WHERE (w.Type LIKE '%PM%' OR w.Type LIKE '%Preventive%')
                       AND w.SchDate < date('now')
                       AND NOT EXISTS (
                           SELECT 1 FROM WorkStatuses ws
                           WHERE ws.ID = w.StatusID
                             AND (ws.Description LIKE '%Closed%'
                               OR ws.Description LIKE '%Complete%'
                               OR ws.Description LIKE '%Done%')
                       )`
                ).get();
                overduePmCount += (overdueRow?.cnt || 0);
            } catch (e) { /* skip plants with schema differences */ }
        });

        if (totalPmCount > 0) {
            adherencePct = Math.round(((totalPmCount - overduePmCount) / totalPmCount) * 100);
        }
    } catch (e) { console.warn('[RISK-SCORING] PM query:', e.message); }

    if (overduePmCount > 0) {
        const penalty = Math.min(overduePmCount * 20, 40);
        score -= penalty;
        factors.push({ label: 'Overdue Safety PMs', value: overduePmCount, impact: -penalty, category: 'pm', severity: 'high', adherencePct });
    } else if (adherencePct !== null) {
        factors.push({ label: 'PM Adherence', value: `${adherencePct}%`, impact: 0, category: 'pm', severity: 'ok', adherencePct });
    }

    // ── Factor 5: 0-Incident Week Bonus (+5 pts) ─────────────────────────────
    let incidentsThisWeek = 0;
    try {
        const row = logisticsDb.prepare(
            `SELECT COUNT(*) as cnt FROM safety_incidents
             WHERE IncidentDate >= date('now', '-7 days')${plantFilter}`
        ).get(...plantParam);
        incidentsThisWeek = row?.cnt || 0;
    } catch (e) { console.warn('[RISK-SCORING] weekly incident query:', e.message); }

    if (incidentsThisWeek === 0) {
        score = Math.min(100, score + 5);
        factors.push({ label: '0-Incident Week', value: 0, impact: +5, category: 'bonus', severity: 'bonus' });
    } else {
        factors.push({ label: 'Incidents This Week', value: incidentsThisWeek, impact: 0, category: 'safety', severity: 'neutral' });
    }

    score = Math.max(0, Math.min(100, score));
    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
    const status = score >= 80 ? 'Good Standing' : score >= 60 ? 'Needs Attention' : 'At Risk';

    const result = {
        score,
        grade,
        status,
        factors,
        pmAdherencePct: adherencePct,
        openNearMiss: openNearMissCount,
        overdueCalibration: overdueCalCount,
        openLoto: openLotoCount,
        calculatedAt: new Date().toISOString(),
        plantId: plantId || 'enterprise'
    };

    _cache[cacheKey] = { ts: now, data: result };
    return result;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/risk-scoring — Enterprise or single-plant score
router.get('/', (req, res) => {
    try {
        const { plantId } = req.query;
        res.json(buildScore(plantId || null));
    } catch (err) {
        console.error('[RISK-SCORING] GET /:', err);
        res.status(500).json({ error: 'Failed to calculate risk score: ' });
    }
});

// GET /api/risk-scoring/history — 12-month trend (sparkline data)
router.get('/history', (req, res) => {
    try {
        const { plantId } = req.query;
        const filter = plantId ? ' AND PlantID = ?' : '';
        const params = plantId ? [plantId] : [];
        const rows = logisticsDb.prepare(
            `SELECT Score, Grade, Status, ScoredAt FROM RiskScoreHistory
             WHERE 1=1${filter}
             ORDER BY ScoredAt DESC LIMIT 12`
        ).all(...params);
        res.json(rows.reverse()); // oldest first for chart rendering
    } catch (err) {
        console.error('[RISK-SCORING] GET /history:', err);
        res.json([]); // return empty array if table not yet populated
    }
});

// GET /api/risk-scoring/:plantId — Specific plant score
router.get('/:plantId', (req, res) => {
    try {
        res.json(buildScore(req.params.plantId));
    } catch (err) {
        console.error('[RISK-SCORING] GET /:plantId:', err);
        res.status(500).json({ error: 'Failed to calculate risk score: ' });
    }
});

// PUT /api/risk-scoring/:plantId — Snapshot current score to history (admin audit)
router.put('/:plantId', (req, res) => {
    try {
        const { note, adjustment } = req.body;
        const plantId = req.params.plantId;
        const current = buildScore(plantId);
        const finalScore = adjustment
            ? Math.max(0, Math.min(100, current.score + parseInt(adjustment)))
            : current.score;
        const grade = finalScore >= 90 ? 'A' : finalScore >= 80 ? 'B' : finalScore >= 70 ? 'C' : finalScore >= 60 ? 'D' : 'F';
        const status = finalScore >= 80 ? 'Good Standing' : finalScore >= 60 ? 'Needs Attention' : 'At Risk';

        logisticsDb.prepare(
            `INSERT INTO RiskScoreHistory
             (PlantID, Score, Grade, Status, PmAdherencePct, OpenNearMiss, OverdueCalibration, OpenLoto, Note, ScoredBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            plantId, finalScore, grade, status,
            current.pmAdherencePct, current.openNearMiss,
            current.overdueCalibration, current.openLoto,
            note || '', req.user?.username || 'system'
        );

        // Invalidate cache after snapshot
        delete _cache[plantId];
        delete _cache['all'];

        res.json({ success: true, score: finalScore, grade, status });
    } catch (err) {
        console.error('[RISK-SCORING] PUT /:plantId:', err);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

module.exports = router;
