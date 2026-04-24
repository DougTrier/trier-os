// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * bus.js — NATS Message Bus Singleton
 * =====================================
 * Manages the NATS client connection for inter-process event broadcasting.
 * Used by background_cron.js (publisher) and index.js (subscriber).
 *
 * Fail-soft: if NATS is unreachable, publish() is a silent no-op.
 * The bus being down must never crash a caller.
 *
 * Usage:
 *   const bus = require('./services/bus');
 *   await bus.connect();
 *   bus.publish('trier.anomaly.detected', { timestamp: '...' });
 *   await bus.subscribe('trier.anomaly.detected', handler);
 */

'use strict';

const { connect: natsConnect, JSONCodec } = require('nats');

const jc = JSONCodec();
let nc = null;

async function connect() {
    try {
        nc = await natsConnect({
            servers: process.env.NATS_URL || 'nats://localhost:4222',
            maxReconnectAttempts: -1,
            reconnectTimeWait: 2000,
        });
        console.log('[BUS] Connected to NATS:', process.env.NATS_URL || 'nats://localhost:4222');

        (async () => {
            for await (const s of nc.status()) {
                if (s.type === 'disconnect') console.warn('[BUS] NATS disconnected — publish calls will no-op');
                if (s.type === 'reconnect')  console.log('[BUS] NATS reconnected');
            }
        })().catch(() => {});

    } catch (err) {
        console.warn('[BUS] Could not connect to NATS — bus disabled:', err.message);
        nc = null;
    }
}

function publish(subject, data) {
    if (!nc) return;
    try {
        nc.publish(subject, jc.encode(data));
    } catch (err) {
        console.warn('[BUS] Publish failed on', subject, '—', err.message);
    }
}

async function subscribe(subject, handler) {
    if (!nc) {
        console.warn('[BUS] Cannot subscribe to', subject, '— bus not connected');
        return;
    }
    const sub = nc.subscribe(subject);
    (async () => {
        for await (const msg of sub) {
            try { handler(jc.decode(msg.data)); }
            catch (err) { console.warn('[BUS] Handler error on', subject, '—', err.message); }
        }
    })().catch(err => console.warn('[BUS] Subscription loop error on', subject, '—', err.message));
}

async function drain() {
    if (nc) {
        try { await nc.drain(); }
        catch (_) {}
    }
}

module.exports = { connect, publish, subscribe, drain };
