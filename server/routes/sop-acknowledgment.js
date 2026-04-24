// Copyright © 2026 Trier OS. All Rights Reserved.

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../database');
const { logAudit } = require('../logistics_db');

const SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/;

// GET /api/sop-acknowledgment/pending?plantId=X
router.get('/pending', (req, res) => {
    try {
        const { plantId } = req.query;
        if (!plantId || !SAFE_PLANT_ID.test(plantId)) return res.status(400).json({ error: 'Invalid plant ID' });

        const plantDb = getDb(plantId);
        const techId = req.user.Username;
        
        const pendingSOPs = plantDb.prepare(`
            SELECT DISTINCT p.ID, p.ProcedureCode, p.Descript, p.Updated
            FROM Work w
            JOIN ProcObj po ON po.ObjID = w.AstID
            JOIN Procedures p ON p.ID = po.ProcID
            WHERE w.AssignToID = ? 
              AND (w.StatusID IS NULL OR w.StatusID NOT IN ('COMPLETED', 'CLOSED', 'CANCELED', '99'))
              AND p.SOPAcknowledgmentRequired = 1
              AND p.ID NOT IN (
                  SELECT ProcedureID FROM SOPAcknowledgments WHERE TechID = ?
              )
        `).all(techId, techId);
        
        res.json(pendingSOPs);
    } catch (err) {
        console.error('[sop-ack] GET /pending error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sop-acknowledgment/:procId/acknowledge
router.post('/:procId/acknowledge', (req, res) => {
    try {
        const { plantId, mocId } = req.body;
        if (!plantId || !SAFE_PLANT_ID.test(plantId)) return res.status(400).json({ error: 'Invalid plant ID' });

        const plantDb = getDb(plantId);
        const techId = req.user.Username;
        const procId = req.params.procId;
        const id = crypto.randomUUID();

        const proc = plantDb.prepare('SELECT Updated FROM Procedures WHERE ID = ?').get(procId);
        if (!proc) return res.status(404).json({ error: 'Procedure not found' });

        plantDb.prepare(`
            INSERT INTO SOPAcknowledgments (ID, ProcedureID, TechID, SOPVersion, MOC_ID, AcknowledgedAt)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, procId, techId, proc.Updated || null, mocId || null, new Date().toISOString());

        logAudit(req.user.Username, 'SOP_ACKNOWLEDGED', plantId, { procId, techId, mocId });
        
        res.json({ ok: true });
    } catch (err) {
        console.error('[sop-ack] POST /:procId/acknowledge error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sop-acknowledgment/compliance
router.get('/compliance', (req, res) => {
    try {
        const { plantId } = req.query;
        if (!plantId || !SAFE_PLANT_ID.test(plantId)) return res.status(400).json({ error: 'Invalid plant ID' });

        const plantDb = getDb(plantId);

        const requiredSOPs = plantDb.prepare(`
            SELECT p.ID, p.Descript, p.ProcedureCode
            FROM Procedures p
            WHERE p.SOPAcknowledgmentRequired = 1
        `).all();
        
        const acks = plantDb.prepare(`
            SELECT ProcedureID, TechID, AcknowledgedAt
            FROM SOPAcknowledgments
        `).all();
        
        res.json({ requiredSOPs, acks });
    } catch (err) {
        console.error('[sop-ack] GET /compliance error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
