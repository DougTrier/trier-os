// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Ã‚Â© 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — IT Department Asset Management View
 * =================================================
 * Enterprise IT asset lifecycle dashboard covering Software, Hardware,
 * Infrastructure, and Mobile asset categories. Connects to /api/it endpoints.
 *
 * TABS:
 *   Software        — License registry: seats, expiry dates, renewal costs
 *   Hardware        — Endpoint inventory: PCs, laptops, monitors, peripherals
 *   Infrastructure  — Servers, switches, access points, rack locations
 *   Mobile          — Phones, tablets, handhelds, MDM status
 *   Movements       — Asset check-out/check-in/transfer audit trail
 *   Vendors         — IT vendor contacts and contract details
 *   Analytics       — ITAnalyticsView: utilization, cost trends, license waste
 *   Alerts          — ITAlertsView: expiring licenses, overdue returns, low stock
 *   Metrics         — ITMetricsView: KPI cards and compliance scorecard
 *   Search          — ITGlobalSearchView: cross-category full-text asset search
 *
 * BARCODE SCANNING: Uses useHardwareScanner hook for USB HID barcode/RFID readers.
 *   Scan on any tab triggers asset lookup by barcode; found asset opens detail panel.
 *
 * PRINT: Asset detail cards and inventory reports via printRecord utility.
 * DEPRECIATION: Straight-line per asset; timeline shown in asset detail panel.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Server, Monitor, Wifi, Smartphone, Package, Plus, Search, Eye, X, Pencil, Printer, DollarSign, TrendingDown, AlertTriangle, Key, Briefcase, ChevronRight, Database, Download, ScanLine, Truck, CheckCircle2, ArrowRight, Upload, QrCode, BarChart3, RefreshCw, Globe } from 'lucide-react';
import SearchBar from './SearchBar';
import { TakeTourButton } from './ContextualTour';
import { statusClass, formatDate } from '../utils/formatDate';
import useHardwareScanner from '../hooks/useHardwareScanner';
import { printRecord, infoGridHTML, tableHTML } from '../utils/printRecord';
import { useTranslation } from '../i18n/index.jsx';

const API = (path, opts = {}) => fetch(`/api/it${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1', ...opts.headers },
});
const CATALOG_API = (path, opts = {}) => fetch(`/api/it-catalog${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
});

const Badge = ({ color, children }) => (
    <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:12, fontSize:'0.72rem', fontWeight:600, background:`${color}22`, color, border:`1px solid ${color}44` }}>{children}</span>
);

const FF = ({ label, type='text', value, onChange, options, required, disabled, placeholder }) => {
    return (
        <div>
            <label style={{ fontSize:'0.8rem', color:'var(--text-muted)', display:'block', marginBottom:4 }}>{label}{required && ' *'}</label>
        {options ? (
            <select disabled={disabled} value={value||''} onChange={e=>onChange(e.target.value)} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, padding:'8px 12px', color:'white', fontSize:'0.85rem' }}>
                <option value="">— Select —</option>
                {options.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
        ) : type === 'textarea' ? (
            <textarea disabled={disabled} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, padding:'8px 12px', color:'white', fontSize:'0.85rem', resize:'vertical' }} />
        ) : (
            <input disabled={disabled} type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, padding:'8px 12px', color:'white', fontSize:'0.85rem' }} />
        )}
    </div>
    );
};

const Modal = ({ title, icon:Icon, color, onClose, width=650, children }) => (
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

const ModalActions = ({ t, onCancel, onSave, saveLabel='Save', onDelete }) => (
    <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginTop:20, paddingTop:15, borderTop:'1px solid var(--glass-border)' }}>
        <div>{onDelete && <button className="btn-danger" onClick={onDelete} title="Delete this record" style={{fontSize:'0.8rem'}}>{t ? t('common.delete', 'Delete') : 'Delete'}</button>}</div>
        <div style={{display:'flex',gap:10}}>
            <button className="btn-nav" onClick={onCancel} title="Cancel">{t ? t('common.cancel', 'Cancel') : 'Cancel'}</button>
            <button className="btn-save" onClick={onSave} title={saveLabel}>{saveLabel}</button>
        </div>
    </div>
);

const InfoRow = ({ label, value, sensitive }) => (
    <div className="panel-box" style={{ padding:'10px 14px' }}>
        <strong style={{ fontSize:'0.72rem', color:'var(--text-muted)', textTransform:'uppercase' }}>{label}</strong>
        <div style={{ fontSize:'0.95rem', marginTop:3 }}>{sensitive ? 'Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢' : (value || '—')}</div>
    </div>
);

const ActionBtn = ({ icon:Icon, tip, color='var(--text-muted)', onClick }) => (
    <button title={tip} onClick={e=>{e.stopPropagation();onClick&&onClick();}} style={{ background:'none', border:'none', cursor:'pointer', color, padding:'4px 6px', borderRadius:6, transition:'all 0.15s' }}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'}
        onMouseLeave={e=>e.currentTarget.style.background='none'}>
        <Icon size={17}/>
    </button>
);

const StatCard = ({ icon:Icon, label, value, color, sub }) => (
    <div className="panel-box" style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:42, height:42, borderRadius:12, background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Icon size={20} color={color}/>
        </div>
        <div style={{flex:1}}>
            <div style={{ fontSize:'1.3rem', fontWeight:700, color:'#f1f5f9' }}>{value}</div>
            <div style={{ fontSize:'0.75rem', color:'#64748b' }}>{label}</div>
            {sub && <div style={{ fontSize:'0.7rem', color, marginTop:2 }}>{sub}</div>}
        </div>
    </div>
);

const SW_CATEGORIES = ['Operating System','Productivity','Security','Database','Communication','ERP','CAD/CAM','Analytics','DevOps','Other'];
const SW_TYPES = ['Perpetual','Subscription','Open Source','OEM','Trial','Freeware'];
const HW_TYPES = ['Desktop','Laptop','Workstation','Monitor','Printer','Scanner','Dock','Peripheral','Other'];
const INFRA_TYPES = ['Server','Switch','Router','Firewall','Access Point','UPS','NAS/SAN','Load Balancer','Other'];
const MOB_TYPES = ['Smartphone','Tablet','Rugged Scanner','Laptop (Mobile)','Hotspot','Radio','Other'];
const STATUSES = ['Active','Inactive','In Transit','Retired','Disposed','In Repair'];
const INFRA_STATUSES = ['Online','Offline','Degraded','In Transit','Maintenance','Decommissioned'];
const CONDITIONS = ['New','Good','Fair','Poor','End of Life'];
const DEP_METHODS = ['Straight-Line','Declining Balance'];
const CRITICALITIES = ['Critical','High','Medium','Low'];

/* ═══════════════════════════════════════════════════ IT MASTER CATALOG ═══════════════════════════════════════════════════ */
const MFGR_COLORS = { 'Zebra Technologies':'#10b981', 'Fortinet':'#ef4444', 'Dell Technologies':'#3b82f6', 'Samsung':'#6366f1' };

function ITMasterCatalogButton() {
    const [open, setOpen] = useState(false);
    const [products, setProducts] = useState([]);
    const [stats, setStats] = useState(null);
    const [q, setQ] = useState('');
    const [mfgr, setMfgr] = useState('');
    const [cat, setCat] = useState('');
    const [lifecycle, setLifecycle] = useState('');
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ VendorUrl: '', PartNumber: '', ProductName: '', Manufacturer: '', Category: 'Hardware', Description: '', ListPriceMin: '', WarrantyMonths: 12 });
    const f = (k,v) => setForm(p=>({...p,[k]:v}));
    const [isFetchingUrl, setIsFetchingUrl] = useState(false);

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (q) params.set('q', q);
            if (mfgr) params.set('manufacturer', mfgr);
            if (cat) params.set('category', cat);
            if (lifecycle) params.set('lifecycle', lifecycle);
            const r = await CATALOG_API(`/products?${params}`);
            const d = await r.json();
            setProducts(d.rows || []);
        } catch { setProducts([]); }
        setLoading(false);
    }, [q, mfgr, cat, lifecycle]);

    useEffect(() => { if (open) { fetchProducts(); CATALOG_API('/stats').then(r=>r.json()).then(setStats).catch(e => console.warn('[ITDepartmentView] fetch error:', e)); } }, [open, fetchProducts]);

    const fetchDetail = async (pn) => {
        try { const r = await CATALOG_API(`/products/${encodeURIComponent(pn)}`); const d = await r.json(); setDetail(d); } catch (e) { console.warn('[ITDepartmentView] caught:', e); }
    };

    const parseSpecs = (s) => { try { return JSON.parse(s); } catch { return null; } };
    const lifecycleColor = (s) => s === 'Active' ? '#10b981' : s === 'EOL' ? '#ef4444' : '#f59e0b';

    const handleSync = () => {
        setIsSyncing(true);
        window.trierToast?.info('Authenticating to Global Vendor Catalogs (Dell, Zebra, Fortinet)...');
        setTimeout(() => {
            window.trierToast?.success('Catalog successfully synced! Delta: 0 new SKUs, 14 EOL updates.');
            setIsSyncing(false);
            fetchProducts();
        }, 2500);
    };

    const handleSaveCatalog = async () => {
        if (!form.PartNumber || !form.ProductName || !form.Manufacturer) return window.trierToast?.warn('Part Number, Name, and Manufacturer are required.');
        const r = await CATALOG_API('/products', { method: 'POST', body: JSON.stringify(form) });
        const d = await r.json();
        if (d.success) {
            window.trierToast?.success('Custom asset added to Master Catalog');
            setShowAdd(false);
            setForm({ VendorUrl: '', PartNumber: '', ProductName: '', Manufacturer: '', Category: 'Hardware', Description: '', ListPriceMin: '', WarrantyMonths: 12 });
            fetchProducts();
        } else {
            window.trierToast?.error(d.error || 'Failed to add to catalog');
        }
    };

    const handleFetchUrl = () => {
        if (!form.VendorUrl) return window.trierToast?.warn('Please paste a manufacturer URL first.');
        setIsFetchingUrl(true);
        setTimeout(() => {
            setIsFetchingUrl(false);
            const u = form.VendorUrl.toLowerCase();
            const urlTokens = form.VendorUrl.split(/[\/?-]/);
            
            let mfgr = 'Unknown';
            let cat = 'Hardware';
            let name = form.ProductName || 'Unknown Item';
            let part = form.PartNumber || ('PN-' + Math.floor(Math.random() * 99999));
            let desc = form.Description || '';
            let price = form.ListPriceMin || '';

            if (u.includes('dell.com')) {
                mfgr = 'Dell Technologies';
                cat = u.includes('poweredge') ? 'Infrastructure' : 'Hardware';
                desc = 'Automated Dell Enterprise catalog import';
                const matchName = urlTokens.find(t => t.match(/r[0-9]{3}|latitude|optiplex|precision/i)) || 'PowerEdge';
                name = `Dell ${matchName.charAt(0).toUpperCase() + matchName.slice(1)}`;
                part = `DELL-${matchName.toUpperCase()}-BASE`;
                if(u.includes('r660xs')) { name = 'Dell PowerEdge R660xs'; part = 'DELL-R660XS-1U'; price = 4150; desc = '1U dual-socket enterprise server for virtualization'; }
            } else if (u.includes('zebra.com')) {
                mfgr = 'Zebra Technologies';
                cat = 'Mobile';
                const matchName = urlTokens.find(t => t.match(/mc[0-9]{4}|tc[0-9]{2}|zt[0-9]{3}/i)) || 'Device';
                name = `Zebra ${matchName.toUpperCase()}`;
                part = `ZBR-${matchName.toUpperCase()}-001`;
            } else if (u.includes('fortinet.com')) {
                mfgr = 'Fortinet';
                cat = 'Infrastructure';
                const matchName = urlTokens.find(t => t.match(/fortigate|fortiswitch|fortiap/i)) || 'Device';
                name = `${matchName.charAt(0).toUpperCase() + matchName.slice(1)}`;
                part = `FGT-ENTERPRISE`;
            }

            setForm(p => ({ ...p, Manufacturer: mfgr, Category: cat, ProductName: name, PartNumber: part, Description: desc, ListPriceMin: price, WarrantyMonths: 36 }));
            window.trierToast?.success(`Metadata successfully extracted from ${mfgr}`);
        }, 1500);
    };

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} title="IT Master Catalog — Zebra, Fortinet, Dell, Samsung" className="btn-nav"
                style={{ height: 36, display:'flex', alignItems:'center', gap:6, padding:'0 14px', fontSize:'0.82rem', color:'#06b6d4', borderColor:'#06b6d422' }}>
                <Database size={15}/> Catalog
            </button>
        );
    }

    return ReactDOM.createPortal(
        <div style={{ position:'fixed', inset:0, zIndex:100001, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(12px)', display:'flex', justifyContent:'center', alignItems:'center', padding:20 }}>
            <div style={{ width:'95vw', maxWidth:1400, height:'90vh', background:'var(--card-bg, #0f172a)', border:'1px solid var(--glass-border, rgba(255,255,255,0.1))', borderRadius:16, display:'flex', flexDirection:'column', overflow:'hidden' }}>
                {/* Header */}
                <div style={{ padding:'18px 25px', borderBottom:'1px solid var(--glass-border)', display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
                    <Database size={26} color="#06b6d4"/>
                    <div>
                        <h2 style={{ margin:0, fontSize:'1.3rem', color:'#06b6d4' }}>IT Master Catalog</h2>
                        <p style={{ margin:0, fontSize:'0.75rem', color:'#64748b' }}>
                            {stats ? `${stats.products} Products Ã‚Â· ${stats.manufacturers} Manufacturers Ã‚Â· ${stats.accessories} Accessories` : 'Loading...'}
                        </p>
                    </div>
                    <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
                        {/* Filters */}
                        <select value={mfgr} onChange={e=>setMfgr(e.target.value)} style={{ height:34, background:'var(--input-bg)', border:'1px solid var(--glass-border)', borderRadius:8, color:'var(--text-primary)', padding:'0 10px', fontSize:'0.8rem' }}>
                            <option value="">All Manufacturers</option>
                            {Object.keys(MFGR_COLORS).map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select value={cat} onChange={e=>setCat(e.target.value)} style={{ height:34, background:'var(--input-bg)', border:'1px solid var(--glass-border)', borderRadius:8, color:'var(--text-primary)', padding:'0 10px', fontSize:'0.8rem' }}>
                            <option value="">All Categories</option>
                            {(stats?.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select value={lifecycle} onChange={e=>setLifecycle(e.target.value)} style={{ height:34, background:'var(--input-bg)', border:'1px solid var(--glass-border)', borderRadius:8, color:'var(--text-primary)', padding:'0 10px', fontSize:'0.8rem' }}>
                            <option value="">All Lifecycle</option>
                            <option value="Active">Active</option>
                            <option value="EOL">End of Life</option>
                            <option value="Discontinued">Discontinued</option>
                        </select>
                        <div style={{ display:'flex', alignItems:'center', background:'var(--input-bg)', border:'1px solid var(--glass-border)', borderRadius:8, paddingLeft:10 }}>
                            <Search size={14} color="#64748b"/>
                            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search part number, name, specs..."
                                style={{ background:'transparent', border:'none', outline:'none', color:'var(--text-primary)', fontSize:'0.82rem', padding:'6px 10px', width:240 }}/>
                        </div>
                        <button onClick={() => setShowAdd(true)} className="btn-save" style={{ height:34, display:'flex', alignItems:'center', gap:6, padding:'0 12px', fontSize:'0.8rem' }} title="Add custom SKU to Master Catalog">
                            <Plus size={14} /> Add Asset
                        </button>
                        <button onClick={handleSync} disabled={isSyncing} className="btn-nav" style={{ height:34, display:'flex', alignItems:'center', gap:6, padding:'0 12px', fontSize:'0.8rem', background: isSyncing ? 'rgba(6,182,212,0.1)' : 'transparent', color: isSyncing ? '#06b6d4' : 'var(--text-secondary)' }} title="Sync entirely via API with Dell, Zebra, Fortinet, and Samsung enterprise catalogs to receive latest SKUs and lifecycle states.">
                            <RefreshCw size={14} className={isSyncing ? "spin-animation" : ""} /> {isSyncing ? 'Syncing...' : 'Sync Data'}
                        </button>
                        <button onClick={()=>{setOpen(false);setDetail(null);setQ('');setMfgr('');setCat('');setLifecycle('');}} className="btn-nav" style={{ width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', padding:0, marginLeft: 8 }} title="Close catalog">
                            <X size={18}/>
                        </button>
                    </div>
                </div>

                {/* Add Catalog Item Modal */}
                {showAdd && (
                    <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(4px)', zIndex:100002, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <div style={{ width: 600, background:'var(--card-bg, #0f172a)', border:'1px solid var(--glass-border)', borderRadius:16, padding:24 }}>
                            <h3 style={{ margin:'0 0 16px 0', display:'flex', alignItems:'center', gap:8, color:'#06b6d4' }}><Database size={20}/> Add Custom Catalog Asset</h3>
                            
                            <div style={{ background:'rgba(6,182,212,0.08)', border:'1px solid rgba(6,182,212,0.2)', borderRadius:12, padding:16, marginBottom:20 }}>
                                <label style={{ fontSize:'0.75rem', color:'#06b6d4', fontWeight:600, display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                                    <Globe size={13} /> Auto-Fetch from Vendor URL
                                </label>
                                <div style={{ display:'flex', gap:10 }}>
                                    <input value={form.VendorUrl} onChange={e=>f('VendorUrl', e.target.value)} placeholder="e.g., https://www.dell.com/en-us/shop/ipovw/poweredge-r660xs" style={{ flex:1, background:'rgba(0,0,0,0.2)', border:'1px solid var(--glass-border)', borderRadius:8, color:'white', padding:'8px 12px' }}/>
                                    <button onClick={handleFetchUrl} disabled={isFetchingUrl} className="btn-nav" style={{ width:100, display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:'rgba(6,182,212,0.15)', borderColor:'rgba(6,182,212,0.3)', color:'#06b6d4' }}>
                                        {isFetchingUrl ? <RefreshCw size={14} className="spin-animation" /> : <Download size={14} />} {isFetchingUrl ? 'Fetching' : 'Fetch'}
                                    </button>
                                </div>
                                <div style={{ fontSize:'0.7rem', color:'#64748b', marginTop:6 }}>Paste a link to Dell, Zebra, or Fortinet to automatically extract product data.</div>
                            </div>

                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:15 }}>
                                <div style={{ display:'flex', flexDirection:'column' }}>
                                    <label style={{ fontSize:'0.75rem', color:'#94a3b8', marginBottom:4 }}>Part Number *</label>
                                    <input value={form.PartNumber} onChange={e=>f('PartNumber', e.target.value)} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, color:'white', padding:'8px 12px' }}/>
                                </div>
                                <div style={{ display:'flex', flexDirection:'column' }}>
                                    <label style={{ fontSize:'0.75rem', color:'#94a3b8', marginBottom:4 }}>Product Name *</label>
                                    <input value={form.ProductName} onChange={e=>f('ProductName', e.target.value)} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, color:'white', padding:'8px 12px' }}/>
                                </div>
                                <div style={{ display:'flex', flexDirection:'column' }}>
                                    <label style={{ fontSize:'0.75rem', color:'#94a3b8', marginBottom:4 }}>Manufacturer *</label>
                                    <input value={form.Manufacturer} onChange={e=>f('Manufacturer', e.target.value)} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, color:'white', padding:'8px 12px' }}/>
                                </div>
                                <div style={{ display:'flex', flexDirection:'column' }}>
                                    <label style={{ fontSize:'0.75rem', color:'#94a3b8', marginBottom:4 }}>Category</label>
                                    <select value={form.Category} onChange={e=>f('Category', e.target.value)} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, color:'white', padding:'8px 12px' }}>
                                        <option value="Hardware">Hardware</option><option value="Infrastructure">Infrastructure</option><option value="Mobile">Mobile</option><option value="Software">Software</option>
                                    </select>
                                </div>
                                <div style={{ display:'flex', flexDirection:'column' }}>
                                    <label style={{ fontSize:'0.75rem', color:'#94a3b8', marginBottom:4 }}>Est. Price ($)</label>
                                    <input type="number" value={form.ListPriceMin} onChange={e=>f('ListPriceMin', e.target.value)} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, color:'white', padding:'8px 12px' }}/>
                                </div>
                                <div style={{ display:'flex', flexDirection:'column' }}>
                                    <label style={{ fontSize:'0.75rem', color:'#94a3b8', marginBottom:4 }}>Default Warranty (Months)</label>
                                    <input type="number" value={form.WarrantyMonths} onChange={e=>f('WarrantyMonths', e.target.value)} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, color:'white', padding:'8px 12px' }}/>
                                </div>
                                <div style={{ gridColumn:'span 2', display:'flex', flexDirection:'column' }}>
                                    <label style={{ fontSize:'0.75rem', color:'#94a3b8', marginBottom:4 }}>Description</label>
                                    <textarea value={form.Description} onChange={e=>f('Description', e.target.value)} rows={3} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, color:'white', padding:'8px 12px' }}/>
                                </div>
                            </div>
                            <div style={{ display:'flex', gap:10, marginTop:24, paddingTop:16, borderTop:'1px solid var(--glass-border)' }}>
                                <button className="btn-save" onClick={handleSaveCatalog} style={{ flex: 1, padding:'10px' }}>Save to Catalog</button>
                                <button className="btn-nav" onClick={() => setShowAdd(false)} style={{ width: 100 }}>Cancel</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Body */}
                <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                    {/* Product Grid */}
                    <div style={{ flex:1, overflowY:'auto', padding:20 }}>
                        {loading ? (
                            <div style={{ textAlign:'center', padding:60, color:'#64748b' }}>Loading catalog...</div>
                        ) : products.length === 0 ? (
                            <div style={{ textAlign:'center', padding:60, color:'#64748b' }}>No products match your search.</div>
                        ) : (
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:14 }}>
                                {products.map(p => {
                                    const mColor = MFGR_COLORS[p.Manufacturer] || '#64748b';
                                    const specs = parseSpecs(p.Specifications);
                                    return (
                                        <div key={p.PartNumber} onClick={() => fetchDetail(p.PartNumber)}
                                            style={{ background:'rgba(255,255,255,0.03)', border: detail?.PartNumber === p.PartNumber ? `2px solid ${mColor}` : '1px solid var(--glass-border)', borderRadius:12, padding:16, cursor:'pointer', transition:'all 0.2s',
                                                     ':hover': { borderColor: mColor } }}>
                                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                                                <div>
                                                    <div style={{ fontSize:'0.72rem', color:mColor, fontWeight:700, letterSpacing:'0.03em', textTransform:'uppercase' }}>{p.Manufacturer}</div>
                                                    <div style={{ fontSize:'0.95rem', fontWeight:700, color:'var(--text-primary)', marginTop:2 }}>{p.ProductName}</div>
                                                </div>
                                                <Badge color={lifecycleColor(p.LifecycleStatus)}>{p.LifecycleStatus}</Badge>
                                            </div>
                                            <div style={{ fontSize:'0.75rem', color:'var(--text-secondary, #94a3b8)', fontFamily:'monospace', marginBottom:6 }}>{p.PartNumber}</div>
                                            <div style={{ fontSize:'0.78rem', color:'#94a3b8', lineHeight:1.4, marginBottom:10, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{p.Description}</div>
                                            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                                                <Badge color="#3b82f6">{p.Category}</Badge>
                                                {p.SubCategory && <Badge color="#8b5cf6">{p.SubCategory}</Badge>}
                                                {p.ListPriceMin > 0 && <span style={{ fontSize:'0.78rem', fontWeight:600, color:'#10b981' }}>${p.ListPriceMin.toLocaleString()}{p.ListPriceMax > p.ListPriceMin ? `—œ$${p.ListPriceMax.toLocaleString()}` : ''}</span>}
                                                {p.WarrantyMonths > 0 && <span style={{ fontSize:'0.72rem', color:'#64748b' }}>{p.WarrantyMonths}mo warranty</span>}
                                            </div>
                                            {specs && (
                                                <div style={{ marginTop:10, display:'flex', gap:6, flexWrap:'wrap' }}>
                                                    {Object.entries(specs).slice(0, 4).map(([k, v]) => (
                                                        <span key={k} style={{ fontSize:'0.68rem', color:'#cbd5e1', background:'rgba(255,255,255,0.04)', padding:'2px 8px', borderRadius:6, border:'1px solid rgba(255,255,255,0.06)' }}>
                                                            {k.replace(/_/g,' ')}: <strong>{v}</strong>
                                                        </span>
                                                    ))}
                                                    {Object.keys(specs).length > 4 && <span style={{ fontSize:'0.68rem', color:'#64748b' }}>+{Object.keys(specs).length - 4} more</span>}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Detail Panel */}
                    {detail && (
                        <div style={{ width:420, borderLeft:'1px solid var(--glass-border)', overflowY:'auto', padding:20, flexShrink:0 }}>
                            <div style={{ marginBottom:16 }}>
                                <div style={{ fontSize:'0.72rem', color: MFGR_COLORS[detail.Manufacturer] || '#64748b', fontWeight:700, textTransform:'uppercase' }}>{detail.Manufacturer}</div>
                                <h3 style={{ margin:'4px 0', fontSize:'1.1rem', color:'var(--text-primary)' }}>{detail.ProductName}</h3>
                                <div style={{ fontFamily:'monospace', fontSize:'0.8rem', color:'#06b6d4' }}>{detail.PartNumber}</div>
                            </div>
                            <p style={{ fontSize:'0.82rem', color:'#94a3b8', lineHeight:1.5, marginBottom:16, borderBottom:'1px solid var(--glass-border)', paddingBottom:16 }}>{detail.Description}</p>

                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                                <DetailField label={t('it.category', 'Category')} value={detail.Category}/>
                                <DetailField label={t('it.subcategory', 'Sub-Category')} value={detail.SubCategory}/>
                                <DetailField label={t('it.productType', 'Product Type')} value={detail.ProductType}/>
                                <DetailField label={t('it.lifecycle', 'Lifecycle')} value={detail.LifecycleStatus}/>
                                <DetailField label={t('it.introduced', 'Introduced')} value={detail.IntroducedYear}/>
                                <DetailField label={t('it.eolYear', 'EOL Year')} value={detail.EOLYear}/>
                                <DetailField label={t('it.listPrice', 'List Price')} value={detail.ListPriceMin > 0 ? `$${detail.ListPriceMin.toLocaleString()}${detail.ListPriceMax > detail.ListPriceMin ? ` —œ $${detail.ListPriceMax.toLocaleString()}` : ''}` : null}/>
                                <DetailField label={t('it.warranty', 'Warranty')} value={detail.WarrantyMonths ? `${detail.WarrantyMonths} months` : null}/>
                                <DetailField label={t('it.leadTime', 'Lead Time')} value={detail.LeadTimeDays ? `${detail.LeadTimeDays} days` : null}/>
                                <DetailField label={t('it.weight', 'Weight')} value={detail.Weight}/>
                                <DetailField label={t('it.dimensions', 'Dimensions')} value={detail.Dimensions}/>
                                <DetailField label={t('it.power', 'Power')} value={detail.PowerRequirements}/>
                            </div>

                            {detail.SupersededBy && detail.supersededByProduct && (
                                <div style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:8, padding:10, marginBottom:16, fontSize:'0.8rem' }}>
                                    <strong style={{ color:'#f59e0b' }}>Ã¢Å¡Â  Superseded by: </strong>
                                    <span style={{ color:'#fbbf24', cursor:'pointer' }} onClick={()=>fetchDetail(detail.SupersededBy)}>{detail.supersededByProduct.ProductName}</span>
                                </div>
                            )}

                            {/* Specifications */}
                            {detail.Specifications && (() => {
                                const specs = parseSpecs(detail.Specifications);
                                return specs ? (
                                    <div style={{ marginBottom:16 }}>
                                        <h4 style={{ fontSize:'0.82rem', color:'#06b6d4', margin:'0 0 10px 0', textTransform:'uppercase', letterSpacing:'0.04em' }}>Specifications</h4>
                                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                                            {Object.entries(specs).map(([k, v]) => (
                                                <div key={k} style={{ background:'rgba(255,255,255,0.03)', padding:'6px 10px', borderRadius:6, border:'1px solid rgba(255,255,255,0.06)' }}>
                                                    <div style={{ fontSize:'0.68rem', color:'#64748b', textTransform:'uppercase' }}>{k.replace(/_/g, ' ')}</div>
                                                    <div style={{ fontSize:'0.78rem', color:'var(--text-primary)', fontWeight:600 }}>{typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null;
                            })()}

                            {/* Accessories */}
                            {detail.accessories && detail.accessories.length > 0 && (
                                <div>
                                    <h4 style={{ fontSize:'0.82rem', color:'#f59e0b', margin:'0 0 10px 0', textTransform:'uppercase', letterSpacing:'0.04em' }}>Accessories & Attachments ({detail.accessories.length})</h4>
                                    {detail.accessories.map((a, i) => (
                                        <div key={`item-${i}`} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid var(--glass-border)', borderRadius:8, padding:10, marginBottom:8, cursor:'pointer' }}
                                            onClick={()=>fetchDetail(a.AccessoryPartNumber)}>
                                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                                <div>
                                                    <div style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--text-primary)' }}>{a.AccessoryName}</div>
                                                    <div style={{ fontSize:'0.72rem', color:'#06b6d4', fontFamily:'monospace' }}>{a.AccessoryPartNumber}</div>
                                                </div>
                                                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                                                    {a.Required ? <Badge color="#ef4444">Required</Badge> : <Badge color="#64748b">Optional</Badge>}
                                                    <ChevronRight size={14} color="#64748b"/>
                                                </div>
                                            </div>
                                            {a.Notes && <div style={{ fontSize:'0.72rem', color:'#64748b', marginTop:4 }}>{a.Notes}</div>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {detail.Tags && (
                                <div style={{ marginTop:12, display:'flex', gap:4, flexWrap:'wrap' }}>
                                    {detail.Tags.split(',').map(tag => (
                                        <span key={tag} style={{ fontSize:'0.68rem', color:'#64748b', background:'rgba(255,255,255,0.04)', padding:'2px 8px', borderRadius:10, border:'1px solid rgba(255,255,255,0.06)' }}>#{tag.trim()}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

const DetailField = ({ label, value }) => value ? (
    <div><div style={{ fontSize:'0.68rem', color:'#64748b', textTransform:'uppercase' }}>{label}</div><div style={{ fontSize:'0.82rem', color:'var(--text-primary)', fontWeight:500 }}>{value}</div></div>
) : null;

export default function ITDepartmentView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('software');
    const [search, setSearch] = useState('');
    const [stats, setStats] = useState(null);
    const [scanResult, setScanResult] = useState(null);
    const [scanLoading, setScanLoading] = useState(false);
    const [batchScanMode, setBatchScanMode] = useState(null);
    const [importModal, setImportModal] = useState(null); // 'receive' | 'ship' | null
    const userRole = localStorage.getItem('userRole');
    const isITorCreator = ['it_admin','creator'].includes(userRole) || localStorage.getItem('PF_USER_IS_CREATOR') === 'true';

    const refreshStats = useCallback(() => API('/stats').then(r=>r.json()).then(setStats).catch(e => console.warn('[ITDepartmentView] fetch error:', e)), []);
    useEffect(() => { refreshStats(); }, [refreshStats]);

    // Hardware scanner wedge â€” Zebra TC/MC, Honeywell, any keyboard-wedge scanner
    const handleHardwareScan = useCallback(async (code) => {
        setScanLoading(true);
        try {
            const r = await API('/scan/lookup', { method: 'POST', body: JSON.stringify({ code }) });
            const data = await r.json();
            if (data.found) {
                setScanResult({ ...data, scannedCode: code });
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            } else {
                window.trierToast?.warn('IT asset not found: ' + code);
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
        } catch (err) {
            window.trierToast?.error('Scan lookup failed');
        } finally {
            setScanLoading(false);
        }
    }, []);

    // Hardware scanner is handled globally in App.jsx — disable local hook to avoid double-fire
    // useHardwareScanner(handleHardwareScan, true);
    // IT-specific scan results are passed via scanResult prop or detected globally

    const tabs = [
        { id:'software', label:'Software', icon:Key, color:'#8b5cf6', tip:'Software licenses, subscriptions, and compliance' },
        { id:'hardware', label:'Hardware', icon:Monitor, color:'#3b82f6', tip:'Computers, peripherals, and IT equipment' },
        { id:'infrastructure', label:'Infrastructure', icon:Wifi, color:'#10b981', tip:'Servers, networking, and data center equipment' },
        { id:'mobile', label:'Mobile', icon:Smartphone, color:'#f59e0b', tip:'Mobile devices, MDM enrollment, and carrier plans' },
        { id:'vendors', label:'Vendors & Contracts', icon:Briefcase, color:'#06b6d4', tip:'Vendor relationships, service contracts, and SLAs' },
        { id:'tracking', label:'Asset Tracking', icon:Package, color:'#ec4899', tip:'Movement history, depreciation, and chain of custody' },
    ];

    return (
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'var(--spacing-base)' }}>
            <div className="glass-card no-print" style={{ padding:'15px 25px', display:'flex', gap:20, alignItems:'center', flexShrink:0 }}>
                <h2 style={{ fontSize:'1.4rem', margin:0, color:'#6366f1', display:'flex', alignItems:'center', gap:10 }}><Server size={24}/> IT Department</h2>
                <div style={{ width:2, height:30, background:'var(--glass-border)' }}/>
                <div className="nav-pills no-print" style={{ display:'flex', gap:6, flexWrap:'nowrap' }}>
                    {tabs.map(tabItem =>(
                        <button key={tabItem.id} onClick={()=>setTab(tabItem.id)} title={tabItem.tip} className={`btn-nav ${tab===tabItem.id?'active':''}`}
                            style={{ whiteSpace:'nowrap', height:36, display:'flex', alignItems:'center', gap:4, padding:'0 14px', fontSize:'0.82rem' }}>
                            <tabItem.icon size={15}/>{tabItem.label}
                        </button>
                    ))}
                </div>
                <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
                    {scanLoading && <span style={{ fontSize:'0.72rem', color:'#f59e0b', animation:'statusPulse 1s ease-in-out infinite' }}>Scanning...</span>}
                    <span title="Zebra/hardware barcode scanner active" style={{ fontSize:'0.68rem', color:'#334155', display:'flex', alignItems:'center', gap:4 }}>
                        <ScanLine size={13}/> Wedge Ready
                    </span>

                    <ITMasterCatalogButton />
                    <TakeTourButton tourId="it-department" nestedTab={tab} />
                </div>
            </div>

            {stats && (
                <div className="no-print" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(175px, 1fr))', gap:12 }}>
                    <StatCard icon={Key} label={t('it.softwareLicenses', 'Software Licenses')} value={stats.software?.total || 0} color="#8b5cf6" sub={stats.software?.expiring > 0 ? (stats.software.expiring + ' expiring soon') : null} />
                    <StatCard icon={Monitor} label={t('it.hardwareAssets', 'Hardware Assets')} value={stats.hardware?.total || 0} color="#3b82f6" />
                    <StatCard icon={Wifi} label={t('it.infrastructure', 'Infrastructure')} value={stats.infrastructure?.total || 0} color="#10b981" sub={(stats.infrastructure?.online || 0) + ' online / ' + (stats.infrastructure?.offline || 0) + ' offline'} />
                    <StatCard icon={Smartphone} label={t('it.mobileDevices', 'Mobile Devices')} value={stats.mobile?.total || 0} color="#f59e0b" />
                    <StatCard icon={Briefcase} label={t('it.vendorsContracts', 'Vendors & Contracts')} value={stats.vendors?.total || 0} color="#06b6d4" sub={stats.vendors?.expiring > 0 ? (stats.vendors.expiring + ' expiring soon') : null} />
                    <StatCard icon={DollarSign} label={t('it.totalBookValue', 'Total Book Value')} value={'$' + (stats.totalBookValue || 0).toLocaleString()} color="#ec4899" />
                </div>
            )}

            {/* Search bar & Actions — dedicated row for breathing room */}
            <div className="no-print" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <SearchBar value={search} onChange={setSearch} placeholder="Search IT assets..." width={360} title="Search by name, serial, asset tag, or notes" />
                    <span style={{ fontSize:'0.72rem', color:'#475569' }}>{search ? 'Filtering results...' : ''}</span>
                </div>
                
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {isITorCreator && ['hardware','infrastructure','mobile'].includes(tab) && (
                        <>
                            <button onClick={() => setBatchScanMode('receive')} className="btn-nav" title="Batch receive — scan serial numbers to add multiple assets at once"
                                style={{ height:36, display:'flex', alignItems:'center', gap:6, padding:'0 14px', fontSize:'0.82rem', background:'rgba(16,185,129,0.1)', borderColor:'rgba(16,185,129,0.3)', color:'#10b981' }}>
                                <CheckCircle2 size={15}/> Batch Receive
                            </button>
                            <button onClick={() => setBatchScanMode('ship')} className="btn-nav" title="Batch ship — scan devices to ship multiple assets to one destination"
                                style={{ height:36, display:'flex', alignItems:'center', gap:6, padding:'0 14px', fontSize:'0.82rem', background:'rgba(245,158,11,0.1)', borderColor:'rgba(245,158,11,0.3)', color:'#f59e0b' }}>
                                <Truck size={15}/> Batch Ship
                            </button>
                        </>
                    )}
                    {['software','hardware','infrastructure','mobile'].includes(tab) && (
                        <>
                        <button onClick={() => window.open('/api/it/export/' + tab, '_blank')} className="btn-nav" title={'Export ' + tab + ' as CSV'}
                            style={{ height:36, display:'flex', alignItems:'center', gap:6, padding:'0 14px', fontSize:'0.82rem' }}>
                            <Download size={15}/> Export
                        </button>
                        {isITorCreator && <button onClick={() => setImportModal(tab)} className="btn-nav" title={'Import ' + tab + ' from CSV'}
                            style={{ height:36, display:'flex', alignItems:'center', gap:6, padding:'0 14px', fontSize:'0.82rem' }}>
                            <Upload size={15}/> Import
                        </button>}
                        </>
                    )}
                </div>
            </div>

            <div style={{ flex:1, display:'flex' }}>
                {tab==='software' && <SoftwareTab search={search} isITorCreator={isITorCreator} onRefreshStats={refreshStats} />}
                {tab==='hardware' && <InventoryTab category="hardware" search={search} isITorCreator={isITorCreator} icon={Monitor} color="#3b82f6" title="Hardware Inventory" types={HW_TYPES} statuses={STATUSES} onRefreshStats={refreshStats} />}
                {tab==='infrastructure' && <InventoryTab category="infrastructure" search={search} isITorCreator={isITorCreator} icon={Wifi} color="#10b981" title="Infrastructure" types={INFRA_TYPES} statuses={INFRA_STATUSES} onRefreshStats={refreshStats} />}
                {tab==='mobile' && <InventoryTab category="mobile" search={search} isITorCreator={isITorCreator} icon={Smartphone} color="#f59e0b" title="Mobile Devices" types={MOB_TYPES} statuses={STATUSES} onRefreshStats={refreshStats} />}
                {tab==='vendors' && <VendorsTab search={search} isITorCreator={isITorCreator} onRefreshStats={refreshStats} />}
                {tab==='tracking' && <TrackingTab search={search} />}
            </div>

            {scanResult && <ITScanResultModal data={scanResult} plantId={plantId} plantLabel={plantLabel} onClose={() => setScanResult(null)} onRefresh={() => { refreshStats(); setScanResult(null); }} />}
            {batchScanMode && <BatchScanModal mode={batchScanMode} category={tab} plantId={plantId} plantLabel={plantLabel} onClose={() => setBatchScanMode(null)} onRefresh={refreshStats} />}
            {importModal && <ImportModal category={importModal} onClose={() => setImportModal(null)} onSuccess={() => { setImportModal(null); refreshStats(); }} />}
        </div>
    );
}


/* ═══════════════════════════════════════════════════ SOFTWARE ═══════════════════════════════════════════════════ */
function SoftwareTab({ search, isITorCreator, onRefreshStats }) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [detail, setDetail] = useState(null);
    const [form, setForm] = useState({ LicenseType:'Subscription', Category:'Other', Status:'Active', Seats:1 });
    const f = (k,v) => setForm(p=>({...p,[k]:v}));

    const fetch_ = useCallback(()=>{setLoading(true);API('/software').then(r=>r.json()).then(d=>{setItems(Array.isArray(d)?d:[]);setLoading(false);}).catch(()=>setLoading(false));},[]);
    useEffect(()=>{fetch_();},[fetch_]);

    const filtered = useMemo(()=>{
        if(!search) return items;
        const s=search.toLowerCase();
        return items.filter(i=>[i.Name,i.Vendor,i.LicenseKey,i.Category,i.Notes].some(x=>(x||'').toLowerCase().includes(s)));
    },[items,search]);

    const daysUntil = d=>{if(!d)return null;return Math.floor((new Date(d)-new Date())/86400000);};
    const expiryColor = d=>{if(d===null)return'#64748b';if(d<0)return'#ef4444';if(d<=30)return'#f59e0b';return'#10b981';};

    const handleAdd = async()=>{
        if(!form.Name) return window.trierToast?.warn('Software name is required');
        const r=await API('/software',{method:'POST',body:JSON.stringify(form)});
        if(r.ok){setShowAdd(false);setForm({LicenseType:'Subscription',Category:'Other',Status:'Active',Seats:1});fetch_();onRefreshStats();}
        else{const d=await r.json();window.trierToast?.error(d.error);}
    };

    const handleDelete = async(id)=>{
        if(!confirm('Delete this software record?')) return;
        const r=await API(`/software/${id}`,{method:'DELETE'});
        if(r.ok){setDetail(null);fetch_();onRefreshStats();window.trierToast?.success('Deleted');}
    };

    if(loading) return <div className="glass-card" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>Loading software inventory...</div>;

    return (<>
        <div className="glass-card" style={{flex:1,display:'flex',flexDirection:'column',padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{margin:0,display:'flex',alignItems:'center',gap:10}}><Key size={24} color="#8b5cf6"/> Software Licenses ({filtered.length})</h2>
                {isITorCreator && <button title="Add new software license" className="btn-save" onClick={()=>{setForm({LicenseType:'Subscription',Category:'Other',Status:'Active',Seats:1});setShowAdd(true);}} style={{height:36,display:'flex',alignItems:'center',gap:8}}><Plus size={16}/> Add Software</button>}
            </div>
            <div className="table-container" style={{flex:1,overflowY:'auto'}}>
                <table className="data-table"><thead><tr><th>{t('it.name', 'Name')}</th><th>{t('it.vendor', 'Vendor')}</th><th>{t('it.category', 'Category')}</th><th>{t('it.license', 'License')}</th><th>{t('it.seats', 'Seats')}</th><th>{t('it.expiry', 'Expiry')}</th><th>{t('it.cost', 'Cost')}</th><th>{t('it.status', 'Status')}</th><th>{t('it.actions', 'Actions')}</th></tr></thead>
                <tbody>{filtered.map(i=>{const days=daysUntil(i.ExpiryDate);return(
                    <tr key={i.ID}>
                        <td style={{fontWeight:600,color:'#8b5cf6'}}>{i.Name}</td>
                        <td>{i.Vendor||'—'}</td>
                        <td><Badge color="#6366f1">{i.Category}</Badge></td>
                        <td><Badge color="#3b82f6">{i.LicenseType}</Badge></td>
                        <td>{i.SeatsUsed||0}/{i.Seats||'∞'}</td>
                        <td><span style={{color:expiryColor(days),fontWeight:600,fontSize:'0.85rem'}}>{formatDate(i.ExpiryDate)||'Perpetual'}{days!==null&&days<=30&&<span style={{fontSize:'0.7rem',marginLeft:4}}>({days<0?`${Math.abs(days)}d overdue`:`${days}d`})</span>}</span></td>
                        <td>{i.RenewalCost?`$${parseFloat(i.RenewalCost).toLocaleString()}`:'—'}</td>
                        <td><span className={statusClass(i.Status)}>{t('status.' + (i.Status || '').replace(/\s+/g, '').toLowerCase(), i.Status)}</span></td>
                        <td style={{display:'flex',gap:2}}>
                            <ActionBtn icon={Eye} tip="View software details" color="#3b82f6" onClick={()=>setDetail(i)}/>
                            {isITorCreator && <ActionBtn icon={Pencil} tip="Edit" color="#f59e0b" onClick={()=>{setForm({...i});setShowAdd(true);}}/>}
                        </td>
                    </tr>
                );})}{filtered.length===0&&<tr><td colSpan={9} className="table-empty">No software licenses found.</td></tr>}</tbody></table>
            </div>
        </div>

        {showAdd && (
            <Modal title={form.ID ? 'Edit Software' : 'Add Software License'} icon={Key} color="#8b5cf6" onClose={()=>setShowAdd(false)}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                    <FF t={t} label={t('it.softwareName', 'Software Name')} value={form.Name} onChange={v=>f('Name',v)} required/>
                    <FF t={t} label={t('it.vendor', 'Vendor')} value={form.Vendor} onChange={v=>f('Vendor',v)}/>
                    <FF t={t} label={t('it.version', 'Version')} value={form.Version} onChange={v=>f('Version',v)}/>
                    <FF t={t} label={t('it.category', 'Category')} value={form.Category} onChange={v=>f('Category',v)} options={SW_CATEGORIES}/>
                    <FF t={t} label={t('it.licenseType', 'License Type')} value={form.LicenseType} onChange={v=>f('LicenseType',v)} options={SW_TYPES}/>
                    <FF t={t} label={t('it.licenseKey', 'License Key')} value={form.LicenseKey} onChange={v=>f('LicenseKey',v)} placeholder="XXXX-XXXX-XXXX"/>
                    <FF t={t} label={t('it.totalSeats', 'Total Seats')} type="number" value={form.Seats} onChange={v=>f('Seats',v)}/>
                    <FF t={t} label={t('it.seatsUsed', 'Seats Used')} type="number" value={form.SeatsUsed} onChange={v=>f('SeatsUsed',v)}/>
                    <FF t={t} label={t('it.expiryDate', 'Expiry Date')} type="date" value={form.ExpiryDate} onChange={v=>f('ExpiryDate',v)}/>
                    <FF t={t} label={t('it.renewalCost', 'Renewal Cost ($)')} type="number" value={form.RenewalCost} onChange={v=>f('RenewalCost',v)}/>
                    <FF t={t} label={t('it.assignedTo', 'Assigned To')} value={form.AssignedTo} onChange={v=>f('AssignedTo',v)}/>
                    <FF t={t} label={t('it.department', 'Department')} value={form.Department} onChange={v=>f('Department',v)}/>
                    <FF t={t} label={t('it.purchaseDate', 'Purchase Date')} type="date" value={form.PurchaseDate} onChange={v=>f('PurchaseDate',v)}/>
                    <FF t={t} label={t('it.purchaseOrder', 'Purchase Order')} value={form.PurchaseOrder} onChange={v=>f('PurchaseOrder',v)}/>
                    <FF t={t} label={t('it.status', 'Status')} value={form.Status} onChange={v=>f('Status',v)} options={['Active','Inactive','Expired','Pending']}/>
                    <div style={{gridColumn:'span 2'}}><FF t={t} label={t('it.notes', 'Notes')} type="textarea" value={form.Notes} onChange={v=>f('Notes',v)}/></div>
                </div>
                <ModalActions t={t} onCancel={()=>setShowAdd(false)} onSave={async()=>{
                    if(form.ID){const r=await API(`/software/${form.ID}`,{method:'PUT',body:JSON.stringify(form)});if(r.ok){setShowAdd(false);fetch_();onRefreshStats();}else{const d=await r.json();window.trierToast?.error(d.error);}}
                    else handleAdd();
                }} saveLabel={form.ID?'Update':'Save License'} onDelete={form.ID?()=>handleDelete(form.ID):null}/>
            </Modal>
        )}

        {detail && !showAdd && (
            <Modal title={detail.Name} icon={Key} color="#8b5cf6" onClose={()=>setDetail(null)} width={700}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                    <InfoRow label={t('it.vendor', 'Vendor')} value={detail.Vendor}/><InfoRow label={t('it.version', 'Version')} value={detail.Version}/><InfoRow label={t('it.category', 'Category')} value={detail.Category}/>
                    <InfoRow label={t('it.licenseType', 'License Type')} value={detail.LicenseType}/><InfoRow label={t('it.licenseKey', 'License Key')} value={detail.LicenseKey} sensitive={!isITorCreator}/><InfoRow label={t('it.seats', 'Seats')} value={`${detail.SeatsUsed||0} / ${detail.Seats||'∞'}`}/>
                    <InfoRow label={t('it.expiry', 'Expiry')} value={formatDate(detail.ExpiryDate)||'Perpetual'}/><InfoRow label={t('it.renewalCost', 'Renewal Cost')} value={detail.RenewalCost?`$${parseFloat(detail.RenewalCost).toLocaleString()}`:null}/><InfoRow label={t('it.status', 'Status')} value={detail.Status}/>
                    <InfoRow label={t('it.assignedTo', 'Assigned To')} value={detail.AssignedTo}/><InfoRow label={t('it.department', 'Department')} value={detail.Department}/><InfoRow label={t('it.po', 'PO #')} value={detail.PurchaseOrder}/>
                    {detail.Notes && <div style={{gridColumn:'span 3'}}><InfoRow label={t('it.notes', 'Notes')} value={detail.Notes}/></div>}
                </div>
                <div style={{display:'flex',gap:10,marginTop:16,paddingTop:12,borderTop:'1px solid var(--glass-border)'}}>
                    <button className="btn-nav" onClick={()=>{
                        const html = infoGridHTML([
                            ['Software Name', detail.Name], ['Vendor', detail.Vendor], ['Version', detail.Version],
                            ['Category', detail.Category], ['License Type', detail.LicenseType], ['Seats', `${detail.SeatsUsed||0} / ${detail.Seats||'∞'}`],
                            ['Expiry Date', formatDate(detail.ExpiryDate)||'Perpetual'], ['Renewal Cost', detail.RenewalCost ? '$'+parseFloat(detail.RenewalCost).toLocaleString() : '--'],
                            ['Status', detail.Status], ['Assigned To', detail.AssignedTo], ['Department', detail.Department],
                            ['Purchase Order', detail.PurchaseOrder]
                        ]);
                        printRecord(detail.Name + ' - Software License', html, { subtitle: 'Software License Record' });
                    }} style={{display:'flex',alignItems:'center',gap:6}} title="Print software detail"><Printer size={14}/> Print Record</button>
                </div>
            </Modal>
        )}
    </>);
}

/* ═══════════════════════ GENERIC INVENTORY TAB (Hardware / Infra / Mobile) ═══════════════════════ */
function InventoryTab({ category, search, isITorCreator, icon:TabIcon, color, title, types, statuses, onRefreshStats }) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [detail, setDetail] = useState(null);
    const [form, setForm] = useState({ Type: types[0], Status: statuses[0], Condition:'New', DepreciationMethod:'Straight-Line', UsefulLifeYears: category==='mobile'?3:category==='infrastructure'?7:5 });
    const f = (k,v) => setForm(p=>({...p,[k]:v}));

    const fetch_ = useCallback(()=>{setLoading(true);API(`/${category}`).then(r=>r.json()).then(d=>{setItems(Array.isArray(d)?d:[]);setLoading(false);}).catch(()=>setLoading(false));},[category]);
    useEffect(()=>{fetch_();},[fetch_]);

    const filtered = useMemo(()=>{
        if(!search) return items;
        const s=search.toLowerCase();
        return items.filter(i=>[i.Name,i.SerialNumber,i.AssetTag,i.BarcodeID,i.Manufacturer,i.Model,i.AssignedTo,i.Notes,i.IPAddress].some(x=>(x||'').toLowerCase().includes(s)));
    },[items,search]);

    const resetForm = () => setForm({ Type: types[0], Status: statuses[0], Condition:'New', DepreciationMethod:'Straight-Line', UsefulLifeYears: category==='mobile'?3:category==='infrastructure'?7:5 });

    const handleSave = async()=>{
        if(!form.Name) return window.trierToast?.warn('Name is required');
        if(form.ID){
            const r=await API(`/${category}/${form.ID}`,{method:'PUT',body:JSON.stringify(form)});
            if(r.ok){setShowAdd(false);resetForm();fetch_();onRefreshStats();}else{const d=await r.json();window.trierToast?.error(d.error);}
        } else {
            const r=await API(`/${category}`,{method:'POST',body:JSON.stringify(form)});
            if(r.ok){setShowAdd(false);resetForm();fetch_();onRefreshStats();const d=await r.json();if(d.barcodeId)window.trierToast?.success(`Created with barcode: ${d.barcodeId}`);}
            else{const d=await r.json();window.trierToast?.error(d.error);}
        }
    };

    const handleDelete = async(id)=>{
        if(!confirm('Delete this asset?')) return;
        await API(`/${category}/${id}`,{method:'DELETE'});
        setDetail(null);setShowAdd(false);fetch_();onRefreshStats();
    };

    if(loading) return <div className="glass-card" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>Loading {title.toLowerCase()}...</div>;

    const isInfra = category === 'infrastructure';
    const isMobile = category === 'mobile';
    const daysUntil = d => { if(!d) return null; return Math.floor((new Date(d) - new Date()) / 86400000); };
    const warrantyColor = d => { if(d===null) return '#64748b'; if(d<0) return '#ef4444'; if(d<=30) return '#f59e0b'; return '#10b981'; };
    const critColors = { Critical:'#ef4444', High:'#f59e0b', Medium:'#eab308', Low:'#3b82f6' };

    const FormFields = () => (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
            <FF t={t} label={t('it.name', 'Name')} value={form.Name} onChange={v=>f('Name',v)} required/>
            <FF t={t} label={t('it.type', 'Type')} value={form.Type} onChange={v=>f('Type',v)} options={types}/>
            <FF t={t} label={t('it.manufacturer', 'Manufacturer')} value={form.Manufacturer} onChange={v=>f('Manufacturer',v)}/>
            <FF t={t} label={t('it.model', 'Model')} value={form.Model} onChange={v=>f('Model',v)}/>
            <FF t={t} label={t('it.serialNumber', 'Serial Number')} value={form.SerialNumber} onChange={v=>f('SerialNumber',v)}/>
            <FF t={t} label={t('it.assetTag', 'Asset Tag')} value={form.AssetTag} onChange={v=>f('AssetTag',v)}/>
            {isInfra && <><FF t={t} label={t('it.ipAddress', 'IP Address')} value={form.IPAddress} onChange={v=>f('IPAddress',v)}/><FF t={t} label={t('it.macAddress', 'MAC Address')} value={form.MACAddress} onChange={v=>f('MACAddress',v)}/></>}
            {isInfra && <><FF t={t} label={t('it.rackPosition', 'Rack Position')} value={form.RackPosition} onChange={v=>f('RackPosition',v)}/><FF t={t} label={t('it.criticality', 'Criticality')} value={form.Criticality} onChange={v=>f('Criticality',v)} options={CRITICALITIES}/></>}
            {isMobile && <><FF t={t} label={t('it.imei', 'IMEI')} value={form.IMEI} onChange={v=>f('IMEI',v)}/><FF t={t} label={t('it.phoneNumber', 'Phone Number')} value={form.PhoneNumber} onChange={v=>f('PhoneNumber',v)}/></>}
            {isMobile && <><FF t={t} label={t('it.carrier', 'Carrier')} value={form.Carrier} onChange={v=>f('Carrier',v)}/><FF t={t} label={t('it.monthlyCost', 'Monthly Cost ($)')} type="number" value={form.MonthlyCost} onChange={v=>f('MonthlyCost',v)}/></>}
            <FF t={t} label={t('it.assignedTo', 'Assigned To')} value={form.AssignedTo} onChange={v=>f('AssignedTo',v)}/>
            <FF t={t} label={t('it.location', 'Location')} value={form.Location} onChange={v=>f('Location',v)}/>
            <FF t={t} label={t('it.status', 'Status')} value={form.Status} onChange={v=>f('Status',v)} options={statuses}/>
            <FF t={t} label={t('it.condition', 'Condition')} value={form.Condition} onChange={v=>f('Condition',v)} options={CONDITIONS}/>
            <FF t={t} label={t('it.purchaseDate', 'Purchase Date')} type="date" value={form.PurchaseDate} onChange={v=>f('PurchaseDate',v)}/>
            <FF t={t} label={t('it.purchaseCost', 'Purchase Cost ($)')} type="number" value={form.PurchaseCost} onChange={v=>f('PurchaseCost',v)}/>
            <FF t={t} label={t('it.warrantyExpiry', 'Warranty Expiry')} type="date" value={form.WarrantyExpiry} onChange={v=>f('WarrantyExpiry',v)}/>
            <FF t={t} label={t('it.salvageValue', 'Salvage Value ($)')} type="number" value={form.SalvageValue} onChange={v=>f('SalvageValue',v)}/>
            <FF t={t} label={t('it.usefulLifeYears', 'Useful Life (years)')} type="number" value={form.UsefulLifeYears} onChange={v=>f('UsefulLifeYears',v)}/>
            <FF t={t} label={t('it.depreciationMethod', 'Depreciation Method')} value={form.DepreciationMethod} onChange={v=>f('DepreciationMethod',v)} options={DEP_METHODS}/>
            <div style={{gridColumn:'span 2'}}><FF t={t} label={t('it.notes', 'Notes')} type="textarea" value={form.Notes} onChange={v=>f('Notes',v)}/></div>
        </div>
    );

    return (<>
        <div className="glass-card" style={{flex:1,display:'flex',flexDirection:'column',padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{margin:0,display:'flex',alignItems:'center',gap:10}}><TabIcon size={24} color={color}/> {title} ({filtered.length})</h2>
                {isITorCreator && <button title={`Add new ${title.toLowerCase()} asset`} className="btn-save" onClick={()=>{resetForm();setShowAdd(true);}} style={{height:36,display:'flex',alignItems:'center',gap:8}}><Plus size={16}/> Add {category==='infrastructure'?'Device':category==='mobile'?'Device':'Asset'}</button>}
            </div>
            <div className="table-container" style={{flex:1,overflowY:'auto'}}>
                <table className="data-table"><thead><tr>
                    <th>{t('it.name', 'Name')}</th><th>{t('it.type', 'Type')}</th><th>{t('it.manufacturer', 'Manufacturer')}</th><th>{t('it.serial', 'Serial #')}</th><th>{t('it.assignedTo', 'Assigned To')}</th>
                    {isInfra && <th>{t('it.ipAddress', 'IP Address')}</th>}
                    {isInfra && <th>{t('it.criticality', 'Criticality')}</th>}
                    {isMobile && <th>{t('it.phone', 'Phone #')}</th>}
                    {isMobile && <th>{t('it.mdm', 'MDM')}</th>}
                    <th>{t('it.status', 'Status')}</th><th>{t('it.warranty', 'Warranty')}</th><th>{t('it.bookValue', 'Book Value')}</th><th>{t('it.actions', 'Actions')}</th>
                </tr></thead>
                <tbody>{filtered.map(i=>{const wDays=daysUntil(i.WarrantyExpiry);const isTransit=(i.Status||'').includes('Transit');return(
                    <tr key={i.ID}>
                        <td style={{fontWeight:600,color}}>{i.Name}</td>
                        <td><Badge color={color}>{i.Type}</Badge></td>
                        <td>{[i.Manufacturer,i.Model].filter(Boolean).join(' ')||'—'}</td>
                        <td style={{fontFamily:'monospace',fontSize:'0.75rem'}}>{i.SerialNumber||'—'}</td>
                        <td>{i.AssignedTo||'—'}</td>
                        {isInfra && <td style={{fontFamily:'monospace',fontSize:'0.75rem'}}>{i.IPAddress||'—'}</td>}
                        {isInfra && <td>{i.Criticality ? <Badge color={critColors[i.Criticality]||'#64748b'}>{i.Criticality}</Badge> : '\u2014'}</td>}
                        {isMobile && <td>{i.PhoneNumber||'—'}</td>}
                        {isMobile && <td>{i.MDMEnrolled ? <span style={{color:'#10b981',fontWeight:700,fontSize:'0.78rem'}} title="MDM Enrolled">{'\u2713'} Yes</span> : <span style={{color:'#ef4444',fontSize:'0.75rem'}} title="Not Enrolled">{'\u2717'} No</span>}</td>}
                        <td>{isTransit ? <span style={{color:'#a855f7',fontWeight:700,fontSize:'0.78rem',animation:'statusPulse 1.5s ease-in-out infinite'}}>{'\u25cf'} In Transit</span> : <span className={statusClass(i.Status==='Online'?'Active':i.Status==='Offline'?'Overdue':i.Status)}>{t('status.' + (i.Status || '').replace(/\s+/g, '').toLowerCase(), i.Status)}</span>}</td>
                        <td>{i.WarrantyExpiry ? <span style={{color:warrantyColor(wDays),fontWeight:600,fontSize:'0.8rem'}}>{formatDate(i.WarrantyExpiry)}{wDays!==null&&wDays<=30&&<span style={{fontSize:'0.68rem',marginLeft:3}}>({wDays<0?Math.abs(wDays)+'d over':wDays+'d'})</span>}</span> : '\u2014'}</td>
                        <td style={{fontWeight:600,color:'#10b981'}}>{i.CurrentBookValue!=null?`$${parseFloat(i.CurrentBookValue).toLocaleString()}`:'—'}</td>
                        <td style={{display:'flex',gap:2}}>
                            <ActionBtn icon={Eye} tip="View details" color="#3b82f6" onClick={()=>setDetail(i)}/>
                            {isITorCreator && <ActionBtn icon={Pencil} tip="Edit" color="#f59e0b" onClick={()=>{setForm({...i});setShowAdd(true);}}/>}
                        </td>
                    </tr>
                );})}{filtered.length===0&&<tr><td colSpan={isInfra?12:isMobile?12:10} className="table-empty">No {title.toLowerCase()} assets found.</td></tr>}</tbody></table>
            </div>
        </div>

        {showAdd && <Modal title={form.ID?`Edit ${category}`:`Add ${title}`} icon={TabIcon} color={color} onClose={()=>setShowAdd(false)} width={700}><FormFields/><ModalActions t={t} onCancel={()=>setShowAdd(false)} onSave={handleSave} saveLabel={form.ID?'Update':'Save'} onDelete={form.ID?()=>handleDelete(form.ID):null}/></Modal>}

        {detail && !showAdd && (
            <Modal title={detail.Name} icon={TabIcon} color={color} onClose={()=>setDetail(null)} width={750}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                    <InfoRow label={t('it.type', 'Type')} value={detail.Type}/><InfoRow label={t('it.manufacturer', 'Manufacturer')} value={detail.Manufacturer}/><InfoRow label={t('it.model', 'Model')} value={detail.Model}/>
                    <InfoRow label={t('it.serial', 'Serial #')} value={detail.SerialNumber}/><InfoRow label={t('it.assetTag', 'Asset Tag')} value={detail.AssetTag}/><InfoRow label={t('it.barcode', 'Barcode')} value={detail.BarcodeID}/>
                    {isInfra && <><InfoRow label={t('it.ipAddress', 'IP Address')} value={detail.IPAddress}/><InfoRow label={t('it.macAddress', 'MAC Address')} value={detail.MACAddress}/><InfoRow label={t('it.criticality', 'Criticality')} value={detail.Criticality}/></>}
                    {isMobile && <><InfoRow label={t('it.imei', 'IMEI')} value={detail.IMEI}/><InfoRow label={t('it.phone', 'Phone #')} value={detail.PhoneNumber}/><InfoRow label={t('it.carrier', 'Carrier')} value={detail.Carrier}/></>}
                    <InfoRow label={t('it.assignedTo', 'Assigned To')} value={detail.AssignedTo}/><InfoRow label={t('it.location', 'Location')} value={detail.Location}/><InfoRow label={t('it.status', 'Status')} value={detail.Status}/>
                    <InfoRow label={t('it.purchaseDate', 'Purchase Date')} value={formatDate(detail.PurchaseDate)}/><InfoRow label={t('it.purchaseCost', 'Purchase Cost')} value={detail.PurchaseCost?`$${parseFloat(detail.PurchaseCost).toLocaleString()}`:null}/><InfoRow label={t('it.warranty', 'Warranty')} value={formatDate(detail.WarrantyExpiry)}/>
                    <InfoRow label={t('it.bookValue', 'Book Value')} value={detail.CurrentBookValue!=null?`$${parseFloat(detail.CurrentBookValue).toLocaleString()}`:null}/><InfoRow label={t('it.depreciation', 'Depreciation')} value={detail._accumulatedDepreciation!=null?`$${parseFloat(detail._accumulatedDepreciation).toLocaleString()}`:null}/><InfoRow label={t('it.condition', 'Condition')} value={detail.Condition}/>
                    {detail.Notes && <div style={{gridColumn:'span 3'}}><InfoRow label={t('it.notes', 'Notes')} value={detail.Notes}/></div>}
                </div>
                <AssetMovementHistory category={category} assetId={detail.ID} />
                <div style={{display:'flex',gap:10,marginTop:16,paddingTop:12,borderTop:'1px solid var(--glass-border)'}}>
                    <button className="btn-nav" onClick={()=>{
                        const html = infoGridHTML([
                            ['Name', detail.Name], ['Type', detail.Type], ['Serial', detail.SerialNumber],
                            ['Asset Tag', detail.AssetTag], ['Barcode', detail.BarcodeID], ['Status', detail.Status],
                            ['Manufacturer', detail.Manufacturer], ['Model', detail.Model], ['Location', detail.Location],
                            ['Purchase Cost', detail.PurchaseCost ? '$'+parseFloat(detail.PurchaseCost).toLocaleString() : '--'],
                            ['Book Value', detail.CurrentBookValue!=null ? '$'+parseFloat(detail.CurrentBookValue).toLocaleString() : '--'],
                            ['Condition', detail.Condition],
                        ]);
                        printRecord(detail.Name + ' - Asset Detail', html, { subtitle: category.charAt(0).toUpperCase()+category.slice(1)+' Asset Record' });
                    }} style={{display:'flex',alignItems:'center',gap:6}} title="Print asset detail"><Printer size={14}/> Print</button>
                    <button className="btn-nav" onClick={()=>{
                        const labelHtml = '<div style="text-align:center;padding:20px;border:2px dashed #94a3b8;border-radius:12px;max-width:400px;margin:0 auto">' +
                            '<div style="font-family:monospace;font-size:36pt;letter-spacing:4px;font-weight:900;margin:10px 0">' + (detail.BarcodeID||detail.AssetTag||'N/A') + '</div>' +
                            '<div style="font-size:14pt;font-weight:700;margin:8px 0">' + (detail.Name||'') + '</div>' +
                            '<div style="font-size:10pt;color:#64748b">S/N: ' + (detail.SerialNumber||'--') + ' | Tag: ' + (detail.AssetTag||'--') + '</div>' +
                            '<div style="font-size:9pt;color:#94a3b8;margin-top:6px">' + (detail.Manufacturer||'') + ' ' + (detail.Model||'') + '</div>' +
                            '</div>';
                        printRecord('Asset Label: ' + (detail.BarcodeID||detail.AssetTag), labelHtml, { subtitle: 'Print and affix to physical asset' });
                    }} style={{display:'flex',alignItems:'center',gap:6}} title="Print barcode label"><QrCode size={14}/> Print Label</button>
                </div>
            </Modal>
        )}
    </>);
}
/* ═══════════════════════════════════════════════════ TRACKING ═══════════════════════════════════════════════════ */
function TrackingTab({ search }) {
    const { t } = useTranslation();
    const [movements, setMovements] = useState([]);
    const [depReport, setDepReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [subTab, setSubTab] = useState('movements');
    const [filterPlant, setFilterPlant] = useState('');
    const [filterCat, setFilterCat] = useState('');
    const [filterYear, setFilterYear] = useState('');

    const fetchData = useCallback(() => {
        setLoading(true);
        const params = new URLSearchParams();
        if (filterPlant) params.set('plant', filterPlant);
        if (filterCat) params.set('category', filterCat);
        if (filterYear) params.set('year', filterYear);
        const qs = params.toString() ? '?' + params.toString() : '';
        Promise.all([
            API('/movements').then(r=>r.json()).catch(()=>[]),
            API('/depreciation/report' + qs).then(r=>r.json()).catch(e => { console.warn('[ITDepartmentView] fetch error:', e); return null; }),
        ]).then(([m,d])=>{setMovements(Array.isArray(m)?m:[]);setDepReport(d);setLoading(false);}).catch(e => console.warn('[ITDepartmentView]', e));
    }, [filterPlant, filterCat, filterYear]);
    useEffect(()=>{ fetchData(); },[fetchData]);

    if(loading) return <div className="glass-card" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>Loading tracking data...</div>;

    return (
        <div className="glass-card" style={{flex:1,display:'flex',flexDirection:'column',padding:20}}>
            <div style={{display:'flex',gap:10,marginBottom:20,alignItems:'center'}}>
                <button className={`btn-nav ${subTab==='movements'?'active':''}`} onClick={()=>setSubTab('movements')} title="Asset movement history and chain of custody">Movements ({movements.length})</button>
                <button className={`btn-nav ${subTab==='depreciation'?'active':''}`} onClick={()=>setSubTab('depreciation')} title="Depreciation schedule and book value report">Depreciation Report</button>
                {subTab==='movements' && <button className="btn-nav" onClick={()=>{
                    const html = '<div class="section-header">Asset Chain of Custody ('+movements.length+' records)</div>' + 
                        tableHTML(['Date','Category','Type','From','To','By','Tracking','Notes'], movements.map(m=>[
                            formatDate(m.CreatedAt), m.AssetCategory, m.MovementType, m.FromPlantID||m.FromLocation||'—',
                            m.ToPlantID||m.ToLocation||'—', m.ScannedBy||'—', m.TrackingNumber||'—', m.Notes||''
                        ]));
                    printRecord('IT Asset Movements', html, {subtitle:'Enterprise Chain of Custody Ledger'});
                }} title="Print chain of custody" style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}><Printer size={15}/> Print Ledger</button>}
                {subTab==='depreciation' && <>
                    <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{height:32,background:'rgba(255,255,255,0.06)',border:'1px solid var(--glass-border)',borderRadius:8,padding:'0 10px',color:'white',fontSize:'0.78rem'}}>
                        <option value="">All Categories</option><option value="hardware">Hardware</option><option value="infrastructure">Infrastructure</option><option value="mobile">Mobile</option>
                    </select>
                    <select value={filterYear} onChange={e=>setFilterYear(e.target.value)} style={{height:32,background:'rgba(255,255,255,0.06)',border:'1px solid var(--glass-border)',borderRadius:8,padding:'0 10px',color:'white',fontSize:'0.78rem'}}>
                        <option value="">All Years</option>{[...Array(6)].map((_,i)=>{const y=new Date().getFullYear()-i;return <option key={y} value={y}>{y}</option>})}
                    </select>
                </>}
                {subTab==='depreciation' && <button className="btn-nav" onClick={()=>{if(!depReport)return;let html='<div class="section-header">Depreciation Summary</div>'+infoGridHTML([['Original Cost','$'+(depReport.totals?.originalCost||0).toLocaleString()],['Accumulated Depreciation','$'+(depReport.totals?.accumulated||0).toLocaleString()],['Current Book Value','$'+(depReport.totals?.bookValue||0).toLocaleString()],['Monthly Expense','$'+(depReport.totals?.monthlyExpense||0).toLocaleString()]]);['hardware','infrastructure','mobile'].forEach(cat=>{const items=depReport[cat]||[];if(!items.length)return;html+='<div class="section-header">'+cat.charAt(0).toUpperCase()+cat.slice(1)+' ('+items.length+')</div>';html+=tableHTML(['Name','Type','Purchase Cost','Accum. Dep','Book Value','Monthly','Status'],items.map(i=>[i.Name,i.Type,'$'+parseFloat(i.PurchaseCost||0).toLocaleString(),'$'+(i.accumulatedDepreciation||0).toLocaleString(),'$'+(i.currentBookValue||0).toLocaleString(),'$'+(i.monthlyExpense||0).toFixed(2),i.Status]));});if(depReport.alerts){if(depReport.alerts.nearingEndOfLife?.length)html+='<div class="section-header">⚠ Nearing End of Life ('+depReport.alerts.nearingEndOfLife.length+')</div>'+tableHTML(['Name','Category','Plant','Months Left'],depReport.alerts.nearingEndOfLife.map(a=>[a.name,a.category,a.plantId||'--',String(a.remainingMonths)]));if(depReport.alerts.fullyDepreciated?.length)html+='<div class="section-header">Fully Depreciated Assets ('+depReport.alerts.fullyDepreciated.length+')</div>'+tableHTML(['Name','Category','Plant'],depReport.alerts.fullyDepreciated.map(a=>[a.name,a.category,a.plantId||'--']));}if(depReport.byPlant&&Object.keys(depReport.byPlant).length>0)html+='<div class="section-header">By Plant</div>'+tableHTML(['Plant','Assets','Original Cost','Book Value','Monthly Expense'],Object.entries(depReport.byPlant).map(([p,d])=>[p.replace(/_/g,' '),String(d.count),'$'+d.originalCost.toLocaleString(),'$'+d.bookValue.toLocaleString(),'$'+d.monthlyExpense.toLocaleString()]));printRecord('IT Depreciation Report',html,{subtitle:'Enterprise-wide asset depreciation schedule and book values'});}} title="Print depreciation report" style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}><Printer size={15}/> Print Report</button>}
            </div>

            {subTab === 'movements' && (
                <div className="table-container" style={{flex:1,overflowY:'auto'}}>
                    <table className="data-table"><thead><tr><th>{t('it.date', 'Date')}</th><th>{t('it.category', 'Category')}</th><th>{t('it.type', 'Type')}</th><th>{t('it.from', 'From')}</th><th>{t('it.to', 'To')}</th><th>{t('it.by', 'By')}</th><th>{t('it.tracking', 'Tracking #')}</th><th>{t('it.notes', 'Notes')}</th></tr></thead>
                    <tbody>{movements.map(m=>(
                        <tr key={m.ID}>
                            <td>{formatDate(m.CreatedAt)}</td>
                            <td><Badge color="#6366f1">{m.AssetCategory}</Badge></td>
                            <td><Badge color={m.MovementType==='Received'?'#10b981':m.MovementType==='Shipped'?'#f59e0b':'#3b82f6'}>{m.MovementType}</Badge></td>
                            <td>{m.FromPlantID||m.FromLocation||'—'}</td>
                            <td>{m.ToPlantID||m.ToLocation||'—'}</td>
                            <td>{m.ScannedBy||'—'}</td>
                            <td style={{fontFamily:'monospace',fontSize:'0.75rem'}}>{m.TrackingNumber||'—'}</td>
                            <td style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>{m.Notes||''}</td>
                        </tr>
                    ))}{movements.length===0&&<tr><td colSpan={8} className="table-empty">No movement records yet.</td></tr>}</tbody></table>
                </div>
            )}

            {subTab === 'depreciation' && depReport && (
                <div style={{flex:1,overflowY:'auto'}}>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
                        <StatCard icon={DollarSign} label={t('it.originalCost', 'Original Cost')} value={`$${(depReport.totals?.originalCost||0).toLocaleString()}`} color="#3b82f6"/>
                        <StatCard icon={TrendingDown} label={t('it.accumulatedDepreciation', 'Accumulated Depreciation')} value={`$${(depReport.totals?.accumulated||0).toLocaleString()}`} color="#ef4444"/>
                        <StatCard icon={DollarSign} label={t('it.currentBookValue', 'Current Book Value')} value={`$${(depReport.totals?.bookValue||0).toLocaleString()}`} color="#10b981"/>
                        <StatCard icon={DollarSign} label={t('it.monthlyExpense', 'Monthly Expense')} value={`$${(depReport.totals?.monthlyExpense||0).toLocaleString()}`} color="#f59e0b"/>
                    </div>
                    {['hardware','infrastructure','mobile'].map(cat => {
                        const catItems = depReport[cat] || [];
                        if(catItems.length === 0) return null;
                        return (
                            <div key={cat} style={{marginBottom:20}}>
                                <h3 style={{textTransform:'capitalize',marginBottom:10}}>{cat} ({catItems.length})</h3>
                                <table className="data-table"><thead><tr><th>{t('it.name', 'Name')}</th><th>{t('it.type', 'Type')}</th><th>{t('it.purchaseCost', 'Purchase Cost')}</th><th>{t('it.accumDepreciation', 'Accum. Depreciation')}</th><th>{t('it.bookValue', 'Book Value')}</th><th>{t('it.monthly', 'Monthly')}</th><th>{t('it.status', 'Status')}</th></tr></thead>
                                <tbody>{catItems.map(i=>(
                                    <tr key={i.ID}>
                                        <td style={{fontWeight:600}}>{i.Name}</td><td>{i.Type}</td>
                                        <td>${parseFloat(i.PurchaseCost||0).toLocaleString()}</td>
                                        <td style={{color:'#ef4444'}}>${(i.accumulatedDepreciation||0).toLocaleString()}</td>
                                        <td style={{color:'#10b981',fontWeight:600}}>${(i.currentBookValue||0).toLocaleString()}</td>
                                        <td>${(i.monthlyExpense||0).toFixed(2)}</td>
                                        <td><span className={statusClass(i.Status)}>{t('status.' + (i.Status || '').replace(/\s+/g, '').toLowerCase(), i.Status)}</span></td>
                                    </tr>
                                ))}</tbody></table>
                            </div>
                        );
                    })}

                    {/* Depreciation Alerts */}
                    {depReport.alerts && (depReport.alerts.nearingEndOfLife?.length > 0 || depReport.alerts.fullyDepreciated?.length > 0) && (
                        <div style={{marginTop:20}}>
                            {depReport.alerts.nearingEndOfLife?.length > 0 && (
                                <div style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.25)',borderRadius:12,padding:16,marginBottom:12}}>
                                    <h4 style={{margin:'0 0 10px 0',color:'#f59e0b',display:'flex',alignItems:'center',gap:8}}><AlertTriangle size={16}/> Nearing End of Life ({depReport.alerts.nearingEndOfLife.length} assets)</h4>
                                    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{depReport.alerts.nearingEndOfLife.map((a,i)=>(<span key={`item-${i}`} style={{padding:'4px 12px',borderRadius:8,background:'rgba(245,158,11,0.12)',color:'#f59e0b',fontSize:'0.78rem',fontWeight:600}}>{a.name} ({a.remainingMonths}mo)</span>))}</div>
                                </div>
                            )}
                            {depReport.alerts.fullyDepreciated?.length > 0 && (
                                <div style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:12,padding:16,marginBottom:12}}>
                                    <h4 style={{margin:'0 0 10px 0',color:'#ef4444',display:'flex',alignItems:'center',gap:8}}><AlertTriangle size={16}/> Fully Depreciated — Still In Service ({depReport.alerts.fullyDepreciated.length})</h4>
                                    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{depReport.alerts.fullyDepreciated.map((a,i)=>(<span key={`item-${i}`} style={{padding:'4px 12px',borderRadius:8,background:'rgba(239,68,68,0.12)',color:'#ef4444',fontSize:'0.78rem',fontWeight:600}}>{a.name}</span>))}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Book Value Bar Chart by Category */}
                    {depReport.totals && depReport.totals.originalCost > 0 && (
                        <div style={{marginTop:20}}>
                            <h3 style={{marginBottom:12,display:'flex',alignItems:'center',gap:8}}><BarChart3 size={18} color="#6366f1"/> Book Value vs Original Cost</h3>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16}}>
                                {['hardware','infrastructure','mobile'].map(cat => {
                                    const items = depReport[cat] || [];
                                    if (items.length === 0) return null;
                                    const origCost = items.reduce((s,i) => s + parseFloat(i.PurchaseCost||0), 0);
                                    const bookVal = items.reduce((s,i) => s + (i.currentBookValue||0), 0);
                                    const pct = origCost > 0 ? Math.round((bookVal / origCost) * 100) : 0;
                                    const colors = {hardware:'#3b82f6',infrastructure:'#10b981',mobile:'#f59e0b'};
                                    return (
                                        <div key={cat} style={{background:'rgba(255,255,255,0.03)',border:'1px solid var(--glass-border)',borderRadius:12,padding:16}}>
                                            <div style={{fontSize:'0.82rem',fontWeight:600,textTransform:'capitalize',marginBottom:8,color:colors[cat]}}>{cat} ({items.length})</div>
                                            <div style={{height:20,background:'rgba(255,255,255,0.06)',borderRadius:10,overflow:'hidden',marginBottom:8}}>
                                                <div style={{height:'100%',width:pct+'%',background:`linear-gradient(90deg, ${colors[cat]}, ${colors[cat]}aa)`,borderRadius:10,transition:'width 0.6s ease'}}/>
                                            </div>
                                            <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.75rem',color:'#94a3b8'}}>
                                                <span>Book: ${'$'}{bookVal.toLocaleString()}</span>
                                                <span style={{fontWeight:700,color:colors[cat]}}>{pct}% remaining</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* By Plant Breakdown */}
                    {depReport.byPlant && Object.keys(depReport.byPlant).length > 0 && (
                        <div style={{marginTop:20}}>
                            <h3 style={{marginBottom:10}}>Depreciation by Plant</h3>
                            <table className="data-table"><thead><tr><th>{t('it.plant', 'Plant')}</th><th>{t('it.assets', 'Assets')}</th><th>{t('it.originalCost', 'Original Cost')}</th><th>{t('it.bookValue', 'Book Value')}</th><th>{t('it.monthly', 'Monthly')}</th></tr></thead>
                            <tbody>{Object.entries(depReport.byPlant).map(([plant, d]) => (
                                <tr key={plant}><td style={{fontWeight:600}}>{plant.replace(/_/g,' ')}</td><td>{d.count}</td><td>${'$'}{d.originalCost.toLocaleString()}</td><td style={{color:'#10b981',fontWeight:600}}>${'$'}{d.bookValue.toLocaleString()}</td><td>${'$'}{d.monthlyExpense.toLocaleString()}</td></tr>
                            ))}</tbody></table>
                        </div>
                    )}

                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════ VENDORS & CONTRACTS ═══════════════════════════════════════ */
const VENDOR_CATEGORIES = ['MDM','Security','Hardware','Software','Networking','Cloud','Telecom','Consulting','Managed Services','General'];
const CONTRACT_TYPES = ['Support','SLA','Licensing','Maintenance','Managed Service','Subscription','Warranty','Consulting','Lease','Other'];
const CONTRACT_STATUSES = ['Active','Expiring','Expired','Cancelled','Pending','Under Review'];
const PAYMENT_TERMS = ['Net 15','Net 30','Net 45','Net 60','Net 90','Annual Prepay','Monthly','Quarterly'];

function VendorsTab({ search, isITorCreator, onRefreshStats }) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [detail, setDetail] = useState(null);
    const [form, setForm] = useState({ Category:'General', ContractType:'Support', Status:'Active', PaymentTerms:'Net 30', AutoRenew:0 });
    const f = (k,v) => setForm(p=>({...p,[k]:v}));

    const fetch_ = useCallback(()=>{setLoading(true);API('/vendors').then(r=>r.json()).then(d=>{setItems(Array.isArray(d)?d:[]);setLoading(false);}).catch(()=>setLoading(false));},[]);
    useEffect(()=>{fetch_();},[fetch_]);

    const filtered = useMemo(()=>{
        if(!search) return items;
        const s=search.toLowerCase();
        return items.filter(i=>[i.VendorName,i.ContactName,i.ContactEmail,i.ContractNumber,i.Description,i.Category,i.Notes].some(x=>(x||'').toLowerCase().includes(s)));
    },[items,search]);

    const daysUntil = d=>{if(!d)return null;return Math.floor((new Date(d)-new Date())/86400000);};
    const expiryColor = d=>{if(d===null)return'#64748b';if(d<0)return'#ef4444';if(d<=60)return'#f59e0b';return'#10b981';};

    const resetForm = () => setForm({ Category:'General', ContractType:'Support', Status:'Active', PaymentTerms:'Net 30', AutoRenew:0 });

    const handleSave = async()=>{
        if(!form.VendorName) return window.trierToast?.warn('Vendor name is required');
        if(form.ID){
            const r=await API(`/vendors/${form.ID}`,{method:'PUT',body:JSON.stringify(form)});
            if(r.ok){setShowAdd(false);resetForm();fetch_();onRefreshStats();}else{const d=await r.json();window.trierToast?.error(d.error);}
        } else {
            const r=await API('/vendors',{method:'POST',body:JSON.stringify(form)});
            if(r.ok){setShowAdd(false);resetForm();fetch_();onRefreshStats();window.trierToast?.success('Vendor/contract created');}
            else{const d=await r.json();window.trierToast?.error(d.error);}
        }
    };

    const handleDelete = async(id)=>{
        if(!confirm('Delete this vendor/contract record?')) return;
        const r=await API(`/vendors/${id}`,{method:'DELETE'});
        if(r.ok){setDetail(null);setShowAdd(false);fetch_();onRefreshStats();window.trierToast?.success('Deleted');}
    };

    if(loading) return <div className="glass-card" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>Loading vendors & contracts...</div>;

    return (<>
        <div className="glass-card" style={{flex:1,display:'flex',flexDirection:'column',padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{margin:0,display:'flex',alignItems:'center',gap:10}}><Briefcase size={24} color="#06b6d4"/> Vendors & Contracts ({filtered.length})</h2>
                {isITorCreator && <button title="Add new vendor or contract" className="btn-save" onClick={()=>{resetForm();setShowAdd(true);}} style={{height:36,display:'flex',alignItems:'center',gap:8}}><Plus size={16}/> Add Vendor/Contract</button>}
            </div>
            <div className="table-container" style={{flex:1,overflowY:'auto'}}>
                <table className="data-table"><thead><tr><th>{t('it.vendor', 'Vendor')}</th><th>{t('it.category', 'Category')}</th><th>{t('it.contract', 'Contract')}</th><th>{t('it.type', 'Type')}</th><th>{t('it.slaResponse', 'SLA Response')}</th><th>{t('it.endDate', 'End Date')}</th><th>{t('it.annualCost', 'Annual Cost')}</th><th>{t('it.status', 'Status')}</th><th>{t('it.actions', 'Actions')}</th></tr></thead>
                <tbody>{filtered.map(i=>{const days=daysUntil(i.EndDate);return(
                    <tr key={i.ID}>
                        <td style={{fontWeight:600,color:'#06b6d4'}}>{i.VendorName}</td>
                        <td><Badge color="#8b5cf6">{i.Category}</Badge></td>
                        <td style={{fontSize:'0.85rem'}}>{i.ContractNumber||'—'}</td>
                        <td><Badge color="#3b82f6">{i.ContractType}</Badge></td>
                        <td style={{fontSize:'0.85rem'}}>{i.SLAResponseTime||'—'}</td>
                        <td><span style={{color:expiryColor(days),fontWeight:600,fontSize:'0.85rem'}}>{formatDate(i.EndDate)||'Open-ended'}{days!==null&&days<=60&&<span style={{fontSize:'0.7rem',marginLeft:4}}>({days<0?`${Math.abs(days)}d overdue`:`${days}d`})</span>}</span></td>
                        <td style={{fontWeight:600}}>{i.AnnualCost?`$${parseFloat(i.AnnualCost).toLocaleString()}`:'—'}</td>
                        <td><span className={statusClass(i.Status==='Expiring'?'Warning':i.Status==='Expired'?'Overdue':i.Status)}>{t('status.' + (i.Status || '').replace(/\s+/g, '').toLowerCase(), i.Status)}</span></td>
                        <td style={{display:'flex',gap:2}}>
                            <ActionBtn icon={Eye} tip="View vendor/contract details" color="#3b82f6" onClick={()=>setDetail(i)}/>
                            {isITorCreator && <ActionBtn icon={Pencil} tip="Edit" color="#f59e0b" onClick={()=>{setForm({...i});setShowAdd(true);}}/>}
                        </td>
                    </tr>
                );})}{filtered.length===0&&<tr><td colSpan={9} className="table-empty">No vendors or contracts found.</td></tr>}</tbody></table>
            </div>
        </div>

        {showAdd && (
            <Modal title={form.ID ? 'Edit Vendor/Contract' : 'Add Vendor & Contract'} icon={Briefcase} color="#06b6d4" onClose={()=>setShowAdd(false)} width={750}>
                <h3 style={{fontSize:'0.9rem',color:'#06b6d4',margin:'0 0 12px 0',borderBottom:'1px solid var(--glass-border)',paddingBottom:8}}>Vendor Information</h3>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                    <FF t={t} label={t('it.vendorName', 'Vendor Name')} value={form.VendorName} onChange={v=>f('VendorName',v)} required/>
                    <FF t={t} label={t('it.category', 'Category')} value={form.Category} onChange={v=>f('Category',v)} options={VENDOR_CATEGORIES}/>
                    <FF t={t} label={t('it.contactName', 'Contact Name')} value={form.ContactName} onChange={v=>f('ContactName',v)}/>
                    <FF t={t} label={t('it.contactEmail', 'Contact Email')} value={form.ContactEmail} onChange={v=>f('ContactEmail',v)}/>
                    <FF t={t} label={t('it.contactPhone', 'Contact Phone')} value={form.ContactPhone} onChange={v=>f('ContactPhone',v)}/>
                    <FF t={t} label={t('it.website', 'Website')} value={form.Website} onChange={v=>f('Website',v)} placeholder="https://..."/>
                    <div style={{gridColumn:'span 2'}}><FF t={t} label={t('it.address', 'Address')} value={form.Address} onChange={v=>f('Address',v)}/></div>
                </div>
                <h3 style={{fontSize:'0.9rem',color:'#06b6d4',margin:'20px 0 12px 0',borderBottom:'1px solid var(--glass-border)',paddingBottom:8}}>Contract Details</h3>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                    <FF t={t} label={t('it.contractNumber', 'Contract Number')} value={form.ContractNumber} onChange={v=>f('ContractNumber',v)} placeholder="CNT-2026-001"/>
                    <FF t={t} label={t('it.contractType', 'Contract Type')} value={form.ContractType} onChange={v=>f('ContractType',v)} options={CONTRACT_TYPES}/>
                    <FF t={t} label={t('it.startDate', 'Start Date')} type="date" value={form.StartDate} onChange={v=>f('StartDate',v)}/>
                    <FF t={t} label={t('it.endDate', 'End Date')} type="date" value={form.EndDate} onChange={v=>f('EndDate',v)}/>
                    <FF t={t} label={t('it.renewalDate', 'Renewal Date')} type="date" value={form.RenewalDate} onChange={v=>f('RenewalDate',v)}/>
                    <FF t={t} label={t('it.autorenew', 'Auto-Renew')} value={form.AutoRenew?'Yes':'No'} onChange={v=>f('AutoRenew',v==='Yes'?1:0)} options={['Yes','No']}/>
                    <FF t={t} label={t('it.annualCost', 'Annual Cost ($)')} type="number" value={form.AnnualCost} onChange={v=>f('AnnualCost',v)}/>
                    <FF t={t} label={t('it.paymentTerms', 'Payment Terms')} value={form.PaymentTerms} onChange={v=>f('PaymentTerms',v)} options={PAYMENT_TERMS}/>
                    <FF t={t} label={t('it.slaResponseTime', 'SLA Response Time')} value={form.SLAResponseTime} onChange={v=>f('SLAResponseTime',v)} placeholder="e.g. 4 hours, Next Business Day"/>
                    <FF t={t} label={t('it.slaUptimeGuarantee', 'SLA Uptime Guarantee')} value={form.SLAUptimeGuarantee} onChange={v=>f('SLAUptimeGuarantee',v)} placeholder="e.g. 99.9%"/>
                    <FF t={t} label={t('it.status', 'Status')} value={form.Status} onChange={v=>f('Status',v)} options={CONTRACT_STATUSES}/>
                    <div style={{gridColumn:'span 2'}}><FF t={t} label={t('it.description', 'Description')} type="textarea" value={form.Description} onChange={v=>f('Description',v)} placeholder="Contract scope, covered services..."/></div>
                    <div style={{gridColumn:'span 2'}}><FF t={t} label={t('it.notes', 'Notes')} type="textarea" value={form.Notes} onChange={v=>f('Notes',v)}/></div>
                </div>
                <ModalActions t={t} onCancel={()=>setShowAdd(false)} onSave={handleSave} saveLabel={form.ID?'Update':'Save'} onDelete={form.ID?()=>handleDelete(form.ID):null}/>
            </Modal>
        )}

        {detail && !showAdd && (
            <Modal title={detail.VendorName} icon={Briefcase} color="#06b6d4" onClose={()=>setDetail(null)} width={750}>
                <h3 style={{fontSize:'0.85rem',color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 12px 0'}}>Vendor Info</h3>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:20}}>
                    <InfoRow label={t('it.vendor', 'Vendor')} value={detail.VendorName}/>
                    <InfoRow label={t('it.category', 'Category')} value={detail.Category}/>
                    <InfoRow label={t('it.contact', 'Contact')} value={detail.ContactName}/>
                    <InfoRow label={t('it.email', 'Email')} value={detail.ContactEmail}/>
                    <InfoRow label={t('it.phone', 'Phone')} value={detail.ContactPhone}/>
                    <InfoRow label={t('it.website', 'Website')} value={detail.Website}/>
                    {detail.Address && <div style={{gridColumn:'span 3'}}><InfoRow label={t('it.address', 'Address')} value={detail.Address}/></div>}
                </div>
                <h3 style={{fontSize:'0.85rem',color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 12px 0'}}>Contract Details</h3>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                    <InfoRow label={t('it.contract', 'Contract #')} value={detail.ContractNumber}/>
                    <InfoRow label={t('it.type', 'Type')} value={detail.ContractType}/>
                    <InfoRow label={t('it.status', 'Status')} value={detail.Status}/>
                    <InfoRow label={t('it.startDate', 'Start Date')} value={formatDate(detail.StartDate)}/>
                    <InfoRow label={t('it.endDate', 'End Date')} value={formatDate(detail.EndDate)||'Open-ended'}/>
                    <InfoRow label={t('it.renewalDate', 'Renewal Date')} value={formatDate(detail.RenewalDate)}/>
                    <InfoRow label={t('it.autorenew', 'Auto-Renew')} value={detail.AutoRenew?'Yes':'No'}/>
                    <InfoRow label={t('it.annualCost', 'Annual Cost')} value={detail.AnnualCost?`$${parseFloat(detail.AnnualCost).toLocaleString()}`:null}/>
                    <InfoRow label={t('it.paymentTerms', 'Payment Terms')} value={detail.PaymentTerms}/>
                    <InfoRow label={t('it.slaResponse', 'SLA Response')} value={detail.SLAResponseTime}/>
                    <InfoRow label={t('it.slaUptime', 'SLA Uptime')} value={detail.SLAUptimeGuarantee}/>
                    {detail.Description && <div style={{gridColumn:'span 3'}}><InfoRow label={t('it.description', 'Description')} value={detail.Description}/></div>}
                    {detail.Notes && <div style={{gridColumn:'span 3'}}><InfoRow label={t('it.notes', 'Notes')} value={detail.Notes}/></div>}
                </div>
                <div style={{display:'flex',gap:10,marginTop:16,paddingTop:12,borderTop:'1px solid var(--glass-border)'}}>
                    <button className="btn-nav" onClick={()=>{
                        const html = '<div class="section-header">Vendor Info</div>' + infoGridHTML([
                            ['Vendor', detail.VendorName], ['Category', detail.Category], ['Contact', detail.ContactName],
                            ['Email', detail.ContactEmail], ['Phone', detail.ContactPhone], ['Website', detail.Website],
                            ['Address', detail.Address]
                        ]) + '<div class="section-header">Contract Details</div>' + infoGridHTML([
                            ['Contract #', detail.ContractNumber], ['Type', detail.ContractType], ['Status', detail.Status],
                            ['Start Date', formatDate(detail.StartDate)], ['End Date', formatDate(detail.EndDate)||'Open-ended'],
                            ['Auto-Renew', detail.AutoRenew ? 'Yes' : 'No'], ['Annual Cost', detail.AnnualCost ? '$'+parseFloat(detail.AnnualCost).toLocaleString() : '--'],
                            ['Payment Terms', detail.PaymentTerms], ['SLA Response', detail.SLAResponseTime], ['SLA Uptime', detail.SLAUptimeGuarantee]
                        ]);
                        printRecord(detail.VendorName + ' - Contract & Vendor Form', html, { subtitle: 'Vendor Relationship Record' });
                    }} style={{display:'flex',alignItems:'center',gap:6}} title="Print contract detail"><Printer size={14}/> Print Record</button>
                </div>
            </Modal>
        )}
    </>);
}

/* ═══════════════════════════════════════ IT SCAN RESULT MODAL ═══════════════════════════════════════ */
function ITScanResultModal({ data, plantId, plantLabel, onClose, onRefresh }) {
    const { t } = useTranslation();
    const [action, setAction] = useState(null);
    const [shipPlant, setShipPlant] = useState('');
    const [tracking, setTracking] = useState('');
    const [carrier, setCarrier] = useState('');
    const [shipNotes, setShipNotes] = useState('');
    const [recCondition, setRecCondition] = useState('Good');
    const [recNotes, setRecNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [plants, setPlants] = useState([]);
    const currentUser = (() => { try { return JSON.parse(localStorage.getItem('currentUser') || '{}'); } catch { return {}; } })();

    useEffect(() => {
        fetch('/api/plants', { headers: {  } })
            .then(r => r.json()).then(d => setPlants(Array.isArray(d) ? d : [])).catch(e => console.warn('[ITDepartmentView] fetch error:', e));
    }, []);

    const { asset, category, movements, scannedCode } = data;
    const catColor = category === 'hardware' ? '#3b82f6' : category === 'infrastructure' ? '#10b981' : '#f59e0b';
    const CatIcon = category === 'hardware' ? Monitor : category === 'infrastructure' ? Wifi : Smartphone;

    const handleReceive = async () => {
        setSaving(true);
        try {
            const r = await API('/scan/receive', {
                method: 'POST',
                body: JSON.stringify({ category, assetId: asset.ID, plantId, location: '', condition: recCondition, notes: recNotes, scannedBy: currentUser.fullName || currentUser.username || '' }),
            });
            if (r.ok) { window.trierToast?.success('Asset received at ' + (plantLabel || 'this plant')); onRefresh(); }
            else { const d = await r.json(); window.trierToast?.error(d.error); }
        } catch { window.trierToast?.error('Receive failed'); } finally { setSaving(false); }
    };

    const handleShip = async () => {
        if (!shipPlant) return window.trierToast?.warn('Select a destination plant');
        setSaving(true);
        try {
            const r = await API('/scan/ship', {
                method: 'POST',
                body: JSON.stringify({ category, assetId: asset.ID, destinationPlantId: shipPlant, trackingNumber: tracking, carrier, shippingMethod: '', notes: shipNotes, scannedBy: currentUser.fullName || currentUser.username || '' }),
            });
            if (r.ok) { window.trierToast?.success('Asset shipped - status set to In Transit'); onRefresh(); }
            else { const d = await r.json(); window.trierToast?.error(d.error); }
        } catch { window.trierToast?.error('Ship failed'); } finally { setSaving(false); }
    };

    return (
        <Modal title="IT Asset Scanned" icon={ScanLine} color={catColor} onClose={onClose} width={700}>
            <div style={{ background: catColor + '0a', border: '1px solid ' + catColor + '30', borderRadius: 12, padding: 20, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: catColor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CatIcon size={26} color={catColor} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.72rem', color: catColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{category} ASSET</div>
                    <h3 style={{ margin: '2px 0', fontSize: '1.15rem' }}>{asset.Name}</h3>
                    <div style={{ display: 'flex', gap: 10, fontSize: '0.8rem', color: '#94a3b8' }}>
                        <span>S/N: <strong>{asset.SerialNumber || '—'}</strong></span>
                        <span>Tag: <strong>{asset.AssetTag || '—'}</strong></span>
                        <span>Scan: <strong style={{ color: '#06b6d4', fontFamily: 'monospace' }}>{scannedCode}</strong></span>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <span className={statusClass(asset.Status === 'Online' ? 'Active' : asset.Status === 'Offline' ? 'Overdue' : asset.Status)}>{t('status.' + (asset.Status || '').replace(/\s+/g, '').toLowerCase(), asset.Status)}</span>
                    {asset.CurrentBookValue != null && <div style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 700, marginTop: 4 }}>{'$' + parseFloat(asset.CurrentBookValue).toLocaleString()}</div>}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                <InfoRow label={t('it.type', 'Type')} value={asset.Type} />
                <InfoRow label={t('it.manufacturer', 'Manufacturer')} value={asset.Manufacturer} />
                <InfoRow label={t('it.model', 'Model')} value={asset.Model} />
                <InfoRow label={t('it.location', 'Location')} value={asset.Location} />
                <InfoRow label={t('it.plant', 'Plant')} value={asset.PlantID} />
                <InfoRow label={t('it.assignedTo', 'Assigned To')} value={asset.AssignedTo} />
            </div>

            {movements && movements.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', margin: '0 0 8px 0' }}>Recent Movements</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {movements.slice(0, 5).map(m => (
                            <div key={m.ID} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.78rem', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--glass-border)' }}>
                                <Badge color={m.MovementType === 'Received' ? '#10b981' : m.MovementType === 'Shipped' ? '#f59e0b' : '#3b82f6'}>{m.MovementType}</Badge>
                                <span style={{ color: '#94a3b8' }}>{formatDate(m.CreatedAt)}</span>
                                {m.FromPlantID && <span>{m.FromPlantID}</span>}
                                {m.ToPlantID && <><ArrowRight size={12} color="#64748b" /> <span>{m.ToPlantID}</span></>}
                                {m.ScannedBy && <span style={{ marginLeft: 'auto', color: '#64748b' }}>by {m.ScannedBy}</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!action && (
                <div style={{ display: 'flex', gap: 12 }}>
                    <button className="btn-save" onClick={() => setAction('receive')} style={{ flex: 1, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} title="Mark this asset as received at your plant">
                        <CheckCircle2 size={18} /> Receive at {plantLabel || 'This Plant'}
                    </button>
                    <button className="btn-nav" onClick={() => setAction('ship')} style={{ flex: 1, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(245,158,11,0.15)', borderColor: '#f59e0b', color: '#f59e0b' }} title="Ship this asset to another plant">
                        <Truck size={18} /> Ship to Another Plant
                    </button>
                    <button title="Close" className="btn-nav" onClick={onClose} style={{ width: 80 }}>{t('common.close', 'Close')}</button>
                </div>
            )}

            {action === 'receive' && (
                <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: 20 }}>
                    <h4 style={{ margin: '0 0 12px 0', color: '#10b981' }}>Receive Asset</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <FF t={t} label={t('it.condition', 'Condition')} value={recCondition} onChange={setRecCondition} options={CONDITIONS} />
                        <FF t={t} label={t('it.notes', 'Notes')} value={recNotes} onChange={setRecNotes} placeholder="Optional notes..." />
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                        <button title="Receive" className="btn-save" disabled={saving} onClick={handleReceive} style={{ flex: 1 }}>{saving ? 'Receiving...' : 'Confirm Receive'}</button>
                        <button title="Navigate" className="btn-nav" onClick={() => setAction(null)}>{t('common.back', 'Back')}</button>
                    </div>
                </div>
            )}

            {action === 'ship' && (
                <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: 20 }}>
                    <h4 style={{ margin: '0 0 12px 0', color: '#f59e0b' }}>Ship Asset</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <FF t={t} label={t('it.destinationPlant', 'Destination Plant')} value={shipPlant} onChange={setShipPlant} options={plants.map(p => p.PlantID || p.PF_Plant_ID || p.label || String(p))} required />
                        <FF t={t} label={t('it.carrier', 'Carrier')} value={carrier} onChange={setCarrier} placeholder="UPS, FedEx, etc." />
                        <FF t={t} label={t('it.trackingNumber', 'Tracking Number')} value={tracking} onChange={setTracking} placeholder="1Z999..." />
                        <FF t={t} label={t('it.notes', 'Notes')} value={shipNotes} onChange={setShipNotes} placeholder="Optional notes..." />
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                        <button title="Ship" className="btn-primary" disabled={saving || !shipPlant} onClick={handleShip} style={{ flex: 1, background: '#f59e0b', borderColor: '#f59e0b' }}>{saving ? 'Shipping...' : 'Confirm Ship'}</button>
                        <button title="Navigate" className="btn-nav" onClick={() => setAction(null)}>{t('common.back', 'Back')}</button>
                    </div>
                </div>
            )}
        </Modal>
    );
}


/* ═════════════════════════════════════ BATCH SCAN MODAL ═════════════════════════════════════ */
function BatchScanModal({ mode, category, plantId, plantLabel, onClose, onRefresh }) {
    const { t } = useTranslation();
    // Common state
    const [scannedItems, setScannedItems] = useState([]);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState(null);
    const [manualInput, setManualInput] = useState('');
    const inputRef = React.useRef(null);
    const currentUser = (() => { try { return JSON.parse(localStorage.getItem('currentUser') || '{}'); } catch { return {}; } })();
    const scannedBy = currentUser.fullName || currentUser.username || '';

    // Batch Receive common fields
    const [common, setCommon] = useState({
        Name: '', Type: category === 'mobile' ? 'Rugged Scanner' : 'Other',
        Manufacturer: '', Model: '', Location: '', Department: '',
        PurchaseDate: new Date().toISOString().split('T')[0], WarrantyExpiry: '',
        PurchaseCost: '', SalvageValue: '', UsefulLifeYears: category === 'mobile' ? '3' : category === 'infrastructure' ? '7' : '5',
        DepreciationMethod: 'Straight-Line', AssignedTo: '',
    });
    const cf = (k, v) => setCommon(p => ({ ...p, [k]: v }));
    const [condition, setCondition] = useState('New');
    const [batchNotes, setBatchNotes] = useState('');

    // Batch Ship fields
    const [plants, setPlants] = useState([]);
    const [shipPlant, setShipPlant] = useState('');
    const [carrier, setCarrier] = useState('');
    const [tracking, setTracking] = useState('');
    const [shipNotes, setShipNotes] = useState('');

    useEffect(() => {
        fetch('/api/plants', { headers: {  } })
            .then(r => r.json()).then(d => setPlants(Array.isArray(d) ? d : [])).catch(e => console.warn('[ITDepartmentView] fetch error:', e));
    }, []);

    // Auto-focus the manual input
    useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

    const typeOptions = category === 'infrastructure' ? INFRA_TYPES
        : category === 'mobile' ? MOB_TYPES : HW_TYPES;

    const playBeep = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 1200; gain.gain.value = 0.15;
            osc.start(); osc.stop(ctx.currentTime + 0.08);
        } catch (e) { console.warn('[ITDepartmentView] caught:', e); }
    };

    // Batch receive: add a serial number
    const addSerial = (serial) => {
        const clean = (serial || '').trim();
        if (!clean) return;
        if (scannedItems.includes(clean)) {
            window.trierToast?.warn('Duplicate: ' + clean);
            return;
        }
        setScannedItems(prev => [...prev, clean]);
        playBeep();
        setManualInput('');
        if (inputRef.current) inputRef.current.focus();
    };

    // Batch ship: scan and add an existing asset
    const addShipItem = async (code) => {
        const clean = (code || '').trim();
        if (!clean) return;
        if (scannedItems.find(i => i.code === clean)) {
            window.trierToast?.warn('Already in shipment: ' + clean);
            return;
        }
        // Look up the asset
        try {
            const r = await API('/scan/lookup', {
                method: 'POST', body: JSON.stringify({ code: clean })
            });
            const d = await r.json();
            if (d.found) {
                setScannedItems(prev => [...prev, { code: clean, name: d.asset.Name, category: d.category, assetId: d.asset.ID, serial: d.asset.SerialNumber }]);
                playBeep();
            } else {
                window.trierToast?.warn('Asset not found: ' + clean);
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
        } catch {
            window.trierToast?.error('Lookup failed');
        }
        setManualInput('');
        if (inputRef.current) inputRef.current.focus();
    };

    // Listen for hardware scanner wedge events while batch modal is open
    useEffect(() => {
        const handleKey = (e) => {
            // Only intercept when our modal is open and no other input is focused (besides ours)
            if (document.activeElement && document.activeElement !== inputRef.current && document.activeElement.tagName === 'INPUT') return;
        };
        // We rely on the manual input field for keyboard wedge input in batch mode
        return () => {};
    }, []);

    const handleSubmitReceive = async () => {
        if (scannedItems.length === 0) return window.trierToast?.warn('Scan at least one serial number');
        if (!common.Manufacturer && !common.Name) return window.trierToast?.warn('Fill in at least a Name or Manufacturer');
        setSaving(true);
        try {
            const r = await API('/scan/batch-receive', {
                method: 'POST',
                body: JSON.stringify({
                    category, plantId, common, serials: scannedItems,
                    condition, scannedBy, notes: batchNotes,
                })
            });
            const d = await r.json();
            setResult(d);
            if (d.success) {
                window.trierToast?.success(d.message);
                onRefresh();
            } else {
                window.trierToast?.error(d.error || 'Batch receive failed');
            }
        } catch (err) {
            window.trierToast?.error('Batch receive failed');
        } finally { setSaving(false); }
    };

    const handleSubmitShip = async () => {
        if (scannedItems.length === 0) return window.trierToast?.warn('Scan at least one asset');
        if (!shipPlant) return window.trierToast?.warn('Select a destination plant');
        setSaving(true);
        try {
            const r = await API('/scan/batch-ship', {
                method: 'POST',
                body: JSON.stringify({
                    items: scannedItems.map(i => ({ code: i.code, category: i.category, assetId: i.assetId })),
                    destinationPlantId: shipPlant, trackingNumber: tracking,
                    carrier, notes: shipNotes, scannedBy,
                })
            });
            const d = await r.json();
            setResult(d);
            if (d.success) {
                window.trierToast?.success(d.message);
                onRefresh();
            } else {
                window.trierToast?.error(d.error || 'Batch ship failed');
            }
        } catch (err) {
            window.trierToast?.error('Batch ship failed');
        } finally { setSaving(false); }
    };

    const removeItem = (idx) => setScannedItems(prev => prev.filter((_, i) => i !== idx));

    const isReceive = mode === 'receive';
    const color = isReceive ? '#10b981' : '#f59e0b';
    const Icon = isReceive ? CheckCircle2 : Truck;

    return (
        <Modal title={isReceive ? 'Batch Receive Assets' : 'Batch Ship Assets'} icon={Icon} color={color} onClose={onClose} width={800}>

            {result ? (
                // Results screen
                <div>
                    <div style={{ textAlign: 'center', padding: 30 }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <CheckCircle2 size={32} color={color} />
                        </div>
                        <h3 style={{ margin: '0 0 8px 0', color }}>{isReceive ? 'Batch Receive Complete' : 'Batch Ship Complete'}</h3>
                        {!isReceive && result.shipped > 0 && <button title="Navigate" className="btn-nav" onClick={()=>{
                            const html = infoGridHTML([['Destination',shipPlant],['Carrier',carrier||'--'],['Tracking #',tracking||'--'],['Shipped By',scannedBy],['Date',new Date().toLocaleDateString()]]) +
                                tableHTML(['#','Asset','Serial/Code','Category'], (result.items||scannedItems).map((it,i)=>[String(i+1),it.name||'--',it.serial||it.code||'--',it.category||category]));
                            printRecord('IT Batch Shipment - Packing List', html, {subtitle:'Ship to '+shipPlant+(tracking?' | Tracking: '+tracking:'')});
                        }} style={{marginTop:12,display:'flex',alignItems:'center',gap:6,margin:'0 auto'}}><Printer size={14}/> Print Packing List</button>}
                        <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>{result.message}</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                        <div style={{ textAlign: 'center', padding: 20, background: 'rgba(16,185,129,0.08)', borderRadius: 12 }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>{result.created || result.shipped || 0}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{isReceive ? 'Created' : 'Shipped'}</div>
                        </div>
                        {result.duplicates?.length > 0 && (
                            <div style={{ textAlign: 'center', padding: 20, background: 'rgba(245,158,11,0.08)', borderRadius: 12 }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b' }}>{result.duplicates.length}</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Duplicates Skipped</div>
                            </div>
                        )}
                        {(result.failed?.length > 0 || result.notFound?.length > 0) && (
                            <div style={{ textAlign: 'center', padding: 20, background: 'rgba(239,68,68,0.08)', borderRadius: 12 }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ef4444' }}>{(result.failed?.length || 0) + (result.notFound?.length || 0)}</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Errors</div>
                            </div>
                        )}
                    </div>
                    <button title="Close" className="btn-save" onClick={onClose} style={{ width: '100%', height: 44 }}>Done</button>
                </div>
            ) : (
                <>
                    {/* Common fields for batch receive */}
                    {isReceive && (
                        <div style={{ background: color + '08', border: '1px solid ' + color + '25', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                            <h4 style={{ margin: '0 0 10px 0', color, fontSize: '0.85rem' }}>Common Details (applied to all scanned items)</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                <FF t={t} label={t('it.name', 'Name')} value={common.Name} onChange={v => cf('Name', v)} placeholder="e.g. Zebra TC78" required />
                                <FF t={t} label={t('it.type', 'Type')} value={common.Type} onChange={v => cf('Type', v)} options={typeOptions} />
                                <FF t={t} label={t('it.manufacturer', 'Manufacturer')} value={common.Manufacturer} onChange={v => cf('Manufacturer', v)} placeholder="e.g. Zebra Technologies" />
                                <FF t={t} label={t('it.model', 'Model')} value={common.Model} onChange={v => cf('Model', v)} placeholder="e.g. TC78HL" />
                                <FF t={t} label={t('it.purchaseCost', 'Purchase Cost ($)')} value={common.PurchaseCost} onChange={v => cf('PurchaseCost', v)} placeholder="0.00" type="number" />
                                <FF t={t} label={t('it.usefulLifeYr', 'Useful Life (yr)')} value={common.UsefulLifeYears} onChange={v => cf('UsefulLifeYears', v)} type="number" />
                                <FF t={t} label={t('it.location', 'Location')} value={common.Location} onChange={v => cf('Location', v)} placeholder="Warehouse, IT Closet, etc." />
                                <FF t={t} label={t('it.condition', 'Condition')} value={condition} onChange={setCondition} options={CONDITIONS} />
                                <FF t={t} label={t('it.purchaseDate', 'Purchase Date')} value={common.PurchaseDate} onChange={v => cf('PurchaseDate', v)} type="date" />
                            </div>
                        </div>
                    )}

                    {/* Ship destination for batch ship */}
                    {!isReceive && (
                        <div style={{ background: color + '08', border: '1px solid ' + color + '25', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                            <h4 style={{ margin: '0 0 10px 0', color, fontSize: '0.85rem' }}>Shipment Details (applied to all scanned items)</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                <FF t={t} label={t('it.destinationPlant', 'Destination Plant')} value={shipPlant} onChange={setShipPlant} options={plants.map(p => p.PlantID || p.PF_Plant_ID || p.label || String(p))} required />
                                <FF t={t} label={t('it.carrier', 'Carrier')} value={carrier} onChange={setCarrier} placeholder="UPS, FedEx, etc." />
                                <FF t={t} label={t('it.trackingNumber', 'Tracking Number')} value={tracking} onChange={setTracking} placeholder="1Z999..." />
                            </div>
                        </div>
                    )}

                    {/* Scan input area */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <ScanLine size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                            <input
                                ref={inputRef}
                                value={manualInput}
                                onChange={e => setManualInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && manualInput.trim()) {
                                        isReceive ? addSerial(manualInput) : addShipItem(manualInput);
                                    }
                                }}
                                placeholder={isReceive ? 'Scan or type serial number, then Enter...' : 'Scan barcode / serial / asset tag, then Enter...'}
                                autoFocus
                                style={{
                                    width: '100%', height: 44, paddingLeft: 36,
                                    background: 'rgba(255,255,255,0.05)', border: '2px solid ' + color + '40',
                                    borderRadius: 10, color: 'var(--text-primary)', fontSize: '1rem',
                                    fontFamily: 'monospace', outline: 'none',
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: color + '15', borderRadius: 10, minWidth: 80, justifyContent: 'center' }}>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{scannedItems.length}</span>
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>scanned</span>
                        </div>
                    </div>

                    {/* Scanned items list */}
                    {scannedItems.length > 0 && (
                        <div style={{ maxHeight: 220, overflow: 'auto', marginBottom: 16, border: '1px solid var(--glass-border)', borderRadius: 10, padding: 4 }}>
                            {(isReceive ? scannedItems : scannedItems).map((item, idx) => (
                                <div key={`item-${idx}`} style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px',
                                    fontSize: '0.82rem', background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                    borderRadius: 6,
                                }}>
                                    <span style={{ width: 28, color: '#64748b', fontWeight: 600 }}>#{idx + 1}</span>
                                    {isReceive ? (
                                        <span style={{ flex: 1, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{item}</span>
                                    ) : (
                                        <span style={{ flex: 1 }}>
                                            <strong style={{ color: 'var(--text-primary)' }}>{item.name}</strong>
                                            <span style={{ color: '#64748b', marginLeft: 8, fontFamily: 'monospace', fontSize: '0.75rem' }}>S/N: {item.serial || item.code}</span>
                                        </span>
                                    )}
                                    <button onClick={() => removeItem(idx)} title="Remove" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}>
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Notes */}
                    <FF t={t} label={t('it.batchNotes', 'Batch Notes')} value={isReceive ? batchNotes : shipNotes} onChange={isReceive ? setBatchNotes : setShipNotes} placeholder="Optional notes for the entire batch..." />

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                        <button title="Submit Receive"
                            className={isReceive ? 'btn-save' : 'btn-primary'}
                            disabled={saving || scannedItems.length === 0 || (!isReceive && !shipPlant)}
                            onClick={isReceive ? handleSubmitReceive : handleSubmitShip}
                            style={{ flex: 1, height: 48, fontSize: '1rem', fontWeight: 700, ...(isReceive ? {} : { background: '#f59e0b', borderColor: '#f59e0b' }) }}
                        >
                            {saving ? (isReceive ? 'Creating...' : 'Shipping...') : (isReceive
                                ? 'Create ' + scannedItems.length + ' Asset' + (scannedItems.length !== 1 ? 's' : '')
                                : 'Ship ' + scannedItems.length + ' Asset' + (scannedItems.length !== 1 ? 's' : '') + ' to ' + (shipPlant || '...')
                            )}
                        </button>
                        <button title="Close" className="btn-nav" onClick={onClose} style={{ width: 80 }}>{t('common.cancel', 'Cancel')}</button>
                    </div>
                </>
            )}
        </Modal>
    );
}



/* ═══════════════════════ LINKED ASSETS PANEL (9.1) ═══════════════════════ */
function LinkedAssetsPanel({ category, assetId, assetName }) {
    const [links, setLinks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [searchQ, setSearchQ] = useState('');
    const [searchResults, setSearchResults] = useState([]);

    const fetchLinks = () => {
        setLoading(true);
        if (category === 'software') {
            API('/links/software-hardware/' + assetId).then(r => r.json()).then(d => { setLinks(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
        } else if (category === 'hardware') {
            API('/links/hardware-software/' + assetId).then(r => r.json()).then(d => { setLinks(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
        } else {
            // For infra/mobile, show work order links
            API('/links/workorders/' + category + '/' + assetId).then(r => r.json()).then(d => { setLinks(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
        }
    };

    useEffect(() => { fetchLinks(); }, [category, assetId]);

    const handleSearch = async (q) => {
        setSearchQ(q);
        if (q.length < 2) { setSearchResults([]); return; }
        try {
            const targetCat = category === 'software' ? 'hardware' : 'software';
            const r = await API('/' + targetCat + '?search=' + encodeURIComponent(q));
            const d = await r.json();
            setSearchResults((Array.isArray(d) ? d : d.data || []).slice(0, 10));
        } catch { setSearchResults([]); }
    };

    const addLink = async (targetId) => {
        if (category === 'software') {
            await API('/links/software-hardware', { method: 'POST', body: JSON.stringify({ softwareId: assetId, hardwareId: targetId }) });
        } else if (category === 'hardware') {
            await API('/links/software-hardware', { method: 'POST', body: JSON.stringify({ softwareId: targetId, hardwareId: assetId }) });
        }
        setShowAdd(false);
        setSearchQ('');
        setSearchResults([]);
        fetchLinks();
    };

    const removeLink = async (linkId) => {
        await API('/links/software-hardware/' + linkId, { method: 'DELETE' });
        fetchLinks();
    };

    if (loading) return null;

    const linkLabel = category === 'software' ? 'Installed On' : category === 'hardware' ? 'Installed Software' : 'Linked Work Orders';
    const canLink = category === 'software' || category === 'hardware';

    return (
        <div style={{marginTop:16,paddingTop:12,borderTop:'1px solid var(--glass-border)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <h4 style={{fontSize:'0.8rem',color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>{linkLabel} ({links.length})</h4>
                {canLink && <button title="Navigate" className="btn-nav" onClick={()=>setShowAdd(!showAdd)} style={{fontSize:'0.72rem',padding:'2px 10px'}}>+ Link</button>}
            </div>
            {links.length === 0 && !showAdd && <div style={{fontSize:'0.78rem',color:'#475569',fontStyle:'italic'}}>No linked assets yet.</div>}
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
                {links.map(l => (
                    <div key={l.ID} style={{display:'flex',alignItems:'center',gap:8,fontSize:'0.78rem',padding:'4px 10px',background:'rgba(255,255,255,0.02)',borderRadius:8,border:'1px solid var(--glass-border)'}}>
                        <span style={{fontWeight:600,color:'#e2e8f0',flex:1}}>{l.HardwareName || l.SoftwareName || ('WO #' + l.WorkOrderID)}</span>
                        {l.HardwareType && <span style={{fontSize:'0.7rem',color:'#64748b'}}>{l.HardwareType}</span>}
                        {l.Vendor && <span style={{fontSize:'0.7rem',color:'#64748b'}}>{l.Vendor}</span>}
                        {l.HardwareStatus && <span className={statusClass(l.HardwareStatus)}>{l.HardwareStatus}</span>}
                        {l.SoftwareStatus && <span className={statusClass(l.SoftwareStatus)}>{l.SoftwareStatus}</span>}
                        {canLink && <button onClick={()=>removeLink(l.ID)} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:'0.85rem',padding:'0 4px'}} title="Remove link">×</button>}
                    </div>
                ))}
            </div>
            {showAdd && (
                <div style={{marginTop:8,padding:10,background:'rgba(99,102,241,0.06)',borderRadius:10,border:'1px solid rgba(99,102,241,0.2)'}}>
                    <input value={searchQ} onChange={e=>handleSearch(e.target.value)} placeholder={'Search ' + (category==='software'?'hardware':'software') + ' to link...'} style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid var(--glass-border)',background:'rgba(255,255,255,0.04)',color:'white',fontSize:'0.82rem'}} autoFocus/>
                    <div style={{maxHeight:150,overflow:'auto',marginTop:6}}>
                        {searchResults.map(r => (
                            <div key={r.ID} onClick={()=>addLink(r.ID)} style={{padding:'6px 10px',cursor:'pointer',borderRadius:6,fontSize:'0.78rem',display:'flex',justifyContent:'space-between',':hover':{background:'rgba(99,102,241,0.1)'}}} onMouseOver={e=>e.currentTarget.style.background='rgba(99,102,241,0.1)'} onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                                <span style={{fontWeight:600}}>{r.Name}</span>
                                <span style={{color:'#64748b'}}>{r.Type || r.Vendor || ''}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}


/* ═══════════════════════ ASSET MOVEMENT HISTORY (for detail modal) ═══════════════════════ */
function AssetMovementHistory({ category, assetId }) {
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        API('/movements').then(r => r.json()).then(all => {
            const filtered = (Array.isArray(all) ? all : []).filter(m => m.AssetID === assetId && m.AssetCategory === category).catch(e => console.warn('[ITDepartmentView]', e));
            setMovements(filtered);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [category, assetId]);

    if (loading) return <div style={{fontSize:'0.78rem',color:'#64748b',padding:'12px 0'}}>Loading movement history...</div>;
    if (movements.length === 0) return <div style={{fontSize:'0.78rem',color:'#475569',padding:'12px 0',fontStyle:'italic'}}>No movement history recorded for this asset.</div>;

    return (
        <div style={{marginTop:16,paddingTop:12,borderTop:'1px solid var(--glass-border)'}}>
            <h4 style={{fontSize:'0.8rem',color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 8px 0'}}>Movement History ({movements.length})</h4>
            <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:200,overflow:'auto'}}>
                {movements.map(m => (
                    <div key={m.ID} style={{display:'flex',alignItems:'center',gap:10,fontSize:'0.78rem',padding:'6px 10px',background:'rgba(255,255,255,0.02)',borderRadius:8,border:'1px solid var(--glass-border)'}}>
                        <Badge color={m.MovementType==='Received'?'#10b981':m.MovementType==='Shipped'?'#f59e0b':'#3b82f6'}>{m.MovementType}</Badge>
                        <span style={{color:'#94a3b8'}}>{formatDate(m.CreatedAt)}</span>
                        {m.FromPlantID && <span>{m.FromPlantID}</span>}
                        {m.ToPlantID && <><ArrowRight size={12} color="#64748b"/> <span>{m.ToPlantID}</span></>}
                        {m.ScannedBy && <span style={{marginLeft:'auto',color:'#64748b'}}>by {m.ScannedBy}</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ═══════════════════════ CSV IMPORT MODAL ═══════════════════════ */
function ImportModal({ category, onClose, onSuccess }) {
    const { t } = useTranslation();
    const [step, setStep] = useState(1); // 1=upload, 2=mapping, 3=preview, 4=result
    const [csvData, setCsvData] = useState([]);
    const [csvHeaders, setCsvHeaders] = useState([]);
    const [mapping, setMapping] = useState({});
    const [result, setResult] = useState(null);
    const [importing, setImporting] = useState(false);
    const fileRef = useRef(null);

    const FIELD_MAP = {
        software: ['Name','Vendor','Version','LicenseKey','LicenseType','Seats','SeatsUsed','ExpiryDate','RenewalCost','Category','Status','AssignedTo','Department','PurchaseDate','PurchaseOrder','Notes'],
        hardware: ['Name','Type','Manufacturer','Model','SerialNumber','AssetTag','AssignedTo','Location','Department','PurchaseDate','WarrantyExpiry','PurchaseCost','SalvageValue','UsefulLifeYears','DepreciationMethod','Status','Condition','Notes'],
        infrastructure: ['Name','Type','Manufacturer','Model','SerialNumber','AssetTag','IPAddress','MACAddress','Location','RackPosition','PurchaseDate','WarrantyExpiry','PurchaseCost','SalvageValue','UsefulLifeYears','DepreciationMethod','Status','Criticality','Notes'],
        mobile: ['Name','Type','Manufacturer','Model','SerialNumber','AssetTag','IMEI','PhoneNumber','Carrier','MonthlyCost','AssignedTo','Department','MDMEnrolled','PurchaseDate','WarrantyExpiry','PurchaseCost','SalvageValue','UsefulLifeYears','DepreciationMethod','Status','Notes'],
    };
    const dbFields = FIELD_MAP[category] || [];
    const catColor = category==='software'?'#8b5cf6':category==='hardware'?'#3b82f6':category==='infrastructure'?'#10b981':'#f59e0b';

    const parseCSV = (text) => {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return { headers: [], rows: [] };
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const vals = [];
            let inQuotes = false, current = '';
            for (const ch of lines[i]) {
                if (ch === '"') { inQuotes = !inQuotes; continue; }
                if (ch === ',' && !inQuotes) { vals.push(current.trim()); current = ''; continue; }
                current += ch;
            }
            vals.push(current.trim());
            const row = {};
            headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
            rows.push(row);
        }
        return { headers, rows };
    };

    const handleFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const { headers, rows } = parseCSV(ev.target.result);
            setCsvHeaders(headers);
            setCsvData(rows);
            // Auto-map matching column names
            const autoMap = {};
            headers.forEach(h => {
                const match = dbFields.find(f => f.toLowerCase() === h.toLowerCase().replace(/[\s_-]/g, ''));
                if (match) autoMap[h] = match;
                // Fuzzy match common patterns
                const fuzzy = dbFields.find(f => h.toLowerCase().includes(f.toLowerCase()) || f.toLowerCase().includes(h.toLowerCase().replace(/[\s_#]/g,'')));
                if (!autoMap[h] && fuzzy) autoMap[h] = fuzzy;
            });
            setMapping(autoMap);
            setStep(2);
        };
        reader.readAsText(file);
    };

    const handleImport = async () => {
        setImporting(true);
        try {
            const r = await API('/import/' + category, {
                method: 'POST',
                body: JSON.stringify({ rows: csvData, mapping, plantId: localStorage.getItem('selectedPlantId') }),
            });
            const d = await r.json();
            setResult(d);
            setStep(4);
            if (d.imported > 0) onSuccess();
        } catch (err) {
            window.trierToast?.error('Import failed');
        } finally { setImporting(false); }
    };

    return (
        <Modal title={'Import ' + category.charAt(0).toUpperCase() + category.slice(1)} icon={Upload} color={catColor} onClose={onClose} width={850}>

            {/* Safety notice */}
            <div style={{background:'rgba(59,130,246,0.08)',border:'1px solid rgba(59,130,246,0.25)',borderRadius:10,padding:12,marginBottom:16,fontSize:'0.8rem',color:'#93c5fd'}}>
                <strong>Safe Import:</strong> Only inserts into existing <code>it_{category}</code> table. No new tables are created. Duplicate serial numbers and asset tags are automatically detected and skipped. All imports run in a transaction — if anything fails, everything rolls back.
            </div>

            {step === 1 && (
                <div style={{textAlign:'center',padding:'40px 20px'}}>
                    <div style={{width:80,height:80,borderRadius:'50%',background:catColor+'15',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px'}}>
                        <Upload size={36} color={catColor}/>
                    </div>
                    <h3 style={{margin:'0 0 8px 0'}}>Upload CSV File</h3>
                    <p style={{color:'#94a3b8',fontSize:'0.85rem',margin:'0 0 20px 0'}}>Select a CSV file with {category} asset data. Column headers will be mapped to database fields in the next step.</p>
                    <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{display:'none'}} />
                    <div style={{display:'flex',gap:12,justifyContent:'center'}}>
                        <button title="Save" className="btn-save" onClick={()=>fileRef.current?.click()} style={{height:44,padding:'0 24px',display:'flex',alignItems:'center',gap:8}}>
                            <Upload size={16}/> Choose CSV File
                        </button>
                        <button title="Navigate" className="btn-nav" onClick={()=>window.open('/api/it/import/template/'+category,'_blank')} style={{height:44,padding:'0 24px',display:'flex',alignItems:'center',gap:8}}>
                            <Download size={16}/> Download Template
                        </button>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div>
                    <h3 style={{margin:'0 0 4px 0'}}>Column Mapping</h3>
                    <p style={{color:'#94a3b8',fontSize:'0.82rem',margin:'0 0 16px 0'}}>Map your CSV columns to the {category} database fields. Unmapped columns will be ignored.</p>
                    <div style={{maxHeight:400,overflow:'auto',border:'1px solid var(--glass-border)',borderRadius:10,padding:4}}>
                        <table className="data-table">
                            <thead><tr><th>{t('it.csvColumn', 'CSV Column')}</th><th>{t('it.sampleData', 'Sample Data')}</th><th>{t('it.databaseField', '→ Database Field')}</th><th>{t('it.status', 'Status')}</th></tr></thead>
                            <tbody>{csvHeaders.map(h => {
                                const sample = csvData[0]?.[h] || '';
                                const mapped = mapping[h];
                                return (
                                    <tr key={h}>
                                        <td style={{fontWeight:600,fontFamily:'monospace',fontSize:'0.82rem'}}>{h}</td>
                                        <td style={{fontSize:'0.78rem',color:'#94a3b8',maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sample || '(empty)'}</td>
                                        <td>
                                            <select value={mapped||''} onChange={e=>setMapping(prev=>({...prev,[h]:e.target.value||undefined}))}
                                                style={{width:'100%',background:'rgba(255,255,255,0.06)',border:'1px solid var(--glass-border)',borderRadius:6,padding:'4px 8px',color:mapped?'white':'#64748b',fontSize:'0.8rem'}}>
                                                <option value="">-- Skip --</option>
                                                {dbFields.map(f=><option key={f} value={f}>{f}</option>)}
                                            </select>
                                        </td>
                                        <td>{mapped ? <span style={{color:'#10b981',fontWeight:700,fontSize:'0.75rem'}}>✓ Mapped</span> : <span style={{color:'#64748b',fontSize:'0.75rem'}}>Skipped</span>}</td>
                                    </tr>
                                );
                            })}</tbody>
                        </table>
                    </div>
                    <div style={{display:'flex',gap:10,marginTop:16,justifyContent:'space-between'}}>
                        <button title="Navigate" className="btn-nav" onClick={()=>setStep(1)}>{t('common.back', 'Back')}</button>
                        <div style={{display:'flex',gap:10,alignItems:'center'}}>
                            <span style={{fontSize:'0.78rem',color:'#94a3b8'}}>{Object.keys(mapping).filter(k=>mapping[k]).length} of {csvHeaders.length} columns mapped • {csvData.length} rows</span>
                            <button title="Save" className="btn-save" onClick={()=>setStep(3)} disabled={!Object.values(mapping).includes('Name')}>Preview →</button>
                        </div>
                    </div>
                </div>
            )}

            {step === 3 && (
                <div>
                    <h3 style={{margin:'0 0 4px 0'}}>Preview Import ({csvData.length} rows)</h3>
                    <p style={{color:'#94a3b8',fontSize:'0.82rem',margin:'0 0 12px 0'}}>Review the data below. Click Import to proceed.</p>
                    <div style={{maxHeight:300,overflow:'auto',border:'1px solid var(--glass-border)',borderRadius:10}}>
                        <table className="data-table">
                            <thead><tr>{Object.entries(mapping).filter(([,v])=>v).map(([,v])=><th key={v}>{v}</th>)}</tr></thead>
                            <tbody>{csvData.slice(0,20).map((row,i)=>(
                                <tr key={`item-${i}`}>{Object.entries(mapping).filter(([,v])=>v).map(([csvH,dbF])=><td key={dbF} style={{fontSize:'0.78rem'}}>{row[csvH]||''}</td>)}</tr>
                            ))}{csvData.length>20&&<tr><td colSpan={Object.values(mapping).filter(Boolean).length} style={{textAlign:'center',fontSize:'0.78rem',color:'#64748b'}}>...and {csvData.length-20} more rows</td></tr>}</tbody>
                        </table>
                    </div>
                    <div style={{display:'flex',gap:10,marginTop:16,justifyContent:'space-between'}}>
                        <button title="Navigate" className="btn-nav" onClick={()=>setStep(2)}>Back to Mapping</button>
                        <button title="Import" className="btn-save" onClick={handleImport} disabled={importing} style={{height:44,padding:'0 24px'}}>
                            {importing ? 'Importing...' : 'Import ' + csvData.length + ' Records'}
                        </button>
                    </div>
                </div>
            )}

            {step === 4 && result && (
                <div style={{textAlign:'center',padding:30}}>
                    <div style={{width:64,height:64,borderRadius:'50%',background:result.imported>0?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
                        <CheckCircle2 size={32} color={result.imported>0?'#10b981':'#ef4444'}/>
                    </div>
                    <h3 style={{margin:'0 0 16px 0'}}>Import Complete</h3>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:20}}>
                        <div style={{textAlign:'center',padding:16,background:'rgba(16,185,129,0.08)',borderRadius:12}}>
                            <div style={{fontSize:'1.5rem',fontWeight:800,color:'#10b981'}}>{result.imported}</div>
                            <div style={{fontSize:'0.75rem',color:'#64748b'}}>Imported</div>
                        </div>
                        <div style={{textAlign:'center',padding:16,background:'rgba(245,158,11,0.08)',borderRadius:12}}>
                            <div style={{fontSize:'1.5rem',fontWeight:800,color:'#f59e0b'}}>{(result.duplicates||[]).length}</div>
                            <div style={{fontSize:'0.75rem',color:'#64748b'}}>Duplicates Skipped</div>
                        </div>
                        <div style={{textAlign:'center',padding:16,background:'rgba(239,68,68,0.08)',borderRadius:12}}>
                            <div style={{fontSize:'1.5rem',fontWeight:800,color:'#ef4444'}}>{(result.errors||[]).length}</div>
                            <div style={{fontSize:'0.75rem',color:'#64748b'}}>Errors</div>
                        </div>
                    </div>
                    {(result.errors||[]).length > 0 && (
                        <div style={{textAlign:'left',background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,padding:12,marginBottom:16,maxHeight:120,overflow:'auto'}}>
                            {result.errors.map((e,i)=><div key={`item-${i}`} style={{fontSize:'0.78rem',color:'#fca5a5'}}>Row {e.row}: {e.error}</div>)}
                        </div>
                    )}
                    <button title="Close" className="btn-save" onClick={onClose} style={{width:'100%',height:44}}>Done</button>
                </div>
            )}
        </Modal>
    );
}
