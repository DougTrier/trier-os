// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Plant Logistics & Procurement View
 * ================================================
 * Plant-level logistics dashboard covering inter-plant part transfers,
 * purchase order status, and inbound supply tracking. The plant-level
 * counterpart to the enterprise GlobalScanner and Logistics admin views.
 *
 * SECTIONS:
 *   Transfers Out    — Parts sent from this plant to other plants
 *                      Status flow: Pending → Shipped → Received / Rejected
 *   Transfers In     — Incoming parts from other plants awaiting receipt confirmation
 *   Purchase Orders  — Open POs with line items, expected delivery, and status
 *   Supply Chain     — Ingredient, packaging, and chemical inventory tracking
 *
 * API CALLS:
 *   GET /api/logistics/transfers?direction=out   Outbound transfers for this plant
 *   GET /api/logistics/transfers?direction=in    Inbound transfers for this plant
 *   PUT /api/logistics/transfers/:id/receive     Confirm receipt of an inbound transfer
 *   GET /api/purchase-orders                     Open POs for current plant
 *
 * PRINT: Transfer manifests and PO summaries via PrintEngine.
 * @param {string} plantId - Current plant identifier from parent context
 */
import React, { useState, useEffect } from 'react';
import { ArrowRightCircle, ArrowLeftCircle, CheckCircle, Truck, XCircle, Search, Printer } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import { formatDate } from '../utils/formatDate';

export default function LogisticsView({ plantId }) {
    const { t } = useTranslation();
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchPart, setSearchPart] = useState('');
    const [globalResults, setGlobalResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [notification, setNotification] = useState(null);

    const showNotify = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    // Transfer Request Form State
    const [requestTarget, setRequestTarget] = useState(null);
    const [requestQty, setRequestQty] = useState(1);
    const [requestNotes, setRequestNotes] = useState('');

    useEffect(() => {
        fetchTransfers();
    }, [plantId]);

    const fetchTransfers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/logistics/transfers', {
                headers: {
                    'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
                }
            });
            const data = await res.json();
            setTransfers(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load logistics ledger', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearchGlobal = async () => {
        const query = searchPart.trim();
        if (!query) return;
        setSearching(true);
        setHasSearched(true);
        try {
            const res = await fetch(`/api/logistics/search-all?partId=${encodeURIComponent(query)}`, {
                headers: {
                    'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
                }
            });
            const data = await res.json();
            setGlobalResults(Array.isArray(data.parts) ? data.parts : (Array.isArray(data) ? data : []));
            setRequestTarget(null); // Reset form
        } catch (err) {
            console.error('Failed global search', err);
            showNotify('Failed to search global network', 'error');
        } finally {
            setSearching(false);
        }
    };

    const handleRequestPart = async (e) => {
        e.preventDefault();
        if (!requestTarget) return;

        try {
            const userRole = localStorage.getItem('userRole'); // Simple user attribution
            const res = await fetch('/api/logistics/request', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
                },
                body: JSON.stringify({
                    fulfillingPlant: requestTarget.plant,
                    partId: requestTarget.partId,
                    quantity: requestQty,
                    notes: requestNotes,
                    requestBy: userRole || 'Technician'
                })
            });

            if (res.ok) {
                showNotify(`Successfully sent part request to ${requestTarget.plant}`);
                setSearchPart('');
                setGlobalResults([]);
                setRequestTarget(null);
                fetchTransfers();
            } else {
                const data = await res.json();
                showNotify(data.error || 'Failed to request part', 'error');
            }
        } catch (err) {
            console.error('Failed to submit transfer request:', err);
        }
    };

    const updateTransferStatus = async (id, status) => {
        try {
            const res = await fetch(`/api/logistics/status/${id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
                },
                body: JSON.stringify({ status })
            });

            if (res.ok) {
                showNotify(`Order marked as ${status.toLowerCase()}`);
                fetchTransfers();
            } else {
                const data = await res.json();
                showNotify(data.error || 'Failed to update transfer', 'error');
            }
        } catch (err) {
            console.error('Failed to update transfer:', err);
        }
    };

    const handlePrint = () => {
        window.triggerTrierPrint('catalog-internal', { type: 'logistics', 
            items: transfers 
        });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'PENDING': return '#f59e0b'; // Yellow
            case 'REJECTED': return '#ef4444'; // Red
            case 'SHIPPED':
            case 'RECEIVED': return '#10b981'; // Green
            default: return 'var(--primary)';
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'PENDING': return 'badge-yellow';
            case 'REJECTED': return 'badge-red';
            case 'SHIPPED':
            case 'RECEIVED': return 'badge-primary'; // Greenish
            default: return 'badge-primary';
        }
    };

    // Separate transfers
    const inbound = transfers.filter(xfer => xfer.RequestingPlant === plantId);
    const outbound = transfers.filter(xfer => xfer.FulfillingPlant === plantId);

    const plantLabel = localStorage.getItem('selectedPlantId')?.replace('_', ' ');
    const printMeta = (
        <div className="print-header print-only">
            <div>
                <img src="/assets/TrierLogoPrint.png" alt="Trier OS" className="brand-logo-print" />
            </div>
            <div className="print-meta-right">
                <div style={{ fontWeight: 700, color: '#1e1b4b', marginBottom: '2px' }}>{t('logistics.assetMaintenanceLogistics')}</div>
                <div><strong>{t('logisticsView.location')}</strong> {plantLabel}</div>
                <div><strong>{t('logistics.date')}</strong> {formatDate(new Date())}</div>
                <div><strong>{t('logistics.id')}</strong> {t('logistics.pvslog01')}</div>
            </div>
        </div>
    );

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', position: 'relative' }}>
            {notification && (
                <div style={{
                    position: 'fixed',
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 9999,
                    background: notification.type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(16, 185, 129, 0.95)',
                    backdropFilter: 'blur(10px)',
                    color: '#fff',
                    padding: '14px 28px',
                    borderRadius: '14px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    animation: 'pmNotifyDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                    border: '1px solid rgba(255,255,255,0.2)'
                }}>
                    {notification.type === 'error' ? <XCircle size={20} /> : <CheckCircle size={20} />}
                    <span style={{ fontWeight: 700, letterSpacing: '0.01em' }}>{notification.msg}</span>
                </div>
            )}
            <style>{`
                @keyframes pmNotifyDown {
                    from { transform: translate(-50%, -50px); opacity: 0; }
                    to { transform: translate(-50%, 0); opacity: 1; }
                }
            `}</style>
            {!requestTarget && printMeta}

            <div className={requestTarget ? 'no-print' : ''} style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>
            
            {/* Standard Print Header */}
            <div className="print-header print-only">
                <div>
                    <img src="/assets/TrierLogoPrint.png" alt="Trier OS" className="brand-logo-print" />
                </div>
                <div className="print-meta-right">
                    <div style={{ fontWeight: 700, color: '#1e1b4b', marginBottom: '2px' }}>{t('logistics.assetMaintenanceLogistics')}</div>
                    <div><strong>{t('logisticsView.location')}</strong> {plantLabel}</div>
                    <div><strong>{t('logistics.date')}</strong> {formatDate(new Date())}</div>
                    <div><strong>{t('logistics.id')}</strong> {t('logistics.pvslog01')}</div>
                </div>
            </div>

            {/* Global Search Interface */}
            <div className="glass-card" style={{ padding: '20px' }} title={t('logistics.supplyChainLink')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                        <Truck size={20} /> {t('logistics.globalInventorySearch')}
                    </h3>
                    <button className="btn-primary btn-sm no-print" onClick={handlePrint} title={t('logisticsView.printTheLogisticsTransferLedgerTip')}>
                        <Printer size={16} /> {t('logistics.printLedger')}
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }} className="no-print">
                    <input
                        type="text"
                        placeholder={t('logistics.enterExactPartId')}
                        value={searchPart}
                        onChange={e => setSearchPart(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearchGlobal()}
                        style={{ flex: 1, padding: '10px 15px' }}
                        title={t('logisticsView.enterTheExactPartIdTip')}
                    />
                    <button className="btn-primary" onClick={handleSearchGlobal} disabled={searching} title={t('logisticsView.searchForThisPartAcrossTip')}>
                        {searching ? 'Scanning Array...' : 'Search Network'}
                    </button>
                </div>

                {globalResults.length > 0 && (
                    <div style={{ border: '1px solid var(--glass-border)', borderRadius: '8px', overflow: 'hidden' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>{t('logistics.location')}</th>
                                    <th>{t('logistics.description')}</th>
                                    <th>{t('logistics.onHand')}</th>
                                    <th style={{ textAlign: 'center' }}>{t('logistics.enterpriseUse')}</th>
                                    <th style={{ textAlign: 'right' }} className="no-print">{t('logistics.action')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {globalResults.map((r, i) => (
                                    <tr key={i}>
                                        <td style={{ fontWeight: 'bold' }}>{r.plant} {r.plant === plantId && '(Current Local)'}</td>
                                        <td>{r.description}</td>
                                        <td>{r.onHand}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            {r.usageCount > 0 ? (
                                                <span style={{ 
                                                    background: r.usageCount > 10 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.1)',
                                                    color: r.usageCount > 10 ? '#10b981' : '#6366f1',
                                                    padding: '2px 8px',
                                                    borderRadius: '10px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600
                                                }}>
                                                    {r.usageCount} {r.usageCount === 1 ? 'Unit' : 'Units'}
                                                </span>
                                            ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>0</span>}
                                        </td>
                                        <td style={{ textAlign: 'right' }} className="no-print">
                                            <button                                                 className="btn-nav"
                                                onClick={() => setRequestTarget(r)}
                                                disabled={r.plant === plantId}
                                                style={{ opacity: r.plant === plantId ? 0.5 : 1 }}
                                                title={r.plant === plantId ? 'Cannot request from your own plant' : `Request parts from ${r.plant}`}
                                            >
                                                {t('logistics.requestParts')}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {hasSearched && !searching && globalResults.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--glass-border)' }}>
                        <Search size={32} color="var(--text-muted)" style={{ marginBottom: '15px', opacity: 0.5 }} />
                        <h4 style={{ margin: 0, color: 'var(--text-muted)' }}>No parts found across the network for "{searchPart}"</h4>
                        <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('logistics.verifyThePartNumber')}</p>
                    </div>
                )}

                {/* Request Form overlay */}
                {requestTarget && (
                    <div style={{ marginTop: '20px', padding: '20px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--primary)', borderRadius: '8px' }} className="no-print">
                        <h4 style={{ margin: '0 0 15px 0' }}>Request {requestTarget.partId} from {requestTarget.plant}</h4>
                        <form onSubmit={handleRequestPart} style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('logistics.quantity')}</label>
                                <input
                                    type="number"
                                    min="1"
                                    max={requestTarget.onHand}
                                    value={requestQty}
                                    onChange={e => setRequestQty(parseInt(e.target.value, 10))}
                                    style={{ width: '100%', padding: '8px' }}
                                    required
                                    title={t('logisticsView.howManyUnitsToRequestTip')}
                                />
                            </div>
                            <div style={{ flex: 3 }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('logistics.notesUrgency')}</label>
                                <input
                                    type="text"
                                    placeholder={t('logistics.egMachineDownPlease')}
                                    value={requestNotes}
                                    onChange={e => setRequestNotes(e.target.value)}
                                    style={{ width: '100%', padding: '8px' }}
                                    required
                                    title={t('logisticsView.describeTheUrgencyAndReasonTip')}
                                />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <label style={{ fontSize: '0.85rem', visibility: 'hidden' }}>{t('logistics.action')}</label>
                                <button type="submit" className="btn-save" title={t('logisticsView.sendTheTransferRequestToTip')}>{t('logistics.submitRequest')}</button>
                                <button type="button" className="btn-nav" title={t('logisticsView.cancelThisRequestTip')} onClick={() => setRequestTarget(null)}>{t('logistics.cancel')}</button>
                            </div>
                        </form>
                    </div>
                )}
            </div>

            {/* Matrix Splits */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

                {/* Outbound Transfers (You are fulfilling) */}
                <div className="glass-card" style={{ padding: '20px' }}>
                    <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ArrowRightCircle size={18} color="#f59e0b" /> {t('logistics.ordersToFulfill')}
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {outbound.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>{t('logistics.noPendingFulfillments')}</div>
                        ) : outbound.map(xfer => (
                            <div key={xfer.ID} className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${getStatusColor(xfer.Status)}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <strong style={{ color: 'var(--primary)' }}>{xfer.RequestingPlant}</strong>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(xfer.ReqDate)}</span>
                                </div>
                                <div style={{ fontSize: '0.9rem', marginBottom: '10px' }}>
                                    {t('logistics.requested')} <strong>{xfer.Quantity}x</strong> {t('logisticsView.of')} <strong>{xfer.PartID}</strong>
                                    {xfer.Notes && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '4px' }}>"{xfer.Notes}"</div>}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span className={`badge ${getStatusBadge(xfer.Status)}`}>
                                        {xfer.Status}
                                    </span>

                                    {xfer.Status === 'PENDING' && (
                                        <div style={{ display: 'flex', gap: '8px' }} className="no-print">
                                            <button className="btn-nav" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => updateTransferStatus(xfer.ID, 'REJECTED')} title={t('logisticsView.rejectThisTransferRequestTip')}>{t('logistics.reject')}</button>
                                            <button className="btn-primary btn-sm" onClick={() => updateTransferStatus(xfer.ID, 'SHIPPED')} title={t('logisticsView.markThisTransferAsShippedTip')}>{t('logistics.markShipped')}</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Inbound Transfers (You are requesting) */}
                <div className="glass-card" style={{ padding: '20px' }}>
                    <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ArrowLeftCircle size={18} color="#10b981" /> {t('logistics.inboundRequests')}
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {inbound.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>{t('logistics.noPendingRequests')}</div>
                        ) : inbound.map(xfer => (
                            <div key={xfer.ID} className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${getStatusColor(xfer.Status)}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <strong style={{ color: 'var(--primary)' }}>From: {xfer.FulfillingPlant}</strong>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(xfer.ReqDate)}</span>
                                </div>
                                <div style={{ fontSize: '0.9rem', marginBottom: '10px' }}>
                                    {t('logistics.waitingFor')} <strong>{xfer.Quantity}x</strong> {t('logisticsView.of')} <strong>{xfer.PartID}</strong>
                                    {xfer.TrackingNumber && <div style={{ color: '#3b82f6', marginTop: '4px' }}>Tracking: {xfer.TrackingNumber}</div>}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span className={`badge ${getStatusBadge(xfer.Status)}`}>
                                        {xfer.Status}
                                    </span>

                                    {xfer.Status === 'SHIPPED' && (
                                        <button className="btn-save btn-sm no-print" onClick={() => updateTransferStatus(xfer.ID, 'RECEIVED')} title={t('logisticsView.confirmReceiptOfThisShipmentTip')}>
                                            <CheckCircle size={14} /> {t('logistics.markReceived')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    </div>
);
}
