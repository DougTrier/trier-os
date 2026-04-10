// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Trier OS — ERP Outbox Status & History API
 * ============================================
 * Read-only status and history for the ERP write-back outbox queue.
 * Mounted at /api/integrations/outbox in server/index.js.
 *
 * ENDPOINTS:
 *   GET  /summary    Counts by status (pending/sent/failed) + oldest pending age
 *   GET  /history    Recent outbox events with status, attempts, payload preview
 *   POST /retry/:id  Manually re-queue a failed event (resets Status='pending', NextRetryAt=now)
 *   DELETE /clear    Delete all sent events older than 7 days (housekeeping)
 */
'use strict';
const express = require('express');
const router  = express.Router();
const { db: logDb } = require('../logistics_db');

// ── GET /api/integrations/outbox/summary ─────────────────────────────────────
router.get('/summary', (req, res) => {
    try {
        const counts = logDb.prepare(`
            SELECT Status, COUNT(*) as n FROM ERPOutbox GROUP BY Status
        `).all();
        const summary = { pending: 0, sent: 0, failed: 0 };
        for (const r of counts) summary[r.Status] = r.n;

        const oldest = logDb.prepare(
            "SELECT MIN(CreatedAt) as v FROM ERPOutbox WHERE Status='pending'"
        ).get()?.v || null;

        res.json({ ...summary, oldestPending: oldest });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── GET /api/integrations/outbox/history ─────────────────────────────────────
router.get('/history', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        const limit   = Math.min(parseInt(req.query.limit) || 50, 200);
        const status  = req.query.status; // optional filter
        const where   = [];
        const params  = [];
        if (plantId && plantId !== 'all_sites') { where.push('PlantID = ?'); params.push(plantId); }
        if (status) { where.push('Status = ?'); params.push(status); }
        const sql = `
            SELECT ID, PlantID, IntegrationID, EventType,
                   substr(Payload, 1, 200) as PayloadPreview,
                   Status, Attempts, NextRetryAt, CreatedAt, SentAt
            FROM ERPOutbox
            ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
            ORDER BY CreatedAt DESC
            LIMIT ?
        `;
        const rows = logDb.prepare(sql).all(...params, limit);
        res.json({ rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── POST /api/integrations/outbox/retry/:id ───────────────────────────────────
router.post('/retry/:id', (req, res) => {
    try {
        const result = logDb.prepare(`
            UPDATE ERPOutbox SET Status='pending', Attempts=0, NextRetryAt=datetime('now')
            WHERE ID=? AND Status='failed'
        `).run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Event not found or not failed' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── DELETE /api/integrations/outbox/clear ────────────────────────────────────
router.delete('/clear', (req, res) => {
    try {
        const result = logDb.prepare(
            "DELETE FROM ERPOutbox WHERE Status='sent' AND SentAt < datetime('now', '-7 days')"
        ).run();
        res.json({ deleted: result.changes });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
