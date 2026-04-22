// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * health.js — System Health & Degraded Mode API
 * ================================================
 * Aggregated health check for monitoring tools, ops teams, and load balancers.
 * Reports all subsystem status in a single structured response so a duty engineer
 * can understand the platform state with one API call.
 *
 * GET /api/health is pre-auth — no JWT required. Monitoring systems should poll
 * this endpoint to detect degraded state before users notice.
 * POST /api/health/mode requires admin role (JWT decoded manually since this
 * route is mounted before the auth middleware).
 *
 * -- ROUTES ----------------------------------------------------
 *   GET  /api/health        Full health report — all subsystems
 *   POST /api/health/mode   Set system mode (admin only)
 *
 * -- RESPONSE SHAPE -------------------------------------------
 *   {
 *     status:      'healthy' | 'degraded' | 'advisory_only' | 'isolated'
 *     mode:        current SystemMode
 *     uptime:      server uptime in seconds
 *     timestamp:   ISO timestamp of this check
 *     subsystems:  { db, integrations, license, memory }
 *   }
 */

'use strict';

const express   = require('express');
const router    = express.Router();
const jwt       = require('jsonwebtoken');
const degraded  = require('../middleware/degradedMode');
const integMgr  = require('../integrations/integration-manager');

// ── GET /api/health ───────────────────────────────────────────────────────────
// Pre-auth. Aggregates subsystem status and returns structured health report.
router.get('/', (req, res) => {
    const checks = {};

    // Audit 47 / M-6: this endpoint is pre-auth and reachable from the public
    // network. Returning raw e.message leaks file paths, SQLite error codes,
    // and Windows user directories to unauthenticated callers. Log the full
    // error server-side, expose only { status: 'error' } to clients.

    // ── DB connectivity (logistics_db is always available) ────────────────────
    try {
        const logDb = require('../logistics_db').db;
        logDb.prepare('SELECT 1').get();
        checks.db = { status: 'ok' };
    } catch (e) {
        console.error('[health] db probe failed:', e);
        checks.db = { status: 'error' };
    }

    // ── Integration workers ───────────────────────────────────────────────────
    try {
        const allWorkers = integMgr.getAllStatuses(); // returns {} when no workers running
        const workerKeys = Object.keys(allWorkers);
        const erroredWorkers = workerKeys.filter(k => allWorkers[k]?.lastError);
        checks.integrations = {
            status:       erroredWorkers.length > 0 ? 'degraded' : 'ok',
            activeWorkers: workerKeys.length,
            workers:      allWorkers,
            errors:       erroredWorkers.length,
        };
    } catch (e) {
        console.error('[health] integrations probe failed:', e);
        checks.integrations = { status: 'error' };
    }

    // ── Audit-log health (Audit 47 / L-3) ─────────────────────────────────────
    // Surfaces silent AuditLog write failures so monitoring catches them
    // before a compliance review uncovers missing entries.
    try {
        const { getAuditHealth } = require('../logistics_db');
        const ah = getAuditHealth();
        checks.audit = {
            status: ah.failed > 0 ? 'degraded' : 'ok',
            totalAttempted: ah.total,
            failed: ah.failed,
            lastFailureAt: ah.lastFailureAt,
        };
    } catch (e) {
        console.error('[health] audit probe failed:', e);
        checks.audit = { status: 'error' };
    }

    // ── Memory ────────────────────────────────────────────────────────────────
    const mem = process.memoryUsage();
    checks.memory = {
        status:     mem.heapUsed / mem.heapTotal > 0.90 ? 'warning' : 'ok',
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssM:       Math.round(mem.rss / 1024 / 1024),
    };

    // ── Overall status ────────────────────────────────────────────────────────
    const modeInfo  = degraded.getModeInfo();
    const anyError  = Object.values(checks).some(c => c.status === 'error');
    const anyWarn   = Object.values(checks).some(c => c.status === 'warning' || c.status === 'degraded');

    let overallStatus = 'healthy';
    if (modeInfo.mode === degraded.MODES.ISOLATED)      overallStatus = 'isolated';
    else if (modeInfo.mode === degraded.MODES.ADVISORY_ONLY) overallStatus = 'advisory_only';
    else if (anyError)  overallStatus = 'degraded';
    else if (anyWarn)   overallStatus = 'warning';

    res.json({
        status:     overallStatus,
        mode:       modeInfo,
        uptime:     Math.floor(process.uptime()),
        timestamp:  new Date().toISOString(),
        subsystems: checks,
    });
});

// ── POST /api/health/mode ─────────────────────────────────────────────────────
// Set system mode. Requires admin role — verified manually since this route
// is mounted before the auth middleware.
// Body: { mode: 'NORMAL' | 'ADVISORY_ONLY' | 'ISOLATED', reason?: string }
router.post('/mode', (req, res) => {
    // Manual JWT auth check — admin role required
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Admin token required to change system mode' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const role = (decoded.role || decoded.roles || '').toString().toLowerCase();
        if (!role.includes('admin') && !role.includes('creator')) {
            return res.status(403).json({ error: 'Admin or Creator role required to change system mode' });
        }

        const { mode, reason } = req.body;
        if (!mode) return res.status(400).json({ error: 'mode is required' });

        degraded.setMode(mode, reason || null, decoded.username || decoded.userId || 'admin');

        res.json({
            ok:   true,
            mode: degraded.getModeInfo(),
        });
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        res.status(500).json({ error: 'Mode change failed', detail: err.message });
    }
});

module.exports = router;
