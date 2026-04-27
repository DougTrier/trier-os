// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * guide.js — Guided Execution API Routes
 * =========================================
 * Express router for the Guided Execution engine.  Handles one endpoint:
 * writing the execution telemetry record when a guided workflow ends
 * (either COMPLETE or ABANDONED).
 *
 * Records are written to two stores in trier_logistics.db:
 *   1. GuideExecutionLog — structured telemetry with per-step attempt counts
 *   2. AuditLog (via logAudit) — cross-reference in the system-wide audit trail
 *
 * Only executions that reached ACTIVE status are recorded here.  Pre-start
 * eligibility blocks (missing context, insufficient role) never reach this
 * endpoint — they are handled client-side with no server write.
 *
 * Observability principle: logging is write-only telemetry.  This route
 * never returns data that influences the guide engine's control flow.
 *
 * -- ROUTES ----------------------------------------------------
 *   POST /api/guide/complete  — Write guided workflow execution record
 */
const express      = require('express');
const router       = express.Router();
const { logAudit, db: logisticsDb } = require('../logistics_db');

// POST /api/guide/complete
// Body: {
//   workflowId, workflowVersion, outcome, failureReason,
//   startedAt, completedAt, totalElapsedMs,
//   steps: [{ stepId, startedAt, completedAt, attempts }]
// }
router.post('/complete', (req, res) => {
    const {
        workflowId,
        workflowVersion = 1,
        outcome         = 'COMPLETE',
        failureReason   = null,
        startedAt,
        completedAt,
        totalElapsedMs,
        steps,
    } = req.body;

    if (!workflowId || typeof workflowId !== 'string') {
        return res.status(400).json({ error: 'workflowId is required' });
    }
    if (!Array.isArray(steps)) {
        return res.status(400).json({ error: 'steps must be an array' });
    }
    if (!['COMPLETE', 'ABANDONED'].includes(outcome)) {
        return res.status(400).json({ error: 'outcome must be COMPLETE or ABANDONED' });
    }

    const userId  = req.user?.Username || 'unknown';
    const plantId = req.headers['x-plant-id'] || null;
    const now     = new Date().toISOString();

    // ── 1. Structured telemetry record ─────────────────────────────────────────
    try {
        logisticsDb.prepare(`
            INSERT INTO GuideExecutionLog
                (WorkflowId, WorkflowVersion, UserId, PlantId,
                 Outcome, FailureReason,
                 StartedAt, CompletedAt, TotalElapsedMs,
                 StepCount, StepsJson)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            workflowId,
            workflowVersion,
            userId,
            plantId,
            outcome,
            failureReason || null,
            startedAt  || now,
            completedAt || now,
            typeof totalElapsedMs === 'number' ? totalElapsedMs : 0,
            steps.length,
            JSON.stringify(steps.slice(0, 50)),  // cap at 50 steps
        );
    } catch (err) {
        // Table may not exist yet (migration pending) — log warning, don't block response
        console.warn('[guide/complete] GuideExecutionLog insert failed (non-fatal):', err.message);
    }

    // ── 2. Cross-reference in system-wide AuditLog ─────────────────────────────
    logAudit(
        userId,
        outcome === 'COMPLETE' ? 'GUIDED_WORKFLOW_COMPLETE' : 'GUIDED_WORKFLOW_ABANDONED',
        plantId,
        {
            workflowId,
            workflowVersion,
            outcome,
            failureReason:  failureReason || null,
            stepCount:      steps.length,
            totalElapsedMs: typeof totalElapsedMs === 'number' ? totalElapsedMs : 0,
        },
        'INFO',
        req.ip
    );

    res.json({ success: true });
});

module.exports = router;
