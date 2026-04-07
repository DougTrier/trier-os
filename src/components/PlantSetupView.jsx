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
 *   Production Units  — Define process lines, tanks, and equipment groupings
 *   SKU Catalog       — Product codes, descriptions, packaging types, and targets
 *   Plant Calendar    — Shift schedule, holidays, and production days configuration
 *   Import & History  — Production data import (CSV/Excel) and history review
 *   Planning Engine   — Rolling history, production pads, and Add/Cut interface
 *   Integration       — External system connections (ERP, MES, scales, lab)
 *
 * API CALLS: All via /api/plant-setup/* (server/routes/plant_setup.js).
 *   Settings are per-plant, keyed by PlantID, stored in prairie_logistics.db.
 *
 * CRITICALITY CLASSES: Assets assigned A/B/C criticality via Production Units config.
 *   Class A — Mission-critical; immediate response required
 *   Class B — Important; same-shift response required
 *   Class C — Non-critical; can be scheduled within the week
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

const FF = ({ label, value, onChange, type = 'text', options, required, placeholder }) => (
    <div>
        <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>
            {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
        </label>
        {options ? (
            <select value={value || ''} onChange={e => onChange(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.82rem', boxSizing: 'border-box' }}>
                <option value="">— Select —</option>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        ) : (
            <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder || ''}
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.82rem', boxSizing: 'border-box' }} />
        )}
    </div>
);

const DetailHeader = ({ title, color, editing, onSave, onCancel, onClose, extra }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--glass-border)', background: `${color}11` }}>
        <span style={{ fontWeight: 700, color, fontSize: '0.95rem', flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>{title}</span>
        {extra}
        {editing && onSave && <button onClick={onSave} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: '0.78rem' }}><Save size={13} /> Save</button>}
        {editing && onCancel && <button onClick={onCancel} className="btn-nav" style={{ fontSize: '0.78rem' }}><X size={13} /> Cancel</button>}
        {onClose && <button onClick={onClose} className="btn-nav" style={{ fontSize: '0.78rem' }}><X size={13} /></button>}
    </div>
);

// ── Tab definitions ────────────────────────────────────────────────────────────
const TABS = [
    { id: 'general',  label: 'General',            icon: Settings },
    { id: 'units',    label: 'Production Units',   icon: Cpu },
    { id: 'skus',     label: 'SKU Catalog',        icon: Box },
    { id: 'calendar', label: 'Plant Calendar',     icon: Calendar },
    { id: 'import',   label: 'Production Import',  icon: Upload },
    { id: 'integrations', label: 'API Integrations', icon: Link },
];

export default function PlantSetupView({ plantId, plantLabel }) {
    const [tab, setTab] = useState('general');
    const [summary, setSummary] = useState(null);

    useEffect(() => {
        API('/summary').then(r => r.json()).then(setSummary).catch(() => {});
    }, [plantId]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, padding: '10px 16px 0', flexWrap: 'wrap', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.15)' }}>
                {TABS.map(t => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '8px 14px', fontSize: '0.8rem', fontWeight: active ? 700 : 400,
                                background: active ? 'rgba(14,165,233,0.15)' : 'transparent',
                                color: active ? '#0ea5e9' : '#64748b',
                                border: 'none', borderBottom: active ? '2px solid #0ea5e9' : '2px solid transparent',
                                cursor: 'pointer', borderRadius: '6px 6px 0 0',
                            }}>
                            <Icon size={14} /> {t.label}
                        </button>
                    );
                })}
                {summary && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 6 }}>
                        <Badge color="#10b981">{summary.units} Units</Badge>
                        <Badge color="#0ea5e9">{summary.products} SKUs</Badge>
                        {summary.critA > 0 && <Badge color="#ef4444">{summary.critA} Crit-A</Badge>}
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
        if (d.success) { setMsg('Saved ✓'); setTimeout(() => setMsg(''), 2000); }
        setSaving(false);
    };

    const seedData = async () => {
        if (!window.confirm('Seed this plant with a full dairy production dataset? This will replace all existing units, SKUs, and calendar events.')) return;
        setSeeding(true);
        const r = await API('/seed?force=true', { method: 'POST' });
        const d = await r.json();
        if (d.success) {
            setMsg(`Seeded: ${d.seeded?.productionUnits} units, ${d.seeded?.products} SKUs, ${d.seeded?.calendarEvents} calendar events`);
            API('/summary').then(r2 => r2.json()).then(setSummary).catch(() => {});
        }
        setSeeding(false);
    };

    const MODEL_OPTIONS = ['fluid-process', 'cultured', 'cheese', 'butter', 'ice-cream', 'mixed'];

    return (
        <div className="glass-card" style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Factory size={18} color="#0ea5e9" /> Plant Configuration — {plantLabel || plantId}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 14 }}>
                <FF label="Production Model" value={model} onChange={setModel} options={MODEL_OPTIONS} />
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={saveConfig} disabled={saving} className="btn-nav"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
                    <Save size={13} /> {saving ? 'Saving…' : 'Save Configuration'}
                </button>
                <button onClick={seedData} disabled={seeding} className="btn-nav"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                    <Beaker size={13} /> {seeding ? 'Seeding…' : 'Seed Demo Data (Dairy)'}
                </button>
                {msg && <span style={{ fontSize: '0.8rem', color: '#10b981' }}>{msg}</span>}
            </div>

            {summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 }}>
                    {[
                        { label: 'Active Units', val: summary.units, color: '#10b981', icon: Cpu },
                        { label: 'Active SKUs', val: summary.products, color: '#0ea5e9', icon: Box },
                        { label: 'Crit-A Assets', val: summary.critA, color: '#ef4444', icon: AlertTriangle },
                        { label: 'Calendar Events', val: summary.calEvents, color: '#f59e0b', icon: Calendar },
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
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Upcoming Shutdowns</div>
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
        if (d.success || d.id) { setMsg('Saved ✓'); setEditing(false); setSelected(null); setForm({}); load(); setTimeout(() => setMsg(''), 2000); }
    };

    const startAdd = () => { setForm({ UnitType: 'Processing', CriticalityClass: 'B', Status: 'Active', SortOrder: 0 }); setEditing(true); setSelected(null); };
    const startEdit = (u) => { setForm({ ...u }); setEditing(true); setSelected(u); };

    const ff = (k) => (v) => setForm(p => ({ ...p, [k]: v }));

    return (
        <div style={{ flex: 1, display: 'flex', gap: 14, overflow: 'hidden' }}>
            {/* List */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search units…"
                        style={{ flex: 1, minWidth: 140, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 12px', color: 'white', fontSize: '0.82rem' }} />
                    <select value={filterType} onChange={e => setFilterType(e.target.value)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.8rem' }}>
                        <option value="">All Types</option>
                        {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.8rem' }}>
                        <option value="">All Statuses</option>
                        {UNIT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={startAdd} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#0ea5e9' }}>
                        <Plus size={13} /> Add Unit
                    </button>
                    {msg && <span style={{ fontSize: '0.78rem', color: '#10b981' }}>{msg}</span>}
                </div>

                <div className="glass-card" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.72rem', position: 'sticky', top: 0, background: 'rgba(15,23,42,0.9)' }}>
                                {['#','Unit Name','Type','Capacity','Sqft','Crit','Status',''].map(h => (
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
                                    <td style={{ padding: '7px 10px', color: '#64748b', fontSize: '0.75rem' }}>{u.FloorSpaceSqFt ? `${u.FloorSpaceSqFt?.toLocaleString()} ft²` : '—'}</td>
                                    <td style={{ padding: '7px 10px' }}><Badge color={critColors[u.CriticalityClass] || '#94a3b8'}>{u.CriticalityClass}</Badge></td>
                                    <td style={{ padding: '7px 10px' }}>
                                        <Badge color={u.Status === 'Active' ? '#10b981' : '#f59e0b'}>{u.Status}</Badge>
                                    </td>
                                    <td style={{ padding: '7px 6px' }}>
                                        <ActionBtn icon={Pencil} tip="Edit" color="#f59e0b" onClick={e => { e.stopPropagation(); startEdit(u); }} />
                                    </td>
                                </tr>
                            ))}
                            {units.length === 0 && (
                                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>No units found. Add one or seed demo data.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail / Edit panel */}
            {(selected || editing) && (
                <div className="glass-card" style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <DetailHeader
                        title={editing ? (form.ID ? 'Edit Unit' : 'New Unit') : selected?.UnitName}
                        color="#0ea5e9" editing={editing}
                        onSave={save} onCancel={() => { setEditing(false); setForm({}); }}
                        onClose={() => { setSelected(null); setEditing(false); setForm({}); }}
                        extra={!editing && <ActionBtn icon={Pencil} tip="Edit" color="#f59e0b" onClick={() => startEdit(selected)} />}
                    />
                    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                        {editing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <FF label="Unit Name" value={form.UnitName} onChange={ff('UnitName')} required />
                                <FF label="Unit Type" value={form.UnitType} onChange={ff('UnitType')} options={UNIT_TYPES} />
                                <FF label="Description" value={form.Description} onChange={ff('Description')} />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <FF label="Capacity" type="number" value={form.CapacityPerHour} onChange={ff('CapacityPerHour')} />
                                    <FF label="Unit (lbs/hr etc)" value={form.CapacityUnit} onChange={ff('CapacityUnit')} />
                                    <FF label="Floor Space (ft²)" type="number" value={form.FloorSpaceSqFt} onChange={ff('FloorSpaceSqFt')} />
                                    <FF label="Sort Order" type="number" value={form.SortOrder} onChange={ff('SortOrder')} />
                                    <FF label="Criticality" value={form.CriticalityClass} onChange={ff('CriticalityClass')} options={CRIT_CLASSES} />
                                    <FF label="Status" value={form.Status} onChange={ff('Status')} options={UNIT_STATUSES} />
                                </div>
                                <FF label="Notes" value={form.Notes} onChange={ff('Notes')} />
                            </div>
                        ) : selected && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {[
                                    { label: 'Type', val: selected.UnitType },
                                    { label: 'Description', val: selected.Description },
                                    { label: 'Capacity', val: selected.CapacityPerHour ? `${selected.CapacityPerHour?.toLocaleString()} ${selected.CapacityUnit}` : '—' },
                                    { label: 'Floor Space', val: selected.FloorSpaceSqFt ? `${selected.FloorSpaceSqFt?.toLocaleString()} ft²` : '—' },
                                    { label: 'Criticality', val: selected.CriticalityClass },
                                    { label: 'Status', val: selected.Status },
                                    { label: 'Notes', val: selected.Notes },
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
// TAB: SKU CATALOG
// ══════════════════════════════════════════════════════════════════════════════
function SKUsTab({ plantId }) {
    const [skus, setSkus] = useState([]);
    const [search, setSearch] = useState('');
    const [filterFamily, setFilterFamily] = useState('');
    const [selected, setSelected] = useState(null);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({});
    const [msg, setMsg] = useState('');

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
        if (d.success || d.id) { setMsg('Saved ✓'); setEditing(false); setSelected(null); setForm({}); load(); setTimeout(() => setMsg(''), 2000); }
    };

    const startAdd = () => { setForm({ Active: 1, UOM: 'cases', ButterfatPct: 0, ProductionSequence: 0 }); setEditing(true); setSelected(null); };
    const startEdit = (s) => { setForm({ ...s }); setEditing(true); setSelected(s); };

    const familyColor = (f) => {
        const m = { 'Fluid Milk': '#0ea5e9', 'Chocolate': '#a16207', 'Buttermilk': '#f59e0b', 'Juice': '#10b981', 'Fruit Drinks': '#ec4899', 'Cream': '#e2e8f0', 'Butter': '#fde68a', 'Cheese': '#d97706', 'Ingredients': '#8b5cf6' };
        return m[f] || '#64748b';
    };

    return (
        <div style={{ flex: 1, display: 'flex', gap: 14, overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKUs…"
                        style={{ flex: 1, minWidth: 140, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 12px', color: 'white', fontSize: '0.82rem' }} />
                    <select value={filterFamily} onChange={e => setFilterFamily(e.target.value)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: '0.8rem' }}>
                        <option value="">All Families</option>
                        {families.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <button onClick={startAdd} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#0ea5e9' }}>
                        <Plus size={13} /> Add SKU
                    </button>
                    {msg && <span style={{ fontSize: '0.78rem', color: '#10b981' }}>{msg}</span>}
                </div>

                <div className="glass-card" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.7rem', position: 'sticky', top: 0, background: 'rgba(15,23,42,0.9)' }}>
                                {['SKU','Product Name','Family','Size','Fat%','Seq','Baseline Qty',''].map(h => (
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
                                        <ActionBtn icon={Pencil} tip="Edit" color="#f59e0b" onClick={e => { e.stopPropagation(); startEdit(s); }} />
                                    </td>
                                </tr>
                            ))}
                            {skus.length === 0 && (
                                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>No SKUs found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#475569' }}>{skus.length} SKUs shown</div>
            </div>

            {(selected || editing) && (
                <div className="glass-card" style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <DetailHeader
                        title={editing ? (form.ID ? 'Edit SKU' : 'New SKU') : selected?.ProductName}
                        color="#0ea5e9" editing={editing}
                        onSave={save} onCancel={() => { setEditing(false); setForm({}); }}
                        onClose={() => { setSelected(null); setEditing(false); setForm({}); }}
                        extra={!editing && <ActionBtn icon={Pencil} tip="Edit" color="#f59e0b" onClick={() => startEdit(selected)} />}
                    />
                    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                        {editing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <FF label="SKU Code" value={form.SKU} onChange={ff('SKU')} required />
                                    <FF label="Size Code" value={form.SizeCode} onChange={ff('SizeCode')} />
                                </div>
                                <FF label="Product Name" value={form.ProductName} onChange={ff('ProductName')} required />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <FF label="Product Family" value={form.ProductFamily} onChange={ff('ProductFamily')} />
                                    <FF label="Label Name" value={form.LabelName} onChange={ff('LabelName')} />
                                    <FF label="Butterfat %" type="number" value={form.ButterfatPct} onChange={ff('ButterfatPct')} />
                                    <FF label="Size (oz)" type="number" value={form.SizeOz} onChange={ff('SizeOz')} />
                                    <FF label="Prod Sequence" type="number" value={form.ProductionSequence} onChange={ff('ProductionSequence')} />
                                    <FF label="Changeover" value={form.ChangeoverFromPrev} onChange={ff('ChangeoverFromPrev')} options={['none','air-blow','water-flush','full-cip']} />
                                    <FF label="Baseline Daily Qty" type="number" value={form.BaselineDailyQty} onChange={ff('BaselineDailyQty')} />
                                    <FF label="Holiday Qty" type="number" value={form.HolidayQty} onChange={ff('HolidayQty')} />
                                    <FF label="UOM" value={form.UOM} onChange={ff('UOM')} options={['cases','bags','lbs','gallons']} />
                                </div>
                                <FF label="Notes" value={form.Notes} onChange={ff('Notes')} />
                            </div>
                        ) : selected && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {[
                                    { label: 'SKU', val: selected.SKU },
                                    { label: 'Family', val: selected.ProductFamily },
                                    { label: 'Label', val: selected.LabelName },
                                    { label: 'Size Code / Oz', val: selected.SizeCode ? `${selected.SizeCode} / ${selected.SizeOz} oz` : null },
                                    { label: 'Butterfat', val: selected.ButterfatPct != null ? `${selected.ButterfatPct}%` : null },
                                    { label: 'Production Seq', val: selected.ProductionSequence },
                                    { label: 'Changeover', val: selected.ChangeoverFromPrev },
                                    { label: 'Baseline Daily', val: selected.BaselineDailyQty != null ? `${selected.BaselineDailyQty?.toLocaleString()} ${selected.UOM}` : null },
                                    { label: 'Holiday Qty', val: selected.HolidayQty != null ? `${selected.HolidayQty?.toLocaleString()} ${selected.UOM}` : null },
                                    { label: 'Notes', val: selected.Notes },
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
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PLANT CALENDAR
// ══════════════════════════════════════════════════════════════════════════════
const EVENT_TYPES = ['federal-holiday','shutdown','reduced-production','maintenance-window','special-event'];
const typeColor = { 'federal-holiday': '#ef4444', 'shutdown': '#64748b', 'reduced-production': '#f59e0b', 'maintenance-window': '#0ea5e9', 'special-event': '#8b5cf6' };

function CalendarTab({ plantId }) {
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
        if (d.success || d.id) { setMsg('Saved ✓'); setEditing(false); setForm({}); setSelected(null); load(); setTimeout(() => setMsg(''), 2000); }
    };

    const del = async (id) => {
        if (!window.confirm('Delete this calendar event?')) return;
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
                        <Plus size={13} /> Add Event
                    </button>
                    {msg && <span style={{ fontSize: '0.78rem', color: '#10b981' }}>{msg}</span>}
                </div>

                <div className="glass-card" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.72rem', position: 'sticky', top: 0, background: 'rgba(15,23,42,0.9)' }}>
                                {['Date','Label','Type','Capacity %',''].map(h => (
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
                                            <ActionBtn icon={Pencil} tip="Edit" color="#f59e0b" onClick={ev => { ev.stopPropagation(); startEdit(e); }} />
                                            <ActionBtn icon={Trash2} tip="Delete" color="#ef4444" onClick={ev => { ev.stopPropagation(); del(e.ID); }} />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {events.length === 0 && (
                                <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>No calendar events for {filterYear}.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {(editing || selected) && (
                <div className="glass-card" style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <DetailHeader
                        title={editing ? (form.ID ? 'Edit Event' : 'New Event') : selected?.Label}
                        color="#f59e0b" editing={editing}
                        onSave={save} onCancel={() => { setEditing(false); setForm({}); }}
                        onClose={() => { setSelected(null); setEditing(false); setForm({}); }}
                        extra={!editing && <ActionBtn icon={Pencil} tip="Edit" color="#f59e0b" onClick={() => startEdit(selected)} />}
                    />
                    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                        {editing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <FF label="Date" type="date" value={form.EventDate} onChange={ff('EventDate')} required />
                                <FF label="Label" value={form.Label} onChange={ff('Label')} required />
                                <FF label="Event Type" value={form.EventType} onChange={ff('EventType')} options={EVENT_TYPES} />
                                <FF label="Production Capacity %" type="number" value={form.ProductionCapacityPct} onChange={ff('ProductionCapacityPct')} />
                            </div>
                        ) : selected && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {[
                                    { label: 'Date', val: selected.EventDate },
                                    { label: 'Type', val: selected.EventType },
                                    { label: 'Capacity', val: `${selected.ProductionCapacityPct}%` },
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
                    <Upload size={20} /> Production Import
                </h2>
                <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)' }}>
                    {[['grid', 'Planning Grid'], ['pads', 'Pad Manager']].map(([v, lbl]) => (
                        <button key={v} onClick={() => setSubTab(v)}
                            style={{ padding: '5px 14px', fontSize: '0.78rem', fontWeight: subTab === v ? 700 : 400, background: subTab === v ? 'rgba(14,165,233,0.2)' : 'transparent', color: subTab === v ? '#0ea5e9' : '#64748b', border: 'none', cursor: 'pointer' }}>
                            {lbl}
                        </button>
                    ))}
                </div>
                {subTab === 'grid' && <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: '0.78rem', color: '#64748b' }}>Production Date</label>
                        <input type="date" value={prodDate} onChange={e => setProdDate(e.target.value)}
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '6px 12px', color: 'white', fontSize: '0.85rem' }} />
                    </div>
                    <button onClick={() => setShowPaste(p => !p)} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem' }}>
                        <Upload size={13} /> {showPaste ? 'Hide Import Panel' : 'Import Report'}
                    </button>
                    <button onClick={() => setAddModal(true)} className="btn-nav"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#8b5cf6' }}>
                        <Plus size={13} /> Add Line
                    </button>
                    {orders.length > 0 && <button onClick={applyPads} disabled={applying} className="btn-nav"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                        <Zap size={13} /> {applying ? 'Applying…' : 'Apply Pads'}
                    </button>}
                    <button onClick={() => setShowHistory(p => !p)} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', opacity: 0.7 }}>
                        <TrendingUp size={13} /> {showHistory ? 'Hide History' : 'Show History'}
                    </button>
                </>}
                {importMsg && <span style={{ fontSize: '0.78rem', color: '#10b981' }}>{importMsg}</span>}
                {batchInfo && <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 'auto' }}>Last import: {batchInfo.ImportDate?.slice(0, 16)} · {batchInfo.TotalLines} lines</span>}
            </div>

            {subTab === 'grid' && <>
                {showPaste && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ClipboardList size={16} style={{ color: '#0ea5e9' }} />
                            <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem' }}>Production Report Paste</span>
                            <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 'auto' }}>AS400 · JDE · SAP · fixed-width</span>
                        </div>
                        <textarea value={rawText} onChange={e => setRawText(e.target.value)}
                            placeholder={"Paste your production report here...\n\n• AS400 / iSeries fixed-width (Product# col 17, Size col 30, Desc col 36, Label col 55, Qty col 65+)\n• JDE Enterprise One CSV\n• SAP PP production order flat file"}
                            style={{ width: '100%', height: 160, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 12, color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <button onClick={handleParse} disabled={parsing || !rawText.trim()} className="btn-nav"
                                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#0ea5e9' }}>
                                <RefreshCw size={13} /> {parsing ? 'Parsing…' : 'Parse & Preview'}
                            </button>
                            {preview && <button onClick={handleImport} disabled={importing} className="btn-nav"
                                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
                                <Upload size={13} /> {importing ? 'Importing…' : `Import ${preview.summary.totalLines} Lines`}
                            </button>}
                            {rawText && <button onClick={() => { setRawText(''); setPreview(null); }} className="btn-nav"><X size={13} /> Clear</button>}
                        </div>
                        {preview && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <Badge color="#0ea5e9">{preview.summary.totalLines} lines</Badge>
                                <Badge color="#10b981">{preview.summary.totalUnits?.toLocaleString()} units</Badge>
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
                        <Badge color="#0ea5e9">{orders.length} SKUs</Badge>
                        <Badge color="#f59e0b">Ordered: {totalOrdered.toLocaleString()}</Badge>
                        <Badge color="#10b981">Final Plan: {totalFinal.toLocaleString()}</Badge>
                        {cutCount > 0 && <Badge color="#ef4444">{cutCount} Cut</Badge>}
                        {addCount > 0 && <Badge color="#8b5cf6">{addCount} Added</Badge>}
                        <button onClick={() => window.triggerTrierPrint?.('production-orders', { date: prodDate, orders, plantId })}
                            className="btn-nav" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem' }}>
                            <Printer size={13} /> Print Plan
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
                                <Badge color={secColor}>{sOrders.length} lines</Badge>
                                <span style={{ color: '#64748b', fontSize: '0.78rem', marginLeft: 4 }}>Final: {secTotal.toLocaleString()} units</span>
                            </div>
                            {!isCollapsed && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', minWidth: showHistory ? 900 : 720 }}>
                                        <thead>
                                            <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.7rem' }}>
                                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Prod#</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Size</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Description</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Label</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Ordered</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Beg Inv</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Pad</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Final</th>
                                                {showHistory && <th style={{ padding: '6px 8px', textAlign: 'right', color: '#f59e0b' }}>4wk Avg</th>}
                                                {showHistory && <th style={{ padding: '6px 8px', textAlign: 'right', color: '#8b5cf6' }}>Sug Pad</th>}
                                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Status</th>
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
                                                                    {!isCut && <ActionBtn icon={Pencil} tip="Edit inv & pads" color="#f59e0b" onClick={() => startEdit(o.ID, o)} />}
                                                                    {!isCut && <ActionBtn icon={Trash2} tip="Cut this line" color="#ef4444" onClick={() => { setCutModal(o); setCutReason(''); setCutQty(''); }} />}
                                                                    {isCut && <ActionBtn icon={RefreshCw} tip="Restore line" color="#10b981" onClick={() => handleRestore(o.ID)} />}
                                                                    {isAdded && <ActionBtn icon={X} tip="Delete added line" color="#ef4444" onClick={() => handleDeleteLine(o.ID)} />}
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
                        <div>No orders imported for {prodDate}.</div>
                        <button onClick={() => setShowPaste(true)} className="btn-nav" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Upload size={14} /> Import Production Report
                        </button>
                    </div>
                )}

                {batches.length > 0 && (
                    <div>
                        <div style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Import History</div>
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
                            <strong style={{ color: '#f1f5f9' }}>Day-of-week pads</strong> — standing safety buffers per SKU per day.
                        </div>
                        <button onClick={loadPads} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', marginLeft: 'auto' }}>
                            <RefreshCw size={13} /> Refresh
                        </button>
                        {padMsg && <span style={{ fontSize: '0.78rem', color: '#10b981' }}>{padMsg}</span>}
                    </div>

                    {padSuggestions.length > 0 && (
                        <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: '12px 16px' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b5cf6', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📊 Suggested Pads — 4-Week History</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {padSuggestions.map(s => (
                                    <div key={`${s.prod}|${s.size}`}
                                        style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 8, padding: '6px 10px', fontSize: '0.75rem', cursor: 'pointer' }}
                                        onClick={() => { setPadEdit('new'); setPadForm({ prodNumber: s.prod, sizeCode: s.size, labelCode: s.label, padMon: s.suggestedPad, padTue: s.suggestedPad, padWed: s.suggestedPad, padThu: s.suggestedPad, padFri: s.suggestedPad, padSat: Math.round(s.suggestedPad * 0.6), padSun: 0 }); }}>
                                        <span style={{ color: '#8b5cf6', fontWeight: 700 }}>{s.prod} {s.size}</span>
                                        <span style={{ color: '#64748b', marginLeft: 6 }}>avg {s.avg} · max {s.max}</span>
                                        <span style={{ color: '#10b981', marginLeft: 6, fontWeight: 600 }}>+{s.suggestedPad} suggested</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {padEdit !== null && (
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: 16 }}>
                            <div style={{ fontWeight: 600, color: '#f59e0b', marginBottom: 12, fontSize: '0.88rem' }}>{padEdit === 'new' ? 'New Pad Rule' : 'Edit Pad Rule'}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 10, marginBottom: 12 }}>
                                <FF label="Prod#" value={padForm.prodNumber} onChange={v => setPadForm(p => ({ ...p, prodNumber: v }))} />
                                <FF label="Size" value={padForm.sizeCode} onChange={v => setPadForm(p => ({ ...p, sizeCode: v }))} />
                                <FF label="Label" value={padForm.labelCode} onChange={v => setPadForm(p => ({ ...p, labelCode: v }))} />
                                {DAYS.map((d, i) => <FF key={d} label={d} type="number" value={padForm[DOW_KEYS[i]] ?? 0} onChange={v => setPadForm(p => ({ ...p, [DOW_KEYS[i]]: parseInt(v) || 0 }))} />)}
                                <div style={{ gridColumn: '1/-1' }}><FF label="Notes" value={padForm.notes} onChange={v => setPadForm(p => ({ ...p, notes: v }))} /></div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={savePad} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
                                    <Save size={13} /> Save Pad Rule
                                </button>
                                <button onClick={() => { setPadEdit(null); setPadForm({}); }} className="btn-nav"><X size={13} /> Cancel</button>
                            </div>
                        </div>
                    )}

                    <button onClick={() => { setPadEdit('new'); setPadForm({}); }} className="btn-nav"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content', fontSize: '0.8rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                        <Plus size={13} /> Add Pad Rule
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
                                    ? <tr><td colSpan={12} style={{ padding: '30px', textAlign: 'center', color: '#475569' }}>No pad rules defined.</td></tr>
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
                                                    <ActionBtn icon={Pencil} tip="Edit" color="#f59e0b" onClick={() => { setPadEdit(pad.ID); setPadForm({ prodNumber: pad.ProdNumber, sizeCode: pad.SizeCode, labelCode: pad.LabelCode, padMon: pad.PadMon, padTue: pad.PadTue, padWed: pad.PadWed, padThu: pad.PadThu, padFri: pad.PadFri, padSat: pad.PadSat, padSun: pad.PadSun, notes: pad.Notes }); }} />
                                                    <ActionBtn icon={Trash2} tip="Delete" color="#ef4444" onClick={async () => { await IMPORT_API(`/pads/${pad.ID}`, { method: 'DELETE' }); loadPads(); }} />
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
                        <DetailHeader title={<><Plus size={18} /> Add Manual Order Line</>} color="#8b5cf6" editing onSave={handleAddLine} onCancel={() => setAddModal(false)} onClose={() => setAddModal(false)} />
                        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <FF label="Prod# / SKU Code" value={addForm.prodNumber} onChange={v => setAddForm(p => ({ ...p, prodNumber: v }))} required />
                            <FF label="Size Code" value={addForm.sizeCode} onChange={v => setAddForm(p => ({ ...p, sizeCode: v }))} />
                            <div style={{ gridColumn: '1/-1' }}><FF label="Description" value={addForm.description} onChange={v => setAddForm(p => ({ ...p, description: v }))} /></div>
                            <FF label="Label Code" value={addForm.labelCode} onChange={v => setAddForm(p => ({ ...p, labelCode: v }))} />
                            <FF label="Section" value={addForm.section} onChange={v => setAddForm(p => ({ ...p, section: v }))} options={['MANUFACTURED', 'PURCHASED']} />
                            <FF label="Quantity" type="number" value={addForm.qty} onChange={v => setAddForm(p => ({ ...p, qty: v }))} required />
                            <FF label="Pad (safety buffer)" type="number" value={addForm.padQty} onChange={v => setAddForm(p => ({ ...p, padQty: v }))} />
                            <div style={{ gridColumn: '1/-1' }}><FF label="Reason / Notes" value={addForm.reason} onChange={v => setAddForm(p => ({ ...p, reason: v }))} /></div>
                        </div>
                    </div>
                </div>
            )}

            {cutModal && (
                <div className="modal-overlay" onClick={() => setCutModal(null)}>
                    <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <DetailHeader title={<><Trash2 size={18} /> Cut Order Line</>} color="#ef4444" editing onSave={handleCut} onCancel={() => setCutModal(null)} onClose={() => setCutModal(null)} />
                        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem', color: '#e2e8f0' }}>
                                <strong style={{ color: '#ef4444' }}>{cutModal.SizeCode} {cutModal.Description}</strong> — {(cutModal.TotQty || 0).toLocaleString()} units ordered
                            </div>
                            <div>
                                <label style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Cut to Qty (blank = full cut to 0)</label>
                                <input type="number" value={cutQty} onChange={e => setCutQty(e.target.value)} placeholder="0 = full cut"
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Reason *</label>
                                <input value={cutReason} onChange={e => setCutReason(e.target.value)} placeholder="e.g. Customer cancelled, inventory covers…"
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

const PLANT_API = (path, o = {}) => fetch(`/api/plant-setup${path}`, {
    ...o,
    headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}`, 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Plant_1', ...o.headers },
});

function ApiIntegrationsTab({ plantId }) {
    const [configs, setConfigs]       = useState({});
    const [expanded, setExpanded]     = useState(null);
    const [form, setForm]             = useState({});
    const [testing, setTesting]       = useState(null);
    const [testResult, setTestResult] = useState({});
    const [saving, setSaving]         = useState(null);
    const [saveMsg, setSaveMsg]       = useState({});

    useEffect(() => {
        PLANT_API('/integrations').then(r => r.json()).then(d => setConfigs(typeof d === 'object' ? d : {})).catch(() => {});
    }, [plantId]);

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
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem', color: '#0ea5e9' }}><Link size={20} /> API Integrations</h2>
                <span style={{ fontSize: '0.78rem', color: '#475569' }}>Configure connections to external dairy plant systems</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#475569' }}>
                    <Wifi size={12} color="#10b981" /> Credentials stored locally — no data leaves your plant network
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
                                    {configured ? <Badge color="#10b981"><CheckCircle size={10} style={{ marginRight: 3 }} />CONFIGURED</Badge> : <Badge color="#475569">NOT SET</Badge>}
                                    {isOpen ? <ChevronDown size={16} style={{ color: '#64748b' }} /> : <ChevronRight size={16} style={{ color: '#64748b' }} />}
                                </div>
                            </div>
                            {isOpen && (
                                <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10, marginTop: 14 }}>
                                        <FF label="Host / Endpoint URL" value={form.host} onChange={v => setForm(p => ({ ...p, host: v }))} placeholder="192.168.x.x or https://…" />
                                        <FF label="Port" value={form.port} onChange={v => setForm(p => ({ ...p, port: v }))} placeholder="21, 8080, 4840…" />
                                        <FF label="Protocol" value={form.protocol} onChange={v => setForm(p => ({ ...p, protocol: v }))} options={intg.protocols} />
                                        <FF label="Username" value={form.username} onChange={v => setForm(p => ({ ...p, username: v }))} />
                                        <FF label="Password / Secret" type="password" value={form.password} onChange={v => setForm(p => ({ ...p, password: v }))} />
                                        <FF label="API Key / Token" value={form.apiKey} onChange={v => setForm(p => ({ ...p, apiKey: v }))} />
                                        <FF label="Database / Path" value={form.database} onChange={v => setForm(p => ({ ...p, database: v }))} />
                                        <div style={{ gridColumn: '1/-1' }}><FF label="Notes / Additional Config" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} /></div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                                        <button onClick={() => save(intg.id)} disabled={saving === intg.id} className="btn-nav"
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
                                            <Save size={13} /> {saving === intg.id ? 'Saving…' : 'Save Config'}
                                        </button>
                                        <button onClick={() => testConn(intg.id)} disabled={testing === intg.id} className="btn-nav"
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: `${intg.color}18`, border: `1px solid ${intg.color}44`, color: intg.color }}>
                                            <Wifi size={13} /> {testing === intg.id ? 'Testing…' : 'Test Connection'}
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
