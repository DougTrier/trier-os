// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Engineering Excellence View
 * =========================================
 * Full-featured reliability engineering workspace. Connects to
 * /api/engineering endpoints to surface all seven engineering modules
 * in a unified tabbed interface.
 *
 * TABS:
 *   Root Cause Analysis  — 5-Why tree builder and Ishikawa fishbone diagram editor
 *   FMEA                 — Failure Mode & Effects Analysis with RPN scoring
 *   Repair vs. Replace   — Cost-ratio calculator with useful-life comparison
 *   ECN                  — Engineering Change Notice workflow with approval chain
 *   Capital Projects     — Project tracker with milestones and budget vs. actual
 *   Lubrication          — Lube route management and due-points calendar
 *   Oil Analysis         — Sample submission, lab results, and out-of-spec alerts
 *
 * Each module uses the shared API() helper with /api/engineering base path.
 * SearchBar filters apply within the active module's record list.
 * ActionBar provides Create, Export, and Print actions per module.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Lightbulb, Eye, X, Microscope, Calculator, FileCheck, FolderKanban, Droplets, FlaskConical, AlertTriangle, Pencil } from 'lucide-react';
import SearchBar from './SearchBar';
import ActionBar from './ActionBar';
import { formatDate } from '../utils/formatDate';
import LoadingSpinner from './LoadingSpinner';
import { TakeTourButton } from './ContextualTour';
import { useTranslation } from '../i18n/index.jsx';

const API = (path, o = {}) => fetch(`/api/engineering${path}`, { ...o, headers: { 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1', ...o.headers } });
const Badge = ({ color, children }) => <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44` }}>{children}</span>;

const InfoRow = ({ label, value }) => (
    <div className="panel-box" style={{ padding: '10px 14px' }}>
        <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</strong>
        <div style={{ fontSize: '0.95rem', marginTop: 3 }}>{value || '—'}</div>
    </div>
);
const ActionBtn = ({ icon: Icon, tip, color = 'var(--text-muted)', onClick }) => (
    <button title={tip} onClick={e => { e.stopPropagation(); onClick && onClick(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
        <Icon size={17} />
    </button>
);

// DetailHeader replaced by ActionBar — Platform Standard 1

export default function EngineeringView({ plantId }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('rca');
    const [search, setSearch] = useState('');
    const tabs = [
        { id: 'rca', label: 'RCA', icon: Microscope },
        { id: 'fmea', label: 'FMEA', icon: AlertTriangle },
        { id: 'repair-replace', label: t('engineering.repairVsReplace', 'Repair vs Replace'), icon: Calculator },
        { id: 'ecn', label: 'ECN', icon: FileCheck },
        { id: 'projects', label: t('engineering.capitalProjects', 'Capital Projects'), icon: FolderKanban },
        { id: 'lube', label: t('engineering.lubricationTab', 'Lubrication'), icon: Droplets },
        { id: 'oil', label: t('engineering.oilAnalysisTab', 'Oil Analysis'), icon: FlaskConical },
    ];
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)' }}>
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 10 }}><Lightbulb size={24} /> {t('engineering.engineeringTools', 'Engineering Tools')}</h2>
                <div style={{ width: 2, height: 30, background: 'var(--glass-border)' }} />
                <div className="nav-pills no-print" style={{ flexWrap: 'wrap' }}>
                    {tabs.map(tabItem => (<button key={tabItem.id} onClick={() => setTab(tabItem.id)} className={`btn-nav ${tab === tabItem.id ? 'active' : ''}`} style={{ fontSize: '0.78rem' }} title="Tab"><tabItem.icon size={14} style={{ marginRight: 3 }} />{tabItem.label}</button>))}
                </div>
                <SearchBar value={search} onChange={setSearch} placeholder={t('engineering.searchEngineeringPlaceholder')} width={200} style={{ marginLeft: 'auto' }} />
                <TakeTourButton tourId="engineering" nestedTab={tab} />
            </div>
            <div style={{ flex: 1, display: 'flex' }} key={plantId}>
                {tab === 'rca' && <RCATab search={search} />}
                {tab === 'fmea' && <FMEATab search={search} />}
                {tab === 'repair-replace' && <RepairReplaceTab search={search} />}
                {tab === 'ecn' && <ECNTab search={search} />}
                {tab === 'projects' && <ProjectsTab search={search} />}
                {tab === 'lube' && <LubeTab search={search} />}
                {tab === 'oil' && <OilTab search={search} />}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RCA — Root Cause Analysis (with detail modal + Print/Edit)
// ═══════════════════════════════════════════════════════════════════════════════
function RCATab({ search }) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]); const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const ef = (k, v) => setEditForm(p => ({ ...p, [k]: v }));

    const fetchItems = useCallback(() => {
        setLoading(true);
        API('/rca').then(r => r.json()).then(d => { setItems(d); setLoading(false); }).catch(() => setLoading(false));
    }, []);
    useEffect(() => { fetchItems(); }, [fetchItems]);

    const f = useMemo(() => { if (!search) return items; const s = search.toLowerCase(); return items.filter(i => (i.Title || '').toLowerCase().includes(s) || (i.AssetID || '').toLowerCase().includes(s)); }, [items, search]);
    const stColor = (s) => ({ 'Open': '#f59e0b', 'In Progress': '#3b82f6', 'Closed': '#10b981' }[s] || '#64748b');

    const loadDetail = async (id) => { const r = await API(`/rca/${id}`); if (r.ok) { const d = await r.json(); setDetail(d); setEditing(false); } };
    const startEdit = () => { const i = detail.rca || detail; setEditForm({ Title: i.Title || '', Status: i.Status || '', Summary: i.Summary || '', RootCause: i.RootCause || '', CorrectiveAction: i.CorrectiveAction || '', whySteps: detail.whySteps ? JSON.parse(JSON.stringify(detail.whySteps)) : [] }); setEditing(true); };
    const handleSave = async () => { 
        const id = detail.rca?.ID || detail.ID; 
        const r = await API(`/rca/${id}`, { method: 'PUT', body: JSON.stringify(editForm) }); 
        if (editForm.whySteps) {
            await Promise.all(editForm.whySteps.map(w => 
                API(`/rca/${id}/why`, { method: 'POST', body: JSON.stringify({ stepNumber: w.StepNumber, question: w.Question, answer: w.Answer, evidenceNotes: w.EvidenceNotes }) })
            ));
        }
        if (r.ok) { setEditing(false); loadDetail(id); fetchItems(); } 
    };

    if (loading) return <LoadingSpinner />;
    return (<>
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
            <h2 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 10 }}><Microscope size={24} color="#3b82f6" /> {t('engineering.rootCauseAnalysis', 'Root Cause Analysis')} ({f.length})</h2>
            <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>ID</th><th>{t('engineering.title')}</th><th>{t('engineering.incidentDate')}</th><th>{t('engineering.asset')}</th><th>{t('engineering.investigator')}</th><th>{t('engineering.status')}</th><th>{t('engineering.actions')}</th></tr></thead>
                    <tbody>{f.map(i => (<tr key={i.ID}><td style={{ fontWeight: 600 }}>RCA-{i.ID}</td><td>{i.Title}</td><td>{formatDate(i.IncidentDate)}</td><td>{i.AssetID || '—'}</td><td>{i.Investigator || '—'}</td><td><Badge color={stColor(i.Status)}>{t('engineering.status' + i.Status.replace(/\s+/g, ''), i.Status)}</Badge></td>
                        <td style={{ display: 'flex', gap: 2 }}><ActionBtn icon={Eye} tip={t('engineering.tipViewRca', 'View full RCA investigation')} color="#3b82f6" onClick={() => loadDetail(i.ID)} /><ActionBtn icon={Pencil} tip={t('engineering.tipEditRca', 'Edit RCA')} color="#f59e0b" onClick={() => { loadDetail(i.ID).then(() => setTimeout(() => startEdit(), 200)); }} /></td></tr>))}
                        {f.length === 0 && <tr><td colSpan={7} className="table-empty">{t('engineering.emptyRca', 'No RCA investigations. Start your first 5-Why analysis.')}</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
        {detail && (
            <div className="modal-overlay" onClick={() => { setDetail(null); setEditing(false); }}>
                <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 750 }}>
                    <ActionBar
                        title={<><Microscope size={20} /> RCA-{detail.rca?.ID || detail.ID}: {detail.rca?.Title || detail.Title}</>}
                        isEditing={editing}
                        onPrint={() => window.triggerTrierPrint('engineering-rca-detail', detail)}
                        onEdit={startEdit}
                        onSave={handleSave}
                        onCancel={() => setEditing(false)}
                        onClose={() => { setDetail(null); setEditing(false); }}
                        showDelete={false}
                    />
                    <div className="scroll-area" style={{ flex: 1, padding: 20, overflowY: 'auto', maxHeight: '65vh' }}>
                        {!editing ? (<>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                                <InfoRow label={t('engineering.incidentDateLabel', 'Incident Date')} value={formatDate(detail.rca?.IncidentDate || detail.IncidentDate)} />
                                <InfoRow label={t('engineering.assetLabel', 'Asset')} value={detail.rca?.AssetID || detail.AssetID} />
                                <InfoRow label={t('engineering.investigatorLabel', 'Investigator')} value={detail.rca?.Investigator || detail.Investigator} />
                                <InfoRow label={t('engineering.statusLabel', 'Status')} value={detail.rca?.Status || detail.Status} />
                                <InfoRow label={t('engineering.workOrderLabel', 'Work Order')} value={detail.rca?.WorkOrderID || detail.WorkOrderID} />
                                <InfoRow label={t('engineering.plantLabel', 'Plant')} value={detail.rca?.PlantID || detail.PlantID} />
                            </div>
                            {(detail.rca?.Summary || detail.Summary) && <div className="panel-box" style={{ padding: 14, marginBottom: 15 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('engineering.sectionSummary', 'SUMMARY')}</strong><p style={{ margin: '6px 0 0' }}>{detail.rca?.Summary || detail.Summary}</p></div>}
                            {(detail.rca?.RootCause || detail.RootCause) && <div className="panel-box" style={{ padding: 14, marginBottom: 15 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('engineering.sectionRootCause', 'ROOT CAUSE')}</strong><p style={{ margin: '6px 0 0' }}>{detail.rca?.RootCause || detail.RootCause}</p></div>}
                            {(detail.rca?.CorrectiveAction || detail.CorrectiveAction) && <div className="panel-box" style={{ padding: 14, marginBottom: 15 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('engineering.sectionCorrectiveAction', 'CORRECTIVE ACTION')}</strong><p style={{ margin: '6px 0 0' }}>{detail.rca?.CorrectiveAction || detail.CorrectiveAction}</p></div>}
                            {detail.whySteps?.length > 0 && <div style={{ marginBottom: 15 }}><h3>{t('engineering.fiveWhyAnalysis', '5-Why Analysis')} ({detail.whySteps.length})</h3>
                                {detail.whySteps.map((w, i) => <div key={w.ID || i} className="panel-box" style={{ padding: '10px 14px', marginBottom: 6 }}><strong style={{ color: '#f59e0b' }}>Why {w.WhyNumber || i + 1}:</strong> {w.Question}<br /><span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>→ {w.Answer}</span></div>)}
                            </div>}
                            {detail.fishbone?.length > 0 && <div><h3>Fishbone Categories ({detail.fishbone.length})</h3>
                                <table className="data-table"><thead><tr><th>{t('engineering.category')}</th><th>{t('engineering.cause')}</th><th>{t('engineering.subcause')}</th></tr></thead>
                                    <tbody>{detail.fishbone.map(fb => <tr key={fb.ID}><td><Badge color="#6366f1">{fb.Category}</Badge></td><td>{fb.Cause}</td><td>{fb.SubCause || '—'}</td></tr>)}</tbody></table>
                            </div>}
                        </>) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelTitle', 'Title')}</label><input value={editForm.Title} onChange={e => ef('Title', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelStatus', 'Status')}</label><select value={editForm.Status} onChange={e => ef('Status', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }}><option value="Open">{t('engineering.statusOpen', 'Open')}</option><option value="In Progress">{t('engineering.statusInProgress', 'In Progress')}</option><option value="Closed">{t('engineering.statusClosed', 'Closed')}</option></select></div>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelSummary', 'Summary')}</label><textarea value={editForm.Summary || ''} onChange={e => ef('Summary', e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem', resize: 'vertical' }} /></div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <h3 style={{ margin: '15px 0 10px', fontSize: '1rem' }}>{t('engineering.fiveWhyAnalysis', '5-Why Analysis')}</h3>
                                    {(editForm.whySteps || []).map((w, i) => (
                                        <div key={w.StepNumber || i} style={{ marginBottom: 15, padding: 15, background: 'rgba(0,0,0,0.15)', borderRadius: 8, border: '1px solid var(--glass-border)' }}>
                                            <div style={{ fontWeight: 700, color: '#f59e0b', marginBottom: 10 }}>Why {w.StepNumber}:</div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Question</label>
                                            <input value={w.Question || ''} onChange={e => { const nw = [...editForm.whySteps]; nw[i].Question = e.target.value; ef('whySteps', nw); }} style={{ width: '100%', marginBottom: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} />
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Answer</label>
                                            <input value={w.Answer || ''} onChange={e => { const nw = [...editForm.whySteps]; nw[i].Answer = e.target.value; ef('whySteps', nw); }} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} />
                                        </div>
                                    ))}
                                </div>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelRootCause', 'Root Cause')}</label><textarea value={editForm.RootCause || ''} onChange={e => ef('RootCause', e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem', resize: 'vertical' }} /></div>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelCorrectiveAction', 'Corrective Action')}</label><textarea value={editForm.CorrectiveAction || ''} onChange={e => ef('CorrectiveAction', e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem', resize: 'vertical' }} /></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FMEA — Failure Mode & Effects Analysis (with detail modal + Print)
// ═══════════════════════════════════════════════════════════════════════════════
function FMEATab({ search }) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]); const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const ef = (k, v) => setEditForm(p => ({ ...p, [k]: v }));

    const fetchItems = useCallback(() => {
        setLoading(true);
        API('/fmea').then(r => r.json()).then(d => { setItems(d); setLoading(false); }).catch(() => setLoading(false));
    }, []);
    useEffect(() => { fetchItems(); }, [fetchItems]);

    const f = useMemo(() => { if (!search) return items; const s = search.toLowerCase(); return items.filter(i => (i.Title || '').toLowerCase().includes(s)); }, [items, search]);
    const rpnColor = (rpn) => { if (rpn >= 200) return '#ef4444'; if (rpn >= 100) return '#f59e0b'; return '#10b981'; };
    const loadDetail = async (id) => { const r = await API(`/fmea/${id}`); const d = await r.json(); setDetail(d); setEditing(false); };
    const startEdit = () => { const w = detail.worksheet || detail; setEditForm({ Title: w.Title || '', Status: w.Status || '', SystemComponent: w.SystemComponent || '', modes: detail.modes ? JSON.parse(JSON.stringify(detail.modes)) : [] }); setEditing(true); };

    if (loading) return <LoadingSpinner />;
    return (
        <>
            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
                <h2 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 10 }}><AlertTriangle size={24} color="#f59e0b" /> {t('engineering.failureModeEffectsAnalysis', 'Failure Mode & Effects Analysis')} ({f.length})</h2>
                <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                    <table className="data-table">
                        <thead><tr><th>ID</th><th>{t('engineering.title')}</th><th>{t('engineering.systemComponent')}</th><th>{t('engineering.asset')}</th><th>{t('engineering.maxRpn')}</th><th>{t('engineering.status')}</th><th>{t('engineering.actions')}</th></tr></thead>
                        <tbody>{f.map(i => (<tr key={i.ID}><td style={{ fontWeight: 600 }}>FMEA-{i.ID}</td><td>{i.Title}</td><td>{i.SystemComponent || '—'}</td><td>{i.AssetID || '—'}</td><td><span style={{ fontWeight: 800, color: rpnColor(i.maxRPN || 0) }}>{i.maxRPN || 0}</span></td><td><Badge color={i.Status === 'Active' ? '#10b981' : '#64748b'}>{t('engineering.status' + i.Status.replace(/\s+/g, ''), i.Status)}</Badge></td>
                            <td style={{ display: 'flex', gap: 2 }}><ActionBtn icon={Eye} tip={t('engineering.tipViewFmea', 'View FMEA worksheet with failure modes')} color="#3b82f6" onClick={() => loadDetail(i.ID)} /><ActionBtn icon={Pencil} tip={t('engineering.tipEditFmea', 'Edit FMEA')} color="#f59e0b" onClick={() => { loadDetail(i.ID).then(() => setTimeout(() => startEdit(), 200)); }} /></td></tr>))}
                            {f.length === 0 && <tr><td colSpan={7} className="table-empty">{t('engineering.emptyFmea', 'No FMEA worksheets created yet.')}</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
            {detail && (
                <div className="modal-overlay" onClick={() => setDetail(null)}>
                    <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 850 }}>
                        <ActionBar
                            title={<><AlertTriangle size={20} /> FMEA-{detail.worksheet?.ID}: {detail.worksheet?.Title}</>}
                            isEditing={editing}
                            onPrint={() => window.triggerTrierPrint('engineering-fmea-detail', detail)}
                            onEdit={startEdit}
                            onSave={async () => { 
                                const id = (detail.worksheet || detail).ID; 
                                await API(`/fmea/${id}`, { method: 'PUT', body: JSON.stringify(editForm) }); 
                                if (editForm.modes) {
                                    await Promise.all(editForm.modes.map(m => 
                                        API(`/fmea/${id}/modes/${m.ID}`, { method: 'PUT', body: JSON.stringify(m) })
                                    ));
                                }
                                setEditing(false); loadDetail(id); fetchItems(); 
                            }}
                            onCancel={() => setEditing(false)}
                            onClose={() => { setDetail(null); setEditing(false); }}
                            showDelete={false}
                        />
                        <div className="scroll-area" style={{ flex: 1, padding: 20, overflowY: 'auto', maxHeight: '65vh' }}>
                            {!editing ? (<>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                                <InfoRow label={t('engineering.systemComponentLabel', 'System / Component')} value={detail.worksheet?.SystemComponent} />
                                <InfoRow label={t('engineering.assetLabel', 'Asset')} value={detail.worksheet?.AssetID} />
                                <InfoRow label={t('engineering.statusLabel', 'Status')} value={detail.worksheet?.Status} />
                            </div>
                            <table className="data-table" style={{ fontSize: '0.8rem' }}>
                                <thead><tr><th>{t('engineering.failureMode', 'Failure Mode')}</th><th>{t('engineering.effect', 'Effect')}</th><th>{t('engineering.cause', 'Cause')}</th><th>{t('engineering.severity', 'S')}</th><th>{t('engineering.occurrence', 'O')}</th><th>{t('engineering.detection', 'D')}</th><th style={{ fontWeight: 800 }}>RPN</th><th>{t('engineering.action', 'Action')}</th><th>{t('engineering.owner', 'Owner')}</th></tr></thead>
                                <tbody>{(detail.modes || []).map(m => (<tr key={m.ID}><td>{m.FailureMode}</td><td>{m.FailureEffect}</td><td>{m.FailureCause}</td><td>{m.Severity}</td><td>{m.Occurrence}</td><td>{m.Detection}</td><td style={{ fontWeight: 800, color: rpnColor(m.RPN) }}>{m.RPN}</td><td>{m.RecommendedAction || '—'}</td><td>{m.ActionOwner || '—'}</td></tr>))}</tbody>
                            </table>
                            </>) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                    <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelTitle', 'Title')}</label><input value={editForm.Title} onChange={e => ef('Title', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                    <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelStatus', 'Status')}</label><select value={editForm.Status} onChange={e => ef('Status', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }}><option>{t('engineering.statusDraft', 'Draft')}</option><option>{t('engineering.statusActive', 'Active')}</option><option>{t('engineering.statusClosed', 'Closed')}</option></select></div>
                                    <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelSystemComponent', 'System / Component')}</label><input value={editForm.SystemComponent} onChange={e => ef('SystemComponent', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                    
                                    <div style={{ gridColumn: 'span 2', marginTop: 15 }}>
                                        <h3 style={{ margin: '0 0 10px', fontSize: '1rem' }}>Editing Modes</h3>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table className="data-table" style={{ fontSize: '0.8rem', minWidth: 800 }}>
                                                <thead><tr><th>Mode</th><th>Effect</th><th>Cause</th><th>S</th><th>O</th><th>D</th><th>Action</th><th>Owner</th></tr></thead>
                                                <tbody>
                                                    {(editForm.modes || []).map((m, idx) => (
                                                        <tr key={m.ID}>
                                                            <td><input value={m.FailureMode || ''} onChange={e => { const nm = [...editForm.modes]; nm[idx].FailureMode = e.target.value; ef('modes', nm); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                            <td><input value={m.FailureEffect || ''} onChange={e => { const nm = [...editForm.modes]; nm[idx].FailureEffect = e.target.value; ef('modes', nm); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                            <td><input value={m.FailureCause || ''} onChange={e => { const nm = [...editForm.modes]; nm[idx].FailureCause = e.target.value; ef('modes', nm); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                            <td><input type="number" min="1" max="10" value={m.Severity || 1} onChange={e => { const nm = [...editForm.modes]; nm[idx].Severity = e.target.value; ef('modes', nm); }} style={{ width: 45, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                            <td><input type="number" min="1" max="10" value={m.Occurrence || 1} onChange={e => { const nm = [...editForm.modes]; nm[idx].Occurrence = e.target.value; ef('modes', nm); }} style={{ width: 45, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                            <td><input type="number" min="1" max="10" value={m.Detection || 1} onChange={e => { const nm = [...editForm.modes]; nm[idx].Detection = e.target.value; ef('modes', nm); }} style={{ width: 45, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                            <td><input value={m.RecommendedAction || ''} onChange={e => { const nm = [...editForm.modes]; nm[idx].RecommendedAction = e.target.value; ef('modes', nm); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                            <td><input value={m.ActionOwner || ''} onChange={e => { const nm = [...editForm.modes]; nm[idx].ActionOwner = e.target.value; ef('modes', nm); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPAIR vs REPLACE
// ═══════════════════════════════════════════════════════════════════════════════
function RepairReplaceTab({ search }) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]); const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const ef = (k, v) => setEditForm(p => ({ ...p, [k]: v }));

    const fetchItems = useCallback(() => {
        setLoading(true);
        API('/repair-replace').then(r => r.json()).then(d => { setItems(d); setLoading(false); }).catch(() => setLoading(false));
    }, []);
    useEffect(() => { fetchItems(); }, [fetchItems]);

    const recColor = (r) => {
        if (!r) return '#64748b';
        if (r.toLowerCase().includes('replace')) return '#ef4444';
        if (r.toLowerCase().includes('repair')) return '#10b981';
        return '#f59e0b';
    };
    const f = useMemo(() => { if (!search) return items; const s = search.toLowerCase(); return items.filter(i => (i.Title || '').toLowerCase().includes(s) || (i.AssetID || '').toLowerCase().includes(s)); }, [items, search]);

    const loadDetail = async (id) => { const r = await API(`/repair-replace/${id}`); if (r.ok) { setDetail(await r.json()); setEditing(false); } };
    const startEdit = () => { const d = detail; setEditForm({ Title: d.Title || '', Recommendation: d.Recommendation || '', Notes: d.Notes || '', ReplacementCost: d.ReplacementCost || '', AnnualRepairCost: d.AnnualRepairCost || '', CurrentAge: d.CurrentAge || '', UsefulLife: d.UsefulLife || '', DowntimeCostPerHour: d.DowntimeCostPerHour || '', AvgDowntimeHours: d.AvgDowntimeHours || '' }); setEditing(true); };

    if (loading) return <LoadingSpinner />;
    return (<>
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
            <h2 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 10 }}><Calculator size={24} color="#8b5cf6" /> {t('engineering.repairVsReplace', 'Repair vs Replace')} ({f.length})</h2>
            <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>{t('engineering.title')}</th><th>{t('engineering.asset')}</th><th>{t('engineering.replacement')}</th><th>{t('engineering.annualRepair')}</th><th>{t('engineering.breakevenYr')}</th><th>{t('engineering.recommendation')}</th><th>{t('engineering.analyzedBy')}</th><th>{t('engineering.actions')}</th></tr></thead>
                    <tbody>{f.map(i => (<tr key={i.ID}><td style={{ fontWeight: 600 }}>{i.Title}</td><td>{i.AssetID || '—'}</td><td>${(i.ReplacementCost || 0).toLocaleString()}</td><td>${(i.AnnualRepairCost || 0).toLocaleString()}</td><td style={{ fontWeight: 700 }}>{i.BreakEvenYear ? `Year ${i.BreakEvenYear}` : '—'}</td><td><Badge color={recColor(i.Recommendation)}>{i.Recommendation || '—'}</Badge></td><td>{i.AnalyzedBy || '—'}</td>
                        <td style={{ display: 'flex', gap: 2 }}><ActionBtn icon={Eye} tip={t('engineering.tipViewAnalysis', 'View analysis detail')} color="#3b82f6" onClick={() => loadDetail(i.ID)} /><ActionBtn icon={Pencil} tip={t('engineering.tipEditAnalysis', 'Edit analysis')} color="#f59e0b" onClick={() => { loadDetail(i.ID).then(() => setTimeout(() => startEdit(), 200)); }} /></td></tr>))}
                        {f.length === 0 && <tr><td colSpan={8} className="table-empty">{t('engineering.emptyRepairReplace', 'No analyses yet. Run your first repair vs replace calculation.')}</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
        {detail && (
            <div className="modal-overlay" onClick={() => { setDetail(null); setEditing(false); }}>
                <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 750 }}>
                    <ActionBar
                        title={<><Calculator size={20} /> {detail.Title}</>}
                        isEditing={editing}
                        onPrint={() => window.triggerTrierPrint('engineering-repair-replace', detail)}
                        onEdit={startEdit}
                        onSave={async () => { await API(`/repair-replace/${detail.ID}`, { method: 'PUT', body: JSON.stringify(editForm) }); setEditing(false); loadDetail(detail.ID); fetchItems(); }}
                        onCancel={() => setEditing(false)}
                        onClose={() => { setDetail(null); setEditing(false); }}
                        showDelete={false}
                    />
                    <div className="scroll-area" style={{ flex: 1, padding: 20, overflowY: 'auto', maxHeight: '65vh' }}>
                        {!editing ? (<>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                            <InfoRow label={t('engineering.assetLabel', 'Asset')} value={detail.AssetID} />
                            <InfoRow label={t('engineering.currentAgeLabel', 'Current Age (yrs)')} value={detail.CurrentAge} />
                            <InfoRow label={t('engineering.usefulLifeLabel', 'Useful Life (yrs)')} value={detail.UsefulLife} />
                            <InfoRow label={t('engineering.replacementCostLabel', 'Replacement Cost')} value={`$${(detail.ReplacementCost || 0).toLocaleString()}`} />
                            <InfoRow label={t('engineering.annualRepairCostLabel', 'Annual Repair Cost')} value={`$${(detail.AnnualRepairCost || 0).toLocaleString()}`} />
                            <InfoRow label={t('engineering.repairCostTrendLabel', 'Repair Cost Trend')} value={`${detail.RepairCostTrend || 0}% / year`} />
                            <InfoRow label={t('engineering.downtimeCostHrLabel', 'Downtime Cost/Hr')} value={`$${(detail.DowntimeCostPerHour || 0).toLocaleString()}`} />
                            <InfoRow label={t('engineering.avgDowntimeHrsLabel', 'Avg Downtime (hrs)')} value={detail.AvgDowntimeHours} />
                            <InfoRow label={t('engineering.breakEvenYearLabel', 'Break-Even Year')} value={detail.BreakEvenYear ? `Year ${detail.BreakEvenYear}` : 'N/A'} />
                            <InfoRow label={t('engineering.analyzedByLabel', 'Analyzed By')} value={detail.AnalyzedBy} />
                        </div>
                        <div className="panel-box" style={{ padding: 14, marginBottom: 15, borderLeft: `4px solid ${recColor(detail.Recommendation)}` }}>
                            <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('engineering.sectionRecommendation', 'RECOMMENDATION')}</strong>
                            <p style={{ margin: '6px 0 0', fontWeight: 700, color: recColor(detail.Recommendation), fontSize: '1.05rem' }}>{detail.Recommendation || '—'}</p>
                        </div>
                        {detail.Notes && <div className="panel-box" style={{ padding: 14 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('engineering.sectionEngineeringNotes', 'ENGINEERING NOTES')}</strong><p style={{ margin: '6px 0 0' }}>{detail.Notes}</p></div>}
                        </>) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelTitle', 'Title')}</label><input value={editForm.Title} onChange={e => ef('Title', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelReplacementCostDollar', 'Replacement Cost ($)')}</label><input type="number" value={editForm.ReplacementCost} onChange={e => ef('ReplacementCost', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelAnnualRepairCostDollar', 'Annual Repair Cost ($)')}</label><input type="number" value={editForm.AnnualRepairCost} onChange={e => ef('AnnualRepairCost', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelCurrentAgeYears', 'Current Age (years)')}</label><input type="number" value={editForm.CurrentAge} onChange={e => ef('CurrentAge', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelUsefulLifeYears', 'Useful Life (years)')}</label><input type="number" value={editForm.UsefulLife} onChange={e => ef('UsefulLife', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelDowntimeCostHrDollar', 'Downtime Cost/Hr ($)')}</label><input type="number" value={editForm.DowntimeCostPerHour} onChange={e => ef('DowntimeCostPerHour', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelAvgDowntimeHrs', 'Avg Downtime (hrs)')}</label><input type="number" value={editForm.AvgDowntimeHours} onChange={e => ef('AvgDowntimeHours', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelRecommendation', 'Recommendation')}</label><input value={editForm.Recommendation} onChange={e => ef('Recommendation', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelEngineeringNotes', 'Engineering Notes')}</label><textarea value={editForm.Notes} onChange={e => ef('Notes', e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem', resize: 'vertical' }} /></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ECN — Engineering Change Notices (with detail modal + Print/Edit)
// ═══════════════════════════════════════════════════════════════════════════════
function ECNTab({ search }) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]); const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const ef = (k, v) => setEditForm(p => ({ ...p, [k]: v }));

    const fetchItems = useCallback(() => {
        setLoading(true);
        API('/ecn').then(r => r.json()).then(d => { setItems(d); setLoading(false); }).catch(() => setLoading(false));
    }, []);
    useEffect(() => { fetchItems(); }, [fetchItems]);

    const stColor = (s) => ({ 'Draft': '#64748b', 'Pending': '#f59e0b', 'Approved': '#10b981', 'Rejected': '#ef4444', 'Implemented': '#3b82f6' }[s] || '#64748b');
    const f = useMemo(() => { if (!search) return items; const s = search.toLowerCase(); return items.filter(i => (i.Title || '').toLowerCase().includes(s) || (i.ECNNumber || '').toLowerCase().includes(s)); }, [items, search]);

    const loadDetail = async (id) => { const r = await API(`/ecn/${id}`); if (r.ok) { setDetail(await r.json()); setEditing(false); } };
    const startEdit = () => { const i = detail.ecn || detail; setEditForm({ Title: i.Title || '', Description: i.Description || '', Status: i.Status || '', ChangeType: i.ChangeType || '', Justification: i.Justification || '', BeforeSpec: i.BeforeSpec || '', AfterSpec: i.AfterSpec || '', approvals: detail.approvals ? JSON.parse(JSON.stringify(detail.approvals)) : [] }); setEditing(true); };

    if (loading) return <LoadingSpinner />;
    return (<>
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
            <h2 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 10 }}><FileCheck size={24} color="#06b6d4" /> {t('engineering.engineeringChangeNotices', 'Engineering Change Notices')} ({f.length})</h2>
            <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>{t('engineering.ecn')}</th><th>{t('engineering.title')}</th><th>{t('engineering.type')}</th><th>{t('engineering.asset')}</th><th>{t('engineering.requestedBy')}</th><th>{t('engineering.status')}</th><th>{t('engineering.created')}</th><th>{t('engineering.actions')}</th></tr></thead>
                    <tbody>{f.map(i => (<tr key={i.ID}><td style={{ fontWeight: 600, color: '#06b6d4' }}>{i.ECNNumber}</td><td>{i.Title}</td><td><Badge color="#6366f1">{i.ChangeType}</Badge></td><td>{i.AssetID || '—'}</td><td>{i.RequestedBy || '—'}</td><td><Badge color={stColor(i.Status)}>{t('status.' + (i.Status || '').replace(/\s+/g, ''), i.Status)}</Badge></td><td>{formatDate(i.CreatedAt)}</td>
                        <td style={{ display: 'flex', gap: 2 }}><ActionBtn icon={Eye} tip={t('engineering.tipViewEcn', 'View ECN detail')} color="#3b82f6" onClick={() => loadDetail(i.ID)} /><ActionBtn icon={Pencil} tip={t('engineering.tipEditEcn', 'Edit ECN')} color="#f59e0b" onClick={() => { loadDetail(i.ID).then(() => setTimeout(() => startEdit(), 200)); }} /></td></tr>))}
                        {f.length === 0 && <tr><td colSpan={8} className="table-empty">{t('engineering.emptyEcn', 'No ECNs. Create your first engineering change notice.')}</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
        {detail && (
            <div className="modal-overlay" onClick={() => { setDetail(null); setEditing(false); }}>
                <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 750 }}>
                    <ActionBar
                        title={<><FileCheck size={20} /> {(detail.ecn || detail).ECNNumber}: {(detail.ecn || detail).Title}</>}
                        isEditing={editing}
                        onPrint={() => window.triggerTrierPrint('engineering-ecn-detail', detail)}
                        onEdit={startEdit}
                        onSave={async () => { 
                            const id = (detail.ecn || detail).ID; 
                            await API(`/ecn/${id}`, { method: 'PUT', body: JSON.stringify(editForm) }); 
                            if (editForm.approvals) {
                                await Promise.all(editForm.approvals.map(a => 
                                    API(`/ecn/${id}/approvals/${a.ID}`, { method: 'PUT', body: JSON.stringify(a) })
                                ));
                            }
                            setEditing(false); loadDetail(id); fetchItems(); 
                        }}
                        onCancel={() => setEditing(false)}
                        onClose={() => { setDetail(null); setEditing(false); }}
                        showDelete={false}
                    />
                    <div className="scroll-area" style={{ flex: 1, padding: 20, overflowY: 'auto', maxHeight: '65vh' }}>
                        {!editing ? (<>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                                <InfoRow label={t('engineering.ecnNumberLabel', 'ECN Number')} value={(detail.ecn || detail).ECNNumber} />
                                <InfoRow label={t('engineering.changeTypeLabel', 'Change Type')} value={(detail.ecn || detail).ChangeType} />
                                <InfoRow label={t('engineering.statusLabel', 'Status')} value={(detail.ecn || detail).Status} />
                                <InfoRow label={t('engineering.assetLabel', 'Asset')} value={(detail.ecn || detail).AssetID} />
                                <InfoRow label={t('engineering.requestedByLabel', 'Requested By')} value={(detail.ecn || detail).RequestedBy} />
                                <InfoRow label={t('engineering.implementedLabel', 'Implemented')} value={formatDate((detail.ecn || detail).ImplementedDate)} />
                            </div>
                            {(detail.ecn || detail).Description && <div className="panel-box" style={{ padding: 14, marginBottom: 15 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('engineering.sectionDescription', 'DESCRIPTION')}</strong><p style={{ margin: '6px 0 0' }}>{(detail.ecn || detail).Description}</p></div>}
                            {(detail.ecn || detail).Justification && <div className="panel-box" style={{ padding: 14, marginBottom: 15 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('engineering.sectionJustification', 'JUSTIFICATION')}</strong><p style={{ margin: '6px 0 0' }}>{(detail.ecn || detail).Justification}</p></div>}
                            {(detail.ecn || detail).BeforeSpec && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div className="panel-box" style={{ padding: 14 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('engineering.sectionBefore', 'BEFORE')}</strong><p style={{ margin: '6px 0 0' }}>{(detail.ecn || detail).BeforeSpec}</p></div>
                                <div className="panel-box" style={{ padding: 14 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('engineering.sectionAfter', 'AFTER')}</strong><p style={{ margin: '6px 0 0' }}>{(detail.ecn || detail).AfterSpec}</p></div>
                            </div>}
                            {detail.approvals?.length > 0 && <div style={{ marginTop: 15 }}><h3>{t('engineering.approvals', 'Approvals')}</h3><table className="data-table"><thead><tr><th>{t('engineering.approver', 'Approver')}</th><th>{t('engineering.statusCol', 'Status')}</th><th>{t('engineering.dateCol', 'Date')}</th><th>{t('engineering.comments', 'Comments')}</th></tr></thead>
                                <tbody>{detail.approvals.map(a => <tr key={a.ID}><td>{a.ApproverName}</td><td><Badge color={a.Decision === 'Approved' ? '#10b981' : '#f59e0b'}>{t('status.' + (a.Decision || '').replace(/\s+/g, ''), a.Decision)}</Badge></td><td>{formatDate(a.DecisionDate) || '—'}</td><td>{a.Comments || '—'}</td></tr>)}</tbody></table></div>}
                        </>) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelTitle', 'Title')}</label><input value={editForm.Title} onChange={e => ef('Title', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelStatus', 'Status')}</label><select value={editForm.Status} onChange={e => ef('Status', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }}><option>{t('engineering.statusDraft', 'Draft')}</option><option>{t('engineering.statusPending', 'Pending')}</option><option>{t('engineering.statusApproved', 'Approved')}</option><option>{t('engineering.statusRejected', 'Rejected')}</option><option>{t('engineering.statusImplemented', 'Implemented')}</option></select></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelChangeType', 'Change Type')}</label><select value={editForm.ChangeType} onChange={e => ef('ChangeType', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }}><option>{t('engineering.changeTypeProcess', 'Process Change')}</option><option>{t('engineering.changeTypeEquipment', 'Equipment Change')}</option><option>{t('engineering.changeTypeSafety', 'Safety Change')}</option><option>{t('engineering.changeTypeMaterial', 'Material Change')}</option></select></div>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelDescription', 'Description')}</label><textarea value={editForm.Description || ''} onChange={e => ef('Description', e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem', resize: 'vertical' }} /></div>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelJustification', 'Justification')}</label><textarea value={editForm.Justification || ''} onChange={e => ef('Justification', e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem', resize: 'vertical' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelBeforeSpec', 'Before Spec')}</label><textarea value={editForm.BeforeSpec || ''} onChange={e => ef('BeforeSpec', e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem', resize: 'vertical' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelAfterSpec', 'After Spec')}</label><textarea value={editForm.AfterSpec || ''} onChange={e => ef('AfterSpec', e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem', resize: 'vertical' }} /></div>
                                {editForm.approvals && editForm.approvals.length > 0 && <div style={{ gridColumn: 'span 2', marginTop: 15 }}>
                                    <h3 style={{ margin: '0 0 10px', fontSize: '1rem' }}>{t('engineering.approvals', 'Approvals')}</h3>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="data-table" style={{ fontSize: '0.8rem', minWidth: 600 }}>
                                            <thead><tr><th>{t('engineering.approver', 'Approver')}</th><th>{t('engineering.statusCol', 'Status')}</th><th>{t('engineering.dateCol', 'Date')}</th><th>{t('engineering.comments', 'Comments')}</th></tr></thead>
                                            <tbody>
                                                {editForm.approvals.map((a, idx) => (
                                                    <tr key={a.ID}>
                                                        <td><input value={a.ApproverName || ''} onChange={e => { const na = [...editForm.approvals]; na[idx].ApproverName = e.target.value; ef('approvals', na); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                        <td><select value={a.Decision || ''} onChange={e => { const na = [...editForm.approvals]; na[idx].Decision = e.target.value; ef('approvals', na); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }}><option>Pending</option><option>Approved</option><option>Rejected</option></select></td>
                                                        <td><input type="date" value={(a.DecisionDate || '').split('T')[0].split(' ')[0]} onChange={e => { const na = [...editForm.approvals]; na[idx].DecisionDate = e.target.value; ef('approvals', na); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                        <td><input value={a.Comments || ''} onChange={e => { const na = [...editForm.approvals]; na[idx].Comments = e.target.value; ef('approvals', na); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPITAL PROJECTS (with detail modal + Print/Edit)
// ═══════════════════════════════════════════════════════════════════════════════
function ProjectsTab({ search }) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]); const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const ef = (k, v) => setEditForm(p => ({ ...p, [k]: v }));

    const fetchItems = useCallback(() => {
        setLoading(true);
        API('/projects').then(r => r.json()).then(d => { setItems(d); setLoading(false); }).catch(() => setLoading(false));
    }, []);
    useEffect(() => { fetchItems(); }, [fetchItems]);

    const stColor = (s) => ({ 'Planning': '#64748b', 'Approved': '#3b82f6', 'In Progress': '#f59e0b', 'Complete': '#10b981', 'On Hold': '#8b5cf6', 'Cancelled': '#ef4444' }[s] || '#64748b');
    const f = useMemo(() => { if (!search) return items; const s = search.toLowerCase(); return items.filter(i => (i.Title || '').toLowerCase().includes(s) || (i.ProjectNumber || '').toLowerCase().includes(s)); }, [items, search]);

    const loadDetail = async (id) => { const r = await API(`/projects/${id}`); if (r.ok) { setDetail(await r.json()); setEditing(false); } };
    const startEdit = () => { const p = detail.project || detail; setEditForm({ Title: p.Title || '', Status: p.Status || '', Category: p.Category || '', Budget: p.Budget || '', ActualSpend: p.ActualSpend || '', Description: p.Description || '', ProjectManager: p.ProjectManager || '', StartDate: p.StartDate || '', TargetEndDate: p.TargetEndDate || '', PlantID: p.PlantID || '', milestones: detail.milestones ? JSON.parse(JSON.stringify(detail.milestones)) : [] }); setEditing(true); };

    if (loading) return <LoadingSpinner />;
    return (<>
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
            <h2 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 10 }}><FolderKanban size={24} color="#8b5cf6" /> {t('engineering.capitalProjects', 'Capital Projects')} ({f.length})</h2>
            <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>{t('engineering.project')}</th><th>{t('engineering.title')}</th><th>{t('engineering.category')}</th><th>{t('engineering.budget')}</th><th>{t('engineering.spent')}</th><th>{t('engineering.margin', 'Margin')}</th><th>{t('engineering.used')}</th><th>{t('engineering.status')}</th><th>{t('engineering.pm', 'PM')}</th><th>{t('engineering.actions')}</th></tr></thead>
                    <tbody>{f.map(i => {
                        const pct = i.Budget > 0 ? Math.round((i.ActualSpend || 0) / i.Budget * 100) : 0;
                        const margin = (i.Budget || 0) - (i.ActualSpend || 0);
                        return (<tr key={i.ID}><td style={{ fontWeight: 600, color: '#8b5cf6' }}>{i.ProjectNumber}</td><td>{i.Title}</td><td><Badge color="#6366f1">{i.Category}</Badge></td><td>${(i.Budget || 0).toLocaleString()}</td><td>${(i.ActualSpend || 0).toLocaleString()}</td><td style={{ fontWeight: margin < 0 ? 700 : 500, color: margin < 0 ? '#ef4444' : '#10b981' }}>${margin.toLocaleString()}</td><td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pct > 100 ? '#ef4444' : pct > 80 ? '#f59e0b' : '#10b981', borderRadius: 4, transition: 'width 0.3s' }} /></div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: pct > 100 ? '#ef4444' : '#94a3b8', minWidth: 35 }}>{pct}%</span>
                            </div></td><td><Badge color={stColor(i.Status)}>{t('status.' + (i.Status || '').replace(/\s+/g, ''), i.Status)}</Badge></td><td>{i.ProjectManager || '—'}</td>
                            <td style={{ display: 'flex', gap: 2 }}><ActionBtn icon={Eye} tip={t('engineering.tipViewProject', 'View project detail')} color="#3b82f6" onClick={() => loadDetail(i.ID)} /><ActionBtn icon={Pencil} tip={t('engineering.tipEditProject', 'Edit project')} color="#f59e0b" onClick={() => { loadDetail(i.ID).then(() => setTimeout(() => startEdit(), 200)); }} /></td></tr>);
                    })}
                        {f.length === 0 && <tr><td colSpan={9} className="table-empty">{t('engineering.emptyProjects', 'No capital projects tracked.')}</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
        {detail && (
            <div className="modal-overlay" onClick={() => { setDetail(null); setEditing(false); }}>
                <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 750 }}>
                    <ActionBar
                        title={<><FolderKanban size={20} /> {(detail.project || detail).ProjectNumber}: {(detail.project || detail).Title}</>}
                        isEditing={editing}
                        onPrint={() => window.triggerTrierPrint('engineering-project-detail', detail)}
                        onEdit={startEdit}
                        onSave={async () => { 
                            const id = (detail.project || detail).ID; 
                            await API(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(editForm) }); 
                            if (editForm.milestones) {
                                await Promise.all(editForm.milestones.map(m => 
                                    API(`/projects/${id}/milestones/${m.ID}`, { method: 'PUT', body: JSON.stringify(m) })
                                ));
                            }
                            setEditing(false); loadDetail(id); fetchItems(); 
                        }}
                        onCancel={() => setEditing(false)}
                        onClose={() => { setDetail(null); setEditing(false); }}
                        showDelete={false}
                    />
                    <div className="scroll-area" style={{ flex: 1, padding: 20, overflowY: 'auto', maxHeight: '65vh' }}>
                        {!editing ? (<>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                            <InfoRow label={t('engineering.categoryLabel', 'Category')} value={(detail.project || detail).Category} />
                            <InfoRow label={t('engineering.statusLabel', 'Status')} value={(detail.project || detail).Status} />
                            <InfoRow label={t('engineering.projectManagerLabel', 'Project Manager')} value={(detail.project || detail).ProjectManager} />
                            <InfoRow label={t('engineering.budgetLabel', 'Budget')} value={`$${((detail.project || detail).Budget || 0).toLocaleString()}`} />
                            <InfoRow label={t('engineering.actualSpendLabel', 'Actual Spend')} value={`$${((detail.project || detail).ActualSpend || 0).toLocaleString()}`} />
                            <InfoRow label={t('engineering.startDateLabel', 'Start Date')} value={formatDate((detail.project || detail).StartDate)} />
                            <InfoRow label={t('engineering.targetEndLabel', 'Target End')} value={formatDate((detail.project || detail).TargetEndDate)} />
                            <InfoRow label={t('engineering.plantLabel', 'Plant')} value={(detail.project || detail).PlantID} />
                        </div>
                        {(detail.project || detail).Description && <div className="panel-box" style={{ padding: 14, marginBottom: 15 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('engineering.sectionDescription', 'DESCRIPTION')}</strong><p style={{ margin: '6px 0 0' }}>{(detail.project || detail).Description}</p></div>}
                        {detail.milestones?.length > 0 && <div><h3>{t('engineering.milestones', 'Milestones')} ({detail.milestones.length})</h3>
                            <table className="data-table"><thead><tr><th>{t('engineering.milestone')}</th><th>{t('engineering.dueDate')}</th><th>{t('engineering.status')}</th><th>{t('engineering.notes')}</th></tr></thead>
                                <tbody>{detail.milestones.map(m => <tr key={m.ID}><td style={{ fontWeight: 600 }}>{m.Title}</td><td>{formatDate(m.DueDate) || '—'}</td><td><Badge color={m.Status === 'Complete' ? '#10b981' : '#f59e0b'}>{t('status.' + (m.Status || '').replace(/\s+/g, ''), m.Status)}</Badge></td><td>{m.Notes || '—'}</td></tr>)}</tbody></table></div>}
                        </>) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelTitle', 'Title')}</label><input value={editForm.Title} onChange={e => ef('Title', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelStatus', 'Status')}</label><select value={editForm.Status} onChange={e => ef('Status', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }}><option>{t('engineering.projectStatusPlanning', 'Planning')}</option><option>{t('engineering.statusApproved', 'Approved')}</option><option>{t('engineering.statusInProgress', 'In Progress')}</option><option>{t('engineering.projectStatusComplete', 'Complete')}</option><option>{t('engineering.projectStatusOnHold', 'On Hold')}</option><option>{t('engineering.projectStatusCancelled', 'Cancelled')}</option></select></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelCategory', 'Category')}</label><input value={editForm.Category} onChange={e => ef('Category', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.projectManagerLabel', 'Project Manager')}</label><input value={editForm.ProjectManager || ''} onChange={e => ef('ProjectManager', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.plantLabel', 'Plant')}</label><input value={editForm.PlantID || ''} onChange={e => ef('PlantID', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelBudgetDollar', 'Budget ($)')}</label><input type="number" value={editForm.Budget} onChange={e => ef('Budget', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelActualSpendDollar', 'Actual Spend ($)')}</label><input type="number" value={editForm.ActualSpend} onChange={e => ef('ActualSpend', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.startDateLabel', 'Start Date')}</label><input type="date" value={(editForm.StartDate || '').split('T')[0].split(' ')[0]} onChange={e => ef('StartDate', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.targetEndLabel', 'Target End')}</label><input type="date" value={(editForm.TargetEndDate || '').split('T')[0].split(' ')[0]} onChange={e => ef('TargetEndDate', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelDescription', 'Description')}</label><textarea value={editForm.Description} onChange={e => ef('Description', e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem', resize: 'vertical' }} /></div>
                                {editForm.milestones && editForm.milestones.length > 0 && <div style={{ gridColumn: 'span 2', marginTop: 15 }}>
                                    <h3 style={{ margin: '0 0 10px', fontSize: '1rem' }}>{t('engineering.milestones', 'Milestones')}</h3>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="data-table" style={{ fontSize: '0.8rem', minWidth: 600 }}>
                                            <thead><tr><th>{t('engineering.milestone')}</th><th>{t('engineering.dueDate')}</th><th>{t('engineering.status')}</th><th>{t('engineering.notes')}</th></tr></thead>
                                            <tbody>
                                                {editForm.milestones.map((m, idx) => (
                                                    <tr key={m.ID}>
                                                        <td><input value={m.Title || ''} onChange={e => { const nm = [...editForm.milestones]; nm[idx].Title = e.target.value; ef('milestones', nm); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                        <td><input type="date" value={(m.DueDate || '').split('T')[0].split(' ')[0]} onChange={e => { const nm = [...editForm.milestones]; nm[idx].DueDate = e.target.value; ef('milestones', nm); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                        <td><select value={m.Status || ''} onChange={e => { const nm = [...editForm.milestones]; nm[idx].Status = e.target.value; ef('milestones', nm); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }}><option>Pending</option><option>Complete</option><option>Delayed</option><option>Cancelled</option></select></td>
                                                        <td><input value={m.Notes || ''} onChange={e => { const nm = [...editForm.milestones]; nm[idx].Notes = e.target.value; ef('milestones', nm); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LUBRICATION (with detail modal + Print)
// ═══════════════════════════════════════════════════════════════════════════════
function LubeTab({ search }) {
    const { t } = useTranslation();
    const [routes, setRoutes] = useState([]); const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const ef = (k, v) => setEditForm(p => ({ ...p, [k]: v }));

    const fetchItems = useCallback(() => {
        setLoading(true);
        API('/lube/routes').then(r => r.json()).then(d => { setRoutes(d); setLoading(false); }).catch(() => setLoading(false));
    }, []);
    useEffect(() => { fetchItems(); }, [fetchItems]);
    const daysUntil = (d) => d ? Math.floor((new Date(d) - new Date()) / 86400000) : null;

    const loadDetail = async (id) => { const r = await API(`/lube/routes/${id}`); if (r.ok) { setDetail(await r.json()); setEditing(false); } };
    const startEdit = () => { const rt = detail.route || detail; setEditForm({ RouteName: rt.RouteName || '', Description: rt.Description || '', Frequency: rt.Frequency || '', AssignedTo: rt.AssignedTo || '', points: detail.points ? JSON.parse(JSON.stringify(detail.points)) : [] }); setEditing(true); };

    if (loading) return <LoadingSpinner />;
    return (<>
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
            <h2 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 10 }}><Droplets size={24} color="#06b6d4" /> {t('engineering.lubricationRoutes', 'Lubrication Routes')} ({routes.length})</h2>
            <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>{t('engineering.route')}</th><th>{t('engineering.description')}</th><th>{t('engineering.frequency')}</th><th>{t('engineering.assignedTo')}</th><th>{t('engineering.lastCompleted')}</th><th>{t('engineering.nextDue')}</th><th>{t('engineering.points')}</th><th>{t('engineering.actions')}</th></tr></thead>
                    <tbody>{routes.map(r => { const days = daysUntil(r.NextDue); return (<tr key={r.ID}><td style={{ fontWeight: 600, color: '#06b6d4' }}>{r.RouteName}</td><td>{r.Description || '—'}</td><td><Badge color="#6366f1">{r.Frequency}</Badge></td><td>{r.AssignedTo || '—'}</td><td>{formatDate(r.LastCompleted) || 'Never'}</td><td><span style={{ color: days !== null && days < 0 ? '#ef4444' : days !== null && days <= 3 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>{formatDate(r.NextDue) || '—'}{days !== null && <span style={{ fontSize: '0.7rem', marginLeft: 4 }}>({days < 0 ? 'overdue' : `${days}d`})</span>}</span></td><td>{r.pointCount || 0}</td>
                        <td style={{ display: 'flex', gap: 2 }}><ActionBtn icon={Eye} tip={t('engineering.tipViewRoute', 'View route with lube points')} color="#3b82f6" onClick={() => loadDetail(r.ID)} /><ActionBtn icon={Pencil} tip={t('engineering.tipEditRoute', 'Edit route')} color="#f59e0b" onClick={() => { loadDetail(r.ID).then(() => setTimeout(() => startEdit(), 200)); }} /></td></tr>); })}
                        {routes.length === 0 && <tr><td colSpan={8} className="table-empty">{t('engineering.emptyLubeRoutes', 'No lube routes configured.')}</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
        {detail && (
            <div className="modal-overlay" onClick={() => { setDetail(null); setEditing(false); }}>
                <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 750 }}>
                    <ActionBar
                        title={<><Droplets size={20} /> {(detail.route || detail).RouteName}</>}
                        isEditing={editing}
                        onPrint={() => window.triggerTrierPrint('engineering-lube-route', detail)}
                        onEdit={startEdit}
                        onSave={async () => { 
                            const id = (detail.route || detail).ID; 
                            await API(`/lube/routes/${id}`, { method: 'PUT', body: JSON.stringify(editForm) }); 
                            if (editForm.points) {
                                await Promise.all(editForm.points.map(p => 
                                    API(`/lube/routes/${id}/points/${p.ID}`, { method: 'PUT', body: JSON.stringify(p) })
                                ));
                            }
                            setEditing(false); loadDetail(id); fetchItems(); 
                        }}
                        onCancel={() => setEditing(false)}
                        onClose={() => { setDetail(null); setEditing(false); }}
                        showDelete={false}
                    />
                    <div className="scroll-area" style={{ flex: 1, padding: 20, overflowY: 'auto', maxHeight: '65vh' }}>
                        {!editing ? (<>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                            <InfoRow label={t('engineering.frequencyLabel', 'Frequency')} value={(detail.route || detail).Frequency} />
                            <InfoRow label={t('engineering.assignedToLabel', 'Assigned To')} value={(detail.route || detail).AssignedTo} />
                            <InfoRow label={t('engineering.lastCompletedLabel', 'Last Completed')} value={formatDate((detail.route || detail).LastCompleted)} />
                            <InfoRow label={t('engineering.nextDueLabel', 'Next Due')} value={formatDate((detail.route || detail).NextDue)} />
                        </div>
                        {(detail.route || detail).Description && <div className="panel-box" style={{ padding: 14, marginBottom: 15 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('engineering.sectionDescription', 'DESCRIPTION')}</strong><p style={{ margin: '6px 0 0' }}>{(detail.route || detail).Description}</p></div>}
                        {(detail.points || []).length > 0 && <div><h3>{t('engineering.lubricationPoints', 'Lubrication Points')} ({detail.points.length})</h3>
                            <table className="data-table"><thead><tr><th>{t('engineering.point')}</th><th>{t('engineering.lubricantType')}</th><th>{t('engineering.qty')}</th><th>{t('engineering.unit')}</th><th>{t('engineering.method')}</th><th>{t('engineering.asset')}</th></tr></thead>
                                <tbody>{detail.points.map(p => <tr key={p.ID}><td style={{ fontWeight: 600 }}>{p.PointDescription}</td><td>{p.LubeType || '—'}</td><td>{p.Quantity || '—'}</td><td>{p.Unit || '—'}</td><td>{p.Method || '—'}</td><td>{p.AssetID || '—'}</td></tr>)}</tbody></table></div>}
                        </>) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelRouteName', 'Route Name')}</label><input value={editForm.RouteName} onChange={e => ef('RouteName', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelFrequency', 'Frequency')}</label><select value={editForm.Frequency} onChange={e => ef('Frequency', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }}><option>{t('engineering.freqDaily', 'Daily')}</option><option>{t('engineering.freqWeekly', 'Weekly')}</option><option>{t('engineering.freqBiWeekly', 'Bi-Weekly')}</option><option>{t('engineering.freqMonthly', 'Monthly')}</option><option>{t('engineering.freqQuarterly', 'Quarterly')}</option></select></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelAssignedTo', 'Assigned To')}</label><input value={editForm.AssignedTo} onChange={e => ef('AssignedTo', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelDescription', 'Description')}</label><textarea value={editForm.Description} onChange={e => ef('Description', e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem', resize: 'vertical' }} /></div>
                                {editForm.points && editForm.points.length > 0 && <div style={{ gridColumn: 'span 2', marginTop: 15 }}>
                                    <h3 style={{ margin: '0 0 10px', fontSize: '1rem' }}>{t('engineering.lubricationPoints', 'Lubrication Points')} ({editForm.points.length})</h3>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="data-table" style={{ fontSize: '0.8rem', minWidth: 600 }}>
                                            <thead><tr><th>{t('engineering.point')}</th><th>{t('engineering.lubricantType')}</th><th>{t('engineering.qty')}</th><th>{t('engineering.unit')}</th><th>{t('engineering.method')}</th><th>{t('engineering.asset')}</th></tr></thead>
                                            <tbody>
                                                {editForm.points.map((p, idx) => (
                                                    <tr key={p.ID}>
                                                        <td><input value={p.PointDescription || ''} onChange={e => { const np = [...editForm.points]; np[idx].PointDescription = e.target.value; ef('points', np); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                        <td><input value={p.LubeType || ''} onChange={e => { const np = [...editForm.points]; np[idx].LubeType = e.target.value; ef('points', np); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                        <td><input type="number" value={p.Quantity || ''} onChange={e => { const np = [...editForm.points]; np[idx].Quantity = e.target.value; ef('points', np); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                        <td><input value={p.Unit || ''} onChange={e => { const np = [...editForm.points]; np[idx].Unit = e.target.value; ef('points', np); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                        <td><input value={p.Method || ''} onChange={e => { const np = [...editForm.points]; np[idx].Method = e.target.value; ef('points', np); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                        <td><input value={p.AssetID || ''} onChange={e => { const np = [...editForm.points]; np[idx].AssetID = e.target.value; ef('points', np); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}

// ═══════════════════════════════════════════════════════════════════════════════
// OIL ANALYSIS (with detail modal + Print)
// ═══════════════════════════════════════════════════════════════════════════════
function OilTab({ search }) {
    const { t } = useTranslation();
    const [samples, setSamples] = useState([]); const [loading, setLoading] = useState(true);
    const [alerts, setAlerts] = useState([]);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const ef = (k, v) => setEditForm(p => ({ ...p, [k]: v }));

    const fetchItems = useCallback(() => {
        setLoading(true);
        API('/oil-analysis').then(r => r.json()).then(d => { setSamples(d); setLoading(false); }).catch(() => setLoading(false));
        API('/oil-analysis/alerts/active').then(r => r.json()).then(d => setAlerts(d)).catch(e => console.warn('[EngineeringView] fetch error:', e));
    }, []);
    useEffect(() => { fetchItems(); }, [fetchItems]);

    const loadDetail = async (id) => { const r = await API(`/oil-analysis/${id}`); if (r.ok) { setDetail(await r.json()); setEditing(false); } };
    const startEdit = () => { const s = detail.sample || detail; setEditForm({ SamplePoint: s.SamplePoint || '', OilType: s.OilType || '', OilAgeHours: s.OilAgeHours || '', Notes: s.Notes || '', OverallStatus: s.OverallStatus || 'Normal', results: detail.results ? JSON.parse(JSON.stringify(detail.results)) : [] }); setEditing(true); };

    if (loading) return <LoadingSpinner />;
    return (<>
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
            {alerts.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '12px 18px', marginBottom: 15, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertTriangle size={20} color="#ef4444" />
                    <span style={{ color: '#fca5a5', fontWeight: 600 }}>{alerts.length} {alerts.length > 1 ? t('engineering.alerts', 'alerts') : t('engineering.alert', 'alert')} — {t('engineering.oilAlertMessage', 'abnormal oil analysis results require attention')}</span>
                </div>
            )}
            <h2 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 10 }}><FlaskConical size={24} color="#ec4899" /> {t('engineering.oilAnalysisSamples', 'Oil Analysis Samples')} ({samples.length})</h2>
            <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>ID</th><th>{t('engineering.asset')}</th><th>{t('engineering.sampleDate')}</th><th>{t('engineering.samplePoint')}</th><th>{t('engineering.oilType')}</th><th>{t('engineering.oilAgeHrs')}</th><th>{t('engineering.lab')}</th><th>{t('engineering.sampledBy')}</th><th>{t('engineering.actions')}</th></tr></thead>
                    <tbody>{samples.map(s => (<tr key={s.ID}><td style={{ fontWeight: 600 }}>OA-{s.ID}</td><td>{s.AssetID || '—'}</td><td>{formatDate(s.SampleDate)}</td><td>{s.SamplePoint || '—'}</td><td>{s.OilType || '—'}</td><td>{s.OilAgeHours || '—'}</td><td>{s.LabName || '—'}</td><td>{s.SampledBy || '—'}</td>
                        <td style={{ display: 'flex', gap: 2 }}><ActionBtn icon={Eye} tip={t('engineering.tipViewSample', 'View sample results')} color="#3b82f6" onClick={() => loadDetail(s.ID)} /><ActionBtn icon={Pencil} tip={t('engineering.tipEditSample', 'Edit sample')} color="#f59e0b" onClick={() => { loadDetail(s.ID).then(() => setTimeout(() => startEdit(), 200)); }} /></td></tr>))}
                        {samples.length === 0 && <tr><td colSpan={9} className="table-empty">{t('engineering.emptyOilSamples', 'No oil samples logged yet.')}</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
        {detail && (
            <div className="modal-overlay" onClick={() => { setDetail(null); setEditing(false); }}>
                <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 750 }}>
                    <ActionBar
                        title={<><FlaskConical size={20} /> OA-{(detail.sample || detail).ID}: {(detail.sample || detail).SamplePoint}</>}
                        isEditing={editing}
                        onPrint={() => window.triggerTrierPrint('engineering-oil-analysis', detail)}
                        onEdit={startEdit}
                        onSave={async () => { 
                            const id = (detail.sample || detail).ID; 
                            await API(`/oil-analysis/${id}`, { method: 'PUT', body: JSON.stringify(editForm) }); 
                            if (editForm.results) {
                                await Promise.all(editForm.results.map(r => 
                                    API(`/oil-analysis/${id}/results/${r.ID}`, { method: 'PUT', body: JSON.stringify(r) })
                                ));
                            }
                            setEditing(false); loadDetail(id); fetchItems(); 
                        }}
                        onCancel={() => setEditing(false)}
                        onClose={() => { setDetail(null); setEditing(false); }}
                        showDelete={false}
                    />
                    <div className="scroll-area" style={{ flex: 1, padding: 20, overflowY: 'auto', maxHeight: '65vh' }}>
                        {!editing ? (<>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                            <InfoRow label={t('engineering.assetLabel', 'Asset')} value={(detail.sample || detail).AssetID} />
                            <InfoRow label={t('engineering.sampleDateLabel', 'Sample Date')} value={formatDate((detail.sample || detail).SampleDate)} />
                            <InfoRow label={t('engineering.samplePointLabel', 'Sample Point')} value={(detail.sample || detail).SamplePoint} />
                            <InfoRow label={t('engineering.oilTypeLabel', 'Oil Type')} value={(detail.sample || detail).OilType} />
                            <InfoRow label={t('engineering.oilAgeHrsLabel', 'Oil Age (hrs)')} value={(detail.sample || detail).OilAgeHours} />
                            <InfoRow label={t('engineering.labLabel', 'Lab')} value={(detail.sample || detail).LabName} />
                            <InfoRow label={t('engineering.sampledByLabel', 'Sampled By')} value={(detail.sample || detail).SampledBy} />
                            <InfoRow label={t('engineering.overallStatusLabel', 'Overall Status')} value={(detail.sample || detail).OverallStatus} />
                        </div>
                        {(detail.sample || detail).Notes && <div className="panel-box" style={{ padding: 14, marginBottom: 15 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('engineering.sectionNotes', 'NOTES')}</strong><p style={{ margin: '6px 0 0' }}>{(detail.sample || detail).Notes}</p></div>}
                        {detail.results?.length > 0 && <div><h3>{t('engineering.testResults', 'Test Results')} ({detail.results.length})</h3>
                            <table className="data-table"><thead><tr><th>{t('engineering.test')}</th><th>{t('engineering.value')}</th><th>{t('engineering.unit')}</th><th>{t('engineering.limit')}</th><th>{t('engineering.status')}</th></tr></thead>
                                <tbody>{detail.results.map(r => <tr key={r.ID}><td style={{ fontWeight: 600 }}>{r.Parameter}</td><td>{r.Value}</td><td>{r.Unit || '—'}</td><td>{r.LimitValue ? `≤ ${r.LimitValue}` : '—'}</td><td><Badge color={r.Status === 'Normal' ? '#10b981' : r.Status === 'Caution' ? '#f59e0b' : '#ef4444'}>{t('status.' + (r.Status || 'Normal').replace(/\s+/g, '').toLowerCase(), r.Status || 'Normal')}</Badge></td></tr>)}</tbody></table></div>}
                        </>) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelSamplePoint', 'Sample Point')}</label><input value={editForm.SamplePoint} onChange={e => ef('SamplePoint', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelOilType', 'Oil Type')}</label><input value={editForm.OilType} onChange={e => ef('OilType', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelOilAgeHrs', 'Oil Age (hrs)')}</label><input type="number" value={editForm.OilAgeHours} onChange={e => ef('OilAgeHours', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelOverallStatus', 'Overall Status')}</label><select value={editForm.OverallStatus} onChange={e => ef('OverallStatus', e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white' }}><option>{t('engineering.statusNormal', 'Normal')}</option><option>{t('engineering.statusCaution', 'Caution')}</option><option>{t('engineering.statusCritical', 'Critical')}</option></select></div>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('engineering.labelNotes', 'Notes')}</label><textarea value={editForm.Notes} onChange={e => ef('Notes', e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem', resize: 'vertical' }} /></div>
                                {editForm.results && editForm.results.length > 0 && <div style={{ gridColumn: 'span 2', marginTop: 15 }}>
                                    <h3 style={{ margin: '0 0 10px', fontSize: '1rem' }}>{t('engineering.testResults', 'Test Results')} ({editForm.results.length})</h3>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="data-table" style={{ fontSize: '0.8rem', minWidth: 600 }}>
                                            <thead><tr><th>{t('engineering.test')}</th><th>{t('engineering.value')}</th><th>{t('engineering.unit')}</th><th>{t('engineering.limit')}</th><th>{t('engineering.status')}</th></tr></thead>
                                            <tbody>
                                                {editForm.results.map((r, idx) => (
                                                    <tr key={r.ID}>
                                                        <td style={{ fontWeight: 600 }}>{r.Parameter}</td>
                                                        <td><input type="number" step="0.01" value={r.Value || ''} onChange={e => { const nr = [...editForm.results]; nr[idx].Value = e.target.value; ef('results', nr); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                        <td><input value={r.Unit || ''} onChange={e => { const nr = [...editForm.results]; nr[idx].Unit = e.target.value; ef('results', nr); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                        <td><input type="number" step="0.01" value={r.LimitValue || ''} onChange={e => { const nr = [...editForm.results]; nr[idx].LimitValue = e.target.value; ef('results', nr); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }} /></td>
                                                        <td><select value={r.Status || 'Normal'} onChange={e => { const nr = [...editForm.results]; nr[idx].Status = e.target.value; ef('results', nr); }} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 6px' }}><option>Normal</option><option>Caution</option><option>Critical</option></select></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}
