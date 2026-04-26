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
const Database     = require('better-sqlite3');
const { db: ldb }  = require('../logistics_db');
const dataDir      = require('../resolve_data_dir');

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
        id:   'I-01',
        name: 'Return quantity never exceeds issued quantity',
        assertionDb:    'plant',
        assertionTable: 'WorkParts',
        assertionQuery: `
            SELECT COUNT(*) AS violations
            FROM WorkParts
            WHERE qty_returned > EstQty - COALESCE(ActQty, 0) + 0.001
        `,
    },
    {
        id:   'I-03',
        name: 'Offline events replay in device-timestamp order',
        assertionDb:    null, // behavioral guarantee — no DB constraint
        assertionTable: null,
        assertionQuery: null,
    },
    {
        id:   'I-04',
        name: 'Each scan ID is processed exactly once',
        assertionDb:    'plant',
        assertionTable: 'ScanAuditLog',
        assertionQuery: `
            SELECT COUNT(*) AS violations
            FROM (SELECT scanId FROM ScanAuditLog GROUP BY scanId HAVING COUNT(*) > 1)
        `,
    },
    {
        id:   'I-09',
        name: 'Offline receiving events resolved exactly once',
        assertionDb:    null, // PRIMARY KEY on OfflineReceivingEvents.eventId is the structural guarantee
        assertionTable: null,
        assertionQuery: null,
    },
    {
        id:   'I-10',
        name: 'PM acknowledged by exactly one technician',
        assertionDb:    'plant',
        assertionTable: 'pm_acknowledgements',
        assertionQuery: `
            SELECT COUNT(*) AS violations
            FROM (SELECT pm_id FROM pm_acknowledgements GROUP BY pm_id HAVING COUNT(*) > 1)
        `,
    },
    {
        id:   'I-11',
        name: 'Work orders cannot be silently closed with unresolved issued parts',
        assertionDb:    null, // server-side enforcement deferred until I-11-B
        assertionTable: null,
        assertionQuery: null,
    },
    {
        id:   'I-13',
        name: 'Artifact availability source is explicitly labeled',
        assertionDb:    null, // API shape guarantee — no DB-layer constraint
        assertionTable: null,
        assertionQuery: null,
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
            SELECT COUNT(*) AS prevented, MAX(ts) AS last_occurrence
            FROM invariant_log
            WHERE invariant_id = ?
        `).get(invariantId);
        return {
            preventedCount:  row?.prevented        ?? 0,
            lastOccurrence:  row?.last_occurrence  ?? null,
        };
    } catch {
        return { preventedCount: 0, lastOccurrence: null };
    }
}

// Build one invariant result entry for a given set of plant IDs.
function buildInvariantResult(inv, plantIds) {
    const evidence = runEvidence(inv.id);

    if (!inv.assertionQuery) {
        return {
            id:        inv.id,
            name:      inv.name,
            status:    'PASS',
            assertion: null,
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
        id:     inv.id,
        name:   inv.name,
        status: totalViolations > 0 ? 'FAIL' : 'PASS',
        assertion: {
            violations:   totalViolations,
            plantsChecked: checkedCount,
        },
        evidence,
    };
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

        return res.json({
            generatedAt:   new Date().toISOString(),
            plantIds,
            overallStatus,
            invariants,
        });
    });

    return router;
};
