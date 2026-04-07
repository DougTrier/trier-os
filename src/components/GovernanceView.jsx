// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Governance & Security Dashboard
 * =============================================
 * Visibility into system security posture, user activity, access control,
 * and the immutable audit trail. For IT admins and compliance officers.
 *
 * SECTIONS:
 *   Audit Trail      — Timestamped log of all system actions (user, action, target, outcome)
 *                      Filterable by user, action type, date range, and plant
 *   User Activity    — Per-user login history, session duration, and last-active timestamps
 *   Security Events  — Failed logins, permission denials, anomalous API usage
 *   RBAC Monitor     — Current role assignments per user with plant-level scoping
 *   Access Review    — Users with elevated privileges flagged for periodic review
 *
 * The audit trail is append-only (logistics_db AuditLog table). No entries are
 * ever deleted — only time-range filtered for display. Export to CSV available.
 *
 * API CALLS:
 *   GET /api/analytics/activity     Structured audit log entries
 *   GET /api/analytics/audit        Formatted inter-plant transfer trail
 *   GET /api/auth/users             User roster with roles (admin only)
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Shield, Activity, Users, Lock, AlertTriangle, Filter, RefreshCw, ChevronDown, ChevronUp, CheckCircle, XCircle, Download, User } from 'lucide-react';
import SearchBar from './SearchBar';
import { TakeTourButton } from './ContextualTour';
import { useTranslation } from '../i18n/index.jsx';

const API = (path, opts = {}) => fetch(`/api${path}`, {
    ...opts,
    headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json',
        'x-plant-id': localStorage.getItem('selectedPlantId') || 'all_sites',
        ...opts.headers
    }
});

export default function GovernanceView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('audit');
    const [auditLogs, setAuditLogs] = useState([]);
    const [activityLogs, setActivityLogs] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [severityFilter, setSeverityFilter] = useState('all');
    const [actionFilter, setActionFilter] = useState('all');
    const [expandedRow, setExpandedRow] = useState(null);
    const [stats, setStats] = useState(null);

    const fetchData = () => {
        setLoading(true);
        Promise.all([
            API('/analytics/activity').then(r => r.ok ? r.json() : []),
            API('/analytics/audit').then(r => r.ok ? r.json() : []),
            API('/auth/users/list').then(r => r.ok ? r.json() : []).catch(() => []),
        ]).then(([activity, audit, usersData]) => {
            setActivityLogs(Array.isArray(activity) ? activity : []);
            setAuditLogs(Array.isArray(audit) ? audit : []);
            setUsers(Array.isArray(usersData) ? usersData : []);

            // Compute stats from activity logs
            const logArr = Array.isArray(activity) ? activity : [];
            const logins = logArr.filter(l => l.Action === 'LOGIN_SUCCESS').length;
            const failures = logArr.filter(l => l.Action === 'LOGIN_FAILURE').length;
            const warnings = logArr.filter(l => l.Severity === 'WARNING').length;
            const criticals = logArr.filter(l => l.Severity === 'CRITICAL' || l.Severity === 'ERROR').length;
            const uniqueUsers = new Set(logArr.map(l => l.UserID)).size;
            setStats({ logins, failures, warnings, criticals, uniqueUsers, total: logArr.length });
            setLoading(false);
        }).catch(() => setLoading(false));
    };

    useEffect(() => { fetchData(); }, []);

    const uniqueActions = useMemo(() => {
        const actions = new Set(activityLogs.map(l => l.Action));
        return ['all', ...Array.from(actions).sort()];
    }, [activityLogs]);

    const filteredLogs = useMemo(() => {
        return activityLogs.filter(log => {
            if (severityFilter !== 'all' && log.Severity !== severityFilter) return false;
            if (actionFilter !== 'all' && log.Action !== actionFilter) return false;
            if (searchTerm) {
                const s = searchTerm.toLowerCase();
                return (log.UserID || '').toLowerCase().includes(s) ||
                       (log.Action || '').toLowerCase().includes(s) ||
                       (log.Details || '').toLowerCase().includes(s) ||
                       (log.PlantID || '').toLowerCase().includes(s);
            }
            return true;
        });
    }, [activityLogs, severityFilter, actionFilter, searchTerm]);

    const severityBadge = (sev) => {
        const map = {
            'INFO':     { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
            'WARNING':  { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
            'ERROR':    { bg: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'rgba(239,68,68,0.3)' },
            'CRITICAL': { bg: 'rgba(220,38,38,0.2)', color: '#ef4444', border: 'rgba(220,38,38,0.4)' },
        };
        const s = map[sev] || map.INFO;
        return (
            <span style={{
                padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700,
                background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>{sev}</span>
        );
    };

    const actionBadge = (action) => {
        let color = '#818cf8';
        if (action?.includes('LOGIN_SUCCESS')) color = '#34d399';
        else if (action?.includes('LOGIN_FAILURE')) color = '#f87171';
        else if (action?.includes('DELETE')) color = '#ef4444';
        else if (action?.includes('CREATE') || action?.includes('ADD')) color = '#10b981';
        else if (action?.includes('UPDATE') || action?.includes('EDIT')) color = '#f59e0b';
        else if (action?.includes('TRANSFER') || action?.includes('SHIP')) color = '#06b6d4';
        return (
            <span style={{
                padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 600,
                background: `${color}18`, color, border: `1px solid ${color}30`,
                fontFamily: 'monospace'
            }}>{action}</span>
        );
    };

    const tabs = [
        { id: 'audit', label: t('governance.securityAudit', 'Security Audit'), icon: Shield, count: stats?.total },
        { id: 'logins', label: t('governance.loginActivity', 'Login Activity'), icon: Lock, count: stats?.logins },
        { id: 'users', label: t('governance.userRolesRbac', 'User Roles & RBAC'), icon: Users, count: users.length },
        { id: 'transfers', label: t('governance.transferLedger', 'Transfer Ledger'), icon: Activity, count: auditLogs.length },
    ];

    const loginLogs = useMemo(() =>
        activityLogs.filter(l => l.Action === 'LOGIN_SUCCESS' || l.Action === 'LOGIN_FAILURE'),
        [activityLogs]
    );

    const exportAudit = () => {
        const csv = ['Timestamp,User,Action,Severity,Plant,Details']
            .concat(filteredLogs.map(l =>
                `"${l.Timestamp || ''}","${l.UserID || ''}","${l.Action || ''}","${l.Severity || ''}","${l.PlantID || ''}","${(l.Details || '').replace(/"/g, '""')}"`
            )).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    return (
        <div style={{ padding: '0 20px 20px', maxWidth: 1400, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', padding: '10px', borderRadius: '14px', boxShadow: '0 4px 16px rgba(239,68,68,0.3)' }}>
                            <Shield size={22} color="#fff" />
                        </div>
                        {t('governance.governanceSecurity', 'Governance & Security')}
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0 }}>{t('governance.enterpriseAuditTrail', 'Enterprise audit trail, security monitoring, RBAC enforcement & compliance oversight')}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <TakeTourButton tourId="governance" nestedTab={tab} />
                    <button onClick={exportAudit} title={t('governance.exportAuditLogAsCsvTip')} style={{
                        padding: '8px 16px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600,
                        background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                    }}><Download size={14} /> {t('governance.exportCsv', 'Export CSV')}</button>
                    <button onClick={fetchData} disabled={loading} title={t('governance.refreshAuditDataTip')} style={{
                        padding: '8px 16px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600,
                        background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                    }}><RefreshCw size={14} className={loading ? 'spinning' : ''} /> {t('governance.refresh', 'Refresh')}</button>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
                    {[
                        { label: t('governance.totalEvents', 'Total Events'), value: stats.total, icon: Activity, color: '#6366f1' },
                        { label: t('governance.successfulLogins', 'Successful Logins'), value: stats.logins, icon: CheckCircle, color: '#10b981' },
                        { label: t('governance.failedLogins', 'Failed Logins'), value: stats.failures, icon: XCircle, color: '#ef4444' },
                        { label: t('governance.securityWarnings', 'Security Warnings'), value: stats.warnings + stats.criticals, icon: AlertTriangle, color: '#f59e0b' },
                        { label: t('governance.uniqueUsers', 'Unique Users'), value: stats.uniqueUsers, icon: Users, color: '#06b6d4' },
                    ].map(s => (
                        <div key={s.label} style={{
                            background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '16px',
                            border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '14px'
                        }}>
                            <div style={{
                                width: 42, height: 42, borderRadius: '12px',
                                background: `${s.color}15`, border: `1px solid ${s.color}30`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <s.icon size={18} color={s.color} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#e2e8f0' }}>{s.value}</div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{s.label}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tab Bar */}
            <div className="nav-pills" style={{ marginBottom: 16 }}>
                {tabs.map(tabItem => (
                    <button key={tabItem.id} className={`btn-nav${tab === tabItem.id ? ' active' : ''}`} onClick={() => setTab(tabItem.id)} title="Tab">
                        <tabItem.icon size={15} />
                        {tabItem.label}
                        {tabItem.count > 0 && (
                            <span style={{
                                padding: '1px 6px', borderRadius: '8px', fontSize: '0.6rem', fontWeight: 800,
                                background: tab === tabItem.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.08)',
                                color: tab === tabItem.id ? '#a5b4fc' : '#64748b'
                            }}>{tabItem.count}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Security Audit Tab */}
            {tab === 'audit' && (
                <div>
                    {/* Filter Bar */}
                    <div style={{
                        display: 'flex', gap: '10px', marginBottom: '14px', padding: '12px 16px',
                        background: 'rgba(0,0,0,0.15)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)',
                        alignItems: 'center', flexWrap: 'wrap'
                    }}>
                        <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder={t('governance.searchUserActionDetailsPlaceholder')} style={{ flex: 1, minWidth: 200 }} />
                        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
                            style={{
                                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px', padding: '7px 12px', color: '#e2e8f0', fontSize: '0.8rem'
                            }}>
                            <option value="all">{t('governance.allSeverity')}</option>
                            <option value="INFO">{t('governance.info')}</option>
                            <option value="WARNING">{t('governance.warning')}</option>
                            <option value="ERROR">{t('governance.error')}</option>
                            <option value="CRITICAL">{t('governance.critical')}</option>
                        </select>
                        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
                            style={{
                                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px', padding: '7px 12px', color: '#e2e8f0', fontSize: '0.8rem', maxWidth: '200px'
                            }}>
                            {uniqueActions.map(a => <option key={a} value={a}>{a === 'all' ? 'All Actions' : a}</option>)}
                        </select>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {filteredLogs.length} event{filteredLogs.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Audit Table */}
                    <div style={{
                        borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)',
                        background: 'rgba(0,0,0,0.15)'
                    }}>
                        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('governance.timestamp', 'Timestamp')}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.user', 'User')}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.action', 'Action')}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.severity', 'Severity')}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.plant', 'Plant')}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.details', 'Details')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLogs.slice(0, 200).map((log, i) => (
                                    <React.Fragment key={log.ID || i}>
                                        <tr onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                                            style={{
                                                borderTop: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer',
                                                background: expandedRow === i ? 'rgba(239,68,68,0.05)' : (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'),
                                                transition: 'background 0.15s'
                                            }}>
                                            <td style={{ padding: '8px 14px', color: '#94a3b8', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.72rem' }}>
                                                {log.Timestamp ? new Date(log.Timestamp).toLocaleString() : '—'}
                                            </td>
                                            <td style={{ padding: '8px 14px', color: '#e2e8f0', fontWeight: 600 }}>{log.UserID || 'SYSTEM'}</td>
                                            <td style={{ padding: '8px 14px' }}>{actionBadge(log.Action)}</td>
                                            <td style={{ padding: '8px 14px' }}>{severityBadge(log.Severity)}</td>
                                            <td style={{ padding: '8px 14px', color: '#94a3b8', fontSize: '0.75rem' }}>{log.PlantID || '—'}</td>
                                            <td style={{ padding: '8px 14px', color: '#94a3b8', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {log.Details ? (typeof log.Details === 'string' ? log.Details.slice(0, 80) : JSON.stringify(log.Details).slice(0, 80)) : '—'}
                                                {expandedRow === i ? <ChevronUp size={12} style={{ marginLeft: 4 }} /> : <ChevronDown size={12} style={{ marginLeft: 4 }} />}
                                            </td>
                                        </tr>
                                        {expandedRow === i && (
                                            <tr>
                                                <td colSpan={6} style={{
                                                    padding: '12px 20px', background: 'rgba(0,0,0,0.2)',
                                                    borderBottom: '1px solid rgba(255,255,255,0.06)'
                                                }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                        <div>
                                                            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{t('governance.fullDetails', 'Full Details')}</div>
                                                            <pre style={{ fontSize: '0.75rem', color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px' }}>
                                                                {log.Details ? (typeof log.Details === 'string' ? log.Details : JSON.stringify((() => { try { return JSON.parse(log.Details); } catch { return null; } })(), null, 2)) : 'No details'}
                                                            </pre>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{t('governance.metadata', 'Metadata')}</div>
                                                            <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.8 }}>
                                                                <div><strong>{t('governance.eventId')}</strong> {log.ID || '—'}</div>
                                                                <div><strong>{t('governance.ipAddress')}</strong> {log.IPAddress || 'Not recorded'}</div>
                                                                <div><strong>{t('governance.timestamp')}</strong> {log.Timestamp || '—'}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                                {filteredLogs.length === 0 && (
                                    <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                        {t('governance.noAuditEventsMatch', 'No audit events match your filters')}
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Login Activity Tab */}
            {tab === 'logins' && (
                <div>
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px'
                    }}>
                        {[
                            { label: t('governance.successfulLogins', 'Successful Logins'), value: loginLogs.filter(l => l.Action === 'LOGIN_SUCCESS').length, color: '#10b981', icon: CheckCircle },
                            { label: t('governance.failedAttempts', 'Failed Attempts'), value: loginLogs.filter(l => l.Action === 'LOGIN_FAILURE').length, color: '#ef4444', icon: XCircle },
                            { label: t('governance.uniqueUsers', 'Unique Users'), value: new Set(loginLogs.map(l => l.UserID)).size, color: '#6366f1', icon: Users },
                        ].map(s => (
                            <div key={s.label} style={{
                                background: `${s.color}08`, borderRadius: '14px', padding: '20px',
                                border: `1px solid ${s.color}20`, textAlign: 'center'
                            }}>
                                <s.icon size={24} color={s.color} style={{ marginBottom: 8 }} />
                                <div style={{ fontSize: '2rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{s.label}</div>
                            </div>
                        ))}
                    </div>

                    <div style={{ borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' }}>
                        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.time', 'Time')}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.user', 'User')}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.status', 'Status')}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.ipAddress', 'IP Address')}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.details', 'Details')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loginLogs.map((log, i) => (
                                    <tr key={`item-${i}`} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                        <td style={{ padding: '8px 14px', color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.72rem' }}>{log.Timestamp ? new Date(log.Timestamp).toLocaleString() : '—'}</td>
                                        <td style={{ padding: '8px 14px', color: '#e2e8f0', fontWeight: 600 }}>{log.UserID}</td>
                                        <td style={{ padding: '8px 14px' }}>
                                            {log.Action === 'LOGIN_SUCCESS' ?
                                                <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} /> {t('governance.success', 'Success')}</span> :
                                                <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}><XCircle size={14} /> {t('governance.failed', 'Failed')}</span>
                                            }
                                        </td>
                                        <td style={{ padding: '8px 14px', color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.72rem' }}>{log.IPAddress || '—'}</td>
                                        <td style={{ padding: '8px 14px', color: '#94a3b8' }}>
                                            {log.Details ? (() => { try { const d = JSON.parse(log.Details); return d.reason || d.role || '—'; } catch { return log.Details; } })() : '—'}
                                        </td>
                                    </tr>
                                ))}
                                {loginLogs.length === 0 && (
                                    <tr><td colSpan={5} className="table-empty">{t('governance.noLoginEventsRecorded', 'No login events recorded')}</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* User Roles & RBAC Tab */}
            {tab === 'users' && (
                <div>
                    <div style={{
                        background: 'rgba(99,102,241,0.06)', borderRadius: '14px', padding: '16px 20px',
                        border: '1px solid rgba(99,102,241,0.15)', marginBottom: '16px',
                        display: 'flex', alignItems: 'center', gap: '12px'
                    }}>
                        <Shield size={18} color="#818cf8" />
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                            Trier OS uses a multi-tier RBAC model: <strong style={{ color: '#e2e8f0' }}>IT Admin</strong> (full access), <strong style={{ color: '#e2e8f0' }}>Manager</strong> (plant-level read/write), <strong style={{ color: '#e2e8f0' }}>Technician</strong> (plant-level work orders). Plant Jail ensures users cannot access other plants' data.
                        </span>
                    </div>

                    <div style={{ borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' }}>
                        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.username', 'Username')}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.role', 'Role')}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.plantAccess', 'Plant Access')}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.globalAccess', 'Global Access')}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{t('governance.status', 'Status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user, i) => {
                                    const roleColor = user.DefaultRole === 'it_admin' ? '#ef4444' : user.DefaultRole === 'manager' ? '#f59e0b' : '#10b981';
                                    return (
                                        <tr key={`item-${i}`} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                            <td style={{ padding: '8px 14px', color: '#e2e8f0', fontWeight: 600 }}>{user.Username}</td>
                                            <td style={{ padding: '8px 14px' }}>
                                                <span style={{
                                                    padding: '2px 10px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 700,
                                                    background: `${roleColor}15`, color: roleColor, border: `1px solid ${roleColor}30`,
                                                    textTransform: 'uppercase'
                                                }}>{(user.DefaultRole || 'technician').replace(/_/g, ' ')}</span>
                                            </td>
                                            <td style={{ padding: '8px 14px', color: '#94a3b8', fontSize: '0.75rem' }}>
                                                {user.NativePlantId ? user.NativePlantId.replace(/_/g, ' ') : 'Not assigned'}
                                            </td>
                                            <td style={{ padding: '8px 14px' }}>
                                                {user.GlobalAccess ? <span style={{ color: '#10b981' }}>{t('governance.enterprise', '✓ Enterprise')}</span> : <span style={{ color: '#64748b' }}>{t('governance.plantOnly', 'Plant Only')}</span>}
                                            </td>
                                            <td style={{ padding: '8px 14px' }}>
                                                <span style={{ color: user.IsLocked ? '#ef4444' : '#10b981' }}>
                                                    {user.IsLocked ? '🔒 Locked' : '🟢 Active'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {users.length === 0 && (
                                    <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                        {t('governance.userListRequiresItAdmin', 'User list requires IT Admin access')}
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Transfer Ledger Tab */}
            {tab === 'transfers' && (
                <div>
                    <div style={{ borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' }}>
                        {auditLogs.length > 0 ? auditLogs.map((entry, i) => (
                            <div key={`item-${i}`} style={{
                                padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                display: 'flex', alignItems: 'flex-start', gap: '12px',
                                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'
                            }}>
                                <div style={{
                                    width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                                    background: entry.includes('PENDING') ? '#f59e0b' : entry.includes('SHIPPED') ? '#3b82f6' : entry.includes('RECEIVED') ? '#10b981' : '#ef4444'
                                }} />
                                <span style={{ color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.6 }}>{entry}</span>
                            </div>
                        )) : (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                {t('governance.noTransferAuditEntries', 'No transfer audit entries found')}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
