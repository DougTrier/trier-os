// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Tools & Equipment Crib Management
 * ==============================================
 * Tool crib and equipment vending management system. Tracks all tools,
 * calibrated instruments, and shared equipment across the plant floor —
 * including check-out/check-in, calibration status, and condition tracking.
 *
 * KEY FEATURES:
 *   - Tool registry: full tool list with type, location, status, and condition
 *   - Check-out workflow: assign tool to technician with expected return date
 *   - Check-in: return tool with condition assessment (new/good/damaged)
 *   - Calibration tracking: calibrated tools show last cal date and due date
 *   - Overdue alerts: tools past return date highlighted in amber/red
 *   - Tool detail panel: history of all check-out events for an instrument
 *   - Search: find any tool by name, tag, type, or location
 *   - Print: tool crib inventory report for physical audit
 *   - ActionBar: View / Edit / Save / Print (platform standard)
 *
 * API CALLS:
 *   GET    /api/tools                  — Tool list (plant-scoped)
 *   POST   /api/tools                  — Add new tool record
 *   PUT    /api/tools/:id              — Update tool details or status
 *   POST   /api/tools/:id/checkout     — Check out a tool
 *   POST   /api/tools/:id/checkin      — Check in a returned tool
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Hammer, Search, Plus, X, Eye, AlertTriangle, CheckCircle2, Clock, BarChart3, Pencil, Printer, Scan } from 'lucide-react';
import SearchBar from './SearchBar';
import { TakeTourButton } from './ContextualTour';
import ActionBar from './ActionBar';
import { statusClass, formatDate } from '../utils/formatDate';
import LoadingSpinner from './LoadingSpinner';
import { useTranslation } from '../i18n/index.jsx';

const API = (path, o = {}) => fetch(`/api/tools${path}`, { ...o, headers: { 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1', ...o.headers } });
const Badge = ({ color, children }) => <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44` }}>{children}</span>;
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

export default function ToolsView({ plantId }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('inventory');
    const [search, setSearch] = useState('');
    const [badgeMode, setBadgeMode] = useState(false); // Quick Checkout/Checkin
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)' }}>
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 10 }}><Hammer size={24} /> {t('tools.toolCrib', 'Tool Crib')}</h2>
                <div style={{ width: 2, height: 30, background: 'var(--glass-border)' }} />
                <div className="nav-pills no-print">
                    <button onClick={() => setBadgeMode('checkout')} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none', fontWeight: 'bold' }} title="Scan employee badge then scan tool">
                        <Scan size={16} /> Quick Checkout
                    </button>
                    <button onClick={() => setBadgeMode('checkin')} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', fontWeight: 'bold' }} title="Scan tools to return them instantly">
                        <Scan size={16} /> Quick Return
                    </button>
                    <div style={{ width: 1, height: 20, background: 'var(--glass-border)', margin: '0 5px' }} />
                    {[['inventory', t('tools.inventory', 'Inventory'), Hammer], ['checkouts', t('tools.activeCheckouts', 'Active Checkouts'), Clock], ['overdue', t('tools.overdue', 'Overdue'), AlertTriangle], ['stats', t('tools.stats', 'Stats'), BarChart3]].map(([id, l, I]) => (
                        <button key={id} onClick={() => setTab(id)} className={`btn-nav ${tab === id ? 'active' : ''}`} title="Tab"><I size={16} style={{ marginRight: 4 }} />{l}</button>
                    ))}
                </div>
                <SearchBar value={search} onChange={setSearch} placeholder={t('tools.searchToolsPlaceholder', 'Search tools...')} width={220} style={{ marginLeft: 'auto' }} />
                <TakeTourButton tourId="tools" nestedTab={tab} />
            </div>
            <div style={{ flex: 1, display: 'flex' }}>
                {tab === 'inventory' && <InventoryTab search={search} />}
                {tab === 'checkouts' && <CheckoutsTab search={search} />}
                {tab === 'overdue' && <OverdueTab />}
                {tab === 'stats' && <StatsTab />}
            </div>
            {badgeMode && <BadgeScannerModal mode={badgeMode} onClose={() => setBadgeMode(false)} />}
        </div>
    );
}

function InventoryTab({ search }) {
    const { t } = useTranslation();
    const [tools, setTools] = useState([]); const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false); const [form, setForm] = useState({});
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const ef = (k,v)=>setEditForm(p=>({...p,[k]:v}));

    const fetch_ = useCallback(() => { setLoading(true); API('').then(r => r.json()).then(d => { setTools(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false)); }, []);
    useEffect(() => { fetch_(); }, [fetch_]);
    const filtered = useMemo(() => { if (!search) return tools; const s = search.toLowerCase(); return tools.filter(t => (t.ToolID || '').toLowerCase().includes(s) || (t.Description || '').toLowerCase().includes(s) || (t.Category || '').toLowerCase().includes(s)); }, [tools, search]);

    const handleAdd = async () => { const r = await API('', { method: 'POST', body: JSON.stringify(form) }); if (r.ok) { setShowAdd(false); setForm({}); fetch_(); } else { const d = await r.json(); window.trierToast?.error(d.error || 'Failed'); } };
    const startEdit = (t) => { setEditForm({ ToolID:t.ToolID||'', Description:t.Description||'', Category:t.Category||'', SerialNumber:t.SerialNumber||'', Manufacturer:t.Manufacturer||'', Location:t.Location||'', Condition:t.Condition||'Good', Status:t.Status||'Available', PurchasePrice:t.PurchasePrice||'' }); setEditing(true); };
    const handleSave = async () => { const r=await API(`/${detail.ID}`,{method:'PUT',body:JSON.stringify(editForm)});if(r.ok){setEditing(false);fetch_();setDetail({...detail,...editForm});}else{const d=await r.json();window.trierToast?.error(d.error);} };

    if (loading) return <LoadingSpinner />;
    return (
        <>
            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}><Hammer size={24} color="#f59e0b" /> {t('tools.toolInventory', 'Tool Inventory')} ({filtered.length})</h2>
                    <button className="btn-save" onClick={() => setShowAdd(true)} style={{ border: 'none', height: 36, display: 'flex', alignItems: 'center', gap: 8 }} title={t('tools.addToolTip', 'Add Tool')}><Plus size={16} /> {t('tools.addTool', 'Add Tool')}</button>
                </div>
                <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                    <table className="data-table">
                        <thead><tr><th>{t('tools.toolId', 'Tool ID')}</th><th>{t('tools.description', 'Description')}</th><th>{t('tools.category', 'Category')}</th><th>{t('tools.serial', 'Serial #')}</th><th>{t('tools.location', 'Location')}</th><th>{t('tools.condition', 'Condition')}</th><th>{t('tools.status', 'Status')}</th><th>{t('tools.actions', 'Actions')}</th></tr></thead>
                        <tbody>{filtered.map(tool => (<tr key={tool.ID}><td style={{ fontWeight: 600, color: '#f59e0b' }}>{tool.ToolID}</td><td>{tool.Description}</td><td><Badge color="#6366f1">{tool.Category}</Badge></td><td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{tool.SerialNumber || '—'}</td><td>{tool.Location || '—'}</td><td>{tool.Condition}</td><td><span className={statusClass(tool.Status)}>{t('status.' + (tool.Status || '').replace(/\s+/g, '').toLowerCase(), tool.Status)}</span></td>
                            <td style={{display:'flex',gap:2}}><ActionBtn icon={Eye} tip={t('tools.viewToolDetails', 'View tool details')} color="#3b82f6" onClick={()=>{setDetail(tool);setEditing(false);}}/><ActionBtn icon={Pencil} tip={t('tools.editTool', 'Edit tool')} color="#f59e0b" onClick={()=>{setDetail(tool);startEdit(tool);}}/></td></tr>))}
                            {filtered.length === 0 && <tr><td colSpan={8} className="table-empty">{t('tools.noToolsInInventory', 'No tools in inventory.')}</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
            {showAdd && (
                <div className="modal-overlay" onClick={() => setShowAdd(false)}>
                    <div className="glass-card" onClick={e => e.stopPropagation()} style={{ width: 500, padding: 30 }}>
                        <h2 style={{ margin: '0 0 20px', color: '#f59e0b' }}><Plus size={20} /> {t('tools.addTool', 'Add Tool')}</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            {[['toolId', t('tools.toolIdReq', 'Tool ID *')], ['description', t('tools.descriptionReq', 'Description *')], ['category', t('tools.category', 'Category')], ['serialNumber', t('tools.serial', 'Serial Number')], ['manufacturer', t('tools.manufacturer', 'Manufacturer')], ['location', t('tools.location', 'Location')]].map(([k, l]) => (
                                <div key={k}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{l}</label><input type="text" value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} style={{ width: '100%' }} /></div>
                            ))}
                            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                                <button className="btn-nav" onClick={() => setShowAdd(false)} title="Cancel">{t('common.cancel', 'Cancel')}</button>
                                <button className="btn-save" onClick={handleAdd} title={t('tools.saveToolTip', 'Save Tool')}>{t('tools.saveTool', 'Save Tool')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {detail && (
                <div className="modal-overlay" onClick={()=>{setDetail(null);setEditing(false);}}>
                    <div className="glass-card modal-content-standard" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
                        <ActionBar
                            title={`${detail.ToolID} — ${detail.Description}`}
                            icon={<Hammer size={20} />}
                            isEditing={editing}
                            onEdit={() => startEdit(detail)}
                            onSave={handleSave}
                            onPrint={() => window.triggerTrierPrint('tool-detail', detail)}
                            onClose={() => { setDetail(null); setEditing(false); }}
                            onCancel={() => setEditing(false)}
                            showDelete={false}
                        />
                        <div style={{padding:20}}>
                            {!editing ? (
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                                    <InfoRow label={t('tools.toolId', 'Tool ID')} value={detail.ToolID}/><InfoRow label={t('tools.description', 'Description')} value={detail.Description}/><InfoRow label={t('tools.category', 'Category')} value={detail.Category}/>
                                    <InfoRow label={t('tools.serial', 'Serial #')} value={detail.SerialNumber}/><InfoRow label={t('tools.manufacturer', 'Manufacturer')} value={detail.Manufacturer}/><InfoRow label={t('tools.location', 'Location')} value={detail.Location}/>
                                    <InfoRow label={t('tools.condition', 'Condition')} value={detail.Condition}/><InfoRow label={t('tools.status', 'Status')} value={detail.Status}/><InfoRow label={t('tools.purchasePrice', 'Purchase Price')} value={detail.PurchasePrice?`$${detail.PurchasePrice}`:null}/>
                                </div>
                            ) : (
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                                    <FF t={t} label={t('tools.toolId', 'Tool ID')} value={editForm.ToolID} onChange={v=>ef('ToolID',v)}/><FF t={t} label={t('tools.description', 'Description')} value={editForm.Description} onChange={v=>ef('Description',v)}/>
                                    <FF t={t} label={t('tools.category', 'Category')} value={editForm.Category} onChange={v=>ef('Category',v)}/><FF t={t} label={t('tools.serial', 'Serial #')} value={editForm.SerialNumber} onChange={v=>ef('SerialNumber',v)}/>
                                    <FF t={t} label={t('tools.manufacturer', 'Manufacturer')} value={editForm.Manufacturer} onChange={v=>ef('Manufacturer',v)}/><FF t={t} label={t('tools.location', 'Location')} value={editForm.Location} onChange={v=>ef('Location',v)}/>
                                    <FF t={t} label={t('tools.condition', 'Condition')} value={editForm.Condition} onChange={v=>ef('Condition',v)} options={[t('tools.condGood', 'Good'),t('tools.condFair', 'Fair'),t('tools.condPoor', 'Poor'),t('tools.condNew', 'New')]}/>
                                    <FF t={t} label={t('tools.status', 'Status')} value={editForm.Status} onChange={v=>ef('Status',v)} options={[t('tools.statAvailable', 'Available'),t('tools.statCheckedOut', 'Checked Out'),t('tools.statRepair', 'Repair'),t('tools.statRetired', 'Retired')]}/>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function CheckoutsTab({ search }) {
    const { t } = useTranslation();
    const [tools, setTools] = useState([]); const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);
    const fetchTools = useCallback(() => {
        setLoading(true);
        API('?status=Checked Out').then(r => r.json()).then(d => { setTools(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
    }, []);
    useEffect(() => { fetchTools(); }, [fetchTools]);
    const filtered = useMemo(() => { if (!search) return tools; const s = search.toLowerCase(); return tools.filter(t => (t.ToolID || '').toLowerCase().includes(s) || (t.Description || '').toLowerCase().includes(s)); }, [tools, search]);

    const loadDetail = async (id) => { const r = await API(`/${id}`); if (r.ok) setDetail(await r.json()); };

    if (loading) return <LoadingSpinner />;
    return (<>
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}><Clock size={24} color="#f59e0b" /> {t('tools.currentlyCheckedOut', 'Currently Checked Out')} ({filtered.length})</h2>
                <button className="btn-nav" onClick={() => window.triggerTrierPrint('catalog-internal', { type: 'tool-checkouts', items: filtered })} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36 }} title={t('tools.printListTip', 'Print List')}><Printer size={15} /> {t('tools.printList', 'Print List')}</button>
            </div>
            <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>{t('tools.toolId', 'Tool ID')}</th><th>{t('tools.description', 'Description')}</th><th>{t('tools.category', 'Category')}</th><th>{t('tools.location', 'Location')}</th><th>{t('tools.status', 'Status')}</th><th>{t('tools.actions', 'Actions')}</th></tr></thead>
                    <tbody>{filtered.map(tool => (<tr key={tool.ID}><td style={{ fontWeight: 600, color: '#f59e0b' }}>{tool.ToolID}</td><td>{tool.Description}</td><td><Badge color="#6366f1">{tool.Category}</Badge></td><td>{tool.Location || '—'}</td><td><span className={statusClass('Hold')}>{t('tools.checkedOut', 'Checked Out')}</span></td>
                        <td style={{ display: 'flex', gap: 2 }}><ActionBtn icon={Eye} tip={t('tools.viewCheckoutDetail', 'View checkout detail')} color="#3b82f6" onClick={() => loadDetail(tool.ID)} /></td></tr>))}
                        {filtered.length === 0 && <tr><td colSpan={6} className="table-empty">{t('tools.noToolsCurrentlyCheckedOut', 'No tools currently checked out.')}</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
        {detail && (
            <div className="modal-overlay" onClick={() => setDetail(null)}>
                <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 650 }}>
                    <ActionBar
                        title={`${detail.tool.ToolID} — ${t('tools.checkoutDetail', 'Checkout Detail')}`}
                        icon={<Clock size={20} />}
                        onPrint={() => window.triggerTrierPrint('tool-checkout-slip', detail)}
                        onClose={() => setDetail(null)}
                        showEdit={false}
                        showDelete={false}
                    />
                    <div style={{ padding: 20 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                            <InfoRow label={t('tools.toolId', 'Tool ID')} value={detail.tool.ToolID} /><InfoRow label={t('tools.description', 'Description')} value={detail.tool.Description} /><InfoRow label={t('tools.category', 'Category')} value={detail.tool.Category} />
                            <InfoRow label={t('tools.serial', 'Serial #')} value={detail.tool.SerialNumber} /><InfoRow label={t('tools.condition', 'Condition')} value={detail.tool.Condition} /><InfoRow label={t('tools.location', 'Location')} value={detail.tool.Location} />
                        </div>
                        {detail.currentCheckout && (
                            <div className="panel-box" style={{ padding: 14, borderLeft: '4px solid #f59e0b', marginBottom: 15 }}>
                                <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('tools.currentCheckout', 'CURRENT CHECKOUT')}</strong>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, fontSize: '0.85rem' }}>
                                    <div><span style={{ color: 'var(--text-muted)' }}>{t('tools.by', 'By:')}</span> <strong>{detail.currentCheckout.CheckedOutBy}</strong></div>
                                    <div><span style={{ color: 'var(--text-muted)' }}>{t('tools.checkedOut', 'Checked Out')}:</span> {formatDate(detail.currentCheckout.CheckedOutDate)}</div>
                                    <div><span style={{ color: 'var(--text-muted)' }}>{t('tools.dueBack', 'Due Back:')}</span> <strong style={{ color: '#ef4444' }}>{formatDate(detail.currentCheckout.DueBackDate)}</strong></div>
                                    {detail.currentCheckout.Notes && <div style={{ gridColumn: 'span 2' }}><span style={{ color: 'var(--text-muted)' }}>{t('tools.notes', 'Notes:')}</span> {detail.currentCheckout.Notes}</div>}
                                </div>
                            </div>
                        )}
                        {detail.history?.length > 0 && (
                            <div className="panel-box" style={{ padding: 14 }}>
                                <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('tools.checkoutHistory', 'CHECKOUT HISTORY')} ({detail.history.length})</strong>
                                <table className="data-table" style={{ fontSize: '0.8rem', marginTop: 8 }}>
                                    <thead><tr><th>{t('tools.checkedOut', 'Checked Out')}</th><th>{t('tools.by', 'By:')}</th><th>{t('tools.due', 'Due')}</th><th>{t('tools.returned', 'Returned')}</th><th>{t('tools.condition', 'Condition')}</th></tr></thead>
                                    <tbody>{detail.history.slice(0, 10).map(h => (<tr key={h.ID}><td>{formatDate(h.CheckedOutDate)}</td><td>{h.CheckedOutBy}</td><td>{formatDate(h.DueBackDate)}</td><td>{formatDate(h.ReturnedDate) || <span className={statusClass('Hold')}>{t('tools.out', 'Out')}</span>}</td><td>{h.ReturnCondition || '—'}</td></tr>))}</tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}

function OverdueTab() {
    const { t } = useTranslation();
    const [overdue, setOverdue] = useState([]); const [loading, setLoading] = useState(true);
    useEffect(() => { API('/overdue').then(r => r.json()).then(d => { setOverdue(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false)); }, []);
    if (loading) return <LoadingSpinner />;
    return (
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}><AlertTriangle size={24} color="#ef4444" /> {t('tools.overdueCheckouts', 'Overdue Checkouts')} ({overdue.length})</h2>
                {overdue.length > 0 && <button className="btn-nav" onClick={() => window.triggerTrierPrint('tool-overdue-report', { items: overdue })} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }} title={t('tools.printReportTip', 'Print Report')}><Printer size={15} /> {t('tools.printReport', 'Print Report')}</button>}
            </div>
            {overdue.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: '#10b981' }}>
                    <CheckCircle2 size={48} /><span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{t('tools.allToolsReturnedOnTime', 'All tools returned on time 👍')}</span>
                </div>
            ) : (
                <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                    <table className="data-table">
                        <thead><tr><th>{t('tools.tool', 'Tool')}</th><th>{t('tools.description', 'Description')}</th><th>{t('tools.checkedOutBy', 'Checked Out By')}</th><th>{t('tools.dueBack', 'Due Back:')}</th><th>{t('tools.daysOverdue', 'Days Overdue')}</th><th>{t('tools.notes', 'Notes:')}</th></tr></thead>
                        <tbody>{overdue.map(o => { const days = Math.floor((new Date() - new Date(o.DueBackDate)) / 86400000); return (<tr key={o.ID}><td style={{ fontWeight: 600, color: '#ef4444' }}>{o.ToolID}</td><td>{o.Description}</td><td>{o.CheckedOutBy}</td><td>{formatDate(o.DueBackDate)}</td><td style={{ fontWeight: 800, color: '#ef4444' }}>{days}d</td><td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{o.Notes || '—'}</td></tr>); })}</tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function StatsTab() {
    const { t } = useTranslation();
    const [stats, setStats] = useState(null); const [loading, setLoading] = useState(true);
    useEffect(() => { API('/stats').then(r => r.json()).then(d => { setStats(d); setLoading(false); }).catch(() => setLoading(false)); }, []);
    if (loading || !stats) return <div className="glass-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t('tools.loadingStats', 'Loading stats...')}</div>;
    return (
        <div className="glass-card" style={{ flex: 1, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}><BarChart3 size={24} color="#8b5cf6" /> {t('tools.toolProgramStats', 'Tool Program Stats')}</h2>
                <button className="btn-nav" onClick={() => window.triggerTrierPrint('tool-stats-report', stats)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36 }} title={t('tools.printReportTip', 'Print Report')}><Printer size={15} /> {t('tools.printReport', 'Print Report')}</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 15, marginBottom: 30 }}>
                {[[t('tools.totalTools', 'Total Tools'), stats.total, '#3b82f6'], [t('tools.available', 'Available'), stats.available, '#10b981'], [t('tools.checkedOut', 'Checked Out'), stats.checkedOut, '#f59e0b'], [t('tools.overdue', 'Overdue'), stats.overdue, '#ef4444'], [t('tools.needsRepair', 'Needs Repair'), stats.needsRepair, '#ef4444']].map(([l, v, c]) => (
                    <div key={l} style={{ background: `${c}11`, border: `1px solid ${c}33`, borderRadius: 12, padding: '18px 20px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: c }}>{v || 0}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{l}</div>
                    </div>
                ))}
            </div>
            <div className="panel-box">
                <h3>{t('tools.totalAssetValue', 'Total Asset Value')}</h3>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981' }}>${(stats.totalValue || 0).toLocaleString()}</div>
            </div>
            {stats.byCategory?.length > 0 && (
                <div className="panel-box" style={{ marginTop: 15 }}>
                    <h3>{t('tools.byCategory', 'By Category')}</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        {stats.byCategory.map(c => (
                            <div key={c.Category} style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 700, color: '#818cf8' }}>{c.count}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{c.Category}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function BadgeScannerModal({ mode, onClose }) {
    const { t } = useTranslation();
    const [employee, setEmployee] = useState(mode === 'checkin' ? 'SYSTEM' : null);
    const [logs, setLogs] = useState([]);
    const [message, setMessage] = useState(mode === 'checkout' ? 'Scan Employee ID Badge or select Self-Service...' : 'Scan Tool Barcode to return...');
    
    const handleSelfService = () => {
        const selfUser = localStorage.getItem('userName') || 'Current User';
        setEmployee(selfUser);
        setMessage(`Checkout Mode for: ${selfUser}. Scan Tool Barcodes now.`);
    };
    
    useEffect(() => {
        window.trierActiveScannerInterceptor = true;
        
        const handleScan = async (e) => {
            const code = e.detail;
            
            if (mode === 'checkout' && !employee) {
                setEmployee(code);
                setMessage(`Checkout Mode for: ${code}. Scan Tool Barcodes now.`);
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                return;
            }
            
            // Assume Tool Scan
            setMessage(`Processing tool: ${code}...`);
            try {
                // Find internal tool ID from ToolID string
                const searchRes = await fetch(`/api/tools?search=${encodeURIComponent(code)}`, {
                    headers: { 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1' }
                });
                const tools = await searchRes.json();
                // Match the ToolID
                const tool = tools.find(t => t.ToolID.toUpperCase() === code.toUpperCase());
                
                if (!tool) {
                    setLogs(prev => [{ time: new Date().toLocaleTimeString(), code, status: 'Failed: Tool not found', success: false }, ...prev]);
                    setMessage(mode === 'checkout' ? `Checkout Mode for: ${employee}. Ready.` : 'Ready. Scan next tool...');
                    if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
                    return;
                }
                
                if (mode === 'checkout') {
                    const res = await fetch(`/api/tools/${tool.ID}/checkout`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1' },
                        body: JSON.stringify({ checkedOutBy: employee, dueBackDays: 7, notes: 'Quick Scan Checkout' })
                    });
                    if (res.ok) {
                        setLogs(prev => [{ time: new Date().toLocaleTimeString(), code, status: `Checked out to ${employee}`, success: true }, ...prev]);
                        if (navigator.vibrate) navigator.vibrate(200);
                    } else {
                        const err = await res.json();
                        setLogs(prev => [{ time: new Date().toLocaleTimeString(), code, status: 'Failed: ' + err.error, success: false }, ...prev]);
                        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
                    }
                } else if (mode === 'checkin') {
                    const res = await fetch(`/api/tools/${tool.ID}/return`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1' },
                        body: JSON.stringify({ returnedBy: localStorage.getItem('userName') || 'scan-user', condition: 'Good', notes: 'Quick Scan Return' })
                    });
                    if (res.ok) {
                        setLogs(prev => [{ time: new Date().toLocaleTimeString(), code, status: `Returned successfully`, success: true }, ...prev]);
                        if (navigator.vibrate) navigator.vibrate(200);
                    } else {
                        const err = await res.json();
                        setLogs(prev => [{ time: new Date().toLocaleTimeString(), code, status: 'Failed: ' + err.error, success: false }, ...prev]);
                        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
                    }
                }
            } catch (err) {
                setLogs(prev => [{ time: new Date().toLocaleTimeString(), code, status: 'Network error', success: false }, ...prev]);
            }
            setMessage(mode === 'checkout' ? `Checkout Mode for: ${employee}. Scan next tool.` : 'Scan next tool barcode...');
        };
        
        window.addEventListener('hw-scan-inject', handleScan);
        return () => {
            window.trierActiveScannerInterceptor = false;
            window.removeEventListener('hw-scan-inject', handleScan);
        };
    }, [mode, employee]);
    
    return (
        <div className="modal-overlay" style={{ zIndex: 11000, background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
            <div className="glass-card" style={{ maxWidth: 600, width: '90%', margin: '0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '20px 25px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: mode === 'checkout' ? 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, transparent 100%)' : 'linear-gradient(135deg, rgba(59,130,246,0.2) 0%, transparent 100%)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ background: mode === 'checkout' ? '#10b981' : '#3b82f6', color: '#fff', padding: 8, borderRadius: '50%', display: 'flex' }}>
                            <Scan size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{mode === 'checkout' ? 'Quick Checkout Mode' : 'Quick Return Mode'}</h2>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Using global hardware wedge scanner</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn-nav" title="Close" style={{ border: 'none', background: 'transparent' }}><X size={24} /></button>
                </div>
                
                <div style={{ padding: '30px 25px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ background: 'var(--bg-lighter)', padding: '20px', borderRadius: 12, border: '1px dashed var(--primary)', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: 5 }}>
                            {message}
                        </div>
                        {!employee && mode === 'checkout' && (
                            <button className="btn-nav" onClick={handleSelfService} style={{ marginTop: 15, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <Scan size={16} /> Check out to myself ({localStorage.getItem('userName') || 'User'})
                            </button>
                        )}
                        {employee && mode === 'checkout' && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid #10b981', color: '#10b981', borderRadius: '20px', marginTop: 10, fontSize: '0.85rem', fontWeight: 700 }}>
                                <CheckCircle2 size={16} /> Employee Assigned: {employee}
                            </div>
                        )}
                    </div>
                    
                    <div>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Scan History Session:</h4>
                        <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: 8, height: 200, overflowY: 'auto' }}>
                            {logs.length === 0 ? (
                                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Waiting for scans...</div>
                            ) : (
                                logs.map((lg, i) => (
                                    <div key={i} style={{ padding: '10px 15px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lg.time}</span>
                                        <span style={{ fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>[{lg.code}]</span>
                                        <span style={{ color: lg.success ? '#10b981' : '#ef4444', fontSize: '0.85rem' }}>{lg.status}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
                
                <div style={{ padding: '15px 25px', borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    {mode === 'checkout' && employee && (
                        <button className="btn-nav" onClick={() => { setEmployee(null); setLogs([]); setMessage('Scan next Employee ID Badge...'); }}>Reset Employee</button>
                    )}
                    <button className="btn-nav" onClick={onClose}>Close Scanner</button>
                </div>
            </div>
        </div>
    );
}
