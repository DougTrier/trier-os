// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — History & Audit Dashboard
 * ======================================
 * Tabbed container for all historical maintenance and audit data. Isolates
 * completed records from the active work queue so the Jobs tab stays focused
 * on open and in-progress items only.
 *
 * TABS:
 *   Completed Jobs    — Closed work orders (StatusID = 40); searchable, printable
 *   Past PMs          — Historical PM completions (Priority = 200) with compliance %
 *   Asset Reliability — AnalyticsDashboard embedded: MTBF/MTTR reliability trending
 *   Audit Log         — Full system audit trail: who changed what and when
 *   Dynamic Reports   — ReportCenter for custom ad-hoc query reports
 *
 * KEY FEATURES:
 *   - Tab persistence: last active tab remembered per session
 *   - Completed Jobs: same search and filter capabilities as the active Jobs tab
 *   - Audit Log: filterable by user, action type, and date range; exportable to CSV
 *   - PM Compliance: completed PMs vs scheduled PMs as % with trend line
 *   - Print support: all tabs support print-ready formatted output
 */
import React, { useState, useEffect, useCallback } from 'react';
import { History, Activity, CalendarClock, Briefcase, FileText, Printer, Eye, X, Shield } from 'lucide-react';
import ReportCenter from './ReportCenter';
import WorkOrdersView from './WorkOrdersView';
import AnalyticsDashboard from './AnalyticsDashboard';
import { useTranslation } from '../i18n/index.jsx';
import { TakeTourButton } from './ContextualTour';

const ActionBtn = ({ icon:Icon, tip, color='var(--text-muted)', onClick }) => (
    <button title={tip} onClick={e=>{e.stopPropagation();onClick&&onClick();}} style={{ background:'none', border:'none', cursor:'pointer', color, padding:'4px 6px', borderRadius:6, transition:'all 0.15s' }}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'}
        onMouseLeave={e=>e.currentTarget.style.background='none'}>
        <Icon size={17}/>
    </button>
);

export default function HistoryDashboard({ plantId }) {
    const { t } = useTranslation();
    const [nestedTab, setNestedTab] = useState('completed');
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [viewingAudit, setViewingAudit] = useState(null);

    // Fetch audit logs when tab is selected
    useEffect(() => {
        if (nestedTab !== 'audit') return;
        setAuditLoading(true);
        fetch('/api/analytics/audit', {
            headers: {
                'x-plant-id': plantId || localStorage.getItem('selectedPlantId') || 'all_sites'
            }
        })
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                // Handle both array-of-strings and array-of-objects
                const logs = Array.isArray(data) ? data.map((item, idx) => {
                    if (typeof item === 'string') {
                        // Parse log string: "[2026-03-15 10:22:33] TRANSFER PartXYZ from Plant A to Plant B"
                        const m = item.match(/^\[([^\]]+)\]\s*(\w+)\s+(.+)$/).catch(e => console.warn('[HistoryDashboard]', e));
                        return {
                            id: idx + 1,
                            timestamp: m ? m[1] : new Date().toISOString(),
                            action: m ? m[2] : 'SYSTEM',
                            detail: m ? m[3] : item,
                            raw: item
                        };
                    }
                    return { id: item.ID || idx + 1, timestamp: item.Timestamp || item.CreatedAt, action: item.Action || item.EventType || 'SYSTEM', detail: item.Detail || item.Description || JSON.stringify(item), user: item.UserID || item.User, raw: item };
                }) : [];
                setAuditLogs(logs);
            })
            .catch(() => setAuditLogs([]))
            .finally(() => setAuditLoading(false));
    }, [nestedTab, plantId]);

    const handlePrintReliability = useCallback(async () => {
        try {
            const effectivePlant = plantId || localStorage.getItem('selectedPlantId') || 'all_sites';
            const headers = {
                'x-plant-id': effectivePlant
            };
            // Fetch ALL analytics data in parallel for the comprehensive report
            const [narrativeRes, budgetRes, mtbfRes, oeeRes, warrantyRes, warrantyCostRes, auditRes] = await Promise.all([
                fetch('/api/analytics/narrative', { headers }).then(r => r.ok ? r.json() : null),
                fetch('/api/analytics/budget-forecast', { headers }).then(r => r.ok ? r.json() : null),
                fetch('/api/analytics/mtbf-dashboard', { headers }).then(r => r.ok ? r.json() : null),
                fetch('/api/analytics/oee-dashboard', { headers }).then(r => r.ok ? r.json() : null),
                fetch('/api/analytics/warranty-overview?days=90', { headers }).then(r => r.ok ? r.json() : null),
                fetch('/api/analytics/warranty-cost-avoidance', { headers }).then(r => r.ok ? r.json() : null),
                fetch('/api/analytics/audit', { headers }).then(r => r.ok ? r.json() : [])
            ]);
            window.triggerTrierPrint('reliability-report', {
                narrative: narrativeRes,
                budget: budgetRes,
                mtbf: mtbfRes,
                oee: oeeRes,
                warranty: warrantyRes,
                warrantyCost: warrantyCostRes,
                auditLog: Array.isArray(auditRes) ? auditRes : [],
                plantId: effectivePlant
            });
        } catch {
            window.print();
        }
    }, [plantId]);

    const handlePrintAuditLog = useCallback(() => {
        window.triggerTrierPrint('audit-log-report', { logs: auditLogs });
    }, [auditLogs]);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)', overflow: 'hidden' }}>
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <History size={24} /> {t('history.auditHistory')}
                </h2>

                <div style={{ width: '2px', height: '30px', background: 'var(--glass-border)' }}></div>

                <div className="nav-pills" style={{ padding: 0, margin: 0, background: 'transparent' }}>
                    <button 
                        onClick={() => setNestedTab('completed')}
                        className={`btn-nav ${nestedTab === 'completed' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('history.viewCompletedAndClosedWorkTip')}
                    >
                        <Briefcase size={16} /> {t('history.completedJobs')}
                    </button>
                    <button 
                        onClick={() => setNestedTab('pms')}
                        className={`btn-nav ${nestedTab === 'pms' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('history.viewHistoricalPreventiveMaintenanceRecordsTip')}
                    >
                        <CalendarClock size={16} /> {t('history.pastPms')}
                    </button>
                    <button 
                        onClick={() => setNestedTab('reliability')}
                        className={`btn-nav ${nestedTab === 'reliability' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('history.viewAssetReliabilityAnalyticsAndTip')}
                    >
                        <Activity size={16} /> {t('history.assetReliability')}
                    </button>
                    <button 
                        onClick={() => setNestedTab('audit')}
                        className={`btn-nav ${nestedTab === 'audit' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('history.viewSystemAuditTrailAndTip')}
                    >
                        <Shield size={16} /> Audit Log
                    </button>
                    <button 
                        onClick={() => setNestedTab('reports')}
                        className={`btn-nav ${nestedTab === 'reports' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('history.buildAndRunCustomDynamicTip')}
                    >
                        <FileText size={16} /> {t('history.dynamicReports')}
                    </button>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <TakeTourButton tourId="history" nestedTab={nestedTab} />
                    {nestedTab === 'reliability' && (
                        <button className="btn-nav" onClick={handlePrintReliability} title={t('history.printReliabilityAnalyticsReportTip')} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36 }}>
                            <Printer size={15} /> Print Report
                        </button>
                    )}
                    {nestedTab === 'audit' && (
                        <button className="btn-nav" onClick={handlePrintAuditLog} title={t('history.printAuditLogReportTip')} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36 }}>
                            <Printer size={15} /> Print Log
                        </button>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {nestedTab === 'reports' ? (
                    <ReportCenter plantId={plantId} />
                ) : nestedTab === 'completed' ? (
                    <WorkOrdersView key="history-completed" plantId={plantId} statusFilter="40" />
                ) : nestedTab === 'pms' ? (
                    <WorkOrdersView key="history-pms" plantId={plantId} typeFilter="PM" />
                ) : nestedTab === 'reliability' ? (
                    <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                        <AnalyticsDashboard plantId={plantId} />
                    </div>
                ) : nestedTab === 'audit' ? (
                    <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 25, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-muted)' }}>AUDIT LOG EXPLORER</h3>
                            <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Showing {auditLogs.length} entries</div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', borderRadius: 12, border: '1px solid var(--glass-border)' }}>
                            {auditLoading ? (
                                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                    <div className="spinning" style={{ border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--primary)', borderRadius: '50%', width: 30, height: 30, margin: '0 auto 10px' }}></div>
                                    Loading audit trail...
                                </div>
                            ) : auditLogs.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                    <Shield size={48} style={{ marginBottom: 15, opacity: 0.3 }} />
                                    <p>{t('history.noAuditLogEntriesFound')}</p>
                                    <p style={{ fontSize: '0.85rem' }}>System events will appear here as actions are performed.</p>
                                </div>
                            ) : (
                                <table className="data-table">
                                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-dark)', zIndex: 10 }}>
                                        <tr>
                                            <th>#</th>
                                            <th>{t('history.timestamp')}</th>
                                            <th>{t('history.action')}</th>
                                            <th>{t('history.details')}</th>
                                            <th>{t('history.user')}</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {auditLogs.map(log => (
                                            <tr key={log.id} className="hover-row" style={{ cursor: 'pointer' }} onClick={() => setViewingAudit(log)}>
                                                <td style={{ fontWeight: 'bold', color: 'var(--text-muted)' }}>{log.id}</td>
                                                <td style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{typeof log.timestamp === 'string' ? log.timestamp.split('T')[0] || log.timestamp.substring(0, 19) : '--'}</td>
                                                <td>
                                                    <span className={`badge ${log.action === 'TRANSFER' ? 'badge-blue' : log.action === 'DELETE' ? 'badge-red' : log.action === 'CREATE' ? 'badge-primary' : 'badge-gray'}`}>
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.detail}</td>
                                                <td style={{ color: 'var(--text-muted)' }}>{log.user || 'System'}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <ActionBtn icon={Eye} tip="View audit entry details" color="#3b82f6" onClick={() => setViewingAudit(log)} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <style>{`
                            .hover-row:hover { background: rgba(255,255,255,0.05) !important; }
                            .spinning { animation: spin 1s linear infinite; }
                            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                        `}</style>
                    </div>
                ) : (
                    <div className="glass-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        <div style={{ textAlign: 'center' }}>
                            <History size={48} color="var(--primary)" style={{ marginBottom: '15px', opacity: 0.5 }} />
                            <h3>{t('history.historicalAuditTrail')}</h3>
                            <p>This module isolates closed work orders and narrative analytics from the active workflow.</p>
                            <p style={{ marginTop: '10px', fontSize: '0.9rem' }}>{t('history.pendingAttachment')}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Audit Entry Detail Modal */}
            {viewingAudit && (
                <div className="modal-overlay" onClick={() => setViewingAudit(null)}>
                    <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 650 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid var(--glass-border)' }}>
                            <h2 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Shield size={20} /> Audit Entry #{viewingAudit.id}
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button className="btn-nav" onClick={() => window.triggerTrierPrint('audit-entry-detail', viewingAudit)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36 }} title="Print"><Printer size={15} /> Print</button>
                                <button onClick={() => setViewingAudit(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} title={t('history.viewingAuditTip')}><X size={22} /></button>
                            </div>
                        </div>
                        <div className="scroll-area" style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                                <div className="panel-box" style={{ padding: '10px 14px' }}>
                                    <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Entry #</strong>
                                    <div style={{ fontSize: '0.95rem', marginTop: 3 }}>{viewingAudit.id}</div>
                                </div>
                                <div className="panel-box" style={{ padding: '10px 14px' }}>
                                    <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Action</strong>
                                    <div style={{ fontSize: '0.95rem', marginTop: 3 }}>
                                        <span className={`badge ${viewingAudit.action === 'TRANSFER' ? 'badge-blue' : viewingAudit.action === 'DELETE' ? 'badge-red' : 'badge-gray'}`}>{viewingAudit.action}</span>
                                    </div>
                                </div>
                                <div className="panel-box" style={{ padding: '10px 14px' }}>
                                    <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Timestamp</strong>
                                    <div style={{ fontSize: '0.95rem', marginTop: 3, fontFamily: 'monospace' }}>{viewingAudit.timestamp || '--'}</div>
                                </div>
                                <div className="panel-box" style={{ padding: '10px 14px' }}>
                                    <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>User</strong>
                                    <div style={{ fontSize: '0.95rem', marginTop: 3 }}>{viewingAudit.user || 'System'}</div>
                                </div>
                            </div>
                            <div className="panel-box" style={{ padding: 15 }}>
                                <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>FULL DETAILS</strong>
                                <div style={{
                                    whiteSpace: 'pre-wrap',
                                    fontFamily: "'Inter', sans-serif",
                                    fontSize: '0.9rem',
                                    lineHeight: 1.7,
                                    color: 'var(--text-main)',
                                    background: 'rgba(15, 23, 42, 0.4)',
                                    padding: 15,
                                    borderRadius: 8,
                                    border: '1px solid var(--glass-border)',
                                    minHeight: 80
                                }}>
                                    {viewingAudit.detail || viewingAudit.raw || 'No additional details.'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
