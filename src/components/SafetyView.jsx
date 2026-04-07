// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */

/**
 * Trier OS — Safety Management View (SafetyView.jsx)
 * ====================================================
 * Consolidated safety command center with five functional tabs, each
 * targeting a different safety discipline. The active tab is driven by
 * the `tab` prop passed from App.jsx (defaults to 'permits').
 *
 * TABS:
 *   PermitsTab      — Digital Permit-to-Work: hot work, confined space, LOTO,
 *                     excavation, electrical, working at heights, and more.
 *                     Full lifecycle: create → sign → active → close/void.
 *
 *   IncidentsTab    — OSHA-aligned incident reporting: near misses, first aid,
 *                     recordable injuries, lost time, property damage.
 *                     Includes corrective action tracking and expense logging.
 *
 *   CalibrationTab  — Instrument calibration records: gauge calibration, as-found
 *                     vs as-left readings, pass/fail status, and next-cal scheduling.
 *
 *   MusteringTab    — UWB-powered emergency mustering board: real-time personnel
 *                     positions, exclusion zone breach alerts, check-in button,
 *                     and ACK workflow. Polls /api/uwb/* every 10 seconds.
 *
 *   CVTab           — Computer Vision PPE check: upload a photo of the work area,
 *                     AI analyzes it for PPE compliance (hard hat, vest, gloves).
 *
 * API HELPERS:
 *   API_P(path)  — /api/safety-permits  (permits and checklists)
 *   API_I(path)  — /api/safety-incidents (incident reporting)
 *   API_C(path)  — /api/calibration     (instrument calibration)
 *   API_UWB(path) — /api/uwb            (UWB positioning and alerts)
 *
 * SHARED COMPONENTS:
 *   Badge({ color, children })  — Colored status pill
 *   FF({ label, type, ... })    — Uniform form field (text, select, date, textarea)
 *
 * STATE FLOW: Each tab is a self-contained function component that fetches
 * its own data on mount. No Redux or global state — props pass plantId down
 * from SafetyView → each tab component.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ShieldAlert, Plus, Search, Eye, X, ClipboardCheck, AlertTriangle, Settings2, Pencil, Image, Camera, Trash2 } from 'lucide-react';
import SearchBar from './SearchBar';
import ActionBar from './ActionBar';
import { statusClass, formatDate } from '../utils/formatDate';
import { TakeTourButton } from './ContextualTour';
import { useTranslation } from '../i18n/index.jsx';

const API_P = (path, o = {}) => fetch(`/api/safety-permits${path}`, { ...o, headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}`, 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1', ...o.headers } });
const API_I = (path, o = {}) => fetch(`/api/safety-incidents${path}`, { ...o, headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}`, 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1', ...o.headers } });
const API_C = (path, o = {}) => fetch(`/api/calibration${path}`, { ...o, headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}`, 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1', ...o.headers } });

const Badge = ({ color, children }) => (
    <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:12, fontSize:'0.72rem', fontWeight:600, background:`${color}22`, color, border:`1px solid ${color}44` }}>{children}</span>
);
const FF = ({ t, label, type='text', value, onChange, options, required }) => {
    return (
        <div>
            <label style={{ fontSize:'0.8rem', color:'var(--text-muted)', display:'block', marginBottom:4 }}>{label}{required && ' *'}</label>
            {options ? (
                <select value={value||''} onChange={e=>onChange(e.target.value)} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, padding:'8px 12px', color:'white', fontSize:'0.85rem' }}>
                    <option value="">— {t ? t('common.select', 'Select') : 'Select'} —</option>
                    {options.map((o, i)=><option key={i} value={o}>{o}</option>)}
                </select>
            ) : type === 'textarea' ? (
                <textarea value={value||''} onChange={e=>onChange(e.target.value)} rows={3} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, padding:'8px 12px', color:'white', fontSize:'0.85rem', resize:'vertical' }}/>
            ) : (
                <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, padding:'8px 12px', color:'white', fontSize:'0.85rem' }}/>
            )}
        </div>
    );
};
const Modal = ({ title, icon:Icon, color, onClose, width=600, children }) => (
    <div className="modal-overlay" onClick={onClose}>
        <div className="glass-card" onClick={e=>e.stopPropagation()} style={{ width, maxHeight:'85vh', overflow:'auto', padding:30 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <h2 style={{ margin:0, color, display:'flex', alignItems:'center', gap:10 }}>{Icon&&<Icon size={20}/>} {title}</h2>
                <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer' }} title="Close"><X size={24}/></button>
            </div>
            {children}
        </div>
    </div>
);
const ModalActions = ({ t, onCancel, onSave, saveLabel }) => {
    return (
        <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20, paddingTop:15, borderTop:'1px solid var(--glass-border)' }}>
            <button className="btn-nav" onClick={onCancel} title={t ? t('common.cancel', 'Cancel') : 'Cancel'}>{t ? t('common.cancel', 'Cancel') : 'Cancel'}</button>
            <button className="btn-save" onClick={onSave} title={saveLabel || (t ? t('common.save', 'Save') : 'Save')}>{saveLabel || (t ? t('common.save', 'Save') : 'Save')}</button>
        </div>
    );
};
const InfoRow = ({ label, value }) => (
    <div className="panel-box" style={{ padding:'10px 14px' }}>
        <strong style={{ fontSize:'0.72rem', color:'var(--text-muted)', textTransform:'uppercase' }}>{label}</strong>
        <div style={{ fontSize:'0.95rem', marginTop:3 }}>{value || '—'}</div>
    </div>
);
const ActionBtn = ({ icon:Icon, tip, color='var(--text-muted)', onClick }) => (
    <button title={tip} onClick={e=>{e.stopPropagation();onClick&&onClick();}} style={{ background:'none', border:'none', cursor:'pointer', color, padding:'4px 6px', borderRadius:6, transition:'all 0.15s' }}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'}
        onMouseLeave={e=>e.currentTarget.style.background='none'}>
        <Icon size={17}/>
    </button>
);
const StatCard = ({ label, value, color, isActive, onClick }) => {
    const isClickable = typeof onClick === 'function';
    const isDimmed = isClickable && isActive === false && isActive !== undefined;
    return (
    <div onClick={onClick} style={{ background:isActive?`${color}33`:`${color}11`, border:`1px solid ${color}${isActive?'88':'33'}`, borderRadius:12, padding:'14px 18px', textAlign:'center', cursor:isClickable?'pointer':'default', transition:'all 0.2s', opacity:isDimmed?0.6:1 }}>
        <div style={{ fontSize:'1.6rem', fontWeight:800, color }}>{value}</div>
        <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:4 }}>{label}</div>
    </div>
);
};

export default function SafetyView({ plantId }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('permits');
    const [search, setSearch] = useState('');
    const tabs = [
        { id:'permits', label:t('safety.tab.permits', 'Permits'), icon:ClipboardCheck, tip:t('safety.tip.permits', 'Hot work and confined space safety permits') },
        { id:'incidents', label:t('safety.tab.incidents', 'Incidents'), icon:AlertTriangle, tip:t('safety.tip.incidents', 'Safety incidents, near misses, and OSHA tracking') },
        { id:'calibration', label:t('safety.tab.calibration', 'Calibration'), icon:Settings2, tip:t('safety.tip.calibration', 'Instrument calibration schedules and compliance') },
    ];
    return (
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'var(--spacing-base)' }}>
            <div className="glass-card no-print" style={{ padding:'15px 25px', display:'flex', gap:20, alignItems:'center', flexShrink:0 }}>
                <h2 style={{ fontSize:'1.4rem', margin:0, color:'#ef4444', display:'flex', alignItems:'center', gap:10 }}><ShieldAlert size={24}/> {t('safety.safetyCompliance', 'Safety & Compliance')}</h2>
                <div style={{ width:2, height:30, background:'var(--glass-border)' }}/>
                <div className="nav-pills no-print" style={{ display:'flex', gap:6, flexWrap:'nowrap' }}>
                    {tabs.map(tabItem=>(
                        <button key={tabItem.id} onClick={()=>setTab(tabItem.id)} title={tabItem.tip} className={`btn-nav ${tab===tabItem.id?'active':''}`}
                            style={{ whiteSpace:'nowrap', height:36, display:'flex', alignItems:'center', gap:4, padding:'0 14px', fontSize:'0.82rem' }}>
                            <tabItem.icon size={15}/>{tabItem.label}
                        </button>
                    ))}
                </div>
                <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
                    <SearchBar value={search} onChange={setSearch} placeholder={t('safety.searchSafetyPlaceholder', 'Search safety...')} width={220} title={t('safety.searchByPermitIncTip', 'Search by permit number, type, location, or incident title')} />
                    <TakeTourButton tourId="safety" nestedTab={tab} />
                </div>
            </div>
            <div style={{ flex:1, display:'flex' }}>
                {tab === 'permits' && <PermitsTab search={search} plantId={plantId}/>}
                {tab === 'incidents' && <IncidentsTab search={search} plantId={plantId}/>}
                {tab === 'calibration' && <CalibrationTab search={search}/>}
            </div>
        </div>
    );
}

/* ═══════════════════════════════ PERMITS ═══════════════════════════════ */
function PermitsTab({ search, plantId }) {
    const { t } = useTranslation();
    const [permits, setPermits] = useState([]);
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [form, setForm] = useState({ permitType:'HOT_WORK', customTypeName:'' });
    const f = (k,v)=>setForm(p=>({...p,[k]:v}));
    const ef = (k,v)=>setEditForm(p=>({...p,[k]:v}));

    const [filterCategory, setFilterCategory] = useState(null);
    const [contractors, setContractors] = useState([]);

    useEffect(()=>{
        fetch('/api/contractors', { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}`, 'x-plant-id': localStorage.getItem('selectedPlantId') || '' } })
            .then(r=>r.json()).then(d=>setContractors(Array.isArray(d)?d:[])).catch(()=>{});
    },[]);

    const fetchPermits = useCallback(()=>{
        setLoading(true);
        API_P('/permits').then(r=>r.ok?r.json():{}).then(d=>{
            setPermits(Array.isArray(d.permits)?d.permits:Array.isArray(d)?d:[]);
            if(d.stats) setStats(d.stats);
            setLoading(false);
        }).catch(()=>setLoading(false));
    },[]);
    useEffect(()=>{fetchPermits();},[fetchPermits]);

    const filtered = useMemo(()=>{
        let list = permits;
        if(filterCategory === 'ACTIVE') list = list.filter(x => (x.Status||'').toUpperCase() === 'ACTIVE');
        else if(filterCategory === 'HOT_WORK') list = list.filter(x => (x.PermitType||'').replace(/ /g,'_') === 'HOT_WORK' && (x.Status||'').toUpperCase() === 'ACTIVE');
        else if(filterCategory === 'CONFINED_SPACE') list = list.filter(x => (x.PermitType||'').replace(/ /g,'_') === 'CONFINED_SPACE' && (x.Status||'').toUpperCase() === 'ACTIVE');
        else if(filterCategory === 'EXPIRED') list = list.filter(x => (x.Status||'').toUpperCase() === 'EXPIRED');

        if(!search) return list;
        const s=search.toLowerCase();
        return list.filter(p=>[p.PermitNumber,p.PermitType,p.Location,p.IssuedBy].some(x=>(x||'').toLowerCase().includes(s)));
    },[permits,search,filterCategory]);

    const statToggle = (cat) => setFilterCategory(p => p === cat ? null : cat);

    const loadDetail = async id=>{const r=await API_P(`/permits/${id}`);if(r.ok){const d=await r.json();setDetail(d);return d;}};
    const handleAdd = async()=>{
        if(!form.location||!form.description) return window.trierToast?.warn('Location and Description required');
        const actualType = form.permitType === 'CUSTOM' && form.customTypeName ? form.customTypeName.toUpperCase().replace(/\s+/g,'_') : form.permitType;
        const body = { ...form, permitType: actualType, plantId: plantId||'Demo_Plant_1', issuedBy: localStorage.getItem('currentUser')||'Admin' };
        const r=await API_P('/permits',{method:'POST',body:JSON.stringify(body)});
        if(r.ok){setShowAdd(false);setForm({permitType:'HOT_WORK',customTypeName:''});fetchPermits();}else{const d=await r.json();window.trierToast?.error(d.error);}
    };
    const startEdit = (p) => { setEditForm({ Location:p.permit?.Location||p.Location||'', Description:p.permit?.Description||p.Description||'', Notes:p.permit?.Notes||p.Notes||'', HotWorkType:p.permit?.HotWorkType||'', FireWatchAssignedTo:p.permit?.FireWatchAssignedTo||'', Attendant:p.permit?.Attendant||'', EntrySupervisor:p.permit?.EntrySupervisor||'' }); setEditing(true); };
    const handleSave = async () => { const id=detail.permit?.ID||detail.ID; const r=await API_P(`/permits/${id}`,{method:'PUT',body:JSON.stringify(editForm)});if(r.ok){setEditing(false);loadDetail(id);fetchPermits();}else{const d=await r.json();window.trierToast?.error(d.error);} };

    if(loading) return <div className="glass-card" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>{t('safety.loadingPermits', 'Loading permits...')}</div>;
    return (<>
        <div className="glass-card" style={{flex:1,display:'flex',flexDirection:'column',padding:20}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:15,marginBottom:20}}>
                <StatCard label={t('safety.activePermits', 'Active Permits')} value={stats.active||0} color="#10b981" isActive={filterCategory==='ACTIVE'} onClick={()=>statToggle('ACTIVE')}/>
                <StatCard label={t('safety.hotWork', 'Hot Work')} value={stats.hotWork||0} color="#f59e0b" isActive={filterCategory==='HOT_WORK'} onClick={()=>statToggle('HOT_WORK')}/>
                <StatCard label={t('safety.confinedSpace', 'Confined Space')} value={stats.confinedSpace||0} color="#3b82f6" isActive={filterCategory==='CONFINED_SPACE'} onClick={()=>statToggle('CONFINED_SPACE')}/>
                <StatCard label={t('safety.expired', 'Expired')} value={stats.expired||0} color="#ef4444" isActive={filterCategory==='EXPIRED'} onClick={()=>statToggle('EXPIRED')}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:15}}>
                <div style={{display:'flex',gap:15,alignItems:'center'}}>
                    <h3 style={{margin:0}}>{t('safety.safetyPermits', 'Safety Permits')} ({filtered.length})</h3>
                    {filterCategory && <button className="btn-nav" onClick={()=>setFilterCategory(null)} style={{fontSize:'0.75rem',height:24,padding:'0 10px'}}>{t('common.clearFilter','Clear Filter')}</button>}
                </div>
                <button title={t('safety.issueNewPermitTip', 'Issue a new Hot Work or Confined Space permit')} className="btn-save" onClick={()=>setShowAdd(true)} style={{height:36,display:'flex',alignItems:'center',gap:8}}><Plus size={16}/> {t('safety.issuePermit', 'Issue Permit')}</button>
            </div>
            <div className="table-container" style={{flex:1,overflowY:'auto'}}>
                <table className="data-table"><thead><tr><th>{t('safety.permitNum', 'Permit #')}</th><th>{t('common.type', 'Type')}</th><th>{t('common.location', 'Location')}</th><th>Contractor</th><th>{t('safety.issuedBy', 'Issued By')}</th><th>{t('safety.issued', 'Issued')}</th><th>{t('safety.expires', 'Expires')}</th><th>{t('safety.checklist', 'Checklist')}</th><th>{t('common.status', 'Status')}</th><th>{t('common.actions', 'Actions')}</th></tr></thead>
                <tbody>{filtered.map(p=>(
                    <tr key={p.ID}>
                        <td style={{fontWeight:600,color:'#ef4444'}}>{p.PermitNumber}</td>
                        <td><Badge color={{'HOT_WORK':'#f59e0b','CONFINED_SPACE':'#3b82f6','EXCAVATION':'#a16207','ELECTRICAL':'#eab308','WORKING_AT_HEIGHTS':'#8b5cf6','LINE_BREAKING':'#ec4899','CRANE_RIGGING':'#06b6d4','CHEMICAL_HANDLING':'#84cc16','RADIATION':'#f97316','ROOF_ACCESS':'#14b8a6','ENERGY_ISOLATION':'#dc2626','CUSTOM':'#6366f1'}[p.PermitType]||'#94a3b8'}>{p.PermitType?.replace(/_/g,' ')}</Badge></td>
                        <td>{p.Location||'—'}</td>
                        <td style={{fontSize:'0.8rem',color:'#06b6d4',fontWeight:600}}>{p.ContractorName||'—'}</td>
                        <td>{p.IssuedBy||'—'}</td>
                        <td title={p.IssuedAt}>{formatDate(p.IssuedAt)}</td>
                        <td title={p.ExpiresAt}>{formatDate(p.ExpiresAt)||'—'}</td>
                        <td title={`${p.checklistDone||0} of ${p.checklistTotal||0} items checked`}>{p.checklistDone||0}/{p.checklistTotal||0}</td>
                        <td><span className={statusClass(p.Status)}>{t('status.' + (p.Status || '').replace(/\s+/g, '').toLowerCase(), p.Status)}</span></td>
                        <td style={{display:'flex',gap:2}}><ActionBtn icon={Eye} tip={t('safety.viewPermitTip', 'View full permit with checklist, signatures, and gas readings')} color="#3b82f6" onClick={()=>{loadDetail(p.ID);setEditing(false);}}/><ActionBtn icon={Pencil} tip={t('safety.editPermitTip', 'Edit permit')} color="#f59e0b" onClick={()=>{loadDetail(p.ID).then(d=>{if(d)startEdit(d);});}}/></td>
                    </tr>
                ))}{filtered.length===0&&<tr><td colSpan={10} className="table-empty">{t('safety.noPermitsFound', 'No permits found.')}</td></tr>}</tbody></table>
            </div>
        </div>

        {showAdd && (
            <Modal title={t('safety.issueSafetyPermit', 'Issue Safety Permit')} icon={ClipboardCheck} color="#ef4444" onClose={()=>setShowAdd(false)} width={550}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                    <FF t={t} label={t('safety.permitType', 'Permit Type')} value={form.permitType} onChange={v=>f('permitType',v)} options={[
                        'HOT_WORK','CONFINED_SPACE','EXCAVATION','ELECTRICAL',
                        'WORKING_AT_HEIGHTS','LINE_BREAKING','CRANE_RIGGING',
                        'CHEMICAL_HANDLING','RADIATION','ROOF_ACCESS',
                        'ENERGY_ISOLATION','CUSTOM'
                    ]} required/>
                    <FF t={t} label={t('safety.expiresInHours', 'Expires In (Hours)')} type="number" value={form.expiresInHours} onChange={v=>f('expiresInHours',v)}/>
                    {form.permitType==='CUSTOM'&&<div style={{gridColumn:'span 2'}}><FF t={t} label={t('safety.customPermitTypeName', 'Custom Permit Type Name')} value={form.customTypeName} onChange={v=>f('customTypeName',v)} required/></div>}
                    <div style={{gridColumn:'span 2'}}><FF t={t} label={t('common.location', 'Location')} value={form.location} onChange={v=>f('location',v)} required/></div>
                    <div style={{gridColumn:'span 2'}}><FF t={t} label={t('common.description', 'Description')} type="textarea" value={form.description} onChange={v=>f('description',v)} required/></div>
                    {form.permitType==='HOT_WORK'&&<>
                        <FF t={t} label={t('safety.hotWorkType', 'Hot Work Type')} value={form.hotWorkType} onChange={v=>f('hotWorkType',v)} options={['Welding (Arc)','Welding (MIG/TIG)','Torch Cutting','Brazing/Soldering','Grinding/Cutting Disc','Heat Gun','Other']}/>
                        <FF t={t} label={t('safety.fireWatchAssignedTo', 'Fire Watch Assigned To')} value={form.fireWatchAssignedTo} onChange={v=>f('fireWatchAssignedTo',v)}/>
                    </>}
                    {form.permitType==='CONFINED_SPACE'&&<>
                        <FF t={t} label={t('safety.attendant', 'Attendant')} value={form.attendant} onChange={v=>f('attendant',v)}/>
                        <FF t={t} label={t('safety.entrySupervisor', 'Entry Supervisor')} value={form.entrySupervisor} onChange={v=>f('entrySupervisor',v)}/>
                        <FF t={t} label={t('safety.ventilationType', 'Ventilation Type')} value={form.ventilationType} onChange={v=>f('ventilationType',v)} options={['Natural','Mechanical (Blower)','Mechanical (Exhaust)','Continuous Forced Air','None Required']}/>
                        <FF t={t} label={t('safety.communication', 'Communication')} value={form.communicationMethod} onChange={v=>f('communicationMethod',v)} options={['Voice','Radio','Signal Line']}/>
                    </>}
                    {contractors.length > 0 && (
                        <div style={{gridColumn:'span 2'}}>
                            <label style={{fontSize:'0.8rem',color:'var(--text-muted)',display:'block',marginBottom:4}}>Contractor (optional)</label>
                            <select value={form.contractorId||''} onChange={e=>{const c=contractors.find(x=>String(x.ID)===e.target.value);f('contractorId',e.target.value);f('contractorName',c?.CompanyName||'');}} style={{width:'100%',background:'rgba(255,255,255,0.06)',border:'1px solid var(--glass-border)',borderRadius:8,padding:'8px 12px',color:'white',fontSize:'0.85rem'}}>
                                <option value="">— No contractor —</option>
                                {contractors.map(c=><option key={c.ID} value={c.ID}>{c.CompanyName}{c.TradeSpecialty?` (${c.TradeSpecialty})`:''}</option>)}
                            </select>
                        </div>
                    )}
                    <div style={{gridColumn:'span 2'}}><FF t={t} label={t('common.notes', 'Notes')} type="textarea" value={form.notes} onChange={v=>f('notes',v)}/></div>
                </div>
                <ModalActions t={t} onCancel={()=>setShowAdd(false)} onSave={handleAdd} saveLabel={t('safety.issuePermit', 'Issue Permit')}/>
            </Modal>
        )}

        {detail && (
            <div className="modal-overlay" onClick={()=>{setDetail(null);setEditing(false);}}>
                <div className="glass-card modal-content-standard" onClick={e=>e.stopPropagation()} style={{maxWidth:750}}>
                    <ActionBar
                        title={`Permit ${detail.permit?.PermitNumber}`}
                        icon={<ClipboardCheck size={20} />}
                        isEditing={editing}
                        onEdit={() => startEdit(detail)}
                        onSave={handleSave}
                        onPrint={() => window.triggerTrierPrint('safety-permit-detail', detail)}
                        onClose={() => { setDetail(null); setEditing(false); }}
                        onCancel={() => setEditing(false)}
                        showDelete={false}
                    />
                    <div className="scroll-area" style={{flex:1,padding:20,overflowY:'auto',maxHeight:'65vh'}}>
                        {!editing ? (<>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:20}}>
                                <InfoRow label={t('common.type', 'Type')} value={detail.permit?.PermitType?.replace('_',' ')}/><InfoRow label={t('common.status', 'Status')} value={detail.permit?.Status}/><InfoRow label={t('common.location', 'Location')} value={detail.permit?.Location}/>
                                <InfoRow label={t('safety.issuedBy', 'Issued By')} value={detail.permit?.IssuedBy}/><InfoRow label={t('safety.issued', 'Issued')} value={formatDate(detail.permit?.IssuedAt)}/><InfoRow label={t('safety.expires', 'Expires')} value={formatDate(detail.permit?.ExpiresAt)}/>
                                {detail.permit?.ContractorName&&<InfoRow label="Contractor" value={<span style={{color:'#06b6d4',fontWeight:700}}>🏗️ {detail.permit.ContractorName}</span>}/>}
                                {detail.permit?.HotWorkType&&<InfoRow label={t('safety.workType', 'Work Type')} value={detail.permit.HotWorkType}/>}
                                {detail.permit?.FireWatchAssignedTo&&<InfoRow label={t('safety.fireWatch', 'Fire Watch')} value={detail.permit.FireWatchAssignedTo}/>}
                                {detail.permit?.Attendant&&<InfoRow label={t('safety.attendant', 'Attendant')} value={detail.permit.Attendant}/>}
                            </div>
                            {detail.permit?.Description&&<div className="panel-box" style={{padding:14,marginBottom:15}}><strong style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{t('common.description', 'DESCRIPTION')}</strong><p style={{margin:'6px 0 0'}}>{detail.permit.Description}</p></div>}
                            {detail.checklist?.length>0&&<div style={{marginBottom:15}}><h3>{t('safety.checklist', 'Checklist')} ({detail.checklist.filter(c=>c.Checked).length}/{detail.checklist.length})</h3>
                            <table className="data-table"><thead><tr><th>{t('common.category', 'Category')}</th><th>{t('common.item', 'Item')}</th><th>{t('common.status', 'Status')}</th><th>{t('common.by', 'By')}</th></tr></thead>
                            <tbody>{detail.checklist.map(c=><tr key={c.ID} style={{background:c.Checked?'rgba(16,185,129,0.05)':'transparent'}}>
                                <td style={{fontWeight:600,fontSize:'0.8rem'}}>{c.Category}</td><td>{c.CheckItem}</td>
                                <td>{c.Checked?<span className={statusClass('Completed')}>✓ Done</span>:<span className={statusClass('Hold')}>Pending</span>}</td>
                                <td style={{fontSize:'0.8rem'}}>{c.CheckedBy||'—'}</td>
                            </tr>)}</tbody></table></div>}
                            {detail.signatures?.length>0&&<div style={{marginBottom:15}}><h3>{t('safety.signatures', 'Signatures')} ({detail.signatures.length})</h3>
                            <table className="data-table"><thead><tr><th>{t('common.type', 'Type')}</th><th>{t('safety.signedBy', 'Signed By')}</th><th>{t('common.role', 'Role')}</th><th>{t('common.time', 'Time')}</th></tr></thead>
                            <tbody>{detail.signatures.map(s=><tr key={s.ID}><td><Badge color="#6366f1">{s.SignatureType}</Badge></td><td style={{fontWeight:600}}>{s.SignedBy}</td><td>{s.Role}</td><td>{formatDate(s.SignedAt)}</td></tr>)}</tbody></table></div>}
                            {detail.gasLog?.length>0&&<div style={{marginBottom:15}}><h3>{t('safety.gasReadings', 'Gas Readings')} ({detail.gasLog.length})</h3>
                            <table className="data-table"><thead><tr><th>{t('common.time', 'Time')}</th><th>O₂ %</th><th>LEL %</th><th>CO ppm</th><th>H₂S ppm</th><th>{t('common.by', 'By')}</th></tr></thead>
                            <tbody>{detail.gasLog.map(g=><tr key={g.ID}><td>{g.ReadingTime?.split('T')[1]?.substring(0,5)||g.ReadingTime}</td>
                                <td style={{color:(g.O2Level<19.5||g.O2Level>23.5)?'#ef4444':'#10b981',fontWeight:600}}>{g.O2Level??'—'}</td>
                                <td style={{color:g.LELLevel>=10?'#ef4444':'#10b981',fontWeight:600}}>{g.LELLevel??'—'}</td>
                                <td style={{color:g.COLevel>=35?'#ef4444':'#10b981',fontWeight:600}}>{g.COLevel??'—'}</td>
                                <td style={{color:g.H2SLevel>=10?'#ef4444':'#10b981',fontWeight:600}}>{g.H2SLevel??'—'}</td>
                                <td>{g.ReadBy}</td></tr>)}</tbody></table></div>}
                            {detail.auditLog?.length>0&&<div><h3>{t('common.auditTrail', 'Audit Trail')} ({detail.auditLog.length})</h3>
                            <div style={{maxHeight:200,overflowY:'auto'}}>{detail.auditLog.map(a=><div key={a.ID} style={{padding:'8px 12px',borderBottom:'1px solid var(--glass-border)',fontSize:'0.8rem'}}>
                                <Badge color="#6366f1">{a.Action}</Badge> <span style={{color:'var(--text-muted)',marginLeft:8}}>{formatDate(a.PerformedAt)}</span> — {a.PerformedBy}: {a.Details}
                            </div>)}</div></div>}
                        </>) : (
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                                <div style={{gridColumn:'span 2'}}><FF t={t} label={t('common.location', 'Location')} value={editForm.Location} onChange={v=>ef('Location',v)}/></div>
                                <div style={{gridColumn:'span 2'}}><FF t={t} label={t('common.description', 'Description')} type="textarea" value={editForm.Description} onChange={v=>ef('Description',v)}/></div>
                                <FF t={t} label={t('safety.hotWorkType', 'Hot Work Type')} value={editForm.HotWorkType} onChange={v=>ef('HotWorkType',v)} options={['Welding (Arc)','Welding (MIG/TIG)','Torch Cutting','Brazing/Soldering','Grinding/Cutting Disc','Heat Gun','Other']}/>
                                <FF t={t} label={t('safety.fireWatchAssignedTo', 'Fire Watch Assigned To')} value={editForm.FireWatchAssignedTo} onChange={v=>ef('FireWatchAssignedTo',v)}/>
                                <FF t={t} label={t('safety.attendant', 'Attendant')} value={editForm.Attendant} onChange={v=>ef('Attendant',v)}/>
                                <FF t={t} label={t('safety.entrySupervisor', 'Entry Supervisor')} value={editForm.EntrySupervisor} onChange={v=>ef('EntrySupervisor',v)}/>
                                <div style={{gridColumn:'span 2'}}><FF t={t} label={t('common.notes', 'Notes')} type="textarea" value={editForm.Notes} onChange={v=>ef('Notes',v)}/></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}

/* ═══════════════════════════════ INCIDENTS ═══════════════════════════════ */
function IncidentsTab({ search, plantId }) {
    const { t } = useTranslation();
    const [incidents, setIncidents] = useState([]);
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [detail, setDetail] = useState(null);
    const [expenseForm, setExpenseForm] = useState({ providerType: 'Hospital', providerName: '', billNumber: '', amount: '', dateReceived: '', datePaid: '' });
    const fileRef = useRef(null);
    const cameraRef = useRef(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [form, setForm] = useState({ severity:'Medium', incidentType:'Near Miss', jobClassification: '' });
    const f = (k,v)=>setForm(p=>({...p,[k]:v}));
    const ef = (k,v)=>setEditForm(p=>({...p,[k]:v}));

    const [filterCategory, setFilterCategory] = useState(null);
    const [payScales, setPayScales] = useState([]);

    useEffect(() => {
        fetch('/api/analytics/pay-scales', { headers: { 'x-plant-id': plantId || 'Demo_Plant_1' } })
            .then(res => res.json())
            .then(data => setPayScales(data || []))
            .catch(e => console.warn(e));
    }, [plantId]);

    const handleFormCalc = (k, v) => {
        f(k, v);
        let newDays = k === 'lostDays' ? Number(v) || 0 : Number(form.lostDays) || 0;
        let newClass = k === 'jobClassification' ? v : form.jobClassification;
        if (newDays >= 0 && newClass) {
            const scale = payScales.find(s => s.IsSalary && s.EmployeeRef ? `${s.Classification} - ${s.EmployeeRef}` === newClass : s.Classification === newClass);
            if (scale) f('indirectCost', Math.round(newDays * 8 * (scale.HourlyRate * 0.5)));
        }
    };

    const handleEditFormCalc = (k, v) => {
        ef(k, v);
        let newDays = k === 'LostDays' ? Number(v) || 0 : Number(editForm.LostDays) || 0;
        let newClass = k === 'JobClassification' ? v : editForm.JobClassification;
        if (newDays >= 0 && newClass) {
            const scale = payScales.find(s => s.IsSalary && s.EmployeeRef ? `${s.Classification} - ${s.EmployeeRef}` === newClass : s.Classification === newClass);
            if (scale) ef('IndirectCost', Math.round(newDays * 8 * (scale.HourlyRate * 0.5)));
        }
    };

    const fetchIncidents = useCallback(()=>{
        setLoading(true);
        API_I('').then(r=>r.ok?r.json():{}).then(d=>{
            if(d.incidents){setIncidents(Array.isArray(d.incidents)?d.incidents:[]);if(d.stats)setStats(d.stats);}
            else setIncidents(Array.isArray(d)?d:[]);
            setLoading(false);
        }).catch(()=>setLoading(false));
        API_I('/dashboard/stats').then(r=>r.ok?r.json():{}).then(setStats).catch(e => console.warn('[SafetyView] fetch error:', e));
    },[]);
    useEffect(()=>{fetchIncidents();},[fetchIncidents]);

    const sevColor = s =>({'Critical':'#ef4444','High':'#f59e0b','Medium':'#3b82f6','Low':'#10b981'}[s]||'#64748b');
    const filtered = useMemo(()=>{
        let list = incidents;
        if(filterCategory === 'OSHA') list = list.filter(x => x.OSHARecordable);
        else if(filterCategory === 'LOST_TIME') list = list.filter(x => x.LostDays > 0 || String(x.IncidentType).includes('Lost Time'));
        else if(filterCategory === 'NEAR_MISS') list = list.filter(x => String(x.IncidentType).toLowerCase().includes('near miss'));

        if(!search) return list;
        const s=search.toLowerCase();
        return list.filter(i=>[i.Title,i.IncidentType,i.Location,i.ReportedBy].some(x=>(x||'').toLowerCase().includes(s)));
    },[incidents,search,filterCategory]);

    const statToggle = (cat) => setFilterCategory(p => p === cat ? null : cat);

    const loadDetail = async id=>{const r=await API_I(`/${id}`);if(r.ok){const d=await r.json();setDetail(d);return d;}};
    const handleAdd = async()=>{
        if(!form.title||!form.location) return window.trierToast?.warn('Title and Location required');
        const body = { ...form, plantId: plantId||'Demo_Plant_1', reportedBy: (() => { try { return JSON.parse(localStorage.getItem('currentUser') || '{}'); } catch { return {}; } })().fullName||'Admin' };
        const r=await API_I('',{method:'POST',body:JSON.stringify(body)});
        if(r.ok){setShowAdd(false);setForm({severity:'Medium',incidentType:'Near Miss'});fetchIncidents();}else{const d=await r.json();window.trierToast?.error(d.error);}
    };
    const startEdit = (d) => { const i=d.incident||d; setEditForm({ Title:i.Title||'', IncidentType:i.IncidentType||'', Severity:i.Severity||'Medium', Location:i.Location||'', Status:i.Status||'Open', Description:i.Description||'', RootCause:i.RootCause||'', CorrectiveAction:i.CorrectiveAction||'', OSHARecordable:i.OSHARecordable||0, LostDays:i.LostDays||0, IndirectCost:i.IndirectCost||0, JobClassification:i.JobClassification||'' }); setEditing(true); };
    const handleSave = async () => { const id=detail.incident?.ID||detail.ID; const r=await API_I(`/${id}`,{method:'PUT',body:JSON.stringify(editForm)});if(r.ok){setEditing(false);loadDetail(id);fetchIncidents();}else{const d=await r.json();window.trierToast?.error(d.error);} };
    const handleAddExpense = async () => {
        const finalProvider = expenseForm.providerType === 'Other' ? expenseForm.providerName : expenseForm.providerType;
        if (!finalProvider || !expenseForm.amount) return window.trierToast?.warn('Provider Name and Amount are required');
        const r = await API_I(`/${detail.incident?.ID || detail.ID}/expenses`, { method: 'POST', body: JSON.stringify({providerName: finalProvider, billNumber: expenseForm.billNumber, amount: expenseForm.amount, dateReceived: expenseForm.dateReceived, datePaid: expenseForm.datePaid, expenseDate: new Date().toISOString().split('T')[0]}) });
        if (r.ok) { setExpenseForm({ providerType: 'Hospital', providerName: '', billNumber: '', amount: '', dateReceived: '', datePaid: '' }); loadDetail(detail.incident?.ID || detail.ID); fetchIncidents(); }
    };
    const handleDelExpense = async (eid) => {
        const r = await API_I(`/expenses/${eid}`, { method: 'DELETE' });
        if (r.ok) { loadDetail(detail.incident?.ID || detail.ID); fetchIncidents(); }
    };

    if(loading) return <div className="glass-card" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>{t('safety.loadingIncidents', 'Loading incidents...')}</div>;
    return (<>
        <div className="glass-card" style={{flex:1,display:'flex',flexDirection:'column',padding:20}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:15,marginBottom:20}}>
                <StatCard label={t('safety.totalIncidents', 'Total Incidents')} value={stats.total||incidents.length||0} color="#94a3b8" isActive={filterCategory===null} onClick={()=>setFilterCategory(null)}/>
                <StatCard label={t('safety.oshaRecordable', 'OSHA Recordable')} value={stats.recordable||0} color="#ef4444" isActive={filterCategory==='OSHA'} onClick={()=>statToggle('OSHA')}/>
                <StatCard label={t('safety.lostTimeDays', 'Lost Time Days')} value={stats.lostTimeDays||0} color="#f59e0b" isActive={filterCategory==='LOST_TIME'} onClick={()=>statToggle('LOST_TIME')}/>
                <StatCard label={t('safety.nearMisses', 'Near Misses')} value={stats.nearMisses||0} color="#3b82f6" isActive={filterCategory==='NEAR_MISS'} onClick={()=>statToggle('NEAR_MISS')}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:15}}>
                <div style={{display:'flex',gap:15,alignItems:'center'}}>
                    <h3 style={{margin:0}}>{t('safety.safetyIncidents', 'Safety Incidents')} ({filtered.length})</h3>
                    {filterCategory && <button className="btn-nav" onClick={()=>setFilterCategory(null)} style={{fontSize:'0.75rem',height:24,padding:'0 10px'}}>{t('common.clearFilter','Clear Filter')}</button>}
                </div>
                <button title={t('safety.reportNewIncidentTip', 'Report a new safety incident or near miss')} className="btn-save" onClick={()=>setShowAdd(true)} style={{height:36,display:'flex',alignItems:'center',gap:8}}><Plus size={16}/> {t('safety.reportIncident', 'Report Incident')}</button>
            </div>
            <div className="table-container" style={{flex:1,overflowY:'auto'}}>
                <table className="data-table"><thead><tr><th>{t('common.date', 'Date')}</th><th>{t('common.title', 'Title')}</th><th>{t('common.type', 'Type')}</th><th>{t('safety.severity', 'Severity')}</th><th>{t('common.location', 'Location')}</th><th>{t('safety.osha', 'OSHA?')}</th><th>{t('common.status', 'Status')}</th><th>{t('common.actions', 'Actions')}</th></tr></thead>
                <tbody>{filtered.map(i=>(
                    <tr key={i.ID}>
                        <td>{formatDate(i.IncidentDate)}</td><td style={{fontWeight:600}}>{i.Title}</td>
                        <td><Badge color="#6366f1">{i.IncidentType}</Badge></td>
                        <td title={`Severity level: ${i.Severity}`}><Badge color={sevColor(i.Severity)}>{i.Severity}</Badge></td>
                        <td>{i.Location||'—'}</td>
                        <td title={i.OSHARecordable?t('safety.oshaRecordableTip', 'This is an OSHA recordable incident'):t('safety.notOshaRecordableTip', 'Not OSHA recordable')}>{i.OSHARecordable?<Badge color="#ef4444">{t('common.yes', 'Yes')}</Badge>:<span style={{color:'var(--text-muted)'}}>{t('common.no', 'No')}</span>}</td>
                        <td><span className={statusClass(i.Status)}>{t('status.' + (i.Status || '').replace(/\s+/g, '').toLowerCase(), i.Status)}</span></td>
                        <td style={{display:'flex',gap:2}}><ActionBtn icon={Eye} tip={t('safety.viewIncidentTip', 'View full incident report, investigation, and corrective actions')} color="#3b82f6" onClick={()=>{loadDetail(i.ID);setEditing(false);}}/><ActionBtn icon={Pencil} tip={t('safety.editIncidentTip', 'Edit incident')} color="#f59e0b" onClick={()=>{loadDetail(i.ID).then(d=>{if(d)startEdit(d);});}}/></td>
                    </tr>
                ))}{filtered.length===0&&<tr><td colSpan={8} className="table-empty">{t('safety.noIncidentsRecorded', 'No incidents recorded.')}</td></tr>}</tbody></table>
            </div>
        </div>

        {showAdd && (
            <Modal title={t('safety.reportSafetyIncident', 'Report Safety Incident')} icon={AlertTriangle} color="#f59e0b" onClose={()=>setShowAdd(false)} width={550}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                    <div style={{gridColumn:'span 2'}}><FF t={t} label={t('common.title', 'Title')} value={form.title} onChange={v=>f('title',v)} required/></div>
                    <FF t={t} label={t('safety.incidentType', 'Incident Type')} value={form.incidentType} onChange={v=>f('incidentType',v)} options={['Near Miss','First Aid','Recordable','Lost Time','Property Damage','Environmental','Other']} required/>
                    <FF t={t} label={t('safety.severity', 'Severity')} value={form.severity} onChange={v=>f('severity',v)} options={['Low','Medium','High','Critical']} required/>
                    <FF t={t} label={t('common.location', 'Location')} value={form.location} onChange={v=>f('location',v)} required/>
                    <FF t={t} label={t('safety.incidentDate', 'Incident Date')} type="date" value={form.incidentDate} onChange={v=>f('incidentDate',v)}/>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input type="checkbox" id="osha_rec_new" checked={form.oshaRecordable?true:false} onChange={e=>f('oshaRecordable',e.target.checked?1:0)} style={{width: 18, height: 18, cursor:'pointer'}}/>
                        <label htmlFor="osha_rec_new" style={{fontSize: '0.85rem', cursor:'pointer'}}>{t('safety.isOshaRecordable', 'Is this an OSHA Recordable incident?')}</label>
                    </div>
                    <div><FF t={t} label="Classification" value={form.jobClassification} onChange={v=>handleFormCalc('jobClassification',v)} options={['', ...payScales.map(s => s.IsSalary && s.EmployeeRef ? `${s.Classification} - ${s.EmployeeRef}` : s.Classification)]}/></div>
                    <div><FF t={t} label={t('safety.lostTimeDays', 'Lost Time Days')} type="number" value={form.lostDays} onChange={v=>handleFormCalc('lostDays',v||0)}/></div>
                    <div><FF t={t} label={t('safety.indirectCost', 'Indirect Cost/Overtime ($)')} type="number" value={form.indirectCost} onChange={v=>f('indirectCost',v||0)} placeholder="e.g. 6912"/></div>
                    <div style={{gridColumn:'span 2', display: 'flex', gap: 10, alignItems: 'flex-end'}}>
                        <input type="file" ref={fileRef} style={{ display: 'none' }} onChange={e => { if(e.target.files.length) window.trierToast?.success(`Attached ${e.target.files[0].name}`); }} />
                        <input type="file" accept="image/*" capture="environment" ref={cameraRef} style={{ display: 'none' }} onChange={e => { if(e.target.files.length) window.trierToast?.success(`Attached ${e.target.files[0].name}`); }} />
                        <button className="btn-nav" onClick={() => fileRef.current?.click()} style={{display: 'flex', alignItems: 'center', gap: 6, height: 38}}><Image size={16} /> Attach Image/File</button>
                        <button className="btn-nav" onClick={() => cameraRef.current?.click()} style={{display: 'flex', alignItems: 'center', gap: 6, height: 38}}><Camera size={16} /> Take Photo</button>
                    </div>
                    <div style={{gridColumn:'span 2'}}><FF t={t} label={t('common.description', 'Description')} type="textarea" value={form.description} onChange={v=>f('description',v)}/></div>
                    <div style={{gridColumn:'span 2'}}><FF t={t} label={t('safety.immediateActionsTaken', 'Immediate Actions Taken')} type="textarea" value={form.immediateActions} onChange={v=>f('immediateActions',v)}/></div>
                </div>
                <ModalActions t={t} onCancel={()=>setShowAdd(false)} onSave={handleAdd} saveLabel={t('safety.submitReport', 'Submit Report')}/>
            </Modal>
        )}

        {detail && (
            <div className="modal-overlay" onClick={()=>{setDetail(null);setEditing(false);}}>
                <div className="glass-card modal-content-standard" onClick={e=>e.stopPropagation()} style={{width:'90%',maxWidth:950}}>
                    <ActionBar
                        title={detail.incident?.Title || detail.Title}
                        icon={<AlertTriangle size={20} />}
                        isEditing={editing}
                        onEdit={() => startEdit(detail)}
                        onSave={handleSave}
                        onPrint={() => window.triggerTrierPrint('safety-incident-detail', detail)}
                        onClose={() => { setDetail(null); setEditing(false); }}
                        onCancel={() => setEditing(false)}
                        showDelete={false}
                    />
                    <div style={{padding:20}}>
                        {!editing ? (<>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:20}}>
                                <InfoRow label={t('common.date', 'Date')} value={formatDate(detail.incident?.IncidentDate||detail.IncidentDate)}/><InfoRow label={t('common.type', 'Type')} value={detail.incident?.IncidentType||detail.IncidentType}/><InfoRow label={t('safety.severity', 'Severity')} value={detail.incident?.Severity||detail.Severity}/>
                                <InfoRow label={t('common.location', 'Location')} value={detail.incident?.Location||detail.Location}/><InfoRow label={t('safety.reportedBy', 'Reported By')} value={detail.incident?.ReportedBy||detail.ReportedBy}/><InfoRow label={t('common.status', 'Status')} value={detail.incident?.Status||detail.Status}/>
                                <InfoRow label={t('safety.oshaRecordable', 'OSHA Recordable')} value={(detail.incident?.OSHARecordable||detail.OSHARecordable)?t('common.yes','Yes'):t('common.no','No')}/>
                                <InfoRow label={t('safety.lostTimeDays', 'Lost Time Days')} value={(detail.incident?.LostDays||detail.LostDays)||'0'}/>
                                <InfoRow label="Classification" value={detail.incident?.JobClassification||detail.JobClassification||'—'}/>
                                <InfoRow label={t('safety.medicalBills', 'Injury / Damage Cost')} value={'$'+((detail.incident?.DirectCost||detail.DirectCost)||'0')}/>
                            </div>
                            {(detail.incident?.Attachments||detail.Attachments)&&<div className="panel-box" style={{padding:14,marginBottom:15}}><strong style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{t('safety.scenePhotos', 'SCENE PHOTOS & ATTACHMENTS')}</strong><p style={{margin:'6px 0 0',wordBreak:'break-all'}}>{detail.incident?.Attachments||detail.Attachments}</p></div>}
                            {(detail.incident?.Description||detail.Description)&&<div className="panel-box" style={{padding:14,marginBottom:15}}><strong style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{t('common.description', 'DESCRIPTION')}</strong><p style={{margin:'6px 0 0'}}>{detail.incident?.Description||detail.Description}</p></div>}
                            {(detail.incident?.RootCause||detail.RootCause)&&<div className="panel-box" style={{padding:14,marginBottom:15}}><strong style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{t('safety.rootCause', 'ROOT CAUSE')}</strong><p style={{margin:'6px 0 0'}}>{detail.incident?.RootCause||detail.RootCause}</p></div>}
                            {(detail.incident?.CorrectiveActions||detail.CorrectiveActions)&&<div className="panel-box" style={{padding:14,marginBottom:15}}><strong style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{t('safety.correctiveActions', 'CORRECTIVE ACTIONS')}</strong><p style={{margin:'6px 0 0'}}>{detail.incident?.CorrectiveActions||detail.CorrectiveActions}</p></div>}
                        </>) : (
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                                <div style={{gridColumn:'span 2'}}><FF t={t} label={t('common.title', 'Title')} value={editForm.Title} onChange={v=>ef('Title',v)}/></div>
                                <FF t={t} label={t('common.type', 'Type')} value={editForm.IncidentType} onChange={v=>ef('IncidentType',v)} options={['Near Miss','First Aid','Recordable','Lost Time','Property Damage','Environmental','Other']}/>
                                <FF t={t} label={t('safety.severity', 'Severity')} value={editForm.Severity} onChange={v=>ef('Severity',v)} options={['Low','Medium','High','Critical']}/>
                                <FF t={t} label={t('common.location', 'Location')} value={editForm.Location} onChange={v=>ef('Location',v)}/>
                                <FF t={t} label={t('common.status', 'Status')} value={editForm.Status} onChange={v=>ef('Status',v)} options={['Open','Investigating','Closed']}/>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <input type="checkbox" id="osha_rec_edit" checked={editForm.OSHARecordable?true:false} onChange={e=>ef('OSHARecordable',e.target.checked?1:0)} style={{width: 18, height: 18, cursor:'pointer'}}/>
                                    <label htmlFor="osha_rec_edit" style={{fontSize: '0.85rem', cursor:'pointer'}}>{t('safety.isOshaRecordable', 'Is this an OSHA Recordable incident?')}</label>
                                </div>
                                <div><FF t={t} label="Classification" value={editForm.JobClassification} onChange={v=>handleEditFormCalc('JobClassification',v)} options={['', ...payScales.map(s => s.IsSalary && s.EmployeeRef ? `${s.Classification} - ${s.EmployeeRef}` : s.Classification)]}/></div>
                                <div><FF t={t} label={t('safety.lostTimeDays', 'Lost Time Days')} type="number" value={editForm.LostDays} onChange={v=>handleEditFormCalc('LostDays',v||0)}/></div>
                                <div><FF t={t} label={t('safety.indirectCost', 'Indirect Cost/Overtime ($)')} type="number" value={editForm.IndirectCost} onChange={v=>ef('IndirectCost',v||0)} placeholder="e.g. 6912"/></div>
                                <div style={{gridColumn:'span 2', display: 'flex', gap: 10, alignItems: 'flex-end'}}>
                                    <button className="btn-nav" onClick={() => fileRef.current?.click()} style={{display: 'flex', alignItems: 'center', gap: 6, height: 38}}><Image size={16} /> Attach Image/File</button>
                                    <button className="btn-nav" onClick={() => cameraRef.current?.click()} style={{display: 'flex', alignItems: 'center', gap: 6, height: 38}}><Camera size={16} /> Take Photo</button>
                                </div>
                                <div style={{gridColumn:'span 2'}}><FF t={t} label={t('common.description', 'Description')} type="textarea" value={editForm.Description} onChange={v=>ef('Description',v)}/></div>
                                <div style={{gridColumn:'span 2'}}><FF t={t} label={t('safety.rootCause', 'Root Cause')} type="textarea" value={editForm.RootCause} onChange={v=>ef('RootCause',v)}/></div>
                                <div style={{gridColumn:'span 2'}}><FF t={t} label={t('safety.correctiveActions', 'Corrective Actions')} type="textarea" value={editForm.CorrectiveAction} onChange={v=>ef('CorrectiveAction',v)}/></div>
                            </div>
                        )}
                        
                        <div className="panel-box" style={{padding:14, marginTop: 15}}>
                            <strong style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{t('safety.expenseItems','EXPENSE LINE ITEMS')}</strong>
                            {(detail.expenses && detail.expenses.length > 0) ? (
                                <table style={{width: '100%', marginTop: 8, fontSize: '0.85rem', borderCollapse: 'collapse'}}>
                                    <thead><tr style={{borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#64748b'}}>
                                        <th style={{textAlign: 'left', padding: '4px 0'}}>{t('common.date','Date')}</th>
                                        <th style={{textAlign: 'left', padding: '4px 0'}}>{t('safety.provider','Hospital / Doctor / Provider')}</th>
                                        <th style={{textAlign: 'left', padding: '4px 0'}}>{t('safety.billRef','Bill/Ref #')}</th>
                                        <th style={{textAlign: 'left', padding: '4px 0'}}>Date Received</th>
                                        <th style={{textAlign: 'left', padding: '4px 0'}}>Date Paid</th>
                                        <th style={{textAlign: 'right', padding: '4px 0'}}>{t('common.amount','Amount')}</th>
                                        <th style={{width: 30}}></th>
                                    </tr></thead>
                                    <tbody>
                                        {detail.expenses.map(e => (
                                            <tr key={e.ID} style={{borderBottom: '1px solid rgba(255,255,255,0.02)'}}>
                                                <td style={{padding: '6px 0'}}>{formatDate(e.ExpenseDate)}</td>
                                                <td style={{padding: '6px 0'}}>{e.ProviderName}</td>
                                                <td style={{padding: '6px 0'}}>{e.BillNumber || '—'}</td>
                                                <td style={{padding: '6px 0'}}>{e.DateReceived ? formatDate(e.DateReceived) : '—'}</td>
                                                <td style={{padding: '6px 0'}}>{e.DatePaid ? formatDate(e.DatePaid) : '—'}</td>
                                                <td style={{padding: '6px 0', textAlign: 'right'}}>${(e.Amount || 0)}</td>
                                                <td style={{padding: '6px 0', textAlign: 'right'}}><ActionBtn icon={Trash2} color="#ef4444" onClick={() => handleDelExpense(e.ID)} tip="Delete expense" /></td>
                                            </tr>
                                        ))}
                                        <tr>
                                            <td colSpan={5} style={{padding: '8px 0', textAlign: 'right', fontWeight: 600}}>{t('common.total','Total:')}</td>
                                            <td colSpan={2} style={{padding: '8px 0', textAlign: 'left', paddingLeft: 12, fontWeight: 700}}>${detail.expenses.reduce((s,x)=>s+(x.Amount||0),0).toLocaleString()}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            ) : <div style={{fontSize: '0.8rem', color: '#64748b', margin: '8px 0'}}>{t('safety.noExpenses','No expenses recorded.')}</div>}
                            
                            <div style={{display: 'flex', gap: 10, marginTop: 12, alignItems: 'flex-end', background: 'rgba(0,0,0,0.1)', padding: 12, borderRadius: 8}}>
                                <div style={{width: 130}}><FF t={t} label={t('safety.providerType','Provider Type')} value={expenseForm.providerType} onChange={v=>setExpenseForm(p=>({ ...p, providerType: v }))} options={['Hospital', 'Doctor', 'Rehab', 'Orthopedics', 'Other']}/></div>
                                <div style={{flex: 1}}><FF t={t} label={expenseForm.providerType === 'Other' ? t('safety.specifyOther','Specify Other') : t('safety.providerNameOpt','Provider Name (Opt)')} value={expenseForm.providerName} onChange={v=>setExpenseForm(p=>({ ...p, providerName: v }))}/></div>
                                <div style={{width: 110}}><FF t={t} label="Bill/Ref #" value={expenseForm.billNumber} onChange={v=>setExpenseForm(p=>({ ...p, billNumber: v }))}/></div>
                                <div style={{width: 140}}><FF t={t} label="Date Received" type="date" value={expenseForm.dateReceived} onChange={v=>setExpenseForm(p=>({ ...p, dateReceived: v }))}/></div>
                                <div style={{width: 140}}><FF t={t} label="Date Paid" type="date" value={expenseForm.datePaid} onChange={v=>setExpenseForm(p=>({ ...p, datePaid: v }))}/></div>
                                <div style={{width: 110}}><FF t={t} label="Amount ($)" type="number" value={expenseForm.amount} onChange={v=>setExpenseForm(p=>({ ...p, amount: v }))}/></div>
                                <button className="btn-save" onClick={handleAddExpense} style={{height: 38, padding: '0 12px'}}><Plus size={16} /> {t('common.add','Add')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </>);
}

/* ═══════════════════════════════ CALIBRATION ═══════════════════════════════ */
function CalibrationTab({ search }) {
    const { t } = useTranslation();
    const [instruments, setInstruments] = useState([]);
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [form, setForm] = useState({ calFrequencyDays:365 });
    const f = (k,v)=>setForm(p=>({...p,[k]:v}));
    const ef = (k,v)=>setEditForm(p=>({...p,[k]:v}));

    const [filterCategory, setFilterCategory] = useState(null);

    const fetchInstruments = useCallback(()=>{
        setLoading(true);
        API_C('/instruments').then(r=>r.ok?r.json():{}).then(d=>{
            if(d.instruments){setInstruments(Array.isArray(d.instruments)?d.instruments:[]);if(d.stats)setStats(d.stats);}
            else setInstruments(Array.isArray(d)?d:[]);
            setLoading(false);
        }).catch(()=>setLoading(false));
        API_C('/stats').then(r=>r.ok?r.json():{}).then(setStats).catch(e => console.warn('[SafetyView] fetch error:', e));
    },[]);
    useEffect(()=>{fetchInstruments();},[fetchInstruments]);

    const daysUntil = d=>{if(!d)return null;return Math.floor((new Date(d)-new Date())/86400000);};
    const dueColor = d=>{if(d===null)return'#64748b';if(d<0)return'#ef4444';if(d<=30)return'#f59e0b';return'#10b981';};
    const filtered = useMemo(()=>{
        let list = instruments;
        if(filterCategory === 'DUE_SOON') list = list.filter(i => { const d = daysUntil(i.NextCalibrationDue); return d !== null && d >= 0 && d <= 30; });
        else if(filterCategory === 'OVERDUE') list = list.filter(i => { const d = daysUntil(i.NextCalibrationDue); return d !== null && d < 0; });
        else if(filterCategory === 'OUT_TOL') list = list.filter(i => (i.Status||'').toUpperCase() === 'OUT_OF_TOLERANCE' || (i.Status||'').toUpperCase() === 'FAILED');

        if(!search) return list;
        const s=search.toLowerCase();
        return list.filter(i=>[i.InstrumentID,i.Description,i.Location].some(x=>(x||'').toLowerCase().includes(s)));
    },[instruments,search,filterCategory]);

    const statToggle = (cat) => setFilterCategory(p => p === cat ? null : cat);

    const loadDetail = async id=>{const r=await API_C(`/instruments/${id}`);if(r.ok){const d=await r.json();setDetail(d);return d;}};
    const handleAdd = async()=>{
        if(!form.instrumentId||!form.description) return window.trierToast?.warn('Instrument ID and Description required');
        const r=await API_C('/instruments',{method:'POST',body:JSON.stringify(form)});
        if(r.ok){setShowAdd(false);setForm({calFrequencyDays:365});fetchInstruments();}else{const d=await r.json();window.trierToast?.error(d.error);}
    };
    const startEdit = (d) => { const i=d.instrument||d; setEditForm({ InstrumentID:i.InstrumentID||'', Description:i.Description||'', InstrumentType:i.InstrumentType||'', Location:i.Location||'', Manufacturer:i.Manufacturer||'', Model:i.Model||'', SerialNumber:i.SerialNumber||'', Tolerance:i.Tolerance||'', CalFrequencyDays:i.CalFrequencyDays||365 }); setEditing(true); };
    const handleSave = async () => { const id=detail.instrument?.ID||detail.ID; const r=await API_C(`/instruments/${id}`,{method:'PUT',body:JSON.stringify(editForm)});if(r.ok){setEditing(false);loadDetail(id);fetchInstruments();}else{const d=await r.json();window.trierToast?.error(d.error);} };

    if(loading) return <div className="glass-card" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>{t('safety.loadingInstruments', 'Loading instruments...')}</div>;
    return (<>
        <div className="glass-card" style={{flex:1,display:'flex',flexDirection:'column',padding:20}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:15,marginBottom:20}}>
                <StatCard label={t('safety.totalInstruments', 'Total Instruments')} value={stats.totalInstruments||instruments.length||0} color="#3b82f6" isActive={filterCategory===null} onClick={()=>setFilterCategory(null)}/>
                <StatCard label={t('safety.dueSoon30d', 'Due Soon (30d)')} value={stats.dueSoon||0} color="#f59e0b" isActive={filterCategory==='DUE_SOON'} onClick={()=>statToggle('DUE_SOON')}/>
                <StatCard label={t('safety.overdue', 'Overdue')} value={stats.overdue||0} color="#ef4444" isActive={filterCategory==='OVERDUE'} onClick={()=>statToggle('OVERDUE')}/>
                <StatCard label={t('safety.outOfTolerance', 'Out of Tolerance')} value={stats.outOfTolerance||0} color="#ef4444" isActive={filterCategory==='OUT_TOL'} onClick={()=>statToggle('OUT_TOL')}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:15}}>
                <div style={{display:'flex',gap:15,alignItems:'center'}}>
                    <h3 style={{margin:0}}>{t('safety.calibrationInstruments', 'Calibration Instruments')} ({filtered.length})</h3>
                    {filterCategory && <button className="btn-nav" onClick={()=>setFilterCategory(null)} style={{fontSize:'0.75rem',height:24,padding:'0 10px'}}>{t('common.clearFilter','Clear Filter')}</button>}
                </div>
                <button title={t('safety.registerNewInstrumentTip', 'Register a new instrument for calibration tracking')} className="btn-save" onClick={()=>setShowAdd(true)} style={{height:36,display:'flex',alignItems:'center',gap:8}}><Plus size={16}/> {t('safety.addInstrument', 'Add Instrument')}</button>
            </div>
            <div className="table-container" style={{flex:1,overflowY:'auto'}}>
                <table className="data-table"><thead><tr><th>{t('safety.instrumentId', 'Instrument ID')}</th><th>{t('common.description', 'Description')}</th><th>{t('common.type', 'Type')}</th><th>{t('common.location', 'Location')}</th><th>{t('safety.lastCal', 'Last Cal')}</th><th>{t('safety.nextDue', 'Next Due')}</th><th>{t('common.status', 'Status')}</th><th>{t('common.actions', 'Actions')}</th></tr></thead>
                <tbody>{filtered.map(i=>{const days=daysUntil(i.NextCalibrationDue);return(
                    <tr key={i.ID}>
                        <td style={{fontWeight:600,color:'#3b82f6'}}>{i.InstrumentID}</td>
                        <td>{i.Description}</td><td>{i.InstrumentType||'—'}</td><td>{i.Location||'—'}</td>
                        <td>{formatDate(i.LastCalibrationDate)||'—'}</td>
                        <td title={days!==null?`${days<0?Math.abs(days)+' '+t('safety.daysOverdue', 'days overdue'):days+' '+t('safety.daysRemaining', 'days remaining')}`:t('safety.noDueDateSet', 'No due date set')}><span style={{color:dueColor(days),fontWeight:600}}>{formatDate(i.NextCalibrationDue)||'—'}{days!==null&&<span style={{fontSize:'0.7rem',marginLeft:6}}>({days<0?`${Math.abs(days)}d ${t('safety.overdueShort', 'overdue')}`:`${days}d`})</span>}</span></td>
                        <td><span className={statusClass(i.Status)}>{t('status.' + (i.Status || '').replace(/\s+/g, '').toLowerCase(), i.Status)}</span></td>
                        <td style={{display:'flex',gap:2}}><ActionBtn icon={Eye} tip={t('safety.viewCalibrationHistoryTip', 'View calibration history, readings, and certificates')} color="#3b82f6" onClick={()=>{loadDetail(i.ID);setEditing(false);}}/><ActionBtn icon={Pencil} tip={t('safety.editInstrumentTip', 'Edit instrument')} color="#f59e0b" onClick={()=>{loadDetail(i.ID).then(d=>{if(d)startEdit(d);});}}/></td>
                    </tr>
                );
                })}{filtered.length===0&&<tr><td colSpan={8} className="table-empty">{t('safety.noInstrumentsRegistered', 'No instruments registered.')}</td></tr>}</tbody></table>
            </div>
        </div>

        {showAdd && (
            <Modal title={t('safety.registerInstrument', 'Register Instrument')} icon={Settings2} color="#3b82f6" onClose={()=>setShowAdd(false)} width={550}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                    <FF t={t} label={t('safety.instrumentId', 'Instrument ID')} value={form.instrumentId} onChange={v=>f('instrumentId',v)} required/>
                    <FF t={t} label={t('safety.serialNumber', 'Serial Number')} value={form.serialNumber} onChange={v=>f('serialNumber',v)}/>
                    <div style={{gridColumn:'span 2'}}><FF t={t} label={t('common.description', 'Description')} value={form.description} onChange={v=>f('description',v)} required/></div>
                    <FF t={t} label={t('common.type', 'Type')} value={form.instrumentType} onChange={v=>f('instrumentType',v)} options={['Pressure Gauge','Temperature','Flow Meter','Scale/Balance','Multimeter','Torque Wrench','Micrometer','Caliper','pH Meter','Other']}/>
                    <FF t={t} label={t('common.location', 'Location')} value={form.location} onChange={v=>f('location',v)}/>
                    <FF t={t} label={t('safety.manufacturer', 'Manufacturer')} value={form.manufacturer} onChange={v=>f('manufacturer',v)}/>
                    <FF t={t} label={t('safety.model', 'Model')} value={form.model} onChange={v=>f('model',v)}/>
                    <FF t={t} label={t('safety.calFrequencyDays', 'Cal Frequency (Days)')} type="number" value={form.calFrequencyDays} onChange={v=>f('calFrequencyDays',v)}/>
                    <FF t={t} label={t('safety.tolerance', 'Tolerance')} value={form.tolerance} onChange={v=>f('tolerance',v)}/>
                </div>
                <ModalActions t={t} onCancel={()=>setShowAdd(false)} onSave={handleAdd} saveLabel={t('common.register', 'Register')}/>
            </Modal>
        )}

        {detail && (
            <div className="modal-overlay" onClick={()=>{setDetail(null);setEditing(false);}}>
                <div className="glass-card modal-content-standard" onClick={e=>e.stopPropagation()} style={{maxWidth:700}}>
                    <ActionBar
                        title={detail.instrument?.InstrumentID || detail.InstrumentID}
                        icon={<Settings2 size={20} />}
                        isEditing={editing}
                        onEdit={() => startEdit(detail)}
                        onSave={handleSave}
                        onPrint={() => window.triggerTrierPrint('safety-calibration-detail', detail)}
                        onClose={() => { setDetail(null); setEditing(false); }}
                        onCancel={() => setEditing(false)}
                        showDelete={false}
                    />
                    <div style={{padding:20}}>
                        {!editing ? (<>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:20}}>
                                <InfoRow label={t('common.description', 'Description')} value={detail.instrument?.Description||detail.Description}/><InfoRow label={t('common.type', 'Type')} value={detail.instrument?.InstrumentType||detail.InstrumentType}/><InfoRow label={t('safety.serial', 'Serial')} value={detail.instrument?.SerialNumber||detail.SerialNumber}/>
                                <InfoRow label={t('common.location', 'Location')} value={detail.instrument?.Location||detail.Location}/><InfoRow label={t('safety.lastCal', 'Last Cal')} value={formatDate(detail.instrument?.LastCalibrationDate||detail.LastCalibrationDate)}/><InfoRow label={t('safety.nextDue', 'Next Due')} value={formatDate(detail.instrument?.NextCalibrationDue||detail.NextCalibrationDue)}/>
                                <InfoRow label={t('safety.manufacturer', 'Manufacturer')} value={detail.instrument?.Manufacturer||detail.Manufacturer}/><InfoRow label={t('safety.model', 'Model')} value={detail.instrument?.Model||detail.Model}/><InfoRow label={t('safety.tolerance', 'Tolerance')} value={detail.instrument?.Tolerance||detail.Tolerance}/>
                            </div>
                            {detail.history?.length>0&&<div><h3>{t('safety.calibrationHistory', 'Calibration History')} ({detail.history.length})</h3>
                            <table className="data-table"><thead><tr><th>{t('common.date', 'Date')}</th><th>{t('safety.result', 'Result')}</th><th>{t('safety.asFound', 'As Found')}</th><th>{t('safety.asLeft', 'As Left')}</th><th>{t('common.by', 'By')}</th><th>{t('safety.certificate', 'Certificate')}</th></tr></thead>
                            <tbody>{detail.history.map(h=><tr key={h.ID}><td>{formatDate(h.CalibrationDate)}</td>
                                <td><span className={statusClass(h.Result==='Pass'?'Completed':h.Result==='Adjusted'?'Active':'Overdue')}>{h.Result}</span></td>
                                <td>{h.AsFoundReading||'—'}</td><td>{h.AsLeftReading||'—'}</td><td>{h.CalibratedBy||'—'}</td><td style={{fontSize:'0.75rem',fontFamily:'monospace'}}>{h.CertificateNumber||'—'}</td>
                            </tr>)}</tbody></table></div>}
                        </>) : (
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                                <FF t={t} label={t('safety.instrumentId', 'Instrument ID')} value={editForm.InstrumentID} onChange={v=>ef('InstrumentID',v)}/><FF t={t} label={t('safety.serialNumber', 'Serial Number')} value={editForm.SerialNumber} onChange={v=>ef('SerialNumber',v)}/>
                                <div style={{gridColumn:'span 2'}}><FF t={t} label={t('common.description', 'Description')} value={editForm.Description} onChange={v=>ef('Description',v)}/></div>
                                <FF t={t} label={t('common.type', 'Type')} value={editForm.InstrumentType} onChange={v=>ef('InstrumentType',v)} options={['Pressure Gauge','Temperature','Flow Meter','Scale/Balance','Multimeter','Torque Wrench','Micrometer','Caliper','pH Meter','Other']}/>
                                <FF t={t} label={t('common.location', 'Location')} value={editForm.Location} onChange={v=>ef('Location',v)}/>
                                <FF t={t} label={t('safety.manufacturer', 'Manufacturer')} value={editForm.Manufacturer} onChange={v=>ef('Manufacturer',v)}/><FF t={t} label={t('safety.model', 'Model')} value={editForm.Model} onChange={v=>ef('Model',v)}/>
                                <FF t={t} label={t('safety.calFrequencyDays', 'Cal Frequency (Days)')} type="number" value={editForm.CalFrequencyDays} onChange={v=>ef('CalFrequencyDays',v)}/><FF t={t} label={t('safety.tolerance', 'Tolerance')} value={editForm.Tolerance} onChange={v=>ef('Tolerance',v)}/>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}
