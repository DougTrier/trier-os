// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * ScanActionPrompt.jsx — Scan State Machine — Action Prompt Layer
 * ================================================================
 * Context-adaptive tap-only prompt shown after ScanCapture delivers a
 * branch response from POST /api/scan. Renders the correct option set
 * based on the server-resolved decision branch — the layout and choices
 * are fully driven by the branch response, not client-side state guessing.
 *
 * Covers all prompt surfaces defined in the scan state machine spec:
 *   ROUTE_TO_ACTIVE_WO / SOLO        → Close WO, Waiting, Escalate, Continue Later
 *   ROUTE_TO_ACTIVE_WO / MULTI_TECH  → Leave Work, Close for Team, Waiting, Escalate, Continue Later
 *   ROUTE_TO_ACTIVE_WO / OTHER_USER  → Join, Take Over, Escalate
 *   ROUTE_TO_WAITING_WO              → Resume Waiting WO, Create New WO, View Status
 *   ROUTE_TO_ESCALATED_WO            → Join Response, Take Over Response, View Status
 *   AUTO_CREATE_WO                   → Confirmation only (no further action needed)
 *   AUTO_REJECT_DUPLICATE_SCAN       → Warning only
 *
 * When the WAITING option is selected, a secondary picker surfaces the
 * hold reason taxonomy (tech-selectable codes only). SCHEDULED_RETURN
 * additionally prompts for a return window (tap-only, no keyboard).
 *
 * All choices submit to POST /api/scan/action. Result is passed to parent
 * via onActionComplete so the parent can refresh the WO list or close the modal.
 *
 * -- API DEPENDENCIES ------------------------------------------
 *   POST /api/scan/action    Submit user choice; receive next state
 *
 * -- PROPS -----------------------------------------------------
 *   plantId         {string}    Plant DB scope
 *   userId          {string}    Authenticated user
 *   scanId          {string}    scanId from the original scan event
 *   deviceTimestamp {string}    ISO timestamp from the original scan
 *   branchResponse  {object}    Full response from POST /api/scan
 *   onActionComplete {function} Called with action result when done
 *   onCancel        {function}  Called when user dismisses without action
 */

import React, { useState, useCallback } from 'react';
import { CheckCircle, Clock, AlertTriangle, Users, UserCheck, UserX, Plus, Eye, ArrowLeft } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

// ── Tech-selectable hold reason codes (never show UNKNOWN_HOLD on device) ────
const HOLD_REASONS = [
    { code: 'WAITING_ON_PARTS',     label: 'Waiting on Parts',        exempt: true  },
    { code: 'WAITING_ON_VENDOR',    label: 'Waiting on Vendor',       exempt: true  },
    { code: 'WAITING_ON_APPROVAL',  label: 'Waiting on Approval',     exempt: true  },
    { code: 'SCHEDULED_RETURN',     label: 'Scheduled Return',        exempt: true  },
    { code: 'CONTINUE_LATER',       label: 'Continue Later',          exempt: false },
    { code: 'SHIFT_END_UNRESOLVED', label: 'Shift End — Unresolved',  exempt: false },
];

// ── SCHEDULED_RETURN window options (no keyboard — tap only) ─────────────────
const RETURN_WINDOWS = [
    { code: 'LATER_THIS_SHIFT', label: 'Later This Shift' },
    { code: 'NEXT_SHIFT',       label: 'Next Shift'       },
    { code: 'TOMORROW',         label: 'Tomorrow'         },
];

// ── Shared tap button style ───────────────────────────────────────────────────
function TapBtn({ children, onClick, variant = 'default', disabled = false, number }) {
    const colors = {
        default:  { bg: '#1e3a5f', border: '#2563eb', text: '#93c5fd' },
        success:  { bg: '#14532d', border: '#16a34a', text: '#86efac' },
        warning:  { bg: '#431407', border: '#c2410c', text: '#fdba74' },
        danger:   { bg: '#3b0764', border: '#7c3aed', text: '#c4b5fd' },
        neutral:  { bg: '#1e293b', border: '#334155', text: '#94a3b8' },
    };
    const c = colors[variant] || colors.default;
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '16px 20px', borderRadius: 12, width: '100%',
                background: disabled ? '#0f172a' : c.bg,
                border: `1px solid ${disabled ? '#1e293b' : c.border}`,
                color: disabled ? '#475569' : c.text,
                fontSize: 16, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
                textAlign: 'left', marginBottom: 8, transition: 'opacity 0.15s',
            }}
        >
            {number !== undefined && (
                <span style={{
                    minWidth: 28, height: 28, borderRadius: '50%',
                    background: disabled ? '#1e293b' : c.border,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                    {number}
                </span>
            )}
            {children}
        </button>
    );
}

export default function ScanActionPrompt({
    plantId, userId, scanId, deviceTimestamp, branchResponse,
    onActionComplete, onCancel,
}) {
    const { t } = useTranslation();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [screen, setScreen] = useState('main');           // main | hold_reason | return_window | team_close_confirm
    const [selectedHoldReason, setSelectedHoldReason] = useState(null);

    const { branch, context, wo, options = [], activeUsers = [] } = branchResponse || {};

    // ── Submit an action to POST /api/scan/action ─────────────────────────────
    const submitAction = useCallback(async ({ action, holdReason, returnWindow }) => {
        setSubmitting(true);
        setError('');
        try {
            const res = await fetch('/api/scan/action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-plant-id': plantId,
                },
                body: JSON.stringify({
                    scanId: scanId || crypto.randomUUID(),
                    woId: wo?.id, userId,
                    action, holdReason, returnWindow,
                    deviceTimestamp: deviceTimestamp || new Date().toISOString(),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
            onActionComplete(data);
        } catch (err) {
            setError(err.message);
            setSubmitting(false);
        }
    }, [plantId, scanId, wo, userId, deviceTimestamp, onActionComplete]);

    // ── Hold reason picker screen ─────────────────────────────────────────────
    if (screen === 'hold_reason') {
        return (
            <div style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <button onClick={() => setScreen('main')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}>
                        <ArrowLeft size={20} />
                    </button>
                    <span style={{ color: '#94a3b8', fontSize: 15, fontWeight: 600 }}>Why are you pausing?</span>
                </div>
                {HOLD_REASONS.map((r, i) => (
                    <TapBtn
                        key={r.code}
                        number={i + 1}
                        variant={r.exempt ? 'neutral' : 'warning'}
                        onClick={() => {
                            if (r.code === 'SCHEDULED_RETURN') {
                                setSelectedHoldReason(r.code);
                                setScreen('return_window');
                            } else {
                                submitAction({ action: 'WAITING', holdReason: r.code });
                            }
                        }}
                        disabled={submitting}
                    >
                        {r.label}
                        {r.exempt && (
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569', fontWeight: 400 }}>
                                no timeout
                            </span>
                        )}
                    </TapBtn>
                ))}
                {error && <ErrorBanner msg={error} />}
            </div>
        );
    }

    // ── Scheduled return window picker ────────────────────────────────────────
    if (screen === 'return_window') {
        return (
            <div style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <button onClick={() => setScreen('hold_reason')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}>
                        <ArrowLeft size={20} />
                    </button>
                    <span style={{ color: '#94a3b8', fontSize: 15, fontWeight: 600 }}>When are you returning?</span>
                </div>
                {RETURN_WINDOWS.map((w, i) => (
                    <TapBtn
                        key={w.code}
                        number={i + 1}
                        variant="neutral"
                        onClick={() => submitAction({ action: 'WAITING', holdReason: 'SCHEDULED_RETURN', returnWindow: w.code })}
                        disabled={submitting}
                    >
                        {w.label}
                    </TapBtn>
                ))}
                {error && <ErrorBanner msg={error} />}
            </div>
        );
    }

    // ── Team close confirmation screen ────────────────────────────────────────
    if (screen === 'team_close_confirm') {
        return (
            <div style={{ padding: '4px 0' }}>
                <div style={{
                    background: '#2d1b00', border: '1px solid #92400e',
                    borderRadius: 10, padding: '14px 16px', marginBottom: 20,
                }}>
                    <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: 6 }}>
                        Other technicians are still active on this work order.
                    </div>
                    <div style={{ color: '#d97706', fontSize: 13 }}>
                        Closing for the team will end all active sessions.
                    </div>
                </div>
                <TapBtn number={1} variant="danger" onClick={() => submitAction({ action: 'TEAM_CLOSE' })} disabled={submitting}>
                    Close Work Order for Everyone
                </TapBtn>
                <TapBtn number={2} variant="neutral" onClick={() => setScreen('main')} disabled={submitting}>
                    Cancel
                </TapBtn>
                {error && <ErrorBanner msg={error} />}
            </div>
        );
    }

    // ── Main prompt screen ────────────────────────────────────────────────────
    // Branch: AUTO_CREATE_WO — work started, no further action needed
    if (branch === 'AUTO_CREATE_WO') {
        return (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <CheckCircle size={44} color="#22c55e" style={{ marginBottom: 12 }} />
                <div style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Work Started</div>
                <div style={{ color: '#64748b', fontSize: 14 }}>WO {wo?.number} — {wo?.description || ''}</div>
                <button onClick={onCancel} style={{ marginTop: 20, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14 }}>
                    Done
                </button>
            </div>
        );
    }

    // Branch: AUTO_REJECT_DUPLICATE_SCAN
    if (branch === 'AUTO_REJECT_DUPLICATE_SCAN') {
        return (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <AlertTriangle size={40} color="#f59e0b" style={{ marginBottom: 12 }} />
                <div style={{ color: '#fbbf24', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Duplicate Scan</div>
                <div style={{ color: '#94a3b8', fontSize: 13 }}>This scan has already been processed. No changes made.</div>
                <button onClick={onCancel} style={{ marginTop: 20, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14 }}>
                    Dismiss
                </button>
            </div>
        );
    }

    // Branch: ROUTE_TO_WAITING_WO — waiting WO exists, offer Resume or New
    if (branch === 'ROUTE_TO_WAITING_WO') {
        return (
            <PromptShell wo={wo} subtitle={`On Hold — ${wo?.holdReason || ''}`} onCancel={onCancel}>
                <TapBtn number={1} variant="success"
                    onClick={() => submitAction({ action: 'RESUME_WAITING_WO' })}
                    disabled={submitting}>
                    Resume Waiting WO
                </TapBtn>
                <TapBtn number={2} variant="default"
                    onClick={() => submitAction({ action: 'CREATE_NEW_WO' })}
                    disabled={submitting}>
                    <Plus size={18} /> Create New Work Order
                </TapBtn>
                <TapBtn number={3} variant="neutral" onClick={onCancel} disabled={submitting}>
                    <Eye size={18} /> View Status Only
                </TapBtn>
                {error && <ErrorBanner msg={error} />}
            </PromptShell>
        );
    }

    // Branch: ROUTE_TO_ESCALATED_WO — escalated WO, offer Join/Take Over
    if (branch === 'ROUTE_TO_ESCALATED_WO') {
        return (
            <PromptShell wo={wo} subtitle="⚠ Escalated — Response Required" onCancel={onCancel}>
                <TapBtn number={1} variant="danger"
                    onClick={() => submitAction({ action: 'JOIN' })}
                    disabled={submitting}>
                    <Users size={18} /> Join Response
                </TapBtn>
                <TapBtn number={2} variant="warning"
                    onClick={() => submitAction({ action: 'TAKE_OVER' })}
                    disabled={submitting}>
                    <UserCheck size={18} /> Take Over Response
                </TapBtn>
                <TapBtn number={3} variant="neutral" onClick={onCancel} disabled={submitting}>
                    <Eye size={18} /> View Status Only
                </TapBtn>
                {error && <ErrorBanner msg={error} />}
            </PromptShell>
        );
    }

    // Branch: ROUTE_TO_ACTIVE_WO — active WO context
    if (branch === 'ROUTE_TO_ACTIVE_WO') {

        // Another user is active — Join / Take Over / Escalate
        if (context === 'OTHER_USER_ACTIVE') {
            return (
                <PromptShell wo={wo} subtitle={`Active — ${activeUsers.length} technician(s) on this WO`} onCancel={onCancel}>
                    <TapBtn number={1} variant="success"
                        onClick={() => submitAction({ action: 'JOIN' })}
                        disabled={submitting}>
                        <Users size={18} /> Join Existing Work
                    </TapBtn>
                    <TapBtn number={2} variant="warning"
                        onClick={() => submitAction({ action: 'TAKE_OVER' })}
                        disabled={submitting}>
                        <UserCheck size={18} /> Take Over
                    </TapBtn>
                    <TapBtn number={3} variant="neutral"
                        onClick={() => submitAction({ action: 'ESCALATE' })}
                        disabled={submitting}>
                        <AlertTriangle size={18} /> Escalate
                    </TapBtn>
                    {error && <ErrorBanner msg={error} />}
                </PromptShell>
            );
        }

        // This user is active, others also active — multi-tech prompt
        if (context === 'MULTI_TECH') {
            return (
                <PromptShell wo={wo} subtitle="Active — Multiple Technicians" onCancel={onCancel}>
                    <TapBtn number={1} variant="neutral"
                        onClick={() => submitAction({ action: 'LEAVE_WORK' })}
                        disabled={submitting}>
                        <UserX size={18} /> Leave Work
                    </TapBtn>
                    <TapBtn number={2} variant="danger"
                        onClick={() => setScreen('team_close_confirm')}
                        disabled={submitting}>
                        <CheckCircle size={18} /> Close for Team
                    </TapBtn>
                    <TapBtn number={3} variant="warning"
                        onClick={() => setScreen('hold_reason')}
                        disabled={submitting}>
                        <Clock size={18} /> Waiting…
                    </TapBtn>
                    <TapBtn number={4} variant="neutral"
                        onClick={() => submitAction({ action: 'ESCALATE' })}
                        disabled={submitting}>
                        <AlertTriangle size={18} /> Escalate
                    </TapBtn>
                    <TapBtn number={5} variant="neutral"
                        onClick={() => submitAction({ action: 'CONTINUE_LATER' })}
                        disabled={submitting}>
                        Continue Later
                    </TapBtn>
                    {error && <ErrorBanner msg={error} />}
                </PromptShell>
            );
        }

        // Solo active (or RESUMED_NO_SEGMENT) — standard single-tech prompt
        return (
            <PromptShell wo={wo} subtitle="In Progress" onCancel={onCancel}>
                <TapBtn number={1} variant="success"
                    onClick={() => submitAction({ action: 'CLOSE_WO' })}
                    disabled={submitting}>
                    <CheckCircle size={18} /> Close Work Order
                </TapBtn>
                <TapBtn number={2} variant="warning"
                    onClick={() => setScreen('hold_reason')}
                    disabled={submitting}>
                    <Clock size={18} /> Waiting…
                </TapBtn>
                <TapBtn number={3} variant="neutral"
                    onClick={() => submitAction({ action: 'ESCALATE' })}
                    disabled={submitting}>
                    <AlertTriangle size={18} /> Escalate
                </TapBtn>
                <TapBtn number={4} variant="neutral"
                    onClick={() => submitAction({ action: 'CONTINUE_LATER' })}
                    disabled={submitting}>
                    Continue Later
                </TapBtn>
                {error && <ErrorBanner msg={error} />}
            </PromptShell>
        );
    }

    // Fallback — unknown branch
    return (
        <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
            Scan processed. Tap Done to continue.
            <br />
            <button onClick={onCancel} style={{ marginTop: 16, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>Done</button>
        </div>
    );
}

// ── Shared prompt wrapper ─────────────────────────────────────────────────────
function PromptShell({ wo, subtitle, onCancel, children }) {
    return (
        <div style={{ padding: '4px 0' }}>
            {wo && (
                <div style={{ marginBottom: 20 }}>
                    <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700 }}>
                        {wo.description || `WO ${wo.number}`}
                    </div>
                    <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
                        {wo.number} · {subtitle}
                    </div>
                </div>
            )}
            {children}
            <button
                onClick={onCancel}
                style={{
                    marginTop: 8, width: '100%', padding: '12px', borderRadius: 8,
                    background: 'none', border: '1px solid #1e293b',
                    color: '#475569', cursor: 'pointer', fontSize: 14,
                }}
            >
                Cancel
            </button>
        </div>
    );
}

// ── Error banner ──────────────────────────────────────────────────────────────
function ErrorBanner({ msg }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
            background: '#3b1f1f', border: '1px solid #7f1d1d',
            borderRadius: 8, padding: '10px 14px',
            color: '#fca5a5', fontSize: 13,
        }}>
            <AlertTriangle size={15} />
            {msg}
        </div>
    );
}
