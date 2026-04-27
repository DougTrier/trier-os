// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * guideValidation.js — Guided Execution Validation Registry
 * ===========================================================
 * Maps string keys to pure validation functions. Every function
 * in this registry must be read-only, idempotent, and free of
 * side effects. No setState, no navigate, no fetch, no DOM writes.
 *
 * INVARIANT ENFORCED: I-GE3 — State proves completion.
 * A step advances only when its check function returns true.
 * A click event or navigation event is evidence, not proof.
 *
 * SECURITY GATE: Only keys registered here are callable by the engine.
 * The engine looks up keys at runtime — unknown keys fail closed.
 * Never call functions from schema content directly (no eval, no dynamic
 * import). The registry is the allowlist.
 *
 * STATE SOURCE: Validation functions read from window.__trierGuideContext,
 * which is published passively by WorkOrdersView and CloseOutWizard.
 * It is observability-only — the guide never writes to it.
 *
 * -- KEY FUNCTIONS --------------------------------------------------
 *   buildContext()       — Constructs the ValidationContext snapshot
 *   runCheck(key, ctx)   — Looks up key in registry, runs it, returns bool
 *   isRegistered(key)    — Returns true if key exists in the allowlist
 */

/**
 * @typedef {Object} ValidationContext
 * @property {{ selectedWorkOrder: object|null, activeModal: string|null,
 *              currentRoute: string, plantId: string|null,
 *              laborCount: number, partsCount: number,
 *              lastCloseoutResult: string|null }} state
 * @property {{ role: string, plantId: string|null }} user
 */

/** Builds a ValidationContext snapshot from observable sources. */
export function buildContext() {
    const g = window.__trierGuideContext || {};
    return {
        state: {
            selectedWorkOrder:  g.selectedWorkOrder  ?? null,
            activeModal:        g.activeModal        ?? null,
            currentRoute:       window.location.pathname,
            plantId:            localStorage.getItem('selectedPlantId') ?? null,
            laborCount:         g.laborCount         ?? 0,
            partsCount:         g.partsCount         ?? 0,
            lastCloseoutResult: g.lastCloseoutResult ?? null,
        },
        user: {
            role:    localStorage.getItem('userRole')        ?? '',
            plantId: localStorage.getItem('selectedPlantId') ?? null,
        },
    };
}

/**
 * Allowlisted validation functions.
 * Each receives a ValidationContext and returns a boolean.
 * @type {Record<string, (ctx: ValidationContext) => boolean>}
 */
const validationRegistry = {
    onJobsRoute:             (_ctx) => window.location.pathname === '/jobs',
    workOrderSelected:       (ctx)  => ctx.state.selectedWorkOrder != null,
    workOrderNotClosed:      (ctx)  => {
        const s = ctx.state.selectedWorkOrder?.StatusID;
        return s !== 40 && s !== '40' && String(s).toUpperCase() !== 'CLOSED';
    },
    closeoutWizardOpen:      (ctx)  => ctx.state.activeModal === 'closeout',
    closeoutLaborEntered:    (ctx)  => ctx.state.laborCount > 0,
    closeoutPartsAdded:      (ctx)  => ctx.state.partsCount > 0,
    closeoutSubmitSucceeded: (ctx)  => ctx.state.lastCloseoutResult === 'success',
    plantContextValid:       (ctx)  => ctx.state.plantId != null,
};

/**
 * Returns true if the given key is in the validation allowlist.
 * @param {string} key
 * @returns {boolean}
 */
export function isRegistered(key) {
    return Object.prototype.hasOwnProperty.call(validationRegistry, key);
}

/**
 * Runs a registered validation check by key.
 * Returns false (fail closed) if the key is not in the registry.
 * @param {string} key
 * @param {ValidationContext} ctx
 * @returns {boolean}
 */
export function runCheck(key, ctx) {
    if (!isRegistered(key)) {
        console.warn(`[guideValidation] Unknown check key: "${key}" — failing closed.`);
        return false;
    }
    try {
        return validationRegistry[key](ctx) === true;
    } catch (err) {
        console.warn(`[guideValidation] Check "${key}" threw — failing closed.`, err);
        return false;
    }
}
