// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Master Data Catalog Viewer
 * =======================================
 * Searchable, sortable, tabbed reference browser for the corporate master data
 * library — equipment standards, approved parts, vendors, warranty terms,
 * digital twins, CAD drawings, and semantic vector search.
 *
 * TABS:
 *   Equipment     — Approved equipment list with specs, manufacturer, model
 *   Parts         — Master parts catalog with part numbers, descriptions, categories
 *   Vendors       — Approved vendor list with contact info, lead times, ratings
 *   Warranties    — Warranty terms by equipment type with expiry tracking
 *   Cross-Ref     — OEM ↔ aftermarket part number cross-reference
 *   Digital Twins — CatalogTwins: OEM-validated asset twin URLs (geometry, docs, nameplates)
 *   CAD / Drawings — CAD-renderable twin entries (STEP, DXF, IFC, OBJ, DWG, STL)
 *   Vector Search  — Semantic similarity search across all 525+ equipment types
 *
 * API CALLS:
 *   GET /api/catalog/equipment          — Equipment master list
 *   GET /api/catalog/parts              — Parts catalog
 *   GET /api/catalog/vendors            — Approved vendor list
 *   GET /api/catalog/warranties         — Warranty terms
 *   GET /api/catalog/crossref           — OEM/aftermarket cross-reference
 *   GET /api/catalog/twins              — Browse all digital twins (filterable)
 *   GET /api/catalog/twins?cad=1        — CAD-format twins only
 *   GET /api/catalog/equipment/semantic — Semantic vector search
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Search, Database, Wrench, Package, Building2, Shield,
    ChevronLeft, ChevronRight, Download, Printer, X, ArrowLeftRight,
    GitBranch, FileCode, Sparkles, CheckCircle, Clock,
    HardDrive, Image, Upload,
} from 'lucide-react';
import SearchBar from './SearchBar';
import { useTranslation } from '../i18n/index.jsx';
import ArtifactPanel from './ArtifactPanel';

const CAD_FORMATS = new Set(['STEP','STP','DXF','IFC','OBJ','STL','DWG','IGES','IGS']);

const TABS = [
    { key: 'equipment',  label: 'Equipment',     icon: Wrench,       endpoint: '/api/catalog/equipment' },
    { key: 'parts',      label: 'Parts',          icon: Package,      endpoint: '/api/catalog/parts' },
    { key: 'vendors',    label: 'Vendors',        icon: Building2,    endpoint: '/api/catalog/vendors' },
    { key: 'warranties', label: 'Warranties',     icon: Shield,       endpoint: '/api/catalog/warranties' },
    { key: 'crossref',   label: 'Cross-Ref',      icon: ArrowLeftRight, endpoint: '/api/catalog/crossref' },
    { key: 'twins',      label: 'Digital Twins',  icon: GitBranch,    endpoint: '/api/catalog/artifacts?role=analytical' },
    { key: 'cad',        label: 'CAD / Drawings', icon: FileCode,     endpoint: '/api/catalog/artifacts?cad=1' },
    { key: 'semantic',   label: 'Equipment Search', icon: Sparkles,     endpoint: '/api/catalog/equipment/semantic' },
];

const TAB_COLORS = {
    equipment:  '#6366f1',
    parts:      '#10b981',
    vendors:    '#f59e0b',
    warranties: '#3b82f6',
    crossref:   '#a855f7',
    twins:      '#06b6d4',
    cad:        '#f97316',
    semantic:   '#ec4899',
};

const SUBMODEL_COLORS = {
    Geometry:      '#06b6d4',
    Documentation: '#3b82f6',
    Nameplate:     '#f59e0b',
    LiveData:      '#10b981',
};

const COLUMNS = {
    equipment: [
        { key: 'EquipmentTypeID', label: 'Type ID',       width: '14%' },
        { key: 'Description',     label: 'Description',   width: '22%' },
        { key: 'Category',        label: 'Category',      width: '12%' },
        { key: 'TypicalMakers',   label: 'Manufacturers', width: '20%', render: v => { try { return JSON.parse(v).join(', '); } catch { return v; } } },
        { key: 'PMIntervalDays',  label: 'PM Days',       width: '8%' },
        { key: 'ExpectedMTBF_Hours', label: 'MTBF Hrs',  width: '8%', render: v => v ? v.toLocaleString() : '—' },
        { key: 'UsefulLifeYears', label: 'Life Yrs',      width: '8%' },
        { key: 'TypicalWarrantyMonths', label: 'Warranty', width: '8%', render: v => v ? `${v}mo` : '—' },
    ],
    parts: [
        { key: 'MasterPartID',     label: 'Part ID',       width: '14%' },
        { key: 'Description',      label: 'Description',   width: '24%' },
        { key: 'Manufacturer',     label: 'Manufacturer',  width: '14%' },
        { key: 'Category',         label: 'Category',      width: '12%' },
        { key: 'SubCategory',      label: 'Sub-Category',  width: '12%' },
        { key: 'UOM',              label: 'UOM',           width: '6%' },
        { key: 'TypicalPriceMin',  label: 'Price Low',     width: '9%', render: v => v ? `$${v.toFixed(2)}` : '—' },
        { key: 'TypicalPriceMax',  label: 'Price High',    width: '9%', render: v => v ? `$${v.toFixed(2)}` : '—' },
    ],
    vendors: [
        { key: 'CompanyName',    label: 'Company',    width: '18%' },
        { key: 'Website',        label: 'Website',    width: '14%', render: v => v ? <a href={`https://${v}`} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }} onClick={e => e.stopPropagation()}>{v}</a> : '—' },
        { key: 'Phone',          label: 'Phone',      width: '12%' },
        { key: 'Region',         label: 'Region',     width: '10%' },
        { key: 'Categories',     label: 'Categories', width: '22%', render: v => { try { return JSON.parse(v).join(', '); } catch { return v || '—'; } } },
        { key: 'WarrantyPolicy', label: 'Warranty',   width: '14%' },
        { key: 'ServiceSLA',     label: 'SLA',        width: '10%' },
    ],
    warranties: [
        { key: 'EquipmentType',       label: 'Equipment Type', width: '18%' },
        { key: 'VendorID',            label: 'Vendor',         width: '14%' },
        { key: 'TypicalMonths',       label: 'Months',         width: '8%' },
        { key: 'CoverageDescription', label: 'Coverage',       width: '28%' },
        { key: 'Exclusions',          label: 'Exclusions',     width: '18%' },
        { key: 'ClaimProcess',        label: 'Claim Process',  width: '14%' },
    ],
    crossref: [
        { key: 'OEMPartNumber',        label: 'OEM Part #',         width: '18%' },
        { key: 'OEMVendor',            label: 'OEM Vendor',         width: '18%' },
        { key: 'AftermarketPartNumber',label: 'Aftermarket Part #', width: '18%' },
        { key: 'AftermarketVendor',    label: 'Aftermarket Vendor', width: '18%' },
        { key: 'CompatibilityNotes',   label: 'Notes',              width: '22%' },
        { key: 'Verified',             label: 'Verified',           width: '6%',  render: v => v ? '✓' : '—' },
    ],
    twins: [
        { key: 'EntityID',            label: 'Equipment ID',   width: '16%' },
        { key: 'EquipmentDescription',label: 'Description',    width: '22%' },
        { key: 'ArtifactType',        label: 'Type',           width: '10%', render: v => <SubmodelBadge type={v} /> },
        { key: 'Format',              label: 'Format',         width: '8%' },
        { key: 'Source',              label: 'Source',         width: '10%' },
        { key: 'Confidence',          label: 'Confidence',     width: '10%', render: v => <ConfBar score={v} /> },
        { key: 'is_local',            label: 'File',           width: '24%', render: (v, row) => <ArtifactStatusBadge isLocal={v} url={row?.FileURL || row?.external_url} /> },
    ],
    cad: [
        { key: 'EntityID',            label: 'Equipment ID',   width: '14%' },
        { key: 'EquipmentDescription',label: 'Description',    width: '22%' },
        { key: 'Format',              label: 'Format',         width: '8%',  render: v => <FormatBadge fmt={v} /> },
        { key: 'Source',              label: 'Source',         width: '10%' },
        { key: 'EquipmentCategory',   label: 'Category',       width: '10%' },
        { key: 'Confidence',          label: 'Confidence',     width: '10%', render: v => <ConfBar score={v} /> },
        { key: 'is_local',            label: 'File',           width: '26%', render: (v, row) => <ArtifactStatusBadge isLocal={v} url={row?.FileURL || row?.external_url} fmt={row?.Format} /> },
    ],
};

// ── Small render helpers ─────────────────────────────────────────────────────

function SubmodelBadge({ type }) {
    const color = SUBMODEL_COLORS[type] || '#64748b';
    return (
        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${color}22`, color, border: `1px solid ${color}44` }}>
            {type || '—'}
        </span>
    );
}

function FormatBadge({ fmt }) {
    const isCAD = CAD_FORMATS.has((fmt || '').toUpperCase());
    return (
        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: isCAD ? 'rgba(249,115,22,0.15)' : 'rgba(100,116,139,0.15)', color: isCAD ? '#f97316' : '#94a3b8', border: `1px solid ${isCAD ? '#f9731644' : '#64748b44'}` }}>
            {fmt || '—'}
        </span>
    );
}

function ConfBar({ score }) {
    if (score == null) return <span style={{ color: '#475569' }}>—</span>;
    const pct = Math.round(score * 100);
    const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: color }} />
            </div>
            <span style={{ fontSize: '0.72rem', color, fontWeight: 600, minWidth: 30 }}>{pct}%</span>
        </div>
    );
}

function ArtifactStatusBadge({ isLocal, url, fmt, onAttach }) {
    if (isLocal) {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
                <HardDrive size={10} /> On server · click to view
            </span>
        );
    }
    return (
        <span
            onClick={e => { e.stopPropagation(); onAttach && onAttach(); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 600, padding: '3px 10px', borderRadius: 5, cursor: 'pointer', background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
        >
            <Upload size={10} /> Attach File
        </span>
    );
}

// ── Semantic search result card ──────────────────────────────────────────────

function SemanticCard({ result, accentColor }) {
    const hasSim = result.similarity != null;
    const sim = hasSim ? Math.round(result.similarity) : null;
    const simColor = !hasSim ? '#475569' : sim >= 75 ? '#10b981' : sim >= 50 ? '#f59e0b' : '#94a3b8';
    return (
        <div style={{
            background: 'rgba(15,23,42,0.6)', border: `1px solid ${accentColor}22`,
            borderRadius: 10, padding: '14px 18px', display: 'flex', gap: 16, alignItems: 'flex-start',
        }}>
            <div style={{
                minWidth: 54, height: 54, borderRadius: 10, background: `${simColor}18`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${simColor}44`,
            }}>
                {hasSim ? (
                    <>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: simColor }}>{sim}%</span>
                        <span style={{ fontSize: '0.55rem', color: '#475569', textTransform: 'uppercase' }}>match</span>
                    </>
                ) : (
                    <span style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.3 }}>text{'\n'}match</span>
                )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f1f5f9', marginBottom: 3 }}>
                    {result.description}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: 4, background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                        {result.id}
                    </span>
                    {result.category && (
                        <span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                            {result.category}
                        </span>
                    )}
                    {result.primaryMaker && (
                        <span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#6ee7b7' }}>
                            {result.primaryMaker}
                        </span>
                    )}
                </div>
                {result.mtbfHours && (
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        MTBF {result.mtbfHours.toLocaleString()} hrs · PM every {result.pmIntervalDays} days
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function CatalogViewer() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('equipment');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [data, setData] = useState({ rows: [], total: 0 });
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState(null);
    const [twinStats, setTwinStats] = useState(null);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    const [sortCol, setSortCol] = useState('');
    const [sortDir, setSortDir] = useState('asc');
    const [expandedRow, setExpandedRow] = useState(null);
    const [autoAttach, setAutoAttach]   = useState(null);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [submodelFilter, setSubmodelFilter] = useState('');
    // Semantic search state
    const [semanticQuery, setSemanticQuery] = useState('');
    const [semanticResults, setSemanticResults] = useState([]);
    const [semanticLoading, setSemanticLoading] = useState(false);
    const [semanticMode, setSemanticMode] = useState(null); // 'text' | 'vector' | null
    const semanticInputRef = useRef(null);

    const accentColor = TAB_COLORS[activeTab] || '#6366f1';

    const translateValue = useCallback((colKey, value) => {
        if (value === null || value === undefined) return '—';
        const str = String(value);
        if (colKey === 'Category' || colKey === 'EquipmentType') return t(`catalog.data.category.${str}`, str);
        if (colKey === 'Description' || colKey === 'CoverageDescription') return t(`catalog.data.desc.${str}`, str);
        if (colKey === 'Categories') {
            try { return JSON.parse(str).map(cat => t(`catalog.data.category.${cat}`, cat)).join(', '); } catch { return str; }
        }
        return null;
    }, [t]);

    // Debounce text search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Stats
    useEffect(() => {
        fetch('/api/catalog/stats').then(r => r.json()).then(setStats).catch(() => {});
        fetch('/api/catalog/twins/stats').then(r => r.json()).then(setTwinStats).catch(() => {});
    }, []);

    // Fetch table data (all tabs except semantic)
    const fetchData = useCallback(async () => {
        if (activeTab === 'semantic') return;
        setLoading(true);
        const tab = TABS.find(tb => tb.key === activeTab);
        const params = new URLSearchParams({ limit: pageSize, offset: page * pageSize });
        if (debouncedQuery) params.set('q', debouncedQuery);
        if (sortCol) { params.set('sort', sortCol); params.set('order', sortDir); }
        if (categoryFilter) params.set('category', categoryFilter);
        if (submodelFilter && (activeTab === 'twins')) params.set('submodel', submodelFilter);

        try {
            const res = await fetch(`${tab.endpoint}${tab.endpoint.includes('?') ? '&' : '?'}${params}`);
            const json = await res.json();
            // Semantic endpoint returns { query, results } not { rows, total }
            setData(json.rows !== undefined ? json : { rows: [], total: 0 });
        } catch (e) {
            console.error('[CatalogViewer] fetch error:', e);
        }
        setLoading(false);
    }, [activeTab, debouncedQuery, page, pageSize, sortCol, sortDir, categoryFilter, submodelFilter]);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { setPage(0); setExpandedRow(null); setCategoryFilter(''); setSubmodelFilter(''); }, [activeTab, debouncedQuery]);

    // Equipment search (text fallback or vector when Gemini key configured)
    const runSemanticSearch = useCallback(async () => {
        const q = semanticQuery.trim();
        if (!q) return;
        setSemanticLoading(true);
        try {
            const res = await fetch(`/api/catalog/equipment/semantic?q=${encodeURIComponent(q)}&k=10`);
            const json = await res.json();
            setSemanticResults(json.results || []);
            setSemanticMode(json.searchMode || null);
        } catch (e) {
            console.error('[EquipmentSearch]', e);
        }
        setSemanticLoading(false);
    }, [semanticQuery]);

    const columns = COLUMNS[activeTab] || [];
    const totalPages = Math.ceil((data.total || 0) / pageSize);

    const handleSort = (col) => {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('asc'); }
    };

    const exportCSV = () => {
        const cols = columns.filter(c => !['TwinURL', 'Validated', 'ConfScore', 'SubmodelType', 'TwinFormat'].includes(c.key) || typeof c.render !== 'function');
        const allCols = columns;
        const header = allCols.map(c => c.label).join(',');
        const rows = data.rows.map(r =>
            allCols.map(c => {
                let val = r[c.key];
                if (val === null || val === undefined) val = '';
                val = String(val).replace(/"/g, '""');
                return `"${val}"`;
            }).join(',')
        );
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trier_catalog_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handlePrint = () => {
        if (activeTab === 'semantic') {
            window.triggerTrierPrint?.('semantic-results', { query: semanticQuery, results: semanticResults });
            return;
        }
        window.triggerTrierPrint?.('catalog', {
            tab: activeTab,
            tabLabel: TABS.find(tt => tt.key === activeTab)?.label || activeTab,
            columns: columns.map(c => ({ key: c.key, label: c.label })),
            rows: data.rows,
            total: data.total,
            query: debouncedQuery,
        });
    };

    const statCount = (tabKey) => {
        if (tabKey === 'twins') return twinStats?.total || 0;
        if (tabKey === 'cad') return null;
        if (tabKey === 'semantic') return null;
        return stats?.[tabKey] || 0;
    };

    return (
        <div style={{ padding: '0', minHeight: '80vh' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(0,0,0,0.2)', borderRadius: '12px 12px 0 0',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: '12px',
                        background: `${accentColor}18`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1px solid ${accentColor}40`,
                        transition: 'all 0.2s',
                    }}>
                        <Database size={24} color={accentColor} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>
                            {t('catalog.masterDataCatalog', 'Master Data Catalog')}
                        </h2>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
                            {stats
                                ? `${stats.equipment} equipment · ${stats.parts} parts · ${stats.vendors} vendors`
                                : t('common.loading', 'Loading...')}
                            {twinStats ? ` · ${twinStats.total} digital twins` : ''}
                        </p>
                    </div>
                </div>
                <div style={{ flex: 1, maxWidth: 480, margin: '0 24px', position: 'relative' }}>
                    {activeTab !== 'semantic' && (
                        <>
                            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#475569', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                placeholder={t('catalog.searchAll', 'Search catalog…')}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%', boxSizing: 'border-box',
                                    padding: '9px 12px 9px 36px', borderRadius: 8,
                                    background: 'rgba(30,41,59,0.7)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#f1f5f9', fontSize: 14, outline: 'none',
                                }}
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')}
                                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 2 }}>
                                    <X size={14} />
                                </button>
                            )}
                        </>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    {activeTab !== 'semantic' && (
                        <button onClick={exportCSV} className="btn-secondary btn-sm">
                            <Download size={14} /> Export CSV
                        </button>
                    )}
                    <button onClick={handlePrint} className="btn-primary btn-sm">
                        <Printer size={14} /> Print
                    </button>
                </div>
            </div>

            {/* Tab bar */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 24px', background: 'rgba(0,0,0,0.1)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                flexWrap: 'wrap', gap: '10px',
            }}>
                <div className="nav-pills" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        const count = statCount(tab.key);
                        const color = TAB_COLORS[tab.key] || '#6366f1';
                        return (
                            <button
                                key={tab.key}
                                className={`btn-nav${isActive ? ' active' : ''}`}
                                onClick={() => { setActiveTab(tab.key); setSortCol(''); }}
                                style={isActive ? { borderColor: `${color}60`, background: `${color}15` } : {}}
                            >
                                <Icon size={14} />
                                {tab.label}
                                {count != null && (
                                    <span style={{
                                        fontSize: '0.65rem', padding: '2px 6px', borderRadius: '6px',
                                        background: isActive ? `${color}25` : 'rgba(255,255,255,0.06)',
                                        color: isActive ? color : '#64748b',
                                    }}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Per-tab filters */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {(activeTab === 'equipment' || activeTab === 'parts') && (
                        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '8px 12px', fontSize: '0.85rem' }}>
                            <option value="">All Categories</option>
                            {activeTab === 'equipment' && <>
                                <option value="PRODUCTION">Production</option>
                                <option value="PACKAGING">Packaging</option>
                                <option value="ELECTRICAL">Electrical</option>
                                <option value="ASSEMBLY">Assembly</option>
                                <option value="UTILITIES">Utilities</option>
                                <option value="UTILITY">Utility</option>
                                <option value="LOGISTICS">Logistics</option>
                                <option value="FINISHING">Finishing</option>
                                <option value="FACILITY">Facility</option>
                                <option value="LAB">Lab</option>
                                <option value="QUALITY">Quality</option>
                            </>}
                            {activeTab === 'parts' && <>
                                <option value="BEARINGS">Bearings</option>
                                <option value="ELECTRICAL">Electrical</option>
                                <option value="FILTERS">Filters</option>
                                <option value="FILTRATION">Filtration</option>
                                <option value="HARDWARE">Hardware</option>
                                <option value="HYDRAULICS">Hydraulics</option>
                                <option value="LUBRICANTS">Lubricants</option>
                                <option value="MECHANICAL">Mechanical</option>
                                <option value="MOTORS">Motors</option>
                                <option value="PNEUMATICS">Pneumatics</option>
                                <option value="SAFETY">Safety</option>
                                <option value="SEALS">Seals</option>
                                <option value="TOOLING">Tooling</option>
                                <option value="FLUID">Fluid</option>
                                <option value="FLUIDS">Fluids</option>
                                <option value="LAB">Lab</option>
                                <option value="LOGISTICS">Logistics</option>
                            </>}
                        </select>
                    )}
                    {activeTab === 'twins' && (
                        <select value={submodelFilter} onChange={e => setSubmodelFilter(e.target.value)}
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '8px 12px', fontSize: '0.85rem' }}>
                            <option value="">All Types</option>
                            <option value="Geometry">Geometry (3D Models)</option>
                            <option value="Documentation">Documentation</option>
                            <option value="Nameplate">Nameplate / Specs</option>
                            <option value="LiveData">Live Data</option>
                        </select>
                    )}
                    {activeTab !== 'semantic' && (
                        <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search…" style={{ minWidth: 220 }} />
                    )}
                </div>
            </div>

            {/* ── Semantic search panel ──────────────────────────────────── */}
            {activeTab === 'semantic' && (
                <div style={{ padding: '32px 24px' }}>
                    <div style={{ maxWidth: 640, margin: '0 auto 32px' }}>
                        <div style={{ marginBottom: 16, textAlign: 'center' }}>
                            <Sparkles size={32} color="#ec4899" style={{ marginBottom: 8 }} />
                            <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem', fontWeight: 700 }}>Equipment Search</h3>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                                Describe the machine in plain language to find the closest match across {stats?.equipment || '525+'} equipment types.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <input
                                    ref={semanticInputRef}
                                    type="text"
                                    placeholder="e.g. milk pasteurizer high temperature, gallon jug filler, blow molder for HDPE bottles…"
                                    value={semanticQuery}
                                    onChange={e => setSemanticQuery(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && runSemanticSearch()}
                                    style={{
                                        width: '100%', boxSizing: 'border-box',
                                        padding: '12px 16px', borderRadius: 10,
                                        background: 'rgba(30,41,59,0.8)', border: `1px solid #ec489944`,
                                        color: '#f1f5f9', fontSize: 15, outline: 'none',
                                    }}
                                />
                            </div>
                            <button
                                onClick={runSemanticSearch}
                                disabled={!semanticQuery.trim() || semanticLoading}
                                style={{
                                    padding: '12px 20px', borderRadius: 10, border: 'none',
                                    background: semanticLoading ? '#475569' : '#ec4899',
                                    color: '#fff', fontWeight: 700, cursor: semanticLoading ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                                }}
                            >
                                {semanticLoading ? (
                                    <Clock size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                ) : (
                                    <Sparkles size={16} />
                                )}
                                {semanticLoading ? 'Searching…' : 'Find Match'}
                            </button>
                        </div>
                        {semanticResults.length > 0 && (
                            <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#64748b' }}>
                                {semanticResults.length} results for "{semanticQuery}"
                                {semanticMode === 'vector' && (
                                    <span style={{ marginLeft: 8, color: '#ec4899' }}>· semantic match</span>
                                )}
                            </div>
                        )}
                    </div>

                    {semanticResults.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 860, margin: '0 auto' }}>
                            {semanticResults.map((r, i) => (
                                <SemanticCard key={i} result={r} accentColor="#ec4899" />
                            ))}
                        </div>
                    )}

                    {!semanticLoading && semanticResults.length === 0 && semanticQuery && (
                        <div style={{ textAlign: 'center', color: '#475569', marginTop: 40 }}>
                            No matches found. Try a different description.
                        </div>
                    )}
                </div>
            )}

            {/* ── Standard table (all non-semantic tabs) ─────────────────── */}
            {activeTab !== 'semantic' && (
                <>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <colgroup>
                                {columns.map(c => <col key={c.key} style={{ width: c.width }} />)}
                            </colgroup>
                            <thead>
                                <tr style={{ background: `${accentColor}0d` }}>
                                    {columns.map(c => (
                                        <th key={c.key}
                                            onClick={() => handleSort(c.key)}
                                            style={{
                                                padding: '10px 12px', textAlign: 'left', fontSize: '0.72rem',
                                                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                                                color: sortCol === c.key ? accentColor : '#94a3b8',
                                                borderBottom: `2px solid ${accentColor}30`,
                                                cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                                            }}>
                                            {c.label}
                                            {sortCol === c.key && <span style={{ marginLeft: 4, fontSize: '0.6rem' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading…</td></tr>
                                ) : data.rows.length === 0 ? (
                                    <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                        No records found{debouncedQuery ? ` for "${debouncedQuery}"` : ''}
                                    </td></tr>
                                ) : data.rows.map((row, ridx) => (
                                    <React.Fragment key={ridx}>
                                        <tr
                                            onClick={() => { const closing = expandedRow === ridx; setExpandedRow(closing ? null : ridx); if (closing) setAutoAttach(null); }}
                                            style={{
                                                background: expandedRow === ridx ? `${accentColor}0d` : ridx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                                cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = `${accentColor}0a`}
                                            onMouseLeave={e => e.currentTarget.style.background = expandedRow === ridx ? `${accentColor}0d` : ridx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}
                                        >
                                            {columns.map(c => (
                                                <td key={c.key} style={{
                                                    padding: '10px 12px', fontSize: '0.82rem', color: '#e2e8f0',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {c.key === 'is_local' && !row[c.key]
                                                        ? <ArtifactStatusBadge isLocal={false} url={row?.FileURL || row?.external_url} fmt={row?.Format} onAttach={() => { setExpandedRow(ridx); setAutoAttach(ridx); }} />
                                                        : c.render ? c.render(row[c.key], row) : (translateValue(c.key, row[c.key]) ?? row[c.key] ?? '—')}
                                                </td>
                                            ))}
                                        </tr>
                                        {expandedRow === ridx && (
                                            <tr>
                                                <td colSpan={columns.length} style={{
                                                    padding: '16px 24px', background: 'rgba(15,23,42,0.6)',
                                                    borderBottom: `2px solid ${accentColor}30`,
                                                }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                                                        {/* Artifact panel — viewer + upload for equipment, twins, and cad tabs */}
                                                        {(activeTab === 'twins' || activeTab === 'cad' || activeTab === 'equipment') && (row.EntityID || row.EquipmentTypeID) && (
                                                            <div style={{ gridColumn: '1 / -1' }}>
                                                                <ArtifactPanel
                                                                    entityId={row.EntityID || row.EquipmentTypeID}
                                                                    defaultArtifactType={activeTab === 'cad' ? 'cad' : 'twin'}
                                                                    accentColor={accentColor}
                                                                    autoOpenAttach={autoAttach === ridx}
                                                                />
                                                            </div>
                                                        )}
                                                        {Object.entries(row).filter(([k]) => !['FileURL','external_url','local_path','mime_type','file_name','file_size','is_local'].includes(k)).map(([key, val]) => {
                                                            const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, s => s.toUpperCase()).trim();
                                                            let displayVal = '—';
                                                            if (val !== null && val !== undefined) {
                                                                const str = String(val);
                                                                if (str.startsWith('[')) {
                                                                    try { displayVal = JSON.parse(str).map(i => String(i).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(', '); } catch { displayVal = str; }
                                                                } else if (str.startsWith('{')) {
                                                                    try { displayVal = Object.entries(JSON.parse(str)).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · '); } catch { displayVal = str; }
                                                                } else { displayVal = str; }
                                                            }
                                                            return (
                                                                <div key={key}>
                                                                    <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
                                                                    <div style={{ fontSize: '0.82rem', color: '#e2e8f0', wordBreak: 'break-word' }}>{displayVal}</div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
                        background: 'rgba(0,0,0,0.1)', borderRadius: '0 0 12px 12px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', color: '#94a3b8' }}>
                            <span>{data.total || 0} records</span>
                            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem' }}>
                                <option value={25}>25/page</option>
                                <option value={50}>50/page</option>
                                <option value={100}>100/page</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', cursor: page > 0 ? 'pointer' : 'not-allowed', color: page > 0 ? '#fff' : '#475569', display: 'flex', alignItems: 'center' }}>
                                <ChevronLeft size={14} />
                            </button>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8', minWidth: '80px', textAlign: 'center' }}>
                                Page {page + 1} of {Math.max(1, totalPages)}
                            </span>
                            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', cursor: page < totalPages - 1 ? 'pointer' : 'not-allowed', color: page < totalPages - 1 ? '#fff' : '#475569', display: 'flex', alignItems: 'center' }}>
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
