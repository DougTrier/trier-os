// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Production Supply Chain & Ingredient Inventory View
 * ================================================================
 * Tracks NON-MAINTENANCE incoming materials: dairy ingredients, packaging,
 * CIP chemicals, and consumables. Separate from the MRO storeroom module
 * to maintain clear separation between production inputs and maintenance parts.
 * Connects to /api/supply-chain endpoints (server/routes/supply-chain.js).
 *
 * TABS:
 *   Inventory         — Current stock levels, low-stock alerts, value by category
 *                       Categories: Dairy Ingredients, Packaging, Chemicals, Consumables
 *   Purchase Orders   — Create, view, and receive supply POs
 *                       Status flow: Draft → Submitted → Ordered → Partially Received → Received
 *   Receiving Log     — Inbound transaction history with lot numbers and QA sign-off
 *   Suppliers         — Vendor management: contacts, lead times, preferred status
 *
 * LOW-STOCK ALERTS: Items below their minimum quantity threshold appear with
 *   amber badges and surface on the Dashboard notifications feed.
 *
 * SEPARATION OF CONCERNS: Supply chain items do NOT appear in the MRO storeroom.
 *   Maintenance parts (storeroom) and production ingredients (supply chain) are
 *   managed in separate tables and displayed in separate views.
 *
 * @param {string} plantId - Current plant identifier
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    ShoppingCart, Package, Truck, Building2, PlusCircle,
    RefreshCw, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
    Search, Flame, DollarSign, Layers, ClipboardList,
    Eye, Edit2, Printer, Save, X
} from 'lucide-react';
import { TakeTourButton } from './ContextualTour.jsx';
import { useTranslation } from '../i18n/index.jsx';

// ── TrierPrint — hidden iframe approach (mirrors printRecord.js exactly) ─────
async function printTab(title, headersArr, rowsArr, opts = {}) {
    // 1. Fetch branding
    let logoUrl = '/assets/TrierLogoPrint.png';
    let companyName = 'Trier OS';
    try {
        const res = await fetch('/api/branding');
        const b = await res.json();
        if (b.documentLogo) logoUrl = b.documentLogo;
        else if (b.dashboardLogo) logoUrl = b.dashboardLogo;
        if (b.companyName) companyName = b.companyName;
    } catch {}
    // iframes share the same origin — logo path can stay relative
    const absLogoUrl = logoUrl.startsWith('http') ? logoUrl : `${window.location.origin}${logoUrl}`;

    // 2. Build HTML
    const now      = new Date();
    const dateStr  = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr  = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const plant    = opts.plant || localStorage.getItem('selectedPlantId') || '';
    const subtitle = opts.subtitle || 'Supply Chain & Ingredient Inventory';
    const docId    = opts.docId   || `SC-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const sigs     = opts.signatures || ['Reviewed By', 'Plant Manager', 'Date'];

    const isFieldValue = headersArr.length === 2 && headersArr[0] === 'Field';

    const dataHTML = isFieldValue
        ? `<div class="section-header">Item Record Details</div>
           <table><tbody>${rowsArr.map(([k,v]) =>
               `<tr><td class="lbl">${k}</td><td>${v ?? '—'}</td></tr>`
           ).join('')}</tbody></table>`
        : `<div class="section-header">${title}</div>
           <table>
             <thead><tr>${headersArr.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
             <tbody>${rowsArr.map((r,i)=>`<tr class="${i%2===0?'even':''}">${r.map(c=>`<td>${c??'—'}</td>`).join('')}</tr>`).join('')}</tbody>
           </table>`;

    const sigHTML = `<div class="section-header">Verification &amp; Authorization</div>
        <div class="sig-grid">${sigs.map(l=>`<div class="sig-box"><div class="sig-line"></div><div class="sig-label">${l}</div></div>`).join('')}</div>`;

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>${title} — ${companyName}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',Helvetica,Arial,sans-serif;font-size:10pt;line-height:1.5;color:#1e293b;padding:.4in}
  .print-header{border-bottom:3px solid #1e1b4b;padding-bottom:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end}
  .print-brand h1{font-family:'Outfit',sans-serif;font-size:18pt;font-weight:900;color:#1e1b4b;margin:0}
  .print-brand p{font-size:8pt;color:#64748b;margin:2px 0 0}
  .print-meta{text-align:right;font-size:8pt;color:#475569}
  .print-meta .plant{font-weight:700;font-size:9pt;color:#1e1b4b}
  .doc-title{font-family:'Outfit',sans-serif;font-size:14pt;font-weight:800;color:#1e1b4b;margin:0 0 4px;text-transform:uppercase;letter-spacing:.03em}
  .doc-subtitle{font-size:9pt;color:#64748b;margin:0 0 18px}
  .section-header{background:#f1f5f9;border-left:4px solid #1e1b4b;padding:6px 12px;margin:18px 0 8px;font-family:'Outfit',sans-serif;font-size:10pt;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#1e1b4b}
  table{width:100%;border-collapse:collapse;margin:0 0 15px;font-size:9pt}
  th{background:#f1f5f9;border:1px solid #94a3b8;padding:6px 8px;text-align:left;font-weight:700;text-transform:uppercase;font-size:7.5pt;letter-spacing:.04em;color:#1e293b}
  td{border:1px solid #e2e8f0;padding:5px 8px;vertical-align:top}
  td.lbl{font-weight:700;color:#1e1b4b;width:220px;background:#f8fafc;font-size:8.5pt;text-transform:uppercase;letter-spacing:.03em}
  tr.even td{background:#f8fbff}
  .sig-grid{display:flex;gap:32px;margin-top:8px;padding-top:12px}
  .sig-box{flex:1}.sig-line{border-bottom:2px solid #1e1b4b;height:40px;margin-bottom:6px}
  .sig-label{font-size:7.5pt;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:.4px}
  .footer{margin-top:30px;padding-top:12px;border-top:1px solid #cbd5e1;display:flex;justify-content:space-between;font-size:7pt;color:#94a3b8}
  @media print{body{padding:0}@page{margin:.4in}
    .section-header{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="print-header">
  <div class="print-brand">
    <img src="${absLogoUrl}" alt="${companyName}" style="height:60px;width:auto;margin-bottom:6px" onerror="this.style.display='none'"/>
    <h1>${companyName}</h1>
    <p>Enterprise Operations Platform</p>
  </div>
  <div class="print-meta">
    <div class="plant">${plant.replace(/_/g,' ')}</div>
    <div>${dateStr} · ${timeStr}</div>
    <div>${docId}</div>
  </div>
</div>
<h2 class="doc-title">${title}</h2>
<p class="doc-subtitle">${subtitle}</p>
${dataHTML}
${sigHTML}
<div class="footer">
  <span>${companyName} · © ${now.getFullYear()} · Confidential</span>
  <span>Printed ${dateStr} ${timeStr}</span>
</div>
</body></html>`;

    // 3. Write to hidden iframe and auto-print (no popup window — dialog appears over main app)
    const frameId = 'trier-sc-print-frame';
    let frame = document.getElementById(frameId);
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    frame.id = frameId;
    frame.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:1000px;height:800px;border:none;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(() => frame.remove(), 2000);
    }, 800);
}

// ── Shared View/Edit Modal ──────────────────────────────────────────────────

function DetailModal({ title, onClose, children }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div className="glass-card" style={{ padding: 28, width: '100%', maxWidth: 680, maxHeight: '85vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#f1f5f9', flex: 1 }}>{title}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}><X size={18} /></button>
                </div>
                {children}
            </div>
        </div>
    );
}

// ── Product Photo Upload Section ──────────────────────────────────────────────
function PhotoUploadSection({ itemId, plantId, currentPhoto, onUploaded }) {
    const { t } = useTranslation();
    const [preview, setPreview] = useState(currentPhoto || null);
    const [uploading, setUploading] = useState(false);
    const fileRef = React.useRef();

    const handleFile = async (file) => {
        if (!file) return;
        // Local preview immediately
        const reader = new FileReader();
        reader.onload = e => setPreview(e.target.result);
        reader.readAsDataURL(file);
        // Upload
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('photo', file);
            const headers = { 'x-plant-id': plantId };
            const r = await fetch(`/api/supply-chain/items/${itemId}/photo`, { method: 'POST', headers, body: fd });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            onUploaded?.(d.photoUrl);
            window.trierToast?.success(t('supplyChain.photoSaved', 'Photo saved'));
        } catch (e) { window.trierToast?.error(e.message); }
        setUploading(false);
    };

    return (
        <div style={{ marginTop: 14, marginBottom: 8 }}>
            <label style={labelStyle}>{t('supplyChain.productPhoto', 'Product Photo')}</label>
            {preview ? (
                <div style={{ position: 'relative', display: 'inline-block', marginBottom: 10 }}>
                    <img src={preview} alt={t('supplyChain.productPhotoAlt', 'Product')}
                        style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 10, objectFit: 'contain',
                            border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', display: 'block' }}
                        onError={e => e.target.style.display = 'none'} />
                    <button onClick={() => { setPreview(null); onUploaded?.(''); }}
                        style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(239,68,68,0.85)', border: 'none',
                            borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', color: '#fff', fontSize: 12,
                            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
            ) : (
                <div style={{ width: '100%', height: 100, border: '2px dashed rgba(255,255,255,0.12)', borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569',
                    fontSize: '0.78rem', marginBottom: 10, background: 'rgba(255,255,255,0.02)' }}>
                    {t('supplyChain.noPhotoPrompt', 'No photo — add one below')}
                </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* Camera capture (works great on mobile/tablet) */}
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                    background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)',
                    borderRadius: 8, cursor: 'pointer', fontSize: '0.75rem', color: '#3b82f6', fontWeight: 600 }}>
                    📷 {t('supplyChain.takePhoto', 'Take Photo')}
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                        onChange={e => handleFile(e.target.files?.[0])} />
                </label>
                {/* File browse */}
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, cursor: 'pointer', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                    🖼 {t('supplyChain.browseFile', 'Browse File')}
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                        ref={fileRef} onChange={e => handleFile(e.target.files?.[0])} />
                </label>
                {uploading && <span style={{ fontSize: '0.72rem', color: '#64748b', alignSelf: 'center' }}>
                    <RefreshCw size={12} className="spinning" style={{ marginRight: 4 }} />{t('supplyChain.uploading', 'Uploading…')}
                </span>}
            </div>
        </div>
    );
}

// ── Edit Item Modal ───────────────────────────────────────────────────────────
function EditItemModal({ item, plantId, vendors, onClose, onSaved }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({ ...item });
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const save = async () => {
        setSaving(true);
        try {
            const r = await API(`/items/${item.ID}`, plantId, { method: 'PUT', body: JSON.stringify(form) });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            window.trierToast?.success(t('supplyChain.itemSaved', 'Item saved'));
            onSaved?.();
        } catch (e) { window.trierToast?.error(e.message); }
        setSaving(false);
    };
    const doPrint = () => printTab(
        `${item.Description} — Item Record`,
        ['Field', 'Value'],
        [
            ['Description', form.Description], ['Category', form.Category], ['Sub-Category', form.SubCategory],
            ['Supplier', item.VendorName], ['Item Code', item.ItemCode], ['Vendor Part No', form.VendorPartNo], ['UOM', form.UOM],
            ['Unit Cost', form.UnitCost ? `$${Number(form.UnitCost).toFixed(2)}` : '—'],
            ['On Hand', `${form.OnHand} ${form.UOM}`], ['Reorder Point', `${form.ReorderPt} ${form.UOM}`],
            ['Min Stock', `${form.MinStock} ${form.UOM}`], ['Max Stock', `${form.MaxStock} ${form.UOM}`],
            ['Storage Area', form.StorageArea], ['HazMat', form.HazMat ? 'Yes' : 'No'], ['Notes', form.Notes],
        ].filter(([,v]) => v)
    );
    return (
        <DetailModal title={`${t('supplyChain.editLabel', 'Edit')} — ${item.Description}`} onClose={onClose}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ ...fieldStyle, gridColumn: 'span 2' }}><label style={labelStyle}>{t('supplyChain.fieldDescription', 'Description')}</label><input value={form.Description || ''} onChange={e => set('Description', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldCategory', 'Category')}</label>
                    <select value={form.Category || ''} onChange={e => set('Category', e.target.value)} style={inputStyle}>
                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldSubCategory', 'Sub-Category')}</label><input value={form.SubCategory || ''} onChange={e => set('SubCategory', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldSupplier', 'Supplier')}</label>
                    <select value={form.VendorID || ''} onChange={e => set('VendorID', e.target.value)} style={inputStyle}>
                        <option value="">{t('supplyChain.noneOption', '— None —')}</option>
                        {vendors.map(v => <option key={v.ID} value={v.ID}>{v.VendorName}</option>)}
                    </select></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldUOM', 'UOM')}</label><input value={form.UOM || ''} onChange={e => set('UOM', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldUnitCostDollar', 'Unit Cost ($)')}</label><input type="number" step="0.01" value={form.UnitCost || ''} onChange={e => set('UnitCost', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldOnHand', 'On Hand')}</label><input type="number" value={form.OnHand || ''} onChange={e => set('OnHand', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldReorderPoint', 'Reorder Point')}</label><input type="number" value={form.ReorderPt || ''} onChange={e => set('ReorderPt', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldMinStock', 'Min Stock')}</label><input type="number" value={form.MinStock || ''} onChange={e => set('MinStock', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldMaxStock', 'Max Stock')}</label><input type="number" value={form.MaxStock || ''} onChange={e => set('MaxStock', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldStorageArea', 'Storage Area')}</label><input value={form.StorageArea || ''} onChange={e => set('StorageArea', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldHazMat', 'HazMat')}</label>
                    <select value={form.HazMat ?? 0} onChange={e => set('HazMat', Number(e.target.value))} style={inputStyle}>
                        <option value={0}>{t('supplyChain.hazMatNo', 'No')}</option><option value={1}>{t('supplyChain.hazMatYes', 'Yes — HazMat')}</option>
                    </select></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldVendorPartNo', 'Vendor Part No')}</label><input value={form.VendorPartNo || ''} onChange={e => set('VendorPartNo', e.target.value)} style={inputStyle} placeholder="Vendor's part number" /></div>
                <div style={{ ...fieldStyle, gridColumn: 'span 2' }}><label style={labelStyle}>{t('supplyChain.fieldNotes', 'Notes')}</label><input value={form.Notes || ''} onChange={e => set('Notes', e.target.value)} style={inputStyle} /></div>
            </div>

            {/* Photo upload */}
            <PhotoUploadSection itemId={item.ID} plantId={plantId} currentPhoto={form.PhotoURL} onUploaded={url => set('PhotoURL', url)} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button onClick={doPrint} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Printer size={13} /> {t('supplyChain.printButton', 'Print')}
                </button>
                <button onClick={onClose} className="btn-nav">{t('supplyChain.cancelButton', 'Cancel')}</button>
                <button onClick={save} disabled={saving} className="btn-save" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {saving ? <RefreshCw size={13} className="spinning" /> : <Save size={13} />} {t('supplyChain.saveChanges', 'Save Changes')}
                </button>
            </div>
        </DetailModal>
    );
}

// ── View Item Modal (read-only detail) ───────────────────────────────────────
function ViewItemModal({ item, onClose }) {
    const { t } = useTranslation();
    const catColor = CAT_COLOR[item.Category] || '#94a3b8';
    const rows = [
        [t('supplyChain.fieldDescription', 'Description'), item.Description],
        [t('supplyChain.fieldCategory', 'Category'), item.Category],
        [t('supplyChain.fieldSubCategory', 'Sub-Category'), item.SubCategory],
        [t('supplyChain.fieldSupplier', 'Supplier'), item.VendorName],
        [t('supplyChain.fieldItemCode', 'Item Code'), item.ItemCode],
        [t('supplyChain.fieldVendorPartNo', 'Vendor Part No'), item.VendorPartNo],
        [t('supplyChain.fieldUOM', 'UOM'), item.UOM],
        [t('supplyChain.fieldPackSize', 'Pack Size'), item.PackSize],
        [t('supplyChain.fieldUnitCost', 'Unit Cost'), item.UnitCost ? `$${Number(item.UnitCost).toFixed(2)}` : '—'],
        [t('supplyChain.fieldOnHand', 'On Hand'), `${fmtQ(item.OnHand, item.UOM)}`],
        [t('supplyChain.fieldReorderPoint', 'Reorder Point'), `${fmtQ(item.ReorderPt, item.UOM)}`],
        [t('supplyChain.fieldMinStock', 'Min Stock'), `${fmtQ(item.MinStock, item.UOM)}`],
        [t('supplyChain.fieldMaxStock', 'Max Stock'), `${fmtQ(item.MaxStock, item.UOM)}`],
        [t('supplyChain.fieldStockValue', 'Stock Value'), fmt(item.StockValue)],
        [t('supplyChain.fieldStorageArea', 'Storage Area'), item.StorageArea],
        [t('supplyChain.fieldHazMat', 'HazMat'), item.HazMat ? '⚠ Yes' : 'No'],
        [t('supplyChain.fieldStatus', 'Status'), item.NeedsReorder ? '🔴 REORDER NOW' : '✅ OK'],
        [t('supplyChain.fieldNotes', 'Notes'), item.Notes],
    ];
    const doPrint = () => printTab(
        item.Description,
        ['Field', 'Value'],
        rows.filter(([,v]) => v).map(([k, v]) => [k, v])
    );
    return (
        <DetailModal title={item.Description} onClose={onClose}>
            {/* Photo display */}
            {item.PhotoURL && (
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                    <img src={item.PhotoURL} alt={item.Description}
                        style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 12, objectFit: 'contain', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)' }}
                        onError={e => e.target.style.display='none'} />
                </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                {rows.map(([k, v]) => v ? (
                    <div key={k} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.62rem', color: '#475569', textTransform: 'uppercase', fontWeight: 700 }}>{k}</span>
                        <span style={{ fontSize: '0.82rem', color: k === t('supplyChain.fieldCategory', 'Category') ? catColor : '#f1f5f9', fontWeight: k === t('supplyChain.fieldStockValue', 'Stock Value') ? 700 : 400 }}>{v}</span>
                    </div>
                ) : null)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button onClick={doPrint} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Printer size={13} /> {t('supplyChain.printButton', 'Print')}
                </button>
                <button onClick={onClose} className="btn-nav">{t('supplyChain.closeButton', 'Close')}</button>
            </div>
        </DetailModal>
    );
}

// ── View PO Modal ─────────────────────────────────────────────────────────────
function ViewPOModal({ po, onClose }) {
    const { t } = useTranslation();
    const statusColor = { Open: '#f59e0b', Partial: '#3b82f6', Received: '#10b981', Cancelled: '#ef4444' };
    return (
        <DetailModal title={`${t('supplyChain.purchaseOrderLabel', 'Purchase Order')} — ${po.PONumber}`} onClose={onClose}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {[
                    [t('supplyChain.fieldVendor', 'Vendor'), po.VendorName],
                    [t('supplyChain.fieldStatus', 'Status'), po.Status],
                    [t('supplyChain.fieldOrderDate', 'Order Date'), po.OrderDate],
                    [t('supplyChain.fieldExpected', 'Expected'), po.ExpectedDate],
                    [t('supplyChain.fieldReceived', 'Received'), po.ReceivedDate],
                    [t('supplyChain.fieldOrderedBy', 'Ordered By'), po.OrderedBy],
                    [t('supplyChain.fieldNotes', 'Notes'), po.Notes],
                ].map(([k, v]) => v ? (
                    <div key={k}><div style={labelStyle}>{k}</div><div style={{ color: k === t('supplyChain.fieldStatus', 'Status') ? statusColor[v] : '#f1f5f9', fontWeight: k === t('supplyChain.fieldStatus', 'Status') ? 700 : 400, fontSize: '0.85rem' }}>{v}</div></div>
                ) : null)}
                <div><div style={labelStyle}>{t('supplyChain.poTotal', 'PO Total')}</div><div style={{ color: '#10b981', fontWeight: 800, fontSize: '1rem' }}>{fmt(po.TotalValue)}</div></div>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#475569', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>{t('supplyChain.lineItemsCount', 'Line Items')} ({(po.lines || []).length})</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead><tr>{[
                    t('supplyChain.colItem', 'Item'),
                    t('supplyChain.fieldVendorPartNo', 'Vendor Part No'),
                    t('supplyChain.colQtyOrdered', 'Qty Ordered'),
                    t('supplyChain.colQtyReceived', 'Qty Received'),
                    t('supplyChain.colUOM', 'UOM'),
                    t('supplyChain.colUnitCost', 'Unit Cost'),
                    t('supplyChain.colTotal', 'Total'),
                ].map(h => <th key={h} style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#64748b', fontSize: '0.68rem' }}>{h}</th>)}</tr></thead>
                <tbody>{(po.lines || []).map((l, i) => (
                    <tr key={i}>
                        <td style={{ padding: '5px 8px', color: '#f1f5f9' }}>{l.ItemDesc || l.Description}</td>
                        <td style={{ padding: '5px 8px', color: l.VendorPartNo ? '#94a3b8' : '#334155' }}>{l.VendorPartNo || '—'}</td>
                        <td style={{ padding: '5px 8px' }}>{l.Qty}</td>
                        <td style={{ padding: '5px 8px', color: l.QtyRcvd >= l.Qty ? '#10b981' : '#f59e0b' }}>{l.QtyRcvd}</td>
                        <td style={{ padding: '5px 8px', color: '#64748b' }}>{l.UOM}</td>
                        <td style={{ padding: '5px 8px' }}>${Number(l.UnitCost).toFixed(2)}</td>
                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>{fmt(l.LineTotal)}</td>
                    </tr>
                ))}</tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={() => printTab(`PO ${po.PONumber} — ${po.VendorName}`, ['Item', 'Vendor Part No', 'Qty Ordered', 'Qty Received', 'UOM', 'Unit Cost', 'Total'],
                    (po.lines || []).map(l => [l.ItemDesc, l.VendorPartNo || '—', l.Qty, l.QtyRcvd, l.UOM, `$${Number(l.UnitCost).toFixed(2)}`, `$${Number(l.LineTotal).toFixed(2)}`])
                )} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Printer size={13} /> {t('supplyChain.printPO', 'Print PO')}
                </button>
            </div>
        </DetailModal>
    );
}

// ── Edit PO Modal ─────────────────────────────────────────────────────────────
function EditPOModal({ po, plantId, vendors, onClose, onSaved }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({
        VendorID:     po.VendorID     || '',
        OrderDate:    po.OrderDate    || '',
        ExpectedDate: po.ExpectedDate || '',
        Status:       po.Status       || 'Open',
        OrderedBy:    po.OrderedBy    || '',
        Notes:        po.Notes        || '',
        Tax:          po.Tax          || '',
        Shipping:     po.Shipping     || '',
        Discount:     po.Discount     || '',
    });
    const [lines, setLines] = useState((po.lines || []).map(l => ({ ...l })));
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setLine = (i, k, v) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
    const lineTotal = lines.reduce((s, l) => s + ((parseFloat(l.Qty) || 0) * (parseFloat(l.UnitCost) || 0)), 0);
    const total = (lineTotal + (parseFloat(form.Tax) || 0) + (parseFloat(form.Shipping) || 0)) - (parseFloat(form.Discount) || 0);

    const save = async () => {
        setSaving(true);
        try {
            const r = await API(`/po/${po.ID}`, plantId, {
                method: 'PUT',
                body: JSON.stringify({ ...form, lines }),
            });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            window.trierToast?.success(t('supplyChain.poUpdated', 'PO updated'));
            onSaved?.();
        } catch (e) { window.trierToast?.error(e.message); }
        setSaving(false);
    };

    const doPrint = () => printTab(
        `PO ${po.PONumber} — ${po.VendorName}`,
        ['Item', 'Qty Ordered', 'Qty Received', 'UOM', 'Unit Cost', 'Total'],
        lines.map(l => [l.ItemDesc || l.Description, l.Qty, l.QtyRcvd ?? 0, l.UOM, `$${Number(l.UnitCost).toFixed(2)}`, `$${(l.Qty * l.UnitCost).toFixed(2)}`])
    );

    return (
        <DetailModal title={`${t('supplyChain.editPOLabel', 'Edit PO')} — ${po.PONumber}`} onClose={onClose}>
            {/* Header fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldSupplier', 'Supplier')}</label>
                    <select value={form.VendorID} onChange={e => set('VendorID', e.target.value)} style={inputStyle}>
                        <option value="">{t('supplyChain.selectOption', '— Select —')}</option>
                        {vendors.map(v => <option key={v.ID} value={v.ID}>{v.VendorName}</option>)}
                    </select></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldStatus', 'Status')}</label>
                    <select value={form.Status} onChange={e => set('Status', e.target.value)} style={inputStyle}>
                        {['Open','Partial','Received','Cancelled'].map(s => <option key={s}>{s}</option>)}
                    </select></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldOrderDate', 'Order Date')}</label>
                    <input type="date" value={form.OrderDate} onChange={e => set('OrderDate', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldExpectedDelivery', 'Expected Delivery')}</label>
                    <input type="date" value={form.ExpectedDate} onChange={e => set('ExpectedDate', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldOrderedBy', 'Ordered By')}</label>
                    <input value={form.OrderedBy} onChange={e => set('OrderedBy', e.target.value)} style={inputStyle} /></div>
                <div style={{ ...fieldStyle, gridColumn: 'span 2' }}><label style={labelStyle}>{t('supplyChain.fieldNotes', 'Notes')}</label>
                    <input value={form.Notes} onChange={e => set('Notes', e.target.value)} style={inputStyle} /></div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldTax', 'Tax ($)')}</label><input type="number" step="0.01" value={form.Tax} onChange={e => set('Tax', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldShipping', 'Shipping ($)')}</label><input type="number" step="0.01" value={form.Shipping} onChange={e => set('Shipping', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldDiscount', 'Discount ($)')}</label><input type="number" step="0.01" value={form.Discount} onChange={e => set('Discount', e.target.value)} style={inputStyle} /></div>
            </div>

            {/* Line Items */}
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{t('supplyChain.lineItems', 'Line Items')}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginBottom: 12 }}>
                <thead><tr>{[
                    t('supplyChain.colItem', 'Item'),
                    t('supplyChain.colQty', 'Qty'),
                    t('supplyChain.colUOM', 'UOM'),
                    t('supplyChain.colUnitCostDollar', 'Unit Cost ($)'),
                    t('supplyChain.colLineTotal', 'Line Total'),
                ].map(h =>
                    <th key={h} style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#64748b', fontSize: '0.65rem', textTransform: 'uppercase' }}>{h}</th>
                )}</tr></thead>
                <tbody>{lines.map((l, i) => (
                    <tr key={i}>
                        <td style={{ padding: '4px 8px', color: '#f1f5f9' }}>{l.ItemDesc || l.Description || '—'}</td>
                        <td style={{ padding: '4px 4px' }}><input type="number" value={l.Qty} onChange={e => setLine(i, 'Qty', e.target.value)} style={{ ...inputStyle, width: 70, padding: '4px 8px' }} /></td>
                        <td style={{ padding: '4px 4px' }}><input value={l.UOM} onChange={e => setLine(i, 'UOM', e.target.value)} style={{ ...inputStyle, width: 60, padding: '4px 8px' }} /></td>
                        <td style={{ padding: '4px 4px' }}><input type="number" step="0.01" value={l.UnitCost} onChange={e => setLine(i, 'UnitCost', e.target.value)} style={{ ...inputStyle, width: 90, padding: '4px 8px' }} /></td>
                        <td style={{ padding: '4px 8px', fontWeight: 700, color: '#10b981' }}>{fmt((parseFloat(l.Qty)||0)*(parseFloat(l.UnitCost)||0))}</td>
                    </tr>
                ))}</tbody>
            </table>
            <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1rem', marginBottom: 16 }}>{t('supplyChain.poTotal', 'PO Total')}: {fmt(total)}</div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={doPrint} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Printer size={13} /> {t('supplyChain.printButton', 'Print')}</button>
                <button onClick={onClose} className="btn-nav">{t('supplyChain.cancelButton', 'Cancel')}</button>
                <button onClick={save} disabled={saving} className="btn-save" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {saving ? <RefreshCw size={13} className="spinning" /> : <Save size={13} />} {t('supplyChain.saveChanges', 'Save Changes')}
                </button>
            </div>
        </DetailModal>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const authHeaders = (plantId) => ({
    'Content-Type': 'application/json',
    'x-plant-id': plantId || localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
});
const API = (path, plantId, opts = {}) => fetch(`/api/supply-chain${path}`, { headers: authHeaders(plantId), ...opts });
const fmt  = n => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtN = n => n == null ? '—' : Number(n).toLocaleString();
const fmtQ = (n, uom) => n == null ? '—' : `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${uom || ''}`.trim();

const inputStyle = {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, padding: '8px 12px', color: '#f1f5f9', fontSize: '0.82rem', width: '100%',
};
const labelStyle = { fontSize: '0.68rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' };
const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };

const CATEGORIES = ['Dairy Ingredients', 'Packaging', 'Chemicals', 'Consumables'];
const TX_TYPES   = ['Usage', 'Receipt', 'Adjustment In', 'Adjustment Out', 'Waste', 'Transfer'];
const CAT_COLOR  = {
    'Dairy Ingredients': '#10b981',
    'Packaging':         '#3b82f6',
    'Chemicals':         '#ef4444',
    'Consumables':       '#f59e0b',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Summary KPI Bar
// ═══════════════════════════════════════════════════════════════════════════════
function SummaryBar({ summary, loading }) {
    const { t } = useTranslation();
    if (loading) return <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}><RefreshCw size={16} className="spinning" /></div>;
    if (!summary) return null;
    const kpis = [
        { label: t('supplyChain.kpiTotalInventoryValue', 'Total Inventory Value'), val: fmt(summary.totalValue), color: '#10b981', icon: DollarSign },
        { label: t('supplyChain.kpiSKUsTracked', 'SKUs Tracked'), val: fmtN(summary.totalItems), color: '#3b82f6', icon: Package },
        { label: t('supplyChain.kpiLowReorderAlert', 'Low / Reorder Alert'), val: summary.lowStock, color: summary.lowStock > 0 ? '#ef4444' : '#10b981', icon: AlertTriangle },
        { label: t('supplyChain.kpiOpenPOs', 'Open POs'), val: summary.openPOs, color: '#f59e0b', icon: ClipboardList },
        { label: t('supplyChain.kpiOpenPOValue', 'Open PO Value'), val: fmt(summary.openPOValue), color: '#f59e0b', icon: DollarSign },
        { label: t('supplyChain.kpiActiveSuppliers', 'Active Suppliers'), val: fmtN(summary.vendorCount), color: '#8b5cf6', icon: Building2 },
        { label: t('supplyChain.kpiHazMatItems', 'HazMat Items'), val: summary.hazMatCount, color: summary.hazMatCount > 0 ? '#f59e0b' : '#475569', icon: Flame },
    ];
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 10, marginBottom: 12 }}>
            {kpis.map(({ label, val, color, icon: Icon }) => (
                <div key={label} style={{ background: `${color}08`, border: `1px solid ${color}20`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color }}>{val}</div>
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 1 — Inventory
// ═══════════════════════════════════════════════════════════════════════════════
function AddItemForm({ plantId, vendors, onSaved }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({ Description: '', Category: 'Dairy Ingredients', SubCategory: '', VendorID: '', UOM: 'lbs', PackSize: '', UnitCost: '', OnHand: '', MinStock: '', MaxStock: '', ReorderPt: '', StorageArea: '', HazMat: 0, Notes: '' });
    const [saving, setSaving]  = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const submit = async () => {
        if (!form.Description) return window.trierToast?.error(t('supplyChain.errorDescriptionRequired', 'Description required'));
        setSaving(true);
        try {
            const r = await API('/items', plantId, { method: 'POST', body: JSON.stringify(form) });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            window.trierToast?.success(t('supplyChain.itemAddedToInventory', 'Item added to inventory'));
            onSaved?.();
        } catch (e) { window.trierToast?.error(e.message); }
        setSaving(false);
    };
    return (
        <div className="glass-card" style={{ padding: 20, marginBottom: 12 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}><PlusCircle size={16} color="#10b981" /> {t('supplyChain.addSupplyItem', 'Add Supply Item')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 10 }}>
                <div style={{ ...fieldStyle, gridColumn: 'span 2' }}><label style={labelStyle}>{t('supplyChain.fieldDescriptionRequired', 'Description *')}</label><input value={form.Description} onChange={e => set('Description', e.target.value)} style={inputStyle} placeholder={t('supplyChain.placeholderDescription', 'e.g. Granulated Cane Sugar')} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldCategoryRequired', 'Category *')}</label>
                    <select value={form.Category} onChange={e => set('Category', e.target.value)} style={inputStyle}>
                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldSubCategory', 'Sub-Category')}</label><input value={form.SubCategory} onChange={e => set('SubCategory', e.target.value)} style={inputStyle} placeholder={t('supplyChain.placeholderSubCategory', 'Sweeteners, Cultures...')} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldSupplier', 'Supplier')}</label>
                    <select value={form.VendorID} onChange={e => set('VendorID', e.target.value)} style={inputStyle}>
                        <option value="">{t('supplyChain.selectOption', '— Select —')}</option>
                        {vendors.map(v => <option key={v.ID} value={v.ID}>{v.VendorName}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldUOM', 'UOM')}</label>
                    <select value={form.UOM} onChange={e => set('UOM', e.target.value)} style={inputStyle}>
                        {['lbs','kg','gal','L','each','case','box','pkg','bag','drum','pail','roll','units','tote'].map(u => <option key={u}>{u}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldUnitCostDollar', 'Unit Cost ($)')}</label><input type="number" step="0.01" value={form.UnitCost} onChange={e => set('UnitCost', e.target.value)} style={inputStyle} placeholder="0.00" /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldOnHand', 'On Hand')}</label><input type="number" value={form.OnHand} onChange={e => set('OnHand', e.target.value)} style={inputStyle} placeholder="0" /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldReorderPoint', 'Reorder Point')}</label><input type="number" value={form.ReorderPt} onChange={e => set('ReorderPt', e.target.value)} style={inputStyle} placeholder="0" /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldMaxStock', 'Max Stock')}</label><input type="number" value={form.MaxStock} onChange={e => set('MaxStock', e.target.value)} style={inputStyle} placeholder="0" /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldStorageArea', 'Storage Area')}</label><input value={form.StorageArea} onChange={e => set('StorageArea', e.target.value)} style={inputStyle} placeholder={t('supplyChain.placeholderStorageArea', 'Dry Storage A...')} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldHazMat', 'HazMat')}</label>
                    <select value={form.HazMat} onChange={e => set('HazMat', Number(e.target.value))} style={inputStyle}>
                        <option value={0}>{t('supplyChain.hazMatNo', 'No')}</option><option value={1}>{t('supplyChain.hazMatYes', 'Yes — HazMat')}</option>
                    </select>
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={submit} disabled={saving} className="btn-save" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {saving ? <RefreshCw size={13} className="spinning" /> : <PlusCircle size={13} />} {t('supplyChain.addItemButton', 'Add Item')}
                </button>
            </div>
        </div>
    );
}

function InventoryTab({ plantId }) {
    const { t } = useTranslation();
    const [items, setItems]       = useState([]);
    const [summary, setSummary]   = useState(null);
    const [vendors, setVendors]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [search, setSearch]     = useState('');
    const [catFilter, setCatFilter] = useState('All');
    const [lowOnly, setLowOnly]   = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [viewItem, setViewItem] = useState(null);
    const [editItem, setEditItem] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [iRes, sRes, vRes] = await Promise.all([
                API(`/items?plantId=${plantId}`, plantId),
                API(`/summary?plantId=${plantId}`, plantId),
                API(`/vendors?plantId=${plantId}`, plantId),
            ]);
            const [id, sd, vd] = await Promise.all([iRes.json(), sRes.json(), vRes.json()]);
            setItems(Array.isArray(id.rows) ? id.rows : []);
            setSummary(sd);
            setVendors(Array.isArray(vd.rows) ? vd.rows : []);
        } catch {}
        setLoading(false);
    }, [plantId]);

    useEffect(() => { load(); }, [load]);

    const filtered = items.filter(i => {
        if (catFilter !== 'All' && i.Category !== catFilter) return false;
        if (lowOnly && !i.NeedsReorder) return false;
        if (search && !`${i.Description} ${i.VendorName} ${i.Category}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SummaryBar summary={summary} loading={loading} />

            {/* By Category Value */}
            {summary?.byCategory?.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {summary.byCategory.map(c => (
                        <div key={c.Category} onClick={() => setCatFilter(catFilter === c.Category ? 'All' : c.Category)}
                            style={{ padding: '6px 14px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                background: catFilter === c.Category ? (CAT_COLOR[c.Category] || '#475569') + '25' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${catFilter === c.Category ? (CAT_COLOR[c.Category] || '#475569') + '50' : 'rgba(255,255,255,0.08)'}`,
                                color: CAT_COLOR[c.Category] || '#94a3b8',
                            }}>
                            {c.Category} — {c.items} SKUs — {fmt(c.value)}
                        </div>
                    ))}
                    {catFilter !== 'All' && <button onClick={() => setCatFilter('All')} className="btn-nav" style={{ padding: '4px 12px', fontSize: '0.7rem' }}>{t('supplyChain.clearFilter', 'Clear Filter')}</button>}
                </div>
            )}

            <div className="glass-card no-print" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('supplyChain.searchPlaceholder', 'Search items, vendors...')} style={{ ...inputStyle, paddingLeft: 32 }} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#f59e0b', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} /> {t('supplyChain.lowStockOnly', 'Low Stock Only')}
                </label>
                <button className="btn-nav" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><RefreshCw size={13} /> {t('supplyChain.refreshButton', 'Refresh')}</button>
                <button className="btn-nav" onClick={() => printTab(
                    `Inventory — ${new Date().toLocaleDateString()}`,
                    ['Category', 'Description', 'Supplier', 'On Hand', 'Reorder Pt', 'Unit Cost', 'Stock Value', 'Storage', 'Status'],
                    filtered.map(i => [i.Category, i.Description, i.VendorName, fmtQ(i.OnHand, i.UOM), fmtQ(i.ReorderPt, i.UOM), i.UnitCost ? `$${Number(i.UnitCost).toFixed(2)}` : '—', i.StockValue ? `$${Number(i.StockValue).toFixed(0)}` : '—', i.StorageArea, i.NeedsReorder ? 'REORDER' : 'OK'])
                )} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Printer size={13} /> {t('supplyChain.printButton', 'Print')}</button>
                <button className="btn-save" onClick={() => setShowForm(f => !f)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {showForm ? <ChevronUp size={13} /> : <PlusCircle size={13} />} {showForm ? t('supplyChain.hideButton', 'Hide') : t('supplyChain.addItemButton', 'Add Item')}
                </button>
            </div>

            {showForm && <AddItemForm plantId={plantId} vendors={vendors} onSaved={() => { load(); setShowForm(false); }} />}

            {/* Low Stock Alerts */}
            {summary?.lowStockItems?.length > 0 && !lowOnly && (
                <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ef4444', marginBottom: 8, textTransform: 'uppercase' }}>⚠ {t('supplyChain.reorderAlertsCount', 'Reorder Alerts')} — {summary.lowStockItems.length} {t('supplyChain.reorderAlertsSuffix', 'items at or below reorder point')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {summary.lowStockItems.slice(0, 6).map(i => (
                            <div key={i.Description} style={{ padding: '4px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, fontSize: '0.72rem', color: '#fca5a5' }}>
                                {i.Description} — {fmtQ(i.OnHand, i.UOM)} / {t('supplyChain.reorderAt', 'reorder at')} {fmtQ(i.ReorderPt, i.UOM)}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Inventory Table */}
            {[viewItem && <ViewItemModal key="view" item={viewItem} onClose={() => setViewItem(null)} />,
              editItem && <EditItemModal key="edit" item={editItem} plantId={plantId} vendors={vendors} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); load(); }} />]}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-container" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 460px)' }}>
                    <table className="data-table">
                        <thead><tr>
                            {[
                                t('supplyChain.colCategory', 'Category'),
                                t('supplyChain.colDescription', 'Description'),
                                t('supplyChain.colSupplier', 'Supplier'),
                                t('supplyChain.colOnHand', 'On Hand'),
                                t('supplyChain.colReorderPt', 'Reorder Pt'),
                                t('supplyChain.colUnitCost', 'Unit Cost'),
                                t('supplyChain.fieldStockValue', 'Stock Value'),
                                t('supplyChain.colStorage', 'Storage'),
                                t('supplyChain.fieldStatus', 'Status'),
                                t('supplyChain.colActions', 'Actions'),
                            ].map(h => <th key={h}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={10} style={{ textAlign: 'center', color: '#64748b', padding: 32 }}><RefreshCw size={16} className="spinning" /></td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={10} style={{ textAlign: 'center', color: '#475569', padding: 24 }}>{t('supplyChain.noItemsMatch', 'No items match your filters.')}</td></tr>
                            ) : filtered.map(i => {
                                const reorder = i.NeedsReorder;
                                const catColor = CAT_COLOR[i.Category] || '#94a3b8';
                                return (
                                    <tr key={i.ID} style={{ background: reorder ? 'rgba(239,68,68,0.04)' : undefined }}>
                                        <td><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 700, background: catColor + '18', color: catColor }}>{i.Category}</span></td>
                                        <td style={{ fontWeight: 600, maxWidth: 180 }}>{i.Description}{i.HazMat ? ' ⚠' : ''}</td>
                                        <td style={{ color: '#94a3b8' }}>{i.VendorName || '—'}</td>
                                        <td style={{ fontWeight: 700, color: reorder ? '#ef4444' : '#f1f5f9' }}>{fmtQ(i.OnHand, i.UOM)}</td>
                                        <td style={{ color: '#64748b' }}>{i.ReorderPt > 0 ? fmtQ(i.ReorderPt, i.UOM) : '—'}</td>
                                        <td>{i.UnitCost > 0 ? `$${Number(i.UnitCost).toFixed(2)}/${i.UOM}` : '—'}</td>
                                        <td style={{ fontWeight: 700, color: '#10b981' }}>{fmt(i.StockValue)}</td>
                                        <td style={{ color: '#64748b' }}>{i.StorageArea || '—'}</td>
                                        <td>{reorder
                                            ? <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>{t('supplyChain.statusReorder', 'REORDER')}</span>
                                            : <span style={{ color: '#10b981', fontSize: '0.68rem' }}>✓ {t('supplyChain.statusOK', 'OK')}</span>
                                        }</td>
                                        <td><div style={{ display: 'flex', gap: 4 }}>
                                            <button onClick={() => setViewItem(i)} className="btn-nav" style={{ padding: '3px 8px', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 3 }}><Eye size={11} />{t('supplyChain.viewButton', 'View')}</button>
                                            <button onClick={() => setEditItem(i)} className="btn-nav" style={{ padding: '3px 8px', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 3 }}><Edit2 size={11} />{t('supplyChain.editButton', 'Edit')}</button>
                                        </div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 2 — Purchase Orders
// ═══════════════════════════════════════════════════════════════════════════════
function CreatePOForm({ plantId, vendors, items, onSaved }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({ VendorID: '', OrderDate: new Date().toISOString().split('T')[0], ExpectedDate: '', Notes: '', OrderedBy: localStorage.getItem('currentUser') || '', Tax: '', Shipping: '', Discount: '' });
    const [lines, setLines] = useState([{ ItemID: '', ItemDesc: '', Qty: '', UOM: 'lbs', UnitCost: '' }]);
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setLine = (i, k, v) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
    const addLine = () => setLines(ls => [...ls, { ItemID: '', ItemDesc: '', Qty: '', UOM: 'lbs', UnitCost: '' }]);
    const removeLine = i => setLines(ls => ls.filter((_, idx) => idx !== i));

    const handleItemSelect = (lineIdx, itemId) => {
        const item = items.find(it => String(it.ID) === String(itemId));
        if (item) {
            setLine(lineIdx, 'ItemID', item.ID);
            setLine(lineIdx, 'ItemDesc', item.Description);
            setLine(lineIdx, 'UOM', item.UOM);
            setLine(lineIdx, 'UnitCost', item.UnitCost);
        } else {
            setLine(lineIdx, 'ItemID', '');
        }
    };

    const lineTotal = lines.reduce((s, l) => s + ((parseFloat(l.Qty) || 0) * (parseFloat(l.UnitCost) || 0)), 0);
    const total = (lineTotal + (parseFloat(form.Tax) || 0) + (parseFloat(form.Shipping) || 0)) - (parseFloat(form.Discount) || 0);

    const submit = async () => {
        if (!form.VendorID) return window.trierToast?.error(t('supplyChain.errorSelectVendor', 'Select a vendor'));
        if (!lines.some(l => l.Qty > 0)) return window.trierToast?.error(t('supplyChain.errorAddLineItem', 'Add at least one line item'));
        setSaving(true);
        try {
            const r = await API('/po', plantId, { method: 'POST', body: JSON.stringify({ ...form, lines }) });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            window.trierToast?.success(`PO ${d.poNumber} ${t('supplyChain.poCreated', 'created')}`);
            onSaved?.();
        } catch (e) { window.trierToast?.error(e.message); }
        setSaving(false);
    };

    return (
        <div className="glass-card" style={{ padding: 20, marginBottom: 12 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}><PlusCircle size={16} color="#3b82f6" /> {t('supplyChain.createPurchaseOrder', 'Create Purchase Order')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldSupplierRequired', 'Supplier *')}</label>
                    <select value={form.VendorID} onChange={e => set('VendorID', e.target.value)} style={inputStyle}>
                        <option value="">{t('supplyChain.selectSupplierOption', '— Select Supplier —')}</option>
                        {vendors.map(v => <option key={v.ID} value={v.ID}>{v.VendorName}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldOrderDate', 'Order Date')}</label><input type="date" value={form.OrderDate} onChange={e => set('OrderDate', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldExpectedDelivery', 'Expected Delivery')}</label><input type="date" value={form.ExpectedDate} onChange={e => set('ExpectedDate', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldOrderedBy', 'Ordered By')}</label><input value={form.OrderedBy} onChange={e => set('OrderedBy', e.target.value)} style={inputStyle} /></div>
                <div style={{ ...fieldStyle, gridColumn: 'span 2' }}><label style={labelStyle}>{t('supplyChain.fieldNotes', 'Notes')}</label><input value={form.Notes} onChange={e => set('Notes', e.target.value)} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldTax', 'Tax ($)')}</label><input type="number" step="0.01" value={form.Tax} onChange={e => set('Tax', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldShipping', 'Shipping ($)')}</label><input type="number" step="0.01" value={form.Shipping} onChange={e => set('Shipping', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldDiscount', 'Discount ($)')}</label><input type="number" step="0.01" value={form.Discount} onChange={e => set('Discount', e.target.value)} style={inputStyle} /></div>
            </div>

            {/* Line Items */}
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>{t('supplyChain.lineItems', 'Line Items')}</div>
            {lines.map((l, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 6, alignItems: 'end' }}>
                    <div style={fieldStyle}>
                        <select value={l.ItemID} onChange={e => handleItemSelect(i, e.target.value)} style={inputStyle}>
                            <option value="">{t('supplyChain.selectItemOption', '— Select Item or type below —')}</option>
                            {items.map(it => <option key={it.ID} value={it.ID}>{it.Description} ({it.Category})</option>)}
                        </select>
                    </div>
                    <div style={fieldStyle}><input type="number" placeholder={t('supplyChain.placeholderQty', 'Qty')} value={l.Qty} onChange={e => setLine(i, 'Qty', e.target.value)} style={inputStyle} /></div>
                    <div style={fieldStyle}><input placeholder={t('supplyChain.placeholderUOM', 'UOM')} value={l.UOM} onChange={e => setLine(i, 'UOM', e.target.value)} style={inputStyle} /></div>
                    <div style={fieldStyle}><input type="number" step="0.01" placeholder={t('supplyChain.placeholderUnitCost', 'Unit Cost $')} value={l.UnitCost} onChange={e => setLine(i, 'UnitCost', e.target.value)} style={inputStyle} /></div>
                    <button onClick={() => removeLine(i)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#ef4444', padding: '6px 10px', cursor: 'pointer' }}>✕</button>
                </div>
            ))}
            <button onClick={addLine} className="btn-nav" style={{ fontSize: '0.75rem', marginTop: 4 }}><PlusCircle size={12} style={{ marginRight: 4 }} />{t('supplyChain.addLine', 'Add Line')}</button>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.1rem' }}>{t('supplyChain.poTotal', 'PO Total')}: {fmt(total)}</div>
                <button onClick={submit} disabled={saving} className="btn-save" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {saving ? <RefreshCw size={13} className="spinning" /> : <ShoppingCart size={13} />} {t('supplyChain.createPOButton', 'Create PO')}
                </button>
            </div>
        </div>
    );
}

function ReceivePOModal({ po, plantId, onClose, onReceived }) {
    const { t } = useTranslation();
    const [rcvLines, setRcvLines] = useState((po.lines || []).map(l => ({ ...l, QtyRcvd: l.Qty - l.QtyRcvd > 0 ? l.Qty - l.QtyRcvd : 0 })));
    const [saving, setSaving] = useState(false);
    const [rcvDate] = useState(new Date().toISOString().split('T')[0]);
    const setQty = (i, v) => setRcvLines(ls => ls.map((l, idx) => idx === i ? { ...l, QtyRcvd: v } : l));
    const receive = async () => {
        setSaving(true);
        try {
            const r = await API(`/po/${po.ID}/receive`, plantId, { method: 'PUT', body: JSON.stringify({ receivedDate: rcvDate, lines: rcvLines }) });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            window.trierToast?.success(t('supplyChain.poReceivedSuccess', 'PO received — inventory updated'));
            onReceived?.();
        } catch (e) { window.trierToast?.error(e.message); }
        setSaving(false);
    };
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-card" style={{ padding: 24, minWidth: 560, maxWidth: 700, maxHeight: '80vh', overflow: 'auto' }}>
                <h3 style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Truck size={18} color="#10b981" /> {t('supplyChain.receiveLabel', 'Receive')} — {po.PONumber}
                    <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 14 }}>{t('supplyChain.vendorLabel', 'Vendor')}: <strong style={{ color: '#f1f5f9' }}>{po.VendorName}</strong> — {t('supplyChain.expectedLabel', 'Expected')}: {po.ExpectedDate || '—'}</div>
                {rcvLines.map((l, i) => (
                    <div key={l.ID} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 6, alignItems: 'center' }}>
                        <div style={{ fontSize: '0.8rem', color: '#f1f5f9' }}>{l.ItemDesc || l.Description || t('supplyChain.itemLabel', 'Item')}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{t('supplyChain.orderedLabel', 'Ordered')}: {l.Qty} {l.UOM}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{t('supplyChain.prevRcvdLabel', 'Prev Rcvd')}: {l.QtyRcvd_orig || 0}</div>
                        <input type="number" value={l.QtyRcvd} onChange={e => setQty(i, e.target.value)} style={{ ...inputStyle, width: 90 }} placeholder={t('supplyChain.placeholderRcvQty', 'Rcv Qty')} />
                    </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button onClick={onClose} className="btn-nav">{t('supplyChain.cancelButton', 'Cancel')}</button>
                    <button onClick={receive} disabled={saving} className="btn-save" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {saving ? <RefreshCw size={13} className="spinning" /> : <CheckCircle2 size={13} />} {t('supplyChain.confirmReceipt', 'Confirm Receipt')}
                    </button>
                </div>
            </div>
        </div>
    );
}

function PurchaseOrdersTab({ plantId }) {
    const { t } = useTranslation();
    const [pos, setPOs]         = useState([]);
    const [vendors, setVendors] = useState([]);
    const [items, setItems]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [receivePO, setReceivePO] = useState(null);
    const [viewPO, setViewPO]   = useState(null);
    const [editPO, setEditPO]   = useState(null);
    const [statusFilter, setStatusFilter] = useState('Open');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [poRes, vRes, iRes] = await Promise.all([
                API(`/po?plantId=${plantId}`, plantId),
                API(`/vendors?plantId=${plantId}`, plantId),
                API(`/items?plantId=${plantId}`, plantId),
            ]);
            const [pd, vd, id] = await Promise.all([poRes.json(), vRes.json(), iRes.json()]);
            setPOs(Array.isArray(pd.rows) ? pd.rows : []);
            setVendors(Array.isArray(vd.rows) ? vd.rows : []);
            setItems(Array.isArray(id.rows) ? id.rows : []);
        } catch {}
        setLoading(false);
    }, [plantId]);

    useEffect(() => { load(); }, [load]);

    const filtered = pos.filter(p => statusFilter === 'All' || p.Status === statusFilter);

    const statusColor = { Open: '#f59e0b', Partial: '#3b82f6', Received: '#10b981', Cancelled: '#ef4444' };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="glass-card no-print" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                {[
                    t('supplyChain.filterAll', 'All'),
                    t('supplyChain.filterOpen', 'Open'),
                    t('supplyChain.filterPartial', 'Partial'),
                    t('supplyChain.filterReceived', 'Received'),
                ].map((label, idx) => {
                    const val = ['All', 'Open', 'Partial', 'Received'][idx];
                    return (
                        <button key={val} onClick={() => setStatusFilter(val)} className={`btn-nav ${statusFilter === val ? 'active' : ''}`} style={{ fontSize: '0.75rem' }}>{label}</button>
                    );
                })}
                <button className="btn-nav" onClick={load} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}><RefreshCw size={13} /> {t('supplyChain.refreshButton', 'Refresh')}</button>
                <button className="btn-nav" onClick={() => printTab(
                    `Purchase Orders — ${statusFilter}`,
                    ['PO #', 'Vendor', 'Order Date', 'Expected', 'Lines', 'PO Value', 'Status'],
                    filtered.map(p => [p.PONumber, p.VendorName, p.OrderDate, p.ExpectedDate, p.LineCount, `$${Number(p.TotalValue).toFixed(0)}`, p.Status])
                )} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Printer size={13} /> {t('supplyChain.printButton', 'Print')}</button>
                <button className="btn-save" onClick={() => setShowForm(f => !f)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {showForm ? <ChevronUp size={13} /> : <PlusCircle size={13} />} {showForm ? t('supplyChain.hideButton', 'Hide') : t('supplyChain.createPOButton', 'Create PO')}
                </button>
            </div>

            {showForm && <CreatePOForm plantId={plantId} vendors={vendors} items={items} onSaved={() => { load(); setShowForm(false); }} />}

            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-container" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 380px)' }}>
                    <table className="data-table">
                        <thead><tr>{[
                            t('supplyChain.colPONumber', 'PO #'),
                            t('supplyChain.colVendor', 'Vendor'),
                            t('supplyChain.fieldOrderDate', 'Order Date'),
                            t('supplyChain.fieldExpected', 'Expected'),
                            t('supplyChain.colLines', 'Lines'),
                            t('supplyChain.colPOValue', 'PO Value'),
                            t('supplyChain.fieldStatus', 'Status'),
                            t('supplyChain.colActions', 'Actions'),
                        ].map(h => <th key={h}>{h}</th>)}</tr></thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}><RefreshCw size={16} className="spinning" /></td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: '#475569' }}>{t('supplyChain.noPurchaseOrders', 'No purchase orders found.')}</td></tr>
                            ) : filtered.map(p => (
                                <tr key={p.ID}>
                                    <td style={{ fontWeight: 700, color: '#3b82f6' }}>{p.PONumber}</td>
                                    <td>{p.VendorName || '—'}</td>
                                    <td>{p.OrderDate}</td>
                                    <td style={{ color: '#64748b' }}>{p.ExpectedDate || '—'}</td>
                                    <td>{p.LineCount}</td>
                                    <td style={{ fontWeight: 700, color: '#10b981' }}>{fmt(p.TotalValue)}</td>
                                    <td><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700, background: (statusColor[p.Status] || '#475569') + '18', color: statusColor[p.Status] || '#94a3b8' }}>{p.Status}</span></td>
                                    <td><div style={{ display: 'flex', gap: 4 }}>
                                        <button onClick={() => setViewPO(p)} className="btn-nav" style={{ padding: '3px 8px', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 3 }}><Eye size={11} />{t('supplyChain.viewButton', 'View')}</button>
                                        <button onClick={() => setEditPO(p)} className="btn-nav" style={{ padding: '3px 8px', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 3 }}><Edit2 size={11} />{t('supplyChain.editButton', 'Edit')}</button>
                                        {(p.Status === 'Open' || p.Status === 'Partial') && (
                                            <button onClick={() => setReceivePO(p)} className="btn-nav" style={{ padding: '3px 8px', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 3 }}><Truck size={11} />{t('supplyChain.receiveButton', 'Receive')}</button>
                                        )}
                                    </div></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {receivePO && <ReceivePOModal po={receivePO} plantId={plantId} onClose={() => setReceivePO(null)} onReceived={() => { setReceivePO(null); load(); }} />}
            {viewPO && <ViewPOModal po={viewPO} onClose={() => setViewPO(null)} />}
            {editPO && <EditPOModal po={editPO} plantId={plantId} vendors={vendors} onClose={() => setEditPO(null)} onSaved={() => { setEditPO(null); load(); }} />}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 3 — Transaction Log (Receipts + Usage)
// ═══════════════════════════════════════════════════════════════════════════════
function LogUsageForm({ plantId, items, onSaved }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({ ItemID: '', TxType: 'Usage', TxDate: new Date().toISOString().split('T')[0], Qty: '', UOM: '', Reference: '', Notes: '', EnteredBy: localStorage.getItem('currentUser') || '' });
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const handleItemChange = (itemId) => {
        set('ItemID', itemId);
        const item = items.find(i => String(i.ID) === String(itemId));
        if (item) set('UOM', item.UOM);
    };
    const submit = async () => {
        if (!form.ItemID || !form.Qty) return window.trierToast?.error(t('supplyChain.errorItemQtyRequired', 'Item and Qty required'));
        setSaving(true);
        try {
            const r = await API('/transactions', plantId, { method: 'POST', body: JSON.stringify(form) });
            const d = await r.json(); if (d.error) throw new Error(d.error);
            window.trierToast?.success(t('supplyChain.transactionLogged', 'Transaction logged'));
            setForm(f => ({ ...f, Qty: '', Reference: '', Notes: '' }));
            onSaved?.();
        } catch (e) { window.trierToast?.error(e.message); }
        setSaving(false);
    };
    return (
        <div className="glass-card" style={{ padding: 16, marginBottom: 10 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}><PlusCircle size={14} color="#f59e0b" /> {t('supplyChain.logTransaction', 'Log Transaction')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 8 }}>
                <div style={{ ...fieldStyle, gridColumn: 'span 2' }}><label style={labelStyle}>{t('supplyChain.fieldItemRequired', 'Item *')}</label>
                    <select value={form.ItemID} onChange={e => handleItemChange(e.target.value)} style={inputStyle}>
                        <option value="">{t('supplyChain.selectItemSimple', '— Select Item —')}</option>
                        {items.map(i => <option key={i.ID} value={i.ID}>{i.Description}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldType', 'Type')}</label>
                    <select value={form.TxType} onChange={e => set('TxType', e.target.value)} style={inputStyle}>
                        {TX_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldDate', 'Date')}</label><input type="date" value={form.TxDate} onChange={e => set('TxDate', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldQuantity', 'Quantity')}</label><input type="number" value={form.Qty} onChange={e => set('Qty', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldUOM', 'UOM')}</label><input value={form.UOM} onChange={e => set('UOM', e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldReference', 'Reference')}</label><input value={form.Reference} onChange={e => set('Reference', e.target.value)} style={inputStyle} placeholder={t('supplyChain.placeholderReference', 'Batch#, WO#...')} /></div>
                <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldNotes', 'Notes')}</label><input value={form.Notes} onChange={e => set('Notes', e.target.value)} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button onClick={submit} disabled={saving} className="btn-save" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {saving ? <RefreshCw size={13} className="spinning" /> : <Layers size={13} />} {t('supplyChain.logTransactionButton', 'Log Transaction')}
                </button>
            </div>
        </div>
    );
}

// ── Transactions (Receiving Log) View/Edit Modals ──────────────────────────────
function ViewTransactionModal({ tx, onClose }) {
    const { t } = useTranslation();
    const doPrint = () => printTab(
        t('supplyChain.transactionLogPrint', 'Transaction Detail'),
        ['Field', 'Value'],
        [
            [t('supplyChain.colDate', 'Date'), tx.TxDate],
            [t('supplyChain.fieldType', 'Type'), tx.TxType],
            [t('supplyChain.colItem', 'Item'), tx.ItemName],
            [t('supplyChain.colCategory', 'Category'), tx.Category],
            [t('supplyChain.colQty', 'Qty'), `${tx.Qty} ${tx.UOM}`],
            [t('supplyChain.colUnitCost', 'Unit Cost'), tx.UnitCost ? `$${Number(tx.UnitCost).toFixed(2)}` : '—'],
            [t('supplyChain.colTotal', 'Total'), tx.TotalCost > 0 ? fmt(tx.TotalCost) : '—'],
            [t('supplyChain.fieldReference', 'Reference'), tx.Reference],
            [t('supplyChain.colBy', 'Entered By'), tx.EnteredBy],
            [t('supplyChain.fieldNotes', 'Notes'), tx.Notes],
        ].filter(([,v]) => v)
    );
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-card" style={{ padding: 24, minWidth: 560, maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
                <h3 style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Layers size={18} color="#f59e0b" /> {t('supplyChain.transactionDetails', 'Transaction Details')}
                    <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                        [t('supplyChain.colDate', 'Date'), tx.TxDate],
                        [t('supplyChain.fieldType', 'Type'), tx.TxType],
                        [t('supplyChain.colItem', 'Item'), tx.ItemName],
                        [t('supplyChain.colQty', 'Qty'), `${tx.Qty} ${tx.UOM}`],
                        [t('supplyChain.fieldReference', 'Reference'), tx.Reference],
                        [t('supplyChain.colBy', 'By'), tx.EnteredBy],
                        [t('supplyChain.fieldNotes', 'Notes'), tx.Notes],
                    ].map(([k, v]) => v ? (
                        <div key={k} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: '0.62rem', color: '#475569', textTransform: 'uppercase', fontWeight: 700 }}>{k}</span>
                            <span style={{ fontSize: '0.82rem', color: '#f1f5f9' }}>{v}</span>
                        </div>
                    ) : null)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button onClick={doPrint} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Printer size={13} /> {t('supplyChain.printButton', 'Print')}</button>
                    <button onClick={onClose} className="btn-nav">{t('supplyChain.closeButton', 'Close')}</button>
                </div>
            </div>
        </div>
    );
}

function EditTransactionModal({ tx, plantId, onClose, onSaved }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({ ...tx });
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    
    // Safety check - we don't allow changing the ITEM of an existing transaction since
    // it requires complex multi-item reconnections. We only allow editing Qty, Date, Reference etc.
    const save = async () => {
        if (!form.TxType || !form.Qty) return window.trierToast?.error(t('supplyChain.errorTxTypeQtyRequired', 'Type and Qty required'));
        setSaving(true);
        try {
            const r = await API(`/transactions/${tx.ID}`, plantId, { method: 'PUT', body: JSON.stringify(form) });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            window.trierToast?.success(t('supplyChain.transactionUpdated', 'Transaction updated'));
            onSaved?.();
        } catch (e) { window.trierToast?.error(e.message); }
        setSaving(false);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-card" style={{ padding: 24, minWidth: 560, maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
                <h3 style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Edit2 size={18} color="#3b82f6" /> {t('supplyChain.editTxLabel', 'Edit Transaction')} — {tx.ItemName}
                    <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 10 }}>
                    <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldType', 'Type')}</label>
                        <select value={form.TxType} onChange={e => set('TxType', e.target.value)} style={inputStyle}>
                            {TX_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                    </div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldDate', 'Date')}</label><input type="date" value={form.TxDate} onChange={e => set('TxDate', e.target.value)} style={inputStyle} /></div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldQuantity', 'Quantity')}</label><input type="number" value={form.Qty} onChange={e => set('Qty', e.target.value)} style={inputStyle} /></div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldUOM', 'UOM')}</label><input value={form.UOM} onChange={e => set('UOM', e.target.value)} style={inputStyle} /></div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldReference', 'Reference')}</label><input value={form.Reference || ''} onChange={e => set('Reference', e.target.value)} style={inputStyle} /></div>
                    <div style={{ ...fieldStyle, gridColumn: 'span 2' }}><label style={labelStyle}>{t('supplyChain.fieldNotes', 'Notes')}</label><input value={form.Notes || ''} onChange={e => set('Notes', e.target.value)} style={inputStyle} /></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button onClick={onClose} className="btn-nav">{t('supplyChain.cancelButton', 'Cancel')}</button>
                    <button onClick={save} disabled={saving} className="btn-save" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {saving ? <RefreshCw size={13} className="spinning" /> : <Save size={13} />} {t('supplyChain.saveChanges', 'Save Changes')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Suppliers View/Edit Modals ────────────────────────────────────────────────
function ViewSupplierModal({ vendor, onClose }) {
    const { t } = useTranslation();
    const rows = [
        [t('supplyChain.fieldVendorNameRequired', 'Vendor Name'), vendor.VendorName],
        [t('supplyChain.fieldCategory', 'Category'), vendor.Category],
        [t('supplyChain.fieldContactName', 'Contact Name'), vendor.ContactName],
        [t('supplyChain.fieldPhone', 'Phone'), vendor.Phone],
        [t('supplyChain.fieldEmail', 'Email'), vendor.Email],
        [t('supplyChain.fieldWebsite', 'Website'), vendor.Website],
        [t('supplyChain.fieldAccountNum', 'Account #'), vendor.AccountNum],
        [t('supplyChain.fieldLeadDays', 'Lead Days'), vendor.LeadDays],
        [t('supplyChain.fieldNotes', 'Notes'), vendor.Notes],
    ];
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-card" style={{ padding: 24, minWidth: 400, maxWidth: 500, maxHeight: '80vh', overflow: 'auto' }}>
                <h3 style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Building2 size={18} color="#8b5cf6" /> {vendor.VendorName}
                    <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {rows.map(([k, v]) => v ? (
                    <div key={k} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.62rem', color: '#475569', textTransform: 'uppercase', fontWeight: 700 }}>{k}</span>
                        <span style={{ fontSize: '0.82rem', color: '#f1f5f9' }}>{v}</span>
                    </div>
                ) : null)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={onClose} className="btn-nav">{t('supplyChain.closeButton', 'Close')}</button>
            </div>
            </div>
        </div>
    );
}

function EditSupplierModal({ vendor, plantId, onClose, onSaved }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({ ...vendor });
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    
    const save = async () => {
        if (!form.VendorName) return window.trierToast?.error(t('supplyChain.errorVendorNameRequired', 'Vendor Name required'));
        setSaving(true);
        try {
            const r = await API(`/vendors/${vendor.ID}`, plantId, { method: 'PUT', body: JSON.stringify(form) });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            window.trierToast?.success(t('supplyChain.vendorUpdated', 'Vendor updated'));
            onSaved?.();
        } catch (e) { window.trierToast?.error(e.message); }
        setSaving(false);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-card" style={{ padding: 24, minWidth: 500, maxWidth: 650, maxHeight: '80vh', overflow: 'auto' }}>
                <h3 style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Edit2 size={18} color="#10b981" /> {t('supplyChain.editSupplierLabel', 'Edit Supplier')} — {vendor.VendorName}
                    <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 10 }}>
                    <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldVendorNameRequired', 'Vendor Name *')}</label><input value={form.VendorName} onChange={e => set('VendorName', e.target.value)} style={inputStyle} /></div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldCategory', 'Category')}</label>
                        <select value={form.Category} onChange={e => set('Category', e.target.value)} style={inputStyle}>
                            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                    </div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldContactName', 'Contact Name')}</label><input value={form.ContactName || ''} onChange={e => set('ContactName', e.target.value)} style={inputStyle} /></div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldPhone', 'Phone')}</label><input value={form.Phone || ''} onChange={e => set('Phone', e.target.value)} style={inputStyle} /></div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldEmail', 'Email')}</label><input value={form.Email || ''} onChange={e => set('Email', e.target.value)} style={inputStyle} /></div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldWebsite', 'Website')}</label><input value={form.Website || ''} onChange={e => set('Website', e.target.value)} style={inputStyle} /></div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldAccountNum', 'Account #')}</label><input value={form.AccountNum || ''} onChange={e => set('AccountNum', e.target.value)} style={inputStyle} /></div>
                    <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldLeadDays', 'Lead Days')}</label><input type="number" value={form.LeadDays} onChange={e => set('LeadDays', e.target.value)} style={inputStyle} /></div>
                    <div style={{ ...fieldStyle, gridColumn: 'span 2' }}><label style={labelStyle}>{t('supplyChain.fieldNotes', 'Notes')}</label><input value={form.Notes || ''} onChange={e => set('Notes', e.target.value)} style={inputStyle} /></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button onClick={onClose} className="btn-nav">{t('supplyChain.cancelButton', 'Cancel')}</button>
                    <button onClick={save} disabled={saving} className="btn-save" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {saving ? <RefreshCw size={13} className="spinning" /> : <Save size={13} />} {t('supplyChain.saveChanges', 'Save Changes')}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ReceivingTab({ plantId }) {
    const { t } = useTranslation();
    const [txns, setTxns]     = useState([]);
    const [items, setItems]   = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [viewTx, setViewTx] = useState(null);
    const [editTx, setEditTx] = useState(null);
    const [days, setDays]     = useState(30);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [tRes, iRes] = await Promise.all([
                API(`/transactions?plantId=${plantId}&days=${days}`, plantId),
                API(`/items?plantId=${plantId}`, plantId),
            ]);
            const [td, id] = await Promise.all([tRes.json(), iRes.json()]);
            setTxns(Array.isArray(td.rows) ? td.rows : []);
            setItems(Array.isArray(id.rows) ? id.rows : []);
        } catch {}
        setLoading(false);
    }, [plantId, days]);

    useEffect(() => { load(); }, [load]);

    const txColor = { Receipt: '#10b981', Usage: '#ef4444', 'Adjustment In': '#3b82f6', 'Adjustment Out': '#f59e0b', Waste: '#ef4444', Transfer: '#8b5cf6' };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="glass-card no-print" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{t('supplyChain.lastLabel', 'Last')}</span>
                {[7, 30, 90, 365].map(d => (
                    <button key={d} onClick={() => setDays(d)} className={`btn-nav ${days === d ? 'active' : ''}`} style={{ fontSize: '0.75rem' }}>{d === 365 ? t('supplyChain.oneYear', '1yr') : `${d}d`}</button>
                ))}
                <button className="btn-nav" onClick={load} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}><RefreshCw size={13} /> {t('supplyChain.refreshButton', 'Refresh')}</button>
                <button className="btn-nav" onClick={() => printTab(
                    `Receiving Log — Last ${days} days`,
                    ['Date', 'Type', 'Item', 'Category', 'Qty', 'Unit Cost', 'Total', 'Reference', 'By'],
                    txns.map(t => [t.TxDate, t.TxType, t.ItemName, t.Category, `${t.Qty} ${t.UOM}`, t.UnitCost ? `$${Number(t.UnitCost).toFixed(2)}` : '—', t.TotalCost > 0 ? `$${Number(t.TotalCost).toFixed(2)}` : '—', t.Reference, t.EnteredBy])
                )} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Printer size={13} /> {t('supplyChain.printButton', 'Print')}</button>
                <button className="btn-save" onClick={() => setShowForm(f => !f)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {showForm ? <ChevronUp size={13} /> : <PlusCircle size={13} />}{showForm ? ` ${t('supplyChain.hideButton', 'Hide')}` : ` ${t('supplyChain.logTransactionButton', 'Log Transaction')}`}
                </button>
            </div>
            {showForm && <LogUsageForm plantId={plantId} items={items} onSaved={() => { load(); setShowForm(false); }} />}
            {viewTx && <ViewTransactionModal tx={viewTx} onClose={() => setViewTx(null)} />}
            {editTx && <EditTransactionModal tx={editTx} plantId={plantId} onClose={() => setEditTx(null)} onSaved={() => { setEditTx(null); load(); }} />}
            <div className="glass-card" style={{ padding: 0 }}>
                <div className="table-container" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 360px)' }}>
                    <table className="data-table">
                        <thead><tr>{[
                            t('supplyChain.colDate', 'Date'),
                            t('supplyChain.fieldType', 'Type'),
                            t('supplyChain.colItem', 'Item'),
                            t('supplyChain.colCategory', 'Category'),
                            t('supplyChain.colQty', 'Qty'),
                            t('supplyChain.colUnitCost', 'Unit Cost'),
                            t('supplyChain.colTotal', 'Total'),
                            t('supplyChain.fieldReference', 'Reference'),
                            t('supplyChain.colBy', 'By'),
                            t('supplyChain.colActions', 'Actions'),
                        ].map(h => <th key={h}>{h}</th>)}</tr></thead>
                        <tbody>
                            {loading ? <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}><RefreshCw size={16} className="spinning" /></td></tr>
                            : txns.length === 0 ? <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: '#475569' }}>{t('supplyChain.noTransactions', 'No transactions in this period.')}</td></tr>
                            : txns.map(tx => (
                                <tr key={tx.ID}>
                                    <td>{tx.TxDate}</td>
                                    <td><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700, color: txColor[tx.TxType] || '#94a3b8', background: (txColor[tx.TxType] || '#94a3b8') + '18' }}>{tx.TxType}</span></td>
                                    <td style={{ fontWeight: 600 }}>{tx.ItemName || '—'}</td>
                                    <td style={{ color: '#64748b', fontSize: '0.75rem' }}>{tx.Category || '—'}</td>
                                    <td style={{ fontWeight: 700, color: tx.TxType === 'Receipt' ? '#10b981' : '#f59e0b' }}>{tx.Qty} {tx.UOM}</td>
                                    <td style={{ color: '#64748b' }}>{tx.UnitCost ? `$${Number(tx.UnitCost).toFixed(2)}` : '—'}</td>
                                    <td style={{ fontWeight: 700 }}>{tx.TotalCost > 0 ? fmt(tx.TotalCost) : '—'}</td>
                                    <td style={{ color: '#64748b', fontSize: '0.75rem' }}>{tx.Reference || '—'}</td>
                                    <td style={{ color: '#64748b' }}>{tx.EnteredBy || '—'}</td>
                                    <td style={{ width: 100 }}><div style={{ display: 'flex', gap: 4 }}>
                                        <button onClick={() => setViewTx(tx)} className="btn-nav" style={{ padding: '3px 8px', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 3 }}><Eye size={11} />{t('supplyChain.viewButton', 'View')}</button>
                                        <button onClick={() => setEditTx(tx)} className="btn-nav" style={{ padding: '3px 8px', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 3 }}><Edit2 size={11} />{t('supplyChain.editButton', 'Edit')}</button>
                                    </div></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 4 — Suppliers
// ═══════════════════════════════════════════════════════════════════════════════
function SuppliersTab({ plantId }) {
    const { t } = useTranslation();
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [viewSupplier, setViewSupplier] = useState(null);
    const [editSupplier, setEditSupplier] = useState(null);
    const [form, setForm] = useState({ VendorName: '', Category: 'Dairy Ingredients', ContactName: '', Phone: '', Email: '', Website: '', AccountNum: '', LeadDays: 5, Notes: '' });
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const d = await API(`/vendors?plantId=${plantId}`, plantId).then(r => r.json());
            setVendors(Array.isArray(d.rows) ? d.rows : []);
        } catch {}
        setLoading(false);
    }, [plantId]);

    useEffect(() => { load(); }, [load]);

    const submit = async () => {
        if (!form.VendorName) return window.trierToast?.error(t('supplyChain.errorVendorNameRequired', 'Vendor name required'));
        setSaving(true);
        try {
            const r = await API('/vendors', plantId, { method: 'POST', body: JSON.stringify(form) });
            const d = await r.json(); if (d.error) throw new Error(d.error);
            window.trierToast?.success(`${form.VendorName} ${t('supplyChain.vendorAdded', 'added')}`);
            setForm({ VendorName: '', Category: 'Dairy Ingredients', ContactName: '', Phone: '', Email: '', Website: '', AccountNum: '', LeadDays: 5, Notes: '' });
            load(); setShowForm(false);
        } catch (e) { window.trierToast?.error(e.message); }
        setSaving(false);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="glass-card no-print" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 6 }}><Building2 size={16} /> {vendors.length} {t('supplyChain.activeSuppliers', 'Active Suppliers')}</h2>
                <button className="btn-nav" onClick={load} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}><RefreshCw size={13} /> {t('supplyChain.refreshButton', 'Refresh')}</button>
                <button className="btn-save" onClick={() => setShowForm(f => !f)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {showForm ? <ChevronUp size={13} /> : <PlusCircle size={13} />} {showForm ? t('supplyChain.hideButton', 'Hide') : t('supplyChain.addSupplierButton', 'Add Supplier')}
                </button>
            </div>

            {showForm && (
                <div className="glass-card" style={{ padding: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 10 }}>
                        <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldVendorNameRequired', 'Vendor Name *')}</label><input value={form.VendorName} onChange={e => set('VendorName', e.target.value)} style={inputStyle} /></div>
                        <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldCategory', 'Category')}</label>
                            <select value={form.Category} onChange={e => set('Category', e.target.value)} style={inputStyle}>
                                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                        </div>
                        <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldContactName', 'Contact Name')}</label><input value={form.ContactName} onChange={e => set('ContactName', e.target.value)} style={inputStyle} /></div>
                        <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldPhone', 'Phone')}</label><input value={form.Phone} onChange={e => set('Phone', e.target.value)} style={inputStyle} /></div>
                        <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldEmail', 'Email')}</label><input value={form.Email} onChange={e => set('Email', e.target.value)} style={inputStyle} /></div>
                        <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldWebsite', 'Website')}</label><input value={form.Website} onChange={e => set('Website', e.target.value)} style={inputStyle} /></div>
                        <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldAccountNum', 'Account #')}</label><input value={form.AccountNum} onChange={e => set('AccountNum', e.target.value)} style={inputStyle} /></div>
                        <div style={fieldStyle}><label style={labelStyle}>{t('supplyChain.fieldLeadDays', 'Lead Days')}</label><input type="number" value={form.LeadDays} onChange={e => set('LeadDays', e.target.value)} style={inputStyle} /></div>
                        <div style={{ ...fieldStyle, gridColumn: 'span 2' }}><label style={labelStyle}>{t('supplyChain.fieldNotes', 'Notes')}</label><input value={form.Notes} onChange={e => set('Notes', e.target.value)} style={inputStyle} /></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                        <button onClick={submit} disabled={saving} className="btn-save" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {saving ? <RefreshCw size={13} className="spinning" /> : <PlusCircle size={13} />} {t('supplyChain.addSupplierButton', 'Add Supplier')}
                        </button>
                    </div>
                </div>
            )}

            {viewSupplier && <ViewSupplierModal vendor={viewSupplier} onClose={() => setViewSupplier(null)} />}
            {editSupplier && <EditSupplierModal vendor={editSupplier} plantId={plantId} onClose={() => setEditSupplier(null)} onSaved={() => { setEditSupplier(null); load(); }} />}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 10 }}>
                {loading ? <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}><RefreshCw size={16} className="spinning" /></div>
                : vendors.map(v => (
                    <div key={v.ID} className="glass-card" style={{ padding: 16, position: 'relative' }}>
                        <div style={{ display: 'flex', gap: 4, position: 'absolute', top: 12, right: 12 }}>
                            <button onClick={() => setViewSupplier(v)} className="btn-nav" style={{ padding: '3px 8px', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 3 }}><Eye size={11} />{t('supplyChain.viewButton', 'View')}</button>
                            <button onClick={() => setEditSupplier(v)} className="btn-nav" style={{ padding: '3px 8px', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 3 }}><Edit2 size={11} />{t('supplyChain.editButton', 'Edit')}</button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: (CAT_COLOR[v.Category] || '#475569') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Building2 size={16} color={CAT_COLOR[v.Category] || '#64748b'} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{v.VendorName}</div>
                                <div style={{ fontSize: '0.68rem', color: CAT_COLOR[v.Category] || '#64748b', fontWeight: 600, marginBottom: 4 }}>{v.Category}</div>
                                {v.ContactName && <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>👤 {v.ContactName}</div>}
                                {v.Phone && <div style={{ fontSize: '0.74rem', color: '#64748b' }}>📞 {v.Phone}</div>}
                                {v.Email && <div style={{ fontSize: '0.74rem', color: '#3b82f6' }}>✉ {v.Email}</div>}
                                {v.AccountNum && <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>{t('supplyChain.acctLabel', 'Acct')}: {v.AccountNum}</div>}
                                {v.LeadDays > 0 && <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>{t('supplyChain.leadTime', 'Lead time')}: {v.LeadDays} {t('supplyChain.daysLabel', 'days')}</div>}
                                {v.Notes && <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: 4, fontStyle: 'italic' }}>{v.Notes}</div>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Export
// ═══════════════════════════════════════════════════════════════════════════════
// All-Sites Cross-Plant Rollup
// ═══════════════════════════════════════════════════════════════════════════════
function AllSitesView() {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [scorecardData, setScorecardData] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [r1, r2] = await Promise.all([
                fetch('/api/supply-chain/all-sites', { headers: {} }),
                fetch('/api/vendors/scorecard?plantId=all_sites', { headers: {} })
            ]);
            if (r1.ok) setData(await r1.json());
            if (r2.ok) setScorecardData(await r2.json());
        } catch { /* network error */ } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>{t('common.loading', 'Loading…')}</div>;

    const kpis = [
        { label: t('supplyChain.allSitesTotalValue', 'Total Inventory Value'), val: fmt(data?.totalInventoryValue), color: '#10b981', icon: DollarSign },
        { label: t('supplyChain.allSitesSKUs', 'Total SKUs'), val: fmtN(data?.totalItems), color: '#3b82f6', icon: Package },
        { label: t('supplyChain.allSitesOpenPOs', 'Open POs'), val: fmtN(data?.openOrders), color: '#f59e0b', icon: ClipboardList },
        { label: t('supplyChain.allSitesOverdue', 'Overdue POs'), val: fmtN(data?.overdueOrders), color: data?.overdueOrders > 0 ? '#ef4444' : '#475569', icon: AlertTriangle },
    ];

    const cardStyle = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px 20px' };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '2px 2px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {t('supplyChain.allSitesAsOf', 'As of')} {data?.asOf ? new Date(data.asOf).toLocaleString() : '—'}
                    {' · '}{data?.plantCount || 0} {t('supplyChain.allSitesPlants', 'plants')}
                </span>
                <button onClick={load} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                    <RefreshCw size={14} />{t('btn.refresh', 'Refresh')}
                </button>
            </div>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                {kpis.map(k => (
                    <div key={k.label} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 14 }}>
                        <k.icon size={22} color={k.color} />
                        <div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: k.color }}>{k.val}</div>
                            <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Per-plant breakdown */}
                <div style={cardStyle}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                        {t('supplyChain.allSitesByPlant', 'By Plant')}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                            <tr style={{ color: '#64748b' }}>
                                <th style={{ textAlign: 'left', paddingBottom: 6, fontWeight: 600 }}>{t('common.plant', 'Plant')}</th>
                                <th style={{ textAlign: 'right', paddingBottom: 6, fontWeight: 600 }}>{t('supplyChain.allSitesInvValue', 'Inv. Value')}</th>
                                <th style={{ textAlign: 'right', paddingBottom: 6, fontWeight: 600 }}>{t('supplyChain.allSitesMTD', 'MTD Spend')}</th>
                                <th style={{ textAlign: 'right', paddingBottom: 6, fontWeight: 600 }}>{t('supplyChain.allSitesOpenCol', 'Open')}</th>
                                <th style={{ textAlign: 'right', paddingBottom: 6, fontWeight: 600, color: '#ef4444' }}>{t('supplyChain.allSitesOverdueCol', 'Late')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(data?.spendByPlant || []).map(row => (
                                <tr key={row.plantId} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '6px 0', color: '#f1f5f9' }}>{row.plantId.replace(/_/g, ' ')}</td>
                                    <td style={{ textAlign: 'right', color: '#10b981' }}>{fmt(row.inventoryValue)}</td>
                                    <td style={{ textAlign: 'right', color: '#94a3b8' }}>{fmt(row.mtdSpend)}</td>
                                    <td style={{ textAlign: 'right', color: '#f59e0b' }}>{row.openOrders}</td>
                                    <td style={{ textAlign: 'right', color: row.overdueOrders > 0 ? '#ef4444' : '#475569' }}>{row.overdueOrders}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Top vendors by open PO spend */}
                <div style={cardStyle}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                        {t('supplyChain.allSitesTopVendors', 'Top Vendors — Open PO Spend')}
                    </div>
                    {(data?.topSpend || []).length === 0
                        ? <div style={{ color: '#475569', fontSize: '0.78rem' }}>{t('supplyChain.allSitesNoVendors', 'No open purchase orders across sites.')}</div>
                        : (data.topSpend).map((v, i) => (
                            <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ fontSize: '0.7rem', color: '#475569', width: 16 }}>{i + 1}</span>
                                <span style={{ flex: 1, fontSize: '0.82rem', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                                <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>{fmt(v.spend)}</span>
                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{v.orders} PO{v.orders !== 1 ? 's' : ''}</span>
                            </div>
                        ))
                    }
                </div>
            </div>

            {/* Worst Performers Vendor Scorecard */}
            {scorecardData && scorecardData.worstPerformers && scorecardData.worstPerformers.length > 0 && (
                <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }} />
                            {t('supplyChain.worstPerformers', 'Corporate Rollup: Vendor Risk & Underperformance')}
                        </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                            <tr style={{ color: '#64748b' }}>
                                <th style={{ textAlign: 'left', paddingBottom: 6, fontWeight: 600 }}>{t('common.vendor', 'Vendor')}</th>
                                <th style={{ textAlign: 'left', paddingBottom: 6, fontWeight: 600 }}>{t('common.plants', 'Plants')}</th>
                                <th style={{ textAlign: 'right', paddingBottom: 6, fontWeight: 600 }}>{t('supplyChain.totalSpend', 'Spend Volume')}</th>
                                <th style={{ textAlign: 'right', paddingBottom: 6, fontWeight: 600 }}>{t('supplyChain.onTimeDel', 'On-Time Delivery')}</th>
                                <th style={{ textAlign: 'right', paddingBottom: 6, fontWeight: 600 }}>{t('supplyChain.avgLead', 'Avg Lead Time')}</th>
                                <th style={{ textAlign: 'right', paddingBottom: 6, fontWeight: 600 }}>{t('supplyChain.qualityDefects', 'Quality Defects')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {scorecardData.worstPerformers.map(v => (
                                <tr key={v.vendorId} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '6px 0', color: '#f1f5f9', fontWeight: 600 }}>{v.vendorName}</td>
                                    <td style={{ color: '#94a3b8', fontSize: '0.7rem' }}>
                                        {v.plants.map(p => p.replace(/_/g, ' ')).join(', ')}
                                    </td>
                                    <td style={{ textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{fmt(v.spend)}</td>
                                    <td style={{ textAlign: 'right', color: v.onTimeDeliveryRate < 80 ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>
                                        {v.onTimeDeliveryRate != null ? `${v.onTimeDeliveryRate}%` : 'N/A'}
                                    </td>
                                    <td style={{ textAlign: 'right', color: v.avgActualLeadTime > v.avgPromisedLeadTime ? '#ef4444' : '#94a3b8' }}>
                                        {v.avgActualLeadTime != null ? `${v.avgActualLeadTime}d` : 'N/A'}
                                        {v.avgPromisedLeadTime != null && <span style={{ fontSize: '0.65rem', color: '#64748b', marginLeft: 4 }}>(vs {v.avgPromisedLeadTime}d)</span>}
                                    </td>
                                    <td style={{ textAlign: 'right', color: v.qualityDefectCount > 0 ? '#ef4444' : '#475569', fontWeight: v.qualityDefectCount > 0 ? 600 : 400 }}>
                                        {v.qualityDefectCount}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function SupplyChainView({ plantId }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState(() => localStorage.getItem('PF_SC_TAB') || 'inventory');
    const setTabSave = t => { setTab(t); localStorage.setItem('PF_SC_TAB', t); };

    const isAllSites = !plantId || plantId === 'all_sites';

    // Maps local tab id → supply-chain tour key
    const TAB_TOUR_MAP = {
        inventory:  'inventory',
        po:         'purchase-orders',
        receiving:  'receiving-log',
        suppliers:  'suppliers',
    };

    const tabs = [
        { id: 'inventory', label: t('supplyChain.tabInventory', 'Inventory'), icon: Package },
        { id: 'po', label: t('supplyChain.tabPurchaseOrders', 'Purchase Orders'), icon: ShoppingCart },
        { id: 'receiving', label: t('supplyChain.tabReceivingLog', 'Receiving Log'), icon: Truck },
        { id: 'suppliers', label: t('supplyChain.tabSuppliers', 'Suppliers'), icon: Building2 },
    ];

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)' }}>
            {/* Header */}
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: 20, alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ShoppingCart size={24} /> {t('supplyChain.pageTitle', 'Supply Chain & Ingredient Inventory')}
                </h2>
                <div style={{ width: '2px', height: 30, background: 'var(--glass-border)' }} />
                <div className="nav-pills no-print">
                    {tabs.map(({ id, label, icon: Icon }) => (
                        <button key={id} onClick={() => setTabSave(id)} className={`btn-nav ${tab === id ? 'active' : ''}`}>
                            <Icon size={14} style={{ marginRight: 5, verticalAlign: 'text-bottom' }} />{label}
                        </button>
                    ))}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <TakeTourButton tourId="supply-chain" nestedTab={TAB_TOUR_MAP[tab]} />
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{plantId?.replace(/_/g, ' ')}</span>
                </div>
            </div>

            {/* All-Sites Cross-Plant Rollup or per-plant tabs */}
            {isAllSites ? (
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px' }}>
                    <AllSitesView />
                </div>
            ) : (
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px' }}>
                    {tab === 'inventory' && <InventoryTab plantId={plantId} />}
                    {tab === 'po' && <PurchaseOrdersTab plantId={plantId} />}
                    {tab === 'receiving' && <ReceivingTab plantId={plantId} />}
                    {tab === 'suppliers' && <SuppliersTab plantId={plantId} />}
                </div>
            )}
        </div>
    );
}
