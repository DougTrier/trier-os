// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Audit Trail Middleware (Audit 47 / H-7 / TASK-08)
 * ============================================================
 * Guarantees that every successful /api/* mutation produces at least one
 * AuditLog entry, closing the coverage gap identified in Audit 47:
 * 67 DELETE endpoints across 41 route files, only 23 files previously
 * referenced logAudit.
 *
 * HOW IT WORKS
 * ------------
 * On every non-safe HTTP method (POST/PUT/PATCH/DELETE):
 *   1. Establish an AsyncLocalStorage context `{ audited: false }`.
 *   2. Run the rest of the handler chain inside that context.
 *   3. Any inline logAudit call inside the handler flips
 *      `store.audited = true` (see logistics_db.js:logAudit).
 *   4. When the response finishes with a 2xx status, emit a generic
 *      HTTP_MUTATION safety-net entry ONLY if nothing else logged.
 *
 * Route handlers that want to enrich the safety-net entry without doing
 * their own logAudit call can set:
 *   req._auditOverride = { action: 'DEVICE_ROLE_UPDATED', details: { ... } };
 * This is opportunistic — the middleware honors it if present, otherwise
 * falls back to method+path+status.
 *
 * SAFE METHODS (GET / HEAD / OPTIONS) are skipped entirely — read traffic
 * does not need an audit row per request.
 *
 * Non-2xx responses are also skipped. Failed mutations surface via the
 * error channel; auditing them here would add noise without new signal.
 */

'use strict';
const { logAudit, auditContext } = require('../logistics_db');

// HTTP methods that can mutate state. Anything else is treated as read-only.
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

module.exports = function auditTrailMiddleware(req, res, next) {
    if (!MUTATION_METHODS.has(req.method)) return next();

    const store = { audited: false };

    res.on('finish', () => {
        // Only log successful mutations. Client errors (4xx) and server
        // errors (5xx) don't need a safety-net audit row — a failed
        // mutation didn't change anything, and spam from bots hitting
        // 401/403 would flood the table.
        if (res.statusCode < 200 || res.statusCode >= 300) return;
        // If any inline logAudit call fired for this request, it already
        // recorded richer context than we could add. Stand down.
        if (store.audited) return;

        try {
            const override = req._auditOverride || {};
            const userId = req.user?.Username || 'unknown';
            const plantId = req.headers['x-plant-id'] || null;
            const action = override.action || 'HTTP_MUTATION';
            const details = {
                method: req.method,
                path: req.originalUrl || req.url || req.path,
                status: res.statusCode,
                ...(override.details || {}),
            };
            // Severity: DELETE is WARNING (destructive); everything else is INFO.
            // Callers can override via req._auditOverride.severity.
            const severity = override.severity || (req.method === 'DELETE' ? 'WARNING' : 'INFO');
            logAudit(userId, action, plantId, details, severity, req.ip);
        } catch (err) {
            // logAudit already swallows its own errors; this catch is a
            // belt-and-braces guard against serialization exceptions in
            // req._auditOverride.details.
            console.error('[auditTrail] Failed to emit safety-net entry:', err.message);
        }
    });

    auditContext.run(store, next);
};
