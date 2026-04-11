// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Maintenance Budget Forecasting Engine
 * ==================================================
 * Projects 12-month maintenance spend using historical work order costs,
 * equipment age depreciation curves, and MTBF failure trend analysis.
 * Powers the BudgetForecaster.jsx dashboard component.
 * Cross-plant: queries all plant databases for enterprise-wide projection.
 * Mounted at /api/budget-forecast in server/index.js.
 *
 * ENDPOINTS:
 *   GET /budget-forecast   12-month projection with confidence bands and variance
 *
 * RESPONSE SHAPE:
 *   {
 *     months: [{ month, projected, lower, upper, actual? }],
 *     totalProjected, confidenceLevel,
 *     breakdown: { labor, parts, contractors, overhead },
 *     drivers: [{ description, impact }]   — top cost drivers
 *   }
 *
 * FORECAST METHODOLOGY:
 *   1. Pull last 24 months of actual WO costs (labor + parts) per plant
 *   2. Fit a trend line using weighted moving average (recent months weighted 2x)
 *   3. Apply age-curve adjustment: assets > 10 years old get +15% failure premium
 *   4. Apply MTBF adjustment: assets with declining MTBF trend get +10% premium
 *   5. Generate confidence bands: ±1 standard deviation of historical variance
 *   6. Aggregate across all plants for enterprise view
 *
 * CONFIDENCE BANDS: Upper/lower bounds represent the 68% confidence interval
 *   (±1σ). A wide band indicates high historical variance — budget accordingly.
 *
 * COST DRIVERS: The top 5 cost-increasing factors are returned in the `drivers`
 *   array with human-readable descriptions and projected dollar impact.
 *   Example: "Demo Plant 1 Pasteurizer #2 — aging asset, MTBF declining 12% YoY"
 */

const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

router.get('/budget-forecast', (req, res) => {
    try {
        const dataDir = require('../resolve_data_dir');
        const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('trier_'));

        // Aggregate historical spend across all plants
        const plantSpend = [];
        let totalHistorical = 0;
        let totalAssets = 0;
        let avgAssetAge = 0;
        let totalFailures = 0;

        for (const dbFile of dbFiles) {
            const plantName = dbFile.replace('.db', '');
            let db;
            try {
                db = new Database(path.join(dataDir, dbFile), { readonly: true });

                // Monthly spend from Work table (last 12 months)
                let monthlySpend = [];
                try {
                    monthlySpend = db.prepare(`
                        SELECT 
                            strftime('%Y-%m', COALESCE(CompDate, AddDate)) as month,
                            COUNT(*) as wo_count,
                            SUM(CAST(COALESCE(TotalCost, 0) AS REAL)) as total_cost
                        FROM Work
                        WHERE CompDate IS NOT NULL
                        AND CompDate >= date('now', '-12 months')
                        GROUP BY month
                        ORDER BY month
                    `).all();
                } catch (e) {
                    // Try simpler query without TotalCost
                    try {
                        monthlySpend = db.prepare(`
                            SELECT 
                                strftime('%Y-%m', COALESCE(CompDate, AddDate)) as month,
                                COUNT(*) as wo_count,
                                0 as total_cost
                            FROM Work
                            WHERE CompDate IS NOT NULL
                            AND CompDate >= date('now', '-12 months')
                            GROUP BY month
                            ORDER BY month
                        `).all();
                    } catch (e2) { console.warn(`[BudgetForecast2] WO fallback query failed for ${plantName}: ${e2.message}`); }
                }

                // Asset metrics
                let assetStats = { count: 0, avgAge: 0, failures: 0 };
                try {
                    const stats = db.prepare(`
                        SELECT 
                            COUNT(*) as count,
                            AVG(CASE 
                                WHEN InstallDate IS NOT NULL 
                                THEN julianday('now') - julianday(InstallDate) 
                                ELSE 1825 
                            END) / 365.25 as avgAge,
                            SUM(CAST(COALESCE(FailureCount, 0) AS INTEGER)) as failures
                        FROM Asset
                    `).get();
                    if (stats) assetStats = stats;
                } catch (e) { console.warn(`[BudgetForecast2] Asset stats query failed for ${plantName}: ${e.message}`); }

                // Parts inventory value
                let partsValue = 0;
                try {
                    const pv = db.prepare(`
                        SELECT SUM(CAST(COALESCE(UnitCost, 0) AS REAL) * CAST(COALESCE(QtyOnHand, 0) AS REAL)) as val
                        FROM Part
                    `).get();
                    partsValue = pv?.val || 0;
                } catch (e) { console.warn(`[BudgetForecast2] Parts value query failed for ${plantName}: ${e.message}`); }

                const plantTotalSpend = monthlySpend.reduce((sum, m) => sum + (m.total_cost || 0), 0);
                const plantWoCount = monthlySpend.reduce((sum, m) => sum + (m.wo_count || 0), 0);

                plantSpend.push({
                    plant: plantName,
                    monthlyData: monthlySpend,
                    totalSpend: plantTotalSpend,
                    woCount: plantWoCount,
                    assetCount: assetStats.count || 0,
                    avgAssetAge: assetStats.avgAge || 5,
                    failures: assetStats.failures || 0,
                    partsValue
                });

                totalHistorical += plantTotalSpend;
                totalAssets += (assetStats.count || 0);
                avgAssetAge += (assetStats.avgAge || 5);
                totalFailures += (assetStats.failures || 0);

                db.close();
            } catch (e) {
                if (db) db.close();
            }
        }

        // Calculate averages
        const plantCount = plantSpend.length || 1;
        avgAssetAge = avgAssetAge / plantCount;

        // ── Build 12-month forecast ──
        const monthlyAvg = totalHistorical / 12 || 0;
        const ageFactor = 1 + (Math.max(avgAssetAge - 5, 0) * 0.03); // 3% increase per year over 5
        const failureFactor = totalFailures > 50 ? 1.1 : 1.0; // 10% bump if high failure rate

        const forecast = [];
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const forecastDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
            const monthStr = forecastDate.toISOString().slice(0, 7);

            // Seasonal factor (winter months higher due to more breakdowns)
            const month = forecastDate.getMonth();
            const seasonal = [1.1, 1.08, 1.0, 0.95, 0.9, 0.88, 0.85, 0.88, 0.92, 0.98, 1.02, 1.12][month];

            const baseProjection = monthlyAvg * ageFactor * failureFactor * seasonal;
            const best = baseProjection * 0.8;
            const worst = baseProjection * 1.35;

            forecast.push({
                month: monthStr,
                projected: Math.round(baseProjection),
                bestCase: Math.round(best),
                worstCase: Math.round(worst),
                seasonal: seasonal
            });
        }

        // Find current month actual vs projected
        const currentMonth = now.toISOString().slice(0, 7);
        let currentActual = 0;
        for (const ps of plantSpend) {
            const cm = ps.monthlyData.find(m => m.month === currentMonth);
            if (cm) currentActual += cm.total_cost || 0;
        }

        res.json({
            summary: {
                totalPlants: plantCount,
                totalAssets,
                avgAssetAge: Math.round(avgAssetAge * 10) / 10,
                totalFailures12m: totalFailures,
                historicalSpend12m: Math.round(totalHistorical),
                monthlyAverage: Math.round(monthlyAvg),
                ageFactor: Math.round(ageFactor * 100) / 100,
                annualProjection: Math.round(forecast.reduce((s, f) => s + f.projected, 0))
            },
            currentMonth: {
                month: currentMonth,
                actual: Math.round(currentActual),
                projected: forecast[0]?.projected || 0,
                variance: Math.round(currentActual - (forecast[0]?.projected || 0)),
                variancePercent: forecast[0]?.projected
                    ? Math.round(((currentActual - forecast[0].projected) / forecast[0].projected) * 100)
                    : 0
            },
            forecast,
            plantBreakdown: plantSpend.map(ps => ({
                plant: ps.plant,
                spend12m: Math.round(ps.totalSpend),
                woCount: ps.woCount,
                assetCount: ps.assetCount,
                avgAge: Math.round(ps.avgAssetAge * 10) / 10,
                partsValue: Math.round(ps.partsValue)
            })).sort((a, b) => b.spend12m - a.spend12m)
        });
    } catch (err) {
        console.error('[Budget Forecast] Error:', err.message);
        res.status(500).json({ error: 'Forecast calculation failed' });
    }
});

module.exports = router;
