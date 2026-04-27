// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * guideContext.js — Guided Execution Context Resolver Registry
 * =============================================================
 * Resolves requiredContext[].source values to runtime data.
 * Called by the engine once during the eligibility check phase,
 * before a workflow starts. Results are frozen into an eligibility
 * snapshot — they are not re-read during workflow execution.
 *
 * INVARIANT ENFORCED: I-GE4 — Context proves eligibility.
 * If any required context key resolves to null, the engine blocks
 * before the first step. The guide never starts in an unverified state.
 *
 * RULES:
 *   - Resolvers are read-only: they never modify state, localStorage,
 *     or window.__trierGuideContext
 *   - window.__trierGuideContext is published by components passively
 *     (always, not only when Guided Mode is active) — treat as observability
 *   - All resolver functions are synchronous; async sources use the 'api'
 *     slot, which must complete before the eligibility gate runs
 *   - The guide reads context; it never fixes context
 *
 * -- KEY FUNCTIONS --------------------------------------------------
 *   resolveContext(source)   — Returns the resolver result for a source key
 *   resolveRequired(items)   — Resolves an array of { key, source } items,
 *                              returns { resolved: Record, missing: string[] }
 */

/**
 * @typedef {'session'|'selection'|'route'|'api'} ContextSource
 */

/**
 * @type {Record<ContextSource, () => Record<string, any>>}
 */
const contextResolverRegistry = {
    session: () => ({
        plantId:  localStorage.getItem('selectedPlantId') ?? null,
        userId:   localStorage.getItem('currentUser')     ?? null,
        userRole: localStorage.getItem('userRole')        ?? null,
    }),

    selection: () => {
        const g = window.__trierGuideContext || {};
        const wo = g.selectedWorkOrder ?? null;
        return {
            workOrderId:       wo?.ID ?? wo?.ID_INTERNAL ?? null,
            workOrderStatusId: wo?.StatusID     ?? null,
            assetId:           wo?.AstID        ?? null,
        };
    },

    route: () => ({
        currentRoute: window.location.pathname,
    }),

    // Reserved for async pre-fetch context required before workflow start.
    // Async resolvers must complete before the eligibility gate runs.
    api: () => ({}),
};

/**
 * Returns the resolved context object for a given source.
 * Returns an empty object for unknown sources (fail closed, no throw).
 * @param {ContextSource} source
 * @returns {Record<string, any>}
 */
export function resolveContext(source) {
    const resolver = contextResolverRegistry[source];
    if (!resolver) {
        console.warn(`[guideContext] Unknown source: "${source}" — returning empty context.`);
        return {};
    }
    try {
        return resolver();
    } catch (err) {
        console.warn(`[guideContext] Resolver for "${source}" threw — returning empty context.`, err);
        return {};
    }
}

/**
 * Resolves an array of { key, source } required context declarations.
 * Returns the merged resolved values and a list of keys that resolved to null.
 *
 * @param {Array<{ key: string, source: ContextSource }>} items
 * @returns {{ resolved: Record<string, any>, missing: string[] }}
 */
export function resolveRequired(items) {
    const resolved = {};
    const missing  = [];

    for (const { key, source } of items) {
        const data  = resolveContext(source);
        const value = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
        resolved[key] = value;
        if (value == null) missing.push(key);
    }

    return { resolved, missing };
}
