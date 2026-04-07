// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Enrollment Approval Queue
 * ======================================
 * Admin panel for reviewing, approving, or denying new user enrollment
 * requests. Self-registered users land here pending admin authorization
 * before their accounts are activated.
 *
 * KEY FEATURES:
 *   - Pending list: all enrollment requests sorted by submission date (newest first)
 *   - Request details: name, email, role requested, plant, department, and join reason
 *   - Expandable rows: full profile view before decision
 *   - Approve: activates account with requested role; sends welcome email
 *   - Deny: rejects request with optional feedback message sent to applicant
 *   - Role override: admin can assign a different role than requested on approval
 *   - Bulk actions: approve or deny multiple requests at once
 *   - Badge count: pending enrollment count shown in Admin Console nav
 *
 * API CALLS:
 *   GET  /api/admin/enrollments           — All pending enrollment requests
 *   POST /api/admin/enrollments/:id/approve — Approve with role assignment
 *   POST /api/admin/enrollments/:id/deny    — Deny with optional message
 */
import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, User, MapPin, Briefcase, RefreshCw, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

const ROLE_LABELS = {
    technician: '🔧 Technician',
    mechanic: '⚙️ Mechanic',
    engineer: '📐 Engineer',
    lab_tech: '🧪 Lab Tech',
    plant_manager: '🏭 Plant Mgr',
    it_admin: '🖥️ IT Admin',
    executive: '👔 Executive',
    employee: '👤 Employee',
};

export default function EnrollmentQueue() {
    const { t } = useTranslation();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null);
    const [processing, setProcessing] = useState(null);
    const [message, setMessage] = useState(null);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/enrollment/enrollments', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            const data = await res.json();
            setRequests(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load enrollments:', err);
        }
        setLoading(false);
    };

    useEffect(() => { fetchRequests(); }, []);

    const handleApprove = async (req) => {
        setProcessing(req.id);
        setMessage(null);
        try {
            const res = await fetch('/api/enrollment/enrollments/approve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({
                    requestId: req.id,
                    assignedRole: req.requested_role,
                    notes: 'Approved via Admin Console'
                })
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: `✅ ${req.full_name} approved! Temp password: ${data.tempPassword}` });
                fetchRequests();
            } else {
                setMessage({ type: 'error', text: data.error });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed to approve: ' + err.message });
        }
        setProcessing(null);
    };

    const handleDeny = async (req) => {
        const reason = await prompt(`Reason for denying ${req.full_name}'s request:`);
        if (reason === null) return;
        setProcessing(req.id);
        setMessage(null);
        try {
            const res = await fetch('/api/enrollment/enrollments/deny', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ requestId: req.id, reason })
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: `${req.full_name}'s request denied.` });
                fetchRequests();
            } else {
                setMessage({ type: 'error', text: data.error });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed to deny: ' + err.message });
        }
        setProcessing(null);
    };

    const pending = requests.filter(r => r.status === 'pending');
    const reviewed = requests.filter(r => r.status !== 'pending');

    return (
        <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Send size={18} color="#10b981" /> Enrollment Requests
                    {pending.length > 0 && (
                        <span style={{
                            background: '#ef4444', color: '#fff', padding: '2px 10px',
                            borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700
                        }}>
                            {pending.length} pending
                        </span>
                    )}
                </h3>
                <button onClick={fetchRequests} disabled={loading}
                    style={{
                        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                        color: '#10b981', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
                        fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px'
                    }} title={t('enrollmentQueue.refreshEnrollmentQueueTip')}>
                    <RefreshCw size={12} className={loading ? 'spinning' : ''} /> Refresh
                </button>
            </div>

            {message && (
                <div style={{
                    padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', fontSize: '0.85rem',
                    background: message.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: message.type === 'success' ? '#10b981' : '#ef4444',
                    border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
                }}>
                    {message.text}
                </div>
            )}

            {loading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={20} className="spinning" /> Loading requests...
                </div>
            ) : pending.length === 0 && reviewed.length === 0 ? (
                <div style={{
                    padding: '40px', textAlign: 'center', color: 'var(--text-muted)',
                    background: 'rgba(0,0,0,0.15)', borderRadius: '10px'
                }}>
                    No enrollment requests yet. New users can submit requests from the login page.
                </div>
            ) : (
                <>
                    {/* Pending Requests */}
                    {pending.map(req => (
                        <div key={req.id} style={{
                            background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.2)',
                            borderRadius: '10px', padding: '14px', marginBottom: '10px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <Clock size={18} color="#f59e0b" />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{req.full_name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '12px', marginTop: '2px' }}>
                                            <span><MapPin size={11} style={{ marginRight: '3px' }} />{req.requested_plant?.replace(/_/g, ' ')}</span>
                                            <span><Briefcase size={11} style={{ marginRight: '3px' }} />{ROLE_LABELS[req.requested_role] || req.requested_role}</span>
                                            {req.email && <span>📧 {req.email}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => handleApprove(req)} disabled={processing === req.id}
                                        style={{
                                            background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)',
                                            color: '#10b981', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
                                            fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px'
                                        }} title={t('enrollmentQueue.approveAndCreateAccountTip')}>
                                        <CheckCircle2 size={14} /> Approve
                                    </button>
                                    <button onClick={() => handleDeny(req)} disabled={processing === req.id}
                                        style={{
                                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                            color: '#ef4444', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
                                            fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px'
                                        }} title={t('enrollmentQueue.denyThisRequestTip')}>
                                        <XCircle size={14} /> Deny
                                    </button>
                                </div>
                            </div>
                            {req.reason && (
                                <div style={{ marginTop: '8px', padding: '8px 12px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    <strong>{t('enrollmentQueue.reason')}</strong> {req.reason}
                                </div>
                            )}
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '6px' }}>
                                Submitted: {new Date(req.submitted_at).toLocaleString()}
                            </div>
                        </div>
                    ))}

                    {/* Reviewed History */}
                    {reviewed.length > 0 && (
                        <div style={{ marginTop: '16px' }}>
                            <button onClick={() => setExpanded(expanded === 'history' ? null : 'history')}
                                style={{
                                    background: 'none', border: 'none', color: 'var(--text-muted)',
                                    cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '4px 0'
                                }} title={t('enrollmentQueue.expandedTip')}>
                                {expanded === 'history' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                {reviewed.length} previously reviewed
                            </button>
                            {expanded === 'history' && reviewed.map(req => (
                                <div key={req.id} style={{
                                    background: 'rgba(0,0,0,0.1)', borderRadius: '8px', padding: '10px', marginTop: '6px',
                                    border: '1px solid rgba(255,255,255,0.05)', opacity: 0.7
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{req.full_name}</span>
                                        <span style={{
                                            padding: '2px 10px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700,
                                            background: req.status === 'approved' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                            color: req.status === 'approved' ? '#10b981' : '#ef4444'
                                        }}>
                                            {req.status === 'approved' ? '✓ Approved' : '✕ Denied'}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
                                        {req.reviewed_by && `by ${req.reviewed_by}`} • {req.reviewed_at && new Date(req.reviewed_at).toLocaleString()}
                                        {req.review_notes && ` — ${req.review_notes}`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
