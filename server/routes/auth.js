// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Authentication & User Management API
 * ========================================================
 * Handles user login, registration, password management, and
 * role-based access control (RBAC). Uses trier_auth.db for
 * credential storage with bcrypt password hashing.
 *
 * ENDPOINTS:
 *   POST /login               JWT token issuance (LDAP-first or local bcrypt)
 *   POST /verify-2fa          Complete TOTP 2FA for the Creator account
 *   POST /register            New user self-registration (invite code or plant password)
 *   POST /reset-password      Admin/Creator: force-reset another user's password
 *   POST /change-password     Self-service or admin password change
 *   GET  /users/list          User directory with roles (IT Admin / Creator only)
 *   POST /users/update-access Update role, permissions, and plant assignments
 *   POST /users/create        Admin-initiated user creation with MustChangePassword=1
 *   POST /users/delete        Delete user (Creator cannot be deleted by others)
 *
 * LDAP-FIRST AUTH FLOW: Non-protected accounts attempt LDAP bind first (if
 * configured in AdminConsole -> Settings -> LDAP). On LDAP success, the user is
 * auto-created/upserted locally and a JWT is issued. On LDAP failure, the system
 * falls back to local bcrypt auth. Protected accounts (admin [ID:3], it_admin, trier)
 * always bypass LDAP and use local auth only.
 *
 * TOTP 2FA: The Creator account supports optional TOTP enforcement via
 * AdminConsole -> Creator Console. When enabled, login issues a short-lived
 * pre-auth token (5-min expiry, {pre2fa: true}). The client must POST that
 * token + a 6-digit TOTP code to /verify-2fa to receive a full session token.
 * TOTP secret is stored AES-256-GCM encrypted in logistics_db.creator_settings.
 *
 * JWT CLAIMS (payload fields in every token):
 *   UserID, Username, globalRole, plantRoles{plantId: role},
 *   nativePlantId, canAccessDashboard, globalAccess, canImport,
 *   canSAP, canSensorConfig, canSensorThresholds, canSensorView, canViewAnalytics
 *
 * SECURITY: Rate limiting is applied in server/index.js (5 attempts/15 min per IP).
 * Passwords are hashed with bcrypt (10 rounds). Temp passwords on admin-created
 * accounts are cryptographically random (crypto.randomBytes). LDAP search filter
 * inputs are escaped per RFC 4515 to prevent LDAP injection attacks.
 *
 * USER DELETION GUARDS:
 *   - Creator (Doug Trier) cannot be deleted by any other user
 *   - Creator can only self-delete with explicit confirmSelfDelete flag
 *   - Users cannot delete their own non-Creator accounts
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authDb = require('../auth_db');
const crypto = require('crypto');
const { db: logDb, logAudit } = require('../logistics_db');
const { validatePassword } = require('../validators');

const JWT_SECRET = process.env.JWT_SECRET;

// Audit 47 / M-17: out-of-band notifications for admin-initiated credential
// mutations. Email delivery is best-effort — sendEmail returns a structured
// { success: false } when SMTP is not configured, so non-configured
// deployments see no behavior change.
function _notifyUserOfAccountChange(targetUserRow, { action, adminUsername, ip }) {
    try {
        if (!targetUserRow?.Email) return; // nothing to notify
        const { sendEmail, buildEmailHtml } = require('../email_service');
        const when = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CST';
        const subject = action === 'PASSWORD_RESET'
            ? 'Your Trier OS password was reset'
            : 'Your Trier OS access was updated';
        const headline = action === 'PASSWORD_RESET'
            ? 'Password reset by an administrator'
            : 'Access / role updated by an administrator';
        const body = `
            <p>${headline} on your Trier OS account.</p>
            <ul>
                <li><strong>Administrator:</strong> ${adminUsername || 'unknown'}</li>
                <li><strong>When:</strong> ${when}</li>
                <li><strong>Source IP:</strong> ${ip || 'unknown'}</li>
            </ul>
            <p>If you did not expect this change, contact your security team immediately.</p>
        `;
        // Fire-and-forget — do not await, do not block the admin response.
        Promise.resolve()
            .then(() => sendEmail(targetUserRow.Email, subject, buildEmailHtml(subject, body, '#f59e0b'), action))
            .catch(err => console.warn('[Auth] Notify email failed:', err.message));
    } catch (e) {
        console.warn('[Auth] Notify helper error:', e.message);
    }
}

// ── RBAC Login Logic ─────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    const username = req.body.username || req.body.plantId;
    const password = req.body.password;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    // ── LDAP-First Authentication (Task 3.3) ──
    // Protected accounts ALWAYS use local auth, regardless of LDAP status
    // SYSTEM LOCK: admin (UserID 3) always uses local auth — never delegated to LDAP
    const protectedAccounts = ['admin', 'it_admin', 'trier'];
    const isProtected = protectedAccounts.includes(username);

    if (!isProtected) {
        try {
            const ldapConfig = authDb.prepare('SELECT * FROM ldap_config WHERE ID = 1').get();
            if (ldapConfig && ldapConfig.Enabled === 1 && ldapConfig.Host) {
                const ldapResult = await attemptLdapAuth(ldapConfig, username, password);
                if (ldapResult.success) {
                    // LDAP auth succeeded — upsert user locally and issue JWT
                    let user = authDb.prepare('SELECT * FROM Users WHERE Username = ?').get(username);
                    if (!user) {
                        // Auto-create local user from LDAP
                        const hash = await bcrypt.hash('LDAP_MANAGED_' + Date.now(), 10);
                        const role = ldapResult.role || 'technician';
                        const result = authDb.prepare(`
                            INSERT INTO Users (Username, PasswordHash, DefaultRole, MustChangePassword, DisplayName, Email)
                            VALUES (?, ?, ?, 0, ?, ?)
                        `).run(username, hash, role, ldapResult.displayName || username, ldapResult.email || '');
                        authDb.prepare("INSERT OR IGNORE INTO UserPlantRoles (UserID, PlantID, RoleLevel) VALUES (?, 'all_sites', ?)").run(result.lastInsertRowid, role);
                        user = authDb.prepare('SELECT * FROM Users WHERE Username = ?').get(username);
                    }
                    // Issue JWT (same as local auth path below)
                    return issueJWT(user, req, res);
                }
                // LDAP auth failed — fall through to local auth
                console.log(`[LDAP] Auth failed for ${username}, falling back to local auth`);
            }
        } catch (ldapErr) {
            console.error('[LDAP] Auth error, falling back to local:', ldapErr.message);
        }
    }

    // ── Standard Local Auth ──
    let user = authDb.prepare('SELECT * FROM Users WHERE Username = ?').get(username);

    if (!user) {
        user = authDb.prepare('SELECT * FROM Users WHERE Username = ?').get(`${username.toLowerCase()}_user`);
    }

    if (!user) {
        logAudit(username, 'LOGIN_FAILURE', null, { reason: 'User not found' }, 'WARNING', req.ip);
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (await bcrypt.compare(password, user.PasswordHash)) {
        // ── TOTP 2FA Challenge for Creator ──
        if (user.Username === 'creator') {
            try {
                const enforced = logDb.prepare("SELECT Value FROM creator_settings WHERE Key = 'twofa_enforced'").get();
                if (enforced?.Value === '1') {
                    const preAuthToken = jwt.sign(
                        { UserID: user.UserID, Username: user.Username, pre2fa: true },
                        JWT_SECRET,
                        { expiresIn: '5m' }
                    );

                    logAudit('creator', 'LOGIN_2FA_CHALLENGED', null, {}, 'INFO', req.ip);
                    return res.json({
                        requires2FA: true,
                        preAuthToken,
                        message: 'Enter the 6-digit code from your authenticator app.'
                    });
                }
            } catch (e) {
                console.error('[2FA] Check failed, proceeding without 2FA:', e.message);
            }
        }
        return issueJWT(user, req, res);
    } else {
        logAudit(username, 'LOGIN_FAILURE', null, { reason: 'Invalid password' }, 'WARNING', req.ip);
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Audit 47 / M-3: per-pre-auth-token attempt counter to block TOTP brute force.
// A pre-auth token is valid for 5 minutes and there are 1,000,000 possible
// 6-digit codes — without a counter an attacker who obtained a pre-auth token
// could exhaust the entire code space inside the window.
//
// The Map key is a SHA-256 hash of the pre-auth token (we don't keep the raw
// token in memory). After MAX_2FA_ATTEMPTS failures the hash is blacklisted and
// the matching token is rejected until its natural JWT expiry. A successful
// verify deletes the counter. A periodic sweep bounds memory by purging entries
// older than 10 minutes (pre-auth tokens expire at 5 min, so 10 min is a safe
// upper bound).
const MAX_2FA_ATTEMPTS = 5;
const preAuth2faAttempts = new Map();
function _preAuthKey(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
setInterval(() => {
    const now = Date.now();
    for (const [key, rec] of preAuth2faAttempts) {
        if (now - rec.firstSeen > 10 * 60 * 1000) preAuth2faAttempts.delete(key);
    }
}, 5 * 60 * 1000).unref?.();

// ── TOTP 2FA Verification Endpoint ──
router.post('/verify-2fa', async (req, res) => {
    const { preAuthToken, code } = req.body;
    if (!preAuthToken || !code) {
        return res.status(400).json({ error: 'Pre-auth token and authenticator code required' });
    }

    // Rate-limit check runs BEFORE any JWT / TOTP work so a blacklisted token
    // gets a cheap rejection.
    const attemptKey = _preAuthKey(preAuthToken);
    const attemptRec = preAuth2faAttempts.get(attemptKey);
    if (attemptRec && attemptRec.attempts >= MAX_2FA_ATTEMPTS) {
        logAudit('creator', 'LOGIN_2FA_BLOCKED', null, { reason: 'Attempt limit exceeded' }, 'WARNING', req.ip);
        return res.status(429).json({ error: 'Too many failed 2FA attempts. Log in again to request a fresh code.' });
    }

    try {
        const decoded = jwt.verify(preAuthToken, JWT_SECRET);
        if (!decoded.pre2fa || decoded.Username !== 'creator') {
            return res.status(403).json({ error: 'Invalid pre-auth token' });
        }

        const ALGO = 'aes-256-gcm';
        if (!JWT_SECRET) return res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET is required for 2FA.' });
        const encKey = crypto.createHash('sha256').update(JWT_SECRET).digest();
        function dec(data) {
            const parts = data.split(':');
            const iv = Buffer.from(parts[0], 'hex');
            const tag = Buffer.from(parts[1], 'hex');
            const d = crypto.createDecipheriv(ALGO, encKey, iv);
            d.setAuthTag(tag);
            let r = d.update(parts[2], 'hex', 'utf8');
            r += d.final('utf8');
            return r;
        }

        const secretRow = logDb.prepare("SELECT Value FROM creator_settings WHERE Key = 'totp_secret'").get();
        if (!secretRow) {
            return res.status(400).json({ error: 'TOTP not configured. Set up 2FA in System Console first.' });
        }

        const OTPAuth = require('otpauth');
        const secretBase32 = dec(secretRow.Value);
        const totp = new OTPAuth.TOTP({
            issuer: 'Trier OS',
            label: 'creator',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(secretBase32)
        });

        const delta = totp.validate({ token: code, window: 1 });
        if (delta === null) {
            // Record the miss against this pre-auth token.
            const rec = preAuth2faAttempts.get(attemptKey) || { attempts: 0, firstSeen: Date.now() };
            rec.attempts += 1;
            preAuth2faAttempts.set(attemptKey, rec);
            const remaining = Math.max(0, MAX_2FA_ATTEMPTS - rec.attempts);
            logAudit('creator', 'LOGIN_2FA_FAILED', null, { reason: 'Invalid TOTP code', attempts: rec.attempts, remaining }, 'WARNING', req.ip);
            return res.status(401).json({ error: 'Invalid authenticator code. Check your app and try again.' });
        }

        // Audit 47 / M-2: TOTP codes are valid for ~60 s (current window + one
        // adjacent) and otpauth doesn't track used codes. Without a replay
        // cache, a captured code could be re-used multiple times inside the
        // window. Track the last successfully-consumed { delta, at } in
        // creator_settings; reject the same delta if presented again within
        // 90 s.
        try {
            const lastRow = logDb.prepare("SELECT Value FROM creator_settings WHERE Key = 'totp_last_delta'").get();
            const last = lastRow?.Value ? JSON.parse(lastRow.Value) : null;
            if (last && last.delta === delta && (Date.now() - last.at) < 90_000) {
                logAudit('creator', 'LOGIN_2FA_REPLAY_REJECTED', null, { delta }, 'WARNING', req.ip);
                return res.status(401).json({ error: 'This code was already used. Wait for the next one in your authenticator app.' });
            }
            logDb.prepare(
                "INSERT OR REPLACE INTO creator_settings (Key, Value, UpdatedAt) VALUES ('totp_last_delta', ?, datetime('now'))"
            ).run(JSON.stringify({ delta, at: Date.now() }));
        } catch (replayErr) {
            // Replay cache is best-effort — log and continue. A broken cache
            // reverts to the previous (non-replay-guarded) behavior rather
            // than locking the creator out.
            console.warn('[2FA] Replay cache update failed:', replayErr.message);
        }

        const user = authDb.prepare('SELECT * FROM Users WHERE UserID = ?').get(decoded.UserID);
        if (!user) return res.status(404).json({ error: 'User account not found' });

        // Success — clear the attempt counter so a retry after legitimate
        // typos doesn't penalize the user.
        preAuth2faAttempts.delete(attemptKey);

        logAudit('creator', 'LOGIN_2FA_SUCCESS', null, {}, 'INFO', req.ip);
        return issueJWT(user, req, res);
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired pre-auth token' });
    }
});

// ── Helper: Issue JWT token ──
// Task 2.1: Sets the token as an httpOnly cookie instead of returning it in the body.
// The user profile fields are still returned so the frontend can build its session state.
// Bearer header fallback preserved in middleware for API integrations (Power BI, edge agents).
function issueJWT(user, req, res) {
    const rolesQuery = authDb.prepare('SELECT PlantID, RoleLevel FROM UserPlantRoles WHERE UserID = ?').all(user.UserID);
    const plantRoles = {};
    rolesQuery.forEach(r => { plantRoles[r.PlantID] = r.RoleLevel; });

    const homePlant = rolesQuery.find(r => r.PlantID !== 'all_sites')?.PlantID || null;

    // Look up the LAN hub IP for the user's home plant — cached by PWA for offline use
    let hubIp = null;
    if (homePlant) {
        try {
            const plantCfg = logDb.prepare('SELECT HubIp FROM PlantConfiguration WHERE PlantID = ?').get(homePlant);
            hubIp = plantCfg?.HubIp || null;
        } catch (_) {}
    }

    // Hub token — stored in localStorage (not httpOnly) so the PWA can pass it
    // as a WebSocket query param when connecting to the LAN hub offline.
    // Signed with HUB_TOKEN_SECRET (required, distinct from JWT_SECRET — enforced
    // at boot in index.js) so a stolen localStorage token cannot be replayed
    // against the main API. Minimal claims only: identity + plant, no roles.
    const HUB_TOKEN_SECRET = process.env.HUB_TOKEN_SECRET;
    const hubToken = jwt.sign(
        { UserID: user.UserID, Username: user.Username, nativePlantId: homePlant },
        HUB_TOKEN_SECRET,
        { expiresIn: '24h' }
    );

    const token = jwt.sign(
        {
            UserID: user.UserID,
            Username: user.Username,
            globalRole: user.DefaultRole,
            plantRoles: plantRoles,
            nativePlantId: homePlant,
            canAccessDashboard: user.CanAccessDashboard === 1,
            globalAccess: user.GlobalAccess === 1,
            canImport: user.CanImport === 1,
            canSAP: user.CanSAP === 1,
            canSensorConfig: user.CanSensorConfig === 1,
            canSensorThresholds: user.CanSensorThresholds === 1,
            canSensorView: user.CanSensorView === 1,
            canViewAnalytics: user.CanViewAnalytics === 1,
            // Audit 47 / H-5: middleware rejects the token if this claim drops
            // below the current DB value for this user — enables in-band
            // session revocation on password/role/permission changes.
            tokenVersion: Number(user.TokenVersion ?? 0),
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

    // INFO-01: Set token as httpOnly cookie — invisible to JavaScript on the client.
    // sameSite: 'Lax' blocks cross-origin POST/PATCH/DELETE (CSRF protection for intranet).
    // secure: req.secure — true when served over HTTPS (port 1938), false on HTTP (port 1937/dev).
    // Chrome silently drops non-Secure cookies when the page is served over HTTPS.
    res.cookie('authToken', token, {
        httpOnly: true,
        secure: req.secure,
        sameSite: 'Lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days — supports multi-day offline plant operation
    });

    logAudit(user.Username, 'LOGIN_SUCCESS', homePlant, { role: user.DefaultRole }, 'INFO', req.ip);

    // Token is NOT included in the response body — it is only in the httpOnly cookie.
    // The frontend uses /auth/me to check session state on reload.
    return res.json({
        success: true,
        username: user.Username,
        role: user.DefaultRole,
        nativePlantId: homePlant,
        hubIp,
        hubToken,
        mustChangePassword: user.MustChangePassword === 1,
        canAccessDashboard: user.CanAccessDashboard === 1,
        globalAccess: user.GlobalAccess === 1,
        canImport: user.CanImport === 1,
        canSAP: user.CanSAP === 1,
        canSensorConfig: user.CanSensorConfig === 1,
        canSensorThresholds: user.CanSensorThresholds === 1,
        canSensorView: user.CanSensorView === 1,
        canViewAnalytics: user.CanViewAnalytics === 1
    });
}

// ── Helper: Attempt LDAP auth ──
async function attemptLdapAuth(config, username, password) {
    let ldap;
    try { ldap = require('ldapjs'); } catch (e) { return { success: false }; }

    const url = `${config.UseTLS ? 'ldaps' : 'ldap'}://${config.Host}:${config.Port}`;
    const client = ldap.createClient({ url, connectTimeout: 5000, timeout: 5000, tlsOptions: { rejectUnauthorized: !config.TLSIgnoreCert } });

    return new Promise((resolve) => {
        const timer = setTimeout(() => { client.destroy(); resolve({ success: false }); }, 6000);

        client.on('error', () => { clearTimeout(timer); resolve({ success: false }); });

        client.bind(config.BindDN, config.BindPassword, (bindErr) => {
            if (bindErr) { clearTimeout(timer); client.unbind(); resolve({ success: false }); return; }

            // SECURITY: Escape LDAP special characters per RFC 4515 to prevent LDAP injection
            function escapeLdapFilter(s) {
                return s.replace(/[\\*()\0/]/g, c => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'));
            }
            // Search for the user
            const filter = config.SearchFilter.replace('{{username}}', escapeLdapFilter(username));
            client.search(config.BaseDN, { scope: 'sub', filter, attributes: ['dn', 'sAMAccountName', 'displayName', 'mail', 'memberOf'] }, (searchErr, searchRes) => {
                if (searchErr) { clearTimeout(timer); client.unbind(); resolve({ success: false }); return; }

                let userDN = null;
                let attrs = {};
                searchRes.on('searchEntry', (entry) => {
                    const pojo = entry.pojo || entry;
                    userDN = pojo.objectName || entry.dn?.toString();
                    if (pojo.attributes) {
                        pojo.attributes.forEach(a => { attrs[a.type] = a.values ? a.values[0] : ''; });
                    }
                });

                searchRes.on('end', () => {
                    if (!userDN) { clearTimeout(timer); client.unbind(); resolve({ success: false }); return; }

                    // Authenticate as the user
                    client.bind(userDN, password, (userBindErr) => {
                        clearTimeout(timer);
                        client.unbind();
                        if (userBindErr) { resolve({ success: false }); return; }

                        // Determine Trier role from AD groups
                        let role = 'technician';
                        try {
                            const roleMap = JSON.parse(config.RoleMapping || '{}');
                            const memberOf = attrs.memberOf || '';
                            for (const [adGroup, trierRole] of Object.entries(roleMap)) {
                                if (memberOf.toLowerCase().includes(adGroup.toLowerCase())) {
                                    role = trierRole;
                                    break;
                                }
                            }
                        } catch (e) {}

                        resolve({
                            success: true,
                            displayName: attrs.displayName || username,
                            email: attrs.mail || '',
                            role
                        });
                    });
                });

                searchRes.on('error', () => { clearTimeout(timer); client.unbind(); resolve({ success: false }); });
            });
        });
    });
}

// ── Task 2.2: Logout — clear the httpOnly cookie ─────────────────────────────
router.post('/logout', (req, res) => {
    const user = req.user?.Username || 'unknown';
    res.clearCookie('authToken', { httpOnly: true, sameSite: 'Lax', secure: req.secure });
    logAudit(user, 'LOGOUT', null, {}, 'INFO', req.ip);
    res.json({ success: true });
});

// ── Task 2.3: /me — return current session user from cookie ───────────────────
// Called by App.jsx on mount to restore session state without reading localStorage.
// Returns 401 if the cookie is missing or expired — frontend shows login screen.
// NOTE: The global auth middleware skips all /auth/* paths, so this route must
// verify the cookie itself rather than reading req.user from middleware.
router.get('/me', (req, res) => {
    const token = req.cookies?.authToken || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({
            success: true,
            user: {
                Username: decoded.Username,
                globalRole: decoded.globalRole,
                nativePlantId: decoded.nativePlantId,
                plantRoles: decoded.plantRoles,
                canAccessDashboard: decoded.canAccessDashboard,
                globalAccess: decoded.globalAccess,
                canImport: decoded.canImport,
                canSAP: decoded.canSAP,
                canSensorConfig: decoded.canSensorConfig,
                canSensorThresholds: decoded.canSensorThresholds,
                canSensorView: decoded.canSensorView,
                canViewAnalytics: decoded.canViewAnalytics
            }
        });
    } catch {
        return res.status(401).json({ error: 'Not authenticated' });
    }
});

// ── User Self-Registration ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
    const { plantId, plantPassword, inviteCode, username, password, email, phone, title } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
        return res.status(400).json({ error: pwCheck.error });
    }

    // Must provide either invite code OR plant password
    if (!inviteCode && (!plantId || !plantPassword)) {
        return res.status(400).json({ error: 'An invite code or plant credentials are required' });
    }

    try {
        let resolvedPlantId = plantId;

        // ── Path A: Single-use invite code ──
        if (inviteCode) {
            const { db: logDb } = require('../logistics_db');
            const codeRow = logDb.prepare('SELECT * FROM InviteCodes WHERE Code = ?').get(inviteCode);
            
            if (!codeRow) {
                logAudit('GUEST', 'REGISTRATION_FAILURE', null, { username, reason: 'Invalid invite code', code: inviteCode }, 'WARNING', req.ip);
                return res.status(401).json({ error: 'Invalid invite code. Please check your code and try again.' });
            }
            if (codeRow.Status === 'used') {
                return res.status(401).json({ error: 'This invite code has already been used. Please request a new one from your administrator.' });
            }
            if (codeRow.Status === 'revoked') {
                return res.status(401).json({ error: 'This invite code has been revoked. Please contact your administrator.' });
            }

            // Invite codes are bound to a specific plant at issue time. Ignore any
            // body-supplied plantId — trusting it would let a holder of an invite
            // for Plant A register into Plant B.
            resolvedPlantId = codeRow.PlantID;

            // Check for duplicate username
            const existing = authDb.prepare('SELECT 1 FROM Users WHERE Username = ?').get(username);
            if (existing) {
                return res.status(400).json({ error: 'Username already exists. Please choose another.' });
            }

            const displayName = username.trim();
            const userHash = await bcrypt.hash(password, 10);
            const result = authDb.prepare(
                "INSERT INTO Users (Username, PasswordHash, DefaultRole, MustChangePassword, DisplayName, Email, Phone, Title) VALUES (?, ?, 'technician', 0, ?, ?, ?, ?)"
            ).run(username, userHash, displayName, email || null, phone || null, title || null);
            const newUserId = result.lastInsertRowid;

            authDb.prepare("INSERT INTO UserPlantRoles (UserID, PlantID, RoleLevel) VALUES (?, ?, 'technician')").run(newUserId, resolvedPlantId);

            // Burn the invite code
            logDb.prepare(`
                UPDATE InviteCodes 
                SET Status = 'used', UsedAt = CURRENT_TIMESTAMP, UsedBy = ?, RegisteredUsername = ?
                WHERE Code = ?
            `).run(username, username, inviteCode);

            logAudit(username, 'REGISTRATION_SUCCESS', resolvedPlantId, { method: 'Invite Code', code: inviteCode, email: email || '', title: title || '' }, 'INFO', req.ip);
            return res.json({ success: true, message: 'Account created successfully. You may now log in.' });
        }

        // ── Path B: Legacy plant password ──
        const plantUsername = `${plantId.toLowerCase()}_user`;
        const plantAccount = authDb.prepare('SELECT PasswordHash FROM Users WHERE Username = ?').get(plantUsername);

        if (!plantAccount) {
            return res.status(404).json({ error: 'Location not found or not initialized' });
        }

        const isValidKey = await bcrypt.compare(plantPassword, plantAccount.PasswordHash);
        if (!isValidKey) {
            logAudit('GUEST', 'REGISTRATION_FAILURE', plantId, { username, reason: 'Invalid Plant Password' }, 'WARNING', req.ip);
            return res.status(401).json({ error: 'Incorrect plant password. Registration denied.' });
        }

        const existing = authDb.prepare('SELECT 1 FROM Users WHERE Username = ?').get(username);
        if (existing) {
            return res.status(400).json({ error: 'Username already exists. Please choose another.' });
        }

        const displayName = username.trim();
        const userHash = await bcrypt.hash(password, 10);
        const result = authDb.prepare(
            "INSERT INTO Users (Username, PasswordHash, DefaultRole, MustChangePassword, DisplayName, Email, Phone, Title) VALUES (?, ?, 'technician', 0, ?, ?, ?, ?)"
        ).run(username, userHash, displayName, email || null, phone || null, title || null);
        const newUserId = result.lastInsertRowid;

        authDb.prepare("INSERT INTO UserPlantRoles (UserID, PlantID, RoleLevel) VALUES (?, ?, 'technician')").run(newUserId, plantId);

        logAudit(username, 'REGISTRATION_SUCCESS', plantId, { method: 'Plant Password', email: email || '', title: title || '' }, 'INFO', req.ip);
        res.json({ success: true, message: 'Account created successfully. You may now log in.' });

    } catch (err) {
        console.error('Registration Error:', err);
        res.status(500).json({ error: 'Fatal server error during registration' });
    }
});

// ── Password Reset (Admin/Creator Only) ──────────────────────────────────────
router.post('/reset-password', async (req, res) => {
    const { targetUsername } = req.body;
    const authHeader = req.headers.authorization;
    if (!authHeader && !req.cookies?.authToken) return res.status(401).json({ error: 'Missing token' });
    const token = req.cookies?.authToken || authHeader?.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Only IT Admin or the Creator can perform resets
        const isAuthorizedAtLarge = decoded.globalRole === 'it_admin' || decoded.globalRole === 'creator';
        
        if (!isAuthorizedAtLarge) {
            return res.status(403).json({ error: 'Only IT Administrators or the System Creator can reset passwords.' });
        }

        const user = authDb.prepare('SELECT * FROM Users WHERE Username = ?').get(targetUsername);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Reset to temp password and set flag
        // SECURITY: Generate cryptographically random temp password instead of hardcoded default
        const tempPassword = crypto.randomBytes(8).toString('base64url');
        const hash = await bcrypt.hash(tempPassword, 10);
        
        // Audit 47 / H-5: bump TokenVersion so any existing session for this
        // user is invalidated the moment the admin resets their password.
        authDb.prepare(
            'UPDATE Users SET PasswordHash = ?, MustChangePassword = 1, TokenVersion = COALESCE(TokenVersion, 0) + 1 WHERE UserID = ?'
        ).run(hash, user.UserID);

        logAudit(decoded.Username, 'PASSWORD_RESET_BY_ADMIN', null, { target: targetUsername }, 'WARNING', req.ip);
        _notifyUserOfAccountChange(user, { action: 'PASSWORD_RESET', adminUsername: decoded.Username, ip: req.ip });

        // Audit 47 / M-16: return the temp password as a dedicated field
        // instead of embedding it in prose. This lets reverse-proxy and
        // client-side log filters mask the known `tempPassword` key while
        // the admin UI renders it via a one-shot copy widget. MustChangePassword = 1
        // is already set above so the user is forced to rotate on first login.
        res.json({
            success: true,
            targetUsername,
            tempPassword,
            mustChangePassword: true,
            message: `Password reset for ${targetUsername}. Share the temp password via a secure channel.`,
        });
    } catch (err) {
        res.status(401).json({ error: 'Invalid session' });
    }
});

// ── Password Change ─────────────────────────────────────────────────────────
router.post('/change-password', async (req, res) => {
    const { currentPassword, newPassword, targetUsername } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader && !req.cookies?.authToken) return res.status(401).json({ error: 'Missing token' });
    const token = req.cookies?.authToken || authHeader?.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const usernameToEdit = targetUsername ? targetUsername : decoded.Username;

        // AUTH CHECK: User can change own password. Admin/Creator can change others.
        const isSelf = usernameToEdit === decoded.Username;
        const isAdminOrCreator = ['it_admin', 'creator'].includes(decoded.globalRole);

        if (!isSelf && !isAdminOrCreator) {
            return res.status(403).json({ error: 'You do not have permission to modify this password.' });
        }

        const user = authDb.prepare('SELECT * FROM Users WHERE Username = ?').get(usernameToEdit);
        if (!user) return res.status(404).json({ error: 'Account not found.' });

        if (isSelf) {
            const canChange = await bcrypt.compare(currentPassword, user.PasswordHash);
            if (!canChange) return res.status(401).json({ error: 'Incorrect current password.' });
        }

        // SECURITY: Enforce password complexity
        const pwCheck = validatePassword(newPassword);
        if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.error });

        const hash = await bcrypt.hash(newPassword, 10);
        // Audit 47 / H-5: bump TokenVersion atomically with the password change
        // so every JWT issued before this moment is rejected by the middleware.
        authDb.prepare(
            'UPDATE Users SET PasswordHash = ?, MustChangePassword = 0, TokenVersion = COALESCE(TokenVersion, 0) + 1 WHERE UserID = ?'
        ).run(hash, user.UserID);

        logAudit(decoded.Username, 'PASSWORD_CHANGE', null, { targetUser: user.Username }, 'INFO', req.ip);

        return res.json({ success: true, message: `Password updated successfully.` });
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
});

// ── User Management (Admin Only) ──────────────────────────────────────────
router.get('/users/list', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader && !req.cookies?.authToken) return res.status(401).json({ error: 'Missing token' });
    const token = req.cookies?.authToken || authHeader?.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!['it_admin', 'creator'].includes(decoded.globalRole)) {
            return res.status(403).json({ error: 'Access Denied' });
        }

        const users = authDb.prepare(`
            SELECT u.UserID, u.Username, u.DefaultRole, u.MustChangePassword, 
                   u.CanAccessDashboard, u.GlobalAccess, u.CanImport, u.CanSAP,
                   u.CanSensorConfig, u.CanSensorThresholds, u.CanSensorView,
                   u.CanViewAnalytics,
                   u.DisplayName, u.Email, u.Phone, u.Title,
                   GROUP_CONCAT(r.PlantID) as PlantAccess
            FROM Users u
            LEFT JOIN UserPlantRoles r ON u.UserID = r.UserID
            GROUP BY u.UserID
        `).all();

        res.json(users);
    } catch (err) {
        res.status(401).json({ error: 'Invalid session' });
    }
});

router.post('/users/update-access', async (req, res) => {
    const { targetUsername, canAccessDashboard, globalAccess, canImport, canSAP, canSensorConfig, canSensorThresholds, canSensorView, canViewAnalytics, defaultRole, plantRoles, displayName, email, phone, title } = req.body;
    const authHeader = req.headers.authorization;
    if (!authHeader && !req.cookies?.authToken) return res.status(401).json({ error: 'Missing token' });
    const token = req.cookies?.authToken || authHeader?.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!['it_admin', 'creator'].includes(decoded.globalRole)) {
            return res.status(403).json({ error: 'Permission Denied' });
        }

        const user = authDb.prepare('SELECT UserID FROM Users WHERE Username = ?').get(targetUsername);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Guard: only the Creator can assign the 'creator' role
        if (defaultRole === 'creator' && decoded.globalRole !== 'creator') {
            return res.status(403).json({ error: 'Only the System Creator can assign the Creator role.' });
        }

        // Update core permissions, role, and profile
        authDb.prepare(`
            UPDATE Users 
            SET DefaultRole = ?, CanAccessDashboard = ?, GlobalAccess = ?, CanImport = ?, CanSAP = ?,
                CanSensorConfig = ?, CanSensorThresholds = ?, CanSensorView = ?,
                CanViewAnalytics = ?,
                DisplayName = ?, Email = ?, Phone = ?, Title = ?
            WHERE UserID = ?
        `).run(
            defaultRole || 'technician',
            canAccessDashboard ? 1 : 0, 
            globalAccess ? 1 : 0, 
            canImport ? 1 : 0, 
            canSAP ? 1 : 0,
            canSensorConfig ? 1 : 0,
            canSensorThresholds ? 1 : 0,
            canSensorView ? 1 : 0,
            canViewAnalytics ? 1 : 0,
            displayName || null, 
            email || null, 
            phone || null, 
            title || null, 
            user.UserID
        );

        // Update plant assignments if provided
        if (plantRoles && Array.isArray(plantRoles)) {
            // Transactional update
            const deleteOld = authDb.prepare('DELETE FROM UserPlantRoles WHERE UserID = ?');
            const insertNew = authDb.prepare('INSERT INTO UserPlantRoles (UserID, PlantID, RoleLevel) VALUES (?, ?, ?)');

            const sync = authDb.transaction((userId, roles) => {
                deleteOld.run(userId);
                for (const r of roles) {
                    insertNew.run(userId, r.plantId, r.role || 'technician');
                }
            });
            sync(user.UserID, plantRoles);
        }

        // Audit 47 / H-5 (and SEC-18 from prior audit): bump TokenVersion AFTER
        // role/permission and plant-role mutations have committed, so any live
        // session with the old claims is rejected on its next request.
        authDb.prepare('UPDATE Users SET TokenVersion = COALESCE(TokenVersion, 0) + 1 WHERE UserID = ?').run(user.UserID);

        logAudit(decoded.Username, 'ACCESS_UPDATED', null, { target: targetUsername, role: defaultRole, dashboard: canAccessDashboard, global: globalAccess, analytics: canViewAnalytics }, 'INFO', req.ip);
        // Out-of-band notification (M-17). Look up the user's current email so
        // the notification goes to the address stored at update time.
        const targetForNotify = authDb.prepare('SELECT UserID, Username, Email FROM Users WHERE UserID = ?').get(user.UserID);
        if (targetForNotify) {
            _notifyUserOfAccountChange(targetForNotify, { action: 'ACCESS_UPDATED', adminUsername: decoded.Username, ip: req.ip });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ── Admin: Manually Create User ──────────────────────────────────────────────
router.post('/users/create', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader && !req.cookies?.authToken) return res.status(401).json({ error: 'Missing token' });
    const token = req.cookies?.authToken || authHeader?.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!['it_admin', 'creator'].includes(decoded.globalRole)) {
            return res.status(403).json({ error: 'Only IT Administrators or the System Creator can create user accounts.' });
        }

        const { 
            username, 
            tempPassword, 
            displayName, 
            title, 
            email, 
            phone,
            defaultRole,
            plantAssignments,       // [{ plantId, role }]
            canAccessDashboard,
            globalAccess,
            canImport,
            canSAP,
            canSensorConfig,
            canSensorThresholds,
            canSensorView,
            canViewAnalytics
        } = req.body;

        // Validate required fields
        if (!username || !username.trim()) {
            return res.status(400).json({ error: 'Username is required.' });
        }
        if (!tempPassword || tempPassword.length < 4) {
            return res.status(400).json({ error: 'A temporary password of at least 4 characters is required.' });
        }
        // SECURITY: Enforce password complexity on user creation
        const pwCheck = validatePassword(tempPassword);
        if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.error });
        if (!plantAssignments || !Array.isArray(plantAssignments) || plantAssignments.length === 0) {
            return res.status(400).json({ error: 'At least one plant assignment is required.' });
        }

        // Check for duplicate username
        const existing = authDb.prepare('SELECT 1 FROM Users WHERE Username = ?').get(username.trim());
        if (existing) {
            return res.status(409).json({ error: `Username "${username}" already exists. Choose a different one.` });
        }

        // Hash the temp password
        const hash = await bcrypt.hash(tempPassword, 10);

        // Insert the user record
        const role = defaultRole || 'technician';
        const result = authDb.prepare(`
            INSERT INTO Users (Username, PasswordHash, DefaultRole, MustChangePassword, 
                               DisplayName, Email, Phone, Title,
                               CanAccessDashboard, GlobalAccess, CanImport, CanSAP,
                               CanSensorConfig, CanSensorThresholds, CanSensorView, CanViewAnalytics)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            username.trim(),
            hash,
            role,
            displayName || username.trim(),
            email || null,
            phone || null,
            title || null,
            canAccessDashboard ? 1 : 0,
            globalAccess ? 1 : 0,
            canImport ? 1 : 0,
            canSAP ? 1 : 0,
            canSensorConfig ? 1 : 0,
            canSensorThresholds ? 1 : 0,
            canSensorView ? 1 : 0,
            canViewAnalytics ? 1 : 0
        );

        const newUserId = result.lastInsertRowid;

        // Assign plant roles in a transaction
        const insertRole = authDb.prepare('INSERT INTO UserPlantRoles (UserID, PlantID, RoleLevel) VALUES (?, ?, ?)');
        const assignPlants = authDb.transaction((userId, assignments) => {
            for (const a of assignments) {
                insertRole.run(userId, a.plantId, a.role || 'technician');
            }
        });
        assignPlants(newUserId, plantAssignments);

        logAudit(decoded.Username, 'USER_CREATED_BY_ADMIN', null, {
            newUsername: username.trim(),
            role,
            plants: plantAssignments.map(a => a.plantId).join(','),
            permissions: { canAccessDashboard, globalAccess, canImport, canSAP, canSensorConfig, canSensorThresholds, canSensorView, canViewAnalytics }
        }, 'INFO', req.ip);

        res.json({
            success: true,
            message: `User "${username.trim()}" created successfully.`,
            userId: Number(newUserId),
            tempPassword: tempPassword,
            mustChangePassword: true
        });

    } catch (err) {
        console.error('User creation error:', err);
        res.status(500).json({ error: 'Failed to create user: ' });
    }
});

// ── Admin: Delete User ───────────────────────────────────────────────────────
// Rules:
//   - System account (UserID 3) CANNOT be deleted by anyone
//   - Only Creator role can delete other creator-role users
//   - IT Admin and Creator can delete all standard users
router.post('/users/delete', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader && !req.cookies?.authToken) return res.status(401).json({ error: 'Missing token' });
    const token = req.cookies?.authToken || authHeader?.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Only IT Admin or Creator can delete users
        if (!['it_admin', 'creator'].includes(decoded.globalRole)) {
            return res.status(403).json({ error: 'Only IT Administrators or the System Creator can delete users.' });
        }

        const { targetUsername, confirmSelfDelete } = req.body;
        if (!targetUsername) return res.status(400).json({ error: 'Target username is required.' });

        const targetUser = authDb.prepare('SELECT * FROM Users WHERE Username = ?').get(targetUsername);
        if (!targetUser) return res.status(404).json({ error: 'User not found.' });

        // SYSTEM LOCK: UserID 3 is permanently protected — cannot be deleted by anyone, ever
        if (targetUser.UserID === 3) {
            return res.status(403).json({ error: 'This account is permanently protected and cannot be deleted.' });
        }

        // Check if target is a Creator-role account
        const isTargetCreator = targetUser.DefaultRole === 'creator';
        const isRequestorCreator = decoded.globalRole === 'creator';

        if (isTargetCreator) {
            // Creator role accounts can ONLY be deleted by another Creator with explicit confirmation
            if (!isRequestorCreator || decoded.UserID === targetUser.UserID) {
                return res.status(403).json({ error: 'Creator accounts cannot be deleted by standard administrators.' });
            }
            if (!confirmSelfDelete) {
                return res.status(400).json({ error: 'Creator account deletion requires explicit confirmation.' });
            }
        }

        // Prevent deleting yourself (unless you're the Creator doing a self-delete)
        if (decoded.Username === targetUsername && !isTargetCreator) {
            return res.status(400).json({ error: 'You cannot delete your own account. Ask another admin.' });
        }

        // Execute deletion in a transaction
        const deleteUser = authDb.transaction((userId) => {
            authDb.prepare('DELETE FROM UserPlantRoles WHERE UserID = ?').run(userId);
            authDb.prepare('DELETE FROM Users WHERE UserID = ?').run(userId);
        });
        deleteUser(targetUser.UserID);

        logAudit(decoded.Username, 'USER_DELETED', null, { 
            deletedUser: targetUsername, 
            deletedUserId: targetUser.UserID,
            selfDelete: decoded.Username === targetUsername 
        }, 'WARNING', req.ip);

        res.json({ success: true, message: `User "${targetUsername}" has been permanently deleted.` });
    } catch (err) {
        console.error('User deletion error:', err);
        res.status(500).json({ error: 'Failed to delete user: ' });
    }
});

module.exports = router;
