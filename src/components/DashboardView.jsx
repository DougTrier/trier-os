// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Plant-Level Operational Intelligence Dashboard
 * ====================================================================
 * Primary landing page for managers and admins after Mission Control.
 * Divided into four main sections:
 *
 * 1. KPI CARDS -- Four live metric tiles:
 *    - Open Work Orders (links to /jobs)
 *    - Overdue PMs (links to /schedule)
 *    - Total Active Assets (links to /assets)
 *    - Parts Below Reorder Point (links to /parts)
 *
 * 2. REVENUE LEAKAGE ANALYTICS -- The 'bleeding cost' section shows
 *    specific operational inefficiencies with dollar-value estimates.
 *    Each tile routes to the UNIQUE module most relevant to fixing it:
 *      Overstock Capital Lockup  -> parts (inventory optimization)
 *      Expedited Freight         -> supply-chain (PO management)
 *      SKU Fragmentation         -> storeroom (ABC/dead stock analysis)
 *      Off-Shift Phantom Load    -> utilities (energy anomaly detection)
 *      Energy Arbitrage          -> utilities (rate/consumption analysis)
 *      Escrap Monetization       -> engineering-tools (materials)
 *      Contractor Leakage        -> contractors (SLA time tracking)
 *      Consumable Shrink         -> tools (tool crib / vending)
 *      Equipment Arbitrage       -> analytics (CapEx vs rental ROI)
 *
 * 3. RECENT WORK ORDERS TABLE -- Last 10 WOs with status, priority,
 *    and asset linkage. Supports global search results overlay when
 *    a search is active in the header bar.
 *
 * 4. ALL-SITES CORPORATE VIEW -- When selectedPlant === 'all_sites',
 *    the KPI quadrant switches to a multi-plant aggregate view.
 *    CorporateAnalyticsView handles the full enterprise rollup.
 *
 * DATA SOURCES:
 *   GET /api/dashboard/stats   — All KPIs, revenue leakage estimates, and recent WOs
 *   All values are plant-scoped; 'all_sites' triggers enterprise rollup aggregation.
 *   The dbStats object drives every displayed value on this page.
 */
import React, { useEffect } from 'react';
import { ClipboardList, PenTool, BookOpen, CalendarClock, PhoneCall, Mail, Settings, Activity, Users, DollarSign, Search, TrendingUp, Database as DatabaseIcon, Zap, Package, Truck, Layers, Cog, Clock, Box, Scale } from 'lucide-react';
import AnalyticsDashboard from './AnalyticsDashboard';
import EnterpriseIntelligence from './EnterpriseIntelligence';
import PredictiveForesight from './PredictiveForesight';
import ShiftHandoff from './ShiftHandoff';
import TechnicianMetrics from './TechnicianMetrics';
import BudgetForecaster from './BudgetForecaster';
import PlantWeatherMap from './PlantWeatherMap';
import { useTranslation } from '../i18n/index.jsx';
import { TakeTourButton } from './ContextualTour';
import { statusClass, formatDate } from '../utils/formatDate';

function DashboardView({
    selectedPlant,
    setSelectedPlant,
    plants,
    plantAddress,
    globalSearchForm,
    setGlobalSearchForm,
    globalSearchResults,
    setGlobalSearchResults,
    setIsRefreshingDB,
    dbStats,
    setActiveTab,
    onEditLeadership,
    isForeignPlant,
    showDashboard,
    onOpenOnboarding,
    isAdminOrCreator,
    hasGlobalAccess
}) {
    const [isShowingSearchResults, setIsShowingSearchResults] = React.useState(false);
    const [corpQuadrant, setCorpQuadrant] = React.useState(null);
    const { t } = useTranslation();
    const [payScales, setPayScales] = React.useState([]);
    const [isPayScalesOpen, setIsPayScalesOpen] = React.useState(false);

    useEffect(() => {
        if (selectedPlant !== 'all_sites') {
            fetch('/api/analytics/pay-scales', { headers: { 'x-plant-id': selectedPlant } })
                .then(res => res.json())
                .then(data => setPayScales(data || []))
                .catch(e => console.warn(e));
        }
    }, [selectedPlant]);

    // Debounced Search Implementation
    useEffect(() => {
        if (!globalSearchForm) {
            setIsShowingSearchResults(false);
            setGlobalSearchResults([]);
            return;
        }

        const delayDebounceFn = setTimeout(() => {
            if (globalSearchForm.length > 2) {
                setIsRefreshingDB(true);
                fetch(`/api/search?q=${globalSearchForm}`, {
                    headers: { 'x-plant-id': selectedPlant }
                })
                    .then(res => res.json())
                    .then(data => {
                        setGlobalSearchResults(data.results || []);
                        setIsRefreshingDB(false);
                    })
                    .catch(() => {
                        setGlobalSearchResults([]);
                        setIsRefreshingDB(false);
                    });
            } else {
                setGlobalSearchResults([]);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [globalSearchForm, selectedPlant, setIsRefreshingDB, setGlobalSearchResults]);

    return (
        <>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)', overflow: 'hidden' }}>
            {/* Location / Search Bar Area */}
            <div className="glass-card" style={{ padding: '15px 25px', display: 'flex', flexDirection: 'column', gap: '15px', flexShrink: 0, zIndex: 100 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <h2 style={{ fontSize: '1.4rem', margin: 0 }}>{selectedPlant === 'all_sites' ? t('dashboard.enterpriseDashboard', 'Enterprise Dashboard') : plants.find(p => p.id === selectedPlant)?.label || t('dashboard.plantDashboard', 'Plant Dashboard')}</h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>{plantAddress}</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {selectedPlant !== 'all_sites' && !isForeignPlant && (
                            <button
                                onClick={onOpenOnboarding}
                                className="btn-primary"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    color: '#10b981',
                                    border: '1px solid rgba(16, 185, 129, 0.4)',
                                    padding: '8px 16px',
                                    fontSize: '0.9rem',
                                    boxShadow: '0 0 15px rgba(16, 185, 129, 0.2)'
                                }}
                                title={t('.importVendorsAssetsAnd')}
                            >
                                <DatabaseIcon size={18} /> {t('.onboardSite')}
                            </button>
                        )}
                        <div style={{ position: 'relative', width: '400px', maxWidth: '100%' }}>
                            <input
                                type="text"
                                placeholder={t('.searchPartsAssetsOr')}
                                value={globalSearchForm}
                                onChange={(e) => setGlobalSearchForm(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        if (globalSearchResults.length > 0) {
                                            const res = globalSearchResults[0];
                                            if (res.plantId && res.plantId !== selectedPlant) {
                                                setSelectedPlant(res.plantId);
                                                localStorage.setItem('selectedPlantId', res.plantId);
                                                const targetTab = res.type === 'part' ? 'parts' : res.type === 'asset' ? 'assets' : 'jobs';
                                                setActiveTab(targetTab);
                                                return;
                                            }
                                        }
                                        setIsShowingSearchResults(true);
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    padding: '10px 15px',
                                    borderRadius: '25px',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid var(--glass-border)',
                                    color: '#fff',
                                    outline: 'none'
                                }}
                                title={t('dashboard.searchWorkOrdersAssetsPartsTip')}
                            />
                            {globalSearchResults.length > 0 && selectedPlant !== 'all_sites' && (
                                <div style={{
                                    position: 'absolute',
                                    top: '110%',
                                    left: 0,
                                    right: 0,
                                    background: '#1e1e2d',
                                    border: '1px solid var(--glass-border)',
                                    borderRadius: '8px',
                                    zIndex: 1000,
                                    maxHeight: '400px',
                                    overflowY: 'auto',
                                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                                }}>
                                    {globalSearchResults.map((res, i) => (
                                        <div key={i} style={{ padding: '10px 15px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                            onClick={() => {
                                                if (res.plantId) {
                                                    let targetTab = 'jobs';
                                                    if (res.type === 'part') targetTab = 'parts';
                                                    if (res.type === 'asset') targetTab = 'assets';
                                                    if (res.type === 'knowledge-expert') targetTab = 'chat';

                                                    localStorage.setItem('PF_NAV_SEARCH', res.id);
                                                    localStorage.setItem('PF_NAV_VIEW', res.pk || res.id);

                                                    setSelectedPlant(res.plantId);
                                                    localStorage.setItem('selectedPlantId', res.plantId);
                                                    setActiveTab(targetTab);
                                                }
                                            }}
                                        >
                                            <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>{res.id}: {res.title}</span>
                                                <span className="badge badge-gray" style={{ fontSize: '0.65rem' }}>{res.type}</span>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>{res.plantLabel || t('dashboard.currentPlant', 'Current Plant')}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <TakeTourButton tourId="dashboard" style={{ marginRight: '8px' }} />
                        <button 
                            onClick={() => setActiveTab('about')}
                            className="btn-primary" 
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                background: 'rgba(99, 102, 241, 0.1)', 
                                color: 'var(--primary)',
                                border: '1px solid currentColor',
                                padding: '8px 16px',
                                fontSize: '0.9rem'
                            }}
                            title={t('.accessThePlatformOperations')}
                        >
                            <BookOpen size={18} /> {t('.aboutManual')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Predictive Foresight + Shift Handoff — Side by Side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-base)', alignItems: 'stretch' }} className="predictive-shift-row">
                <PredictiveForesight 
                    selectedPlant={selectedPlant} 
                    setActiveTab={setActiveTab} 
                    setSelectedPlant={setSelectedPlant}
                />
                <ShiftHandoff selectedPlant={selectedPlant} />
            </div>

            {/* KPI Cards Row (Hidden in Enterprise View) */}
            {selectedPlant !== 'all_sites' ? (
                <div className="dashboard-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--spacing-base)' }} title={t('.keyPerformanceIndicatorSummary')}>
                    <div
                        className="glass-card"
                        style={{ padding: 'var(--card-padding)', cursor: 'pointer', transition: 'all 0.2s' }}
                        onClick={() => setActiveTab('jobs')}
                        title={t('.clickToViewAll')}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <p 
                                style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 600 }}
                                title={t('.totalNumberOfActive')}
                            >
                                {t('.workOrders')}
                            </p>
                            <ClipboardList color="var(--primary)" size={24} title={t('.workOrderIcon')} />
                        </div>
                        <h2 style={{ fontSize: '2rem' }}>{dbStats?.counts?.workOrders?.toLocaleString() || '...'}</h2>
                    </div>

                    <div
                        className="glass-card"
                        style={{ padding: 'var(--card-padding)', cursor: 'pointer', transition: 'all 0.2s' }}
                        onClick={() => setActiveTab('assets')}
                        title={t('.clickToViewEquipment')}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <p 
                                style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 600 }}
                                title={t('.totalCountOfRegistered')}
                            >
                                {t('.equipmentAssets')}
                            </p>
                            <PenTool color="#10b981" size={24} title={t('.assetManagementIcon')} />
                        </div>
                        <h2 style={{ fontSize: '2rem' }}>{dbStats?.counts?.assets?.toLocaleString() || '...'}</h2>
                    </div>

                    <div
                        className="glass-card"
                        style={{ padding: 'var(--card-padding)', cursor: 'pointer', transition: 'all 0.2s' }}
                        onClick={() => setActiveTab('parts')}
                        title={t('.clickToViewThe')}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <p 
                                style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 600 }}
                                title={t('.countOfUniqueSpare')}
                            >
                                {t('.partsCatalog')}
                            </p>
                            <BookOpen color="#f59e0b" size={24} title={t('.inventoryCatalogIcon')} />
                        </div>
                        <h2 style={{ fontSize: '2rem' }}>{dbStats?.counts?.parts?.toLocaleString() || '...'}</h2>
                    </div>

                    <div
                        className="glass-card"
                        style={{ padding: 'var(--card-padding)', cursor: 'pointer', transition: 'all 0.2s' }}
                        title={t('.activePreventiveMaintenanceSchedules')}
                        onClick={() => {
                            localStorage.setItem('PF_JOBS_NESTED_TAB', 'pm-schedules');
                            setActiveTab('jobs');
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <p 
                                style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 600 }}
                                title={t('.numberOfActiveCycles')}
                            >
                                {t('.activePmSchedules')}
                            </p>
                            <CalendarClock color="#6366f1" size={24} title={t('.schedulingIcon')} />
                        </div>
                        <h2 style={{ fontSize: '2rem' }}>{dbStats?.counts?.schedules?.toLocaleString() || '...'}</h2>
                    </div>

                    <div
                        className="glass-card"
                        style={{ padding: 'var(--card-padding)', cursor: 'pointer', transition: 'all 0.2s' }}
                        onClick={() => setIsPayScalesOpen(true)}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 600 }}>Pay Scales</p>
                            <DollarSign color="#10b981" size={24} />
                        </div>
                        <h2 style={{ fontSize: '2rem', color: '#10b981' }}>${((payScales || []).reduce((s,i) => s + (i.HourlyRate * i.Headcount * 40), 0)).toLocaleString()} <span style={{fontSize:'0.8rem', color:'var(--text-muted)'}}>/ wk</span></h2>
                    </div>
                </div>) : globalSearchResults.length > 0 ? (<div className="glass-card" style={{ padding: 'var(--card-padding)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <BookOpen size={24} color="var(--primary)" /> {t('.enterpriseInventoryAnalysis')}
                        </h2>
                        <div className="badge badge-gray">{t('.showingResultsFor')}: {globalSearchForm}</div>
                    </div>

                    <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--glass-border)', position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(10px)' }}>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>{t('.facilityLocation')}</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>{t('.partCodeDescription')}</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>{t('.inStock')}</th>
                                    <th style={{ padding: '12px', textAlign: 'right' }}>{t('.unitCost')}</th>
                                    <th style={{ padding: '12px', textAlign: 'right' }}>{t('.totalValue')}</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>{t('.action')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const partsOnly = globalSearchResults.filter(r => r.type === 'part');
                                    const groups = partsOnly.reduce((acc, r) => {
                                        if (!acc[r.id]) acc[r.id] = { items: [], id: r.id, title: r.title, totalQty: 0, totalValue: 0 };
                                        acc[r.id].items.push(r);
                                        acc[r.id].totalQty += (parseFloat(r.qty) || 0);
                                        acc[r.id].totalValue += (parseFloat(r.qty) || 0) * (parseFloat(r.cost) || 0);
                                        return acc;
                                    }, {});

                                    return Object.values(groups).map((group) => (
                                        <React.Fragment key={group.id}>
                                            <tr style={{ background: 'rgba(16, 185, 129, 0.05)', borderBottom: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                                <td colSpan={2} style={{ padding: '12px', fontWeight: 'bold' }}>
                                                    <span style={{ color: 'var(--primary)' }}>{t('dashboard.aggregateView', 'AGGREGATE VIEW')}: {group.id}</span>
                                                    <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{group.title}</div>
                                                </td>
                                                <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#10b981' }}>{group.totalQty.toLocaleString()}</td>
                                                <td style={{ padding: '12px', textAlign: 'right', fontStyle: 'italic', fontSize: '0.85rem' }}>Avg: ${(group.totalValue / (group.totalQty || 1)).toFixed(2)}</td>
                                                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>${group.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td></td>
                                            </tr>
                                            {group.items.map((item, idx) => (
                                                <tr key={`${item.id}-${idx}`} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                                    <td style={{ padding: '12px' }}>
                                                        <div style={{ fontWeight: 600 }}>{item.plantLabel}</div>
                                                    </td>
                                                    <td style={{ padding: '12px' }}>
                                                        <div style={{ fontSize: '0.85rem' }}>{item.title}</div>
                                                    </td>
                                                    <td style={{ padding: '12px', textAlign: 'center' }}>{item.qty || 0}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right' }}>${(parseFloat(item.cost) || 0).toFixed(2)}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right' }}>${((parseFloat(item.qty) || 0) * (parseFloat(item.cost) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td style={{ padding: '12px', textAlign: 'center' }}>
                                                        <button 
                                                            onClick={async () => {
                                                                    localStorage.setItem('PF_NAV_SEARCH', item.id);
                                                                    localStorage.setItem('PF_NAV_VIEW', item.pk || item.id);
                                                                    setSelectedPlant(item.plantId);
                                                                    localStorage.setItem('selectedPlantId', item.plantId);
                                                                    setActiveTab('parts');
                                                            }}
                                                            className="btn-primary"
                                                            title={t('dashboard.navigateToThisPartRecordTip')}
                                                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                                        >
                                                            {t('.goToSite')}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ));
                                })()}

                                {globalSearchResults.filter(r => r.type !== 'part').length > 0 && (
                                    <>
                                        <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                            <td colSpan={6} style={{ padding: '15px 12px', fontWeight: 'bold', borderTop: '2px solid var(--primary)' }}>{t('.otherMatchingRecordsAssets')}</td>
                                        </tr>
                                        {globalSearchResults.filter(r => r.type !== 'part').map((res, i) => (
                                            <tr key={`other-${i}`} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                                <td style={{ padding: '12px' }}>{res.plantLabel}</td>
                                                <td colSpan={4} style={{ padding: '12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ fontWeight: 'bold' }}>{res.id}: {res.title}</div>
                                                        <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>{res.type}</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px', textAlign: 'center' }}>
                                                    <button 
                                                        onClick={() => {
                                                            let targetTab = 'jobs';
                                                            if (res.type === 'part') targetTab = 'parts';
                                                            if (res.type === 'asset') targetTab = 'assets';
                                                            if (res.type === 'knowledge-expert') targetTab = 'chat';

                                                            localStorage.setItem('PF_NAV_SEARCH', res.id);
                                                            localStorage.setItem('PF_NAV_VIEW', res.pk || res.id);
                                                            setSelectedPlant(res.plantId);
                                                            localStorage.setItem('selectedPlantId', res.plantId);
                                                            setActiveTab(targetTab);
                                                        }}
                                                        className="btn-primary"
                                                        title={t('dashboard.navigateToThisRecordAtTip')}
                                                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                                    >
                                                        {t('.viewDetails')}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>) : selectedPlant === 'all_sites' ? (
                corpQuadrant ? null : (
                    /* ── Corporate Command Center — 4-Quadrant Hub ── */
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr',
                            gap: '20px', flex: 1, alignContent: 'stretch'
                        }}>
                            {/* Q1: Plant Performance & Health */}
                            <div
                                onClick={() => setCorpQuadrant('performance')}
                                className="glass-card"
                                style={{
                                    padding: '30px', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    border: '1px solid rgba(16, 185, 129, 0.15)',
                                    position: 'relative', overflow: 'hidden'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(16, 185, 129, 0.5)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(16,185,129,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(16, 185, 129, 0.15)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                            <Activity size={24} color="#10b981" />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>{t('dashboard.plantPerformanceHealth', 'Plant Performance & Health')}</h3>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('dashboard.plantPerformanceSubtitle', 'Cross-plant KPIs & facility weather map')}</p>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '20px', marginTop: '15px' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{plants?.length || 0}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('dashboard.plantsStatLabel', 'Plants')}</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{dbStats?.counts?.assets?.toLocaleString() || '...'}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('dashboard.assetsStatLabel', 'Assets')}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Q2: Workforce & Labor */}
                            <div
                                onClick={() => setCorpQuadrant('workforce')}
                                className="glass-card"
                                style={{
                                    padding: '30px', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    border: '1px solid rgba(99, 102, 241, 0.15)',
                                    position: 'relative', overflow: 'hidden'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(99, 102, 241, 0.5)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(99,102,241,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(99, 102, 241, 0.15)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                                            <Users size={24} color="#6366f1" />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>{t('dashboard.workforceLabor', 'Workforce & Labor')}</h3>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('dashboard.workforceLaborSubtitle', 'Technician metrics & institutional knowledge')}</p>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '20px', marginTop: '15px' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6366f1' }}>{dbStats?.counts?.workOrders?.toLocaleString() || '...'}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('dashboard.workOrdersStatLabel', 'Work Orders')}</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6366f1' }}>{dbStats?.counts?.schedules?.toLocaleString() || '...'}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('dashboard.pmSchedulesStatLabel', 'PM Schedules')}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Q3: Financial & Budgeting */}
                            <div
                                onClick={() => setCorpQuadrant('financial')}
                                className="glass-card"
                                style={{
                                    padding: '30px', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    border: '1px solid rgba(245, 158, 11, 0.15)',
                                    position: 'relative', overflow: 'hidden'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(245, 158, 11, 0.5)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(245,158,11,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(245, 158, 11, 0.15)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                            <DollarSign size={24} color="#f59e0b" />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>{t('dashboard.financialBudgeting', 'Financial & Budgeting')}</h3>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('dashboard.financialBudgetingSubtitle', 'Budget forecaster & cost intelligence')}</p>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '20px', marginTop: '15px' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{dbStats?.counts?.parts?.toLocaleString() || '...'}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('dashboard.trackedPartsStatLabel', 'Tracked Parts')}</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>
                                            <TrendingUp size={24} />
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('dashboard.trendingStatLabel', 'Trending')}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Q4: Network & Discovery */}
                            <div
                                onClick={() => setCorpQuadrant('network')}
                                className="glass-card"
                                style={{
                                    padding: '30px', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    border: '1px solid rgba(239, 68, 68, 0.15)',
                                    position: 'relative', overflow: 'hidden'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(239, 68, 68, 0.5)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(239,68,68,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(239, 68, 68, 0.15)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', background: 'radial-gradient(circle, rgba(239,68,68,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                            <Search size={24} color="#ef4444" />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>{t('dashboard.networkDiscovery', 'Network & Discovery')}</h3>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('dashboard.networkDiscoverySubtitle', 'Enterprise search & leadership contacts')}</p>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '20px', marginTop: '15px' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>{dbStats?.leadership?.length || 0}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('dashboard.contactsStatLabel', 'Contacts')}</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>{plants?.length || 0}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('dashboard.sitesStatLabel', 'Sites')}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>)
            ) : showDashboard ? (
                <AnalyticsDashboard plantId={selectedPlant} />
            ) : (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px solid var(--glass-border)', flex: 1, overflowY: 'auto' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '15px', color: 'var(--primary)' }}>{t('dashboard.emptyKey', '🔍')}</div>
                    <h1 style={{ marginBottom: '10px' }}>{t('.enterpriseIntelligence')}</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto 30px' }}>
                        {t('.searchAcrossAllFacilities')}
                    </p>
                    <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '20px', borderRadius: '12px', display: 'inline-block', textAlign: 'left' }}>
                        <div style={{ color: '#f59e0b', fontWeight: 'bold', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <DatabaseIcon size={18} /> {t('.maintenanceLogicTip')}
                        </div>
                        <p style={{ color: '#fff', fontSize: '0.9rem', margin: 0 }}>
                            {t('.fuzzyKeywordSearchEnabled')}
                        </p>
                    </div>
                    <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'center', gap: '40px' }}>
                        <div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>{dbStats?.counts?.workOrders?.toLocaleString() || '...'}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('.companywideWos')}</div>
                        </div>
                        <div style={{ borderLeft: '1px solid var(--glass-border)' }}></div>
                        <div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{dbStats?.counts?.assets?.toLocaleString() || '...'}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('.trackedAssets')}</div>
                        </div>
                        <div style={{ borderLeft: '1px solid var(--glass-border)' }}></div>
                        <div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{dbStats?.counts?.parts?.toLocaleString() || '...'}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('.uniquePartS')}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Feature Navigation: Risk Mastery, Energy Arbitrage, Hoarding & Freight ── */}
            {selectedPlant !== 'all_sites' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--spacing-base)', flexShrink: 0 }}>
                    {/* Risk Score / Underwriter Portal tile */}
                    {['manager', 'corporate', 'it_admin', 'creator'].includes(localStorage.getItem('userRole')) && (
                        <div
                            className="glass-card"
                            onClick={() => setActiveTab('underwriter', { state: { fromDashboard: true } })}
                            style={{ padding: '18px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s', border: '1px solid rgba(16,185,129,0.15)', position: 'relative', overflow: 'hidden' }}
                            onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(16,185,129,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(16,185,129,0.15)'; e.currentTarget.style.transform = 'none'; }}
                            title={t('dashboard.openUnderwriterPortalTip', 'Open the Underwriter Portal to view Risk Score and compliance evidence')}
                        >
                            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(16,185,129,0.2)', flexShrink: 0 }}>
                                <Activity size={22} color="#10b981" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>{t('dashboard.riskScoreInsurance', 'Risk Score & Insurance')}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{t('dashboard.riskScoreSubtitle', 'Underwriter portal · Evidence packet')}</div>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700, background: 'rgba(16,185,129,0.1)', padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(16,185,129,0.3)', whiteSpace: 'nowrap' }}>{t('dashboard.goThere', 'Go there')} →</div>
                        </div>
                    )}

                    {/* Energy Arbitrage tile */}
                    <div
                        className="glass-card"
                        onClick={() => setActiveTab('utilities', { state: { fromDashboard: true } })}
                        style={{ padding: '18px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s', border: '1px solid rgba(245,158,11,0.15)', position: 'relative', overflow: 'hidden' }}
                        onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(245,158,11,0.15)'; e.currentTarget.style.transform = 'none'; }}
                        title={t('dashboard.openEnergyUtilitiesTip', 'Open Energy & Utilities to view Pricing Clock and Arbitrage Advisor')}
                    >
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(245,158,11,0.2)', flexShrink: 0 }}>
                            <Zap size={22} color="#f59e0b" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>{t('dashboard.energyArbitrage', 'Energy Arbitrage')}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{t('dashboard.energyArbitrageSubtitle', 'Pricing clock · Arbitrage advisor')}</div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700, background: 'rgba(245,158,11,0.1)', padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.3)', whiteSpace: 'nowrap' }}>{t('dashboard.goThere', 'Go there')} →</div>
                    </div>

                    {/* Overstock Capital Lockup tile */}
                    <div
                        className="glass-card"
                        onClick={() => setActiveTab('parts', { state: { fromDashboard: true } })}
                        style={{ padding: '18px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s', border: '1px solid rgba(236,72,153,0.15)', position: 'relative', overflow: 'hidden' }}
                        onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(236,72,153,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(236,72,153,0.15)'; e.currentTarget.style.transform = 'none'; }}
                        title={t('dashboard.openOverstockTip', 'Open Parts Catalog to view Overstocked and Hoarded inventory')}
                    >
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(236,72,153,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(236,72,153,0.2)', flexShrink: 0 }}>
                            <Package size={22} color="#ec4899" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                                {t('dashboard.overstockCapitalLockup', 'Overstock Capital Lockup')}
                                {dbStats?.overstockValue > 0 && (
                                    <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#ec4899', fontWeight: '800' }}>
                                        — {(dbStats?.overstockValue || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{t('dashboard.overstockSubtitle', 'Hoarding detection · Trailing consumption')}</div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#ec4899', fontWeight: 700, background: 'rgba(236,72,153,0.1)', padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(236,72,153,0.3)', whiteSpace: 'nowrap' }}>{t('dashboard.fixNow', 'Fix now')} →</div>
                    </div>

                    {/* Expedited Freight Penalty tile */}
                    <div
                        className="glass-card"
                        onClick={() => setActiveTab('supply-chain', { state: { fromDashboard: true } })}
                    >
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(249,115,22,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(249,115,22,0.2)', flexShrink: 0 }}>
                            <Truck size={22} color="#f97316" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                                Expedited Freight
                                {dbStats?.freightPenalty > 0 && (
                                    <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#f97316', fontWeight: '800' }}>
                                        — {(dbStats?.freightPenalty || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{dbStats?.expeditedRatio > 0 ? `${dbStats.expeditedRatio}% Ratio (` : ''}Preventable spend{dbStats?.expeditedRatio > 0 ? ')' : ''}</div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#f97316', fontWeight: 700, background: 'rgba(249,115,22,0.1)', padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(249,115,22,0.3)', whiteSpace: 'nowrap' }}>{t('dashboard.fixNow', 'Fix now')} →</div>
                    </div>

                    {/* SKU Standardization tile */}
                    <div
                        className="glass-card"
                        onClick={() => setActiveTab('storeroom', { state: { fromDashboard: true } })}
                        style={{ padding: '18px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s', border: '1px solid rgba(139,92,246,0.15)', position: 'relative', overflow: 'hidden' }}
                        onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(139,92,246,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(139,92,246,0.15)'; e.currentTarget.style.transform = 'none'; }}
                        title="Open Parts Catalog to review internally fragmented duplicate SKUs"
                    >
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(139,92,246,0.2)', flexShrink: 0 }}>
                            <Layers size={22} color="#8b5cf6" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                                SKU Fragmentation
                                {dbStats?.skuFrozenCapital > 0 && (
                                    <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#8b5cf6', fontWeight: '800' }}>
                                        — {(dbStats?.skuFrozenCapital || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{dbStats?.skuDuplicatesCount > 0 ? `${dbStats.skuDuplicatesCount} Local duplicates detected` : 'Catalog mapped'}</div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#8b5cf6', fontWeight: 700, background: 'rgba(139,92,246,0.1)', padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)', whiteSpace: 'nowrap' }}>{t('dashboard.fixNow', 'Fix now')} →</div>
                    </div>

                    {/* Phantom Load Energy tile */}
                    <div
                        className="glass-card"
                        onClick={() => setActiveTab('utilities', { state: { fromDashboard: true } })}
                        style={{ padding: '18px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s', border: '1px solid rgba(234,179,8,0.15)', position: 'relative', overflow: 'hidden' }}
                        onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(234,179,8,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(234,179,8,0.15)'; e.currentTarget.style.transform = 'none'; }}
                        title="Open Utilities to view and track non-production off-shift bleed"
                    >
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(234,179,8,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(234,179,8,0.2)', flexShrink: 0 }}>
                            <Zap size={22} color="#eab308" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                                Off-Shift Phantom Load
                                {dbStats?.phantomBleed > 0 && (
                                    <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#eab308', fontWeight: '800' }}>
                                        — {(dbStats?.phantomBleed || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{dbStats?.phantomBleed > 0 ? `Unproductive utility drain` : 'Optimized baseline'}</div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#eab308', fontWeight: 700, background: 'rgba(234,179,8,0.1)', padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(234,179,8,0.3)', whiteSpace: 'nowrap' }}>{t('dashboard.fixNow', 'Fix now')} →</div>
                    </div>

                    {/* Scrap Metal Monetization tile */}
                    <div
                        className="glass-card"
                        onClick={() => setActiveTab('engineering-tools', { state: { fromDashboard: true } })}
                        style={{ padding: '18px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s', border: '1px solid rgba(148,163,184,0.15)', position: 'relative', overflow: 'hidden' }}
                        onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(148,163,184,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(148,163,184,0.15)'; e.currentTarget.style.transform = 'none'; }}
                        title="Open Assets to track Scrap Metal Recovery vs Landfill"
                    >
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(148,163,184,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(148,163,184,0.2)', flexShrink: 0 }}>
                            <Cog size={22} color="#94a3b8" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                                Escrap Monetization
                                {dbStats?.scrapBleed > 0 && (
                                    <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#94a3b8', fontWeight: '800' }}>
                                        — {(dbStats?.scrapBleed || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{dbStats?.scrapBleed > 0 ? `Uncaptured byproduct revenue` : 'No scrap detected'}</div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, background: 'rgba(148,163,184,0.1)', padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.3)', whiteSpace: 'nowrap' }}>{t('dashboard.fixNow', 'Fix now')} →</div>
                    </div>

                    {/* Contractor Time Theft tile */}
                    <div
                        className="glass-card"
                        onClick={() => setActiveTab('contractors', { state: { fromDashboard: true } })}
                        style={{ padding: '18px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s', border: '1px solid rgba(244,63,94,0.15)', position: 'relative', overflow: 'hidden' }}
                        onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(244,63,94,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(244,63,94,0.15)'; e.currentTarget.style.transform = 'none'; }}
                        title="Open Contractors to identify SLA time theft variance"
                    >
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(244,63,94,0.2)', flexShrink: 0 }}>
                            <Clock size={22} color="#f43f5e" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                                Contractor Leakage
                                {dbStats?.timeTheftBleed > 0 && (
                                    <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#f43f5e', fontWeight: '800' }}>
                                        — {(dbStats?.timeTheftBleed || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{dbStats?.timeTheftBleed > 0 ? `Unverified physical dwell time` : 'No SLA variance detected'}</div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#f43f5e', fontWeight: 700, background: 'rgba(244,63,94,0.1)', padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(244,63,94,0.3)', whiteSpace: 'nowrap' }}>{t('dashboard.fixNow', 'Fix now')} →</div>
                    </div>

                    {/* Consumable Vending Shrink tile */}
                    <div
                        className="glass-card"
                        onClick={() => setActiveTab('tools', { state: { fromDashboard: true } })}
                        style={{ padding: '18px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s', border: '1px solid rgba(168,85,247,0.15)', position: 'relative', overflow: 'hidden' }}
                        onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(168,85,247,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(168,85,247,0.15)'; e.currentTarget.style.transform = 'none'; }}
                        title="Open Inventory to track Consumable Shrink rate"
                    >
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(168,85,247,0.2)', flexShrink: 0 }}>
                            <Box size={22} color="#a855f7" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                                Consumable Shrink
                                {dbStats?.consumableShrinkBleed > 0 && (
                                    <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#a855f7', fontWeight: '800' }}>
                                        — {(dbStats?.consumableShrinkBleed || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{dbStats?.consumableShrinkBleed > 0 ? `Unmonitored tool crib drain` : 'No open-crib variance detected'}</div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#a855f7', fontWeight: 700, background: 'rgba(168,85,247,0.1)', padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.3)', whiteSpace: 'nowrap' }}>{t('dashboard.fixNow', 'Fix now')} →</div>
                    </div>

                    {/* Equipment Rental Arbitrage tile */}
                    <div
                        className="glass-card"
                        onClick={() => setActiveTab('analytics', { state: { fromDashboard: true } })}
                        style={{ padding: '18px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s', border: '1px solid rgba(14,165,233,0.15)', position: 'relative', overflow: 'hidden' }}
                        onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(14,165,233,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(14,165,233,0.15)'; e.currentTarget.style.transform = 'none'; }}
                        title="Open Assets to identify extended rental leakage"
                    >
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(14,165,233,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(14,165,233,0.2)', flexShrink: 0 }}>
                            <Scale size={22} color="#0ea5e9" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                                Equipment Arbitrage
                                {dbStats?.rentalArbitrageBleed > 0 && (
                                    <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#0ea5e9', fontWeight: '800' }}>
                                        — {(dbStats?.rentalArbitrageBleed || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{dbStats?.rentalArbitrageBleed > 0 ? `Past CapEx break-even point` : 'No rental leakage detected'}</div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#0ea5e9', fontWeight: 700, background: 'rgba(14,165,233,0.1)', padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(14,165,233,0.3)', whiteSpace: 'nowrap' }}>{t('dashboard.fixNow', 'Fix now')} →</div>
                    </div>
                </div>
            )}

            <div className="dashboard-bottom-grid" style={{ display: (selectedPlant === 'all_sites' && !corpQuadrant) ? 'none' : 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', alignItems: 'stretch', flexShrink: 0 }}>
                {selectedPlant !== 'all_sites' && (
                    <div className="glass-card" style={{ padding: 'var(--card-padding)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} title={t('.listOfMostRecent')}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h2 style={{ fontSize: '1.2rem' }}>
                                {isShowingSearchResults ? t('.searchResultsWindow') : t('.recentWorkOrders')}
                            </h2>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                {isShowingSearchResults && (
                                    <button className="btn-primary" onClick={() => setIsShowingSearchResults(false)} title={t('dashboard.clearSearchResultsAndReturnTip')} style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.1)' }}>{t('.clearSearch')}</button>
                                )}
                                <button className="btn-primary" onClick={() => setActiveTab('jobs')} style={{ padding: '8px 16px', fontSize: '0.85rem' }} title={t('.jumpToTheFull')}>{t('.viewAll')}</button>
                            </div>
                        </div>
                        <div style={{ overflowY: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>{t('.wo')}</th>
                                        <th>{t('.description')}</th>
                                        <th>{t('.assetId')}</th>
                                        <th>{t('.priority')}</th>
                                        <th>{t('.dateReq')}</th>
                                        <th>{t('.status')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(isShowingSearchResults ? globalSearchResults.filter(r => r.type === 'work-order') : (dbStats?.recentWOs || [])).map((wo, i) => (
                                        <tr key={`${wo.plantId || 'local'}-${wo.WONum || wo.id || i}`}>
                                            <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{wo.WONum || wo.id}</td>
                                            <td style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{wo.Descr || wo.title}</td>
                                            <td style={{ fontFamily: 'monospace' }}>{wo.AssetID || wo.assetId || 'N/A'}</td>
                                            <td>
                                                {(() => {
                                                    const p = String(wo.Priority || wo.priority || '');
                                                    if (p === '1' || p === '0') return <span className="badge badge-red">{t('.critical')}</span>;
                                                    if (p === '2' || p === '10') return <span className="badge badge-yellow">{t('.medium')}</span>;
                                                    if (p === '3' || p === '100') return <span className="badge badge-blue">{t('.routine')}</span>;
                                                    return <span className="badge badge-gray">{p || 'Unset'}</span>;
                                                })()}
                                            </td>
                                            <td>{formatDate(wo.DateReq || wo.dateReq) || 'None'}</td>
                                            <td>
                                                {(() => {
                                                    const label = wo.Status || wo.status || 'Open';
                                                    return <span className={statusClass(label)}>{label}</span>;
                                                })()}
                                            </td>
                                        </tr>
                                    ))}
                                    {isShowingSearchResults && globalSearchResults.filter(r => r.type === 'work-order').length === 0 && (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('.noMatchingWorkOrders')}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Leadership / Contacts Widget */}
                <div className="glass-card" style={{ padding: 'var(--card-padding)', gridColumn: selectedPlant === 'all_sites' ? '1 / -1' : 'auto', display: 'flex', flexDirection: 'column' }}>
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '15px', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <PhoneCall size={20} /> {selectedPlant === 'all_sites' ? t('.corporateLeadershipEngineering') : t('.siteLeadership')}
                        </div>
                        {!isForeignPlant && (
                            <button 
                                onClick={() => {
                                    const label = selectedPlant === 'all_sites' ? 'Corporate Headquarters' : (plants.find(p => p.id === selectedPlant)?.label || 'Current Site');
                                    onEditLeadership({ id: selectedPlant, label, leaders: dbStats.leadership });
                                }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                                title={t('dashboard.editSiteLeadershipContactsAndTip')}
                            >
                                <Settings size={14} /> {t('.edit')}
                            </button>
                        )}
                    </h2>
                    <div style={{
                        display: selectedPlant === 'all_sites' ? 'flex' : 'grid',
                        gridTemplateColumns: selectedPlant === 'all_sites' ? undefined : '1fr',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        gap: '20px'
                    }}>
                        {dbStats?.leadership?.map(leader => (
                            <div key={`leader-${leader.ID}-${leader.Name}`} style={{
                                flex: selectedPlant === 'all_sites' ? '1 1 300px' : undefined,
                                maxWidth: selectedPlant === 'all_sites' ? '350px' : 'none',
                                background: 'rgba(255,255,255,0.02)',
                                padding: '20px',
                                borderRadius: '12px',
                                border: '1px solid var(--glass-border)',
                                position: 'relative'
                            }}>
                                {!isForeignPlant && (
                                    <button 
                                        onClick={() => {
                                            const label = selectedPlant === 'all_sites' ? 'Corporate Headquarters' : (plants.find(p => p.id === selectedPlant)?.label || 'Current Site');
                                            onEditLeadership({ id: selectedPlant, label, leaders: dbStats.leadership });
                                        }}
                                        style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', opacity: 0.6 }}
                                        title={t('.editContacts')}
                                    >
                                        <Settings size={14} />
                                    </button>
                                )}
                                <div style={{ fontWeight: 600, color: '#fff', fontSize: '1.1rem', marginBottom: '2px' }}>{leader.Name}</div>
                                <div style={{ color: 'var(--primary)', fontSize: '0.85rem', marginBottom: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>{leader.Title}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', color: '#ccc' }}>
                                    {leader.Phone && <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><PhoneCall size={14} className="text-primary" /> {leader.Phone}</div>}
                                    {leader.Email && <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Mail size={14} color="#f59e0b" /> <a href={`mailto:${leader.Email}`} style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dotted' }}>{leader.Email}</a></div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>

            {/* ═══ CORPORATE QUADRANT OVERLAYS (position:fixed — matches Settings/Admin Console pattern) ═══ */}

            {/* Q1: Plant Performance & Health */}
            {corpQuadrant === 'performance' && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9998, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '15px 30px', background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.04))', borderBottom: '2px solid rgba(16,185,129,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0, color: '#fff' }}>
                            <div style={{ background: 'linear-gradient(135deg, #10b981, #059669)', padding: '8px', borderRadius: '10px' }}><Activity size={20} color="#fff" /></div>
                            {t('dashboard.plantPerformanceHealth', 'Plant Performance & Health')}
                        </h2>
                        <button onClick={() => setCorpQuadrant(null)} title={t('dashboard.returnToCommandCenterTip', 'Return to Corporate Command Center')} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 16px', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>← {t('dashboard.backToCommandCenter', 'Back to Command Center')}</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <EnterpriseIntelligence setSelectedPlant={setSelectedPlant} setActiveTab={setActiveTab} />
                        <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                            <h2 style={{ fontSize: '1.2rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '1.4rem' }}>{t('dashboard.emptyKey', '🌤️')}</span> {t('dashboard.plantHealthWeatherMap', 'Plant Health Weather Map')}
                            </h2>
                            <PlantWeatherMap setSelectedPlant={setSelectedPlant} setActiveTab={setActiveTab} />
                        </div>
                    </div>
                </div>
            )}

            {/* Q2: Workforce & Labor */}
            {corpQuadrant === 'workforce' && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9998, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '15px 30px', background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(79,70,229,0.04))', borderBottom: '2px solid rgba(99,102,241,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0, color: '#fff' }}>
                            <div style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', padding: '8px', borderRadius: '10px' }}><Users size={20} color="#fff" /></div>
                            {t('dashboard.workforceLabor', 'Workforce & Labor')}
                        </h2>
                        <button onClick={() => setCorpQuadrant(null)} title={t('dashboard.returnToCommandCenterTip', 'Return to Corporate Command Center')} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 16px', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>← {t('dashboard.backToCommandCenter', 'Back to Command Center')}</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <TechnicianMetrics />
                        <ReminderInsightsCard />
                    </div>
                </div>
            )}

            {/* Q3: Financial & Budgeting */}
            {corpQuadrant === 'financial' && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9998, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '15px 30px', background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(217,119,6,0.04))', borderBottom: '2px solid rgba(245,158,11,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0, color: '#fff' }}>
                            <div style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', padding: '8px', borderRadius: '10px' }}><DollarSign size={20} color="#fff" /></div>
                            {t('dashboard.financialBudgeting', 'Financial & Budgeting')}
                        </h2>
                        <button onClick={() => setCorpQuadrant(null)} title={t('dashboard.returnToCommandCenterTip', 'Return to Corporate Command Center')} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 16px', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>← {t('dashboard.backToCommandCenter', 'Back to Command Center')}</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <BudgetForecaster />
                    </div>
                </div>
            )}

            {/* Q4: Network & Discovery */}
            {corpQuadrant === 'network' && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9998, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '15px 30px', background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(220,38,38,0.04))', borderBottom: '2px solid rgba(239,68,68,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0, color: '#fff' }}>
                            <div style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', padding: '8px', borderRadius: '10px' }}><Search size={20} color="#fff" /></div>
                            {t('dashboard.networkDiscovery', 'Network & Discovery')}
                        </h2>
                        <button onClick={() => setCorpQuadrant(null)} title={t('dashboard.returnToCommandCenterTip', 'Return to Corporate Command Center')} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 16px', color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>← {t('dashboard.backToCommandCenter', 'Back to Command Center')}</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px solid var(--glass-border)' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: '15px', color: 'var(--primary)' }}>{t('dashboard.emptyKey', '🔍')}</div>
                            <h2 style={{ marginBottom: '10px' }}>{t('.unifiedNetworkDiscovery')}</h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: '600px', margin: '0 auto 20px' }}>
                                {t('.searchingAcrossAllFacilities')}
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', opacity: 0.8 }}>
                                <div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--primary)' }}>{dbStats?.counts?.workOrders?.toLocaleString() || '...'}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('.wos')}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#10b981' }}>{dbStats?.counts?.assets?.toLocaleString() || '...'}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('.assets')}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#f59e0b' }}>{dbStats?.counts?.parts?.toLocaleString() || '...'}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('.parts')}</div>
                                </div>
                            </div>
                        </div>
                        <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                            <h2 style={{ fontSize: '1.2rem', marginBottom: '15px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <PhoneCall size={20} /> {t('.corporateLeadershipEngineering')}
                            </h2>
                            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '20px' }}>
                                {dbStats?.leadership?.map(leader => (
                                    <div key={`netleader-${leader.ID}-${leader.Name}`} style={{
                                        flex: '1 1 300px', maxWidth: '350px',
                                        background: 'rgba(255,255,255,0.02)', padding: '20px',
                                        borderRadius: '12px', border: '1px solid var(--glass-border)'
                                    }}>
                                        <div style={{ fontWeight: 600, color: '#fff', fontSize: '1.1rem', marginBottom: '2px' }}>{leader.Name}</div>
                                        <div style={{ color: 'var(--primary)', fontSize: '0.85rem', marginBottom: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>{leader.Title}</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', color: '#ccc' }}>
                                            {leader.Phone && <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><PhoneCall size={14} className="text-primary" /> {leader.Phone}</div>}
                                            {leader.Email && <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Mail size={14} color="#f59e0b" /> <a href={`mailto:${leader.Email}`} style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dotted' }}>{leader.Email}</a></div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {isPayScalesOpen && (
                <PayScalesModal 
                    onClose={() => setIsPayScalesOpen(false)} 
                    selectedPlant={selectedPlant}
                    initialData={payScales}
                    onSave={(newObj) => setPayScales(newObj)}
                />
            )}
        </>
    );
}

/**
 * ReminderInsightsCard — Enterprise-Only Institutional Knowledge Metrics
 * Shows aggregated reminder analytics visible only on the All Sites dashboard.
 * Personal note content is NOT searchable or visible in chat/forum.
 */
function ReminderInsightsCard() {
    const { t } = useTranslation();
    const [stats, setStats] = React.useState(null);
    
    React.useEffect(() => {
        fetch('/api/calendar/reminders/analytics', {
            headers: {
                'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
            }
        })
        .then(r => r.json())
        .then(data => { if (data.total > 0) setStats(data); })
        .catch(e => console.warn('[DashboardView] fetch error:', e));
    }, []);

    if (!stats) return null;

    return (
        <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <span style={{ fontSize: '1.3rem' }}>{t('dashboard.emptyKey', '🧠')}</span>
                <div>
                    <h2 style={{ fontSize: '1.2rem', margin: 0, color: '#fbbf24' }}>{t('.tribalKnowledge')}</h2>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {t('.fieldReminderInsightsWhat')}
                    </p>
                </div>
            </div>

            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(251, 191, 36, 0.05)', borderRadius: '12px', border: '1px solid rgba(251, 191, 36, 0.15)' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#fbbf24' }}>{stats.total}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('.totalNotes')}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#10b981' }}>{stats.completionRate}%</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('.completion')}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#6366f1' }}>{stats.active}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('.active')}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#fff' }}>
                        {stats.avgResponseHrs !== null
                            ? (stats.avgResponseHrs < 24 ? `${stats.avgResponseHrs}h` : `${Math.round(stats.avgResponseHrs / 24)}d`)
                            : '—'
                        }
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('.avgResponse')}</div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Top Keywords */}
                <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '1px', fontWeight: 'bold' }}>
                        🏷️ {t('.topMaintenanceThemes')}
                    </div>
                    {stats.topKeywords && stats.topKeywords.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {stats.topKeywords.map(kw => (
                                <span key={kw.word} style={{
                                    padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem',
                                    background: 'rgba(251, 191, 36, 0.08)', color: '#fbbf24',
                                    border: '1px solid rgba(251, 191, 36, 0.2)', fontWeight: '600'
                                }}>
                                    {kw.word} <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>×{kw.count}</span>
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            {t('.themesWillAppearAs')}
                        </p>
                    )}
                </div>

                {/* Recent Completed */}
                <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '1px', fontWeight: 'bold' }}>
                        📋 {t('.recentCompletedNotes')}
                    </div>
                    {stats.recentCompleted && stats.recentCompleted.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {stats.recentCompleted.map((r, i) => (
                                <div key={i} style={{
                                    padding: '8px 10px', borderRadius: '8px',
                                    background: 'rgba(255,255,255,0.02)', fontSize: '0.8rem',
                                    borderLeft: '3px solid rgba(251, 191, 36, 0.4)'
                                }}>
                                    <div style={{ color: '#ddd', lineHeight: '1.3' }}>
                                        {r.note.length > 80 ? r.note.substring(0, 80) + '...' : r.note}
                                    </div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                        {r.created_by !== 'system' ? r.created_by + ' · ' : ''}
                                        {formatDate(r.completed_at) || r.reminder_date}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            {t('.completedNotesWillAppear')}
                        </p>
                    )}
                </div>
            </div>

            {/* Busiest Days */}
            {stats.byDay && stats.byDay.length > 0 && (
                <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px', fontWeight: 'bold' }}>
                        📅 {t('.busiestReminderDays')}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {stats.byDay.map(d => (
                            <div key={d.day_name} style={{ 
                                padding: '4px 12px', borderRadius: '8px', fontSize: '0.75rem',
                                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' 
                            }}>
                                <span style={{ color: '#fff', fontWeight: 'bold' }}>{d.day_name}</span>
                                <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>{d.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function PayScalesModal({ onClose, selectedPlant, initialData, onSave }) {
    const { t } = useTranslation();
    const [scales, setScales] = React.useState([...initialData]);
    const OPTIONS = ['Maintenance', 'Engineering', 'Union Employee 1', 'Union Employee 2', 'Union Employee 3', 'Office', 'Supervisor', 'Manager', 'Plant Manager', 'Plant Superintendent', 'General Manager'];

    const handleAdd = () => setScales([...scales, { Classification: OPTIONS[0], HourlyRate: 0, Headcount: 1, IsSalary: 0, SalaryRate: 0, PayFrequency: 'Annually', EmployeeRef: '' }]);
    
    const handleSave = async () => {
        const payload = scales.map(s => {
            let hr = s.HourlyRate;
            if (s.IsSalary) {
                let div = 2080;
                switch(s.PayFrequency) {
                    case 'Weekly': div = 40; break;
                    case 'Bi-weekly': div = 80; break;
                    case 'Semi-monthly': div = 86.66; break;
                    case 'Monthly': div = 173.33; break;
                    case 'Annually': div = 2080; break;
                    default: div = 2080;
                }
                hr = s.SalaryRate / div;
            }
            return { ...s, HourlyRate: hr, Headcount: s.IsSalary ? 1 : s.Headcount };
        });

        const r = await fetch('/api/analytics/pay-scales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-plant-id': selectedPlant },
            body: JSON.stringify(payload)
        });
        if(r.ok) {
            onSave(payload);
            onClose();
        } else {
            const e = await r.json();
            window.trierToast?.error('Failed to save pay scales: ' + (e.error || 'Unknown error'));
        }
    };

    return (
        <div style={{position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center'}} onClick={onClose}>
            <div className="glass-card" style={{width: 700, maxWidth: '95%', padding: '25px', display: 'flex', flexDirection: 'column', gap: 20, maxHeight:'90vh'}} onClick={e=>e.stopPropagation()}>
                <h2 style={{margin:0, display:'flex', alignItems:'center', gap:10}}><DollarSign color="#10b981"/> Plant Pay Scales</h2>
                <p style={{color:'var(--text-muted)', fontSize:'0.85rem', margin:0}}>Configure classifications for Union (Hourly) and Company (Salary) employees. This configures standard burden rates automatically used in Safety formulas.</p>
                
                <div style={{overflowY:'auto', flex:1, paddingRight: 5}}>
                    {scales.map((s, idx) => (
                        <div key={idx} style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, marginBottom: 8 }}>
                            <div style={{ display: 'flex', gap: 15, alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display:'block', marginBottom: 4 }}>Classification</label>
                                    <select value={s.Classification} onChange={e => { const n = [...scales]; n[idx].Classification = e.target.value; setScales(n); }} style={{ width: '100%', padding: '6px 8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: 4 }}>
                                        {OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', paddingTop: 25 }}>
                                    <input type="checkbox" id={`sal_${idx}`} checked={s.IsSalary ? true : false} onChange={e => { const n = [...scales]; n[idx].IsSalary = e.target.checked ? 1 : 0; n[idx].Headcount = e.target.checked ? 1 : n[idx].Headcount; setScales(n); }} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                                    <label htmlFor={`sal_${idx}`} style={{ marginLeft: 6, fontSize: '0.85rem', cursor: 'pointer' }}>Salary Worker</label>
                                </div>
                                <button onClick={() => { const n = [...scales]; n.splice(idx, 1); setScales(n); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '24px 5px 0' }}>X</button>
                            </div>

                            {s.IsSalary ? (
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <div style={{ flex: 1.5 }}>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display:'block', marginBottom: 4 }}>Employee Name (Optional)</label>
                                        <input type="text" value={s.EmployeeRef || ''} onChange={e => { const n = [...scales]; n[idx].EmployeeRef = e.target.value; setScales(n); }} style={{ width: '100%', padding: '6px 8px' }} placeholder="e.g. John Doe" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display:'block', marginBottom: 4 }}>Salary Amount ($)</label>
                                        <input type="number" value={s.SalaryRate} onChange={e => { const n = [...scales]; n[idx].SalaryRate = Number(e.target.value); setScales(n); }} style={{ width: '100%', padding: '6px 8px' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display:'block', marginBottom: 4 }}>Frequency</label>
                                        <select value={s.PayFrequency || 'Annually'} onChange={e => { const n = [...scales]; n[idx].PayFrequency = e.target.value; setScales(n); }} style={{ width: '100%', padding: '6px 8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: 4 }}>
                                            {['Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly', 'Annually'].map(o => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display:'block', marginBottom: 4 }}>Total Equivalent Headcount</label>
                                        <input type="number" value={s.Headcount} onChange={e => { const n = [...scales]; n[idx].Headcount = Number(e.target.value); setScales(n); }} style={{ width: '100%', padding: '6px 8px' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display:'block', marginBottom: 4 }}>Hourly Rate ($)</label>
                                        <input type="number" value={s.HourlyRate} onChange={e => { const n = [...scales]; n[idx].HourlyRate = Number(e.target.value); setScales(n); }} style={{ width: '100%', padding: '6px 8px' }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    {scales.length === 0 && <div style={{textAlign:'center', color:'var(--text-muted)', padding: 20}}>No personnel configured for this site.</div>}
                </div>

                <div style={{display:'flex', justifyContent:'space-between', marginTop: 10}}>
                    <button className="btn-nav" onClick={handleAdd}>+ Add Row</button>
                    <div style={{display:'flex', gap:10}}>
                        <button className="btn-nav" onClick={onClose}>Cancel</button>
                        <button className="btn-save" onClick={handleSave}>Save Configuration</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DashboardView;
