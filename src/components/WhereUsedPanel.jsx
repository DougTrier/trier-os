// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Parts Where-Used Panel
 * ====================================
 * Answers the critical storeroom question: "Where is this part used?"
 * Shows every asset in the plant (and enterprise) whose BOM includes
 * the selected part — in a full-width, high-readability layout.
 *
 * KEY FEATURES:
 *   - Where-used list: all assets whose BOM contains this part number
 *   - Columns: asset name, tag, location, required qty, status
 *   - Enterprise scope: shows across all plants if IT Admin or Corporate
 *   - Collapse toggle: minimize to "N assets use this part" when not in focus
 *   - Click asset: navigates to that asset's detail panel
 *   - Useful for: assessing impact before depleting last unit of a part
 *
 * DATA SOURCES:
 *   GET /api/parts/:partId/where-used   — All BOM entries referencing this part
 *
 * @param {string|number} partId — The part whose where-used list to display
 */
import React, { useState, useEffect } from 'react';
import LoadingSpinner from './LoadingSpinner';
import { useTranslation } from '../i18n/index.jsx';

export default function WhereUsedPanel({ partId }) {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        if (!partId) return;
        setLoading(true);
        fetch(`/api/analytics/parts-where-used/${encodeURIComponent(partId)}`)
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [partId]);

    if (loading) return (
        <div style={{ marginTop: 20, padding: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 14, border: '1px solid var(--glass-border)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>🔍 Searching all plants for usage data...</span>
        </div>
    );

    if (!data) return null;

    const hasData = (data.usedOn?.length || 0) + (data.bomOn?.length || 0) > 0;

    return (
        <div style={{
            marginTop: 20,
            background: 'rgba(30,41,59,0.5)',
            borderRadius: 14,
            border: '1px solid rgba(34,197,94,0.2)',
            overflow: 'hidden',
            gridColumn: '1 / -1'  /* FORCE full width across any grid parent */
        }}>
            {/* Header */}
            <div onClick={() => setCollapsed(!collapsed)} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 22px', cursor: 'pointer',
                background: 'rgba(34,197,94,0.06)',
                borderBottom: collapsed ? 'none' : '1px solid rgba(34,197,94,0.12)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 22 }}>🔍</span>
                    <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#e2e8f0' }}>Where-Used Analysis</span>
                    <span style={{
                        fontSize: '0.85rem', color: '#94a3b8',
                        background: 'rgba(34,197,94,0.15)', padding: '3px 12px', borderRadius: 12
                    }}>
                        {data.totalAssets} assets · {data.totalPlants} plants
                    </span>
                </div>
                <span style={{
                    color: '#64748b', fontSize: 14, transition: 'transform 0.2s',
                    transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
                }}>▼</span>
            </div>

            {/* Body */}
            {!collapsed && (
                <div style={{ padding: '16px 22px' }}>
                    {!hasData ? (
                        <div style={{ textAlign: 'center', padding: 30, color: '#64748b', fontSize: '1rem' }}>
                            This part has no recorded usage or BOM linkages across the network.
                        </div>
                    ) : (
                        <>
                            {/* Actual Work Order Consumption */}
                            {data.usedOn?.length > 0 && (
                                <div style={{ marginBottom: 20 }}>
                                    <div style={{
                                        fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b',
                                        textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em'
                                    }}>
                                        ⚡ Work Order Usage ({data.usedOn.length} assets)
                                    </div>
                                    <div style={{
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: 10, overflow: 'hidden'
                                    }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{
                                                    background: 'rgba(255,255,255,0.03)',
                                                    borderBottom: '1px solid rgba(255,255,255,0.08)'
                                                }}>
                                                    <th style={thStyle}>Asset</th>
                                                    <th style={thStyle}>Plant</th>
                                                    <th style={{ ...thStyle, textAlign: 'center' }}>Times Used</th>
                                                    <th style={{ ...thStyle, textAlign: 'center' }}>Total Qty</th>
                                                    <th style={{ ...thStyle, textAlign: 'right' }}>Total Cost</th>
                                                    <th style={{ ...thStyle, textAlign: 'right' }}>Last Used</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.usedOn.map((u, i) => (
                                                    <tr key={i} style={{
                                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                        transition: 'background 0.15s',
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        <td style={{ padding: '12px 14px' }}>
                                                            <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.95rem', fontFamily: 'monospace' }}>{u.assetId}</div>
                                                            <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 2 }}>{u.assetDesc}</div>
                                                        </td>
                                                        <td style={{ padding: '12px 14px', color: '#cbd5e1', fontSize: '0.9rem' }}>{u.plant}</td>
                                                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                                            <span style={{
                                                                background: u.timesUsed > 1 ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                                                                color: u.timesUsed > 1 ? '#818cf8' : '#94a3b8',
                                                                padding: '4px 12px', borderRadius: 8,
                                                                fontWeight: 700, fontSize: '0.95rem'
                                                            }}>
                                                                {u.timesUsed}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '12px 14px', textAlign: 'center', color: '#e2e8f0', fontWeight: 600, fontSize: '0.95rem' }}>
                                                            {u.totalQty}
                                                        </td>
                                                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#a78bfa', fontWeight: 700, fontSize: '0.95rem' }}>
                                                            ${parseFloat(u.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#94a3b8', fontSize: '0.85rem' }}>
                                                            {u.lastUsed || '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* BOM Linkages */}
                            {data.bomOn?.length > 0 && (
                                <div>
                                    <div style={{
                                        fontSize: '0.85rem', fontWeight: 700, color: '#6366f1',
                                        textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em'
                                    }}>
                                        📋 Bill of Materials Linkages ({data.bomOn.length} assets)
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {data.bomOn.map((b, i) => (
                                            <div key={i} style={{
                                                background: 'rgba(99,102,241,0.08)',
                                                border: '1px solid rgba(99,102,241,0.2)',
                                                borderRadius: 10, padding: '8px 16px', fontSize: '0.9rem'
                                            }}>
                                                <span style={{ color: '#60a5fa', fontWeight: 700, fontFamily: 'monospace' }}>{b.assetId}</span>
                                                <span style={{ color: '#64748b', margin: '0 6px' }}>·</span>
                                                <span style={{ color: '#cbd5e1' }}>{b.plant}</span>
                                                {b.Quantity > 1 && <span style={{ color: '#a78bfa', marginLeft: 8, fontWeight: 700 }}>×{b.Quantity}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

const thStyle = {
    padding: '10px 14px', textAlign: 'left', color: '#94a3b8',
    fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700,
    letterSpacing: '0.05em'
};
