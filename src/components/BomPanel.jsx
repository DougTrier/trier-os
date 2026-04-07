// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Bill of Materials (BOM) Panel
 * ==========================================
 * Asset-level parts list panel showing every part required for an asset,
 * with live storeroom stock status, unit costs, and one-click reorder links.
 * Embedded in the Asset Detail panel — collapses/expands in place.
 *
 * KEY FEATURES:
 *   - Parts list: part number, description, qty required, qty on hand, unit cost
 *   - Stock status badge: In Stock / Low Stock / Out of Stock (color-coded)
 *   - Add part: search parts catalog, set required quantity, save to BOM
 *   - Remove part: remove from BOM with confirmation (does not delete from catalog)
 *   - Total cost estimate: sum of (qty × unit cost) for all BOM lines
 *   - Collapse toggle: minimizes to "N parts" summary when not in focus
 *   - Edit mode: adds/removes enabled only when parent panel is in edit mode
 *
 * API CALLS:
 *   GET    /api/assets/:assetId/bom         — Load BOM for asset
 *   POST   /api/assets/:assetId/bom         — Add part to BOM
 *   DELETE /api/assets/:assetId/bom/:partId — Remove part from BOM
 *
 * @param {string|number} assetId   — Parent asset ID
 * @param {boolean}       isEditing — Enables add/remove controls when true
 */
import React, { useState, useEffect } from 'react';
import LoadingSpinner from './LoadingSpinner';
import { useTranslation } from '../i18n/index.jsx';

export default function BomPanel({ assetId, isEditing }) {
    const { t } = useTranslation();
    const [bom, setBom] = useState(null);
    const [loading, setLoading] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [addingPart, setAddingPart] = useState(false);
    const [newPart, setNewPart] = useState({ partId: '', quantity: 1, comment: '' });
    const [parts, setParts] = useState([]);

    useEffect(() => {
        if (!assetId) return;
        setLoading(true);
        fetch(`/api/assets/${encodeURIComponent(assetId)}/bom`)
            .then(r => r.json())
            .then(d => { setBom(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [assetId]);

    // Fetch available parts for the add dropdown
    useEffect(() => {
        if (addingPart && parts.length === 0) {
            fetch('/api/parts?limit=500')
                .then(r => r.json())
                .then(d => setParts(d.data || d || []))
                .catch(e => console.warn('[BomPanel] fetch error:', e));
        }
    }, [addingPart]);

    const handleAdd = async () => {
        if (!newPart.partId) return;
        try {
            const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}/bom`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newPart)
            });
            if (res.ok) {
                // Refresh BOM
                const d = await fetch(`/api/assets/${encodeURIComponent(assetId)}/bom`).then(r => r.json()).catch(e => console.warn('[BomPanel]', e));
                setBom(d);
                setAddingPart(false);
                setNewPart({ partId: '', quantity: 1, comment: '' });
            }
        } catch (e) { console.error('BOM add error:', e); }
    };

    const handleRemove = async (partId) => {
        if (!await confirm(`Remove ${partId} from BOM?`)) return;
        try {
            await fetch(`/api/assets/${encodeURIComponent(assetId)}/bom/${encodeURIComponent(partId)}`, { method: 'DELETE' });
            const d = await fetch(`/api/assets/${encodeURIComponent(assetId)}/bom`).then(r => r.json()).catch(e => console.warn('[BomPanel]', e));
            setBom(d);
        } catch (e) { console.error('BOM remove error:', e); }
    };

    if (loading) return (
        <div style={{ marginTop: 16, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--glass-border)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>📋 Loading Bill of Materials...</span>
        </div>
    );

    if (!bom || !bom.bom) return null;

    const statusIcon = (s) => s === 'out' ? '🔴' : s === 'low' ? '🟡' : '🟢';
    const statusLabel = (s) => s === 'out' ? 'Out of Stock' : s === 'low' ? 'Low Stock' : 'In Stock';

    return (
        <div style={{ marginTop: 16, background: 'rgba(30,41,59,0.4)', borderRadius: 12, border: '1px solid rgba(99,102,241,0.15)', overflow: 'hidden' }}>
            {/* Header */}
            <div onClick={() => setCollapsed(!collapsed)} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', cursor: 'pointer', background: 'rgba(99,102,241,0.05)',
                borderBottom: collapsed ? 'none' : '1px solid rgba(99,102,241,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>📋</span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>Bill of Materials</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', background: 'rgba(99,102,241,0.15)', padding: '1px 8px', borderRadius: 10 }}>
                        {bom.totals.totalParts} parts
                    </span>
                    {bom.totals.outOfStock > 0 && (
                        <span style={{ fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,0.15)', padding: '1px 8px', borderRadius: 10 }}>
                            {bom.totals.outOfStock} out of stock
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>
                        ${bom.totals.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span style={{ color: '#64748b', fontSize: 12, transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                </div>
            </div>

            {/* Body */}
            {!collapsed && (
                <div style={{ padding: '12px 16px' }}>
                    {bom.bom.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 20, color: '#64748b', fontSize: 13 }}>
                            No parts in BOM. {isEditing && 'Click "Add Part" to build the materials list.'}
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    <th style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>Part ID</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>Description</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'center', color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>Qty</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'center', color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>Stock</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'right', color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>Unit Cost</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'right', color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>Line Cost</th>
                                    {isEditing && <th style={{ padding: '6px 8px', width: 40 }}></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {bom.bom.map((b, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '8px', color: '#60a5fa', fontWeight: 600, fontFamily: 'monospace' }}>{b.PartID}</td>
                                        <td style={{ padding: '8px', color: '#cbd5e1' }}>{b.partDesc || b.partFullDesc || '—'}</td>
                                        <td style={{ padding: '8px', textAlign: 'center', color: '#e2e8f0', fontWeight: 600 }}>{b.Quantity}</td>
                                        <td style={{ padding: '8px', textAlign: 'center' }}>
                                            <span title={statusLabel(b.stockStatus)}>
                                                {statusIcon(b.stockStatus)} {b.Stock ?? '—'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>${parseFloat(b.UnitCost || 0).toFixed(2)}</td>
                                        <td style={{ padding: '8px', textAlign: 'right', color: '#a78bfa', fontWeight: 600 }}>${b.lineCost.toFixed(2)}</td>
                                        {isEditing && (
                                            <td style={{ padding: '8px', textAlign: 'center' }}>
                                                <button onClick={() => handleRemove(b.PartID)} title={t('bom.removeFromBomTip')}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid rgba(99,102,241,0.2)' }}>
                                    <td colSpan={isEditing ? 5 : 5} style={{ padding: '8px', fontWeight: 700, color: '#e2e8f0', textAlign: 'right' }}>Total BOM Cost:</td>
                                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#6366f1', fontSize: 14 }}>
                                        ${bom.totals.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    {isEditing && <td></td>}
                                </tr>
                            </tfoot>
                        </table>
                    )}

                    {/* Add Part Form */}
                    {isEditing && !addingPart && (
                        <button onClick={() => setAddingPart(true)} className="btn-save" title={t('bom.addAPartToTheTip')} style={{
                            marginTop: 10, padding: '6px 14px', fontSize: 12
                        }}>+ Add Part to BOM</button>
                    )}

                    {isEditing && addingPart && (
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div>
                                <label style={{ fontSize: 10, color: '#64748b', display: 'block' }}>Part</label>
                                <select value={newPart.partId} onChange={e => setNewPart({ ...newPart, partId: e.target.value })}
                                    style={{ minWidth: 200, padding: '4px 8px', fontSize: 12 }}>
                                    <option value="">{t('bom.selectPart')}</option>
                                    {parts.map(p => (
                                        <option key={p.ID} value={p.ID}>{p.ID} — {p.Descript || p.Description}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: 10, color: '#64748b', display: 'block' }}>Qty</label>
                                <input type="number" value={newPart.quantity} min={1}
                                    onChange={e => setNewPart({ ...newPart, quantity: parseInt(e.target.value, 10) || 1 })}
                                    style={{ width: 60, padding: '4px 8px', fontSize: 12 }} />
                            </div>
                            <button onClick={handleAdd} className="btn-save" title="Add this part to the BOM" style={{ padding: '6px 12px', fontSize: 12 }}>Add</button>
                            <button onClick={() => setAddingPart(false)} className="btn-nav" title="Cancel adding a part" style={{ padding: '6px 12px', fontSize: 12 }}>{t('common.cancel', 'Cancel')}</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
