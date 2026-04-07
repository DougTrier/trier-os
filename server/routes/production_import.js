// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS — AS400 Production Import & Planning Engine
 * =====================================================
 * Two-stage pipeline: (1) parse AS400 "Number 9 Report" fixed-width text into
 * structured production orders, (2) drive the Production Planning Engine which
 * manages rolling history pads and add/cut production scheduling.
 * Mounted at /api/production-import in server/index.js.
 *
 * FIXED-WIDTH COLUMN MAP (0-indexed, AS400 Number 9 Report):
 *   Col 17–26   PROD#        Right-justified 4–5 digit product number
 *   Col 30–36   SIZE         GAL, HGL, QT, PT, HP, DISP, etc.
 *   Col 36–55   DESCRIPTION  Product description text
 *   Col 55–65   LABEL        Label/retailer code
 *   Col 65+     QUANTITIES   Parsed by regex: REG-QTY / TRS-QTY / TOT-QTY
 *
 * ENDPOINTS:
 *   POST /parse               Dry-run parse: returns structured orders without saving
 *   POST /import              Parse + persist to ProductionImportBatch + ProductionOrders
 *   GET  /orders              List production orders (filter: plant, date, batch)
 *   PUT  /orders/:id          Update order fields (qty adjustments, status)
 *   GET  /batches             List import batches with summary statistics
 *   GET  /pads                Fetch rolling history pads for the Planning Engine
 *   PUT  /pads                Upsert pad configuration (rolling window, baseline)
 *   GET  /summary             Daily production summary with % of target metrics
 *   GET  /history             Historical production data (date range query)
 *   GET  /history-bulk        Bulk history export (multi-plant, date range)
 *   POST /orders/add          Planning Engine: add a new production run to the schedule
 *   POST /orders/:id/cut      Planning Engine: cut/cancel a scheduled production run
 *   DELETE /orders/:id        Hard delete a production order
 *   POST /orders/:id/restore  Restore a cut production order
 *   POST /apply-pads          Apply pad baseline to recalculate scheduled quantities
 *   DELETE /pads/:id          Remove a rolling history pad
 *   GET  /pads/suggest        AI-assisted pad suggestion based on historical actuals
 *
 * IMPORT FLOW:
 *   1. Client POSTs raw AS400 text to /parse for preview (no DB write)
 *   2. User confirms → POST /import saves batch + individual orders
 *   3. Planning Engine reads /orders to drive daily production scheduling
 *
 * TABLES (all in trier_logistics.db):
 *   ProductionImportBatch   — One row per file import with raw text + metadata
 *   ProductionOrders        — One row per product line (linked to batch)
 *   ProductionPads          — Rolling baseline pads for the planning engine
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb } = require('../logistics_db');

// ── Table Init ───────────────────────────────────────────────────────────────
function initProductionImportTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS ProductionImportBatch (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PlantID TEXT NOT NULL,
            ImportDate TEXT NOT NULL,
            ProductionDate TEXT NOT NULL,
            SourceType TEXT DEFAULT 'as400-number9',
            RawText TEXT,
            TotalLines INTEGER DEFAULT 0,
            TotalUnits INTEGER DEFAULT 0,
            Status TEXT DEFAULT 'pending',
            ImportedBy TEXT,
            CreatedAt TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS ProductionOrders (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            BatchID INTEGER REFERENCES ProductionImportBatch(ID),
            PlantID TEXT NOT NULL,
            ProductionDate TEXT NOT NULL,
            ProdNumber TEXT,
            SizeCode TEXT,
            Description TEXT,
            LabelCode TEXT,
            Section TEXT DEFAULT 'MANUFACTURED',
            RegQty INTEGER DEFAULT 0,
            TrsQty INTEGER DEFAULT 0,
            TotQty INTEGER DEFAULT 0,
            PlantProductID INTEGER,
            BeginningInventory INTEGER DEFAULT 0,
            Pad INTEGER DEFAULT 0,
            PadNote TEXT,
            ManualAdjust INTEGER DEFAULT 0,
            ManualAdjustNote TEXT,
            FinalQty INTEGER DEFAULT 0,
            Status TEXT DEFAULT 'open',
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS ProductionPads (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PlantID TEXT NOT NULL,
            ProdNumber TEXT NOT NULL,
            SizeCode TEXT,
            LabelCode TEXT,
            PadMon INTEGER DEFAULT 0,
            PadTue INTEGER DEFAULT 0,
            PadWed INTEGER DEFAULT 0,
            PadThu INTEGER DEFAULT 0,
            PadFri INTEGER DEFAULT 0,
            PadSat INTEGER DEFAULT 0,
            PadSun INTEGER DEFAULT 0,
            Notes TEXT,
            UpdatedAt TEXT DEFAULT (datetime('now')),
            UNIQUE(PlantID, ProdNumber, SizeCode, LabelCode)
        );
    `);

    // Safe column migrations
    const migrations = [
        "ALTER TABLE ProductionOrders ADD COLUMN PlantProductID INTEGER",
        "ALTER TABLE ProductionOrders ADD COLUMN BeginningInventory INTEGER DEFAULT 0",
        "ALTER TABLE ProductionOrders ADD COLUMN Pad INTEGER DEFAULT 0",
        "ALTER TABLE ProductionOrders ADD COLUMN PadNote TEXT",
        "ALTER TABLE ProductionOrders ADD COLUMN ManualAdjust INTEGER DEFAULT 0",
        "ALTER TABLE ProductionOrders ADD COLUMN ManualAdjustNote TEXT",
        "ALTER TABLE ProductionOrders ADD COLUMN FinalQty INTEGER DEFAULT 0",
        "ALTER TABLE ProductionOrders ADD COLUMN Status TEXT DEFAULT 'open'",
    ];
    for (const sql of migrations) { try { logisticsDb.exec(sql); } catch (_) {} }

    console.log('[PRODUCTION_IMPORT] Tables initialized');
}
initProductionImportTables();

const getPlantId = (req) => req.headers['x-plant-id'] || 'Plant_1';

// ── AS400 Number 9 Report Parser ─────────────────────────────────────────────
/**
 * Parses AS400 "PRODUCTION ORDER RECAP" fixed-width text.
 * Returns array of parsed order line objects.
 */
function parseNumber9Report(rawText) {
    const lines = rawText.split(/\r?\n/);
    const results = [];
    let currentSection = 'MANUFACTURED';
    let lineCount = 0;

    for (const raw of lines) {
        const line = raw.trimEnd();
        lineCount++;

        // Detect section headers
        if (/MANUFACTURED/i.test(line)) { currentSection = 'MANUFACTURED'; continue; }
        if (/PURCHASED/i.test(line))    { currentSection = 'PURCHASED';    continue; }

        // Skip short lines, headers, totals, page breaks
        if (line.length < 50) continue;
        if (/PAGE|REPORT|DATE|TIME|COMPANY|DIVISION|RECAP|PRODUCT.*ORDER|={5,}|-{5,}/i.test(line)) continue;
        if (/^\s*TOTAL/i.test(line)) continue;

        // Product number lives at cols 17–26 (0-indexed), right-justified
        const prodRaw = line.substring(17, 27).trim();
        if (!/^\d{3,6}$/.test(prodRaw)) continue; // must be numeric

        const sizeRaw  = line.length > 30 ? line.substring(30, 36).trim() : '';
        const descRaw  = line.length > 36 ? line.substring(36, 55).trim() : '';
        const labelRaw = line.length > 55 ? line.substring(55, 65).trim() : '';
        const qtyPart  = line.length > 65 ? line.substring(65).trim()     : '';

        // Extract quantities — three right-justified numeric columns
        // Pattern: optionally signed integers, possibly with commas
        const nums = [...qtyPart.matchAll(/(\d[\d,]*)/g)].map(m => parseInt(m[1].replace(/,/g,''), 10));
        const regQty = nums[0] || 0;
        const trsQty = nums[1] || 0;
        const totQty = nums[2] || (regQty + trsQty);

        if (totQty === 0 && regQty === 0) continue; // skip zero-quantity lines

        results.push({
            section:  currentSection,
            prod:     prodRaw,
            size:     sizeRaw,
            desc:     descRaw,
            label:    labelRaw,
            regQty,
            trsQty,
            totQty,
        });
    }

    return results;
}

// ── Match parsed lines to SKU catalog ────────────────────────────────────────
function matchToSkuCatalog(plantId, parsedLines) {
    const products = logisticsDb.prepare(
        'SELECT ID, SKU, ProductName, SizeCode FROM PlantProducts WHERE PlantID=? AND Active=1'
    ).all(plantId);

    // Build lookup by SKU prefix patterns
    const skuMap = {};
    for (const p of products) {
        const key = p.SKU.toUpperCase();
        skuMap[key] = p.ID;
    }

    return parsedLines.map(line => {
        // Try to find a matching PlantProduct by prod# or size pattern
        // Simple heuristic: look for SKU containing size code
        let plantProductId = null;
        const sizeUpper = line.size.toUpperCase();
        for (const p of products) {
            if (p.SKU.includes(sizeUpper) || p.SKU.includes(line.prod)) {
                plantProductId = p.ID;
                break;
            }
        }
        return { ...line, plantProductId };
    });
}

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /api/production-import/parse — parse raw text, return preview (no DB write)
router.post('/parse', (req, res) => {
    try {
        const { rawText } = req.body;
        if (!rawText || rawText.trim().length < 10) {
            return res.status(400).json({ error: 'rawText required' });
        }
        const lines = parseNumber9Report(rawText);

        // Summarize by section
        const summary = {
            totalLines: lines.length,
            totalUnits: lines.reduce((s, l) => s + l.totQty, 0),
            manufactured: lines.filter(l => l.section === 'MANUFACTURED').length,
            purchased:    lines.filter(l => l.section === 'PURCHASED').length,
            bySizeCode:   {},
        };
        for (const l of lines) {
            summary.bySizeCode[l.size] = (summary.bySizeCode[l.size] || 0) + l.totQty;
        }

        res.json({ success: true, summary, lines });
    } catch (err) {
        console.error('[PRODUCTION_IMPORT] parse error:', err);
        res.status(500).json({ error: 'Parse failed: ' + err.message });
    }
});

// POST /api/production-import/import — parse + save to DB
router.post('/import', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { rawText, productionDate, importedBy } = req.body;
        if (!rawText) return res.status(400).json({ error: 'rawText required' });
        if (!productionDate) return res.status(400).json({ error: 'productionDate required' });

        const lines = parseNumber9Report(rawText);
        if (lines.length === 0) return res.status(400).json({ error: 'No valid order lines found in report' });

        const matched = matchToSkuCatalog(plantId, lines);
        const totalUnits = lines.reduce((s, l) => s + l.totQty, 0);

        const doImport = logisticsDb.transaction(() => {
            // Create batch record
            const batchId = logisticsDb.prepare(`
                INSERT INTO ProductionImportBatch
                    (PlantID, ImportDate, ProductionDate, SourceType, RawText, TotalLines, TotalUnits, Status, ImportedBy)
                VALUES (?, datetime('now'), ?, 'as400-number9', ?, ?, ?, 'imported', ?)
            `).run(plantId, productionDate, rawText, lines.length, totalUnits, importedBy || 'system').lastInsertRowid;

            // Remove any existing orders for this plant+date
            logisticsDb.prepare(
                "DELETE FROM ProductionOrders WHERE PlantID=? AND ProductionDate=?"
            ).run(plantId, productionDate);

            const insertOrder = logisticsDb.prepare(`
                INSERT INTO ProductionOrders
                    (BatchID, PlantID, ProductionDate, ProdNumber, SizeCode, Description, LabelCode, Section,
                     RegQty, TrsQty, TotQty, PlantProductID, FinalQty)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            `);

            for (const l of matched) {
                insertOrder.run(
                    batchId, plantId, productionDate,
                    l.prod, l.size, l.desc, l.label, l.section,
                    l.regQty, l.trsQty, l.totQty, l.plantProductId,
                    l.totQty  // FinalQty starts equal to TotQty; adjusted by pads/inventory
                );
            }

            return { batchId, count: lines.length, totalUnits };
        });

        const result = doImport();
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[PRODUCTION_IMPORT] import error:', err);
        res.status(500).json({ error: 'Import failed: ' + err.message });
    }
});

// GET /api/production-import/orders?date=YYYY-MM-DD — get orders for a date
router.get('/orders', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: 'date required' });

        const orders = logisticsDb.prepare(`
            SELECT po.*, pp.ProductName, pp.ProductFamily, pp.ButterfatPct, pp.ProductionSequence,
                   pp.ChangeoverFromPrev, pp.LabelName
            FROM ProductionOrders po
            LEFT JOIN PlantProducts pp ON pp.ID = po.PlantProductID
            WHERE po.PlantID=? AND po.ProductionDate=?
            ORDER BY po.Section, pp.ProductionSequence, po.ProdNumber, po.SizeCode
        `).all(plantId, date);

        const batch = logisticsDb.prepare(
            'SELECT * FROM ProductionImportBatch WHERE PlantID=? AND ProductionDate=? ORDER BY CreatedAt DESC LIMIT 1'
        ).get(plantId, date);

        res.json({ orders, batch });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch orders: ' + err.message });
    }
});

// PUT /api/production-import/orders/:id — update beginning inventory, pad, manual adjust
router.put('/orders/:id', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { beginningInventory, pad, padNote, manualAdjust, manualAdjustNote } = req.body;
        const order = logisticsDb.prepare(
            'SELECT * FROM ProductionOrders WHERE ID=? AND PlantID=?'
        ).get(req.params.id, plantId);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        const bi   = beginningInventory !== undefined ? beginningInventory : order.BeginningInventory;
        const pad_ = pad                !== undefined ? pad                : order.Pad;
        const ma   = manualAdjust       !== undefined ? manualAdjust       : order.ManualAdjust;
        // Formula: FinalQty = TotQty - BeginningInventory + Pad + ManualAdjust
        const finalQty = Math.max(0, order.TotQty - bi + pad_ + ma);

        logisticsDb.prepare(`
            UPDATE ProductionOrders SET
                BeginningInventory=?, Pad=?, PadNote=?, ManualAdjust=?, ManualAdjustNote=?,
                FinalQty=?, UpdatedAt=datetime('now')
            WHERE ID=? AND PlantID=?
        `).run(bi, pad_, padNote || order.PadNote, ma, manualAdjustNote || order.ManualAdjustNote,
               finalQty, req.params.id, plantId);

        res.json({ success: true, finalQty });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update order: ' + err.message });
    }
});

// GET /api/production-import/batches — list import history
router.get('/batches', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const batches = logisticsDb.prepare(
            'SELECT ID, ProductionDate, ImportDate, TotalLines, TotalUnits, Status, ImportedBy FROM ProductionImportBatch WHERE PlantID=? ORDER BY ProductionDate DESC LIMIT 30'
        ).all(plantId);
        res.json(batches);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch batches: ' + err.message });
    }
});

// GET /api/production-import/pads — get pad settings
router.get('/pads', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const pads = logisticsDb.prepare('SELECT * FROM ProductionPads WHERE PlantID=? ORDER BY ProdNumber, SizeCode').all(plantId);
        res.json(pads);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch pads: ' + err.message });
    }
});

// PUT /api/production-import/pads — upsert pad settings for a SKU
router.put('/pads', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { prodNumber, sizeCode, labelCode, padMon=0, padTue=0, padWed=0, padThu=0, padFri=0, padSat=0, padSun=0, notes } = req.body;
        if (!prodNumber) return res.status(400).json({ error: 'prodNumber required' });

        logisticsDb.prepare(`
            INSERT INTO ProductionPads (PlantID, ProdNumber, SizeCode, LabelCode, PadMon, PadTue, PadWed, PadThu, PadFri, PadSat, PadSun, Notes, UpdatedAt)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
            ON CONFLICT(PlantID, ProdNumber, SizeCode, LabelCode) DO UPDATE SET
                PadMon=excluded.PadMon, PadTue=excluded.PadTue, PadWed=excluded.PadWed,
                PadThu=excluded.PadThu, PadFri=excluded.PadFri, PadSat=excluded.PadSat,
                PadSun=excluded.PadSun, Notes=excluded.Notes, UpdatedAt=datetime('now')
        `).run(plantId, prodNumber, sizeCode||'', labelCode||'', padMon, padTue, padWed, padThu, padFri, padSat, padSun, notes||'');

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save pad: ' + err.message });
    }
});

// GET /api/production-import/summary?date=YYYY-MM-DD — planning summary for a date
router.get('/summary', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: 'date required' });

        const orders = logisticsDb.prepare(`
            SELECT po.*, pp.ProductName, pp.ProductFamily, pp.ButterfatPct,
                   pp.ProductionSequence, pp.ChangeoverFromPrev, pp.LabelName
            FROM ProductionOrders po
            LEFT JOIN PlantProducts pp ON pp.ID = po.PlantProductID
            WHERE po.PlantID=? AND po.ProductionDate=?
            ORDER BY pp.ProductionSequence, po.SizeCode
        `).all(plantId, date);

        const totalOrdered  = orders.reduce((s,o) => s + (o.TotQty || 0), 0);
        const totalFinal    = orders.reduce((s,o) => s + (o.FinalQty || 0), 0);
        const byFamily      = {};
        for (const o of orders) {
            const f = o.ProductFamily || 'Unknown';
            if (!byFamily[f]) byFamily[f] = { ordered: 0, final: 0 };
            byFamily[f].ordered += o.TotQty || 0;
            byFamily[f].final   += o.FinalQty || 0;
        }

        res.json({ date, totalOrdered, totalFinal, byFamily, orderCount: orders.length });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch summary: ' + err.message });
    }
});

// ── Rolling History — 4-week avg per SKU ────────────────────────────────────
// GET /api/production-import/history?prod=&size=&label=&weeks=4
router.get('/history', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { prod, size, label, weeks = 4 } = req.query;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - (parseInt(weeks) * 7));
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        let sql = `
            SELECT po.ProdNumber, po.SizeCode, po.LabelCode, po.ProductionDate,
                   po.TotQty, po.FinalQty, po.BeginningInventory, po.Pad, po.ManualAdjust
            FROM ProductionOrders po
            WHERE po.PlantID=? AND po.ProductionDate >= ?
        `;
        const params = [plantId, cutoffStr];

        if (prod)  { sql += ' AND po.ProdNumber=?';  params.push(prod); }
        if (size)  { sql += ' AND po.SizeCode=?';    params.push(size); }
        if (label) { sql += ' AND po.LabelCode=?';   params.push(label);}
        sql += ' ORDER BY po.ProductionDate DESC';

        const rows = logisticsDb.prepare(sql).all(...params);

        // Group by SKU key and compute rolling averages
        const grouped = {};
        for (const r of rows) {
            const key = `${r.ProdNumber}|${r.SizeCode}|${r.LabelCode}`;
            if (!grouped[key]) grouped[key] = { prod: r.ProdNumber, size: r.SizeCode, label: r.LabelCode, days: [] };
            grouped[key].days.push({ date: r.ProductionDate, totQty: r.TotQty, finalQty: r.FinalQty, bi: r.BeginningInventory, pad: r.Pad, adj: r.ManualAdjust });
        }

        const summary = Object.values(grouped).map(g => {
            const n = g.days.length;
            const avgOrdered = n ? Math.round(g.days.reduce((s, d) => s + d.totQty, 0) / n) : 0;
            const avgFinal   = n ? Math.round(g.days.reduce((s, d) => s + d.finalQty, 0) / n) : 0;
            const maxOrdered = n ? Math.max(...g.days.map(d => d.totQty)) : 0;
            const minOrdered = n ? Math.min(...g.days.map(d => d.totQty)) : 0;
            const suggestedPad = Math.max(0, Math.round((maxOrdered - avgOrdered) * 0.5)); // buffer = half the swing
            return { prod: g.prod, size: g.size, label: g.label, days: n, avgOrdered, avgFinal, maxOrdered, minOrdered, suggestedPad, history: g.days };
        });

        res.json({ weeks: parseInt(weeks), cutoff: cutoffStr, items: summary });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Rolling History — summary for all SKUs on a given date (sidebar context) ─
// GET /api/production-import/history-bulk?date=YYYY-MM-DD&weeks=4
router.get('/history-bulk', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { date, weeks = 4 } = req.query;
        if (!date) return res.status(400).json({ error: 'date required' });

        const cutoff = new Date(date);
        cutoff.setDate(cutoff.getDate() - (parseInt(weeks) * 7));
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        // For each unique SKU seen in history, compute averages
        const rows = logisticsDb.prepare(`
            SELECT ProdNumber, SizeCode, LabelCode,
                   AVG(TotQty) as avgQty, MAX(TotQty) as maxQty, MIN(TotQty) as minQty, COUNT(*) as n
            FROM ProductionOrders
            WHERE PlantID=? AND ProductionDate >= ? AND ProductionDate < ?
            GROUP BY ProdNumber, SizeCode, LabelCode
        `).all(plantId, cutoffStr, date);

        const map = {};
        for (const r of rows) {
            const key = `${r.ProdNumber}|${r.SizeCode}|${r.LabelCode}`;
            map[key] = {
                avgQty: Math.round(r.avgQty),
                maxQty: r.maxQty,
                minQty: r.minQty,
                n: r.n,
                suggestedPad: Math.max(0, Math.round((r.maxQty - r.avgQty) * 0.5)),
            };
        }
        res.json(map);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Add / Cut manual order lines ─────────────────────────────────────────────
// POST /api/production-import/orders/add — add a manual line (not from report)
router.post('/orders/add', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { productionDate, prodNumber, sizeCode, description, labelCode, section = 'MANUFACTURED', qty, padQty = 0, reason } = req.body;
        if (!productionDate || !prodNumber || qty === undefined) {
            return res.status(400).json({ error: 'productionDate, prodNumber, qty required' });
        }
        const finalQty = Math.max(0, parseInt(qty) + parseInt(padQty));
        const r = logisticsDb.prepare(`
            INSERT INTO ProductionOrders
                (PlantID, ProductionDate, ProdNumber, SizeCode, Description, LabelCode, Section,
                 RegQty, TrsQty, TotQty, Pad, PadNote, ManualAdjust, ManualAdjustNote, FinalQty, Status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'manual-add')
        `).run(
            plantId, productionDate, prodNumber, sizeCode || '', description || '', labelCode || '', section,
            parseInt(qty), 0, parseInt(qty), parseInt(padQty), reason || '',
            0, reason || '',
            finalQty
        );
        res.status(201).json({ success: true, id: r.lastInsertRowid, finalQty });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/production-import/orders/:id/cut — mark a line as cut (zero out final)
router.post('/orders/:id/cut', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { reason, cutQty } = req.body;  // cutQty = partial cut (null = full cut)
        const order = logisticsDb.prepare('SELECT * FROM ProductionOrders WHERE ID=? AND PlantID=?').get(req.params.id, plantId);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        const newFinal = cutQty !== undefined ? Math.max(0, parseInt(cutQty)) : 0;
        logisticsDb.prepare(`
            UPDATE ProductionOrders SET
                FinalQty=?, ManualAdjust=?, ManualAdjustNote=?, Status=?, UpdatedAt=datetime('now')
            WHERE ID=? AND PlantID=?
        `).run(newFinal, newFinal - order.TotQty, reason || 'Cut', newFinal === 0 ? 'cut' : 'partial-cut', req.params.id, plantId);

        res.json({ success: true, finalQty: newFinal });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/production-import/orders/:id — remove a manual-add line entirely
router.delete('/orders/:id', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const order = logisticsDb.prepare("SELECT Status FROM ProductionOrders WHERE ID=? AND PlantID=?").get(req.params.id, plantId);
        if (!order) return res.status(404).json({ error: 'Not found' });
        if (order.Status !== 'manual-add') return res.status(400).json({ error: 'Only manually-added lines can be deleted' });
        logisticsDb.prepare('DELETE FROM ProductionOrders WHERE ID=? AND PlantID=?').run(req.params.id, plantId);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/production-import/orders/:id/restore — un-cut a line
router.post('/orders/:id/restore', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const order = logisticsDb.prepare('SELECT * FROM ProductionOrders WHERE ID=? AND PlantID=?').get(req.params.id, plantId);
        if (!order) return res.status(404).json({ error: 'Not found' });
        const finalQty = Math.max(0, order.TotQty - (order.BeginningInventory || 0) + (order.Pad || 0));
        logisticsDb.prepare(`
            UPDATE ProductionOrders SET FinalQty=?, ManualAdjust=0, ManualAdjustNote=NULL, Status='open', UpdatedAt=datetime('now')
            WHERE ID=? AND PlantID=?
        `).run(finalQty, req.params.id, plantId);
        res.json({ success: true, finalQty });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Pad auto-apply — apply saved day-of-week pads to all orders for a date ───
// POST /api/production-import/apply-pads?date=YYYY-MM-DD
router.post('/apply-pads', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: 'date required' });

        // Day of week 0=Sun,1=Mon,...
        const dow = new Date(date + 'T12:00:00').getDay();
        const padCol = ['PadSun','PadMon','PadTue','PadWed','PadThu','PadFri','PadSat'][dow];

        const orders = logisticsDb.prepare(
            "SELECT * FROM ProductionOrders WHERE PlantID=? AND ProductionDate=? AND Status != 'cut'"
        ).all(plantId, date);

        let updated = 0;
        const stmt = logisticsDb.prepare(`
            UPDATE ProductionOrders SET Pad=?, FinalQty=?, UpdatedAt=datetime('now') WHERE ID=?
        `);
        const tx = logisticsDb.transaction(() => {
            for (const o of orders) {
                const pad = logisticsDb.prepare(
                    `SELECT ${padCol} as p FROM ProductionPads WHERE PlantID=? AND ProdNumber=? AND SizeCode=? AND LabelCode=?`
                ).get(plantId, o.ProdNumber, o.SizeCode || '', o.LabelCode || '');
                if (pad && pad.p > 0) {
                    const finalQty = Math.max(0, o.TotQty - (o.BeginningInventory || 0) + pad.p + (o.ManualAdjust || 0));
                    stmt.run(pad.p, finalQty, o.ID);
                    updated++;
                }
            }
        });
        tx();
        res.json({ success: true, updated, date, dayOfWeek: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Pad Manager — upsert + delete ────────────────────────────────────────────
router.delete('/pads/:id', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM ProductionPads WHERE ID=? AND PlantID=?').run(req.params.id, getPlantId(req));
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/production-import/pads/suggest?date=YYYY-MM-DD — suggest pads from rolling history
router.get('/pads/suggest', (req, res) => {
    try {
        const plantId = getPlantId(req);
        const { date, weeks = 4 } = req.query;
        if (!date) return res.status(400).json({ error: 'date required' });
        const cutoff = new Date(date); cutoff.setDate(cutoff.getDate() - parseInt(weeks)*7);
        const rows = logisticsDb.prepare(`
            SELECT ProdNumber, SizeCode, LabelCode,
                   AVG(TotQty) as avg, MAX(TotQty) as max, MIN(TotQty) as min, COUNT(*) as n
            FROM ProductionOrders
            WHERE PlantID=? AND ProductionDate >= ? AND ProductionDate < ?
            GROUP BY ProdNumber, SizeCode, LabelCode HAVING n >= 2
        `).all(plantId, cutoff.toISOString().slice(0,10), date);

        const suggestions = rows.map(r => ({
            prod: r.ProdNumber, size: r.SizeCode, label: r.LabelCode, n: r.n,
            avg: Math.round(r.avg), max: r.max, min: r.min,
            suggestedPad: Math.max(0, Math.round((r.max - r.avg) * 0.5)),
        })).filter(s => s.suggestedPad > 0);

        res.json(suggestions);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
