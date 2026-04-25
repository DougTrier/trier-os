// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Time-Saved Counter Service
 * ================================================
 * Computes and surfaces honest time-saved estimates for finalized work orders.
 *
 * Hard rules:
 *   - Only Resolved=1 outcomes feed baseline and savings (never NULL or 0).
 *   - Baseline must have >= MIN_SAMPLE data points; otherwise no savings shown.
 *   - Segmented by equipment_type_id + failure_mode (normalized_mode).
 *   - saved_sec = max(0, baseline.avg_sec - outcome.ResolutionTimeSec).
 *   - If baseline is weak, return status:'no_baseline' — never invent savings.
 */

'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const { db: logisticsDb } = require('../logistics_db');
const dataDir  = require('../resolve_data_dir');

const MIN_SAMPLE = 5;

// Plant DB exclusions — same pattern as analytics.js narrative sweep
const NON_PLANT = new Set([
    'corporate_master', 'Corporate_Office', 'dairy_master', 'it_master',
    'logistics', 'schema_template', 'mfg_master', 'examples',
    'map_pins', 'translations', 'log', 'local-sqlite', 'plant_setup',
    'studio_log', 'trier_os', 'trier_chat', 'trier_auth',
]);

/**
 * Format a duration in seconds to a human-readable string.
 * < 60s → "Xs"  |  < 1h → "Xm Ys" or "Xm"  |  >= 1h → "Xh Ym" or "Xh"
 */
function formatDuration(sec) {
    if (sec == null || sec < 0) return null;
    sec = Math.round(sec);
    if (sec < 60) return `${sec}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/**
 * Look up time-saved estimate for a single finalized work order.
 *
 * @param {number} workOrderId
 * @param {object} conn  better-sqlite3 connection for the plant DB
 * @returns {object}  savings payload or {status, reason} sentinel
 */
function getSavings(workOrderId, conn) {
    // Only finalized, resolved outcomes count
    let outcome;
    try {
        outcome = conn.prepare(`
            SELECT WorkOrderID, AssetID, EquipmentTypeID, ResolutionTimeSec
            FROM work_order_outcome
            WHERE WorkOrderID = ? AND Resolved = 1
        `).get(workOrderId);
    } catch (_) {
        return { status: 'no_baseline', reason: 'outcome_table_unavailable' };
    }

    if (!outcome)                      return { status: 'not_resolved' };
    if (outcome.ResolutionTimeSec == null) return { status: 'no_duration' };
    if (!outcome.EquipmentTypeID)      return { status: 'no_equipment_type' };

    // Primary failure code → normalized mode
    let fc;
    try {
        fc = conn.prepare(`
            SELECT fm.normalized_mode
            FROM FailureCodes fc
            JOIN failure_modes fm ON fm.id = fc.NormalizedFailureID
            WHERE fc.woId = ?
            ORDER BY fc.id
            LIMIT 1
        `).get(workOrderId);
    } catch (_) {
        return { status: 'no_failure_mode' };
    }

    if (!fc || !fc.normalized_mode) return { status: 'no_failure_mode' };

    // Cross-plant baseline
    const baseline = logisticsDb.prepare(`
        SELECT avg_sec, sample_size
        FROM equipment_failure_baseline
        WHERE equipment_type_id = ? AND failure_mode = ?
    `).get(outcome.EquipmentTypeID, fc.normalized_mode);

    if (!baseline || baseline.sample_size < MIN_SAMPLE) {
        return { status: 'no_baseline', reason: 'not_enough_data' };
    }

    const actualSec   = outcome.ResolutionTimeSec;
    const baselineSec = baseline.avg_sec;
    const savedSec    = Math.max(0, baselineSec - actualSec);

    return {
        status:      'ok',
        actualSec,
        baselineSec,
        savedSec,
        sampleSize:  baseline.sample_size,
        formatted: {
            actual:   formatDuration(actualSec),
            baseline: formatDuration(baselineSec),
            saved:    savedSec > 0 ? formatDuration(savedSec) : null,
        },
    };
}

/**
 * Cross-plant sweep: aggregate Resolved=1 outcomes and upsert baselines.
 * Runs on a background interval — never blocks the request path.
 */
function recomputeBaselines() {
    // Map key: "EquipmentTypeID:normalized_mode" → { type, mode, times[] }
    const buckets = new Map();

    const dbFiles = fs.readdirSync(dataDir)
        .filter(f => {
            if (!f.endsWith('.db')) return false;
            if (f.startsWith('trier_')) return false;
            const stem = f.replace('.db', '');
            return !NON_PLANT.has(stem);
        });

    for (const dbFile of dbFiles) {
        let plant;
        try {
            plant = new Database(path.join(dataDir, dbFile), { readonly: true });

            // Skip DBs that haven't received migration 055
            const hasOutcome = plant.prepare(
                `SELECT name FROM sqlite_master WHERE type='table' AND name='work_order_outcome'`
            ).get();
            if (!hasOutcome) { plant.close(); continue; }

            const rows = plant.prepare(`
                SELECT o.EquipmentTypeID, fm.normalized_mode, o.ResolutionTimeSec
                FROM work_order_outcome o
                JOIN FailureCodes fc ON fc.woId = o.WorkOrderID
                JOIN failure_modes fm ON fm.id = fc.NormalizedFailureID
                WHERE o.Resolved = 1
                  AND o.ResolutionTimeSec > 0
                  AND o.ResolutionTimeSec <= 604800
                  AND o.EquipmentTypeID IS NOT NULL
                  AND fm.normalized_mode IS NOT NULL
            `).all();

            for (const row of rows) {
                const key = `${row.EquipmentTypeID}:${row.normalized_mode}`;
                if (!buckets.has(key)) {
                    buckets.set(key, { type: row.EquipmentTypeID, mode: row.normalized_mode, times: [] });
                }
                buckets.get(key).times.push(row.ResolutionTimeSec);
            }
        } catch (err) {
            console.warn(`[timeSaved] recomputeBaselines skip ${dbFile}:`, err.message);
        } finally {
            try { plant && plant.close(); } catch (_) {}
        }
    }

    // Aggregate into logistics DB — only groups with enough data
    const upsert = logisticsDb.prepare(`
        INSERT INTO equipment_failure_baseline
            (equipment_type_id, failure_mode, avg_sec, sample_size, computed_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(equipment_type_id, failure_mode) DO UPDATE SET
            avg_sec     = excluded.avg_sec,
            sample_size = excluded.sample_size,
            computed_at = excluded.computed_at
    `);

    const tx = logisticsDb.transaction(() => {
        let count = 0;
        for (const { type, mode, times } of buckets.values()) {
            if (times.length < MIN_SAMPLE) continue;
            const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
            upsert.run(type, mode, avg, times.length, new Date().toISOString());
            count++;
        }
        return count;
    });

    try {
        const count = tx();
        if (count > 0) console.log(`[timeSaved] recomputeBaselines: ${count} baseline(s) updated`);
    } catch (err) {
        console.error('[timeSaved] recomputeBaselines failed:', err.message);
    }
}

module.exports = { MIN_SAMPLE, formatDuration, getSavings, recomputeBaselines };
