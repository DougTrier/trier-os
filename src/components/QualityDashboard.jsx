// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Product Quality & Loss Dashboard
 * ==============================================
 * Plant-level quality assurance workspace tracking product loss events
 * and laboratory test results. Feeds the OpEx shrink card and compliance reports.
 * Connects to /api/quality endpoints (server/routes/product-quality.js).
 *
 * TABS:
 *   Product Loss Log  — Log and review drain/spill/startup/quality-reject events
 *                       Fields: LossDate, LossType, Quantity, Unit, CauseCode, MeterID
 *   Lab Results       — Cryoscopy (water adulteration detection) and bacteriology panel
 *                       Cryoscope threshold: −0.525°H; pass/fail auto-calculated
 *                       Bacteria: SCC, total plate count, coliform per regulatory limits
 *   Quality Summary   — KPI rollup: total loss volume, loss value, pass rates, trends
 *                       Data feeds the OpEx shrink card in the Analytics dashboard
 *
 * CRYOSCOPE MATH: Normal = −0.540°H. Water added % = ((−0.540 − reading) / 0.540) × 100.
 *   Any reading ≥ −0.525°H triggers automatic FAIL and generates a quality alert.
 *
 * PRINT: Quality report via PrintEngine including loss log and lab results summary.
 * @param {string} plantId - Current plant identifier
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    Droplets, FlaskConical, Activity, PlusCircle,
    RefreshCw, CheckCircle2, XCircle, Thermometer,
    ChevronDown, ChevronUp, Printer
} from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import ActionBar from './ActionBar.jsx';

// ── Shared helpers ────────────────────────────────────────────────────────────
const authHeaders = (plantId) => ({
    'Content-Type': 'application/json',
    'x-plant-id': plantId || localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
});
const API = (path, plantId, opts = {}) => fetch(`/api${path}`, { headers: authHeaders(plantId), ...opts });
const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtNum = (n, dec = 3) => n == null ? '—' : Number(n).toFixed(dec);

const LOSS_TYPES = ['Drain to Floor', 'Startup Purge', 'Equipment Failure', 'Spill', 'CIP Overflow', 'Expired Hold', 'Separator Loss', 'Evaporator Loss', 'Other'];
const AREAS = ['Receiving', 'Pasteurizer', 'Separator', 'Processing', 'Evaporator', 'Packaging', 'CIP', 'Storage Silos', 'Shipping', 'Other'];
const PRODUCTS = ['Whole Milk', 'Skim Milk', '2% Milk', 'Cream', 'Half & Half', 'Butter', 'Whey', 'Condensed Milk', 'CIP Solution', 'Other'];
const SAMPLE_TYPES = ['Raw Incoming', 'Silo', 'Pasteurized', 'Final Product', 'Environment', 'CIP Rinse'];
const ACTIONS = ['None', 'Retest', 'Hold Tank', 'Dump Load', 'Regulatory Report', 'Quarantine'];
const CRYO_THRESHOLD = -0.525;
const CRYO_NORMAL = -0.540;

function cryoCalc(reading) {
    if (!reading) return { waterPct: null, pass: null };
    const r = parseFloat(reading);
    const waterPct = Math.max(0, ((CRYO_NORMAL - r) / Math.abs(CRYO_NORMAL)) * 100);
    return { waterPct: Math.round(waterPct * 100) / 100, pass: r <= CRYO_THRESHOLD };
}

// ── Shared field styles ───────────────────────────────────────────────────────
const inputStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f1f5f9', fontSize: '0.82rem', width: '100%' };
const labelStyle = { fontSize: '0.68rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' };
const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 1 — Product Loss Log
// ═══════════════════════════════════════════════════════════════════════════════
function LossEntryForm({ plantId, existingLog, onSaved, onCancel }) {
    const { t } = useTranslation();
    const isNew = !existingLog;
    const [isEditing, setIsEditing] = useState(isNew);
    const [form, setForm] = useState(existingLog || {
        LogDate: new Date().toISOString().split('T')[0],
        Shift: 'A', Area: '', ProductType: '', LossType: '',
        Quantity: '', Unit: 'gal', UnitValue: '',
        MeterID: '', MeterReading: '', WoID: '', Notes: '',
        EnteredBy: localStorage.getItem('currentUser') || '',
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const totalValue = (parseFloat(form.Quantity) || 0) * (parseFloat(form.UnitValue) || 0);

    const submit = async () => {
        if (!form.LossType) return window.trierToast?.error(t('quality.lossTypeRequired', 'Loss Type is required'));
        setSaving(true);
        try {
            const targetPlantId = existingLog?._plantId || plantId;
            const method = isNew ? 'POST' : 'PUT';
            const url = isNew ? `/quality/loss-log?plantId=${targetPlantId}` : `/quality/loss-log/${existingLog.ID}?plantId=${targetPlantId}`;
            const r = await API(url, targetPlantId, { method, body: JSON.stringify(form) });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            setSaved(true);
            window.trierToast?.success(isNew ? t('quality.productLossLoggedSuccess', 'Product loss logged successfully') : 'Product loss updated successfully');
            setTimeout(() => { setSaved(false); onSaved?.(); }, 1500);
            if (isNew) setForm(f => ({ ...f, Quantity: '', UnitValue: '', MeterReading: '', WoID: '', Notes: '', LossType: '', Area: '' }));
            else setIsEditing(false);
        } catch (e) { window.trierToast?.error('Error: ' + e.message); }
        setSaving(false);
    };

    const dynInputStyle = { 
        ...inputStyle, 
        background: isEditing ? 'rgba(255,255,255,0.06)' : 'transparent',
        border: isEditing ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
        pointerEvents: isEditing ? 'auto' : 'none'
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <ActionBar
                title={isNew ? t('quality.logNewProductLossEvent', 'Log New Product Loss Event') : t('quality.productLossEventDetail', 'Product Loss Event Details')}
                onClose={onCancel}
                onCancel={isNew ? onCancel : () => { setIsEditing(false); setForm(existingLog); }}
                isEditing={isEditing}
                onEdit={() => setIsEditing(true)}
                onSave={submit}
                onPrint={!isNew ? () => window.triggerTrierPrint('loss-event', { ...form, ID: existingLog.ID }) : undefined}
                saving={saving}
                showPrint={true}
                showEdit={!isNew}
                saved={saved}
            />
            <div className="glass-card" style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12 }}>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.logDate', 'Log Date')}</label><input type="date" value={form.LogDate} onChange={e => set('LogDate', e.target.value)} style={dynInputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.shift', 'Shift')}</label>
                    <select value={form.Shift} onChange={e => set('Shift', e.target.value)} style={dynInputStyle}>
                        {['A', 'B', 'C', '1st', '2nd', '3rd', 'Other'].map(s => <option key={s}>{s}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.area', 'Area')}</label>
                    <select value={form.Area} onChange={e => set('Area', e.target.value)} style={dynInputStyle}>
                        <option value="">{t('quality.select', '-- Select --')}</option>
                        {AREAS.map(a => <option key={a} value={a}>{t(`quality.area.${a.replace(/\s+/g, '_')}`, a)}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.productType', 'Product Type')}</label>
                    <select value={form.ProductType} onChange={e => set('ProductType', e.target.value)} style={dynInputStyle}>
                        <option value="">{t('quality.select', '-- Select --')}</option>
                        {PRODUCTS.map(p => <option key={p} value={p}>{t(`quality.product.${p.replace(/\s+/g, '_')}`, p)}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.lossType', 'Loss Type')}</label>
                    <select value={form.LossType} onChange={e => set('LossType', e.target.value)} style={{ ...dynInputStyle, color: form.LossType ? '#f59e0b' : '#64748b' }}>
                        <option value="">{t('quality.select', '-- Select --')}</option>
                        {LOSS_TYPES.map(l => <option key={l} value={l}>{t(`quality.lossType.${l.replace(/\s+/g, '_')}`, l)}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}>
                    <label style={labelStyle}>{t('quality.quantityLost', 'Quantity Lost')}</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <input type="number" value={form.Quantity ?? ''} onChange={e => set('Quantity', e.target.value)} style={dynInputStyle} placeholder="100..." />
                        <select value={form.Unit} onChange={e => set('Unit', e.target.value)} style={{ ...dynInputStyle, width: '70px', padding: '8px 4px' }}>
                            {['gal', 'lbs', 'kg', 'liters'].map(u => <option key={u}>{u}</option>)}
                        </select>
                    </div>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.estUnitValue', 'Est. Unit Value ($)')}</label><input type="number" step="0.01" value={form.UnitValue ?? ''} onChange={e => set('UnitValue', e.target.value)} style={dynInputStyle} placeholder="2.50" /></div>
                {totalValue > 0 && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{t('quality.estimatedLoss', 'Estimated Loss: ')}</span>
                        <span style={{ fontWeight: 800, color: '#ef4444', fontSize: '1.05rem' }}>{fmt(totalValue)}</span>
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginTop: 14 }}>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.meterID', 'Associated Meter ID')}</label><input placeholder="FM-101..." value={form.MeterID ?? ''} onChange={e => set('MeterID', e.target.value)} style={dynInputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.meterReading', 'Meter Reading (optional)')}</label><input type="number" value={form.MeterReading ?? ''} onChange={e => set('MeterReading', e.target.value)} style={dynInputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.workOrderID', 'Work Order (if applicable)')}</label><input placeholder="WO-..." value={form.WoID ?? ''} onChange={e => set('WoID', e.target.value)} style={dynInputStyle} /></div>
            </div>

            <div style={{ ...fieldStyle, marginTop: 14 }}>
                <label style={labelStyle}>{t('quality.eventNotes', 'Event Notes / Root Cause')}</label>
                <textarea rows={3} value={form.Notes ?? ''} onChange={e => set('Notes', e.target.value)} style={{ ...dynInputStyle, resize: 'vertical' }} />
            </div>
        </div>
        </div>
    );
}

function LossLogTable({ rows, loading, onSelect, isAllSites }) {
    const { t } = useTranslation();
    if (loading) return <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}><RefreshCw size={18} className="spinning" /></div>;
    if (!rows?.length) return <div style={{ color: '#475569', fontStyle: 'italic', padding: '24px 0', textAlign: 'center' }}>{t('quality.noProductLossEntries', 'No product loss entries logged yet for this plant.')}</div>;
    return (
        <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
            <table className="data-table">
                <thead><tr>
                    {isAllSites && <th>{t('quality.colLocation', 'Location')}</th>}
                    {[
                        t('quality.colDate', 'Date'),
                        t('quality.colShift', 'Shift'),
                        t('quality.colArea', 'Area'),
                        t('quality.colProduct', 'Product'),
                        t('quality.colLossType', 'Loss Type'),
                        t('quality.colQty', 'Qty'),
                        t('quality.colDollarValue', '$ Value'),
                        t('quality.colMeterID', 'Meter ID'),
                        t('quality.colWONumber', 'WO#'),
                        t('quality.colNotes', 'Notes'),
                    ].map(h => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.ID} onClick={() => onSelect && onSelect(r)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
                            {isAllSites && <td><span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem' }}>{(r._plantId || '—').replace(/_/g, ' ')}</span></td>}
                            <td>{r.LogDate}</td>
                            <td>{r.Shift || '—'}</td>
                            <td>{r.Area ? t(`quality.area.${r.Area.replace(/\s+/g, '_')}`, r.Area) : '—'}</td>
                            <td>{r.ProductType ? t(`quality.product.${r.ProductType.replace(/\s+/g, '_')}`, r.ProductType) : '—'}</td>
                            <td style={{ color: '#f59e0b', fontWeight: 600 }}>{r.LossType ? t(`quality.lossType.${r.LossType.replace(/\s+/g, '_')}`, r.LossType) : '—'}</td>
                            <td>{r.Quantity} {r.Unit}</td>
                            <td style={{ color: r.TotalValue > 0 ? '#ef4444' : '#475569', fontWeight: 700 }}>{r.TotalValue > 0 ? fmt(r.TotalValue) : '—'}</td>
                            <td>{r.MeterID || '—'}</td>
                            <td>{r.WoID || '—'}</td>
                            <td style={{ color: '#64748b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.Notes || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ProductLossTab({ plantId }) {
    const { t } = useTranslation();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const d = await API(`/quality/loss-log?plantId=${plantId}`, plantId).then(r => r.json());
            setRows(Array.isArray(d.rows) ? d.rows : []);
        } catch {}
        setLoading(false);
    }, [plantId]);

    const isAllSites = (plantId || '').toLowerCase().includes('all');

    useEffect(() => { load(); }, [load]);

    if (showForm || selectedLog) {
        return <LossEntryForm plantId={plantId} existingLog={selectedLog} onSaved={() => { load(); setShowForm(false); setSelectedLog(null); }} onCancel={() => { setShowForm(false); setSelectedLog(null); }} />;
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className="glass-card no-print" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem', color: 'var(--primary)' }}>
                    <Droplets size={20} /> {t('quality.productLossEventsLast90Days', 'Product Loss Events — Last 90 Days')}
                </h2>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-nav" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><RefreshCw size={14} /> {t('quality.refresh', 'Refresh')}</button>
                    {!isAllSites && (
                        <button className="btn-save" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <PlusCircle size={14} /> {t('quality.logLossEvent', 'Log Loss Event')}
                        </button>
                    )}
                </div>
            </div>
            <div className="glass-card" style={{ flex: 1, padding: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <LossLogTable rows={rows} loading={loading} onSelect={(r) => setSelectedLog(r)} isAllSites={isAllSites} />
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 2 — Lab Results
// ═══════════════════════════════════════════════════════════════════════════════
function LabResultForm({ plantId, existingLog, onSaved, onCancel }) {
    const { t } = useTranslation();
    const isNew = !existingLog;
    const [isEditing, setIsEditing] = useState(isNew);
    const [form, setForm] = useState(existingLog || {
        SampleDate: new Date().toISOString().split('T')[0],
        SampleID: '', SampleType: 'Raw Incoming', SourceTank: '',
        CryoReading: '', CryoAction: 'Accept', CryoLossValue: '',
        SPC: '', Coliform: '', LPC: '', PI: '', SoMatic: '',
        Listeria: 'ND', Salmonella: 'ND', DrugTest: 'Negative',
        FatPct: '', ProteinPct: '', LactosePct: '', SolidsNotFat: '',
        ActionRequired: 'None', EstLossValue: '',
        Notes: '', TestTech: localStorage.getItem('currentUser') || '',
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const cryo = form.CryoReading ? cryoCalc(form.CryoReading) : null;

    const submit = async () => {
        if (!form.SampleDate) return window.trierToast?.error(t('quality.sampleDateRequired', 'Sample Date is required'));
        setSaving(true);
        try {
            const targetPlantId = existingLog?._plantId || plantId;
            const method = isNew ? 'POST' : 'PUT';
            const url = isNew ? `/quality/lab-results?plantId=${targetPlantId}` : `/quality/lab-results/${existingLog.ID}?plantId=${targetPlantId}`;
            const r = await API(url, targetPlantId, { method, body: JSON.stringify(form) });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            setSaved(true);
            window.trierToast?.success(`${isNew ? t('quality.labResultSubmitted', 'Lab result submitted') : 'Lab result updated'} — ${d.overallPass ? t('quality.pass', 'PASS') : t('quality.fail', 'FAIL')}`);
            setTimeout(() => { setSaved(false); onSaved?.(); }, 1500);
            if (isNew) setForm(f => ({ ...f, SampleID: '', CryoReading: '', SPC: '', Coliform: '', Notes: '' }));
            else setIsEditing(false);
        } catch (e) { window.trierToast?.error('Error: ' + e.message); }
        setSaving(false);
    };

    const dynInputStyle = { 
        ...inputStyle, 
        background: isEditing ? 'rgba(255,255,255,0.06)' : 'transparent',
        border: isEditing ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
        pointerEvents: isEditing ? 'auto' : 'none'
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <ActionBar
                title={isNew ? t('quality.submitNewLabResult', 'Submit New Lab Result') : t('quality.labResultDetail', 'Lab Result Details')}
                onClose={onCancel}
                onCancel={isNew ? onCancel : () => { setIsEditing(false); setForm(existingLog); }}
                isEditing={isEditing}
                onEdit={() => setIsEditing(true)}
                onSave={submit}
                onPrint={!isNew ? () => window.triggerTrierPrint('lab-result', { ...form, ID: existingLog.ID, pass: existingLog.OverallPass ? 'PASS' : 'FAIL' }) : undefined}
                saving={saving}
                showPrint={true}
                showEdit={!isNew}
                saved={saved}
            />
            <div className="glass-card" style={{ padding: 20, flex: 1, overflowY: 'auto' }}>

            {/* Basic */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 12 }}>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.sampleDate', 'Sample Date')}</label><input type="date" value={form.SampleDate} onChange={e => set('SampleDate', e.target.value)} style={dynInputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.sampleID', 'Sample ID')}</label><input placeholder="LAB-2026-001" value={form.SampleID} onChange={e => set('SampleID', e.target.value)} style={dynInputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.sampleType', 'Sample Type')}</label>
                    <select value={form.SampleType} onChange={e => set('SampleType', e.target.value)} style={dynInputStyle}>
                        {SAMPLE_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.sourceTankLine', 'Source Tank/Line')}</label><input placeholder="Silo-1, Tank-3..." value={form.SourceTank} onChange={e => set('SourceTank', e.target.value)} style={dynInputStyle} /></div>
            </div>

            {/* Cryoscopy */}
            <div style={{ marginTop: 14, background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.22)', borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Thermometer size={15} color="#8b5cf6" />
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('quality.cryoscopyFreezingPointHeader', 'Cryoscopy — Freezing Point (Water Adulteration Detection)')}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto 1fr', gap: 12, alignItems: 'end' }}>
                    <div style={fieldStyle}>
                        <label style={labelStyle}>{t('quality.cryoReadingDegH', 'Cryo Reading (°H)')}</label>
                        <input type="number" step="0.001" placeholder="-0.530" value={form.CryoReading ?? ''}
                            onChange={e => set('CryoReading', e.target.value)}
                            style={{ ...dynInputStyle, width: 130, border: cryo ? (cryo.pass ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(239,68,68,0.4)') : isEditing ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent' }} />
                        <span style={{ fontSize: '0.62rem', color: '#475569' }}>{t('quality.cryoNormalRange', 'Normal: −0.530 to −0.550 °H')}</span>
                    </div>
                    {cryo && <>
                        <div style={{ background: cryo.pass ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.12)', border: `1px solid ${cryo.pass ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, padding: '10px 16px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.62rem', color: '#64748b', marginBottom: 4 }}>{t('quality.result', 'RESULT')}</div>
                            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: cryo.pass ? '#10b981' : '#ef4444' }}>{cryo.pass ? t('quality.pass', 'PASS') : t('quality.fail', 'FAIL')}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 16px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.62rem', color: '#64748b', marginBottom: 4 }}>{t('quality.estWaterAdded', 'EST. WATER ADDED')}</div>
                            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: cryo.waterPct > 3 ? '#ef4444' : cryo.waterPct > 1 ? '#f59e0b' : '#10b981' }}>{cryo.waterPct}%</div>
                        </div>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>{t('quality.action', 'Action')}</label>
                            <select value={form.CryoAction} onChange={e => set('CryoAction', e.target.value)} style={dynInputStyle}>
                                {ACTIONS.map(a => <option key={a}>{a}</option>)}
                            </select>
                        </div>
                    </>}
                </div>
                {cryo && !cryo.pass && (
                    <div style={{ marginTop: 10, background: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#fca5a5' }}>
                        ⚠ {t('quality.cryoFailWarning', 'Freezing point')} {form.CryoReading}°H {t('quality.cryoExceedsThreshold', 'exceeds −0.525°H threshold. Estimated')} {cryo.waterPct}% {t('quality.addedWater', 'added water.')}.
                        {cryo.waterPct > 3 && ' ' + t('quality.cryoPMOLimit', 'This exceeds PMO limit — regulatory reporting required (FDA 21 CFR Part 131).')}
                    </div>
                )}
                <div style={{ marginTop: 10 }}>
                    <div style={fieldStyle}>
                        <label style={labelStyle}>{t('quality.estLossValueIfRejected', 'Est. Loss Value if Rejected ($)')}</label>
                        <input type="number" placeholder="0" value={form.CryoLossValue ?? ''} onChange={e => set('CryoLossValue', e.target.value)} style={{ ...dynInputStyle, maxWidth: 200 }} />
                    </div>
                </div>
            </div>

            {/* Bacteriology */}
            <div style={{ marginTop: 14, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🦠 {t('quality.bacteriologyPanel', 'Bacteriology Panel')}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 10 }}>
                    {[
                        { k: 'SPC', label: 'SPC (CFU/mL)', limit: '<100,000', warn: 100000 },
                        { k: 'Coliform', label: 'Coliform (CFU/mL)', limit: '<10', warn: 10 },
                        { k: 'LPC', label: 'LPC (CFU/mL)', limit: '<200', warn: 200 },
                        { k: 'PI', label: 'PI Count (CFU/mL)', limit: '<100,000', warn: 100000 },
                        { k: 'SoMatic', label: 'SCC (cells/mL)', limit: '<750,000', warn: 750000 },
                    ].map(({ k, label, limit, warn }) => {
                        const val = parseInt(form[k]) || 0;
                        const isHigh = form[k] && val >= warn;
                        return (
                            <div key={k} style={fieldStyle}>
                                <label style={labelStyle}>{label}</label>
                                <input type="number" value={form[k] ?? ''} onChange={e => set(k, e.target.value)}
                                    style={{ ...dynInputStyle, border: isHigh ? '1px solid rgba(239,68,68,0.5)' : dynInputStyle.border }} />
                                <span style={{ fontSize: '0.6rem', color: isHigh ? '#ef4444' : '#475569' }}>{t('quality.limit', 'Limit:')} {limit}{isHigh ? ' ⚠ ' + t('quality.exceeds', 'EXCEEDS') : ''}</span>
                            </div>
                        );
                    })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 12 }}>
                    <div style={fieldStyle}><label style={labelStyle}>{t('quality.listeria', 'Listeria')}</label>
                        <select value={form.Listeria} onChange={e => set('Listeria', e.target.value)} style={{ ...dynInputStyle, color: form.Listeria !== 'ND' ? '#ef4444' : dynInputStyle.color }}>
                            {['ND', 'Positive - Retest', 'Positive - Confirmed', 'Environmental'].map(o => <option key={o}>{o}</option>)}
                        </select>
                    </div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('quality.salmonella', 'Salmonella')}</label>
                        <select value={form.Salmonella} onChange={e => set('Salmonella', e.target.value)} style={{ ...dynInputStyle, color: form.Salmonella !== 'ND' ? '#ef4444' : dynInputStyle.color }}>
                            {['ND', 'Positive - Retest', 'Positive - Confirmed'].map(o => <option key={o}>{o}</option>)}
                        </select>
                    </div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('quality.drugResidueBetaStar', 'Drug Residue (Beta Star)')}</label>
                        <select value={form.DrugTest} onChange={e => set('DrugTest', e.target.value)} style={{ ...dynInputStyle, color: form.DrugTest !== 'Negative' ? '#ef4444' : dynInputStyle.color }}>
                            {['Negative', 'Positive - Penicillin', 'Positive - Other', 'Retest Required'].map(o => <option key={o}>{o}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Composition */}
            <div style={{ marginTop: 14, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981', marginBottom: 10, textTransform: 'uppercase' }}>{t('quality.compositionOptional', 'Composition (optional)')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {[['FatPct','Fat %'],['ProteinPct','Protein %'],['LactosePct','Lactose %'],['SolidsNotFat','SNF %']].map(([k,l]) => (
                        <div key={k} style={fieldStyle}><label style={labelStyle}>{l}</label><input type="number" step="0.01" value={form[k] ?? ''} onChange={e => set(k, e.target.value)} style={dynInputStyle} /></div>
                    ))}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 14 }}>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.overallActionRequired', 'Overall Action Required')}</label>
                    <select value={form.ActionRequired} onChange={e => set('ActionRequired', e.target.value)} style={dynInputStyle}>
                        {ACTIONS.map(a => <option key={a}>{a}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.estLossValueDollar', 'Est. Loss Value ($)')}</label><input type="number" value={form.EstLossValue ?? ''} onChange={e => set('EstLossValue', e.target.value)} style={dynInputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.labTechnician', 'Lab Technician')}</label><input value={form.TestTech} onChange={e => set('TestTech', e.target.value)} style={dynInputStyle} /></div>
            </div>
            <div style={{ ...fieldStyle, marginTop: 12 }}>
                <label style={labelStyle}>{t('quality.notes', 'Notes')}</label>
                <textarea value={form.Notes ?? ''} onChange={e => set('Notes', e.target.value)} rows={2} style={{ ...dynInputStyle, resize: 'vertical' }} />
            </div>
        </div>
        </div>
    );
}

function LabTable({ rows, loading, onSelect, isAllSites }) {
    const { t } = useTranslation();
    if (loading) return <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}><RefreshCw size={18} className="spinning" /></div>;
    if (!rows?.length) return <div style={{ color: '#475569', fontStyle: 'italic', padding: '24px 0', textAlign: 'center' }}>{t('quality.noLabResults', 'No lab results logged yet for this plant.')}</div>;
    return (
        <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
            <table className="data-table">
                <thead><tr>
                    {isAllSites && <th>{t('quality.colLocation', 'Location')}</th>}
                    {[
                        t('quality.colDate', 'Date'),
                        t('quality.colSampleID', 'Sample ID'),
                        t('quality.colType', 'Type'),
                        t('quality.colTank', 'Tank'),
                        t('quality.colCryoDegH', 'Cryo °H'),
                        t('quality.colWaterPct', 'Water%'),
                        t('quality.colCryo', 'Cryo'),
                        t('quality.colSPC', 'SPC'),
                        t('quality.colColiform', 'Coliform'),
                        t('quality.colDrug', 'Drug'),
                        t('quality.colOverall', 'Overall'),
                        t('quality.colAction', 'Action'),
                        t('quality.colDollarRisk', '$ Risk'),
                    ].map(h => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                    {rows.map(r => {
                        const pass = r.OverallPass === 1;
                        return (
                            <tr key={r.ID} onClick={() => onSelect && onSelect(r)} style={{ cursor: onSelect ? 'pointer' : 'default' }} className="hover-row">
                                {isAllSites && <td><span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem' }}>{(r._plantId || '—').replace(/_/g, ' ')}</span></td>}
                                <td>{r.SampleDate}</td>
                                <td>{r.SampleID || '—'}</td>
                                <td>{r.SampleType || '—'}</td>
                                <td>{r.SourceTank || '—'}</td>
                                <td style={{ color: r.CryoPass === 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>{r.CryoReading != null ? fmtNum(r.CryoReading) : '—'}</td>
                                <td style={{ color: r.CryoWaterPct > 3 ? '#ef4444' : r.CryoWaterPct > 1 ? '#f59e0b' : '#10b981' }}>{r.CryoWaterPct != null ? r.CryoWaterPct + '%' : '—'}</td>
                                <td>{r.CryoPass == null ? '—' : r.CryoPass ? <CheckCircle2 size={14} color="#10b981" /> : <XCircle size={14} color="#ef4444" />}</td>
                                <td style={{ color: r.SPC >= 100000 ? '#ef4444' : '#94a3b8' }}>{r.SPC != null ? r.SPC.toLocaleString() : '—'}</td>
                                <td style={{ color: r.Coliform >= 10 ? '#ef4444' : '#94a3b8' }}>{r.Coliform != null ? r.Coliform.toLocaleString() : '—'}</td>
                                <td style={{ color: r.DrugTest !== 'Negative' ? '#ef4444' : '#10b981' }}>{r.DrugTest || '—'}</td>
                                <td><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700, background: pass ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: pass ? '#10b981' : '#ef4444' }}>{pass ? t('quality.pass', 'PASS') : t('quality.fail', 'FAIL')}</span></td>
                                <td style={{ color: r.ActionRequired !== 'None' ? '#f59e0b' : '#475569' }}>{r.ActionRequired || '—'}</td>
                                <td style={{ color: r.EstLossValue > 0 ? '#ef4444' : '#475569', fontWeight: 700 }}>{r.EstLossValue > 0 ? fmt(r.EstLossValue) : '—'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function LabResultsTab({ plantId }) {
    const { t } = useTranslation();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const d = await API(`/quality/lab-results?plantId=${plantId}`, plantId).then(r => r.json());
            setRows(Array.isArray(d.rows) ? d.rows : []);
        } catch {}
        setLoading(false);
    }, [plantId]);

    const isAllSites = (plantId || '').toLowerCase().includes('all');

    useEffect(() => { load(); }, [load]);

    if (showForm || selectedLog) {
        return <LabResultForm plantId={plantId} existingLog={selectedLog} onSaved={() => { load(); setShowForm(false); setSelectedLog(null); }} onCancel={() => { setShowForm(false); setSelectedLog(null); }} />;
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: '10px 16px', marginBottom: 10, fontSize: '0.8rem', color: '#a78bfa', lineHeight: 1.6 }}>
                <strong>{t('quality.cryoscopyReference', 'Cryoscopy Reference:')} </strong>{t('quality.cryoscopyReferenceText', 'Normal bovine milk freezing point: −0.530 to −0.550 °H (Hortvet). Values above −0.525°H indicate suspected water addition. Water % = (−0.540 − Reading) / 0.540 × 100. PMO limit: <3% added water.')}
            </div>
            <div className="glass-card no-print" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem', color: 'var(--primary)' }}>
                    <FlaskConical size={20} /> {t('quality.labResultsLast90Days', 'Lab Results — Last 90 Days')}
                </h2>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-nav" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><RefreshCw size={14} /> {t('quality.refresh', 'Refresh')}</button>
                    {!isAllSites && (
                        <button className="btn-save" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FlaskConical size={14} /> {t('quality.submitLabResult', 'Submit Lab Result')}
                        </button>
                    )}
                </div>
            </div>
            <div className="glass-card" style={{ flex: 1, padding: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <LabTable rows={rows} loading={loading} onSelect={(r) => setSelectedLog(r)} isAllSites={isAllSites} />
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 3 — Quality Summary
// ═══════════════════════════════════════════════════════════════════════════════
function QualitySummaryTab({ plantId }) {
    const { t } = useTranslation();
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const d = await API(`/quality/summary?plantId=${plantId}`, plantId).then(r => r.json());
            setSummary(d?.labQuality ? d : null);
        } catch {}
        setLoading(false);
    }, [plantId]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div style={{ textAlign: 'center', padding: 64, color: '#64748b' }}><RefreshCw size={24} className="spinning" /></div>;
    if (!summary) return (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
            <Activity size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p>{t('quality.noQualityDataYet', 'No quality data yet. Log product losses and lab results to see the summary.')}</p>
        </div>
    );

    const kpis = [
        { label: t('quality.kpiTotalLossEvents', 'Total Product Loss Events'), val: summary.productLoss.events, color: '#f59e0b' },
        { label: t('quality.kpiTotalLossValue12mo', 'Total Loss Value (12mo)'), val: fmt(summary.productLoss.totalLossValue), color: '#ef4444' },
        { label: t('quality.kpiTotalVolumeLost', 'Total Volume Lost'), val: `${Math.round(summary.productLoss.totalQty).toLocaleString()} gal/lbs`, color: '#f59e0b' },
        { label: t('quality.kpiCryoFailures', 'Cryo Test Failures'), val: summary.labQuality.cryo.failures, color: '#8b5cf6' },
        { label: t('quality.kpiAvgWaterPct', 'Avg Water % Detected'), val: (summary.labQuality.cryo.avgWaterPct || 0) + '%', color: '#8b5cf6' },
        { label: t('quality.kpiBactDrugFailures', 'Bacteria / Drug Failures'), val: summary.labQuality.bacteria.failures, color: '#ef4444' },
        { label: t('quality.kpiCryoLossValue', 'Cryo Loss Value'), val: fmt(summary.labQuality.cryo.totalLossValue), color: '#8b5cf6' },
        { label: t('quality.kpiTotalLabLossValue', 'Total Lab Loss Value'), val: fmt(summary.labQuality.totalLabLoss), color: '#ef4444' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="glass-card no-print" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem', color: 'var(--primary)' }}>
                    <Activity size={20} /> {t('quality.qualitySummary', 'Quality Summary')}
                </h2>
                <button className="btn-save" onClick={() => window.triggerTrierPrint('quality-summary', summary)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Printer size={14} /> {t('quality.printSummary', 'Print Summary')}
                </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
                {kpis.map(({ label, val, color }) => (
                    <div key={label} style={{ background: `${color}08`, border: `1px solid ${color}20`, borderRadius: 12, padding: '16px 18px' }}>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900, color }}>{val}</div>
                    </div>
                ))}
            </div>

            {summary.productLoss.byType?.length > 0 && (
                <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem' }}>{t('quality.lossByType', 'Loss by Type')}</h3>
                    <table className="data-table">
                        <thead><tr>
                            <th>{t('quality.colLossType', 'Loss Type')}</th>
                            <th>{t('quality.colEvents', 'Events')}</th>
                            <th>{t('quality.colTotalValue', 'Total Value')}</th>
                        </tr></thead>
                        <tbody>
                            {summary.productLoss.byType.map(lt => (
                                <tr key={lt.LossType}>
                                    <td style={{ fontWeight: 600 }}>{lt.LossType ? t(`quality.lossType.${lt.LossType.replace(/\s+/g, '_')}`, lt.LossType) : '—'}</td>
                                    <td>{lt.cnt}</td>
                                    <td style={{ color: '#ef4444', fontWeight: 700 }}>{fmt(lt.val)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {summary.productLoss.byArea?.length > 0 && (
                <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem' }}>{t('quality.lossByPlantArea', 'Loss by Plant Area')}</h3>
                    <table className="data-table">
                        <thead><tr>
                            <th>{t('quality.colArea', 'Area')}</th>
                            <th>{t('quality.colEvents', 'Events')}</th>
                            <th>{t('quality.colTotalValue', 'Total Value')}</th>
                        </tr></thead>
                        <tbody>
                            {summary.productLoss.byArea.map(a => (
                                <tr key={a.Area}>
                                    <td style={{ fontWeight: 600 }}>{a.Area ? t(`quality.area.${a.Area.replace(/\s+/g, '_')}`, a.Area) : t('quality.unspecified', 'Unspecified')}</td>
                                    <td>{a.cnt}</td>
                                    <td style={{ color: '#f59e0b', fontWeight: 700 }}>{fmt(a.val)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {summary.meters?.length > 0 && (
                <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Activity size={16} color="#06b6d4" /> {t('quality.flowMeterSummary', 'Flow Meter Summary')}
                    </h3>
                    <table className="data-table">
                        <thead><tr>
                            <th>{t('quality.colMeterID', 'Meter ID')}</th>
                            <th>{t('quality.colReadings', 'Readings')}</th>
                            <th>{t('quality.colTotalGallonsToFloor', 'Total Gallons to Floor')}</th>
                        </tr></thead>
                        <tbody>
                            {summary.meters.map(m => (
                                <tr key={m.MeterID}>
                                    <td style={{ fontWeight: 600, color: '#06b6d4' }}>{m.MeterID}</td>
                                    <td>{m.readings}</td>
                                    <td style={{ fontWeight: 700 }}>{Math.round(m.totalGals).toLocaleString()} gal</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Export — follows Jobs Dashboard layout exactly
// ═══════════════════════════════════════════════════════════════════════════════
export default function QualityDashboard({ plantId }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState(() => localStorage.getItem('PF_QUALITY_TAB') || 'loss');
    const setTabAndSave = (t) => { setTab(t); localStorage.setItem('PF_QUALITY_TAB', t); };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)' }}>
            {/* ── Standard header bar — identical structure to JobsView ── */}
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Droplets size={24} /> {t('quality.qualityLossDashboard', 'Quality & Loss Dashboard')}
                </h2>
                <div style={{ width: '2px', height: '30px', background: 'var(--glass-border)' }} />

                <div className="nav-pills no-print">
                    <button onClick={() => setTabAndSave('loss')} className={`btn-nav ${tab === 'loss' ? 'active' : ''}`}>
                        <Droplets size={14} style={{ marginRight: 5, verticalAlign: 'text-bottom' }} />
                        {t('quality.tabProductLossLog', 'Product Loss Log')}
                    </button>
                    <button onClick={() => setTabAndSave('lab')} className={`btn-nav ${tab === 'lab' ? 'active' : ''}`}>
                        <FlaskConical size={14} style={{ marginRight: 5, verticalAlign: 'text-bottom' }} />
                        {t('quality.tabLabResults', 'Lab Results (Cryo + Bacteria)')}
                    </button>
                    <button onClick={() => setTabAndSave('summary')} className={`btn-nav ${tab === 'summary' ? 'active' : ''}`}>
                        <Activity size={14} style={{ marginRight: 5, verticalAlign: 'text-bottom' }} />
                        {t('quality.tabQualitySummary', 'Quality Summary')}
                    </button>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{plantId?.replace(/_/g, ' ')}</span>
                </div>
            </div>

            {/* ── Content area ── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {tab === 'loss' && <ProductLossTab plantId={plantId} />}
                {tab === 'lab' && <LabResultsTab plantId={plantId} />}
                {tab === 'summary' && (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px' }}>
                        <QualitySummaryTab plantId={plantId} />
                    </div>
                )}
            </div>
        </div>
    );
}
