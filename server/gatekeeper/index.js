// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * gatekeeper/index.js — Gatekeeper Service (P2-2)
 * ================================================
 * Isolated safety enforcement process. Validates all governed write intents
 * from the Trier OS main process before they are executed. Binds exclusively
 * to the loopback interface (127.0.0.1) — never reachable from outside the host.
 *
 * Fail-closed contract: any internal error returns allowed:false.
 * Uses the Change Validation Engine (engine.js, Task G6) for all processing.
 *
 * ROUTES:
 *   POST /validate-intent   Validate a write intent; returns { allowed, requestId, denialReason, auditRef }
 */

const express = require('express');
const { runPipeline } = require('./engine');

const PORT = process.env.GATEKEEPER_PORT || 4001;
const app = express();

app.use(express.json());

app.post('/validate-intent', async (req, res) => {
    try {
        const result = await runPipeline(req.body);
        res.json(result);
    } catch (err) {
        console.error('[GATEKEEPER] Unexpected error outside engine:', err);
        res.json({ allowed: false, denialReason: 'GATEKEEPER_INTERNAL_ERROR' });
    }
});

app.post('/pre-certify', async (req, res) => {
    try {
        const intent = req.body;
        if (!intent || !intent.actionType) {
            return res.json({ certified: false, causalExplanation: 'MALFORMED_INTENT', passed: [], failed: [] });
        }
        const { runConstraints } = require('./constraints/index');        
        const result = await runConstraints(intent);
        res.json(result);
    } catch (err) {
        console.error('[GATEKEEPER] Pre-certify error:', err);
        res.json({ certified: false, causalExplanation: 'INTERNAL_ERROR', passed: [], failed: [] });
    }
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`[GATEKEEPER] Service listening on 127.0.0.1:${PORT}`);
});
