/**
 * build_comparison_pdf.js
 * Generates a polished PDF from Comparison.md:
 *   - Cover page: full-bleed, NO header/footer, NO page number
 *   - Body pages: single header + single footer, page numbers starting at 1
 *
 * Strategy: Two-pass render
 *   Pass 1 → cover only (displayHeaderFooter: false)
 *   Pass 2 → body only (displayHeaderFooter: true)
 *   Merge  → pdf-lib concatenates the two PDFs
 *
 * Run:  node scripts/build_comparison_pdf.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Locate puppeteer ────────────────────────────────────────────────────────
const candidates = [
  path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'md-to-pdf', 'node_modules', 'puppeteer'),
  path.join(__dirname, '..', 'node_modules', 'puppeteer'),
];
let puppeteer;
for (const p of candidates) { try { puppeteer = require(p); break; } catch {} }
if (!puppeteer) { console.error('ERROR: puppeteer not found.'); process.exit(1); }

// ── Locate / install pdf-lib ────────────────────────────────────────────────
let PDFLib;
try {
  PDFLib = require('pdf-lib');
} catch {
  console.log('Installing pdf-lib...');
  require('child_process').execSync('npm install pdf-lib', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  PDFLib = require('pdf-lib');
}
const { PDFDocument } = PDFLib;

// ── Paths ───────────────────────────────────────────────────────────────────
const ROOT     = path.resolve(__dirname, '..');
const MD_FILE  = path.join(ROOT, 'Comparison.md');
const LOGO     = path.join(ROOT, 'public', 'assets', 'TrierOS_Logo.png');
const OUT_FILE = path.join(ROOT, 'Trier_OS_Executive_Assessment_2026.pdf');

const md      = fs.readFileSync(MD_FILE, 'utf8');
const logoB64 = fs.readFileSync(LOGO).toString('base64');
const logoSrc = `data:image/png;base64,${logoB64}`;

// ── Markdown → HTML ────────────────────────────────────────────────────────
function md2html(text) {
  let h = text;
  // Fenced code blocks first
  h = h.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`
  );
  h = h.replace(/^> (.+)$/gm,   '<blockquote><p>$1</p></blockquote>');
  h = h.replace(/^#### (.+)$/gm,'<h4>$1</h4>');
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm,   '<h1>$1</h1>');
  h = h.replace(/^---$/gm,      '<hr>');
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  h = h.replace(/`([^`]+)`/g,         '<code>$1</code>');
  // Tables
  h = h.replace(/((?:^\|.+\|\n)+)/gm, block => {
    const rows = block.trim().split('\n');
    let out = '<table>', isHdr = true;
    for (const row of rows) {
      if (/^\|[\s|:-]+\|$/.test(row.trim())) { isHdr = false; continue; }
      const cells = row.split('|').slice(1,-1);
      const tag = isHdr ? 'th' : 'td';
      out += '<tr>' + cells.map(c=>`<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
      if (isHdr) isHdr = false;
    }
    return out + '</table>';
  });
  // Ordered list
  h = h.replace(/((?:^\d+\..+\n?)+)/gm, b => {
    const items = b.trim().split('\n').map(l=>`<li>${l.replace(/^\d+\.\s*/,'')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });
  // Unordered list
  h = h.replace(/((?:^- .+\n?)+)/gm, b => {
    const items = b.trim().split('\n').map(l=>`<li>${l.replace(/^- /,'')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  // Links
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2">$1</a>');
  // Paragraphs
  const blockRe = /^<(h[1-6]|hr|ul|ol|li|table|tr|th|td|pre|blockquote)/;
  h = h.split('\n').map(line => {
    const t = line.trim();
    if (!t) return '';
    if (blockRe.test(t)) return t;
    return `<p>${t}</p>`;
  }).join('\n');
  return h;
}

// Strip the leading h1 + meta lines from body (they're on the cover)
const bodyMd   = md.replace(/^# .+\n+((?:\*\*.+\*\*\s*\n)+)?\n*/m,'').trimStart();
const bodyHtml = md2html(bodyMd);

// ── Shared CSS ──────────────────────────────────────────────────────────────
const SHARED_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
  font-size: 10.5pt; line-height: 1.65; color: #1a1f2e; background: #fff;
}
h1 { font-size:17pt;font-weight:700;color:#091624;border-bottom:3px solid #0044ee;padding-bottom:8px;margin:22px 0 10px; }
h2 { font-size:13pt;font-weight:700;color:#091624;border-left:4px solid #0044ee;padding-left:10px;margin:18px 0 8px;page-break-after:avoid; }
h3 { font-size:11pt;font-weight:600;color:#163354;margin:14px 0 5px;page-break-after:avoid; }
h4 { font-size:10.5pt;font-weight:600;color:#163354;margin:10px 0 3px; }
p  { margin:3px 0 8px; }
hr { border:none;border-top:1px solid #dde5f0;margin:14px 0; }
blockquote { border-left:4px solid #00aaff;background:#eef6ff;border-radius:0 6px 6px 0;margin:12px 0;padding:10px 16px;color:#163354; }
blockquote p { margin:0;font-style:italic; }
ul,ol { margin:6px 0 12px 24px; }
li { margin-bottom:4px; }
code { font-family:'Consolas','Courier New',monospace;font-size:8.5pt;background:#eef2fa;color:#163354;padding:1px 5px;border-radius:3px; }
pre { background:#0d1e30;color:#c5dcf5;font-family:'Consolas','Courier New',monospace;font-size:8pt;line-height:1.5;padding:14px 18px;border-radius:6px;margin:12px 0 16px;page-break-inside:avoid;white-space:pre-wrap;word-break:break-word; }
pre code { background:transparent;color:inherit;padding:0;font-size:inherit; }
table { width:100%;border-collapse:collapse;margin:12px 0 18px;font-size:9pt; }
th { background:#0d1e30;color:#7ec8f0;font-weight:600;text-align:left;padding:7px 10px;border:1px solid #1a3a5c; }
td { padding:6px 10px;border:1px solid #dde5f0;vertical-align:top; }
tr { page-break-inside:avoid; }
tr:nth-child(even) td { background:#f5f8fd; }
a { color:#0044ee;text-decoration:none; }
strong { font-weight:700; }
@page { size: letter; }
`;

// ── Cover HTML ──────────────────────────────────────────────────────────────
const COVER_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
${SHARED_CSS}
html,body { height:100%; }
body { background:#091624; }
.cover {
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  min-height:100vh; width:100%;
  background:linear-gradient(155deg,#091624 0%,#163354 50%,#091624 100%);
  color:#fff; text-align:center; padding:60px 80px;
}
.logo { width:280px;margin-bottom:44px;filter:drop-shadow(0 6px 32px rgba(0,160,255,0.40)); }
.rule { width:72px;height:3px;border-radius:2px;background:linear-gradient(90deg,#00aaff,#0044ee);margin:20px auto 28px; }
.title { font-size:28pt;font-weight:700;letter-spacing:0.4px;line-height:1.15;color:#fff;margin-bottom:6px; }
.subtitle { font-size:12pt;font-weight:400;color:#7ec8f0;letter-spacing:2px;text-transform:uppercase;margin-bottom:52px; }
.meta { background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:26px 52px;text-align:left; }
.meta p { font-size:10pt;color:#b0d4ec;line-height:2.1;margin:0; }
.meta p strong { color:#fff;font-weight:600;display:inline-block;width:130px; }
.copy { margin-top:60px;font-size:8pt;color:rgba(255,255,255,0.28);letter-spacing:0.6px; }
</style></head><body>
<div class="cover">
  <img class="logo" src="${logoSrc}" alt="Trier OS">
  <div class="rule"></div>
  <div class="title">Executive Assessment &amp;<br>Competitive Analysis</div>
  <div class="subtitle">Trier OS &mdash; Plant Operations Platform</div>
  <div class="meta">
    <p><strong>Prepared for:</strong> C-Suite &amp; Stakeholders</p>
    <p><strong>Date:</strong> April 26, 2026</p>
    <p><strong>Version:</strong> 3.6.2</p>
    <p><strong>Classification:</strong> Strategic &mdash; Internal Distribution</p>
    <p><strong>License:</strong> MIT Open Source</p>
    <p><strong>Repository:</strong> github.com/DougTrier/trier-os</p>
  </div>
  <p class="copy">&copy; 2026 Doug Trier &nbsp;&bull;&nbsp; All Rights Reserved</p>
</div>
</body></html>`;

// ── Body HTML ───────────────────────────────────────────────────────────────
const BODY_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>${SHARED_CSS}</style></head><body>
<div style="padding:4px 0 24px;">${bodyHtml}</div>
</body></html>`;

// ── Puppeteer header/footer ─────────────────────────────────────────────────
const HEADER = `<div style="
  width:100%;padding:6px 22mm 0;
  font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;
  color:#8a9ab0;text-align:center;letter-spacing:0.3px;">
  Trier OS &mdash; Executive Assessment &amp; Competitive Analysis &nbsp;|&nbsp; Confidential
</div>`;

const FOOTER = `<div style="
  width:100%;padding:0 22mm 6px;
  font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#8a9ab0;
  display:flex;justify-content:space-between;">
  <span>&copy; 2026 Doug Trier &nbsp;|&nbsp; Confidential</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu'],
  });

  // ── Pass 1: Cover (no header/footer) ──────────────────────────────────────
  console.log('Rendering cover page...');
  const coverPage = await browser.newPage();
  await coverPage.setContent(COVER_HTML, { waitUntil: 'networkidle0' });
  const coverBytes = await coverPage.pdf({
    format: 'Letter',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    displayHeaderFooter: false,
  });
  await coverPage.close();

  // ── Pass 2: Body (with header/footer) ─────────────────────────────────────
  console.log('Rendering body pages...');
  const bodyPage = await browser.newPage();
  await bodyPage.setContent(BODY_HTML, { waitUntil: 'networkidle0' });
  const bodyBytes = await bodyPage.pdf({
    format: 'Letter',
    printBackground: true,
    margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    displayHeaderFooter: true,
    headerTemplate: HEADER,
    footerTemplate:  FOOTER,
  });
  await bodyPage.close();
  await browser.close();

  // ── Merge ──────────────────────────────────────────────────────────────────
  console.log('Merging cover + body...');
  const finalDoc  = await PDFDocument.create();
  const coverDoc  = await PDFDocument.load(coverBytes);
  const bodyDoc   = await PDFDocument.load(bodyBytes);

  const [coverCopied] = await finalDoc.copyPages(coverDoc, [0]);
  finalDoc.addPage(coverCopied);

  const bodyIndices = bodyDoc.getPageIndices();
  const bodyCopied  = await finalDoc.copyPages(bodyDoc, bodyIndices);
  bodyCopied.forEach(p => finalDoc.addPage(p));

  const merged = await finalDoc.save();
  fs.writeFileSync(OUT_FILE, merged);

  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(0);
  console.log(`\n✅  PDF ready (${kb} KB):\n    ${OUT_FILE}\n`);
})();
