// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * guideNavigation.js — Guided Execution Navigation Resolver
 * ===========================================================
 * Validates workflow step routes against an allowlist and returns
 * the resolved path for the engine to navigate to. This module
 * never calls navigate() directly — navigation is performed by
 * the engine component via React Router's useNavigate() hook.
 *
 * WHY THIS EXISTS:
 * Schema routes are strings declared in guidedWorkflows.js. Without
 * validation, a malformed or injected route string could navigate
 * the user to an unintended path. The allowlist ensures only known,
 * legitimate app routes can be declared as step targets.
 *
 * SECURITY GATE:
 *   - Only routes in ROUTE_ALLOWLIST are resolvable
 *   - Unknown routes return { ok: false } — fail closed
 *   - The engine never navigates to a route that fails this check
 *   - No dynamic route construction from schema content
 *
 * -- KEY FUNCTIONS --------------------------------------------------
 *   resolveRoute(schemaRoute)   — Validates and returns the canonical path
 *   isOnRoute(route)            — Returns true if currently on the given route
 */

/**
 * All routes that workflow steps are permitted to navigate to.
 * Must match the React Router path strings in App.jsx exactly.
 * Add a route here only when the corresponding component has been
 * instrumented with data-guide anchors and validated in Playwright.
 */
const ROUTE_ALLOWLIST = new Set([
    '/jobs',
    '/assets',
    '/safety',
    '/parts',
    '/procedures',
    '/analytics',
    '/history',
    '/about',
    '/dashboard',
    '/fleet',
    '/tools',
    '/vendor-portal',
    '/engineering-tools',
]);

/**
 * @typedef {Object} RouteResolution
 * @property {boolean}     ok     — Whether the route is in the allowlist
 * @property {string}      [route] — The resolved path (present when ok: true)
 * @property {string}      [reason] — i18n error key (present when ok: false)
 */

/**
 * Validates a schema route string against the allowlist.
 * Returns the canonical path if valid, or a failure reason if not.
 *
 * @param {string} schemaRoute
 * @returns {RouteResolution}
 */
export function resolveRoute(schemaRoute) {
    if (!schemaRoute || typeof schemaRoute !== 'string') {
        return { ok: false, reason: 'guide.error.invalidRoute' };
    }

    const route = schemaRoute.startsWith('/') ? schemaRoute : `/${schemaRoute}`;

    if (!ROUTE_ALLOWLIST.has(route)) {
        console.warn(`[guideNavigation] Route not in allowlist: "${schemaRoute}" — failing closed.`);
        return { ok: false, reason: 'guide.error.routeNotAllowed' };
    }

    return { ok: true, route };
}

/**
 * Returns true if the browser is currently on the given route.
 * Compares pathname only — ignores query string and hash.
 *
 * @param {string} route
 * @returns {boolean}
 */
export function isOnRoute(route) {
    return window.location.pathname === route;
}
