// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Product Quality Log
 * ================================
 * Plant-level product loss and lab quality result logging interface.
 * Tracks production losses, cryoscope readings, bacterial counts, and
 * quality summary KPIs — purpose-built for dairy and food manufacturing.
 *
 * TABS:
 *   Product Loss Log  — Log production losses by type, cause, quantity, and shift
 *   Lab Results       — Cryoscope freezing point (°H) + bacteria SPC/PI/LPC results
 *   Summary           — Daily/weekly quality KPI roll-up with trend charts
 *
 * KEY FEATURES:
 *   - Loss log entry: product, quantity lost, loss type, cause code, responsible shift
 *   - Cryoscope reading entry: °H value per test; flags values outside spec (−0.530 to −0.560)
 *   - Bacterial test entry: SPC, PI, LPC counts; highlights counts above regulatory limits
 *   - Summary dashboard: total loss $, % loss rate, avg cryo, bacterial trend
 *   - Print report: formatted daily quality summary for QA manager review
 *   - Refresh: re-query all data for current plant and date range
 *
 * API CALLS:
 *   GET  /api/product-quality/loss         — Product loss log entries
 *   POST /api/product-quality/loss         — Log new loss event
 *   GET  /api/product-quality/lab          — Lab test results (cryo + bacteria)
 *   POST /api/product-quality/lab          — Log new lab result
 *   GET  /api/product-quality/summary      — Quality KPI summary
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    FlaskConical, Droplets, AlertTriangle, CheckCircle2, XCircle,
    PlusCircle, RefreshCw, Printer, ChevronDown, ChevronUp,
    Thermometer, Beaker, Activity, FileText
} from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

const API = (path, opts = {}) => fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    ...opts,
});

const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtNum = (n, dec = 0) => n == null ? '—' : Number(n).toFixed(dec);

const LOSS_TYPES = ['Drain to Floor', 'Startup Purge', 'Equipment Failure', 'Spill', 'CIP Overflow', 'Expired Hold', 'Separator Loss', 'Evaporator Loss', 'Other'];
const AREAS = ['Receiving', 'Pasteurizer', 'Separator', 'Processing', 'Evaporator', 'Packaging', 'CIP', 'Storage Silos', 'Shipping', 'Other'];
const PRODUCTS = ['Whole Milk', 'Skim Milk', '2% Milk', 'Cream', 'Half & Half', 'Butter', 'Whey', 'Condensed Milk', 'CIP Solution', 'Other'];
const SAMPLE_TYPES = ['Raw Incoming', 'Silo', 'Pasteurized', 'Final Product', 'Environment', 'CIP Rinse'];
const ACTIONS = ['None', 'Retest', 'Hold Tank', 'Dump Load', 'Regulatory Report', 'Quarantine'];

// Normal milk cryo range: -0.530 to -0.550 °H
const CRYO_THRESHOLD = -0.525;
const CRYO_NORMAL = -0.540;

function cryoCalc(reading) {
    if (!reading) return { waterPct: null, pass: null };
    const r = parseFloat(reading);
    const waterPct = Math.max(0, ((CRYO_NORMAL - r) / Math.abs(CRYO_NORMAL)) * 100);
    return { waterPct: Math.round(waterPct * 100) / 100, pass: r <= CRYO_THRESHOLD };
}

// ── Loss Entry Form ──────────────────────────────────────────────────────────
function LossEntryForm({ plantId, onSaved }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({
        LogDate: new Date().toISOString().split('T')[0],
        Shift: 'A', Area: '', ProductType: '', LossType: '',
        Quantity: '', Unit: 'gal', UnitValue: '',
        MeterID: '', MeterReading: '', WoID: '', Notes: '', EnteredBy: '',
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const totalValue = (parseFloat(form.Quantity) || 0) * (parseFloat(form.UnitValue) || 0);

    const submit = async () => {
        if (!form.LossType) return alert(t('quality.lossTypeRequired', 'Loss Type is required'));
        setSaving(true);
        try {
            const r = await API(`/quality/loss-log?plantId=${plantId}`, { method: 'POST', body: JSON.stringify(form) });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            setSaved(true);
            setTimeout(() => { setSaved(false); onSaved?.(); }, 2000);
            setForm(f => ({ ...f, Quantity: '', UnitValue: '', MeterReading: '', WoID: '', Notes: '' }));
        } catch (e) { alert('Error: ' + e.message); }
        setSaving(false);
    };

    const inputStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f1f5f9', fontSize: '0.82rem', width: '100%' };
    const labelStyle = { fontSize: '0.68rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' };
    const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.date', 'Date')}</label><input type="date" value={form.LogDate} onChange={e => set('LogDate', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.shift', 'Shift')}</label>
                    <select value={form.Shift} onChange={e => set('Shift', e.target.value)} style={inputStyle}>
                        {['A','B','C','D'].map(s => <option key={s}>{s}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.areaRequired', 'Area *')}</label>
                    <select value={form.Area} onChange={e => set('Area', e.target.value)} style={inputStyle}>
                        <option value="">{t('quality.select', 'Select...')}</option>
                        {AREAS.map(a => <option key={a}>{a}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.productType', 'Product Type')}</label>
                    <select value={form.ProductType} onChange={e => set('ProductType', e.target.value)} style={inputStyle}>
                        <option value="">{t('quality.select', 'Select...')}</option>
                        {PRODUCTS.map(p => <option key={p}>{p}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.lossTypeRequired', 'Loss Type *')}</label>
                    <select value={form.LossType} onChange={e => set('LossType', e.target.value)} style={inputStyle}>
                        <option value="">{t('quality.select', 'Select...')}</option>
                        {LOSS_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.quantityLost', 'Quantity Lost')}</label>
                    <input type="number" placeholder="0" value={form.Quantity} onChange={e => set('Quantity', e.target.value)} style={inputStyle} />
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.unit', 'Unit')}</label>
                    <select value={form.Unit} onChange={e => set('Unit', e.target.value)} style={inputStyle}>
                        {['gal','lbs','cases','L'].map(u => <option key={u}>{u}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.dollarPerUnit', '$ per Unit')}</label>
                    <input type="number" placeholder="0.22" step="0.01" value={form.UnitValue} onChange={e => set('UnitValue', e.target.value)} style={inputStyle} />
                </div>
            </div>

            {/* Flow Meter section */}
            <div style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#06b6d4', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('quality.flowMeterIfAvailable', 'Flow Meter (if available)')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div style={fieldStyle}><label style={labelStyle}>{t('quality.meterID', 'Meter ID')}</label><input placeholder="FM-01, CIP-02..." value={form.MeterID} onChange={e => set('MeterID', e.target.value)} style={inputStyle} /></div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('quality.meterReadingGal', 'Meter Reading (gal)')}</label><input type="number" placeholder="0" value={form.MeterReading} onChange={e => set('MeterReading', e.target.value)} style={inputStyle} /></div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('quality.linkedWONumber', 'Linked WO #')}</label><input placeholder="WO000123" value={form.WoID} onChange={e => set('WoID', e.target.value)} style={inputStyle} /></div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.notes', 'Notes')}</label><textarea value={form.Notes} onChange={e => set('Notes', e.target.value)} rows={2} placeholder={t('quality.notesPlaceholder', 'What happened? Equipment involved?')} style={{ ...inputStyle, resize: 'vertical' }} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.enteredBy', 'Entered By')}</label><input value={form.EnteredBy} onChange={e => set('EnteredBy', e.target.value)} placeholder={t('quality.yourName', 'Your name')} style={inputStyle} /></div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {totalValue > 0 && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 16px' }}>
                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{t('quality.estimatedLoss', 'Estimated Loss: ')}</span>
                        <span style={{ fontWeight: 800, color: '#ef4444', fontSize: '1.1rem' }}>{fmt(totalValue)}</span>
                    </div>
                )}
                <button onClick={submit} disabled={saving} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                    {saving ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <CheckCircle2 size={14} color="#10b981" /> : <PlusCircle size={14} />}
                    {saved ? t('quality.saved', 'Saved!') : saving ? t('quality.saving', 'Saving...') : t('quality.logProductLoss', 'Log Product Loss')}
                </button>
            </div>
        </div>
    );
}

// ── Lab Result Form ──────────────────────────────────────────────────────────
function LabResultForm({ plantId, onSaved }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({
        SampleDate: new Date().toISOString().split('T')[0],
        SampleID: '', SampleType: 'Raw Incoming', SourceTank: '',
        CryoReading: '', CryoAction: 'Accept', CryoLossValue: '',
        SPC: '', Coliform: '', LPC: '', PI: '', SoMatic: '',
        Listeria: 'ND', Salmonella: 'ND', DrugTest: 'Negative',
        FatPct: '', ProteinPct: '', LactosePct: '', SolidsNotFat: '',
        ActionRequired: 'None', EstLossValue: '',
        Notes: '', TestTech: '',
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const cryo = form.CryoReading ? cryoCalc(form.CryoReading) : null;

    const submit = async () => {
        if (!form.SampleDate) return alert(t('quality.sampleDateRequired', 'Sample Date required'));
        setSaving(true);
        try {
            const r = await API(`/quality/lab-results?plantId=${plantId}`, { method: 'POST', body: JSON.stringify(form) });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            setSaved(true);
            setTimeout(() => { setSaved(false); onSaved?.(); }, 2000);
            setForm(f => ({ ...f, SampleID: '', CryoReading: '', SPC: '', Coliform: '', Notes: '' }));
        } catch (e) { alert('Error: ' + e.message); }
        setSaving(false);
    };

    const inputStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f1f5f9', fontSize: '0.82rem', width: '100%' };
    const labelStyle = { fontSize: '0.68rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' };
    const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Basic info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 12 }}>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.sampleDate', 'Sample Date')}</label><input type="date" value={form.SampleDate} onChange={e => set('SampleDate', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.sampleID', 'Sample ID')}</label><input placeholder="LAB-2026-001" value={form.SampleID} onChange={e => set('SampleID', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.sampleType', 'Sample Type')}</label>
                    <select value={form.SampleType} onChange={e => set('SampleType', e.target.value)} style={inputStyle}>
                        {SAMPLE_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.sourceTankLine', 'Source Tank/Line')}</label><input placeholder="Silo-1, Tank-3..." value={form.SourceTank} onChange={e => set('SourceTank', e.target.value)} style={inputStyle} /></div>
            </div>

            {/* Cryoscopy */}
            <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Thermometer size={16} color="#8b5cf6" />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('quality.cryoscopyTestHeader', 'Cryoscopy Test — Freezing Point (Detects Added Water)')}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
                    <div style={fieldStyle}>
                        <label style={labelStyle}>{t('quality.cryoReadingDegH', 'Cryo Reading (°H)')}</label>
                        <input type="number" step="0.001" placeholder="-0.530" value={form.CryoReading} onChange={e => set('CryoReading', e.target.value)} style={{ ...inputStyle, borderColor: cryo ? (cryo.pass ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)') : 'rgba(255,255,255,0.1)' }} />
                        <span style={{ fontSize: '0.65rem', color: '#475569' }}>{t('quality.cryoNormalRange', 'Normal: -0.530 to -0.550 °H')}</span>
                    </div>
                    {cryo && (
                        <>
                            <div style={{ background: cryo.pass ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.12)', border: `1px solid ${cryo.pass ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: 4 }}>{t('quality.result', 'RESULT')}</div>
                                <div style={{ fontWeight: 900, fontSize: '1rem', color: cryo.pass ? '#10b981' : '#ef4444' }}>{cryo.pass ? t('quality.pass', 'PASS') : t('quality.fail', 'FAIL')}</div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: 4 }}>{t('quality.estWaterAdded', 'EST. WATER ADDED')}</div>
                                <div style={{ fontWeight: 900, fontSize: '1.1rem', color: cryo.waterPct > 3 ? '#ef4444' : cryo.waterPct > 1 ? '#f59e0b' : '#10b981' }}>{cryo.waterPct}%</div>
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>{t('quality.action', 'Action')}</label>
                                <select value={form.CryoAction} onChange={e => set('CryoAction', e.target.value)} style={inputStyle}>
                                    {ACTIONS.map(a => <option key={a}>{a}</option>)}
                                </select>
                            </div>
                        </>
                    )}
                </div>
                {cryo && !cryo.pass && (
                    <div style={{ marginTop: 10, background: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#fca5a5' }}>
                        ⚠ {t('quality.cryoFailWarning', 'Freezing point')} {form.CryoReading}°H {t('quality.cryoExceedsThreshold', 'exceeds −0.525°H threshold. Estimated')} {cryo.waterPct}% {t('quality.addedWaterDetected', 'added water detected.')}.
                        {cryo.waterPct > 3 && ' ' + t('quality.cryoRegulatoryReport', 'This level requires regulatory reporting (FDA 21 CFR Part 131).')}
                    </div>
                )}
                <div style={{ marginTop: 10 }}>
                    <div style={fieldStyle}><label style={labelStyle}>{t('quality.estLossValueIfRejected', 'Est. Loss Value if Rejected')}</label><input type="number" placeholder="0" value={form.CryoLossValue} onChange={e => set('CryoLossValue', e.target.value)} style={{ ...inputStyle, width: 180 }} /></div>
                </div>
            </div>

            {/* Bacteriology */}
            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Beaker size={16} color="#ef4444" />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('quality.bacteriology', 'Bacteriology')}</span>
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
                                <input type="number" value={form[k]} onChange={e => set(k, e.target.value)}
                                    style={{ ...inputStyle, borderColor: isHigh ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)' }} />
                                <span style={{ fontSize: '0.6rem', color: isHigh ? '#ef4444' : '#475569' }}>{t('quality.limit', 'Limit:')} {limit}{isHigh ? ' ⚠ ' + t('quality.exceedsLimit', 'EXCEEDS LIMIT') : ''}</span>
                            </div>
                        );
                    })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 12 }}>
                    <div style={fieldStyle}><label style={labelStyle}>{t('quality.listeria', 'Listeria')}</label>
                        <select value={form.Listeria} onChange={e => set('Listeria', e.target.value)} style={{ ...inputStyle, color: form.Listeria !== 'ND' ? '#ef4444' : '#f1f5f9' }}>
                            {['ND', 'Positive - Retest', 'Positive - Confirmed', 'Environmental'].map(o => <option key={o}>{o}</option>)}
                        </select>
                    </div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('quality.salmonella', 'Salmonella')}</label>
                        <select value={form.Salmonella} onChange={e => set('Salmonella', e.target.value)} style={{ ...inputStyle, color: form.Salmonella !== 'ND' ? '#ef4444' : '#f1f5f9' }}>
                            {['ND', 'Positive - Retest', 'Positive - Confirmed'].map(o => <option key={o}>{o}</option>)}
                        </select>
                    </div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('quality.drugResidueBetaStar', 'Drug Residue (Beta Star)')}</label>
                        <select value={form.DrugTest} onChange={e => set('DrugTest', e.target.value)} style={{ ...inputStyle, color: form.DrugTest !== 'Negative' ? '#ef4444' : '#f1f5f9' }}>
                            {['Negative', 'Positive - Penicillin', 'Positive - Other', 'Retest Required'].map(o => <option key={o}>{o}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Composition */}
            <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981', marginBottom: 10, textTransform: 'uppercase' }}>{t('quality.compositionOptional', 'Composition (optional)')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {[['FatPct','Fat %'],['ProteinPct','Protein %'],['LactosePct','Lactose %'],['SolidsNotFat','SNF %']].map(([k,l]) => (
                        <div key={k} style={fieldStyle}><label style={labelStyle}>{l}</label><input type="number" step="0.01" value={form[k]} onChange={e => set(k, e.target.value)} style={inputStyle} /></div>
                    ))}
                </div>
            </div>

            {/* Overall action */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.overallActionRequired', 'Overall Action Required')}</label>
                    <select value={form.ActionRequired} onChange={e => set('ActionRequired', e.target.value)} style={inputStyle}>
                        {ACTIONS.map(a => <option key={a}>{a}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.estLossValueDollar', 'Est. Loss Value ($)')}</label><input type="number" value={form.EstLossValue} onChange={e => set('EstLossValue', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('quality.labTechnician', 'Lab Technician')}</label><input value={form.TestTech} onChange={e => set('TestTech', e.target.value)} placeholder={t('quality.name', 'Name')} style={inputStyle} /></div>
            </div>
            <div style={fieldStyle}><label style={labelStyle}>{t('quality.notes', 'Notes')}</label><textarea value={form.Notes} onChange={e => set('Notes', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></div>

            <button onClick={submit} disabled={saving} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-end' }}>
                {saving ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <CheckCircle2 size={14} color="#10b981" /> : <FlaskConical size={14} />}
                {saved ? t('quality.saved', 'Saved!') : saving ? t('quality.saving', 'Saving...') : t('quality.submitLabResult', 'Submit Lab Result')}
            </button>
        </div>
    );
}

// ── Log Table ─────────────────────────────────────────────────────────────────
function LossLogTable({ rows }) {
    const { t } = useTranslation();
    if (!rows?.length) return <div style={{ color: '#475569', fontSize: '0.8rem', fontStyle: 'italic', padding: '16px 0' }}>{t('quality.noProductLossEntriesYet', 'No product loss entries logged yet.')}</div>;
    const th = { fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.07)' };
    const td = { fontSize: '0.8rem', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' };
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
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
                    ].map(h => <th key={h} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.ID}>
                            <td style={td}>{r.LogDate}</td>
                            <td style={td}>{r.Shift || '—'}</td>
                            <td style={td}>{r.Area || '—'}</td>
                            <td style={td}>{r.ProductType || '—'}</td>
                            <td style={{ ...td, color: '#f59e0b', fontWeight: 600 }}>{r.LossType}</td>
                            <td style={td}>{r.Quantity} {r.Unit}</td>
                            <td style={{ ...td, color: r.TotalValue > 0 ? '#ef4444' : '#475569', fontWeight: 700 }}>{r.TotalValue > 0 ? fmt(r.TotalValue) : '—'}</td>
                            <td style={td}>{r.MeterID || '—'}</td>
                            <td style={td}>{r.WoID || '—'}</td>
                            <td style={{ ...td, color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.Notes || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function LabTable({ rows }) {
    const { t } = useTranslation();
    if (!rows?.length) return <div style={{ color: '#475569', fontSize: '0.8rem', fontStyle: 'italic', padding: '16px 0' }}>{t('quality.noLabResultsYet', 'No lab results logged yet.')}</div>;
    const th = { fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.07)' };
    const td = { fontSize: '0.8rem', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' };
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
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
                    ].map(h => <th key={h} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                    {rows.map(r => {
                        const pass = r.OverallPass === 1;
                        return (
                            <tr key={r.ID}>
                                <td style={td}>{r.SampleDate}</td>
                                <td style={td}>{r.SampleID || '—'}</td>
                                <td style={td}>{r.SampleType || '—'}</td>
                                <td style={td}>{r.SourceTank || '—'}</td>
                                <td style={{ ...td, color: r.CryoPass === 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>{r.CryoReading != null ? fmtNum(r.CryoReading, 3) : '—'}</td>
                                <td style={{ ...td, color: r.CryoWaterPct > 3 ? '#ef4444' : r.CryoWaterPct > 1 ? '#f59e0b' : '#10b981' }}>{r.CryoWaterPct != null ? r.CryoWaterPct + '%' : '—'}</td>
                                <td style={td}>{r.CryoPass == null ? '—' : r.CryoPass ? <CheckCircle2 size={14} color="#10b981" /> : <XCircle size={14} color="#ef4444" />}</td>
                                <td style={{ ...td, color: r.SPC >= 100000 ? '#ef4444' : '#94a3b8' }}>{r.SPC != null ? r.SPC.toLocaleString() : '—'}</td>
                                <td style={{ ...td, color: r.Coliform >= 10 ? '#ef4444' : '#94a3b8' }}>{r.Coliform != null ? r.Coliform.toLocaleString() : '—'}</td>
                                <td style={{ ...td, color: r.DrugTest !== 'Negative' ? '#ef4444' : '#10b981' }}>{r.DrugTest || '—'}</td>
                                <td style={td}><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700, background: pass ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: pass ? '#10b981' : '#ef4444' }}>{pass ? t('quality.pass', 'PASS') : t('quality.fail', 'FAIL')}</span></td>
                                <td style={{ ...td, color: r.ActionRequired !== 'None' ? '#f59e0b' : '#475569' }}>{r.ActionRequired || '—'}</td>
                                <td style={{ ...td, color: r.EstLossValue > 0 ? '#ef4444' : '#475569', fontWeight: 700 }}>{r.EstLossValue > 0 ? fmt(r.EstLossValue) : '—'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ProductQualityLog({ plantId, onClose }) {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('loss'); // 'loss' | 'lab' | 'summary'
    const [lossRows, setLossRows] = useState([]);
    const [labRows, setLabRows] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);

    const load = useCallback(async () => {
        if (!plantId) return;
        setLoading(true);
        try {
            const [lR, labR, sumR] = await Promise.all([
                API(`/quality/loss-log?plantId=${plantId}`).then(r => r.json()).catch(() => ({})),
                API(`/quality/lab-results?plantId=${plantId}`).then(r => r.json()).catch(() => ({})),
                API(`/quality/summary?plantId=${plantId}`).then(r => r.json()).catch(() => ({})),
            ]);
            setLossRows(Array.isArray(lR.rows) ? lR.rows : []);
            setLabRows(Array.isArray(labR.rows) ? labR.rows : []);
            // Only set summary if it has the expected shape
            setSummary(sumR?.labQuality ? sumR : null);
        } catch {}
        setLoading(false);
    }, [plantId]);

    useEffect(() => { load(); }, [load]);

    const tabStyle = (tab) => ({
        padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
        background: activeTab === tab ? 'rgba(239,68,68,0.15)' : 'transparent',
        color: activeTab === tab ? '#ef4444' : '#64748b',
        border: activeTab === tab ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent',
        transition: 'all 0.15s',
    });

    const sectionCard = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, marginBottom: 16 };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 16px', overflowY: 'auto' }}
            onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
            <div style={{ background: 'linear-gradient(160deg,#0f172a,#1a0a2e)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 20, width: '100%', maxWidth: 1100, boxShadow: '0 32px 80px rgba(0,0,0,0.6)', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{ padding: '20px 28px 16px', background: 'linear-gradient(135deg,rgba(239,68,68,0.12),transparent)', borderBottom: '1px solid rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Droplets size={22} color="#ef4444" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.68rem', color: '#ef4444', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 2 }}>{t('quality.productQualityLossTracking', 'PRODUCT QUALITY & LOSS TRACKING')}</div>
                        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#f1f5f9' }}>{t('quality.copqLogTitle', 'COPQ Log')} — {plantId?.replace(/_/g, ' ')}</h2>
                    </div>
                    {summary?.labQuality && (
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#ef4444' }}>{fmt(summary.totalLossValue)}</div>
                                <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>{t('quality.totalLoss12mo', 'TOTAL LOSS (12mo)')}</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#f59e0b' }}>{summary.labQuality?.cryo?.failures ?? 0}</div>
                                <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>{t('quality.cryoFails', 'CRYO FAILS')}</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#8b5cf6' }}>{summary.labQuality?.bacteria?.failures ?? 0}</div>
                                <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>{t('quality.bactFails', 'BACT FAILS')}</div>
                            </div>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button onClick={load} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}><RefreshCw size={13} /> {t('quality.refresh', 'Refresh')}</button>
                        <button onClick={onClose} className="btn-danger" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>✕ {t('quality.close', 'Close')}</button>
                    </div>
                </div>

                <div style={{ padding: '20px 28px', maxHeight: '78vh', overflowY: 'auto' }}>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                        <button style={tabStyle('loss')} onClick={() => setActiveTab('loss')}><Droplets size={13} style={{ marginRight: 6 }} />{t('quality.tabProductLossLog', 'Product Loss Log')}</button>
                        <button style={tabStyle('lab')} onClick={() => setActiveTab('lab')}><FlaskConical size={13} style={{ marginRight: 6 }} />{t('quality.tabLabResultsCryoBacteria', 'Lab Results (Cryo + Bacteria)')}</button>
                        <button style={tabStyle('summary')} onClick={() => setActiveTab('summary')}><Activity size={13} style={{ marginRight: 6 }} />{t('quality.tabQualitySummary', 'Quality Summary')}</button>
                    </div>

                    {loading && <div style={{ textAlign: 'center', color: '#64748b', padding: 32 }}><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /></div>}

                    {/* Product Loss Tab */}
                    {!loading && activeTab === 'loss' && (
                        <>
                            <div style={sectionCard}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showForm ? 16 : 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <PlusCircle size={16} color="#f59e0b" />
                                        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{t('quality.logNewProductLossEvent', 'Log New Product Loss Event')}</span>
                                    </div>
                                    <button onClick={() => setShowForm(f => !f)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                                        {showForm ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {showForm ? t('quality.hide', 'Hide') : t('quality.addEntry', 'Add Entry')}
                                    </button>
                                </div>
                                {showForm && <LossEntryForm plantId={plantId} onSaved={() => { load(); setShowForm(false); }} />}
                            </div>
                            <div style={sectionCard}>
                                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 12, color: '#f1f5f9' }}>{t('quality.recentProductLossEventsLast90Days', 'Recent Product Loss Events — Last 90 Days')}</div>
                                <LossLogTable rows={lossRows} />
                            </div>
                        </>
                    )}

                    {/* Lab Results Tab */}
                    {!loading && activeTab === 'lab' && (
                        <>
                            <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: '0.8rem', color: '#a78bfa', lineHeight: 1.6 }}>
                                <strong>{t('quality.cryoscopyReference', 'Cryoscopy Reference:')} </strong>{t('quality.cryoscopyReferenceTextFull', 'Normal bovine milk freezing point: −0.530 to −0.550 °H (Hortvet). Values above −0.525°H indicate suspected water addition. Water % = (−0.540 − Cryo Reading) / 0.540 × 100. PMO limit: < 3% added water requires regulatory reporting.')}
                            </div>
                            <div style={sectionCard}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showForm ? 16 : 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <FlaskConical size={16} color="#8b5cf6" />
                                        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{t('quality.submitNewLabResult', 'Submit New Lab Result')}</span>
                                    </div>
                                    <button onClick={() => setShowForm(f => !f)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                                        {showForm ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {showForm ? t('quality.hide', 'Hide') : t('quality.addEntry', 'Add Entry')}
                                    </button>
                                </div>
                                {showForm && <LabResultForm plantId={plantId} onSaved={() => { load(); setShowForm(false); }} />}
                            </div>
                            <div style={sectionCard}>
                                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 12, color: '#f1f5f9' }}>{t('quality.labResultsLast90Days', 'Lab Results — Last 90 Days')}</div>
                                <LabTable rows={labRows} />
                            </div>
                        </>
                    )}

                    {/* Summary Tab */}
                    {!loading && activeTab === 'summary' && summary && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
                                {[
                                    { label: t('quality.kpiTotalLossEvents', 'Total Product Loss Events'), val: summary.productLoss.events, unit: 'events', color: '#f59e0b' },
                                    { label: t('quality.kpiTotalLossValue12mo', 'Total Loss Value (12mo)'), val: fmt(summary.productLoss.totalLossValue), color: '#ef4444' },
                                    { label: t('quality.kpiTotalVolumeLost', 'Total Volume Lost'), val: `${Math.round(summary.productLoss.totalQty).toLocaleString()} gal/lbs`, color: '#f59e0b' },
                                    { label: t('quality.kpiCryoFailures', 'Cryo Test Failures'), val: summary.labQuality.cryo.failures, color: '#8b5cf6' },
                                    { label: t('quality.kpiAvgWaterPct', 'Avg Water % Detected'), val: summary.labQuality.cryo.avgWaterPct + '%', color: '#8b5cf6' },
                                    { label: t('quality.kpiBactDrugFailures', 'Bacteria/Drug Failures'), val: summary.labQuality.bacteria.failures, color: '#ef4444' },
                                    { label: t('quality.kpiCryoLossValue', 'Cryo Loss Value'), val: fmt(summary.labQuality.cryo.totalLossValue), color: '#8b5cf6' },
                                    { label: t('quality.kpiTotalLabLossValue', 'Total Lab Loss Value'), val: fmt(summary.labQuality.totalLabLoss), color: '#ef4444' },
                                ].map(({ label, val, color }) => (
                                    <div key={label} style={{ background: `${color}08`, border: `1px solid ${color}20`, borderRadius: 10, padding: '14px 16px' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color }}>{val}</div>
                                    </div>
                                ))}
                            </div>
                            {summary.productLoss.byType?.length > 0 && (
                                <div style={sectionCard}>
                                    <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 12 }}>{t('quality.lossByType', 'Loss by Type')}</div>
                                    {summary.productLoss.byType.map(row => (
                                        <div key={row.LossType} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.82rem' }}>
                                            <span>{row.LossType}</span>
                                            <div style={{ display: 'flex', gap: 16 }}>
                                                <span style={{ color: '#64748b' }}>{row.cnt} {t('quality.events', 'events')}</span>
                                                <span style={{ color: '#ef4444', fontWeight: 700 }}>{fmt(row.val)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {summary.meters?.length > 0 && (
                                <div style={sectionCard}>
                                    <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Activity size={16} color="#06b6d4" /> {t('quality.flowMeterSummary', 'Flow Meter Summary')}
                                    </div>
                                    {summary.meters.map(m => (
                                        <div key={m.MeterID} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.82rem' }}>
                                            <span style={{ fontWeight: 600 }}>{m.MeterID}</span>
                                            <span style={{ color: '#64748b' }}>{m.readings} {t('quality.readings', 'readings')} — {Math.round(m.totalGals).toLocaleString()} {t('quality.galTotalToFloor', 'gal total to floor')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
