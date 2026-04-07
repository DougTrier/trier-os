// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Contractors Management View
 * =========================================
 * Full lifecycle contractor management: prequalification, active roster,
 * work history, certification tracking, and performance ratings.
 * Connects to /api/contractors endpoints (server/routes/contractors.js).
 *
 * TABS:
 *   Contractors    — Searchable contractor registry with prequalification status badges
 *                    Status colors: Approved (green), Pending (amber), Expired (red),
 *                    Suspended/Blacklisted (red), Conditional (blue)
 *   Work History   — Completed work orders assigned to contractors with cost totals
 *   Certifications — Insurance, safety certs, and license expiry tracking per contractor
 *   Performance    — Star ratings, on-time completion %, and deficiency history
 *
 * PREQUALIFICATION STATUS: Contractors must be 'Approved' before being assignable
 *   to work orders. 'Expired' contractors trigger a renewal alert in the notifications feed.
 *
 * PRINT: Contractor performance report via PrintEngine.
 * SEARCH: Filters across company name, trade type, and contact name.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { HardHat, Search, Plus, X, Eye, AlertTriangle, Star, FileCheck, Briefcase, BarChart3, Pencil, Printer } from 'lucide-react';
import SearchBar from './SearchBar';
import ActionBar from './ActionBar';
import LoadingSpinner from './LoadingSpinner';
import { TakeTourButton } from './ContextualTour';
import { useTranslation } from '../i18n/index.jsx';

const API = (path, o = {}) => fetch(`/api/contractors${path}`, { ...o, headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}`, 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1', ...o.headers } });
const Badge = ({ color, children }) => <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44` }}>{children}</span>;
const preqColor = (s) => ({ 'Approved': '#10b981', 'Pending': '#f59e0b', 'Conditional': '#3b82f6', 'Expired': '#ef4444', 'Suspended': '#ef4444', 'Blacklisted': '#ef4444' }[s] || '#64748b');
const FF = ({ t, label, type='text', value, onChange, options, required }) => {
    return (
        <div>
            <label style={{ fontSize:'0.8rem', color:'var(--text-muted)', display:'block', marginBottom:4 }}>{label}{required && ' *'}</label>
            {options ? (
                <select value={value||''} onChange={e=>onChange(e.target.value)} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, padding:'8px 12px', color:'white', fontSize:'0.85rem' }}>
                    <option value="">— {t ? t('common.select', 'Select') : 'Select'} —</option>
                    {options.map(o=><option key={o} value={o}>{o}</option>)}
                </select>
            ) : (
                <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, padding:'8px 12px', color:'white', fontSize:'0.85rem' }}/>
            )}
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

const Stars = ({ rating }) => {
    const full = Math.floor(rating || 0); const half = (rating || 0) % 1 >= 0.5;
    return (<span style={{ color: '#f59e0b', letterSpacing: 1 }}>{Array.from({ length: 5 }, (_, i) => i < full ? '★' : (i === full && half ? '★' : '☆')).join('')} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>({rating ? rating.toFixed(1) : '—'})</span></span>);
};

export default function ContractorsView({ plantId }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('contractors');
    const [search, setSearch] = useState('');
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)' }}>
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: '#06b6d4', display: 'flex', alignItems: 'center', gap: 10 }}><HardHat size={24} /> Contractor Management</h2>
                <div style={{ width: 2, height: 30, background: 'var(--glass-border)' }} />
                <div className="nav-pills no-print">
                    {[['contractors', 'Contractors', HardHat], ['certs', 'Cert Expiry', FileCheck], ['jobs', 'Job History', Briefcase], ['stats', 'Stats', BarChart3]].map(([id, l, I]) => (
                        <button key={id} onClick={() => setTab(id)} className={`btn-nav ${tab === id ? 'active' : ''}`} title="Tab"><I size={16} style={{ marginRight: 4 }} />{l}</button>
                    ))}
                </div>
                <SearchBar value={search} onChange={setSearch} placeholder="Search contractors..." width={220} style={{ marginLeft: 'auto' }} />
                <TakeTourButton tourId="contractors" nestedTab={tab} />
            </div>
            <div style={{ flex: 1, display: 'flex' }}>
                {tab === 'contractors' && <ContractorsTab search={search} />}
                {tab === 'certs' && <CertsTab />}
                {tab === 'jobs' && <JobsTab search={search} />}
                {tab === 'stats' && <StatsTab />}
            </div>
        </div>
    );
}

function ContractorsTab({ search }) {
    const { t } = useTranslation();
    const [contractors, setContractors] = useState([]); const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false); const [form, setForm] = useState({});
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const ef = (k,v)=>setEditForm(p=>({...p,[k]:v}));
    const [contractorPermits, setContractorPermits] = useState([]);

    const fetch_ = useCallback(() => { setLoading(true); API('').then(r => r.json()).then(d => { setContractors(d); setLoading(false); }).catch(() => setLoading(false)); }, []);
    useEffect(() => { fetch_(); }, [fetch_]);

    const filtered = useMemo(() => { if (!search) return contractors; const s = search.toLowerCase(); return contractors.filter(c => (c.CompanyName || '').toLowerCase().includes(s) || (c.TradeSpecialty || '').toLowerCase().includes(s) || (c.ContactName || '').toLowerCase().includes(s)); }, [contractors, search]);

    const handleAdd = async () => { const r = await API('', { method: 'POST', body: JSON.stringify(form) }); if (r.ok) { setShowAdd(false); setForm({}); fetch_(); } };
    const loadDetail = async (id) => {
        const r = await API(`/${id}`); const d = await r.json(); setDetail(d);
        API(`/${id}/permits`).then(r=>r.json()).then(p=>setContractorPermits(p.permits||[])).catch(()=>setContractorPermits([]));
    };
    const startEdit = (d) => { const c=d.contractor||d; setEditForm({ CompanyName:c.CompanyName||'', ContactName:c.ContactName||'', ContactEmail:c.ContactEmail||'', ContactPhone:c.ContactPhone||'', TradeSpecialty:c.TradeSpecialty||'', HourlyRate:c.HourlyRate||'', DayRate:c.DayRate||'', InsuranceExpiry:c.InsuranceExpiry?.split('T')[0]||'', LiabilityLimit:c.LiabilityLimit||'', PrequalificationStatus:c.PrequalificationStatus||'Pending' }); setEditing(true); };
    const handleSave = async () => { const id=detail.contractor?.ID||detail.ID; const r=await API(`/${id}`,{method:'PUT',body:JSON.stringify(editForm)});if(r.ok){setEditing(false);loadDetail(id);fetch_();}else{const d=await r.json();window.trierToast?.error(d.error);} };

    const daysUntil = (d) => d ? Math.floor((new Date(d) - new Date()) / 86400000) : null;
    const insColor = (days) => { if (days === null) return '#64748b'; if (days < 0) return '#ef4444'; if (days <= 30) return '#f59e0b'; return '#10b981'; };

    if (loading) return <LoadingSpinner message="Loading contractors..." />;
    return (
        <>
            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}><HardHat size={24} color="#06b6d4" /> Contractors ({filtered.length})</h2>
                    <button className="btn-save" onClick={() => setShowAdd(true)} title="Add a new contractor to the registry" style={{ height: 36, display: 'flex', alignItems: 'center', gap: 8 }}><Plus size={16} /> Add Contractor</button>
                </div>
                <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                    <table className="data-table">
                        <thead><tr><th>{t('contractors.company', 'Company')}</th><th>{t('contractors.contact', 'Contact')}</th><th>{t('contractors.trade', 'Trade')}</th><th>{t('contractors.rate', 'Rate')}</th><th>{t('contractors.insurance', 'Insurance')}</th><th>{t('contractors.rating', 'Rating')}</th><th>{t('contractors.status', 'Status')}</th><th>{t('contractors.actions', 'Actions')}</th></tr></thead>
                        <tbody>{filtered.map(c => { const insDays = daysUntil(c.InsuranceExpiry); return (
                            <tr key={c.ID}>
                                <td style={{ fontWeight: 600, color: '#06b6d4' }}>{c.CompanyName}</td>
                                <td>{c.ContactName || '—'}<div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.ContactEmail || ''}</div></td>
                                <td><Badge color="#6366f1">{c.TradeSpecialty || 'General'}</Badge></td>
                                <td>{c.HourlyRate ? `$${c.HourlyRate}/hr` : c.DayRate ? `$${c.DayRate}/day` : '—'}</td>
                                <td><span style={{ color: insColor(insDays), fontWeight: 600, fontSize: '0.8rem' }}>{c.InsuranceExpiry?.split('T')[0] || '—'}{insDays !== null && insDays < 30 && <span style={{ fontSize: '0.7rem', marginLeft: 4 }}>⚠️ {insDays < 0 ? 'EXPIRED' : `${insDays}d`}</span>}</span></td>
                                <td><Stars rating={c.OverallRating} /></td>
                                <td><Badge color={preqColor(c.PrequalificationStatus)}>{c.PrequalificationStatus}</Badge></td>
                                <td style={{display:'flex',gap:2}}><ActionBtn icon={Eye} tip="View contractor details" color="#3b82f6" onClick={()=>{loadDetail(c.ID);setEditing(false);}}/><ActionBtn icon={Pencil} tip="Edit contractor" color="#f59e0b" onClick={()=>{loadDetail(c.ID).then(()=>setTimeout(()=>setEditing(true),200));}}/></td>
                            </tr>
                        ); })}
                            {filtered.length === 0 && <tr><td colSpan={8} className="table-empty">No contractors registered.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {showAdd && (
                <div className="modal-overlay" onClick={() => setShowAdd(false)}>
                    <div className="glass-card" onClick={e => e.stopPropagation()} style={{ width: 600, padding: 30 }}>
                        <h2 style={{ margin: '0 0 20px', color: '#06b6d4' }}><Plus size={20} /> Add Contractor</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            {[['companyName', 'Company Name *'], ['contactName', 'Contact Name'], ['contactEmail', 'Email'], ['contactPhone', 'Phone'], ['tradeSpecialty', 'Trade / Specialty'], ['hourlyRate', 'Hourly Rate ($)'], ['insuranceExpiry', 'Insurance Expiry (Date)'], ['liabilityLimit', 'Liability Limit ($)']].map(([k, l]) => (
                                <div key={k}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{l}</label><input type={k.includes('Date') || k.includes('Expiry') ? 'date' : k.includes('Rate') || k.includes('Limit') ? 'number' : 'text'} value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} style={{ width: '100%' }} /></div>
                            ))}
                            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                                <button className="btn-nav" onClick={() => setShowAdd(false)} title="Cancel">{t('common.cancel', 'Cancel')}</button>
                                <button className="btn-save" onClick={handleAdd} title="Save Contractor">Save Contractor</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {detail && (
                <div className="modal-overlay" onClick={() => {setDetail(null);setEditing(false);}}>
                    <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{maxWidth:700}}>
                    <ActionBar
                        title={detail.contractor?.CompanyName || 'Contractor'}
                        icon={<HardHat size={20} />}
                        isEditing={editing}
                        isCreating={false}
                        onEdit={() => startEdit(detail)}
                        onSave={handleSave}
                        onPrint={() => window.triggerTrierPrint('contractor-detail', detail)}
                        onClose={() => {setDetail(null);setEditing(false);}}
                        onCancel={() => setEditing(false)}
                        showDelete={false}
                    />
                        <div className="scroll-area" style={{ flex: 1, padding: 20, overflowY: 'auto', maxHeight:'65vh' }}>
                            {!editing ? (<>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 15, marginBottom: 20 }}>
                                    <InfoRow label={t('contractors.trade', 'Trade')} value={detail.contractor?.TradeSpecialty}/><InfoRow label={t('contractors.rating', 'Rating')} value={detail.avgPerformance?.toFixed(1)}/><InfoRow label={t('contractors.totalSpend', 'Total Spend')} value={`$${(detail.totalSpend || 0).toLocaleString()}`}/>
                                    <InfoRow label={t('contractors.hoursWorked', 'Hours Worked')} value={(detail.totalHours || 0).toLocaleString()}/><InfoRow label={t('contractors.insurance', 'Insurance')} value={detail.contractor?.InsuranceExpiry?.split('T')[0]}/><InfoRow label={t('contractors.status', 'Status')} value={detail.contractor?.PrequalificationStatus}/>
                                    <InfoRow label={t('contractors.contact', 'Contact')} value={detail.contractor?.ContactName}/><InfoRow label={t('contractors.email', 'Email')} value={detail.contractor?.ContactEmail}/><InfoRow label={t('contractors.phone', 'Phone')} value={detail.contractor?.ContactPhone}/>
                                </div>
                                {detail.certs?.length > 0 && (
                                    <div className="panel-box" style={{ marginBottom: 15 }}>
                                        <h3>Certifications</h3>
                                        <table className="data-table"><thead><tr><th>{t('contractors.cert', 'Cert')}</th><th>{t('contractors.number', 'Number')}</th><th>{t('contractors.issuedBy', 'Issued By')}</th><th>{t('contractors.expiry', 'Expiry')}</th><th>{t('contractors.status', 'Status')}</th></tr></thead>
                                            <tbody>{detail.certs.map(c => (<tr key={c.ID}><td style={{ fontWeight: 600 }}>{c.CertName}</td><td>{c.CertNumber || '—'}</td><td>{c.IssuingBody || '—'}</td><td>{c.ExpiryDate?.split('T')[0] || '—'}</td><td><Badge color={c.Status === 'Active' ? '#10b981' : '#ef4444'}>{t('status.' + (c.Status || '').replace(/\s+/g, ''), c.Status)}</Badge></td></tr>))}</tbody>
                                        </table>
                                    </div>
                                )}
                                {detail.jobs?.length > 0 && (
                                    <div className="panel-box">
                                        <h3>Recent Jobs</h3>
                                        <table className="data-table"><thead><tr><th>{t('contractors.description', 'Description')}</th><th>{t('contractors.start', 'Start')}</th><th>{t('contractors.end', 'End')}</th><th>{t('contractors.cost', 'Cost')}</th><th>{t('contractors.hours', 'Hours')}</th><th>{t('contractors.rating', 'Rating')}</th></tr></thead>
                                            <tbody>{detail.jobs.slice(0, 10).map(j => (<tr key={j.ID}><td>{j.Description}</td><td>{j.StartDate?.split('T')[0] || '—'}</td><td>{j.EndDate?.split('T')[0] || '—'}</td><td>{j.ActualCost ? `$${j.ActualCost.toLocaleString()}` : '—'}</td><td>{j.HoursWorked || '—'}</td><td><Stars rating={j.PerformanceRating} /></td></tr>))}</tbody>
                                        </table>
                                    </div>
                                )}
                                {/* ── Permit-to-Work Linkage ── */}
                                {contractorPermits.length > 0 ? (
                                    <div className="panel-box" style={{marginTop:15}}>
                                        <h3>🔐 Permits to Work ({contractorPermits.length})</h3>
                                        <table className="data-table"><thead><tr><th>Permit #</th><th>Type</th><th>Location</th><th>Plant</th><th>Issued</th><th>Expires</th><th>Status</th></tr></thead>
                                            <tbody>{contractorPermits.map(p=>{
                                                const isActive=(p.Status||'').toUpperCase()==='ACTIVE';
                                                const isExpired=(p.Status||'').toUpperCase()==='EXPIRED';
                                                return(<tr key={p.ID}>
                                                    <td style={{fontWeight:700,color:'#ef4444',fontFamily:'monospace',fontSize:'0.8rem'}}>{p.PermitNumber}</td>
                                                    <td style={{fontSize:'0.8rem'}}>{(p.PermitType||'').replace(/_/g,' ')}</td>
                                                    <td style={{fontSize:'0.8rem'}}>{p.Location||'—'}</td>
                                                    <td style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{p.PlantID||'—'}</td>
                                                    <td style={{fontSize:'0.8rem'}}>{p.IssuedAt?.split('T')[0]||'—'}</td>
                                                    <td style={{fontSize:'0.8rem'}}>{p.ExpiresAt?.split('T')[0]||'—'}</td>
                                                    <td><Badge color={isActive?'#10b981':isExpired?'#ef4444':'#64748b'}>{p.Status}</Badge></td>
                                                </tr>);
                                            })}</tbody>
                                        </table>
                                    </div>
                                ) : (
                                    detail.contractor?.PrequalificationStatus === 'Approved' && (
                                        <div style={{marginTop:15,background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.3)',borderRadius:8,padding:'12px 16px',display:'flex',alignItems:'center',gap:10}}>
                                            <AlertTriangle size={18} color="#f59e0b"/>
                                            <span style={{fontSize:'0.85rem'}}>
                                                <strong style={{color:'#f59e0b'}}>No active Permit-to-Work.</strong> This contractor is Approved but has no safety permit on file. A permit must be issued in Safety before on-site work begins.
                                            </span>
                                        </div>
                                    )
                                )}
                            </>) : (
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                                    <FF t={t} label={t('contractors.companyName', 'Company Name')} value={editForm.CompanyName} onChange={v=>ef('CompanyName',v)} required/><FF t={t} label={t('contractors.contactName', 'Contact Name')} value={editForm.ContactName} onChange={v=>ef('ContactName',v)}/>
                                    <FF t={t} label={t('contractors.email', 'Email')} value={editForm.ContactEmail} onChange={v=>ef('ContactEmail',v)}/><FF t={t} label={t('contractors.phone', 'Phone')} value={editForm.ContactPhone} onChange={v=>ef('ContactPhone',v)}/>
                                    <FF t={t} label={t('contractors.tradeSpecialty', 'Trade / Specialty')} value={editForm.TradeSpecialty} onChange={v=>ef('TradeSpecialty',v)}/><FF t={t} label={t('contractors.hourlyRate', 'Hourly Rate ($)')} type="number" value={editForm.HourlyRate} onChange={v=>ef('HourlyRate',v)}/>
                                    <FF t={t} label={t('contractors.insuranceExpiry', 'Insurance Expiry')} type="date" value={editForm.InsuranceExpiry} onChange={v=>ef('InsuranceExpiry',v)}/><FF t={t} label={t('contractors.liabilityLimit', 'Liability Limit ($)')} type="number" value={editForm.LiabilityLimit} onChange={v=>ef('LiabilityLimit',v)}/>
                                    <FF t={t} label={t('contractors.status', 'Status')} value={editForm.PrequalificationStatus} onChange={v=>ef('PrequalificationStatus',v)} options={['Approved','Pending','Conditional','Expired','Suspended','Blacklisted']}/>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function CertsTab() {
    const { t } = useTranslation();
    const [data, setData] = useState(null); const [loading, setLoading] = useState(true);
    useEffect(() => { API('/expiring?days=90').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false)); }, []);
    const hasData = data?.expiringInsurance?.length > 0 || data?.expiringCerts?.length > 0;
    if (loading) return <LoadingSpinner message="Loading certifications..." />;
    return (
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}><AlertTriangle size={24} color="#f59e0b" /> Expiring (Next 90 Days)</h2>
                {hasData && <button className="btn-nav" onClick={() => window.triggerTrierPrint('contractor-expiry-report', data)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }} title="Print Report"><Printer size={15} /> Print Report</button>}
            </div>
            {data?.expiringInsurance?.length > 0 && (
                <div className="panel-box" style={{ marginBottom: 15 }}>
                    <h3>Insurance Expiring ({data.expiringInsurance.length})</h3>
                    <table className="data-table"><thead><tr><th>{t('contractors.company', 'Company')}</th><th>{t('contractors.expiryDate', 'Expiry Date')}</th><th>{t('contractors.daysLeft', 'Days Left')}</th></tr></thead>
                        <tbody>{data.expiringInsurance.map(i => { const days = Math.floor((new Date(i.InsuranceExpiry) - new Date()) / 86400000); return (<tr key={i.ID}><td style={{ fontWeight: 600 }}>{i.CompanyName}</td><td style={{ color: days < 0 ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>{i.InsuranceExpiry?.split('T')[0]}</td><td style={{ fontWeight: 700, color: days < 0 ? '#ef4444' : '#f59e0b' }}>{days < 0 ? `EXPIRED (${Math.abs(days)}d ago)` : `${days} days`}</td></tr>); })}</tbody>
                    </table>
                </div>
            )}
            {data?.expiringCerts?.length > 0 && (
                <div className="panel-box">
                    <h3>Certifications Expiring ({data.expiringCerts.length})</h3>
                    <table className="data-table"><thead><tr><th>{t('contractors.company', 'Company')}</th><th>{t('contractors.certification', 'Certification')}</th><th>{t('contractors.cert', 'Cert #')}</th><th>{t('contractors.expiry', 'Expiry')}</th><th>{t('contractors.daysLeft', 'Days Left')}</th></tr></thead>
                        <tbody>{data.expiringCerts.map(c => { const days = Math.floor((new Date(c.ExpiryDate) - new Date()) / 86400000); return (<tr key={c.ID}><td style={{ fontWeight: 600 }}>{c.CompanyName}</td><td>{c.CertName}</td><td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{c.CertNumber || '—'}</td><td style={{ color: '#f59e0b', fontWeight: 600 }}>{c.ExpiryDate?.split('T')[0]}</td><td style={{ fontWeight: 700, color: days < 0 ? '#ef4444' : '#f59e0b' }}>{days < 0 ? `EXPIRED` : `${days}d`}</td></tr>); })}</tbody>
                    </table>
                </div>
            )}
            {!hasData && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', flexDirection: 'column', gap: 10 }}>
                    <Star size={48} /><span style={{ fontSize: '1.1rem', fontWeight: 600 }}>No expirations in the next 90 days 👍</span>
                </div>
            )}
        </div>
    );
}

function JobsTab({ search }) {
    const { t } = useTranslation();
    const [jobs, setJobs] = useState([]); const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);

    const fetchJobs = useCallback(() => {
        setLoading(true);
        const qs = search ? `?search=${encodeURIComponent(search)}` : '';
        API(`/jobs/all${qs}`).then(r => r.json()).then(d => { setJobs(d); setLoading(false); }).catch(() => setLoading(false));
    }, [search]);
    useEffect(() => { fetchJobs(); }, [fetchJobs]);

    if (loading) return <LoadingSpinner message="Loading job history..." />;
    return (<>
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}><Briefcase size={24} color="#06b6d4" /> Job History ({jobs.length})</h2>
                {jobs.length > 0 && <button className="btn-nav" onClick={() => window.triggerTrierPrint('contractor-jobs-report', { jobs })} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36 }} title="Print Report"><Printer size={15} /> Print Report</button>}
            </div>

            {/* Contract Time Theft (SLA vs Access Logs) Operational Knowledge Flag */}
            <div style={{ background: 'linear-gradient(135deg, rgba(244,63,94,0.1) 0%, rgba(244,63,94,0.02) 100%)', border: '1px solid rgba(244,63,94,0.2)', borderLeft: '3px solid #f43f5e', borderRadius: 8, padding: 16, marginBottom: 20, display: 'flex', gap: 15, alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(244,63,94,0.15)', padding: 10, borderRadius: 10, flexShrink: 0 }}>
                    <AlertTriangle size={20} color="#f43f5e" />
                </div>
                <div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                        SLA Variance & Time Theft Detection <Badge color="#f43f5e">SYSTEM ACTIVE</Badge>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: 4, lineHeight: 1.5 }}>
                        Trier OS actively cross-references 3rd-party Work Order Invoices against Security Gate Access logs. If a vendor submits an invoice for 10 hours but physical dwell time was only 6.5 hours, the system will automatically block PO Invoice routing and trigger a chargeback dispute.
                    </div>
                </div>
            </div>

            <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>{t('contractors.wo', 'WO #')}</th><th>{t('contractors.contractor', 'Contractor')}</th><th>{t('contractors.description', 'Description')}</th><th>{t('contractors.start', 'Start')}</th><th>{t('contractors.end', 'End')}</th><th>{t('contractors.cost', 'Cost')}</th><th>{t('contractors.hours', 'Hours')}</th><th>{t('contractors.rating', 'Rating')}</th><th>{t('contractors.actions', 'Actions')}</th></tr></thead>
                    <tbody>{jobs.map(j => (<tr key={j.ID}>
                        <td style={{ fontWeight: 600, color: '#3b82f6', fontFamily: 'monospace', fontSize: '0.78rem' }}>{j.WorkOrderID || '—'}</td>
                        <td style={{ fontWeight: 600, color: '#06b6d4' }}>{j.CompanyName}<div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{j.TradeSpecialty}</div></td>
                        <td>{j.Description}</td>
                        <td>{j.StartDate?.split('T')[0] || '—'}</td>
                        <td>{j.EndDate?.split('T')[0] || '—'}</td>
                        <td>{j.ActualCost ? `$${j.ActualCost.toLocaleString()}` : '—'}</td>
                        <td>{j.HoursWorked || '—'}</td>
                        <td><Stars rating={j.PerformanceRating} /></td>
                        <td><ActionBtn icon={Eye} tip="View job detail" color="#3b82f6" onClick={() => setDetail(j)} /></td>
                    </tr>))}
                        {jobs.length === 0 && <tr><td colSpan={9} className="table-empty">No job history recorded.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
        {detail && (
            <div className="modal-overlay" onClick={() => setDetail(null)}>
                <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 650 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid var(--glass-border)' }}>
                        <h2 style={{ margin: 0, color: '#06b6d4', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 10 }}><Briefcase size={20} /> {detail.WorkOrderID || 'Job Detail'}</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button className="btn-nav" onClick={() => window.triggerTrierPrint('contractor-job-detail', detail)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32 }} title="Print"><Printer size={14} /> Print</button>
                            <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} title="Detail"><X size={18} /></button>
                        </div>
                    </div>
                    <div style={{ padding: 20 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 15 }}>
                            <InfoRow label={t('contractors.workOrder', 'Work Order')} value={detail.WorkOrderID} />
                            <InfoRow label={t('contractors.contractor', 'Contractor')} value={detail.CompanyName} />
                            <InfoRow label={t('contractors.trade', 'Trade')} value={detail.TradeSpecialty} />
                            <InfoRow label={t('contractors.startDate', 'Start Date')} value={detail.StartDate?.split('T')[0]} />
                            <InfoRow label={t('contractors.endDate', 'End Date')} value={detail.EndDate?.split('T')[0]} />
                            <InfoRow label={t('contractors.agreedRate', 'Agreed Rate')} value={detail.AgreedRate ? `$${detail.AgreedRate}/hr` : null} />
                            <InfoRow label={t('contractors.actualCost', 'Actual Cost')} value={detail.ActualCost ? `$${detail.ActualCost.toLocaleString()}` : null} />
                            <InfoRow label={t('contractors.hoursWorked', 'Hours Worked')} value={detail.HoursWorked} />
                            <InfoRow label={t('contractors.safetyIncidents', 'Safety Incidents')} value={detail.SafetyIncidents || '0'} />
                        </div>
                        <div className="panel-box" style={{ padding: 14, marginBottom: 12 }}>
                            <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>DESCRIPTION</strong>
                            <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>{detail.Description}</p>
                        </div>
                        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Performance Rating:</span>
                            <Stars rating={detail.PerformanceRating} />
                        </div>
                        {detail.Notes && (
                            <div className="panel-box" style={{ padding: 14, marginTop: 12 }}>
                                <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>NOTES</strong>
                                <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>{detail.Notes}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}

function StatsTab() {
    const { t } = useTranslation();
    const [stats, setStats] = useState(null); const [loading, setLoading] = useState(true);
    useEffect(() => { API('/stats').then(r => r.json()).then(d => { setStats(d); setLoading(false); }).catch(() => setLoading(false)); }, []);
    if (loading || !stats) return <LoadingSpinner message="Loading stats..." />;
    return (
        <div className="glass-card" style={{ flex: 1, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}><BarChart3 size={24} color="#8b5cf6" /> Contractor Program Stats</h2>
                <button className="btn-nav" onClick={() => window.triggerTrierPrint('contractor-stats-report', stats)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36 }} title="Print Report"><Printer size={15} /> Print Report</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 15, marginBottom: 20 }}>
                {[['Total Contractors', stats.total, '#3b82f6'], ['Approved', stats.approved, '#10b981'], ['Avg Rating', stats.avgRating, '#f59e0b'], ['YTD Spend', `$${(stats.ytdSpend || 0).toLocaleString()}`, '#8b5cf6']].map(([l, v, c]) => (
                    <div key={l} style={{ background: `${c}11`, border: `1px solid ${c}33`, borderRadius: 12, padding: '18px 20px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: c }}>{v || 0}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{l}</div>
                    </div>
                ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                <div className="panel-box">
                    <h3>Expiring Insurance ({stats.expiringInsurance || 0})</h3>
                    <div style={{ fontSize: '0.85rem', color: stats.expiringInsurance > 0 ? '#ef4444' : '#10b981' }}>{stats.expiringInsurance > 0 ? `${stats.expiringInsurance} contractor(s) need insurance renewal within 30 days` : 'All insurance current ✓'}</div>
                </div>
                <div className="panel-box">
                    <h3>Expiring Certs ({stats.expiringCerts || 0})</h3>
                    <div style={{ fontSize: '0.85rem', color: stats.expiringCerts > 0 ? '#f59e0b' : '#10b981' }}>{stats.expiringCerts > 0 ? `${stats.expiringCerts} certification(s) expiring soon` : 'All certs current ✓'}</div>
                </div>
            </div>
            <div className="panel-box" style={{ marginTop: 15 }}>
                <h3>All-Time Spend</h3>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#8b5cf6' }}>${(stats.totalSpend || 0).toLocaleString()}</div>
            </div>
            {stats.byTrade?.length > 0 && (
                <div className="panel-box" style={{ marginTop: 15 }}>
                    <h3>By Trade</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        {stats.byTrade.map(trade => (
                            <div key={trade.TradeSpecialty} style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 700, color: '#22d3ee' }}>{trade.count}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{trade.TradeSpecialty || 'Unspecified'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

