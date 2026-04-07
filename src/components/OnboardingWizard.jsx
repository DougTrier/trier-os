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
import React, { useState, useEffect } from 'react';
import { X, Globe, Package, HardHat, BookOpen, Download, Search, CheckCircle2, ChevronRight, Trash2, Info } from 'lucide-react';
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

    useEffect(() => {
        fetchItems();
        if (isAuditMode) fetchStandardization();
    }, [activeTab]);

    const fetchStandardization = async () => {
        try {
            const res = await fetch('/api/logistics/site-standardization', {
                headers: { 'x-plant-id': plantId, 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
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
        setPreviewItem(null);
        setPreviewDetails(null);
        try {
            let endpoint = '';
            if (activeTab === 'vendors') endpoint = '/api/logistics/global-vendors/list';
            if (activeTab === 'assets') endpoint = '/api/logistics/global-assets';
            if (activeTab === 'sops') endpoint = '/api/logistics/global-sops';
            if (activeTab === 'parts') endpoint = '/api/logistics/global-parts';

            const res = await fetch(endpoint);
            const data = await res.json();
            
            // Normalize data for display
            let normalized = [];
            if (activeTab === 'vendors') {
                normalized = data.map(v => {
                    const location = [v.City, v.State].filter(Boolean).join(', ');
                    return { 
                        id: v.ID, 
                        title: v.Name, 
                        subtitle: location || 'Enterprise Registry Record', 
                        raw: v 
                    };
                });
            }
            if (activeTab === 'assets') normalized = data.map(a => ({ id: a.ID, title: a.Description, subtitle: a.Manufacturer + ' | ' + a.Model, raw: a }));
            if (activeTab === 'sops') normalized = data.map(s => ({ id: s.ID, title: s.Description, subtitle: 'Standard Procedure', raw: s }));
            if (activeTab === 'parts') {
                normalized = data.map(p => ({ id: p.ID, title: p.Description, subtitle: `$${p.UnitCost || 0} | Class: ${p.ClassID || 'N/A'}`, raw: p }));
            }

            setItems(normalized);
        } catch (err) {
            setError("Failed to load global items.");
        } finally {
            setLoading(false);
        }
    };

    const handlePreview = async (item) => {
        setPreviewItem(item);
        setLoadingPreview(true);
        setPreviewDetails(null);
        try {
            // Some tabs might need extra detail fetch
            if (activeTab === 'vendors') {
                const res = await fetch(`/api/logistics/global-vendors/${encodeURIComponent(item.id)}`);
                setPreviewDetails(await res.json());
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
                    const vendorData = {
                        ID: raw.ID,
                        Description: raw.Name,
                        Address: raw.Address || '',
                        City: raw.City || '',
                        State: raw.State || '',
                        Zip: raw.Zip || '',
                        Phone: raw.Phone || '',
                        StandardEmail: raw.Email || '',
                        Website: raw.Website || '',
                        Vendor: 1 
                    };
                    const res = await fetch('/api/v2/network/vendor/import', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json', 
                            'x-plant-id': plantId,
                            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                        },
                        body: JSON.stringify({ vendorData })
                    });
                    if (!res.ok) throw new Error("Vendor import failed");
                } else if (type === 'assets') {
                    // Map registry names back to legacy database columns
                    const assetData = {
                        ID: raw.ID,
                        Description: raw.Description,
                        Model: raw.Model,
                        Manufacturer: raw.Manufacturer,
                        AssetType: raw.AssetType,
                        UsefulLife: raw.UsefulLife,
                        AssetTag: raw.AssetTag,
                        Quantity: 0, 
                        OperationalStatus: 'In Production',
                        Active: 1
                    };
                    const res = await fetch('/api/assets', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json', 
                            'x-plant-id': plantId,
                            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                        },
                        body: JSON.stringify(assetData)
                    });
                    if (!res.ok) throw new Error("Asset import failed");
                } else if (type === 'sops') {
                    const res = await fetch('/api/procedures', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json', 
                            'x-plant-id': plantId,
                            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                        },
                        body: JSON.stringify({
                            ID: raw.ID,
                            Description: raw.Description,
                            Tasks: (() => { try { return JSON.parse(raw.TasksJSON || '[]'); } catch { return null; } })()
                        })
                    });
                    if (!res.ok) throw new Error("SOP import failed");
                } else if (type === 'parts') {
                    const res = await fetch('/api/parts', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json', 
                            'x-plant-id': plantId,
                            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                        },
                        body: JSON.stringify({
                            ID: raw.ID,
                            Description: raw.Description,
                            UnitCost: raw.UnitCost,
                            ClassID: raw.ClassID,
                            Stock: 0
                        })
                    });
                    if (!res.ok) throw new Error("Part import failed");
                }
                successCount++;
            }
            setSuccess(`Success: Provisioned ${successCount} total items to ${plantLabel}.`);
            setSelectedItems({});
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

    const selectedCount = Object.keys(selectedItems).length;

    const filteredItems = items.filter(item => 
        item.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        item.id?.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                    <div className="preview-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                        <div className="info-blob"><label>{t('onboarding.manufacturer')}</label><div>{previewDetails.Manufacturer || 'Generic'}</div></div>
                        <div className="info-blob"><label>{t('onboarding.modelNumber')}</label><div>{previewDetails.Model || 'N/A'}</div></div>
                        <div className="info-blob"><label>{t('onboarding.assetCategory')}</label><div>{previewDetails.AssetType || 'Standard Equipment'}</div></div>
                        <div className="info-blob"><label>{t('onboarding.usefulLife')}</label><div>{previewDetails.UsefulLife || 10} Years (Est)</div></div>
                    </div>
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
                        <div className="info-blob"><label>{t('onboarding.enterprisePartId')}</label><div>{previewDetails.ID}</div></div>
                        <div className="info-blob"><label>{t('onboarding.masterListPrice')}</label><div style={{ color: '#10b981', fontWeight: 'bold' }}>${previewDetails.UnitCost}</div></div>
                        <div className="info-blob"><label>{t('onboarding.materialClass')}</label><div>{previewDetails.ClassID || 'N/A'}</div></div>
                        <div className="info-blob"><label>{t('onboarding.syncOrigin')}</label><div>{previewDetails.LastSyncFromPlant || 'Central'}</div></div>
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
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t('tour.useTheRadioButtonsToSelectItem', 'Use the radio buttons to select items. Your selections **persist across tabs**, allowing you to shop for everything you need for the site in one session.')}</p>
                            </div>
                            <div className="help-step">
                                <h4 style={{ color: 'var(--primary)' }}>{t('tour.4ProvisionToSite', '4. Provision to Site')}</h4>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t('tour.whenReadyClickImportAllSelecte', 'When ready, click "Import All Selected". The system will established linked records in your local plant database, ensuring consistency with corporate standards.')}</p>
                            </div>
                        </div>
                        
                        <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '10px', fontSize: '0.85rem', border: '1px solid var(--primary-low)' }}>
                            <strong>{t('onboarding.proTip')}</strong>{t('tour.youCanUseTheSearchBarWithinAny', 'You can use the search bar within any tab to filter the thousand of enterprise records down to specific manufacturers or part classes.')}</div>
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
                            { id: 'sops', label: 'Method SOPs', icon: BookOpen }
                        ].map(tab => (
                            <button 
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`btn-nav ${activeTab === tab.id ? 'active' : ''}`}
                                style={{ flex: 1, gap: '10px' }}
                                title={`Browse ${tab.label}`}
                            >
                                <tab.icon size={18} /> {tab.label}
                            </button>
                        ))}
                    </div>
                    <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder={`Search ${activeTab}...`} style={{ width: 350 }} title={`Search ${activeTab} by name or ID`} />
                </div>

                {/* Two Column Shopper Layout */}
                <div style={{ flex: 1, display: 'flex', gap: '20px', overflow: 'hidden' }}>
                    
                    {/* Left: Searchable List */}
                    <div style={{ width: '400px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 5px' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{filteredItems.length} Records Found</div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="text-btn" onClick={selectAll} style={{ fontSize: '0.75rem', color: 'var(--primary)' }} title={t('onboardingWizard.selectAllVisibleItemsTip')}>{t('onboarding.selectAll')}</button>
                                <button className="text-btn" onClick={clearSelection} style={{ fontSize: '0.75rem', color: '#ef4444' }} title={t('onboardingWizard.clearAllSelectionsTip')}>{t('onboarding.clear')}</button>
                            </div>
                        </div>
                        
                        <div className="scroll-area" style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '15px', border: '1px solid var(--glass-border)' }}>
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '100px' }}>
                                    <div className="spinning" style={{ border: '3px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', width: '30px', height: '30px', margin: '0 auto 15px auto' }} />
                                    <p style={{ fontSize: '0.9rem' }}>{t('onboarding.queryingNetworkRegistry')}</p>
                                </div>
                            ) : filteredItems.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>{t('onboarding.noMatchFound')}</div>
                            ) : (
                                filteredItems.map(item => (
                                    <div 
                                        key={item.id} 
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
