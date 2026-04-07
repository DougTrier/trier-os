// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Enterprise Asset Logistics
 * =======================================
 * Cross-plant asset search and availability view. Queries the MasterAssetIndex
 * across all facilities to locate equipment by name, tag, or type — enabling
 * emergency sourcing of spare or idle assets without phone calls.
 *
 * KEY FEATURES:
 *   - Full-text search across all plant asset registers simultaneously
 *   - Status filter: In Production / Spare / Offline / Decommissioned
 *   - Results show: asset name, tag, plant location, status, last PM date
 *   - "Reserve" action: flag an asset as pending transfer for logistics
 *   - Print asset locator card for physical retrieval teams
 *   - Mini-map pin overlay: click result to highlight plant on the map
 *
 * USE CASES:
 *   - Line-down emergency: "Find me a spare 20HP pump — any plant"
 *   - Capital planning: identify underutilized spare capacity across fleet
 *   - Audit: verify each plant's reported asset count vs MasterAssetIndex
 *
 * API CALLS:
 *   GET /api/assets/logistics-search?q= — Cross-plant asset query via MasterAssetIndex
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Network, RefreshCw, CheckCircle, Eye, Printer, X } from 'lucide-react';
import SearchBar from './SearchBar';
import { useTranslation } from '../i18n/index.jsx';

export default function AssetLogisticsView({ plantId }) {
    const { t } = useTranslation();
    const [globalQuery, setGlobalQuery] = useState('');
    const [globalResults, setGlobalResults] = useState([]);
    const [globalLoading, setGlobalLoading] = useState(false);
    const [viewRecord, setViewRecord] = useState(null);

    const handleGlobalSearch = async () => {
        if (!globalQuery.trim()) return;
        setGlobalLoading(true);
        try {
            const res = await fetch(`/api/logistics/search-assets?query=${encodeURIComponent(globalQuery)}`);
            const data = await res.json();
            setGlobalResults(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Global asset search failed', err);
        } finally {
            setGlobalLoading(false);
        }
    };

    return (
        <div className="glass-card" style={{ padding: 'var(--card-padding)', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px', marginBottom: '10px' }}>
                <h2 style={{ fontSize: '1.2rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Network size={22} /> {t('asset.logistics.enterpriseAssetLink')}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '5px 0 0 0' }}>
                    {t('asset.logistics.description', 'Scan the entire corporate network for critical machinery, motors, or backup spares.')}
                </p>
            </div>

            <div style={{ display: 'flex', gap: '15px', background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                <SearchBar value={globalQuery} onChange={setGlobalQuery} placeholder={t('asset.logistics.scanCompanyForEquipment')} style={{ flex: 1 }} title={t('assetLogisticsView.searchByEquipmentNameModelTip')} onKeyDown={e => e.key === 'Enter' && handleGlobalSearch()} />
                <button 
                    className="btn-primary" 
                    onClick={handleGlobalSearch} 
                    disabled={globalLoading}
                    style={{ background: 'linear-gradient(135deg, var(--primary), #4f46e5)', padding: '0 25px' }}
                    title={t('assetLogisticsView.searchForMatchingEquipmentAcrossTip')}
                >
                    {globalLoading ? <RefreshCw className="spinning" size={18} /> : <span>{t('asset.logistics.findSpares')}</span>}
                </button>
            </div>

            <div style={{ 
                border: '1px solid var(--glass-border)', 
                borderRadius: '12px', 
                overflow: 'hidden', 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column',
                background: 'rgba(0,0,0,0.2)'
            }}>
                <table className="data-table">
                    <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <th>{t('asset.logistics.plantLocation')}</th>
                            <th>{t('assetLogisticsView.type')}</th>
                            <th>{t('asset.logistics.assetId')}</th>
                            <th>{t('asset.logistics.descriptionModel')}</th>
                            <th>{t('asset.logistics.operationalState')}</th>
                            <th style={{ textAlign: 'right' }}>{t('asset.logistics.availability')}</th>
                            <th style={{ textAlign: 'center', width: '100px' }}>{t('system.table.actions', 'Actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {globalResults.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
                                    {globalLoading ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                                            <RefreshCw className="spinning" size={32} />
                                            <p>{t('asset.logistics.pingingRemotePlantDatabases')}</p>
                                        </div>
                                    ) : (
                                        <div style={{ opacity: 0.5 }}>
                                            <Network size={48} style={{ marginBottom: '15px' }} />
                                            <p>{t('asset.logistics.enterAModelNumber')}</p>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ) : globalResults.map((r, i) => {
                            const isAvailable = r.availability === 'Available';
                            const isAsset = r.type === 'asset';
                            return (
                            <tr key={i} style={{ opacity: isAvailable ? 1 : 0.7 }}>
                                <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{r.plant.replace(/_/g, ' ')}</td>
                                <td>
                                    <span style={{
                                        padding: '3px 10px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 800,
                                        background: isAsset ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)',
                                        color: isAsset ? '#818cf8' : '#10b981',
                                        border: `1px solid ${isAsset ? 'rgba(99,102,241,0.3)' : 'rgba(16,185,129,0.3)'}`
                                    }}>
                                        {isAsset ? '⚙ ASSET' : '🔩 PART'}
                                    </span>
                                </td>
                                <td style={{ fontWeight: 'bold' }}>{r.assetId}</td>
                                <td>
                                    <div style={{ fontWeight: 600 }}>{r.description}</div>
                                    {r.model && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Model: {r.model}</div>}
                                    {r.partNumber && <div style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>Part #: {r.partNumber}</div>}
                                </td>
                                <td>
                                     <span style={{ 
                                        padding: '4px 12px', 
                                        borderRadius: '20px', 
                                        fontSize: '0.7rem', 
                                        fontWeight: 800,
                                        background: isAvailable ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.05)',
                                        color: isAvailable ? '#f59e0b' : 'var(--text-muted)',
                                        border: `1px solid ${isAvailable ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.1)'}`
                                    }}>
                                        {r.status || 'In Production'}
                                    </span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    {isAvailable ? (
                                        <div style={{ color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                            <CheckCircle size={14} />
                                            <span style={{ fontWeight: 700, fontSize: '0.75rem' }}>{t('asset.logistics.available')}</span>
                                        </div>
                                    ) : (
                                        <span style={{ color: 'rgba(239, 68, 68, 0.6)', fontWeight: 600, fontSize: '0.75rem' }}>{t('asset.logistics.inUse')}</span>
                                    )}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                        <button 
                                            className="btn-icon" 
                                            title={t('system.table.view', 'View')}
                                            onClick={() => setViewRecord(r)}
                                            style={{ color: 'var(--primary)', padding: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}
                                        >
                                            <Eye size={16} />
                                        </button>
                                        <button 
                                            className="btn-icon no-print" 
                                            title={t('system.table.print', 'Print')}
                                            onClick={() => {
                                                setViewRecord(r);
                                                window.triggerTrierPrint('logistics-intercept', r);
                                            }}
                                            style={{ color: 'var(--text-muted)', padding: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}
                                        >
                                            <Printer size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {viewRecord && createPortal(
                <div className="no-print" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                    zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div className="glass-card" style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px' }}>
                            <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--primary)' }}>
                                {viewRecord.type === 'asset' ? 'Asset' : 'Part'} Details - Plant {viewRecord.plant.replace(/_/g, ' ')}
                            </h2>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="btn-icon no-print" onClick={() => window.triggerTrierPrint('logistics-intercept', viewRecord)} title="Print">
                                    <Printer size={20} />
                                </button>
                                <button className="btn-icon no-print" onClick={() => setViewRecord(null)} title="Close">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="printable-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Description</label>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{viewRecord.description}</div>
                                </div>
                                
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Plant Network Location</label>
                                    <div style={{ fontWeight: 500 }}>{viewRecord.plant.replace(/_/g, ' ')}</div>
                                </div>
                                
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Type</label>
                                    <div style={{ fontWeight: 500, color: viewRecord.type === 'asset' ? '#818cf8' : '#10b981' }}>{viewRecord.type.toUpperCase()}</div>
                                </div>
                                
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>ID Code</label>
                                    <div style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: '1.05rem', background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>{viewRecord.assetId}</div>
                                </div>
                                
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Operational Status</label>
                                    <div style={{ fontWeight: 500 }}>{viewRecord.status || 'In Production'}</div>
                                </div>

                                {viewRecord.model && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Equipment Model</label>
                                        <div style={{ fontWeight: 500 }}>{viewRecord.model}</div>
                                    </div>
                                )}

                                {viewRecord.partNumber && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>OEM Part Number</label>
                                        <div style={{ fontWeight: 500, color: 'var(--primary)' }}>{viewRecord.partNumber}</div>
                                    </div>
                                )}

                                {viewRecord.serial && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Serial Number</label>
                                        <div style={{ fontWeight: 500 }}>{viewRecord.serial}</div>
                                    </div>
                                )}
                            </div>
                            
                            <div className="no-print" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.1)', padding: '15px', borderRadius: '8px' }}>
                                <h4 style={{ margin: '0 0 10px 0', color: 'var(--primary)', fontSize: '0.9rem' }}>Logistics Intercept Action</h4>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                                    This read-only record was pulled from a live production server. To request priority transport for emergency maintenance operations, select the PR1 requisition channel. Edit capabilities are restricted to the originating local plant administrator.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
}
