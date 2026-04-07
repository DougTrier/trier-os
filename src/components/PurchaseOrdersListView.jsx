// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Purchase Orders List
 * =================================
 * Tabular view of all purchase orders with real-time status tracking.
 * The central PO management interface for buyers, maintenance managers,
 * and receiving teams.
 *
 * KEY FEATURES:
 *   - PO table: sortable by PO number, date, vendor, amount, status
 *   - Status filter: Open / Pending Approval / Approved / Partially Received / Received / Closed
 *   - Search: filter by PO number, vendor name, or line item description
 *   - Detail navigation: click any PO to open its full detail panel
 *   - Batch approval: select multiple POs and approve in one action
 *   - Quick receive: mark individual line items as received from the list
 *   - Print PO: formatted purchase order document for emailing to vendors
 *   - International flag: globe icon on POs from international vendors
 *   - New PO button: opens PO creation form
 *
 * API CALLS:
 *   GET    /api/supply-chain/purchase-orders        — PO list (plant-scoped)
 *   POST   /api/supply-chain/purchase-orders        — Create new PO
 *   PUT    /api/supply-chain/purchase-orders/:id    — Update PO (approve/receive)
 */
import React from 'react';
import { Truck, Printer, X, Eye, PenTool, Plus, Globe2 } from 'lucide-react';
import ActionBar from './ActionBar';
import { useTranslation } from '../i18n/index.jsx';
import { formatDate } from '../utils/formatDate';
import LoadingSpinner from './LoadingSpinner';

export default function PurchaseOrdersListView({ plantId, onPrint }) {
    const { t } = useTranslation();
    const [orders, setOrders] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [viewingPO, setViewingPO] = React.useState(null);
    const [isEditing, setIsEditing] = React.useState(false);
    const [isCreating, setIsCreating] = React.useState(false);
    const [editData, setEditData] = React.useState({});
    const [vendorDetails, setVendorDetails] = React.useState(null);
    const [isSavingDetails, setIsSavingDetails] = React.useState(false);
    const [promoteGlobal, setPromoteGlobal] = React.useState(true);

    const fetchOrders = React.useCallback(() => {
        setLoading(true);
        fetch('/api/purchase-orders', { headers: { 'x-plant-id': plantId } })
            .then(res => res.json())
            .then(data => { setOrders(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [plantId]);

    const fetchVendorDetails = React.useCallback(async (vendId) => {
        if (!vendId) {
            setVendorDetails(null);
            return;
        }

        // 1. Try local legacy system first (as migration source)
        try {
            const localRes = await fetch(`/api/contacts/${encodeURIComponent(vendId)}`, { headers: { 'x-plant-id': plantId } });
            if (localRes.ok && localRes.status === 200) {
                const data = await localRes.json();
                setVendorDetails(data);
                setEditData(prev => ({
                    ...prev,
                    VendorName: data.Description,
                    VendorAddr: data.Address,
                    VendorCity: data.City,
                    VendorState: data.State,
                    VendorZip: data.Zip,
                    VendorPhone: data.Phone,
                    VendorEmail: data.Email,
                    VendorWebsite: data.Website
                }));
                return;
            }
        } catch (e) { console.error("Local vendor lookup failed"); }

        // 2. Try Global Registry (the new system)
        try {
            const globalRes = await fetch(`/api/logistics/global-vendors/${encodeURIComponent(vendId)}`);
            if (globalRes.ok && globalRes.status === 200) {
                const data = await globalRes.json();
                setVendorDetails(data);
                setEditData(prev => ({
                    ...prev,
                    VendorName: data.Name,
                    VendorAddr: data.Address,
                    VendorCity: data.City,
                    VendorState: data.State,
                    VendorZip: data.Zip,
                    VendorPhone: data.Phone,
                    VendorEmail: data.Email,
                    VendorWebsite: data.Website
                }));
            }
        } catch (e) {
            console.error("Global vendor lookup failed");
            setVendorDetails(null);
        }
    }, [plantId]);

    React.useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    const handlePrintLocal = () => {
        window.triggerTrierPrint('catalog-internal', { type: 'vendors', 
            items: orders 
        });
    };

    const handleView = (po) => {
        setViewingPO(po);
        setEditData({...po});
        setIsEditing(false);
        setIsCreating(false);
        fetchVendorDetails(po.VendorID);
    };

    const handleNew = () => {
        const blank = { PartID: '', VendorID: '', PurchaseCost: 0, PurchaseDate: new Date().toISOString().split('T')[0] };
        setViewingPO(blank);
        setEditData(blank);
        setIsEditing(true);
        setIsCreating(true);
    };

    const handleSave = async () => {
        try {
            setIsSavingDetails(true);
            const url = isCreating ? '/api/purchase-orders' : `/api/purchase-orders/${encodeURIComponent(viewingPO.PartID)}/${encodeURIComponent(viewingPO.VendorID)}`;
            const method = isCreating ? 'POST' : 'PUT';

            // 1. Save Purchase Order Record
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify(editData)
            });

            if (res.ok) {
                // 2. Upsert Vendor Contact Details in Vendors
                const contactData = {
                    ID: editData.VendorID,
                    Description: editData.VendorName,
                    Address: editData.VendorAddr,
                    City: editData.VendorCity,
                    State: editData.VendorState,
                    Zip: editData.VendorZip,
                    Phone: editData.VendorPhone,
                    Email: editData.VendorEmail,
                    Website: editData.VendorWebsite,
                    Vendor: 1 // Mark as vendor
                };

                await fetch('/api/contacts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                    body: JSON.stringify(contactData)
                }).then(r => {
                    if (!r.ok) {
                        return fetch(`/api/contacts/${encodeURIComponent(editData.VendorID)}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                            body: JSON.stringify(contactData)
                        });
                    }
                });

                // 3. Update the Part table too for denormalized consistency (matching user preference)
                await fetch(`/api/parts/${encodeURIComponent(editData.PartID)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                    body: JSON.stringify({
                        VendorID: editData.VendorID,
                        VendorName: editData.VendorName,
                        VendorAddr: editData.VendorAddr,
                        VendorCity: editData.VendorCity,
                        VendorState: editData.VendorState,
                        VendorZip: editData.VendorZip,
                        VendorPhone: editData.VendorPhone,
                        VendorEmail: editData.VendorEmail,
                        VendorWebsite: editData.VendorWebsite
                    })
                });

                // 4. Sync to Global Registry (the new central system) - Conditional Promote
                if (promoteGlobal) {
                    await fetch('/api/logistics/global-vendors', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ID: editData.VendorID,
                            Name: editData.VendorName,
                            Address: editData.VendorAddr,
                            City: editData.VendorCity,
                            State: editData.VendorState,
                            Zip: editData.VendorZip,
                            Phone: editData.VendorPhone,
                            Email: editData.VendorEmail,
                            Website: editData.VendorWebsite
                        })
                    });
                }

                setIsEditing(false);
                setIsCreating(false);
                setViewingPO(null);
                fetchOrders();
            } else {
                window.trierToast?.error('Failed to save vendor record');
            }
        } catch (err) {
            console.error('Error saving vendor record:', err);
        } finally {
            setIsSavingDetails(false);
        }
    };

    const handleDelete = async () => {
        if (!await confirm("Are you sure you want to delete this purchase record?")) return;
        try {
            const res = await fetch(`/api/purchase-orders/${encodeURIComponent(viewingPO.PartID)}/${encodeURIComponent(viewingPO.VendorID)}`, {
                method: 'DELETE',
                headers: { 'x-plant-id': plantId }
            });
            if (res.ok) {
                setViewingPO(null);
                fetchOrders();
            } else {
                window.trierToast?.error('Failed to delete record');
            }
        } catch (err) {
            console.error('Error deleting record:', err);
        }
    };

    if (loading) return <LoadingSpinner />;


    return (
        <>
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', overflow: 'hidden' }}>
            {/* Removed legacy printMeta */}

            <div className={viewingPO ? 'no-print' : ''} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }} className="no-print">
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Truck size={24} color="var(--primary)" /> {t('purchase.orders.list.vendorPurchaseCatalogPartvend')}
                    </h2>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="btn-primary" onClick={handlePrintLocal} title={t('purchaseOrdersListView.printTheFullVendorPurchaseTip')} style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Printer size={16} /> {t('purchase.orders.list.printFullList')}
                        </button>
                        <button className="btn-save" onClick={handleNew} title={t('purchaseOrdersListView.registerANewVendorpartPurchaseTip')} style={{ border: 'none', height: '36px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={16} /> {t('purchase.orders.list.addVendor')}
                        </button>
                    </div>
                </div>

                <div className="print-only">
                    <h1>{t('purchase.orders.list.vendorPurchaseCatalog')}</h1>
                    <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '-5px', marginBottom: '15px' }}>{t('purchase.orders.list.officialProcurementHistoryRegister')}</p>
                </div>

                <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{t('purchaseOrdersListView.partId')}</th>
                                <th>{t('purchase.orders.list.description')}</th>
                                <th>{t('purchase.orders.list.vendor')}</th>
                                <th>{t('purchase.orders.list.lastPurchase')}</th>
                                <th>{t('purchaseOrdersListView.unitCost')}</th>
                                <th>Freight</th>
                                <th>Shipping</th>
                                <th className="no-print" style={{ textAlign: 'right' }}>{t('purchase.orders.list.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.length > 0 ? (
                                orders.map((o, idx) => (
                                    <tr key={`${o.PartID}-${idx}`}>
                                        <td style={{ fontWeight: 600 }}>{o.PartID}</td>
                                        <td style={{ fontSize: '0.85rem' }}>{o.PartDesc || 'N/A'}</td>
                                        <td>{o.VendorID || 'N/A'}</td>
                                        <td>{formatDate(o.PurchaseDate) || 'N/A'}</td>
                                        <td style={{ color: '#059669', fontWeight: 'bold' }}>
                                            ${parseFloat(o.PurchaseCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ color: o.FreightCost > 0 ? (o.IsExpedited ? '#ef4444' : '#059669') : 'inherit', fontWeight: o.FreightCost > 0 ? 'bold' : 'normal' }}>
                                            ${parseFloat(o.FreightCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td>
                                            {o.IsExpedited ? <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>EXPEDITED</span> : <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Standard</span>}
                                        </td>
                                        <td className="no-print" style={{ textAlign: 'right' }}>
                                            <button 
                                                className="btn-view-standard" 
                                                onClick={() => handleView(o)}
                                                title={`View purchase details for ${o.PartID}`}
                                            >
                                                <Eye size={18} /> {t('purchase.orders.list.view')}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        {t('purchase.orders.list.noPurchaseHistoryFound')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>

        {viewingPO && (
            <div className="modal-overlay" onClick={() => { setViewingPO(null); setIsEditing(false); }}>
                <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()}>
                    {/* Removed legacy printMeta */}

                    <ActionBar
                        title={isCreating ? 'Adding New Vendor Link' : (isEditing ? `Editing Record: ${viewingPO.PartID}` : `Purchase Detail: ${viewingPO.PartID}`)}
                        icon={<PenTool size={20} />}
                        isEditing={isEditing}
                        isCreating={isCreating}
                        onEdit={() => setIsEditing(true)}
                        onSave={handleSave}
                        onPrint={() => window.triggerTrierPrint('po', viewingPO)}
                        onClose={() => { setViewingPO(null); setIsEditing(false); }}
                        onCancel={() => { setIsEditing(false); if(isCreating) setViewingPO(null); }}
                        onDelete={handleDelete}
                        isSaving={isSavingDetails}
                    />

                    <div className="scroll-area" style={{ flex: 1, padding: '30px', overflowY: 'auto', minHeight: 0 }}>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '30px' }}>
                            <div className="panel-box">
                                <h3>{t('purchase.orders.list.procurementSummary')}</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '10pt' }}>
                                    <div>
                                        <strong>{t('purchase.orders.list.unitCost')}</strong> 
                                        {isEditing ? (
                                            <input type="number" step="0.01" value={editData.PurchaseCost || 0} onChange={e => setEditData({...editData, PurchaseCost: e.target.value})} style={{ width: '100%', marginTop: '5px' }} title={t('purchaseOrdersListView.lastKnownPurchaseCostPerTip')} />
                                        ) : (
                                            <span style={{ color: '#059669', fontWeight: 'bold' }}> ${parseFloat(viewingPO.PurchaseCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        )}
                                    </div>
                                    <div>
                                        <strong>{t('purchase.orders.list.purchaseDate')}</strong>
                                        {isEditing ? (
                                            <input type="date" value={editData.PurchaseDate ? editData.PurchaseDate.split('T')[0] : ''} onChange={e => setEditData({...editData, PurchaseDate: e.target.value})} style={{ width: '100%', marginTop: '5px' }} title="Date of the last purchase" />
                                        ) : (
                                            formatDate(viewingPO.PurchaseDate) || 'N/A'
                                        )}
                                    </div>
                                    <div>
                                        <strong>{t('purchase.orders.list.vendorId')}</strong> 
                                        {isEditing ? (
                                            <input type="text" value={editData.VendorID || ''} onChange={e => setEditData({...editData, VendorID: e.target.value.toUpperCase()})} style={{ width: '100%', marginTop: '5px' }} placeholder={t('purchase.orders.list.egGrainger')} title={t('purchaseOrdersListView.uniqueVendorIdentificationCodeTip')} />
                                        ) : viewingPO.VendorID}
                                    </div>
                                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--glass-border)' }}>
                                        <strong>Freight Cost</strong>
                                        {isEditing ? (
                                            <input type="number" step="0.01" value={editData.FreightCost || 0} onChange={e => setEditData({...editData, FreightCost: e.target.value})} style={{ width: '100%', marginTop: '5px' }} title="Shipping and Logistics Cost" />
                                        ) : (
                                            <span style={{ color: '#059669', fontWeight: 'bold' }}> ${parseFloat(viewingPO.FreightCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        )}
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: editData.IsExpedited || viewingPO?.IsExpedited ? 'rgba(239, 68, 68, 0.1)' : 'transparent', padding: '5px', borderRadius: '4px' }}>
                                            <strong style={{ color: editData.IsExpedited || viewingPO?.IsExpedited ? 'var(--danger)' : 'inherit' }}>Expedited Shipping</strong>
                                            {isEditing ? (
                                                <input type="checkbox" checked={!!editData.IsExpedited} onChange={e => setEditData({...editData, IsExpedited: e.target.checked ? 1 : 0})} style={{ cursor: 'pointer', transform: 'scale(1.2)' }} />
                                            ) : (
                                                <span style={{ fontWeight: 'bold', color: viewingPO.IsExpedited ? 'var(--danger)' : 'var(--text-muted)' }}>{viewingPO.IsExpedited ? 'YES (Penalty)' : 'No'}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="panel-box">
                                <h3>{t('purchase.orders.list.partIdentification')}</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '10pt' }}>
                                    <div>
                                        <strong>{t('purchase.orders.list.partId')}</strong> 
                                        {isCreating ? (
                                            <input type="text" value={editData.PartID || ''} onChange={e => setEditData({...editData, PartID: e.target.value.toUpperCase()})} style={{ width: '100%', marginTop: '5px' }} placeholder={t('purchase.orders.list.eg100valve')} title={t('purchaseOrdersListView.partIdentificationNumberTip')} />
                                        ) : viewingPO.PartID}
                                    </div>
                                    <div><strong>{t('purchase.orders.list.nomenclature')}</strong> {viewingPO.PartDesc || 'N/A'}</div>
                                </div>
                            </div>
                        </div>

                        {/* NEW: Promote to Global Toggle */}
                        {isEditing && (
                            <div style={{ marginTop: '20px', padding: '15px 25px', background: promoteGlobal ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.05)', borderRadius: '12px', border: promoteGlobal ? '1px solid var(--primary)' : '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.3s' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <Globe2 size={24} color={promoteGlobal ? 'var(--primary)' : 'var(--text-muted)'} />
                                    <div>
                                        <div style={{ fontWeight: 'bold', color: promoteGlobal ? 'var(--primary)' : '#fff' }}>{t('purchase.orders.list.promoteToEnterpriseRegistry')}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('purchase.orders.list.thisWillMakeThis')}</div>
                                    </div>
                                </div>
                                <div 
                                    onClick={() => setPromoteGlobal(!promoteGlobal)}
                                    style={{ 
                                        width: '50px', 
                                        height: '26px', 
                                        borderRadius: '13px', 
                                        background: promoteGlobal ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                                        position: 'relative',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s'
                                    }}
                                    title={promoteGlobal ? 'Disable: vendor will only be saved locally' : 'Enable: promote vendor to the global enterprise registry'}
                                >
                                    <div style={{ 
                                        position: 'absolute', 
                                        top: '3px', 
                                        left: promoteGlobal ? '27px' : '3px', 
                                        width: '20px', 
                                        height: '20px', 
                                        borderRadius: '50%', 
                                        background: '#fff',
                                        transition: 'all 0.3s',
                                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                                    }} />
                                </div>
                            </div>
                        )}

                        {/* NEW: Vendor Contact Information Section */}
                        <div style={{ marginTop: isEditing ? '20px' : '30px', padding: '25px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                            <h3 style={{ marginBottom: '20px', fontSize: '1.1rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('purchase.orders.list.vendorContactDetails')}</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div className="panel-box">
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('purchase.orders.list.companyName')}</label>
                                    {isEditing ? (
                                        <input type="text" value={editData.VendorName || ''} onChange={e => setEditData({...editData, VendorName: e.target.value})} style={{ width: '100%' }} title={t('purchaseOrdersListView.fullVendorCompanyNameTip')} />
                                    ) : (
                                        <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{editData.VendorName || '--'}</div>
                                    )}
                                </div>
                                <div className="panel-box">
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('purchase.orders.list.websiteUrl')}</label>
                                    {isEditing ? (
                                        <input type="text" value={editData.VendorWebsite || ''} onChange={e => setEditData({...editData, VendorWebsite: e.target.value})} style={{ width: '100%' }} title={t('purchaseOrdersListView.vendorWebsiteUrlTip')} />
                                    ) : (
                                        editData.VendorWebsite ? <a href={editData.VendorWebsite} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>{editData.VendorWebsite}</a> : '--'
                                    )}
                                </div>
                                <div className="panel-box" style={{ gridColumn: 'span 2' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('purchase.orders.list.streetAddress')}</label>
                                    {isEditing ? (
                                        <input type="text" value={editData.VendorAddr || ''} onChange={e => setEditData({...editData, VendorAddr: e.target.value})} style={{ width: '100%' }} title={t('purchaseOrdersListView.vendorStreetAddressTip')} />
                                    ) : (
                                        <div>{editData.VendorAddr || '--'}</div>
                                    )}
                                </div>
                                <div className="panel-box">
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('purchase.orders.list.cityStateZip')}</label>
                                    {isEditing ? (
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <input type="text" value={editData.VendorCity || ''} onChange={e => setEditData({...editData, VendorCity: e.target.value})} style={{ flex: 2 }} placeholder={t('purchase.orders.list.city')} title={t('purchaseOrdersListView.vendorCityTip')} />
                                            <input type="text" value={editData.VendorState || ''} onChange={e => setEditData({...editData, VendorState: e.target.value})} style={{ flex: 1 }} placeholder={t('purchaseOrdersListView.stPlaceholder')} title={t('purchaseOrdersListView.vendorStateAbbreviationTip')} />
                                            <input type="text" value={editData.VendorZip || ''} onChange={e => setEditData({...editData, VendorZip: e.target.value})} style={{ flex: 1 }} placeholder={t('purchaseOrdersListView.zipPlaceholder')} title={t('purchaseOrdersListView.vendorZipCodeTip')} />
                                        </div>
                                    ) : (
                                        <div>{editData.VendorCity ? `${editData.VendorCity}, ${editData.VendorState} ${editData.VendorZip}` : '--'}</div>
                                    )}
                                </div>
                                <div className="panel-box">
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('purchase.orders.list.phoneEmail')}</label>
                                    {isEditing ? (
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <input type="text" value={editData.VendorPhone || ''} onChange={e => setEditData({...editData, VendorPhone: e.target.value})} style={{ flex: 1 }} placeholder={t('purchase.orders.list.phone')} title={t('purchaseOrdersListView.vendorPhoneNumberTip')} />
                                            <input type="email" value={editData.VendorEmail || ''} onChange={e => setEditData({...editData, VendorEmail: e.target.value})} style={{ flex: 1 }} placeholder={t('purchase.orders.list.email')} title={t('purchaseOrdersListView.vendorEmailAddressTip')} />
                                        </div>
                                    ) : (
                                        <div>{editData.VendorPhone || '--'} | {editData.VendorEmail || '--'}</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div style={{ marginTop: '20px', padding: '25px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--glass-border)' }} className="no-print">
                            <h3 style={{ marginBottom: '10px', fontSize: '1rem' }}>{t('purchase.orders.list.logisticsMetadataComments')}</h3>
                            {isEditing ? (
                                <textarea 
                                    value={editData.Comment || ''} 
                                    onChange={e => setEditData({...editData, Comment: e.target.value})} 
                                    placeholder={t('purchase.orders.list.enterProcurementNotesLead')}
                                    style={{ width: '100%', height: '100px', background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid var(--glass-border)', borderRadius: '4px', padding: '10px', fontSize: '0.9rem' }}
                                    title={t('purchaseOrdersListView.enterProcurementNotesLeadTimesTip')}
                                />
                            ) : (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                    {viewingPO.Comment || `This record identifies the last known procurement cost for Part ${viewingPO.PartID} from Vendor ${viewingPO.VendorID}. This data is utilized by the inventory reorder logic to estimate replenishment valuations.`}
                                </p>
                            )}
                        </div>

                        {isEditing && (
                            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '30px', paddingBottom: '20px' }} className="no-print">
                                <button className="btn-save" style={{ width: '200px', height: '45px', fontSize: '1.1rem', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }} onClick={handleSave} title={t('purchaseOrdersListView.saveAllChangesToThisTip')}>
                                    SAVE RECORD
                                </button>
                            </div>
                        )}

                    </div>

                    <div className="modal-footer">
                        {isEditing ? (
                            <>
                                <button className="btn-nav" onClick={() => { setIsEditing(false); if(isCreating) setViewingPO(null); }} title={t('purchaseOrdersListView.cancelEditingAndDiscardChangesTip')}>{t('purchase.orders.list.cancel')}</button>
                                <button className="btn-save" onClick={handleSave} title={t('purchaseOrdersListView.saveAllChangesToThisTip')}>{t('purchase.orders.list.saveRecord')}</button>
                            </>
                        ) : (
                            <>
                                <button className="btn-nav" onClick={() => setViewingPO(null)} title={t('purchaseOrdersListView.closePurchaseOrderDetailsTip')}>{t('purchase.orders.list.close')}</button>
                                <button className="btn-primary" onClick={() => setIsEditing(true)} title={t('purchaseOrdersListView.editThisVendorPurchaseRecordTip')}>{t('purchase.orders.list.editRecord')}</button>
                                <button className="btn-danger" onClick={handleDelete} title={t('purchaseOrdersListView.permanentlyDeleteThisPurchaseRecordTip')}>{t('purchase.orders.list.delete')}</button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
