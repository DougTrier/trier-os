// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */

/**
 * sqlBuilder.js — Centralized parameterized SQL construction helpers.
 *
 * These utilities eliminate the risk of SQL injection from dynamic query
 * building by enforcing allowlist validation on every field name before
 * it is interpolated into SQL strings.
 *
 * All user-supplied VALUES still go through parameterized `?` placeholders.
 * Only field/column NAMES are interpolated, and only after allowlist check.
 *
 * Usage:
 *   const { buildUpdate, buildWhere } = require('../utils/sqlBuilder');
 *
 *   // Build a safe UPDATE statement
 *   const { sql, params } = buildUpdate('Work', body, ALLOWED_WORK_COLS, 'WorkOrderNumber');
 *   db.prepare(sql).run(...params, id);
 *
 *   // Build a safe WHERE clause
 *   const { clause, params } = buildWhere({ StatusID: 1, Priority: 'High' }, ALLOWED_WORK_COLS);
 *   db.prepare(`SELECT * FROM Work WHERE ${clause}`).all(...params);
 */

'use strict';

// ── Field-name safety check ──────────────────────────────────────────────────
// Column names must be alphanumeric + underscore only. No spaces, no special
// characters. This prevents second-order injection through column name interpolation.
const SAFE_COL = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertSafeColumn(name, context = '') {
    if (!SAFE_COL.test(name)) {
        throw new Error(`[sqlBuilder] Unsafe column name "${name}"${context ? ` in ${context}` : ''}`);
    }
}

/**
 * Build a parameterized SET clause for an UPDATE statement.
 *
 * @param {object} body          — Raw request body or partial object
 * @param {string[]} allowedCols — Allowlisted column names for this table
 * @param {string} [context]     — Optional label for error messages
 * @returns {{ setClause: string, params: any[] }}
 *   setClause — e.g. `"Description"=?, "Priority"=?, "UpdatedAt"=datetime('now')`
 *   params    — Values to bind via `?` placeholders (in same order as setClause)
 *
 * @throws {Error} if body contains no allowed fields
 *
 * @example
 *   const { setClause, params } = buildSetClause(req.body, ALLOWED_WORK_COLS, 'Work');
 *   db.prepare(`UPDATE Work SET ${setClause} WHERE ID=?`).run(...params, id);
 */
function buildSetClause(body, allowedCols, context = '') {
    if (!body || typeof body !== 'object') throw new Error('[sqlBuilder] body must be an object');
    const fields = [];
    const params = [];

    for (const col of allowedCols) {
        if (!Object.prototype.hasOwnProperty.call(body, col)) continue;
        assertSafeColumn(col, context);
        fields.push(`"${col}"=?`);
        const val = body[col];
        params.push(typeof val === 'boolean' ? (val ? 1 : 0) : val);
    }

    if (fields.length === 0) throw new Error(`[sqlBuilder] No allowed fields found in body${context ? ` for ${context}` : ''}`);

    fields.push(`"UpdatedAt"=datetime('now')`);
    return { setClause: fields.join(', '), params };
}

/**
 * Build a parameterized WHERE clause from a filter object.
 *
 * @param {object}   filters     — Key-value pairs to filter by (e.g. { StatusID: 1, PlantID: 'x' })
 * @param {string[]} allowedCols — Allowlisted column names for this table
 * @param {string}   [context]   — Optional label for error messages
 * @returns {{ clause: string, params: any[] }}
 *   clause — e.g. `"StatusID"=? AND "PlantID"=?`
 *   params — Bound values in matching order
 *
 * @example
 *   const { clause, params } = buildWhere({ StatusID: 1 }, ALLOWED_WORK_COLS);
 *   db.prepare(`SELECT * FROM Work WHERE ${clause}`).all(...params);
 */
function buildWhere(filters, allowedCols, context = '') {
    if (!filters || typeof filters !== 'object') return { clause: '1=1', params: [] };
    const parts = [];
    const params = [];

    for (const [col, val] of Object.entries(filters)) {
        if (!allowedCols.includes(col)) {
            console.warn(`[sqlBuilder] Ignoring non-allowlisted filter field "${col}"${context ? ` in ${context}` : ''}`);
            continue;
        }
        assertSafeColumn(col, context);
        parts.push(`"${col}"=?`);
        params.push(typeof val === 'boolean' ? (val ? 1 : 0) : val);
    }

    return {
        clause: parts.length ? parts.join(' AND ') : '1=1',
        params,
    };
}

/**
 * Validate a sort column against an allowlist.
 * Falls back to defaultCol if the requested column is not allowed.
 * Safe for direct interpolation into ORDER BY clauses.
 *
 * @param {string}   col        — Requested sort column
 * @param {string[]} allowedCols — Allowlisted column names
 * @param {string}   defaultCol — Fallback column name
 * @returns {string} Safe column name
 */
function safeSort(col, allowedCols, defaultCol = 'ID') {
    if (!col || !allowedCols.includes(col)) return defaultCol;
    assertSafeColumn(col);
    return col;
}

/**
 * Validate ORDER direction. Only 'ASC' or 'DESC' are allowed.
 * @param {string} dir — User-supplied direction
 * @returns {'ASC'|'DESC'}
 */
function safeOrder(dir) {
    return (dir || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}

module.exports = { buildSetClause, buildWhere, safeSort, safeOrder };
