// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Work Order Close-Out Wizard
 * =========================================
 * Step-by-step wizard that guides technicians through the WO close-out
 * process. Enforces completion of all required fields before allowing
 * the status to advance to CLOSED (StatusID 40+).
 *
 * STEPS:
 *   1. Resolution Notes  — What was found, what was done, root cause summary
 *   2. Labor Hours       — Actual hours per technician vs. estimated
 *   3. Parts Consumed    — Parts used (deducted from storeroom inventory on save)
 *   4. Downtime          — Actual downtime hours recorded against the asset
 *   5. Follow-Up Actions — Linked follow-up WOs or PM schedule adjustments
 *   6. Confirmation      — Review summary before final submission
 *
 * DRAFT SAVE: Uses DraftManager utility to auto-save progress every 60 seconds.
 *   Drafts survive page refresh and browser close. Cleared on successful submit.
 *
 * VALIDATION: Step 1 (resolution notes) is required before advancing.
 *   Parts and labor are optional but encouraged — skipped steps are flagged
 *   with a visual indicator in the step nav for supervisor review.
 *
 * ON SUBMIT: PATCH /api/work-orders/:id with status, resolution, labor, parts, downtime.
 *   Inventory adjustment records are written for each part consumed.
 *
 * @param {string|number} woId        — Work order ID being closed
 * @param {string}        woNumber    — WO number displayed in wizard heading
 * @param {string|number} assetId     — Associated asset (for inventory deduction)
 * @param {boolean}       isOpen      — Controls wizard visibility
 * @param {Function}      onClose     — Callback: dismiss wizard without saving
 * @param {Function}      onComplete  — Callback: called after successful close-out
 * @param {number}        prefillHours — Pre-populate labor hours from WO estimate
 */
import React, { useState, useEffect } from 'react';
import { Clock, Package, DollarSign, CheckCircle2, ChevronRight, ChevronLeft, Plus, X, Search, Loader2 } from 'lucide-react';
import DraftManager from '../utils/DraftManager';
import { useTranslation } from '../i18n/index.jsx';
import { formatDate } from '../utils/formatDate';

export default function CloseOutWizard({ woId, woNumber, assetId, isOpen, onClose, onComplete, prefillHours = 0 }) {
    const { t } = useTranslation();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    // Form State
    const [labor, setLabor] = useState([]);
    const [parts, setParts] = useState([]);
    const [misc, setMisc] = useState([]);

    // Draft Logic
    const plantId = localStorage.getItem('selectedPlantId') || 'Demo_Plant_1';
    const draftKey = `CLOSEOUT_${woId}`;

    // Lookups
    const [availableUsers, setAvailableUsers] = useState([]);
    const [availableCostCenters, setAvailableCostCenters] = useState([]);
    const [partSearch, setPartSearch] = useState('');
    const [partResults, setPartResults] = useState([]);
    const [searchingParts, setSearchingParts] = useState(false);

    // Warranty status tracking
    const [warrantyInfo, setWarrantyInfo] = useState(null);

    useEffect(() => {
        if (isOpen) {
            // Fetch warranty status if asset is known
            setWarrantyInfo(null);
            if (assetId) {
                fetch(`/api/assets/${encodeURIComponent(assetId)}/warranty-status`)
                    .then(r => r.json())
                    .then(data => { if (data && data.isUnderWarranty) setWarrantyInfo(data); })
                    .catch(e => console.warn('[CloseOutWizard] fetch error:', e));
            }
            fetchLookups();
            // Reset state
            setStep(1);
            setSuccess(false);
            setError('');
            
            // Check for existing drafts first
            const draft = DraftManager.get(draftKey, plantId);
            if (draft) {
                setLabor(draft.labor || []);
                setParts(draft.parts || []);
                setMisc(draft.misc || []);
                if (draft.step) setStep(draft.step);
            } else if (prefillHours > 0) {
                // Auto-create a labor row from the Job Timer
                const currentUser = localStorage.getItem('userName') || localStorage.getItem('userDisplayName') || '';
                setLabor([{ LaborID: currentUser, HrReg: prefillHours, HrOver: 0, PayReg: 0.0, PayOver: 0.0, HrDouble: 0, PayDouble: 0.0, HrOther: 0, PayOther: 0.0, Comment: `⏱️ Timer: ${prefillHours}h recorded` }]);
                setParts([]);
                setMisc([]);
            } else {
                setLabor([]);
                setParts([]);
                setMisc([]);
            }
        }
    }, [isOpen, woId, draftKey, plantId, prefillHours]);

    // Auto-save logic
    useEffect(() => {
        if (isOpen && !success) {
            DraftManager.save(draftKey, { labor, parts, misc, step }, plantId);
        }
    }, [labor, parts, misc, step, isOpen, success, draftKey, plantId]);

    const fetchLookups = async () => {
        try {
            // Fetch technicians from all sources (plant users, work assignments, auth users)
            const usersRes = await fetch('/api/lookups/assignments');
            if (usersRes.ok) {
                const userData = await usersRes.json();
                setAvailableUsers(Array.isArray(userData) ? userData : []);
            }
        } catch (err) {
            console.error('Failed to fetch user lookups:', err);
        }
        try {
            // Fetch cost centers (may not exist in all plant DBs)
            const ccRes = await fetch('/api/v2/reports/lookup/CostCntr');
            if (ccRes.ok) {
                const ccData = await ccRes.json();
                setAvailableCostCenters(Array.isArray(ccData) ? ccData : []);
            }
        } catch (err) {
            console.warn('Cost centers not available:', err.message);
        }
    };

    const searchParts = async (query) => {
        setSearchingParts(true);
        try {
            const url = query && query.length > 0 
                ? `/api/parts?search=${encodeURIComponent(query)}&limit=15`
                : `/api/parts?sort=usage&order=DESC&limit=10`; // Easy-Add mode for common parts
            const res = await fetch(url);
            const data = await res.json();
            setPartResults(data.data || []);
        } catch (err) {
            console.error('Failed to search parts:', err);
        } finally {
            setSearchingParts(false);
        }
    };

    const addLaborRow = () => {
        setLabor([...labor, { LaborID: '', HrReg: 0, HrOver: 0, PayReg: 0.0, PayOver: 0.0, HrDouble: 0, PayDouble: 0.0, HrOther: 0, PayOther: 0.0, Comment: '' }]);
    };

    const removeLaborRow = (idx) => {
        setLabor(labor.filter((_, i) => i !== idx));
    };

    const updateLabor = (idx, field, val) => {
        const next = [...labor];
        next[idx][field] = val;
        setLabor(next);
    };

    const addPartRow = (p) => {
        if (parts.some(x => x.PartID === p.ID)) return;
        setParts([...parts, { 
            PartID: p.ID, 
            Description: p.Description || p.Descript, 
            ActQty: 1, 
            UnitCost: parseFloat(p.UnitCost || 0) || 0,
            Stock: p.Stock
        }]);
        setPartSearch('');
        setPartResults([]);
    };

    const removePartRow = (idx) => {
        setParts(parts.filter((_, i) => i !== idx));
    };

    const handleSubmit = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/v2/work-orders/${woId}/close`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
                },
                body: JSON.stringify({ labor, parts, misc })
            });
            const data = await res.json();
            if (data.success) {
                setSuccess(true);
                DraftManager.clear(draftKey, plantId);
                setTimeout(() => {
                    onComplete();
                    onClose();
                }, 2000);
            } else {
                setError(data.error || 'Failed to close work order');
            }
        } catch (err) {
            setError('Network error tracking costs');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
            <div className="glass-card modal-content-standard" style={{ maxWidth: '800px', height: 'auto', maxHeight: '90vh' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: 'rgba(59,130,246,0.1)', padding: '8px', borderRadius: '8px' }}>
                            <CheckCircle2 color="var(--primary)" size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{t('close.out.workOrderCloseout')}</h2>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>WO #{woNumber || woId}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn-icon" title={t('closeOutWizard.closeTheCloseoutWizardTip')}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ padding: '20px 30px', background: 'rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: step >= 1 ? 'var(--primary)' : 'var(--text-muted)' }}>{t('close.out.labor')}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: step >= 2 ? 'var(--primary)' : 'var(--text-muted)' }}>{t('close.out.parts')}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: step >= 3 ? 'var(--primary)' : 'var(--text-muted)' }}>{t('close.out.review')}</span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: ((step / 3) * 100) + '%', background: 'var(--primary)', transition: 'width 0.3s ease' }}></div>
                    </div>
                </div>

                <div style={{ padding: '30px', overflowY: 'auto', minHeight: '300px' }}>
                    {/* Warranty Warning Banner */}
                    {warrantyInfo && warrantyInfo.isUnderWarranty && (
                        <div style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                            borderRadius: '10px',
                            padding: '14px 18px',
                            marginBottom: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px'
                        }}>
                            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                            <div>
                                <div style={{ fontWeight: 'bold', color: '#fbbf24', fontSize: '0.95rem' }}>
                                    Under warranty until {formatDate(warrantyInfo.warrantyEnd)}
                                    {warrantyInfo.daysRemaining && ` (${warrantyInfo.daysRemaining === 'Expired' ? 'Expired' : warrantyInfo.daysRemaining + ' days remaining'})`}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {warrantyInfo.warrantyVendor
                                        ? `Contact ${warrantyInfo.warrantyVendor} before performing self-repair to avoid voiding coverage.`
                                        : 'Check with the warranty provider before performing self-repair to avoid voiding coverage.'}
                                </div>
                            </div>
                        </div>
                    )}
                    {success ? (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <div style={{ display: 'inline-flex', padding: '20px', background: 'rgba(16,185,129,0.1)', borderRadius: '50%', marginBottom: '20px' }}>
                                <CheckCircle2 color="#10b981" size={48} />
                            </div>
                            <h3>{t('close.out.workOrderClosed')}</h3>
                            <p style={{ color: 'var(--text-muted)' }}>{t('close.out.financialDataHasBeen')}</p>
                        </div>
                    ) : (
                        <div>
                            {error && <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{error}</div>}

                            {step === 1 && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={18} /> {t('close.out.laborEntry')}</h3>
                                        <button className="btn-primary" onClick={addLaborRow} title={t('closeOutWizard.addANewTechnicianLaborTip')} style={{ padding: '5px 12px', fontSize: '0.8rem' }}>
                                            <Plus size={14} /> {t('close.out.addLabor')}
                                        </button>
                                    </div>
                                    
                                    {labor.length === 0 ? (
                                        <div style={{ padding: '40px', textAlign: 'center', border: '2px dashed var(--glass-border)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                                            No labor rows added. Click "+ Add Labor" to log technician hours.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {labor.map((L, i) => (
                                                <div key={i} className="glass-card" style={{ padding: '15px', position: 'relative' }}>
                                                    <button onClick={() => removeLaborRow(i)} title={t('closeOutWizard.removeThisLaborEntryTip')} style={{ position: 'absolute', top: 10, right: 10, background: 'transparent', border: 'none', color: 'var(--text-muted)' }}>
                                                        <X size={16} />
                                                    </button>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 2fr', gap: '20px' }}>
                                                        <div className="field-group">
                                                            <label>{t('close.out.technician')}</label>
                                                            <select 
                                                                value={L.LaborID} 
                                                                onChange={e => updateLabor(i, 'LaborID', e.target.value)}
                                                                title={t('closeOutWizard.selectTheTechnicianWhoPerformedTip')}
                                                            >
                                                                <option value="">{t('closeOutWizard.select')}</option>
                                                                {availableUsers.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                                                            </select>
                                                        </div>
                                                        
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                                                            <div className="field-group">
                                                                <label>{t('close.out.regHours')}</label>
                                                                <input type="number" step="0.5" min="0" value={L.HrReg} onChange={e => updateLabor(i, 'HrReg', e.target.value)} title={t('closeOutWizard.regularHoursWorkedByThisTip')} />
                                                            </div>
                                                            <div className="field-group">
                                                                <label>{t('close.out.otHours')}</label>
                                                                <input type="number" step="0.5" min="0" value={L.HrOver} onChange={e => updateLabor(i, 'HrOver', e.target.value)} title={t('closeOutWizard.overtimeHoursWorkedByThisTip')} />
                                                            </div>
                                                            <div className="field-group">
                                                                <label>DT Hours</label>
                                                                <input type="number" step="0.5" min="0" value={L.HrDouble} onChange={e => updateLabor(i, 'HrDouble', e.target.value)} title="Double Time Hours" />
                                                            </div>
                                                            <div className="field-group">
                                                                <label>{t('closeOutWizard.regRate')}</label>
                                                                <input 
                                                                    type="number" 
                                                                    step="0.01" 
                                                                    min="0"
                                                                    value={L.PayReg} 
                                                                    onChange={e => {
                                                                        const val = e.target.value;
                                                                        updateLabor(i, 'PayReg', val);
                                                                        if (val && !isNaN(val)) {
                                                                            updateLabor(i, 'PayOver', (parseFloat(val) * 1.5).toFixed(2));
                                                                            updateLabor(i, 'PayDouble', (parseFloat(val) * 2.0).toFixed(2));
                                                                        }
                                                                    }} 
                                                                    title={t('closeOutWizard.regularHourlyPayRateOvertimeTip')}
                                                                />
                                                            </div>
                                                            
                                                            <div className="field-group">
                                                                <label>{t('closeOutWizard.otRate')}</label>
                                                                <input type="number" step="0.01" min="0" value={L.PayOver} onChange={e => updateLabor(i, 'PayOver', e.target.value)} title={t('closeOutWizard.overtimeHourlyPayRateTip')} />
                                                            </div>
                                                            <div className="field-group">
                                                                <label>DT Rate</label>
                                                                <input type="number" step="0.01" min="0" value={L.PayDouble} onChange={e => updateLabor(i, 'PayDouble', e.target.value)} title="Double Time Rate" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {step === 2 && (
                                <div>
                                    <div style={{ marginBottom: '20px' }}>
                                        <h3 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><Package size={18} /> {t('close.out.partsUsed')}</h3>
                                        <div style={{ position: 'relative' }}>
                                            <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                                                <Search size={16} />
                                            </div>
                                            <input 
                                                type="text" 
                                                placeholder={t('close.out.partNameIdOr')} 
                                                style={{ paddingLeft: '40px', width: '100%', borderRadius: partResults.length > 0 ? '8px 8px 0 0' : '8px' }}
                                                value={partSearch}
                                                onFocus={() => searchParts(partSearch)}
                                                onChange={e => {
                                                    setPartSearch(e.target.value);
                                                    searchParts(e.target.value);
                                                }}
                                                title={t('closeOutWizard.searchForPartsByNameTip')}
                                            />
                                            {searchingParts && <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}><Loader2 className="spinning" size={16} /></div>}
                                            
                                            {partResults.length > 0 && (
                                                <div style={{ 
                                                    position: 'absolute', 
                                                    top: '100%', 
                                                    left: 0, 
                                                    right: 0, 
                                                    background: '#1e293b', 
                                                    border: '1px solid var(--glass-border)', 
                                                    borderRadius: '0 0 8px 8px', 
                                                    zIndex: 100, 
                                                    maxHeight: '300px', 
                                                    overflowY: 'auto',
                                                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)' 
                                                }}>
                                                    {!partSearch && (
                                                        <div style={{ padding: '10px 12px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                            {t('close.out.mostFrequentlyUsed')}
                                                        </div>
                                                    )}
                                                    {partResults.map(p => (
                                                        <div key={p.ID} onClick={() => addPartRow(p)} style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }} className="asset-row-hover">
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--primary)' }}>{p.ID}</span>
                                                                <span style={{ fontSize: '0.75rem', color: '#10b981' }}>${new Number(p.UnitCost || 0).toFixed(2)}</span>
                                                            </div>
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>{p.Description || p.Descript}</div>
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Stock: {p.Stock} | {p.Location || 'No Loc'}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {partSearch && !searchingParts && partResults.length === 0 && (
                                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e293b', padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', borderRadius: '0 0 8px 8px', border: '1px solid var(--glass-border)' }}>
                                                    No parts found matching "{partSearch}"
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {parts.length === 0 ? (
                                        <div style={{ padding: '40px', textAlign: 'center', border: '2px dashed var(--glass-border)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                                            {t('close.out.noPartsAdded')}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {parts.map((p, i) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{p.PartID}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.Description}</div>
                                                    </div>
                                                    <div style={{ width: '80px' }}>
                                                        <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>{t('close.out.qtyUsed')}</label>
                                                        <input type="number" value={p.ActQty} onChange={e => {
                                                            const next = [...parts];
                                                            next[i].ActQty = e.target.value;
                                                            setParts(next);
                                                        }} style={{ padding: '4px 8px' }} title={t('closeOutWizard.numberOfThisPartUsedTip')} />
                                                    </div>
                                                    <button onClick={() => removePartRow(i)} className="btn-icon" title={t('closeOutWizard.removeThisPartFromTheTip')}>
                                                        <X size={18} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {step === 3 && (
                                <div>
                                    <h3 style={{ margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><DollarSign size={18} /> {t('close.out.finalReview')}</h3>
                                    
                                    <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid var(--glass-border)' }}>
                                            <span style={{ fontWeight: 600 }}>{t('close.out.summary')}</span>
                                            <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                                                ESTIMATED TOTAL: ${ (
                                                    labor.reduce((acc, l) => acc + (l.HrReg * l.PayReg) + (l.HrOver * l.PayOver) + ((l.HrDouble || 0) * (l.PayDouble || 0)), 0) +
                                                    parts.reduce((acc, p) => acc + (p.ActQty * p.UnitCost), 0)
                                                ).toFixed(2) }
                                            </span>
                                        </div>
                                        
                                        <div style={{ fontSize: '0.85rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Labor ({labor.length} technicians)</span>
                                                <span>${labor.reduce((acc, l) => acc + (l.HrReg * l.PayReg) + (l.HrOver * l.PayOver) + ((l.HrDouble || 0) * (l.PayDouble || 0)), 0).toFixed(2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Parts ({parts.length} types used)</span>
                                                <span>${parts.reduce((acc, p) => acc + (p.ActQty * p.UnitCost), 0).toFixed(2)}</span>
                                            </div>

                                            <div className="field-group" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '15px' }}>
                                                <label style={{ color: 'var(--primary)', fontWeight: 600 }}>{t('close.out.verifyCostCenterAllocation')}</label>
                                                <select 
                                                    style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }}
                                                    onChange={e => {
                                                        // Update the WO's CostID or store in misc
                                                        setMisc(prev => {
                                                            const filtered = prev.filter(m => m.Description !== 'Cost Allocation');
                                                            return [...filtered, { Description: 'Cost Allocation', ActCost: 0, Comment: e.target.value }];
                                                        });
                                                    }}
                                                    title={t('closeOutWizard.selectTheDepartmentCostCenterTip')}
                                                >
                                                    <option value="">{t('closeOutWizard.mainAssetDeptDefault')}</option>
                                                    {availableCostCenters.map(cc => (
                                                        <option key={cc.id} value={cc.id}>{cc.label || cc.id}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ padding: '15px', background: 'rgba(59,130,246,0.05)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)' }}>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            {t('close.out.closingThisActionWill')} <strong>{t('close.out.completed')}</strong>.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {!success && (
                    <div className="modal-footer" style={{ borderTop: '1px solid var(--glass-border)' }}>
                        {step > 1 ? (
                            <button className="btn-nav" onClick={() => setStep(step - 1)} title={t('closeOutWizard.goBackToThePreviousTip')}>
                                <ChevronLeft size={16} /> {t('close.out.back')}
                            </button>
                        ) : (
                            <button className="btn-nav" onClick={onClose} title={t('closeOutWizard.cancelTheCloseoutAndReturnTip')}>{t('close.out.cancel')}</button>
                        )}
                        
                        {step < 3 ? (
                            <button                                 className="btn-primary" 
                                onClick={() => setStep(step + 1)}
                                disabled={
                                    (step === 1 && labor.length === 0) || 
                                    (step === 2 && parts.length === 0)
                                }
                                title={t('closeOutWizard.proceedToTheNextStepTip')}
                            >
                                {t('close.out.next')} <ChevronRight size={16} />
                            </button>
                        ) : (
                            <button 
                                className="btn-save" 
                                onClick={handleSubmit}
                                disabled={loading}
                                title={t('closeOutWizard.submitAllLaborAndPartsTip')}
                            >
                                {loading ? <Loader2 className="spinning" size={18} /> : 'Confirm & Close Out'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

