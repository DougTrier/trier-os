// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * background_cron.js — Background Cron Worker (Standalone Runtime)
 * =================================================================
 * Consolidated non-request-path cron jobs extracted from server/index.js
 * as part of P2-1 / F2 runtime isolation:
 *   - Metric rollup (fires at 08:00 and 15:00 daily)
 *   - Utility anomaly detection (every 15 min)
 *   - Scheduled report delivery (every 15 min)
 *
 * Start: node server/runtimes/background_cron.js
 */

'use strict';

require('dotenv').config();

const { runMetricRollup }      = require('../services/metric-rollup');
const { runUtilityAnomalyCheck } = require('../routes/utilities');
const bus = require('../services/bus');
const CircuitBreaker = require('opossum');

// ── Metric Rollup — fires at 08:00 and 15:00 ─────────────────────────────────
let _lastRollupHour = null;
setInterval(() => {
    const now  = new Date();
    const hour = now.getHours();
    const min  = now.getMinutes();
    if ((hour === 8 || hour === 15) && min < 5 && _lastRollupHour !== `${now.toDateString()}_${hour}`) {
        _lastRollupHour = `${now.toDateString()}_${hour}`;
        runMetricRollup().catch(err => console.warn('[MetricRollup] Cron failed:', err.message));
    }
}, 60 * 1000);

// ── Utility Anomaly Detection — every 15 min ──────────────────────────────────
setInterval(() => {
    try {
        runUtilityAnomalyCheck();
        bus.publish('trier.anomaly.detected', { timestamp: new Date().toISOString() });
    } catch (e) {
        console.warn('[UtilityAlerts] Cron failed:', e.message);
    }
}, 15 * 60 * 1000);
setImmediate(() => { try { runUtilityAnomalyCheck(); } catch (_) {} });

// ── Email Circuit Breaker ─────────────────────────────────────────────────────
// Wraps SMTP sends. Failure suppresses emails and logs — does NOT change system
// mode. An SMTP outage blocking all plant writes would be a disproportionate
// response to a non-critical connector.
async function sendEmailAttempt(report, recipients) {
    const emailService = require('../email_service_sender');
    if (!emailService || typeof emailService.sendScheduledReport !== 'function') {
        throw new Error('Email service not available');
    }
    return emailService.sendScheduledReport(report, recipients);
}

const emailBreaker = new CircuitBreaker(sendEmailAttempt, {
    timeout:                  15000,
    errorThresholdPercentage: 50,
    resetTimeout:             60000,
    volumeThreshold:          2,
});
emailBreaker.on('open',     () => console.warn('[BACKGROUND_CRON] Email circuit OPEN — SMTP unreachable, sends suppressed'));
emailBreaker.on('halfOpen', () => console.log('[BACKGROUND_CRON] Email circuit HALF-OPEN — testing SMTP recovery'));
emailBreaker.on('close',    () => console.log('[BACKGROUND_CRON] Email circuit CLOSED — SMTP recovered'));

// ── Scheduled Report Delivery — every 15 min ─────────────────────────────────
setInterval(async () => {
    try {
        const { db: logDb } = require('../logistics_db');
        const hasTbl = logDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ScheduledReports'").get();
        if (!hasTbl) return;

        const now = new Date().toISOString();
        const dueReports = logDb.prepare(
            `SELECT * FROM ScheduledReports WHERE active = 1 AND nextSend <= ? ORDER BY nextSend ASC`
        ).all(now);

        if (dueReports.length === 0) return;

        const emailService = require('../email_service_sender');

        for (const report of dueReports) {
            try {
                const recipients = (report.recipients || '').split(/[,;\s]+/).filter(Boolean);
                if (recipients.length === 0) continue;

                const [hours, minutes] = (report.timeOfDay || '07:00').split(':').map(Number);
                const next = new Date();
                next.setHours(hours, minutes, 0, 0);
                if (report.schedule === 'daily') {
                    next.setDate(next.getDate() + 1);
                } else if (report.schedule === 'weekly') {
                    const daysUntil = ((report.dayOfWeek || 1) - next.getDay() + 7) % 7 || 7;
                    next.setDate(next.getDate() + daysUntil);
                } else if (report.schedule === 'monthly') {
                    next.setDate(report.dayOfMonth || 1);
                    if (next <= new Date()) next.setMonth(next.getMonth() + 1);
                }

                let sent = false;
                try {
                    await emailBreaker.fire(report, recipients);
                    sent = true;
                } catch (emailErr) {
                    console.warn(`[ScheduledReports] Email blocked (breaker open or failed): ${emailErr.message}`);
                }

                logDb.prepare(
                    `UPDATE ScheduledReports SET lastSent = ?, nextSend = ? WHERE id = ?`
                ).run(now, next.toISOString(), report.id);

                console.log(`[ScheduledReports] ${sent ? 'Sent' : 'Skipped (no email)'}: "${report.reportName}" → ${recipients.join(', ')} | Next: ${next.toISOString().split('T')[0]}`);

            } catch (reportErr) {
                console.error(`[ScheduledReports] Failed to process report ${report.id}:`, reportErr.message);
            }
        }
    } catch (e) {
        console.warn('[ScheduledReports] Cron check failed:', e.message);
    }
}, 15 * 60 * 1000);

(async () => {
    await bus.connect();
    console.log('[BACKGROUND_CRON] Running: metric-rollup (08:00/15:00), utility-anomaly (15min), scheduled-reports (15min).');
})();

async function shutdown() {
    console.log('[BACKGROUND_CRON] Shutting down.');
    await bus.drain();
    process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
