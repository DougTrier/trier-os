// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * gatekeeper_audit.js — Gatekeeper Audit Ledger API
 * ===================================================
 * Read-only access to the GatekeeperAuditLedger. All writes go through
 * writeAuditRecord (server/gatekeeper/audit.js) — this route is query-only.
 * Requires authenticated admin session.
 *
 * ROUTES:
 *   GET /api/gatekeeper/audit              — List audit records with filters + pagination
 *   GET /api/gatekeeper/audit/integrity    — Verify ledger triggers and report record count
 *   GET /api/gatekeeper/audit/:id          — Single ledger record by LedgerID
 */

const express = require('express');
const router = express.Router();
const logisticsDb = require('../logistics_db').db;

router.get('/audit/integrity', (req, res) => {
    try {
        const triggers = logisticsDb.prepare(`
            SELECT name FROM sqlite_master
            WHERE type = 'trigger'
              AND name IN ('prevent_audit_update', 'prevent_audit_delete')
        `).all();

        const triggerNames = triggers.map(t => t.name);
        const triggersPresent =
            triggerNames.includes('prevent_audit_update') &&
            triggerNames.includes('prevent_audit_delete');

        const stats = logisticsDb.prepare(`
            SELECT
                COUNT(*) AS totalRecords,
                MIN(LedgerID) AS minId,
                MAX(LedgerID) AS maxId
            FROM GatekeeperAuditLedger
        `).get();

        const totalRecords = stats.totalRecords || 0;
        const minId = stats.minId || 0;
        const maxId = stats.maxId || 0;

        res.json({
            triggersPresent,
            triggers: triggerNames,
            totalRecords,
            minId,
            maxId,
            integrityStatus: triggersPresent ? 'OK' : 'DEGRADED'
        });
    } catch (err) {
        console.error('[AUDIT API] Integrity error:', err);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
});

router.get('/audit/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id || id < 1) {
            return res.status(400).json({ error: 'Invalid LedgerID' });
        }

        const record = logisticsDb.prepare(`
            SELECT g.*, p.CertHash, p.Certified, p.ConstraintsPassed, p.ConstraintsFailed, p.CausalExplanation
            FROM GatekeeperAuditLedger g
            LEFT JOIN ProofReceipts p ON p.RequestID = g.RequestID
            WHERE g.LedgerID = ?
        `).get(id);
        if (!record) {
            return res.status(404).json({ error: 'Record not found' });
        }

        res.json(record);
    } catch (err) {
        console.error('[AUDIT API] Get by ID error:', err);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
});

router.get('/audit/receipt/:requestId', (req, res) => {
    try {
        const requestId = req.params.requestId;
        if (!requestId) {
            return res.status(400).json({ error: 'Invalid RequestID' });
        }

        const record = logisticsDb.prepare('SELECT * FROM ProofReceipts WHERE RequestID = ?').get(requestId);
        if (!record) {
            return res.status(404).json({ error: 'Receipt not found' });
        }

        res.json(record);
    } catch (err) {
        console.error('[AUDIT API] Get receipt error:', err);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
});

router.post('/audit/verify', (req, res) => {
    try {
        const { hash } = req.body;
        if (!hash || typeof hash !== 'string') {
            return res.status(400).json({ error: 'Invalid hash provided' });
        }

        const cleanHash = hash.trim();
        const record = logisticsDb.prepare(`
            SELECT p.*, g.Timestamp, g.ActionType, g.Username
            FROM ProofReceipts p
            JOIN GatekeeperAuditLedger g ON p.RequestID = g.RequestID
            WHERE p.CertHash = ?
        `).get(cleanHash);

        if (!record) {
            return res.json({ valid: false, message: 'Hash not found in immutable ledger.' });
        }

        res.json({
            valid: true,
            message: 'Cryptographic receipt verified.',
            details: record
        });
    } catch (err) {
        console.error('[AUDIT API] Verify error:', err);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
});

router.get('/audit', (req, res) => {
    try {
        const { plantId, userId, actionType, validationResult, from, to } = req.query;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;

        let baseQuery = ' FROM GatekeeperAuditLedger g LEFT JOIN ProofReceipts p ON p.RequestID = g.RequestID WHERE 1=1';
        const params = [];

        if (plantId) {
            baseQuery += ' AND g.PlantID = ?';
            params.push(plantId);
        }
        if (userId) {
            baseQuery += ' AND g.UserID = ?';
            params.push(userId);
        }
        if (actionType) {
            baseQuery += ' AND g.ActionType = ?';
            params.push(actionType);
        }
        if (validationResult) {
            baseQuery += ' AND g.ValidationResult = ?';
            params.push(validationResult);
        }
        if (from) {
            baseQuery += ' AND g.Timestamp >= ?';
            params.push(from);
        }
        if (to) {
            baseQuery += ' AND g.Timestamp <= ?';
            params.push(to);
        }

        const countStmt = logisticsDb.prepare(`SELECT COUNT(*) AS total ${baseQuery}`);
        const total = countStmt.get(...params).total;

        const recordsStmt = logisticsDb.prepare(`
            SELECT g.*, p.CertHash, p.Certified, p.ConstraintsPassed, p.ConstraintsFailed, p.CausalExplanation ${baseQuery}
            ORDER BY LedgerID DESC
            LIMIT ? OFFSET ?
        `);
        const records = recordsStmt.all(...params, limit, offset);

        res.json({
            records,
            total,
            limit,
            offset
        });

    } catch (err) {
        console.error('[AUDIT API] List error:', err);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
