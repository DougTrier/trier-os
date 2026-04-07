// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS — Print Utility
 * ========================
 * Opens a popup window with formatted HTML for printing.
 * Bypasses all @media print CSS issues by rendering clean HTML.
 */

/**
 * Print a record in a new window with Trier OS branding + company logo.
 * @param {string} title - Document title (e.g. "Vehicle Report: BT-701")
 * @param {string} htmlContent - HTML string of the record body
 * @param {object} [opts] - Options: { plantLabel, subtitle }
 */
export async function printRecord(title, htmlContent, opts = {}) {
    const plantLabel = opts.plantLabel || localStorage.getItem('selectedPlantId') || 'All Sites';
    const subtitle = opts.subtitle || '';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Fetch branding to get custom logo
    let logoUrl = '/assets/TrierLogoPrint.png'; // default
    let companyName = 'Trier OS';
    try {
        const res = await fetch('/api/branding');
        const branding = await res.json();
        if (branding.documentLogo) logoUrl = branding.documentLogo;
        else if (branding.dashboardLogo) logoUrl = branding.dashboardLogo;
        if (branding.companyName) companyName = branding.companyName;
    } catch (e) { /* use defaults */ }

    // Make logo URL absolute for the popup window
    const absLogoUrl = logoUrl.startsWith('http') ? logoUrl : `${window.location.origin}${logoUrl}`;

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 10pt; line-height: 1.5; color: #1e293b; padding: 0.4in; }
        
        .print-header { border-bottom: 3px solid #1e1b4b; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
        .print-brand h1 { font-family: 'Outfit', sans-serif; font-size: 18pt; font-weight: 900; color: #1e1b4b; margin: 0; }
        .print-brand p { font-size: 8pt; color: #64748b; margin: 2px 0 0; }
        .print-meta { text-align: right; font-size: 8pt; color: #475569; }
        .print-meta .plant { font-weight: 700; font-size: 9pt; color: #1e1b4b; }
        
        .doc-title { font-family: 'Outfit', sans-serif; font-size: 14pt; font-weight: 800; color: #1e1b4b; margin: 0 0 15px; text-transform: uppercase; letter-spacing: 0.03em; }
        .doc-subtitle { font-size: 9pt; color: #64748b; margin: -10px 0 15px; }

        .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 18px; }
        .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
        .info-box .label { font-size: 7pt; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
        .info-box .value { font-size: 10pt; font-weight: 600; color: #0f172a; margin-top: 2px; }

        .section-header { background: #f1f5f9; border-left: 4px solid #1e1b4b; padding: 6px 12px; margin: 18px 0 8px; font-family: 'Outfit', sans-serif; font-size: 10pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #1e1b4b; }

        table { width: 100%; border-collapse: collapse; margin: 8px 0 15px; font-size: 9pt; }
        th { background: #f1f5f9; border: 1px solid #94a3b8; padding: 6px 8px; text-align: left; font-weight: 700; text-transform: uppercase; font-size: 7.5pt; letter-spacing: 0.04em; color: #1e293b; }
        td { border: 1px solid #e2e8f0; padding: 5px 8px; }
        
        .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 8pt; font-weight: 700; }
        .badge-green { background: #dcfce7; color: #166534; }
        .badge-red { background: #fee2e2; color: #991b1b; }
        .badge-yellow { background: #fef3c7; color: #92400e; }
        .badge-blue { background: #dbeafe; color: #1e40af; }
        .badge-purple { background: #ede9fe; color: #5b21b6; }
        .badge-gray { background: #f1f5f9; color: #475569; }

        .text-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; }
        .text-block .label { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
        .text-block p { margin: 0; font-size: 9.5pt; }

        .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 7pt; color: #94a3b8; }

        @media print {
            body { padding: 0; }
            @page { margin: 0.4in; }
        }
    </style>
</head>
<body>
    <div class="print-header">
        <div class="print-brand">
            <img src="${absLogoUrl}" alt="${companyName}" style="height: 60px; width: auto; margin-bottom: 6px;" onerror="this.style.display='none'"/>
            <h1>${companyName}</h1>
            <p>Enterprise Operations Platform</p>
        </div>
        <div class="print-meta">
            <div class="plant">${plantLabel.replace(/_/g, ' ')}</div>
            <div>${dateStr} · ${timeStr}</div>
        </div>
    </div>
    <h2 class="doc-title">${title}</h2>
    ${subtitle ? `<p class="doc-subtitle">${subtitle}</p>` : ''}
    ${htmlContent}
    <div class="footer">
        <span>${companyName} · © ${now.getFullYear()} Doug Trier · Confidential</span>
        <span>Printed ${dateStr} ${timeStr}</span>
    </div>
</body>
</html>`;

    // Use a hidden iframe — no popup window, just the print dialog
    const frameId = 'trier-print-frame';
    let frame = document.getElementById(frameId);
    if (frame) frame.remove();
    
    frame = document.createElement('iframe');
    frame.id = frameId;
    frame.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:900px;height:700px;border:none;';
    document.body.appendChild(frame);
    
    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    
    // Wait for fonts/images to load, then print
    setTimeout(() => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        // Clean up after printing
        setTimeout(() => { frame.remove(); }, 2000);
    }, 800);
}

/**
 * Helper: build an info grid HTML row
 */
export function infoGridHTML(pairs) {
    return `<div class="info-grid">${pairs.map(([label, value]) =>
        `<div class="info-box"><div class="label">${label}</div><div class="value">${value || '—'}</div></div>`
    ).join('')}</div>`;
}

/**
 * Helper: build a table HTML
 */
export function tableHTML(headers, rows) {
    return `<table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
}

/**
 * Helper: badge HTML
 */
export function badgeHTML(text, color = 'gray') {
    return `<span class="badge badge-${color}">${text}</span>`;
}
