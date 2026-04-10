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
import { Settings2, Search, ArrowUpDown, Save, RefreshCw, AlertCircle, Info, X, CheckCircle, Scan } from 'lucide-react';
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
    const [rapidScanMode, setRapidScanMode] = useState(false);
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
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                        onClick={() => setRapidScanMode(true)}
                        className="btn-nav" 
                        style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
                        title="Enable Smart Scanning workflow"
                    >
                        <Scan size={18} /> Smart Scanner Mode
                    </button>
                    <button 
                        onClick={() => setShowHelp(true)}
                        className="btn-primary" 
                        style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid var(--primary)', borderRadius: '50%', width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title={t('inventory.adjustments.howDoAdjustmentsWork')}
                    >
                        <Info size={20} />
                    </button>
                </div>
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
        {rapidScanMode && <SmartScannerModal onClose={() => setRapidScanMode(false)} />}
        </>
    );
}

function SmartScannerModal({ onClose }) {
    const { t } = useTranslation();
    const [logs, setLogs] = useState([]);
    const [adjustmentType, setAdjustmentType] = useState('6'); // Default physical count
    const [activePart, setActivePart] = useState(null);
    const [pendingQty, setPendingQty] = useState(1);
    
    // We need refs to access the latest state inside the hardware scanner callback
    const activePartRef = React.useRef(activePart);
    const pendingQtyRef = React.useRef(pendingQty);
    const adjTypeRef = React.useRef(adjustmentType);
    const inputRef = React.useRef(null);
    
    useEffect(() => {
        activePartRef.current = activePart;
        pendingQtyRef.current = pendingQty;
        adjTypeRef.current = adjustmentType;
    }, [activePart, pendingQty, adjustmentType]);

    const submitAdjustment = async (part, qty, type) => {
        if (!part) return;
        try {
            const adjRes = await fetch(`/api/parts/${encodeURIComponent(part.ID)}/adjust`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}`, 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1' },
                body: JSON.stringify({
                    qty: parseFloat(qty),
                    type: type,
                    reason: `Smart Scanner`,
                    newCost: parseFloat(part.UnitCost || 0)
                })
            });
            
            if (adjRes.ok) {
                setLogs(prev => [{ time: new Date().toLocaleTimeString(), code: part.ID, status: `Saved ${qty > 0 ? '+' : ''}${qty}. New Stock: ${part.Stock + parseFloat(qty)}`, success: true }, ...prev]);
                if (navigator.vibrate) navigator.vibrate(150);
            } else {
                const err = await adjRes.json();
                setLogs(prev => [{ time: new Date().toLocaleTimeString(), code: part.ID, status: 'Failed: ' + err.error, success: false }, ...prev]);
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
        } catch (err) {
            setLogs(prev => [{ time: new Date().toLocaleTimeString(), code: part.ID, status: 'Network error', success: false }, ...prev]);
        }
    };

    const handleManualSubmit = () => {
        if (activePartRef.current) {
            submitAdjustment(activePartRef.current, pendingQtyRef.current, adjTypeRef.current);
            setActivePart(null);
            setPendingQty(1);
        }
    };

    useEffect(() => {
        window.trierActiveScannerInterceptor = true;
        
        const handleScan = async (e) => {
            const code = e.detail;
            
            // 1. If there's an active part pending, AUTO-SAVE IT FIRST using the current typed quantity
            if (activePartRef.current) {
                await submitAdjustment(activePartRef.current, pendingQtyRef.current, adjTypeRef.current);
            }
            
            // 2. Fetch the newly scanned part
            try {
                const searchRes = await fetch(`/api/parts?search=${encodeURIComponent(code)}&field=VendorPartNumber&match=exact`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}`, 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1' } 
                });
                let parts = [];
                if (searchRes.ok) parts = await searchRes.json();
                
                if (!parts || parts.length === 0) {
                    const broadRes = await fetch(`/api/parts/${encodeURIComponent(code)}`, {
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}`, 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1' }
                    });
                    if (broadRes.ok) parts = [await broadRes.json()];
                }
                
                const part = parts && parts.length > 0 ? parts[0] : null;
                
                if (!part) {
                    setLogs(prev => [{ time: new Date().toLocaleTimeString(), code, status: 'Part not found in system', success: false }, ...prev]);
                    if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
                    setActivePart(null);
                    return;
                }
                
                // 3. Set the new part as active and wait for qty input or next scan!
                setActivePart(part);
                setPendingQty(1); // default sequence
                
                // 4. Auto focus the input field so they can immediately type a number
                setTimeout(() => {
                    if (inputRef.current) {
                        inputRef.current.focus();
                        inputRef.current.select();
                    }
                }, 50);
                
            } catch (err) {
                setLogs(prev => [{ time: new Date().toLocaleTimeString(), code, status: 'Network error fetching part', success: false }, ...prev]);
            }
        };
        
        window.addEventListener('hw-scan-inject', handleScan);
        return () => {
            window.trierActiveScannerInterceptor = false;
            window.removeEventListener('hw-scan-inject', handleScan);
        };
    }, []);

    return (
        <div className="modal-overlay" style={{ zIndex: 11000, background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
            <div className="glass-card" style={{ maxWidth: 600, width: '90%', margin: '0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '20px 25px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, transparent 100%)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ background: '#10b981', color: '#fff', padding: 8, borderRadius: '50%', display: 'flex' }}>
                            <Scan size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Smart Scanner Mode</h2>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Scan item → Type quantity → Scan next item (auto-saves)</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn-nav" title="Close" style={{ border: 'none', background: 'transparent' }}><X size={24} /></button>
                </div>
                
                <div style={{ padding: '30px 25px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 10 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 600 }}>
                            Context Action:
                            <select value={adjustmentType} onChange={e => setAdjustmentType(e.target.value)} style={{ padding: '6px', borderRadius: '6px' }}>
                                <option value="6">Physical Cycle Count</option>
                                <option value="1">Receipt / Receiving</option>
                                <option value="3">Positive Audit</option>
                                <option value="5">Scrap / Defective</option>
                            </select>
                        </label>
                    </div>
                    
                    <div style={{ background: 'var(--bg-lighter)', padding: '20px', borderRadius: 12, border: `2px dashed ${activePart ? '#f59e0b' : '#10b981'}`, textAlign: 'center', minHeight: 120, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                        {!activePart ? (
                            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                Ready. Scan an item barcode.
                            </div>
                        ) : (
                            <div style={{ width: '100%' }}>
                                <div style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 800 }}>VEND: {activePart.VendorName || '--'}</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', marginBottom: 5 }}>[{activePart.ID}]</div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 20 }}>{activePart.Description}</div>
                                
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 15 }}>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Quantity to {adjustmentType === '1' ? 'Receive' : 'Adjust'}:</span>
                                    <input 
                                        ref={inputRef}
                                        type="number" 
                                        step="any"
                                        value={pendingQty} 
                                        onChange={e => setPendingQty(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleManualSubmit(); }}
                                        style={{ width: '100px', fontSize: '1.5rem', fontWeight: 'bold', textAlign: 'center', padding: '10px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '2px solid #f59e0b', borderRadius: '8px' }}
                                    />
                                </div>
                                <div style={{ marginTop: 15, fontSize: '0.85rem', color: '#f59e0b', fontWeight: 600 }}>
                                    Type number. Then scan NEXT ITEM to auto-save, or press ENTER.
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Smart Session Logs:</h4>
                        <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: 8, height: 180, overflowY: 'auto' }}>
                            {logs.length === 0 ? (
                                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Waiting for scans...</div>
                            ) : (
                                logs.map((lg, i) => (
                                    <div key={i} style={{ padding: '10px 15px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lg.time}</span>
                                        <span style={{ fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>[{lg.code}]</span>
                                        <span style={{ color: lg.success ? '#10b981' : '#ef4444', fontSize: '0.85rem' }}>{lg.status}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
                
                <div style={{ padding: '15px 25px', borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Active sequence saves on blur or new scan.</div>
                    <button className="btn-nav" onClick={onClose}>Finish & Close</button>
                </div>
            </div>
        </div>
    );
}

