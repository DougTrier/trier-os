// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Vendor Portal View
 * ================================
 * External vendor collaboration portal giving approved vendors secure access
 * to submit quotes, view RFQs, and communicate with the plant team.
 * Connects to /api/vendor-portal endpoints (server/routes/vendor_portal.js).
 *
 * TABS:
 *   Vendors          — Vendor directory with portal access status and token management
 *   RFQ (Requests)   — Request for Quote board: open RFQs vendors can respond to
 *   Quote Responses  — Review and compare submitted vendor quotes
 *   Messaging        — Threaded messages between plant team and vendor contacts
 *   Access Tokens    — Generate and revoke vendor portal access tokens
 *
 * VENDOR ACCESS TOKENS: Generated with crypto.randomBytes(32) on the server.
 *   Tokens allow vendors to log in to the vendor portal without a full user account.
 *   Each token is scoped to a single vendor and can be revoked at any time.
 *
 * RFQ WORKFLOW: Plant creates RFQ → Vendor receives notification → Vendor submits quote
 *   → Plant reviews and accepts/rejects → Accepted quote converts to PO.
 *
 * PRINT: Vendor comparison report and RFQ summary via PrintEngine.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Globe, X, MessageSquare, FileText, Key, KeyRound, Eye, Pencil, Printer, Save } from 'lucide-react';
import { formatDate } from '../utils/formatDate';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';
import SearchBar from './SearchBar';
import { TakeTourButton } from './ContextualTour';
import { useTranslation } from '../i18n/index.jsx';

const API = (path, o = {}) => fetch(`/api/vendor-portal${path}`, { ...o, headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}`, 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1', ...o.headers } });
const Badge = ({ color, children }) => <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44` }}>{children}</span>;

const ActionBtn = ({ icon: Icon, tip, color, onClick }) => <button onClick={onClick} title={tip} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, color, display: 'flex', alignItems: 'center', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = `${color}22`} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Icon size={16} /></button>;
const InfoRow = ({ label, value }) => <div style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}><div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div><div style={{ fontSize: '0.85rem' }}>{value || '—'}</div></div>;
const inputStyle = { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem' };

function DetailHeader({ title, color, onPrint, onEdit, editing, onSave, onCancel, onClose }) {
    const { t } = useTranslation();
    return (
        <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0, flex: 1, fontSize: '1.05rem', color }}>{title}</h3>
            {!editing ? (<>
                {onPrint && <button className="btn-nav" onClick={onPrint} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, fontSize: '0.78rem' }} title="Print"><Printer size={14} /> Print</button>}
                {onEdit && <button className="btn-nav" onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, fontSize: '0.78rem', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }} title="Edit"><Pencil size={14} /> Edit</button>}
            </>) : (<>
                <button className="btn-nav" onClick={onSave} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, fontSize: '0.78rem', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }} title="Save"><Save size={14} /> Save</button>
                <button className="btn-nav" onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, fontSize: '0.78rem' }} title="Cancel">{t('common.cancel', 'Cancel')}</button>
            </>)}
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }} title="Close"><X size={18} /></button>
        </div>
    );
}

export default function VendorPortalView({ plantId }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('vendors');
    const [search, setSearch] = useState('');
    const tabs = [
        { id: 'vendors', label: 'Vendor Access', icon: Key },
        { id: 'rfq', label: 'RFQ', icon: FileText },
        { id: 'messages', label: 'Messages', icon: MessageSquare },
    ];
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)' }}>
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 10 }}><Globe size={24} /> Vendor Portal</h2>
                <div style={{ width: 2, height: 30, background: 'var(--glass-border)' }} />
                <div className="nav-pills no-print">
                    {tabs.map(tabItem => (<button key={tabItem.id} onClick={() => setTab(tabItem.id)} className={`btn-nav ${tab === tabItem.id ? 'active' : ''}`} title="Tab"><tabItem.icon size={16} style={{ marginRight: 4 }} />{tabItem.label}</button>))}
                </div>
                <SearchBar value={search} onChange={setSearch} placeholder={t('vendorPortal.searchVendorsPlaceholder')} width={220} style={{ marginLeft: 'auto' }} />
                <TakeTourButton tourId="vendor-portal" nestedTab={tab} />
            </div>
            <div style={{ flex: 1, display: 'flex' }}>
                {tab === 'vendors' && <VendorsTab search={search} />}
                {tab === 'rfq' && <RFQTab search={search} />}
                {tab === 'messages' && <MessagesTab search={search} />}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VENDOR ACCESS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function VendorsTab({ search }) {
    const { t } = useTranslation();
    const [vendors, setVendors] = useState([]); const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const ef = (k, v) => setEditForm(p => ({ ...p, [k]: v }));

    const fetchVendors = useCallback(() => {
        setLoading(true);
        API('/vendors').then(r => r.json()).then(d => { setVendors(d); setLoading(false); }).catch(() => setLoading(false));
    }, []);
    useEffect(() => { fetchVendors(); }, [fetchVendors]);

    const f = useMemo(() => { if (!search) return vendors; const s = search.toLowerCase(); return vendors.filter(v => (v.VendorID || '').toLowerCase().includes(s) || (v.ContactName || '').toLowerCase().includes(s) || (v.ContactEmail || '').toLowerCase().includes(s)); }, [vendors, search]);

    const loadDetail = async (id) => { const r = await API(`/vendors/${id}`); if (r.ok) { setDetail(await r.json()); setEditing(false); } };
    const startEdit = () => { const v = detail.vendor; setEditForm({ ContactName: v.ContactName || '', ContactEmail: v.ContactEmail || '' }); setEditing(true); };

    if (loading) return <LoadingSpinner />;
    return (<>
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
            <h2 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 10 }}><KeyRound size={24} color="#a855f7" /> Vendor Portal Access ({f.length})</h2>
            <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>{t('vendorPortal.vendorId')}</th><th>{t('vendorPortal.contact')}</th><th>{t('vendorPortal.email')}</th><th>{t('vendorPortal.token')}</th><th>{t('vendorPortal.tokenExpiry')}</th><th>{t('vendorPortal.lastLogin')}</th><th>{t('vendorPortal.status')}</th><th>{t('vendorPortal.actions')}</th></tr></thead>
                    <tbody>{f.map(v => (<tr key={v.ID}><td style={{ fontWeight: 600 }}>{v.VendorID}</td><td>{v.ContactName || '—'}</td><td>{v.ContactEmail || '—'}</td><td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{v.AccessToken || '—'}</td><td>{formatDate(v.TokenExpiry) || '—'}</td><td>{formatDate(v.LastLogin) || 'Never'}</td><td><Badge color={v.Active ? '#10b981' : '#ef4444'}>{v.Active ? 'Active' : 'Revoked'}</Badge></td>
                        <td style={{ display: 'flex', gap: 2 }}><ActionBtn icon={Eye} tip="View vendor detail" color="#3b82f6" onClick={() => loadDetail(v.ID)} /><ActionBtn icon={Pencil} tip="Edit vendor" color="#f59e0b" onClick={() => { loadDetail(v.ID).then(() => setTimeout(startEdit, 200)); }} /></td></tr>))}
                        {f.length === 0 && <tr><td colSpan={8} className="table-empty">No portal access granted yet.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
        {detail && (
            <div className="modal-overlay" onClick={() => { setDetail(null); setEditing(false); }}>
                <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
                    <DetailHeader title={<><Key size={20} /> {detail.vendor.VendorID}</>} color="#a855f7"
                        onPrint={() => window.triggerTrierPrint('vendor-portal-access', detail)} onEdit={startEdit}
                        editing={editing} onSave={async () => { await API(`/vendors/${detail.vendor.ID}`, { method: 'PUT', body: JSON.stringify(editForm) }); setEditing(false); loadDetail(detail.vendor.ID); fetchVendors(); }} onCancel={() => setEditing(false)} onClose={() => { setDetail(null); setEditing(false); }} />
                    <div style={{ padding: 20, overflowY: 'auto', maxHeight: '65vh' }}>
                        {!editing ? (<>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                                <InfoRow label="Vendor ID" value={detail.vendor.VendorID} />
                                <InfoRow label="Contact Name" value={detail.vendor.ContactName} />
                                <InfoRow label="Email" value={detail.vendor.ContactEmail} />
                                <InfoRow label="Status" value={detail.vendor.Active ? 'Active' : 'Revoked'} />
                                <InfoRow label="Token" value={detail.vendor.AccessToken} />
                                <InfoRow label="Token Expiry" value={formatDate(detail.vendor.TokenExpiry)} />
                                <InfoRow label="Last Login" value={formatDate(detail.vendor.LastLogin) || 'Never'} />
                                <InfoRow label="Created" value={formatDate(detail.vendor.CreatedAt)} />
                            </div>
                            {detail.rfqs?.length > 0 && (
                                <div className="panel-box" style={{ padding: 14, marginBottom: 15 }}>
                                    <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>ASSOCIATED RFQs ({detail.rfqs.length})</strong>
                                    {detail.rfqs.map(r => <div key={r.ID} style={{ padding: '4px 0', fontSize: '0.85rem' }}><span style={{ color: '#3b82f6', fontWeight: 600 }}>{r.RFQNumber}</span> — {r.Title} <Badge color={r.Status === 'Awarded' ? '#10b981' : '#3b82f6'}>{t('status.' + (r.Status || '').replace(/\s+/g, ''), r.Status)}</Badge></div>)}
                                </div>
                            )}
                            {detail.messages?.length > 0 && (
                                <div className="panel-box" style={{ padding: 14 }}>
                                    <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>RECENT MESSAGES ({detail.messages.length})</strong>
                                    {detail.messages.slice(0, 5).map(m => <div key={m.ID} style={{ padding: '4px 0', fontSize: '0.82rem', display: 'flex', gap: 8 }}><Badge color={m.Direction === 'inbound' ? '#10b981' : '#3b82f6'}>{m.Direction === 'inbound' ? '← IN' : '→ OUT'}</Badge><span>{m.Subject || '(no subject)'}</span></div>)}
                                </div>
                            )}
                        </>) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Contact Name</label><input value={editForm.ContactName} onChange={e => ef('ContactName', e.target.value)} style={inputStyle} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Contact Email</label><input value={editForm.ContactEmail} onChange={e => ef('ContactEmail', e.target.value)} style={inputStyle} /></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RFQ TAB
// ═══════════════════════════════════════════════════════════════════════════════
function RFQTab({ search }) {
    const { t } = useTranslation();
    const [rfqs, setRfqs] = useState([]); const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const ef = (k, v) => setEditForm(p => ({ ...p, [k]: v }));

    const fetchRfqs = useCallback(() => {
        setLoading(true);
        API('/rfq').then(r => r.json()).then(d => { setRfqs(d); setLoading(false); }).catch(() => setLoading(false));
    }, []);
    useEffect(() => { fetchRfqs(); }, [fetchRfqs]);

    const stColor = (s) => ({ 'Open': '#3b82f6', 'Submitted': '#f59e0b', 'Quoted': '#a855f7', 'Awarded': '#10b981', 'Closed': '#64748b', 'Draft': '#64748b' }[s] || '#64748b');
    const f = useMemo(() => { if (!search) return rfqs; const s = search.toLowerCase(); return rfqs.filter(r => (r.Title || '').toLowerCase().includes(s) || (r.RFQNumber || '').toLowerCase().includes(s) || (r.VendorID || '').toLowerCase().includes(s)); }, [rfqs, search]);

    const loadDetail = async (id) => { const r = await API(`/rfq/${id}`); if (r.ok) { setDetail(await r.json()); setEditing(false); } };
    const startEdit = () => { const r = detail.rfq; setEditForm({ Title: r.Title || '', Description: r.Description || '', Status: r.Status || 'Open', DueDate: r.DueDate?.split('T')[0] || '', RequestedBy: r.RequestedBy || '', VendorID: r.VendorID || '' }); setEditing(true); };

    if (loading) return <LoadingSpinner />;
    return (<>
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
            <h2 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 10 }}><FileText size={24} color="#3b82f6" /> Requests for Quote ({f.length})</h2>
            <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table className="data-table">
                    <thead><tr><th>{t('vendorPortal.rfq')}</th><th>{t('vendorPortal.title')}</th><th>{t('vendorPortal.vendor')}</th><th>{t('vendorPortal.dueDate')}</th><th>{t('vendorPortal.items')}</th><th>{t('vendorPortal.status')}</th><th>{t('vendorPortal.requestedBy')}</th><th>{t('vendorPortal.actions')}</th></tr></thead>
                    <tbody>{f.map(r => (<tr key={r.ID}><td style={{ fontWeight: 600, color: '#3b82f6' }}>{r.RFQNumber}</td><td>{r.Title}</td><td>{r.VendorID || '—'}</td><td>{formatDate(r.DueDate) || '—'}</td><td>{r.itemCount || 0}</td><td><Badge color={stColor(r.Status)}>{t('status.' + (r.Status || '').replace(/\s+/g, ''), r.Status)}</Badge></td><td>{r.RequestedBy || '—'}</td>
                        <td style={{ display: 'flex', gap: 2 }}><ActionBtn icon={Eye} tip="View RFQ detail" color="#3b82f6" onClick={() => loadDetail(r.ID)} /><ActionBtn icon={Pencil} tip="Edit RFQ" color="#f59e0b" onClick={() => { loadDetail(r.ID).then(() => setTimeout(startEdit, 200)); }} /></td></tr>))}
                        {f.length === 0 && <tr><td colSpan={8} className="table-empty">No RFQs created.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
        {detail && (
            <div className="modal-overlay" onClick={() => { setDetail(null); setEditing(false); }}>
                <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
                    <DetailHeader title={<><FileText size={20} /> {detail.rfq.RFQNumber} — {detail.rfq.Title}</>} color="#3b82f6"
                        onPrint={() => window.triggerTrierPrint('vendor-rfq-detail', detail)} onEdit={startEdit}
                        editing={editing} onSave={async () => { await API(`/rfq/${detail.rfq.ID}`, { method: 'PUT', body: JSON.stringify(editForm) }); setEditing(false); loadDetail(detail.rfq.ID); fetchRfqs(); }} onCancel={() => setEditing(false)} onClose={() => { setDetail(null); setEditing(false); }} />
                    <div style={{ padding: 20, overflowY: 'auto', maxHeight: '65vh' }}>
                        {!editing ? (<>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                                <InfoRow label="RFQ Number" value={detail.rfq.RFQNumber} />
                                <InfoRow label="Vendor" value={detail.rfq.VendorID} />
                                <InfoRow label="Status" value={detail.rfq.Status} />
                                <InfoRow label="Due Date" value={formatDate(detail.rfq.DueDate)} />
                                <InfoRow label="Requested By" value={detail.rfq.RequestedBy} />
                                <InfoRow label="Awarded Date" value={formatDate(detail.rfq.AwardedDate)} />
                            </div>
                            {detail.rfq.Description && <div className="panel-box" style={{ padding: 14, marginBottom: 15 }}><strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>DESCRIPTION</strong><p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>{detail.rfq.Description}</p></div>}
                            {detail.items?.length > 0 && (
                                <div className="panel-box" style={{ padding: 14, marginBottom: 15 }}>
                                    <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10, display: 'block' }}>LINE ITEMS ({detail.items.length})</strong>
                                    <table className="data-table" style={{ fontSize: '0.8rem' }}>
                                        <thead><tr><th>{t('vendorPortal.part')}</th><th>{t('vendorPortal.description')}</th><th>{t('vendorPortal.qty')}</th><th>{t('vendorPortal.unit')}</th><th>{t('vendorPortal.target')}</th><th>{t('vendorPortal.quoted')}</th><th>{t('vendorPortal.leadTime')}</th></tr></thead>
                                        <tbody>{detail.items.map(i => (<tr key={i.ID}><td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{i.PartNumber || '—'}</td><td>{i.Description}</td><td>{i.Quantity}</td><td>{i.Unit}</td><td>{i.TargetPrice ? `$${Number(i.TargetPrice).toLocaleString()}` : '—'}</td><td style={{ color: i.QuotedPrice ? '#10b981' : 'var(--text-muted)' }}>{i.QuotedPrice ? `$${Number(i.QuotedPrice).toLocaleString()}` : 'Pending'}</td><td>{i.LeadTimeDays ? `${i.LeadTimeDays} days` : '—'}</td></tr>))}</tbody>
                                    </table>
                                    <div style={{ marginTop: 12, display: 'flex', gap: 20, fontSize: '0.82rem' }}>
                                        <span>{t('vendorPortal.targetTotal')} <strong>${Number(detail.totalTarget || 0).toLocaleString()}</strong></span>
                                        <span>{t('vendorPortal.quotedTotal')} <strong style={{ color: '#10b981' }}>${Number(detail.totalQuoted || 0).toLocaleString()}</strong></span>
                                        {detail.savings > 0 && <span>Savings: <strong style={{ color: '#f59e0b' }}>${Number(detail.savings).toLocaleString()}</strong></span>}
                                    </div>
                                </div>
                            )}
                        </>) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Title</label><input value={editForm.Title} onChange={e => ef('Title', e.target.value)} style={inputStyle} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Vendor ID</label><input value={editForm.VendorID} onChange={e => ef('VendorID', e.target.value)} style={inputStyle} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Status</label><select value={editForm.Status} onChange={e => ef('Status', e.target.value)} style={inputStyle}><option value="Draft">Draft</option><option value="Open">Open</option><option value="Submitted">Submitted</option><option value="Quoted">Quoted</option><option value="Awarded">Awarded</option><option value="Closed">Closed</option></select></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Due Date</label><input type="date" value={editForm.DueDate} onChange={e => ef('DueDate', e.target.value)} style={inputStyle} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Requested By</label><input value={editForm.RequestedBy} onChange={e => ef('RequestedBy', e.target.value)} style={inputStyle} /></div>
                                <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Description</label><textarea value={editForm.Description} onChange={e => ef('Description', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGES TAB
// ═══════════════════════════════════════════════════════════════════════════════
function MessagesTab({ search }) {
    const { t } = useTranslation();
    const [vendors, setVendors] = useState([]);
    const [selected, setSelected] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        API('/vendors').then(r => r.json()).then(d => { setVendors(d.filter(v => v.Active)); setLoading(false); }).catch(() => setLoading(false));
    }, []);

    const loadMessages = async (vendorId) => {
        setSelected(vendorId);
        const r = await fetch(`/api/vendor-portal/messages/${vendorId}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } });
        if (r.ok) setMessages(await r.json());
    };

    const filteredVendors = useMemo(() => { if (!search) return vendors; const s = search.toLowerCase(); return vendors.filter(v => (v.VendorID || '').toLowerCase().includes(s) || (v.ContactName || '').toLowerCase().includes(s)); }, [vendors, search]);

    if (loading) return <LoadingSpinner />;
    return (
        <div style={{ flex: 1, display: 'flex', gap: 'var(--spacing-base)' }}>
            <div className="glass-card" style={{ width: 280, flexShrink: 0, padding: 15, overflowY: 'auto' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Active Vendors</h3>
                {filteredVendors.map(v => (
                    <div key={v.ID} onClick={() => loadMessages(v.VendorID)} style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 4, cursor: 'pointer', background: selected === v.VendorID ? 'rgba(168,85,247,0.15)' : 'transparent', border: selected === v.VendorID ? '1px solid rgba(168,85,247,0.3)' : '1px solid transparent', transition: 'all 0.15s' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{v.VendorID}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{v.ContactName || 'No contact'}</div>
                    </div>
                ))}
                {filteredVendors.length === 0 && <EmptyState title={t('vendorPortal.noActiveVendorsTip')} style={{ padding: '20px' }} />}
            </div>
            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
                {!selected ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
                        <MessageSquare size={48} color="#64748b" />
                        <p style={{ color: 'var(--text-muted)' }}>Select a vendor to view message thread</p>
                    </div>
                ) : (<>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15, paddingBottom: 15, borderBottom: '1px solid var(--glass-border)' }}>
                        <h3 style={{ margin: 0, flex: 1 }}><MessageSquare size={20} style={{ marginRight: 8 }} />{selected} — Messages ({messages.length})</h3>
                        <button className="btn-nav" onClick={() => window.triggerTrierPrint('vendor-messages', { vendorId: selected, messages })} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, fontSize: '0.78rem' }} title="Print"><Printer size={14} /> Print</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {messages.map(m => (
                            <div key={m.ID} style={{ marginBottom: 12, padding: '12px 16px', borderRadius: 10, background: m.Direction === 'inbound' ? 'rgba(16,185,129,0.06)' : 'rgba(59,130,246,0.06)', borderLeft: `3px solid ${m.Direction === 'inbound' ? '#10b981' : '#3b82f6'}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <Badge color={m.Direction === 'inbound' ? '#10b981' : '#3b82f6'}>{m.Direction === 'inbound' ? '← Received' : '→ Sent'}</Badge>
                                    <strong style={{ fontSize: '0.85rem' }}>{m.Subject || '(no subject)'}</strong>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatDate(m.CreatedAt)}{m.SentBy ? ` • ${m.SentBy}` : ''}</span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{m.Body}</p>
                            </div>
                        ))}
                        {messages.length === 0 && <EmptyState title={t('vendorPortal.noMessagesWithThisVendorTip')} message="Messages will appear here once communication is initiated." />}
                    </div>
                </>)}
            </div>
        </div>
    );
}
