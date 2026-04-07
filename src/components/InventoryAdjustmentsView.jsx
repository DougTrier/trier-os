// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Inventory Adjustments
 * ==================================
 * Records and tracks all storeroom inventory adjustments: cycle counts,
 * shrinkage, receiving corrections, and manual quantity edits. Every
 * adjustment creates an audit trail entry with reason code and approver.
 *
 * ADJUSTMENT TYPES:
 *   Cycle Count      — Physical count result reconciled against system quantity
 *   Shrinkage        — Unexplained loss flagged for investigation
 *   Receiving        — Quantity correction on a received purchase order line
 *   Manual Adjust    — Admin override with required justification comment
 *   WO Consumption   — Automatic deduction when parts consumed on a WO close-out
 *   Return to Stock  — Parts returned from a WO or project back to storeroom
 *
 * KEY FEATURES:
 *   - Adjustment log: all changes with part, qty delta, reason, user, and timestamp
 *   - Reason code picker: standardized reason codes for consistent reporting
 *   - Approver tracking: high-value adjustments require supervisor sign-off
 *   - Search and filter: by part number, reason, date range, or approver
 *   - Voice note input: PushToTalkButton for hands-free justification entry
 *   - Export: CSV download of adjustment log for inventory audits
 *
 * API CALLS:
 *   GET  /api/storeroom/adjustments          — Load adjustment history
 *   POST /api/storeroom/adjustments          — Record new adjustment
 */
import React, { useState, useEffect } from 'react';
import { Settings2, Search, ArrowUpDown, Save, RefreshCw, AlertCircle, Info, X, CheckCircle } from 'lucide-react';
import SmartDialog from './SmartDialog';
import PushToTalkButton from './PushToTalkButton';
import { useTranslation } from '../i18n/index.jsx';

export default function InventoryAdjustmentsView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [adjTypes, setAdjTypes] = useState([]);
    const [partId, setPartId] = useState('');
    const [selectedPart, setSelectedPart] = useState(null);
    const [loadingPart, setLoadingPart] = useState(false);
    const [qty, setQty] = useState(0);
    const [newCost, setNewCost] = useState('');
    const [adjType, setAdjType] = useState('6'); // Default to Physical (Code 6)
    const [note, setNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const [showHelp, setShowHelp] = useState(false);
    const [dialog, setDialog] = useState(null);

    const activeUserRole = localStorage.getItem('userRole') || 'technician';
    const isCreator = localStorage.getItem('PF_USER_IS_CREATOR') === 'true';
    const isAdminOrCreator = ['it_admin', 'creator'].includes(activeUserRole) || isCreator;

    useEffect(() => {
        fetch('/api/v2/lookups/adj-types')
            .then(r => r.ok ? r.json() : Promise.resolve([]))
            .then(data => {
                setAdjTypes(data || []);
                if (data && data.length > 0 && data[0].id) setAdjType(data[0].id.toString());
            })
            .catch(err => console.error('Error fetching adjustment types:', err));
    }, []);

    const fetchPart = async () => {
        if (!partId) return;
        setLoadingPart(true);
        try {
            const res = await fetch(`/api/parts/${encodeURIComponent(partId)}`);
            const data = await res.json();
            if (res.ok) {
                setSelectedPart(data);
                setNewCost(data.UnitCost || '');
            } else {
                setSelectedPart(null);
                setMessage({ type: 'error', text: 'Part not found' });
            }
        } catch (err) {
            console.error('Error fetching part:', err);
            setMessage({ type: 'error', text: 'Network error' });
        } finally {
            setLoadingPart(false);
        }
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!selectedPart || isSaving) return;

        // Verification Prompt for Corporate/IT users
        if (isAdminOrCreator) {
            setDialog({
                type: 'question',
                title: 'Multi-Site Verification',
                message: `You are about to apply an inventory adjustment to the [${plantLabel}] database. Is this correct?`,
                confirmLabel: 'Yes, Apply Adjustment',
                onConfirm: () => performSave(),
                onCancel: () => setDialog(null)
            });
            return;
        }

        await performSave();
    };

    const performSave = async () => {
        setDialog(null);
        setIsSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/parts/${encodeURIComponent(selectedPart.ID)}/adjust`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qty: parseFloat(qty),
                    type: adjType,
                    reason: note,
                    newCost: parseFloat(newCost)
                })
            });

            if (res.ok) {
                const impactText = adjType === '4' 
                    ? `New Unit Cost: $${newCost}` 
                    : `New Calculated Stock: ${selectedPart.Stock + parseFloat(qty)}`;
                
                setMessage({ type: 'success', text: `Successfully adjusted ${selectedPart.ID}. ${impactText}` });
                setQty(0);
                setNote('');
                // Refresh part data
                fetchPart();
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Failed to save adjustment' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Network error saving adjustment' });
        } finally {
            setIsSaving(false);
        }
    };

    const isCostChange = String(adjType) === '4';

    return (
        <>
        <div className="glass-card" style={{ flex: 1, padding: '30px', display: 'flex', flexDirection: 'column', gap: '25px', overflowY: 'auto', position: 'relative' }}>
            

            <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                        <Settings2 size={24} color="var(--primary)" /> {t('inventory.adjustments.inventoryAdjustmentsPartadj')}
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '5px' }}>
                        {t('inventory.adjustments.recordPhysicalCountsReceipts')}
                    </p>
                </div>
                <button 
                    onClick={() => setShowHelp(true)}
                    className="btn-primary" 
                    style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid var(--primary)', borderRadius: '50%', width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title={t('inventory.adjustments.howDoAdjustmentsWork')}
                >
                    <Info size={20} />
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '30px' }}>
                {/* Left Side: Part Picker */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="panel-box">
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{t('inventory.adjustments.targetPart')}</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input 
                                type="text" 
                                value={partId} 
                                onChange={e => setPartId(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && fetchPart()}
                                placeholder={t('inventory.adjustments.enterPartSku')}
                                style={{ flex: 1 }}
                                title={t('inventory.adjustments.enterAPartNumber')}
                            />
                            <button className="btn-primary" onClick={fetchPart} disabled={loadingPart} title={t('inventory.adjustments.executePartLookupIn')}>
                                {loadingPart ? <RefreshCw className="spinning" size={18} /> : <Search size={18} />}
                            </button>
                        </div>
                    </div>

                    {selectedPart && (
                        <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <div style={{ fontWeight: 'bold', color: 'var(--primary)', marginBottom: '5px' }}>{selectedPart.ID}</div>
                            <div style={{ fontSize: '0.9rem', marginBottom: '15px' }}>{selectedPart.Description}</div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', borderTop: '1px solid var(--glass-border)', paddingTop: '10px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>{t('inventory.adjustments.currentStock')}</span>
                                <span style={{ fontWeight: 'bold' }}>{selectedPart.Stock} {selectedPart.UOM}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '5px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>{t('inventory.adjustments.location')}</span>
                                <span style={{ color: 'var(--primary)' }}>{selectedPart.Location || 'Unassigned'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '5px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>{t('inventory.adjustments.unitCost')}</span>
                                <span style={{ fontWeight: 'bold' }}>${selectedPart.UnitCost || '0.00'}</span>
                            </div>
                        </div>
                    )}

                    {message && (
                        <div style={{ 
                            padding: '18px', 
                            borderRadius: '12px', 
                            background: message.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            border: `2px solid ${message.type === 'error' ? '#ef4444' : '#10b981'}`,
                            display: 'flex',
                            gap: '15px',
                            animation: 'slideIn 0.3s ease-out'
                        }}>
                            <div style={{ 
                                background: message.type === 'error' ? '#ef4444' : '#10b981', 
                                width: '40px', 
                                height: '40px', 
                                borderRadius: '50%', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                {message.type === 'error' ? <AlertCircle size={22} color="#fff" /> : <CheckCircle size={22} color="#fff" />}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold', color: message.type === 'error' ? '#f87171' : '#34d399', fontSize: '1.05rem', marginBottom: '4px' }}>
                                    {message.type === 'error' ? 'Adjustment Failed' : 'Adjustment Applied'}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                    {message.text}
                                </div>
                            </div>
                            <button onClick={() => setMessage(null)} title={t('inventoryAdjustmentsView.dismissThisMessageTip')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', alignSelf: 'flex-start' }}>
                                <X size={18} />
                            </button>
                        </div>
                    )}
                </div>


                {/* Right Side: Adjustment Form */}
                <div style={{ opacity: selectedPart ? 1 : 0.5, pointerEvents: selectedPart ? 'auto' : 'none' }}>
                    <form onSubmit={handleSave} className="panel-box" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            {!isCostChange ? (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{t('inventory.adjustments.adjustmentQuantity')}</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <input 
                                            type="number" 
                                            step="any"
                                            value={qty === 0 ? '' : qty} 
                                            onChange={e => setQty(e.target.value)}
                                            style={{ flex: 1, fontSize: '1.2rem', fontWeight: 'bold' }}
                                            required
                                            title={t('inventory.adjustments.forPhysicalCountsEnter')}
                                        />
                                        <span style={{ color: 'var(--text-muted)' }}>{selectedPart?.UOM || 'Units'}</span>
                                    </div>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '5px' }}>
                                        {t('inventory.adjustments.usePositiveNumbersTo')}
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{t('inventory.adjustments.newUnitCost')}</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>$</span>
                                        <input 
                                            type="number" 
                                            step="0.01"
                                            value={newCost === 0 ? '' : newCost} 
                                            onChange={e => setNewCost(e.target.value)}
                                            style={{ flex: 1, fontSize: '1.2rem', fontWeight: 'bold' }}
                                            placeholder="0.00"
                                            required
                                            title={t('inventoryAdjustmentsView.enterTheCorrectedUnitCostTip')}
                                        />
                                    </div>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '5px' }}>
                                        {t('inventory.adjustments.updatingThisWillReset')}
                                    </p>
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{t('inventory.adjustments.adjustmentType')}</label>
                                <select 
                                    value={adjType} 
                                    onChange={e => setAdjType(e.target.value)}
                                    style={{ width: '100%', height: '42px' }}
                                    title={t('inventory.adjustments.physicalManualCountReceipt')}
                                >
                                    {adjTypes.map(adj => (
                                        <option key={adj.id} value={adj.id}>{adj.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>{t('inventory.adjustments.narrativeReasonForChange')}</label>
                                <PushToTalkButton 
                                    onResult={(text) => setNote(prev => prev + ' ' + text)}
                                />
                            </div>
                            <textarea 
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                placeholder={t('inventory.adjustments.egMonthlyCycleCount')}
                                style={{ width: '100%', minHeight: '80px' }}
                                title={t('inventory.adjustments.provideContextForThe')}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                            <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                <ArrowUpDown size={18} />
                                <span>
                                    {isCostChange 
                                        ? <span>{t('inventory.adjustments.costImpact')} <strong>${parseFloat(newCost) || 0}</strong> / unit</span>
                                        : <span>{t('inventory.adjustments.impact')} <strong>{selectedPart ? selectedPart.Stock + (parseFloat(qty) || 0) : '--'}</strong> {t('inventoryAdjustmentsView.totalUnits')}</span>
                                    }
                                </span>
                            </div>
                            <button type="submit" className="btn-save" title={t('inventoryAdjustmentsView.applyThisAdjustmentToTheTip')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 25px' }} disabled={isSaving || !selectedPart}>
                                <Save size={18} /> {isSaving ? 'Processing...' : 'Apply Adjustment'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        {/* Help Modal */}
        {showHelp && (
            <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => setShowHelp(false)}>
                <div className="glass-card modal-content-standard" style={{ maxWidth: '600px', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '25px 30px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
                        <h2 style={{ margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <Info size={28} /> {t('inventory.adjustments.howAdjustmentsWork')}
                        </h2>
                        <button onClick={() => setShowHelp(false)} title={t('inventoryAdjustmentsView.closeHelpGuideTip')} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                            <X size={24} />
                        </button>
                    </div>

                    <div style={{ flex: 1, padding: '30px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '25px', lineHeight: '1.6' }}>
                        <section>
                            <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ArrowUpDown size={18} color="var(--primary)" /> 1. The "Difference" Rule
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '12px' }}>
                                {t('inventory.adjustments.alwaysEnterThe')} <strong>{t('inventoryAdjustmentsView.difference')}</strong> between what is on the shelf and what is on the screen.
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '8px' }}>
                                    <div style={{ color: '#10b981', fontWeight: 'bold', marginBottom: '4px' }}>Positive (+) Numbers</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('inventory.adjustments.useWhenYou')} <strong>{t('inventoryAdjustmentsView.found')}</strong> {t('inventoryAdjustmentsView.morePartsThanTheSystem')}</div>
                                </div>
                                <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '8px' }}>
                                    <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: '4px' }}>{t('inventory.adjustments.negativeNumbers')}</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('inventory.adjustments.useWhenYou')} <strong>{t('inventoryAdjustmentsView.lostused')}</strong> {t('inventoryAdjustmentsView.partsThatWerentRecorded')}</div>
                                </div>
                            </div>
                        </section>

                        <section style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                            <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '15px' }}>2. Common Scenarios</h3>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div className="panel-box" style={{ background: 'rgba(255,255,255,0.02)', padding: '15px' }}>
                                    <div style={{ fontWeight: 'bold', color: 'var(--primary)', marginBottom: '5px' }}>{t('inventory.adjustments.scenarioTheBinAudit')}</div>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                        <em>"The screen says I have 10 O-Rings, but I just counted them and there are actually 12."</em>
                                        <br /><br />
                                        <strong>{t('inventory.adjustments.action')}</strong> {t('inventory.adjustments.enter')} <code>2</code> {t('inventoryAdjustmentsView.andSelect')} <span style={{ color: '#fff' }}>{t('inventory.adjustments.physical')}</span>.
                                    </p>
                                </div>

                                <div className="panel-box" style={{ background: 'rgba(255,255,255,0.02)', padding: '15px' }}>
                                    <div style={{ fontWeight: 'bold', color: 'var(--primary)', marginBottom: '5px' }}>{t('inventory.adjustments.scenarioEmergencyFloorUsage')}</div>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                        <em>"I used 1 gallon of Coolant for a spill. I didn't have time to make a Work Order."</em>
                                        <br /><br />
                                        <strong>{t('inventory.adjustments.action')}</strong> {t('inventory.adjustments.enter')} <code>-1</code> {t('inventoryAdjustmentsView.andSelect')} <span style={{ color: '#fff' }}>{t('inventory.adjustments.issue')}</span>.
                                    </p>
                                </div>

                                <div className="panel-box" style={{ background: 'rgba(255,255,255,0.02)', padding: '15px' }}>
                                    <div style={{ fontWeight: 'bold', color: 'var(--primary)', marginBottom: '5px' }}>{t('inventory.adjustments.scenarioLocalPickupReceipt')}</div>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                        <em>"I ran to the hardware store and bought 5 bolts. There is no official Purchase Order (PO) for this."</em>
                                        <br /><br />
                                        <strong>{t('inventory.adjustments.action')}</strong> {t('inventory.adjustments.enter')} <code>5</code> {t('inventoryAdjustmentsView.andSelect')} <span style={{ color: '#fff' }}>{t('inventory.adjustments.receipt')}</span>.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                            <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '8px' }}>3. Advanced Types</h3>
                            <ul style={{ paddingLeft: '20px', color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <li><strong>{t('inventory.adjustments.onHand')}</strong> {t('inventory.adjustments.usedForBulkResets')}</li>
                                <li><strong>{t('inventory.adjustments.changeCost')}</strong> Used specifically when the inventory count is right, but the dollar value per unit needs correction.</li>
                                <li><strong>{t('inventory.adjustments.onOrder')}</strong> {t('inventoryAdjustmentsView.usedToManuallyAdjustThe')}</li>
                            </ul>
                        </section>
                    </div>


                    <div className="modal-footer" style={{ flexShrink: 0, padding: '20px 30px' }}>
                        <button className="btn-primary" onClick={() => setShowHelp(false)} title={t('inventoryAdjustmentsView.closeTheHelpGuideTip')} style={{ width: '100%' }}>
                            {t('inventory.adjustments.gotItThanks')}
                        </button>
                    </div>
                </div>
            </div>
        )}
        {dialog && <SmartDialog {...dialog} />}
        </>
    );
}

