// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * maintenance_budget.js — Budget vs. Actual Maintenance Spend
 * =============================================================
 * Per-plant monthly maintenance budget tracking with variance analysis.
 * Budgets are defined by month/year and category; actuals are derived
 * from closed WO labor + parts costs in the plant DB.
 *
 * Budget records are stored in trier_logistics.db with PlantID scoping
 * so the corporate view can aggregate across all plants.
 *
 * -- ROUTES ----------------------------------------------------
 *   GET    /api/maintenance-budget              List budget records (filter: plantId, year)
 *   POST   /api/maintenance-budget              Create/upsert a budget record
 *   PUT    /api/maintenance-budget/:id          Update a budget record
 *   DELETE /api/maintenance-budget/:id          Remove a budget record
 *   GET    /api/maintenance-budget/variance     Budget vs. actual variance report
 *
 * -- P3 ROADMAP ITEM COVERED ----------------------------------
 *   💰 Budget vs. Actual Maintenance Spend
 */

'use strict';

const express     = require('express');
const router      = express.Router();
const logisticsDb = require('../logistics_db').db;
const db          = require('../database');

// ── Table initialization (idempotent) ─────────────────────────────────────────
logisticsDb.exec(`
    CREATE TABLE IF NOT EXISTS MaintenanceBudget (
        ID          INTEGER PRIMARY KEY AUTOINCREMENT,
        PlantID     TEXT    NOT NULL,
        Year        INTEGER NOT NULL,
        Month       INTEGER NOT NULL,              -- 1-12
        Category    TEXT    NOT NULL DEFAULT 'Total',  -- Total | Labor | Parts | Contractor | Other
        BudgetAmt   REAL    NOT NULL DEFAULT 0,
        Notes       TEXT,
        CreatedBy   TEXT,
        CreatedAt   TEXT    DEFAULT (datetime('now')),
        UpdatedAt   TEXT    DEFAULT (datetime('now')),
        UNIQUE(PlantID, Year, Month, Category)
    );
    CREATE INDEX IF NOT EXISTS idx_mb_plant  ON MaintenanceBudget(PlantID);
    CREATE INDEX IF NOT EXISTS idx_mb_period ON MaintenanceBudget(Year, Month);
`);

// ── GET /api/maintenance-budget ───────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const { plantId, year } = req.query;
        let sql = 'SELECT * FROM MaintenanceBudget WHERE 1=1';
        const params = [];
        if (plantId) { sql += ' AND PlantID = ?'; params.push(plantId); }
        if (year)    { sql += ' AND Year = ?';    params.push(parseInt(year, 10)); }
        sql += ' ORDER BY Year DESC, Month DESC, Category ASC';
        const rows = logisticsDb.prepare(sql).all(...params);
        res.json(rows);
    } catch (err) {
        console.error('[maintenance-budget] GET / error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/maintenance-budget/variance ─────────────────────────────────────
// Returns month-by-month budget vs. actual for the given plant and year.
// Actuals are summed from the plant DB Work table using LaborCost + PartsCost.
router.get('/variance', (req, res) => {
    try {
        const { plantId, year = new Date().getFullYear() } = req.query;
        if (!plantId) return res.status(400).json({ error: 'plantId is required' });

        const budgets = logisticsDb.prepare(
            `SELECT Month, Category, BudgetAmt FROM MaintenanceBudget
             WHERE PlantID = ? AND Year = ? ORDER BY Month ASC, Category ASC`
        ).all(plantId, parseInt(year, 10));

        // Actuals from plant DB — sum LaborCost + PartsCost per month for closed WOs
        let actuals = [];
        try {
            const conn = db.getDb(plantId);
            actuals = conn.prepare(`
                SELECT
                    CAST(strftime('%m', CompDate) AS INTEGER) AS month,
                    COALESCE(SUM(LaborCost), 0)  AS laborActual,
                    COALESCE(SUM(PartsCost), 0)  AS partsActual,
                    COALESCE(SUM(COALESCE(LaborCost,0) + COALESCE(PartsCost,0)), 0) AS totalActual,
                    COUNT(*) AS woCount
                FROM Work
                WHERE StatusID = 40
                  AND CompDate IS NOT NULL
                  AND strftime('%Y', CompDate) = ?
                GROUP BY month
                ORDER BY month ASC
            `).all(String(year));
        } catch {
            // Plant DB may not have LaborCost/PartsCost columns yet — return zeroes
            actuals = [];
        }

        // Build a 12-month variance grid
        const months = Array.from({ length: 12 }, (_, i) => i + 1);
        const grid = months.map(m => {
            const budgetRow = budgets.filter(b => b.Month === m);
            const actualRow = actuals.find(a => a.month === m) || { laborActual: 0, partsActual: 0, totalActual: 0, woCount: 0 };
            const budgetTotal = budgetRow.reduce((s, b) => s + (parseFloat(b.BudgetAmt) || 0), 0);
            return {
                month: m,
                budget: Math.round(budgetTotal),
                actual: Math.round(parseFloat(actualRow.totalActual) || 0),
                variance: Math.round((parseFloat(actualRow.totalActual) || 0) - budgetTotal),
                woCount: actualRow.woCount || 0,
            };
        });

        const ytdBudget = grid.reduce((s, r) => s + r.budget, 0);
        const ytdActual = grid.reduce((s, r) => s + r.actual, 0);

        res.json({
            plantId, year: parseInt(year, 10),
            months: grid,
            ytd: {
                budget: ytdBudget,
                actual: ytdActual,
                variance: ytdActual - ytdBudget,
                variancePct: ytdBudget > 0 ? Math.round(((ytdActual - ytdBudget) / ytdBudget) * 100) : null,
            },
        });
    } catch (err) {
        console.error('[maintenance-budget] GET /variance error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/maintenance-budget ──────────────────────────────────────────────
router.post('/', (req, res) => {
    try {
        const { plantId, year, month, category = 'Total', budgetAmt, notes } = req.body;
        if (!plantId || !year || !month || budgetAmt === undefined) {
            return res.status(400).json({ error: 'plantId, year, month, and budgetAmt are required' });
        }

        // Upsert — update if (PlantID, Year, Month, Category) already exists
        const result = logisticsDb.prepare(`
            INSERT INTO MaintenanceBudget (PlantID, Year, Month, Category, BudgetAmt, Notes, CreatedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(PlantID, Year, Month, Category) DO UPDATE SET
                BudgetAmt = excluded.BudgetAmt,
                Notes     = excluded.Notes,
                UpdatedAt = datetime('now')
        `).run(
            plantId, parseInt(year, 10), parseInt(month, 10), category,
            parseFloat(budgetAmt) || 0, notes || null,
            req.user?.Username || 'system'
        );

        res.status(201).json({ id: result.lastInsertRowid, ok: true });
    } catch (err) {
        console.error('[maintenance-budget] POST / error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /api/maintenance-budget/:id ──────────────────────────────────────────
router.put('/:id', (req, res) => {
    try {
        const { budgetAmt, notes } = req.body;
        if (budgetAmt === undefined && notes === undefined) {
            return res.status(400).json({ error: 'budgetAmt or notes required' });
        }
        const fields = [];
        const values = [];
        if (budgetAmt !== undefined) { fields.push('BudgetAmt = ?'); values.push(parseFloat(budgetAmt) || 0); }
        if (notes     !== undefined) { fields.push('Notes = ?');     values.push(notes); }
        fields.push('UpdatedAt = datetime(\'now\')');
        values.push(req.params.id);

        logisticsDb.prepare(`UPDATE MaintenanceBudget SET ${fields.join(', ')} WHERE ID = ?`).run(...values);
        res.json({ ok: true });
    } catch (err) {
        console.error('[maintenance-budget] PUT /:id error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── DELETE /api/maintenance-budget/:id ────────────────────────────────────────
router.delete('/:id', (req, res) => {
    try {
        const row = logisticsDb.prepare('SELECT ID FROM MaintenanceBudget WHERE ID = ?').get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Budget record not found' });
        logisticsDb.prepare('DELETE FROM MaintenanceBudget WHERE ID = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        console.error('[maintenance-budget] DELETE /:id error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
