// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS — Catalog Enrichment Engine
 * ======================================
 * Two-tier enrichment for parts:
 *   Tier 1: Match against mfg_master.db (MasterParts) for specs, pricing, category
 *   Tier 2: Cross-plant discovery — scan sibling plant DBs for matching parts
 *
 * ENDPOINTS:
 *   GET /api/catalog/enrich/:partId — Returns enrichment suggestions for a part
 *   POST /api/catalog/enrich/:partId/apply — Apply master catalog enrichment to a part
 *   POST /api/catalog/enrich/:partId/import — Import a part from another plant's database
 */
const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const dataDir = require('../resolve_data_dir');

/**
 * Tier 1: Search mfg_master.db MasterParts for matching entries
 * Matches on: part ID, description keywords, manufacturer
 */
function findMasterCatalogMatches(partId, description, manufacturer) {
    const masterPath = path.join(dataDir, 'mfg_master.db');
    if (!fs.existsSync(masterPath)) return [];

    const masterDb = new Database(masterPath, { readonly: true });
    const results = [];
    const seen = new Set();

    try {
        // 1. Exact ID match
        const exact = masterDb.prepare('SELECT * FROM MasterParts WHERE MasterPartID = ?').get(partId);
        if (exact) {
            seen.add(exact.MasterPartID);
            results.push({ ...exact, matchType: 'exact_id', confidence: 100 });
        }

        // 2. Fuzzy ID match (contains)
        const fuzzyId = masterDb.prepare(
            'SELECT * FROM MasterParts WHERE MasterPartID LIKE ? AND MasterPartID != ?'
        ).all(`%${partId}%`, partId);
        fuzzyId.forEach(r => {
            if (!seen.has(r.MasterPartID)) {
                seen.add(r.MasterPartID);
                results.push({ ...r, matchType: 'fuzzy_id', confidence: 70 });
            }
        });

        // 3. Description keyword match
        if (description) {
            // Extract significant keywords (3+ chars, not common words)
            const stopWords = new Set(['the','and','for','with','from','that','this','but','are','was','has','had','not','all','can']);
            const keywords = description
                .replace(/[^a-zA-Z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length >= 3 && !stopWords.has(w.toLowerCase()));

            // Search for each keyword combo (most specific first)
            if (keywords.length >= 2) {
                const twoWord = `%${keywords[0]}%${keywords[1]}%`;
                const descMatches = masterDb.prepare(
                    'SELECT * FROM MasterParts WHERE (Description LIKE ? OR StandardizedName LIKE ?) LIMIT 10'
                ).all(twoWord, twoWord);
                descMatches.forEach(r => {
                    if (!seen.has(r.MasterPartID)) {
                        seen.add(r.MasterPartID);
                        results.push({ ...r, matchType: 'description', confidence: 60 });
                    }
                });
            }

            // Single keyword with manufacturer
            if (manufacturer && keywords.length >= 1) {
                const mfgMatch = masterDb.prepare(
                    'SELECT * FROM MasterParts WHERE Manufacturer LIKE ? AND Description LIKE ? LIMIT 5'
                ).all(`%${manufacturer}%`, `%${keywords[0]}%`);
                mfgMatch.forEach(r => {
                    if (!seen.has(r.MasterPartID)) {
                        seen.add(r.MasterPartID);
                        results.push({ ...r, matchType: 'manufacturer_desc', confidence: 75 });
                    }
                });
            }
        }

        // 4. Manufacturer-only match (lower confidence)
        if (manufacturer && results.length < 3) {
            const mfgOnly = masterDb.prepare(
                'SELECT * FROM MasterParts WHERE Manufacturer LIKE ? LIMIT 5'
            ).all(`%${manufacturer}%`);
            mfgOnly.forEach(r => {
                if (!seen.has(r.MasterPartID)) {
                    seen.add(r.MasterPartID);
                    results.push({ ...r, matchType: 'manufacturer_only', confidence: 30 });
                }
            });
        }
    } catch (e) {
        console.warn('[Catalog Enrichment] Master lookup error:', e.message);
    } finally {
        masterDb.close();
    }

    // Sort by confidence descending
    return results.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
}

/**
 * Tier 2: Scan all sibling plant databases for matching parts
 * Returns matches from other plants with full part data
 */
function findCrossPlantMatches(partId, description, manufacturer, currentPlantId) {
    const plantsFile = path.join(dataDir, 'plants.json');
    if (!fs.existsSync(plantsFile)) return [];

    const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
    const results = [];

    for (const plant of plants) {
        if (plant.id === currentPlantId) continue; // skip current plant

        const dbPath = path.join(dataDir, `${plant.id}.db`);
        if (!fs.existsSync(dbPath)) continue;

        let tempDb;
        try {
            tempDb = new Database(dbPath, { readonly: true });
            const hasPart = tempDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Part'").get();
            if (!hasPart) { tempDb.close(); continue; }

            // 1. Exact ID match
            const exact = tempDb.prepare(
                'SELECT ID, Description, Manufacturer, Stock, OrdMin, UnitCost, Location, PartClassID FROM Part WHERE ID = ?'
            ).get(partId);

            if (exact) {
                results.push({
                    ...exact,
                    plantId: plant.id,
                    plantLabel: plant.label,
                    matchType: 'exact_id',
                    confidence: 100,
                    hasStock: (exact.Stock || 0) > 0
                });
                tempDb.close();
                continue;
            }

            // 2. Description/manufacturer match
            if (description) {
                const keywords = description
                    .replace(/[^a-zA-Z0-9\s]/g, ' ')
                    .split(/\s+/)
                    .filter(w => w.length >= 3);

                if (keywords.length >= 2) {
                    const pattern = `%${keywords[0]}%${keywords[1]}%`;
                    const matches = tempDb.prepare(
                        'SELECT ID, Description, Manufacturer, Stock, OrdMin, UnitCost, Location, PartClassID FROM Part WHERE Description LIKE ? LIMIT 3'
                    ).all(pattern);

                    matches.forEach(m => {
                        if (!results.find(r => r.plantId === plant.id && r.ID === m.ID)) {
                            results.push({
                                ...m,
                                plantId: plant.id,
                                plantLabel: plant.label,
                                matchType: 'description',
                                confidence: 65,
                                hasStock: (m.Stock || 0) > 0
                            });
                        }
                    });
                }

                // Manufacturer + single keyword
                if (manufacturer && keywords.length >= 1) {
                    const matches = tempDb.prepare(
                        'SELECT ID, Description, Manufacturer, Stock, OrdMin, UnitCost, Location, PartClassID FROM Part WHERE Manufacturer LIKE ? AND Description LIKE ? LIMIT 3'
                    ).all(`%${manufacturer}%`, `%${keywords[0]}%`);

                    matches.forEach(m => {
                        if (!results.find(r => r.plantId === plant.id && r.ID === m.ID)) {
                            results.push({
                                ...m,
                                plantId: plant.id,
                                plantLabel: plant.label,
                                matchType: 'manufacturer_desc',
                                confidence: 75,
                                hasStock: (m.Stock || 0) > 0
                            });
                        }
                    });
                }
            }
            tempDb.close();
        } catch (e) {
            if (tempDb) try { tempDb.close(); } catch {}
            // skip silently
        }
    }

    return results.sort((a, b) => b.confidence - a.confidence).slice(0, 20);
}


// ── GET /enrich/:partId ─────────────────────────────────────────────────
// Returns enrichment suggestions from both tiers
router.get('/:partId', (req, res) => {
    try {
        const partId = req.params.partId;
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';

        // Get current part data from plant DB
        let currentPart = null;
        try {
            currentPart = db.queryOne('SELECT * FROM Part WHERE ID = ?', [partId]);
        } catch (e) { /* part may not exist yet */ }

        const description = currentPart?.Description || req.query.description || '';
        const manufacturer = currentPart?.Manufacturer || req.query.manufacturer || '';

        // Tier 1: Master Catalog
        const masterMatches = findMasterCatalogMatches(partId, description, manufacturer);

        // Tier 2: Cross-Plant Discovery
        const crossPlantMatches = findCrossPlantMatches(partId, description, manufacturer, plantId);

        // Build enrichment suggestions
        const suggestions = [];

        // Master catalog suggestions — fields that could be enriched
        if (masterMatches.length > 0) {
            const best = masterMatches[0];
            const enrichable = {};
            if (best.Category && !currentPart?.PartClassID) enrichable.PartClassID = best.Category;
            if (best.Manufacturer && !currentPart?.Manufacturer) enrichable.Manufacturer = best.Manufacturer;
            if (best.UOM && !currentPart?.UOM) enrichable.UOM = best.UOM;
            if (best.TypicalPriceMin && !currentPart?.UnitCost) enrichable.UnitCost = `$${best.TypicalPriceMin} - $${best.TypicalPriceMax}`;
            if (best.Specifications) enrichable.Specifications = best.Specifications;
            if (best.LeadTimeDays) enrichable.LeadTimeDays = best.LeadTimeDays;

            suggestions.push({
                tier: 1,
                source: 'Master Dairy Catalog',
                match: best,
                enrichableFields: enrichable,
                confidence: best.confidence
            });
        }

        // Cross-plant suggestions
        crossPlantMatches.forEach(cp => {
            suggestions.push({
                tier: 2,
                source: `${cp.plantLabel} (${cp.plantId})`,
                match: cp,
                confidence: cp.confidence,
                canImport: true
            });
        });

        res.json({
            partId,
            currentPart: currentPart || null,
            masterMatches,
            crossPlantMatches,
            suggestions,
            hasMasterMatch: masterMatches.length > 0,
            hasCrossPlantMatch: crossPlantMatches.length > 0,
            totalSuggestions: suggestions.length
        });
    } catch (err) {
        console.error('GET /api/catalog/enrich/:partId error:', err);
        res.status(500).json({ error: 'Enrichment lookup failed' });
    }
});


// ── POST /enrich/:partId/apply ──────────────────────────────────────────
// Apply master catalog enrichment to a plant part
router.post('/:partId/apply', (req, res) => {
    try {
        const partId = req.params.partId;
        const { masterPartId, fields } = req.body;

        if (!masterPartId || !fields || typeof fields !== 'object') {
            return res.status(400).json({ error: 'masterPartId and fields object required' });
        }

        // Fetch master data to verify
        const masterPath = path.join(dataDir, 'mfg_master.db');
        const masterDb = new Database(masterPath, { readonly: true });
        const masterPart = masterDb.prepare('SELECT * FROM MasterParts WHERE MasterPartID = ?').get(masterPartId);
        masterDb.close();

        if (!masterPart) return res.status(404).json({ error: 'Master part not found' });

        // Apply only requested fields
        const allowedFields = ['PartClassID', 'Manufacturer', 'UOM', 'UnitCost', 'Description'];
        const updates = {};
        for (const [key, val] of Object.entries(fields)) {
            if (allowedFields.includes(key) && val) {
                updates[key] = val;
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields to apply' });
        }

        const sets = Object.keys(updates).map(k => `"${k}" = ?`).join(', ');
        const values = [...Object.values(updates), partId];
        db.run(`UPDATE "Part" SET ${sets} WHERE ID = ?`, values);

        console.log(`[Catalog Enrichment] Applied master catalog data to part ${partId}: ${JSON.stringify(updates)}`);
        res.json({ success: true, message: `Enriched ${partId} from Master Catalog`, appliedFields: updates });
    } catch (err) {
        console.error('POST /api/catalog/enrich/:partId/apply error:', err);
        res.status(500).json({ error: 'Failed to apply enrichment' });
    }
});


// ── POST /enrich/:partId/import ─────────────────────────────────────────
// Import a part from another plant's database into the current plant
router.post('/:partId/import', (req, res) => {
    try {
        const partId = req.params.partId;
        const { sourcePlantId, sourcePartId } = req.body;

        if (!sourcePlantId || !sourcePartId) {
            return res.status(400).json({ error: 'sourcePlantId and sourcePartId required' });
        }

        // Open source plant database
        const sourcePath = path.join(dataDir, `${sourcePlantId}.db`);
        if (!fs.existsSync(sourcePath)) {
            return res.status(404).json({ error: `Source plant database not found: ${sourcePlantId}` });
        }

        const sourceDb = new Database(sourcePath, { readonly: true });
        const sourcePart = sourceDb.prepare('SELECT * FROM Part WHERE ID = ?').get(sourcePartId);
        sourceDb.close();

        if (!sourcePart) return res.status(404).json({ error: `Part ${sourcePartId} not found in ${sourcePlantId}` });

        // Check if part already exists in current plant
        const existing = db.queryOne('SELECT ID FROM Part WHERE ID = ?', [partId]);
        if (existing) {
            return res.status(409).json({
                error: `Part ${partId} already exists in current plant. Use enrichment apply instead.`,
                existingPart: existing
            });
        }

        // Import — map source fields to target (reset stock to 0, keep catalog data)
        const importFields = {
            ID: partId,
            Description: sourcePart.Description || '',
            PartClassID: sourcePart.PartClassID || '',
            Manufacturer: sourcePart.Manufacturer || '',
            ManufID: sourcePart.ManufID || '',
            UOM: sourcePart.UOM || 'EA',
            UnitCost: sourcePart.UnitCost || 0,
            OrdMin: sourcePart.OrdMin || 0,
            OrdMax: sourcePart.OrdMax || 0,
            Stock: 0, // Start with zero stock — this is a new plant
            Location: '', // Location must be set locally
        };

        const columns = Object.keys(importFields);
        const placeholders = columns.map(() => '?').join(', ');
        const values = Object.values(importFields);
        const colStr = columns.map(c => `"${c}"`).join(', ');

        db.run(`INSERT INTO "Part" (${colStr}) VALUES (${placeholders})`, values);

        console.log(`[Catalog Enrichment] Imported part ${partId} from ${sourcePlantId} → current plant`);
        res.status(201).json({
            success: true,
            message: `Part ${partId} imported from ${sourcePlantId}`,
            importedFields: importFields,
            source: sourcePlantId
        });
    } catch (err) {
        console.error('POST /api/catalog/enrich/:partId/import error:', err);
        res.status(500).json({ error: 'Failed to import part' });
    }
});

// ── GET /enrich/:partId/compare ─────────────────────────────────────────
// Compare an existing plant part against the Master Dairy Catalog
// Returns field-level diff: { field: { local, master, mismatch } }
// Ignores plant-specific fields: Stock, OrdMin, OrdMax, Location
router.get('/:partId/compare', (req, res) => {
    try {
        const partId = req.params.partId;

        // Get current part from plant DB
        let currentPart = null;
        try {
            currentPart = db.queryOne('SELECT * FROM Part WHERE ID = ?', [partId]);
        } catch (e) { /* skip */ }

        if (!currentPart) {
            return res.json({ aligned: true, message: 'Part not found in plant DB' });
        }

        // Find best master catalog match
        const masterMatches = findMasterCatalogMatches(
            partId,
            currentPart.Description || '',
            currentPart.Manufacturer || ''
        );

        if (masterMatches.length === 0) {
            return res.json({ aligned: true, message: 'No master catalog match found', noMatch: true });
        }

        const best = masterMatches[0];

        // Only compare if confidence is high enough
        if (best.confidence < 50) {
            return res.json({ aligned: true, message: 'No confident match', noMatch: true });
        }

        // Field mapping: plant field → master field
        const fieldMap = [
            { local: 'Description', master: 'Description', label: 'Description' },
            { local: 'Manufacturer', master: 'Manufacturer', label: 'Manufacturer' },
            { local: 'PartClassID', master: 'Category', label: 'Category' },
            { local: 'UOM', master: 'UOM', label: 'Unit of Measure' },
        ];

        const diffs = [];
        const masterData = {};

        for (const field of fieldMap) {
            const localVal = (currentPart[field.local] || '').toString().trim();
            const masterVal = (best[field.master] || '').toString().trim();

            // Skip empty master values
            if (!masterVal) continue;

            masterData[field.local] = masterVal;

            // Check for mismatch (case-insensitive for text fields)
            const mismatch = localVal.toLowerCase() !== masterVal.toLowerCase() && localVal !== '';
            const missing = !localVal && masterVal;

            if (mismatch || missing) {
                diffs.push({
                    field: field.local,
                    label: field.label,
                    localValue: localVal || '(empty)',
                    masterValue: masterVal,
                    type: missing ? 'missing' : 'mismatch',
                });
            }
        }

        // Also check for optional enrichment fields not in the diff
        if (best.Specifications) masterData.Specifications = best.Specifications;
        if (best.TypicalPriceMin) masterData.TypicalPriceMin = best.TypicalPriceMin;
        if (best.TypicalPriceMax) masterData.TypicalPriceMax = best.TypicalPriceMax;
        if (best.SubCategory) masterData.SubCategory = best.SubCategory;
        if (best.LeadTimeDays) masterData.LeadTimeDays = best.LeadTimeDays;

        res.json({
            aligned: diffs.length === 0,
            partId,
            masterPartId: best.MasterPartID,
            confidence: best.confidence,
            matchType: best.matchType,
            diffs,
            masterData,
            diffCount: diffs.length,
        });
    } catch (err) {
        console.error('GET /api/catalog/enrich/:partId/compare error:', err);
        res.status(500).json({ error: 'Comparison failed' });
    }
});


// ── POST /enrich/:partId/align ──────────────────────────────────────────
// Apply master catalog alignment — update plant part to match master
// Does NOT touch: Stock, OrdMin, OrdMax, Location (plant-specific)
router.post('/:partId/align', (req, res) => {
    try {
        const partId = req.params.partId;
        const { masterData } = req.body;

        if (!masterData || typeof masterData !== 'object') {
            return res.status(400).json({ error: 'masterData object required' });
        }

        // Only allow catalog data fields — never touch inventory/location
        const allowedFields = ['Description', 'Manufacturer', 'PartClassID', 'UOM'];
        const updates = {};
        for (const [key, val] of Object.entries(masterData)) {
            if (allowedFields.includes(key) && val) {
                updates[key] = val;
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No alignable fields provided' });
        }

        const sets = Object.keys(updates).map(k => `"${k}" = ?`).join(', ');
        const values = [...Object.values(updates), partId];
        db.run(`UPDATE "Part" SET ${sets} WHERE ID = ?`, values);

        console.log(`[Catalog Alignment] Aligned part ${partId} with Master Catalog: ${JSON.stringify(updates)}`);
        res.json({ success: true, message: `Part ${partId} aligned with Master Dairy Catalog`, appliedFields: updates });
    } catch (err) {
        console.error('POST /api/catalog/enrich/:partId/align error:', err);
        res.status(500).json({ error: 'Alignment failed' });
    }
});


// ── GET /enrich/:partId/intelligence ────────────────────────────────────
// Part Intelligence Panel — aggregates usage analytics + master catalog specs
router.get('/:partId/intelligence', (req, res) => {
    try {
        const partId = req.params.partId;
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const intel = {
            partId,
            // Usage Analytics (from work orders across all plants)
            totalUsageCount: 0,
            totalQtyUsed: 0,
            totalCostSpent: 0,
            firstUsed: null,
            lastUsed: null,
            usageByYear: {},
            topEquipment: [],       // Equipment this part is used on most
            topFailureReasons: [],  // Why work orders needed this part
            avgReplacementInterval: null, // Average days between replacements
            // Master Catalog Intelligence
            catalogSpecs: null,
            typicalLifespan: null,
            leadTimeDays: null,
            priceRange: null,
            equipmentTypes: [],
            failureModes: [],
            subCategory: null,
        };

        // 1. Aggregate usage from all plant databases
        const plantsFile = path.join(dataDir, 'plants.json');
        if (fs.existsSync(plantsFile)) {
            const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
            const usageDates = [];
            const equipmentMap = {};
            const failureMap = {};

            for (const plant of plants) {
                const dbPath = path.join(dataDir, `${plant.id}.db`);
                if (!fs.existsSync(dbPath)) continue;

                let tempDb;
                try {
                    tempDb = new Database(dbPath, { readonly: true });

                    // Check tables exist
                    const hasWP = tempDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='WorkParts'").get();
                    const hasWO = tempDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='WorkOrder'").get();
                    if (!hasWP || !hasWO) { tempDb.close(); continue; }

                    // Get usage records for this part
                    const usage = tempDb.prepare(`
                        SELECT wp.Qty, wp.UnitCost, wo.AssetID, wo.Description as WODesc,
                               wo.DateCompleted, wo.Priority, wo.Status
                        FROM WorkParts wp
                        JOIN WorkOrder wo ON wp.WorkOrderID = wo.ID
                        WHERE wp.PartID = ?
                        ORDER BY wo.DateCompleted DESC
                    `).all(partId);

                    for (const u of usage) {
                        intel.totalUsageCount++;
                        intel.totalQtyUsed += parseFloat(u.Qty) || 1;
                        intel.totalCostSpent += (parseFloat(u.Qty) || 1) * (parseFloat(u.UnitCost) || 0);

                        if (u.DateCompleted) {
                            usageDates.push(u.DateCompleted);
                            if (!intel.firstUsed || u.DateCompleted < intel.firstUsed) intel.firstUsed = u.DateCompleted;
                            if (!intel.lastUsed || u.DateCompleted > intel.lastUsed) intel.lastUsed = u.DateCompleted;

                            const year = u.DateCompleted.substring(0, 4);
                            intel.usageByYear[year] = (intel.usageByYear[year] || 0) + 1;
                        }

                        // Equipment tracking
                        if (u.AssetID) {
                            const key = `${u.AssetID}@${plant.id}`;
                            if (!equipmentMap[key]) {
                                equipmentMap[key] = { assetId: u.AssetID, plant: plant.label, count: 0, lastUsed: null };
                            }
                            equipmentMap[key].count++;
                            if (u.DateCompleted && (!equipmentMap[key].lastUsed || u.DateCompleted > equipmentMap[key].lastUsed)) {
                                equipmentMap[key].lastUsed = u.DateCompleted;
                            }
                        }

                        // Failure reason from WO description
                        if (u.WODesc) {
                            // Extract common failure keywords
                            const lower = u.WODesc.toLowerCase();
                            const reasons = [];
                            if (lower.includes('leak')) reasons.push('Leak');
                            if (lower.includes('worn') || lower.includes('wear')) reasons.push('Wear');
                            if (lower.includes('broken') || lower.includes('broke')) reasons.push('Breakage');
                            if (lower.includes('noise') || lower.includes('noisy')) reasons.push('Noise/Vibration');
                            if (lower.includes('overheat') || lower.includes('hot')) reasons.push('Overheating');
                            if (lower.includes('fail') || lower.includes('failure')) reasons.push('Failure');
                            if (lower.includes('pm ') || lower.includes('preventive') || lower.includes('scheduled')) reasons.push('Scheduled PM');
                            if (lower.includes('replace') || lower.includes('swap')) reasons.push('Replacement');
                            if (lower.includes('calibrat')) reasons.push('Calibration');
                            if (lower.includes('corrosi') || lower.includes('rust')) reasons.push('Corrosion');
                            if (reasons.length === 0) reasons.push('General Maintenance');

                            for (const r of reasons) {
                                failureMap[r] = (failureMap[r] || 0) + 1;
                            }
                        }
                    }

                    tempDb.close();
                } catch (e) {
                    if (tempDb) try { tempDb.close(); } catch {}
                }
            }

            // Top equipment
            intel.topEquipment = Object.values(equipmentMap)
                .sort((a, b) => b.count - a.count)
                .slice(0, 8);

            // Top failure reasons
            intel.topFailureReasons = Object.entries(failureMap)
                .map(([reason, count]) => ({ reason, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 6);

            // Average replacement interval
            if (usageDates.length >= 2) {
                const sorted = usageDates.sort();
                let totalGap = 0;
                let gaps = 0;
                for (let i = 1; i < sorted.length; i++) {
                    const d1 = new Date(sorted[i - 1]);
                    const d2 = new Date(sorted[i]);
                    const diff = Math.abs(d2 - d1) / (1000 * 60 * 60 * 24);
                    if (diff > 0 && diff < 3650) { // ignore unreasonable gaps
                        totalGap += diff;
                        gaps++;
                    }
                }
                if (gaps > 0) {
                    intel.avgReplacementInterval = Math.round(totalGap / gaps);
                }
            }
        }

        // 2. Master Catalog intelligence
        const masterPath = path.join(dataDir, 'mfg_master.db');
        if (fs.existsSync(masterPath)) {
            let masterDb;
            try {
                masterDb = new Database(masterPath, { readonly: true });

                // Get current part description for matching
                let desc = '', manuf = '';
                try {
                    const part = db.queryOne('SELECT Description, Manufacturer FROM Part WHERE ID = ?', [partId]);
                    if (part) { desc = part.Description || ''; manuf = part.Manufacturer || ''; }
                } catch (e) { /* skip */ }

                const masterMatches = findMasterCatalogMatches(partId, desc, manuf);

                if (masterMatches.length > 0 && masterMatches[0].confidence >= 50) {
                    const best = masterMatches[0];

                    // Parse specifications
                    let specs = null;
                    if (best.Specifications) {
                        try { specs = JSON.parse(best.Specifications); } catch { specs = best.Specifications; }
                    }
                    intel.catalogSpecs = specs;

                    // Equipment types
                    if (best.EquipmentTypes) {
                        try { intel.equipmentTypes = JSON.parse(best.EquipmentTypes); } catch { intel.equipmentTypes = [best.EquipmentTypes]; }
                    }

                    // Price range
                    if (best.TypicalPriceMin || best.TypicalPriceMax) {
                        intel.priceRange = { min: best.TypicalPriceMin, max: best.TypicalPriceMax };
                    }

                    intel.leadTimeDays = best.LeadTimeDays;
                    intel.subCategory = best.SubCategory;

                    // Match to equipment type for failure modes
                    if (intel.equipmentTypes.length > 0) {
                        try {
                            const eqType = intel.equipmentTypes[0];
                            const eqMatch = masterDb.prepare('SELECT FailureModes, ExpectedMTBFHours, UsefulLifeYears FROM MasterEquipment WHERE EquipmentTypeID LIKE ? OR Description LIKE ? LIMIT 1').get(`%${eqType}%`, `%${eqType}%`);
                            if (eqMatch) {
                                if (eqMatch.FailureModes) {
                                    try { intel.failureModes = JSON.parse(eqMatch.FailureModes); } catch { intel.failureModes = [eqMatch.FailureModes]; }
                                }
                                if (eqMatch.ExpectedMTBFHours) intel.typicalLifespan = { mtbfHours: eqMatch.ExpectedMTBFHours, usefulYears: eqMatch.UsefulLifeYears };
                            }
                        } catch (e) { /* skip */ }
                    }
                }

                masterDb.close();
            } catch (e) {
                if (masterDb) try { masterDb.close(); } catch {}
            }
        }

        res.json(intel);
    } catch (err) {
        console.error('GET /api/catalog/enrich/:partId/intelligence error:', err);
        res.status(500).json({ error: 'Intelligence lookup failed' });
    }
});

module.exports = router;

