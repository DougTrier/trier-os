// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Energy & Sustainability (ESG) Intelligence API
 * ===========================================================
 * Tracks electricity, natural gas, water, and refrigerant consumption
 * per plant and per asset. Drives ESG (Environmental, Social, Governance)
 * reporting and Time-of-Use (TOU) cost optimization for dairy facilities.
 * All data in trier_logistics.db (EnergyReadings, EnergyTargets, etc.).
 * Mounted at /api/energy in server/index.js.
 *
 * ENDPOINTS:
 *   POST /reading              Log an energy meter reading (manual or SCADA push)
 *   GET  /readings             List readings (filter: plant, asset, meterType, date range)
 *   GET  /readings/:id         Single reading detail
 *   PUT  /readings/:id         Correct a reading entry
 *   GET  /summary              Rolling 30/90/365 day summary by meterType and plant
 *   PUT  /targets              Set energy reduction targets per plant + meterType
 *   GET  /report               ESG export report: period comparison vs. target
 *   GET  /tou                  Time-of-Use pricing blocks for the current plant's utility
 *   GET  /tou-config           Configured TOU rate schedule
 *   PUT  /tou-config           Update TOU rate schedule (peak/off-peak hours + rates)
 *   GET  /asset-loads          Nameplate power loads per asset (kW, kWh/shift estimate)
 *   PUT  /asset-loads/:id      Update asset load profile
 *   GET  /arbitrage            Load-shift recommendation: which assets to run off-peak
 *
 * METER TYPES: electricity | natural_gas | water | steam | refrigerant | compressed_air
 *
 * ESG REPORT STRUCTURE:
 *   { period, plant, readings_by_type: { electricity: { total, units, cost, vs_target } } }
 *   Designed for direct export to PDF or CSV for sustainability reporting.
 *
 * TOU ARBITRAGE ENGINE: GET /arbitrage cross-references asset-loads (kW) with TOU
 *   peak hours and calculates potential savings by shifting runtime to off-peak windows.
 *   Returns a ranked list of asset+shift combinations ordered by $ savings potential.
 *
 * DATA SOURCES: Readings can be entered manually, pushed from SCADA/BMS via
 *   POST /reading, or imported from utility bill data in the Import Engine.
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb } = require('../logistics_db');

// POST /api/energy/reading — Log an energy reading
router.post('/reading', (req, res) => {
    try {
        const { plantId, assetId, meterType, reading, cost, periodStart, periodEnd, source } = req.body;
        if (!plantId || !meterType || reading === undefined) {
            return res.status(400).json({ error: 'plantId, meterType, and reading are required' });
        }
        const result = logisticsDb.prepare(`
            INSERT INTO EnergyReadings (plantId, assetId, meterType, reading, cost, periodStart, periodEnd, source, recordedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(plantId, assetId || null, meterType, reading, cost || null, periodStart || null, periodEnd || null, source || 'manual', req.user?.username || 'system');
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to log energy reading: ' + err.message });
    }
});

// GET /api/energy/readings — Get reading history
router.get('/readings', (req, res) => {
    try {
        const { plantId, meterType, months = 12 } = req.query;
        let sql = 'SELECT * FROM EnergyReadings WHERE 1=1';
        const params = [];
        if (plantId) { sql += ' AND plantId = ?'; params.push(plantId); }
        if (meterType) { sql += ' AND meterType = ?'; params.push(meterType); }
        sql += ` AND createdAt >= datetime('now', '-${parseInt(months)} months')`;
        sql += ' ORDER BY createdAt DESC LIMIT 500';
        const rows = logisticsDb.prepare(sql).all(...params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch readings' });
    }
});

// GET /api/energy/summary — Dashboard summary
router.get('/summary', (req, res) => {
    try {
        const { plantId } = req.query;
        let where = plantId ? 'WHERE plantId = ?' : '';
        let params = plantId ? [plantId] : [];

        // Current month totals by type
        const currentMonth = logisticsDb.prepare(`
            SELECT meterType, SUM(reading) as totalReading, SUM(cost) as totalCost, COUNT(*) as entries
            FROM EnergyReadings
            ${where} ${where ? 'AND' : 'WHERE'} createdAt >= datetime('now', 'start of month')
            GROUP BY meterType
        `).all(...params);

        // Targets
        const targets = logisticsDb.prepare(`SELECT * FROM EnergyTargets ${where}`).all(...params);

        // Carbon estimation (EPA factors)
        const carbonFactors = { electricity_kwh: 0.417, gas_therms: 5.3, propane_gallons: 5.72 };
        let totalCarbonKg = 0;
        currentMonth.forEach(m => {
            if (carbonFactors[m.meterType]) {
                totalCarbonKg += m.totalReading * carbonFactors[m.meterType];
            }
        });

        res.json({ currentMonth, targets, totalCarbonKg: Math.round(totalCarbonKg) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate summary' });
    }
});

// PUT /api/energy/targets — Set energy targets
router.put('/targets', (req, res) => {
    try {
        const { plantId, meterType, monthlyTarget, annualTarget, unit } = req.body;
        if (!plantId || !meterType) return res.status(400).json({ error: 'plantId and meterType required' });
        logisticsDb.prepare(`
            INSERT INTO EnergyTargets (plantId, meterType, monthlyTarget, annualTarget, unit, updatedBy)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(plantId, meterType) DO UPDATE SET
                monthlyTarget = excluded.monthlyTarget,
                annualTarget = excluded.annualTarget,
                unit = excluded.unit,
                updatedBy = excluded.updatedBy,
                updatedAt = CURRENT_TIMESTAMP
        `).run(plantId, meterType, monthlyTarget || null, annualTarget || null, unit || '', req.user?.username || 'system');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save targets' });
    }
});

// GET /api/energy/report — Annual sustainability report
router.get('/report', (req, res) => {
    try {
        const { year = new Date().getFullYear() } = req.query;
        const rows = logisticsDb.prepare(`
            SELECT meterType, strftime('%m', periodStart) as month,
                   SUM(reading) as totalReading, SUM(cost) as totalCost
            FROM EnergyReadings
            WHERE strftime('%Y', periodStart) = ?
            GROUP BY meterType, strftime('%m', periodStart)
            ORDER BY meterType, month
        `).all(String(year));
        res.json({ year, data: rows });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// ── Phase 2: Time-of-Use (TOU) Rate Schema ───────────────────────────────────
// Migrate EnergyTargets to add TOU columns if not present
(function migrateTouSchema() {
    try {
        const cols = logisticsDb.prepare(`PRAGMA table_info(EnergyTargets)`).all();
        const colNames = cols.map(c => c.name);
        if (!colNames.includes('PeakStart')) {
            logisticsDb.exec(`ALTER TABLE EnergyTargets ADD COLUMN PeakStart TEXT DEFAULT '14:00'`);
        }
        if (!colNames.includes('PeakEnd')) {
            logisticsDb.exec(`ALTER TABLE EnergyTargets ADD COLUMN PeakEnd TEXT DEFAULT '20:00'`);
        }
        if (!colNames.includes('PeakRateMultiplier')) {
            logisticsDb.exec(`ALTER TABLE EnergyTargets ADD COLUMN PeakRateMultiplier REAL DEFAULT 1.5`);
        }
        if (!colNames.includes('OffPeakRateMultiplier')) {
            logisticsDb.exec(`ALTER TABLE EnergyTargets ADD COLUMN OffPeakRateMultiplier REAL DEFAULT 0.7`);
        }
        if (!colNames.includes('MidPeakStart')) {
            logisticsDb.exec(`ALTER TABLE EnergyTargets ADD COLUMN MidPeakStart TEXT DEFAULT '10:00'`);
        }
        if (!colNames.includes('MidPeakEnd')) {
            logisticsDb.exec(`ALTER TABLE EnergyTargets ADD COLUMN MidPeakEnd TEXT DEFAULT '14:00'`);
        }
    } catch (e) {
        console.warn('[ENERGY] TOU migration:', e.message);
    }

    // Asset load weighting table
    try {
        logisticsDb.exec(`
            CREATE TABLE IF NOT EXISTS EnergyAssetLoad (
                ID INTEGER PRIMARY KEY AUTOINCREMENT,
                PlantID TEXT NOT NULL,
                AssetID TEXT NOT NULL,
                AssetLabel TEXT,
                LoadKw REAL DEFAULT 0,
                IsHighLoad INTEGER DEFAULT 0,
                Category TEXT DEFAULT 'General',
                Notes TEXT,
                UpdatedBy TEXT,
                UpdatedAt TEXT DEFAULT (datetime('now')),
                UNIQUE(PlantID, AssetID)
            );
            CREATE INDEX IF NOT EXISTS idx_eal_plant ON EnergyAssetLoad(PlantID);
            CREATE INDEX IF NOT EXISTS idx_eal_highload ON EnergyAssetLoad(IsHighLoad);
        `);
    } catch (e) {
        console.warn('[ENERGY] EnergyAssetLoad table:', e.message);
    }
})();

// ── TOU Rate Helper ───────────────────────────────────────────────────────────
function getCurrentPricingTier(plantId, atTime) {
    const t = atTime || new Date();
    const hhmm = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
    try {
        const target = logisticsDb.prepare(
            `SELECT PeakStart, PeakEnd, MidPeakStart, MidPeakEnd, PeakRateMultiplier, OffPeakRateMultiplier
             FROM EnergyTargets WHERE plantId = ? AND meterType = 'electricity_kwh'`
        ).get(plantId);

        const peakStart = target?.PeakStart || '14:00';
        const peakEnd = target?.PeakEnd || '20:00';
        const midStart = target?.MidPeakStart || '10:00';
        const midEnd = target?.MidPeakEnd || '14:00';
        const peakMult = target?.PeakRateMultiplier ?? 1.5;
        const offMult = target?.OffPeakRateMultiplier ?? 0.7;

        if (hhmm >= peakStart && hhmm < peakEnd) {
            return { tier: 'peak', label: 'On-Peak', color: '#ef4444', multiplier: peakMult, hhmm };
        } else if (hhmm >= midStart && hhmm < midEnd) {
            return { tier: 'mid', label: 'Mid-Peak', color: '#f59e0b', multiplier: 1.0, hhmm };
        } else {
            return { tier: 'off', label: 'Off-Peak', color: '#10b981', multiplier: offMult, hhmm };
        }
    } catch {
        return { tier: 'off', label: 'Off-Peak', color: '#10b981', multiplier: 0.7, hhmm };
    }
}

// GET /api/energy/tou — Current pricing tier + 24h forecast
router.get('/tou', (req, res) => {
    try {
        const { plantId } = req.query;
        const now = new Date();
        const current = getCurrentPricingTier(plantId, now);

        // Build 24h hourly forecast
        const forecast = [];
        for (let h = 0; h < 24; h++) {
            const slot = new Date(now);
            slot.setMinutes(0, 0, 0);
            slot.setHours(now.getHours() + h);
            const tier = getCurrentPricingTier(plantId, slot);
            forecast.push({
                hour: slot.getHours(),
                label: `${String(slot.getHours()).padStart(2,'0')}:00`,
                ...tier,
                isCurrent: h === 0
            });
        }

        res.json({ current, forecast, now: now.toISOString() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET/PUT /api/energy/tou-config — Read/write TOU rate configuration
router.get('/tou-config', (req, res) => {
    try {
        const { plantId } = req.query;
        if (!plantId) return res.status(400).json({ error: 'plantId required' });
        const row = logisticsDb.prepare(
            `SELECT * FROM EnergyTargets WHERE plantId = ? AND meterType = 'electricity_kwh'`
        ).get(plantId);
        res.json(row || {
            plantId, meterType: 'electricity_kwh',
            PeakStart: '14:00', PeakEnd: '20:00',
            MidPeakStart: '10:00', MidPeakEnd: '14:00',
            PeakRateMultiplier: 1.5, OffPeakRateMultiplier: 0.7
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/tou-config', (req, res) => {
    try {
        const { plantId, PeakStart, PeakEnd, MidPeakStart, MidPeakEnd, PeakRateMultiplier, OffPeakRateMultiplier } = req.body;
        if (!plantId) return res.status(400).json({ error: 'plantId required' });
        logisticsDb.prepare(`
            INSERT INTO EnergyTargets (plantId, meterType, PeakStart, PeakEnd, MidPeakStart, MidPeakEnd, PeakRateMultiplier, OffPeakRateMultiplier, updatedBy)
            VALUES (?, 'electricity_kwh', ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(plantId, meterType) DO UPDATE SET
                PeakStart = excluded.PeakStart,
                PeakEnd = excluded.PeakEnd,
                MidPeakStart = excluded.MidPeakStart,
                MidPeakEnd = excluded.MidPeakEnd,
                PeakRateMultiplier = excluded.PeakRateMultiplier,
                OffPeakRateMultiplier = excluded.OffPeakRateMultiplier,
                updatedBy = excluded.updatedBy,
                updatedAt = CURRENT_TIMESTAMP
        `).run(plantId, PeakStart || '14:00', PeakEnd || '20:00',
               MidPeakStart || '10:00', MidPeakEnd || '14:00',
               PeakRateMultiplier ?? 1.5, OffPeakRateMultiplier ?? 0.7,
               req.user?.username || 'system');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/energy/asset-loads — List high-load assets for a plant
router.get('/asset-loads', (req, res) => {
    try {
        const { plantId } = req.query;
        const where = plantId ? 'WHERE PlantID = ?' : '';
        const params = plantId ? [plantId] : [];
        const rows = logisticsDb.prepare(`SELECT * FROM EnergyAssetLoad ${where} ORDER BY LoadKw DESC`).all(...params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/energy/asset-loads/:id — Tag/update an asset's load profile
router.put('/asset-loads/:id', (req, res) => {
    try {
        const { PlantID, AssetID, AssetLabel, LoadKw, IsHighLoad, Category, Notes } = req.body;
        if (!PlantID || !AssetID) return res.status(400).json({ error: 'PlantID and AssetID required' });
        logisticsDb.prepare(`
            INSERT INTO EnergyAssetLoad (PlantID, AssetID, AssetLabel, LoadKw, IsHighLoad, Category, Notes, UpdatedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(PlantID, AssetID) DO UPDATE SET
                AssetLabel = excluded.AssetLabel,
                LoadKw = excluded.LoadKw,
                IsHighLoad = excluded.IsHighLoad,
                Category = excluded.Category,
                Notes = excluded.Notes,
                UpdatedBy = excluded.UpdatedBy,
                UpdatedAt = CURRENT_TIMESTAMP
        `).run(PlantID, AssetID, AssetLabel || '', LoadKw || 0, IsHighLoad ? 1 : 0,
               Category || 'General', Notes || '', req.user?.username || 'system');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/energy/arbitrage — 24h load-shift recommendations
router.get('/arbitrage', (req, res) => {
    try {
        const { plantId } = req.query;
        if (!plantId) return res.status(400).json({ error: 'plantId required' });

        const now = new Date();

        // Get high-load assets
        const highLoadAssets = logisticsDb.prepare(
            `SELECT * FROM EnergyAssetLoad WHERE PlantID = ? AND IsHighLoad = 1 ORDER BY LoadKw DESC`
        ).all(plantId);

        // Build 24h hourly forecast
        const forecast = [];
        for (let h = 0; h < 24; h++) {
            const slot = new Date(now);
            slot.setMinutes(0, 0, 0);
            slot.setHours(now.getHours() + h);
            forecast.push({ hour: slot.getHours(), ...getCurrentPricingTier(plantId, slot) });
        }

        // Find cheapest off-peak windows (3-hour blocks)
        const offPeakWindows = [];
        let windowStart = null;
        for (let i = 0; i < forecast.length; i++) {
            if (forecast[i].tier === 'off') {
                if (windowStart === null) windowStart = i;
            } else {
                if (windowStart !== null) {
                    offPeakWindows.push({ startHour: forecast[windowStart].hour, endHour: forecast[i - 1].hour, lengthHours: i - windowStart, multiplier: forecast[windowStart].multiplier });
                    windowStart = null;
                }
            }
        }
        if (windowStart !== null) {
            offPeakWindows.push({ startHour: forecast[windowStart].hour, endHour: forecast[forecast.length - 1].hour, lengthHours: forecast.length - windowStart, multiplier: forecast[windowStart].multiplier });
        }

        // Find peak windows (where high-load tasks would cost most)
        const peakWindows = forecast.filter(f => f.tier === 'peak');

        // Generate suggestions
        const suggestions = highLoadAssets.map(asset => {
            const bestWindow = offPeakWindows.sort((a, b) => a.multiplier - b.multiplier)[0];
            const peakCostEstimate = asset.LoadKw * (peakWindows.length || 1) * 0.12 * 1.5; // rough $/hr
            const offCostEstimate = asset.LoadKw * (peakWindows.length || 1) * 0.12 * (bestWindow?.multiplier || 0.7);
            const savings = Math.max(0, peakCostEstimate - offCostEstimate);
            return {
                assetId: asset.AssetID,
                assetLabel: asset.AssetLabel || asset.AssetID,
                loadKw: asset.LoadKw,
                recommendedWindow: bestWindow ? `${String(bestWindow.startHour).padStart(2,'0')}:00 – ${String((bestWindow.endHour + 1) % 24).padStart(2,'0')}:00` : 'Off-Peak hours',
                estimatedSavings: Math.round(savings * 100) / 100,
                action: peakWindows.some(p => p.hour === now.getHours())
                    ? 'DELAY_RECOMMENDED'
                    : 'OPTIMAL_NOW'
            };
        });

        // Current window status
        const currentTier = getCurrentPricingTier(plantId, now);
        const isPeakNow = currentTier.tier === 'peak';

        res.json({
            plantId,
            currentTier,
            isPeakNow,
            forecast,
            offPeakWindows,
            highLoadAssets: highLoadAssets.length,
            suggestions,
            generatedAt: now.toISOString()
        });
    } catch (err) {
        console.error('[ENERGY-ARBITRAGE]', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/energy/readings/:id — Single reading detail
router.get('/readings/:id', (req, res) => {
    try {
        const row = logisticsDb.prepare(`SELECT * FROM EnergyReadings WHERE ID = ?`).get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Reading not found' });
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/energy/readings/:id — Update a reading
router.put('/readings/:id', (req, res) => {
    try {
        const allowed = ['meterType', 'reading', 'cost', 'periodStart', 'periodEnd', 'source'];
        const updates = Object.keys(req.body).filter(k => allowed.includes(k));
        if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });
        const set = updates.map(k => `${k} = ?`).join(', ');
        const vals = updates.map(k => req.body[k]);
        logisticsDb.prepare(`UPDATE EnergyReadings SET ${set} WHERE ID = ?`).run(...vals, req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
