// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * degradedMode.js — System Degraded Mode Middleware
 * ==================================================
 * Enforces system-level write restrictions based on the current operational mode.
 * Mounted on all /api/* routes after auth middleware. When mode is ADVISORY_ONLY
 * or ISOLATED, blocks POST/PUT/DELETE requests and returns 503 with a clear
 * explanation — so clients know the failure is intentional, not a server crash.
 *
 * MODES (see docs/p2/Degraded_Mode_Spec.md for full spec):
 *   NORMAL        All systems healthy — full read/write allowed
 *   ADVISORY_ONLY Anomaly or Gatekeeper unavailable — writes blocked
 *   ISOLATED      Connector failure — external connectors cut, local reads only
 *   OFFLINE       Process crash — managed by external watchdog (not set in-process)
 *
 * Mode is stored in-process (resets to NORMAL on restart). This is intentional:
 * if the server crashes and restarts, it comes back in NORMAL to allow recovery
 * operations. Manual downgrade to ADVISORY_ONLY is always available via
 * POST /api/health/mode (admin role required).
 *
 * -- ALWAYS-ALLOWED PATHS (bypass degraded mode check) ---------
 *   /auth/*        Login/logout must work regardless of mode
 *   /health/*      Mode control itself must always be accessible
 *   /ping          Monitoring endpoint
 *   GET  requests  Reads are always allowed — advisory means no writes
 */

'use strict';

const cluster = require('cluster');

// ── System Mode Singleton ─────────────────────────────────────────────────────

const MODES = {
    NORMAL:        'NORMAL',
    ADVISORY_ONLY: 'ADVISORY_ONLY',
    ISOLATED:      'ISOLATED',
};

let _currentMode    = MODES.NORMAL;
let _modeSince      = new Date().toISOString();
let _modeReason     = null;
let _modeSetBy      = 'system'; // 'system' or username

function getMode() {
    return _currentMode;
}

function getModeInfo() {
    return {
        mode:    _currentMode,
        since:   _modeSince,
        reason:  _modeReason,
        setBy:   _modeSetBy,
        writesBlocked: _currentMode !== MODES.NORMAL,
    };
}

// Internal: apply mode change to this process's state only (no broadcast).
function _applyMode(mode, reason, setBy) {
    const prev = _currentMode;
    _currentMode = mode;
    _modeSince   = new Date().toISOString();
    _modeReason  = reason;
    _modeSetBy   = setBy;
    console.log(`[DegradedMode] Mode changed: ${prev} → ${mode} (by ${setBy}${reason ? ': ' + reason : ''})`);
}

/**
 * Set the system mode. Called by the health route on admin request,
 * or internally when a subsystem anomaly is detected.
 * In cluster mode, broadcasts the change to all sibling workers via the primary.
 * @param {string} mode   One of MODES values
 * @param {string} reason Human-readable reason string
 * @param {string} setBy  Username or 'system'
 */
function setMode(mode, reason = null, setBy = 'system') {
    if (!MODES[mode]) {
        throw new Error(`Unknown mode: ${mode}. Valid: ${Object.keys(MODES).join(', ')}`);
    }
    _applyMode(mode, reason, setBy);
    // In cluster mode, ask the primary to relay the change to all other workers.
    if (cluster.isWorker) {
        process.send({ type: 'DEGRADED_MODE_SYNC', mode, reason, setBy });
    }
}

// Listen for mode broadcasts relayed from the primary (worker side only).
if (cluster.isWorker) {
    process.on('message', (msg) => {
        if (msg && msg.type === 'DEGRADED_MODE_SYNC' && MODES[msg.mode]) {
            _applyMode(msg.mode, msg.reason || null, msg.setBy || 'system');
        }
    });
}

// ── Paths that bypass the write block ────────────────────────────────────────
const ALWAYS_ALLOW_PREFIXES = ['/auth', '/health', '/ping'];

/**
 * Express middleware. Blocks writes when mode is ADVISORY_ONLY or ISOLATED.
 * Always mounted AFTER auth middleware so req.user is populated.
 */
function degradedModeMiddleware(req, res, next) {
    // Only act when writes are blocked
    if (_currentMode === MODES.NORMAL) return next();

    // GET requests (reads) are always allowed
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

    // Whitelisted paths always pass through
    const shortPath = req.path; // path relative to /api mount point
    if (ALWAYS_ALLOW_PREFIXES.some(p => shortPath.startsWith(p))) return next();

    // Block the write with a clear, machine-readable response
    return res.status(503).json({
        error: 'System is in read-only mode',
        mode:  _currentMode,
        since: _modeSince,
        reason: _modeReason || 'System degraded — writes suspended pending review',
        retryAfter: 'Check GET /api/health for current status',
    });
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = degradedModeMiddleware;
module.exports.MODES     = MODES;
module.exports.getMode   = getMode;
module.exports.getModeInfo = getModeInfo;
module.exports.setMode   = setMode;
