// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Warranty Dashboard
 * ================================
 * Enterprise warranty oversight covering active coverage, expiring-soon alerts,
 * cost avoidance tracking, and full warranty claims lifecycle management.
 *
 * CLAIMS LIFECYCLE:
 *   File → Submitted → Acknowledged → Approved / Denied → Reimbursed
 *
 * KEY FEATURES:
 *   - Plant Overview: active warranty count, expiry distribution, coverage value
 *   - Expiring Soon alerts: warranties expiring within 30/60/90 days (color-coded)
 *   - Cost Avoidance tracking: warranty-covered repairs that avoided out-of-pocket cost
 *   - File claim: start a new warranty claim for a failed covered component
 *   - Claims manager: track all claims through the full lifecycle with status badges
 *   - Recovery Report: total $ filed vs $ recovered per plant + enterprise rollup
 *   - Print evidence: formatted claim packet for vendor submission
 *
 * DATA SOURCES:
 *   GET /api/warranties/dashboard   — Full warranty dashboard dataset (plant-scoped)
 *   GET /api/warranties/claims      — Claims list with lifecycle status
 *   POST /api/warranties/claims     — File a new warranty claim
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Edit2, Save, X, Printer, Activity } from 'lucide-react';
import { formatDate } from '../utils/formatDate';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';
import { useTranslation } from '../i18n/index.jsx';

const STATUS_COLORS = {
    active: '#10b981',
    expiring: '#f59e0b',
    expired: '#ef4444',
    none: '#4b5563'
};

const CLAIM_STATUS_META = {
    'Submitted':    { color: '#6366f1', bg: 'rgba(99,102,241,0.12)',  icon: '📤' },
    'Acknowledged': { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '👁️' },
    'Approved':     { color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: '✅' },
    'Denied':       { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: '❌' },
    'Reimbursed':   { color: '#22c55e', bg: 'rgba(34,197,94,0.15)',  icon: '💰' },
};

const VALID_STATUSES = ['Submitted', 'Acknowledged', 'Approved', 'Denied', 'Reimbursed'];
const TODAY = new Date().toISOString().slice(0, 10);
const blankForm = {
    AssetID: '', AssetDescription: '', WorkOrderID: '', WorkOrderNumber: '',
    VendorName: '', ClaimDate: TODAY, ClaimAmount: '', ClaimReference: '', Notes: ''
};

export default function WarrantyDashboard({ plantId }) {
    const { t } = useTranslation();
    const [overview, setOverview]       = useState(null);
    const [avoidance, setAvoidance]     = useState(null);
    const [claims, setClaims]           = useState([]);
    const [claimReport, setClaimReport] = useState(null);
    const [loading, setLoading]         = useState(true);
    const [tab, setTab]                 = useState('overview');
    const [horizon, setHorizon]         = useState(90);

    // File Claim modal
    const [showClaimModal, setShowClaimModal]   = useState(false);
    const [claimForm, setClaimForm]             = useState({ ...blankForm });
    const [submittingClaim, setSubmittingClaim] = useState(false);
    const [claimError, setClaimError]           = useState('');

    // Status Update modal
    const [statusModal, setStatusModal]     = useState(null); // { claim, newStatus, amountRecovered, claimReference, notes }
    const [statusUpdating, setStatusUpdating] = useState(null);

    // Asset editing modal
    const [selectedAssetForModal, setSelectedAssetForModal] = useState(null);
    const [isModalEdit, setIsModalEdit] = useState(false);
    const [editedWarranty, setEditedWarranty] = useState({});

    const effectivePlant = plantId || localStorage.getItem('selectedPlantId') || 'all_sites';
    const authHeaders = () => ({
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'x-plant-id': effectivePlant
    });

    useEffect(() => {
        setLoading(true);
        const h = authHeaders();
        Promise.all([
            fetch(`/api/analytics/warranty-overview?days=${horizon}`, { headers: h }).then(r => r.json()),
            fetch('/api/analytics/warranty-cost-avoidance', { headers: h }).then(r => r.json()),
            fetch('/api/warranty/claims', { headers: h }).then(r => r.json()),
            fetch('/api/warranty/report', { headers: h }).then(r => r.json()),
        ]).then(([ov, av, cl, rpt]) => {
            setOverview(ov);
            setAvoidance(av);
            setClaims(cl.claims || []);
            setClaimReport(rpt);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [horizon, plantId]); // eslint-disable-line react-hooks/exhaustive-deps

    const openFileClaim = (d = {}) => {
        setClaimForm({
            AssetID:          d.assetId          || '',
            AssetDescription: d.assetDescription || '',
            WorkOrderID:      d.workOrderID      || '',
            WorkOrderNumber:  d.workOrderNumber  || '',
            VendorName:       d.vendor           || '',
            ClaimDate:        TODAY,
            ClaimAmount:      d.totalSaved ? String(Math.round(d.totalSaved)) : '',
            ClaimReference:   '',
            Notes:            ''
        });
        setClaimError('');
        setShowClaimModal(true);
    };

    const handleSubmitClaim = async () => {
        if (!claimForm.AssetDescription && !claimForm.WorkOrderNumber) {
            setClaimError('Asset description or Work Order # is required.');
            return;
        }
        setSubmittingClaim(true);
        setClaimError('');
        try {
            const res = await fetch('/api/warranty/claims', {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(claimForm)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to file claim');
            setClaims(prev => [data.claim, ...prev]);
            setShowClaimModal(false);
            setTab('claims');
            // refresh report totals
            fetch('/api/warranty/report', { headers: authHeaders() })
                .then(r => r.json()).then(rpt => setClaimReport(rpt));
        } catch (e) {
            setClaimError(e.message);
        } finally {
            setSubmittingClaim(false);
        }
    };

    const openStatusModal = (claim, newStatus) => {
        setStatusModal({
            claim,
            newStatus,
            amountRecovered: String(claim.AmountRecovered || ''),
            claimReference:  claim.ClaimReference || '',
            notes:           claim.Notes || ''
        });
    };

    const handleStatusUpdate = async () => {
        if (!statusModal) return;
        const { claim, newStatus, amountRecovered, claimReference, notes } = statusModal;
        setStatusUpdating(claim.ID);
        try {
            const body = { Status: newStatus };
            if (['Approved', 'Reimbursed'].includes(newStatus)) {
                body.AmountRecovered = parseFloat(amountRecovered) || 0;
            }
            if (claimReference) body.ClaimReference = claimReference;
            if (notes)          body.Notes = notes;

            const res = await fetch(`/api/warranty/claims/${claim.ID}/status`, {
                method: 'PATCH',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Update failed');
            setClaims(prev => prev.map(c => c.ID === claim.ID ? data.claim : c));
            setStatusModal(null);
            // refresh cross-plant report totals
            fetch('/api/warranty/report', { headers: authHeaders() })
                .then(r => r.json()).then(rpt => setClaimReport(rpt));
        } catch (e) {
            console.error('[WarrantyDashboard] status update failed:', e.message);
        } finally {
            setStatusUpdating(null);
        }
    };

    const handleSaveWarranty = async () => {
        if (!selectedAssetForModal) return;
        try {
            await fetch(`/api/warranty/asset/${selectedAssetForModal.ID}`, {
                method: 'PUT',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(editedWarranty)
            });
            setIsModalEdit(false);
            fetchData();
        } catch (e) {
            console.error('[WarrantyDashboard] edit failed:', e.message);
        }
    };

    if (loading) return <LoadingSpinner message="Scanning warranty data..." />;

    const tot    = overview?.totals   || {};
    const avTot  = avoidance?.totals  || {};
    const rptTot = claimReport?.totals || {};
    const openClaimsCount = claims.filter(c => !['Reimbursed', 'Denied'].includes(c.Status)).length;

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 24 }}>🛡️</span>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Warranty Intelligence</h3>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Enterprise warranty tracking, claims lifecycle &amp; cost avoidance</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => window.triggerTrierPrint('warranties', { overview, avoidance, claims })} className="btn-secondary btn-sm" title="Print Warranty Ledger">
                        <Printer size={16} style={{ marginRight: 5 }} /> Print Report
                    </button>
                    <div style={{ background: 'rgba(255,255,255,0.1)', width: 1, height: 24, margin: '0 8px' }} />
                    <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Horizon:</label>
                    <select value={horizon} onChange={e => setHorizon(parseInt(e.target.value, 10))} style={{
                        padding: '6px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 6, color: '#fff', fontSize: '0.8rem'
                    }}>
                        <option value={30}>30 days</option>
                        <option value={60}>60 days</option>
                        <option value={90}>90 days</option>
                        <option value={180}>6 months</option>
                        <option value={365}>1 year</option>
                    </select>
                </div>
            </div>

            {/* KPI Cards — 6 columns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 18 }}>
                {[
                    { label: 'Active Warranties',      value: tot.active || 0,                              icon: '✅', color: STATUS_COLORS.active },
                    { label: `Expiring (${horizon}d)`, value: tot.expiringSoon || 0,                        icon: '⏰', color: STATUS_COLORS.expiring },
                    { label: 'Expired',                value: tot.expired || 0,                             icon: '❌', color: STATUS_COLORS.expired },
                    { label: 'Warranty WOs',           value: avTot.totalWarrantyWOs || 0,                  icon: '📋', color: '#6366f1' },
                    { label: 'Claims Filed',           value: rptTot.totalClaims || 0,                      icon: '📤', color: '#f59e0b' },
                    { label: '$ Recovered',            value: `$${(rptTot.recovered || 0).toLocaleString()}`, icon: '💰', color: '#10b981' },
                ].map(kpi => (
                    <div key={kpi.label} style={{
                        background: `${kpi.color}08`, borderRadius: 12, padding: '16px 14px',
                        border: `1px solid ${kpi.color}25`, textAlign: 'center'
                    }}>
                        <div style={{ fontSize: 18, marginBottom: 6 }}>{kpi.icon}</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4, fontWeight: 600 }}>{kpi.label}</div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="nav-pills" style={{ marginBottom: 16 }}>
                <button className={`btn-nav${tab === 'overview'  ? ' active' : ''}`} onClick={() => setTab('overview')}  title="Tab">📊 Plant Overview</button>
                <button className={`btn-nav${tab === 'expiring'  ? ' active' : ''}`} onClick={() => setTab('expiring')}  title="Tab">
                    ⏰ Expiring Soon ({tot.expiringSoon || 0})
                </button>
                <button className={`btn-nav${tab === 'avoidance' ? ' active' : ''}`} onClick={() => setTab('avoidance')} title="Tab">
                    💰 Cost Avoidance ({avTot.totalWarrantyWOs || 0} WOs)
                </button>
                <button className={`btn-nav${tab === 'claims'    ? ' active' : ''}`} onClick={() => setTab('claims')}    title="Tab">
                    📤 Claims
                    {openClaimsCount > 0 && (
                        <span style={{
                            display: 'inline-block', background: '#f59e0b', color: '#000',
                            borderRadius: 10, fontSize: '0.65rem', fontWeight: 800,
                            padding: '1px 6px', marginLeft: 6
                        }}>{openClaimsCount}</span>
                    )}
                </button>
            </div>

            {/* ── OVERVIEW TAB ─────────────────────────────────────────── */}
            {tab === 'overview' && overview?.plants?.length > 0 && (
                <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <th style={thStyle}>Plant</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>Total Assets</th>
                                <th style={{ ...thStyle, textAlign: 'center', color: STATUS_COLORS.active }}>Active</th>
                                <th style={{ ...thStyle, textAlign: 'center', color: STATUS_COLORS.expiring }}>Expiring</th>
                                <th style={{ ...thStyle, textAlign: 'center', color: STATUS_COLORS.expired }}>Expired</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>No Warranty</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>Coverage %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {overview.plants.filter(p => p.total > 0).map(p => {
                                const covered = p.active + p.expiringSoon;
                                const pct = p.total > 0 ? Math.round((covered / p.total) * 100) : 0;
                                return (
                                    <tr key={p.plantId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={{ ...tdStyle, fontWeight: 600 }}>{p.plantLabel}</td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>{p.total}</td>
                                        <td style={{ ...tdStyle, textAlign: 'center', color: STATUS_COLORS.active, fontWeight: 700 }}>{p.active || '—'}</td>
                                        <td style={{ ...tdStyle, textAlign: 'center', color: STATUS_COLORS.expiring, fontWeight: 700 }}>
                                            {p.expiringSoon > 0 ? p.expiringSoon : '—'}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'center', color: STATUS_COLORS.expired }}>{p.expired || '—'}</td>
                                        <td style={{ ...tdStyle, textAlign: 'center', color: '#64748b' }}>{p.noWarranty}</td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                                                <div style={{ width: 60, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                                                    <div style={{
                                                        width: `${pct}%`, height: '100%', borderRadius: 3,
                                                        background: pct >= 70 ? STATUS_COLORS.active : pct >= 30 ? STATUS_COLORS.expiring : STATUS_COLORS.expired
                                                    }} />
                                                </div>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0' }}>{pct}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {tab === 'overview' && (!overview?.plants || overview.plants.filter(p => p.total > 0).length === 0) && (
                <EmptyState title="No warranty data found" message="Warranty data will appear once assets with warranty information are synced." style={{ padding: '30px' }} />
            )}

            {/* ── EXPIRING SOON TAB ────────────────────────────────────── */}
            {tab === 'expiring' && (
                <div>
                    {(!overview?.expiringSoon || overview.expiringSoon.length === 0) ? (
                        <div style={{ textAlign: 'center', padding: 40, color: '#10b981', fontSize: '1rem' }}>
                            ✅ No warranties expiring within the next {horizon} days
                        </div>
                    ) : (
                        <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
                            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(245,158,11,0.05)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <th style={thStyle}>Asset</th>
                                        <th style={thStyle}>Plant</th>
                                        <th style={thStyle}>Type</th>
                                        <th style={thStyle}>Vendor</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Expires</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Days Left</th>
                                        <th style={{ ...thStyle, textAlign: 'right' }}>Asset Value</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {overview.expiringSoon.map((a, i) => (
                                        <tr key={i} style={{
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                            background: (a.daysLeft === 'Expired' || a.daysLeft <= 7) ? 'rgba(239,68,68,0.04)' : a.daysLeft <= 30 ? 'rgba(245,158,11,0.03)' : 'transparent'
                                        }}>
                                            <td style={tdStyle}>
                                                <div style={{ fontWeight: 700, color: '#60a5fa' }}>{a.ID}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{a.Description}</div>
                                            </td>
                                            <td style={tdStyle}>{a.plantLabel}</td>
                                            <td style={{ ...tdStyle, fontSize: '0.8rem' }}>{a.AssetType || '—'}</td>
                                            <td style={{ ...tdStyle, color: '#818cf8', fontWeight: 600 }}>{a.WarrantyVendor || '—'}</td>
                                            <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.85rem' }}>{formatDate(a.WarrantyEnd)}</td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '3px 10px', borderRadius: 6, fontSize: '0.85rem', fontWeight: 800,
                                                    background: (a.daysLeft === 'Expired' || a.daysLeft <= 7) ? 'rgba(239,68,68,0.15)' : a.daysLeft <= 30 ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.1)',
                                                    color: (a.daysLeft === 'Expired' || a.daysLeft <= 7) ? '#ef4444' : a.daysLeft <= 30 ? '#f59e0b' : '#818cf8'
                                                }}>
                                                    {a.daysLeft === 'Expired' ? 'Expired' : `${a.daysLeft}d`}
                                                </span>
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'right', color: '#94a3b8' }}>
                                                {a.assetCost > 0 ? `$${a.assetCost.toLocaleString()}` : '—'}
                                            </td>
                                            <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setSelectedAssetForModal(a); setIsModalEdit(false); setEditedWarranty({ WarrantyVendor: a.WarrantyVendor, WarrantyStart: a.WarrantyStart, WarrantyEnd: a.WarrantyEnd }); }}
                                                    className="btn-primary btn-sm"
                                                    style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '15px' }}
                                                >
                                                    <Eye size={14} style={{ marginRight: 5 }} /> View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── COST AVOIDANCE TAB ───────────────────────────────────── */}
            {tab === 'avoidance' && (
                <div>
                    {/* Savings summary cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
                        <div style={{ background: 'rgba(16,185,129,0.06)', borderRadius: 12, padding: 18, border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Labor Avoided</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981' }}>${(avTot.laborSaved || 0).toLocaleString()}</div>
                        </div>
                        <div style={{ background: 'rgba(99,102,241,0.06)', borderRadius: 12, padding: 18, border: '1px solid rgba(99,102,241,0.2)', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Parts / Material Avoided</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#818cf8' }}>${(avTot.partsSaved || 0).toLocaleString()}</div>
                        </div>
                        <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(99,102,241,0.08))', borderRadius: 12, padding: 18, border: '1px solid rgba(16,185,129,0.3)', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Total Cost Avoidance</div>
                            <div style={{ fontSize: '2rem', fontWeight: 900, background: 'linear-gradient(135deg, #10b981, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                ${(avTot.totalSaved || 0).toLocaleString()}
                            </div>
                        </div>
                    </div>

                    {/* Per-plant savings chips */}
                    {avoidance?.plants?.length > 0 && (
                        <div style={{ marginBottom: 18 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', marginBottom: 10 }}>Savings by Plant</div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                {avoidance.plants.map(p => (
                                    <div key={p.plantId} style={{
                                        background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 16px',
                                        border: '1px solid rgba(255,255,255,0.06)', minWidth: 160
                                    }}>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{p.plantLabel}</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981', marginTop: 4 }}>${p.totalSaved.toLocaleString()}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>{p.warrantyWOs} WOs</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* WO detail table with File Claim action */}
                    {avoidance?.details?.length > 0 ? (
                        <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
                            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(16,185,129,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <th style={thStyle}>Plant</th>
                                        <th style={thStyle}>WO #</th>
                                        <th style={thStyle}>Asset</th>
                                        <th style={thStyle}>Vendor</th>
                                        <th style={{ ...thStyle, textAlign: 'right' }}>Labor Saved</th>
                                        <th style={{ ...thStyle, textAlign: 'right' }}>Parts Saved</th>
                                        <th style={{ ...thStyle, textAlign: 'right' }}>Total Saved</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Claim</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {avoidance.details.map((d, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <td style={tdStyle}>{d.plantLabel}</td>
                                            <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa' }}>{d.workOrderNumber}</td>
                                            <td style={tdStyle}>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{d.assetDescription || d.assetId}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{d.woDescription}</div>
                                            </td>
                                            <td style={{ ...tdStyle, color: '#818cf8', fontSize: '0.85rem' }}>{d.vendor || '—'}</td>
                                            <td style={{ ...tdStyle, textAlign: 'right', color: '#94a3b8' }}>
                                                {d.laborSaved > 0 ? `$${d.laborSaved.toLocaleString()}` : '—'}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'right', color: '#94a3b8' }}>
                                                {d.partsSaved > 0 ? `$${d.partsSaved.toLocaleString()}` : '—'}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
                                                ${d.totalSaved.toLocaleString()}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                <button onClick={() => openFileClaim(d)} style={{
                                                    background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                                                    color: '#818cf8', borderRadius: 6, padding: '4px 12px',
                                                    fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                                                }}>
                                                    📤 File Claim
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                            No warranty-covered work orders found. As warranties are used, cost avoidance data will appear here.
                        </div>
                    )}
                </div>
            )}

            {/* ── CLAIMS TAB ───────────────────────────────────────────── */}
            {tab === 'claims' && (
                <div>
                    {/* Recovery roll-up */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 18 }}>
                        {[
                            { label: 'Total Claims',   value: rptTot.totalClaims || 0,                        color: '#6366f1' },
                            { label: 'Amount Filed',   value: `$${(rptTot.filed || 0).toLocaleString()}`,      color: '#f59e0b' },
                            { label: '$ Recovered',    value: `$${(rptTot.recovered || 0).toLocaleString()}`,  color: '#10b981' },
                            { label: 'Denied',         value: rptTot.denied || 0,                              color: '#ef4444' },
                            { label: 'Recovery Rate',  value: `${rptTot.recoveryRate || 0}%`,
                              color: (rptTot.recoveryRate || 0) >= 70 ? '#10b981' : (rptTot.recoveryRate || 0) >= 40 ? '#f59e0b' : '#94a3b8' },
                        ].map(kpi => (
                            <div key={kpi.label} style={{
                                background: `${kpi.color}08`, borderRadius: 10, padding: '14px 12px',
                                border: `1px solid ${kpi.color}20`, textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4, fontWeight: 600 }}>{kpi.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* File claim button */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                        <button onClick={() => { setClaimForm({ ...blankForm }); setClaimError(''); setShowClaimModal(true); }} style={{
                            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                            color: '#818cf8', borderRadius: 8, padding: '8px 18px',
                            fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer'
                        }}>
                            📤 File New Claim
                        </button>
                    </div>

                    {/* Claims table */}
                    {claims.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                            No claims filed yet. Click "File New Claim" above or use "📤 File Claim" from the Cost Avoidance tab.
                        </div>
                    ) : (
                        <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
                            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <th style={thStyle}>Asset / WO</th>
                                        <th style={thStyle}>Vendor</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Claim Date</th>
                                        <th style={{ ...thStyle, textAlign: 'right' }}>Filed ($)</th>
                                        <th style={{ ...thStyle, textAlign: 'right' }}>Recovered ($)</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {claims.map(c => {
                                        const meta = CLAIM_STATUS_META[c.Status] || CLAIM_STATUS_META['Submitted'];
                                        const isFinal = ['Reimbursed', 'Denied'].includes(c.Status);
                                        return (
                                            <tr key={c.ID} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <td style={tdStyle}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.AssetDescription || `Claim #${c.ID}`}</div>
                                                    {c.WorkOrderNumber && (
                                                        <div style={{ fontSize: '0.7rem', color: '#60a5fa', fontFamily: 'monospace' }}>{c.WorkOrderNumber}</div>
                                                    )}
                                                    {c.Notes && (
                                                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>{c.Notes}</div>
                                                    )}
                                                </td>
                                                <td style={{ ...tdStyle, color: '#818cf8', fontSize: '0.85rem' }}>{c.VendorName || '—'}</td>
                                                <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.8rem' }}>{formatDate(c.ClaimDate)}</td>
                                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                                                    {c.ClaimAmount > 0 ? `$${Number(c.ClaimAmount).toLocaleString()}` : '—'}
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'right', color: '#10b981', fontWeight: 700 }}>
                                                    {c.AmountRecovered > 0 ? `$${Number(c.AmountRecovered).toLocaleString()}` : '—'}
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '4px 10px', borderRadius: 6, fontSize: '0.75rem',
                                                        fontWeight: 700, background: meta.bg, color: meta.color,
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {meta.icon} {c.Status}
                                                    </span>
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                    {isFinal ? (
                                                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Final</span>
                                                    ) : (
                                                        <select
                                                            defaultValue=""
                                                            disabled={statusUpdating === c.ID}
                                                            onChange={e => {
                                                                if (e.target.value) openStatusModal(c, e.target.value);
                                                                e.target.value = '';
                                                            }}
                                                            style={{
                                                                padding: '4px 8px', background: 'rgba(0,0,0,0.3)',
                                                                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                                                                color: '#e2e8f0', fontSize: '0.75rem', cursor: 'pointer'
                                                            }}
                                                        >
                                                            <option value="">Move to...</option>
                                                            {VALID_STATUSES.filter(s => s !== c.Status).map(s => (
                                                                <option key={s} value={s}>{s}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Cross-plant recovery breakdown */}
                    {claimReport?.plants?.length > 0 && (
                        <div style={{ marginTop: 20 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', marginBottom: 10 }}>Recovery by Plant</div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                {claimReport.plants.map(p => (
                                    <div key={p.plantId} style={{
                                        background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 16px',
                                        border: '1px solid rgba(255,255,255,0.06)', minWidth: 180
                                    }}>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{p.plantLabel}</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981', marginTop: 4 }}>
                                            ${p.recovered.toLocaleString()} recovered
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>
                                            {p.totalClaims} claims · {p.recoveryRate}% rate
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── FILE CLAIM MODAL ─────────────────────────────────────── */}
            {showClaimModal && createPortal((
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={e => e.target === e.currentTarget && setShowClaimModal(false)}
                >
                    <div style={{
                        background: '#1e293b', borderRadius: 16, padding: 28, width: 480, maxWidth: '95vw',
                        border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>📤 File Warranty Claim</h3>
                            <button onClick={() => setShowClaimModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={labelStyle}>Asset Description</label>
                                    <input value={claimForm.AssetDescription} onChange={e => setClaimForm(f => ({ ...f, AssetDescription: e.target.value }))} style={inputStyle} placeholder="Asset name" />
                                </div>
                                <div>
                                    <label style={labelStyle}>Work Order #</label>
                                    <input value={claimForm.WorkOrderNumber} onChange={e => setClaimForm(f => ({ ...f, WorkOrderNumber: e.target.value }))} style={inputStyle} placeholder="WO-XXXXX" />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={labelStyle}>Vendor / Manufacturer</label>
                                    <input value={claimForm.VendorName} onChange={e => setClaimForm(f => ({ ...f, VendorName: e.target.value }))} style={inputStyle} placeholder="Vendor name" />
                                </div>
                                <div>
                                    <label style={labelStyle}>Claim Date</label>
                                    <input type="date" value={claimForm.ClaimDate} onChange={e => setClaimForm(f => ({ ...f, ClaimDate: e.target.value }))} style={inputStyle} />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={labelStyle}>Claim Amount ($)</label>
                                    <input type="number" value={claimForm.ClaimAmount} onChange={e => setClaimForm(f => ({ ...f, ClaimAmount: e.target.value }))} style={inputStyle} placeholder="0.00" min="0" step="0.01" />
                                </div>
                                <div>
                                    <label style={labelStyle}>Claim Reference # (optional)</label>
                                    <input value={claimForm.ClaimReference} onChange={e => setClaimForm(f => ({ ...f, ClaimReference: e.target.value }))} style={inputStyle} placeholder="Vendor ref #" />
                                </div>
                            </div>
                            <div>
                                <label style={labelStyle}>Notes (optional)</label>
                                <textarea value={claimForm.Notes} onChange={e => setClaimForm(f => ({ ...f, Notes: e.target.value }))} style={{ ...inputStyle, height: 68, resize: 'vertical' }} placeholder="Describe the failure, repair, or claim details..." />
                            </div>
                        </div>

                        {claimError && <div style={{ marginTop: 10, color: '#ef4444', fontSize: '0.8rem' }}>{claimError}</div>}

                        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowClaimModal(false)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                Cancel
                            </button>
                            <button onClick={handleSubmitClaim} disabled={submittingClaim} style={{
                                background: submittingClaim ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.2)',
                                border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8',
                                borderRadius: 8, padding: '8px 22px',
                                cursor: submittingClaim ? 'not-allowed' : 'pointer',
                                fontSize: '0.85rem', fontWeight: 700
                            }}>
                                {submittingClaim ? 'Filing...' : '📤 Submit Claim'}
                            </button>
                        </div>
                    </div>
                </div>
            ), document.body)}

            {/* ── STATUS UPDATE MODAL ──────────────────────────────────── */}
            {statusModal && createPortal((
                <div
                    className="no-print"
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={e => e.target === e.currentTarget && setStatusModal(null)}
                >
                    <div style={{
                        background: '#1e293b', borderRadius: 16, padding: 28, width: 420, maxWidth: '95vw',
                        border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Update Claim Status</h3>
                            <button onClick={() => setStatusModal(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                        </div>

                        <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: '0.85rem' }}>
                            <span style={{ color: '#94a3b8' }}>Claim: </span>
                            <strong>{statusModal.claim.AssetDescription || statusModal.claim.WorkOrderNumber || `#${statusModal.claim.ID}`}</strong>
                            <br />
                            <span style={{ color: '#94a3b8' }}>New status: </span>
                            <strong style={{ color: (CLAIM_STATUS_META[statusModal.newStatus] || {}).color }}>
                                {(CLAIM_STATUS_META[statusModal.newStatus] || {}).icon} {statusModal.newStatus}
                            </strong>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {['Approved', 'Reimbursed'].includes(statusModal.newStatus) && (
                                <div>
                                    <label style={labelStyle}>Amount Recovered ($)</label>
                                    <input
                                        type="number"
                                        value={statusModal.amountRecovered}
                                        onChange={e => setStatusModal(s => ({ ...s, amountRecovered: e.target.value }))}
                                        style={inputStyle}
                                        placeholder="0.00"
                                        min="0"
                                        step="0.01"
                                    />
                                </div>
                            )}
                            <div>
                                <label style={labelStyle}>Claim Reference # (optional)</label>
                                <input
                                    value={statusModal.claimReference}
                                    onChange={e => setStatusModal(s => ({ ...s, claimReference: e.target.value }))}
                                    style={inputStyle}
                                    placeholder="Vendor claim ref #"
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Notes (optional)</label>
                                <textarea
                                    value={statusModal.notes}
                                    onChange={e => setStatusModal(s => ({ ...s, notes: e.target.value }))}
                                    style={{ ...inputStyle, height: 60, resize: 'vertical' }}
                                    placeholder="Any notes on this status change..."
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                            <button onClick={() => setStatusModal(null)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                Cancel
                            </button>
                            <button onClick={handleStatusUpdate} disabled={!!statusUpdating} style={{
                                background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)',
                                color: '#10b981', borderRadius: 8, padding: '8px 22px',
                                cursor: statusUpdating ? 'not-allowed' : 'pointer',
                                fontSize: '0.85rem', fontWeight: 700
                            }}>
                                {statusUpdating ? 'Saving...' : '✅ Update Status'}
                            </button>
                        </div>
                    </div>
                </div>
            ), document.body)}

            {/* ── ASSET WARRANTY MODAL ─────────────────────────────────── */}
            {selectedAssetForModal && createPortal((
                <div 
                    className="no-print"
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
                    onClick={() => { setSelectedAssetForModal(null); setIsModalEdit(false); setEditedWarranty({}); }}
                >
                    <div 
                        className="glass-card" 
                        onClick={e => e.stopPropagation()} 
                        style={{ width: '600px', maxWidth: '95vw', background: 'var(--panel-bg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                    >
                        {/* Modal Header */}
                        <div style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Activity size={20} /> Asset: {selectedAssetForModal.ID} — Warranty Spec
                            </h2>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => window.triggerTrierPrint('warranties-asset', [selectedAssetForModal])} className="btn-secondary btn-sm" title="Print Asset Warranty Info">
                                    <Printer size={16} /> Print
                                </button>
                                {isModalEdit ? (
                                    <button onClick={() => { setIsModalEdit(false); setEditedWarranty({}); }} className="btn-secondary btn-sm">
                                        <X size={16} /> Cancel
                                    </button>
                                ) : (
                                    <button onClick={() => setIsModalEdit(true)} className="btn-secondary btn-sm">
                                        <Edit2 size={16} /> Edit
                                    </button>
                                )}
                                <button onClick={() => { setSelectedAssetForModal(null); setIsModalEdit(false); setEditedWarranty({}); }} style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: '6px', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px' }} title="Close">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '20px', overflowY: 'auto' }}>
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Description</div>
                                <div style={{ fontSize: '1.1rem', color: '#fff', fontWeight: 600 }}>{selectedAssetForModal.Description || '—'}</div>
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                <div>
                                    <label style={labelStyle}>Vendor / Manufacturer</label>
                                    {isModalEdit ? (
                                        <input type="text" style={inputStyle} value={editedWarranty.WarrantyVendor || ''} onChange={e => setEditedWarranty({...editedWarranty, WarrantyVendor: e.target.value})} />
                                    ) : (
                                        <div style={{ color: '#fff', fontSize: '0.9rem', padding: '8px 0' }}>{selectedAssetForModal.WarrantyVendor || '—'}</div>
                                    )}
                                </div>
                                <div>
                                    <label style={labelStyle}>Asset Value</label>
                                    <div style={{ color: '#fff', fontSize: '0.9rem', padding: '8px 0' }}>{selectedAssetForModal.assetCost ? `$${selectedAssetForModal.assetCost.toLocaleString()}` : '—'}</div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Warranty Start</label>
                                    {isModalEdit ? (
                                        <input type="date" style={inputStyle} value={editedWarranty.WarrantyStart || ''} onChange={e => setEditedWarranty({...editedWarranty, WarrantyStart: e.target.value})} />
                                    ) : (
                                        <div style={{ color: '#fff', fontSize: '0.9rem', padding: '8px 0' }}>{formatDate(selectedAssetForModal.WarrantyStart) || '—'}</div>
                                    )}
                                </div>
                                <div>
                                    <label style={labelStyle}>Warranty End</label>
                                    {isModalEdit ? (
                                        <input type="date" style={inputStyle} value={editedWarranty.WarrantyEnd || ''} onChange={e => setEditedWarranty({...editedWarranty, WarrantyEnd: e.target.value})} />
                                    ) : (
                                        <div style={{ color: '#fff', fontSize: '0.9rem', padding: '8px 0' }}>{formatDate(selectedAssetForModal.WarrantyEnd) || '—'}</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div style={{ padding: '15px 20px', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: 'rgba(255,255,255,0.02)' }}>
                            <button onClick={() => { setSelectedAssetForModal(null); setIsModalEdit(false); setEditedWarranty({}); }} className="btn-secondary btn-sm">Close</button>
                            {isModalEdit ? (
                                <button onClick={handleSaveWarranty} className="btn-primary btn-sm" style={{ background: '#10b981', borderColor: '#10b981' }}>
                                    <Save size={16} /> Save Changes
                                </button>
                            ) : (
                                <button onClick={() => setIsModalEdit(true)} className="btn-primary btn-sm">
                                    <Edit2 size={16} /> Edit
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ), document.body)}
        </div>
    );
}

const thStyle = { padding: '10px 14px', textAlign: 'left', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' };
const tdStyle = { padding: '12px 14px', fontSize: '0.88rem', color: '#e2e8f0' };
const labelStyle = { fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 };
const inputStyle = { width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box' };
