// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * GuidedExecution.jsx — Guided Execution Engine
 * ================================================
 * Orchestrates step-by-step guided workflows. Receives a workflowId,
 * runs the eligibility and risk gates, navigates to each step's target
 * route, resolves the data-guide anchor, highlights the target element,
 * and polls the validation registry until each step is confirmed complete.
 *
 * This component owns no business logic. Every decision is delegated to
 * the five registries or derived from the schema. I-GE1 through I-GE5
 * are enforced here — see docs/GUIDED_EXECUTION_DESIGN.md.
 *
 * Panel positioning (I-GE5 — guidance must never block execution):
 *   Desktop (≥640px): fixed panel docked to the right edge, vertically
 *     centered. Never covers the centered 800px wizard modal or the
 *     left-side WO list at 1280px.
 *   Mobile (<640px): bottom sheet. Never covers content above it.
 *
 * -- API DEPENDENCIES ------------------------------------------
 *   POST /api/guide/complete  — Write audit record on workflow completion
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import GUIDED_WORKFLOWS from '../data/guidedWorkflows';
import { buildContext, runCheck } from '../utils/guideValidation';
import { resolveRequired } from '../utils/guideContext';
import { resolveAnchor, scrollAnchorIntoView } from '../utils/guideAnchor';
import { evaluateRiskGate } from '../utils/guideRiskGate';
import { resolveRoute } from '../utils/guideNavigation';

// Engine status values — not exposed outside this component
const STATUS = {
    LOADING:  'loading',
    BLOCKED:  'blocked',
    ACTIVE:   'active',
    COMPLETE: 'complete',
};

export default function GuidedExecution({ workflowId, onExit }) {
    const { t }    = useTranslation();
    const navigate = useNavigate();

    const [status,       setStatus]       = useState(STATUS.LOADING);
    const [workflow,     setWorkflow]     = useState(null);
    const [currentStep,  setCurrentStep]  = useState(0);
    const [blockMessage, setBlockMessage] = useState(null);
    const [stepError,    setStepError]    = useState(null);

    const activeElRef  = useRef(null);   // currently highlighted DOM element
    const intervalRef  = useRef(null);   // 500ms validation polling interval
    const startTimeRef = useRef(Date.now());
    const stepTimesRef = useRef([]);     // [{stepId, startedAt, completedAt, attempts}]
    const auditSentRef = useRef(false);  // prevent duplicate telemetry writes
    const stepErrorRef = useRef(null);   // last step error (anchor fail / stuck validation)

    // ── Inject highlight CSS (self-cleaning on unmount) ───────────────────────
    useEffect(() => {
        const style      = document.createElement('style');
        style.id         = 'trier-guide-highlight';
        style.textContent =
            '[data-guide-active]{' +
            'outline:2px solid #3b82f6!important;' +
            'outline-offset:3px!important;' +
            'border-radius:4px!important;' +
            'box-shadow:0 0 0 7px rgba(59,130,246,0.12)!important;}';
        document.head.appendChild(style);
        return () => document.getElementById('trier-guide-highlight')?.remove();
    }, []);

    // ── Clean up highlight and polling on unmount ─────────────────────────────
    useEffect(() => {
        return () => {
            clearInterval(intervalRef.current);
            clearHighlight();
        };
    }, []);

    // ── Write telemetry on COMPLETE (once) ───────────────────────────────────
    useEffect(() => {
        if (status !== STATUS.COMPLETE || auditSentRef.current) return;
        auditSentRef.current = true;
        writeExecutionLog('COMPLETE', null);
    }, [status, workflowId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── STEP 1: ELIGIBILITY GATE ──────────────────────────────────────────────
    useEffect(() => {
        setStatus(STATUS.LOADING);
        setBlockMessage(null);
        setStepError(null);
        auditSentRef.current = false;

        // I-GE4 — schema must exist in the allowlist
        const schema = GUIDED_WORKFLOWS[workflowId];
        if (!schema) {
            setBlockMessage('guide.error.schemaNotFound');
            setStatus(STATUS.BLOCKED);
            return;
        }

        // I-GE4 — all required context keys must resolve to non-null
        const { missing } = resolveRequired(schema.eligibility?.requiredContext || []);
        if (missing.length > 0) {
            const key = missing[0];
            setBlockMessage(
                key === 'plantId'     ? 'guide.error.missingPlant' :
                key === 'workOrderId' ? 'guide.error.missingContext' :
                                        'guide.error.missingContext'
            );
            setStatus(STATUS.BLOCKED);
            return;
        }

        // I-GE4 — all prerequisite checks must pass against current state
        const ctx = buildContext();
        for (const checkKey of (schema.eligibility?.prerequisiteChecks || [])) {
            if (!runCheck(checkKey, ctx)) {
                setBlockMessage(
                    checkKey === 'workOrderSelected'  ? 'guide.error.missingContext' :
                    checkKey === 'workOrderNotClosed' ? 'guide.error.workOrderClosed' :
                    checkKey === 'plantContextValid'  ? 'guide.error.missingPlant' :
                                                        'guide.error.missingContext'
                );
                setStatus(STATUS.BLOCKED);
                return;
            }
        }

        // I-GE4 — risk gate: user role must meet minimum for this workflow's risk level
        const userRole     = localStorage.getItem('userRole') || '';
        const riskDecision = evaluateRiskGate(schema.risk, userRole);
        if (!riskDecision.allowed) {
            setBlockMessage(riskDecision.blockedReason);
            setStatus(STATUS.BLOCKED);
            return;
        }

        // All gates passed — begin execution
        setWorkflow(schema);
        setCurrentStep(0);
        startTimeRef.current  = Date.now();
        stepTimesRef.current  = [];
        setStatus(STATUS.ACTIVE);
    }, [workflowId]);

    // ── STEP 2: ACTIVE STEP — navigate, anchor, highlight, poll ──────────────
    useEffect(() => {
        if (status !== STATUS.ACTIVE || !workflow) return;

        const step = workflow.steps[currentStep];
        if (!step) return;

        // Record step start (attempts initialised to 0 — incremented each poll cycle)
        stepTimesRef.current = [
            ...stepTimesRef.current.filter(s => s.stepId !== step.id),
            { stepId: step.id, startedAt: new Date().toISOString(), attempts: 0 },
        ];

        // Navigate to the step's route if not already there (allowlisted)
        const routeRes = resolveRoute(step.target.route);
        if (routeRes.ok && window.location.pathname !== routeRes.route) {
            navigate(routeRes.route);
        }

        // Delay anchor resolution to let React Router navigation commit
        const anchorTimeout = setTimeout(() => {
            clearHighlight();

            const el = resolveAnchor(step.target.anchor);
            if (!el) {
                stepErrorRef.current = step.onFailure.message;
                setStepError(step.onFailure.message);
                return;
            }

            setStepError(null);
            el.setAttribute('data-guide-active', 'true');
            scrollAnchorIntoView(el);
            activeElRef.current = el;

            // Poll every 500ms — I-GE3: state proves completion, not a click
            clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
                // Increment attempt counter for this step — direct ref mutation, no render
                const rec = stepTimesRef.current.find(s => s.stepId === step.id);
                if (rec) rec.attempts += 1;

                if (runCheck(step.validation.check, buildContext())) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;

                    // Record step completion
                    stepTimesRef.current = stepTimesRef.current.map(s =>
                        s.stepId === step.id
                            ? { ...s, completedAt: new Date().toISOString() }
                            : s
                    );

                    clearHighlight();

                    if (currentStep < workflow.steps.length - 1) {
                        setCurrentStep(c => c + 1);
                    } else {
                        setStatus(STATUS.COMPLETE);
                    }
                }
            }, 500);
        }, 350);

        return () => {
            clearTimeout(anchorTimeout);
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        };
    }, [status, workflow, currentStep, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── EXIT (user-initiated) ─────────────────────────────────────────────────
    function handleExit() {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        clearHighlight();
        // Write ABANDONED telemetry only when execution was active.
        // Dismissed BLOCKED panels never reached ACTIVE — no record needed.
        if (status === STATUS.ACTIVE && !auditSentRef.current) {
            auditSentRef.current = true;
            writeExecutionLog('ABANDONED', stepErrorRef.current);
        }
        onExit?.();
    }

    // ── Fire-and-forget telemetry write (never blocks UI) ────────────────────
    function writeExecutionLog(outcome, failureReason) {
        fetch('/api/guide/complete', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                workflowId,
                workflowVersion: 1,
                outcome,
                failureReason:   failureReason ?? null,
                startedAt:       new Date(startTimeRef.current).toISOString(),
                completedAt:     new Date().toISOString(),
                totalElapsedMs:  Date.now() - startTimeRef.current,
                steps:           stepTimesRef.current,
            }),
        }).catch(err => console.warn('[GuidedExecution] Telemetry write failed (non-fatal):', err.message));
    }

    function clearHighlight() {
        if (activeElRef.current) {
            activeElRef.current.removeAttribute('data-guide-active');
            activeElRef.current = null;
        }
    }

    // ── PANEL POSITIONING — I-GE5: panel never occludes target ───────────────
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const panelStyle = isMobile
        ? {
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: 'rgba(15,23,42,0.98)',
            borderTop: '1px solid rgba(59,130,246,0.3)',
            padding: '14px 16px 18px',
            zIndex: 99990,
            color: '#f1f5f9',
          }
        : {
            position: 'fixed', right: '16px', top: '50%', transform: 'translateY(-50%)',
            width: '256px',
            background: 'rgba(15,23,42,0.97)',
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: '12px',
            padding: '18px',
            zIndex: 99990,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            color: '#f1f5f9',
          };

    const labelStyle  = { fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' };
    const bodyStyle   = { margin: '0 0 14px 0', fontSize: '0.85rem', lineHeight: '1.55', color: '#e2e8f0' };
    const exitBtnStyle = {
        width: '100%', padding: '7px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '6px',
        color: '#64748b', cursor: 'pointer', fontSize: '0.78rem',
    };

    // ── RENDER (via portal so z-index is never blocked by modal stacking) ─────
    const panel = (
        <div style={panelStyle} data-testid="guide-panel">

            {/* ── LOADING ── */}
            {status === STATUS.LOADING && (
                <span style={{ fontSize: '0.8rem', color: '#475569' }}>…</span>
            )}

            {/* ── BLOCKED ── */}
            {status === STATUS.BLOCKED && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ ...labelStyle, color: '#ef4444' }}>{t('guide.label.blocked')}</span>
                        <button onClick={handleExit} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                            <X size={16} />
                        </button>
                    </div>
                    <p style={{ ...bodyStyle, color: '#fca5a5' }}>
                        {t(blockMessage || 'guide.error.missingContext')}
                    </p>
                    <button onClick={handleExit} style={exitBtnStyle}>{t('guide.label.exit')}</button>
                </>
            )}

            {/* ── ACTIVE ── */}
            {status === STATUS.ACTIVE && workflow && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ ...labelStyle, color: '#3b82f6' }}>
                            {t('guide.label.step')} {currentStep + 1} {t('guide.label.of')} {workflow.steps.length}
                        </span>
                        <button onClick={handleExit} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0, lineHeight: 1 }} title={t('guide.label.exit')}>
                            <X size={16} />
                        </button>
                    </div>
                    <p style={bodyStyle}>
                        {t(workflow.steps[currentStep].instruction)}
                    </p>
                    {stepError && (
                        <p style={{ margin: '-6px 0 10px', fontSize: '0.76rem', color: '#fca5a5', lineHeight: '1.4' }}>
                            {t(stepError)}
                        </p>
                    )}
                    <button onClick={handleExit} style={exitBtnStyle}>{t('guide.label.exit')}</button>
                </>
            )}

            {/* ── COMPLETE ── */}
            {status === STATUS.COMPLETE && (
                <>
                    <div style={{ marginBottom: '10px' }}>
                        <span style={{ ...labelStyle, color: '#10b981' }}>{t('guide.label.complete')}</span>
                    </div>
                    <p style={{ ...bodyStyle, color: '#d1fae5' }}>
                        {t('guide.closeout.complete')}
                    </p>
                    <button
                        onClick={handleExit}
                        style={{ ...exitBtnStyle, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399', fontWeight: 600 }}
                    >
                        {t('guide.label.done')}
                    </button>
                </>
            )}

        </div>
    );

    return createPortal(panel, document.body);
}
