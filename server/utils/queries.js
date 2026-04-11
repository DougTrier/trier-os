// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Shared SQL Query Library
 * ======================================
 * Canonical implementations of the most frequently duplicated SQL patterns
 * across the route layer. Extracted to eliminate copy-paste inconsistencies
 * and ensure query-level fixes propagate everywhere at once.
 *
 * MIGRATION NOTE: As of April 2026, ~45 table-existence checks and ~5 part
 * inventory value queries remain inline across the codebase. New code should
 * use the functions below. Existing call sites are migration targets for a
 * future refactor pass.
 *
 * USAGE:
 *   const { tableExists, partInventoryValue, woOpexSpend } = require('../utils/queries');
 */

/**
 * Check whether a table exists in a SQLite database.
 * Replaces the 45+ inline occurrences of:
 *   db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='X'").get()
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName
 * @returns {boolean}
 */
function tableExists(db, tableName) {
    try {
        return !!db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
        ).get(tableName);
    } catch { return false; }
}

/**
 * Get total inventory value for a plant.
 * Replaces 5+ inline occurrences of the Stock × UnitCost sum.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {number} Rounded to 2 decimal places
 */
function partInventoryValue(db) {
    try {
        const row = db.prepare(`
            SELECT ROUND(COALESCE(SUM(CAST(Stock AS REAL) * CAST(UnitCost AS REAL)), 0), 2) as v
            FROM Part
        `).get();
        return row?.v || 0;
    } catch { return 0; }
}

/**
 * Get part counts: total, inventory value, and low-stock count in one query.
 * Replaces 3+ per-plant loops that ran these as separate queries.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {{ count: number, value: number, lowStock: number }}
 */
function partSummary(db) {
    try {
        const row = db.prepare(`
            SELECT
                COUNT(*) as cnt,
                ROUND(COALESCE(SUM(CAST(Stock AS REAL) * CAST(UnitCost AS REAL)), 0), 2) as val,
                COALESCE(SUM(CASE WHEN Stock <= OrdPoint AND OrdPoint > 0 THEN 1 ELSE 0 END), 0) as low
            FROM Part
        `).get();
        return { count: row?.cnt || 0, value: row?.val || 0, lowStock: row?.low || 0 };
    } catch { return { count: 0, value: 0, lowStock: 0 }; }
}

/**
 * Get work order status counts in one query.
 * Replaces the 4-query pattern: total / open / overdue / completed.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {{ total: number, open: number, overdue: number, completed: number }}
 */
function workOrderCounts(db) {
    try {
        const row = db.prepare(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN StatusID < 40 THEN 1 ELSE 0 END) as open,
                SUM(CASE WHEN StatusID < 40 AND SchDate IS NOT NULL AND SchDate != ''
                         AND date(SchDate) < date('now') THEN 1 ELSE 0 END) as overdue,
                SUM(CASE WHEN StatusID >= 40 THEN 1 ELSE 0 END) as completed
            FROM Work
        `).get();
        return {
            total: row?.total || 0,
            open: row?.open || 0,
            overdue: row?.overdue || 0,
            completed: row?.completed || 0
        };
    } catch { return { total: 0, open: 0, overdue: 0, completed: 0 }; }
}

/**
 * Get OpEx maintenance spend (labor + parts + misc) excluding PROJECT WOs.
 * Replaces 5+ inline occurrences of the 3-separate-query pattern.
 * Uses a single CTE so SQLite parses and plans the query once.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {{ labor: number, parts: number, misc: number, total: number }}
 */
function woOpexSpend(db) {
    try {
        const row = db.prepare(`
            WITH
            labor AS (
                SELECT COALESCE(SUM(
                    COALESCE(wl.HrReg,0)*CAST(COALESCE(wl.PayReg,'0') AS REAL)+
                    COALESCE(wl.HrOver,0)*CAST(COALESCE(wl.PayOver,'0') AS REAL)+
                    COALESCE(wl.HrDouble,0)*CAST(COALESCE(wl.PayDouble,'0') AS REAL)
                ),0) as v
                FROM WorkLabor wl INNER JOIN Work w ON wl.WoID=w.ID WHERE w.TypeID!='PROJECT'
            ),
            parts AS (
                SELECT COALESCE(SUM(
                    COALESCE(wp.ActQty,0)*CAST(COALESCE(wp.UnitCost,'0') AS REAL)
                ),0) as v
                FROM WorkParts wp INNER JOIN Work w ON wp.WoID=w.ID WHERE w.TypeID!='PROJECT'
            ),
            misc AS (
                SELECT COALESCE(SUM(CAST(COALESCE(wm.ActCost,'0') AS REAL)),0) as v
                FROM WorkMisc wm INNER JOIN Work w ON wm.WoID=w.ID WHERE w.TypeID!='PROJECT'
            )
            SELECT labor.v as labor, parts.v as parts, misc.v as misc
            FROM labor, parts, misc
        `).get();
        const labor = row?.labor || 0;
        const parts = row?.parts || 0;
        const misc  = row?.misc  || 0;
        return { labor, parts, misc, total: labor + parts + misc };
    } catch { return { labor: 0, parts: 0, misc: 0, total: 0 }; }
}

module.exports = { tableExists, partInventoryValue, partSummary, workOrderCounts, woOpexSpend };
