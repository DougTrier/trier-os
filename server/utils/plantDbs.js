// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Plant Database Sweep Utility
 * =========================================
 * Canonical implementation of the "open all plant DBs" pattern used by
 * corporate analytics, enhanced reports, and other cross-plant endpoints.
 *
 * Extracted from corporate-analytics.js to eliminate duplication across
 * route files that each implemented this logic independently with slightly
 * different exclusion criteria — a consistency hazard.
 *
 * USAGE:
 *   const { getAllPlantDbs } = require('../utils/plantDbs');
 *   const plants = getAllPlantDbs();
 *   for (const { plantId, db } of plants) {
 *       try { ... } finally { try { db.close(); } catch {} }
 *   }
 *
 * RETURNS: Array of { plantId: string, db: Database } — CALLER MUST close each db.
 *
 * EXCLUSION LOGIC: NON_PLANT_DBS set covers all known system databases.
 *   Additionally, any file starting with 'trier_' or 'logistics' is excluded.
 *   Any DB that lacks a Work table is skipped (plant sanity check).
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const dataDir = require('../resolve_data_dir');

// ── Exclusion list: system-level DBs that are not plant operational databases ──
const NON_PLANT_DBS = new Set([
    'schema_template', 'corporate_master', 'Corporate_Office',
    'dairy_master', 'it_master', 'logistics', 'trier_auth',
    'trier_chat', 'trier_logistics', 'examples'
]);

/**
 * Open all plant databases in readonly mode and return handles.
 * Skips: system DBs (NON_PLANT_DBS), trier_* files, logistics* files,
 * and any DB that lacks a Work table (not a plant DB).
 *
 * @returns {{ plantId: string, db: import('better-sqlite3').Database }[]}
 */
function getAllPlantDbs() {
    const plantDbs = [];
    try {
        if (!fs.existsSync(dataDir)) return plantDbs;

        // Load plants.json as the authoritative registry of active plants.
        // Any .db file not registered here (e.g. orphaned from a failed delete)
        // is excluded — prevents deleted plants from appearing in corporate analytics.
        const plantsFile = path.join(dataDir, 'plants.json');
        let registeredIds = null;
        if (fs.existsSync(plantsFile)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
                // Exclude system/non-operational entries from analytics
                registeredIds = new Set(
                    parsed
                        .map(p => p.id)
                        .filter(id => !NON_PLANT_DBS.has(id))
                );
            } catch (_) { /* fall through to disk scan on parse error */ }
        }

        const files = fs.readdirSync(dataDir).filter(f => {
            if (!f.endsWith('.db')) return false;
            const plantId = f.replace('.db', '');
            // If we have a registry, only allow registered IDs
            if (registeredIds && !registeredIds.has(plantId)) return false;
            if (NON_PLANT_DBS.has(plantId)) return false;
            if (f.startsWith('trier_') || f.startsWith('logistics')) return false;
            return true;
        });

        for (const f of files) {
            try {
                const plantId = f.replace('.db', '');
                const dbPath = path.join(dataDir, f);
                const db = new Database(dbPath, { readonly: true });
                // Sanity check: must have a Work table to qualify as a plant DB
                const hasWork = db.prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='Work'"
                ).get();
                if (hasWork) {
                    plantDbs.push({ plantId, db });
                } else {
                    db.close();
                }
            } catch (_) { /* skip broken or locked DBs */ }
        }
    } catch (e) {
        console.error('[plantDbs] getAllPlantDbs error:', e.message);
    }
    return plantDbs;
}

module.exports = { getAllPlantDbs, NON_PLANT_DBS };
