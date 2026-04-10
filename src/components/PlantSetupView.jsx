// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Plant Setup & Configuration View
 * ==============================================
 * The "Plant DNA" configuration workspace. All settings that define how
 * a plant operates: production model, units, SKU catalog, calendar,
 * and the production import and planning engine.
 *
 * TABS:
 *   Production Model  — Select fluid-process, discrete, batch, or custom model
 *                       Uses GroupedSelect (portal-based dropdown) to escape overflow containers.
 *   Production Units  — Define process lines, tanks, and equipment groupings
 *   SKU Catalog       — Product codes, descriptions, packaging types, and targets.
 *                       Includes SKUImportModal for CSV / .db / .sqlite bulk import.
 *   Plant Calendar    — Shift schedule, holidays, and production days configuration
 *   API Integrations  — External system connections (ERP, MES, SCADA, LIMS, EDI, Cold Chain).
 *                       Each integration can run a built-in Modbus TCP simulator for testing and
 *                       an EdgeAgent sync worker that polls live PLC/SCADA data into the plant DB.
 *
 * KEY COMPONENTS:
 *   GroupedSelect     — Custom portal dropdown (ReactDOM.createPortal + position:fixed) that
 *                       escapes overflow:hidden parent containers. Supports grouped option lists.
 *   SKUImportModal    — 4-step import wizard: upload → column mapping → preview → result.
 *                       Handles CSV (PapaParse), SQLite .db files (server-side), and Excel (stub).
 *   ApiIntegrationsTab — Per-integration config cards with live simulator toggle and EdgeAgent
 *                       worker start/stop. Polls /integrations/worker/status every 8 seconds.
 *
 * API CALLS: All via /api/plant-setup/* (server/routes/plant_setup.js).
 *   Settings are per-plant, keyed by PlantID, stored in trier_logistics.db.
 *
 * CRITICALITY CLASSES: Assets assigned A/B/C criticality via Production Units config.
 *   Class A — Mission-critical; immediate response required
 *   Class B — Important; same-shift response required
 *   Class C — Non-critical; can be scheduled within the week
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import Papa from 'papaparse';
import { useTranslation } from '../i18n/index.jsx';
import {
    Factory, CheckCircle, Settings, Layers, Calendar, Box, Cpu,
    Beaker, Wrench, Zap, Mountain, GitMerge, Eye, Pencil, Printer,
    Save, X, Plus, Trash2, Upload, AlertTriangle, RefreshCw,
    FileText, ClipboardList, TrendingUp, ChevronDown, ChevronRight,
    Link, Wifi, WifiOff, Database, FlaskConical, Truck, BarChart3, ArrowRightLeft,
} from 'lucide-react';

const API = (path, o = {}) => fetch(`/api/plant-setup${path}`, {
    ...o,
    headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json',
        'x-plant-id': localStorage.getItem('selectedPlantId') || 'Plant_1',
        ...o.headers,
    },
});

// ── Shared UI primitives ──────────────────────────────────────────────────────
const Badge = ({ color, children }) => (
    <span style={{
        fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, fontWeight: 600,
        background: `${color}22`, color, border: `1px solid ${color}44`,
        display: 'inline-flex', alignItems: 'center',
    }}>{children}</span>
);

const ActionBtn = ({ icon: Icon, tip, color, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled} title={tip}
        style={{
            background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 6,
            padding: '4px 6px', color, cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', opacity: disabled ? 0.5 : 1,
        }}>
        <Icon size={13} />
    </button>
);

/**
 * GroupedSelect — portal-based dropdown for grouped option lists.
 *
 * Uses ReactDOM.createPortal + position:fixed so the panel renders at
 * document.body level, escaping any overflow:hidden ancestor. Without
 * this the panel is clipped inside the glass-card scroll containers.
 *
 * @param {string}   value    — currently selected value
 * @param {Function} onChange — called with the new value string
 * @param {Array}    options  — flat string[] OR grouped [{group, items[]}] array
 */
const GroupedSelect = ({ value, onChange, options }) => {
    const [open, setOpen] = useState(false);
    const [rect, setRect] = useState(null);
    const btnRef = useRef(null);
    const panelRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (btnRef.current?.contains(e.target)) return;
            if (panelRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleToggle = () => {
        if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
        setOpen(o => !o);
    };

    const groupHeaderStyle = {
        padding: '7px 12px 4px', fontSize: '0.63rem', fontWeight: 700,
        color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.09em',
        background: 'rgba(14,165,233,0.07)', borderTop: '1px solid rgba(14,165,233,0.12)',
        userSelect: 'none',
    };

    const itemStyle = (selected) => ({
        padding: '7px 14px 7px 22px', fontSize: '0.82rem', cursor: 'pointer',
        color: selected ? '#0ea5e9' : '#cbd5e1',
        background: selected ? 'rgba(14,165,233,0.12)' : 'transparent',
        fontWeight: selected ? 600 : 400,
    });

    const panel = open && rect && ReactDOM.createPortal(
        <div ref={panelRef} style={{
            position: 'fixed',
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
            zIndex: 99999,
            background: '#0d1526',
            border: '1px solid rgba(14,165,233,0.3)',
            borderRadius: 8,
            maxHeight: 300,
            overflowY: 'auto',
            boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
        }}>
            <div
                onClick={() => { onChange(''); setOpen(false); }}
                style={{ padding: '8px 14px', fontSize: '0.82rem', color: '#475569', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
                — Select —
            </div>
            {options.map(o =>
                typeof o === 'string' ? (
                    <div key={o}
                        onClick={() => { onChange(o); setOpen(false); }}
                        style={itemStyle(value === o)}
                        onMouseOver={e => { if (value !== o) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseOut={e => { if (value !== o) e.currentTarget.style.background = 'transparent'; }}
                    >{o}</div>
                ) : (
                    <div key={o.group}>
                        <div style={groupHeaderStyle}>{o.group}</div>
                        {o.items.map(item => (
                            <div key={item}
                                onClick={() => { onChange(item); setOpen(false); }}
                                style={itemStyle(value === item)}
                                onMouseOver={e => { if (value !== item) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                onMouseOut={e => { if (value !== item) e.currentTarget.style.background = 'transparent'; }}
                            >{item}</div>
                        ))}
                    </div>
                )
            )}
        </div>,
        document.body
    );

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            <button ref={btnRef} onClick={handleToggle} style={{
                width: '100%', boxSizing: 'border-box',
                background: open ? 'rgba(14,165,233,0.08)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${open ? 'rgba(14,165,233,0.5)' : 'var(--glass-border)'}`,
                borderRadius: 8, padding: '7px 10px',
                color: value ? '#f1f5f9' : '#475569', fontSize: '0.82rem',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
            }}>
                <span>{value || '— Select —'}</span>
                <ChevronDown size={14} color="#64748b" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
            </button>
            {panel}
        </div>
    );
};

const FF = ({ label, value, onChange, type = 'text', options, required, placeholder }) => {
    const { t } = useTranslation();
    return (
        <div>
            <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>
                {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
            </label>
            {options ? (
                options.length > 0 && typeof options[0] === 'object'
                    ? <GroupedSelect value={value || ''} onChange={onChange} options={options} />
                    : <select value={value || ''} onChange={e => onChange(e.target.value)}
                        style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.82rem', boxSizing: 'border-box' }}>
                        <option value="">{t('plantSetup.selectDefault', '— Select —')}</option>
                        {options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
            ) : (
                <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder || ''}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.82rem', boxSizing: 'border-box' }} />
            )}
        </div>
    );
};

const DetailHeader = ({ title, color, editing, onSave, onCancel, onClose, extra }) => {
    const { t } = useTranslation();
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--glass-border)', background: `${color}11` }}>
            <span style={{ fontWeight: 700, color, fontSize: '0.95rem', flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>{title}</span>
            {extra}
            {editing && onSave && <button onClick={onSave} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: '0.78rem' }}><Save size={13} /> {t('plantSetup.save', 'Save')}</button>}
            {editing && onCancel && <button onClick={onCancel} className="btn-nav" style={{ fontSize: '0.78rem' }}><X size={13} /> {t('plantSetup.cancel', 'Cancel')}</button>}
            {onClose && <button onClick={onClose} className="btn-nav" style={{ fontSize: '0.78rem' }}><X size={13} /></button>}
        </div>
    );
};

// ── Tab definitions ────────────────────────────────────────────────────────────
const buildTabs = (t) => [
    { id: 'general',      label: t('plantSetup.tabGeneral', 'General'),              icon: Settings },
    { id: 'units',        label: t('plantSetup.tabProductionUnits', 'Production Units'), icon: Cpu },
    { id: 'skus',         label: t('plantSetup.tabSkuCatalog', 'SKU Catalog'),         icon: Box },
    { id: 'calendar',     label: t('plantSetup.tabPlantCalendar', 'Plant Calendar'),   icon: Calendar },
    // { id: 'import', label: t('plantSetup.tabProductionImport', 'Production Import'), icon: Upload }, // hidden until ready
    { id: 'integrations', label: t('plantSetup.tabApiIntegrations', 'API Integrations'), icon: Link },
];

export default function PlantSetupView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('general');
    const [summary, setSummary] = useState(null);
    const TABS = useMemo(() => buildTabs(t), [t]);

    useEffect(() => {
        API('/summary').then(r => r.json()).then(setSummary).catch(() => {});
    }, [plantId]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, padding: '10px 16px 0', flexWrap: 'wrap', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.15)' }}>
                {TABS.map(tab_ => {
                    const Icon = tab_.icon;
                    const active = tab === tab_.id;
                    return (
                        <button key={tab_.id} onClick={() => setTab(tab_.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '8px 14px', fontSize: '0.8rem', fontWeight: active ? 700 : 400,
                                background: active ? 'rgba(14,165,233,0.15)' : 'transparent',
                                color: active ? '#0ea5e9' : '#64748b',
                                border: 'none', borderBottom: active ? '2px solid #0ea5e9' : '2px solid transparent',
                                cursor: 'pointer', borderRadius: '6px 6px 0 0',
                            }}>
                            <Icon size={14} /> {tab_.label}
                        </button>
                    );
                })}
                {summary && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 6 }}>
                        <Badge color="#10b981">{summary.units} {t('plantSetup.unitsLabel', 'Units')}</Badge>
                        <Badge color="#0ea5e9">{summary.products} {t('plantSetup.skusLabel', 'SKUs')}</Badge>
                        {summary.critA > 0 && <Badge color="#ef4444">{summary.critA} {t('plantSetup.critALabel', 'Crit-A')}</Badge>}
                    </div>
                )}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 16 }}>
                {tab === 'general'  && <GeneralTab       plantId={plantId} plantLabel={plantLabel} summary={summary} setSummary={setSummary} />}
                {tab === 'units'    && <UnitsTab         plantId={plantId} plantLabel={plantLabel} />}
                {tab === 'skus'     && <SKUsTab          plantId={plantId} plantLabel={plantLabel} />}
                {tab === 'calendar' && <CalendarTab      plantId={plantId} plantLabel={plantLabel} />}
                {tab === 'import'   && <ProductionImportTab plantId={plantId} plantLabel={plantLabel} />}
                {tab === 'integrations' && <ApiIntegrationsTab plantId={plantId} plantLabel={plantLabel} />}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: GENERAL
// ══════════════════════════════════════════════════════════════════════════════
function GeneralTab({ plantId, plantLabel, summary, setSummary }) {
    const { t } = useTranslation();
    const [config, setConfig] = useState(null);
    const [model, setModel] = useState('');
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [seeding, setSeeding] = useState(false);

    useEffect(() => {
        API('/config').then(r => r.json()).then(d => { setConfig(d); setModel(d.ProductionModel || ''); }).catch(() => {});
    }, [plantId]);

    const saveConfig = async () => {
        setSaving(true);
        const r = await API('/config', { method: 'PUT', body: JSON.stringify({ productionModel: model }) });
        const d = await r.json();
        if (d.success) { setMsg(t('plantSetup.savedMsg', 'Saved ✓')); setTimeout(() => setMsg(''), 2000); }
        setSaving(false);
    };

    const seedData = async () => {
        if (!window.confirm(t('plantSetup.seedConfirm', 'Seed this plant with a full dairy production dataset? This will replace all existing units, SKUs, and calendar events.'))) return;
        setSeeding(true);
        const r = await API('/seed?force=true', { method: 'POST' });
        const d = await r.json();
        if (d.success) {
            setMsg(t('plantSetup.seededMessage', 'Seeded: {units} units, {skus} SKUs, {events} calendar events')
                .replace('{units}', d.seeded?.productionUnits)
                .replace('{skus}', d.seeded?.products)
                .replace('{events}', d.seeded?.calendarEvents));
            API('/summary').then(r2 => r2.json()).then(setSummary).catch(() => {});
        }
        setSeeding(false);
    };

    const MODEL_OPTIONS = [
        { group: 'Dairy',                   items: ['fluid-process', 'cultured', 'cheese', 'butter', 'ice-cream', 'mixed'] },
        { group: 'Food & Beverage',         items: ['beverage', 'brewery', 'winery', 'bakery', 'snack-food', 'confectionery', 'meat-processing', 'poultry-processing', 'frozen-food', 'canning'] },
        { group: 'Discrete Manufacturing',  items: ['automotive-assembly', 'electronics-assembly', 'medical-devices', 'aerospace', 'consumer-goods'] },
        { group: 'Process & Chemical',      items: ['pharmaceutical', 'chemical', 'plastics', 'paper-pulp'] },
        { group: 'Heavy Industry',          items: ['metal-fabrication', 'cement', 'glass', 'mining'] },
    ];

    return (
        <div className="glass-card" style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Factory size={18} color="#0ea5e9" /> {t('plantSetup.plantConfiguration', 'Plant Configuration')} — {plantLabel || plantId}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 14 }}>
                <FF label={t('plantSetup.productionModel', 'Production Model')} value={model} onChange={setModel} options={MODEL_OPTIONS} />
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={saveConfig} disabled={saving} className="btn-nav"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
                    <Save size={13} /> {saving ? t('plantSetup.savingState', 'Saving…') : t('plantSetup.saveConfiguration', 'Save Configuration')}
                </button>
                <button onClick={seedData} disabled={seeding} className="btn-nav"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                    <Beaker size={13} /> {seeding ? t('plantSetup.seedingState', 'Seeding…') : t('plantSetup.seedDemoData', 'Seed Demo Data (Dairy)')}
                </button>
                {msg && <span style={{ fontSize: '0.8rem', color: '#10b981' }}>{msg}</span>}
            </div>

            {summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 }}>
                    {[
                        { label: t('plantSetup.activeUnits', 'Active Units'), val: summary.units, color: '#10b981', icon: Cpu },
                        { label: t('plantSetup.activeSkus', 'Active SKUs'), val: summary.products, color: '#0ea5e9', icon: Box },
                        { label: t('plantSetup.critAAssets', 'Crit-A Assets'), val: summary.critA, color: '#ef4444', icon: AlertTriangle },
                        { label: t('plantSetup.calendarEvents', 'Calendar Events'), val: summary.calEvents, color: '#f59e0b', icon: Calendar },
                    ].map(s => {
                        const Icon = s.icon;
                        return (
                            <div key={s.label} style={{ background: `${s.color}11`, border: `1px solid ${s.color}33`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>
                                    <Icon size={13} color={s.color} /> {s.label}
                                </div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: s.color }}>{s.val ?? '—'}</div>
                            </div>
                        );
                    })}
                </div>
            )}

            {summary?.upcomingShutdowns?.length > 0 && (
                <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('plantSetup.upcomingShutdowns', 'Upcoming Shutdowns')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {summary.upcomingShutdowns.map(e => (
                            <div key={e.ID} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem' }}>
                                <span style={{ color: '#ef4444', fontWeight: 600 }}>{e.EventDate}</span>
                                <span style={{ color: '#94a3b8', marginLeft: 8 }}>{e.Label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PRODUCTION UNITS
// ══════════════════════════════════════════════════════════════════════════════
const UNIT_TYPES = ['Processing','Receiving','Storage','Packaging','CIP','Utilities','Quality','Other'];
const CRIT_CLASSES = ['A','B','C'];
const UNIT_STATUSES = ['Active','Inactive','Under Repair'];

function UnitsTab({ plantId }) {
    const { t } = useTranslation();
    const [units, setUnits] = useState([]);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('');
    const [filterStatus, setFilterStatus] = useState('Active');
    const [selected, setSelected] = useState(null);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({});
    const [msg, setMsg] = useState('');

    const load = useCallback(() => {
        let q = `?status=${filterStatus || ''}`;
        if (filterType) q += `&type=${filterType}`;
        if (search) q += `&search=${encodeURIComponent(search)}`;
        API(`/units${q}`).then(r => r.json()).then(setUnits).catch(() => {});
    }, [filterStatus, filterType, search]);

    useEffect(() => { load(); }, [load]);

    const typeColors = { Processing: '#0ea5e9', Receiving: '#10b981', Storage: '#f59e0b', Packaging: '#8b5cf6', CIP: '#06b6d4', Utilities: '#ec4899', Quality: '#84cc16', Other: '#94a3b8' };
    const critColors = { A: '#ef4444', B: '#f59e0b', C: '#10b981' };

    const save = async () => {
        const body = {
            unitName: form.UnitName, unitType: form.UnitType, description: form.Description,
            capacityPerHour: form.CapacityPerHour, capacityUnit: form.CapacityUnit,
            floorSpaceSqFt: form.FloorSpaceSqFt, criticalityClass: form.CriticalityClass,
            status: form.Status, sortOrder: form.SortOrder, notes: form.Notes,
        };
        let r;
        if (form.ID) {
            r = await API(`/units/${form.ID}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
            r = await API('/units', { method: 'POST', body: JSON.stringify(body) });
        }
        const d = await r.json();
        if (d.success || d.id) { setMsg(t('plantSetup.savedMsg', 'Saved ✓')); setEditing(false); setSelected(null); setForm({}); load(); setTimeout(() => setMsg(''), 2000); }
    };

    const startAdd = () => { setForm({ UnitType: 'Processing', CriticalityClass: 'B', Status: 'Active', SortOrder: 0 }); setEditing(true); setSelected(null); };
    const startEdit = (u) => { setForm({ ...u }); setEditing(true); setSelected(u); };

    const ff = (k) => (v) => setForm(p => ({ ...p, [k]: v }));

    return (
        <div style={{ flex: 1, display: 'flex', gap: 14, overflow: 'hidden' }}>
            {/* List */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('plantSetup.searchUnits', 'Search units…')}
                        style={{ flex: 1, minWidth: 140, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 12px', color: 'white', fontSize: '0.82rem' }} />
                    <select value={filterType} onChange={e => setFilterType(e.target.value)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.8rem' }}>
                        <option value="">{t('plantSetup.allTypes', 'All Types')}</option>
                        {UNIT_TYPES.map(ut => <option key={ut} value={ut}>{ut}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.8rem' }}>
                        <option value="">{t('plantSetup.allStatuses', 'All Statuses')}</option>
                        {UNIT_STATUSES.map(us => <option key={us} value={us}>{us}</option>)}
                    </select>
                    <button onClick={startAdd} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#0ea5e9' }}>
                        <Plus size={13} /> {t('plantSetup.addUnit', 'Add Unit')}
                    </button>
                    {msg && <span style={{ fontSize: '0.78rem', color: '#10b981' }}>{msg}</span>}
                </div>

                <div className="glass-card" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.72rem', position: 'sticky', top: 0, background: 'rgba(15,23,42,0.9)' }}>
                                {['#', t('plantSetup.colUnitName','Unit Name'), t('plantSetup.colType','Type'), t('plantSetup.colCapacity','Capacity'), t('plantSetup.colSqft','Sqft'), t('plantSetup.colCrit','Crit'), t('plantSetup.colStatus','Status'), ''].map(h => (
                                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {units.map(u => (
                                <tr key={u.ID} onClick={() => setSelected(u)}
                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: selected?.ID === u.ID ? 'rgba(14,165,233,0.08)' : 'transparent' }}>
                                    <td style={{ padding: '7px 10px', color: '#475569', fontSize: '0.7rem' }}>{u.SortOrder}</td>
                                    <td style={{ padding: '7px 10px', fontWeight: 600, color: '#e2e8f0' }}>{u.UnitName}</td>
                                    <td style={{ padding: '7px 10px' }}>
                                        <Badge color={typeColors[u.UnitType] || '#94a3b8'}>{u.UnitType}</Badge>
                                    </td>
                                    <td style={{ padding: '7px 10px', color: '#94a3b8', fontSize: '0.75rem' }}>
                                        {u.CapacityPerHour ? `${u.CapacityPerHour?.toLocaleString()} ${u.CapacityUnit || ''}` : '—'}
                                    </td>
                                    <td style={{ padding: '7px 10px', color: '#64748b', fontSize: '0.75rem' }}>{u.FloorSpaceSqFt ? `${u.FloorSpaceSqFt?.toLocaleString()} ${t('plantSetup.sqftSuffix', 'ft²')}` : '—'}</td>
                                    <td style={{ padding: '7px 10px' }}><Badge color={critColors[u.CriticalityClass] || '#94a3b8'}>{u.CriticalityClass}</Badge></td>
                                    <td style={{ padding: '7px 10px' }}>
                                        <Badge color={u.Status === 'Active' ? '#10b981' : '#f59e0b'}>{u.Status}</Badge>
                                    </td>
                                    <td style={{ padding: '7px 6px' }}>
                                        <ActionBtn icon={Pencil} tip={t('plantSetup.tipEdit', 'Edit')} color="#f59e0b" onClick={e => { e.stopPropagation(); startEdit(u); }} />
                                    </td>
                                </tr>
                            ))}
                            {units.length === 0 && (
                                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>{t('plantSetup.noUnitsFound', 'No units found. Add one or seed demo data.')}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail / Edit panel */}
            {(selected || editing) && (
                <div className="glass-card" style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <DetailHeader
                        title={editing ? (form.ID ? t('plantSetup.editUnit', 'Edit Unit') : t('plantSetup.newUnit', 'New Unit')) : selected?.UnitName}
                        color="#0ea5e9" editing={editing}
                        onSave={save} onCancel={() => { setEditing(false); setForm({}); }}
                        onClose={() => { setSelected(null); setEditing(false); setForm({}); }}
                        extra={!editing && <ActionBtn icon={Pencil} tip={t('plantSetup.tipEdit', 'Edit')} color="#f59e0b" onClick={() => startEdit(selected)} />}
                    />
                    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                        {editing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <FF label={t('plantSetup.labelUnitName', 'Unit Name')} value={form.UnitName} onChange={ff('UnitName')} required />
                                <FF label={t('plantSetup.labelUnitType', 'Unit Type')} value={form.UnitType} onChange={ff('UnitType')} options={UNIT_TYPES} />
                                <FF label={t('plantSetup.labelDescription', 'Description')} value={form.Description} onChange={ff('Description')} />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <FF label={t('plantSetup.labelCapacity', 'Capacity')} type="number" value={form.CapacityPerHour} onChange={ff('CapacityPerHour')} />
                                    <FF label={t('plantSetup.labelCapacityUnit', 'Unit (lbs/hr etc)')} value={form.CapacityUnit} onChange={ff('CapacityUnit')} />
                                    <FF label={t('plantSetup.labelFloorSpace', 'Floor Space (ft²)')} type="number" value={form.FloorSpaceSqFt} onChange={ff('FloorSpaceSqFt')} />
                                    <FF label={t('plantSetup.labelSortOrder', 'Sort Order')} type="number" value={form.SortOrder} onChange={ff('SortOrder')} />
                                    <FF label={t('plantSetup.labelCriticality', 'Criticality')} value={form.CriticalityClass} onChange={ff('CriticalityClass')} options={CRIT_CLASSES} />
                                    <FF label={t('plantSetup.labelStatus', 'Status')} value={form.Status} onChange={ff('Status')} options={UNIT_STATUSES} />
                                </div>
                                <FF label={t('plantSetup.labelNotes', 'Notes')} value={form.Notes} onChange={ff('Notes')} />
                            </div>
                        ) : selected && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {[
                                    { label: t('plantSetup.fieldType', 'Type'), val: selected.UnitType },
                                    { label: t('plantSetup.labelDescription', 'Description'), val: selected.Description },
                                    { label: t('plantSetup.labelCapacity', 'Capacity'), val: selected.CapacityPerHour ? `${selected.CapacityPerHour?.toLocaleString()} ${selected.CapacityUnit}` : '—' },
                                    { label: t('plantSetup.fieldFloorSpace', 'Floor Space'), val: selected.FloorSpaceSqFt ? `${selected.FloorSpaceSqFt?.toLocaleString()} ${t('plantSetup.sqftSuffix', 'ft²')}` : '—' },
                                    { label: t('plantSetup.labelCriticality', 'Criticality'), val: selected.CriticalityClass },
                                    { label: t('plantSetup.labelStatus', 'Status'), val: selected.Status },
                                    { label: t('plantSetup.labelNotes', 'Notes'), val: selected.Notes },
                                ].map(f => f.val ? (
                                    <div key={f.label}>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 3 }}>{f.label}</div>
                                        <div style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>{f.val}</div>
                                    </div>
                                ) : null)}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// SKU IMPORT MODAL
// ══════════════════════════════════════════════════════════════════════════════
const IMPORT_FIELDS = [
    { key: 'sku',              label: 'SKU Code',          required: true  },
    { key: 'productName',      label: 'Product Name',      required: true  },
    { key: 'productFamily',    label: 'Product Family',    required: false },
    { key: 'baselineDailyQty', label: 'Baseline Daily Qty',required: false },
    { key: 'uom',              label: 'Unit of Measure',   required: false },
    { key: 'sizeCode',         label: 'Size Code',         required: false },
    { key: 'notes',            label: 'Notes',             required: false },
];
const IMPORT_HINTS = {
    sku:              ['sku','code','product code','item','sku code','product_code','item_code','item no','itemno'],
    productName:      ['name','product name','description','item name','product_name','item_description','product description'],
    productFamily:    ['family','category','type','product family','product_family','group','dept'],
    baselineDailyQty: ['qty','quantity','daily qty','baseline','target','baseline_daily_qty','daily_qty','base qty'],
    uom:              ['uom','unit','units','unit of measure','unit_of_measure','measure'],
    sizeCode:         ['size','size code','size_code','pack','pack size','container'],
    notes:            ['notes','note','comments','comment','remarks'],
};

/**
 * autoDetectMapping — fuzzy-match import file column headers to Trier OS SKU fields.
 * Compares each column name (lowercased) against IMPORT_HINTS keyword lists.
 * Returns a mapping object where keys are IMPORT_FIELDS keys and values are the
 * matched source column name (or '' if no match found).
 *
 * @param {string[]} columns — column names from the uploaded file
 * @returns {{ sku: string, productName: string, ... }} mapping object
 */
function autoDetectMapping(columns) {
    const mapping = {};
    for (const field of IMPORT_FIELDS) {
        const hints = IMPORT_HINTS[field.key];
        const match = columns.find(col =>
            hints.some(h => col.toLowerCase().trim() === h || col.toLowerCase().trim().includes(h))
        );
        mapping[field.key] = match || '';
    }
    return mapping;
}

/**
 * SKUImportModal — 4-step bulk import wizard for the SKU Catalog.
 *
 * Steps:
 *   1. upload  — user drops or selects a file (.csv, .db/.sqlite, .xlsx)
 *   2. map     — column mapping UI; autoDetectMapping pre-fills obvious matches
 *   3. preview — first 10 rows shown with the proposed mapping applied
 *   4. result  — POST /products/import response (inserted / skipped counts)
 *
 * Supported formats:
 *   CSV     — parsed client-side via PapaParse; no upload needed
 *   SQLite  — uploaded to server via POST /products/import-db; scanned server-side
 *   Excel   — .xlsx/.xls detected early; user prompted to export as CSV instead
 *
 * Import modes (user-selectable):
 *   skip      — duplicate SKUs (same PlantID + SKU) are silently skipped
 *   overwrite — duplicate SKUs are updated with the incoming row values
 *
 * @param {string}   plantId    — active plant (passed through to API header)
 * @param {Function} onClose    — called when the modal should close
 * @param {Function} onImported — called after a successful import to refresh the SKU list
 */
function SKUImportModal({ plantId, onClose, onImported }) {
    const [step, setStep]             = useState('upload');   // upload | map | preview | result
    const [fileType, setFileType]     = useState(null);       // 'csv' | 'db' | 'excel'
    const [columns, setColumns]       = useState([]);
    const [rawRows, setRawRows]       = useState([]);
    const [dbTables, setDbTables]     = useState([]);
    const [selectedTable, setSelectedTable] = useState('');
    const [mapping, setMapping]       = useState({});
    const [mode, setMode]             = useState('skip');     // 'skip' | 'overwrite'
    const [importing, setImporting]   = useState(false);
    const [result, setResult]         = useState(null);
    const [error, setError]           = useState('');
    const [uploading, setUploading]   = useState(false);
    const dropRef = useRef(null);

    const acceptedExt = '.csv,.db,.sqlite,.sqlite3,.xlsx,.xls';

    const handleFile = async (file) => {
        setError('');
        const ext = file.name.split('.').pop().toLowerCase();

        if (['xlsx','xls'].includes(ext)) {
            setFileType('excel');
            setStep('map');
            return;
        }

        if (ext === 'csv') {
            setFileType('csv');
            Papa.parse(file, {
                header: true, skipEmptyLines: true, preview: 200,
                complete: ({ data, meta }) => {
                    const cols = meta.fields || [];
                    setColumns(cols);
                    setRawRows(data);
                    setMapping(autoDetectMapping(cols));
                    setStep('map');
                },
                error: (e) => setError('CSV parse error: ' + e.message),
            });
            return;
        }

        if (['db','sqlite','sqlite3'].includes(ext)) {
            setFileType('db');
            setUploading(true);
            const fd = new FormData();
            fd.append('file', file);
            try {
                const r = await API('/products/import-db', { method: 'POST', body: fd, headers: {} });
                const d = await r.json();
                if (d.error) { setError(d.error); setUploading(false); return; }
                setDbTables(d.tables || []);
                if (d.tables?.length > 0) {
                    const first = d.tables[0];
                    setSelectedTable(first.table);
                    setColumns(first.columns);
                    setRawRows(first.rows);
                    setMapping(autoDetectMapping(first.columns));
                }
                setStep('map');
            } catch (e) { setError(e.message); }
            setUploading(false);
            return;
        }
        setError('Unsupported file type.');
    };

    const onDrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };
    const onDragOver = (e) => e.preventDefault();

    const switchDbTable = (tableName) => {
        const tbl = dbTables.find(t => t.table === tableName);
        if (!tbl) return;
        setSelectedTable(tableName);
        setColumns(tbl.columns);
        setRawRows(tbl.rows);
        setMapping(autoDetectMapping(tbl.columns));
    };

    const mappedPreview = useMemo(() => {
        return rawRows.slice(0, 5).map(row => {
            const out = {};
            for (const f of IMPORT_FIELDS) {
                out[f.key] = mapping[f.key] ? row[mapping[f.key]] : '';
            }
            return out;
        });
    }, [rawRows, mapping]);

    const doImport = async () => {
        setImporting(true);
        const rows = rawRows.map(row => {
            const out = {};
            for (const f of IMPORT_FIELDS) {
                out[f.key] = mapping[f.key] ? row[mapping[f.key]] : '';
            }
            return out;
        }).filter(r => r.sku && r.productName);

        try {
            const r = await API('/products/import', { method: 'POST', body: JSON.stringify({ rows, mode }) });
            const d = await r.json();
            setResult(d);
            setStep('result');
            if (d.inserted > 0) onImported();
        } catch (e) { setError(e.message); }
        setImporting(false);
    };

    const overlayStyle = {
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    };
    const panelStyle = {
        background: '#0f172a', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 14,
        width: 680, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
    };
    const headStyle = {
        display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
    };
    const bodyStyle = { flex: 1, overflowY: 'auto', padding: 20 };

    return ReactDOM.createPortal(
        <div style={overlayStyle} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={panelStyle}>
                <div style={headStyle}>
                    <Upload size={16} color="#0ea5e9" />
                    <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.95rem' }}>Import SKUs</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        {['upload','map','preview','result'].map((s, i) => (
                            <span key={s} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                                background: step === s ? 'rgba(14,165,233,0.2)' : 'transparent',
                                color: step === s ? '#0ea5e9' : '#475569', border: step === s ? '1px solid rgba(14,165,233,0.4)' : '1px solid transparent',
                            }}>{i+1}. {s.charAt(0).toUpperCase()+s.slice(1)}</span>
                        ))}
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', marginLeft: 8 }}><X size={16} /></button>
                </div>

                <div style={bodyStyle}>
                    {/* ── Step 1: Upload ── */}
                    {step === 'upload' && (
                        <div>
                            <div ref={dropRef} onDrop={onDrop} onDragOver={onDragOver}
                                style={{ border: '2px dashed rgba(14,165,233,0.3)', borderRadius: 12, padding: '48px 24px',
                                    textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
                                onMouseOver={e => e.currentTarget.style.borderColor = 'rgba(14,165,233,0.6)'}
                                onMouseOut={e => e.currentTarget.style.borderColor = 'rgba(14,165,233,0.3)'}
                                onClick={() => dropRef.current.querySelector('input').click()}
                            >
                                <input type="file" accept={acceptedExt} style={{ display: 'none' }}
                                    onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
                                <Upload size={32} color="#0ea5e9" style={{ marginBottom: 12, opacity: 0.7 }} />
                                <div style={{ color: '#f1f5f9', fontWeight: 600, marginBottom: 6 }}>Drop file here or click to browse</div>
                                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Supported: CSV, SQLite (.db), SQLite3</div>
                                <div style={{ color: '#475569', fontSize: '0.73rem', marginTop: 8 }}>Excel users: File → Save As → CSV, then import here</div>
                            </div>
                            {uploading && <div style={{ textAlign: 'center', color: '#0ea5e9', marginTop: 16, fontSize: '0.82rem' }}>Reading database file…</div>}
                            {error && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: 12 }}>{error}</div>}
                        </div>
                    )}

                    {/* ── Excel not supported ── */}
                    {step === 'map' && fileType === 'excel' && (
                        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                            <FileText size={40} color="#f59e0b" style={{ marginBottom: 16, opacity: 0.7 }} />
                            <div style={{ color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Excel files require one extra step</div>
                            <div style={{ color: '#94a3b8', fontSize: '0.82rem', lineHeight: 1.6 }}>
                                In Excel: <strong style={{color:'#f1f5f9'}}>File → Save As → CSV (Comma delimited)</strong><br />
                                Then re-import the .csv file here. All data will be preserved.
                            </div>
                            <button onClick={() => { setStep('upload'); setFileType(null); }} className="btn-nav"
                                style={{ marginTop: 20, color: '#0ea5e9', border: '1px solid rgba(14,165,233,0.3)', background: 'rgba(14,165,233,0.1)' }}>
                                ← Back
                            </button>
                        </div>
                    )}

                    {/* ── Step 2: Map columns ── */}
                    {step === 'map' && fileType !== 'excel' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {fileType === 'db' && dbTables.length > 1 && (
                                <div>
                                    <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Select Table</label>
                                    <select value={selectedTable} onChange={e => switchDbTable(e.target.value)}
                                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.82rem' }}>
                                        {dbTables.map(t => <option key={t.table} value={t.table}>{t.table} ({t.rows.length} rows)</option>)}
                                    </select>
                                </div>
                            )}
                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                Map your file's columns to SKU fields. Auto-detected where possible.
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                {IMPORT_FIELDS.map(f => (
                                    <div key={f.key}>
                                        <label style={{ fontSize: '0.72rem', color: mapping[f.key] ? '#0ea5e9' : '#64748b', display: 'block', marginBottom: 3 }}>
                                            {f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}
                                        </label>
                                        <select value={mapping[f.key] || ''} onChange={e => setMapping(p => ({ ...p, [f.key]: e.target.value }))}
                                            style={{ width: '100%', background: mapping[f.key] ? 'rgba(14,165,233,0.08)' : 'rgba(255,255,255,0.04)',
                                                border: `1px solid ${mapping[f.key] ? 'rgba(14,165,233,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                                borderRadius: 6, padding: '6px 8px', color: 'white', fontSize: '0.78rem' }}>
                                            <option value="">— skip —</option>
                                            {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Duplicate SKUs:</span>
                                {['skip','overwrite'].map(m => (
                                    <button key={m} onClick={() => setMode(m)} style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                                        background: mode === m ? 'rgba(14,165,233,0.15)' : 'transparent',
                                        border: `1px solid ${mode === m ? 'rgba(14,165,233,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                        color: mode === m ? '#0ea5e9' : '#64748b' }}>
                                        {m === 'skip' ? 'Skip (keep existing)' : 'Overwrite'}
                                    </button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                <button onClick={() => setStep('preview')} disabled={!mapping.sku || !mapping.productName} className="btn-nav"
                                    style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#0ea5e9',
                                        opacity: (!mapping.sku || !mapping.productName) ? 0.4 : 1 }}>
                                    Preview →
                                </button>
                                <button onClick={() => setStep('upload')} className="btn-nav">← Back</button>
                            </div>
                        </div>
                    )}

                    {/* ── Step 3: Preview ── */}
                    {step === 'preview' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                Preview (first 5 of {rawRows.length} rows) — {rawRows.filter(r => mapping.sku && r[mapping.sku] && mapping.productName && r[mapping.productName]).length} valid rows will be imported
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                            {IMPORT_FIELDS.filter(f => mapping[f.key]).map(f => (
                                                <th key={f.key} style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>{f.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mappedPreview.map((row, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                {IMPORT_FIELDS.filter(f => mapping[f.key]).map(f => (
                                                    <td key={f.key} style={{ padding: '5px 8px', color: f.required && !row[f.key] ? '#ef4444' : '#e2e8f0' }}>
                                                        {row[f.key] || <span style={{ color: '#475569' }}>—</span>}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={doImport} disabled={importing} className="btn-nav"
                                    style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Upload size={13} /> {importing ? 'Importing…' : `Import ${rawRows.length} rows`}
                                </button>
                                <button onClick={() => setStep('map')} className="btn-nav">← Back</button>
                            </div>
                            {error && <div style={{ color: '#ef4444', fontSize: '0.78rem' }}>{error}</div>}
                        </div>
                    )}

                    {/* ── Step 4: Result ── */}
                    {step === 'result' && result && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <CheckCircle size={40} color="#10b981" style={{ marginBottom: 12 }} />
                            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>Import Complete</div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 16 }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981' }}>{result.inserted}</div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>IMPORTED</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>{result.skipped}</div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>SKIPPED</div>
                                </div>
                            </div>
                            {result.errors?.length > 0 && (
                                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', textAlign: 'left', marginBottom: 12 }}>
                                    {result.errors.map((e, i) => <div key={i} style={{ fontSize: '0.72rem', color: '#ef4444' }}>{e}</div>)}
                                </div>
                            )}
                            <button onClick={onClose} className="btn-nav"
                                style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#0ea5e9' }}>
                                Done
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: SKU CATALOG
// ══════════════════════════════════════════════════════════════════════════════
function SKUsTab({ plantId }) {
    const { t } = useTranslation();
    const [skus, setSkus] = useState([]);
    const [search, setSearch] = useState('');
    const [filterFamily, setFilterFamily] = useState('');
    const [selected, setSelected] = useState(null);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({});
    const [msg, setMsg] = useState('');
    const [showImport, setShowImport] = useState(false);

    const families = useMemo(() => [...new Set(skus.map(s => s.ProductFamily).filter(Boolean))].sort(), [skus]);

    const load = useCallback(() => {
        let q = '?active=true';
        if (filterFamily) q += `&family=${encodeURIComponent(filterFamily)}`;
        if (search) q += `&search=${encodeURIComponent(search)}`;
        API(`/products${q}`).then(r => r.json()).then(setSkus).catch(() => {});
    }, [filterFamily, search]);

    useEffect(() => { load(); }, [load]);

    const ff = (k) => (v) => setForm(p => ({ ...p, [k]: v }));

    const save = async () => {
        const body = {
            SKU: form.SKU, ProductName: form.ProductName, ProductFamily: form.ProductFamily,
            LabelName: form.LabelName, SizeCode: form.SizeCode, SizeOz: form.SizeOz,
            ButterfatPct: form.ButterfatPct, ProductionSequence: form.ProductionSequence,
            ChangeoverFromPrev: form.ChangeoverFromPrev,
            BaselineDailyQty: form.BaselineDailyQty, HolidayQty: form.HolidayQty,
            UOM: form.UOM, Active: form.Active !== false ? 1 : 0, Notes: form.Notes,
        };
        let r;
        if (form.ID) {
            r = await API(`/products/${form.ID}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
            r = await API('/products', { method: 'POST', body: JSON.stringify({ sku: form.SKU, productName: form.ProductName, productFamily: form.ProductFamily, baselineDailyQty: form.BaselineDailyQty, holidayQty: form.HolidayQty, uom: form.UOM, notes: form.Notes }) });
        }
        const d = await r.json();
        if (d.success || d.id) { setMsg(t('plantSetup.savedMsg', 'Saved ✓')); setEditing(false); setSelected(null); setForm({}); load(); setTimeout(() => setMsg(''), 2000); }
    };

    const startAdd = () => { setForm({ Active: 1, UOM: 'cases', ButterfatPct: 0, ProductionSequence: 0 }); setEditing(true); setSelected(null); };
    const startEdit = (s) => { setForm({ ...s }); setEditing(true); setSelected(s); };

    const familyColor = (f) => {
        const m = { 'Fluid Milk': '#0ea5e9', 'Chocolate': '#a16207', 'Buttermilk': '#f59e0b', 'Juice': '#10b981', 'Fruit Drinks': '#ec4899', 'Cream': '#e2e8f0', 'Butter': '#fde68a', 'Cheese': '#d97706', 'Ingredients': '#8b5cf6' };
        return m[f] || '#64748b';
    };

    return (
        <>
        <div style={{ flex: 1, display: 'flex', gap: 14, overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('plantSetup.searchSkus', 'Search SKUs…')}
                        style={{ flex: 1, minWidth: 140, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 12px', color: 'white', fontSize: '0.82rem' }} />
                    <select value={filterFamily} onChange={e => setFilterFamily(e.target.value)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.8rem' }}>
                        <option value="">{t('plantSetup.allFamilies', 'All Families')}</option>
                        {families.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <button onClick={startAdd} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#0ea5e9' }}>
                        <Plus size={13} /> {t('plantSetup.addSku', 'Add SKU')}
                    </button>
                    <button onClick={() => setShowImport(true)} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
                        <Upload size={13} /> {t('plantSetup.importSkus', 'Import')}
                    </button>
                    {msg && <span style={{ fontSize: '0.78rem', color: '#10b981' }}>{msg}</span>}
                </div>

                <div className="glass-card" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.7rem', position: 'sticky', top: 0, background: 'rgba(15,23,42,0.9)' }}>
                                {[t('plantSetup.colSku','SKU'), t('plantSetup.colProductName','Product Name'), t('plantSetup.colFamily','Family'), t('plantSetup.colSize','Size'), t('plantSetup.colFatPct','Fat%'), t('plantSetup.colSeq','Seq'), t('plantSetup.colBaselineQty','Baseline Qty'), ''].map(h => (
                                    <th key={h} style={{ padding: '7px 8px', textAlign: ['Baseline Qty'].includes(h) ? 'right' : 'left', fontWeight: 600 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {skus.map(s => (
                                <tr key={s.ID} onClick={() => setSelected(s)}
                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: selected?.ID === s.ID ? 'rgba(14,165,233,0.08)' : 'transparent' }}>
                                    <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: '#94a3b8', fontSize: '0.72rem' }}>{s.SKU}</td>
                                    <td style={{ padding: '5px 8px', color: '#e2e8f0', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.ProductName}</td>
                                    <td style={{ padding: '5px 8px' }}><Badge color={familyColor(s.ProductFamily)}>{s.ProductFamily || '—'}</Badge></td>
                                    <td style={{ padding: '5px 8px', color: '#94a3b8' }}>{s.SizeCode || '—'}</td>
                                    <td style={{ padding: '5px 8px', color: '#64748b', fontSize: '0.72rem' }}>{s.ButterfatPct != null ? `${s.ButterfatPct}%` : '—'}</td>
                                    <td style={{ padding: '5px 8px', color: '#475569', fontSize: '0.7rem' }}>{s.ProductionSequence || '—'}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', color: '#10b981' }}>{s.BaselineDailyQty?.toLocaleString()}</td>
                                    <td style={{ padding: '5px 6px' }}>
                                        <ActionBtn icon={Pencil} tip={t('plantSetup.tipEdit', 'Edit')} color="#f59e0b" onClick={e => { e.stopPropagation(); startEdit(s); }} />
                                    </td>
                                </tr>
                            ))}
                            {skus.length === 0 && (
                                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>{t('plantSetup.noSkusFound', 'No SKUs found.')}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#475569' }}>{skus.length} {t('plantSetup.skusShown', 'SKUs shown')}</div>
            </div>

            {(selected || editing) && (
                <div className="glass-card" style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <DetailHeader
                        title={editing ? (form.ID ? t('plantSetup.editSku', 'Edit SKU') : t('plantSetup.newSku', 'New SKU')) : selected?.ProductName}
                        color="#0ea5e9" editing={editing}
                        onSave={save} onCancel={() => { setEditing(false); setForm({}); }}
                        onClose={() => { setSelected(null); setEditing(false); setForm({}); }}
                        extra={!editing && <ActionBtn icon={Pencil} tip={t('plantSetup.tipEdit', 'Edit')} color="#f59e0b" onClick={() => startEdit(selected)} />}
                    />
                    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                        {editing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <FF label={t('plantSetup.labelSkuCode', 'SKU Code')} value={form.SKU} onChange={ff('SKU')} required />
                                    <FF label={t('plantSetup.labelSizeCode', 'Size Code')} value={form.SizeCode} onChange={ff('SizeCode')} />
                                </div>
                                <FF label={t('plantSetup.labelProductName', 'Product Name')} value={form.ProductName} onChange={ff('ProductName')} required />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <FF label={t('plantSetup.labelProductFamily', 'Product Family')} value={form.ProductFamily} onChange={ff('ProductFamily')} />
                                    <FF label={t('plantSetup.labelLabelName', 'Label Name')} value={form.LabelName} onChange={ff('LabelName')} />
                                    <FF label={t('plantSetup.labelButterfatPct', 'Butterfat %')} type="number" value={form.ButterfatPct} onChange={ff('ButterfatPct')} />
                                    <FF label={t('plantSetup.labelSizeOz', 'Size (oz)')} type="number" value={form.SizeOz} onChange={ff('SizeOz')} />
                                    <FF label={t('plantSetup.labelProdSequence', 'Prod Sequence')} type="number" value={form.ProductionSequence} onChange={ff('ProductionSequence')} />
                                    <FF label={t('plantSetup.labelChangeover', 'Changeover')} value={form.ChangeoverFromPrev} onChange={ff('ChangeoverFromPrev')} options={['none','air-blow','water-flush','full-cip']} />
                                    <FF label={t('plantSetup.labelBaselineDailyQty', 'Baseline Daily Qty')} type="number" value={form.BaselineDailyQty} onChange={ff('BaselineDailyQty')} />
                                    <FF label={t('plantSetup.labelHolidayQty', 'Holiday Qty')} type="number" value={form.HolidayQty} onChange={ff('HolidayQty')} />
                                    <FF label={t('plantSetup.labelUom', 'UOM')} value={form.UOM} onChange={ff('UOM')} options={['cases','bags','lbs','gallons']} />
                                </div>
                                <FF label={t('plantSetup.labelNotes', 'Notes')} value={form.Notes} onChange={ff('Notes')} />
                            </div>
                        ) : selected && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {[
                                    { label: t('plantSetup.colSku', 'SKU'), val: selected.SKU },
                                    { label: t('plantSetup.colFamily', 'Family'), val: selected.ProductFamily },
                                    { label: t('plantSetup.fieldLabel', 'Label'), val: selected.LabelName },
                                    { label: t('plantSetup.fieldSizeCodeOz', 'Size Code / Oz'), val: selected.SizeCode ? `${selected.SizeCode} / ${selected.SizeOz} oz` : null },
                                    { label: t('plantSetup.fieldButterfat', 'Butterfat'), val: selected.ButterfatPct != null ? `${selected.ButterfatPct}%` : null },
                                    { label: t('plantSetup.fieldProductionSeq', 'Production Seq'), val: selected.ProductionSequence },
                                    { label: t('plantSetup.labelChangeover', 'Changeover'), val: selected.ChangeoverFromPrev },
                                    { label: t('plantSetup.fieldBaselineDaily', 'Baseline Daily'), val: selected.BaselineDailyQty != null ? `${selected.BaselineDailyQty?.toLocaleString()} ${selected.UOM}` : null },
                                    { label: t('plantSetup.labelHolidayQty', 'Holiday Qty'), val: selected.HolidayQty != null ? `${selected.HolidayQty?.toLocaleString()} ${selected.UOM}` : null },
                                    { label: t('plantSetup.labelNotes', 'Notes'), val: selected.Notes },
                                ].map(f => f.val ? (
                                    <div key={f.label}>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>{f.label}</div>
                                        <div style={{ fontSize: '0.83rem', color: '#e2e8f0' }}>{f.val}</div>
                                    </div>
                                ) : null)}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
        {showImport && <SKUImportModal plantId={plantId} onClose={() => setShowImport(false)} onImported={load} />}
        </>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PLANT CALENDAR
// ══════════════════════════════════════════════════════════════════════════════
const EVENT_TYPES = ['federal-holiday','shutdown','reduced-production','maintenance-window','special-event'];
const typeColor = { 'federal-holiday': '#ef4444', 'shutdown': '#64748b', 'reduced-production': '#f59e0b', 'maintenance-window': '#0ea5e9', 'special-event': '#8b5cf6' };

function CalendarTab({ plantId }) {
    const { t } = useTranslation();
    const year = new Date().getFullYear();
    const [events, setEvents] = useState([]);
    const [filterYear, setFilterYear] = useState(String(year));
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({});
    const [selected, setSelected] = useState(null);
    const [msg, setMsg] = useState('');

    const load = useCallback(() => {
        API(`/calendar?year=${filterYear}`).then(r => r.json()).then(setEvents).catch(() => {});
    }, [filterYear]);

    useEffect(() => { load(); }, [load]);

    const ff = (k) => (v) => setForm(p => ({ ...p, [k]: v }));

    const save = async () => {
        const body = {
            eventDate: form.EventDate, eventType: form.EventType, label: form.Label,
            productionCapacityPct: form.ProductionCapacityPct, appliesToAll: true,
        };
        let r;
        if (form.ID) {
            r = await API(`/calendar/${form.ID}`, { method: 'PUT', body: JSON.stringify({ EventDate: form.EventDate, EventType: form.EventType, Label: form.Label, ProductionCapacityPct: form.ProductionCapacityPct, AppliesToAll: 1 }) });
        } else {
            r = await API('/calendar', { method: 'POST', body: JSON.stringify(body) });
        }
        const d = await r.json();
        if (d.success || d.id) { setMsg(t('plantSetup.savedMsg', 'Saved ✓')); setEditing(false); setForm({}); setSelected(null); load(); setTimeout(() => setMsg(''), 2000); }
    };

    const del = async (id) => {
        if (!window.confirm(t('plantSetup.deleteEventConfirm', 'Delete this calendar event?'))) return;
        await API(`/calendar/${id}`, { method: 'DELETE' });
        setSelected(null); setEditing(false); setForm({}); load();
    };

    const startAdd = () => { setForm({ EventType: 'federal-holiday', ProductionCapacityPct: 0, EventDate: new Date().toISOString().slice(0,10) }); setEditing(true); setSelected(null); };
    const startEdit = (e) => { setForm({ ...e }); setEditing(true); setSelected(e); };

    return (
        <div style={{ flex: 1, display: 'flex', gap: 14, overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.8rem' }}>
                        {[year-1, year, year+1].map(y => <option key={y} value={String(y)}>{y}</option>)}
                    </select>
                    <button onClick={startAdd} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#0ea5e9' }}>
                        <Plus size={13} /> {t('plantSetup.addEvent', 'Add Event')}
                    </button>
                    {msg && <span style={{ fontSize: '0.78rem', color: '#10b981' }}>{msg}</span>}
                </div>

                <div className="glass-card" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.72rem', position: 'sticky', top: 0, background: 'rgba(15,23,42,0.9)' }}>
                                {[t('plantSetup.colDate','Date'), t('plantSetup.colLabel','Label'), t('plantSetup.colType','Type'), t('plantSetup.colCapacityPct','Capacity %'), ''].map(h => (
                                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {events.map(e => (
                                <tr key={e.ID} onClick={() => setSelected(e)}
                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: selected?.ID === e.ID ? 'rgba(14,165,233,0.08)' : 'transparent' }}>
                                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#e2e8f0', fontWeight: 600 }}>{e.EventDate}</td>
                                    <td style={{ padding: '7px 10px', color: '#e2e8f0' }}>{e.Label}</td>
                                    <td style={{ padding: '7px 10px' }}><Badge color={typeColor[e.EventType] || '#64748b'}>{e.EventType}</Badge></td>
                                    <td style={{ padding: '7px 10px', color: e.ProductionCapacityPct === 0 ? '#ef4444' : '#f59e0b' }}>{e.ProductionCapacityPct}%</td>
                                    <td style={{ padding: '7px 6px' }}>
                                        <div style={{ display: 'flex', gap: 3 }}>
                                            <ActionBtn icon={Pencil} tip={t('plantSetup.tipEdit', 'Edit')} color="#f59e0b" onClick={ev => { ev.stopPropagation(); startEdit(e); }} />
                                            <ActionBtn icon={Trash2} tip={t('plantSetup.tipDelete', 'Delete')} color="#ef4444" onClick={ev => { ev.stopPropagation(); del(e.ID); }} />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {events.length === 0 && (
                                <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>{t('plantSetup.noCalendarEvents', 'No calendar events for {year}.').replace('{year}', filterYear)}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {(editing || selected) && (
                <div className="glass-card" style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <DetailHeader
                        title={editing ? (form.ID ? t('plantSetup.editEvent', 'Edit Event') : t('plantSetup.newEvent', 'New Event')) : selected?.Label}
                        color="#f59e0b" editing={editing}
                        onSave={save} onCancel={() => { setEditing(false); setForm({}); }}
                        onClose={() => { setSelected(null); setEditing(false); setForm({}); }}
                        extra={!editing && <ActionBtn icon={Pencil} tip={t('plantSetup.tipEdit', 'Edit')} color="#f59e0b" onClick={() => startEdit(selected)} />}
                    />
                    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                        {editing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <FF label={t('plantSetup.labelDate', 'Date')} type="date" value={form.EventDate} onChange={ff('EventDate')} required />
                                <FF label={t('plantSetup.colLabel', 'Label')} value={form.Label} onChange={ff('Label')} required />
                                <FF label={t('plantSetup.labelEventType', 'Event Type')} value={form.EventType} onChange={ff('EventType')} options={EVENT_TYPES} />
                                <FF label={t('plantSetup.labelProductionCapacityPct', 'Production Capacity %')} type="number" value={form.ProductionCapacityPct} onChange={ff('ProductionCapacityPct')} />
                            </div>
                        ) : selected && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {[
                                    { label: t('plantSetup.labelDate', 'Date'), val: selected.EventDate },
                                    { label: t('plantSetup.fieldType', 'Type'), val: selected.EventType },
                                    { label: t('plantSetup.labelCapacity', 'Capacity'), val: `${selected.ProductionCapacityPct}%` },
                                ].map(f => (
                                    <div key={f.label}>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>{f.label}</div>
                                        <div style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>{f.val}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PRODUCTION IMPORT  (Planning Engine — Pads, Rolling History, Add/Cut)
// ══════════════════════════════════════════════════════════════════════════════
const IMPORT_API = (path, o = {}) => fetch(`/api/production-import${path}`, {
    ...o,
    headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json',
        'x-plant-id': localStorage.getItem('selectedPlantId') || 'Plant_1',
        ...o.headers,
    },
});

function ProductionImportTab({ plantId }) {
    const { t } = useTranslation();
    const today = new Date().toISOString().slice(0, 10);
    const [subTab, setSubTab]       = useState('grid');
    const [prodDate, setProdDate]   = useState(today);
    const [rawText, setRawText]     = useState('');
    const [preview, setPreview]     = useState(null);
    const [parsing, setParsing]     = useState(false);
    const [importing, setImporting] = useState(false);
    const [importMsg, setImportMsg] = useState('');
    const [orders, setOrders]       = useState([]);
    const [batchInfo, setBatchInfo] = useState(null);
    const [batches, setBatches]     = useState([]);
    const [showPaste, setShowPaste] = useState(true);
    const [collapsed, setCollapsed] = useState({});
    const [editing, setEditing]     = useState({});
    const [history, setHistory]     = useState({});
    const [showHistory, setShowHistory] = useState(true);
    const [applying, setApplying]   = useState(false);
    const [addModal, setAddModal]   = useState(false);
    const [addForm, setAddForm]     = useState({ section: 'MANUFACTURED', qty: 0, padQty: 0 });
    const [cutModal, setCutModal]   = useState(null);
    const [cutReason, setCutReason] = useState('');
    const [cutQty, setCutQty]       = useState('');
    const [pads, setPads]           = useState([]);
    const [padEdit, setPadEdit]     = useState(null);
    const [padForm, setPadForm]     = useState({});
    const [padMsg, setPadMsg]       = useState('');
    const [padSuggestions, setPadSuggestions] = useState([]);

    const loadOrders = useCallback(() => {
        if (!prodDate) return;
        IMPORT_API(`/orders?date=${prodDate}`)
            .then(r => r.json())
            .then(d => { setOrders(Array.isArray(d.orders) ? d.orders : []); setBatchInfo(d.batch || null); })
            .catch(() => {});
        IMPORT_API('/batches').then(r => r.json()).then(d => setBatches(Array.isArray(d) ? d : [])).catch(() => {});
    }, [prodDate]);

    const loadHistory = useCallback(() => {
        if (!prodDate) return;
        IMPORT_API(`/history-bulk?date=${prodDate}&weeks=4`)
            .then(r => r.json()).then(d => setHistory(typeof d === 'object' ? d : {})).catch(() => {});
    }, [prodDate]);

    const loadPads = useCallback(() => {
        IMPORT_API('/pads').then(r => r.json()).then(d => setPads(Array.isArray(d) ? d : [])).catch(() => {});
        IMPORT_API(`/pads/suggest?date=${prodDate}&weeks=4`).then(r => r.json()).then(d => setPadSuggestions(Array.isArray(d) ? d : [])).catch(() => {});
    }, [prodDate]);

    useEffect(() => { loadOrders(); loadHistory(); }, [loadOrders, loadHistory]);
    useEffect(() => { if (subTab === 'pads') loadPads(); }, [subTab, loadPads]);

    const handleParse = async () => {
        if (!rawText.trim()) return;
        setParsing(true); setPreview(null);
        try {
            const r = await IMPORT_API('/parse', { method: 'POST', body: JSON.stringify({ rawText }) });
            const d = await r.json();
            if (d.error) setImportMsg('Parse error: ' + d.error);
            else { setPreview(d); setImportMsg(''); }
        } catch (e) { setImportMsg('Network error: ' + e.message); }
        setParsing(false);
    };

    const handleImport = async () => {
        if (!preview || !prodDate) return;
        if (!window.confirm(`Import ${preview.summary.totalLines} order lines for ${prodDate}?`)) return;
        setImporting(true);
        try {
            const r = await IMPORT_API('/import', { method: 'POST', body: JSON.stringify({ rawText, productionDate: prodDate }) });
            const d = await r.json();
            if (d.error) setImportMsg('Import error: ' + d.error);
            else {
                setImportMsg(`✓ Imported ${d.count} lines · ${d.totalUnits?.toLocaleString()} units`);
                setPreview(null); setRawText(''); setShowPaste(false);
                loadOrders(); loadHistory();
            }
        } catch (e) { setImportMsg('Network error: ' + e.message); }
        setImporting(false);
    };

    const applyPads = async () => {
        setApplying(true);
        const r = await IMPORT_API(`/apply-pads?date=${prodDate}`, { method: 'POST' });
        const d = await r.json();
        setImportMsg(`✓ Applied pads to ${d.updated} lines (${d.dayOfWeek})`);
        setApplying(false); loadOrders();
    };

    const startEdit = (id, o) => setEditing(p => ({ ...p, [id]: { bi: o.BeginningInventory || 0, pad: o.Pad || 0, adj: o.ManualAdjust || 0 } }));
    const stopEdit  = (id) => setEditing(p => { const n = { ...p }; delete n[id]; return n; });
    const saveEdit  = async (id) => {
        const e = editing[id];
        await IMPORT_API(`/orders/${id}`, { method: 'PUT', body: JSON.stringify({ beginningInventory: e.bi, pad: e.pad, manualAdjust: e.adj }) });
        stopEdit(id); loadOrders();
    };
    const ef = (id, k, v) => setEditing(p => ({ ...p, [id]: { ...p[id], [k]: Number(v) || 0 } }));

    const handleCut = async () => {
        if (!cutModal) return;
        const body = { reason: cutReason };
        if (cutQty !== '') body.cutQty = parseInt(cutQty);
        await IMPORT_API(`/orders/${cutModal.ID}/cut`, { method: 'POST', body: JSON.stringify(body) });
        setCutModal(null); setCutReason(''); setCutQty(''); loadOrders();
    };

    const handleRestore = async (id) => {
        await IMPORT_API(`/orders/${id}/restore`, { method: 'POST', body: '{}' });
        loadOrders();
    };

    const handleAddLine = async () => {
        if (!addForm.prodNumber || addForm.qty === undefined) return;
        await IMPORT_API('/orders/add', { method: 'POST', body: JSON.stringify({ ...addForm, productionDate: prodDate }) });
        setAddModal(false); setAddForm({ section: 'MANUFACTURED', qty: 0, padQty: 0 }); loadOrders();
    };

    const handleDeleteLine = async (id) => {
        if (!window.confirm('Remove this manually-added line?')) return;
        await IMPORT_API(`/orders/${id}`, { method: 'DELETE' }); loadOrders();
    };

    const savePad = async () => {
        await IMPORT_API('/pads', { method: 'PUT', body: JSON.stringify(padForm) });
        setPadMsg('Saved ✓'); setPadEdit(null); setPadForm({});
        setTimeout(() => setPadMsg(''), 2000); loadPads();
    };

    const grouped = useMemo(() => {
        const g = {};
        for (const o of orders) { const sec = o.Section || 'MANUFACTURED'; if (!g[sec]) g[sec] = []; g[sec].push(o); }
        return g;
    }, [orders]);

    const totalOrdered = orders.reduce((s, o) => s + (o.TotQty || 0), 0);
    const totalFinal   = orders.filter(o => o.Status !== 'cut').reduce((s, o) => s + (o.FinalQty || 0), 0);
    const cutCount     = orders.filter(o => o.Status === 'cut').length;
    const addCount     = orders.filter(o => o.Status === 'manual-add').length;
    const sectionColors = { MANUFACTURED: '#10b981', PURCHASED: '#f59e0b' };
    const DAYS    = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const DOW_KEYS = ['PadMon', 'PadTue', 'PadWed', 'PadThu', 'PadFri', 'PadSat', 'PadSun'];

    const statusBadge = (status) => {
        if (status === 'cut')         return { label: 'CUT',     color: '#ef4444' };
        if (status === 'partial-cut') return { label: 'PARTIAL', color: '#f59e0b' };
        if (status === 'manual-add')  return { label: 'ADDED',   color: '#8b5cf6' };
        return null;
    };

    return (
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, gap: 14, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem', color: '#0ea5e9' }}>
                    <Upload size={20} /> {t('plantSetup.productionImport', 'Production Import')}
                </h2>
                <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)' }}>
                    {[['grid', t('plantSetup.planningGrid', 'Planning Grid')], ['pads', t('plantSetup.padManager', 'Pad Manager')]].map(([v, lbl]) => (
                        <button key={v} onClick={() => setSubTab(v)}
                            style={{ padding: '5px 14px', fontSize: '0.78rem', fontWeight: subTab === v ? 700 : 400, background: subTab === v ? 'rgba(14,165,233,0.2)' : 'transparent', color: subTab === v ? '#0ea5e9' : '#64748b', border: 'none', cursor: 'pointer' }}>
                            {lbl}
                        </button>
                    ))}
                </div>
                {subTab === 'grid' && <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: '0.78rem', color: '#64748b' }}>{t('plantSetup.productionDate', 'Production Date')}</label>
                        <input type="date" value={prodDate} onChange={e => setProdDate(e.target.value)}
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '6px 12px', color: 'white', fontSize: '0.85rem' }} />
                    </div>
                    <button onClick={() => setShowPaste(p => !p)} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem' }}>
                        <Upload size={13} /> {showPaste ? t('plantSetup.hideImportPanel', 'Hide Import Panel') : t('plantSetup.importReport', 'Import Report')}
                    </button>
                    <button onClick={() => setAddModal(true)} className="btn-nav"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#8b5cf6' }}>
                        <Plus size={13} /> {t('plantSetup.addLine', 'Add Line')}
                    </button>
                    {orders.length > 0 && <button onClick={applyPads} disabled={applying} className="btn-nav"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                        <Zap size={13} /> {applying ? t('plantSetup.applyingState', 'Applying…') : t('plantSetup.applyPads', 'Apply Pads')}
                    </button>}
                    <button onClick={() => setShowHistory(p => !p)} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', opacity: 0.7 }}>
                        <TrendingUp size={13} /> {showHistory ? t('plantSetup.hideHistory', 'Hide History') : t('plantSetup.showHistory', 'Show History')}
                    </button>
                </>}
                {importMsg && <span style={{ fontSize: '0.78rem', color: '#10b981' }}>{importMsg}</span>}
                {batchInfo && <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 'auto' }}>{t('plantSetup.lastImport', 'Last import:')} {batchInfo.ImportDate?.slice(0, 16)} · {batchInfo.TotalLines} {t('plantSetup.linesLabel', 'lines')}</span>}
            </div>

            {subTab === 'grid' && <>
                {showPaste && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ClipboardList size={16} style={{ color: '#0ea5e9' }} />
                            <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem' }}>{t('plantSetup.productionReportPaste', 'Production Report Paste')}</span>
                            <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 'auto' }}>{t('plantSetup.pasteFormat', 'AS400 · JDE · SAP · fixed-width')}</span>
                        </div>
                        <textarea value={rawText} onChange={e => setRawText(e.target.value)}
                            placeholder={t('plantSetup.pasteAreaPlaceholder', 'Paste your production report here...\n\n• AS400 / iSeries fixed-width (Product# col 17, Size col 30, Desc col 36, Label col 55, Qty col 65+)\n• JDE Enterprise One CSV\n• SAP PP production order flat file')}
                            style={{ width: '100%', height: 160, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 12, color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <button onClick={handleParse} disabled={parsing || !rawText.trim()} className="btn-nav"
                                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#0ea5e9' }}>
                                <RefreshCw size={13} /> {parsing ? t('plantSetup.parsingState', 'Parsing…') : t('plantSetup.parseAndPreview', 'Parse & Preview')}
                            </button>
                            {preview && <button onClick={handleImport} disabled={importing} className="btn-nav"
                                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
                                <Upload size={13} /> {importing ? t('plantSetup.importingState', 'Importing…') : t('plantSetup.importLines', 'Import {n} Lines').replace('{n}', preview.summary.totalLines)}
                            </button>}
                            {rawText && <button onClick={() => { setRawText(''); setPreview(null); }} className="btn-nav"><X size={13} /> {t('plantSetup.clearButton', 'Clear')}</button>}
                        </div>
                        {preview && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <Badge color="#0ea5e9">{preview.summary.totalLines} {t('plantSetup.linesLabel', 'lines')}</Badge>
                                <Badge color="#10b981">{preview.summary.totalUnits?.toLocaleString()} {t('plantSetup.unitsLabel', 'units')}</Badge>
                                {Object.entries(preview.summary.bySizeCode || {}).map(([sz, qty]) => (
                                    <Badge key={sz} color="#94a3b8">{sz}: {qty.toLocaleString()}</Badge>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {orders.length > 0 && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 16px', background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: 10, flexWrap: 'wrap' }}>
                        <TrendingUp size={16} style={{ color: '#0ea5e9' }} />
                        <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{prodDate}</span>
                        <Badge color="#0ea5e9">{orders.length} {t('plantSetup.skusLabel', 'SKUs')}</Badge>
                        <Badge color="#f59e0b">{t('plantSetup.orderedBadge', 'Ordered:')} {totalOrdered.toLocaleString()}</Badge>
                        <Badge color="#10b981">{t('plantSetup.finalPlanBadge', 'Final Plan:')} {totalFinal.toLocaleString()}</Badge>
                        {cutCount > 0 && <Badge color="#ef4444">{cutCount} {t('plantSetup.cutBadge', 'Cut')}</Badge>}
                        {addCount > 0 && <Badge color="#8b5cf6">{addCount} {t('plantSetup.addedBadge', 'Added')}</Badge>}
                        <button onClick={() => window.triggerTrierPrint?.('production-orders', { date: prodDate, orders, plantId })}
                            className="btn-nav" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem' }}>
                            <Printer size={13} /> {t('plantSetup.printPlan', 'Print Plan')}
                        </button>
                    </div>
                )}

                {orders.length > 0 && Object.entries(grouped).map(([section, sOrders]) => {
                    const isCollapsed = collapsed[section];
                    const secColor = sectionColors[section] || '#94a3b8';
                    const secTotal = sOrders.filter(o => o.Status !== 'cut').reduce((s, o) => s + (o.FinalQty || 0), 0);
                    return (
                        <div key={section} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
                            <div onClick={() => setCollapsed(p => ({ ...p, [section]: !p[section] }))}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', userSelect: 'none' }}>
                                {isCollapsed ? <ChevronRight size={16} style={{ color: secColor }} /> : <ChevronDown size={16} style={{ color: secColor }} />}
                                <span style={{ fontWeight: 700, color: secColor, fontSize: '0.9rem' }}>{section}</span>
                                <Badge color={secColor}>{sOrders.length} {t('plantSetup.linesLabel', 'lines')}</Badge>
                                <span style={{ color: '#64748b', fontSize: '0.78rem', marginLeft: 4 }}>{t('plantSetup.finalLabel', 'Final:')} {secTotal.toLocaleString()} {t('plantSetup.unitsLabel', 'units')}</span>
                            </div>
                            {!isCollapsed && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', minWidth: showHistory ? 900 : 720 }}>
                                        <thead>
                                            <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.7rem' }}>
                                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>{t('plantSetup.colProdNum', 'Prod#')}</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>{t('plantSetup.colSize', 'Size')}</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>{t('plantSetup.labelDescription', 'Description')}</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>{t('plantSetup.colLabel', 'Label')}</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('plantSetup.colOrdered', 'Ordered')}</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('plantSetup.colBegInv', 'Beg Inv')}</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('plantSetup.colPad', 'Pad')}</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('plantSetup.colFinal', 'Final')}</th>
                                                {showHistory && <th style={{ padding: '6px 8px', textAlign: 'right', color: '#f59e0b' }}>{t('plantSetup.col4wkAvg', '4wk Avg')}</th>}
                                                {showHistory && <th style={{ padding: '6px 8px', textAlign: 'right', color: '#8b5cf6' }}>{t('plantSetup.colSugPad', 'Sug Pad')}</th>}
                                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>{t('plantSetup.colStatus', 'Status')}</th>
                                                <th style={{ padding: '6px 8px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sOrders.map(o => {
                                                const e = editing[o.ID];
                                                const isCut = o.Status === 'cut';
                                                const isAdded = o.Status === 'manual-add';
                                                const calcFinal = e ? Math.max(0, (o.TotQty || 0) - (e.bi || 0) + (e.pad || 0) + (e.adj || 0)) : (o.FinalQty || 0);
                                                const hKey = `${o.ProdNumber}|${o.SizeCode}|${o.LabelCode}`;
                                                const hist = history[hKey];
                                                const badge = statusBadge(o.Status);
                                                return (
                                                    <tr key={o.ID} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isCut ? 'rgba(239,68,68,0.05)' : isAdded ? 'rgba(139,92,246,0.05)' : e ? 'rgba(245,158,11,0.04)' : 'transparent', opacity: isCut ? 0.6 : 1 }}>
                                                        <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: '#94a3b8', fontSize: '0.72rem' }}>{o.ProdNumber}</td>
                                                        <td style={{ padding: '5px 8px', fontWeight: 600, color: '#e2e8f0' }}>{o.SizeCode}</td>
                                                        <td style={{ padding: '5px 8px', color: '#e2e8f0', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.Description}</td>
                                                        <td style={{ padding: '5px 8px', color: '#64748b', fontSize: '0.72rem' }}>{o.LabelCode}</td>
                                                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#f59e0b' }}>{(o.TotQty || 0).toLocaleString()}</td>
                                                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>
                                                            {e ? <input type="number" value={e.bi} onChange={ev => ef(o.ID, 'bi', ev.target.value)} style={{ width: 68, background: 'rgba(255,255,255,0.08)', border: '1px solid #f59e0b66', borderRadius: 4, padding: '3px 6px', color: 'white', textAlign: 'right', fontSize: '0.76rem' }} />
                                                               : <span style={{ color: '#94a3b8' }}>{(o.BeginningInventory || 0).toLocaleString()}</span>}
                                                        </td>
                                                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>
                                                            {e ? <input type="number" value={e.pad} onChange={ev => ef(o.ID, 'pad', ev.target.value)} style={{ width: 60, background: 'rgba(255,255,255,0.08)', border: '1px solid #0ea5e966', borderRadius: 4, padding: '3px 6px', color: 'white', textAlign: 'right', fontSize: '0.76rem' }} />
                                                               : <span style={{ color: o.Pad > 0 ? '#f59e0b' : '#64748b' }}>{(o.Pad || 0).toLocaleString()}</span>}
                                                        </td>
                                                        <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: isCut ? '#ef4444' : calcFinal > 0 ? '#10b981' : '#64748b' }}>
                                                            {isCut ? <s>{calcFinal.toLocaleString()}</s> : calcFinal.toLocaleString()}
                                                        </td>
                                                        {showHistory && <td style={{ padding: '5px 8px', textAlign: 'right', color: '#f59e0b', fontSize: '0.72rem' }}>{hist ? hist.avgQty.toLocaleString() : '—'}</td>}
                                                        {showHistory && <td style={{ padding: '5px 8px', textAlign: 'right', color: '#8b5cf6', fontSize: '0.72rem' }}>{hist?.suggestedPad > 0 ? `+${hist.suggestedPad}` : '—'}</td>}
                                                        <td style={{ padding: '5px 8px' }}>
                                                            {badge && <span style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: 8, background: `${badge.color}22`, color: badge.color, border: `1px solid ${badge.color}44`, fontWeight: 700 }}>{badge.label}</span>}
                                                        </td>
                                                        <td style={{ padding: '4px 6px' }}>
                                                            {e ? (
                                                                <div style={{ display: 'flex', gap: 3 }}>
                                                                    <ActionBtn icon={Save} tip="Save" color="#10b981" onClick={() => saveEdit(o.ID)} />
                                                                    <ActionBtn icon={X} tip="Cancel" color="#ef4444" onClick={() => stopEdit(o.ID)} />
                                                                </div>
                                                            ) : (
                                                                <div style={{ display: 'flex', gap: 2 }}>
                                                                    {!isCut && <ActionBtn icon={Pencil} tip={t('plantSetup.tipEditInvPads', 'Edit inv & pads')} color="#f59e0b" onClick={() => startEdit(o.ID, o)} />}
                                                                    {!isCut && <ActionBtn icon={Trash2} tip={t('plantSetup.tipCutLine', 'Cut this line')} color="#ef4444" onClick={() => { setCutModal(o); setCutReason(''); setCutQty(''); }} />}
                                                                    {isCut && <ActionBtn icon={RefreshCw} tip={t('plantSetup.tipRestoreLine', 'Restore line')} color="#10b981" onClick={() => handleRestore(o.ID)} />}
                                                                    {isAdded && <ActionBtn icon={X} tip={t('plantSetup.tipDeleteAddedLine', 'Delete added line')} color="#ef4444" onClick={() => handleDeleteLine(o.ID)} />}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}

                {orders.length === 0 && !showPaste && (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#475569' }}>
                        <FileText size={42} strokeWidth={1} style={{ marginBottom: 12 }} />
                        <div>{t('plantSetup.noOrdersFor', 'No orders imported for {date}.').replace('{date}', prodDate)}</div>
                        <button onClick={() => setShowPaste(true)} className="btn-nav" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Upload size={14} /> {t('plantSetup.importProductionReport', 'Import Production Report')}
                        </button>
                    </div>
                )}

                {batches.length > 0 && (
                    <div>
                        <div style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('plantSetup.importHistory', 'Import History')}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {batches.map(b => (
                                <button key={b.ID} onClick={() => setProdDate(b.ProductionDate)} className="btn-nav"
                                    style={{ fontSize: '0.7rem', padding: '3px 9px', background: b.ProductionDate === prodDate ? 'rgba(14,165,233,0.15)' : undefined, borderColor: b.ProductionDate === prodDate ? 'rgba(14,165,233,0.4)' : undefined }}>
                                    {b.ProductionDate} <span style={{ color: '#64748b' }}>({b.TotalLines})</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </>}

            {subTab === 'pads' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                            <strong style={{ color: '#f1f5f9' }}>{t('plantSetup.dayOfWeekPads', 'Day-of-week pads')}</strong> — {t('plantSetup.dayOfWeekPadsDesc', 'standing safety buffers per SKU per day.')}
                        </div>
                        <button onClick={loadPads} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', marginLeft: 'auto' }}>
                            <RefreshCw size={13} /> {t('plantSetup.refresh', 'Refresh')}
                        </button>
                        {padMsg && <span style={{ fontSize: '0.78rem', color: '#10b981' }}>{padMsg}</span>}
                    </div>

                    {padSuggestions.length > 0 && (
                        <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: '12px 16px' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b5cf6', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📊 {t('plantSetup.suggestedPads4wk', 'Suggested Pads — 4-Week History')}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {padSuggestions.map(s => (
                                    <div key={`${s.prod}|${s.size}`}
                                        style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 8, padding: '6px 10px', fontSize: '0.75rem', cursor: 'pointer' }}
                                        onClick={() => { setPadEdit('new'); setPadForm({ prodNumber: s.prod, sizeCode: s.size, labelCode: s.label, padMon: s.suggestedPad, padTue: s.suggestedPad, padWed: s.suggestedPad, padThu: s.suggestedPad, padFri: s.suggestedPad, padSat: Math.round(s.suggestedPad * 0.6), padSun: 0 }); }}>
                                        <span style={{ color: '#8b5cf6', fontWeight: 700 }}>{s.prod} {s.size}</span>
                                        <span style={{ color: '#64748b', marginLeft: 6 }}>{t('plantSetup.avgMaxPattern', 'avg {avg} · max {max}').replace('{avg}', s.avg).replace('{max}', s.max)}</span>
                                        <span style={{ color: '#10b981', marginLeft: 6, fontWeight: 600 }}>+{s.suggestedPad} {t('plantSetup.suggestedLabel', 'suggested')}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {padEdit !== null && (
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: 16 }}>
                            <div style={{ fontWeight: 600, color: '#f59e0b', marginBottom: 12, fontSize: '0.88rem' }}>{padEdit === 'new' ? t('plantSetup.newPadRule', 'New Pad Rule') : t('plantSetup.editPadRule', 'Edit Pad Rule')}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 10, marginBottom: 12 }}>
                                <FF label={t('plantSetup.colProdNum', 'Prod#')} value={padForm.prodNumber} onChange={v => setPadForm(p => ({ ...p, prodNumber: v }))} />
                                <FF label={t('plantSetup.colSize', 'Size')} value={padForm.sizeCode} onChange={v => setPadForm(p => ({ ...p, sizeCode: v }))} />
                                <FF label={t('plantSetup.colLabel', 'Label')} value={padForm.labelCode} onChange={v => setPadForm(p => ({ ...p, labelCode: v }))} />
                                {DAYS.map((d, i) => <FF key={d} label={d} type="number" value={padForm[DOW_KEYS[i]] ?? 0} onChange={v => setPadForm(p => ({ ...p, [DOW_KEYS[i]]: parseInt(v) || 0 }))} />)}
                                <div style={{ gridColumn: '1/-1' }}><FF label={t('plantSetup.labelNotes', 'Notes')} value={padForm.notes} onChange={v => setPadForm(p => ({ ...p, notes: v }))} /></div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={savePad} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
                                    <Save size={13} /> {t('plantSetup.savePadRule', 'Save Pad Rule')}
                                </button>
                                <button onClick={() => { setPadEdit(null); setPadForm({}); }} className="btn-nav"><X size={13} /> {t('plantSetup.cancel', 'Cancel')}</button>
                            </div>
                        </div>
                    )}

                    <button onClick={() => { setPadEdit('new'); setPadForm({}); }} className="btn-nav"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content', fontSize: '0.8rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                        <Plus size={13} /> {t('plantSetup.addPadRule', 'Add Pad Rule')}
                    </button>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', minWidth: 700 }}>
                            <thead>
                                <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.7rem' }}>
                                    {['Prod#', 'Size', 'Label', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Notes', ''].map(h => (
                                        <th key={h} style={{ padding: '6px 8px', textAlign: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].includes(h) ? 'center' : 'left', fontWeight: 600 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {pads.length === 0
                                    ? <tr><td colSpan={12} style={{ padding: '30px', textAlign: 'center', color: '#475569' }}>{t('plantSetup.noPadRulesDefined', 'No pad rules defined.')}</td></tr>
                                    : pads.map(pad => (
                                        <tr key={pad.ID} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: '#94a3b8' }}>{pad.ProdNumber}</td>
                                            <td style={{ padding: '5px 8px', fontWeight: 600 }}>{pad.SizeCode}</td>
                                            <td style={{ padding: '5px 8px', color: '#64748b', fontSize: '0.72rem' }}>{pad.LabelCode}</td>
                                            {[pad.PadMon, pad.PadTue, pad.PadWed, pad.PadThu, pad.PadFri, pad.PadSat, pad.PadSun].map((v, i) => (
                                                <td key={i} style={{ padding: '5px 8px', textAlign: 'center', color: v > 0 ? '#f59e0b' : '#475569', fontWeight: v > 0 ? 700 : 400 }}>{v || '—'}</td>
                                            ))}
                                            <td style={{ padding: '5px 8px', color: '#64748b', fontSize: '0.72rem' }}>{pad.Notes}</td>
                                            <td style={{ padding: '4px 6px' }}>
                                                <div style={{ display: 'flex', gap: 2 }}>
                                                    <ActionBtn icon={Pencil} tip={t('plantSetup.tipEdit', 'Edit')} color="#f59e0b" onClick={() => { setPadEdit(pad.ID); setPadForm({ prodNumber: pad.ProdNumber, sizeCode: pad.SizeCode, labelCode: pad.LabelCode, padMon: pad.PadMon, padTue: pad.PadTue, padWed: pad.PadWed, padThu: pad.PadThu, padFri: pad.PadFri, padSat: pad.PadSat, padSun: pad.PadSun, notes: pad.Notes }); }} />
                                                    <ActionBtn icon={Trash2} tip={t('plantSetup.tipDelete', 'Delete')} color="#ef4444" onClick={async () => { await IMPORT_API(`/pads/${pad.ID}`, { method: 'DELETE' }); loadPads(); }} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {addModal && (
                <div className="modal-overlay" onClick={() => setAddModal(false)}>
                    <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <DetailHeader title={<><Plus size={18} /> {t('plantSetup.addManualOrderLine', 'Add Manual Order Line')}</>} color="#8b5cf6" editing onSave={handleAddLine} onCancel={() => setAddModal(false)} onClose={() => setAddModal(false)} />
                        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <FF label={t('plantSetup.labelProdSkuCode', 'Prod# / SKU Code')} value={addForm.prodNumber} onChange={v => setAddForm(p => ({ ...p, prodNumber: v }))} required />
                            <FF label={t('plantSetup.labelSizeCode', 'Size Code')} value={addForm.sizeCode} onChange={v => setAddForm(p => ({ ...p, sizeCode: v }))} />
                            <div style={{ gridColumn: '1/-1' }}><FF label={t('plantSetup.labelDescription', 'Description')} value={addForm.description} onChange={v => setAddForm(p => ({ ...p, description: v }))} /></div>
                            <FF label={t('plantSetup.labelLabelCode', 'Label Code')} value={addForm.labelCode} onChange={v => setAddForm(p => ({ ...p, labelCode: v }))} />
                            <FF label={t('plantSetup.labelSection', 'Section')} value={addForm.section} onChange={v => setAddForm(p => ({ ...p, section: v }))} options={['MANUFACTURED', 'PURCHASED']} />
                            <FF label={t('plantSetup.labelQuantity', 'Quantity')} type="number" value={addForm.qty} onChange={v => setAddForm(p => ({ ...p, qty: v }))} required />
                            <FF label={t('plantSetup.labelPadSafetyBuffer', 'Pad (safety buffer)')} type="number" value={addForm.padQty} onChange={v => setAddForm(p => ({ ...p, padQty: v }))} />
                            <div style={{ gridColumn: '1/-1' }}><FF label={t('plantSetup.labelReasonNotes', 'Reason / Notes')} value={addForm.reason} onChange={v => setAddForm(p => ({ ...p, reason: v }))} /></div>
                        </div>
                    </div>
                </div>
            )}

            {cutModal && (
                <div className="modal-overlay" onClick={() => setCutModal(null)}>
                    <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <DetailHeader title={<><Trash2 size={18} /> {t('plantSetup.cutOrderLine', 'Cut Order Line')}</>} color="#ef4444" editing onSave={handleCut} onCancel={() => setCutModal(null)} onClose={() => setCutModal(null)} />
                        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem', color: '#e2e8f0' }}>
                                <strong style={{ color: '#ef4444' }}>{cutModal.SizeCode} {cutModal.Description}</strong> — {(cutModal.TotQty || 0).toLocaleString()} units ordered
                            </div>
                            <div>
                                <label style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: 4 }}>{t('plantSetup.cutToQty', 'Cut to Qty (blank = full cut to 0)')}</label>
                                <input type="number" value={cutQty} onChange={e => setCutQty(e.target.value)} placeholder={t('plantSetup.cutToQtyPlaceholder', '0 = full cut')}
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: 4 }}>{t('plantSetup.reasonRequired', 'Reason *')}</label>
                                <input value={cutReason} onChange={e => setCutReason(e.target.value)} placeholder={t('plantSetup.reasonPlaceholder', 'e.g. Customer cancelled, inventory covers…')}
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: API INTEGRATIONS
// ══════════════════════════════════════════════════════════════════════════════
const FLUID_INTEGRATIONS = [
    { id: 'erp',       label: 'ERP / Order Management',      icon: Database,       color: '#0ea5e9', desc: 'AS400 · JDE · SAP · Sage · Dynamics',                    protocols: ['SFTP','REST','DB Direct','FTP'] },
    { id: 'scada',     label: 'SCADA / PLC / DCS',           icon: Cpu,            color: '#10b981', desc: 'Ignition · Wonderware · Allen-Bradley · Siemens · PI',   protocols: ['OPC-UA','Modbus TCP','MQTT','REST'] },
    { id: 'lims',      label: 'LIMS / Lab System',           icon: FlaskConical,   color: '#8b5cf6', desc: 'LabVantage · SampleManager · POMS Dairy · LECO',         protocols: ['REST','HL7','CSV','SFTP'] },
    { id: 'edi',       label: 'Customer EDI / Order Feed',   icon: ArrowRightLeft, color: '#f59e0b', desc: 'Walmart · Kroger · Sysco (850/856/810)',                  protocols: ['EDI X12','AS2','SFTP','VAN'] },
    { id: 'coldchain', label: 'Cold Chain / Fleet Telemetry', icon: Truck,          color: '#06b6d4', desc: 'Samsara · Motive · Verizon Connect · Geotab',             protocols: ['REST','Webhook','MQTT'] },
    { id: 'route',     label: 'Route Accounting / DSD',      icon: BarChart3,      color: '#ec4899', desc: 'HighJump · Encompass · StayinFront · Custom',             protocols: ['REST','SFTP','DB Sync'] },
];

// ══════════════════════════════════════════════════════════════════════════════
// TAB: API INTEGRATIONS
// ══════════════════════════════════════════════════════════════════════════════

// Scoped fetch helper for the API Integrations tab — mirrors the top-level API()
// helper but defined here to keep this tab's network calls self-contained and
// easy to trace during debugging.
const PLANT_API = (path, o = {}) => fetch(`/api/plant-setup${path}`, {
    ...o,
    headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}`, 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Plant_1', ...o.headers },
});

/**
 * ApiIntegrationsTab — configure, test, and monitor all external system connections.
 *
 * Each integration card (SCADA, ERP, LIMS, EDI, Cold Chain, Route) exposes:
 *   - Connection config fields (host, port, credentials, poll interval)
 *   - Simulator toggle: starts the built-in Modbus TCP simulator on a dedicated
 *     port so the edge agent can be tested without a real PLC on the network
 *   - Worker toggle: starts/stops the EdgeAgent poll loop that writes live sensor
 *     readings into SensorReadings in the plant DB
 *   - Connection test: live HTTP probe to verify the configured endpoint is reachable
 *
 * Worker status is polled every 8 seconds via GET /integrations/worker/status so
 * the live badges (SIMULATING / LIVE SYNC / CONFIGURED / NOT SET) stay current.
 *
 * @param {string} plantId — active plant ID, injected via x-plant-id header on all requests
 */
function ApiIntegrationsTab({ plantId }) {
    const { t } = useTranslation();
    const [configs, setConfigs]       = useState({});
    const [expanded, setExpanded]     = useState(null);
    const [form, setForm]             = useState({});
    const [testing, setTesting]       = useState(null);
    const [testResult, setTestResult] = useState({});
    const [saving, setSaving]         = useState(null);
    const [saveMsg, setSaveMsg]       = useState({});
    const [workerStatus, setWorkerStatus] = useState({ workers: {}, simulators: {} });
    const [togglingSimulator, setTogglingSimulator] = useState(null);
    const [togglingWorker, setTogglingWorker]       = useState(null);

    useEffect(() => {
        PLANT_API('/integrations').then(r => r.json()).then(d => setConfigs(typeof d === 'object' ? d : {})).catch(() => {});
        refreshStatus();
    }, [plantId]);

    // Poll worker status every 8 seconds when tab is visible
    useEffect(() => {
        const t = setInterval(refreshStatus, 8000);
        return () => clearInterval(t);
    }, [plantId]);

    const refreshStatus = () => {
        PLANT_API('/integrations/worker/status').then(r => r.json()).then(d => setWorkerStatus(d)).catch(() => {});
    };

    const toggleExpand = (id) => {
        setExpanded(p => p === id ? null : id);
        setForm(configs[id] || {});
        setTestResult(p => ({ ...p, [id]: null }));
    };

    const save = async (id) => {
        setSaving(id);
        await PLANT_API('/integrations', { method: 'POST', body: JSON.stringify({ integrationId: id, config: form }) });
        setConfigs(p => ({ ...p, [id]: form }));
        setSaveMsg(p => ({ ...p, [id]: 'Saved ✓' }));
        setSaving(null);
        setTimeout(() => setSaveMsg(p => ({ ...p, [id]: '' })), 2000);
    };

    const toggleSimulator = async (id, enable) => {
        setTogglingSimulator(id);
        // Start or stop the built-in Modbus TCP simulator for this integration.
        // The simulator runs on a fixed port per integration (scada=5020, erp=5021…)
        // so multiple plants can simulate simultaneously without port conflicts.
        await PLANT_API('/integrations/simulator/toggle', { method: 'POST', body: JSON.stringify({ integrationId: id, enable }) });
        await refreshStatus();
        setTogglingSimulator(null);
    };

    const toggleWorker = async (id, start) => {
        setTogglingWorker(id);
        const endpoint = start ? '/integrations/worker/start' : '/integrations/worker/stop';
        // Pass simulatorMode=true when the simulator is running so the EdgeAgent
        // connects to 127.0.0.1 instead of the configured external host/port.
        await PLANT_API(endpoint, { method: 'POST', body: JSON.stringify({ integrationId: id, config: { ...configs[id], simulatorMode: workerStatus.simulators[id]?.running } }) });
        await refreshStatus();
        setTogglingWorker(null);
    };

    const workerKey = (id) => `${plantId}::${id}`;
    const isWorkerRunning  = (id) => !!workerStatus.workers[workerKey(id)]?.running;
    const isSimRunning     = (id) => !!workerStatus.simulators[id]?.running;
    const workerLastPoll   = (id) => workerStatus.workers[workerKey(id)]?.lastPoll;
    const workerPollCount  = (id) => workerStatus.workers[workerKey(id)]?.pollCount || 0;
    const workerLastError  = (id) => workerStatus.workers[workerKey(id)]?.lastError;

    const testConn = async (id) => {
        setTesting(id);
        try {
            const r = await PLANT_API('/integrations/test', { method: 'POST', body: JSON.stringify({ integrationId: id, config: form }) });
            const d = await r.json();
            setTestResult(p => ({ ...p, [id]: d }));
        } catch (e) { setTestResult(p => ({ ...p, [id]: { ok: false, message: e.message } })); }
        setTesting(null);
    };

    const isConfigured = (id) => configs[id] && Object.keys(configs[id]).some(k => configs[id][k]);

    return (
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, gap: 14, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem', color: '#0ea5e9' }}><Link size={20} /> {t('plantSetup.apiIntegrations', 'API Integrations')}</h2>
                <span style={{ fontSize: '0.78rem', color: '#475569' }}>{t('plantSetup.configureConnections', 'Configure connections to external dairy plant systems')}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#475569' }}>
                    <Wifi size={12} color="#10b981" /> {t('plantSetup.credentialsLocal', 'Credentials stored locally — no data leaves your plant network')}
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {FLUID_INTEGRATIONS.map(intg => {
                    const Icon = intg.icon;
                    const isOpen = expanded === intg.id;
                    const configured = isConfigured(intg.id);
                    const tr = testResult[intg.id];
                    return (
                        <div key={intg.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${isOpen ? intg.color + '44' : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, overflow: 'hidden' }}>
                            <div onClick={() => toggleExpand(intg.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }}>
                                <div style={{ width: 38, height: 38, borderRadius: 10, background: `${intg.color}18`, border: `1px solid ${intg.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Icon size={18} color={intg.color} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.9rem' }}>{intg.label}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{intg.desc}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {isWorkerRunning(intg.id)
                                        ? <Badge color={workerLastError(intg.id) ? '#ef4444' : '#10b981'}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: workerLastError(intg.id) ? '#ef4444' : '#10b981', display: 'inline-block', marginRight: 4, boxShadow: workerLastError(intg.id) ? 'none' : '0 0 5px #10b981' }} />
                                            {isSimRunning(intg.id) ? 'SIMULATING' : 'LIVE SYNC'}
                                          </Badge>
                                        : configured
                                            ? <Badge color="#10b981"><CheckCircle size={10} style={{ marginRight: 3 }} />{t('plantSetup.configured', 'CONFIGURED')}</Badge>
                                            : <Badge color="#475569">{t('plantSetup.notSet', 'NOT SET')}</Badge>
                                    }
                                    {isOpen ? <ChevronDown size={16} style={{ color: '#64748b' }} /> : <ChevronRight size={16} style={{ color: '#64748b' }} />}
                                </div>
                            </div>
                            {isOpen && (
                                <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10, marginTop: 14 }}>
                                        <FF label={t('plantSetup.hostEndpointUrl', 'Host / Endpoint URL')} value={form.host} onChange={v => setForm(p => ({ ...p, host: v }))} placeholder={t('plantSetup.hostPlaceholder', '192.168.x.x or https://…')} />
                                        <FF label={t('plantSetup.port', 'Port')} value={form.port} onChange={v => setForm(p => ({ ...p, port: v }))} placeholder={t('plantSetup.portPlaceholder', '21, 8080, 4840…')} />
                                        <FF label={t('plantSetup.protocol', 'Protocol')} value={form.protocol} onChange={v => setForm(p => ({ ...p, protocol: v }))} options={intg.protocols} />
                                        <FF label={t('plantSetup.username', 'Username')} value={form.username} onChange={v => setForm(p => ({ ...p, username: v }))} />
                                        <FF label={t('plantSetup.passwordSecret', 'Password / Secret')} type="password" value={form.password} onChange={v => setForm(p => ({ ...p, password: v }))} />
                                        <FF label={t('plantSetup.apiKeyToken', 'API Key / Token')} value={form.apiKey} onChange={v => setForm(p => ({ ...p, apiKey: v }))} />
                                        <FF label={t('plantSetup.databasePath', 'Database / Path')} value={form.database} onChange={v => setForm(p => ({ ...p, database: v }))} />
                                        <div style={{ gridColumn: '1/-1' }}><FF label={t('plantSetup.notesAdditionalConfig', 'Notes / Additional Config')} value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} /></div>
                                    </div>
                                    {/* ── Simulator & Worker Controls ── */}
                                    <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.15)', borderRadius: 8 }}>
                                        <div style={{ fontSize: '0.68rem', color: '#0ea5e9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                                            Simulator &amp; Sync Controls
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>

                                            {/* Simulator toggle */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Simulator</span>
                                                <button
                                                    onClick={() => toggleSimulator(intg.id, !isSimRunning(intg.id))}
                                                    disabled={togglingSimulator === intg.id}
                                                    style={{
                                                        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                                                        background: isSimRunning(intg.id) ? '#f59e0b' : 'rgba(255,255,255,0.1)',
                                                        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                                                        opacity: togglingSimulator === intg.id ? 0.5 : 1,
                                                    }}
                                                >
                                                    <span style={{
                                                        position: 'absolute', top: 3, left: isSimRunning(intg.id) ? 22 : 3,
                                                        width: 18, height: 18, borderRadius: '50%', background: 'white',
                                                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                                                    }} />
                                                </button>
                                                {isSimRunning(intg.id) && (
                                                    <Badge color="#f59e0b">SIMULATING :{workerStatus.simulators[intg.id]?.port}</Badge>
                                                )}
                                            </div>

                                            {/* Worker start/stop */}
                                            <button
                                                onClick={() => toggleWorker(intg.id, !isWorkerRunning(intg.id))}
                                                disabled={togglingWorker === intg.id}
                                                className="btn-nav"
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                    background: isWorkerRunning(intg.id) ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                                                    border: `1px solid ${isWorkerRunning(intg.id) ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                                                    color: isWorkerRunning(intg.id) ? '#ef4444' : '#10b981',
                                                }}>
                                                {isWorkerRunning(intg.id) ? <WifiOff size={13} /> : <Wifi size={13} />}
                                                {togglingWorker === intg.id ? 'Working…' : isWorkerRunning(intg.id) ? 'Stop Sync' : 'Start Sync'}
                                            </button>

                                            {/* Live status */}
                                            {isWorkerRunning(intg.id) && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: workerLastError(intg.id) ? '#ef4444' : '#10b981', display: 'inline-block', boxShadow: workerLastError(intg.id) ? 'none' : '0 0 6px #10b981' }} />
                                                    <span style={{ fontSize: '0.72rem', color: workerLastError(intg.id) ? '#ef4444' : '#10b981' }}>
                                                        {workerLastError(intg.id) ? workerLastError(intg.id) : `${workerPollCount(intg.id)} polls`}
                                                    </span>
                                                    {workerLastPoll(intg.id) && (
                                                        <span style={{ fontSize: '0.68rem', color: '#475569' }}>
                                                            Last: {new Date(workerLastPoll(intg.id)).toLocaleTimeString()}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* ── Config / Test buttons ── */}
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                                        <button onClick={() => save(intg.id)} disabled={saving === intg.id} className="btn-nav"
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
                                            <Save size={13} /> {saving === intg.id ? t('plantSetup.saving', 'Saving…') : t('plantSetup.saveConfig', 'Save Config')}
                                        </button>
                                        <button onClick={() => testConn(intg.id)} disabled={testing === intg.id} className="btn-nav"
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: `${intg.color}18`, border: `1px solid ${intg.color}44`, color: intg.color }}>
                                            <Wifi size={13} /> {testing === intg.id ? t('plantSetup.testing', 'Testing…') : t('plantSetup.testConnection', 'Test Connection')}
                                        </button>
                                        {saveMsg[intg.id] && <span style={{ fontSize: '0.78rem', color: '#10b981' }}>{saveMsg[intg.id]}</span>}
                                        {tr && (
                                            <span style={{ fontSize: '0.78rem', color: tr.ok ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: 5 }}>
                                                {tr.ok ? <Wifi size={13} /> : <WifiOff size={13} />} {tr.message}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
