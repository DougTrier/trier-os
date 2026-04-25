// Copyright © 2026 Trier OS. All Rights Reserved.
// server/services/outcomeTracker.js
//
// Provisional WO outcome tracking (Phase 2, Better Scan Flow).
//
// State machine for work_order_outcome.Resolved:
//   NULL  — provisional: WO closed, window not expired
//   0     — failed: follow-up WO opened within the resolution window
//   1     — resolved: window expired with no follow-up
//
// Three entry points:
//   recordOutcome(conn, {...})  — called on WO close (inserts NULL row)
//   markReopened(conn, {...})   — called on new WO creation (marks prior NULL as 0)
//   finalizeExpired()           — background sweep: marks expired NULL rows as 1
//
// All functions are non-throwing — outcome tracking must never fail a scan or WO save.

'use strict';

const path         = require('path');
const fs           = require('fs');
const Database     = require('better-sqlite3');
const dataDir      = require('../resolve_data_dir');
const explainCache = require('./explainCache');

const DEFAULT_WINDOW_MIN = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getResolutionWindow(equipmentTypeId) {
    if (!equipmentTypeId) return DEFAULT_WINDOW_MIN;
    try {
        const mfgDb = new Database(path.join(dataDir, 'mfg_master.db'), { readonly: true });
        const row = mfgDb.prepare(
            'SELECT ResolutionWindowMin FROM MasterEquipment WHERE EquipmentTypeID = ? LIMIT 1'
        ).get(equipmentTypeId);
        mfgDb.close();
        return (row?.ResolutionWindowMin) || DEFAULT_WINDOW_MIN;
    } catch { return DEFAULT_WINDOW_MIN; }
}

// Try to match assetId against EquipmentTypeID in mfg_master.db.
// Scan IDs are sometimes identical to catalog EquipmentTypeIDs.
function resolveEquipmentType(assetId) {
    try {
        const mfgDb = new Database(path.join(dataDir, 'mfg_master.db'), { readonly: true });
        const row = mfgDb.prepare(
            'SELECT EquipmentTypeID FROM MasterEquipment WHERE EquipmentTypeID = ? LIMIT 1'
        ).get(assetId);
        mfgDb.close();
        return row?.EquipmentTypeID || null;
    } catch { return null; }
}

function hasOutcomeTable(conn) {
    return !!conn.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='work_order_outcome' LIMIT 1"
    ).get();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Insert a provisional outcome row when a WO is completed.
 * Resolved = NULL — window has not expired yet.
 * conn: raw better-sqlite3 connection for the plant DB.
 */
function recordOutcome(conn, { workOrderId, assetId, completedAt }) {
    try {
        if (!hasOutcomeTable(conn)) return;

        const equipmentTypeId = resolveEquipmentType(assetId);
        const resolutionWindowMin = getResolutionWindow(equipmentTypeId);

        // Compute resolution time from WO start (AddDate as proxy; StartDate preferred if present)
        let resolutionTimeSec = null;
        try {
            const wo = conn.prepare(
                'SELECT COALESCE(StartDate, AddDate) AS StartedAt FROM Work WHERE ID = ? LIMIT 1'
            ).get(workOrderId);
            if (wo?.StartedAt) {
                const diffSec = Math.round(
                    (new Date(completedAt).getTime() - new Date(wo.StartedAt).getTime()) / 1000
                );
                if (diffSec > 0) resolutionTimeSec = diffSec;
            }
        } catch { /* StartDate column absent — skip */ }

        conn.prepare(`
            INSERT INTO work_order_outcome
                (WorkOrderID, AssetID, EquipmentTypeID, CompletedAt, ResolutionWindowMin, Resolved, ResolutionTimeSec)
            VALUES (?, ?, ?, ?, ?, NULL, ?)
            ON CONFLICT(WorkOrderID) DO UPDATE SET
                CompletedAt         = excluded.CompletedAt,
                ResolutionWindowMin = excluded.ResolutionWindowMin,
                Resolved            = NULL,
                FinalizedAt         = NULL
        `).run(workOrderId, assetId, equipmentTypeId, completedAt, resolutionWindowMin, resolutionTimeSec);
    } catch (_) { /* never surface to caller */ }
}

/**
 * When a new WO is created for an asset, check if there's a pending outcome
 * within the resolution window. If so, mark it Resolved = 0 (issue recurred).
 * conn: raw better-sqlite3 connection for the plant DB.
 */
function markReopened(conn, { assetId, newWoId, openedAt }) {
    try {
        if (!hasOutcomeTable(conn)) return;

        const pending = conn.prepare(`
            SELECT WorkOrderID, CompletedAt, ResolutionWindowMin
            FROM work_order_outcome
            WHERE AssetID = ? AND Resolved IS NULL
            ORDER BY CompletedAt DESC
            LIMIT 1
        `).get(assetId);

        if (!pending) return;

        const windowMs  = pending.ResolutionWindowMin * 60 * 1000;
        const completedMs = new Date(pending.CompletedAt).getTime();
        const openedMs    = new Date(openedAt || new Date().toISOString()).getTime();

        if (!isNaN(completedMs) && !isNaN(openedMs) && (openedMs - completedMs) <= windowMs) {
            conn.prepare(`
                UPDATE work_order_outcome
                SET Resolved = 0, FollowupWorkOrderID = ?, FinalizedAt = datetime('now')
                WHERE WorkOrderID = ?
            `).run(newWoId, pending.WorkOrderID);

            // Explain cache is now stale — invalidate immediately (trigger 3)
            try {
                const plantId = path.basename(conn.name, '.db');
                explainCache.invalidate(plantId, assetId);
            } catch { /* cache failure never blocks outcome write */ }
        }
    } catch (_) { /* never surface to caller */ }
}

/**
 * Background sweep: finalize any pending outcomes whose resolution window
 * has expired without a follow-up WO — mark them Resolved = 1.
 * Called on a 5-minute interval from server/index.js.
 */
function finalizeExpired() {
    const EXCLUDE = ['mfg_master', 'trier_logistics', 'auth_db', 'schema_template', 'corporate_master'];
    let dbFiles;
    try {
        dbFiles = fs.readdirSync(dataDir)
            .filter(f => f.endsWith('.db') && !EXCLUDE.some(ex => f.includes(ex)));
    } catch { return; }

    for (const dbFile of dbFiles) {
        let db;
        try {
            db = new Database(path.join(dataDir, dbFile));
            db.pragma('journal_mode = WAL');

            if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_order_outcome' LIMIT 1").get()) {
                db.close();
                continue;
            }

            const expired = db.prepare(`
                SELECT WorkOrderID, AssetID
                FROM work_order_outcome
                WHERE Resolved IS NULL
                  AND datetime(CompletedAt, '+' || ResolutionWindowMin || ' minutes') <= datetime('now')
            `).all();

            if (expired.length > 0) {
                const finalize = db.prepare(`
                    UPDATE work_order_outcome
                    SET Resolved = 1, FinalizedAt = datetime('now')
                    WHERE WorkOrderID = ?
                `);
                db.transaction(() => {
                    for (const row of expired) finalize.run(row.WorkOrderID);
                })();
                console.log(`[outcomeTracker] Finalized ${expired.length} outcome(s) → ${dbFile}`);

                // Explain cache is now stale for each finalized asset — invalidate (trigger 4)
                const plantId = path.basename(dbFile, '.db');
                for (const row of expired) {
                    explainCache.invalidate(plantId, row.AssetID);
                }
            }

            db.close();
        } catch (e) {
            console.warn(`[outcomeTracker] finalizeExpired error on ${dbFile}: ${e.message}`);
            try { db?.close(); } catch {}
        }
    }
}

module.exports = { recordOutcome, markReopened, finalizeExpired };
