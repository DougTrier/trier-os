// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Metric Rollup Service
 * ==================================
 * Sweeps every plant SQLite database, aggregates today's SensorReadings
 * into metric buckets, and upserts the results into PlantMetricSummary
 * in corporate_master.db.
 *
 * Designed to run at 08:00 and 15:00 daily (see server/index.js cron).
 * Can also be triggered manually via POST /api/corporate-analytics/sync.
 *
 * How aggregation works:
 *   1. Find every *.db file in the data directory (plant DBs only — system
 *      DBs like corporate_master.db and trier_logistics.db are excluded).
 *   2. Open each plant DB read-only; skip if it has no SensorReadings table.
 *   3. For today's date (UTC), query AVG/MIN/MAX/COUNT per TagName.
 *   4. Map each TagName to a MetricBucket using DeviceMetricMap if one
 *      exists for this plant, otherwise fall back to the built-in heuristic.
 *   5. Upsert into PlantMetricSummary using the UNIQUE constraint so
 *      re-runs are safe (ON CONFLICT DO UPDATE replaces the row in place).
 *
 * MetricBucket heuristic (fallback when no DeviceMetricMap entry):
 *   Tag name substring → bucket
 *   _temp_             → temperature
 *   _speed             → speed
 *   _level_            → level
 *   _pressure_ / _psi  → pressure
 *   _power_ / _kw      → power
 *   oee_               → oee
 *   downtime_          → downtime
 *   units_produced     → production
 *   alarm_             → alarms
 *   (everything else)  → general
 *
 * Exports:
 *   runMetricRollup()  → Promise<{ plantCount, rowCount, errors[] }>
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const Database = require('better-sqlite3');
const dataDir  = require('../resolve_data_dir');
const masterDb = require('../master_index');

// ── System DB exclusion list ──────────────────────────────────────────────────
// These files live in the data directory but are NOT plant-level databases.
const SYSTEM_DBS = new Set([
    'corporate_master.db',
    'trier_logistics.db',
    'examples.db',
    'schema_template.db',
]);

// ── MetricBucket heuristic ────────────────────────────────────────────────────

/**
 * Derives a corporate MetricBucket name from a raw tag name using
 * substring matching. The DeviceMetricMap takes precedence over this
 * function when an explicit mapping exists.
 *
 * @param {string} tagName  e.g. "line1_temp_f", "oee_pct"
 * @returns {string}  bucket name
 */
function tagToBucket(tagName) {
    const t = tagName.toLowerCase();
    if (t.includes('temp'))           return 'temperature';
    if (t.includes('speed'))          return 'speed';
    if (t.includes('level'))          return 'level';
    if (t.includes('pressure') || t.includes('_psi')) return 'pressure';
    if (t.includes('power') || t.includes('_kw'))     return 'power';
    if (t.startsWith('oee') || t.includes('_oee'))    return 'oee';
    if (t.includes('downtime'))       return 'downtime';
    if (t.includes('units_produced') || t.includes('production')) return 'production';
    if (t.includes('alarm'))          return 'alarms';
    return 'general';
}

// ── Unit derivation ───────────────────────────────────────────────────────────

/**
 * Best-effort unit string for a tag name.
 * Matches the scale / unit fields in TAG_DEFINITIONS from modbus-simulator.js.
 *
 * @param {string} tagName
 * @returns {string}
 */
function tagToUnit(tagName) {
    const t = tagName.toLowerCase();
    if (t.includes('_f'))           return '°F';
    if (t.includes('_c'))           return '°C';
    if (t.includes('speed'))        return 'u/min';
    if (t.includes('_pct'))         return '%';
    if (t.includes('_psi'))         return 'PSI';
    if (t.includes('_kw'))          return 'kW';
    if (t.includes('minutes'))      return 'min';
    if (t.includes('count') || t.includes('produced')) return 'count';
    return '';
}

// ── Rollup core ───────────────────────────────────────────────────────────────

/**
 * Prepare the upsert statement once per call to avoid re-parsing.
 * The UNIQUE(PlantID, MetricBucket, PeriodDate, PeriodType) constraint
 * means we can safely re-run for the same period — it will just update
 * the aggregates in place.
 */
const upsertSql = `
    INSERT INTO PlantMetricSummary
        (PlantID, MetricBucket, PeriodDate, PeriodType, AvgValue, MinValue, MaxValue, SampleCount, Unit, UpdatedAt)
    VALUES
        (@plantId, @bucket, @periodDate, 'daily', @avg, @min, @max, @count, @unit, datetime('now'))
    ON CONFLICT(PlantID, MetricBucket, PeriodDate, PeriodType) DO UPDATE SET
        AvgValue    = excluded.AvgValue,
        MinValue    = excluded.MinValue,
        MaxValue    = excluded.MaxValue,
        SampleCount = excluded.SampleCount,
        Unit        = excluded.Unit,
        UpdatedAt   = excluded.UpdatedAt
`;

/**
 * Rolls up a single plant database into PlantMetricSummary.
 *
 * @param {string} plantId   e.g. "Plant_1"
 * @param {string} dbPath    Absolute path to the plant DB file
 * @param {string} periodDate YYYY-MM-DD
 * @param {object} upsert    Prepared better-sqlite3 statement
 * @returns {{ rowCount: number, error?: string }}
 */
function rollupPlant(plantId, dbPath, periodDate, upsert) {
    let plantDb;
    try {
        plantDb = new Database(dbPath, { readonly: true });
    } catch (err) {
        return { rowCount: 0, error: `Cannot open DB: ${err.message}` };
    }

    try {
        // Confirm SensorReadings table exists before querying
        const hasTable = plantDb.prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='SensorReadings'`
        ).get();
        if (!hasTable) {
            return { rowCount: 0 };
        }

        // Load explicit DeviceMetricMap for this plant (if any)
        // We query trier_logistics.db for this plant's metric map so that
        // custom tag→bucket mappings set up in the Device Registry UI take
        // precedence over the heuristic.
        let metricMap = null; // TagName → { bucket, unit }
        try {
            const { db: logisticsDb } = require('../logistics_db');
            const mapRows = logisticsDb.prepare(
                `SELECT TagName, MetricBucket, Unit FROM DeviceMetricMap WHERE PlantID = ?`
            ).all(plantId);
            if (mapRows.length > 0) {
                metricMap = {};
                for (const row of mapRows) {
                    metricMap[row.TagName] = { bucket: row.MetricBucket, unit: row.Unit || '' };
                }
            }
        } catch (_) {
            // DeviceMetricMap table may not exist yet — fall back to heuristic
        }

        // Aggregate today's readings per TagName
        const rows = plantDb.prepare(`
            SELECT
                TagName,
                AVG(Value)   AS avg,
                MIN(Value)   AS min,
                MAX(Value)   AS max,
                COUNT(Value) AS cnt,
                MAX(Unit)    AS unit
            FROM SensorReadings
            WHERE date(ReadingTime) = ?
            GROUP BY TagName
        `).all(periodDate);

        // Bucket-level aggregation — multiple tags can map to the same bucket
        // (e.g. line1_temp_f and line2_temp_f both → "temperature").
        // We merge them: avg = mean of means, min = global min, max = global max,
        // count = sum of counts.  This is intentionally approximate — the
        // corporate dashboard is a trend view, not an audit log.
        const buckets = {}; // bucket → { sum, count, min, max, unit, samples }

        for (const row of rows) {
            const mapping = metricMap && metricMap[row.TagName];
            const bucket  = mapping ? mapping.bucket : tagToBucket(row.TagName);
            const unit    = (mapping && mapping.unit) || row.unit || tagToUnit(row.TagName);

            if (!buckets[bucket]) {
                buckets[bucket] = { sum: 0, weightedCount: 0, min: Infinity, max: -Infinity, unit, samples: 0 };
            }
            const b = buckets[bucket];
            b.sum          += row.avg * row.cnt;  // weighted sum for weighted mean
            b.weightedCount += row.cnt;
            b.min           = Math.min(b.min, row.min);
            b.max           = Math.max(b.max, row.max);
            b.samples      += row.cnt;
            if (unit) b.unit = unit;              // last unit wins (all same-bucket tags should share units)
        }

        // Upsert each bucket row into corporate_master.db
        let rowCount = 0;
        const insertBuckets = masterDb.transaction(() => {
            for (const [bucket, b] of Object.entries(buckets)) {
                if (b.weightedCount === 0) continue;
                upsert.run({
                    plantId,
                    bucket,
                    periodDate,
                    avg:   Math.round((b.sum / b.weightedCount) * 100) / 100,
                    min:   Math.round(b.min * 100) / 100,
                    max:   Math.round(b.max * 100) / 100,
                    count: b.samples,
                    unit:  b.unit || '',
                });
                rowCount++;
            }
        });
        insertBuckets();

        return { rowCount };
    } catch (err) {
        return { rowCount: 0, error: err.message };
    } finally {
        try { plantDb.close(); } catch (_) {}
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs the full metric rollup across all plant databases.
 * Safe to call multiple times for the same period (upsert is idempotent).
 *
 * @param {string} [periodDate]  YYYY-MM-DD to aggregate. Defaults to today (UTC).
 * @returns {Promise<{ plantCount: number, rowCount: number, errors: string[] }>}
 */
async function runMetricRollup(periodDate) {
    const date = periodDate || new Date().toISOString().slice(0, 10);

    const upsert = masterDb.prepare(upsertSql);

    // Find all *.db files in the data directory, excluding system DBs
    let dbFiles;
    try {
        dbFiles = fs.readdirSync(dataDir)
            .filter(f => f.endsWith('.db') && !SYSTEM_DBS.has(f));
    } catch (err) {
        console.error('[METRIC_ROLLUP] Cannot read data directory:', err.message);
        return { plantCount: 0, rowCount: 0, errors: [err.message] };
    }

    let totalRows  = 0;
    let plantCount = 0;
    const errors   = [];

    for (const fileName of dbFiles) {
        // Derive plantId from filename: "Plant_1.db" → "Plant_1"
        const plantId = path.basename(fileName, '.db');
        const dbPath  = path.join(dataDir, fileName);

        const result = rollupPlant(plantId, dbPath, date, upsert);
        if (result.error) {
            errors.push(`[${plantId}] ${result.error}`);
        } else if (result.rowCount > 0) {
            plantCount++;
            totalRows += result.rowCount;
        }
    }

    console.log(
        `[METRIC_ROLLUP] ${date} — ${plantCount} plants, ${totalRows} bucket rows upserted` +
        (errors.length ? `, ${errors.length} error(s)` : '')
    );
    if (errors.length) {
        errors.forEach(e => console.warn('[METRIC_ROLLUP]', e));
    }

    return { plantCount, rowCount: totalRows, errors };
}

module.exports = { runMetricRollup, tagToBucket };
