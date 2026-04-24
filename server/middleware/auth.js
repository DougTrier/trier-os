// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Authentication & Authorization Middleware
 * ==============================================================
 * Guards ALL /api/* routes (mounted in index.js) with a 3-tier RBAC check:
 *   1. Enterprise Path Protection — Admin-only routes (backup, export, analytics)
 *   2. Plant Jail — Users cannot access plants they have no explicit role for
 *   3. Write Permissions — Non-GET methods require manager or technician role
 *
 * JWT_SECRET must be defined in .env or the server will REFUSE TO START.
 * This is intentional — fallback keys are a security anti-pattern.
 */
const jwt = require('jsonwebtoken');
const authDb = require('../auth_db');
const JWT_SECRET = process.env.JWT_SECRET;
const { isBackupAllowed } = require('../logistics_db');

// SECURITY: Hard crash if no JWT secret is configured.
// A running server without JWT validation is worse than no server at all.
if (!JWT_SECRET) {
    console.error('❌ FATAL ERROR: JWT_SECRET is not defined in environment variables.');
    console.error('   Security hardening prohibits fallback keys. Server shutting down.');
    process.exit(1);
}

// Explicit allowlist of auth routes that require no JWT.
// All other /auth/* routes (/auth/me, /auth/users/*, /auth/reset-password, etc.)
// have internal JWT checks and correctly flow through the middleware.
const PUBLIC_AUTH_ROUTES = new Set([
    'POST:/auth/login',
    'POST:/auth/verify-2fa',
    'POST:/auth/logout',
    'POST:/auth/register',
]);

module.exports = async (req, res, next) => {
    // Public Routes (Heavily Restricted)
    if (PUBLIC_AUTH_ROUTES.has(`${req.method}:${req.path}`)) return next();
    if (req.path === '/database/plants' && req.method === 'GET') return next();
    if (req.path.startsWith('/branding') && req.method === 'GET') return next(); // Logo & branding loads before login
    if (req.path.startsWith('/digital-twin/image') && req.method === 'GET') return next(); // Digital Twin schematics rendered in img tags
    // HA sync routes use their own sync-key auth (server-to-server)
    // SECURITY: Validate x-sync-key header securely in the generic middleware.
    if (req.path.startsWith('/ha/') || req.path.startsWith('/sync/replicate')) {
        if (req.headers['x-sync-key']) {
            const haSync = require('../ha_sync');
            if (haSync.validateSyncKey(req.headers['x-sync-key'])) {
                return next();
            } else {
                return res.status(403).json({ error: 'Security Violation: Invalid sync key.' });
            }
        }
    }

    let token = '';
    if (req.cookies?.authToken) {
        // Primary: httpOnly cookie — browser sessions (plant floor, corporate)
        token = req.cookies.authToken;
    } else {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            // Fallback: Bearer token — Power BI, http-edge-agent, HA sync agent
            token = authHeader.split(' ')[1];
        } else if (req.path === '/database/export' && req.query.token) {
            // Legacy: export download link with token in query string
            token = req.query.token;
        }
    }

    if (!token) return res.status(401).json({ error: 'Missing authorization token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Audit 47 / H-5: in-band session revocation via TokenVersion claim.
        // Password change, admin reset, and role edit bump Users.TokenVersion;
        // any token whose claim is below the current DB value is stale and
        // must be rejected. A deleted user (row missing) is also a 401 —
        // previously a deleted user's JWT remained honored until natural expiry.
        // Missing claim (pre-TokenVersion tokens) is treated as 0, matching the
        // default DB value — existing sessions remain valid until the first bump.
        const userRow = authDb.prepare('SELECT TokenVersion FROM Users WHERE UserID = ?').get(decoded.UserID);
        if (!userRow) {
            return res.status(401).json({ error: 'Account no longer exists' });
        }
        const claimVersion = Number(decoded.tokenVersion ?? 0);
        const currentVersion = Number(userRow.TokenVersion ?? 0);
        if (claimVersion < currentVersion) {
            return res.status(401).json({ error: 'Session invalidated — please log in again' });
        }

        req.user = decoded; // Contains parsed { UserID, Username, globalRole, plantRoles, nativePlantId }

        // Strict Read-Only Mode enforcement across foreign plants
        const activePlant = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const userRoles = req.user.plantRoles || {};
        const localRole = userRoles[activePlant] || userRoles['all_sites'];
        const globalRole = req.user.globalRole;

        const isITAdmin = globalRole === 'it_admin' || localRole === 'it_admin' || globalRole === 'creator';
        const MANAGER_ROLES = ['manager', 'plant_manager', 'general_manager', 'maintenance_manager'];
        const isManager = MANAGER_ROLES.includes(globalRole) || MANAGER_ROLES.includes(localRole);
        const isLocalTechnician = localRole === 'technician' || localRole === 'operator';

        // ── 1. Enterprise Path Protection ───────────────────────────────────
        // Sensitive administrative routes are for IT Admins, the Creator, or verified Backup Personnel
        const adminOnlyRoutes = ['/database/export', '/database/backup', '/analytics/narrative', '/ha/', '/gatekeeper'];
        if (adminOnlyRoutes.some(path => req.path.startsWith(path))) {
            const isBackupPath = req.path.startsWith('/database/export') || req.path.startsWith('/database/backup');
            const hasBackupPrivilege = isBackupPath && isBackupAllowed(req.user.Username);
            
            if (!isITAdmin && !hasBackupPrivilege) {
                return res.status(403).json({ error: 'Security Violation: Administrative access required.' });
            }
        }

        // ── 1b. Workforce Analytics Access Control ──────────────────────────
        // Only authorized management roles or users with explicit analytics flag
        if (req.path.startsWith('/work-orders/workforce-analytics')) {
            const canViewAnalytics = req.user.canViewAnalytics;
            const analyticsRole = ['general_manager', 'plant_manager', 'maintenance_manager'].includes(globalRole);
            if (!isITAdmin && !canViewAnalytics && !analyticsRole) {
                return res.status(403).json({ error: 'Access denied: Workforce Analytics requires a management role.' });
            }
        }

        // ── 2. "Plant Jail" Enforcement ─────────────────────────────────────
        // Unless you are an IT Admin, you CANNOT write data for a plant
        // that you don't have an explicit role for.
        // NOTE: GET (read) requests to scanner lookup routes are allowed for any
        // authenticated user — blocking reads causes "Communication Failure" on
        // the barcode scanner when a user scans at a plant they aren't assigned to.
        const scannerReadRoutes = ['/parts', '/assets', '/procedures', '/work-orders', '/v2/network'];
        const isScannerRead = req.method === 'GET' && scannerReadRoutes.some(r => req.path.startsWith(r));

        if (!isITAdmin) {
            if (activePlant === 'all_sites') {
                // To access the enterprise pool, you MUST have global access flags or management roles
                const hasGlobalPermission = req.user.globalAccess || req.user.canViewAnalytics || ['general_manager', 'plant_manager', 'maintenance_manager'].includes(globalRole);
                
                if (!hasGlobalPermission) {
                    if (req.method === 'GET') {
                        // Gracefully return empty data to prevent UI grid crashes
                        return res.json([]); 
                    } else {
                        return res.status(403).json({ error: 'Access Denied: You lack Enterprise rights.' });
                    }
                }
            } else if (!localRole && !isScannerRead) {
                // Block writes for users without a role at this plant.
                // For reads, return empty data silently — 403s produce unavoidable browser console noise
                // and "no role here" is semantically equivalent to "nothing to see" for a read.
                if (req.method === 'GET') {
                    return res.json([]);
                }
                return res.status(403).json({
                    error: `Access Denied: You do not have an authorized role at ${activePlant}.`
                });
            }
        }

        // ── 3. Write Permission Check ───────────────────────────────────────
        if (req.method !== 'GET' && !isITAdmin) {
            // Managers can write at their site, Techs can write at their site,
            // but those without roles (already caught) or read-only roles are blocked.
            if (!isManager && !isLocalTechnician) {
                return res.status(403).json({ error: 'RBAC Access Denied: Insufficient write-permissions.' });
            }
        }

        next();
    } catch (err) {
        console.error(`🔐 [Auth] Token rejected — ${req.path}`);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};
