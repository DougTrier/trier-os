// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Creator Console System Administration API
 * =======================================================
 * Exclusive to the "creator" account (Doug Trier). Provides the highest-privilege
 * system administration functions: 2FA lifecycle, executive access control,
 * system diagnostics, and full audit log access.
 * Mounted at /api/creator in server/index.js.
 *
 * ENDPOINTS:
 *   Settings & 2FA
 *   GET    /settings              Retrieve creator account settings and 2FA status
 *   POST   /settings/totp-setup   Generate a TOTP secret and QR code URI for authenticator app setup
 *   POST   /settings/totp-verify  Verify a TOTP code to activate 2FA (completes enrollment)
 *   POST   /settings/totp-disable Disable 2FA (requires current TOTP code to confirm)
 *
 *   Executive Access Whitelist
 *   GET    /executives            List all users granted executive-level corporate analytics access
 *   POST   /executives            Grant corporate analytics access to a user
 *                                 Body: { username }
 *   DELETE /executives/:username  Revoke corporate analytics access for a user
 *
 *   Diagnostics & Audit
 *   GET    /diagnostics           System health check: DB sizes, connection counts, uptime, memory
 *   GET    /audit                 Full audit log (all plants, all users, last 500 entries)
 *
 * SECURITY MODEL: Every endpoint checks `req.user.username === 'creator'` — not just role.
 *   This is a deliberate hard-coded check: only the specific "creator" account can access
 *   these endpoints, regardless of role assignment. JWT token must also be valid.
 *
 * 2FA: TOTP (RFC 6238) compatible with Google Authenticator, Microsoft Authenticator,
 *   and Authy. Secret stored encrypted in auth_db. All Creator logins require 2FA once enabled.
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db: logDb, logAudit } = require('../logistics_db');

const JWT_SECRET = process.env.JWT_SECRET;

// ── Encryption helpers for TOTP secret storage ──────────────────────────────
const ALGO = 'aes-256-gcm';
function getEncryptionKey() {
    if (!JWT_SECRET) throw new Error('JWT_SECRET is required for encryption operations');
    return crypto.createHash('sha256').update(JWT_SECRET).digest();
}

function encrypt(text) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + tag + ':' + encrypted;
}

function decrypt(data) {
    const key = getEncryptionKey();
    const parts = data.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ── Auto-create tables ──────────────────────────────────────────────────────
try {
    logDb.exec(`
        CREATE TABLE IF NOT EXISTS creator_settings (
            Key TEXT PRIMARY KEY,
            Value TEXT,
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS executive_access (
            Username TEXT PRIMARY KEY,
            GrantedBy TEXT NOT NULL,
            GrantedAt TEXT DEFAULT (datetime('now')),
            Notes TEXT
        );

        CREATE TABLE IF NOT EXISTS two_factor_codes (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            Username TEXT NOT NULL,
            Code TEXT NOT NULL,
            ExpiresAt TEXT NOT NULL,
            Used INTEGER DEFAULT 0,
            CreatedAt TEXT DEFAULT (datetime('now'))
        );
    `);
    console.log('[Creator Console] ✅ Tables initialized');
} catch (err) {
    console.error('[Creator Console] ⚠️ Table creation error:', err.message);
}

// ── Auth Middleware: username MUST be 'creator' ─────────────────────────────
function requireCreator(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader && !req.cookies?.authToken) return res.status(401).json({ error: 'Missing authorization token' });

    try {
        const token = req.cookies?.authToken || authHeader?.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.Username !== 'creator') {
            logAudit(decoded.Username, 'CREATOR_CONSOLE_DENIED', null, { attempted: req.path }, 'WARNING', req.ip);
            return res.status(403).json({ error: 'Access denied. Creator account required.' });
        }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

router.use(requireCreator);

// ═══════════════════════════════════════════════════════════════════════════════
// TOTP 2FA SETUP (Google Authenticator / Microsoft Authenticator)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /settings — retrieve current settings
router.get('/settings', (req, res) => {
    try {
        const settings = {};
        const rows = logDb.prepare('SELECT Key, Value FROM creator_settings').all();
        rows.forEach(r => {
            if (r.Key === 'totp_secret') {
                settings.totpConfigured = true;
            }
        });

        if (!settings.totpConfigured) settings.totpConfigured = false;

        const enforceRow = logDb.prepare("SELECT Value FROM creator_settings WHERE Key = 'twofa_enforced'").get();
        settings.twofaEnforced = enforceRow?.Value === '1';

        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /settings/totp-setup — generate new TOTP secret and return QR code
router.post('/settings/totp-setup', async (req, res) => {
    try {
        const OTPAuth = require('otpauth');
        const QRCode = require('qrcode');

        // Generate a new TOTP secret
        const secret = new OTPAuth.Secret({ size: 20 });
        
        const totp = new OTPAuth.TOTP({
            issuer: 'Trier OS',
            label: 'creator',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: secret
        });

        const otpauthUrl = totp.toString();

        // Generate QR code as data URL
        const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
            width: 280,
            margin: 2,
            color: { dark: '#e2e8f0', light: '#0f172a' }
        });

        // Store the secret temporarily until verified
        logDb.prepare("INSERT OR REPLACE INTO creator_settings (Key, Value, UpdatedAt) VALUES ('totp_pending_secret', ?, datetime('now'))").run(encrypt(secret.base32));

        logAudit('creator', 'TOTP_SETUP_INITIATED', null, {}, 'INFO', req.ip);

        res.json({
            success: true,
            qrCode: qrDataUrl,
            manualKey: secret.base32,
            message: 'Scan the QR code with Google Authenticator or Microsoft Authenticator, then enter the 6-digit code to verify.'
        });
    } catch (err) {
        console.error('[TOTP Setup]', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /settings/totp-verify — verify the TOTP code to confirm setup
router.post('/settings/totp-verify', (req, res) => {
    const { code } = req.body;
    if (!code || code.length !== 6) return res.status(400).json({ error: '6-digit verification code required' });

    try {
        const OTPAuth = require('otpauth');

        // Get pending secret
        const pendingRow = logDb.prepare("SELECT Value FROM creator_settings WHERE Key = 'totp_pending_secret'").get();
        if (!pendingRow) return res.status(400).json({ error: 'No TOTP setup in progress. Start setup first.' });

        const secretBase32 = decrypt(pendingRow.Value);
        const totp = new OTPAuth.TOTP({
            issuer: 'Trier OS',
            label: 'creator',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(secretBase32)
        });

        // Validate code (allow ±1 period window for clock drift)
        const delta = totp.validate({ token: code, window: 1 });
        if (delta === null) {
            return res.status(400).json({ error: 'Invalid code. Make sure your authenticator app clock is synced.' });
        }

        // Move pending to confirmed
        logDb.prepare("INSERT OR REPLACE INTO creator_settings (Key, Value, UpdatedAt) VALUES ('totp_secret', ?, datetime('now'))").run(pendingRow.Value);
        logDb.prepare("DELETE FROM creator_settings WHERE Key = 'totp_pending_secret'").run();
        logDb.prepare("INSERT OR REPLACE INTO creator_settings (Key, Value, UpdatedAt) VALUES ('twofa_enforced', '1', datetime('now'))").run();

        logAudit('creator', 'TOTP_SETUP_VERIFIED', null, {}, 'INFO', req.ip);
        res.json({ success: true, message: '2FA enabled! You will need your authenticator app on every future login.' });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /settings/totp-disable — disable 2FA (requires current code)
router.post('/settings/totp-disable', (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Current authenticator code required to disable 2FA' });

    try {
        const OTPAuth = require('otpauth');
        const secretRow = logDb.prepare("SELECT Value FROM creator_settings WHERE Key = 'totp_secret'").get();
        if (!secretRow) return res.status(400).json({ error: '2FA is not currently enabled' });

        const secretBase32 = decrypt(secretRow.Value);
        const totp = new OTPAuth.TOTP({
            issuer: 'Trier OS',
            label: 'creator',
            algorithm: 'SHA1', digits: 6, period: 30,
            secret: OTPAuth.Secret.fromBase32(secretBase32)
        });

        const delta = totp.validate({ token: code, window: 1 });
        if (delta === null) return res.status(400).json({ error: 'Invalid code' });

        logDb.prepare("DELETE FROM creator_settings WHERE Key = 'totp_secret'").run();
        logDb.prepare("DELETE FROM creator_settings WHERE Key = 'twofa_enforced'").run();

        logAudit('creator', 'TOTP_DISABLED', null, {}, 'WARNING', req.ip);
        res.json({ success: true, message: '2FA has been disabled.' });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTIVE ACCESS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/executives', (req, res) => {
    try {
        const list = logDb.prepare('SELECT * FROM executive_access ORDER BY GrantedAt DESC').all();
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/executives', (req, res) => {
    const { username, notes } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });

    try {
        logDb.prepare("INSERT OR REPLACE INTO executive_access (Username, GrantedBy, Notes, GrantedAt) VALUES (?, ?, ?, datetime('now'))").run(username, 'creator', notes || null);
        logAudit('creator', 'EXECUTIVE_ACCESS_GRANTED', null, { username, notes }, 'INFO', req.ip);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/executives/:username', (req, res) => {
    try {
        logDb.prepare('DELETE FROM executive_access WHERE Username = ?').run(req.params.username);
        logAudit('creator', 'EXECUTIVE_ACCESS_REVOKED', null, { username: req.params.username }, 'WARNING', req.ip);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/diagnostics', (req, res) => {
    try {
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const dataDir = require('../resolve_data_dir');

        const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db'));
        const databases = dbFiles.map(f => {
            const stats = fs.statSync(path.join(dataDir, f));
            return { name: f, sizeMB: Math.round(stats.size / 1024 / 1024 * 100) / 100, modified: stats.mtime };
        });

        const uptime = process.uptime();
        const memUsage = process.memoryUsage();

        res.json({
            system: {
                hostname: os.hostname(),
                platform: os.platform(),
                arch: os.arch(),
                cpus: os.cpus().length,
                totalMemGB: Math.round(os.totalmem() / 1073741824 * 10) / 10,
                freeMemGB: Math.round(os.freemem() / 1073741824 * 10) / 10,
                nodeVersion: process.version,
            },
            process: {
                uptimeHours: Math.round(uptime / 3600 * 10) / 10,
                heapUsedMB: Math.round(memUsage.heapUsed / 1048576),
                heapTotalMB: Math.round(memUsage.heapTotal / 1048576),
                rssMB: Math.round(memUsage.rss / 1048576),
            },
            databases,
            dataDir,
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG VIEWER
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/audit', (req, res) => {
    try {
        const { limit = 100, action = '', user = '', severity = '' } = req.query;
        let where = [];
        let params = [];

        if (action) { where.push('Action LIKE ?'); params.push(`%${action}%`); }
        if (user) { where.push('UserID LIKE ?'); params.push(`%${user}%`); }
        if (severity) { where.push('Severity = ?'); params.push(severity); }

        const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const rows = logDb.prepare(`SELECT * FROM AuditLog ${whereClause} ORDER BY Timestamp DESC LIMIT ?`).all(...params, parseInt(limit));
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
