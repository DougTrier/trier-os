// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Computer Vision Routes
 * ====================================
 * All AI vision analysis endpoints. Uses the configured AI provider
 * (OpenAI GPT-4o / Anthropic Claude 3 / Ollama with vision model) via
 * the callVision() function in ai_service.js.
 *
 * ENDPOINTS:
 *   POST  /api/cv/analyze-defect         Defect + damage detection on any image
 *   POST  /api/cv/ppe-check              PPE compliance check on site photos
 *   POST  /api/cv/condition              Component visual condition score
 *   GET   /api/cv/defect-history/:assetId Last 20 defect observations for an asset
 *   GET   /api/cv/condition-score/:assetId Rolling condition score (1–100) for an asset
 *   GET   /api/cv/ppe-stats              PPE compliance percentage (last 30 days)
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { db: logisticsDb, logAudit } = require('../logistics_db');
const { callVision } = require('../ai_service');

const dataDir = require('../resolve_data_dir');
const tmpDir = path.join(dataDir, 'uploads', 'cv_tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({
    dest: tmpDir,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are accepted'));
    }
});

// ── Initialize tables ─────────────────────────────────────────────────────────
function initCVTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS asset_defect_observations (
            ID          INTEGER PRIMARY KEY AUTOINCREMENT,
            AssetID     TEXT NOT NULL,
            WorkOrderID TEXT,
            PlantID     TEXT,
            PhotoPath   TEXT,
            DefectType  TEXT,
            Severity    INTEGER NOT NULL DEFAULT 1,
            AffectedArea TEXT,
            Recommendation TEXT,
            ConfirmedBy TEXT,
            ConfirmedAt TEXT,
            DetectedAt  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ppe_photo_checks (
            ID          INTEGER PRIMARY KEY AUTOINCREMENT,
            PhotoPath   TEXT,
            IncidentID  TEXT,
            WorkOrderID TEXT,
            PlantID     TEXT,
            HardHat     INTEGER DEFAULT 0,
            SafetyVest  INTEGER DEFAULT 0,
            EyeProtection INTEGER DEFAULT 0,
            Gloves      INTEGER DEFAULT 0,
            Confidence  REAL,
            PersonVisible INTEGER DEFAULT 0,
            CheckedAt   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS asset_condition_scores (
            ID          INTEGER PRIMARY KEY AUTOINCREMENT,
            AssetID     TEXT NOT NULL,
            PlantID     TEXT,
            WorkOrderID TEXT,
            PhotoPath   TEXT,
            Condition   TEXT NOT NULL,
            Score       INTEGER NOT NULL,
            Notes       TEXT,
            ScoredAt    TEXT DEFAULT (datetime('now'))
        );
    `);
    console.log('[CV] Tables initialized');
}
initCVTables();

// ── Helper: load image to base64 ─────────────────────────────────────────────
function imageToBase64(filePath, mimeType) {
    const buf = fs.readFileSync(filePath);
    return buf.toString('base64');
}

// ── Helper: parse JSON from AI response ──────────────────────────────────────
function parseAIJson(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found in AI response');
    return JSON.parse(match[0]);
}

// ── POST /api/cv/analyze-defect ───────────────────────────────────────────────
router.post('/analyze-defect', upload.single('image'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No image uploaded' });

    try {
        const { assetId, assetType, workOrderId, plantId, reportedBy } = req.body;
        const imageBase64 = imageToBase64(filePath, req.file.mimetype);

        const prompt = `You are an expert industrial maintenance engineer analyzing a photo of equipment.
Identify any visible defects, damage, wear, corrosion, leaks, cracks, or abnormal conditions.

Return ONLY valid JSON (no markdown):
{
  "defectType": "<one of: None, Corrosion, Crack, Leak, Wear, Damage, Contamination, Misalignment, Overheating, Other>",
  "severity": <1-5 integer: 1=Normal, 2=Minor, 3=Moderate, 4=Severe, 5=Critical>,
  "affectedArea": "<brief description of which component or area is affected, or null>",
  "recommendation": "<one actionable maintenance recommendation, or 'No action required'>",
  "confidence": <0-100 integer>,
  "notes": "<any additional observations about the equipment condition>"
}

Asset type context: ${assetType || 'industrial equipment'}`;

        const aiText = await callVision(imageBase64, req.file.mimetype, prompt);
        const result = parseAIJson(aiText);

        // Persist observation to DB
        let recordId = null;
        if (assetId) {
            const ins = logisticsDb.prepare(`
                INSERT INTO asset_defect_observations (AssetID, WorkOrderID, PlantID, PhotoPath, DefectType, Severity, AffectedArea, Recommendation)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(assetId, workOrderId || null, plantId || null, req.file.originalname || null, result.defectType, result.severity || 1, result.affectedArea || null, result.recommendation || null);
            recordId = ins.lastInsertRowid;
            try { logAudit('CV_DEFECT_DETECTED', reportedBy, plantId, { assetId, defectType: result.defectType, severity: result.severity }); } catch { /**/ }
        }

        try { fs.unlinkSync(filePath); } catch { /**/ }
        res.json({ ...result, id: recordId });

    } catch (err) {
        try { fs.unlinkSync(filePath); } catch { /**/ }
        console.error('[CV] analyze-defect error:', err.message);
        res.status(500).json({ error: 'Defect analysis failed: ' });
    }
});

// ── POST /api/cv/ppe-check ────────────────────────────────────────────────────
router.post('/ppe-check', upload.single('image'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No image uploaded' });

    try {
        const { incidentId, workOrderId, plantId } = req.body;
        const imageBase64 = imageToBase64(filePath, req.file.mimetype);

        const prompt = `You are a workplace safety inspector analyzing a photo for PPE compliance.
Examine the image and check whether any people visible are wearing required personal protective equipment.

Return ONLY valid JSON (no markdown):
{
  "personVisible": <true/false — is a person clearly visible in the image?>,
  "hardHat": <true/false — wearing a hard hat or safety helmet?>,
  "safetyVest": <true/false — wearing a high-visibility safety vest?>,
  "eyeProtection": <true/false — wearing safety glasses, goggles, or a face shield?>,
  "gloves": <true/false — wearing work gloves?>,
  "confidence": <0-100 integer — overall confidence in the assessment>,
  "notes": "<any relevant safety observations>"
}

If no person is visible, set personVisible to false and all PPE fields to false.`;

        const aiText = await callVision(imageBase64, req.file.mimetype, prompt);
        const result = parseAIJson(aiText);

        // Persist check
        const ins = logisticsDb.prepare(`
            INSERT INTO ppe_photo_checks (PhotoPath, IncidentID, WorkOrderID, PlantID, HardHat, SafetyVest, EyeProtection, Gloves, Confidence, PersonVisible)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(req.file.originalname || null, incidentId || null, workOrderId || null, plantId || null, result.hardHat ? 1 : 0, result.safetyVest ? 1 : 0, result.eyeProtection ? 1 : 0, result.gloves ? 1 : 0, result.confidence || 0, result.personVisible ? 1 : 0);

        try { fs.unlinkSync(filePath); } catch { /**/ }
        res.json({ ...result, id: ins.lastInsertRowid });

    } catch (err) {
        try { fs.unlinkSync(filePath); } catch { /**/ }
        console.error('[CV] ppe-check error:', err.message);
        res.status(500).json({ error: 'PPE check failed: ' });
    }
});

// ── POST /api/cv/condition ────────────────────────────────────────────────────
router.post('/condition', upload.single('image'), async (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: 'No image uploaded' });

    try {
        const { assetId, workOrderId, plantId, componentType } = req.body;
        const imageBase64 = imageToBase64(filePath, req.file.mimetype);

        const prompt = `You are an expert industrial maintenance engineer performing a visual inspection.
Classify the visible condition of the component or equipment shown in the photo.

Return ONLY valid JSON (no markdown):
{
  "condition": "<exactly one of: New, Good, Worn, Replace>",
  "score": <integer 1-100: New=90-100, Good=60-89, Worn=30-59, Replace=1-29>,
  "confidence": <0-100 integer>,
  "observations": "<what specific visual indicators led to this classification>",
  "fluidLevel": <0-100 percentage if fluid level is visible, otherwise null>
}

Component type: ${componentType || 'mechanical component'}`;

        const aiText = await callVision(imageBase64, req.file.mimetype, prompt);
        const result = parseAIJson(aiText);

        const CONDITION_SCORE = { 'New': 95, 'Good': 75, 'Worn': 40, 'Replace': 15 };
        const score = result.score || CONDITION_SCORE[result.condition] || 50;

        if (assetId) {
            logisticsDb.prepare(`
                INSERT INTO asset_condition_scores (AssetID, WorkOrderID, PlantID, Condition, Score, Notes)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(assetId, workOrderId || null, plantId || null, result.condition, score, result.observations || null);
        }

        try { fs.unlinkSync(filePath); } catch { /**/ }
        res.json({ ...result, score });

    } catch (err) {
        try { fs.unlinkSync(filePath); } catch { /**/ }
        console.error('[CV] condition error:', err.message);
        res.status(500).json({ error: 'Condition scoring failed: ' });
    }
});

// ── GET /api/cv/defect-history/:assetId ──────────────────────────────────────
router.get('/defect-history/:assetId', (req, res) => {
    try {
        const rows = logisticsDb.prepare(
            'SELECT * FROM asset_defect_observations WHERE AssetID = ? ORDER BY DetectedAt DESC LIMIT 20'
        ).all(req.params.assetId);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch defect history' }); }
});

// ── GET /api/cv/condition-score/:assetId ─────────────────────────────────────
router.get('/condition-score/:assetId', (req, res) => {
    try {
        const rows = logisticsDb.prepare(
            'SELECT * FROM asset_condition_scores WHERE AssetID = ? ORDER BY ScoredAt DESC LIMIT 5'
        ).all(req.params.assetId);
        if (!rows.length) return res.json({ score: null, condition: null, history: [] });
        const avg = Math.round(rows.reduce((s, r) => s + r.Score, 0) / rows.length);
        const SCORE_LABEL = avg >= 80 ? 'Good' : avg >= 50 ? 'Fair' : avg >= 25 ? 'Poor' : 'Critical';
        res.json({ score: avg, condition: SCORE_LABEL, history: rows });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch condition score' }); }
});

// ── GET /api/cv/ppe-stats ─────────────────────────────────────────────────────
router.get('/ppe-stats', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        let sql = `SELECT COUNT(*) AS total,
            SUM(CASE WHEN PersonVisible=1 THEN 1 ELSE 0 END) AS withPerson,
            SUM(CASE WHEN PersonVisible=1 AND HardHat=1 AND SafetyVest=1 THEN 1 ELSE 0 END) AS fullPPE,
            SUM(CASE WHEN PersonVisible=1 AND HardHat=0 THEN 1 ELSE 0 END) AS missingHardHat
            FROM ppe_photo_checks
            WHERE CheckedAt > datetime('now', '-30 days')`;
        const params = [];
        if (plantId) { sql += ' AND PlantID = ?'; params.push(plantId); }
        const stats = logisticsDb.prepare(sql).get(...params) || {};
        const compliancePct = stats.withPerson > 0 ? Math.round((stats.fullPPE / stats.withPerson) * 100) : null;
        res.json({ ...stats, compliancePct });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch PPE stats' }); }
});

module.exports = router;
