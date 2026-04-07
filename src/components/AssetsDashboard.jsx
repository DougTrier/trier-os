// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Assets Dashboard
 * ==============================
 * Top-level asset management container. Composes multiple asset-related
 * sub-views into a tabbed experience for full equipment lifecycle visibility.
 *
 * TABS:
 *   Assets          — AssetsView: searchable/sortable asset registry with detail panel
 *   Asset Logistics — AssetLogisticsView: cross-plant asset transfer and tracking
 *   Downtime Logs   — DowntimeLogsView: aggregated downtime history per asset
 *   Parts Used      — PartsUsedView: parts consumption history linked to assets
 *   Floor Plans     — FloorPlanView: asset location pins on facility floor plan
 *
 * Each tab is a self-contained component that manages its own API calls
 * and local state. This parent container only manages tab selection and
 * passes the current plantId down as a prop.
 *
 * @param {string} plantId - Current plant identifier
 */
import React, { useState } from 'react';
import AssetsView from './AssetsView';
import AssetLogisticsView from './AssetLogisticsView';
import DowntimeLogsView from './DowntimeLogsView';
import PartsUsedView from './PartsUsedView';
import FloorPlanView from './FloorPlanView';
import WarrantyDashboard from './WarrantyDashboard';
import { Server, Activity, Wrench, BookOpen, Globe2, MapPin, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import { TakeTourButton } from './ContextualTour';

export default function AssetsDashboard({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [nestedTab, setNestedTab] = useState('registry');

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)', overflow: 'hidden' }}>
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Server size={24} /> {t('assets.assetsMachinery')}
                </h2>

                <div style={{ width: '2px', height: '30px', background: 'var(--glass-border)' }}></div>

                <div className="nav-pills" style={{ padding: 0, margin: 0, background: 'transparent' }}>
                    <button 
                        onClick={() => setNestedTab('registry')}
                        className={`btn-nav ${nestedTab === 'registry' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('assetsDashboard.viewAndManageTheEquipmentTip')}
                    >
                        <Server size={16} /> {t('assets.assetRegistry')}
                    </button>
                    <button
                        onClick={() => setNestedTab('warranty')}
                        className={`btn-nav ${nestedTab === 'warranty' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title="Warranty tracking, claims lifecycle & cost avoidance"
                    >
                        <ShieldCheck size={16} /> Warranty
                    </button>
                    <button
                        onClick={() => setNestedTab('downtime')}
                        className={`btn-nav ${nestedTab === 'downtime' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('assetsDashboard.viewHistoricalEquipmentDowntimeRecordsTip')}
                    >
                        <Activity size={16} /> {t('assets.downtimeLogs')}
                    </button>
                    <button 
                        onClick={() => setNestedTab('parts-used')}
                        className={`btn-nav ${nestedTab === 'parts-used' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('assetsDashboard.viewPartsConsumptionHistoryPerTip')}
                    >
                        <Wrench size={16} /> {t('assets.partsUsed')}
                    </button>
                    <button 
                        onClick={() => setNestedTab('logistics')}
                        className={`btn-nav ${nestedTab === 'logistics' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('assetsDashboard.searchForEquipmentAcrossAllTip')}
                    >
                        <Globe2 size={16} /> {t('assets.globalLogistics')}
                    </button>
                    <button 
                        onClick={() => setNestedTab('floorplan')}
                        className={`btn-nav ${nestedTab === 'floorplan' ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('assetsDashboard.viewTheFacilityFloorPlanTip')}
                    >
                        <MapPin size={16} /> {t('assets.floorPlan')}
                    </button>
                </div>
                
                <TakeTourButton tourId="assets" nestedTab={nestedTab} />
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
                    title={t('assetsDashboard.openTheOperationsManualAndTip')}
                >
                    <BookOpen size={18} /> {t('assets.manual')}
                </button>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {nestedTab === 'registry' && <AssetsView plantId={plantId} plantLabel={plantLabel} />}

                {nestedTab === 'warranty' && (
                    <div className="glass-card" style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                        <WarrantyDashboard plantId={plantId} />
                    </div>
                )}

                {nestedTab === 'downtime' && <DowntimeLogsView plantId={plantId} />}

                {nestedTab === 'parts-used' && <PartsUsedView plantId={plantId} />}

                {nestedTab === 'logistics' && <AssetLogisticsView plantId={plantId} />}

                {nestedTab === 'floorplan' && (
                    <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', overflow: 'hidden' }}>
                        <FloorPlanView 
                            plantId={plantId} 
                            isAdmin={['it_admin', 'creator', 'manager'].includes(localStorage.getItem('userRole')) || localStorage.getItem('PF_USER_IS_CREATOR') === 'true'}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
