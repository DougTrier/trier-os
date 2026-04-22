// Trier OS — Shared hold-reason constants
// Used by both routes/scan.js (to set holdReason on WorkSegments) and
// silent_close_engine.js (to skip exempt segments during auto-close).
// Single source of truth — add new exempt reasons here only.

const EXEMPT_HOLD_REASONS = new Set([
    'WAITING_ON_PARTS',
    'WAITING_ON_VENDOR',
    'WAITING_ON_APPROVAL',
    'SCHEDULED_RETURN',
]);

module.exports = { EXEMPT_HOLD_REASONS };
