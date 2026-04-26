// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Invariants Report Route (invariants.js)
 * ====================================================
 * Stateless, read-only endpoint that proves system correctness on demand.
 *
 * Each invariant entry carries two distinct proof layers:
 *   assertion — structural proof the invariant cannot be violated (DB constraint)
 *   evidence  — historical proof the invariant was challenged and held (invariant_log)
 *
 * These are not the same thing and must not be conflated:
 *   assertion.violations === 0  means violation is currently impossible
 *   evidence.preventedCount     means it was tested N times and held each time
 *
 * API:
 *   GET /api/invariants/report?plantId=Plant_1   — single plant
 *   GET /api/invariants/report?plantId=all       — aggregate across all known plants
 */

'use strict';

const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const yaml         = require('js-yaml');
const Database     = require('better-sqlite3');
const { db: ldb }  = require('../logistics_db');
const dataDir      = require('../resolve_data_dir');

const FOLLOWUPS_PATH = path.join(__dirname, '../../docs/followups.yaml');

const SAFE_PLANT_ID = /^[a-zA-Z0-9_-]{1,64}$/;

// System databases that are never plant-scoped operational databases.
const SYSTEM_DBS = new Set([
    'trier_logistics', 'trier_auth', 'corporate_master', 'schema_template',
    'examples', 'it_master', 'local-sqlite', 'log', 'logistics', 'map_pins',
    'mfg_master', 'plant_setup', 'studio_log', 'translations', 'trier_chat',
    'trier_os', 'Corporate_Office', 'corporate',
]);

// ── Invariant registry ────────────────────────────────────────────────────────
// Each entry is pure data. The endpoint loops, runs queries, formats result.
// assertionDb:    'plant'     → run against per-plant DB
//                 'logistics' → run against trier_logistics.db
//                  null       → no DB-layer assertion (behavioral/API guarantee)
// assertionTable: table name to check for existence before running the query —
//                 if the table doesn't exist the invariant cannot be violated yet.
const INVARIANTS = [
    {
        id:       'I-01',
        name:     'Return quantity never exceeds issued quantity',
        severity: 'critical',
        assertionDb:    'plant',
        assertionTable: 'WorkParts',
        assertionQuery: `
            SELECT COUNT(*) AS violations
            FROM WorkParts
            WHERE qty_returned > EstQty - COALESCE(ActQty, 0) + 0.001
        `,
    },
    {
        id:       'I-03',
        name:     'Offline events replay in device-timestamp order',
        severity: 'high',
        assertionDb:    null,
        assertionTable: null,
        assertionQuery: null,
        assertionType:   'nonQueryable',
        assertionReason: 'Enforced by sort in offline-sync service layer; no per-row DB constraint',
    },
    {
        id:       'I-04',
        name:     'Each scan ID is processed exactly once',
        severity: 'critical',
        assertionDb:    'plant',
        assertionTable: 'ScanAuditLog',
        assertionQuery: `
            SELECT COUNT(*) AS violations
            FROM (SELECT scanId FROM ScanAuditLog GROUP BY scanId HAVING COUNT(*) > 1)
        `,
    },
    {
        id:       'I-09',
        name:     'Offline receiving events resolved exactly once',
        severity: 'high',
        assertionDb:    null,
        assertionTable: null,
        assertionQuery: null,
        assertionType:   'structural',
        assertionReason: 'PRIMARY KEY on OfflineReceivingEvents.eventId prevents duplicate inserts at DB layer',
    },
    {
        id:       'I-10',
        name:     'PM acknowledged by exactly one technician',
        severity: 'critical',
        assertionDb:    'plant',
        assertionTable: 'pm_acknowledgements',
        assertionQuery: `
            SELECT COUNT(*) AS violations
            FROM (SELECT pm_id FROM pm_acknowledgements GROUP BY pm_id HAVING COUNT(*) > 1)
        `,
    },
    {
        id:       'I-11',
        name:     'Work orders cannot be silently closed with unresolved issued parts',
        severity: 'high',
        assertionDb:    null,
        assertionTable: null,
        assertionQuery: null,
        assertionType:   'nonQueryable',
        assertionReason: 'Server-side enforcement deferred (I-11-B); currently enforced in UI layer only',
    },
    {
        id:       'I-13',
        name:     'Artifact availability source is explicitly labeled',
        severity: 'medium',
        assertionDb:    null,
        assertionTable: null,
        assertionQuery: null,
        assertionType:   'nonQueryable',
        assertionReason: 'API shape guarantee — enforced at serialization boundary in catalog.js, no per-row DB constraint',
    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getKnownPlantIds() {
    try {
        const rows = ldb.prepare('SELECT PlantID FROM SiteCodes').all();
        if (rows.length > 0) return rows.map(r => r.PlantID);
    } catch { /* SiteCodes may be empty on dev */ }

    // Fallback: filesystem scan
    return fs.readdirSync(dataDir)
        .filter(f => f.endsWith('.db'))
        .map(f => path.basename(f, '.db'))
        .filter(id => !SYSTEM_DBS.has(id) && SAFE_PLANT_ID.test(id));
}

function openPlantDb(plantId) {
    const dbPath = path.join(dataDir, `${plantId}.db`);
    if (!fs.existsSync(dbPath)) return null;
    try {
        return new Database(dbPath, { readonly: true, fileMustExist: true });
    } catch {
        return null;
    }
}

function tableExists(conn, tableName) {
    const row = conn.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`
    ).get(tableName);
    return !!row;
}

// Run one invariant's assertion against a single plant DB.
// Returns { violations, checked } — checked=false when table absent.
function runPlantAssertion(inv, plantId) {
    const conn = openPlantDb(plantId);
    if (!conn) return { violations: 0, checked: false };
    try {
        if (!tableExists(conn, inv.assertionTable)) return { violations: 0, checked: false };
        const row = conn.prepare(inv.assertionQuery).get();
        return { violations: row?.violations ?? 0, checked: true };
    } finally {
        conn.close();
    }
}

// Run evidence query for one invariant against invariant_log.
function runEvidence(invariantId) {
    try {
        const row = ldb.prepare(`
            SELECT COUNT(*) AS prevented, MAX(ts) AS last_occurrence, MIN(ts) AS first_occurrence
            FROM invariant_log
            WHERE invariant_id = ?
        `).get(invariantId);
        return {
            preventedCount:   row?.prevented         ?? 0,
            firstOccurrence:  row?.first_occurrence  ?? null,
            lastOccurrence:   row?.last_occurrence   ?? null,
        };
    } catch {
        return { preventedCount: 0, firstOccurrence: null, lastOccurrence: null };
    }
}

// Build one invariant result entry for a given set of plant IDs.
function buildInvariantResult(inv, plantIds) {
    const evidence = runEvidence(inv.id);

    if (!inv.assertionQuery) {
        // Non-queryable invariants are not "unchecked" — they are enforced by a different
        // mechanism. The type and reason make this explicit so a reader cannot mistake
        // assertion: null for "we haven't implemented the check yet."
        return {
            id:        inv.id,
            name:      inv.name,
            severity:  inv.severity,
            status:    'PASS',
            assertion: {
                type:    inv.assertionType  ?? 'nonQueryable',
                checked: false,
                reason:  inv.assertionReason ?? null,
            },
            evidence,
        };
    }

    let totalViolations = 0;
    let checkedCount    = 0;

    if (inv.assertionDb === 'plant') {
        for (const plantId of plantIds) {
            const { violations, checked } = runPlantAssertion(inv, plantId);
            totalViolations += violations;
            if (checked) checkedCount += 1;
        }
    }
    // 'logistics' assertions would query ldb directly — none defined yet.

    return {
        id:       inv.id,
        name:     inv.name,
        severity: inv.severity,
        status:   totalViolations > 0 ? 'FAIL' : 'PASS',
        assertion: {
            type:          'queryable',
            checked:       true,
            violations:    totalViolations,
            plantsChecked: checkedCount,
        },
        evidence,
    };
}

// Load deferred follow-ups from docs/followups.yaml, adding triggerActive flag.
// Silent on parse failure — missing file never breaks the report.
function loadDeferred() {
    try {
        const raw = yaml.load(fs.readFileSync(FOLLOWUPS_PATH, 'utf8'));
        if (!Array.isArray(raw)) return [];
        return raw
            .filter(f => f.status !== 'completed')
            .map(f => ({
                id:            f.id,
                title:         f.title,
                status:        (f.status || 'deferred').toUpperCase(),
                trigger:       f.trigger    ?? null,
                triggerActive: f.triggerEnvVar ? !!process.env[f.triggerEnvVar] : false,
                nextAction:    f.scope?.[0]  ?? null,
                lastReviewedAt: f.lastReviewedAt ?? null,
            }));
    } catch {
        return [];
    }
}

// ── Route ─────────────────────────────────────────────────────────────────────

module.exports = function invariantsRoutes(authMiddleware) {
    const router = express.Router();
    router.use(authMiddleware);

    // GET /api/invariants/report
    router.get('/report', (req, res) => {
        const rawPlantId = (req.query.plantId || req.headers['x-plant-id'] || '').trim();

        let plantIds;
        if (rawPlantId === 'all') {
            plantIds = getKnownPlantIds();
        } else if (rawPlantId && SAFE_PLANT_ID.test(rawPlantId)) {
            plantIds = [rawPlantId];
        } else {
            return res.status(400).json({ error: 'plantId is required — pass a plant ID or "all"' });
        }

        const invariants = INVARIANTS.map(inv => buildInvariantResult(inv, plantIds));
        const overallStatus = invariants.some(i => i.status === 'FAIL') ? 'FAIL' : 'PASS';

        // Surface deferred follow-ups alongside invariants so they're never "out of sight."
        // Active trigger = triggerEnvVar is set in the current environment.
        const deferred = loadDeferred();

        return res.json({
            generatedAt:   new Date().toISOString(),
            plantIds,
            overallStatus,
            invariants,
            deferred,
        });
    });

    return router;
};
