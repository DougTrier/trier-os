// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * MODULE: Operator Trust Layer
 * 
 * ENDPOINTS:
 *   POST /api/operator-trust/recommendations
 *   GET /api/operator-trust/recommendations
 *   GET /api/operator-trust/recommendations/:id
 *   POST /api/operator-trust/feedback
 *   POST /api/operator-trust/outcomes
 *   GET /api/operator-trust/metrics
 */

const express = require('express');
const router = express.Router();
const logisticsDb = require('../logistics_db').db;
const { logAudit } = require('../logistics_db');

const SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/;

router.post('/recommendations', (req, res) => {
    try {
        const { type, plantId, assetId, recommendedAction, confidenceScore, confidenceBand, emittedPayload } = req.body;

        if (!['PREDICTIVE_FORECAST', 'RISK_SCORE', 'VIBRATION_ALERT'].includes(type)) {
            return res.status(400).json({ error: 'Invalid recommendation type' });
        }
        if (!plantId || !SAFE_PLANT_ID.test(plantId)) {
            return res.status(400).json({ error: 'Invalid plantId' });
        }
        if (typeof confidenceScore !== 'number' || confidenceScore < 0.0 || confidenceScore > 1.0) {
            return res.status(400).json({ error: 'Invalid confidenceScore' });
        }
        if (!['LOW', 'MEDIUM', 'HIGH'].includes(confidenceBand)) {
            return res.status(400).json({ error: 'Invalid confidenceBand' });
        }
        if (!recommendedAction || recommendedAction.trim() === '') {
            return res.status(400).json({ error: 'recommendedAction is required' });
        }
        if (!emittedPayload) {
            return res.status(400).json({ error: 'emittedPayload is required' });
        }

        const payloadStr = typeof emittedPayload === 'object' ? JSON.stringify(emittedPayload) : emittedPayload;

        const result = logisticsDb.prepare(`
            INSERT INTO RecommendationLog (Type, PlantID, AssetID, RecommendedAction, ConfidenceScore, ConfidenceBand, EmittedAt, EmittedPayload)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(type, plantId, assetId || null, recommendedAction, confidenceScore, confidenceBand, new Date().toISOString(), payloadStr);

        res.json({ success: true, recommendationId: result.lastInsertRowid });
    } catch (err) {
        console.error('POST /api/operator-trust/recommendations error:', err.message);
        res.status(500).json({ error: 'Failed to log recommendation' });
    }
});

router.get('/recommendations', (req, res) => {
    try {
        const { plantId, type, limit = 50, offset = 0 } = req.query;

        if (!plantId || !SAFE_PLANT_ID.test(plantId)) {
            return res.status(400).json({ error: 'Invalid plantId' });
        }

        let l = parseInt(limit, 10);
        if (isNaN(l) || l < 1) l = 50;
        if (l > 200) l = 200;

        let o = parseInt(offset, 10);
        if (isNaN(o) || o < 0) o = 0;

        let queryStr = `
            SELECT r.*, 
                   (SELECT COUNT(*) FROM OperatorFeedback f WHERE f.RecommendationID = r.RecommendationID) as feedbackCount
            FROM RecommendationLog r
            WHERE r.PlantID = ?
        `;
        const params = [plantId];

        if (type) {
            queryStr += ` AND r.Type = ?`;
            params.push(type);
        }

        queryStr += ` ORDER BY r.EmittedAt DESC LIMIT ? OFFSET ?`;
        params.push(l, o);

        const rows = logisticsDb.prepare(queryStr).all(...params);

        let countQueryStr = `SELECT COUNT(*) as c FROM RecommendationLog WHERE PlantID = ?`;
        const countParams = [plantId];
        if (type) {
            countQueryStr += ` AND Type = ?`;
            countParams.push(type);
        }
        
        const countRow = logisticsDb.prepare(countQueryStr).get(...countParams);

        res.json({ count: countRow.c, recommendations: rows });
    } catch (err) {
        console.error('GET /api/operator-trust/recommendations error:', err.message);
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});

router.get('/recommendations/:id', (req, res) => {
    try {
        const { id } = req.params;

        const recommendation = logisticsDb.prepare('SELECT * FROM RecommendationLog WHERE RecommendationID = ?').get(id);
        if (!recommendation) {
            return res.status(404).json({ error: 'Recommendation not found' });
        }

        try {
            recommendation.emittedPayload = JSON.parse(recommendation.EmittedPayload);
        } catch (e) {
            recommendation.emittedPayload = recommendation.EmittedPayload;
        }

        const feedback = logisticsDb.prepare('SELECT * FROM OperatorFeedback WHERE RecommendationID = ? ORDER BY FeedbackAt ASC').all(id);
        
        const outcome = logisticsDb.prepare('SELECT * FROM RecommendationOutcome WHERE RecommendationID = ?').get(id) || null;

        res.json({ recommendation, feedback, outcome });
    } catch (err) {
        console.error('GET /api/operator-trust/recommendations/:id error:', err.message);
        res.status(500).json({ error: 'Failed to fetch recommendation details' });
    }
});

router.post('/feedback', (req, res) => {
    try {
        const { recommendationId, action, reasonCode, annotation, linkedWoId } = req.body;

        if (!['ACCEPT', 'REJECT', 'ANNOTATE'].includes(action)) {
            return res.status(400).json({ error: 'Invalid action' });
        }

        if (action === 'REJECT') {
            if (!['FALSE_POSITIVE', 'ALREADY_KNOWN', 'OUT_OF_SCOPE', 'DATA_ERROR'].includes(reasonCode)) {
                return res.status(400).json({ error: 'Invalid or missing reasonCode for REJECT' });
            }
        }

        const recommendation = logisticsDb.prepare('SELECT PlantID, AssetID FROM RecommendationLog WHERE RecommendationID = ?').get(recommendationId);
        if (!recommendation) {
            return res.status(404).json({ error: 'Recommendation not found' });
        }

        const username = req.user?.Username;
        if (!username) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const result = logisticsDb.prepare(`
            INSERT INTO OperatorFeedback (RecommendationID, PlantID, AssetID, Operator, Action, ReasonCode, Annotation, LinkedWOID, FeedbackAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(recommendationId, recommendation.PlantID, recommendation.AssetID, username, action, reasonCode || null, annotation || null, linkedWoId || null, new Date().toISOString());

        logAudit(username, 'OPERATOR_FEEDBACK_SUBMITTED', recommendation.PlantID, { recommendationId, action, reasonCode });

        res.json({ success: true, feedbackId: result.lastInsertRowid });
    } catch (err) {
        console.error('POST /api/operator-trust/feedback error:', err.message);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

router.post('/outcomes', (req, res) => {
    try {
        const { recommendationId, outcomeType, matchedWoId, evidenceNote } = req.body;

        if (!['VALIDATED', 'REFUTED', 'EXPIRED', 'INCONCLUSIVE'].includes(outcomeType)) {
            return res.status(400).json({ error: 'Invalid outcomeType' });
        }

        const recommendation = logisticsDb.prepare('SELECT PlantID FROM RecommendationLog WHERE RecommendationID = ?').get(recommendationId);
        if (!recommendation) {
            return res.status(404).json({ error: 'Recommendation not found' });
        }

        const existing = logisticsDb.prepare('SELECT OutcomeID FROM RecommendationOutcome WHERE RecommendationID = ?').get(recommendationId);
        if (existing) {
            return res.status(409).json({ error: 'Outcome already recorded for this recommendation' });
        }

        const username = req.user?.Username || 'system';

        const result = logisticsDb.prepare(`
            INSERT INTO RecommendationOutcome (RecommendationID, OutcomeType, MatchedWOID, EvidenceNote, RecordedAt, RecordedBy)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(recommendationId, outcomeType, matchedWoId || null, evidenceNote || null, new Date().toISOString(), username);

        logAudit(username, 'RECOMMENDATION_OUTCOME_RECORDED', recommendation.PlantID, { recommendationId, outcomeType });

        res.json({ success: true, outcomeId: result.lastInsertRowid });
    } catch (err) {
        console.error('POST /api/operator-trust/outcomes error:', err.message);
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'Outcome already recorded for this recommendation' });
        }
        res.status(500).json({ error: 'Failed to record outcome' });
    }
});

router.get('/metrics', (req, res) => {
    try {
        const { plantId, type, days = 90 } = req.query;

        if (!plantId || !SAFE_PLANT_ID.test(plantId)) {
            return res.status(400).json({ error: 'Invalid plantId' });
        }

        let d = parseInt(days, 10);
        if (isNaN(d) || d < 1) d = 90;
        if (d > 365) d = 365;

        let queryStr = `
            SELECT o.OutcomeType, r.Type as RecType
            FROM RecommendationOutcome o
            JOIN RecommendationLog r ON o.RecommendationID = r.RecommendationID
            WHERE r.PlantID = ? AND o.RecordedAt >= datetime('now', ?)
        `;
        const params = [plantId, `-${d} days`];

        if (type) {
            queryStr += ` AND r.Type = ?`;
            params.push(type);
        }

        const outcomes = logisticsDb.prepare(queryStr).all(...params);

        const buildStats = (rows) => {
            let validated = 0;
            let refuted = 0;
            let expired = 0;
            let inconclusive = 0;

            for (const row of rows) {
                if (row.OutcomeType === 'VALIDATED') validated++;
                else if (row.OutcomeType === 'REFUTED') refuted++;
                else if (row.OutcomeType === 'EXPIRED') expired++;
                else if (row.OutcomeType === 'INCONCLUSIVE') inconclusive++;
            }

            const total = rows.length;
            const denom = validated + refuted + expired;
            let validationRate = null;
            if (denom > 0) {
                validationRate = Math.round((validated / denom) * 100) / 100;
            }

            return { total, validated, refuted, expired, inconclusive, validationRate };
        };

        const overall = buildStats(outcomes);

        const typesMap = {};
        for (const row of outcomes) {
            if (!typesMap[row.RecType]) typesMap[row.RecType] = [];
            typesMap[row.RecType].push(row);
        }

        const byType = {};
        for (const t of ['PREDICTIVE_FORECAST', 'RISK_SCORE', 'VIBRATION_ALERT']) {
            byType[t] = buildStats(typesMap[t] || []);
        }

        res.json({
            plantId,
            windowDays: d,
            overall,
            byType
        });
    } catch (err) {
        console.error('GET /api/operator-trust/metrics error:', err.message);
        res.status(500).json({ error: 'Failed to compute metrics' });
    }
});

module.exports = router;
