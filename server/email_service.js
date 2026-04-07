// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Email Notification Service (Task 2.4)
 * ==========================================================
 * Configurable email alerts for critical events.
 * Uses Nodemailer (if available) or stores messages for retrieval.
 * 
 * Endpoints:
 *   GET    /api/email/settings         - Get SMTP configuration
 *   PUT    /api/email/settings         - Update SMTP configuration
 *   POST   /api/email/test             - Send test email
 *   GET    /api/email/log              - Email send history
 *   POST   /api/email/send             - Send custom email
 */

const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('./logistics_db');

// ── Ensure tables exist ──────────────────────────────────────────────────────
try {
    logisticsDb.exec(`CREATE TABLE IF NOT EXISTS email_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT UNIQUE NOT NULL,
        setting_value TEXT NOT NULL,
        updated_by TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    logisticsDb.exec(`CREATE TABLE IF NOT EXISTS email_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        body_preview TEXT DEFAULT '',
        status TEXT DEFAULT 'sent',
        error_msg TEXT,
        event_type TEXT,
        sent_at TEXT DEFAULT (datetime('now'))
    )`);

    // Seed default settings
    const existing = logisticsDb.prepare("SELECT 1 FROM email_settings WHERE setting_key = 'smtp_host'").get();
    if (!existing) {
        const defaults = {
            smtp_host: '',
            smtp_port: '587',
            smtp_user: '',
            smtp_pass: '',
            smtp_secure: 'false',
            from_name: 'Trier OS',
            from_email: 'noreply@trier-os.com',
            enabled: 'false',
            notify_critical_wo: 'true',
            notify_overdue_pm: 'true',
            notify_work_requests: 'true',
            notify_approvals: 'true',
            admin_email: ''
        };
        const insert = logisticsDb.prepare("INSERT INTO email_settings (setting_key, setting_value) VALUES (?, ?)");
        for (const [k, v] of Object.entries(defaults)) {
            insert.run(k, v);
        }
    }
} catch (e) {
    console.error('[Email] Table init error:', e.message);
}

// ── Helper: Get settings as object ───────────────────────────────────────────
function getSettings() {
    const rows = logisticsDb.prepare('SELECT setting_key, setting_value FROM email_settings').all();
    const settings = {};
    rows.forEach(r => settings[r.setting_key] = r.setting_value);
    return settings;
}

// ── Helper: Send email ───────────────────────────────────────────────────────
async function sendEmail(to, subject, htmlBody, eventType = 'manual') {
    const settings = getSettings();

    if (settings.enabled !== 'true') {
        return { success: false, reason: 'Email notifications are disabled' };
    }

    if (!settings.smtp_host || !settings.smtp_user) {
        return { success: false, reason: 'SMTP not configured' };
    }

    try {
        // Attempt to use nodemailer (may not be installed)
        const nodemailer = require('nodemailer');

        const transporter = nodemailer.createTransport({
            host: settings.smtp_host,
            port: parseInt(settings.smtp_port) || 587,
            secure: settings.smtp_secure === 'true',
            auth: {
                user: settings.smtp_user,
                pass: settings.smtp_pass
            },
            tls: { rejectUnauthorized: false }
        });

        const info = await transporter.sendMail({
            from: `"${settings.from_name}" <${settings.from_email}>`,
            to,
            subject,
            html: htmlBody
        });

        // Log success
        logisticsDb.prepare(`
            INSERT INTO email_log (recipient, subject, body_preview, status, event_type)
            VALUES (?, ?, ?, 'sent', ?)
        `).run(to, subject, htmlBody.substring(0, 200), eventType);

        return { success: true, messageId: info.messageId };
    } catch (err) {
        // Log failure
        logisticsDb.prepare(`
            INSERT INTO email_log (recipient, subject, body_preview, status, error_msg, event_type)
            VALUES (?, ?, ?, 'failed', ?, ?)
        `).run(to, subject, htmlBody.substring(0, 200), err.message, eventType);

        return { success: false, reason: err.message };
    }
}

// ── Email HTML Template ──────────────────────────────────────────────────────
function buildEmailHtml(title, body, accent = '#6366f1') {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; border-radius: 12px; overflow: hidden; border: 1px solid #1e293b;">
        <div style="height: 4px; background: ${accent};"></div>
        <div style="padding: 30px;">
            <h2 style="margin: 0 0 5px 0; color: #f1f5f9; font-size: 18px;">${title}</h2>
            <div style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin-top: 15px;">
                ${body}
            </div>
            <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #1e293b; font-size: 11px; color: #475569;">
                Trier OS — Automated Alert<br>
                ${new Date().toLocaleString()}
            </div>
        </div>
    </div>`;
}

// ── GET /api/email/settings ──────────────────────────────────────────────────
router.get('/settings', (req, res) => {
    try {
        const settings = getSettings();
        // Don't expose password
        if (settings.smtp_pass) {
            settings.smtp_pass = settings.smtp_pass ? '••••••••' : '';
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// ── PUT /api/email/settings ──────────────────────────────────────────────────
router.put('/settings', (req, res) => {
    try {
        const updates = req.body;
        const updatedBy = req.user?.username || 'admin';

        const upsert = logisticsDb.prepare(`
            INSERT INTO email_settings (setting_key, setting_value, updated_by, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(setting_key) DO UPDATE SET setting_value = ?, updated_by = ?, updated_at = datetime('now')
        `);

        for (const [key, value] of Object.entries(updates)) {
            // Skip password field if it's the masked value
            if (key === 'smtp_pass' && value === '••••••••') continue;
            upsert.run(key, String(value), updatedBy, String(value), updatedBy);
        }

        logAudit(updatedBy, 'EMAIL_SETTINGS_UPDATED', 'system', { keys: Object.keys(updates) });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update settings', details: err.message });
    }
});

// ── POST /api/email/test ─────────────────────────────────────────────────────
router.post('/test', async (req, res) => {
    const { to } = req.body;
    const settings = getSettings();
    const recipient = to || settings.admin_email;

    if (!recipient) {
        return res.status(400).json({ error: 'No recipient specified. Set admin email in settings.' });
    }

    const html = buildEmailHtml(
        '🧪 Test Alert — Trier OS',
        `<p>This test confirms your email configuration is working.</p>
         <p><strong>SMTP Host:</strong> ${settings.smtp_host}<br>
         <strong>From:</strong> ${settings.from_email}</p>
         <p style="color: #10b981;">✅ Email delivery operational.</p>`,
        '#10b981'
    );

    const result = await sendEmail(recipient, '[Trier OS] Test Notification', html, 'test');
    res.json(result);
});

// ── POST /api/email/send ─────────────────────────────────────────────────────
router.post('/send', async (req, res) => {
    const { to, subject, body, eventType = 'manual' } = req.body;

    if (!to || !subject) {
        return res.status(400).json({ error: 'Recipient and subject are required' });
    }

    const html = buildEmailHtml(subject, body || '', '#6366f1');
    const result = await sendEmail(to, subject, html, eventType);
    res.json(result);
});

// ── GET /api/email/log ───────────────────────────────────────────────────────
router.get('/log', (req, res) => {
    try {
        const logs = logisticsDb.prepare(
            'SELECT * FROM email_log ORDER BY sent_at DESC LIMIT 50'
        ).all();
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Per-Plant Email Alert Configuration
// Allows each Maintenance Manager to set up site-specific notifications
// ═══════════════════════════════════════════════════════════════════════════════

try {
    logisticsDb.exec(`CREATE TABLE IF NOT EXISTS plant_email_config (
        plant_id TEXT PRIMARY KEY,
        recipients TEXT NOT NULL DEFAULT '[]',
        triggers TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER DEFAULT 1,
        updated_by TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
    )`);
} catch (e) {
    console.error('[Email] plant_email_config table init error:', e.message);
}

// ── GET /api/email/plant-config/:plantId ─────────────────────────────────────
router.get('/plant-config/:plantId', (req, res) => {
    try {
        const { plantId } = req.params;
        const row = logisticsDb.prepare('SELECT * FROM plant_email_config WHERE plant_id = ?').get(plantId);
        
        if (!row) {
            // Return defaults
            return res.json({
                recipients: [''],
                triggers: { critical_wo: true, overdue_pm: true, risk_alerts: true, work_requests: false },
                enabled: true
            });
        }

        res.json({
            recipients: JSON.parse(row.recipients || '[]'),
            triggers: JSON.parse(row.triggers || '{}'),
            enabled: !!row.enabled
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load plant email config' });
    }
});

// ── PUT /api/email/plant-config/:plantId ─────────────────────────────────────
router.put('/plant-config/:plantId', (req, res) => {
    try {
        const { plantId } = req.params;
        const { recipients, triggers, enabled } = req.body;
        const updatedBy = req.user?.Username || req.user?.username || 'manager';

        logisticsDb.prepare(`
            INSERT INTO plant_email_config (plant_id, recipients, triggers, enabled, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(plant_id) DO UPDATE SET 
                recipients = excluded.recipients, 
                triggers = excluded.triggers, 
                enabled = excluded.enabled,
                updated_by = excluded.updated_by, 
                updated_at = datetime('now')
        `).run(
            plantId,
            JSON.stringify(recipients || []),
            JSON.stringify(triggers || {}),
            enabled !== false ? 1 : 0,
            updatedBy
        );

        logAudit(updatedBy, 'PLANT_EMAIL_CONFIG', plantId, { recipients, triggers }, 'INFO');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save plant email config', details: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// User-Level Email Alert Preferences
// Any user can configure their own alert email & trigger preferences
// ═══════════════════════════════════════════════════════════════════════════════

try {
    logisticsDb.exec(`CREATE TABLE IF NOT EXISTS user_email_alerts (
        username TEXT PRIMARY KEY,
        email TEXT NOT NULL DEFAULT '',
        triggers TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT (datetime('now'))
    )`);
} catch (e) {
    console.error('[Email] user_email_alerts table init error:', e.message);
}

// ── GET /api/email/user-alerts/:username ──────────────────────────────────────
router.get('/user-alerts/:username', (req, res) => {
    try {
        const { username } = req.params;
        const row = logisticsDb.prepare('SELECT * FROM user_email_alerts WHERE username = ?').get(username);
        
        if (!row) {
            return res.json({
                email: '',
                triggers: { critical_wo: true, overdue_pm: true, risk_alerts: true, work_requests: false },
                enabled: true
            });
        }

        res.json({
            email: row.email || '',
            triggers: JSON.parse(row.triggers || '{}'),
            enabled: !!row.enabled
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load user alert preferences' });
    }
});

// ── PUT /api/email/user-alerts/:username ──────────────────────────────────────
router.put('/user-alerts/:username', (req, res) => {
    try {
        const { username } = req.params;
        const { email, triggers, enabled } = req.body;

        logisticsDb.prepare(`
            INSERT INTO user_email_alerts (username, email, triggers, enabled, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(username) DO UPDATE SET 
                email = excluded.email, 
                triggers = excluded.triggers, 
                enabled = excluded.enabled,
                updated_at = datetime('now')
        `).run(
            username,
            email || '',
            JSON.stringify(triggers || {}),
            enabled !== false ? 1 : 0
        );

        logAudit(username, 'USER_EMAIL_ALERTS', 'user', { email, triggers }, 'INFO');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save user alert preferences', details: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Subscriber Lookup — Used by PM engine, WO creation, etc. to find recipients
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all users who have subscribed to a specific event type.
 * @param {string} eventType - e.g. 'critical_wo', 'overdue_pm', 'new_requests'
 * @returns {string[]} Array of email addresses
 */
function getSubscribers(eventType) {
    try {
        const rows = logisticsDb.prepare(
            'SELECT email, triggers, enabled FROM user_email_alerts WHERE enabled = 1'
        ).all();

        return rows
            .filter(r => {
                const t = JSON.parse(r.triggers || '{}');
                return t[eventType] === true && r.email;
            })
            .map(r => r.email);
    } catch (e) {
        console.error(`[Email] getSubscribers(${eventType}) error:`, e.message);
        return [];
    }
}

// ── GET /api/email/subscribers/:eventType ────────────────────────────────────
// Returns list of emails subscribed to a specific alert type
router.get('/subscribers/:eventType', (req, res) => {
    try {
        const { eventType } = req.params;
        const subscribers = getSubscribers(eventType);
        res.json({ eventType, count: subscribers.length, subscribers });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch subscribers' });
    }
});

/**
 * Send alert to all subscribers of a given event type.
 * @param {string} eventType - e.g. 'critical_wo', 'overdue_pm'
 * @param {string} subject - Email subject line
 * @param {string} htmlBody - Email HTML content
 * @returns {Promise<{sent: number, failed: number}>}
 */
async function sendAlertToSubscribers(eventType, subject, htmlBody) {
    const subscribers = getSubscribers(eventType);
    let sent = 0, failed = 0;

    for (const email of subscribers) {
        const result = await sendEmail(email, subject, htmlBody, eventType);
        if (result.success) sent++;
        else failed++;
    }

    return { sent, failed, total: subscribers.length };
}

// Export for use by other modules (webhook, PM engine, etc.)
module.exports = router;
module.exports.sendEmail = sendEmail;
module.exports.buildEmailHtml = buildEmailHtml;
module.exports.getSubscribers = getSubscribers;
module.exports.sendAlertToSubscribers = sendAlertToSubscribers;
