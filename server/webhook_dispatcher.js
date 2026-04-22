// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Webhook Dispatcher
 * ==========================================
 * Queues real-time notifications for Slack, Teams, Discord, or custom
 * webhooks. Supports at-least-once delivery via an outbox table with
 * exponential back-off and idempotency-key dedup (Audit 47 / M-12).
 *
 * PREVIOUS BEHAVIOR
 *   dispatchEvent() sent the webhook synchronously. A transient 5xx or
 *   timeout from Slack/Teams silently dropped the notification; callers
 *   wrap the call in try/catch so failures were invisible.
 *
 * NEW BEHAVIOR
 *   dispatchEvent() inserts one row per matching webhook configuration
 *   into WebhookOutbox and returns immediately. A 30-second drain
 *   worker sends the rows out, applies exponential back-off on failure,
 *   and caps at 5 attempts before marking a row 'failed'.
 *
 * Supported events:
 *   - CRITICAL_WO_CREATED   → Emergency/Critical work order submitted
 *   - PM_DUE_TODAY          → PM schedule auto-generated a work order
 *   - WO_COMPLETED          → Work order marked complete
 *   - SENSOR_THRESHOLD      → Sensor exceeded defined limit
 *   - APPROVAL_REQUIRED     → WO needs supervisor approval
 *   - CUSTOM                → User-defined event
 */
const { db: logisticsDb } = require('./logistics_db');

const EVENT_TYPES = {
    CRITICAL_WO_CREATED: { emoji: '🚨', label: 'Critical Work Order', color: '#ef4444' },
    PM_DUE_TODAY:        { emoji: '🔧', label: 'PM Due Today',        color: '#f59e0b' },
    WO_COMPLETED:        { emoji: '✅', label: 'Work Order Complete', color: '#10b981' },
    SENSOR_THRESHOLD:    { emoji: '🌡️', label: 'Sensor Alert',        color: '#ef4444' },
    APPROVAL_REQUIRED:   { emoji: '📝', label: 'Approval Required',   color: '#8b5cf6' },
    CUSTOM:              { emoji: '📢', label: 'Notification',        color: '#6366f1' }
};

// ── Schema bootstrap ──────────────────────────────────────────────────────────
try {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS WebhookOutbox (
            ID             INTEGER PRIMARY KEY AUTOINCREMENT,
            WebhookID      INTEGER NOT NULL,
            Platform       TEXT NOT NULL,
            WebhookUrl     TEXT NOT NULL,
            EventType      TEXT NOT NULL,
            Payload        TEXT NOT NULL,
            IdempotencyKey TEXT,
            Status         TEXT NOT NULL DEFAULT 'pending',
            Attempts       INTEGER DEFAULT 0,
            NextRetryAt    TEXT DEFAULT (datetime('now')),
            CreatedAt      TEXT DEFAULT (datetime('now')),
            SentAt         TEXT,
            LastError      TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_outbox_idempotency ON WebhookOutbox(IdempotencyKey);
        CREATE INDEX IF NOT EXISTS idx_webhook_outbox_pending ON WebhookOutbox(Status, NextRetryAt);
    `);
} catch (e) {
    console.warn('[Webhook] Outbox schema bootstrap failed:', e.message);
}

// Existing per-platform formatters ────────────────────────────────────────────

function formatSlackPayload(eventType, data) {
    const evt = EVENT_TYPES[eventType] || EVENT_TYPES.CUSTOM;
    const blocks = [
        { type: 'header', text: { type: 'plain_text', text: `${evt.emoji} ${evt.label}`, emoji: true } },
        { type: 'section', fields: [] }
    ];
    if (data.woNumber) blocks[1].fields.push({ type: 'mrkdwn', text: `*WO #:*\n${data.woNumber}` });
    if (data.description) blocks[1].fields.push({ type: 'mrkdwn', text: `*Description:*\n${data.description}` });
    if (data.assetId) blocks[1].fields.push({ type: 'mrkdwn', text: `*Asset:*\n${data.assetId}` });
    if (data.priority) blocks[1].fields.push({ type: 'mrkdwn', text: `*Priority:*\n${data.priority}` });
    if (data.plant) blocks[1].fields.push({ type: 'mrkdwn', text: `*Plant:*\n${data.plant}` });
    if (data.assignedTo) blocks[1].fields.push({ type: 'mrkdwn', text: `*Assigned:*\n${data.assignedTo}` });
    if (data.sensorId) blocks[1].fields.push({ type: 'mrkdwn', text: `*Sensor:*\n${data.sensorId}` });
    if (data.value) blocks[1].fields.push({ type: 'mrkdwn', text: `*Reading:*\n${data.value} ${data.unit || ''}` });
    if (data.message) blocks[1].fields.push({ type: 'mrkdwn', text: `*Details:*\n${data.message}` });
    blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `📅 ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST | Trier OS` }]
    });
    return {
        text: `${evt.emoji} ${evt.label}: ${data.description || data.message || 'Event triggered'}`,
        blocks
    };
}

function formatTeamsPayload(eventType, data) {
    const evt = EVENT_TYPES[eventType] || EVENT_TYPES.CUSTOM;
    const facts = [];
    if (data.woNumber) facts.push({ name: 'WO #', value: data.woNumber });
    if (data.description) facts.push({ name: 'Description', value: data.description });
    if (data.assetId) facts.push({ name: 'Asset', value: data.assetId });
    if (data.priority) facts.push({ name: 'Priority', value: data.priority });
    if (data.plant) facts.push({ name: 'Plant', value: data.plant });
    if (data.assignedTo) facts.push({ name: 'Assigned', value: data.assignedTo });
    if (data.sensorId) facts.push({ name: 'Sensor', value: data.sensorId });
    if (data.value) facts.push({ name: 'Reading', value: `${data.value} ${data.unit || ''}` });
    if (data.message) facts.push({ name: 'Details', value: data.message });
    return {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor: evt.color.replace('#', ''),
        summary: `${evt.emoji} ${evt.label}`,
        sections: [{
            activityTitle: `${evt.emoji} ${evt.label}`,
            activitySubtitle: new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CST',
            facts,
            markdown: true
        }]
    };
}

function formatDiscordPayload(eventType, data) {
    const evt = EVENT_TYPES[eventType] || EVENT_TYPES.CUSTOM;
    const fields = [];
    if (data.woNumber) fields.push({ name: 'WO #', value: data.woNumber, inline: true });
    if (data.assetId) fields.push({ name: 'Asset', value: data.assetId, inline: true });
    if (data.priority) fields.push({ name: 'Priority', value: data.priority, inline: true });
    if (data.plant) fields.push({ name: 'Plant', value: data.plant, inline: true });
    if (data.assignedTo) fields.push({ name: 'Assigned', value: data.assignedTo, inline: true });
    if (data.description) fields.push({ name: 'Description', value: data.description, inline: false });
    return {
        content: `${evt.emoji} **${evt.label}**`,
        embeds: [{
            title: data.description || data.message || evt.label,
            color: parseInt(evt.color.replace('#', ''), 16),
            fields,
            timestamp: new Date().toISOString(),
            footer: { text: 'Trier OS' }
        }]
    };
}

// Format the outgoing payload based on destination platform.
function formatPayload(platform, eventType, data) {
    switch (platform) {
        case 'slack':   return formatSlackPayload(eventType, data);
        case 'teams':   return formatTeamsPayload(eventType, data);
        case 'discord': return formatDiscordPayload(eventType, data);
        default:        return { event: eventType, timestamp: new Date().toISOString(), ...data };
    }
}

// ── HTTP POST one webhook payload ─────────────────────────────────────────────
async function sendWebhook(webhookUrl, platform, payload) {
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) {
            return { success: false, status: response.status, error: `HTTP ${response.status} ${response.statusText}` };
        }
        return { success: true, status: response.status };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ── Idempotency-key derivation ────────────────────────────────────────────────
// Stable key per (webhook config, event type, natural discriminator).
// Matches ERP-outbox semantics: NULL fallback when no discriminator is
// derivable — the UNIQUE index permits nulls (SQLite NULL-distinct).
function deriveIdempotencyKey(webhookId, eventType, data) {
    const disc = data?.woNumber || data?.scanId || data?.sensorId || data?.id || data?.ID;
    if (!disc) return null;
    return `wh-${webhookId}:${eventType}:${disc}`;
}

// ── Enqueue an event (fire-and-forget, synchronous insert) ────────────────────
function dispatchEvent(eventType, data) {
    try {
        if (!logisticsDb) return 0;

        // Ensure legacy webhook_config table exists (historical bootstrap
        // path — kept identical to pre-refactor behavior).
        try {
            logisticsDb.exec(`CREATE TABLE IF NOT EXISTS webhook_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL DEFAULT 'slack',
                webhook_url TEXT NOT NULL,
                label TEXT DEFAULT '',
                enabled INTEGER DEFAULT 1,
                notify_critical_wo INTEGER DEFAULT 1,
                notify_pm_due INTEGER DEFAULT 1,
                notify_emergency INTEGER DEFAULT 1,
                notify_completion INTEGER DEFAULT 0,
                notify_sensor INTEGER DEFAULT 1,
                created_by TEXT DEFAULT 'system',
                created_at TEXT DEFAULT (datetime('now')),
                last_triggered TEXT,
                last_status TEXT
            )`);
        } catch (e) { /* table already exists */ }

        const notifyMap = {
            'CRITICAL_WO_CREATED': 'notify_critical_wo',
            'PM_DUE_TODAY':        'notify_pm_due',
            'WO_COMPLETED':        'notify_completion',
            'SENSOR_THRESHOLD':    'notify_sensor',
            'APPROVAL_REQUIRED':   'notify_critical_wo',
            'CUSTOM':              'notify_critical_wo',
        };
        const notifyColumn = notifyMap[eventType] || 'notify_critical_wo';

        const webhooks = logisticsDb.prepare(
            `SELECT id, platform, webhook_url FROM webhook_config WHERE enabled = 1 AND ${notifyColumn} = 1`
        ).all();

        if (webhooks.length === 0) return 0;

        const insert = logisticsDb.prepare(`
            INSERT OR IGNORE INTO WebhookOutbox
                (WebhookID, Platform, WebhookUrl, EventType, Payload, IdempotencyKey)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        let queued = 0;
        for (const wh of webhooks) {
            const payload = formatPayload(wh.platform, eventType, data);
            const key = deriveIdempotencyKey(wh.id, eventType, data);
            const r = insert.run(wh.id, wh.platform, wh.webhook_url, eventType, JSON.stringify(payload), key);
            if (r.changes > 0) queued += 1;
        }

        if (queued > 0) console.log(`  📡 [Webhook] Queued ${queued} ${eventType} notification(s) for async delivery`);
        return queued;
    } catch (err) {
        console.warn('  ⚠️ [Webhook] dispatchEvent error:', err.message);
        return 0;
    }
}

// ── Drain worker ──────────────────────────────────────────────────────────────
const MAX_ATTEMPTS = 5;

async function drainWebhookOutbox() {
    let pending;
    try {
        pending = logisticsDb.prepare(`
            SELECT * FROM WebhookOutbox
            WHERE Status = 'pending' AND NextRetryAt <= datetime('now')
            ORDER BY ID ASC
            LIMIT 50
        `).all();
    } catch (e) {
        console.warn('  ⚠️ [Webhook Outbox] Drain query failed:', e.message);
        return;
    }
    if (!pending.length) return;

    for (const row of pending) {
        let payload;
        try { payload = JSON.parse(row.Payload); }
        catch (e) {
            logisticsDb.prepare(
                `UPDATE WebhookOutbox SET Status='failed', LastError=?, SentAt=datetime('now') WHERE ID=?`
            ).run('Malformed payload: ' + e.message, row.ID);
            continue;
        }

        const result = await sendWebhook(row.WebhookUrl, row.Platform, payload);
        const attempts = (row.Attempts || 0) + 1;

        if (result.success) {
            logisticsDb.prepare(
                `UPDATE WebhookOutbox SET Status='sent', Attempts=?, SentAt=datetime('now'), LastError=NULL WHERE ID=?`
            ).run(attempts, row.ID);
            try {
                logisticsDb.prepare(
                    `UPDATE webhook_config SET last_triggered=?, last_status='ok' WHERE id=?`
                ).run(new Date().toISOString(), row.WebhookID);
            } catch (_) { /* best-effort */ }
            continue;
        }

        if (attempts >= MAX_ATTEMPTS) {
            logisticsDb.prepare(
                `UPDATE WebhookOutbox SET Status='failed', Attempts=?, LastError=?, SentAt=datetime('now') WHERE ID=?`
            ).run(attempts, result.error || 'unknown', row.ID);
            try {
                logisticsDb.prepare(
                    `UPDATE webhook_config SET last_triggered=?, last_status=? WHERE id=?`
                ).run(new Date().toISOString(), result.error || 'failed', row.WebhookID);
            } catch (_) { /* best-effort */ }
            console.warn(`  ⚠️ [Webhook Outbox] #${row.ID} failed after ${attempts} attempts: ${result.error}`);
        } else {
            const delayMinutes = Math.pow(2, attempts); // 2, 4, 8, 16 min
            logisticsDb.prepare(
                `UPDATE WebhookOutbox SET Attempts=?, LastError=?, NextRetryAt=datetime('now', '+${delayMinutes} minutes') WHERE ID=?`
            ).run(attempts, result.error || 'unknown', row.ID);
        }
    }
}

// Start the drain loop at module load. unref() keeps the interval from
// holding the Node event loop open during shutdown.
let _webhookDrainTimer = null;
function startWebhookDrainWorker() {
    if (_webhookDrainTimer) return;
    // Fire once immediately so recently-queued events drain without waiting
    // the full 30 s on startup.
    drainWebhookOutbox().catch(err => console.warn('  ⚠️ [Webhook Outbox] Initial drain failed:', err.message));
    _webhookDrainTimer = setInterval(() => {
        drainWebhookOutbox().catch(err => console.warn('  ⚠️ [Webhook Outbox] Drain failed:', err.message));
    }, 30 * 1000);
    _webhookDrainTimer.unref?.();
}
startWebhookDrainWorker();

// ── Test message (synchronous send — used by the admin UI test button) ───────
async function sendTestMessage(webhookUrl, platform) {
    const testData = {
        woNumber: 'TEST-001',
        description: '🧪 Test notification from Trier OS',
        assetId: 'TEST-ASSET',
        priority: 'CRITICAL',
        plant: 'Test Plant',
        message: 'If you can see this, your webhook integration is working!'
    };
    const payload = formatPayload(platform, 'CUSTOM', testData);
    return await sendWebhook(webhookUrl, platform, payload);
}

module.exports = { dispatchEvent, sendTestMessage, drainWebhookOutbox, EVENT_TYPES };
