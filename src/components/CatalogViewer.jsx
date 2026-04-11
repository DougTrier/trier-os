// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Master Data Catalog Viewer
 * =======================================
 * Searchable, sortable, tabbed reference browser for the corporate_master.db
 * catalog. Gives all users read-only access to the enterprise master data
 * library — equipment standards, approved parts, vendors, and warranty terms.
 *
 * TABS:
 *   Equipment   — Approved equipment list with specs, manufacturer, model
 *   Parts       — Master parts catalog with part numbers, descriptions, categories
 *   Vendors     — Approved vendor list with contact info, lead times, ratings
 *   Warranties  — Warranty terms by equipment type with expiry tracking
 *
 * KEY FEATURES:
 *   - Full-text search across active tab (debounced, client-side)
 *   - Sortable columns: click header to sort ASC/DESC
 *   - Paginated results: 50 rows per page with prev/next navigation
 *   - Download CSV: export any tab's data for offline reference
 *   - Print view: printer-friendly table layout
 *   - Role-gated edits: Catalog Admins can add/edit records; all others read-only
 *
 * API CALLS:
 *   GET /api/catalog/equipment    — Equipment master list
 *   GET /api/catalog/parts        — Parts catalog
 *   GET /api/catalog/vendors      — Approved vendor list
 *   GET /api/catalog/warranties   — Warranty terms
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Database, Wrench, Package, Building2, Shield, ChevronLeft, ChevronRight, Download, Printer, X } from 'lucide-react';
import SearchBar from './SearchBar';
import { useTranslation } from '../i18n/index.jsx';

const TABS = [
    { key: 'equipment', label: 'equipment', icon: Wrench, endpoint: '/api/catalog/equipment' },
    { key: 'parts', label: 'parts', icon: Package, endpoint: '/api/catalog/parts' },
    { key: 'vendors', label: 'vendors', icon: Building2, endpoint: '/api/catalog/vendors' },
    { key: 'warranties', label: 'warranties', icon: Shield, endpoint: '/api/catalog/warranties' },
];

const COLUMNS = {
    equipment: [
        { key: 'EquipmentTypeID', label: 'typeId', width: '14%' },
        { key: 'Description', label: 'description', width: '22%' },
        { key: 'Category', label: 'category', width: '12%' },
        { key: 'TypicalMakers', label: 'manufacturers', width: '20%', render: v => { try { return JSON.parse(v).join(', '); } catch { return v; } } },
        { key: 'PMIntervalDays', label: 'pmDays', width: '8%' },
        { key: 'ExpectedMTBF_Hours', label: 'mtbfHrs', width: '8%', render: v => v ? v.toLocaleString() : '—' },
        { key: 'UsefulLifeYears', label: 'lifeYrs', width: '8%' },
        { key: 'TypicalWarrantyMonths', label: 'warranty', width: '8%', render: v => v ? `${v}mo` : '—' },
    ],
    parts: [
        { key: 'MasterPartID', label: 'partId', width: '14%' },
        { key: 'Description', label: 'Description', width: '24%' },
        { key: 'Manufacturer', label: 'manufacturer', width: '14%' },
        { key: 'Category', label: 'Category', width: '12%' },
        { key: 'SubCategory', label: 'subCategory', width: '12%' },
        { key: 'UOM', label: 'uom', width: '6%' },
        { key: 'TypicalPriceMin', label: 'priceLow', width: '9%', render: v => v ? `$${v.toFixed(2)}` : '—' },
        { key: 'TypicalPriceMax', label: 'priceHigh', width: '9%', render: v => v ? `$${v.toFixed(2)}` : '—' },
    ],
    vendors: [
        { key: 'CompanyName', label: 'company', width: '18%' },
        { key: 'Website', label: 'website', width: '12%', render: v => v ? <span style={{ color: '#60a5fa' }}>{v}</span> : '—' },
        { key: 'Phone', label: 'phone', width: '12%' },
        { key: 'Region', label: 'region', width: '10%' },
        { key: 'Categories', label: 'categories', width: '22%' },
        { key: 'WarrantyPolicy', label: 'Warranty', width: '14%' },
        { key: 'ServiceSLA', label: 'sla', width: '12%' },
    ],
    warranties: [
        { key: 'EquipmentType', label: 'equipmentType', width: '18%' },
        { key: 'VendorID', label: 'vendor', width: '14%' },
        { key: 'TypicalMonths', label: 'months', width: '8%' },
        { key: 'CoverageDescription', label: 'coverage', width: '28%' },
        { key: 'Exclusions', label: 'exclusions', width: '18%' },
        { key: 'ClaimProcess', label: 'claimProcess', width: '14%' },
    ],
};

export default function CatalogViewer() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('equipment');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [data, setData] = useState({ rows: [], total: 0 });
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState(null);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    const [sortCol, setSortCol] = useState('');
    const [sortDir, setSortDir] = useState('asc');
    const [expandedRow, setExpandedRow] = useState(null);

    // Translate database values (categories, descriptions)
    const translateValue = useCallback((colKey, value) => {
        if (value === null || value === undefined) return '—';
        const str = String(value);
        // Category fields
        if (colKey === 'Category' || colKey === 'EquipmentType') {
            return t(`catalog.data.category.${str}`, str);
        }
        // Description fields
        if (colKey === 'Description' || colKey === 'CoverageDescription') {
            return t(`catalog.data.desc.${str}`, str);
        }
        // Categories JSON array (vendors)
        if (colKey === 'Categories') {
            try {
                const arr = JSON.parse(str);
                return arr.map(cat => t(`catalog.data.category.${cat}`, cat)).join(', ');
            } catch { return str; }
        }
        return null; // return null = use default rendering
    }, [t]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Fetch stats
    useEffect(() => {
        fetch('/api/catalog/stats', {
            headers: {  }
        })
            .then(r => r.json())
            .then(setStats)
            .catch(e => console.warn('[CatalogViewer] fetch error:', e));
    }, []);

    // Fetch data
    const fetchData = useCallback(async () => {
        setLoading(true);
        const tab = TABS.find(tb => tb.key === activeTab);
        const params = new URLSearchParams({
            limit: pageSize,
            offset: page * pageSize,
        });
        if (debouncedQuery) params.set('q', debouncedQuery);
        if (sortCol) {
            params.set('sort', sortCol);
            params.set('order', sortDir);
        }
        try {
            const res = await fetch(`${tab.endpoint}?${params}`, {
                headers: {  }
            });
            const json = await res.json();
            setData(json);
        } catch (e) {
            console.error('Catalog fetch error:', e);
        }
        setLoading(false);
    }, [activeTab, debouncedQuery, page, pageSize, sortCol, sortDir]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Reset page on tab/search change
    useEffect(() => { setPage(0); setExpandedRow(null); }, [activeTab, debouncedQuery]);

    const columns = COLUMNS[activeTab] || [];
    const totalPages = Math.ceil((data.total || 0) / pageSize);

    const handleSort = (col) => {
        if (sortCol === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(col);
            setSortDir('asc');
        }
    };

    const exportCSV = () => {
        const cols = columns;
        const header = cols.map(c => c.label).join(',');
        const rows = data.rows.map(r => 
            cols.map(c => {
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
        window.triggerTrierPrint('catalog', {
            tab: activeTab,
            tabLabel: t(`catalog.tab.${activeTab}`, TABS.find(tt => tt.key === activeTab)?.label || activeTab),
            columns,
            rows: data.rows,
            total: data.total,
            query: debouncedQuery,
        });
    };

    const tabColors = {
        equipment: '#6366f1',
        parts: '#10b981',
        vendors: '#f59e0b',
        warranties: '#3b82f6',
    };

    const accentColor = tabColors[activeTab] || '#6366f1';

    return (
        <div style={{ padding: '0', minHeight: '80vh' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '12px 12px 0 0',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: '12px',
                        background: `rgba(${activeTab === 'equipment' ? '99,102,241' : activeTab === 'parts' ? '16,185,129' : activeTab === 'vendors' ? '245,158,11' : '59,130,246'},0.15)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1px solid ${accentColor}40`,
                    }}>
                        <Database size={24} color={accentColor} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>{t('catalog.masterDataCatalog', 'Master Data Catalog')}</h2>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
                            {stats ? `${stats.equipment} ${t('catalog.equipment','equipment')} · ${stats.parts} ${t('catalog.parts','parts')} · ${stats.vendors} ${t('catalog.vendors','vendors')} · ${stats.warranties} ${t('catalog.warrantyTemplates','warranty templates')}` : t('common.loading', 'Loading...')}
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={exportCSV} className="btn-secondary btn-sm" title={t('catalog.exportCsvTip')}>
                        <Download size={14} /> {t('catalog.exportCsv', 'Export CSV')}
                    </button>
                    <button onClick={handlePrint} className="btn-primary btn-sm" title={t('catalog.print', 'Print')}>
                        <Printer size={14} /> {t('catalog.print', 'Print')}
                    </button>
                </div>
            </div>

            {/* Tabs + Search */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 24px', background: 'rgba(0,0,0,0.1)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                flexWrap: 'wrap', gap: '10px',
            }}>
                <div className="nav-pills">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        return (
                            <button 
                                key={tab.key}
                                className={`btn-nav${isActive ? ' active' : ''}`}
                                onClick={() => { setActiveTab(tab.key); setSortCol(''); }}
                            >
                                <Icon size={14} />
                                {t(`catalog.tab.${tab.key}`, tab.label)}
                                {stats && (
                                    <span style={{
                                        fontSize: '0.65rem', padding: '2px 6px', borderRadius: '6px',
                                        background: isActive ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
                                        color: isActive ? '#a5b4fc' : '#64748b',
                                    }}>
                                        {stats[tab.key] || 0}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
                <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder={t('catalog.searchPlaceholder', 'Search equipment...')} style={{ minWidth: 280 }} />
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                        {columns.map(c => <col key={c.key} style={{ width: c.width }} />)}
                    </colgroup>
                    <thead>
                        <tr style={{ background: 'rgba(99,102,241,0.06)' }}>
                            {columns.map(c => (
                                <th
                                    key={c.key}
                                    onClick={() => handleSort(c.key)}
                                    style={{
                                        padding: '10px 12px', textAlign: 'left', fontSize: '0.72rem',
                                        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                                        color: sortCol === c.key ? accentColor : '#94a3b8',
                                        borderBottom: '2px solid rgba(99,102,241,0.2)',
                                        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                                    }}
                                >
                                    {t(`catalog.col.${c.label}`, c.label)}
                                    {sortCol === c.key && (
                                        <span style={{ marginLeft: '4px', fontSize: '0.6rem' }}>
                                            {sortDir === 'asc' ? '▲' : '▼'}
                                        </span>
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                {t('common.loading', 'Loading...')}
                            </td></tr>
                        ) : data.rows.length === 0 ? (
                            <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                {t('catalog.noRecords', 'No records found')}{debouncedQuery ? ` for "${debouncedQuery}"` : ''}
                            </td></tr>
                        ) : data.rows.map((row, ridx) => (
                            <React.Fragment key={ridx}>
                                <tr
                                    onClick={() => setExpandedRow(expandedRow === ridx ? null : ridx)}
                                    style={{
                                        background: expandedRow === ridx ? 'rgba(99,102,241,0.08)' : ridx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.06)'}
                                    onMouseLeave={e => e.currentTarget.style.background = expandedRow === ridx ? 'rgba(99,102,241,0.08)' : ridx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}
                                >
                                    {columns.map(c => (
                                        <td key={c.key} style={{
                                            padding: '10px 12px', fontSize: '0.82rem', color: '#e2e8f0',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {c.render ? c.render(row[c.key]) : (translateValue(c.key, row[c.key]) ?? row[c.key] ?? '—')}
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
                                                {Object.entries(row).map(([key, val]) => {
                                                    // Human-readable label from column name
                                                    const label = key
                                                        .replace(/([A-Z])/g, ' $1')
                                                        .replace(/_/g, ' ')
                                                        .replace(/^./, s => s.toUpperCase())
                                                        .trim();

                                                    // Smart value formatting
                                                    let displayVal = '—';
                                                    if (val !== null && val !== undefined) {
                                                        const str = String(val);
                                                        // JSON array → comma-separated, cleaned up
                                                        if (str.startsWith('[')) {
                                                            try {
                                                                const arr = JSON.parse(str);
                                                                displayVal = arr.map(item =>
                                                                    String(item).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                                                                ).join(', ');
                                                            } catch { displayVal = str; }
                                                        }
                                                        // JSON object → key: value pairs
                                                        else if (str.startsWith('{')) {
                                                            try {
                                                                const obj = JSON.parse(str);
                                                                displayVal = Object.entries(obj)
                                                                    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
                                                                    .join(' · ');
                                                            } catch { displayVal = str; }
                                                        }
                                                        else {
                                                            displayVal = str;
                                                        }
                                                    }

                                                    return (
                                                        <div key={key}>
                                                            <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{label}</div>
                                                            <div style={{ fontSize: '0.82rem', color: '#e2e8f0', wordBreak: 'break-word' }}>
                                                                {displayVal}
                                                            </div>
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
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '0 0 12px 12px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', color: '#94a3b8' }}>
                    <span>{data.total || 0} {t('catalog.records', 'records')}</span>
                    <select
                        value={pageSize}
                        onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
                        style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            color: '#fff', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem',
                        }}
                    >
                        <option value={25}>25/{t('catalog.perPage','page')}</option>
                        <option value={50}>50/{t('catalog.perPage','page')}</option>
                        <option value={100}>100/{t('catalog.perPage','page')}</option>
                    </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button 
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '6px', padding: '6px 10px', cursor: page > 0 ? 'pointer' : 'not-allowed',
                            color: page > 0 ? '#fff' : '#475569', display: 'flex', alignItems: 'center',
                        }}
                     title="Page">
                        <ChevronLeft size={14} />
                    </button>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', minWidth: '80px', textAlign: 'center' }}>
                        {t('catalog.page', 'Page')} {page + 1} {t('catalog.of', 'of')} {Math.max(1, totalPages)}
                    </span>
                    <button 
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '6px', padding: '6px 10px', cursor: page < totalPages - 1 ? 'pointer' : 'not-allowed',
                            color: page < totalPages - 1 ? '#fff' : '#475569', display: 'flex', alignItems: 'center',
                        }}
                     title="Page">
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}
