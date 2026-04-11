// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Auto-Escalation Rules Management Panel
 * ===================================================
 * Configurable multi-tier escalation chains per work order priority level.
 * Displays active escalations, escalation history, and full rule CRUD.
 *
 * KEY FEATURES:
 *   - Rule builder: set escalation tier (1/2/3) per priority (Critical/High/Medium)
 *   - Delay thresholds: minutes before each tier fires (e.g. 30 / 60 / 120 min)
 *   - Notify role: which role receives the escalation notification per tier
 *   - Active escalations table: currently open WOs in escalation with time remaining
 *   - Escalation history log: past escalation events with outcome (acknowledged / auto-closed)
 *   - Acknowledge button: lets the notified manager mark an escalation as seen
 *   - Per-plant config: each plant can have its own escalation rule set
 *
 * ESCALATION ENGINE:
 *   Runs on the server every 5 minutes via setInterval (server/routes/escalation.js).
 *   Scans all plant DBs for unstarted WOs exceeding the configured delay thresholds.
 *   Fires notification and logs to escalation_log table.
 *
 * API CALLS:
 *   GET  /api/escalation/rules          — Load escalation rules for plant
 *   POST /api/escalation/rules          — Create or update escalation rule
 *   GET  /api/escalation/active         — Currently active escalations
 *   GET  /api/escalation/log            — Escalation history log
 *   POST /api/escalation/acknowledge/:id — Acknowledge an active escalation
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../i18n/index.jsx';

const ROLE_LABELS = {
    maintenance_manager: 'Maintenance Manager',
    plant_manager: 'Plant Manager',
    general_manager: 'General Manager',
    corporate: 'Corporate',
    it_admin: 'IT Admin',
};

const PRIORITY_LABELS = {
    '1': 'Emergency (P1)',
    '2': 'Urgent (P2)',
    '3': 'Normal (P3)',
    '4': 'Low (P4)',
    '5': 'Planned (P5)',
};

const PRIORITY_COLORS = {
    '1': '#ef4444',
    '2': '#f59e0b',
    '3': '#3b82f6',
    '4': '#6b7280',
    '5': '#94a3b8',
};

function formatDelay(min) {
    if (min < 60) return `${min} min`;
    if (min < 1440) return `${(min / 60).toFixed(1).replace('.0', '')} hr`;
    return `${(min / 1440).toFixed(1).replace('.0', '')} day`;
}

export default function EscalationRulesPanel() {
    const { t } = useTranslation();
    const [rules, setRules] = useState([]);
    const [log, setLog] = useState([]);
    const [active, setActive] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('rules'); // 'rules' | 'active' | 'history'
    const [showAdd, setShowAdd] = useState(false);
    const [newRule, setNewRule] = useState({ Priority: '1', DelayMinutes: 30, EscalationTier: 1, TargetRole: 'maintenance_manager', NotificationType: 'bell' });
    const [status, setStatus] = useState(null);

    const authHeaders = {
        'Content-Type': 'application/json'
    };

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [rulesRes, activeRes, logRes] = await Promise.all([
                fetch('/api/escalation/rules', { headers: authHeaders }),
                fetch('/api/escalation/active', { headers: authHeaders }),
                fetch('/api/escalation/log?limit=50', { headers: authHeaders }),
            ]);
            setRules(await rulesRes.json());
            setActive(await activeRes.json());
            setLog(await logRes.json());
        } catch (e) {
            console.error('[Escalation] Fetch error:', e);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleAdd = async () => {
        try {
            const res = await fetch('/api/escalation/rules', {
                method: 'POST', headers: authHeaders,
                body: JSON.stringify(newRule)
            });
            if (res.ok) {
                setShowAdd(false);
                setNewRule({ Priority: '1', DelayMinutes: 30, EscalationTier: 1, TargetRole: 'maintenance_manager', NotificationType: 'bell' });
                setStatus({ ok: true, msg: t('escalation.ruleAdded', 'Rule added') });
                fetchAll();
            }
        } catch (e) { setStatus({ ok: false, msg: t('escalation.failedToAddRule', 'Failed to add rule') }); }
    };

    const handleToggle = async (rule) => {
        try {
            await fetch(`/api/escalation/rules/${rule.ID}`, {
                method: 'PUT', headers: authHeaders,
                body: JSON.stringify({ Active: rule.Active ? 0 : 1 })
            });
            fetchAll();
        } catch (e) { console.warn('[EscalationRulesPanel] caught:', e); }
    };

    const handleDelete = async (id) => {
        if (!await confirm(t('escalation.confirmDeleteRule', 'Delete this escalation rule?'))) return;
        try {
            await fetch(`/api/escalation/rules/${id}`, { method: 'DELETE', headers: authHeaders });
            fetchAll();
        } catch (e) { console.warn('[EscalationRulesPanel] caught:', e); }
    };

    const handleAcknowledge = async (id) => {
        try {
            await fetch(`/api/escalation/log/${id}/acknowledge`, { method: 'POST', headers: authHeaders });
            fetchAll();
        } catch (e) { console.warn('[EscalationRulesPanel] caught:', e); }
    };

    const handleManualRun = async () => {
        setStatus({ ok: true, msg: t('escalation.runningCheck', 'Running escalation check...') });
        try {
            const res = await fetch('/api/escalation/run', { method: 'POST', headers: authHeaders });
            const data = await res.json();
            setStatus({ ok: true, msg: data.message });
            fetchAll();
        } catch (e) { setStatus({ ok: false, msg: t('escalation.checkFailed', 'Check failed') }); }
    };

    // Group rules by priority for visual display
    const rulesByPriority = {};
    rules.forEach(r => {
        if (!rulesByPriority[r.Priority]) rulesByPriority[r.Priority] = [];
        rulesByPriority[r.Priority].push(r);
    });


    return (
        <div style={{ padding: 0 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 24 }}>⚡</span>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>{t('escalation.autoEscalationEngine', 'Auto-Escalation Engine')}</h3>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{t('escalation.automatedEscalationSubtitle', "Automated escalation when work orders aren't started on time")}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleManualRun} className="btn-secondary" title={t('escalationRulesPanel.manuallyTriggerTheEscalationCheckTip')} style={{
                        padding: '8px 16px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6
                    }}>🔄 {t('escalation.runNow', 'Run Now')}</button>
                    <button onClick={() => setShowAdd(!showAdd)} className="btn-save" title={t('escalationRulesPanel.addANewEscalationRuleTip')} style={{
                        padding: '8px 16px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6
                    }}>+ {t('escalation.addRule', 'Add Rule')}</button>
                </div>
            </div>

            {/* Status banner */}
            {status && (
                <div style={{
                    padding: '10px 16px', borderRadius: 10, marginBottom: 14,
                    background: status.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: status.ok ? '#34d399' : '#f87171', fontSize: '0.85rem', fontWeight: 600,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <span>{status.msg}</span>
                    <button onClick={() => setStatus(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }} title={t('escalationRulesPanel.dismissThisNotificationTip')}>×</button>
                </div>
            )}

            {/* Active alerts badge */}
            {active.length > 0 && (
                <div style={{
                    padding: '12px 18px', borderRadius: 12, marginBottom: 14,
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                    display: 'flex', alignItems: 'center', gap: 12,
                    animation: 'pulseGlow 2s ease-in-out infinite'
                }}>
                    <span style={{ fontSize: 20 }}>🚨</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f87171' }}>
                        {active.length} Active Escalation{active.length > 1 ? 's' : ''} — Awaiting Acknowledgement
                    </span>
                    <button onClick={() => setTab('active')} className="btn-secondary" title={t('escalationRulesPanel.viewAllActiveEscalationsTip')} style={{
                        marginLeft: 'auto', padding: '6px 14px', fontSize: '0.75rem'
                    }}>{t('escalation.viewAll', 'View All')} →</button>
                </div>
            )}

            {/* Tabs */}
            <div className="nav-pills" style={{ marginBottom: 18 }}>
                <button className={`btn-nav${tab === 'rules' ? ' active' : ''}`} onClick={() => setTab('rules')} title={t('escalation.viewEscalationRulesTip', 'View escalation rules')}>
                    📋 {t('escalation.rulesTab', 'Rules')} ({rules.length})
                </button>
                <button className={`btn-nav${tab === 'active' ? ' active' : ''}`} onClick={() => setTab('active')} title={t('escalation.viewActiveEscalationsTip', 'View active escalations')}>
                    🚨 {t('escalation.activeTab', 'Active')} ({active.length})
                </button>
                <button className={`btn-nav${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')} title={t('escalation.viewEscalationHistoryTip', 'View escalation history')}>
                    📜 {t('escalation.historyTab', 'History')} ({log.length})
                </button>
            </div>

            {/* Add Rule Form */}
            {showAdd && (
                <div style={{
                    background: 'rgba(16,185,129,0.05)', padding: 20, borderRadius: 14,
                    border: '1px solid rgba(16,185,129,0.2)', marginBottom: 18
                }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 14, color: '#34d399' }}>{t('escalation.newEscalationRule', 'New Escalation Rule')}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 14 }}>
                        <div>
                            <label style={labelStyle}>{t('escalation.priorityLabel', 'Priority')}</label>
                            <select value={newRule.Priority} onChange={e => setNewRule({ ...newRule, Priority: e.target.value })} style={inputStyle}>
                                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>{t('escalation.delayMinutesLabel', 'Delay (minutes)')}</label>
                            <input type="number" value={newRule.DelayMinutes} onChange={e => setNewRule({ ...newRule, DelayMinutes: parseInt(e.target.value, 10) || 0 })} style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>{t('escalation.tierLabel', 'Tier')}</label>
                            <select value={newRule.EscalationTier} onChange={e => setNewRule({ ...newRule, EscalationTier: parseInt(e.target.value, 10) })} style={inputStyle}>
                                <option value={1}>{t('escalation.tier1', 'Tier 1')}</option>
                                <option value={2}>{t('escalation.tier2', 'Tier 2')}</option>
                                <option value={3}>{t('escalation.tier3', 'Tier 3')}</option>
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>{t('escalation.escalateToLabel', 'Escalate To')}</label>
                            <select value={newRule.TargetRole} onChange={e => setNewRule({ ...newRule, TargetRole: e.target.value })} style={inputStyle}>
                                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>{t('escalation.notifyViaLabel', 'Notify Via')}</label>
                            <select value={newRule.NotificationType} onChange={e => setNewRule({ ...newRule, NotificationType: e.target.value })} style={inputStyle}>
                                <option value="bell">{t('escalationRulesPanel.bellOnly')}</option>
                                <option value="bell,email">{t('escalationRulesPanel.bellEmail')}</option>
                                <option value="bell,email,webhook">{t('escalationRulesPanel.bellEmailWebhook')}</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={handleAdd} className="btn-save" title={t('escalation.saveThisEscalationRuleTip', 'Save this escalation rule')} style={{ padding: '8px 20px' }}>{t('escalation.saveRule', 'Save Rule')}</button>
                        <button onClick={() => setShowAdd(false)} className="btn-nav" title={t('escalation.cancelAddingRuleTip', 'Cancel adding a new rule')} style={{ padding: '8px 20px' }}>{t('common.cancel', 'Cancel')}</button>
                    </div>
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>{t('escalation.loadingData', 'Loading escalation data...')}</div>
            ) : (
                <>
                    {/* RULES TAB */}
                    {tab === 'rules' && (
                        <div>
                            {Object.keys(rulesByPriority).length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                                    {t('escalation.noRulesConfigured', 'No escalation rules configured. Click "+ Add Rule" to create one.')}
                                </div>
                            ) : (
                                Object.entries(rulesByPriority).map(([priority, pRules]) => (
                                    <div key={priority} style={{ marginBottom: 22 }}>
                                        <div style={{
                                            fontSize: '0.85rem', fontWeight: 800, color: PRIORITY_COLORS[priority] || '#94a3b8',
                                            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10,
                                            display: 'flex', alignItems: 'center', gap: 10
                                        }}>
                                            <span style={{
                                                width: 10, height: 10, borderRadius: '50%',
                                                background: PRIORITY_COLORS[priority] || '#94a3b8',
                                                boxShadow: `0 0 8px ${PRIORITY_COLORS[priority] || '#94a3b8'}50`
                                            }} />
                                            {PRIORITY_LABELS[priority] || `Priority ${priority}`}
                                        </div>
                                        <div style={{ display: 'flex', gap: 12 }}>
                                            {pRules.sort((a, b) => a.EscalationTier - b.EscalationTier).map((rule, idx) => (
                                                <div key={rule.ID} style={{
                                                    flex: 1,
                                                    background: rule.Active ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
                                                    borderRadius: 12, padding: '16px 18px',
                                                    border: `1px solid ${rule.Active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
                                                    opacity: rule.Active ? 1 : 0.5,
                                                    position: 'relative'
                                                }}>
                                                    {idx > 0 && (
                                                        <span style={{
                                                            position: 'absolute', left: -18, top: '50%', transform: 'translateY(-50%)',
                                                            color: '#4b5563', fontSize: '1.2rem'
                                                        }}>→</span>
                                                    )}
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                                        {t('escalation.tierNumber', 'Tier')} {rule.EscalationTier}
                                                    </div>
                                                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#e2e8f0', marginBottom: 6 }}>
                                                        {formatDelay(rule.DelayMinutes)}
                                                    </div>
                                                    <div style={{ fontSize: '0.85rem', color: '#818cf8', fontWeight: 600, marginBottom: 8 }}>
                                                        → {ROLE_LABELS[rule.TargetRole] || rule.TargetRole}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 12 }}>
                                                        {t('escalation.viaPrefix', 'via')} {rule.NotificationType}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <button onClick={() => handleToggle(rule)} className="btn-secondary" title={rule.Active ? t('escalation.pauseRuleTip', 'Pause this escalation rule') : t('escalation.activateRuleTip', 'Activate this escalation rule')} style={{
                                                            padding: '4px 10px', fontSize: '0.7rem',
                                                            background: rule.Active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                                            color: rule.Active ? '#10b981' : '#ef4444'
                                                        }}>{rule.Active ? t('escalation.activeStatus', 'Active') : t('escalation.pausedStatus', 'Paused')}</button>
                                                        <button onClick={() => handleDelete(rule.ID)} className="btn-danger" title={t('escalationRulesPanel.deleteThisEscalationRuleTip')} style={{
                                                            padding: '4px 10px', fontSize: '0.7rem'
                                                        }}>✕</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* ACTIVE ESCALATIONS TAB */}
                    {tab === 'active' && (
                        <div>
                            {active.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 40, color: '#10b981', fontSize: '1rem' }}>
                                    ✅ {t('escalation.noActiveEscalations', 'No active escalations — all WOs are being addressed on time')}
                                </div>
                            ) : (
                                <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(239,68,68,0.05)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                                <th style={thStyle}>{t('escalation.colPlant', 'Plant')}</th>
                                                <th style={thStyle}>{t('escalation.colWoNum', 'WO #')}</th>
                                                <th style={thStyle}>{t('escalation.colDescription', 'Description')}</th>
                                                <th style={{ ...thStyle, textAlign: 'center' }}>{t('escalation.colTier', 'Tier')}</th>
                                                <th style={{ ...thStyle, textAlign: 'center' }}>{t('escalation.colDelay', 'Delay')}</th>
                                                <th style={thStyle}>{t('escalation.colEscalatedTo', 'Escalated To')}</th>
                                                <th style={thStyle}>{t('escalation.colWhen', 'When')}</th>
                                                <th style={{ ...thStyle, textAlign: 'center' }}>{t('escalation.colAction', 'Action')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {active.map(e => (
                                                <tr key={e.ID} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                    <td style={tdStyle}>{e.PlantLabel || e.PlantID}</td>
                                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa' }}>{e.WorkOrderID}</td>
                                                    <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.WODescription}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        <span style={{
                                                            background: e.EscalationTier >= 3 ? 'rgba(239,68,68,0.15)' : e.EscalationTier >= 2 ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)',
                                                            color: e.EscalationTier >= 3 ? '#ef4444' : e.EscalationTier >= 2 ? '#f59e0b' : '#818cf8',
                                                            padding: '3px 10px', borderRadius: 6, fontWeight: 700, fontSize: '0.85rem'
                                                        }}>T{e.EscalationTier}</span>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{formatDelay(e.ActualDelayMinutes)}</td>
                                                    <td style={{ ...tdStyle, color: '#818cf8' }}>{ROLE_LABELS[e.TargetRole] || e.TargetRole}</td>
                                                    <td style={{ ...tdStyle, fontSize: '0.8rem', color: '#94a3b8' }}>
                                                        {e.EscalatedAt ? new Date(e.EscalatedAt).toLocaleString() : '—'}
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        <button onClick={() => handleAcknowledge(e.ID)} className="btn-save" title={t('escalationRulesPanel.acknowledgeThisEscalationTip')} style={{
                                                            padding: '6px 14px', fontSize: '0.75rem'
                                                        }}>✓ {t('escalation.acknowledge', 'Acknowledge')}</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* HISTORY TAB */}
                    {tab === 'history' && (
                        <div>
                            {log.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                                    {t('escalation.noHistoryYet', 'No escalation history yet. The engine checks every 5 minutes.')}
                                </div>
                            ) : (
                                <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                                <th style={thStyle}>{t('escalation.colPlant', 'Plant')}</th>
                                                <th style={thStyle}>{t('escalation.colWoNum', 'WO #')}</th>
                                                <th style={{ ...thStyle, textAlign: 'center' }}>{t('escalation.colTier', 'Tier')}</th>
                                                <th style={thStyle}>{t('escalation.colEscalatedTo', 'Escalated To')}</th>
                                                <th style={thStyle}>{t('escalation.colWhen', 'When')}</th>
                                                <th style={{ ...thStyle, textAlign: 'center' }}>{t('escalation.colStatus', 'Status')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {log.map(e => (
                                                <tr key={e.ID} style={{
                                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                    opacity: e.Acknowledged ? 0.6 : 1
                                                }}>
                                                    <td style={tdStyle}>{e.PlantLabel || e.PlantID}</td>
                                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa' }}>{e.WorkOrderID}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>T{e.EscalationTier}</td>
                                                    <td style={{ ...tdStyle, color: '#818cf8' }}>{ROLE_LABELS[e.TargetRole] || e.TargetRole}</td>
                                                    <td style={{ ...tdStyle, fontSize: '0.8rem', color: '#94a3b8' }}>
                                                        {e.EscalatedAt ? new Date(e.EscalatedAt).toLocaleString() : '—'}
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        {e.Acknowledged ? (
                                                            <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.8rem' }}>
                                                                ✓ {t('escalation.acknowledgedStatus', 'Acknowledged')}{e.AcknowledgedBy ? ` ${t('escalation.acknowledgedBy', 'by')} ${e.AcknowledgedBy}` : ''}
                                                            </span>
                                                        ) : (
                                                            <span style={{
                                                                padding: '3px 10px', borderRadius: 6, fontSize: '0.75rem',
                                                                background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700
                                                            }}>{t('escalation.pendingStatus', 'Pending')}</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            <style>{`
                @keyframes pulseGlow {
                    0% { box-shadow: 0 0 0px rgba(239, 68, 68, 0); }
                    50% { box-shadow: 0 0 12px rgba(239, 68, 68, 0.15); }
                    100% { box-shadow: 0 0 0px rgba(239, 68, 68, 0); }
                }
            `}</style>
        </div>
    );
}

const labelStyle = { fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' };
const inputStyle = { width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: '0.85rem' };
const thStyle = { padding: '10px 14px', textAlign: 'left', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' };
const tdStyle = { padding: '12px 14px', fontSize: '0.88rem', color: '#e2e8f0' };
