// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — New Plant Onboarding Wizard
 * ========================================
 * Multi-step wizard for setting up a new plant facility from scratch.
 * Guides admins through naming, leadership, departments, locations,
 * initial asset import, and PM schedule configuration.
 *
 * WIZARD STEPS:
 *   1. Plant Details    — Name, address, plant code, timezone, currency
 *   2. Leadership       — Plant Manager, Maintenance Manager, key contacts
 *   3. Departments      — Define maintenance departments and crew structure
 *   4. Locations        — Build location hierarchy (Area → Zone → Station)
 *   5. Asset Import     — Import existing asset list from CSV or master catalog
 *   6. PM Configuration — Set up initial PM schedules from templates
 *   7. Complete         — Review summary and activate the plant
 *
 * KEY FEATURES:
 *   - Step progress bar with jump-to-step navigation
 *   - Import mode: supports CSV, catalog search, or blank slate setup
 *   - Catalog search: pull equipment from corporate_master.db catalog
 *   - Validation: each step validates before advancing; errors shown inline
 *   - Cancel safe: partial data is saved as draft; resumes on re-open
 *
 * @param {Function} onClose     — Dismiss wizard without completing
 * @param {string}   plantId     — Plant being configured (new or existing)
 * @param {string}   plantLabel  — Plant display name shown in wizard heading
 * @param {string}   mode        — 'import' | 'fresh' | 'catalog'
 */
import React, { useState, useEffect, useRef } from 'react';
import { X, Globe, Package, HardHat, BookOpen, Download, Search, CheckCircle2, ChevronRight, Trash2, Info, Plus, Barcode, Building2, Wrench, Layers } from 'lucide-react';
import SearchBar from './SearchBar';
import { useTranslation } from '../i18n/index.jsx';

export default function OnboardingWizard({ onClose, plantId, plantLabel, mode = 'import' }) {
    const { t } = useTranslation();
    const isAuditMode = mode === 'audit';
    const [standardization, setStandardization] = useState(null);
    const [activeTab, setActiveTab] = useState('vendors'); // vendors, assets, sops, parts
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [items, setItems] = useState([]);
    const [selectedItems, setSelectedItems] = useState({}); // { [id]: { type: 'vendors', raw: {...} } }
    const [searchTerm, setSearchTerm] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    
    // Preview Management
    const [previewItem, setPreviewItem] = useState(null);
    const [previewDetails, setPreviewDetails] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    // ── Unlisted / manual entry state ─────────────────────────────────────────
    // unlistedType controls which form is shown; unlistedForm holds the field values.
    // unlistedQueue mirrors the unlisted subset of selectedItems for display in the
    // staged list — items are added to both simultaneously so the footer count stays
    // accurate and they import with the same batch as catalog selections.
    const [unlistedType, setUnlistedType] = useState('asset');  // 'vendor' | 'asset' | 'part'
    const [unlistedForm, setUnlistedForm] = useState({});
    const [unlistedQueue, setUnlistedQueue] = useState([]);      // staged unlisted items
    const [scanValue, setScanValue] = useState('');
    const [scanFeedback, setScanFeedback] = useState('');
    const scanInputRef = useRef(null);
    const searchTimerRef = useRef(null);

    useEffect(() => {
        fetchItems();
        if (isAuditMode) fetchStandardization();
    }, [activeTab]);

    // Server-side search for parts — client-side filter is insufficient for 647k records
    useEffect(() => {
        if (activeTab !== 'parts') return;
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(fetchItems, 450);
    }, [searchTerm]);

    const fetchStandardization = async () => {
        try {
            const res = await fetch('/api/logistics/site-standardization', {
                headers: { 'x-plant-id': plantId }
            });
            const data = await res.json();
            setStandardization(data);
        } catch (err) {
            console.error("Score fetch failed", err);
        }
    };

    const fetchItems = async () => {
        setLoading(true);
        setError(null);
        setItems([]);
        setPreviewItem(null);
        setPreviewDetails(null);
        try {
            const q = searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : '';
            let endpoint = '';
            if (activeTab === 'vendors') endpoint = `/api/catalog/onboarding/vendors?limit=300${q}`;
            if (activeTab === 'assets') endpoint = `/api/catalog/onboarding/equipment?limit=500${q}`;
            if (activeTab === 'sops')   endpoint = '/api/logistics/global-sops';
            if (activeTab === 'parts')  endpoint = `/api/catalog/onboarding/parts?limit=200${q}`;

            const res = await fetch(endpoint);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            let normalized = [];
            if (activeTab === 'vendors') {
                normalized = data.map(v => ({
                    id: v.VendorID,
                    title: v.CompanyName,
                    subtitle: [v.Region, v.Categories].filter(Boolean).join(' · ') || 'Master Vendor',
                    raw: v
                }));
            }
            if (activeTab === 'assets') {
                normalized = data.map(r => ({
                    id: r.EquipmentTypeID,
                    title: r.Description,
                    subtitle: (r.primaryMaker || 'Various') + ' | ' + (r.Category || 'Equipment'),
                    raw: r
                }));
            }
            if (activeTab === 'sops') {
                normalized = data.map(s => ({ id: s.ID, title: s.Description, subtitle: 'Standard Procedure', raw: s }));
            }
            if (activeTab === 'parts') {
                normalized = data.map(p => ({
                    id: p.MasterPartID,
                    title: p.StandardizedName || p.Description,
                    subtitle: (p.Manufacturer || 'N/A') + ' | ' + (p.Category || ''),
                    raw: p
                }));
            }

            setItems(normalized);
        } catch (err) {
            setError("Failed to load catalog items.");
        } finally {
            setLoading(false);
        }
    };

    const handlePreview = async (item) => {
        setPreviewItem(item);
        setLoadingPreview(true);
        setPreviewDetails(null);
        try {
            if (activeTab === 'vendors') {
                const res = await fetch(`/api/logistics/global-vendors/${encodeURIComponent(item.id)}`);
                setPreviewDetails(await res.json());
            } else if (activeTab === 'assets') {
                // Fetch typical parts linked to this equipment type
                const typRes = await fetch(`/api/catalog/equipment/${encodeURIComponent(item.id)}/typical-parts`);
                const typicalParts = typRes.ok ? await typRes.json() : [];
                setPreviewDetails({ ...item.raw, typicalParts });
            } else {
                setPreviewDetails(item.raw);
            }
        } catch (err) {
            console.error("Preview failed", err);
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleImport = async () => {
        const selectionArray = Object.values(selectedItems);
        if (selectionArray.length === 0) return;
        
        setIsImporting(true);
        setError(null);
        setSuccess(null);

        let successCount = 0;

        try {
            for (const item of selectionArray) {
                const type = item.type;
                const raw = item.raw;
                
                if (type === 'vendors') {
                    // Source: MasterVendors from mfg_master.db
                    const vendorData = {
                        ID: raw.VendorID,
                        Description: raw.CompanyName,
                        Phone: raw.Phone || '',
                        Website: raw.Website || '',
                        StandardEmail: raw.SalesRepEmail || '',
                        Address: raw.Address || '',
                        Vendor: 1
                    };
                    const res = await fetch('/api/v2/network/vendor/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                        body: JSON.stringify({ vendorData })
                    });
                    if (!res.ok) throw new Error("Vendor import failed");
                } else if (type === 'assets') {
                    // Source: MasterEquipment from mfg_master.db
                    const assetData = {
                        Description: raw.Description,
                        Model: raw.EquipmentTypeID,
                        Manufacturer: raw.primaryMaker || '',
                        AssetType: raw.Category || 'Equipment',
                        UsefulLife: raw.UsefulLifeYears || null,
                        AssetTag: '',
                        Quantity: 0,
                        OperationalStatus: 'In Production',
                        Active: 1,
                    };
                    const res = await fetch('/api/assets', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                        body: JSON.stringify(assetData)
                    });
                    if (!res.ok) throw new Error("Asset import failed");
                } else if (type === 'sops') {
                    const res = await fetch('/api/procedures', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json', 
                            'x-plant-id': plantId
                        },
                        body: JSON.stringify({
                            ID: raw.ID,
                            Description: raw.Description,
                            Tasks: (() => { try { return JSON.parse(raw.TasksJSON || '[]'); } catch { return null; } })()
                        })
                    });
                    if (!res.ok) throw new Error("SOP import failed");
                } else if (type === 'parts') {
                    // Source: MasterParts from mfg_master.db
                    const res = await fetch('/api/parts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                        body: JSON.stringify({
                            ID: raw.MasterPartID,
                            Description: raw.StandardizedName || raw.Description,
                            Manufacturer: raw.Manufacturer || '',
                            UnitCost: raw.TypicalPriceMin || raw.TypicalPriceMax || 0,
                            ClassID: raw.Category || 'C',
                            Stock: 0,
                        })
                    });
                    if (!res.ok) throw new Error("Part import failed");

                // ── Unlisted / manually-entered records ─────────────────────
                } else if (type === 'unlisted_vendor') {
                    const res = await fetch('/api/v2/network/vendor/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                        body: JSON.stringify({ vendorData: {
                            Description: raw.Name, Address: raw.Address || '', City: raw.City || '',
                            State: raw.State || '', Zip: raw.Zip || '', Phone: raw.Phone || '',
                            StandardEmail: raw.Email || '', Website: raw.Website || '', Vendor: 1,
                        }})
                    });
                    if (!res.ok) throw new Error("Unlisted vendor import failed");
                } else if (type === 'unlisted_asset') {
                    const res = await fetch('/api/assets', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                        body: JSON.stringify({
                            Description: raw.Description, Model: raw.Model || '', Manufacturer: raw.Manufacturer || '',
                            AssetType: raw.AssetType || 'Equipment', UsefulLife: raw.UsefulLife || null,
                            AssetTag: raw.AssetTag || '', Quantity: 0, OperationalStatus: 'In Production', Active: 1,
                        })
                    });
                    if (!res.ok) throw new Error("Unlisted asset import failed");
                } else if (type === 'unlisted_part') {
                    const res = await fetch('/api/parts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                        body: JSON.stringify({
                            Description: raw.Description, PartNumber: raw.PartNumber || '',
                            Manufacturer: raw.Manufacturer || '', UnitCost: parseFloat(raw.UnitCost) || 0,
                            ClassID: raw.ClassID || 'C', Stock: 0,
                        })
                    });
                    if (!res.ok) throw new Error("Unlisted part import failed");
                }
                successCount++;
            }
            setSuccess(`Success: Provisioned ${successCount} total items to ${plantLabel}.`);
            setSelectedItems({});
            setUnlistedQueue([]);
        } catch (err) {
            setError("Onboarding failed for some items. Check database constraints.");
        } finally {
            setIsImporting(false);
        }
    };

    const toggleSelection = (e, item) => {
        e.stopPropagation(); // Don't trigger preview
        const next = { ...selectedItems };
        if (next[item.id]) {
            delete next[item.id];
        } else {
            next[item.id] = { type: activeTab, raw: item.raw };
        }
        setSelectedItems(next);
    };

    const selectAll = () => {
        const next = { ...selectedItems };
        filteredItems.forEach(item => {
            next[item.id] = { type: activeTab, raw: item.raw };
        });
        setSelectedItems(next);
    };

    const clearSelection = () => {
        setSelectedItems({});
    };

    // ── Unlisted item handlers ────────────────────────────────────────────────

    // Handle barcode/QR scanner input — most scanners send keystrokes ending in Enter.
    // Auto-fills the "primary ID" field for the current type (AssetTag, PartNumber, or Name).
    const handleScan = (e) => {
        if (e.key !== 'Enter') return;
        const val = scanValue.trim();
        if (!val) return;
        if (unlistedType === 'asset')  setUnlistedForm(p => ({ ...p, AssetTag: val }));
        if (unlistedType === 'part')   setUnlistedForm(p => ({ ...p, PartNumber: val }));
        if (unlistedType === 'vendor') setUnlistedForm(p => ({ ...p, Name: val }));
        setScanFeedback(`Scanned: ${val}`);
        setScanValue('');
        setTimeout(() => setScanFeedback(''), 3000);
    };

    // Stage an unlisted item — adds it to both the visual queue and the selectedItems
    // cart so it imports in the same batch as catalog selections.
    const addUnlistedToQueue = () => {
        const label = unlistedType === 'vendor' ? unlistedForm.Name : unlistedForm.Description;
        if (!label?.trim()) return;
        const id = `unlisted_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const item = { id, type: `unlisted_${unlistedType}`, raw: { ...unlistedForm } };
        setSelectedItems(p => ({ ...p, [id]: item }));
        setUnlistedQueue(p => [...p, item]);
        setUnlistedForm({});
        setScanFeedback(`Staged: ${label}`);
        setTimeout(() => setScanFeedback(''), 3000);
    };

    // Remove an unlisted item from both the staged queue and the import cart.
    const removeUnlisted = (id) => {
        setSelectedItems(p => { const n = { ...p }; delete n[id]; return n; });
        setUnlistedQueue(p => p.filter(i => i.id !== id));
    };

    const uff = (k) => (e) => setUnlistedForm(p => ({ ...p, [k]: e.target.value }));

    const selectedCount = Object.keys(selectedItems).length;

    const filteredItems = items.filter(item => 
        item.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        item.id?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Shared style objects for the unlisted entry form fields
    const fldLbl   = { fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: 4 };
    const fldInput = { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '7px 10px', color: '#f1f5f9', fontSize: '0.82rem', boxSizing: 'border-box' };

    const renderPreviewContent = () => {
        if (loadingPreview) return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '15px' }}>
                <div className="spinning" style={{ border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--primary)', borderRadius: '50%', width: '40px', height: '40px' }} />
                <p style={{ color: 'var(--text-muted)' }}>{t('onboarding.retrievingMasterDocumentation')}</p>
            </div>
        );

        if (!previewDetails) return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.3, textAlign: 'center', padding: '40px' }}>
                <Info size={64} style={{ marginBottom: '20px' }} />
                <h3>{t('onboarding.itemPreviewConsole')}</h3>
                <p>{t('tour.selectAnItemFromTheRegistryOnT', 'Select an item from the registry on the left to view detailed technical specifications and historical documentation.')}</p>
            </div>
        );

        return (
            <div style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px' }}>
                    <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.5rem' }}>{previewItem.title}</h3>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '5px' }}>Global Registry ID: {previewItem.id}</div>
                </div>

                {activeTab === 'vendors' && (
                    <div className="preview-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                        <div className="info-blob">
                            <label>{t('onboarding.address')}</label>
                            <div>{previewDetails.Address || 'N/A'}</div>
                            <div>{previewDetails.City}, {previewDetails.State} {previewDetails.Zip}</div>
                        </div>
                        <div className="info-blob">
                            <label>{t('onboarding.contact')}</label>
                            <div>Phone: {previewDetails.Phone || 'N/A'}</div>
                            <div>Email: {previewDetails.StandardEmail || previewDetails.Email || 'N/A'}</div>
                            <div>Web: {previewDetails.Website || 'N/A'}</div>
                        </div>
                    </div>
                )}

                {activeTab === 'assets' && (
                    <>
                        <div className="preview-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                            <div className="info-blob"><label>{t('onboarding.manufacturer')}</label><div>{previewDetails.primaryMaker || 'Various'}</div></div>
                            <div className="info-blob"><label>{t('onboarding.assetCategory')}</label><div>{previewDetails.Category || 'Equipment'}</div></div>
                            <div className="info-blob"><label>PM Interval</label><div>{previewDetails.PMIntervalDays ? `${previewDetails.PMIntervalDays} days` : 'N/A'}</div></div>
                            <div className="info-blob"><label>{t('onboarding.usefulLife')}</label><div>{previewDetails.UsefulLifeYears ? `${previewDetails.UsefulLifeYears} yrs` : 'N/A'}</div></div>
                            <div className="info-blob"><label>Expected MTBF</label><div>{previewDetails.ExpectedMTBF_Hours ? `${previewDetails.ExpectedMTBF_Hours.toLocaleString()} hrs` : 'N/A'}</div></div>
                            <div className="info-blob"><label>Typical Warranty</label><div>{previewDetails.TypicalWarrantyMonths ? `${previewDetails.TypicalWarrantyMonths} months` : 'N/A'}</div></div>
                        </div>
                        {previewDetails.allMakers?.length > 1 && (
                            <div className="info-blob"><label>Known Makers</label><div>{previewDetails.allMakers.join(', ')}</div></div>
                        )}
                        {previewDetails.typicalParts?.length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
                                    Typical Parts ({previewDetails.typicalParts.length})
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {previewDetails.typicalParts.map(p => (
                                        <div key={p.MasterPartID} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                                            <span>{p.StandardizedName || p.Description}</span>
                                            <span style={{ color: '#94a3b8', marginLeft: 12, whiteSpace: 'nowrap' }}>{p.Manufacturer || ''}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {previewDetails.typicalParts?.length === 0 && (
                            <div style={{ fontSize: '0.8rem', color: '#475569', fontStyle: 'italic' }}>No typical parts linked in master catalog yet.</div>
                        )}
                    </>
                )}

                {activeTab === 'sops' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <h4 style={{ margin: 0, color: 'var(--text-muted)' }}>{t('onboarding.proceduralSteps')}</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {(() => { try { return JSON.parse(previewDetails.TasksJSON || '[]'); } catch { return null; } })().map((task, idx) => (
                                <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                                    <div style={{ fontWeight: 'bold', color: 'var(--primary)', marginBottom: '5px' }}>{idx + 1}. {task.Description}</div>
                                    <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{task.Instructions}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'parts' && (
                    <div className="preview-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                        <div className="info-blob"><label>{t('onboarding.enterprisePartId')}</label><div>{previewDetails.MasterPartID}</div></div>
                        <div className="info-blob"><label>{t('onboarding.manufacturer')}</label><div>{previewDetails.Manufacturer || 'N/A'}</div></div>
                        <div className="info-blob"><label>{t('onboarding.assetCategory')}</label><div>{previewDetails.Category || 'N/A'}</div></div>
                        <div className="info-blob"><label>{t('onboarding.masterListPrice')}</label><div style={{ color: '#10b981', fontWeight: 'bold' }}>
                            {previewDetails.TypicalPriceMin && previewDetails.TypicalPriceMax
                                ? `$${previewDetails.TypicalPriceMin} – $${previewDetails.TypicalPriceMax}`
                                : previewDetails.TypicalPriceMin ? `$${previewDetails.TypicalPriceMin}` : 'N/A'}
                        </div></div>
                        <div className="info-blob"><label>UOM</label><div>{previewDetails.UOM || 'EA'}</div></div>
                        <div className="info-blob"><label>Lead Time</label><div>{previewDetails.LeadTimeDays ? `${previewDetails.LeadTimeDays} days` : 'N/A'}</div></div>
                    </div>
                )}

                <div style={{ marginTop: 'auto', padding: '15px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid #10b98133' }}>
                    <CheckCircle2 color="#10b981" />
                    <div style={{ fontSize: '0.85rem' }}>{t('onboarding.thisIsAn')} <strong>{t('onboarding.enterpriseVerifiedRecord')}</strong>{t('onboardingWizard.provisioningThisItemWillEstablish')}</div>
                </div>
            </div>
        );
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
            <div className="modal-content-standard glass-card" style={{ width: '1250px', maxWidth: '98vw', height: '92vh', display: 'flex', flexDirection: 'column', padding: '25px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ background: 'var(--primary)', padding: '12px', borderRadius: '15px', boxShadow: '0 0 20px var(--primary-low)' }}>
                            <Globe color="#fff" size={28} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, letterSpacing: '1px' }}>{t('onboarding.enterpriseOnboardingConsole')}</h2>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('onboarding.provisioningSiteRepository')} <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>[{plantLabel}]</span></p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <button 
                            onClick={() => setShowHelp(!showHelp)} 
                            className="btn-nav" 
                            style={{ 
                                padding: '10px 18px', 
                                gap: '10px', 
                                background: showHelp ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                                color: showHelp ? '#fff' : 'var(--text-muted)',
                                border: showHelp ? '1px solid var(--primary)' : '1px solid var(--glass-border)'
                            }}
                            title={t('onboardingWizard.toggleTheOnboardingGuideTip')}
                        >
                            <Info size={20} /> {t('onboarding.onboardingGuide')}
                        </button>
                    </div>
                    <button onClick={onClose} className="btn-nav" style={{ padding: '8px', color: '#ef4444' }} title={t('onboardingWizard.closeTheOnboardingConsoleTip')}><X size={32} /></button>
                </div>

                {/* Help Overlay */}
                {showHelp && (
                    <div style={{ 
                        position: 'absolute', 
                        top: '100px', 
                        left: '50%', 
                        transform: 'translateX(-50%)', 
                        width: '800px', 
                        background: 'rgba(15, 23, 42, 0.98)', 
                        backdropFilter: 'blur(10px)',
                        border: '1px solid var(--primary)', 
                        borderRadius: '20px', 
                        padding: '30px', 
                        zIndex: 100,
                        boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
                        animation: 'fadeIn 0.2s ease-out'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Info /> {t('onboarding.howEnterpriseOnboardingWorks')}
                            </h3>
                            <button onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }} title={t('onboardingWizard.closeHelpOverlayTip')}><X size={20}/></button>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div className="help-step">
                                <h4 style={{ color: 'var(--primary)' }}>{t('tour.1BrowseTheRegistry', '1. Browse the Registry')}</h4>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t('tour.useTheCategoryTabsToExploreVer', 'Use the category tabs to explore verified corporate master data. Each tab (Vendors, Assets, SOPs, Parts) connects directly to the Enterprise Master Record.')}</p>
                            </div>
                            <div className="help-step">
                                <h4 style={{ color: 'var(--primary)' }}>{t('tour.2TechnicalPreview', '2. Technical Preview')}</h4>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t('tour.clickAnyItemToViewFullSpecific', 'Click any item to view full specifications on the right. You can verify vendor contact info, asset model numbers, or procedural steps before importing.')}</p>
                            </div>
                            <div className="help-step">
                                <h4 style={{ color: 'var(--primary)' }}>{t('tour.3BuildYourCart', '3. Build Your Cart')}</h4>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t('tour.useTheRadioButtonsToSelectItem', 'Use the radio buttons to select items. Your selections persist across tabs, allowing you to shop for everything you need for the site in one session.')}</p>
                            </div>
                            <div className="help-step">
                                <h4 style={{ color: 'var(--primary)' }}>{t('tour.4ProvisionToSite', '4. Provision to Site')}</h4>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t('tour.whenReadyClickImportAllSelecte', 'When ready, click "Import All Selected". The system will establish linked records in your local plant database, ensuring consistency with corporate standards.')}</p>
                            </div>
                        </div>

                        {/* "Not in the catalog" guidance — the most common first-time question */}
                        <div style={{ marginTop: '20px', padding: '16px 20px', background: 'rgba(245,158,11,0.08)', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.3)' }}>
                            <div style={{ fontWeight: 700, color: '#f59e0b', marginBottom: '10px', fontSize: '0.9rem' }}>
                                ⚠ {t('onboarding.notInCatalogTitle', 'What if a Vendor, Asset, or Part isn\'t in the catalog?')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                                <div><strong style={{ color: '#e2e8f0' }}>{t('onboarding.notInCatalogVendors', 'Vendors')}</strong> — {t('onboarding.notInCatalogVendorsDesc', 'Complete onboarding with available vendors, then add the missing vendor manually in Network → Vendor Management. It will be available to this plant immediately.')}</div>
                                <div><strong style={{ color: '#e2e8f0' }}>{t('onboarding.notInCatalogAssets', 'Assets')}</strong> — {t('onboarding.notInCatalogAssetsDesc', 'Provision matching templates now, then create a custom asset record in Assets & BOMs after onboarding. Use the catalog search first — try manufacturer name or model number.')}</div>
                                <div><strong style={{ color: '#e2e8f0' }}>{t('onboarding.notInCatalogParts', 'Parts')}</strong> — {t('onboarding.notInCatalogPartsDesc', 'Add missing parts directly in Storeroom → Parts after onboarding. If the part should be in the corporate catalog for all plants, contact your IT Admin to submit a catalog addition request.')}</div>
                                <div><strong style={{ color: '#e2e8f0' }}>{t('onboarding.notInCatalogSOPs', 'SOPs')}</strong> — {t('onboarding.notInCatalogSOPsDesc', 'Import available standard procedures now. Custom or site-specific SOPs can be created in the SOPs module at any time — they do not need to come from the corporate catalog.')}</div>
                            </div>
                        </div>

                        <div style={{ marginTop: '14px', padding: '15px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '10px', fontSize: '0.85rem', border: '1px solid var(--primary-low)' }}>
                            <strong>{t('onboarding.proTip')}</strong>{t('tour.youCanUseTheSearchBarWithinAny', ' Use the search bar within any tab to filter thousands of enterprise records down to specific manufacturers or part classes.')}</div>
                    </div>
                )}

                {/* Audit Mode - Health Dashboard */}
                {isAuditMode && standardization && (
                    <div style={{ 
                        background: 'rgba(255,255,255,0.03)', 
                        padding: '15px 25px', 
                        borderRadius: '15px', 
                        marginBottom: '20px', 
                        border: '1px solid var(--glass-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '25px' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px' }}>{t('onboarding.siteAlignmentHealth')}</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: standardization.overallScore > 80 ? '#10b981' : standardization.overallScore > 50 ? '#f59e0b' : '#ef4444' }}>
                                    {standardization.overallScore}%
                                </div>
                            </div>
                            <div style={{ height: '30px', width: '1px', background: 'var(--glass-border)' }} />
                            <div style={{ display: 'flex', gap: '20px' }}>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('onboarding.assets')}</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{standardization.assets.standardized} / {standardization.assets.local} <span style={{ color: '#10b981', marginLeft: '5px' }}>({standardization.assets.score}%)</span></div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('onboarding.parts')}</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{standardization.parts.standardized} / {standardization.parts.local} <span style={{ color: '#10b981', marginLeft: '5px' }}>({standardization.parts.score}%)</span></div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('onboarding.sops')}</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{standardization.sops.standardized} / {standardization.sops.local} <span style={{ color: '#10b981', marginLeft: '5px' }}>({standardization.sops.score}%)</span></div>
                                </div>
                            </div>
                        </div>
                        <div style={{ flex: 1, maxWidth: '300px', marginLeft: '40px' }}>
                            <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ 
                                    height: '100%', 
                                    width: `${standardization.overallScore}%`, 
                                    background: standardization.overallScore > 80 ? '#10b981' : standardization.overallScore > 50 ? '#f59e0b' : '#ef4444',
                                    transition: 'width 1s ease-out',
                                    boxShadow: '0 0 10px currentColor'
                                }} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Content Area: Tabs + Search */}
                <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                    <div className="nav-pills" style={{ flex: 1, padding: 0, background: 'rgba(255,255,255,0.03)' }}>
                        {[
                            { id: 'vendors', label: 'Network Vendors', icon: Globe },
                            { id: 'assets', label: 'Asset Templates', icon: HardHat },
                            { id: 'parts', label: 'Master Parts', icon: Package },
                            { id: 'sops', label: 'Method SOPs', icon: BookOpen },
                            { id: 'unlisted', label: 'Add Unlisted', icon: Plus },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); if (tab.id === 'unlisted') setTimeout(() => scanInputRef.current?.focus(), 100); }}
                                className={`btn-nav ${activeTab === tab.id ? 'active' : ''}`}
                                style={{ flex: 1, gap: '10px', ...(tab.id === 'unlisted' ? { color: activeTab === 'unlisted' ? '#fff' : '#10b981', borderColor: 'rgba(16,185,129,0.3)' } : {}) }}
                                title={tab.id === 'unlisted' ? 'Manually enter or scan items not in the catalog' : `Browse ${tab.label}`}
                            >
                                <tab.icon size={18} /> {tab.label}
                                {/* Badge showing how many unlisted items are staged */}
                                {tab.id === 'unlisted' && unlistedQueue.length > 0 && (
                                    <span style={{ background: '#10b981', color: '#fff', borderRadius: 10, fontSize: '0.65rem', padding: '1px 6px', fontWeight: 700 }}>{unlistedQueue.length}</span>
                                )}
                            </button>
                        ))}
                    </div>
                    {/* Hide the search bar on the unlisted tab — it's not relevant there */}
                    {activeTab !== 'unlisted' && (
                        <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder={`Search ${activeTab}...`} style={{ width: 350 }} title={`Search ${activeTab} by name or ID`} />
                    )}
                </div>

                {/* ── Unlisted / Manual Entry Tab ─────────────────────────────────────── */}
                {activeTab === 'unlisted' && (
                    <div style={{ flex: 1, display: 'flex', gap: '20px', overflow: 'auto' }}>

                        {/* Left: type selector + scan + form */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

                            {/* Type selector */}
                            <div style={{ display: 'flex', gap: 8 }}>
                                {[
                                    { id: 'vendor', label: 'Vendor', icon: Building2 },
                                    { id: 'asset',  label: 'Asset',  icon: Wrench },
                                    { id: 'part',   label: 'Part',   icon: Layers },
                                ].map(({ id, label, icon: Icon }) => (
                                    <button key={id} onClick={() => { setUnlistedType(id); setUnlistedForm({}); }}
                                        className="btn-nav"
                                        style={{ flex: 1, gap: 8, background: unlistedType === id ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${unlistedType === id ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'}`, color: unlistedType === id ? '#10b981' : '#94a3b8', fontWeight: unlistedType === id ? 700 : 400 }}>
                                        <Icon size={15} /> {label}
                                    </button>
                                ))}
                            </div>

                            {/* Barcode / QR scan input */}
                            <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '12px 16px' }}>
                                <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Barcode size={14} /> SCAN BARCODE / QR CODE
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input
                                        ref={scanInputRef}
                                        value={scanValue}
                                        onChange={e => setScanValue(e.target.value)}
                                        onKeyDown={handleScan}
                                        placeholder={unlistedType === 'asset' ? 'Scan asset tag or model number…' : unlistedType === 'part' ? 'Scan part number or barcode…' : 'Scan or type vendor ID…'}
                                        style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '8px 12px', color: '#f1f5f9', fontSize: '0.85rem' }}
                                    />
                                </div>
                                {scanFeedback && <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: 6 }}>✓ {scanFeedback}</div>}
                                <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: 6 }}>
                                    {unlistedType === 'asset'  && 'Scanned value auto-fills Asset Tag field below.'}
                                    {unlistedType === 'part'   && 'Scanned value auto-fills Part Number field below.'}
                                    {unlistedType === 'vendor' && 'Scanned value auto-fills Vendor Name field below.'}
                                </div>
                            </div>

                            {/* Manual entry form — fields vary by type */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px' }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                    Manual Entry — {unlistedType === 'vendor' ? 'Vendor' : unlistedType === 'asset' ? 'Asset' : 'Part'}
                                </div>

                                {/* ── Vendor form ─────────────────────────────────────────────── */}
                                {unlistedType === 'vendor' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div style={{ gridColumn: '1/-1' }}>
                                            <label style={fldLbl}>Company Name <span style={{ color: '#ef4444' }}>*</span></label>
                                            <input value={unlistedForm.Name || ''} onChange={uff('Name')} placeholder="e.g. Alfa Laval Inc." style={fldInput} />
                                        </div>
                                        <div>
                                            <label style={fldLbl}>Contact Name</label>
                                            <input value={unlistedForm.ContactName || ''} onChange={uff('ContactName')} placeholder="Sales rep / account manager" style={fldInput} />
                                        </div>
                                        <div>
                                            <label style={fldLbl}>Phone</label>
                                            <input value={unlistedForm.Phone || ''} onChange={uff('Phone')} placeholder="(555) 000-0000" style={fldInput} />
                                        </div>
                                        <div>
                                            <label style={fldLbl}>Email</label>
                                            <input value={unlistedForm.Email || ''} onChange={uff('Email')} placeholder="vendor@example.com" style={fldInput} />
                                        </div>
                                        <div>
                                            <label style={fldLbl}>Website</label>
                                            <input value={unlistedForm.Website || ''} onChange={uff('Website')} placeholder="www.vendor.com" style={fldInput} />
                                        </div>
                                        <div style={{ gridColumn: '1/-1' }}>
                                            <label style={fldLbl}>Street Address</label>
                                            <input value={unlistedForm.Address || ''} onChange={uff('Address')} placeholder="123 Industrial Blvd" style={fldInput} />
                                        </div>
                                        <div>
                                            <label style={fldLbl}>City</label>
                                            <input value={unlistedForm.City || ''} onChange={uff('City')} style={fldInput} />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            <div>
                                                <label style={fldLbl}>State</label>
                                                <input value={unlistedForm.State || ''} onChange={uff('State')} placeholder="WI" style={fldInput} />
                                            </div>
                                            <div>
                                                <label style={fldLbl}>Zip</label>
                                                <input value={unlistedForm.Zip || ''} onChange={uff('Zip')} style={fldInput} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── Asset form ──────────────────────────────────────────────── */}
                                {unlistedType === 'asset' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div style={{ gridColumn: '1/-1' }}>
                                            <label style={fldLbl}>Asset Description <span style={{ color: '#ef4444' }}>*</span></label>
                                            <input value={unlistedForm.Description || ''} onChange={uff('Description')} placeholder="e.g. HTST Pasteurizer — Plate Heat Exchanger" style={fldInput} />
                                        </div>
                                        <div>
                                            <label style={fldLbl}>Asset Tag (scanned)</label>
                                            <input value={unlistedForm.AssetTag || ''} onChange={uff('AssetTag')} placeholder="Scan or type asset tag" style={fldInput} />
                                        </div>
                                        <div>
                                            <label style={fldLbl}>Asset Type</label>
                                            <select value={unlistedForm.AssetType || ''} onChange={uff('AssetType')} style={fldInput}>
                                                <option value="">— Select —</option>
                                                {['Equipment','Vehicle','Facility','Utility','Instrument','Safety'].map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={fldLbl}>Manufacturer</label>
                                            <input value={unlistedForm.Manufacturer || ''} onChange={uff('Manufacturer')} placeholder="e.g. Alfa Laval" style={fldInput} />
                                        </div>
                                        <div>
                                            <label style={fldLbl}>Model</label>
                                            <input value={unlistedForm.Model || ''} onChange={uff('Model')} placeholder="e.g. Pharox III" style={fldInput} />
                                        </div>
                                        <div>
                                            <label style={fldLbl}>Useful Life (years)</label>
                                            <input type="number" value={unlistedForm.UsefulLife || ''} onChange={uff('UsefulLife')} placeholder="15" style={fldInput} />
                                        </div>
                                    </div>
                                )}

                                {/* ── Part form ───────────────────────────────────────────────── */}
                                {unlistedType === 'part' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div style={{ gridColumn: '1/-1' }}>
                                            <label style={fldLbl}>Part Description <span style={{ color: '#ef4444' }}>*</span></label>
                                            <input value={unlistedForm.Description || ''} onChange={uff('Description')} placeholder="e.g. Bearing 6205-2RS Deep Groove" style={fldInput} />
                                        </div>
                                        <div>
                                            <label style={fldLbl}>Part Number (scanned)</label>
                                            <input value={unlistedForm.PartNumber || ''} onChange={uff('PartNumber')} placeholder="Scan or type part number" style={fldInput} />
                                        </div>
                                        <div>
                                            <label style={fldLbl}>Manufacturer</label>
                                            <input value={unlistedForm.Manufacturer || ''} onChange={uff('Manufacturer')} placeholder="e.g. SKF" style={fldInput} />
                                        </div>
                                        <div>
                                            <label style={fldLbl}>Unit Cost ($)</label>
                                            <input type="number" value={unlistedForm.UnitCost || ''} onChange={uff('UnitCost')} placeholder="0.00" style={fldInput} />
                                        </div>
                                        <div>
                                            <label style={fldLbl}>Criticality Class</label>
                                            <select value={unlistedForm.ClassID || ''} onChange={uff('ClassID')} style={fldInput}>
                                                <option value="">— Select —</option>
                                                <option value="A">A — Critical</option>
                                                <option value="B">B — Important</option>
                                                <option value="C">C — Non-critical</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={fldLbl}>Unit of Measure</label>
                                            <input value={unlistedForm.UOM || ''} onChange={uff('UOM')} placeholder="ea / pk / ft / lb" style={fldInput} />
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={addUnlistedToQueue}
                                    disabled={!(unlistedType === 'vendor' ? unlistedForm.Name : unlistedForm.Description)?.trim()}
                                    className="btn-primary"
                                    style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, opacity: (unlistedType === 'vendor' ? unlistedForm.Name : unlistedForm.Description)?.trim() ? 1 : 0.4 }}
                                >
                                    <Plus size={15} /> Add to Import Queue
                                </button>
                            </div>
                        </div>

                        {/* Right: staged unlisted items queue */}
                        <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '0 4px' }}>
                                Staged for Import ({unlistedQueue.length})
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', padding: unlistedQueue.length ? 8 : 0 }}>
                                {unlistedQueue.length === 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10, color: '#334155', textAlign: 'center', padding: 20 }}>
                                        <Plus size={32} strokeWidth={1} />
                                        <div style={{ fontSize: '0.82rem' }}>Fill out the form and click<br /><strong style={{ color: '#475569' }}>Add to Import Queue</strong></div>
                                    </div>
                                ) : unlistedQueue.map(item => {
                                    const typeLabel = item.type === 'unlisted_vendor' ? 'Vendor' : item.type === 'unlisted_asset' ? 'Asset' : 'Part';
                                    const typeColor = item.type === 'unlisted_vendor' ? '#6366f1' : item.type === 'unlisted_asset' ? '#0ea5e9' : '#f59e0b';
                                    const displayName = item.type === 'unlisted_vendor' ? item.raw.Name : item.raw.Description;
                                    const subtitle = item.type === 'unlisted_vendor'
                                        ? [item.raw.City, item.raw.State].filter(Boolean).join(', ') || item.raw.Phone || ''
                                        : item.type === 'unlisted_asset'
                                        ? [item.raw.Manufacturer, item.raw.Model].filter(Boolean).join(' ') || item.raw.AssetTag || ''
                                        : [item.raw.PartNumber, item.raw.Manufacturer].filter(Boolean).join(' · ') || '';
                                    return (
                                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 6 }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
                                                {subtitle && <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 2 }}>{subtitle}</div>}
                                            </div>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: `${typeColor}18`, color: typeColor, border: `1px solid ${typeColor}33`, flexShrink: 0 }}>{typeLabel}</span>
                                            <button onClick={() => removeUnlisted(item.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2, flexShrink: 0 }} title="Remove from queue"><X size={14} /></button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Two Column Shopper Layout — catalog tabs only */}
                {activeTab !== 'unlisted' && (
                <div style={{ flex: 1, display: 'flex', gap: '20px', overflow: 'hidden' }}>
                    
                    {/* Left: Searchable List */}
                    <div style={{ width: '400px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 5px' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{filteredItems.length} {t('onboarding.recordsFound', 'Records Found')}</div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="text-btn" onClick={selectAll} style={{ fontSize: '0.75rem', color: 'var(--primary)' }} title={t('onboardingWizard.selectAllVisibleItemsTip')}>{t('onboarding.selectAll')}</button>
                                <button className="text-btn" onClick={clearSelection} style={{ fontSize: '0.75rem', color: '#ef4444' }} title={t('onboardingWizard.clearAllSelectionsTip')}>{t('onboarding.clear')}</button>
                            </div>
                        </div>
                        {/* Persistent "not found" hint — visible at all times so users know their options */}
                        <div style={{ fontSize: '0.72rem', color: '#475569', padding: '0 5px', lineHeight: 1.5 }}>
                            {t('onboarding.notFoundHint', "Don't see what you need? Use the Onboarding Guide ↑ for instructions on adding items after onboarding.")}
                        </div>
                        
                        <div className="scroll-area" style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '15px', border: '1px solid var(--glass-border)' }}>
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '100px' }}>
                                    <div className="spinning" style={{ border: '3px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', width: '30px', height: '30px', margin: '0 auto 15px auto' }} />
                                    <p style={{ fontSize: '0.9rem' }}>{t('onboarding.queryingNetworkRegistry')}</p>
                                </div>
                            ) : filteredItems.length === 0 ? (
                                <div style={{ padding: '30px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ textAlign: 'center', fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>
                                        {t('onboarding.noMatchFound', 'No matches in the catalog')}
                                    </div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '8px' }}>
                                        {t('onboarding.tryBroaderSearch', 'Try a broader search term, or see below for how to add it after onboarding.')}
                                    </div>
                                    {/* Per-tab "not found" instructions */}
                                    {{
                                        vendors: (
                                            <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '14px 16px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                                                <div style={{ fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>Vendor not in the catalog?</div>
                                                Complete onboarding with available vendors. Then go to <strong>Network → Vendor Management</strong> to add this vendor directly to the plant. It will be available immediately — no catalog approval needed.
                                            </div>
                                        ),
                                        assets: (
                                            <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '14px 16px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                                                <div style={{ fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>Asset template not found?</div>
                                                Try searching by manufacturer name or model number — the catalog has thousands of records. If it's genuinely missing, finish onboarding then create a custom asset in <strong>Assets & BOMs</strong>. Contact your IT Admin if this asset should be added to the corporate catalog for all plants.
                                            </div>
                                        ),
                                        parts: (
                                            <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '14px 16px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                                                <div style={{ fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>Part not in the master list?</div>
                                                Complete onboarding with available parts. Missing parts can be added any time in <strong>Storeroom → Parts</strong>. If this part is used across multiple plants and should live in the corporate catalog, submit a catalog addition request to your IT Admin.
                                            </div>
                                        ),
                                        sops: (
                                            <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '14px 16px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                                                <div style={{ fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>SOP not in the library?</div>
                                                Import the standard procedures available now. Site-specific or custom SOPs can be created directly in the <strong>SOPs module</strong> at any time — they don't need to originate from the corporate catalog.
                                            </div>
                                        ),
                                    }[activeTab]}
                                </div>
                            ) : (
                                filteredItems.map((item, idx) => (
                                    <div
                                        key={`${item.id}_${idx}`} 
                                        onClick={() => handlePreview(item)}
                                        className="onboard-item-card"
                                        style={{ 
                                            padding: '12px 15px',
                                            margin: '8px',
                                            borderRadius: '12px',
                                            background: previewItem?.id === item.id ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                                            border: previewItem?.id === item.id ? '1px solid var(--primary)' : '1px solid transparent',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            transition: 'all 0.2s',
                                            position: 'relative'
                                        }}
                                    >
                                        <div 
                                            onClick={(e) => toggleSelection(e, item)}
                                            style={{ 
                                                width: '24px', 
                                                height: '24px', 
                                                borderRadius: '50%', 
                                                border: '2px solid ' + (selectedItems[item.id] ? 'var(--primary)' : 'rgba(255,255,255,0.2)'),
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: selectedItems[item.id] ? 'var(--primary)' : 'transparent',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {selectedItems[item.id] && <CheckCircle2 size={16} color="#fff" />}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{item.title}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.subtitle}</div>
                                        </div>
                                        <ChevronRight size={16} style={{ opacity: previewItem?.id === item.id ? 1 : 0.2 }} />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Right: Rich Preview Console */}
                    <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: '20px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {renderPreviewContent()}
                    </div>
                </div>
                )} {/* end catalog tabs conditional */}

                {/* Alerts / Feedback */}
                {error && <div className="alert-error" style={{ margin: '15px 0' }}>{error}</div>}
                {success && <div className="alert-success" style={{ margin: '15px 0' }}>{success}</div>}

                {/* Footer Controls */}
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                            {selectedCount} Items Selected
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {t('onboarding.readyToProvisionTo')} <strong>{plantLabel}</strong>{t('tour.catalog', 'catalog.')}</div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '15px' }}>
                        <button 
                            onClick={onClose} 
                            className="btn-primary" 
                            style={{ background: '#ef4444', border: 'none', padding: '12px 25px', display: 'flex', alignItems: 'center', gap: '10px' }}
                            title={t('onboardingWizard.cancelOnboardingAndCloseTip')}
                        >
                            <Trash2 size={18} /> {t('onboarding.cancelOnboarding')}
                        </button>
                        
                        <button 
                            onClick={handleImport} 
                            disabled={selectedCount === 0 || isImporting}
                            className="btn-primary" 
                            style={{ 
                                padding: '12px 40px', 
                                background: 'linear-gradient(135deg, var(--primary), #4f46e5)',
                                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                fontSize: '1rem'
                            }}
                            title={`Import ${selectedCount} selected items to ${plantLabel}`}
                        >
                            <Download size={20} /> {isImporting ? 'PROVISIONING...' : 'IMPORT ALL SELECTED'}
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
                .onboard-item-card:hover {
                    background: rgba(255,255,255,0.05) !important;
                    transform: translateX(5px);
                }
                .text-btn {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 5px;
                    font-weight: bold;
                }
                .text-btn:hover {
                    text-decoration: underline;
                    opacity: 0.8;
                }
                .info-blob {
                    background: rgba(255,255,255,0.03);
                    padding: 15px;
                    borderRadius: 12px;
                    border: 1px solid var(--glass-border);
                }
                .info-blob label {
                    display: block;
                    font-size: 0.7rem;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-bottom: 5px;
                }
                .preview-grid {
                    animation: fadeIn 0.3s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
