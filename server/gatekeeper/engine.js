// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * engine.js — Gatekeeper Change Validation Engine
 * =================================================
 * Orchestrates the 7-step validation pipeline for all governed write intents.
 * Replaces the stub in index.js. Called once per intent; always resolves.
 *
 * Pipeline:
 *   1. Schema validation   — required fields present
 *   2. Idempotency         — reject duplicate requestId
 *   3. Governance tier     — READ_ONLY/ADVISORY bypass all validators
 *   4. RBAC                — validateRole (all governed classes)
 *   5. PTW                 — validatePTW (SAFETY_CRITICAL only)
 *   6. MOC                 — validateMOC (SAFETY_CRITICAL only)
 *   6.6. Constraint cert   — runConstraints, write ProofReceipts, block on violation
 *   6.5. Adapter dispatch  — dispatch (SETPOINT_WRITE, SAFETY_PARAM_CHANGE)
 *   7. Decision + audit    — write GatekeeperAuditLedger, return result
 *
 * Returns: { allowed, denialReason?, ptwRef?, mocRef?, auditRef?, processingMs }
 *
 * Fail-closed: any unhandled exception returns allowed:false, ENGINE_INTERNAL_ERROR.
 */

'use strict';

const crypto = require('crypto');
const { getActionClass, isGoverned } = require('./action_registry');
const { validateRole } = require('./validators/rbac');
const { runConstraints } = require('./constraints/index');
const { validatePTW } = require('./validators/ptw');
const { validateMOC } = require('./validators/moc');
const { writeAuditRecord } = require('./audit');
const { dispatch, ADAPTER_DISPATCHED_ACTIONS } = require('./adapters/index');

async function _writeAudit(intent, actionClass, validationResult, denialReason, ptwRef, mocRef, processingMs) {
    return writeAuditRecord({
        requestId:        intent.requestId,
        userId:           intent.userId,
        username:         intent.username,
        plantId:          intent.plantId || null,
        actionClass:      actionClass,
        actionType:       intent.actionType,
        targetType:       intent.targetType || null,
        targetId:         intent.targetId  || null,
        validationResult: validationResult,
        denialReason:     denialReason  || null,
        ptwRef:           ptwRef        || null,
        mocRef:           mocRef        || null,
        roleAtDecision:   actionClass,
        processingMs:     processingMs
    });
}

async function runPipeline(intent) {
    const startMs = Date.now();
    try {
        // Step 1 — Schema validation
        if (!intent || !intent.requestId || !intent.userId || !intent.username || !intent.actionType) {
            return { allowed: false, denialReason: 'MALFORMED_INTENT', processingMs: Date.now() - startMs };
        }

        // Step 2 — Idempotency
        const { db: logisticsDb } = require('../logistics_db');
        const existing = logisticsDb.prepare(
            'SELECT LedgerID FROM GatekeeperAuditLedger WHERE RequestID = ?'
        ).get(intent.requestId);
        if (existing) {
            return { allowed: false, denialReason: 'DUPLICATE_REQUEST_ID', processingMs: Date.now() - startMs };
        }

        // Step 3 — Governance tier
        let actionClass;
        try {
            actionClass = getActionClass(intent.actionType);
        } catch (_) {
            return { allowed: false, denialReason: 'UNKNOWN_ACTION_TYPE', processingMs: Date.now() - startMs };
        }

        if (!isGoverned(intent.actionType)) {
            // READ_ONLY and ADVISORY — no validators, no audit write
            return { allowed: true, processingMs: Date.now() - startMs };
        }

        // Step 4 — RBAC
        intent.actionClass = actionClass;
        const rbacResult = await validateRole(intent);
        if (!rbacResult.allowed) {
            await _writeAudit(intent, actionClass, 'DENIED', rbacResult.denialReason, null, null, Date.now() - startMs);
            return { allowed: false, denialReason: rbacResult.denialReason, processingMs: Date.now() - startMs };
        }

        // Step 5 — PTW (SAFETY_CRITICAL only)
        let ptwResult = { allowed: true, ptwRef: null };
        if (actionClass === 'SAFETY_CRITICAL') {
            ptwResult = await validatePTW(intent);
            if (!ptwResult.allowed) {
                await _writeAudit(intent, actionClass, 'DENIED', ptwResult.denialReason, null, null, Date.now() - startMs);
                return { allowed: false, denialReason: ptwResult.denialReason, processingMs: Date.now() - startMs };
            }
        }

        // Step 6 — MOC (SAFETY_CRITICAL only)
        let mocResult = { allowed: true, mocRef: null };
        if (actionClass === 'SAFETY_CRITICAL') {
            mocResult = await validateMOC(intent);
            if (!mocResult.allowed) {
                await _writeAudit(intent, actionClass, 'DENIED', mocResult.denialReason, ptwResult.ptwRef, null, Date.now() - startMs);
                return { allowed: false, denialReason: mocResult.denialReason, processingMs: Date.now() - startMs };
            }
        }

        // Step 6.6 — Constraint certification
        const certResult = await runConstraints(intent);
        const certAt = new Date().toISOString();
        let certHash = null;
        if (certResult.certified) {
            const canonical = [
                intent.requestId,
                intent.actionType,
                intent.targetId || '',
                certResult.passed.slice().sort().join(','),
                certAt
            ].join('|');
            certHash = crypto.createHash('sha256').update(canonical).digest('hex');
        }
        try {
            logisticsDb.prepare(`
                INSERT INTO ProofReceipts
                    (RequestID, CertAt, ConstraintsPassed, ConstraintsFailed, CausalExplanation, CertHash, Certified)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                intent.requestId,
                certAt,
                JSON.stringify(certResult.passed),
                JSON.stringify(certResult.failed),
                certResult.causalExplanation || null,
                certHash,
                certResult.certified ? 1 : 0
            );
        } catch (_) {}
        if (!certResult.certified) {
            await _writeAudit(intent, actionClass, 'DENIED', 'CONSTRAINT_VIOLATION', ptwResult.ptwRef, mocResult.mocRef, Date.now() - startMs);
            return {
                allowed: false,
                denialReason: 'CONSTRAINT_VIOLATION',
                causalExplanation: certResult.causalExplanation,
                constraintsFailed: certResult.failed,
                processingMs: Date.now() - startMs
            };
        }

        // Step 6.5 — Adapter dispatch (SETPOINT_WRITE and SAFETY_PARAM_CHANGE)
        let executionResult = { dispatched: false };
        if (ADAPTER_DISPATCHED_ACTIONS.has(intent.actionType)) {
            executionResult = await dispatch(intent);
            if (!executionResult.success) {
                await _writeAudit(intent, actionClass, 'DENIED', 'ADAPTER_EXECUTION_FAILED', ptwResult.ptwRef, mocResult.mocRef, Date.now() - startMs);
                return { allowed: false, denialReason: 'ADAPTER_EXECUTION_FAILED', executionResult, processingMs: Date.now() - startMs };
            }
        }

        // Step 7 — Decision
        const auditRef = await _writeAudit(intent, actionClass, 'ALLOWED', null, ptwResult.ptwRef, mocResult.mocRef, Date.now() - startMs);
        return { allowed: true, auditRef, ptwRef: ptwResult.ptwRef, mocRef: mocResult.mocRef, executionResult, certHash, constraintsPassed: certResult.passed, processingMs: Date.now() - startMs };

    } catch (err) {
        console.error('[ENGINE] Unhandled error:', err);
        return { allowed: false, denialReason: 'ENGINE_INTERNAL_ERROR', processingMs: Date.now() - startMs };
    }
}

module.exports = { runPipeline };
