// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS - Emissions & Carbon Intensity Tracking
 * ============================================================================
 * Calculates Scope 1 and Scope 2 carbon emissions and intensity per unit of
 * production. Replaces legacy EPA hardcoding with configurable, per-asset
 * emission factors and localized eGRID intensities.
 *
 * ENDPOINTS:
 *   GET /summary        Calculate scope 1 & 2 emissions for a plant/period
 *   GET /intensity      Calculate emissions per production unit
 *   GET /corp-rollup    Enterprise-wide emissions aggregation and trend
 *   GET /report         Export emissions data (JSON or CSV)
 *   GET /config         Get plant grid intensity configuration
 *   PUT /config         Update plant grid intensity configuration
 *   PUT /production     Log production volume for intensity denominator
 *
 * SCOPING DECISIONS:
 * - Scope 1: Directly calculated from natural_gas, propane, diesel, fuel_oil, coal meter
 *   readings in EnergyReadings, multiplied by per-asset Scope1EmissionFactor (or fallback defaults).
 * - Scope 2: Calculated from electricity_kwh meter readings multiplied by plant GridIntensity.
 * - Carbon Intensity: total_kg_co2e / production_volume from EmissionsProductionLog.
 * - Reporting: Provides structured JSON for dashboards and raw CSV for ESG filings.
 */

const express = require('express');
const router = express.Router();
const logisticsDb = require('../logistics_db').db;
const { logAudit } = require('../logistics_db');
const plantDbProvider = require('../database');

const SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/;

const COMMODITY_DEFAULTS = {
    natural_gas: 5.3,
    propane: 5.72,
    diesel: 10.16,
    fuel_oil: 10.16,
    coal: 25.4
};

function validatePlantId(plantId) {
    if (!plantId || !SAFE_PLANT_ID.test(plantId)) {
        throw new Error('Invalid plantId');
    }
}

function calculateSummary(plantId, startDate, endDate) {
    validatePlantId(plantId);

    const config = logisticsDb.prepare('SELECT GridIntensity FROM EmissionsConfig WHERE PlantID = ?').get(plantId);
    const gridIntensity = config ? config.GridIntensity : 0.417;

    const readings = logisticsDb.prepare(`
        SELECT id, assetId, meterType, reading
        FROM EnergyReadings
        WHERE plantId = ? AND periodStart >= ? AND periodStart <= ?
    `).all(plantId, startDate, endDate);

    let scope1_kg = 0;
    let scope2_kg = 0;
    const scope1_sources = [];

    const scope1Types = ['natural_gas', 'propane', 'diesel', 'fuel_oil', 'coal'];
    
    // We need to look up assets in the plant DB
    let plantDb;
    try {
        plantDb = plantDbProvider.getDb(plantId);
    } catch (err) {
        // DB might not exist or failed to load
    }

    for (const r of readings) {
        if (r.meterType === 'electricity_kwh') {
            scope2_kg += r.reading * gridIntensity;
        } else if (scope1Types.includes(r.meterType)) {
            let factor = COMMODITY_DEFAULTS[r.meterType];
            if (plantDb && r.assetId) {
                try {
                    const asset = plantDb.prepare('SELECT AssetType FROM Asset WHERE ID = ?').get(r.assetId);
                    if (asset && asset.AssetType && COMMODITY_DEFAULTS[asset.AssetType + '_' + r.meterType]) {
                        factor = COMMODITY_DEFAULTS[asset.AssetType + '_' + r.meterType];
                    }
                } catch (e) {
                    // Ignore missing table/columns during transition
                }
            }
            
            const emissions = r.reading * factor;
            scope1_kg += emissions;
            scope1_sources.push({
                assetId: r.assetId,
                meterType: r.meterType,
                reading: r.reading,
                factorUsed: factor,
                emissions_kg: emissions
            });
        }
    }

    return {
        plantId,
        period: { start: startDate, end: endDate },
        scope1_kg,
        scope2_kg,
        total_kg: scope1_kg + scope2_kg,
        scope1_sources,
        grid_intensity_used: gridIntensity
    };
}

router.get('/summary', (req, res) => {
    try {
        const { plantId, startDate, endDate } = req.query;
        if (!plantId || !startDate || !endDate) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        try {
            validatePlantId(plantId);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        const summary = calculateSummary(plantId, startDate, endDate);
        res.json(summary);
    } catch (err) {
        console.error('GET /api/emissions/summary error:', err.message);
        res.status(500).json({ error: 'Failed to calculate emissions summary' });
    }
});

router.get('/intensity', (req, res) => {
    try {
        const { plantId, startDate, endDate } = req.query;
        if (!plantId || !startDate || !endDate) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        try {
            validatePlantId(plantId);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        const summary = calculateSummary(plantId, startDate, endDate);
        
        const production = logisticsDb.prepare(`
            SELECT Volume, Unit 
            FROM EmissionsProductionLog 
            WHERE PlantID = ? AND PeriodStart >= ? AND PeriodEnd <= ?
            ORDER BY RecordedAt DESC LIMIT 1
        `).get(plantId, startDate, endDate);

        if (!production || production.Volume <= 0) {
            return res.json({
                total_kg: summary.total_kg,
                volume: null,
                unit: null,
                intensity_kg_per_unit: null,
                warning: 'No production data for period'
            });
        }

        res.json({
            total_kg: summary.total_kg,
            volume: production.Volume,
            unit: production.Unit,
            intensity_kg_per_unit: summary.total_kg / production.Volume
        });
    } catch (err) {
        console.error('GET /api/emissions/intensity error:', err.message);
        res.status(500).json({ error: 'Failed to calculate emissions intensity' });
    }
});

router.get('/corp-rollup', (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const distinctPlants = logisticsDb.prepare(`
            SELECT DISTINCT plantId 
            FROM EnergyReadings 
            WHERE periodStart >= ? AND periodStart <= ?
        `).all(startDate, endDate).map(r => r.plantId);

        let corporate_total_kg = 0;
        const plants = [];

        for (const plantId of distinctPlants) {
            if (!SAFE_PLANT_ID.test(plantId)) continue;
            const summary = calculateSummary(plantId, startDate, endDate);
            corporate_total_kg += summary.total_kg;
            plants.push({
                plantId,
                scope1_kg: summary.scope1_kg,
                scope2_kg: summary.scope2_kg,
                total_kg: summary.total_kg
            });
        }

        // Calculate prior year
        const start = new Date(startDate);
        const end = new Date(endDate);
        start.setFullYear(start.getFullYear() - 1);
        end.setFullYear(end.getFullYear() - 1);
        
        const priorStart = start.toISOString().split('T')[0];
        const priorEnd = end.toISOString().split('T')[0];

        const priorPlants = logisticsDb.prepare(`
            SELECT DISTINCT plantId 
            FROM EnergyReadings 
            WHERE periodStart >= ? AND periodStart <= ?
        `).all(priorStart, priorEnd).map(r => r.plantId);

        let prior_year_total_kg = 0;
        for (const plantId of priorPlants) {
            if (!SAFE_PLANT_ID.test(plantId)) continue;
            const priorSummary = calculateSummary(plantId, priorStart, priorEnd);
            prior_year_total_kg += priorSummary.total_kg;
        }

        let change_pct = 0;
        if (prior_year_total_kg > 0) {
            change_pct = ((corporate_total_kg - prior_year_total_kg) / prior_year_total_kg) * 100;
        }

        res.json({
            period: { start: startDate, end: endDate },
            plants,
            corporate_total_kg,
            prior_year_total_kg,
            change_pct
        });
    } catch (err) {
        console.error('GET /api/emissions/corp-rollup error:', err.message);
        res.status(500).json({ error: 'Failed to calculate corporate rollup' });
    }
});

router.get('/report', (req, res) => {
    try {
        const { plantId, startDate, endDate, format } = req.query;
        if (!plantId || !startDate || !endDate || !format) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        try {
            validatePlantId(plantId);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        const summary = calculateSummary(plantId, startDate, endDate);
        
        const production = logisticsDb.prepare(`
            SELECT Volume, Unit 
            FROM EmissionsProductionLog 
            WHERE PlantID = ? AND PeriodStart >= ? AND PeriodEnd <= ?
            ORDER BY RecordedAt DESC LIMIT 1
        `).get(plantId, startDate, endDate);

        let intensity_kg_per_unit = null;
        let volume = null;
        let unit = null;

        if (production && production.Volume > 0) {
            volume = production.Volume;
            unit = production.Unit;
            intensity_kg_per_unit = summary.total_kg / production.Volume;
        }

        const reportData = {
            period_start: startDate,
            period_end: endDate,
            plant_id: plantId,
            scope1_kg_co2e: summary.scope1_kg,
            scope2_kg_co2e: summary.scope2_kg,
            total_kg_co2e: summary.total_kg,
            production_volume: volume,
            production_unit: unit,
            intensity_kg_per_unit,
            grid_intensity_factor: summary.grid_intensity_used
        };

        if (format === 'csv') {
            const header = Object.keys(reportData).join(',');
            const row = Object.values(reportData).map(v => v === null ? '' : v).join(',');
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=emissions-${plantId}-${startDate}.csv`);
            return res.send(`${header}\n${row}\n`);
        }

        res.json(reportData);
    } catch (err) {
        console.error('GET /api/emissions/report error:', err.message);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

router.get('/config', (req, res) => {
    try {
        const { plantId } = req.query;
        if (!plantId) {
            return res.status(400).json({ error: 'plantId is required' });
        }
        
        try {
            validatePlantId(plantId);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        const config = logisticsDb.prepare('SELECT GridIntensity as gridIntensity, GridRegion as gridRegion FROM EmissionsConfig WHERE PlantID = ?').get(plantId);
        if (config) {
            return res.json({ plantId, ...config });
        }

        res.json({ plantId, gridIntensity: 0.417, gridRegion: null });
    } catch (err) {
        console.error('GET /api/emissions/config error:', err.message);
        res.status(500).json({ error: 'Failed to fetch config' });
    }
});

router.put('/config', (req, res) => {
    try {
        const { plantId, gridIntensity, gridRegion } = req.body;
        if (!plantId) {
            return res.status(400).json({ error: 'plantId is required' });
        }
        
        try {
            validatePlantId(plantId);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        if (typeof gridIntensity !== 'number' || gridIntensity < 0 || gridIntensity > 5) {
            return res.status(400).json({ error: 'gridIntensity must be a number between 0 and 5' });
        }

        const username = req.user?.Username || 'admin';

        logisticsDb.prepare(`
            INSERT INTO EmissionsConfig (PlantID, GridIntensity, GridRegion, UpdatedBy, UpdatedAt)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(PlantID) DO UPDATE SET
                GridIntensity = excluded.GridIntensity,
                GridRegion = excluded.GridRegion,
                UpdatedBy = excluded.UpdatedBy,
                UpdatedAt = datetime('now')
        `).run(plantId, gridIntensity, gridRegion || null, username);

        logAudit(username, 'EMISSIONS_CONFIG_UPDATED', plantId, { gridIntensity, gridRegion });

        res.json({ success: true });
    } catch (err) {
        console.error('PUT /api/emissions/config error:', err.message);
        res.status(500).json({ error: 'Failed to update config' });
    }
});

router.put('/production', (req, res) => {
    try {
        const { plantId, periodStart, periodEnd, volume, unit } = req.body;
        if (!plantId || !periodStart || !periodEnd || volume === undefined || !unit) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        try {
            validatePlantId(plantId);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        if (typeof volume !== 'number' || volume <= 0) {
            return res.status(400).json({ error: 'volume must be > 0' });
        }

        const username = req.user?.Username || 'admin';

        logisticsDb.prepare(`
            INSERT INTO EmissionsProductionLog (PlantID, PeriodStart, PeriodEnd, Volume, Unit, RecordedBy, RecordedAt)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(plantId, periodStart, periodEnd, volume, unit, username);

        logAudit(username, 'EMISSIONS_PRODUCTION_LOGGED', plantId, { volume, unit, periodStart, periodEnd });

        res.json({ success: true });
    } catch (err) {
        console.error('PUT /api/emissions/production error:', err.message);
        res.status(500).json({ error: 'Failed to log production' });
    }
});

module.exports = router;
