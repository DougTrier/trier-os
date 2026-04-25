// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
import React from 'react';
import { useTranslation } from '../i18n/index.jsx';
import { formatDate } from '../utils/formatDate';

/**
 * Trier OS — Unified Print Engine (PrintEngine.jsx)
 * ===================================================
 * Single-component print renderer for all 80+ document types in Trier OS.
 * Triggered by window.triggerTrierPrint(type, data) → App.jsx mounts this
 * in a .print-only-wrapper portal div → window.print() fires after 1 second.
 *
 * HOW TO ADD A NEW PRINT TYPE:
 *   1. Add a case to the switch statement below.
 *   2. Compose the content using renderHeader(), renderTable(), renderSignatures().
 *   3. Call window.triggerTrierPrint('your-type', payload) from the view.
 *   4. Test by opening the relevant view and clicking the print button.
 *
 * PRINT FLOW (App.jsx → PrintEngine):
 *   window.triggerTrierPrint(type, data)
 *     └── dispatches CustomEvent 'trier-print'
 *         └── App.jsx catches event, sets printJob state
 *             └── renders <PrintEngine type data> in .print-only-wrapper div
 *                 └── setTimeout(window.print, 1000) — gives React time to render
 *                     └── @media print CSS hides #root, shows .print-only-wrapper
 *
 * PRINT TYPES HANDLED (selected):
 *   work-order          — Full WO packet with labor, parts, tasks, signatures
 *   pm-schedule         — PM schedule card with frequency and procedure links
 *   asset               — Asset datasheet with meter history and cost summary
 *   parts               — Parts list or single-part label
 *   safety-permit       — Permit-to-work (hot work, confined space, LOTO, etc.)
 *   safety-incident     — Incident report with actions and witness statements
 *   manual              — Full Operational Intelligence Manual (cover + all chapters)
 *   fleet-vehicle       — Vehicle service record
 *   loto-permit         — Lockout/Tagout isolation permit
 *   contractor          — Contractor profile with certs and job history
 *   shift-log           — Shift handoff log for a date range
 *   ...and 70+ more (see switch statement below)
 *
 * STYLING: All print styles are in src/index.css under @media print.
 * The component uses className-based classes (print-data-table, print-panel,
 * print-section-header) rather than inline styles where possible, so that
 * print layout can be tuned without touching component JSX.
 *
 * BRANDING: The branding prop contains { documentLogo, dashboardLogo } URLs.
 * documentLogo is preferred on printed documents (optimized for white paper).
 * Falls back to /assets/TrierLogoPrint.png if not configured.
 *
 * @param {string} type         — Print type identifier (see cases below)
 * @param {*}      data         — Payload shape varies by type
 * @param {string} plantLabel   — Human-readable plant name for document header
 * @param {object} branding     — { documentLogo: url|null, dashboardLogo: url|null }
 */
// Renders a QR code from text using the local `qrcode` package — no external API calls.
const AsyncQRImage = ({ text, size, style, alt }) => {
    const [dataUrl, setDataUrl] = React.useState(null);
    React.useEffect(() => {
        if (!text) return;
        import('qrcode').then(QRCode =>
            QRCode.default.toDataURL(text, { margin: 1, width: size || 200, color: { dark: '#000000FF', light: '#FFFFFFFF' } })
                .then(url => setDataUrl(url))
                .catch(e => console.error('QR generation failed:', e))
        );
    }, [text, size]);
    if (!dataUrl) return (
        <div style={{ ...style, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#94a3b8' }}>
            QR…
        </div>
    );
    return <img src={dataUrl} alt={alt || 'QR'} style={style} />;
};

const PrintEngine = ({ type, data, plantLabel, branding = { dashboardLogo: null, documentLogo: null } }) => {
    const { t } = useTranslation();
    const [qrCode, setQrCode] = React.useState(null);

    React.useEffect(() => {
        if (type === 'employee-badge' && data?.name) {
            import('qrcode').then(QRCode => {
                QRCode.default.toDataURL(data.name, { margin: 0, width: 64, color: { dark: '#000000FF', light: '#FFFFFFFF' } })
                    .then(url => setQrCode(url))
                    .catch(e => console.error("QR Code failed:", e));
            });
        }
        if (type === 'qr-sticker' && data) {
            const qrText = (data.url || data.unit || 'TrierQR').toString();
            import('qrcode').then(QRCode => {
                QRCode.default.toDataURL(qrText, { margin: 1, width: 200, color: { dark: '#000000FF', light: '#FFFFFFFF' } })
                    .then(url => setQrCode(url))
                    .catch(e => console.error("QR Code failed:", e));
            });
        }
    }, [type, data]);

    if (!data) return null;

    const renderHeader = (title, docId) => (
        <div className="print-header-unified">
            <div className="print-brand-row">
                <img src={branding.documentLogo || "/assets/TrierLogoPrint.png"} alt="Trier OS" className="print-logo-main" />
            </div>
            <div className="print-title-row">
                <h1 className="print-doc-title">{title}</h1>
                <div className="print-doc-meta">
                    <div><strong>{t('print.engine.location')}</strong> {plantLabel || 'CORPORATE'}</div>
                    <div><strong>{t('print.engine.date')}</strong> {formatDate(new Date())}</div>
                    <div><strong>{t('print.engine.docId')}</strong> {docId}</div>
                </div>
            </div>
        </div>
    );

    const renderSectionHeader = (title) => (
        <div className="print-section-header">
            <h3>{title}</h3>
        </div>
    );

    const renderProperties = (props) => (
        <div className="print-panel">
            <div className="print-grid-2">
                {props.map((p, i) => (
                    <div key={i} className="print-detail-row">
                        <span className="print-label">{p.label}:</span>
                        <span className="print-value">{p.value || '--'}</span>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderDescription = (text) => (
        <div className="print-panel">
            <div className="print-text-block" style={{ whiteSpace: 'pre-wrap' }}>
                {text || 'No additional notes provided.'}
            </div>
        </div>
    );


    const renderTable = (headers, rows, emptyMsg = "No records found.") => (
        <table className="print-data-table">
            <thead>
                <tr>
                    {headers.map((h, i) => <th key={i}>{h}</th>)}
                </tr>
            </thead>
            <tbody>
                {rows.length > 0 ? rows.map((row, i) => (
                    <tr key={i}>
                        {row.map((cell, j) => <td key={j} style={{ whiteSpace: 'pre-wrap', verticalAlign: 'top' }}>{cell}</td>)}
                    </tr>
                )) : (

                    <tr>
                        <td colSpan={headers.length} style={{ textAlign: 'center', padding: '20px' }}>{emptyMsg}</td>
                    </tr>
                )}
            </tbody>
        </table>
    );

    const renderSignatures = (labels) => (
        <div className="print-signature-grid">
            {labels.map((l, i) => (
                <div key={i} className="print-signature-box">
                    <div className="signature-line"></div>
                    <div className="signature-label">{l}</div>
                </div>
            ))}
        </div>
    );

    // Document assembling logic
    let content = null;
    switch (type) {
        case 'employee-badge': {
            content = (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '40px' }}>
                    <div style={{ border: '2px solid #000', borderRadius: '12px', width: '3.375in', height: '2.125in', padding: '15px', position: 'relative', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }}>
                            <img src={branding.documentLogo || "/assets/TrierLogoPrint.png"} alt="Trier OS" style={{ height: '30px' }} />
                            <div style={{ textAlign: 'right', fontSize: '0.6rem', fontWeight: 600, color: '#666' }}>
                                {plantLabel || data?.plant || 'CORPORATE'}<br/>
                                AUTHORIZED PERSONNEL
                            </div>
                        </div>
                        <div style={{ flex: 1, display: 'flex', gap: 15 }}>
                            <div style={{ width: '60px', height: '60px', borderRadius: '4px', border: '1px solid #ccc', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ fontSize: '24px', color: '#999' }}>👤</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1.1 }}>{data?.name || 'Employee'}</div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', marginTop: 4 }}>{data?.role?.replace('_', ' ') || 'Staff'}</div>
                            </div>
                        </div>
                        <div style={{ marginTop: 'auto', borderTop: '2px solid #000', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600 }}>ID: {data?.name}</div>
                            {qrCode ? (
                                <img src={qrCode} alt="Employee QR" style={{ width: 40, height: 40 }} />
                            ) : (
                                <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', letterSpacing: '2px' }}>*{data?.name}*</div>
                            )}
                        </div>
                    </div>
                    <div style={{ marginTop: 20, fontSize: '0.8rem', color: '#666', maxWidth: '3.375in', textAlign: 'center' }}>
                        Cut along the borders and insert into a standard 2.125" x 3.375" ID badge holder. This badge can be scanned by any standard factory laser scanner.
                    </div>
                </div>
            );
            break;
        }
        case 'qr-sticker': {
            content = (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '40px' }}>
                    <div style={{ border: '2px solid #000', borderRadius: '8px', padding: '15px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box' }}>
                        <div style={{ marginBottom: 10 }}>
                            <img src={branding.documentLogo || "/assets/TrierLogoPrint.png"} alt="Trier OS" style={{ height: '30px' }} />
                        </div>
                        {qrCode ? (
                            <img src={qrCode} alt="QR Code sticker" style={{ width: 180, height: 180 }} />
                        ) : (
                            <div style={{ width: 180, height: 180, border: '1px dashed #ccc', display:'flex', alignItems:'center', justifyContent:'center' }}>Rendering QR...</div>
                        )}
                        <div style={{ marginTop: 10, fontSize: '1rem', fontWeight: 800, textAlign: 'center' }}>
                            {data?.unit || 'SCANNABLE ITEM'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#666', marginTop: 4 }}>SCAN WITH TRIER OS</div>
                    </div>
                    <div style={{ marginTop: 20, fontSize: '0.8rem', color: '#666', maxWidth: '3in', textAlign: 'center' }}>
                        Print this on sticker paper and affix it to the physical asset/location. 
                    </div>
                </div>
            );
            break;
        }
        case 'vendor-setup': {
            content = (
                <>
                    {renderHeader('Vendor API Onboarding Guide', 'VENDOR-API')}
                    {renderSectionHeader('System Overview')}
                    {renderDescription('Trier OS provides a secure, headless API for external vendors to receive Requests for Quote (RFQs), submit pricing, and communicate with your supply chain team—directly circumventing email bottlenecks.')}

                    {renderSectionHeader('1. Generate Vendor Access Credentials')}
                    {renderDescription('Each vendor requires an exclusive 256-bit access token. To generate one, navigate to the main Master Catalog -> Vendors module, select an approved vendor, and click Grant Portal Access. The token will then appear in the Vendor Access tab.')}

                    {renderSectionHeader('2. Connecting to the API')}
                    {renderDescription('Vendors must configure their ERP systems (e.g., SAP, Oracle, NetSuite) or custom B2B scripts to interface with the Trier OS Vendor Edge API.')}
                    {renderProperties([
                        { label: 'Base URL', value: 'https://[your-trier-os-server]/api/vendor-portal' },
                        { label: 'Authentication Header', value: 'x-vendor-token: <VENDOR_ACCESS_TOKEN>' }
                    ])}

                    {renderSectionHeader('3. Core Integration Workflows')}
                    {renderTable(['Workflow', 'Endpoint', 'Description'], [
                        ['A. RFQ Polling & Retrieval', 'GET /rfq', 'Vendors call this endpoint periodically to pull a list of open RFQs assigned specifically to their Vendor ID. It returns full header data including Due Dates and Line Items.'],
                        ['B. Submitting a Quote (Pricing)', 'PUT /rfq/:id/items/:itemId', 'To submit pricing, vendors push an update payload containing QuotedPrice and LeadTimeDays to each line item inside the target RFQ. Once submitted, the RFQ shifts to "Quoted" status for internal review.'],
                        ['C. Threaded Vendor Messaging', 'POST /messages', 'For discrepancies regarding lead times, specifications, or stock availability, vendors can POST directly to the messaging endpoint. All messages thread directly into the "Messages" tab within this internal portal for your Supply Chain team to review and respond.']
                    ])}
                </>
            );
            break;
        }
        case 'api-setup': {
            content = (
                <>
                    {renderHeader('Internal API Connectivity Guide', 'INT-API')}
                    {renderSectionHeader('System Overview')}
                    {renderDescription('Trier OS acts as the central intelligence hub for your plant. This guide outlines exactly how to configure the internal Edge Agent to pull data synchronously from your legacy on-premises databases, enterprise systems, and live PLCs.')}

                    {renderSectionHeader('1. ERP & Order Management (REST API)')}
                    {renderDescription('Integrate with enterprise systems like SAP, Microsoft Dynamics 365, or Prophet 21. Trier OS acts as the client, polling the target URL on a configured interval to seamlessly retrieve daily production orders into your Planning Grid.')}
                    {renderProperties([
                        { label: 'Host', value: 'https://sap-gateway.internal.dairy:8443/odata/v2/ProductionOrders?$filter=Date eq \'Today\'' },
                        { label: 'Poll Interval (sec)', value: '3600' },
                        { label: 'Auth Type', value: 'Bearer' },
                        { label: 'Bearer Token', value: 'eyJh...xxxx' }
                    ])}

                    {renderSectionHeader('2. SCADA / PLC (Modbus TCP)')}
                    {renderDescription('Trier OS queries legacy industrial systems directly across the network using native Modbus TCP. The internal Edge Agent mounts a dedicated polling thread per PLC to poll mission-critical statuses: temperatures, RPMs, and flow rates.')}
                    {renderProperties([
                        { label: 'Host', value: '192.168.10.50' },
                        { label: 'Port', value: '502' },
                        { label: 'Protocol', value: 'Modbus TCP' },
                        { label: 'Usage', value: 'Target exact internal holding registers inside the "Equipment Intelligence" module. (e.g. Map Holding Register 40001 directly to Silo B Temperature thresholds).' }
                    ])}

                    {renderSectionHeader('3. LIMS / Lab Systems (File Drop / SFTP)')}
                    {renderDescription('For unmodernized databases lacking standard REST layers (like legacy POMS Dairy or LabVantage SQL), Trier OS supports dropping encrypted CSV telemetry down to a secure FTP directory.')}
                    {renderProperties([
                        { label: 'Host', value: '10.0.5.110' },
                        { label: 'Port', value: '22' },
                        { label: 'Protocol', value: 'SFTP' },
                        { label: 'Database/Path', value: '/outbound/daily_butterfat_lab_results.csv' }
                    ])}
                </>
            );
            break;
        }
        case 'logistics-intercept': {
            const isAsset = data?.type === 'asset';
            const plantLabel = (data?.plant || 'Unknown').replace(/_/g, ' ');
            content = (
                <>
                    {renderHeader(`Logistics Intercept - ${plantLabel}`, `PR1-${data?.assetId || 'UNKNOWN'}`)}
                    {renderSectionHeader(`${isAsset ? 'Asset' : 'Part'} Details`)}
                    {renderProperties([
                        { label: 'Plant Network Location', value: plantLabel },
                        { label: 'ID Code', value: data?.assetId || '' },
                        { label: 'Description', value: data?.description || '' },
                        { label: 'Type', value: (data?.type || '').toUpperCase() },
                        { label: 'Operational Status', value: data?.status || 'In Production' },
                        { label: 'Availability', value: data?.availability || '' },
                        ...(data?.model ? [{ label: 'Equipment Model', value: data.model }] : []),
                        ...(data?.partNumber ? [{ label: 'OEM Part Number', value: data.partNumber }] : []),
                        ...(data?.serial ? [{ label: 'Serial Number', value: data.serial }] : [])
                    ])}
                    
                    {renderSectionHeader('Logistics Intercept Action')}
                    {renderDescription('This read-only record was pulled from a live production server. To request priority transport for emergency maintenance operations, select the PR1 requisition channel. Edit capabilities are restricted to the originating local plant administrator.')}
                    
                    {renderSignatures(['Requesting Manager', 'Approving Plant Admin', 'Logistics Carrier'])}
                </>
            );
            break;
        }
        case 'downtime-logs': {
            const isDetail = data.length > 0 && typeof data[0].woNumber !== 'undefined';
            content = (
                <>
                    {renderHeader(
                        isDetail ? `Asset Downtime Log: ${data[0]?.assetId || ''}` : 'Enterprise Downtime Logs',
                        isDetail ? 'RPT-DT-01A' : 'RPT-DT-01'
                    )}
                    {renderSectionHeader(isDetail ? 'Detailed Downtime Events' : 'Aggregated Downtime by Asset')}
                    
                    {isDetail ? (
                        renderTable(
                            ['Work Order', 'Asset ID', 'Description', 'Downtime', 'Date Opened', 'Date Completed'],
                            data.map(d => [
                                d.woNumber || d.woId || '--',
                                d.assetId || '--',
                                d.woDescription || '--',
                                `${d.downtimeHrs || 0}h`,
                                formatDate(d.dateOpened) || '--',
                                formatDate(d.dateCompleted) || '--'
                            ])
                        )
                    ) : (
                        renderTable(
                            ['Asset ID', 'Description', 'Events', 'Total Downtime', 'Avg Downtime', 'Severity', 'Last Event'],
                            data.map(d => [
                                d.assetId || '--',
                                d.assetName || '--',
                                (Math.round(d.woCount) || 0).toString(),
                                `${d.totalDowntimeHrs || 0}h`,
                                `${d.avgDowntimeHrs || 0}h`,
                                (d.totalDowntimeHrs >= 100) ? 'CRITICAL' : (d.totalDowntimeHrs >= 40) ? 'AT RISK' : 'STABLE',
                                formatDate(d.lastDowntimeDate) || '--'
                            ])
                        )
                    )}
                    
                    {renderSignatures(['Reliability Engineer', 'Plant Manager'])}
                </>
            );
            break;
        }
        case 'parts-used': {
            const isDetail = data.length > 0 && typeof data[0].woNumber !== 'undefined';
            content = (
                <>
                    {renderHeader(
                        isDetail ? `Asset Parts Log: ${data[0]?.assetId || ''}` : 'Enterprise Parts Usage Logs',
                        isDetail ? 'RPT-PU-01A' : 'RPT-PU-01'
                    )}
                    {renderSectionHeader(isDetail ? 'Detailed Parts Consumption' : 'Aggregated Parts Usage by Asset')}
                    
                    {isDetail ? (
                        renderTable(
                            ['Part ID', 'Description', 'Asset ID', 'Work Order', 'Qty', 'Unit Cost', 'Date Used'],
                            data.map(d => [
                                d.partId || '--',
                                d.partName || '--',
                                d.assetId || '--',
                                d.woNumber || '--',
                                (d.qty || 0).toString(),
                                '$' + (Number(d.unitCost) || 0).toFixed(2),
                                formatDate(d.useDate) || '--'
                            ])
                        )
                    ) : (
                        renderTable(
                            ['Asset ID', 'Asset Description', 'Unique Parts', 'Total Qty', 'Total Cost', 'Events', 'Last Used'],
                            data.map(d => [
                                d.assetId || '--',
                                d.assetName || '--',
                                (d.uniqueParts || 0).toString(),
                                (d.totalQty || 0).toString(),
                                '$' + (Number(d.totalCost) || 0).toFixed(2),
                                (d.woCount || 0).toString(),
                                formatDate(d.lastUsedDate) || '--'
                            ])
                        )
                    )}
                    
                    {renderSignatures(['Supply Chain Manager', 'Plant Manager'])}
                </>
            );
            break;
        }
        case 'digital-twin': {
            content = (
                <>
                    {renderHeader(`Digital Twin: ${data.assetDescription || data.assetId}`, data.schematic?.Label || 'Schematic')}
                    
                    {renderSectionHeader('Visual Schematic')}
                    <div style={{ position: 'relative', border: '1px solid #ccc', margin: '20px 0', padding: '10px', background: '#f8f9fa' }}>
                        <img 
                            src={data.schematic?.ImagePath} 
                            style={{ width: '100%', maxHeight: '600px', objectFit: 'contain', display: 'block' }} 
                            alt="Schematic" 
                        />
                        {data.pins && data.pins.map((pin, i) => (
                            <div key={i} style={{
                                position: 'absolute',
                                left: `${pin.XPercent}%`,
                                top: `${pin.YPercent}%`,
                                transform: 'translate(-50%, -50%)',
                                width: '24px', height: '24px',
                                borderRadius: '50%',
                                background: pin.HealthStatus === 'critical' ? '#ef4444' : pin.HealthStatus === 'warning' ? '#f59e0b' : '#10b981',
                                border: '2px solid white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontSize: '11px', fontWeight: 'bold',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                            }}>
                                {i + 1}
                            </div>
                        ))}
                    </div>

                    {data.pins && data.pins.length > 0 && (
                        <>
                            {renderSectionHeader('Pin Registry')}
                            {renderTable(
                                ['#', 'Label', 'Type', 'Status', 'Notes'],
                                data.pins.map((pin, i) => [
                                    (i + 1).toString(),
                                    pin.PinLabel,
                                    pin.PinType,
                                    pin.HealthStatus ? pin.HealthStatus.toUpperCase() : 'UNKNOWN',
                                    pin.Notes || '--'
                                ])
                            )}
                        </>
                    )}
                </>
            );
            break;
        }
        case 'utility-detail':
            const uIcons = {
                Electricity: '⚡ ',
                Water: '💧 ',
                Gas: '🔥 '
            };
            content = (
                <>
                    {renderHeader(`${uIcons[data.Type] || ''}${data.Type} Utility Reading`, data.ID || 'NEW')}
                    
                    {renderSectionHeader('Reading Details')}
                    {renderProperties([
                        { label: 'Utility Type', value: data.Type },
                        { label: 'Reading Date', value: formatDate(data.ReadingDate) },
                        { label: 'Meter Reading', value: `${Number(data.MeterReading).toLocaleString()} ${data.Type === 'Electricity' ? 'kWh' : data.Type === 'Water' ? 'GAL' : 'THERM'}` },
                        { label: 'Cost Per Unit', value: data.CostPerUnit ? `$${Number(data.CostPerUnit).toFixed(4)}` : '--' },
                        { label: 'Total Bill Amount', value: data.BillAmount ? `$${Number(data.BillAmount).toLocaleString()}` : '--' },
                    ])}

                    {renderSectionHeader('Notes & Observations')}
                    {renderDescription(data.Notes || 'No notes provided.')}

                    {data.SupplierName && (
                        <>
                            {renderSectionHeader('Supplier Logistics')}
                            {renderProperties([
                                { label: 'Supplier Name', value: data.SupplierName },
                                { label: 'Address', value: data.SupplierAddress },
                                { label: 'City', value: data.SupplierCity },
                                { label: 'State & Zip', value: [data.SupplierState, data.SupplierZip].filter(Boolean).join(' ') || '--' }
                            ])}
                        </>
                    )}

                    {renderSectionHeader('Authorization')}
                    {renderSignatures(['Facilities Manager', 'Date Review'])}
                </>
            );
            break;

        case 'utilities-catalog-internal':
            if (data.type && data.type.startsWith('utilities')) {
                const uIcons = {
                    Electricity: '⚡ ',
                    Water: '💧 ',
                    Gas: '🔥 '
                };
                content = (
                    <>
                        {renderHeader(`Utility Intelligence Report — ${data.logFilter !== 'All' ? data.logFilter : 'All Sites'}`, 'REPORT')}
                        {renderSectionHeader('Utility Aggregates')}
                        {renderProperties([
                            { label: 'Total Electricity', value: `$${Number(data.stats.Electricity.cost).toLocaleString()} (${Number(data.stats.Electricity.consumption).toLocaleString()} kWh)` },
                            { label: 'Total Water', value: `$${Number(data.stats.Water.cost).toLocaleString()} (${Number(data.stats.Water.consumption).toLocaleString()} GAL)` },
                            { label: 'Total Gas', value: `$${Number(data.stats.Gas.cost).toLocaleString()} (${Number(data.stats.Gas.consumption).toLocaleString()} THERM)` }
                        ])}

                        {data.insights && data.insights.length > 0 && (
                            <>
                                {renderSectionHeader('Strategic Insights')}
                                <div className="print-grid-2">
                                    {data.insights.map((insight, idx) => (
                                        <div key={idx} style={{ border: '1px solid #e2e8f0', padding: 8, marginBottom: 8 }}>
                                            <strong>{insight.title}</strong>
                                            <p style={{ margin: 0, fontSize: '0.8rem' }}>{insight.message}</p>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {renderSectionHeader('Historical Records')}
                        {renderTable(
                            ['Date', 'Type', 'Supplier', 'Reading', 'Total Bill', 'Notes'],
                            (data.items || []).map(r => [
                                formatDate(r.ReadingDate),
                                `${uIcons[r.Type] || ''}${r.Type}`,
                                r.SupplierName || '--',
                                `${Number(r.MeterReading).toLocaleString()}`,
                                `$${Number(r.BillAmount).toLocaleString()}`,
                                r.Notes || '--'
                            ])
                        )}
                        {renderSectionHeader('Authorization')}
                        {renderSignatures(['Facilities Director', 'Date'])}
                    </>
                );
            }
            break;

        case 'tech-workload':
            content = (
                <>
                    {renderHeader('Technician Workload Analysis', 'TECH-LOAD')}
                    {renderSectionHeader('Facility Summary')}
                    {renderProperties([
                        { label: 'Total Techs', value: data.data?.technicians?.length || 0 },
                        { label: 'Active Work Orders', value: data.data?.summary?.totalActive || 0 },
                        { label: 'Completed (30d)', value: data.data?.summary?.totalCompleted || 0 },
                        { label: 'Overloaded Techs', value: data.data?.summary?.overloaded || 0 }
                    ])}
                    {renderSectionHeader('Technician Distribution')}
                    {renderTable(
                        ['Technician', 'Active Load', 'Capacity %', 'PMs', 'Emergency'],
                        (data.data?.technicians || []).map(t => [
                            t.name,
                            `${t.activeCount} / ${data.data?.capacityThreshold || 8}`,
                            `${Math.round(Math.min((t.activeCount / (data.data?.capacityThreshold || 8)) * 100, 100))}%`,
                            t.pmCount,
                            t.emergencyCount
                        ])
                    )}
                </>
            );
            break;

        case 'tech-workload-detail':
            content = (
                <>
                    {renderHeader(`Technician Profile: ${data.tech?.name}`, `TECH-${data.tech?.name?.replace(/[^a-zA-Z0-9]/g, '')}`)}
                    {renderSectionHeader('Load Capacity')}
                    {renderProperties([
                        { label: 'Active Work Orders', value: data.tech?.activeCount || 0 },
                        { label: 'Safe Capacity Limit', value: data.MAX_CAPACITY || 8 },
                        { label: 'Overload Status', value: (data.tech?.activeCount || 0) > (data.MAX_CAPACITY || 8) ? 'OVERLOADED' : 'HEALTHY' },
                        { label: 'Completed (30d)', value: data.tech?.completedCount || 0 }
                    ])}
                    
                    {renderSectionHeader('Assigned Work Queue')}
                    {renderTable(
                        ['Type', 'WO #', 'Description', 'Status'],
                        (data.tech?.workOrders || []).map(w => [
                            w.type === 'emergency' ? '🚨 Emg' : w.type === 'pm' ? '🔧 PM' : '📋 WO',
                            w.woNumber || w.id,
                            w.description,
                            w.status
                        ])
                    )}
                </>
            );
            break;

        case 'asset':
            content = (
                <>
                    {renderHeader('Asset Specification Sheet', `AST-${data.ID}`)}
                    {renderSectionHeader('Core Inventory Properties')}
                    {renderProperties([
                        { label: 'Asset ID', value: data.ID },
                        { label: 'Description', value: data.Description },
                        { label: 'Category', value: data.AssetType },
                        { label: 'Location', value: data.LocationID },
                        { label: 'Department', value: data.DepartID },
                        { label: 'Status', value: data.Active ? 'ACTIVE' : 'INACTIVE' }
                    ])}
                    {renderSectionHeader('Technical Specifications')}
                    {renderProperties([
                        { label: 'Manufacturer', value: data.Manufacturer },
                        { label: 'Model Number', value: data.Model },
                        { label: 'Serial Number', value: data.Serial },
                        { label: 'Install Date', value: formatDate(data.InstDate) },
                        { label: 'Purchase Date', value: formatDate(data.PurchDate) },
                        { label: 'Vendor', value: data.VendorID }
                    ])}
                    {renderSectionHeader('Asset Notes & Comments')}
                    {renderDescription(data.Comment)}
                    {renderSectionHeader('Fleet Audit Verification')}
                    {renderSignatures(['Registered Inspector Name', 'Date of Fleet Audit'])}
                </>
            );
            break;
        case 'inspection':
            content = (
                <>
                    {renderHeader('Compliance Inspection Worksheet', `INSP-${data.id || data.ID || ''}`)}
                    {renderSectionHeader('Inspection Information')}
                    {renderProperties([
                        { label: 'Checklist', value: data.checklist_title },
                        { label: 'Framework', value: data.framework_name },
                        { label: 'Scheduled Date', value: data.scheduled_date },
                        { label: 'Inspector', value: data.inspector || 'Unassigned' },
                        { label: 'Status', value: data.status ? data.status.toUpperCase() : 'UNKNOWN' }
                    ])}

                    {renderSectionHeader('Inspection Items')}
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                                <th style={{ padding: '8px', width: '50px' }}>Item</th>
                                <th style={{ padding: '8px' }}>Description</th>
                                <th style={{ padding: '8px', width: '60px', textAlign: 'center' }}>Pass</th>
                                <th style={{ padding: '8px', width: '60px', textAlign: 'center' }}>Fail</th>
                                <th style={{ padding: '8px', width: '60px', textAlign: 'center' }}>N/A</th>
                                <th style={{ padding: '8px', width: '200px' }}>Notes / Corrective Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(data.findings || []).map((f, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '8px', fontWeight: 'bold' }}>#{i + 1}</td>
                                    <td style={{ padding: '8px' }}>{f.item_text}</td>
                                    <td style={{ padding: '8px', textAlign: 'center', fontSize: '1.2rem' }}>{f.status === 'pass' ? '☑' : '☐'}</td>
                                    <td style={{ padding: '8px', textAlign: 'center', fontSize: '1.2rem' }}>{f.status === 'fail' ? '☑' : '☐'}</td>
                                    <td style={{ padding: '8px', textAlign: 'center', fontSize: '1.2rem' }}>{f.status === 'na' ? '☑' : '☐'}</td>
                                    <td style={{ padding: '8px', fontStyle: 'italic', color: '#64748b' }}>{f.corrective_action || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {renderSectionHeader('Authorization and Signoff')}
                    {renderSignatures(['Inspector Signature', 'Date Completed'])}
                </>
            );
            break;

        case 'loss-event':
            content = (
                <>
                    {renderHeader('Product Loss Record', `LOSS-${data.ID || data.id || 'NEW'}`)}
                    {renderSectionHeader('Event Details')}
                    {renderProperties([
                        { label: 'Date', value: data.LogDate },
                        { label: 'Shift/Area', value: `${data.Shift || '--'} / ${data.Area || '--'}` },
                        { label: 'Product Type', value: data.ProductType || '--' },
                        { label: 'Loss Type', value: data.LossType || '--' },
                        { label: 'Loss Volume', value: `${data.Quantity || 0} ${data.Unit || 'gal'}` },
                        { label: 'Estimated Value', value: new Number((data.Quantity || 0) * (data.UnitValue || 0)).toLocaleString(undefined, { style: 'currency', currency: 'USD' }) }
                    ])}
                    {renderSectionHeader('Event Narrative / Notes')}
                    {renderDescription(data.Notes || 'No notes provided.')}
                    {renderSectionHeader('Authorization')}
                    {renderSignatures(['Operator / Entered By', 'Manager Review'])}
                </>
            );
            break;

        case 'lab-result':
            content = (
                <>
                    {renderHeader('Lab Quality Results', `LAB-${data.ID || data.id || 'NEW'}`)}
                    {renderSectionHeader('Sample Information')}
                    {renderProperties([
                        { label: 'Sample Date', value: data.SampleDate },
                        { label: 'Sample ID', value: data.SampleID || '--' },
                        { label: 'Sample Type', value: data.SampleType || '--' },
                        { label: 'Source Tank', value: data.SourceTank || '--' },
                        { label: 'Testing Tech', value: data.TestTech || '--' },
                        { label: 'Overall Status', value: data.pass || '--' }
                    ])}
                    {renderSectionHeader('Cryoscopy & Composition')}
                    {renderProperties([
                        { label: 'Freezing Point', value: data.CryoReading ? `${data.CryoReading}°H` : '--' },
                        { label: 'Water %', value: data.CryoWaterPct ? `${data.CryoWaterPct}%` : '--' },
                        { label: 'Fat %', value: data.FatPct ? `${data.FatPct}%` : '--' },
                        { label: 'Protein %', value: data.ProteinPct ? `${data.ProteinPct}%` : '--' },
                        { label: 'Lactose %', value: data.LactosePct ? `${data.LactosePct}%` : '--' },
                        { label: 'Solids Not Fat', value: data.SolidsNotFat ? `${data.SolidsNotFat}%` : '--' }
                    ])}
                    {renderSectionHeader('Bacteriology & Pathogens')}
                    {renderProperties([
                        { label: 'SPC', value: data.SPC || '--' },
                        { label: 'Coliform', value: data.Coliform || '--' },
                        { label: 'LPC', value: data.LPC || '--' },
                        { label: 'PI Count', value: data.PI || '--' },
                        { label: 'SCC (SoMatic)', value: data.SoMatic || '--' },
                        { label: 'Drug Residue', value: data.DrugTest || '--' },
                        { label: 'Listeria', value: data.Listeria || '--' },
                        { label: 'Salmonella', value: data.Salmonella || '--' },
                        { label: 'Action Req', value: data.ActionRequired || 'None' }
                    ])}
                    {renderSectionHeader('Authorization Logs')}
                    {renderSignatures(['Lab Technician', 'QA Manager Approval'])}
                </>
            );
            break;

        case 'quality-summary':
            content = (
                <>
                    {renderHeader('Quality & Loss Summary Report', `QSR-${new Date().toISOString().split('T')[0]}`)}
                    {renderSectionHeader('Executive Overview')}
                    {renderProperties([
                        { label: 'Period Covered', value: `Last ${data.periodDays || 90} Days` },
                        { label: 'Total Loss Events', value: data.productLoss?.events || 0 },
                        { label: 'Total Volume Lost', value: `${new Number(data.productLoss?.totalQty || 0).toLocaleString()} gal` },
                        { label: 'Product Loss ($)', value: new Number(data.productLoss?.totalLossValue || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' }) },
                        { label: 'Lab Failure Loss ($)', value: new Number(data.labQuality?.totalLabLoss || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' }) },
                        { label: 'Total Exposure Limit', value: new Number(data.totalLossValue || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' }) }
                    ])}
                    {data.productLoss?.byType?.length > 0 && (
                        <>
                            {renderSectionHeader('Loss Distribution by Type')}
                            {renderTable(
                                ['Loss Type', 'Event Count', 'Total Value'],
                                data.productLoss.byType.map(lk => [lk.LossType, lk.cnt, new Number(lk.val || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })])
                            )}
                        </>
                    )}
                    {data.labQuality && (
                        <>
                            {renderSectionHeader('Lab Testing Defect Summary')}
                            {renderProperties([
                                { label: 'Cryoscopy Failures', value: data.labQuality.cryo?.failures || 0 },
                                { label: 'Avg Added Water %', value: `${data.labQuality.cryo?.avgWaterPct || 0}%` },
                                { label: 'Bact/Pathogen Fails', value: data.labQuality.bacteria?.failures || 0 }
                            ])}
                        </>
                    )}
                </>
            );
            break;

        case 'work-order':
            content = (
                <>
                    {renderHeader('Work Order Authorization', `WO-${data.WorkOrderNumber || data.WONum}`)}
                    {renderSectionHeader('Assignment Details')}
                    {renderProperties([
                        { label: 'Work Order #', value: data.WorkOrderNumber || data.WONum },
                        { label: 'Asset ID', value: data.AstID || data.AssetID },
                        { label: 'Assigned To', value: data.AssignToID || data.AssignedTo },
                        { label: 'Priority', value: data.Priority },
                        { label: 'Schedule Date', value: formatDate(data.SchDate) },
                        { label: 'Status', value: data.StatusID || data.Status }
                    ])}
                    {renderSectionHeader('Scope of Work')}
                    {renderDescription(data.Description || data.Descr)}
                    {data.Comment && (
                        <>
                            <div style={{ marginTop: '10px', fontSize: '0.8rem', fontWeight: 'bold' }}>{t('print.engine.technicianNotesSafetyLog')}</div>
                            {renderDescription(data.Comment)}
                        </>
                    )}
                    {data._v2Tasks && data._v2Tasks.length > 0 && (
                        <>
                            {renderSectionHeader('Execution Checklist')}
                            {renderTable(
                                ['Step', 'Task Description', 'Mandatory Instructions'],
                                data._v2Tasks.map(tk => [tk.TskOrder, tk.StandardDescription || tk.TaskID, tk.DynamicText || tk.StandardTasks || '--'])
                            )}
                        </>
                    )}

                    {data._v2Objects && data._v2Objects.length > 0 && (
                        <>
                            {renderSectionHeader('Linked Technical Objects')}
                            {renderTable(
                                ['Object ID', 'Description', 'Technical Notes'],
                                data._v2Objects.map(obj => [obj.ObjID, obj.ObjectDescription || '--', obj.ObjectComment || '--'])
                            )}
                        </>
                    )}
                    {renderSectionHeader('Resource Consumption')}
                    {renderTable(
                        data._isLocked ? ['Part ID', 'Description', 'Mfr Part #', 'Qty Used'] : ['Part ID', 'Description', 'Mfr Part #', 'Qty Used', 'Unit Cost'],
                        (data._parts || []).map(p => {
                            const row = [p.PartID, p.PartDesc || p.Description, p.ManufNum || '--', p.ActQty || p.EstQty || 0];
                            if (!data._isLocked) row.push(new Number(p.UnitCost || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' }));
                            return row;
                        })
                    )}

                    {!data._isLocked && (data._labor?.length > 0 || data._misc?.length > 0) && (
                        <>
                            {renderSectionHeader('Additional Maintenance Costs')}
                            {data._labor?.length > 0 && renderTable(['Technician', 'Date', 'Reg Hr', 'OT Hr', 'Rate'], data._labor.map(l => [
                                l.LaborName || l.LaborID,
                                l.WorkDate,
                                l.HrReg,
                                l.HrOver,
                                new Number(l.PayReg || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })
                            ]))}
                            {data._misc?.length > 0 && renderTable(['Description', 'Date', 'Amount', 'Comment'], data._misc.map(m => [
                                m.Description,
                                m.WorkDate,
                                new Number(m.ActCost || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' }),
                                m.Comment || '--'
                            ]))}
                        </>
                    )}

                    {!data._isLocked && (data._labor?.length > 0 || data._parts?.length > 0 || data._misc?.length > 0) && (
                        <div style={{ 
                            marginTop: '20px', 
                            padding: '15px', 
                            background: '#f8fafc', 
                            border: '2px solid #e2e8f0', 
                            borderRadius: '8px'
                        }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '10pt', color: '#64748b', textTransform: 'uppercase' }}>{t('print.engine.costAccumulationSummary')}</h4>
                            <div className="print-grid-2">
                                <div className="print-detail-row">
                                    <span className="print-label">{t('print.engine.laborTotal')}</span>
                                    <span className="print-value">{new Number(data._labor?.reduce((acc, l) => acc + ((parseFloat(l.HrReg) || 0) * (parseFloat(l.PayReg) || 0) + (parseFloat(l.HrOver) || 0) * (parseFloat(l.PayOver) || 0)), 0) || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
                                </div>
                                <div className="print-detail-row">
                                    <span className="print-label">{t('print.engine.partsTotal')}</span>
                                    <span className="print-value">{new Number(data._parts?.reduce((acc, p) => acc + ((parseFloat(p.ActQty) || 0) * (parseFloat(p.UnitCost) || 0)), 0) || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
                                </div>
                                <div className="print-detail-row">
                                    <span className="print-label">{t('print.engine.miscexternal')}</span>
                                    <span className="print-value">{new Number(data._misc?.reduce((acc, m) => acc + (parseFloat(m.ActCost) || 0), 0) || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
                                </div>
                                <div className="print-detail-row" style={{ borderTop: '1px solid #cbd5e1', paddingTop: '5px', marginTop: '5px' }}>
                                    <span className="print-label" style={{ fontWeight: 'bold', color: '#1e293b' }}>{t('print.engine.grandTotal')}</span>
                                    <span className="print-value" style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '12pt' }}>
                                        {new Number(
                                            (data._labor?.reduce((acc, l) => acc + ((parseFloat(l.HrReg) || 0) * (parseFloat(l.PayReg) || 0) + (parseFloat(l.HrOver) || 0) * (parseFloat(l.PayOver) || 0)), 0) || 0) +
                                            (data._parts?.reduce((acc, p) => acc + ((parseFloat(p.ActQty) || 0) * (parseFloat(p.UnitCost) || 0)), 0) || 0) +
                                            (data._misc?.reduce((acc, m) => acc + (parseFloat(m.ActCost) || 0), 0) || 0)
                                        ).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                    {renderSectionHeader('Completion Certificate')}
                    {renderSignatures(['Technician Signature', 'Supervisor Approval'])}
                </>
            );
            break;

        case 'corp-analytics': {
            const { activeSection, plantLabel, summary, rankings, financial, opexData, risks, forecast, workforce } = data;
            const fmt = (v) => v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'K' : '$' + (v || 0).toFixed(0);
            const fmtN = (v) => Number(v || 0).toLocaleString();

            const secLabel = activeSection.charAt(0).toUpperCase() + activeSection.slice(1);
            content = (
                <>
                    {renderHeader(`Corporate Analytics — ${secLabel}`, 'ENT-RPT')}
                    
                    {activeSection === 'overview' && summary && (
                        <>
                            {renderSectionHeader('Executive Summary — Financial')}
                            {renderProperties([
                                { label: 'Operating Spend', value: fmt(summary.spend?.operating) },
                                { label: 'Grand Total (Ops + IT)', value: fmt(summary.spend?.grandTotal) },
                                { label: 'Labor Cost', value: fmt(summary.spend?.labor) },
                                { label: 'Parts Cost', value: fmt(summary.spend?.parts) },
                                { label: 'Misc/External', value: fmt(summary.spend?.misc) },
                                { label: 'IT CapEx', value: fmt(summary.spend?.itCapex) },
                                { label: 'Inventory On-Hand', value: fmt(summary.inventory?.totalValue) }
                            ])}
                            {renderSectionHeader('Operations')}
                            {renderProperties([
                                { label: 'Total Plants', value: String(summary.plants?.count || 0) },
                                { label: 'Total Work Orders', value: fmtN(summary.workOrders?.total) },
                                { label: 'Open WOs', value: fmtN(summary.workOrders?.open) },
                                { label: 'Overdue WOs', value: fmtN(summary.workOrders?.overdue) },
                                { label: 'Completion Rate', value: (summary.workOrders?.completionRate || 0) + '%' }
                            ])}
                        </>
                    )}

                    {activeSection === 'plants' && rankings && (
                        <>
                            {renderSectionHeader(`Plant Performance Rankings (${rankings.length} plants)`)}
                            {renderTable(
                                ['Rank', 'Plant', 'Score', 'Total WOs', 'Completed', 'Overdue', 'Rate', '30d Velocity', 'Assets', 'Inventory'],
                                rankings.map((p, i) => [
                                    '#' + (i + 1), p.label, String(p.score), fmtN(p.totalWOs), fmtN(p.completedWOs), String(p.overdueWOs),
                                    p.completionRate + '%', String(p.recentCompleted), fmtN(p.assets), fmt(p.inventoryValue)
                                ])
                            )}
                        </>
                    )}

                    {activeSection === 'financial' && financial && (
                        <>
                            {renderSectionHeader('Corporate Financial Overview')}
                            {renderProperties([
                                { label: 'Operating Spend (All Plants)', value: fmt(financial.operatingSpend) },
                                { label: 'Labor', value: fmt(financial.labor) },
                                { label: 'Parts', value: fmt(financial.parts) },
                                { label: 'Misc/External', value: fmt(financial.misc) },
                                { label: 'Grand Total', value: fmt(financial.grandTotal) }
                            ])}
                            {renderSectionHeader('Spend by Plant')}
                            {renderTable(
                                ['#', 'Plant', 'Total Spend', 'Labor', 'Parts', 'Misc', 'Inventory'],
                                (financial.allPlants || []).map((p, i) => [
                                    String(i + 1), p.plant, fmt(p.totalSpend), fmt(p.laborCost), fmt(p.partsCost), fmt(p.miscCost), fmt(p.inventoryValue)
                                ])
                            )}
                        </>
                    )}

                    {activeSection === 'opex' && opexData && (
                        <>
                            {renderSectionHeader(`OpEx Intelligence — ${opexData.fyLabel || 'FY2026'}`)}
                            {renderProperties([
                                { label: 'CapEx Avoidance', value: fmt(opexData.summary?.capexSavings) },
                                { label: 'Ghost Inventory Release', value: fmt(opexData.summary?.ghostSavings) },
                                { label: 'Overstock Capital Lockup', value: fmt(opexData.summary?.overstockSavings) },
                                { label: 'Preventable Logistics', value: fmt(opexData.summary?.freightSavings) },
                                { label: 'Vendor Consolidation', value: fmt(opexData.summary?.vendorSavings) },
                                { label: 'Product Shrink Recovery', value: fmt(opexData.summary?.shrinkSavings) },
                                { label: 'Safety Cost Avoidance', value: fmt(opexData.summary?.accidentSavings) },
                                { label: 'Labor Optimization', value: fmt(opexData.summary?.laborSavings) },
                                { label: 'Off-Shift Phantom Load', value: fmt(opexData.summary?.phantomSavings) },
                                { label: 'Scrap Metal Monetization', value: fmt(opexData.summary?.scrapSavings) },
                                { label: 'Contractor Time Theft', value: fmt(opexData.summary?.timeTheftSavings) }
                            ])}
                        </>
                    )}

                    {activeSection === 'risk' && risks && (
                        <>
                            {renderSectionHeader('Enterprise Risk Matrix')}
                            {renderProperties([
                                { label: 'Critical', value: String(risks.summary?.critical || 0) },
                                { label: 'High', value: String(risks.summary?.high || 0) },
                                { label: 'Medium', value: String(risks.summary?.medium || 0) },
                                { label: 'Low', value: String(risks.summary?.low || 0) },
                                { label: 'Total Items', value: String(risks.totalRisks || 0) }
                            ])}
                            {renderSectionHeader('Risk Items')}
                            {renderTable(
                                ['Severity', 'Title', 'Detail', 'Plant', 'Category'],
                                (risks.risks || []).map(r => [
                                    r.severity.toUpperCase(), r.title, r.detail, r.plant, r.category.replace(/_/g, ' ')
                                ])
                            )}
                        </>
                    )}

                    {activeSection === 'forecast' && forecast && (
                        <>
                            {renderSectionHeader('PM Forecast (90 Days)')}
                            {renderTable(
                                ['Month', 'Count'],
                                (forecast.preventiveMaintenance?.byMonth || []).map(m => [m.month, String(m.count)])
                            )}
                            {renderSectionHeader('Fleet Replacement Candidates')}
                            {renderTable(
                                ['Unit', 'Vehicle', 'Mileage', 'Plant', 'Urgency'],
                                (forecast.fleetReplacement || []).map(v => [v.unit, v.vehicle, fmtN(v.mileage) + ' mi', v.plant, v.urgency])
                            )}
                        </>
                    )}

                    {activeSection === 'workforce' && workforce && (
                        <>
                            {renderSectionHeader('Workforce Overview')}
                            {renderProperties([
                                { label: 'Total Users', value: fmtN(workforce.totalUsers) },
                                { label: 'Active Workers', value: fmtN(workforce.labor?.totalAssigned) },
                                { label: 'Contractors (Total)', value: fmtN(workforce.contractors?.total) },
                                { label: 'Contractors (Approved)', value: fmtN(workforce.contractors?.active) }
                            ])}
                            {renderSectionHeader('Active Workers by Plant')}
                            {renderTable(
                                ['Plant', 'Active Workers'],
                                (workforce.labor?.byPlant || []).filter(p => p.activeWorkers > 0).map(p => [p.plant, String(p.activeWorkers)])
                            )}
                        </>
                    )}

                    {renderSignatures(['Executive Review', 'Date'])}
                </>
            );
            break;
        }

        case 'corp-opex-plan': {
            const { plan, fyLabel } = data;
            const fmt = (v) => v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'K' : '$' + (v || 0).toFixed(0);
            
            content = (
                <>
                    {renderHeader(`Executive Action Plan — ${plan.title}`, `OPEX-PLAN-${new Date().toISOString().split('T')[0]}`)}
                    
                    {plan.savings > 0 && (
                        <div style={{ marginBottom: 20, padding: 15, border: '2px solid #1e1b4b', background: '#f8fafc', fontWeight: 'bold', fontSize: '11pt', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#166534' }}>IDENTIFIED SAVINGS POTENTIAL:</span>
                            <span style={{ fontSize: '16pt', color: '#166534' }}>{fmt(plan.savings)}</span>
                        </div>
                    )}

                    {renderSectionHeader('Executive Summary')}
                    <div style={{ padding: '10px 15px', background: '#f8fafc', borderLeft: '3px solid #1e1b4b', marginBottom: 15, fontSize: '9pt', lineHeight: 1.6 }}>
                        {plan.headline}
                    </div>

                    {renderSectionHeader('Why This Delivers Savings')}
                    <div style={{ marginBottom: 20, fontSize: '9pt', lineHeight: 1.6, color: '#334155' }}>
                        {plan.why}
                    </div>

                    {renderSectionHeader('Action Plan')}
                    <div style={{ marginBottom: 20 }}>
                        {renderTable(
                            ['#', 'Action', 'Detail', 'Priority'],
                            plan.actions.map(a => [
                                a.step,
                                <strong style={{color: '#1e1b4b'}}>{a.action}</strong>,
                                <span style={{fontSize: '8pt', color: '#475569'}}>{a.detail}</span>,
                                <span style={{
                                    background: a.priority === 'HIGH' ? '#fee2e2' : '#fef3c7', 
                                    color: a.priority === 'HIGH' ? '#dc2626' : '#d97706',
                                    padding: '2px 8px', borderRadius: '4px', fontSize: '7.5pt', fontWeight: 'bold'
                                }}>{a.priority}</span>
                            ])
                        )}
                    </div>

                    <div className="print-page-break" style={{ pageBreakBefore: 'always' }}></div>

                    {renderSectionHeader('Implementation Timeline')}
                    <div style={{ marginBottom: 20 }}>
                        {renderTable(
                            ['Phase', 'Task'],
                            plan.timeline.map(t => [
                                <strong>{t.phase}</strong>,
                                t.task
                            ])
                        )}
                    </div>

                    {renderSectionHeader('KPIs to Track Success')}
                    <ul style={{ fontSize: '9pt', lineHeight: 1.6, margin: '10px 0 30px 25px', color: '#334155' }}>
                        {plan.kpis.map((k, i) => <li key={i}>{k}</li>)}
                    </ul>

                    {renderSignatures(['Executive Sponsor', 'Date'])}
                </>
            );
            break;
        }

        case 'reliability-report': {
            const n = data.narrative || {};
            const budget = data.budget || {};
            const mtbf = data.mtbf || {};
            const oee = data.oee || {};
            const warranty = data.warranty || {};
            const warrantyCost = data.warrantyCost || {};
            const auditEntries = data.auditLog || [];
            const scope = data.plantId && data.plantId !== 'all_sites' && data.plantId !== 'Corporate_Office'
                ? data.plantId.replace(/_/g, ' ')
                : 'Enterprise';
            const isEnterprise = scope === 'Enterprise';
            const genDate = new Date().toLocaleString();

            content = (
                <>
                    {renderHeader(`${scope} Asset Reliability & Analytics Report`, `RPT-REL-${new Date().toISOString().split('T')[0]}`)}

                    {/* ════════════════ EXECUTIVE SUMMARY ════════════════ */}
                    <div style={{ pageBreakInside: 'avoid', marginBottom: '20px' }}>
                        <div style={{ background: '#f0f9ff', border: '2px solid #1e1b4b', borderRadius: '12px', padding: '20px', marginBottom: '15px' }}>
                            <h2 style={{ margin: '0 0 15px 0', fontSize: '14pt', color: '#1e1b4b', textTransform: 'uppercase', letterSpacing: '1.5px', borderBottom: '2px solid #1e1b4b', paddingBottom: '8px' }}>
                                Executive Summary
                            </h2>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '15px' }}>
                                {[
                                    { label: 'Operating Spend', value: n.enterpriseFinancials ? `$${n.enterpriseFinancials.total?.toLocaleString() || '0'}` : 'N/A', color: '#10b981' },
                                    { label: '12-Mo Budget History', value: budget.summary ? `$${budget.summary.historicalSpend12m?.toLocaleString() || '0'}` : 'N/A', color: '#8b5cf6' },
                                    { label: 'Annual Projection', value: budget.summary ? `$${budget.summary.annualProjection?.toLocaleString() || '0'}` : 'N/A', color: '#6366f1' },
                                    { label: 'Monthly Average', value: budget.summary ? `$${budget.summary.monthlyAverage?.toLocaleString() || '0'}` : 'N/A', color: '#3b82f6' },
                                ].map((kpi, i) => (
                                    <div key={i} style={{ textAlign: 'center', padding: '12px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '8pt', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{kpi.label}</div>
                                        <div style={{ fontSize: '14pt', fontWeight: '800', color: kpi.color }}>{kpi.value}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '12px' }}>
                                {[
                                    { label: 'Avg MTBF', value: mtbf.summary ? `${mtbf.summary.avgMtbf} days` : 'N/A', color: '#6366f1' },
                                    { label: 'Avg MTTR', value: mtbf.summary ? `${mtbf.summary.avgMttr} hrs` : 'N/A', color: '#f59e0b' },
                                    { label: 'OEE Score', value: oee.summary ? `${oee.summary.avgOee}%` : 'N/A', color: oee.summary?.avgOee >= 85 ? '#22c55e' : '#f59e0b' },
                                    { label: 'Active Warranties', value: warranty.totals ? `${warranty.totals.active || 0}` : 'N/A', color: '#10b981' },
                                    { label: 'Cost Avoidance', value: warrantyCost.totals ? `$${(warrantyCost.totals.totalSaved || 0).toLocaleString()}` : 'N/A', color: '#10b981' },
                                ].map((kpi, i) => (
                                    <div key={i} style={{ textAlign: 'center', padding: '10px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '7pt', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{kpi.label}</div>
                                        <div style={{ fontSize: '12pt', fontWeight: '800', color: kpi.color }}>{kpi.value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ════════════════ DEEP INSIGHTS / ALERTS ════════════════ */}
                    {n.insights?.length > 0 && (<div style={{ pageBreakInside: 'avoid' }}>
                        {renderSectionHeader(`Operational Insights & Alerts (${n.insights.length})`)}
                        {renderTable(
                            ['Plant', 'Severity', 'Insight Detail'],
                            n.insights.map(i => [
                                i.plant?.replace(/_/g, ' ') || '--',
                                (i.type || '').toUpperCase(),
                                i.msg || '--'
                            ])
                        )}
                    </div>)}

                    {/* ════════════════ WORKLOAD DISTRIBUTION ════════════════ */}
                    {n.workloadDistribution?.length > 0 && (<div style={{ pageBreakInside: 'avoid' }}>
                        {renderSectionHeader(`${isEnterprise ? 'Regional' : 'Plant'} Workload Distribution`)}
                        {renderTable(
                            ['Plant / Area', 'Total Work Orders', 'Active Work Orders', 'Activity Ratio'],
                            n.workloadDistribution.map(w => [
                                w.plant?.replace(/_/g, ' ') || '--',
                                w.total?.toLocaleString() || '0',
                                w.active?.toLocaleString() || '0',
                                w.total > 0 ? `${((w.active / w.total) * 100).toFixed(1)}%` : '0%'
                            ])
                        )}
                    </div>)}

                    {/* ════════════════ FINANCIAL ANALYSIS ════════════════ */}
                    {n.enterpriseFinancials && (<div style={{ pageBreakInside: 'avoid' }}>
                        {renderSectionHeader(`${isEnterprise ? 'Enterprise' : 'Plant'} Financial Analysis`)}
                        <div className="print-panel">
                            <div className="print-grid-2">
                                <div className="print-detail-row">
                                    <span className="print-label">{t('printEngine.totalOperatingSpend')}</span>
                                    <span className="print-value" style={{ fontSize: '14pt', fontWeight: '800', color: '#10b981' }}>${n.enterpriseFinancials.total?.toLocaleString()}</span>
                                </div>
                                <div className="print-detail-row">
                                    <span className="print-label">{t('printEngine.laborSpend')}</span>
                                    <span className="print-value">${n.enterpriseFinancials.labor?.toLocaleString()}</span>
                                </div>
                                <div className="print-detail-row">
                                    <span className="print-label">{t('printEngine.partsMaterials')}</span>
                                    <span className="print-value">${n.enterpriseFinancials.parts?.toLocaleString()}</span>
                                </div>
                                <div className="print-detail-row">
                                    <span className="print-label">{t('printEngine.miscExternal')}</span>
                                    <span className="print-value">${n.enterpriseFinancials.misc?.toLocaleString()}</span>
                                </div>
                                <div className="print-detail-row">
                                    <span className="print-label">{t('printEngine.laborShare')}</span>
                                    <span className="print-value">{n.enterpriseFinancials.total > 0 ? ((n.enterpriseFinancials.labor / n.enterpriseFinancials.total) * 100).toFixed(1) : 0}%</span>
                                </div>
                                <div className="print-detail-row">
                                    <span className="print-label">{t('printEngine.partsShare')}</span>
                                    <span className="print-value">{n.enterpriseFinancials.total > 0 ? ((n.enterpriseFinancials.parts / n.enterpriseFinancials.total) * 100).toFixed(1) : 0}%</span>
                                </div>
                            </div>
                        </div>
                    </div>)}

                    {/* ════════════════ BUDGET FORECAST ════════════════ */}
                    {budget.forecast?.length > 0 && (<div style={{ pageBreakBefore: 'always' }}>
                        {renderSectionHeader(`12-Month Budget Forecast — ${budget.summary?.totalPlants || 0} Plant(s) · ${budget.summary?.totalAssets || 0} Assets`)}
                        {renderProperties([
                            { label: '12-Month Historical Spend', value: `$${(budget.summary?.historicalSpend12m || 0).toLocaleString()}` },
                            { label: 'Monthly Average', value: `$${(budget.summary?.monthlyAverage || 0).toLocaleString()}` },
                            { label: 'Annual Projection', value: `$${(budget.summary?.annualProjection || 0).toLocaleString()}` },
                            { label: 'Age Factor Multiplier', value: `${budget.summary?.ageFactor || 1}x` },
                        ])}
                        {renderTable(
                            ['Month', 'Projected', 'Best Case', 'Worst Case', 'WO Count'],
                            budget.forecast.map(f => [
                                f.month,
                                `$${f.projected?.toLocaleString() || '0'}`,
                                `$${f.bestCase?.toLocaleString() || '0'}`,
                                `$${f.worstCase?.toLocaleString() || '0'}`,
                                f.woCount?.toString() || '0'
                            ])
                        )}
                        {budget.plantBreakdown?.length > 0 && (<>
                            <div style={{ marginTop: '15px' }}></div>
                            {renderSectionHeader('Plant Spend Breakdown (12 Month)')}
                            {renderTable(
                                ['Plant', 'Work Orders', 'Assets', '12-Month Spend'],
                                budget.plantBreakdown.slice(0, 20).map(pb => [
                                    pb.plant?.replace(/_/g, ' ') || '--',
                                    pb.woCount?.toString() || '0',
                                    pb.assetCount?.toString() || '0',
                                    `$${pb.spend12m?.toLocaleString() || '0'}`
                                ])
                            )}
                        </>)}
                    </div>)}

                    {/* ════════════════ MTBF / MTTR RELIABILITY ════════════════ */}
                    {mtbf.summary && (<div style={{ pageBreakBefore: 'always' }}>
                        {renderSectionHeader('MTBF / MTTR Reliability Analysis')}
                        {renderProperties([
                            { label: 'Avg Mean Time Between Failures', value: `${mtbf.summary.avgMtbf || 0} days` },
                            { label: 'Avg Mean Time To Repair', value: `${mtbf.summary.avgMttr || 0} hours` },
                            { label: 'Average Reliability Score', value: `${mtbf.summary.avgReliability || 0}%` },
                            { label: 'Critical Assets (High Risk)', value: mtbf.summary.criticalCount || 0 },
                            { label: 'Total Recorded Failures', value: mtbf.summary.totalFailures || 0 },
                            { label: 'Total Assets Analyzed', value: mtbf.summary.totalAssets || 0 },
                        ])}

                        {mtbf.assets?.length > 0 && (<>
                            <div style={{ marginTop: '10px' }}></div>
                            {renderSectionHeader(`Asset Reliability Ranking (${mtbf.assets.length} Assets)`)}
                            {renderTable(
                                ['Asset', 'Plant', 'Failures', 'MTBF (days)', 'MTTR (hrs)', 'Reliability', 'Risk'],
                                mtbf.assets.slice(0, 30).map(a => [
                                    `${a.assetId}\n${a.description || ''}`,
                                    a.plantLabel || '--',
                                    a.totalFailures?.toString() || '0',
                                    a.mtbfDays !== null ? a.mtbfDays.toString() : '—',
                                    a.mttrHours !== null ? a.mttrHours.toString() : '—',
                                    `${a.reliabilityScore || 0}%`,
                                    a.riskLevel || '--'
                                ])
                            )}
                        </>)}

                        {mtbf.plantComparison?.length > 0 && (<>
                            <div style={{ marginTop: '10px' }}></div>
                            {renderSectionHeader('Plant Reliability Comparison')}
                            {renderTable(
                                ['#', 'Plant', 'Assets', 'Failures', 'Avg MTBF', 'Avg MTTR', 'Reliability', 'Critical'],
                                mtbf.plantComparison.map((p, i) => [
                                    (i + 1).toString(),
                                    p.plantLabel || '--',
                                    p.assetCount?.toString() || '0',
                                    p.totalFailures?.toString() || '0',
                                    p.avgMtbf !== null ? `${p.avgMtbf}d` : '—',
                                    p.avgMttr !== null ? `${p.avgMttr}h` : '—',
                                    `${p.avgReliability || 0}%`,
                                    p.criticalAssets?.toString() || '0'
                                ])
                            )}
                        </>)}

                        {mtbf.failureModeDistribution?.length > 0 && (<>
                            <div style={{ marginTop: '10px' }}></div>
                            {renderSectionHeader('Failure Mode Distribution')}
                            {renderTable(
                                ['#', 'Failure Mode', 'Occurrences'],
                                mtbf.failureModeDistribution.slice(0, 15).map((fm, i) => [
                                    (i + 1).toString(),
                                    fm.mode || '--',
                                    `${fm.count}×`
                                ])
                            )}
                        </>)}

                        {mtbf.monthlyTrend?.length > 0 && (<>
                            <div style={{ marginTop: '10px' }}></div>
                            {renderSectionHeader('12-Month Failure Trend')}
                            {renderTable(
                                ['Month', 'Failures'],
                                mtbf.monthlyTrend.filter(m => m.failures > 0).map(m => [
                                    m.month,
                                    m.failures.toString()
                                ])
                            )}
                        </>)}
                    </div>)}

                    {/* ════════════════ OEE DASHBOARD ════════════════ */}
                    {oee.summary && (<div style={{ pageBreakBefore: 'always' }}>
                        {renderSectionHeader('Overall Equipment Effectiveness (OEE) Analysis')}
                        {renderProperties([
                            { label: 'Enterprise OEE', value: `${oee.summary.avgOee || 0}% — ${(oee.summary.avgOee || 0) >= 85 ? 'WORLD CLASS' : (oee.summary.avgOee || 0) >= 65 ? 'AVERAGE' : 'BELOW TARGET'}` },
                            { label: 'Avg Availability', value: `${oee.summary.avgAvail || 0}%` },
                            { label: 'Avg Performance', value: `${oee.summary.avgPerf || 0}%` },
                            { label: 'Avg Quality', value: `${oee.summary.avgQual || 0}%` },
                            { label: 'World Class Assets (≥85%)', value: oee.summary.worldClass || 0 },
                            { label: 'Total Assets Analyzed', value: oee.summary.totalAssets || 0 },
                        ])}

                        {oee.assets?.length > 0 && (<>
                            <div style={{ marginTop: '10px' }}></div>
                            {renderSectionHeader(`OEE by Asset (Top ${Math.min(oee.assets.length, 30)})`)}
                            {renderTable(
                                ['Asset', 'Plant', 'OEE', 'Avail', 'Perf', 'Quality', 'Down (hrs)', 'WOs'],
                                oee.assets.slice(0, 30).map(a => [
                                    `${a.assetId}\n${a.assetDesc || ''}`,
                                    a.plant || '--',
                                    `${a.oee}%`,
                                    `${a.availability}%`,
                                    `${a.performance}%`,
                                    `${a.quality}%`,
                                    `${a.totalDown || 0}h`,
                                    a.woCount?.toString() || '0'
                                ])
                            )}
                        </>)}

                        {oee.plants?.length > 0 && (<>
                            <div style={{ marginTop: '10px' }}></div>
                            {renderSectionHeader('OEE by Plant')}
                            {renderTable(
                                ['#', 'Plant', 'OEE', 'Availability', 'Performance', 'Quality', 'Assets', 'WOs'],
                                oee.plants.map((p, i) => [
                                    (i + 1).toString(),
                                    p.label || '--',
                                    `${p.oee}%`,
                                    `${p.availability}%`,
                                    `${p.performance}%`,
                                    `${p.quality}%`,
                                    p.assetCount?.toString() || '0',
                                    p.woCount?.toString() || '0'
                                ])
                            )}
                        </>)}
                    </div>)}

                    {/* ════════════════ WARRANTY INTELLIGENCE ════════════════ */}
                    {warranty.totals && (<div style={{ pageBreakBefore: 'always' }}>
                        {renderSectionHeader('Warranty Intelligence Overview')}
                        {renderProperties([
                            { label: 'Active Warranties', value: warranty.totals.active || 0 },
                            { label: 'Expiring Soon (90 days)', value: warranty.totals.expiringSoon || 0 },
                            { label: 'Expired', value: warranty.totals.expired || 0 },
                            { label: 'No Warranty Coverage', value: warranty.totals.noWarranty || 0 },
                        ])}

                        {warranty.expiringSoon?.length > 0 && (<>
                            <div style={{ marginTop: '10px' }}></div>
                            {renderSectionHeader(`Warranties Expiring Soon (${warranty.expiringSoon.length})`)}
                            {renderTable(
                                ['Asset', 'Plant', 'Vendor', 'Expires', 'Days Left', 'Value'],
                                warranty.expiringSoon.slice(0, 25).map(a => [
                                    `${a.ID}\n${a.Description || ''}`,
                                    a.plantLabel || '--',
                                    a.WarrantyVendor || '--',
                                    formatDate(a.WarrantyEnd) || '--',
                                    a.daysLeft?.toString() || '--',
                                    a.assetCost > 0 ? `$${a.assetCost.toLocaleString()}` : '--'
                                ])
                            )}
                        </>)}

                        {warranty.plants?.length > 0 && (<>
                            <div style={{ marginTop: '10px' }}></div>
                            {renderSectionHeader('Warranty Status by Plant')}
                            {renderTable(
                                ['Plant', 'Total', 'Active', 'Expiring', 'Expired', 'No Warranty', 'Coverage %'],
                                warranty.plants.filter(p => p.total > 0).map(p => {
                                    const pct = p.total > 0 ? Math.round(((p.active + p.expiringSoon) / p.total) * 100) : 0;
                                    return [
                                        p.plantLabel || '--',
                                        p.total?.toString() || '0',
                                        p.active?.toString() || '0',
                                        p.expiringSoon?.toString() || '0',
                                        p.expired?.toString() || '0',
                                        p.noWarranty?.toString() || '0',
                                        `${pct}%`
                                    ];
                                })
                            )}
                        </>)}
                    </div>)}

                    {/* ════════════════ WARRANTY COST AVOIDANCE ════════════════ */}
                    {warrantyCost.totals && (warrantyCost.totals.totalSaved > 0 || warrantyCost.totals.totalWarrantyWOs > 0) && (<div style={{ pageBreakInside: 'avoid' }}>
                        {renderSectionHeader('Warranty Cost Avoidance Summary')}
                        {renderProperties([
                            { label: 'Total Warranty Work Orders', value: warrantyCost.totals.totalWarrantyWOs || 0 },
                            { label: 'Labor Cost Avoided', value: `$${(warrantyCost.totals.laborSaved || 0).toLocaleString()}` },
                            { label: 'Parts/Material Cost Avoided', value: `$${(warrantyCost.totals.partsSaved || 0).toLocaleString()}` },
                            { label: 'TOTAL COST AVOIDANCE', value: `$${(warrantyCost.totals.totalSaved || 0).toLocaleString()}` },
                        ])}

                        {warrantyCost.details?.length > 0 && (<>
                            <div style={{ marginTop: '10px' }}></div>
                            {renderSectionHeader(`Warranty-Covered Repairs (${warrantyCost.details.length})`)}
                            {renderTable(
                                ['Plant', 'WO #', 'Asset', 'Vendor', 'Labor Saved', 'Parts Saved', 'Total Saved'],
                                warrantyCost.details.slice(0, 20).map(d => [
                                    d.plantLabel || '--',
                                    d.workOrderNumber || '--',
                                    d.assetDescription || d.assetId || '--',
                                    d.vendor || '--',
                                    d.laborSaved > 0 ? `$${d.laborSaved.toLocaleString()}` : '--',
                                    d.partsSaved > 0 ? `$${d.partsSaved.toLocaleString()}` : '--',
                                    `$${(d.totalSaved || 0).toLocaleString()}`
                                ])
                            )}
                        </>)}
                    </div>)}

                    {/* ════════════════ LOGISTICS AUDIT TRAIL ════════════════ */}
                    {auditEntries.length > 0 && (<div style={{ pageBreakBefore: 'always' }}>
                        {renderSectionHeader(`Logistics Audit Trail (${auditEntries.length} Recent Entries)`)}
                        <div className="print-panel">
                            {auditEntries.slice(0, 30).map((entry, i) => (
                                <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: '9pt', lineHeight: '1.4' }}>
                                    {typeof entry === 'string' ? entry : `[${entry.Timestamp || entry.timestamp}] ${entry.Action || entry.action} — ${entry.Detail || entry.detail}`}
                                </div>
                            ))}
                        </div>
                    </div>)}

                    {/* ════════════════ REPORT FOOTER ════════════════ */}
                    <div style={{ marginTop: '30px', borderTop: '2px solid #1e1b4b', paddingTop: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: '#64748b', marginBottom: '20px' }}>
                            <div>Generated: {genDate}</div>
                            <div>Scope: {scope}</div>
                            <div>{t('printEngine.trierOsEnterpriseMaintenancePlatform')}</div>
                        </div>
                        {renderSectionHeader('Review & Approval')}
                        {renderSignatures(['Reliability Engineer', 'Plant Manager', 'VP of Operations', 'Date'])}
                    </div>
                </>
            );
            break;
        }

        case 'audit-log-report': {
            const logs = data?.logs || [];
            content = (
                <>
                    {renderHeader('System Audit Trail Report', `${logs.length} Entries`)}
                    {renderSectionHeader('Audit Log')}
                    {logs.length > 0 ? renderTable(
                        ['#', 'Timestamp', 'Action', 'Details', 'User'],
                        logs.map(l => [l.id, l.timestamp || '--', l.action || '--', (l.detail || '').substring(0, 80), l.user || 'System'])
                    ) : <p>{t('printEngine.noAuditEntriesRecorded')}</p>}
                    {renderSectionHeader('Attestation')}
                    {renderSignatures(['IT Administrator', 'Compliance Officer', 'Date'])}
                </>
            );
            break;
        }

        case 'audit-entry-detail': {
            const e = data || {};
            content = (
                <>
                    {renderHeader('Audit Entry Record', `Entry #${e.id || '--'}`)}
                    {renderSectionHeader('Entry Information')}
                    {renderProperties([
                        { label: 'Entry #', value: e.id },
                        { label: 'Timestamp', value: e.timestamp },
                        { label: 'Action', value: e.action },
                        { label: 'User', value: e.user || 'System' },
                    ])}
                    {renderSectionHeader('Full Details')}
                    {renderDescription(e.detail || e.raw || 'No additional details.')}
                    {renderSectionHeader('Verification')}
                    {renderSignatures(['Compliance Officer', 'Date'])}
                </>
            );
            break;
        }

        case 'task-detail': {
            const tk = data || {};
            content = (
                <>
                    {renderHeader('Task Master Record', tk.ID || 'Task Detail')}
                    {renderSectionHeader('Task Information')}
                    {renderProperties([
                        { label: 'Task Code', value: tk.ID },
                        { label: 'Category', value: tk.TaskTypID || 'General' },
                        { label: 'Description', value: tk.Description || tk.Descript },
                    ])}
                    {renderSectionHeader('Instructional Process')}
                    {renderDescription(tk.Tasks || tk.Instructions || 'No instructional text defined.')}
                    {renderSectionHeader('Authorization')}
                    {renderSignatures(['Maintenance Manager', 'Training Coordinator', 'Date'])}
                </>
            );
            break;
        }

        case 'sop':
        case 'procedure':
            content = (
                <>
                    {renderHeader('Standard Operating Procedure', `SOP-${data.ID}`)}
                    {renderSectionHeader('Document Control')}
                    {renderProperties([
                        { label: 'Procedure ID', value: data.ID },
                        { label: 'Revision', value: `Rev ${data.RevNum || 0}` },
                        { label: 'Authority', value: 'Corporate Maintenance' },
                        { label: 'Review Frequency', value: 'ANNUAL' }
                    ])}
                    {renderSectionHeader('Sequential Operating Steps')}
                    {renderTable(['Step', 'Task Description', 'Mandatory Instructions'], (data._tasks || []).map(tk => [tk.TskOrder, tk.Description, tk.Instructions]))}
                    {renderSectionHeader('Required Parts & Tooling')}
                    {renderTable(['Reference', 'Description', 'Est Qty'], (data._parts || []).map(p => [p.ID, p.Description, p.EstQty]))}
                    {renderSectionHeader('Technician Certification')}
                    {renderSignatures(['Technician Name & Signature', 'Date Performed'])}
                </>
            );
            break;

        case 'pm-task':
            content = (
                <>
                    {renderHeader('Preventative Maintenance Master', `PM-${data.ID}`)}
                    {renderSectionHeader('Schedule Parameters')}
                    {renderProperties([
                        { label: 'Schedule ID', value: data.ID },
                        { label: 'Frequency', value: `${data.Freq} ${data.FreqUnit}` },
                        { label: 'Next Window', value: formatDate(data.NextDate) || 'UNSCHEDULED' },
                        { label: 'Assigned Asset', value: data.AstID }
                    ])}
                    {renderSectionHeader('Maintenance Mandate')}
                    {renderDescription(data.LongDescription || data.Description)}
                    {renderSectionHeader('Authorization & Control')}
                    {renderSignatures(['Maintenance Supervisor Signature', 'Date of Review'])}
                </>
            );
            break;

        case 'part':
            content = (
                <>
                    {renderHeader('Inventory Specification Sheet', `PRT-${data.ID}`)}
                    {renderSectionHeader('Stock Properties')}
                    {renderProperties([
                        { label: 'Part ID', value: data.ID },
                        { label: 'Description', value: data.Description },
                        { label: 'Class/Type', value: data.PartClassID },
                        { label: 'Stock Level', value: data.Stock },
                        { label: 'Unit Cost', value: `$${parseFloat(data.UnitCost || 0).toFixed(2)}` },
                        { label: 'Reorder Point', value: data.OrdMin }
                    ])}
                    {renderSectionHeader('Recent Procurement History')}
                    {renderTable(['Date', 'Vendor', 'Purchase Qty', 'PO #'], (data._history || []).map(h => [formatDate(h.PurchaseDate), h.VendorID, h.Qty, h.PONumber]))}
                    {renderSectionHeader('Audit Logs')}
                    {renderSignatures(['Inventory Specialist', 'Date of Audit'])}
                </>
            );
            break;

        case 'po':
            content = (
                <>
                    {renderHeader('Procurement History Record', `PV-${data.PartID.substring(0, 6).toUpperCase()}`)}
                    {renderSectionHeader('Procurement Metadata')}
                    {renderProperties([
                        { label: 'Part ID', value: data.PartID },
                        { label: 'Nomenclature', value: data.PartDesc || 'N/A' },
                        { label: 'Mfr Part #', value: data.ManufNum || '—' },
                        { label: 'Vendor Part #', value: data.VendNum || '—' },
                        { label: 'Vendor Entity', value: data.VendorID },
                        { label: 'Purchase Date', value: formatDate(data.PurchaseDate) || 'N/A' },
                        { label: 'Valuation', value: `$${parseFloat(data.PurchaseCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` }
                    ])}
                    {renderSectionHeader('Strategic Narrative')}
                    {renderDescription(`This record identifies the last known procurement cost for Part ${data.PartID} from Vendor ${data.VendID}. This data is utilized by the inventory reorder logic to calculate replenishment valuations and budget forecasts.`)}
                    {renderSectionHeader('Authorization & Control')}
                    {renderSignatures(['Procurement Supervisor Signature', 'Plant Manager Review'])}
                </>
            );
            break;

        case 'report':
            const printCols = data.orderedColumns || data.columns || [];
            content = (
                <>
                    {renderHeader('Historical Management Report', `RPT-${data.meta?.ID || '0'}`)}
                    {renderSectionHeader('Report Description')}
                    <div className="print-panel" style={{ fontSize: '12pt', fontWeight: 'bold', color: '#1e1b4b' }}>
                        {data.meta?.Description || 'Historical Report'}
                    </div>
                    {renderSectionHeader('Dataset Summary')}
                    {renderProperties([
                        { label: 'Source Table', value: data.sourceTable },
                        { label: 'Total Records', value: data.data?.length || 0 },
                        { label: 'Report Category', value: data.meta?.ClassID || '--' }
                    ])}
                    {renderSectionHeader('Data Records')}
                    {renderTable(
                        printCols.map(c => data.labels?.[c] || c),
                        (data.data || []).map(row => printCols.map(col => {
                            const val = row[col];
                            if (val === null || val === undefined) return '--';
                            
                            const isNumeric = typeof val === 'number';
                            const isCostColumn = String(col).toLowerCase().includes('cost') || 
                                               String(col).toLowerCase().includes('spend') || 
                                               String(col).toLowerCase().includes('rate');
                            
                            if (isCostColumn || (isNumeric && String(col).toLowerCase().includes('total'))) {
                                return new Number(val).toLocaleString(undefined, { 
                                    style: 'currency', 
                                    currency: 'USD',
                                    minimumFractionDigits: 2 
                                });
                            }
                            
                            return String(val);
                        }))
                    )}
                    {renderSectionHeader('Authorization & Review')}
                    {renderSignatures(['Reviewer Signature', 'Date of Review'])}
                </>
            );
            break;

        case 'manual': {
            // Support both old format (array) and new format ({ sections, searchQuery })
            const manualSections = Array.isArray(data) ? data : (data.sections || []);
            const manualSearchQuery = Array.isArray(data) ? '' : (data.searchQuery || '');
            const isSearchResult = manualSearchQuery.length > 0;

            content = (
                <>
                    {isSearchResult ? (
                        /* ═══ COMPACT HEADER FOR SEARCH RESULTS ═══ */
                        <div style={{ 
                            display: 'flex', alignItems: 'center', gap: '20px',
                            borderBottom: '3px solid #1e1b4b', paddingBottom: '15px', marginBottom: '20px'
                        }}>
                            <img src={branding.documentLogo || "/assets/TrierLogoPrint.png"} 
                                alt="Trier OS" 
                                style={{ height: '60px', width: 'auto' }} 
                            />
                            <div style={{ flex: 1 }}>
                                <h1 style={{ fontSize: '18pt', fontWeight: '900', color: '#1e1b4b', margin: '0 0 2px 0' }}>
                                    Trier OS — Manual Search Results
                                </h1>
                                <p style={{ fontSize: '9pt', color: '#64748b', margin: 0 }}>
                                    Search: "<strong>{manualSearchQuery}</strong>" · {manualSections.length} section{manualSections.length !== 1 ? 's' : ''} found · Generated {formatDate(new Date())}
                                </p>
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '8pt', color: '#94a3b8' }}>
                                <div>{t('printEngine.v1126gold')}</div>
                                <div>© 2026 Doug Trier</div>
                            </div>
                        </div>
                    ) : (
                        /* ═══ FULL COVER PAGE FOR COMPLETE MANUAL ═══ */
                        <>
                            <div style={{ 
                                textAlign: 'center', 
                                paddingTop: '60px', 
                                pageBreakAfter: 'always',
                                minHeight: '90vh',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <img src={branding.documentLogo || "/assets/TrierLogoPrint.png"} 
                                    alt="Trier OS" 
                                    style={{ width: '550px', height: 'auto', marginBottom: '30px' }} 
                                />
                                <h1 style={{ 
                                    fontSize: '42pt', 
                                    fontWeight: '900', 
                                    color: '#1e1b4b', 
                                    margin: '0 0 6px 0',
                                    letterSpacing: '4px',
                                    textTransform: 'uppercase'
                                }}>TRIER OS<sup style={{ fontSize: '0.4em', paddingLeft: '4px', color: '#64748b' }}>™</sup></h1>
                                <h2 style={{ 
                                    fontSize: '20pt', 
                                    fontWeight: '600', 
                                    color: '#475569', 
                                    margin: '0 0 20px 0',
                                    letterSpacing: '1.5px'
                                }}>Operational Intelligence Manual</h2>
                                <p style={{ fontSize: '12pt', color: '#64748b', margin: '0 0 4px 0' }}>
                                    <strong>{t('printEngine.computerizedMaintenanceManagementSystem')}</strong>
                                </p>
                                <p style={{ fontSize: '11pt', color: '#94a3b8', margin: '0 0 30px 0' }}>
                                    Built on 33 Years of Operational Knowledge
                                </p>
                                <div style={{ 
                                    width: '550px', 
                                    borderTop: '2px solid #1e1b4b', 
                                    margin: '0 auto 30px auto',
                                    paddingTop: '20px'
                                }}>
                                    <table style={{ margin: '0 auto', fontSize: '11pt', color: '#334155', borderCollapse: 'collapse' }}>
                                        <tbody>
                                            <tr><td style={{ padding: '5px 20px', textAlign: 'right', fontWeight: 'bold' }}>Version</td><td style={{ padding: '5px 20px', textAlign: 'left' }}>2.0.0</td></tr>
                                            <tr><td style={{ padding: '5px 20px', textAlign: 'right', fontWeight: 'bold' }}>Effective Date</td><td style={{ padding: '5px 20px', textAlign: 'left' }}>March 2026</td></tr>
                                            <tr><td style={{ padding: '5px 20px', textAlign: 'right', fontWeight: 'bold' }}>Classification</td><td style={{ padding: '5px 20px', textAlign: 'left' }}>Internal Use — Restricted Distribution</td></tr>
                                            <tr><td style={{ padding: '5px 20px', textAlign: 'right', fontWeight: 'bold' }}>Platform Architect</td><td style={{ padding: '5px 20px', textAlign: 'left' }}>Doug Trier</td></tr>
                                            <tr><td style={{ padding: '5px 20px', textAlign: 'right', fontWeight: 'bold' }}>Coverage</td><td style={{ padding: '5px 20px', textAlign: 'left' }}>40+ Processing Facilities · 15 U.S. States</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ marginTop: 'auto', paddingBottom: '40px', fontSize: '9pt', color: '#94a3b8' }}>
                                    <p style={{ margin: '0' }}>© 2026 Doug Trier. All Rights Reserved.</p>
                                    <p style={{ margin: '4px 0 0 0' }}>Trier OS is proprietary software. Unauthorized copying, distribution, or reverse engineering is strictly prohibited.</p>
                                </div>
                            </div>
                            
                            {renderSectionHeader('Official Record of Practice')}
                            {renderDescription('This document represents the current gold-master standard for maintenance operations. Any unauthorized modifications to these procedures are strictly prohibited.')}
                        </>
                    )}
                    
                    {manualSections.map((m, idx) => (
                        <div key={idx} style={{ pageBreakInside: 'avoid', marginTop: isSearchResult ? '15px' : '30px' }}>
                            <div style={{ borderBottom: '2px solid #1e293b', marginBottom: isSearchResult ? '8px' : '15px', color: '#1e293b' }}>
                                <h2 style={{ margin: 0, textTransform: 'uppercase', fontSize: isSearchResult ? '13pt' : '16pt', letterSpacing: '1px' }}>{m.section}</h2>
                            </div>
                            <p style={{ fontStyle: 'italic', marginBottom: isSearchResult ? '10px' : '20px', fontSize: isSearchResult ? '9pt' : '11pt' }}>{m.content}</p>
                            
                            {m.subsections?.map((sub, sidx) => {
                                const isComparisonTable = m.id === 'competitive-comparison' && sub.items?.some(i => i.includes('\u2014 Trier'));
                                const isExclusiveList = m.id === 'competitive-comparison' && sub.title.includes('Trier-Exclusive');
                                
                                if (isComparisonTable) {
                                    const vendors = ['Trier', 'Fiix', 'UpKeep', 'Limble', 'MaintainX', 'eMaint', 'SAP PM', 'IBM'];
                                    const rows = sub.items.map(item => {
                                        const dashIdx = item.indexOf(' \u2014 ');
                                        const feature = dashIdx > -1 ? item.substring(0, dashIdx) : item;
                                        const rest = dashIdx > -1 ? item.substring(dashIdx + 3) : '';
                                        const statuses = {};
                                        vendors.forEach(v => {
                                            const regex = new RegExp(v + '\\s+([^|]+)');
                                            const match = rest.match(regex);
                                            statuses[v] = match ? match[1].trim() : '';
                                        });
                                        return { feature, statuses };
                                    });
                                    const printBadge = (val) => {
                                        if (!val) return '\u2014';
                                        if (val.includes('[YES+UNIQUE]') || val.includes('[YES][UNIQUE]')) return '\u2605 YES';
                                        if (val.includes('[YES]')) return 'YES';
                                        if (val.includes('[PARTIAL]')) return 'PARTIAL';
                                        if (val.includes('[NO]')) return 'NO';
                                        return '\u2014';
                                    };
                                    const badgeColor = (val) => {
                                        if (!val) return '#94a3b8';
                                        if (val.includes('[YES+UNIQUE]') || val.includes('[YES][UNIQUE]')) return '#b45309';
                                        if (val.includes('[YES]')) return '#059669';
                                        if (val.includes('[PARTIAL]')) return '#d97706';
                                        if (val.includes('[NO]')) return '#dc2626';
                                        return '#94a3b8';
                                    };
                                    return (
                                        <div key={sidx} style={{ marginTop: '20px', pageBreakInside: 'avoid' }}>
                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '11pt', fontWeight: 700 }}>{sub.title}</h4>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7pt', tableLayout: 'fixed' }}>
                                                <colgroup>
                                                    <col style={{ width: '28%' }} />
                                                    {vendors.map(v => <col key={v} style={{ width: '9%' }} />)}
                                                </colgroup>
                                                <thead>
                                                    <tr>
                                                        <th style={{ padding: '4px 6px', textAlign: 'left', borderBottom: '2px solid #1e293b', fontWeight: 700, fontSize: '7pt' }}>Feature</th>
                                                        {vendors.map(v => (
                                                            <th key={v} style={{ padding: '4px 3px', textAlign: 'center', borderBottom: '2px solid #1e293b', fontWeight: v === 'Trier' ? 900 : 600, fontSize: '7pt', color: v === 'Trier' ? '#1e1b4b' : '#334155' }}>{v}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {rows.map((row, ridx) => (
                                                        <tr key={ridx} style={{ background: ridx % 2 === 0 ? '#f8fafc' : '#fff' }}>
                                                            <td style={{ padding: '4px 6px', borderBottom: '1px solid #e2e8f0', fontWeight: 500, fontSize: '7.5pt' }}>{row.feature}</td>
                                                            {vendors.map(v => (
                                                                <td key={v} style={{ padding: '4px 3px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', fontSize: '7pt', fontWeight: 600, color: badgeColor(row.statuses[v]) }}>
                                                                    {printBadge(row.statuses[v])}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                }
                                
                                if (isExclusiveList) {
                                    const exclusiveRows = sub.items.map(item => {
                                        const clean = item.replace(/\[UNIQUE\]\s*/g, '');
                                        const dashIdx = clean.indexOf(' \u2014 ');
                                        if (dashIdx > -1) return { feature: clean.substring(0, dashIdx), desc: clean.substring(dashIdx + 3) };
                                        return { feature: clean, desc: '' };
                                    });
                                    return (
                                        <div key={sidx} style={{ marginTop: '20px', pageBreakInside: 'avoid' }}>
                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '11pt', fontWeight: 700 }}>{sub.title}</h4>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '2px solid #1e293b', fontWeight: 700, width: '30%' }}>Feature</th>
                                                        <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '2px solid #1e293b', fontWeight: 700 }}>Description</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {exclusiveRows.map((row, ridx) => (
                                                        <tr key={ridx} style={{ background: ridx % 2 === 0 ? '#f8fafc' : '#fff' }}>
                                                            <td style={{ padding: '4px 8px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: '8pt', color: '#1e1b4b' }}>{row.feature}</td>
                                                            <td style={{ padding: '4px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '8pt', color: '#475569' }}>{row.desc}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                }

                                // TCO Analysis subsection (tcoTable / tcoItems)
                                if (sub.tcoTable || sub.tcoItems) {
                                    const thP = { padding: '5px 8px', fontSize: '7pt', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #cbd5e1', background: '#f1f5f9', textAlign: 'center', whiteSpace: 'nowrap' };
                                    const tdP = { padding: '5px 8px', fontSize: '8pt', borderBottom: '1px solid #e2e8f0', textAlign: 'center', verticalAlign: 'middle' };
                                    return (
                                        <div key={sidx} style={{ marginBottom: '18px', paddingLeft: '12px', borderLeft: '2px solid #10b981' }}>
                                            <h4 style={{ margin: '0 0 5px 0', fontSize: isSearchResult ? '9pt' : '11pt', color: '#0f4c35' }}>{sub.title}</h4>
                                            {sub.tcoNote && <p style={{ margin: '0 0 8px 0', fontSize: '8pt', color: '#475569', fontStyle: 'italic' }}>{sub.tcoNote}</p>}
                                            {sub.tcoTable && (
                                                <div style={{ overflowX: 'auto' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.5pt', tableLayout: 'auto' }}>
                                                        <thead>
                                                            <tr>
                                                                {sub.tcoTable.headers.map((h, hi) => (
                                                                    <th key={hi} style={{ ...thP, textAlign: hi === 0 ? 'left' : 'center', color: sub.tcoTable.highlight && hi === sub.tcoTable.highlight ? '#065f46' : '#334155', fontWeight: sub.tcoTable.highlight && hi === sub.tcoTable.highlight ? 900 : 700 }}>{h}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {sub.tcoTable.rows.map((row, ri) => {
                                                                const isTrierRow = sub.tcoTable.triRow && row[0] === sub.tcoTable.triRow;
                                                                const isTotalRow = sub.tcoTable.isTotals && ri === sub.tcoTable.rows.length - 1;
                                                                return (
                                                                    <tr key={ri} style={{ background: isTrierRow ? '#ecfdf5' : isTotalRow ? '#f0f4ff' : ri % 2 === 0 ? '#f8fafc' : '#fff' }}>
                                                                        {row.map((cell, ci) => {
                                                                            const isTrierCol = sub.tcoTable.highlight && ci === sub.tcoTable.highlight;
                                                                            const isSavingsMoney = sub.tcoTable.savingsHighlight && ci === row.length - 2;
                                                                            const isSavingsPct = sub.tcoTable.savingsHighlight && ci === row.length - 1;
                                                                            return (
                                                                                <td key={ci} style={{ ...tdP, textAlign: ci === 0 ? 'left' : 'center', color: isTrierRow || isTrierCol || cell === '$0' || isSavingsMoney || isSavingsPct ? '#065f46' : isTotalRow && ci > 0 ? '#1e293b' : '#334155', fontWeight: isTotalRow || isTrierRow || cell === '$0' ? 700 : 400, borderTop: isTotalRow ? '2px solid #94a3b8' : undefined, background: isTrierCol ? 'rgba(16,185,129,0.07)' : undefined }}>
                                                                                    {cell}
                                                                                </td>
                                                                            );
                                                                        })}
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                            {sub.tcoItems && sub.tcoItems.map((item, ii) => (
                                                <div key={ii} style={{ display: 'flex', gap: '8px', fontSize: '8.5pt', marginBottom: '4px', alignItems: 'flex-start' }}>
                                                    <span style={{ color: '#10b981', fontWeight: 700, marginTop: 1 }}>▸</span>
                                                    <span><strong>{item.label}</strong> — <span style={{ color: '#065f46' }}>{item.value}</span></span>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                }

                                // Regular subsection — bullet list
                                return (
                                    <div key={sidx} style={{ marginBottom: isSearchResult ? '10px' : '15px', paddingLeft: '15px', borderLeft: '2px solid #e2e8f0' }}>
                                        <h4 style={{ margin: '0 0 6px 0', fontSize: isSearchResult ? '10pt' : '12pt' }}>{sub.title}</h4>
                                        {(sub.items || []).map((it, iidx) => (
                                            <div key={iidx} style={{ display: 'flex', gap: '8px', fontSize: isSearchResult ? '9pt' : '10pt', marginBottom: '3px' }}>
                                                <span style={{ color: '#64748b' }}>•</span>
                                                <span>{it}</span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}

                            {m.scenarios?.map((sc, scidx) => (
                                <div key={scidx} style={{ marginTop: '15px', padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                                        <h4 style={{ margin: 0, color: '#10b981', fontSize: '10pt' }}>{sc.name}</h4>
                                    </div>
                                    <p style={{ margin: '0 0 10px 0', fontSize: '9pt', opacity: 0.8, lineHeight: '1.4' }}>{sc.description}</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        {sc.steps.map((st, stidx) => (
                                            <div key={stidx} style={{ display: 'flex', gap: '10px', fontSize: '9pt' }}>
                                                <span style={{ fontWeight: 'bold', color: '#10b981', minWidth: '20px' }}>{stidx + 1}.</span>
                                                <span>{st}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}

                    {!isSearchResult && (
                        <>
                            {renderSectionHeader('Acknowledgement of Training')}
                            {renderSignatures(['Technician Name', 'Supervisor Signature', 'Date of Training'])}
                        </>
                    )}
                </>
            );
            break;
        }

        case 'catalog': {
            const { tab, tabLabel, columns: catCols, rows: catRows, total: catTotal, query: catQuery } = data;
            content = (
                <>
                    {renderHeader(`Master Data Catalog — ${tabLabel || 'Equipment'}`, `CAT-${(tabLabel || 'EQ').toUpperCase()}-${new Date().toISOString().split('T')[0]}`)}
                    {catQuery && (
                        <div style={{ padding: '8px 20px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', margin: '0 0 15px 0', fontSize: '9pt' }}>
                            <strong>{t('printEngine.searchFilter')}</strong> "{catQuery}" — {catTotal} results
                        </div>
                    )}
                    <p style={{ fontStyle: 'italic', fontSize: '9pt', color: '#64748b', marginBottom: '15px' }}>
                        {catTotal} {tabLabel || 'records'} from the Dairy Industry Master Data Catalog. Printed {new Date().toLocaleString()}.
                    </p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
                        <thead>
                            <tr>
                                {(catCols || []).map((c, ci) => (
                                    <th key={ci} style={{ padding: '5px 6px', textAlign: 'left', borderBottom: '2px solid #1e293b', fontWeight: 700, fontSize: '7pt', textTransform: 'uppercase' }}>
                                        {c.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(catRows || []).map((row, ridx) => (
                                <tr key={ridx} style={{ background: ridx % 2 === 0 ? '#f8fafc' : '#fff', pageBreakInside: 'avoid' }}>
                                    {(catCols || []).map((c, ci) => {
                                        let val = row[c.key];
                                        if (val === null || val === undefined) val = '—';
                                        else if (typeof val === 'number' && (c.key.includes('Price') || c.key.includes('Cost'))) val = `$${val.toFixed(2)}`;
                                        else if (typeof val === 'string' && val.startsWith('[')) { try { val = JSON.parse(val).join(', '); } catch (e) { console.warn('[PrintEngine] caught:', e); } }
                                        else val = String(val);
                                        return (
                                            <td key={ci} style={{ padding: '4px 6px', borderBottom: '1px solid #e2e8f0', fontSize: '7.5pt' }}>
                                                {val}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {renderSectionHeader('Authorization & Review')}
                    {renderSignatures(['Reviewer Signature', 'Date of Review'])}
                </>
            );
            break;
        }

        // ── CAD / Drawing reference sheet ─────────────────────────────────────
        // Prints a field-friendly one-page reference with QR code pointing to the
        // file URL. Watermarked with asset ID, format, revision, and timestamp.
        case 'cad-drawing': {
            const { url, format, refId, revision = '1.0' } = data;
            const now = new Date().toLocaleString();
            content = (
                <div style={{ fontFamily: 'Arial, sans-serif', padding: '30px', maxWidth: '7.5in' }}>
                    {renderHeader(`${format || 'Drawing'} Reference Sheet — ${refId || ''}`, `DRW-${(refId || 'REF').toUpperCase()}-${new Date().toISOString().split('T')[0]}`)}

                    <div style={{ display: 'flex', gap: 40, marginBottom: 24 }}>
                        <div style={{ flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
                                <tbody>
                                    {[
                                        ['Equipment ID', refId || '—'],
                                        ['Drawing Format', format || '—'],
                                        ['Revision', revision],
                                        ['Printed By', '________________________'],
                                        ['Printed At', now],
                                        ['Source URL', url ? url.substring(0, 60) + (url.length > 60 ? '...' : '') : '—'],
                                    ].map(([label, val], i) => (
                                        <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                                            <td style={{ padding: '5px 8px', fontWeight: 700, fontSize: '8pt', textTransform: 'uppercase', color: '#475569', width: '35%' }}>{label}</td>
                                            <td style={{ padding: '5px 8px', fontSize: '9pt', color: '#1e293b' }}>{val}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {url && (
                            <div style={{ textAlign: 'center' }}>
                                <AsyncQRImage text={url} size={200} style={{ width: 140, height: 140 }} alt="QR to drawing" />
                                <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: 6 }}>Scan to open drawing</div>
                            </div>
                        )}
                    </div>

                    <div style={{ border: '1.5px dashed #94a3b8', borderRadius: 8, padding: '20px 24px', marginBottom: 20, background: '#f8fafc' }}>
                        <div style={{ fontSize: '9pt', fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase' }}>Drawing Preview</div>
                        {['SVG','IFC','DXF'].includes((format || '').toUpperCase()) ? (
                            <div style={{ fontSize: '8.5pt', color: '#1e293b' }}>
                                Open the URL below or scan the QR code to view the drawing in your browser.
                                For DXF files, use AutoCAD, DraftSight, or LibreCAD.
                                For IFC files, use BIM Vision or xeokit.
                            </div>
                        ) : (
                            <div style={{ fontSize: '8.5pt', color: '#1e293b' }}>
                                Open the URL below or scan the QR code to download the {format} file.
                                STEP/IGES files can be opened in FreeCAD, SolidWorks, or CATIA.
                            </div>
                        )}
                        <div style={{ marginTop: 12, fontSize: '8pt', fontFamily: 'monospace', wordBreak: 'break-all', background: '#e2e8f0', padding: '6px 10px', borderRadius: 5 }}>
                            {url || '—'}
                        </div>
                    </div>

                    {/* Watermark bar */}
                    <div style={{ borderTop: '2px solid #1e293b', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: '7.5pt', color: '#64748b' }}>
                        <span><strong>TRIER OS</strong> — CONTROLLED DOCUMENT</span>
                        <span>Asset: {refId || '—'} | Rev: {revision} | {now}</span>
                        <span>UNCONTROLLED IF PRINTED</span>
                    </div>

                    {renderSignatures(['Tech Signature', 'Supervisor Review', 'Date'])}
                </div>
            );
            break;
        }

        // ── Semantic search results print ────────────────────────────────────
        case 'semantic-results': {
            const { query: semQ, results: semResults = [] } = data;
            content = (
                <>
                    {renderHeader('Semantic Equipment Search Results', `SEM-${new Date().toISOString().split('T')[0]}`)}
                    <p style={{ fontStyle: 'italic', fontSize: '9pt', color: '#64748b', marginBottom: 12 }}>
                        Search query: "{semQ}" — {semResults.length} results — Printed {new Date().toLocaleString()}
                    </p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
                        <thead>
                            <tr>
                                {['Match %', 'Equipment ID', 'Description', 'Category', 'Manufacturer', 'MTBF (hrs)', 'PM Interval'].map((h, i) => (
                                    <th key={i} style={{ padding: '5px 6px', textAlign: 'left', borderBottom: '2px solid #1e293b', fontWeight: 700, fontSize: '7pt', textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {semResults.map((r, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff', pageBreakInside: 'avoid' }}>
                                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: r.similarity >= 75 ? '#059669' : r.similarity >= 50 ? '#d97706' : '#94a3b8' }}>
                                        {Math.round(r.similarity)}%
                                    </td>
                                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: '7.5pt' }}>{r.id}</td>
                                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #e2e8f0' }}>{r.description}</td>
                                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #e2e8f0' }}>{r.category || '—'}</td>
                                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #e2e8f0' }}>{r.primaryMaker || '—'}</td>
                                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #e2e8f0' }}>{r.mtbfHours ? r.mtbfHours.toLocaleString() : '—'}</td>
                                    <td style={{ padding: '4px 6px', borderBottom: '1px solid #e2e8f0' }}>{r.pmIntervalDays ? `${r.pmIntervalDays}d` : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {renderSectionHeader('Notes')}
                    <div style={{ height: 60, border: '1px solid #e2e8f0', borderRadius: 4 }} />
                </>
            );
            break;
        }

        case 'asset-qr-label': {
            const baseUrl = window.systemBaseUrl || window.location.origin;
            const params = new URLSearchParams({
                scan: data.ID,
                qDesc: data.Description || 'N/A',
                qModel: data.Model || 'N/A',
                qPlant: data.plantLabel || 'N/A',
                qLoc: data.LocationID || 'N/A',
                plant: data.plantId || '',
            });
            const smartUrl = `${baseUrl}/?${params.toString()}`;
            content = (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px' }}>
                    <div style={{
                        width: '4in', height: '6in', border: '2px solid #1e1b4b', borderRadius: '12px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: '20px', fontFamily: 'Arial, sans-serif', background: '#fff',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)', pageBreakAfter: 'always'
                    }}>
                        <img src={branding.documentLogo || "/assets/TrierLogoPrint.png"} alt="Trier OS" style={{ height: '20px', marginBottom: '8px', opacity: 0.7 }} />
                        <AsyncQRImage text={smartUrl} size={300} style={{ width: '220px', height: '220px', marginBottom: '12px' }} alt={`QR: ${data.ID}`} />
                        <div style={{ fontSize: '28pt', fontWeight: '900', color: '#1e1b4b', letterSpacing: '2px', textAlign: 'center', marginBottom: '6px', fontFamily: 'monospace' }}>
                            {data.ID}
                        </div>
                        <div style={{ fontSize: '14pt', fontWeight: '600', color: '#334155', textAlign: 'center', marginBottom: '12px', lineHeight: '1.3', maxWidth: '3.5in' }}>
                            {data.Description || 'No Description'}
                        </div>
                        <div style={{ width: '100%', borderTop: '1px solid #e2e8f0', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: '#64748b' }}>
                            <div><strong>{t('printEngine.plant')}</strong> {data.plantLabel || 'N/A'}</div>
                            <div><strong>{t('printEngine.location')}</strong> {data.LocationID || 'N/A'}</div>
                        </div>
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: '7pt', color: '#94a3b8', marginTop: '6px' }}>
                            <div>S/N: {data.Serial || '--'}</div>
                            <div>Model: {data.Model || '--'}</div>
                        </div>
                        <div style={{ marginTop: '10px', fontSize: '6pt', color: '#cbd5e1', textAlign: 'center' }}>
                            Scan with Trier OS → SCAN to open this asset record
                        </div>
                    </div>
                </div>
            );
            break;
        }

        case 'asset-qr-batch': {
            const batchItems = (data.items || []).slice(0, 100);
            const pages = [];
            for (let i = 0; i < batchItems.length; i += 10) {
                pages.push(batchItems.slice(i, i + 10));
            }
            content = (
                <>
                    {pages.map((page, pageIdx) => (
                        <div key={pageIdx} style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'repeat(5, 1fr)',
                            gap: '0', width: '8.5in', height: '11in', padding: '0.25in',
                            pageBreakAfter: pageIdx < pages.length - 1 ? 'always' : 'auto',
                            boxSizing: 'border-box'
                        }}>
                            {page.map((asset, idx) => {
                                const baseUrl = window.systemBaseUrl || window.location.origin;
                                const params = new URLSearchParams({
                                    scan: asset.ID,
                                    qDesc: asset.Description || 'N/A',
                                    qModel: asset.Model || 'N/A',
                                    qPlant: data.plantLabel || 'N/A',
                                    qLoc: asset.LocationID || 'N/A',
                                    plant: data.plantId || '',
                                });
                                const smartUrl = `${baseUrl}/?${params.toString()}`;
                                return (
                                    <div key={idx} style={{
                                        border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center',
                                        padding: '8px 12px', gap: '12px', overflow: 'hidden',
                                        width: '4in', height: '2in', boxSizing: 'border-box'
                                    }}>
                                        <AsyncQRImage text={smartUrl} size={150} style={{ width: '75px', height: '75px', flexShrink: 0 }} alt={asset.ID} />
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{ fontSize: '16pt', fontWeight: '900', color: '#1e1b4b', fontFamily: 'monospace', letterSpacing: '1px', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {asset.ID}
                                            </div>
                                            <div style={{ fontSize: '10pt', fontWeight: '600', color: '#334155', lineHeight: '1.2', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {asset.Description || 'No Description'}
                                            </div>
                                            <div style={{ fontSize: '8pt', color: '#64748b' }}>
                                                {asset.LocationID || ''} {asset.Model ? `• ${asset.Model}` : ''}
                                            </div>
                                            <div style={{ fontSize: '6pt', color: '#94a3b8', marginTop: '4px', textTransform: 'uppercase' }}>
                                                {data.plantLabel || ''} • Trier OS
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </>
            );
            break;
        }

        case 'site-access-pack':
            content = (
                <>
                    {/* Compact Header for 1-page fit */}
                    <div style={{ marginBottom: '20px', borderBottom: '3px solid #1e1b4b', paddingBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <img src={branding.documentLogo || "/assets/TrierLogoPrint.png"} alt="Trier OS" style={{ height: '100px', width: 'auto' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <h1 style={{ fontSize: '18pt', fontWeight: '900', color: '#1e1b4b', margin: 0 }}>{t('print.engine.facilityDigitalAccessPack')}</h1>
                            <div style={{ textAlign: 'right', fontSize: '8pt', color: '#475569' }}>
                                <div><strong>{t('print.engine.location')}</strong> {data.plantLabel}</div>
                                <div><strong>{t('print.engine.date')}</strong> {formatDate(new Date())}</div>
                                <div><strong>{t('print.engine.docId')}</strong> INVITE-{data.inviteCode}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '20px', margin: '15px 0' }}>
                        <div style={{ padding: '20px', background: '#f8fafc', border: '2px solid #cbd5e1', borderRadius: '12px', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '-10px', left: '20px', background: 'white', padding: '0 8px', fontSize: '0.65rem', color: '#64748b', fontWeight: 'bold' }}>{t('print.engine.secureFacilityPin')}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>Access Code for {data.plantLabel}</div>
                            <div style={{ fontSize: '4rem', fontWeight: '900', color: '#1e1b4b', letterSpacing: '6px', fontFamily: 'monospace', textAlign: 'center', margin: '5px 0' }}>{data.inviteCode}</div>
                            <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 'bold', textAlign: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                                {t('print.engine.sensitiveDocumentDoNot')}
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '15px', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                            <AsyncQRImage text={data.url} size={150} style={{ width: '130px', height: '130px' }} alt="Access QR" />
                            <div style={{ fontSize: '0.6rem', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>{t('print.engine.scanToAccessPortal')}</div>
                        </div>
                    </div>

                    {renderSectionHeader('Connection Logistics')}
                    <div style={{ padding: '10px 15px', background: '#f1f5f9', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div>
                                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Desktop (HTTP)</div>
                                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1e1b4b', fontFamily: 'monospace' }}>{data.httpUrl || data.url}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Mobile Setup (QR Target)</div>
                                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1e1b4b', fontFamily: 'monospace' }}>{data.url}</div>
                            </div>
                        </div>
                        {data.httpsUrl && (
                            <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px' }}>
                                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Mobile Secure (HTTPS) — Camera/Scanner Enabled</div>
                                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#10b981', fontFamily: 'monospace' }}>{data.httpsUrl}</div>
                            </div>
                        )}
                    </div>

                    {renderSectionHeader('Onboarding Procedure (SOP)')}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                        {[
                            { step: 1, title: 'Device Connection', desc: `Connect to facility Wi-Fi. Navigate to: ${data.url}` },
                            { step: 2, title: 'Facility ID', desc: `Confirm header displays "${data.plantLabel}".` },
                            { step: 3, title: 'Registration', desc: `Select "New User". Enter Facility PIN: ${data.inviteCode}` },
                            { step: 4, title: 'Configuration', desc: 'Enter Badge ID and Department. Create a secure password.' }
                        ].map(s => (
                            <div key={s.step} style={{ display: 'flex', gap: '15px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#cbd5e1', minWidth: '30px' }}>0{s.step}</div>
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#1e1b4b' }}>{s.title}</div>
                                    <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: '1.3' }}>{s.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: '25px', padding: '12px', background: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <div style={{ color: '#ea580c', fontWeight: 'bold', fontSize: '1rem' }}>⚠️</div>
                            <div style={{ fontSize: '0.75rem', color: '#9a3412', lineHeight: '1.3' }}>
                                <strong>{t('print.engine.itAdvisory')}</strong> Generated dynamically based on server instance. If the IP/Host changes, regenerate from the Enterprise Dashboard.
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
                        <div>Trier OS v1.1 • Document ID: {data.inviteCode}</div>
                        <div>{t('printEngine.trierOsEnterpriseMaintenancePlatform')}</div>
                    </div>
                </>
            );
            break;
        case 'fleet-vehicle': {
            const v = data.vehicle || {};
            content = (
                <>
                    {renderHeader('Fleet Vehicle Report', `FLT-${v.UnitNumber || v.ID}`)}
                    {renderSectionHeader('Vehicle Identification')}
                    {renderProperties([
                        { label: 'Unit Number', value: v.UnitNumber },
                        { label: 'VIN', value: v.VIN },
                        { label: 'Year / Make / Model', value: [v.Year, v.Make, v.Model].filter(Boolean).join(' ') },
                        { label: 'Vehicle Type', value: v.VehicleType },
                        { label: 'Status', value: v.Status },
                        { label: 'License Plate', value: [v.LicensePlate, v.PlateState].filter(Boolean).join(' - ') },
                        { label: 'Fuel Type', value: v.FuelType },
                        { label: 'Assigned Driver', value: v.AssignedDriver },
                        { label: 'Odometer', value: v.Odometer ? v.Odometer.toLocaleString() + ' mi' : null },
                        { label: 'Engine Hours', value: v.EngineHours ? v.EngineHours.toLocaleString() : null },
                        { label: 'Next PM Date', value: v.NextPMDate },
                        { label: 'PM Interval', value: v.PMIntervalMiles ? `${v.PMIntervalMiles.toLocaleString()} mi / ${v.PMIntervalDays || 90} days` : null },
                    ])}
                    {data.serviceHistory?.length > 0 && (
                        <>
                            {renderSectionHeader(`Service History (${data.serviceHistory.length})`)}
                            {renderTable(
                                ['Date', 'Type', 'Description', 'Cost', 'By'],
                                data.serviceHistory.slice(0, 25).map(s => [
                                    formatDate(s.ServiceDate) || '--',
                                    s.ServiceType || '--',
                                    s.Description || '--',
                                    s.TotalCost ? `$${s.TotalCost.toFixed(2)}` : '--',
                                    s.PerformedBy || '--'
                                ])
                            )}
                        </>
                    )}
                    {data.fuelLog?.length > 0 && (
                        <>
                            {renderSectionHeader(`Fuel Log (${data.fuelLog.length})`)}
                            {renderTable(
                                ['Date', 'Gallons', 'Cost', 'Odometer', 'MPG'],
                                data.fuelLog.slice(0, 20).map(fl => [
                                    formatDate(fl.FillDate) || '--',
                                    fl.Gallons?.toFixed(1) || '--',
                                    fl.TotalCost ? `$${fl.TotalCost.toFixed(2)}` : '--',
                                    fl.OdometerAtFill ? fl.OdometerAtFill.toLocaleString() : '--',
                                    fl.MPG ? fl.MPG.toFixed(1) : '--'
                                ])
                            )}
                        </>
                    )}
                    {renderSectionHeader('Fleet Maintenance Authorization')}
                    {renderSignatures(['Fleet Manager Signature', 'Date of Review'])}
                </>
            );
            break;
        }

        case 'fleet-dvir': {
            const dv = data.dvir || {};
            const items = data.items || [];
            const defectCount = items.filter(i => i.Condition === 'Defective').length;
            content = (
                <>
                    {renderHeader('Driver Vehicle Inspection Report', `DVIR-${dv.ID}`)}
                    {renderSectionHeader('Inspection Details')}
                    {renderProperties([
                        { label: 'DVIR #', value: dv.ID },
                        { label: 'Inspection Date', value: formatDate(dv.InspectionDate) },
                        { label: 'Driver', value: dv.Driver },
                        { label: 'Inspection Type', value: dv.InspectionType },
                        { label: 'Vehicle', value: [dv.UnitNumber, dv.Year, dv.Make, dv.Model].filter(Boolean).join(' ') },
                        { label: 'Odometer', value: dv.OdometerAtInspection ? dv.OdometerAtInspection.toLocaleString() + ' mi' : null },
                        { label: 'Result', value: dv.Status },
                        { label: 'Defects Found', value: defectCount > 0 ? `${defectCount} DEFECT(S)` : 'None' },
                        { label: 'Reviewed By', value: dv.ReviewedBy },
                        { label: 'Notes', value: dv.Notes },
                    ])}
                    {items.length > 0 && (
                        <>
                            {renderSectionHeader(`Inspection Checklist (${items.length} Items)`)}
                            {renderTable(
                                ['Category', 'Inspection Item', 'Condition', 'Defect Notes'],
                                items.map(it => [
                                    it.Category || '--',
                                    it.ItemDescription || '--',
                                    it.Condition || 'Pending',
                                    it.DefectNotes || '--'
                                ])
                            )}
                        </>
                    )}
                    {renderSectionHeader('Certification & Authorization')}
                    {renderSignatures(['Driver Signature', 'Mechanic / Reviewer', 'Date'])}
                </>
            );
            break;
        }

        case 'fleet-fuel-detail': {
            const f = data || {};
            content = (
                <>
                    {renderHeader('Fuel Log Entry', `FUEL-${f.ID}`)}
                    {renderSectionHeader('Fill-Up Details')}
                    {renderProperties([
                        { label: 'Entry #', value: f.ID },
                        { label: 'Vehicle', value: f.UnitNumber },
                        { label: 'Fill Date', value: formatDate(f.FillDate) },
                        { label: 'Gallons', value: f.Gallons?.toFixed(1) },
                        { label: 'Cost per Gallon', value: f.CostPerGallon ? `$${f.CostPerGallon.toFixed(3)}` : null },
                        { label: 'Total Cost', value: f.TotalCost ? `$${f.TotalCost.toFixed(2)}` : null },
                        { label: 'Odometer at Fill', value: f.OdometerAtFill ? f.OdometerAtFill.toLocaleString() + ' mi' : null },
                        { label: 'MPG', value: f.MPG ? f.MPG.toFixed(1) : null },
                        { label: 'Fuel Type', value: f.FuelType },
                        { label: 'Station', value: f.Station },
                        { label: 'DEF Gallons', value: f.DEFGallons || null },
                        { label: 'Logged By', value: f.LoggedBy },
                    ])}
                    {renderSectionHeader('Authorization')}
                    {renderSignatures(['Fleet Manager Signature', 'Date'])}
                </>
            );
            break;
        }

        case 'fleet-tire-detail': {
            const tire = data || {};
            content = (
                <>
                    {renderHeader('Tire Record', `TIRE-${tire.ID}`)}
                    {renderSectionHeader('Tire Information')}
                    {renderProperties([
                        { label: 'Tire ID', value: tire.ID },
                        { label: 'Vehicle', value: tire.UnitNumber },
                        { label: 'Position', value: tire.Position },
                        { label: 'Tire Serial #', value: tire.TireSerial },
                        { label: 'Brand', value: tire.Brand },
                        { label: 'Model', value: tire.Model },
                        { label: 'Size', value: tire.Size },
                        { label: 'Tread Depth', value: tire.TreadDepth != null ? `${tire.TreadDepth}/32"` : null },
                        { label: 'Date Installed', value: formatDate(tire.DateInstalled) },
                        { label: 'Mileage at Install', value: tire.MileageInstalled ? tire.MileageInstalled.toLocaleString() + ' mi' : null },
                        { label: 'Status', value: tire.Status },
                        { label: 'Last Measured', value: formatDate(tire.LastMeasuredDate) },
                    ])}
                    {renderSectionHeader('Authorization')}
                    {renderSignatures(['Fleet Manager Signature', 'Date'])}
                </>
            );
            break;
        }

        case 'fleet-license-detail': {
            const l = data || {};
            content = (
                <>
                    {renderHeader('CDL / License Record', `LIC-${l.ID}`)}
                    {renderSectionHeader('License Information')}
                    {renderProperties([
                        { label: 'License ID', value: l.ID },
                        { label: 'Driver Name', value: l.DriverName },
                        { label: 'License Number', value: l.LicenseNumber },
                        { label: 'State', value: l.State },
                        { label: 'License Class', value: l.LicenseClass ? `Class ${l.LicenseClass}` : null },
                        { label: 'Endorsements', value: l.Endorsements },
                        { label: 'Issue Date', value: formatDate(l.IssueDate) },
                        { label: 'Expiry Date', value: formatDate(l.ExpiryDate) },
                        { label: 'Medical Card Expiry', value: formatDate(l.MedicalCardExpiry) },
                        { label: 'Status', value: l.Status },
                        { label: 'Notes', value: l.Notes },
                    ])}
                    {renderSectionHeader('Authorization')}
                    {renderSignatures(['HR / Safety Manager', 'Driver Signature', 'Date'])}
                </>
            );
            break;
        }

        case 'fleet-dot-detail': {
            const d = data || {};
            content = (
                <>
                    {renderHeader('DOT Inspection Record', `DOT-${d.ID}`)}
                    {renderSectionHeader('Inspection Details')}
                    {renderProperties([
                        { label: 'Inspection ID', value: d.ID },
                        { label: 'Vehicle', value: d.UnitNumber },
                        { label: 'Inspection Date', value: formatDate(d.InspectionDate) },
                        { label: 'Inspector', value: d.Inspector },
                        { label: 'Inspection Type', value: d.InspectionType },
                        { label: 'Result', value: d.Result },
                        { label: 'Violation Count', value: d.ViolationCount || 0 },
                        { label: 'Decal Number', value: d.DecalNumber },
                        { label: 'Next Annual Due', value: formatDate(d.NextAnnualDue) },
                        { label: 'Notes', value: d.Notes },
                    ])}
                    {renderSectionHeader('Certification & Authorization')}
                    {renderSignatures(['Fleet Manager Signature', 'Inspector Signature', 'Date'])}
                </>
            );
            break;
        }

        case 'safety-permit-detail': {
            const p = data?.permit || data || {};
            content = (
                <>
                    {renderHeader('Safety Permit', p.PermitNumber)}
                    {renderSectionHeader('Permit Details')}
                    {renderProperties([
                        { label: 'Permit Number', value: p.PermitNumber },
                        { label: 'Permit Type', value: p.PermitType?.replace('_', ' ') },
                        { label: 'Status', value: p.Status },
                        { label: 'Location', value: p.Location },
                        { label: 'Issued By', value: p.IssuedBy },
                        { label: 'Issued At', value: formatDate(p.IssuedAt) },
                        { label: 'Expires At', value: formatDate(p.ExpiresAt) },
                        { label: 'Description', value: p.Description },
                        { label: 'Hot Work Type', value: p.HotWorkType },
                        { label: 'Fire Watch', value: p.FireWatchAssignedTo },
                        { label: 'Attendant', value: p.Attendant },
                        { label: 'Entry Supervisor', value: p.EntrySupervisor },
                        { label: 'Notes', value: p.Notes },
                    ])}
                    {data?.checklist?.length > 0 && (<>
                        {renderSectionHeader(`Safety Checklist (${data.checklist.filter(c=>c.Checked).length}/${data.checklist.length})`)}
                        <table style={{width:'100%',borderCollapse:'collapse',marginBottom:15,fontSize:'0.8rem'}}>
                            <thead><tr style={{background:'#f3f4f6'}}><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'left'}}>Category</th><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'left'}}>Item</th><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'center'}}>Status</th><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'left'}}>By</th></tr></thead>
                            <tbody>{data.checklist.map(c=><tr key={c.ID}><td style={{border:'1px solid #e5e7eb',padding:4}}>{c.Category}</td><td style={{border:'1px solid #e5e7eb',padding:4}}>{c.CheckItem}</td><td style={{border:'1px solid #e5e7eb',padding:4,textAlign:'center'}}>{c.Checked?'✓':'—'}</td><td style={{border:'1px solid #e5e7eb',padding:4}}>{c.CheckedBy||'—'}</td></tr>)}</tbody>
                        </table>
                    </>)}
                    {renderSectionHeader('Authorization & Signatures')}
                    {renderSignatures(['Permit Issuer Signature', 'Safety Supervisor Signature', 'Date'])}
                </>
            );
            break;
        }

        case 'safety-incident-detail': {
            const i = data?.incident || data || {};
            const expenses = data?.expenses || [];
            const expenseTotal = expenses.reduce((s, x) => s + (x.Amount || 0), 0);
            content = (
                <>
                    {renderHeader('Safety Incident Report', `INC-${i.ID}`)}
                    {renderSectionHeader('Incident Information')}
                    {renderProperties([
                        { label: 'Title', value: i.Title },
                        { label: 'Incident Date', value: formatDate(i.IncidentDate) },
                        { label: 'Incident Type', value: i.IncidentType },
                        { label: 'Severity', value: i.Severity },
                        { label: 'Location', value: i.Location },
                        { label: 'Reported By', value: i.ReportedBy },
                        { label: 'Status', value: i.Status },
                        { label: 'OSHA Recordable', value: i.OshaRecordable ? 'Yes' : 'No' },
                        { label: 'Lost Time Days', value: i.LostTimeDays || 0 },
                        { label: 'Injury / Damage Cost', value: i.IndirectCost ? `$${Number(i.IndirectCost).toLocaleString()}` : null },
                    ])}
                    {renderSectionHeader('Investigation Details')}
                    {renderProperties([
                        { label: 'Description', value: i.Description },
                        { label: 'Root Cause', value: i.RootCause },
                        { label: 'Corrective Actions', value: i.CorrectiveActions },
                        { label: 'Immediate Actions', value: i.ImmediateActions },
                    ])}
                    {expenses.length > 0 && (<>
                        {renderSectionHeader(`Expense Line Items (${expenses.length})`)}
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 15, fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: '#f3f4f6' }}>
                                    <th style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'left' }}>Date</th>
                                    <th style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'left' }}>Hospital / Doctor / Provider</th>
                                    <th style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'left' }}>Bill/Ref #</th>
                                    <th style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'left' }}>Date Received</th>
                                    <th style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'left' }}>Date Paid</th>
                                    <th style={{ border: '1px solid #e5e7eb', padding: 6, textAlign: 'right' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expenses.map(e => (
                                    <tr key={e.ID}>
                                        <td style={{ border: '1px solid #e5e7eb', padding: 4 }}>{formatDate(e.ExpenseDate) || '—'}</td>
                                        <td style={{ border: '1px solid #e5e7eb', padding: 4 }}>{e.ProviderName || '—'}</td>
                                        <td style={{ border: '1px solid #e5e7eb', padding: 4 }}>{e.BillNumber || '—'}</td>
                                        <td style={{ border: '1px solid #e5e7eb', padding: 4 }}>{formatDate(e.DateReceived) || '—'}</td>
                                        <td style={{ border: '1px solid #e5e7eb', padding: 4 }}>{formatDate(e.DatePaid) || '—'}</td>
                                        <td style={{ border: '1px solid #e5e7eb', padding: 4, textAlign: 'right' }}>${Number(e.Amount || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                                <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                                    <td colSpan={5} style={{ border: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'right' }}>Total</td>
                                    <td style={{ border: '1px solid #e5e7eb', padding: '6px 4px', textAlign: 'right' }}>${expenseTotal.toLocaleString()}</td>
                                </tr>
                            </tbody>
                        </table>
                    </>)}
                    {renderSectionHeader('Authorization & Signatures')}
                    {renderSignatures(['Safety Manager Signature', 'Plant Manager Signature', 'Date'])}
                </>
            );
            break;
        }

        case 'safety-calibration-detail': {
            const inst = data?.instrument || data || {};
            content = (
                <>
                    {renderHeader('Calibration Certificate', inst.InstrumentID)}
                    {renderSectionHeader('Instrument Information')}
                    {renderProperties([
                        { label: 'Instrument ID', value: inst.InstrumentID },
                        { label: 'Description', value: inst.Description },
                        { label: 'Type', value: inst.InstrumentType },
                        { label: 'Serial Number', value: inst.SerialNumber },
                        { label: 'Location', value: inst.Location },
                        { label: 'Manufacturer', value: inst.Manufacturer },
                        { label: 'Model', value: inst.Model },
                        { label: 'Tolerance', value: inst.Tolerance },
                        { label: 'Last Calibration', value: formatDate(inst.LastCalibrationDate) },
                        { label: 'Next Due', value: formatDate(inst.NextCalibrationDue) },
                        { label: 'Status', value: inst.Status },
                    ])}
                    {data?.history?.length > 0 && (<>
                        {renderSectionHeader(`Calibration History (${data.history.length} records)`)}
                        <table style={{width:'100%',borderCollapse:'collapse',marginBottom:15,fontSize:'0.8rem'}}>
                            <thead><tr style={{background:'#f3f4f6'}}><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'left'}}>Date</th><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'left'}}>Result</th><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'left'}}>As Found</th><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'left'}}>As Left</th><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'left'}}>By</th><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'left'}}>Cert #</th></tr></thead>
                            <tbody>{data.history.map(h=><tr key={h.ID}><td style={{border:'1px solid #e5e7eb',padding:4}}>{formatDate(h.CalibrationDate)}</td><td style={{border:'1px solid #e5e7eb',padding:4}}>{h.Result}</td><td style={{border:'1px solid #e5e7eb',padding:4}}>{h.AsFoundReading||'—'}</td><td style={{border:'1px solid #e5e7eb',padding:4}}>{h.AsLeftReading||'—'}</td><td style={{border:'1px solid #e5e7eb',padding:4}}>{h.CalibratedBy||'—'}</td><td style={{border:'1px solid #e5e7eb',padding:4}}>{h.CertificateNumber||'—'}</td></tr>)}</tbody>
                        </table>
                    </>)}
                    {renderSectionHeader('Certification & Approval')}
                    {renderSignatures(['Calibration Technician Signature', 'Quality Manager Signature', 'Date'])}
                </>
            );
            break;
        }

        case 'tool-detail': {
            const tool = data || {};
            content = (
                <>
                    {renderHeader('Tool Record', tool.ToolID)}
                    {renderSectionHeader('Tool Information')}
                    {renderProperties([
                        { label: 'Tool ID', value: tool.ToolID },
                        { label: 'Description', value: tool.Description },
                        { label: 'Category', value: tool.Category },
                        { label: 'Serial Number', value: tool.SerialNumber },
                        { label: 'Manufacturer', value: tool.Manufacturer },
                        { label: 'Location', value: tool.Location },
                        { label: 'Condition', value: tool.Condition },
                        { label: 'Status', value: tool.Status },
                        { label: 'Purchase Price', value: tool.PurchasePrice ? `$${tool.PurchasePrice}` : null },
                    ])}
                    {renderSectionHeader('Custody & Authorization')}
                    {renderSignatures(['Tool Room Attendant Signature', 'Supervisor Signature', 'Date'])}
                </>
            );
            break;
        }

        case 'tool-checkout-slip': {
            const tool = data.tool || {};
            const co = data.currentCheckout || {};
            const hist = data.history || [];
            content = (
                <>
                    {renderHeader('Tool Checkout / Return Slip', tool.ToolID)}
                    {renderSectionHeader('Tool Information')}
                    {renderProperties([
                        { label: 'Tool ID', value: tool.ToolID },
                        { label: 'Description', value: tool.Description },
                        { label: 'Category', value: tool.Category },
                        { label: 'Serial Number', value: tool.SerialNumber },
                        { label: 'Condition', value: tool.Condition },
                        { label: 'Location', value: tool.Location },
                    ])}
                    {co.CheckedOutBy && (<>
                        {renderSectionHeader('Current Checkout')}
                        {renderProperties([
                            { label: 'Checked Out By', value: co.CheckedOutBy },
                            { label: 'Checked Out Date', value: formatDate(co.CheckedOutDate) },
                            { label: 'Due Back', value: formatDate(co.DueBackDate) },
                            { label: 'Notes', value: co.Notes },
                        ])}
                    </>)}
                    {hist.length > 1 && (<>
                        {renderSectionHeader(`Recent History (${Math.min(hist.length, 10)})`)}
                        {renderTable(
                            ['Date Out', 'By', 'Due', 'Returned', 'Condition'],
                            hist.slice(0, 10).map(h => [
                                formatDate(h.CheckedOutDate) || '--',
                                h.CheckedOutBy,
                                formatDate(h.DueBackDate) || '--',
                                formatDate(h.ReturnedDate) || 'Still Out',
                                h.ReturnCondition || '--'
                            ])
                        )}
                    </>)}
                    {renderSectionHeader('Signatures')}
                    {renderSignatures(['Employee Signature', 'Tool Room Attendant', 'Date'])}
                </>
            );
            break;
        }

        case 'tool-overdue-report': {
            const items = data.items || [];
            content = (
                <>
                    {renderHeader('Overdue Tool Report', 'Action Required')}
                    {renderSectionHeader(`Overdue Tools (${items.length})`)}
                    {items.length > 0 ? renderTable(
                        ['Tool ID', 'Description', 'Checked Out By', 'Due Back', 'Days Overdue', 'Notes'],
                        items.map(o => {
                            const days = Math.floor((new Date() - new Date(o.DueBackDate)) / 86400000);
                            return [o.ToolID, o.Description, o.CheckedOutBy, formatDate(o.DueBackDate), `${days} days`, o.Notes || '--'];
                        })
                    ) : <p style={{ textAlign: 'center', color: '#16a34a' }}>No overdue tools — all returned on time.</p>}
                    {renderSectionHeader('Supervisor Review')}
                    {renderSignatures(['Tool Room Supervisor', 'Maintenance Manager', 'Date'])}
                </>
            );
            break;
        }

        case 'tool-stats-report': {
            const s = data || {};
            content = (
                <>
                    {renderHeader('Tool Program Summary Report', 'Monthly Review')}
                    {renderSectionHeader('Program KPIs')}
                    {renderProperties([
                        { label: 'Total Tools', value: s.total },
                        { label: 'Available', value: s.available },
                        { label: 'Currently Checked Out', value: s.checkedOut },
                        { label: 'Overdue', value: s.overdue },
                        { label: 'Needs Repair', value: s.needsRepair },
                        { label: 'Total Asset Value', value: s.totalValue ? `$${Number(s.totalValue).toLocaleString()}` : null },
                    ])}
                    {s.byCategory?.length > 0 && (<>
                        {renderSectionHeader('Inventory by Category')}
                        {renderTable(
                            ['Category', 'Count'],
                            s.byCategory.map(c => [c.Category, c.count])
                        )}
                    </>)}
                    {renderSectionHeader('Review & Approval')}
                    {renderSignatures(['Tool Room Supervisor', 'Maintenance Manager', 'Date'])}
                </>
            );
            break;
        }

        case 'contractor-detail': {
            const c = data?.contractor || data || {};
            content = (
                <>
                    {renderHeader('Contractor Record', c.CompanyName)}
                    {renderSectionHeader('Company Information')}
                    {renderProperties([
                        { label: 'Company Name', value: c.CompanyName },
                        { label: 'Contact Name', value: c.ContactName },
                        { label: 'Email', value: c.ContactEmail },
                        { label: 'Phone', value: c.ContactPhone },
                        { label: 'Trade / Specialty', value: c.TradeSpecialty },
                        { label: 'Hourly Rate', value: c.HourlyRate ? `$${c.HourlyRate}/hr` : null },
                        { label: 'Day Rate', value: c.DayRate ? `$${c.DayRate}/day` : null },
                        { label: 'Insurance Expiry', value: formatDate(c.InsuranceExpiry) },
                        { label: 'Liability Limit', value: c.LiabilityLimit ? `$${Number(c.LiabilityLimit).toLocaleString()}` : null },
                        { label: 'Prequalification Status', value: c.PrequalificationStatus },
                        { label: 'Overall Rating', value: data?.avgPerformance?.toFixed(1) || c.OverallRating },
                        { label: 'Total Spend', value: data?.totalSpend ? `$${data.totalSpend.toLocaleString()}` : null },
                    ])}
                    {data?.certs?.length > 0 && (<>
                        {renderSectionHeader('Certifications')}
                        <table style={{width:'100%',borderCollapse:'collapse',marginBottom:15,fontSize:'0.8rem'}}>
                            <thead><tr style={{background:'#f3f4f6'}}><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'left'}}>Cert</th><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'left'}}>Number</th><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'left'}}>Issued By</th><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'left'}}>Expiry</th><th style={{border:'1px solid #e5e7eb',padding:6,textAlign:'left'}}>Status</th></tr></thead>
                            <tbody>{data.certs.map(ct=><tr key={ct.ID}><td style={{border:'1px solid #e5e7eb',padding:4}}>{ct.CertName}</td><td style={{border:'1px solid #e5e7eb',padding:4}}>{ct.CertNumber||'—'}</td><td style={{border:'1px solid #e5e7eb',padding:4}}>{ct.IssuingBody||'—'}</td><td style={{border:'1px solid #e5e7eb',padding:4}}>{formatDate(ct.ExpiryDate)||'—'}</td><td style={{border:'1px solid #e5e7eb',padding:4}}>{ct.Status}</td></tr>)}</tbody>
                        </table>
                    </>)}
                    {renderSectionHeader('Authorization')}
                    {renderSignatures(['Maintenance Manager Signature', 'Safety Manager Signature', 'Date'])}
                </>
            );
            break;
        }

        case 'contractor-expiry-report': {
            const ins = data.expiringInsurance || [];
            const certs = data.expiringCerts || [];
            content = (
                <>
                    {renderHeader('Contractor Expiration Alert Report', 'Action Required')}
                    {ins.length > 0 && (<>
                        {renderSectionHeader(`Insurance Expiring (${ins.length})`)}
                        {renderTable(
                            ['Company', 'Expiry Date'],
                            ins.map(i => [i.CompanyName, formatDate(i.InsuranceExpiry) || '--'])
                        )}
                    </>)}
                    {certs.length > 0 && (<>
                        {renderSectionHeader(`Certifications Expiring (${certs.length})`)}
                        {renderTable(
                            ['Company', 'Certification', 'Cert #', 'Expiry Date'],
                            certs.map(c => [c.CompanyName, c.CertName, c.CertNumber || '--', formatDate(c.ExpiryDate) || '--'])
                        )}
                    </>)}
                    {renderSectionHeader('Review & Follow-Up')}
                    {renderSignatures(['Procurement Manager', 'Safety Manager', 'Date'])}
                </>
            );
            break;
        }

        case 'contractor-job-detail': {
            const j = data || {};
            content = (
                <>
                    {renderHeader('Contractor Job Record', j.WorkOrderID || 'Job Detail')}
                    {renderSectionHeader('Job Information')}
                    {renderProperties([
                        { label: 'Work Order', value: j.WorkOrderID },
                        { label: 'Contractor', value: j.CompanyName },
                        { label: 'Trade', value: j.TradeSpecialty },
                        { label: 'Start Date', value: formatDate(j.StartDate) },
                        { label: 'End Date', value: formatDate(j.EndDate) },
                        { label: 'Agreed Rate', value: j.AgreedRate ? `$${j.AgreedRate}/hr` : null },
                        { label: 'Actual Cost', value: j.ActualCost ? `$${j.ActualCost.toLocaleString()}` : null },
                        { label: 'Hours Worked', value: j.HoursWorked },
                        { label: 'Performance Rating', value: j.PerformanceRating ? `${j.PerformanceRating} / 5` : null },
                        { label: 'Safety Incidents', value: j.SafetyIncidents || '0' },
                    ])}
                    {j.Description && (<>
                        {renderSectionHeader('Scope of Work')}
                        {renderDescription(j.Description)}
                    </>)}
                    {j.Notes && (<>
                        {renderSectionHeader('Notes')}
                        {renderDescription(j.Notes)}
                    </>)}
                    {renderSectionHeader('Approval')}
                    {renderSignatures(['Maintenance Supervisor', 'Contractor Rep', 'Date'])}
                </>
            );
            break;
        }

        case 'contractor-jobs-report': {
            const jbs = data.jobs || [];
            content = (
                <>
                    {renderHeader('Contractor Job History Report', `${jbs.length} Records`)}
                    {renderSectionHeader('All Jobs')}
                    {jbs.length > 0 ? renderTable(
                        ['WO #', 'Contractor', 'Trade', 'Description', 'Start', 'End', 'Cost', 'Hours', 'Rating'],
                        jbs.map(j => [
                            j.WorkOrderID || '--', j.CompanyName || '--', j.TradeSpecialty || '--',
                            (j.Description || '').substring(0, 50), formatDate(j.StartDate) || '--',
                            formatDate(j.EndDate) || '--',
                            j.ActualCost ? `$${j.ActualCost.toLocaleString()}` : '--',
                            j.HoursWorked || '--', j.PerformanceRating ? `${j.PerformanceRating}/5` : '--'
                        ])
                    ) : <p>{t('printEngine.noJobRecords')}</p>}
                    {renderSectionHeader('Review')}
                    {renderSignatures(['Maintenance Manager', 'Procurement Director', 'Date'])}
                </>
            );
            break;
        }

        case 'contractor-stats-report': {
            const s = data || {};
            content = (
                <>
                    {renderHeader('Contractor Program Summary', 'Monthly Review')}
                    {renderSectionHeader('Program KPIs')}
                    {renderProperties([
                        { label: 'Total Contractors', value: s.total },
                        { label: 'Approved', value: s.approved },
                        { label: 'Average Rating', value: s.avgRating },
                        { label: 'YTD Spend', value: s.ytdSpend ? `$${Number(s.ytdSpend).toLocaleString()}` : null },
                        { label: 'All-Time Spend', value: s.totalSpend ? `$${Number(s.totalSpend).toLocaleString()}` : null },
                        { label: 'Expiring Insurance', value: s.expiringInsurance },
                        { label: 'Expiring Certs', value: s.expiringCerts },
                    ])}
                    {s.byTrade?.length > 0 && (<>
                        {renderSectionHeader('By Trade Specialty')}
                        {renderTable(
                            ['Trade', 'Count'],
                            s.byTrade.map(trade => [trade.TradeSpecialty || 'Unspecified', trade.count])
                        )}
                    </>)}
                    {renderSectionHeader('Review & Approval')}
                    {renderSignatures(['Procurement Manager', 'Plant Manager', 'Date'])}
                </>
            );
            break;
        }

        case 'catalog-internal':
            const isTaskCatalog = data.type === 'tasks';
            const isPMCatalog = data.type === 'pm-schedules';
            const isAssetCatalog = data.type === 'assets';
            const isWOCatalog = data.type === 'work-orders';
            const isPartCatalog = data.type === 'parts';
            const isVendorCatalog = data.type === 'vendors';
            const isLogisticsCatalog = data.type === 'logistics';
            const isFleetCatalog = data.type === 'fleet-vehicles';
            const isFleetDVIR = data.type === 'fleet-dvir';
            const isFleetFuel = data.type === 'fleet-fuel';
            const isFleetTires = data.type === 'fleet-tires';
            const isFleetLicenses = data.type === 'fleet-licenses';
            const isFleetDOT = data.type === 'fleet-dot';
            
            let title = 'Standard Operating Procedure Library';
            let headers = ['SOP ID', 'Description', 'Location', 'Revision'];
            
            if (isTaskCatalog) {
                title = 'Procedural Task Master Catalog';
                headers = ['Task ID', 'Description', 'Category', 'Process Note'];
            } else if (isPMCatalog) {
                title = 'Preventative Maintenance Registry';
                headers = ['PM ID', 'Description', 'Frequency', 'Next Run', 'Asset'];
            } else if (isAssetCatalog) {
                title = 'Enterprise Asset Registry';
                headers = ['Asset ID', 'Description', 'Type', 'Location', 'Status'];
            } else if (isWOCatalog) {
                title = 'Maintenance Work Order Ledger';
                headers = ['WO #', 'Description', 'Asset', 'Status', 'Date'];
            } else if (isPartCatalog) {
                title = 'Inventory Component Master';
                headers = ['Part ID', 'Description', 'Stock', 'Unit Cost', 'Bin'];
            } else if (isVendorCatalog) {
                title = 'Vendor Procurement Catalog';
                headers = ['Part ID', 'Description', 'Vendor', 'Last Buy', 'Cost'];
            } else if (isLogisticsCatalog) {
                title = 'Inter-Site Transfer Ledger';
                headers = ['ID', 'From Site', 'To Site', 'Part #', 'Qty', 'Status'];
            } else if (isFleetCatalog) {
                title = 'Fleet & Truck Shop — Vehicles';
                headers = ['Unit #', 'Year', 'Make / Model', 'Type', 'VIN', 'Status', 'Odometer', 'PM Due'];
            } else if (isFleetDVIR) {
                title = 'Fleet & Truck Shop — DVIR Reports';
                headers = ['Date', 'Vehicle', 'Driver', 'Type', 'Result', 'Defects'];
            } else if (isFleetFuel) {
                title = 'Fleet & Truck Shop — Fuel Log';
                headers = ['Date', 'Vehicle', 'Gallons', '$/Gal', 'Total', 'Odometer', 'MPG', 'Station'];
            } else if (isFleetTires) {
                title = 'Fleet & Truck Shop — Tire Tracker';
                headers = ['Vehicle', 'Position', 'Serial', 'Brand / Model', 'Size', 'Tread Depth', 'Installed', 'Status'];
            } else if (isFleetLicenses) {
                title = 'Fleet & Truck Shop — CDL & Licenses';
                headers = ['Driver', 'Class', 'License #', 'State', 'Endorsements', 'Expiry', 'Med Card', 'Status'];
            } else if (isFleetDOT) {
                title = 'Fleet & Truck Shop — DOT Inspections';
                headers = ['Date', 'Vehicle', 'Inspector', 'Type', 'Result', 'Violations', 'Decal #', 'Next Due'];
            } else if (data.type === 'utilities-all') {
                title = 'Utility Intelligence — All Records';
                headers = ['Date', 'Type', 'Supplier', 'Reading', 'Unit Cost', 'Total Bill', 'Notes'];
            } else if (data.type === 'utilities-electricity') {
                title = 'Utility Intelligence — Electricity';
                headers = ['Date', 'Supplier', 'Reading (kWh)', 'Unit Cost', 'Total Bill', 'Notes'];
            } else if (data.type === 'utilities-water') {
                title = 'Utility Intelligence — Water';
                headers = ['Date', 'Supplier', 'Reading (GAL)', 'Unit Cost', 'Total Bill', 'Notes'];
            } else if (data.type === 'utilities-gas') {
                title = 'Utility Intelligence — Gas';
                headers = ['Date', 'Supplier', 'Reading (THERM)', 'Unit Cost', 'Total Bill', 'Notes'];
            } else if (data.type === 'utilities-dashboard') {
                title = 'Utility Intelligence — Consumption Summary';
                headers = ['Date', 'Type', 'Supplier', 'Reading', 'Unit Cost', 'Total Bill'];
            }

            content = (
                <>
                    {renderHeader(title, 'CAT-INTERNAL')}
                    {renderSectionHeader('Official Record of Practice')}
                    {renderTable(
                        headers,
                        data.items.slice(0, 100).map(item => { // Limit to 100 for performance
                            if (isTaskCatalog) return [
                                item.ID,
                                item.Description || item.Descript || 'N/A',
                                item.TaskTypID || 'General',
                                (item.Tasks || item.Instructions || '').substring(0, 200) + ((item.Tasks || item.Instructions || '').length > 200 ? '...' : '')
                            ];
                            if (isPMCatalog) return [
                                item.ID,
                                item.Description || 'N/A',
                                `${item.Freq} ${item.FreqUnit}`,
                                formatDate(item.NextDate) || 'N/A',
                                item.AstID || '--'
                            ];
                            if (isAssetCatalog) return [
                                item.ID,
                                item.Description || 'N/A',
                                item.AssetType || '--',
                                item.LocationID || '--',
                                item.Active ? 'ACTIVE' : 'INACTIVE'
                            ];
                            if (isWOCatalog) return [
                                item.ID || item.WorkOrderNumber,
                                item.Description || 'N/A',
                                item.AstID || '--',
                                item.StatusLabel || item.StatusID || 'OPEN',
                                formatDate(item.AddDate) || '--'
                            ];
                            if (isPartCatalog) return [
                                item.ID,
                                (item.Description || 'N/A').substring(0, 50),
                                item.Stock || '0',
                                `$${parseFloat(item.UnitCost || 0).toFixed(2)}`,
                                item.BinNum || '--'
                            ];
                            if (isVendorCatalog) return [
                                item.PartID,
                                (item.PartDesc || 'N/A').substring(0, 50),
                                item.VendorID || 'N/A',
                                formatDate(item.PurchaseDate) || 'N/A',
                                `$${parseFloat(item.PurchaseCost || 0).toFixed(2)}`
                            ];
                            if (isLogisticsCatalog) return [
                                item.ID,
                                item.RequestingPlant || '--',
                                item.FulfillingPlant || '--',
                                item.PartID,
                                item.Quantity,
                                item.Status
                            ];
                            if (isFleetCatalog) return [
                                item.UnitNumber || item.ID,
                                item.Year || '--',
                                [item.Make, item.Model].filter(Boolean).join(' ') || '--',
                                item.VehicleType || '--',
                                item.VIN || '--',
                                item.Status || 'Active',
                                item.Odometer ? item.Odometer.toLocaleString() : '--',
                                item.NextPMDate || '--'
                            ];
                            if (isFleetDVIR) return [
                                formatDate(item.InspectionDate) || '--',
                                item.UnitNumber || `#${item.VehicleID}`,
                                item.Driver || '--',
                                item.InspectionType || '--',
                                item.Status || '--',
                                item.DefectsFound || '0'
                            ];
                            if (isFleetFuel) return [
                                formatDate(item.FillDate) || '--',
                                item.UnitNumber || '--',
                                item.Gallons?.toFixed(1) || '--',
                                item.CostPerGallon ? `$${item.CostPerGallon.toFixed(3)}` : '--',
                                item.TotalCost ? `$${item.TotalCost.toFixed(2)}` : '--',
                                item.OdometerAtFill ? item.OdometerAtFill.toLocaleString() : '--',
                                item.MPG ? item.MPG.toFixed(1) : '--',
                                item.Station || '--'
                            ];
                            if (isFleetTires) return [
                                item.UnitNumber || '--',
                                item.Position || '--',
                                item.TireSerial || '--',
                                [item.Brand, item.Model].filter(Boolean).join(' ') || '--',
                                item.Size || '--',
                                item.TreadDepth != null ? `${item.TreadDepth}/32"` : '--',
                                formatDate(item.DateInstalled) || '--',
                                item.Status || '--'
                            ];
                            if (isFleetLicenses) return [
                                item.DriverName || '--',
                                `Class ${item.LicenseClass || '-'}`,
                                item.LicenseNumber || '--',
                                item.State || '--',
                                item.Endorsements || '--',
                                formatDate(item.ExpiryDate) || '--',
                                formatDate(item.MedicalCardExpiry) || '--',
                                item.Status || '--'
                            ];
                            if (isFleetDOT) return [
                                formatDate(item.InspectionDate) || '--',
                                item.UnitNumber || '--',
                                item.Inspector || '--',
                                item.InspectionType || '--',
                                item.Result || '--',
                                item.ViolationCount || '0',
                                item.DecalNumber || '--',
                                formatDate(item.NextAnnualDue) || '--'
                            ];
                            if (data.type === 'utilities-all' || data.type === 'utilities-dashboard') return [
                                formatDate(item.ReadingDate) || '--',
                                item.Type || '--',
                                item.SupplierName || '--',
                                `${Number(item.MeterReading || 0).toLocaleString()}`,
                                `$${Number(item.CostPerUnit || 0).toFixed(4)}`,
                                `$${Number(item.BillAmount || 0).toLocaleString()}`,
                                ...(data.type === 'utilities-all' ? [(item.Notes || '--').substring(0, 60)] : [])
                            ];
                            if (data.type === 'utilities-electricity' || data.type === 'utilities-water' || data.type === 'utilities-gas') return [
                                formatDate(item.ReadingDate) || '--',
                                item.SupplierName || '--',
                                `${Number(item.MeterReading || 0).toLocaleString()}`,
                                `$${Number(item.CostPerUnit || 0).toFixed(4)}`,
                                `$${Number(item.BillAmount || 0).toLocaleString()}`,
                                (item.Notes || '--').substring(0, 60)
                            ];
                            return [
                                item.ID,
                                item.Description || item.Descript || 'N/A',
                                item.plantLabel || 'Demo Plant 1',
                                `Rev ${item.RevNum || 0}`
                            ];
                        })
                    )}
                    {data.items.length > 100 && (
                        <div style={{ textAlign: 'center', fontSize: '8pt', color: '#94a3b8', margin: '10px 0' }}>
                            ... truncated for brevity (showing first 100 of {data.items.length} records) ...
                        </div>
                    )}
                    {/* Utility Summary Footer */}
                    {(data.type || '').startsWith('utilities-') && data.items.length > 0 && (
                        <>
                            {renderSectionHeader('Summary Totals')}
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginTop: '8px' }}>
                                <tbody>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '6px 10px', fontWeight: 700, width: '50%' }}>Total Records:</td>
                                        <td style={{ padding: '6px 10px' }}>{data.items.length}</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '6px 10px', fontWeight: 700 }}>Total Consumption:</td>
                                        <td style={{ padding: '6px 10px' }}>{data.items.reduce((s, i) => s + (Number(i.MeterReading) || 0), 0).toLocaleString()}</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                        <td style={{ padding: '6px 10px', fontWeight: 700 }}>Total Cost:</td>
                                        <td style={{ padding: '6px 10px', fontWeight: 700 }}>${data.items.reduce((s, i) => s + (Number(i.BillAmount) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '6px 10px', fontWeight: 700 }}>Avg Cost Per Unit:</td>
                                        <td style={{ padding: '6px 10px' }}>${(data.items.reduce((s, i) => s + (Number(i.CostPerUnit) || 0), 0) / Math.max(data.items.length, 1)).toFixed(4)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </>
                    )}
                    {renderSectionHeader('Document Verification')}
                    {renderSignatures(['Reviewer Name', 'Date of Catalog Audit'])}
                </>
            );
            break;

        // ══════════════════════════════════════════════════════════════════
        // ENGINEERING TOOLS PRINT TYPES
        // ══════════════════════════════════════════════════════════════════

        case 'engineering-rca-detail': {
            const rca = data.rca || data;
            content = (
                <>
                    {renderHeader('Root Cause Analysis Investigation', `RCA-${rca.ID}`)}
                    {renderSectionHeader('Investigation Summary')}
                    {renderProperties([
                        { label: 'RCA Number', value: `RCA-${rca.ID}` },
                        { label: 'Title', value: rca.Title },
                        { label: 'Incident Date', value: formatDate(rca.IncidentDate) },
                        { label: 'Asset', value: rca.AssetID },
                        { label: 'Investigator', value: rca.Investigator },
                        { label: 'Status', value: rca.Status },
                        { label: 'Work Order', value: rca.WorkOrderID },
                        { label: 'Plant', value: rca.PlantID },
                    ])}
                    {rca.Summary && (<>
                        {renderSectionHeader('Problem Statement')}
                        {renderDescription(rca.Summary)}
                    </>)}
                    {rca.RootCause && (<>
                        {renderSectionHeader('Root Cause Determination')}
                        {renderDescription(rca.RootCause)}
                    </>)}
                    {rca.CorrectiveAction && (<>
                        {renderSectionHeader('Corrective Action')}
                        {renderDescription(rca.CorrectiveAction)}
                    </>)}
                    {data.whySteps?.length > 0 && (<>
                        {renderSectionHeader('5-Why Analysis')}
                        {renderTable(
                            ['Step', 'Question', 'Answer', 'Evidence'],
                            data.whySteps.map(w => [
                                `Why ${w.StepNumber || w.WhyNumber || '?'}`,
                                w.Question || '--',
                                w.Answer || '--',
                                w.EvidenceNotes || '--'
                            ])
                        )}
                    </>)}
                    {data.fishbone?.length > 0 && (<>
                        {renderSectionHeader('Fishbone (Ishikawa) Analysis')}
                        {renderTable(
                            ['Category', 'Cause', 'Sub-Cause'],
                            data.fishbone.map(f => [f.Category, f.Cause, f.SubCause || '--'])
                        )}
                    </>)}
                    {renderSectionHeader('Review & Approval')}
                    {renderSignatures(['Investigator Signature', 'Engineering Manager Approval', 'Date'])}
                </>
            );
            break;
        }

        case 'engineering-fmea-detail': {
            const ws = data.worksheet || data;
            const modes = data.modes || [];
            content = (
                <>
                    {renderHeader('Failure Mode & Effects Analysis', `FMEA-${ws.ID}`)}
                    {renderSectionHeader('Worksheet Information')}
                    {renderProperties([
                        { label: 'Worksheet ID', value: `FMEA-${ws.ID}` },
                        { label: 'Title', value: ws.Title },
                        { label: 'Asset / System', value: ws.AssetID },
                        { label: 'Component', value: ws.SystemComponent },
                        { label: 'Status', value: ws.Status },
                        { label: 'Created By', value: ws.CreatedBy },
                        { label: 'Plant', value: ws.PlantID },
                    ])}
                    {modes.length > 0 && (<>
                        {renderSectionHeader(`Failure Modes (${modes.length})`)}
                        {renderTable(
                            ['Failure Mode', 'Effect', 'Cause', 'S', 'O', 'D', 'RPN', 'Recommended Action', 'Owner'],
                            modes.map(m => [
                                m.FailureMode,
                                m.FailureEffect || '--',
                                m.FailureCause || '--',
                                m.Severity,
                                m.Occurrence,
                                m.Detection,
                                m.RPN,
                                m.RecommendedAction || '--',
                                m.ActionOwner || '--'
                            ])
                        )}
                        <div style={{ marginTop: '15px', padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <div className="print-grid-2">
                                <div className="print-detail-row">
                                    <span className="print-label">{t('printEngine.highestRpn')}</span>
                                    <span className="print-value" style={{ fontWeight: 'bold', color: '#dc2626' }}>{Math.max(...modes.map(m => m.RPN || 0))}</span>
                                </div>
                                <div className="print-detail-row">
                                    <span className="print-label">{t('printEngine.totalFailureModes')}</span>
                                    <span className="print-value">{modes.length}</span>
                                </div>
                                <div className="print-detail-row">
                                    <span className="print-label">{t('printEngine.criticalRpn100')}</span>
                                    <span className="print-value">{modes.filter(m => (m.RPN || 0) >= 100).length}</span>
                                </div>
                            </div>
                        </div>
                    </>)}
                    {renderSectionHeader('Review & Approval')}
                    {renderSignatures(['Reliability Engineer', 'Engineering Manager Approval', 'Date'])}
                </>
            );
            break;
        }

        case 'engineering-ecn-detail': {
            const ecn = data.ecn || data;
            const approvals = data.approvals || [];
            content = (
                <>
                    {renderHeader('Engineering Change Notice', ecn.ECNNumber || `ECN-${ecn.ID}`)}
                    {renderSectionHeader('Change Request Details')}
                    {renderProperties([
                        { label: 'ECN Number', value: ecn.ECNNumber },
                        { label: 'Title', value: ecn.Title },
                        { label: 'Change Type', value: ecn.ChangeType },
                        { label: 'Asset', value: ecn.AssetID },
                        { label: 'Requested By', value: ecn.RequestedBy },
                        { label: 'Status', value: ecn.Status },
                        { label: 'Plant', value: ecn.PlantID },
                        { label: 'Implemented Date', value: formatDate(ecn.ImplementedDate) },
                    ])}
                    {ecn.Description && (<>
                        {renderSectionHeader('Description of Change')}
                        {renderDescription(ecn.Description)}
                    </>)}
                    {ecn.Justification && (<>
                        {renderSectionHeader('Technical Justification')}
                        {renderDescription(ecn.Justification)}
                    </>)}
                    {(ecn.BeforeSpec || ecn.AfterSpec) && (<>
                        {renderSectionHeader('Specification Changes')}
                        {renderProperties([
                            { label: 'Before Specification', value: ecn.BeforeSpec },
                            { label: 'After Specification', value: ecn.AfterSpec },
                        ])}
                    </>)}
                    {approvals.length > 0 && (<>
                        {renderSectionHeader(`Approval Chain (${approvals.length})`)}
                        {renderTable(
                            ['Approver', 'Role', 'Decision', 'Date', 'Comments'],
                            approvals.map(a => [
                                a.ApproverName,
                                a.ApproverRole || '--',
                                a.Decision,
                                formatDate(a.DecisionDate) || '--',
                                a.Comments || '--'
                            ])
                        )}
                    </>)}
                    {renderSectionHeader('Authorization & Sign-Off')}
                    {renderSignatures(['Originator Signature', 'Engineering Manager', 'Plant Manager', 'Date'])}
                </>
            );
            break;
        }

        case 'engineering-project-detail': {
            const proj = data.project || data;
            const milestones = data.milestones || [];
            const budgetPct = data.budgetUsed || (proj.Budget > 0 ? Math.round((proj.ActualSpend / proj.Budget) * 100) : 0);
            content = (
                <>
                    {renderHeader('Capital Project Report', proj.ProjectNumber || `CP-${proj.ID}`)}
                    {renderSectionHeader('Project Overview')}
                    {renderProperties([
                        { label: 'Project Number', value: proj.ProjectNumber },
                        { label: 'Title', value: proj.Title },
                        { label: 'Category', value: proj.Category },
                        { label: 'Status', value: proj.Status },
                        { label: 'Project Manager', value: proj.ProjectManager },
                        { label: 'Sponsor', value: proj.Sponsor },
                        { label: 'Plant', value: proj.PlantID },
                        { label: 'Start Date', value: formatDate(proj.StartDate) },
                        { label: 'Target End Date', value: formatDate(proj.TargetEndDate) },
                        { label: 'Actual End Date', value: formatDate(proj.ActualEndDate) },
                    ])}
                    {renderSectionHeader('Budget Summary')}
                    {renderProperties([
                        { label: 'Approved Budget', value: proj.Budget ? `$${Number(proj.Budget).toLocaleString()}` : null },
                        { label: 'Actual Spend', value: proj.ActualSpend ? `$${Number(proj.ActualSpend).toLocaleString()}` : null },
                        { label: 'Budget Utilization', value: `${budgetPct}%` },
                        { label: 'ROI Estimate', value: proj.ROIEstimate ? `${proj.ROIEstimate}%` : null },
                    ])}
                    {proj.Description && (<>
                        {renderSectionHeader('Project Description')}
                        {renderDescription(proj.Description)}
                    </>)}
                    {milestones.length > 0 && (<>
                        {renderSectionHeader(`Milestones (${milestones.length})`)}
                        {renderTable(
                            ['Milestone', 'Due Date', 'Completed', 'Status', 'Notes'],
                            milestones.map(m => [
                                m.Title,
                                formatDate(m.DueDate) || '--',
                                formatDate(m.CompletedDate) || '--',
                                m.Status || 'Pending',
                                m.Notes || '--'
                            ])
                        )}
                    </>)}
                    {renderSectionHeader('Authorization & Review')}
                    {renderSignatures(['Project Manager', 'Finance Approval', 'Plant Director', 'Date'])}
                </>
            );
            break;
        }

        case 'engineering-lube-route': {
            const route = data.route || data;
            const points = data.points || [];
            content = (
                <>
                    {renderHeader('Lubrication Route Sheet', `LR-${route.ID}`)}
                    {renderSectionHeader('Route Information')}
                    {renderProperties([
                        { label: 'Route Name', value: route.RouteName },
                        { label: 'Description', value: route.Description },
                        { label: 'Frequency', value: route.Frequency },
                        { label: 'Assigned To', value: route.AssignedTo },
                        { label: 'Last Completed', value: formatDate(route.LastCompleted) },
                        { label: 'Next Due', value: formatDate(route.NextDue) },
                        { label: 'Plant', value: route.PlantID },
                        { label: 'Total Points', value: points.length },
                    ])}
                    {points.length > 0 && (<>
                        {renderSectionHeader(`Lubrication Points (${points.length})`)}
                        {renderTable(
                            ['#', 'Point Description', 'Asset', 'Lube Type', 'Qty', 'Unit', 'Method', 'Notes'],
                            points.map((p, i) => [
                                i + 1,
                                p.PointDescription,
                                p.AssetID || '--',
                                p.LubeType || '--',
                                p.Quantity || '--',
                                p.Unit || 'oz',
                                p.Method || 'Grease Gun',
                                p.Notes || '--'
                            ])
                        )}
                    </>)}
                    {data.recentRecords?.length > 0 && (<>
                        {renderSectionHeader(`Recent Completion Records (${data.recentRecords.length})`)}
                        {renderTable(
                            ['Date', 'Point', 'Completed By', 'Qty Used', 'Condition', 'Notes'],
                            data.recentRecords.slice(0, 20).map(r => [
                                formatDate(r.CompletedDate) || '--',
                                r.PointDescription || '--',
                                r.CompletedBy || '--',
                                r.QuantityUsed || '--',
                                r.Condition || 'Normal',
                                r.Notes || '--'
                            ])
                        )}
                    </>)}
                    {renderSectionHeader('Completion Sign-Off')}
                    {renderSignatures(['Technician Signature', 'Supervisor Verification', 'Date'])}
                </>
            );
            break;
        }

        case 'engineering-oil-analysis': {
            const sample = data.sample || data;
            const results = data.results || [];
            content = (
                <>
                    {renderHeader('Oil Analysis Report', `OA-${sample.ID}`)}
                    {renderSectionHeader('Sample Information')}
                    {renderProperties([
                        { label: 'Sample ID', value: `OA-${sample.ID}` },
                        { label: 'Asset', value: sample.AssetID },
                        { label: 'Sample Date', value: formatDate(sample.SampleDate) },
                        { label: 'Sample Point', value: sample.SamplePoint },
                        { label: 'Oil Type', value: sample.OilType },
                        { label: 'Oil Age (hours)', value: sample.OilAgeHours },
                        { label: 'Lab', value: sample.LabName },
                        { label: 'Lab Sample #', value: sample.LabSampleNumber },
                        { label: 'Sampled By', value: sample.SampledBy },
                        { label: 'Plant', value: sample.PlantID },
                        { label: 'Overall Status', value: sample.OverallStatus },
                    ])}
                    {sample.Notes && (<>
                        {renderSectionHeader('Notes')}
                        {renderDescription(sample.Notes)}
                    </>)}
                    {results.length > 0 && (<>
                        {renderSectionHeader(`Test Results (${results.length})`)}
                        {renderTable(
                            ['Parameter', 'Value', 'Unit', 'Limit', 'Status'],
                            results.map(r => [
                                r.Parameter,
                                r.Value != null ? r.Value : '--',
                                r.Unit || '--',
                                r.LimitValue ? `≤ ${r.LimitValue}` : '--',
                                r.Status || 'Normal'
                            ])
                        )}
                    </>)}
                    {renderSectionHeader('Analysis Review')}
                    {renderSignatures(['Lab Analyst', 'Reliability Engineer', 'Date'])}
                </>
            );
            break;
        }
        case 'engineering-repair-replace': {
            const rr = data || {};
            content = (
                <>
                    {renderHeader('Repair vs Replace Analysis', `RR-${rr.ID}`)}
                    {renderSectionHeader('Asset & Equipment Information')}
                    {renderProperties([
                        { label: 'Analysis Title', value: rr.Title },
                        { label: 'Asset ID', value: rr.AssetID },
                        { label: 'Current Age (years)', value: rr.CurrentAge },
                        { label: 'Useful Life (years)', value: rr.UsefulLife },
                        { label: 'Remaining Life', value: rr.UsefulLife && rr.CurrentAge ? `${Math.max(0, rr.UsefulLife - rr.CurrentAge)} years` : null },
                        { label: 'Analyzed By', value: rr.AnalyzedBy },
                        { label: 'Plant', value: rr.PlantID },
                        { label: 'Analysis Date', value: formatDate(rr.CreatedAt) },
                    ])}
                    {renderSectionHeader('Financial Analysis')}
                    {renderProperties([
                        { label: 'Replacement Cost', value: rr.ReplacementCost ? `$${Number(rr.ReplacementCost).toLocaleString()}` : null },
                        { label: 'Annual Repair Cost', value: rr.AnnualRepairCost ? `$${Number(rr.AnnualRepairCost).toLocaleString()}` : null },
                        { label: 'Repair Cost Trend', value: rr.RepairCostTrend ? `${rr.RepairCostTrend}% annual increase` : null },
                        { label: 'Downtime Cost per Hour', value: rr.DowntimeCostPerHour ? `$${Number(rr.DowntimeCostPerHour).toLocaleString()}/hr` : null },
                        { label: 'Avg Downtime per Event', value: rr.AvgDowntimeHours ? `${rr.AvgDowntimeHours} hours` : null },
                        { label: 'Annual Downtime Impact', value: (rr.DowntimeCostPerHour && rr.AvgDowntimeHours) ? `$${(rr.DowntimeCostPerHour * rr.AvgDowntimeHours).toLocaleString()} estimated` : null },
                    ])}
                    {renderSectionHeader('Break-Even & Recommendation')}
                    <div style={{ padding: '12px', background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '8px', marginBottom: 15 }}>
                        <div className="print-grid-2">
                            <div className="print-detail-row">
                                <span className="print-label">{t('printEngine.breakevenYear')}</span>
                                <span className="print-value" style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{rr.BreakEvenYear ? `Year ${rr.BreakEvenYear}` : 'N/A'}</span>
                            </div>
                            <div className="print-detail-row">
                                <span className="print-label">{t('printEngine.recommendation')}</span>
                                <span className="print-value" style={{ fontWeight: 'bold', fontSize: '1.1rem', color: rr.Recommendation?.toLowerCase().includes('replace') ? '#dc2626' : '#16a34a' }}>{rr.Recommendation || '--'}</span>
                            </div>
                        </div>
                    </div>
                    {rr.Notes && (<>
                        {renderSectionHeader('Engineering Notes & Rationale')}
                        {renderDescription(rr.Notes)}
                    </>)}
                    {renderSectionHeader('Review & Authorization')}
                    {renderSignatures(['Reliability Engineer', 'Engineering Manager', 'Finance Approval', 'Date'])}
                </>
            );
            break;
        }
        // ══════════════════════════════════════════════════════════════════
        // VENDOR PORTAL PRINT TYPES
        // ══════════════════════════════════════════════════════════════════

        case 'vendor-portal-access': {
            const v = data.vendor || data;
            content = (
                <>
                    {renderHeader('Vendor Portal Access Record', v.VendorID)}
                    {renderSectionHeader('Vendor Information')}
                    {renderProperties([
                        { label: 'Vendor ID', value: v.VendorID },
                        { label: 'Contact Name', value: v.ContactName },
                        { label: 'Contact Email', value: v.ContactEmail },
                        { label: 'Token Status', value: v.Active ? 'Active' : 'Revoked' },
                        { label: 'Token (partial)', value: v.AccessToken },
                        { label: 'Token Expiry', value: formatDate(v.TokenExpiry) },
                        { label: 'Last Login', value: formatDate(v.LastLogin) || 'Never' },
                        { label: 'Created', value: formatDate(v.CreatedAt) },
                    ])}
                    {data.rfqs?.length > 0 && (<>
                        {renderSectionHeader(`Associated RFQs (${data.rfqs.length})`)}
                        {renderTable(
                            ['RFQ #', 'Title', 'Status', 'Due Date'],
                            data.rfqs.map(r => [r.RFQNumber, r.Title, r.Status, formatDate(r.DueDate) || '--'])
                        )}
                    </>)}
                    {data.messages?.length > 0 && (<>
                        {renderSectionHeader(`Recent Messages (${data.messages.length})`)}
                        {renderTable(
                            ['Date', 'Direction', 'Subject', 'Sent By'],
                            data.messages.map(m => [formatDate(m.CreatedAt), m.Direction, m.Subject || '(no subject)', m.SentBy || '--'])
                        )}
                    </>)}
                    {renderSectionHeader('Authorization')}
                    {renderSignatures(['IT / Security Manager', 'Procurement Manager', 'Date'])}
                </>
            );
            break;
        }

        case 'vendor-rfq-detail': {
            const rfq = data.rfq || data;
            const items = data.items || [];
            content = (
                <>
                    {renderHeader('Request for Quote', rfq.RFQNumber)}
                    {renderSectionHeader('RFQ Information')}
                    {renderProperties([
                        { label: 'RFQ Number', value: rfq.RFQNumber },
                        { label: 'Title', value: rfq.Title },
                        { label: 'Vendor', value: rfq.VendorID },
                        { label: 'Status', value: rfq.Status },
                        { label: 'Due Date', value: formatDate(rfq.DueDate) },
                        { label: 'Requested By', value: rfq.RequestedBy },
                        { label: 'Awarded Date', value: formatDate(rfq.AwardedDate) },
                        { label: 'Plant', value: rfq.PlantID },
                    ])}
                    {rfq.Description && (<>
                        {renderSectionHeader('Description')}
                        {renderDescription(rfq.Description)}
                    </>)}
                    {items.length > 0 && (<>
                        {renderSectionHeader(`Line Items (${items.length})`)}
                        {renderTable(
                            ['Part #', 'Description', 'Qty', 'Unit', 'Target Price', 'Quoted Price', 'Lead Time', 'Notes'],
                            items.map(i => [
                                i.PartNumber || '--',
                                i.Description,
                                i.Quantity,
                                i.Unit,
                                i.TargetPrice ? `$${Number(i.TargetPrice).toLocaleString()}` : '--',
                                i.QuotedPrice ? `$${Number(i.QuotedPrice).toLocaleString()}` : 'Pending',
                                i.LeadTimeDays ? `${i.LeadTimeDays} days` : '--',
                                i.Notes || '--'
                            ])
                        )}
                        <div style={{ marginTop: '15px', padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <div className="print-grid-2">
                                <div className="print-detail-row">
                                    <span className="print-label">{t('printEngine.targetTotal')}</span>
                                    <span className="print-value" style={{ fontWeight: 'bold' }}>${Number(data.totalTarget || 0).toLocaleString()}</span>
                                </div>
                                <div className="print-detail-row">
                                    <span className="print-label">{t('printEngine.quotedTotal')}</span>
                                    <span className="print-value" style={{ fontWeight: 'bold', color: '#16a34a' }}>${Number(data.totalQuoted || 0).toLocaleString()}</span>
                                </div>
                                {data.savings > 0 && <div className="print-detail-row">
                                    <span className="print-label">{t('printEngine.savings')}</span>
                                    <span className="print-value" style={{ fontWeight: 'bold', color: '#f59e0b' }}>${Number(data.savings).toLocaleString()}</span>
                                </div>}
                            </div>
                        </div>
                    </>)}
                    {renderSectionHeader('Approval & Authorization')}
                    {renderSignatures(['Procurement Manager', 'Budget Approver', 'Vendor Acknowledgment', 'Date'])}
                </>
            );
            break;
        }

        case 'vendor-messages': {
            const msgs = data.messages || [];
            content = (
                <>
                    {renderHeader('Vendor Communication Log', data.vendorId)}
                    {renderSectionHeader(`Message Thread (${msgs.length} messages)`)}
                    {msgs.length > 0 ? renderTable(
                        ['Date', 'Direction', 'Subject', 'By', 'Message'],
                        msgs.map(m => [
                            formatDate(m.CreatedAt) || '--',
                            m.Direction === 'inbound' ? '← Received' : '→ Sent',
                            m.Subject || '(no subject)',
                            m.SentBy || '--',
                            (m.Body || '').substring(0, 120) + ((m.Body || '').length > 120 ? '...' : '')
                        ])
                    ) : <p style={{ textAlign: 'center', color: '#94a3b8' }}>No messages on record</p>}
                    {renderSectionHeader('Record Verification')}
                    {renderSignatures(['Procurement Manager', 'Date of Audit'])}
                </>
            );
            break;
        }

        case 'floor-plan': {
            const fp = data.plan || {};
            const fpPins = data.pins || [];
            const fpZones = data.zones || [];
            const fpAnnotations = data.annotations || [];
            const fpAssets = data.assets || [];
            const fpViewMode = data.viewMode || 'satellite';
            const fpLayerTypes = data.LAYER_TYPES || [];
            const fpZoneTypes = data.ZONE_TYPES || {};

            const fpActiveLayer = data.activeLayer || 'all';

            // Filter pins by active layer
            const fpVisiblePins = fpActiveLayer === 'all'
                ? fpPins
                : fpPins.filter(p => (p.layerType || 'assets') === fpActiveLayer);

            // Build image URL
            const fpImagePath = (() => {
                const path = (fpViewMode === 'blueprint' && fp.blueprintPath)
                    ? fp.blueprintPath
                    : fp.imagePath;
                if (!path) return `/api/floorplans/${fp.id}/image`;
                return path.startsWith('/') ? path : '/' + path;
            })();

            // Group pins by layer
            const pinsByLayer = {};
            fpVisiblePins.forEach(pin => {
                const layer = pin.layerType || 'assets';
                if (!pinsByLayer[layer]) pinsByLayer[layer] = [];
                pinsByLayer[layer].push(pin);
            });

            // Layer summary counts
            const layerSummary = Object.entries(pinsByLayer).map(([key, arr]) => {
                const def = fpLayerTypes.find(l => l.id === key) || { label: key };
                return `${def.label}: ${arr.length}`;
            }).join('  ·  ');

            // Active layer label for title
            const activeLayerDef = fpLayerTypes.find(l => l.id === fpActiveLayer);
            const activeLayerLabel = activeLayerDef ? activeLayerDef.label : 'All Layers';

            const planTypePretty = (fp.planType || 'facility').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const genDate = new Date().toLocaleString();

            content = (
                <>
                    {renderHeader(
                        fpActiveLayer !== 'all'
                            ? `Facility Floor Plan — ${activeLayerLabel} Map`
                            : 'Facility Floor Plan',
                        `FP-${fp.id || '001'}`
                    )}

                    {/* ════════ COMPACT METADATA BAR ════════ */}
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: '0',
                        border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden',
                        marginBottom: '8px', fontSize: '8.5pt', lineHeight: '1.3',
                    }}>
                        {[
                            { label: 'Plan', value: fp.name || '--' },
                            { label: 'Building', value: fp.buildingName || 'Main Facility' },
                            { label: 'Floor', value: fp.floorLevel || 'Ground' },
                            { label: 'Type', value: planTypePretty },
                            { label: 'Layer', value: activeLayerLabel },
                            { label: 'Pins', value: fpVisiblePins.length },
                            { label: 'Zones', value: fpZones.length },
                            { label: 'Annotations', value: fpAnnotations.length },
                        ].map((item, i) => (
                            <div key={i} style={{
                                flex: '1 1 auto', padding: '6px 10px',
                                borderRight: '1px solid #e2e8f0',
                                background: i % 2 === 0 ? '#f8fafc' : '#ffffff',
                                minWidth: '90px',
                            }}>
                                <div style={{ fontSize: '6.5pt', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>{item.label}</div>
                                <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '8.5pt' }}>{item.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* ════════ HERO FLOOR PLAN IMAGE WITH PIN/ZONE OVERLAYS ════════ */}
                    <div style={{
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '8px',
                        background: '#fafbfc',
                        pageBreakInside: 'avoid',
                        marginBottom: '6px',
                    }}>
                        <div style={{ position: 'relative', width: '100%' }}>
                            <img
                                src={fpImagePath}
                                alt={fp.name || 'Floor Plan'}
                                style={{
                                    width: '100%',
                                    display: 'block',
                                }}
                            />
                            {/* SVG overlay for zones and pins */}
                            <svg
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                                style={{
                                    position: 'absolute',
                                    top: 0, left: 0,
                                    width: '100%', height: '100%',
                                    pointerEvents: 'none',
                                }}
                            >
                                {/* Zone polygons */}
                                {fpZones.map((zone, zi) => {
                                    const zt = fpZoneTypes[zone.zoneType] || { color: '#3b82f6' };
                                    const validPts = (zone.points || []).filter(p => p.xPercent != null && p.yPercent != null && !isNaN(p.xPercent) && !isNaN(p.yPercent));
                                    const pts = validPts.map(p => `${p.xPercent},${p.yPercent}`).join(' ');
                                    if (!pts) return null;
                                    return (
                                        <polygon
                                            key={`zone-${zi}`}
                                            points={pts}
                                            fill={zt.color}
                                            fillOpacity="0.15"
                                            stroke={zt.color}
                                            strokeWidth="0.3"
                                            strokeDasharray="1,0.5"
                                        />
                                    );
                                })}
                                {/* Zone labels */}
                                {fpZones.map((zone, zi) => {
                                    const pts = (zone.points || []).filter(p => p.xPercent != null && p.yPercent != null && !isNaN(p.xPercent) && !isNaN(p.yPercent));
                                    if (pts.length === 0) return null;
                                    const cx = pts.reduce((s, p) => s + p.xPercent, 0) / pts.length;
                                    const cy = pts.reduce((s, p) => s + p.yPercent, 0) / pts.length;
                                    const zt = fpZoneTypes[zone.zoneType] || { color: '#3b82f6' };
                                    return (
                                        <text
                                            key={`zlabel-${zi}`}
                                            x={cx} y={cy}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            fill={zt.color}
                                            fontSize="2"
                                            fontWeight="700"
                                            style={{ textShadow: '0 0 2px #fff, 0 0 2px #fff' }}
                                        >
                                            {zone.name || ''}
                                        </text>
                                    );
                                })}
                            </svg>

                            {/* Pin markers as absolutely positioned elements */}
                            {fpVisiblePins.map((pin, pi) => {
                                const layerDef = fpLayerTypes.find(l => l.id === (pin.layerType || 'assets')) || { color: '#10b981' };
                                return (
                                    <div
                                        key={`pin-${pi}`}
                                        style={{
                                            position: 'absolute',
                                            left: `${pin.xPercent}%`,
                                            top: `${pin.yPercent}%`,
                                            transform: 'translate(-50%, -50%)',
                                            width: '14px', height: '14px',
                                            borderRadius: '50%',
                                            background: layerDef.color,
                                            border: '1.5px solid #fff',
                                            boxShadow: `0 0 0 1px ${layerDef.color}, 0 1px 3px rgba(0,0,0,0.3)`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '6px', fontWeight: 800, color: '#fff',
                                            lineHeight: 1,
                                            zIndex: 2,
                                        }}
                                        title={pin.label || pin.assetId || ''}
                                    >
                                        {pi + 1}
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginTop: '6px', padding: '4px 8px',
                            background: '#f1f5f9', borderRadius: '4px',
                            fontSize: '7pt', color: '#64748b',
                        }}>
                            <span style={{ fontWeight: 700 }}>
                                {fp.name}
                                {fp.buildingName ? ` — ${fp.buildingName}` : ''}
                                {fp.floorLevel ? ` · ${fp.floorLevel}` : ''}
                            </span>
                            <span>{fpViewMode === 'blueprint' ? '📐 Blueprint View' : '🛰️ Satellite View'}</span>
                            <span>{layerSummary || `${fpVisiblePins.length} pins placed`}</span>
                        </div>
                    </div>

                    {/* ════════ LEGEND / LAYER SUMMARY ════════ */}
                    {Object.keys(pinsByLayer).length > 1 && (
                        <div style={{
                            display: 'flex', gap: '8px', flexWrap: 'wrap',
                            marginBottom: '10px', padding: '6px 10px',
                            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px',
                            fontSize: '7.5pt',
                        }}>
                            <span style={{ fontWeight: 700, color: '#475569', textTransform: 'uppercase', fontSize: '6.5pt', letterSpacing: '0.5px' }}>Layer Legend:</span>
                            {Object.entries(pinsByLayer).map(([key, arr]) => {
                                const def = fpLayerTypes.find(l => l.id === key);
                                const color = def?.color || '#64748b';
                                return (
                                    <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                                        <span style={{ fontWeight: 600 }}>{def?.label || key}</span>
                                        <span style={{ color: '#94a3b8' }}>({arr.length})</span>
                                    </span>
                                );
                            })}
                        </div>
                    )}

                    {/* ════════ PIN INVENTORY TABLE ════════ */}
                    {fpVisiblePins.length > 0 && (<div style={{ pageBreakBefore: fpVisiblePins.length > 15 ? 'always' : 'auto' }}>
                        {renderSectionHeader(`Equipment & Pin Inventory (${fpVisiblePins.length})`)}
                        {Object.entries(pinsByLayer).map(([layerKey, layerPins]) => {
                            const layerDef = fpLayerTypes.find(l => l.id === layerKey) || { label: layerKey };
                            return (
                                <div key={layerKey} style={{ marginBottom: '12px', pageBreakInside: 'avoid' }}>
                                    <div style={{
                                        fontSize: '8pt', fontWeight: 800, color: '#1e293b',
                                        textTransform: 'uppercase', letterSpacing: '0.8px',
                                        padding: '4px 8px', marginBottom: '2px',
                                        background: '#f1f5f9', borderLeft: `3px solid ${layerDef.color || '#6366f1'}`,
                                        borderRadius: '2px',
                                    }}>
                                        {layerDef.label} — {layerPins.length} pin{layerPins.length !== 1 ? 's' : ''}
                                    </div>
                                    {renderTable(
                                        ['#', 'Asset / Label', 'Location (X%, Y%)', 'Equipment Type'],
                                        layerPins.map((pin, i) => {
                                            const asset = fpAssets.find(a => a.ID === pin.assetId);
                                            const label = asset
                                                ? `${asset.ID} — ${asset.Description}`
                                                : (pin.label || pin.assetId || '--');
                                            return [
                                                (i + 1).toString(),
                                                label,
                                                `${pin.xPercent?.toFixed(1)}%, ${pin.yPercent?.toFixed(1)}%`,
                                                pin.iconType
                                                    ? pin.iconType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                                                    : 'Standard Pin'
                                            ];
                                        })
                                    )}
                                </div>
                            );
                        })}
                    </div>)}

                    {/* ════════ ZONE DEFINITIONS ════════ */}
                    {fpZones.length > 0 && (<div style={{ pageBreakInside: 'avoid' }}>
                        {renderSectionHeader(`Zone Definitions (${fpZones.length})`)}
                        {renderTable(
                            ['Zone Name', 'Type', 'Hazard Class', 'Capacity', 'Vertices'],
                            fpZones.map(z => {
                                const zt = fpZoneTypes[z.zoneType] || { label: z.zoneType, emoji: '' };
                                return [
                                    z.name || 'Unnamed',
                                    `${zt.emoji} ${zt.label}`,
                                    z.hazardClass || 'N/A',
                                    z.capacity ? `${z.capacity} personnel` : 'N/A',
                                    `${(z.points || []).length}`
                                ];
                            })
                        )}
                    </div>)}

                    {/* ════════ ANNOTATIONS ════════ */}
                    {fpAnnotations.length > 0 && (<div style={{ pageBreakInside: 'avoid' }}>
                        {renderSectionHeader(`Annotations & Markings (${fpAnnotations.length})`)}
                        {renderTable(
                            ['#', 'Type', 'Label', 'Layer'],
                            fpAnnotations.map((a, i) => [
                                (i + 1).toString(),
                                (a.type || 'unknown').charAt(0).toUpperCase() + (a.type || '').slice(1),
                                a.label || '(unlabeled)',
                                a.layerType || 'general',
                            ])
                        )}
                    </div>)}

                    {/* ════════ CERTIFICATION FOOTER ════════ */}
                    <div style={{ marginTop: '20px', pageBreakInside: 'avoid' }}>
                        {renderSectionHeader('Floor Plan Certification')}
                        <div style={{
                            fontSize: '7.5pt', color: '#64748b', marginBottom: '12px',
                            padding: '8px 12px', background: '#f8fafc', borderRadius: '4px',
                            border: '1px solid #e2e8f0', lineHeight: '1.5',
                        }}>
                            This document certifies that the attached facility floor plan accurately represents the
                            current layout of <strong>{fp.buildingName || 'the facility'}</strong> as of the date
                            shown above. All equipment locations, zone designations, and safety markings have been
                            verified by the signatories below.
                        </div>
                        {renderSignatures(['Facility Engineer', 'Safety Officer', 'Plant Manager', 'Date of Verification'])}
                    </div>

                    {/* ════════ DOCUMENT FOOTER ════════ */}
                    <div style={{
                        marginTop: '15px', paddingTop: '8px',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex', justifyContent: 'space-between',
                        fontSize: '6.5pt', color: '#94a3b8',
                    }}>
                        <span>Generated: {genDate}</span>
                        <span>CONFIDENTIAL — {plantLabel || 'Trier OS'}</span>
                        <span>Doc ID: FP-{fp.id || '001'}</span>
                    </div>
                </>
            );
            break;
        }

        case 'risk-evidence-packet': {
            const incidents = data.incidents || [];
            const calibration = data.calibration || [];
            const loto = data.loto || [];
            const genDate = new Date().toLocaleString();
            content = (
                <>
                    {renderHeader('Insurance Risk Evidence Packet', `RISK-${new Date().toISOString().split('T')[0]}`)}

                    {renderSectionHeader('Risk Score Summary')}
                    {renderProperties([
                        { label: 'Plant / Facility', value: data.plantLabel || data.plantId || 'Enterprise' },
                        { label: 'Report Generated', value: genDate },
                        { label: 'Open Safety Incidents', value: incidents.filter(i => i.Status === 'Open').length.toString() },
                        { label: 'OSHA Recordable Incidents', value: incidents.filter(i => i.OSHARecordable).length.toString() },
                        { label: 'Overdue Calibrations', value: calibration.filter(c => c.NextCalibrationDue && new Date(c.NextCalibrationDue) < new Date()).length.toString() },
                        { label: 'Active LOTO Permits', value: loto.filter(l => l.Status === 'ACTIVE').length.toString() }
                    ])}

                    {renderSectionHeader(`Safety Incidents (${incidents.length} total)`)}
                    {renderTable(
                        ['Incident #', 'Date', 'Type', 'Severity', 'Title', 'Status', 'OSHA'],
                        incidents.map(inc => [
                            inc.IncidentNumber || `INC-${inc.ID}`,
                            inc.IncidentDate ? inc.IncidentDate.split('T')[0] : '--',
                            inc.IncidentType || '--',
                            inc.Severity || '--',
                            inc.Title || '--',
                            inc.Status || '--',
                            inc.OSHARecordable ? 'Yes' : 'No'
                        ])
                    )}

                    {renderSectionHeader(`Calibration Status (${calibration.length} instruments)`)}
                    {renderTable(
                        ['Instrument ID', 'Description', 'Last Calibrated', 'Next Due', 'Last Result', 'Status'],
                        calibration.map(cal => [
                            cal.InstrumentID,
                            cal.Description,
                            cal.LastCalibrationDate ? cal.LastCalibrationDate.split('T')[0] : '--',
                            cal.NextCalibrationDue ? cal.NextCalibrationDue.split('T')[0] : '--',
                            cal.LastResult || 'N/A',
                            new Date(cal.NextCalibrationDue) < new Date() ? 'OVERDUE' : cal.Status
                        ])
                    )}

                    {renderSectionHeader(`LOTO Permit Audit Trail (${loto.length} permits)`)}
                    {renderTable(
                        ['Permit #', 'Asset', 'Type', 'Issued By', 'Issued At', 'Status', 'Closed At'],
                        loto.map(permit => [
                            permit.PermitNumber,
                            permit.AssetDescription || permit.AssetID || '--',
                            permit.PermitType || 'LOTO',
                            permit.IssuedBy || '--',
                            permit.IssuedAt ? permit.IssuedAt.split('T')[0] : '--',
                            permit.Status,
                            permit.ClosedAt ? permit.ClosedAt.split('T')[0] : '--'
                        ])
                    )}

                    {renderSectionHeader('Authorized Signatures')}
                    {renderSignatures(['Safety Manager', 'Plant Manager', 'Insurance Representative', 'Date'])}
                </>
            );
            break;
        }

        case 'sustainability-report': {
            const readings = data.readings || [];
            const targets = data.targets || [];
            const year = data.year || new Date().getFullYear();
            const genDate2 = new Date().toLocaleString();
            const METER_LABELS = {
                electricity_kwh: 'Electricity (kWh)',
                gas_therms: 'Natural Gas (therms)',
                water_gallons: 'Water (gal)',
                propane_gallons: 'Propane (gal)'
            };
            const totalCost = readings.reduce((s, r) => s + (r.cost || 0), 0);
            const totalCarbonKg = data.totalCarbonKg || 0;
            content = (
                <>
                    {renderHeader(`Sustainability & Energy Report — ${year}`, `ESG-${year}-${new Date().toISOString().split('T')[0]}`)}

                    {renderSectionHeader('Reporting Period Summary')}
                    {renderProperties([
                        { label: 'Facility', value: data.plantLabel || data.plantId || 'Enterprise' },
                        { label: 'Report Year', value: String(year) },
                        { label: 'Generated', value: genDate2 },
                        { label: 'Total Utility Cost', value: `$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                        { label: 'Estimated Carbon Footprint', value: `${totalCarbonKg.toLocaleString()} kg CO₂e` },
                        { label: 'Total Readings Logged', value: readings.length.toString() }
                    ])}

                    {renderSectionHeader('Energy Consumption by Type')}
                    {renderTable(
                        ['Utility Type', 'Total Usage', 'Total Cost', 'Annual Target', 'vs Target'],
                        Object.keys(METER_LABELS).map(meterType => {
                            const typeReadings = readings.filter(r => r.meterType === meterType);
                            const totalReading = typeReadings.reduce((s, r) => s + (r.reading || 0), 0);
                            const typeCost = typeReadings.reduce((s, r) => s + (r.cost || 0), 0);
                            const target = targets.find(t => t.meterType === meterType);
                            const vsTarget = target?.annualTarget
                                ? `${Math.round((totalReading / target.annualTarget) * 100)}%`
                                : 'No target';
                            return [
                                METER_LABELS[meterType],
                                `${totalReading.toLocaleString()}`,
                                `$${typeCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                target?.annualTarget ? target.annualTarget.toLocaleString() : '--',
                                vsTarget
                            ];
                        })
                    )}

                    {renderSectionHeader('Detailed Readings Log')}
                    {renderTable(
                        ['Date', 'Utility Type', 'Reading', 'Cost', 'Period'],
                        readings.slice(0, 50).map(r => [
                            r.createdAt ? r.createdAt.split('T')[0] : '--',
                            METER_LABELS[r.meterType] || r.meterType,
                            r.reading?.toLocaleString() || '--',
                            r.cost ? `$${r.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '--',
                            r.periodStart && r.periodEnd ? `${r.periodStart} → ${r.periodEnd}` : '--'
                        ])
                    )}

                    {renderSectionHeader('Authorized Signatures')}
                    {renderSignatures(['Sustainability Manager', 'Plant Manager', 'Date'])}
                </>
            );
            break;
        }

        case 'loto-help-guide': {
            content = (
                <>
                    {renderHeader('LOTO Procedure Guide', 'SOP-LOTO-001')}
                    {renderSectionHeader('How to Author a LOTO Permit')}
                    <div className="print-narrative">
                        <p><strong>1. Scan Equipment (Optional & Recommended):</strong> Use the blue <em>Scan Asset QR</em> button to scan the physical asset nameplate. If previous LOTO events exist, the system will instantly load the exact procedures and isolation points required, saving 90% of data entry.</p>
                        <p><strong>2. Define Hazard:</strong> Detail the primary energy sources (electrical, pneumatic) and the overarching isolation method for the permit.</p>
                        <p><strong>3. Identify Isolation Points:</strong> Lockout procedures often require multiple points of isolation to reach zero energy state. Use the "+ Add Point" button to ensure every lock and tag location is accounted for sequentially.</p>
                        <p><strong>4. Execute & Verify:</strong> Once issued, mechanics must perform the newly integrated <em>Scan-to-Lock</em> workflow on physical field tags to officially execute the procedure safely and retain audit compliance.</p>
                    </div>
                </>
            );
            break;
        }

        case 'loto-permit-detail': {
            const p = data?.permit || data || {};
            const points = data?.points || [];
            const sigs = data?.signatures || [];
            const EICONS = { Electrical:'⚡', Pneumatic:'💨', Hydraulic:'🔵', Mechanical:'⚙️', Thermal:'🌡️', Chemical:'☣️', Gravity:'⬇️', Steam:'♨️', Radiation:'☢️', 'Stored Energy':'🔋' };
            content = (
                <>
                    {renderHeader('LOTO / Lockout-Tagout Permit', p.PermitNumber)}
                    {renderSectionHeader('Permit Information')}
                    {renderProperties([
                        { label: 'Permit Number', value: p.PermitNumber },
                        { label: 'Status', value: p.Status },
                        { label: 'Hazardous Energy', value: `${EICONS[p.HazardousEnergy] || '⚡'} ${p.HazardousEnergy}` },
                        { label: 'Issued By', value: p.IssuedBy },
                        { label: 'Issued At', value: formatDate(p.IssuedAt) },
                        { label: 'Expires At', value: formatDate(p.ExpiresAt) },
                        { label: 'Asset ID', value: p.AssetID || '--' },
                        { label: 'Asset Description', value: p.AssetDescription || '--' },
                        { label: 'Work Order', value: p.WorkOrderID || '--' },
                        { label: 'Isolation Method', value: p.IsolationMethod || '--' },
                        { label: 'Closed By', value: p.ClosedBy || '--' },
                        { label: 'Void Reason', value: p.VoidReason || '--' },
                    ])}
                    {p.Notes && (<>
                        {renderSectionHeader('Notes')}
                        {renderDescription(p.Notes)}
                    </>)}
                    {renderSectionHeader(`Energy Isolation Points (${points.length})`)}
                    {renderTable(
                        ['#', 'Energy Type', 'Location', 'Device', 'Lock #', 'Tag #', 'Status', 'Released By'],
                        points.length > 0 ? points.map(pt => [
                            pt.PointNumber,
                            `${EICONS[pt.EnergyType] || '⚡'} ${pt.EnergyType}`,
                            pt.Location,
                            pt.IsolationDevice || '--',
                            pt.LockNumber || '--',
                            pt.TagNumber || '--',
                            pt.Status,
                            pt.ReleasedBy || '--',
                        ]) : [],
                        'No isolation points recorded.'
                    )}
                    {sigs.length > 0 && (<>
                        {renderSectionHeader(`Digital Signatures (${sigs.length})`)}
                        {renderTable(
                            ['Type', 'Signed By', 'Role', 'Date / Time'],
                            sigs.map(s => [s.SignatureType, s.SignedBy, s.Role || '--', formatDate(s.SignedAt)])
                        )}
                    </>)}
                    {renderSectionHeader('Authorization & Signatures')}
                    {renderSignatures(['Issuing Authority', 'Safety Officer', 'Equipment Operator', 'Date'])}
                </>
            );
            break;
        }

        case 'plant-setup-config': {
            const cfg = data?.config || {};
            const units = data?.units || [];
            const products = data?.products || [];
            const calendar = data?.calendar || [];
            const MODEL_LABELS = {
                'fluid-process': 'Fluid / Process', 'discrete': 'Discrete Manufacturing',
                'batch': 'Batch / Formulated', 'make-to-order': 'Make-to-Order / Job Shop',
                'utilities': 'Utilities / Infrastructure', 'extraction': 'Extraction / Heavy Industry',
                'hybrid': 'Hybrid',
            };
            content = (
                <>
                    {renderHeader('Plant Configuration Report', cfg.PlantID || plantLabel)}
                    {renderSectionHeader('Production Model')}
                    {renderProperties([
                        { label: 'Plant ID', value: cfg.PlantID || plantLabel },
                        { label: 'Production Model', value: MODEL_LABELS[cfg.ProductionModel] || cfg.ProductionModel || '—' },
                        { label: 'Last Updated', value: formatDate(cfg.UpdatedAt) },
                    ])}
                    {units.length > 0 && (<>
                        {renderSectionHeader(`Production Units (${units.length})`)}
                        {renderTable(
                            ['Unit Name', 'Type', 'Capacity', 'Floor Sq Ft', 'Criticality', 'Status'],
                            units.map(u => [
                                u.UnitName,
                                u.UnitType || '—',
                                u.CapacityPerHour ? `${u.CapacityPerHour.toLocaleString()} ${u.CapacityUnit}` : '—',
                                u.FloorSpaceSqFt ? u.FloorSpaceSqFt.toLocaleString() : '—',
                                u.CriticalityClass || '—',
                                u.Status || 'Active',
                            ])
                        )}
                    </>)}
                    {products.length > 0 && (<>
                        {renderSectionHeader(`SKU Catalog (${products.length})`)}
                        {renderTable(
                            ['SKU', 'Product Name', 'Family', 'Daily Qty', 'Holiday Qty', 'UOM'],
                            products.map(p => [
                                p.SKU, p.ProductName, p.ProductFamily || '—',
                                (p.BaselineDailyQty || 0).toLocaleString(),
                                (p.HolidayQty || 0).toLocaleString(),
                                p.UOM || '—',
                            ])
                        )}
                    </>)}
                    {calendar.length > 0 && (<>
                        {renderSectionHeader(`Plant Calendar (${calendar.length} events)`)}
                        {renderTable(
                            ['Date', 'Type', 'Label', 'Capacity %'],
                            calendar.map(e => [
                                e.EventDate, e.EventType, e.Label,
                                `${e.ProductionCapacityPct ?? 0}%`,
                            ])
                        )}
                    </>)}
                    {renderSectionHeader('Authorization')}
                    {renderSignatures(['Plant Manager', 'Operations Director', 'Date'])}
                </>
            );
            break;
        }

        case 'production-orders': {
            const orders = data?.orders || [];
            const date   = data?.date || '';
            const manufactured = orders.filter(o => o.Section === 'MANUFACTURED' || !o.Section);
            const purchased    = orders.filter(o => o.Section === 'PURCHASED');
            const totalOrdered = orders.reduce((s,o) => s + (o.TotQty||0), 0);
            const totalFinal   = orders.reduce((s,o) => s + (o.FinalQty||0), 0);
            content = (
                <>
                    {renderHeader('Daily Production Plan', date)}
                    {renderProperties([
                        { label: 'Production Date', value: date },
                        { label: 'Total SKUs', value: orders.length.toString() },
                        { label: 'Total Ordered', value: totalOrdered.toLocaleString() + ' units' },
                        { label: 'Total Final Planned', value: totalFinal.toLocaleString() + ' units' },
                    ])}
                    {manufactured.length > 0 && (<>
                        {renderSectionHeader(`Manufactured Products (${manufactured.length})`)}
                        {renderTable(
                            ['Prod#', 'Size', 'Description', 'Label', 'Ordered', 'Beg. Inv', 'Pad', 'Adjust', 'Final Qty'],
                            manufactured.map(o => [
                                o.ProdNumber || '—', o.SizeCode || '—', o.Description || '—', o.LabelCode || '—',
                                (o.TotQty||0).toLocaleString(),
                                (o.BeginningInventory||0).toLocaleString(),
                                (o.Pad||0).toLocaleString(),
                                (o.ManualAdjust||0) > 0 ? `+${o.ManualAdjust}` : (o.ManualAdjust||0).toString(),
                                (o.FinalQty||0).toLocaleString(),
                            ])
                        )}
                    </>)}
                    {purchased.length > 0 && (<>
                        {renderSectionHeader(`Purchased Products (${purchased.length})`)}
                        {renderTable(
                            ['Prod#', 'Size', 'Description', 'Label', 'Ordered', 'Final Qty'],
                            purchased.map(o => [
                                o.ProdNumber || '—', o.SizeCode || '—', o.Description || '—', o.LabelCode || '—',
                                (o.TotQty||0).toLocaleString(),
                                (o.FinalQty||0).toLocaleString(),
                            ])
                        )}
                    </>)}
                    {renderSectionHeader('Authorization')}
                    {renderSignatures(['Production Manager', 'Plant Manager', 'Date'])}
                </>
            );
            break;
        }

        case 'warranties-asset': {
            const asset = Array.isArray(data) ? data[0] : data;
            content = (
                <>
                    {renderHeader(`Asset Warranty Specification`, `AST-WARR-${asset.ID}`)}
                    {renderSectionHeader('Asset Description')}
                    {renderDescription(asset.Description)}
                    {renderSectionHeader('Warranty Details')}
                    {renderProperties([
                        { label: 'Asset ID', value: asset.ID },
                        { label: 'Vendor / Manufacturer', value: asset.WarrantyVendor || '—' },
                        { label: 'Warranty Start', value: formatDate(asset.WarrantyStart) || '—' },
                        { label: 'Warranty End', value: formatDate(asset.WarrantyEnd) || '—' },
                        { label: 'Asset Value', value: asset.assetCost ? `$${asset.assetCost.toLocaleString()}` : '—' }
                    ])}
                    {renderSectionHeader('Authorization and Verification')}
                    {renderSignatures(['Maintenance Supervisor', 'Date'])}
                </>
            );
            break;
        }

        case 'warranties': {
            const ov = data.overview?.totals || {};
            const av = data.avoidance?.totals || {};
            const cm = data.claims || [];
            
            content = (
                <>
                    {renderHeader(`Enterprise Warranty Ledger`, `WARR-RPT`)}
                    {renderSectionHeader('Portfolio Summary')}
                    {renderProperties([
                        { label: 'Active Warranties', value: ov.active || 0 },
                        { label: 'Expiring Soon (Next 90d)', value: ov.expiringSoon || 0 },
                        { label: 'Total Avoided Costs', value: `$${(av.totalSaved || 0).toLocaleString()}` },
                        { label: 'Total Active Claims', value: cm.filter(c => !['Reimbursed', 'Denied'].includes(c.Status)).length }
                    ])}
                    
                    {data.overview?.expiringSoon?.length > 0 && (
                        <>
                            {renderSectionHeader('Warranties Expiring Soon')}
                            {renderTable(
                                ['Asset', 'Plant', 'Vendor', 'Expires', 'Value'],
                                data.overview.expiringSoon.map(a => [
                                    a.ID,
                                    a.plantLabel || '—',
                                    a.WarrantyVendor || '—',
                                    formatDate(a.WarrantyEnd),
                                    a.assetCost ? `$${a.assetCost.toLocaleString()}` : '—'
                                ])
                            )}
                        </>
                    )}

                    {data.avoidance?.details?.length > 0 && (
                        <>
                            {renderSectionHeader('Cost Avoidance Ledger')}
                            {renderTable(
                                ['WO #', 'Asset', 'Vendor', 'Labor Saved', 'Parts Saved', 'Total Saved'],
                                data.avoidance.details.map(d => [
                                    d.workOrderNumber,
                                    d.assetId,
                                    d.vendor || '—',
                                    `$${(d.laborSaved || 0).toLocaleString()}`,
                                    `$${(d.partsSaved || 0).toLocaleString()}`,
                                    `$${(d.totalSaved || 0).toLocaleString()}`
                                ])
                            )}
                        </>
                    )}
                    {renderSectionHeader('Approval')}
                    {renderSignatures(['Reliability Director', 'Date'])}
                </>
            );
            break;
        }
        case 'storeroom-report': {
            const sum = data.summary || {};
            content = (
                <>
                    {renderHeader(`Storeroom Intelligence Report`, `STR-RPT`)}
                    
                    {renderSectionHeader('Health & Inventory Valuation')}
                    {renderProperties([
                        { label: 'Lookback Period', value: `${data.lookbackDays} days` },
                        { label: 'Storeroom Health Score', value: `${sum.healthScore || 0} / 100` },
                        { label: 'Total Stocked Identifiers', value: (sum.totalParts || 0).toLocaleString() },
                        { label: 'Total Inventory Value', value: '$' + (sum.totalValue || 0).toLocaleString() },
                        { label: 'Total Dead Stock', value: '$' + (sum.totalDeadStockValue || 0).toLocaleString() },
                        { label: 'Obsolete / EOL Value', value: '$' + (sum.totalObsoleteValue || 0).toLocaleString() }
                    ])}

                    {renderSectionHeader('ABC Usage Classification')}
                    {renderProperties([
                        { label: 'Class A (High Value)', value: `${sum.abcCount?.A || 0} items — $${(sum.abcValue?.A || 0).toLocaleString()}` },
                        { label: 'Class B (Medium)', value: `${sum.abcCount?.B || 0} items — $${(sum.abcValue?.B || 0).toLocaleString()}` },
                        { label: 'Class C (Low Value)', value: `${sum.abcCount?.C || 0} items — $${(sum.abcValue?.C || 0).toLocaleString()}` }
                    ])}

                    {sum.topDeadStock?.length > 0 && (
                        <>
                            {renderSectionHeader('Highest Value Dead Stock')}
                            {renderTable(
                                ['Part ID', 'Description', 'Class', 'Current Stock', 'Total Value'],
                                sum.topDeadStock.map(p => [
                                    p.ID,
                                    p.Description,
                                    p.abcClass || 'C',
                                    (p.stock || 0).toString(),
                                    '$' + (p.inventoryValue || 0).toLocaleString()
                                ])
                            )}
                        </>
                    )}

                    {renderSectionHeader('Authorization and Acknowledgement')}
                    {renderSignatures(['Supply Chain / Materials', 'Plant Manager'])}
                </>
            );
            break;
        }

        case 'vendor-inflation': {
            const vSummary = data.summary || {};
            const byVendor = data.byVendor || {};
            const vPlantLabel = data.plantLabel || '';

            // Flatten all vendor items into sortable rows
            const vRows = [];
            Object.entries(byVendor).forEach(([vendorName, vData]) => {
                (vData.items || []).forEach(item => {
                    const pts = item.points || [];
                    vRows.push([
                        vendorName,
                        vData.contact || '--',
                        vData.phone || '--',
                        vData.email || '--',
                        item.vendorPartNo || '--',
                        item.label || '--',
                        pts.length > 0 ? pts[0].date : '--',
                        pts.length > 0 ? `$${Number(item.firstCost).toFixed(2)}` : '--',
                        pts.length > 0 ? pts[pts.length - 1].date : '--',
                        `$${Number(item.lastCost).toFixed(2)}`,
                        (item.pctChange > 0 ? '+' : '') + item.pctChange + '%',
                    ]);
                });
            });
            // Inflators first, deflators last
            vRows.sort((a, b) => parseFloat(b[10]) - parseFloat(a[10]));

            content = (
                <>
                    {renderHeader('Vendor Price Drift Report', 'INFLATION-24M')}
                    {renderSectionHeader('Analysis Summary')}
                    {renderProperties([
                        { label: 'Plant', value: vPlantLabel },
                        { label: 'Analysis Window', value: '24 months' },
                        { label: 'Items Tracked', value: String(vSummary.totalTracked || 0) },
                        { label: 'Inflating', value: String(vSummary.inflating || 0) },
                        { label: 'Deflating', value: String(vSummary.deflating || 0) },
                        { label: 'Stable / Insufficient Data', value: String(vSummary.stable || 0) },
                        { label: 'Average Drift', value: vSummary.avgDrift != null ? (vSummary.avgDrift > 0 ? '+' : '') + vSummary.avgDrift + '%' : '--' },
                    ])}
                    {renderSectionHeader('Price Movement by Vendor')}
                    {renderTable(
                        ['Vendor', 'Contact', 'Phone', 'Email', 'Part #', 'Description', 'First Date', 'First Price', 'Latest Date', 'Latest Price', 'Change'],
                        vRows,
                        'No price movement detected in the selected period.'
                    )}
                    {renderSectionHeader('Review & Authorization')}
                    {renderSignatures(['Procurement Manager', 'Plant Manager', 'Date'])}
                </>
            );
            break;
        }

    }
    return (
        <div className="print-engine-wrapper">
            {content}
        </div>
    );

};

export default PrintEngine;
