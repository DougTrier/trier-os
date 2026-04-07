// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Â© 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * UnderwriterView â€” Insurance Underwriter Portal
 * ================================================
 * Read-only view of all safety & compliance metrics for
 * insurance auditors. Shows:
 *   - Risk Score (RiskScorecard component)
 *   - Safety Incidents table
 *   - Calibration Status table
 *   - LOTO Permits audit trail
 *   - "Print Evidence Packet" button
 */
/**
 * Trier OS — Insurance Underwriter Portal
 * =========================================
 * Read-only compliance and safety evidence portal for insurance auditors.
 * Provides a curated view of all safety and compliance data to support
 * underwriting decisions and premium calculations.
 *
 * KEY FEATURES:
 *   - Risk Score display: RiskScorecard gauge (0–100) with 12-month trend
 *   - Safety Incidents table: all OSHA-recordable incidents with details
 *   - Calibration status: all calibrated instruments with current cal status
 *   - LOTO Permits audit trail: all lockout/tagout permits with completion status
 *   - Training records: technician certification and training completion
 *   - Print Evidence Packet: one-click formatted PDF with all sections
 *   - Read-only access: no edit buttons; auditors cannot modify any data
 *   - Role-gated: accessible only to Underwriter and Executive roles
 *
 * DATA SOURCES:
 *   GET /api/underwriter/summary   — Full underwriter evidence package
 */
import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, AlertTriangle, Settings2, Lock, Printer, RefreshCw, Eye, Pencil, GraduationCap } from 'lucide-react';
import RiskScorecard from './RiskScorecard';
import { TakeTourButton } from './ContextualTour';
import { useTranslation } from '../i18n/index.jsx';
import ActionBar from './ActionBar';

const API = (path, arg2) => {
    const isPlant = typeof arg2 === 'string';
    const opts = isPlant ? {} : (arg2 || {});
    const plantId = isPlant ? arg2 : (opts.plantId || localStorage.getItem('selectedPlantId'));
    return fetch(path, {
        ...opts,
        headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json',
            'x-plant-id': plantId,
            ...opts.headers
        }
    });
};
const Badge = ({ color, children }) => (
    <span style={{
        display: 'inline-block', padding: '2px 10px', borderRadius: 10,
        fontSize: '0.7rem', fontWeight: 700,
        background: `${color}22`, color, border: `1px solid ${color}44`
    }}>{children}</span>
);

const SectionHeader = ({ icon: Icon, color, title, count }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Icon size={18} color={color} />
        <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#fff' }}>{title}</h3>
        {count !== undefined && (
            <span style={{ marginLeft: 4, padding: '1px 8px', borderRadius: 10, fontSize: '0.7rem', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                {count} records
            </span>
        )}
    </div>
);

const Th = ({ children }) => (
    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid var(--glass-border)', whiteSpace: 'nowrap' }}>
        {children}
    </th>
);
const Td = ({ children, style }) => (
    <td style={{ padding: '8px 10px', fontSize: '0.82rem', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.03)', ...style }}>
        {children}
    </td>
);

const InfoRow = ({ label, value }) => (
    <div className="panel-box" style={{ padding: '10px 14px' }}>
        <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</strong>
        <div style={{ fontSize: '0.95rem', marginTop: 3 }}>{value || '--'}</div>
    </div>
);
const ActionBtn = ({ icon: Icon, tip, color = 'var(--text-muted)', onClick }) => (
    <button title={tip} onClick={e => { e.stopPropagation(); onClick && onClick(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
        <Icon size={17} />
    </button>
);

export default function UnderwriterView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const userRole = localStorage.getItem('userRole') || 'employee';

    if (!['manager', 'corporate', 'it_admin', 'creator'].includes(userRole)) {
        return (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#ef4444', background: 'rgba(239, 68, 68, 0.05)', borderRadius: 16, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <ShieldCheck size={48} style={{ marginBottom: 16, opacity: 0.8 }} />
                <h2 style={{ fontSize: '1.4rem', marginBottom: 8 }}>{t('underwriter.accessDenied', 'Access Restricted')}</h2>
                <p style={{ color: 'var(--text-muted)' }}>{t('underwriter.accessDeniedDesc', 'You do not have the required clearance to view the Insurance Underwriter Portal.')}</p>
            </div>
        );
    }

    const [tab, setTab] = useState('overview');
    const [incidents, setIncidents] = useState([]);
    const [calibration, setCalibration] = useState([]);
    const [loto, setLoto] = useState([]);
    const [certs, setCerts] = useState([]);
    const [loading, setLoading] = useState(true);

    const [detail, setDetail] = useState(null);
    const [detailType, setDetailType] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const ef = (k, v) => setEditForm(p => ({ ...p, [k]: v }));

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const plantQ = plantId ? `?plant=${plantId}&limit=50` : '?limit=50';
            const [incRes, calRes, lotoRes, certRes] = await Promise.all([
                API(`/api/safety-incidents${plantQ}`, plantId),
                API(`/api/calibration/instruments${plantQ}`, plantId),
                API(`/api/loto/permits${plantId ? `?plant=${plantId}&limit=50` : '?limit=50'}`, plantId),
                API(`/api/training/expiring?days=365`, plantId)  // Get full year view for risk assessment
            ]);
            const incData = await incRes.json();
            const calData = await calRes.json();
            const lotoData = await lotoRes.json();
            const certData = certRes.ok ? await certRes.json() : { expiring: [] };
            setIncidents(Array.isArray(incData) ? incData : (incData.data || []));
            setCalibration(Array.isArray(calData) ? calData : (calData.data || []));
            setLoto(Array.isArray(lotoData) ? lotoData : (lotoData.permits || []));
            setCerts(Array.isArray(certData) ? certData : (certData.expiring || []));
        } catch (err) {
            console.error('UnderwriterView fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [plantId]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const loadDetail = async (id, type) => {
        try {
            const url = type === 'incident' ? `/api/safety-incidents/${id}` : type === 'calibration' ? `/api/calibration/instruments/${id}` : type === 'loto' ? `/api/loto/permits/${id}` : `/api/training/record/${id}`;
            const r = await API(url, plantId);
            if (r.ok) {
                const data = await r.json();
                setDetail(type === 'incident' ? data.incident : type === 'calibration' ? data.instrument : type === 'loto' ? data.permit : data.record);
                setDetailType(type);
                setEditing(false);
            }
        } catch (err) { console.error('Failed to load details', err); }
    };

    const startEdit = () => {
        if (!detail) return;
        if (detailType === 'incident') {
            setEditForm({ Title: detail.Title || '', Description: detail.Description || '', Severity: detail.Severity || 'Low', Status: detail.Status || 'Open', Location: detail.Location || '', IncidentType: detail.IncidentType || '', RootCause: detail.RootCause || '', CorrectiveAction: detail.CorrectiveAction || '' });
        } else if (detailType === 'calibration') {
            setEditForm({ Description: detail.Description || '', Location: detail.Location || '', InstrumentType: detail.InstrumentType || '', LastCalibrationDate: detail.LastCalibrationDate ? detail.LastCalibrationDate.split('T')[0] : '', NextCalibrationDue: detail.NextCalibrationDue ? detail.NextCalibrationDue.split('T')[0] : '', LastResult: detail.LastResult || '', Status: detail.Status || 'Active' });
        } else if (detailType === 'cert') {
            setEditForm({ score: detail.score || '', trainer: detail.trainer || '', notes: detail.notes || '' });
        } else {
            setEditForm({ Description: detail.Description || '', AssetID: detail.AssetID || '', AssetDescription: detail.AssetDescription || '', HazardousEnergy: detail.HazardousEnergy || '', IsolationMethod: detail.IsolationMethod || '', Notes: detail.Notes || '' });
        }
        setEditing(true);
    };

    const saveDetail = async () => {
        try {
            const url = detailType === 'incident' ? `/api/safety-incidents/${detail.ID}` : detailType === 'calibration' ? `/api/calibration/instruments/${detail.ID}` : detailType === 'cert' ? `/api/training/records/${detail.id}` : `/api/loto/permits/${detail.ID}`;
            const body = detailType === 'loto' ? { ...editForm, updatedBy: 'Underwriter' } : editForm;
            await API(url, { method: 'PUT', body: JSON.stringify(body), plantId });
            setEditing(false);
            loadDetail(detailType === 'cert' ? detail.id : detail.ID, detailType);
            fetchAll();
        } catch (err) { console.error('Error saving', err); }
    };

    const handlePrintEvidence = () => {
        window.triggerTrierPrint('risk-evidence-packet', {
            plantId, plantLabel,
            incidents,
            calibration,
            loto,
            generatedAt: new Date().toISOString()
        });
    };

    const expiredCerts = certs.filter(c => c.days_until_expiry < 0);
    const tabs = [
        { id: 'overview', label: t('underwriter.riskOverview', 'Risk Overview'), icon: ShieldCheck },
        { id: 'incidents', label: t('underwriter.safetyIncidents', 'Safety Incidents'), icon: AlertTriangle, count: incidents.length },
        { id: 'calibration', label: t('underwriter.calibration', 'Calibration'), icon: Settings2, count: calibration.length },
        { id: 'loto', label: t('underwriter.lotoPermits', 'LOTO Permits'), icon: Lock, count: loto.length },
        { id: 'certs', label: t('underwriter.certifications', 'Certifications'), icon: GraduationCap, count: expiredCerts.length, countColor: expiredCerts.length > 0 ? '#ef4444' : undefined }
    ];

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)' }}>

            {/* Header Bar */}
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.3rem', margin: 0, color: '#10b981', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ShieldCheck size={22} /> {t('underwriter.pageTitle', 'Underwriter Portal')}
                </h2>
                <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', fontWeight: 700 }}>
                    {t('underwriter.readOnly', 'READ ONLY')}
                </span>
                <div style={{ width: 1, height: 28, background: 'var(--glass-border)' }} />

                {/* Tab Pills */}
                <div style={{ display: 'flex', gap: 6 }}>
                    {tabs.map(tb => (
                        <button key={tb.id} onClick={() => setTab(tb.id)}
                            className={`btn-nav ${tab === tb.id ? 'active' : ''}`}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, height: 34, padding: '0 14px', fontSize: '0.82rem' }}>
                            <tb.icon size={14} />
                            {tb.label}
                            {tb.count !== undefined && tb.count > 0 && (
                                <span style={{ padding: '0 6px', borderRadius: 8, fontSize: '0.65rem', background: 'rgba(255,255,255,0.1)', marginLeft: 2 }}>
                                    {tb.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <TakeTourButton tourId="underwriter" />
                    <button onClick={fetchAll} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }} title={t('underwriter.refreshData', 'Refresh data')}>
                        <RefreshCw size={15} />
                    </button>
                    <button onClick={handlePrintEvidence} className="btn-save"
                        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', fontSize: '0.82rem' }}
                        title={t('underwriter.printEvidencePacketTip', 'Generate and print the full evidence packet for underwriters')}>
                        <Printer size={15} /> {t('underwriter.printEvidence', 'Print Evidence Packet')}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 0 20px' }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
                        <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                    </div>
                ) : (
                    <>
                        {/* â”€â”€ OVERVIEW TAB â”€â”€ */}
                        {tab === 'overview' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                <RiskScorecard
                                    plantId={plantId}
                                    plantLabel={plantLabel}
                                    onPrint={handlePrintEvidence}
                                />

                                {/* Quick Stats */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                                    <div className="glass-card" style={{ padding: 20, textAlign: 'center' }}>
                                        <AlertTriangle size={28} color="#ef4444" style={{ marginBottom: 8 }} />
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('underwriter.openIncidents', 'Open Incidents')}</div>
                                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444' }}>
                                            {incidents.filter(i => i.Status === 'Open').length}
                                        </div>
                                    </div>
                                    <div className="glass-card" style={{ padding: 20, textAlign: 'center' }}>
                                        <Settings2 size={28} color="#f59e0b" style={{ marginBottom: 8 }} />
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('underwriter.overdueCalibrations', 'Overdue Calibrations')}</div>
                                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
                                            {calibration.filter(c => c.NextCalibrationDue && new Date(c.NextCalibrationDue) < new Date()).length}
                                        </div>
                                    </div>
                                    <div className="glass-card" style={{ padding: 20, textAlign: 'center' }}>
                                        <Lock size={28} color="#6366f1" style={{ marginBottom: 8 }} />
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('underwriter.activeLotoPermits', 'Active LOTO Permits')}</div>
                                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#6366f1' }}>
                                            {loto.filter(l => l.Status === 'ACTIVE').length}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* â”€â”€ INCIDENTS TAB â”€â”€ */}
                        {tab === 'incidents' && (
                            <div className="glass-card" style={{ padding: 20 }}>
                                <SectionHeader icon={AlertTriangle} color="#ef4444" title={t('underwriter.safetyIncidents', 'Safety Incidents')} count={incidents.length} />
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <Th>{t('underwriter.incidentNumber', 'Incident #')}</Th>
                                                <Th>{t('underwriter.date', 'Date')}</Th>
                                                <Th>{t('underwriter.type', 'Type')}</Th>
                                                <Th>{t('underwriter.severity', 'Severity')}</Th>
                                                <Th>{t('underwriter.title', 'Title')}</Th>
                                                <Th>{t('underwriter.location', 'Location')}</Th>
                                                <Th>{t('underwriter.status', 'Status')}</Th>
                                                <Th>{t('underwriter.osha', 'OSHA')}</Th>
                                                <Th>{t('underwriter.actions', 'Actions')}</Th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {incidents.length === 0 ? (
                                                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('underwriter.noIncidentsFound', 'No incidents found')}</td></tr>
                                            ) : incidents.map((inc, i) => {
                                                const sevColor = inc.Severity === 'Critical' ? '#ef4444' : inc.Severity === 'High' ? '#f97316' : inc.Severity === 'Medium' ? '#f59e0b' : '#10b981';
                                                const statColor = inc.Status === 'Open' ? '#ef4444' : inc.Status === 'Investigating' ? '#f59e0b' : '#10b981';
                                                return (
                                                    <tr key={i}>
                                                        <Td style={{ color: '#fff', fontFamily: 'monospace' }}>{inc.IncidentNumber || `INC-${inc.ID}`}</Td>
                                                        <Td>{inc.IncidentDate ? inc.IncidentDate.split('T')[0] : '--'}</Td>
                                                        <Td><Badge color="#6366f1">{inc.IncidentType || 'Unknown'}</Badge></Td>
                                                        <Td><Badge color={sevColor}>{inc.Severity || '--'}</Badge></Td>
                                                        <Td style={{ color: '#fff', maxWidth: 200 }}>{inc.Title}</Td>
                                                        <Td>{inc.Location || '--'}</Td>
                                                        <Td><Badge color={statColor}>{t('status.' + (inc.Status || '').replace(/\s+/g, ''), inc.Status)}</Badge></Td>
                                                        <Td>{inc.OSHARecordable ? <Badge color="#ef4444">OSHA</Badge> : <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}</Td>
                                                        <Td style={{ display: 'flex', gap: 2 }}>
                                                            <ActionBtn icon={Eye} tip={t('underwriter.view', 'View')} color="#3b82f6" onClick={() => loadDetail(inc.ID, 'incident')} />
                                                            <ActionBtn icon={Pencil} tip={t('underwriter.edit', 'Edit')} color="#f59e0b" onClick={() => { loadDetail(inc.ID, 'incident').then(() => setTimeout(startEdit, 200)); }} />
                                                        </Td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* â”€â”€ CALIBRATION TAB â”€â”€ */}
                        {tab === 'calibration' && (
                            <div className="glass-card" style={{ padding: 20 }}>
                                <SectionHeader icon={Settings2} color="#f59e0b" title={t('underwriter.calibrationStatus', 'Calibration Status')} count={calibration.length} />
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <Th>{t('underwriter.instrumentId', 'Instrument ID')}</Th>
                                                <Th>{t('underwriter.description', 'Description')}</Th>
                                                <Th>{t('underwriter.type', 'Type')}</Th>
                                                <Th>{t('underwriter.location', 'Location')}</Th>
                                                <Th>{t('underwriter.lastCalibrated', 'Last Calibrated')}</Th>
                                                <Th>{t('underwriter.nextDue', 'Next Due')}</Th>
                                                <Th>{t('underwriter.lastResult', 'Last Result')}</Th>
                                                <Th>{t('underwriter.status', 'Status')}</Th>
                                                <Th>{t('underwriter.actions', 'Actions')}</Th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {calibration.length === 0 ? (
                                                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('underwriter.noCalibrationRecords', 'No calibration records found')}</td></tr>
                                            ) : calibration.map((cal, i) => {
                                                const isOverdue = cal.NextCalibrationDue && new Date(cal.NextCalibrationDue) < new Date();
                                                const dueColor = isOverdue ? '#ef4444' : '#10b981';
                                                const resultColor = cal.LastResult === 'Pass' ? '#10b981' : cal.LastResult === 'Fail' ? '#ef4444' : 'var(--text-muted)';
                                                return (
                                                    <tr key={i}>
                                                        <Td style={{ color: '#fff', fontFamily: 'monospace' }}>{cal.InstrumentID}</Td>
                                                        <Td style={{ color: '#fff' }}>{cal.Description}</Td>
                                                        <Td>{cal.InstrumentType}</Td>
                                                        <Td>{cal.Location || '--'}</Td>
                                                        <Td>{cal.LastCalibrationDate ? cal.LastCalibrationDate.split('T')[0] : '--'}</Td>
                                                        <Td style={{ color: dueColor, fontWeight: isOverdue ? 700 : 400 }}>
                                                            {cal.NextCalibrationDue ? cal.NextCalibrationDue.split('T')[0] : '--'}
                                                            {isOverdue && <span style={{ marginLeft: 6, fontSize: '0.65rem', background: '#ef444422', color: '#ef4444', padding: '1px 6px', borderRadius: 6, border: '1px solid #ef444444' }}>OVERDUE</span>}
                                                        </Td>
                                                        <Td><Badge color={resultColor}>{cal.LastResult || 'N/A'}</Badge></Td>
                                                        <Td><Badge color={cal.Status === 'Active' ? '#10b981' : '#f59e0b'}>{t('status.' + (cal.Status || '').replace(/\s+/g, ''), cal.Status)}</Badge></Td>
                                                        <Td style={{ display: 'flex', gap: 2 }}>
                                                            <ActionBtn icon={Eye} tip={t('underwriter.view', 'View')} color="#3b82f6" onClick={() => loadDetail(cal.ID, 'calibration')} />
                                                            <ActionBtn icon={Pencil} tip={t('underwriter.edit', 'Edit')} color="#f59e0b" onClick={() => { loadDetail(cal.ID, 'calibration').then(() => setTimeout(startEdit, 200)); }} />
                                                        </Td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* â”€â”€ LOTO TAB â”€â”€ */}
                        {tab === 'loto' && (
                            <div className="glass-card" style={{ padding: 20 }}>
                                <SectionHeader icon={Lock} color="#6366f1" title={t('underwriter.lotoPermitAuditTrail', 'LOTO Permit Audit Trail')} count={loto.length} />
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <Th>{t('underwriter.permitNumber', 'Permit #')}</Th>
                                                <Th>{t('underwriter.asset', 'Asset')}</Th>
                                                <Th>{t('underwriter.type', 'Type')}</Th>
                                                <Th>{t('underwriter.hazardousEnergy', 'Hazardous Energy')}</Th>
                                                <Th>{t('underwriter.issuedBy', 'Issued By')}</Th>
                                                <Th>{t('underwriter.issuedAt', 'Issued At')}</Th>
                                                <Th>{t('underwriter.status', 'Status')}</Th>
                                                <Th>{t('underwriter.closedAt', 'Closed At')}</Th>
                                                <Th>{t('underwriter.actions', 'Actions')}</Th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {loto.length === 0 ? (
                                                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('underwriter.noLotoPermitsFound', 'No LOTO permits found')}</td></tr>
                                            ) : loto.map((permit, i) => {
                                                const statColor = permit.Status === 'ACTIVE' ? '#f59e0b' : permit.Status === 'CLOSED' ? '#10b981' : permit.Status === 'VOID' ? '#ef4444' : '#6366f1';
                                                return (
                                                    <tr key={i}>
                                                        <Td style={{ color: '#fff', fontFamily: 'monospace' }}>{permit.PermitNumber}</Td>
                                                        <Td>{permit.AssetDescription || permit.AssetID || '--'}</Td>
                                                        <Td>{permit.PermitType}</Td>
                                                        <Td>{permit.HazardousEnergy || '--'}</Td>
                                                        <Td style={{ color: '#fff' }}>{permit.IssuedBy}</Td>
                                                        <Td>{permit.IssuedAt ? permit.IssuedAt.split('T')[0] : '--'}</Td>
                                                        <Td><Badge color={statColor}>{t('status.' + (permit.Status || '').replace(/\s+/g, ''), permit.Status)}</Badge></Td>
                                                        <Td>{permit.ClosedAt ? permit.ClosedAt.split('T')[0] : <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}</Td>
                                                        <Td style={{ display: 'flex', gap: 2 }}>
                                                            <ActionBtn icon={Eye} tip={t('underwriter.view', 'View')} color="#3b82f6" onClick={() => loadDetail(permit.ID, 'loto')} />
                                                            <ActionBtn icon={Pencil} tip={t('underwriter.edit', 'Edit')} color="#f59e0b" onClick={() => { loadDetail(permit.ID, 'loto').then(() => setTimeout(startEdit, 200)); }} />
                                                        </Td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ── CERTIFICATIONS TAB ── */}
                        {tab === 'certs' && (
                            <div className="glass-card" style={{ padding: 20 }}>
                                <SectionHeader icon={GraduationCap} color="#10b981" title="Training & Certification Risk" count={certs.length} />
                                {certs.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                        <GraduationCap size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
                                        <p>No expiring certifications found for this period.</p>
                                    </div>
                                ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr>
                                                    <Th>Employee</Th><Th>Certification</Th><Th>Category</Th>
                                                    <Th>Cert #</Th><Th>Expiry Date</Th><Th>Status</Th><Th>Regulatory Ref</Th><Th>Actions</Th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {certs.map((c, i) => {
                                                    const expired = c.days_until_expiry < 0;
                                                    const urgent = !expired && c.days_until_expiry <= 30;
                                                    const statusColor = expired ? '#ef4444' : urgent ? '#f59e0b' : '#10b981';
                                                    const statusLabel = expired ? 'EXPIRED' : urgent ? 'EXPIRING SOON' : 'ACTIVE';
                                                    return (
                                                        <tr key={i} style={{ background: expired ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                                                            <Td style={{ color: '#fff', fontWeight: 600 }}>{c.employee_name || `EMP-${c.employee_id}`}</Td>
                                                            <Td style={{ color: '#fff' }}>{c.course_name}</Td>
                                                            <Td><Badge color="#6366f1">{c.category}</Badge></Td>
                                                            <Td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{c.cert_number || '—'}</Td>
                                                            <Td style={{ color: statusColor, fontWeight: expired ? 700 : 400 }}>
                                                                {c.expiry_date ? c.expiry_date.split('T')[0] : '—'}
                                                                {expired && <span style={{ marginLeft: 6, fontSize: '0.65rem', background: '#ef444422', color: '#ef4444', padding: '1px 6px', borderRadius: 6, border: '1px solid #ef444444' }}>{Math.abs(c.days_until_expiry)}d ago</span>}
                                                            </Td>
                                                            <Td><Badge color={statusColor}>{statusLabel}</Badge></Td>
                                                            <Td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.regulatory_ref || '—'}</Td>
                                                            <Td style={{ display: 'flex', gap: 2 }}>
                                                                <ActionBtn icon={Eye} tip={t('underwriter.view', 'View')} color="#3b82f6" onClick={() => loadDetail(c.id, 'cert')} />
                                                                <ActionBtn icon={Pencil} tip={t('underwriter.edit', 'Edit')} color="#f59e0b" onClick={() => { loadDetail(c.id, 'cert').then(() => setTimeout(startEdit, 200)); }} />
                                                            </Td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                    </>
                )}
            </div>

            {/* Edit Modal */}
            {detail && (
                <div className="modal-overlay" onClick={() => { setDetail(null); setEditing(false); }}>
                    <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 750 }}>
                        <ActionBar 
                            title={detailType === 'incident' ? `INC-${detail.ID}: ${detail.Title}` : detailType === 'calibration' ? `CAL: ${detail.InstrumentID}` : `LOTO: ${detail.PermitNumber}`}
                            isEditing={editing}
                            onEdit={startEdit}
                            onSave={saveDetail}
                            onCancel={() => setEditing(false)}
                            onClose={() => { setDetail(null); setEditing(false); }}
                            showDelete={false}
                            onPrint={() => window.triggerTrierPrint('risk-evidence-packet', { incidents: detailType === 'incident' ? [detail] : [], calibration: detailType === 'calibration' ? [detail] : [], loto: detailType === 'loto' ? [detail] : [], certs: detailType === 'cert' ? [detail] : [] })}
                        />
                        <div className="scroll-area" style={{ flex: 1, padding: 20, overflowY: 'auto', maxHeight: '65vh' }}>
                            {!editing ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    {detailType === 'incident' ? (
                                        <>
                                            <InfoRow label={t('underwriter.type', 'Type')} value={detail.IncidentType} />
                                            <InfoRow label={t('underwriter.severity', 'Severity')} value={detail.Severity} />
                                            <InfoRow label={t('underwriter.status', 'Status')} value={detail.Status} />
                                            <InfoRow label={t('underwriter.location', 'Location')} value={detail.Location} />
                                            <InfoRow label={t('underwriter.date', 'Date')} value={detail.IncidentDate ? detail.IncidentDate.split('T')[0] : ''} />
                                            <InfoRow label={t('underwriter.title', 'Title')} value={detail.Title} />
                                            {detail.Description && <div className="panel-box" style={{ gridColumn: 'span 2', padding: 14 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('underwriter.description', 'DESCRIPTION')}</strong><p style={{ margin: '6px 0 0' }}>{detail.Description}</p></div>}
                                            {detail.RootCause && <div className="panel-box" style={{ gridColumn: 'span 2', padding: 14 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('underwriter.rootCause', 'ROOT CAUSE')}</strong><p style={{ margin: '6px 0 0' }}>{detail.RootCause}</p></div>}
                                            {detail.CorrectiveAction && <div className="panel-box" style={{ gridColumn: 'span 2', padding: 14 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('underwriter.correctiveAction', 'CORRECTIVE ACTION')}</strong><p style={{ margin: '6px 0 0' }}>{detail.CorrectiveAction}</p></div>}
                                        </>
                                    ) : detailType === 'calibration' ? (
                                        <>
                                            <InfoRow label={t('underwriter.description', 'Description')} value={detail.Description} />
                                            <InfoRow label={t('underwriter.type', 'Type')} value={detail.InstrumentType} />
                                            <InfoRow label={t('underwriter.location', 'Location')} value={detail.Location} />
                                            <InfoRow label={t('underwriter.lastCalibrated', 'Last Calibrated')} value={detail.LastCalibrationDate ? detail.LastCalibrationDate.split('T')[0] : ''} />
                                            <InfoRow label={t('underwriter.nextDue', 'Next Due')} value={detail.NextCalibrationDue ? detail.NextCalibrationDue.split('T')[0] : ''} />
                                            <InfoRow label={t('underwriter.lastResult', 'Last Result')} value={detail.LastResult} />
                                            <InfoRow label={t('underwriter.status', 'Status')} value={detail.Status} />
                                        </>
                                    ) : detailType === 'cert' ? (
                                        <>
                                            <InfoRow label="Employee Name" value={detail.user_name} />
                                            <InfoRow label="Employee ID" value={detail.user_id} />
                                            <InfoRow label="Course Title" value={detail.course_title} />
                                            <InfoRow label="Course Code" value={detail.course_code} />
                                            <InfoRow label="Completed Date" value={detail.completed_date ? detail.completed_date.split('T')[0] : '--'} />
                                            <InfoRow label="Expires Date" value={detail.expires_date ? detail.expires_date.split('T')[0] : 'N/A'} />
                                            <InfoRow label="Trainer" value={detail.trainer} />
                                            <InfoRow label="Score" value={detail.score} />
                                            {detail.notes && <div className="panel-box" style={{ gridColumn: 'span 2', padding: 14 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>NOTES</strong><p style={{ margin: '6px 0 0' }}>{detail.notes}</p></div>}
                                        </>
                                    ) : (
                                        <>
                                            <InfoRow label={t('underwriter.description', 'Description')} value={detail.Description} />
                                            <InfoRow label={t('underwriter.asset', 'Asset ID')} value={detail.AssetID} />
                                            <InfoRow label={t('underwriter.assetDescription', 'Asset Desc')} value={detail.AssetDescription} />
                                            <InfoRow label={t('underwriter.hazardousEnergy', 'Hazardous Energy')} value={detail.HazardousEnergy} />
                                            <InfoRow label={t('underwriter.isolationMethod', 'Isolation Method')} value={detail.IsolationMethod} />
                                            <InfoRow label={t('underwriter.issuedBy', 'Issued By')} value={detail.IssuedBy} />
                                            <InfoRow label={t('underwriter.issuedAt', 'Issued At')} value={detail.IssuedAt} />
                                            <InfoRow label={t('underwriter.status', 'Status')} value={detail.Status} />
                                            {detail.Notes && <div className="panel-box" style={{ gridColumn: 'span 2', padding: 14 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('underwriter.notes', 'NOTES')}</strong><p style={{ margin: '6px 0 0' }}>{detail.Notes}</p></div>}
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                    {detailType === 'incident' ? (
                                        <>
                                            <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Title</label><input value={editForm.Title} onChange={e => ef('Title', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }} /></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Type</label><select value={editForm.IncidentType} onChange={e => ef('IncidentType', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }}><option>Near-Miss</option><option>First-Aid</option><option>Medical</option><option>Lost-Time</option><option>Environmental</option></select></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Severity</label><select value={editForm.Severity} onChange={e => ef('Severity', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Status</label><select value={editForm.Status} onChange={e => ef('Status', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }}><option>Open</option><option>Investigating</option><option>Closed</option></select></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Location</label><input value={editForm.Location} onChange={e => ef('Location', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }} /></div>
                                            <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Description</label><textarea value={editForm.Description} onChange={e => ef('Description', e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', resize: 'vertical' }} /></div>
                                            <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Root Cause</label><textarea value={editForm.RootCause} onChange={e => ef('RootCause', e.target.value)} rows={2} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', resize: 'vertical' }} /></div>
                                            <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Corrective Action</label><textarea value={editForm.CorrectiveAction} onChange={e => ef('CorrectiveAction', e.target.value)} rows={2} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', resize: 'vertical' }} /></div>
                                        </>
                                    ) : detailType === 'calibration' ? (
                                        <>
                                            <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Description</label><input value={editForm.Description} onChange={e => ef('Description', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }} /></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Type</label><select value={editForm.InstrumentType} onChange={e => ef('InstrumentType', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }}><option>Temperature</option><option>Pressure</option><option>Flow</option><option>Weight</option><option>pH</option><option>Level</option></select></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Location</label><input value={editForm.Location} onChange={e => ef('Location', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }} /></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Last Calibrated</label><input type="date" value={editForm.LastCalibrationDate} onChange={e => ef('LastCalibrationDate', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }} /></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Next Due</label><input type="date" value={editForm.NextCalibrationDue} onChange={e => ef('NextCalibrationDue', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }} /></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Last Result</label><select value={editForm.LastResult} onChange={e => ef('LastResult', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }}><option>Pass</option><option>Fail</option><option>N/A</option></select></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Status</label><select value={editForm.Status} onChange={e => ef('Status', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }}><option>Active</option><option>Inactive</option><option>Decommissioned</option></select></div>
                                        </>
                                    ) : detailType === 'cert' ? (
                                        <>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Score</label><input type="number" value={editForm.score} onChange={e => ef('score', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }} /></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Trainer</label><input value={editForm.trainer} onChange={e => ef('trainer', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }} /></div>
                                            <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Notes</label><textarea value={editForm.notes} onChange={e => ef('notes', e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', resize: 'vertical' }} /></div>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Description</label><input value={editForm.Description} onChange={e => ef('Description', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }} /></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Asset ID</label><input value={editForm.AssetID} onChange={e => ef('AssetID', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }} /></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Asset Desc</label><input value={editForm.AssetDescription} onChange={e => ef('AssetDescription', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }} /></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hazardous Energy</label><input value={editForm.HazardousEnergy} onChange={e => ef('HazardousEnergy', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }} /></div>
                                            <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Isolation Method</label><input value={editForm.IsolationMethod} onChange={e => ef('IsolationMethod', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }} /></div>
                                            <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Notes</label><textarea value={editForm.Notes} onChange={e => ef('Notes', e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', resize: 'vertical' }} /></div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
