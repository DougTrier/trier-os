// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Â© 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Parts & Inventory Dashboard
 * =========================================
 * Top-level container for all parts and inventory management views.
 * Composes sub-views into a tabbed workspace for complete storeroom visibility.
 *
 * TABS:
 *   Parts          — PartsView: searchable part registry with detail panel,
 *                    vendor info, usage history, and enrichment status
 *   Logistics      — LogisticsView: inter-plant transfer requests and tracking
 *   Purchase Orders — PurchaseOrdersListView: open POs with line items and status
 *   Adjustments    — InventoryAdjustmentsView: cycle counts and qty correction audit trail
 *
 * Each tab is a self-contained component managing its own API calls and state.
 * This parent only manages tab selection and passes plantId as a prop.
 */
import React, { useState, useEffect } from 'react';
import PartsView from './PartsView';
import LogisticsView from './LogisticsView';
import PurchaseOrdersListView from './PurchaseOrdersListView';
import InventoryAdjustmentsView from './InventoryAdjustmentsView';

import { PackageSearch, Truck, Settings2, Globe2, Camera, XCircle, X, BookOpen } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import { TakeTourButton } from './ContextualTour';

export default function PartsDashboard({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [nestedTab, setNestedTab] = useState('inventory');
    const [ocrModalOpen, setOcrModalOpen] = useState(false);

    // Listen for default tab from Mission Control tile navigation
    useEffect(() => {
        const handler = (e) => {
            if (e.detail && ['inventory', 'adjustments', 'vendors', 'logistics'].includes(e.detail)) {
                setNestedTab(e.detail);
            }
        };
        window.addEventListener('pf-default-tab', handler);
        return () => window.removeEventListener('pf-default-tab', handler);
    }, []);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)', overflow: 'hidden' }}>
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <PackageSearch size={24} /> {t('parts.partsLogistics')}
                </h2>

                <div style={{ width: '2px', height: '30px', background: 'var(--glass-border)' }}></div>

                <div className="nav-pills" style={{ padding: 0, margin: 0, background: 'transparent' }}>
                    <button 
                        onClick={() => setNestedTab('inventory')}
                        className={`btn-nav ${nestedTab === 'inventory' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('partsDashboard.browseAndManageTheLocalTip')}
                    >
                        <PackageSearch size={16} /> {t('parts.localInventory')}
                    </button>
                    <button 
                        onClick={() => setNestedTab('adjustments')}
                        className={`btn-nav ${nestedTab === 'adjustments' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('partsDashboard.viewAndCreateInventoryAdjustmentTip')}
                    >
                        <Settings2 size={16} /> {t('parts.adjustments')}
                    </button>
                    <button 
                        onClick={() => setNestedTab('vendors')}
                        className={`btn-nav ${nestedTab === 'vendors' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('partsDashboard.manageVendorsAndPurchaseOrdersTip')}
                    >
                        <Truck size={16} /> {t('parts.vendorsPos')}
                    </button>
                    <button 
                        onClick={() => setNestedTab('logistics')}
                        className={`btn-nav ${nestedTab === 'logistics' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('partsDashboard.searchForPartsAcrossAllTip')}
                    >
                        <Globe2 size={16} /> {t('parts.globalLogistics')}
                    </button>
                </div>

                <TakeTourButton tourId="parts" nestedTab={nestedTab} />
                <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('pf-nav', { detail: 'about' }))}
                    className="btn-primary"
                    style={{
                        marginLeft: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(99, 102, 241, 0.1)',
                        color: 'var(--primary)',
                        border: '1px solid currentColor',
                        padding: '8px 16px',
                        fontSize: '0.85rem'
                    }}
                    title={t('partsDashboard.openTheOperationsManualAndTip')}
                >
                    <BookOpen size={18} /> {t('parts.manual')}
                </button>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {nestedTab === 'inventory' && <PartsView plantId={plantId} plantLabel={plantLabel} />}

                {nestedTab === 'adjustments' && <InventoryAdjustmentsView plantId={plantId} plantLabel={plantLabel} />}


                {nestedTab === 'vendors' && <PurchaseOrdersListView plantId={plantId} />}

                {nestedTab === 'logistics' && (
                    <LogisticsView plantId={plantId} />
                )}
            </div>

            {ocrModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="glass-card" style={{ padding: '30px', width: '500px', textAlign: 'center', position: 'relative' }}>
                        <button 
                            onClick={() => setOcrModalOpen(false)}
                            style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                            title={t('partsDashboard.closeTheOcrScannerTip')}
                        >
                            <XCircle size={28} />
                        </button>

                        <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#10b981', marginBottom: '20px' }}>
                            <Camera size={28} /> {t('parts.ocrScannerActive')}
                        </h2>

                        <div style={{
                            width: '100%', height: '200px',
                            border: '3px dashed #10b981', borderRadius: '12px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(16, 185, 129, 0.05)',
                            marginBottom: '20px', position: 'relative', overflow: 'hidden'
                        }}>
                            {/* Animated scanline */}
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
                                background: '#10b981', boxShadow: '0 0 10px #10b981',
                                animation: 'scan 2s infinite linear'
                            }}></div>
                            <style>{`
                                @keyframes scan {
                                    0% { top: 0; }
                                    50% { top: 100%; }
                                    100% { top: 0; }
                                }
                            `}</style>

                            <span style={{ color: 'var(--text-muted)' }}>{t('parts.alignPartBarcodeOr')}</span>
                        </div>

                        <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '25px' }}>
                            {t('parts.nativeMachineVisionIs')} <strong>{t('parts.partId')}</strong> string recognition...
                        </p>

                        <button className="btn-primary" onClick={() => {
                            window.trierToast?.error('SIMULATION: Successfully recognized part 100-VALVE. Routing to localized inventory module.');
                            setOcrModalOpen(false);
                            setNestedTab('inventory');
                        }} style={{ width: '100%' }}
                        title={t('partsDashboard.runASimulatedOcrScanTip')}
                        >
                            {t('parts.simulateSuccessfulScan')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
