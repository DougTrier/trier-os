// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Webhook Dispatcher
 * ==========================================
 * Sends real-time notifications to Slack, Teams, Discord, or custom webhooks.
 * 
 * Supported events:
 *   - CRITICAL_WO_CREATED   → Emergency/Critical work order submitted
 *   - PM_DUE_TODAY          → PM schedule auto-generated a work order
 *   - WO_COMPLETED          → Work order marked complete
 *   - SENSOR_THRESHOLD      → (Phase 3) Sensor exceeded defined limit
 *   - CUSTOM                → User-defined event
 */
const { db: logisticsDb } = require('./logistics_db');

const EVENT_TYPES = {
    CRITICAL_WO_CREATED: { emoji: '🚨', label: 'Critical Work Order', color: '#ef4444' },
    PM_DUE_TODAY:        { emoji: '🔧', label: 'PM Due Today',        color: '#f59e0b' },
    WO_COMPLETED:        { emoji: '✅', label: 'Work Order Complete', color: '#10b981' },
    SENSOR_THRESHOLD:    { emoji: '🌡️', label: 'Sensor Alert',        color: '#ef4444' },
    CUSTOM:              { emoji: '📢', label: 'Notification',        color: '#6366f1' }
};

/**
 * Format a Slack Block Kit message
 */
function formatSlackPayload(eventType, data) {
    const evt = EVENT_TYPES[eventType] || EVENT_TYPES.CUSTOM;
    const blocks = [
        {
            type: 'header',
            text: { type: 'plain_text', text: `${evt.emoji} ${evt.label}`, emoji: true }
        },
        {
            type: 'section',
            fields: []
        }
    ];

    // Build fields based on event data
    if (data.woNumber) blocks[1].fields.push({ type: 'mrkdwn', text: `*WO #:*\n${data.woNumber}` });
    if (data.description) blocks[1].fields.push({ type: 'mrkdwn', text: `*Description:*\n${data.description}` });
    if (data.assetId) blocks[1].fields.push({ type: 'mrkdwn', text: `*Asset:*\n${data.assetId}` });
    if (data.priority) blocks[1].fields.push({ type: 'mrkdwn', text: `*Priority:*\n${data.priority}` });
    if (data.plant) blocks[1].fields.push({ type: 'mrkdwn', text: `*Plant:*\n${data.plant}` });
    if (data.assignedTo) blocks[1].fields.push({ type: 'mrkdwn', text: `*Assigned:*\n${data.assignedTo}` });
    if (data.sensorId) blocks[1].fields.push({ type: 'mrkdwn', text: `*Sensor:*\n${data.sensorId}` });
    if (data.value) blocks[1].fields.push({ type: 'mrkdwn', text: `*Reading:*\n${data.value} ${data.unit || ''}` });
    if (data.message) blocks[1].fields.push({ type: 'mrkdwn', text: `*Details:*\n${data.message}` });

    // Timestamp footer
    blocks.push({
        type: 'context',
        elements: [
            { type: 'mrkdwn', text: `📅 ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST | Trier OS` }
        ]
    });

    return {
        text: `${evt.emoji} ${evt.label}: ${data.description || data.message || 'Event triggered'}`,
        blocks
    };
}

/**
 * Format a Microsoft Teams Adaptive Card
 */
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

/**
 * Format a Discord embed
 */
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

/**
 * Send a webhook notification
 */
async function sendWebhook(webhookUrl, platform, payload) {
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            console.warn(`  ⚠️ [Webhook] ${platform} returned ${response.status}: ${response.statusText}`);
            return { success: false, status: response.status, error: response.statusText };
        }
        
        return { success: true, status: response.status };
    } catch (err) {
        console.warn(`  ⚠️ [Webhook] ${platform} failed:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Dispatch an event to all enabled webhooks
 */
async function dispatchEvent(eventType, data) {
    try {
        if (!logisticsDb) return;

        // Ensure table exists
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
        } catch(e) { console.warn(`[Webhook] Config table init warning: ${e.message}`); }

        // Map event type to notify column
        const notifyMap = {
            'CRITICAL_WO_CREATED': 'notify_critical_wo',
            'PM_DUE_TODAY': 'notify_pm_due',
            'WO_COMPLETED': 'notify_completion',
            'SENSOR_THRESHOLD': 'notify_sensor',
            'CUSTOM': 'notify_critical_wo' // custom always goes to critical subscribers
        };

        const notifyColumn = notifyMap[eventType] || 'notify_critical_wo';
        
        const webhooks = logisticsDb.prepare(
            `SELECT * FROM webhook_config WHERE enabled = 1 AND ${notifyColumn} = 1`
        ).all();

        if (webhooks.length === 0) return;

        console.log(`  📡 [Webhook] Dispatching ${eventType} to ${webhooks.length} webhook(s)...`);

        const results = [];
        for (const wh of webhooks) {
            let payload;
            switch (wh.platform) {
                case 'slack':
                    payload = formatSlackPayload(eventType, data);
                    break;
                case 'teams':
                    payload = formatTeamsPayload(eventType, data);
                    break;
                case 'discord':
                    payload = formatDiscordPayload(eventType, data);
                    break;
                default:
                    // Custom — just send raw JSON
                    payload = { event: eventType, timestamp: new Date().toISOString(), ...data };
            }

            const result = await sendWebhook(wh.webhook_url, wh.platform, payload);
            results.push({ id: wh.id, ...result });

            // Update last triggered
            try {
                logisticsDb.prepare(
                    'UPDATE webhook_config SET last_triggered = ?, last_status = ? WHERE id = ?'
                ).run(new Date().toISOString(), result.success ? 'ok' : result.error, wh.id);
            } catch(e) { console.warn(`[Webhook] Failed to update last_triggered: ${e.message}`); }
        }

        return results;
    } catch (err) {
        console.warn('  ⚠️ [Webhook] Dispatch error:', err.message);
        return [];
    }
}

/**
 * Send a test message to a specific webhook
 */
async function sendTestMessage(webhookUrl, platform) {
    const testData = {
        woNumber: 'TEST-001',
        description: '🧪 Test notification from Trier OS',
        assetId: 'TEST-ASSET',
        priority: 'CRITICAL',
        plant: 'Test Plant',
        message: 'If you can see this, your webhook integration is working!'
    };

    let payload;
    switch (platform) {
        case 'slack': payload = formatSlackPayload('CUSTOM', testData); break;
        case 'teams': payload = formatTeamsPayload('CUSTOM', testData); break;
        case 'discord': payload = formatDiscordPayload('CUSTOM', testData); break;
        default: payload = { event: 'TEST', timestamp: new Date().toISOString(), ...testData };
    }

    return await sendWebhook(webhookUrl, platform, payload);
}

module.exports = { dispatchEvent, sendTestMessage, EVENT_TYPES };
