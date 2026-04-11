// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Compliance Tracker
 * ===============================
 * Regulatory compliance dashboard tracking inspection status, upcoming due
 * dates, and compliance scores across all active frameworks per plant.
 *
 * FRAMEWORKS SUPPORTED:
 *   OSHA   — Workplace safety inspections, hazard assessments, incident reports
 *   EPA    — Environmental permit compliance, discharge monitoring, waste manifests
 *   FDA    — Food safety (FSMA/HACCP), sanitation audits, product recall readiness
 *   DOT    — Fleet DOT inspection schedules, driver qualification, DVIR records
 *   Custom — Plant-defined internal compliance programs
 *
 * KEY FEATURES:
 *   - Compliance score gauge: overall % compliance per framework (color-coded)
 *   - Upcoming inspections calendar: next 30/60/90 day view with owner assignment
 *   - Overdue alert badges: red counts for each framework in the tab header
 *   - Inspection detail panel: history, findings, corrective actions, attachments
 *   - Create inspection record: schedule new inspection with framework + due date
 *   - Print compliance report: formatted summary for auditor or regulator submission
 *   - Corrective action tracking: link each finding to a follow-up work order
 *
 * API CALLS:
 *   GET  /api/compliance                    — All compliance records (plant-scoped)
 *   POST /api/compliance                    — Create new inspection record
 *   PUT  /api/compliance/:id                — Update inspection findings/status
 *   GET  /api/compliance/upcoming           — Next 90 days inspection schedule
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Shield, Plus, X, CheckCircle2, Clock, ChevronRight, FileText, Calendar, Printer } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import LoadingSpinner from './LoadingSpinner';
import ActionBar from './ActionBar';

export default function ComplianceTracker({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [stats, setStats] = useState(null);
    const [frameworks, setFrameworks] = useState([]);
    const [checklists, setChecklists] = useState([]);
    const [inspections, setInspections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeView, setActiveView] = useState('dashboard'); // dashboard | checklists | inspection
    const [selectedInspection, setSelectedInspection] = useState(null);
    const [showNewChecklist, setShowNewChecklist] = useState(false);
    const [showSchedule, setShowSchedule] = useState(false);
    const [newChecklist, setNewChecklist] = useState({ framework_id: '', title: '', description: '', frequency: 'monthly', items: [''] });
    const [scheduleForm, setScheduleForm] = useState({ checklist_id: '', inspector: '', scheduled_date: '' });

    const headers = { 'Content-Type': 'application/json' };

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [statsRes, frameworksRes, checklistsRes, inspectionsRes] = await Promise.all([
                fetch(`/api/compliance/stats?plant_id=${plantId || 'all_sites'}`, { headers }),
                fetch('/api/compliance/frameworks', { headers }),
                fetch(`/api/compliance/checklists?plant_id=${plantId || 'all_sites'}`, { headers }),
                fetch(`/api/compliance/inspections?plant_id=${plantId || 'all_sites'}&status=completed&limit=20`, { headers })
            ]);
            setStats(await statsRes.json());
            setFrameworks(await frameworksRes.json());
            setChecklists(await checklistsRes.json());
            setInspections(await inspectionsRes.json());
        } catch (e) { console.error('Compliance fetch error:', e); }
        setLoading(false);
    };

    useEffect(() => { fetchAll(); }, [plantId]);

    const createChecklist = async () => {
        if (!newChecklist.framework_id || !newChecklist.title) return;
        const validItems = newChecklist.items.filter(i => i.trim());
        if (validItems.length === 0) return window.trierToast?.error('Add at least one checklist item.');

        await fetch('/api/compliance/checklists', {
            method: 'POST', headers,
            body: JSON.stringify({
                ...newChecklist,
                plant_id: plantId,
                items: validItems.map(text => ({ text }))
            })
        });
        setNewChecklist({ framework_id: '', title: '', description: '', frequency: 'monthly', items: [''] });
        setShowNewChecklist(false);
        fetchAll();
    };

    const scheduleInspection = async () => {
        if (!scheduleForm.checklist_id) return;
        await fetch('/api/compliance/inspections', {
            method: 'POST', headers,
            body: JSON.stringify({ ...scheduleForm, plant_id: plantId })
        });
        setScheduleForm({ checklist_id: '', inspector: '', scheduled_date: '' });
        setShowSchedule(false);
        fetchAll();
    };

    const openInspection = async (id) => {
        try {
            const res = await fetch(`/api/compliance/inspections/${id}`, { headers });
            const data = await res.json();
            setSelectedInspection(data);
            setActiveView('inspection');
        } catch (e) { console.error(e); }
    };

    const updateFinding = async (findingId, updates) => {
        await fetch(`/api/compliance/findings/${findingId}`, {
            method: 'PUT', headers,
            body: JSON.stringify(updates)
        });
        // Re-fetch the inspection
        if (selectedInspection) openInspection(selectedInspection.id);
    };

    const completeInspection = async () => {
        if (!selectedInspection) return;
        const pending = selectedInspection.findings.filter(f => f.status === 'pending');
        if (pending.length > 0) return window.trierToast?.info('Please review all pending items before finalizing the inspection.');

        await fetch(`/api/compliance/inspections/${selectedInspection.id}`, {
            method: 'PUT', headers,
            body: JSON.stringify({ status: 'completed' })
        });
        openInspection(selectedInspection.id);
        fetchAll();
    };

    const startInspection = async (id) => {
        await fetch(`/api/compliance/inspections/${id}`, {
            method: 'PUT', headers,
            body: JSON.stringify({ status: 'in_progress' })
        });
        openInspection(id);
    };

    const scoreColor = (score) => {
        if (score >= 90) return '#10b981';
        if (score >= 70) return '#f59e0b';
        return '#ef4444';
    };

    const statusBadge = (status) => {
        const map = {
            scheduled: { bg: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', label: 'Scheduled' },
            in_progress: { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', label: 'In Progress' },
            completed: { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', label: t('compliance.tracker.completed') },
            overdue: { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', label: 'Overdue' }
        };
        const s = map[status] || map.scheduled;
        return <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', background: s.bg, color: s.color, border: `1px solid ${s.color}30` }}>{s.label}</span>;
    };

    if (loading) return <LoadingSpinner message={t('compliance.tracker.loadingComplianceModule')} />;

    // ═══════════════════════════════════════════════
    // INSPECTION DETAIL VIEW
    // ═══════════════════════════════════════════════
    if (activeView === 'inspection' && selectedInspection) {
        const insp = selectedInspection;
        const findings = insp.findings || [];
        const passed = findings.filter(f => f.status === 'pass').length;
        const failed = findings.filter(f => f.status === 'fail').length;
        const na = findings.filter(f => f.status === 'na').length;
        const pending = findings.filter(f => f.status === 'pending').length;
        const scoreable = findings.length - na;
        const liveScore = scoreable > 0 ? Math.round((passed / scoreable) * 100) : 100;

        return (
            <div className="glass-card" style={{ padding: 'var(--card-padding)', flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Header built using standard ActionBar */}
                <ActionBar
                    title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.3rem' }}>{insp.framework_icon}</span>
                            <div>
                                <span style={{ fontWeight: '600' }}>{insp.checklist_title}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '10px' }}>
                                    {insp.framework_name} • {insp.scheduled_date}
                                </span>
                            </div>
                        </div>
                    }
                    isEditing={false}
                    showEdit={false}
                    showDelete={false}
                    showPrint={true}
                    onPrint={() => window.triggerTrierPrint('inspection', insp)}
                    onClose={() => { setActiveView('dashboard'); setSelectedInspection(null); }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginLeft: 'auto' }}>
                        {statusBadge(insp.status)}
                        <div style={{ textAlign: 'center', borderLeft: '1px solid var(--glass-border)', paddingLeft: '15px' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: scoreColor(liveScore), lineHeight: '1' }}>{liveScore}%</div>
                        </div>
                    </div>
                </ActionBar>

                {/* Progress Bar */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '15px', height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
                    {passed > 0 && <div style={{ flex: passed, background: '#10b981', transition: 'flex 0.3s' }} />}
                    {failed > 0 && <div style={{ flex: failed, background: '#ef4444', transition: 'flex 0.3s' }} />}
                    {na > 0 && <div style={{ flex: na, background: '#64748b', transition: 'flex 0.3s' }} />}
                    {pending > 0 && <div style={{ flex: pending, background: 'rgba(255,255,255,0.1)', transition: 'flex 0.3s' }} />}
                </div>
                <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', fontSize: '0.75rem' }}>
                    <span style={{ color: '#10b981' }}>✓ {passed} Passed</span>
                    <span style={{ color: '#ef4444' }}>✗ {failed} Failed</span>
                    <span style={{ color: '#64748b' }}>— {na} N/A</span>
                    <span style={{ color: 'var(--text-muted)' }}>⏳ {pending} Pending</span>
                </div>

                {/* Findings List */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {findings.map((finding, idx) => (
                        <div key={finding.id} style={{
                            display: 'flex', alignItems: 'center', gap: '12px',
                            padding: '12px 15px', borderRadius: '10px',
                            background: finding.status === 'pass' ? 'rgba(16, 185, 129, 0.05)' :
                                finding.status === 'fail' ? 'rgba(239, 68, 68, 0.05)' :
                                    finding.status === 'na' ? 'rgba(100, 116, 139, 0.05)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${finding.status === 'pass' ? 'rgba(16, 185, 129, 0.2)' :
                                finding.status === 'fail' ? 'rgba(239, 68, 68, 0.2)' :
                                    finding.status === 'na' ? 'rgba(100, 116, 139, 0.2)' : 'var(--glass-border)'}`
                        }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', minWidth: '25px' }}>#{idx + 1}</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>{finding.item_text}</div>
                                {finding.corrective_action && (
                                    <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '4px' }}>
                                        ⚠️ Corrective: {finding.corrective_action}
                                    </div>
                                )}
                            </div>
                            {insp.status !== 'completed' && (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => updateFinding(finding.id, { status: 'pass' })}
                                        style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', background: finding.status === 'pass' ? '#10b981' : 'rgba(16, 185, 129, 0.1)', color: finding.status === 'pass' ? '#fff' : '#10b981' }} title="Mark this item as passed">
                                        ✓ Pass
                                    </button>
                                    <button onClick={async () => {
                                        const action = await prompt('Describe the corrective action needed:');
                                        if (action !== null) updateFinding(finding.id, { status: 'fail', severity: 'medium', corrective_action: action });
                                    }}
                                        style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', background: finding.status === 'fail' ? '#ef4444' : 'rgba(239, 68, 68, 0.1)', color: finding.status === 'fail' ? '#fff' : '#ef4444' }} title="Mark this item as failed and add corrective action">
                                        ✗ Fail
                                    </button>
                                    <button onClick={() => updateFinding(finding.id, { status: 'na' })}
                                        style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', background: finding.status === 'na' ? '#64748b' : 'rgba(100, 116, 139, 0.1)', color: finding.status === 'na' ? '#fff' : '#64748b' }} title="Mark this item as not applicable">
                                        N/A
                                    </button>
                                </div>
                            )}
                            {insp.status === 'completed' && (
                                <div style={{ fontSize: '0.9rem' }}>
                                    {finding.status === 'pass' ? '✅' : finding.status === 'fail' ? '❌' : '➖'}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Footer Actions */}
                {insp.status !== 'completed' && (
                    <div style={{ display: 'flex', gap: '10px', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--glass-border)' }}>
                        {insp.status === 'scheduled' && (
                            <button onClick={() => startInspection(insp.id)} className="btn-edit"
                                title={t('compliance.startPerformingThisInspectionTip')}>
                                <Clock size={16} /> {t('compliance.tracker.beginInspection')}
                            </button>
                        )}
                        {(insp.status === 'in_progress' || insp.status === 'overdue') && (
                            <button onClick={completeInspection} className="btn-save"
                                disabled={pending > 0}
                                title={pending > 0 ? `${pending} items still need review` : 'Complete and finalize this inspection'}>
                                <CheckCircle2 size={16} /> {pending > 0 ? `${pending} Items Pending` : 'Finalize Inspection'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // ═══════════════════════════════════════════════
    // MAIN COMPLIANCE DASHBOARD
    // ═══════════════════════════════════════════════
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header */}
            <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                            <Shield size={24} color="#ef4444" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>{t('compliance.tracker.complianceRegulatoryTracker')}</h2>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                OSHA • FDA • EPA • PSM — Audit-ready compliance management
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setShowSchedule(true)} className="btn-edit btn-sm"
                            title={t('compliance.scheduleANewComplianceInspectionTip')}>
                            <Calendar size={16} /> {t('compliance.tracker.scheduleInspection')}
                        </button>
                        <button onClick={() => setShowNewChecklist(true)} className="btn-primary btn-sm"
                            title={t('compliance.createANewComplianceChecklistTip')}>
                            <Plus size={16} /> {t('compliance.tracker.newChecklist')}
                        </button>
                    </div>
                </div>

                {/* KPI Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    <div style={{ textAlign: 'center', padding: '15px', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: scoreColor(stats?.overall?.avg_score || 0) }}>
                            {stats?.overall?.avg_score || '—'}%
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('compliance.tracker.avgCompliance')}</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '15px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#818cf8' }}>{stats?.overall?.completed || 0}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('compliance.tracker.completed')}</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '15px', background: 'rgba(245, 158, 11, 0.05)', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
                            {(stats?.overall?.scheduled || 0) + (stats?.overall?.in_progress || 0)}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('compliance.tracker.pending')}</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '15px', background: stats?.findings?.open_findings > 0 ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255,255,255,0.02)', borderRadius: '12px', border: `1px solid ${stats?.findings?.open_findings > 0 ? 'rgba(239, 68, 68, 0.15)' : 'var(--glass-border)'}` }}>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: stats?.findings?.open_findings > 0 ? '#ef4444' : '#10b981' }}>
                            {stats?.findings?.open_findings || 0}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('compliance.tracker.openFindings')}</div>
                    </div>
                </div>
            </div>

            {/* Framework Compliance Bars */}
            <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={18} color="var(--primary)" /> {t('compliance.tracker.complianceByFramework')}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(stats?.byFramework || []).map(fw => (
                        <div key={fw.code} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 15px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}>
                            <span style={{ fontSize: '1.3rem', width: '30px', textAlign: 'center' }}>{fw.icon}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{fw.name}</span>
                                    <span style={{ fontWeight: 'bold', color: fw.avg_score ? scoreColor(fw.avg_score) : 'var(--text-muted)', fontSize: '0.9rem' }}>
                                        {fw.avg_score ? `${fw.avg_score}%` : 'No data'}
                                    </span>
                                </div>
                                <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${fw.avg_score || 0}%`, background: fw.color || 'var(--primary)', borderRadius: '3px', transition: 'width 0.5s ease' }} />
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: '60px' }}>
                                {fw.completed || 0} done<br />{fw.pending || 0} pending
                            </div>
                        </div>
                    ))}
                    {(!stats?.byFramework || stats.byFramework.length === 0) && (
                        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {t('compliance.tracker.noFrameworksConfiguredCreate')}
                        </div>
                    )}
                </div>
            </div>

            {/* Two-column: Upcoming Inspections & Checklists */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Upcoming Inspections */}
                <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                    <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={18} color="#f59e0b" /> {t('compliance.tracker.upcomingInspections')}
                    </h3>
                    {(stats?.upcoming || []).length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {stats.upcoming.map(insp => (
                                <div key={insp.id} onClick={() => openInspection(insp.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', cursor: 'pointer', transition: 'all 0.2s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
                                    <span style={{ fontSize: '1.1rem' }}>{insp.framework_icon}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{insp.checklist_title}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{insp.scheduled_date} • {insp.inspector || 'Unassigned'}</div>
                                    </div>
                                    {statusBadge(insp.status)}
                                    <button className="btn-nav" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={(e) => { e.stopPropagation(); openInspection(insp.id); }} title={t('compliance.openThisInspectionToViewOrPrintTip')}>
                                        {t('common.view', 'View')}
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {t('compliance.tracker.noUpcomingInspectionsSchedule')}
                        </div>
                    )}
                </div>

                {/* Recent Completed */}
                <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                    <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle2 size={18} color="#10b981" /> {t('compliance.tracker.completedInspections')}
                    </h3>
                    {inspections.filter(i => i.status === 'completed').length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {inspections.filter(i => i.status === 'completed').slice(0, 8).map(insp => (
                                <div key={insp.id} onClick={() => openInspection(insp.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', cursor: 'pointer', transition: 'all 0.2s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
                                    <span style={{ fontSize: '1.1rem' }}>{insp.framework_icon}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{insp.checklist_title}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{insp.completed_date?.split('T')[0] || insp.scheduled_date}</div>
                                    </div>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: scoreColor(insp.score || 0) }}>
                                        {insp.score || 0}%
                                    </div>
                                    <button className="btn-nav" style={{ padding: '6px 12px', fontSize: '0.75rem', marginLeft: '10px' }} onClick={(e) => { e.stopPropagation(); openInspection(insp.id); }} title={t('compliance.openThisInspectionToViewOrPrintTip')}>
                                        {t('common.view', 'View')}
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {t('compliance.tracker.noCompletedInspectionsYet')}
                        </div>
                    )}
                </div>
            </div>

            {/* Available Checklists */}
            <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={18} color="var(--primary)" /> Checklist Templates ({checklists.length})
                </h3>
                {checklists.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                        {checklists.map(cl => (
                            <div key={cl.id} style={{ padding: '15px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${cl.framework_color}30`, borderLeft: `4px solid ${cl.framework_color}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                                    <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{cl.title}</div>
                                    <span style={{ fontSize: '0.9rem' }}>{cl.framework_icon}</span>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                    {cl.framework_name} • {cl.item_count} items • {cl.frequency}
                                </div>
                                {cl.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{cl.description}</div>}
                                <button onClick={() => { setScheduleForm({ ...scheduleForm, checklist_id: cl.id }); setShowSchedule(true); }}
                                    className="btn-primary btn-sm" style={{ width: '100%' }} title={`Schedule an inspection using "${cl.title}"`}>
                                    <Calendar size={12} /> {t('compliance.tracker.scheduleInspection')}
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No checklists created yet. Click "New Checklist" to create a compliance template.
                    </div>
                )}
            </div>

            {/* ═══ NEW CHECKLIST MODAL ═══ */}
            {showNewChecklist && createPortal((
                <div className="modal-overlay print-exclude" style={{ padding: '20px' }} onClick={() => setShowNewChecklist(false)}>
                    <div style={{ background: 'var(--glass-bg, #1e293b)', border: '2px solid var(--primary)', borderRadius: '16px', padding: '24px', maxWidth: '550px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 0 40px rgba(99, 102, 241, 0.3)' }}
                        onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Shield size={22} color="var(--primary)" /> {t('compliance.tracker.newComplianceChecklist')}
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('compliance.tracker.regulatoryFramework')}</label>
                                <select value={newChecklist.framework_id} onChange={e => setNewChecklist({ ...newChecklist, framework_id: e.target.value })}
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff' }} title={t('compliance.selectTheRegulatoryFrameworkForTip')}>
                                    <option value="">{t('compliance.tracker.selectFramework')}</option>
                                    {frameworks.map(f => <option key={f.id} value={f.id}>{f.icon} {f.name} ({f.code})</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('compliance.tracker.checklistTitle')}</label>
                                <input type="text" value={newChecklist.title} onChange={e => setNewChecklist({ ...newChecklist, title: e.target.value })}
                                    placeholder={t('compliance.tracker.egMonthlyFireSafety')}
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff' }} title={t('compliance.enterADescriptiveTitleForTip')} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('compliance.tracker.frequency')}</label>
                                <select value={newChecklist.frequency} onChange={e => setNewChecklist({ ...newChecklist, frequency: e.target.value })}
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff' }} title={t('compliance.howOftenThisChecklistShouldTip')}>
                                    <option value="daily">{t('compliance.tracker.daily')}</option>
                                    <option value="weekly">{t('compliance.tracker.weekly')}</option>
                                    <option value="monthly">{t('compliance.tracker.monthly')}</option>
                                    <option value="quarterly">{t('compliance.tracker.quarterly')}</option>
                                    <option value="semi-annual">{t('compliance.tracker.semiannual')}</option>
                                    <option value="annual">{t('compliance.tracker.annual')}</option>
                                    <option value="as-needed">{t('compliance.tracker.asNeeded')}</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                                    Inspection Items ({newChecklist.items.filter(i => i.trim()).length})
                                </label>
                                {newChecklist.items.map((item, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                                        <input type="text" value={item}
                                            onChange={e => {
                                                const updated = [...newChecklist.items];
                                                updated[idx] = e.target.value;
                                                setNewChecklist({ ...newChecklist, items: updated });
                                            }}
                                            placeholder={`Item ${idx + 1}...`}
                                            style={{ flex: 1, padding: '8px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '0.85rem' }} title={t('compliance.enterAComplianceInspectionItemTip')} />
                                        {newChecklist.items.length > 1 && (
                                            <button onClick={() => setNewChecklist({ ...newChecklist, items: newChecklist.items.filter((_, i) => i !== idx) })}
                                                style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '0 8px', borderRadius: '6px', cursor: 'pointer' }} title={t('compliance.removeThisInspectionItemTip')}>
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button onClick={() => setNewChecklist({ ...newChecklist, items: [...newChecklist.items, ''] })}
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px dashed var(--glass-border)', color: 'var(--text-muted)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', width: '100%' }} title={t('compliance.addAnotherInspectionItemTip')}>
                                    + Add Item
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowNewChecklist(false)} className="btn-nav" title={t('compliance.cancelCreatingChecklistTip')}>{t('compliance.tracker.cancel')}</button>
                            <button onClick={createChecklist} className="btn-save" disabled={!newChecklist.framework_id || !newChecklist.title}
                                title={t('compliance.createThisComplianceChecklistTip')}>{t('compliance.tracker.createChecklist')}</button>
                        </div>
                    </div>
                </div>
            ), document.body)}

            {/* ═══ SCHEDULE INSPECTION MODAL ═══ */}
            {showSchedule && createPortal((
                <div className="modal-overlay print-exclude" style={{ padding: '20px' }} onClick={() => setShowSchedule(false)}>
                    <div style={{ background: 'var(--glass-bg, #1e293b)', border: '2px solid #f59e0b', borderRadius: '16px', padding: '24px', maxWidth: '450px', width: '100%', boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)' }}
                        onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 15px 0', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Calendar size={22} /> {t('compliance.tracker.scheduleInspection')}
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('compliance.tracker.checklist')}</label>
                                <select value={scheduleForm.checklist_id} onChange={e => {
                                    if (e.target.value === 'CREATE_NEW') {
                                        setShowSchedule(false);
                                        setShowNewChecklist(true);
                                        setScheduleForm({ ...scheduleForm, checklist_id: '' });
                                    } else {
                                        setScheduleForm({ ...scheduleForm, checklist_id: e.target.value });
                                    }
                                }}
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff' }} title={t('compliance.selectTheChecklistToUseTip')}>
                                    <option value="">{t('compliance.tracker.selectChecklist')}</option>
                                    <optgroup label={t('compliance.activeChecklists', 'Active Checklists')}>
                                        {checklists.map(cl => <option key={cl.id} value={cl.id}>{cl.framework_icon} {cl.title} ({cl.item_count} items)</option>)}
                                    </optgroup>
                                    <optgroup label={t('common.actions', 'Actions')}>
                                        <option value="CREATE_NEW">➕ {t('compliance.createNewChecklist', 'Create New Checklist...')}</option>
                                    </optgroup>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('compliance.tracker.inspector')}</label>
                                <input type="text" value={scheduleForm.inspector} onChange={e => setScheduleForm({ ...scheduleForm, inspector: e.target.value })}
                                    placeholder={t('compliance.tracker.nameOfInspector')}
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff' }} title={t('compliance.enterTheNameOfTheTip')} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('compliance.tracker.scheduledDate')}</label>
                                <input type="date" value={scheduleForm.scheduled_date} onChange={e => setScheduleForm({ ...scheduleForm, scheduled_date: e.target.value })}
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff' }} title={t('compliance.selectTheDateForThisTip')} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowSchedule(false)} className="btn-nav" title={t('compliance.cancelSchedulingTip')}>{t('compliance.tracker.cancel')}</button>
                            <button onClick={scheduleInspection} className="btn-save" disabled={!scheduleForm.checklist_id}
                                title={t('compliance.scheduleThisInspectionTip')}>{t('compliance.tracker.schedule')}</button>
                        </div>
                    </div>
                </div>
            ), document.body)}
        </div>
    );
}
