// Copyright © 2026 Trier OS. All Rights Reserved.

const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { logAudit, db: logisticsDb } = require('../logistics_db');
const crypto = require('crypto');

const SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/;

function writeAudit(action, plantId, user, details) {
    logAudit(user, action, plantId, details);
}

// GET /api/shift-handover/history?plantId=X
router.get('/history', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        if (!plantId || !SAFE_PLANT_ID.test(plantId)) {
            return res.status(400).json({ error: 'Invalid plant ID' });
        }

        const db = getDb(plantId);
        
        const limit = parseInt(req.query.limit, 10) || 50;
        const page = parseInt(req.query.page, 10) || 1;
        const offset = (page - 1) * limit;

        const handovers = db.prepare(`
            SELECT ID, PlantID, OutgoingTech, IncomingTech, ShiftDate, Notes, Status, CreatedAt
            FROM ShiftHandover
            ORDER BY CreatedAt DESC
            LIMIT ? OFFSET ?
        `).all(limit, offset);

        const totalRow = db.prepare('SELECT COUNT(*) as cnt FROM ShiftHandover').get();
        
        // Fetch items
        for (const h of handovers) {
            h.items = db.prepare(`
                SELECT ID, HandoverID, ItemType, RefID, Notes
                FROM ShiftHandoverItems
                WHERE HandoverID = ?
            `).all(h.ID);
        }

        res.json({
            data: handovers,
            meta: {
                total: totalRow.cnt,
                page,
                limit,
                totalPages: Math.ceil(totalRow.cnt / limit)
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/shift-handover/preview?plantId=X
// Returns what WOULD be auto-captured on POST / — no DB writes.
router.get('/preview', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];   
        if (!plantId || !SAFE_PLANT_ID.test(plantId)) {
            return res.status(400).json({ error: 'Invalid plant ID' });   
        }
        const techId = req.user.Username;
        const db = getDb(plantId);

        const preview = [];

        // Active WorkSegments — what this tech is doing right now        
        try {
            const activeSegments = db.prepare(`
                SELECT ws.segmentId, ws.woId, ws.startTime,
                       w.Description as woDescription, w.AstID
                FROM WorkSegments ws
                LEFT JOIN Work w ON ws.woId = w.WorkOrderNumber OR ws.woId = CAST(w.ID AS TEXT)
                WHERE ws.userId = ? AND ws.segmentState = 'Active'        
            `).all(techId);
            for (const seg of activeSegments) {
                preview.push({ itemType: 'active_segment', refId: seg.woId, notes: seg.woDescription || `Active since ${seg.startTime}` }); 
            }
        } catch (_) {}

        // Open/Hold WOs assigned to this tech
        try {
            const openWOs = db.prepare(`
                SELECT WorkOrderNumber, Description, holdReason, StatusID, ID
                FROM Work
                WHERE (AssignToID = ? OR UserID = ?)
                  AND StatusID NOT IN (40)
                  AND CompDate IS NULL
                LIMIT 15
            `).all(techId, techId);
            for (const wo of openWOs) {
                const type = wo.holdReason ? 'active_hold' : 'open_wo';   
                preview.push({ itemType: type, refId: wo.WorkOrderNumber || String(wo.ID), notes: wo.holdReason || wo.Description });
            }
        } catch (_) {}

        // Active Safety Permits (logistics DB)
        try {
            const permits = logisticsDb.prepare(`
                SELECT PermitNumber, Description FROM SafetyPermits       
                WHERE PlantID = ? AND Status = 'ACTIVE'
                LIMIT 10
            `).all(plantId);
            for (const p of permits) {
                preview.push({ itemType: 'safety_flag', refId: p.PermitNumber, notes: p.Description || 'Active Safety Permit' });        
            }
        } catch (_) {}

        // Active LOTO Permits (logistics DB)
        try {
            const lotos = logisticsDb.prepare(`
                SELECT PermitNumber, AssetDescription, Description, IssuedBy FROM LotoPermits
                WHERE PlantID = ? AND Status = 'ACTIVE'
                LIMIT 10
            `).all(plantId);
            for (const l of lotos) {
                preview.push({ itemType: 'loto_flag', refId: l.PermitNumber, notes: l.AssetDescription || l.Description || `LOTO issued by ${l.IssuedBy}` });
            }
        } catch (_) {}

        res.json({ items: preview, techId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/shift-handover
router.post('/', (req, res) => {
    try {
        const plantId = req.body.plantId || req.headers['x-plant-id'];
        if (!plantId || !SAFE_PLANT_ID.test(plantId)) {
            return res.status(400).json({ error: 'Invalid plant ID' });
        }

        const outgoingTech = req.user.Username; // S-2: Username from JWT, never body
        if (!outgoingTech) {
            return res.status(401).json({ error: 'Unauthorized: missing username in context' });
        }

        const notes = req.body.notes || '';
        const db = getDb(plantId);
        
        const handoverId = crypto.randomUUID();
        const shiftDate = new Date().toISOString();

        db.transaction(() => {
            db.prepare(`
                INSERT INTO ShiftHandover (ID, PlantID, OutgoingTech, ShiftDate, Notes, Status, CreatedAt)
                VALUES (?, ?, ?, ?, ?, 'PENDING_ACK', ?)
            `).run(handoverId, plantId, outgoingTech, shiftDate, notes, shiftDate);

            const insertItem = db.prepare(
                'INSERT INTO ShiftHandoverItems (ID, HandoverID, ItemType, RefID, Notes) VALUES (?, ?, ?, ?, ?)'
            );

            // Active WorkSegments
            try {
                const segs = db.prepare(`
                    SELECT ws.woId, ws.startTime, w.Description
                    FROM WorkSegments ws
                    LEFT JOIN Work w ON ws.woId = w.WorkOrderNumber OR ws.woId = CAST(w.ID AS TEXT)
                    WHERE ws.userId = ? AND ws.segmentState = 'Active'
                `).all(outgoingTech);
                for (const s of segs) {
                    insertItem.run(crypto.randomUUID(), handoverId, 'active_segment', s.woId, s.Description || `Active since ${s.startTime}`);
                }
            } catch (_) {}

            // Open/Hold WOs assigned to this tech
            try {
                const wos = db.prepare(`
                    SELECT WorkOrderNumber, Description, holdReason, ID
                    FROM Work
                    WHERE (AssignToID = ? OR UserID = ?)
                      AND StatusID NOT IN (40) AND CompDate IS NULL
                    LIMIT 15
                `).all(outgoingTech, outgoingTech);
                for (const wo of wos) {
                    const type = wo.holdReason ? 'active_hold' : 'open_wo';       
                    insertItem.run(crypto.randomUUID(), handoverId, type, wo.WorkOrderNumber || String(wo.ID), wo.holdReason || wo.Description);    
                }
            } catch (_) {}

            // Active Safety Permits
            try {
                const permits = logisticsDb.prepare(`
                    SELECT PermitNumber, Description FROM SafetyPermits
                    WHERE PlantID = ? AND Status = 'ACTIVE' LIMIT 10
                `).all(plantId);
                for (const p of permits) {
                    insertItem.run(crypto.randomUUID(), handoverId, 'safety_flag', p.PermitNumber, p.Description || 'Active Safety Permit');
                }
            } catch (_) {}

            // Active LOTO Permits
            try {
                const lotos = logisticsDb.prepare(`
                    SELECT PermitNumber, AssetDescription, Description, IssuedBy FROM LotoPermits
                    WHERE PlantID = ? AND Status = 'ACTIVE' LIMIT 10
                `).all(plantId);
                for (const l of lotos) {
                    insertItem.run(crypto.randomUUID(), handoverId, 'loto_flag', l.PermitNumber, l.AssetDescription || l.Description || `LOTO — ${l.IssuedBy}`);
                }
            } catch (_) {}
        })();

        writeAudit('SHIFT_HANDOVER_SUBMITTED', plantId, outgoingTech, { handoverId });

        res.json({ success: true, handoverId });

    } catch (err) {
        console.error('SHIFT HANDOVER ERROR:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/shift-handover/:id/acknowledge
router.post('/:id/acknowledge', (req, res) => {
    try {
        const plantId = req.body.plantId || req.headers['x-plant-id'];
        if (!plantId || !SAFE_PLANT_ID.test(plantId)) {
            return res.status(400).json({ error: 'Invalid plant ID' });
        }

        const incomingTech = req.user.Username;
        if (!incomingTech) {
            return res.status(401).json({ error: 'Unauthorized: missing username in context' });
        }

        const handoverId = req.params.id;
        const db = getDb(plantId);

        const result = db.prepare(`
            UPDATE ShiftHandover 
            SET IncomingTech = ?, Status = 'ACKNOWLEDGED'
            WHERE ID = ? AND Status = 'PENDING_ACK'
        `).run(incomingTech, handoverId);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Handover not found or already acknowledged' });
        }

        writeAudit('SHIFT_HANDOVER_ACKNOWLEDGED', plantId, incomingTech, { handoverId });

        res.json({ success: true, handoverId });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
