// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * guideRiskGate.js — Guided Execution Risk Gate Evaluator
 * =========================================================
 * Evaluates whether the current user is permitted to start a
 * workflow at a given risk level, and what confirmation behavior
 * is required. Returns a decision object — never navigates,
 * never modifies state, never performs any observable action.
 *
 * INVARIANT ENFORCED: I-GE4 — Context proves eligibility.
 * The risk gate runs before any navigation or instruction renders.
 * A blocked decision halts the workflow at the eligibility phase.
 *
 * SECURITY GATE: Guided Mode cannot elevate permissions.
 * The evaluator only reads the user's current role — it never
 * grants access that the user's role does not already have.
 * A workflow that requires a higher role is blocked with a clear
 * message, not degraded silently.
 *
 * -- KEY FUNCTIONS --------------------------------------------------
 *   evaluateRiskGate(risk, userRole)  — Returns a RiskDecision object
 */

/**
 * Minimum role required to start a workflow at each risk level.
 * An empty array means any authenticated user may proceed.
 * Order within each array is insignificant — membership is checked.
 */
const RISK_ROLE_REQUIREMENTS = {
    low: [],
    medium: [
        'technician', 'supervisor', 'manager',
        'maintenance_manager', 'plant_manager',
        'general_manager', 'it_admin', 'creator',
    ],
    high: [
        'supervisor', 'manager',
        'maintenance_manager', 'plant_manager',
        'general_manager', 'it_admin', 'creator',
    ],
    critical: ['it_admin', 'creator'],
};

/**
 * @typedef {Object} RiskDecision
 * @property {boolean}      allowed              — Whether the user may start the workflow
 * @property {boolean}      requiresConfirmation — Whether a confirmation modal must be shown
 * @property {string|null}  blockedReason        — i18n key if blocked; null if allowed
 */

/**
 * Evaluates whether a user role satisfies the workflow's risk requirements.
 * Called once at workflow start, before any navigation.
 *
 * @param {{ level: string, requiresConfirmation: boolean }} risk
 * @param {string} userRole
 * @returns {RiskDecision}
 */
export function evaluateRiskGate(risk, userRole) {
    const level    = risk?.level ?? 'low';
    const permitted = RISK_ROLE_REQUIREMENTS[level];

    if (!permitted) {
        // Unknown risk level — fail closed
        console.warn(`[guideRiskGate] Unknown risk level: "${level}" — blocking.`);
        return { allowed: false, requiresConfirmation: false, blockedReason: 'guide.error.unknownRiskLevel' };
    }

    const allowed = permitted.length === 0 || permitted.includes((userRole || '').toLowerCase());

    return {
        allowed,
        requiresConfirmation: allowed && (risk?.requiresConfirmation === true),
        blockedReason:        allowed ? null : 'guide.error.insufficientRole',
    };
}
