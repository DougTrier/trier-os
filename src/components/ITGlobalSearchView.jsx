// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — IT Global Search
 * =============================
 * Cross-plant enterprise search for all IT assets. Locate any piece of
 * IT equipment across the entire organization by name, serial number,
 * asset tag, IP address, IMEI, or barcode scan — instantly.
 *
 * KEY FEATURES:
 *   - Full-text search across all IT asset types simultaneously
 *   - Search fields: name, serial, asset tag, IP, IMEI, MAC address, barcode
 *   - Asset type badges: Computer / Network / Mobile / License / Server
 *   - Location column: plant + room/rack assignment per result
 *   - Status indicator: Active / Offline / In Repair / Decommissioned
 *   - Click result to open full IT asset detail panel
 *   - SearchBar component with debounced live-search (300ms)
 *
 * API CALLS:
 *   GET /api/it/search?q= — Cross-plant IT asset search (all categories)
 */
import React, { useState, useCallback } from 'react';
import { Search, Monitor, Wifi, Smartphone, Key, MapPin, Server } from 'lucide-react';
import SearchBar from './SearchBar';
import { statusClass } from '../utils/formatDate';
import { useTranslation } from '../i18n/index.jsx';

const API = (path) => fetch(`/api/it${path}`, {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}`, 'Content-Type': 'application/json' },
});

const Badge = ({ color, children }) => (
    <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:12, fontSize:'0.72rem', fontWeight:600, background:color+'22', color, border:'1px solid '+color+'44' }}>{children}</span>
);

export default function ITGlobalSearchView() {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);

    const doSearch = useCallback(async (q) => {
        if (!q || q.length < 2) { setResults(null); return; }
        setLoading(true);
        try {
            const r = await API(`/global-search?q=${encodeURIComponent(q)}`);
            const d = await r.json();
            setResults(d);
        } catch { setResults({ results: [], total: 0 }); }
        setLoading(false);
    }, []);

    const handleSearch = (val) => {
        setQuery(val);
        if (val.length >= 2) {
            clearTimeout(window._itSearchTimer);
            window._itSearchTimer = setTimeout(() => doSearch(val), 350);
        } else {
            setResults(null);
        }
    };

    const catColors = { hardware: '#3b82f6', infrastructure: '#10b981', mobile: '#f59e0b', software: '#8b5cf6' };
    const CatIcon = { hardware: Monitor, infrastructure: Wifi, mobile: Smartphone, software: Key };

    return (
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'var(--spacing-base)' }}>
            <div className="glass-card" style={{ padding:'15px 25px', display:'flex', alignItems:'center', gap:16 }}>
                <h2 style={{ fontSize:'1.4rem', margin:0, color:'#6366f1', display:'flex', alignItems:'center', gap:10 }}><Server size={24}/> IT Global Search</h2>
                <span style={{ fontSize:'0.78rem', color:'#64748b' }}>Search across all plants for IT equipment</span>
            </div>

            {/* Search Bar */}
            <div className="glass-card" style={{ padding:20, display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
                <div style={{ width:'100%', maxWidth:650, position:'relative' }}>
                    <div style={{ position:'absolute', left:16, top:'50%', transform:'translateY(-50%)', color:'#64748b' }}><Search size={20}/></div>
                    <input
                        type="text"
                        value={query}
                        onChange={e => handleSearch(e.target.value)}
                        placeholder={t('itGlobalSearch.searchByNameSerialNumberPlaceholder')}
                        style={{ width:'100%', padding:'14px 16px 14px 48px', borderRadius:14, border:'2px solid var(--glass-border)', background:'rgba(255,255,255,0.04)', color:'white', fontSize:'1rem', outline:'none', transition:'border-color 0.2s' }}
                        onFocus={e => e.target.style.borderColor = '#6366f1'}
                        onBlur={e => e.target.style.borderColor = 'var(--glass-border)'}
                        autoFocus
                    />
                </div>
                {query.length > 0 && query.length < 2 && <span style={{ fontSize:'0.78rem', color:'#64748b' }}>Type at least 2 characters to search...</span>}
                {loading && <span style={{ fontSize:'0.78rem', color:'#f59e0b', animation:'statusPulse 1s ease-in-out infinite' }}>Searching enterprise network...</span>}
            </div>

            {/* Results */}
            {results && (
                <div className="glass-card" style={{ flex:1, padding:20, display:'flex', flexDirection:'column' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                        <h3 style={{ margin:0 }}>{results.total} Result{results.total !== 1 ? 's' : ''} for "{results.query}"</h3>
                        <div style={{ display:'flex', gap:8 }}>
                            {['hardware','infrastructure','mobile','software'].map(cat => {
                                const count = results.results.filter(r => r.category === cat).length;
                                return count > 0 ? <Badge key={cat} color={catColors[cat]}>{cat} ({count})</Badge> : null;
                            })}
                        </div>
                    </div>

                    <div style={{ flex:1, overflow:'auto' }}>
                        <table className="data-table">
                            <thead><tr><th>{t('itGlobalSearch.category')}</th><th>{t('itGlobalSearch.name')}</th><th>{t('itGlobalSearch.type')}</th><th>{t('itGlobalSearch.serialId')}</th><th>{t('itGlobalSearch.plant')}</th><th>{t('itGlobalSearch.status')}</th><th>{t('itGlobalSearch.bookValue')}</th></tr></thead>
                            <tbody>
                                {results.results.map((r, i) => {
                                    const Icon = CatIcon[r.category] || Monitor;
                                    return (
                                        <tr key={`${r.category}-${r.ID}-${i}`} onClick={() => setSelected(selected?.ID === r.ID && selected?.category === r.category ? null : r)} style={{ cursor:'pointer', background: selected?.ID === r.ID && selected?.category === r.category ? 'rgba(99,102,241,0.1)' : undefined }}>
                                            <td><Badge color={catColors[r.category]}><Icon size={12} style={{marginRight:4}}/>{r.category}</Badge></td>
                                            <td style={{ fontWeight:600, color: catColors[r.category] }}>{r.Name}</td>
                                            <td>{r.Type || r.LicenseType || '—'}</td>
                                            <td style={{ fontFamily:'monospace', fontSize:'0.78rem' }}>{r.SerialNumber || r.BarcodeID || r.IMEI || r.IPAddress || '—'}</td>
                                            <td><span style={{ display:'flex', alignItems:'center', gap:4 }}><MapPin size={12} color="#64748b"/>{(r.PlantID || 'Unassigned').replace(/_/g, ' ')}</span></td>
                                            <td><span className={statusClass(r.Status)}>{t('status.' + (r.Status || '').replace(/\s+/g, '').toLowerCase(), r.Status)}</span></td>
                                            <td>{r.bookValue != null ? '$' + parseFloat(r.bookValue).toLocaleString() : '—'}</td>
                                        </tr>
                                    );
                                })}
                                {results.results.length === 0 && <tr><td colSpan={7} className="table-empty">No IT assets match your search.</td></tr>}
                            </tbody>
                        </table>
                    </div>

                    {/* Detail Panel */}
                    {selected && (
                        <div style={{ marginTop:16, padding:16, background:'rgba(99,102,241,0.05)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:14 }}>
                            <h4 style={{ margin:'0 0 12px 0', color:'#6366f1', display:'flex', alignItems:'center', gap:8 }}>
                                {React.createElement(CatIcon[selected.category] || Monitor, { size:18 })} {selected.Name}
                            </h4>
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:10, fontSize:'0.82rem' }}>
                                {selected.Manufacturer && <div><span style={{color:'#64748b'}}>Manufacturer:</span> {selected.Manufacturer}</div>}
                                {selected.Model && <div><span style={{color:'#64748b'}}>Model:</span> {selected.Model}</div>}
                                {selected.SerialNumber && <div><span style={{color:'#64748b'}}>Serial #:</span> <code>{selected.SerialNumber}</code></div>}
                                {selected.AssetTag && <div><span style={{color:'#64748b'}}>Asset Tag:</span> <code>{selected.AssetTag}</code></div>}
                                {selected.BarcodeID && <div><span style={{color:'#64748b'}}>Barcode:</span> <code>{selected.BarcodeID}</code></div>}
                                {selected.IPAddress && <div><span style={{color:'#64748b'}}>IP:</span> <code>{selected.IPAddress}</code></div>}
                                {selected.IMEI && <div><span style={{color:'#64748b'}}>IMEI:</span> <code>{selected.IMEI}</code></div>}
                                {selected.PhoneNumber && <div><span style={{color:'#64748b'}}>Phone:</span> {selected.PhoneNumber}</div>}
                                {selected.Criticality && <div><span style={{color:'#64748b'}}>Criticality:</span> {selected.Criticality}</div>}
                                {selected.Condition && <div><span style={{color:'#64748b'}}>Condition:</span> {selected.Condition}</div>}
                                {selected.Vendor && <div><span style={{color:'#64748b'}}>Vendor:</span> {selected.Vendor}</div>}
                                {selected.Version && <div><span style={{color:'#64748b'}}>Version:</span> {selected.Version}</div>}
                                <div><span style={{color:'#64748b'}}>Plant:</span> {(selected.PlantID || 'Unassigned').replace(/_/g, ' ')}</div>
                                <div><span style={{color:'#64748b'}}>Status:</span> <span className={statusClass(selected.Status)}>{t('status.' + (selected.Status || '').replace(/\s+/g, '').toLowerCase(), selected.Status)}</span></div>
                                {selected.bookValue != null && <div><span style={{color:'#64748b'}}>Book Value:</span> <strong style={{color:'#10b981'}}>${parseFloat(selected.bookValue).toLocaleString()}</strong></div>}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {!results && !loading && (
                <div className="glass-card" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
                    <Search size={48} color="#334155" />
                    <h3 style={{ margin:0, color:'#475569' }}>Enterprise IT Asset Search</h3>
                    <p style={{ color:'#64748b', textAlign:'center', maxWidth:400, margin:0 }}>
                        Find any IT asset across all plants in the network. Search by name, serial number, asset tag, barcode, IP address, or IMEI.
                        Useful when a plant needs a spare switch or server urgently — check if another site has one in storage.
                    </p>
                </div>
            )}
        </div>
    );
}
