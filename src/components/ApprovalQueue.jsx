// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Approval Queue
 * ==========================
 * Manager-facing workflow approval dashboard. Surfaces pending purchase orders,
 * part transfers, and high-value work orders awaiting authorization — with
 * one-click Approve/Reject and full audit trail per decision.
 *
 * ITEM TYPES:
 *   Purchase Orders  — POs over the plant's auto-approve threshold
 *   Part Transfers   — Inter-plant part moves requiring manager sign-off
 *   Work Orders      — High-priority or high-cost WOs needing escalation approval
 *   Contractor Bids  — External vendor quotes pending acceptance
 *
 * KEY FEATURES:
 *   - Pending count badge in nav — managers always see outstanding approvals
 *   - Expandable item rows: full details, line items, requester, justification
 *   - Approve / Reject buttons with required comment field on reject
 *   - Audit trail: every decision logged with timestamp, approver, and comment
 *   - Priority sort: Urgent items (overdue WOs, expiring POs) surface first
 *   - Filter by item type, requester, plant, and date range
 *   - Email notification sent to requester on approval or rejection
 *
 * API CALLS:
 *   GET  /api/approvals/pending        — All items awaiting current user's approval
 *   POST /api/approvals/:id/approve    — Approve an item with optional comment
 *   POST /api/approvals/:id/reject     — Reject an item with required comment
 *   GET  /api/approvals/history        — Past decisions (audit trail)
 */
import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, DollarSign, RefreshCw, AlertTriangle, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import { formatDate } from '../utils/formatDate';

function ApprovalQueue() {
    const { t } = useTranslation();
    const [approvals, setApprovals] = useState([]);
    const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, pendingValue: 0 });
    const [filter, setFilter] = useState('pending');
    const [loading, setLoading] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState({});
    const [actionNote, setActionNote] = useState({});

    const currentUser = localStorage.getItem('currentUser') || 'admin';

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [appRes, statsRes] = await Promise.all([
                fetch(`/api/approvals?status=${filter}`),
                fetch('/api/approvals/stats')
            ]);
            const appData = await appRes.json();
            const statsData = await statsRes.json();
            setApprovals(Array.isArray(appData) ? appData : []);
            setStats(statsData);
        } catch (e) { console.warn('[ApprovalQueue] caught:', e); }
        setLoading(false);
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/approvals/settings');
            setSettings(await res.json());
        } catch (e) { console.warn('[ApprovalQueue] caught:', e); }
    };

    useEffect(() => { fetchAll(); fetchSettings(); }, [filter]);

    const handleApprove = async (id) => {
        try {
            await fetch(`/api/approvals/${id}/approve`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resolved_by: currentUser, notes: actionNote[id] || '' })
            });
            setActionNote(prev => ({ ...prev, [id]: '' }));
            fetchAll();
        } catch (e) { window.trierToast?.error(t('approvalQueue.approvalFailed', 'Approval failed')); }
    };

    const handleReject = async (id) => {
        const reason = actionNote[id] || '';
        if (!reason) {
            window.trierToast?.error(t('approvalQueue.pleaseProvideRejectionReason', 'Please provide a reason for rejection'));
            return;
        }
        try {
            await fetch(`/api/approvals/${id}/reject`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resolved_by: currentUser, reject_reason: reason })
            });
            setActionNote(prev => ({ ...prev, [id]: '' }));
            fetchAll();
        } catch (e) { window.trierToast?.error(t('approvalQueue.rejectionFailed', 'Rejection failed')); }
    };

    const saveSettings = async () => {
        try {
            await fetch('/api/approvals/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            window.trierToast?.success(t('approvalQueue.settingsSaved', 'Approval settings saved'));
        } catch (e) { window.trierToast?.error(t('approvalQueue.settingsFailed', 'Failed to save settings')); }
    };

    const statusColors = {
        pending: '#f59e0b',
        approved: '#10b981',
        rejected: '#ef4444'
    };

    const statusIcons = {
        pending: <Clock size={14} />,
        approved: <CheckCircle size={14} />,
        rejected: <XCircle size={14} />
    };

    return (
        <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertTriangle size={20} color="#f59e0b" /> {t('approvalQueue.approvalWorkflows', 'Approval Workflows')}
                    {stats.pending > 0 && (
                        <span style={{
                            background: '#f59e0b', color: '#000', padding: '2px 8px',
                            borderRadius: '10px', fontSize: '0.7rem', fontWeight: 'bold'
                        }}>
                            {stats.pending} {t('approvalQueue.pendingBadge', 'pending')}
                        </span>
                    )}
                </h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button onClick={() => setShowSettings(!showSettings)} style={{
                        background: 'none', border: '1px solid var(--glass-border)', color: 'var(--text-muted)',
                        padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem'
                    }} title={t('approvalQueue.toggleApprovalThresholdSettingsTip')}>
                        <Settings size={12} /> {t('approvalQueue.thresholds', 'Thresholds')} {showSettings ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <button onClick={fetchAll} style={{
                        background: 'none', border: '1px solid var(--glass-border)', color: 'var(--text-muted)',
                        padding: '4px 8px', borderRadius: '6px', cursor: 'pointer'
                    }} title={t('approvalQueue.refreshApprovalQueueTip')}>
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                {[
                    { label: t('approvalQueue.pending', 'Pending'), value: stats.pending, color: '#f59e0b', key: 'pending' },
                    { label: t('approvalQueue.approved', 'Approved'), value: stats.approved, color: '#10b981', key: 'approved' },
                    { label: t('approvalQueue.rejected', 'Rejected'), value: stats.rejected, color: '#ef4444', key: 'rejected' },
                ].map(s => (
                    <button
                        key={s.key}
                        onClick={() => setFilter(s.key)}
                        style={{
                            flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
                            background: filter === s.key ? s.color + '15' : 'rgba(0,0,0,0.15)',
                            border: `1px solid ${filter === s.key ? s.color + '40' : 'var(--glass-border)'}`,
                            color: filter === s.key ? s.color : 'var(--text-muted)',
                            textAlign: 'center', transition: 'all 0.15s ease'
                        }}
                        title={t('approvalQueue.filterApprovalsTip', 'Filter approvals')}
                    >
                        <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{s.value}</div>
                        <div style={{ fontSize: '0.7rem' }}>{s.label}</div>
                    </button>
                ))}
                <div style={{
                    flex: 1, padding: '10px', borderRadius: '8px',
                    background: 'rgba(0,0,0,0.15)', border: '1px solid var(--glass-border)',
                    color: '#6366f1', textAlign: 'center'
                }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>${(stats.pendingValue || 0).toLocaleString()}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('approval.queue.pendingValue')}</div>
                </div>
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div style={{
                    background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '10px',
                    marginBottom: '15px', border: '1px solid var(--glass-border)'
                }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '10px', color: '#f59e0b' }}>
                        {t('approvalQueue.approvalThresholdsHeader', '⚙️ Approval Thresholds')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                        <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                {t('approvalQueue.poThresholdLabel', 'PO Approval Threshold ($)')}
                            </label>
                            <input
                                type="number"
                                value={settings.po_threshold || ''}
                                onChange={e => setSettings({ ...settings, po_threshold: e.target.value })}
                                style={{
                                    width: '100%', padding: '8px', background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid var(--glass-border)', borderRadius: '6px',
                                    color: '#fff', fontSize: '0.85rem'
                                }}
                                title={t('approvalQueue.setMinimumDollarAmountRequiringTip')}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                {t('approvalQueue.woThresholdLabel', 'WO Approval Threshold ($)')}
                            </label>
                            <input
                                type="number"
                                value={settings.wo_threshold || ''}
                                onChange={e => setSettings({ ...settings, wo_threshold: e.target.value })}
                                style={{
                                    width: '100%', padding: '8px', background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid var(--glass-border)', borderRadius: '6px',
                                    color: '#fff', fontSize: '0.85rem'
                                }}
                                title={t('approvalQueue.setMinimumDollarAmountRequiringTip')}
                            />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={settings.require_approval === 'true'}
                                onChange={e => setSettings({ ...settings, require_approval: e.target.checked ? 'true' : 'false' })}
                                title={t('approvalQueue.enableOrDisableTheApprovalTip')}
                            />
                            {t('approval.queue.requireApprovals')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={settings.auto_approve_pm === 'true'}
                                onChange={e => setSettings({ ...settings, auto_approve_pm: e.target.checked ? 'true' : 'false' })}
                                title={t('approvalQueue.automaticallyApprovePreventiveMaintenanceWorkTip')}
                            />
                            {t('approval.queue.autoapprovePmWorkOrders')}
                        </label>
                    </div>
                    <button onClick={saveSettings} className="btn-save btn-sm" title={t('approvalQueue.saveApprovalThresholdSettingsTip')}>
                        {t('approval.queue.saveThresholds')}
                    </button>
                </div>
            )}

            {/* Approval List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={18} className="spinning" /> {t('approval.queue.loading')}
                </div>
            ) : approvals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {filter === 'pending' ? t('approvalQueue.noPendingApprovals', '✅ No pending approvals — all caught up!') : t('approvalQueue.noFilterItems', 'No items to show.')}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                    {approvals.map(item => (
                        <div key={item.id} style={{
                            background: 'rgba(0,0,0,0.15)', padding: '12px 15px', borderRadius: '10px',
                            border: `1px solid ${statusColors[item.status] || 'var(--glass-border)'}30`
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        background: (statusColors[item.status] || '#6366f1') + '20',
                                        color: statusColors[item.status] || '#6366f1',
                                        padding: '2px 8px', borderRadius: '8px', fontSize: '0.65rem',
                                        fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}>
                                        {statusIcons[item.status]} {item.status.toUpperCase()}
                                    </span>
                                    <span style={{
                                        background: 'rgba(99,102,241,0.1)', color: '#818cf8',
                                        padding: '2px 8px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 'bold'
                                    }}>
                                        {item.type}
                                    </span>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                                        #{item.reference_id}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <DollarSign size={14} color="#10b981" />
                                    <span style={{ fontWeight: 'bold', fontSize: '1rem', color: '#10b981' }}>
                                        {(item.amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                    </span>
                                </div>
                            </div>

                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                {item.reference_desc || t('approvalQueue.noDescription', 'No description')}
                            </div>

                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                {t('approval.queue.submittedBy')} <strong>{item.submitted_by}</strong> • {formatDate(item.submitted_at)}
                                {item.plant_id && <> {t('approvalQueue.plant')} <strong>{item.plant_id.replace(/_/g, ' ')}</strong></>}
                                {item.resolved_by && <> • {item.status === 'approved' ? t('approvalQueue.approved', 'Approved') : t('approvalQueue.rejected', 'Rejected')} {t('approvalQueue.by', 'by')} <strong>{item.resolved_by}</strong></>}
                            </div>

                            {item.reject_reason && (
                                <div style={{
                                    marginTop: '6px', padding: '6px 10px', borderRadius: '6px',
                                    background: 'rgba(239,68,68,0.1)', fontSize: '0.75rem', color: '#f87171'
                                }}>
                                    {t('approvalQueue.reason', 'Reason:')} {item.reject_reason}
                                </div>
                            )}

                            {/* Action buttons for pending items */}
                            {item.status === 'pending' && (
                                <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        placeholder={t('approval.queue.notesRejectionReason')}
                                        value={actionNote[item.id] || ''}
                                        onChange={e => setActionNote(prev => ({ ...prev, [item.id]: e.target.value }))}
                                        style={{
                                            flex: 1, padding: '6px 10px', background: 'rgba(0,0,0,0.3)',
                                            border: '1px solid var(--glass-border)', borderRadius: '6px',
                                            color: '#fff', fontSize: '0.8rem'
                                        }}
                                        title={t('approvalQueue.addNotesOrRejectionReasonTip')}
                                    />
                                    <button 
                                        onClick={() => handleApprove(item.id)}
                                        className="btn-save btn-sm"
                                        title={t('approvalQueue.approveThisRequestTip')}
                                    >
                                        <CheckCircle size={14} /> {t('approval.queue.approve')}
                                    </button>
                                    <button 
                                        onClick={() => handleReject(item.id)}
                                        className="btn-danger btn-sm"
                                        title={t('approvalQueue.rejectThisRequestRequiresATip')}
                                    >
                                        <XCircle size={14} /> {t('approval.queue.reject')}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default ApprovalQueue;
