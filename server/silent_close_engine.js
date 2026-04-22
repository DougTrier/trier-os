// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Silent Auto-Close Engine
 * =====================================
 * Hourly background cron that closes WorkSegments that have been Active beyond
 * the plant-configured threshold (PlantScanConfig.autoReviewThresholdHours,
 * default 12h). Closes the segment as 'TimedOut' and raises needsReview on
 * the parent Work row so Mission Control can surface it for supervisor action.
 *
 * WHY A SEPARATE ENGINE (not inlined in pm_engine.js):
 *   PM engine runs every 24h and is I/O-heavy (VACUUM, ANALYZE). The silent
 *   close job needs to run every hour with minimal I/O — coupling them would
 *   either slow the hourly path or starve the daily one.
 *
 * SEGMENT LIFECYCLE after this engine fires:
 *   Active → TimedOut   (cron)
 *   Active → Ended      (tech-initiated normal close)
 *   Using a distinct 'TimedOut' state lets reports separate cron-closed from
 *   tech-closed segments without an additional flag column.
 */
const Database = require('better-sqlite3');
const fs       = require('fs');
const path     = require('path');

const { EXEMPT_HOLD_REASONS } = require('./constants/holdReasons');

// Read per-plant threshold; falls back to 12h to match PlantScanConfig default.
function getThreshold(db) {
    const cfg = db.prepare('SELECT autoReviewThresholdHours FROM PlantScanConfig LIMIT 1').get();
    return cfg ? (cfg.autoReviewThresholdHours || 12) : 12;
}

function runForPlant(dbPath, plantName) {
    let db;
    try {
        db = new Database(dbPath);

        // Guard: older plant DBs may not yet have WorkSegments (pre-scan schema).
        // Checking sqlite_master is faster than a try/catch around the query.
        const hasTable = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='WorkSegments'"
        ).get();
        if (!hasTable) { db.close(); return 0; }

        const thresholdHours = getThreshold(db);

        let closed = 0;

        // R-3: SELECT is moved inside the IMMEDIATE transaction so the holdReason
        // snapshot and the UPDATE see the same DB state. Without this, a tech's
        // WAITING_ON_PARTS hold action between the outer SELECT and the UPDATE
        // would be silently overwritten with 'TimedOut' (TOCTOU).
        // AND segmentState = 'Active' in the UPDATE is the inner guard: if a tech
        // closes a segment normally (Active→Ended) while this transaction is
        // running, changes === 0 and we skip the review flag entirely.
        db.transaction(() => {
            const freshSegments = db.prepare(`
                SELECT ws.segmentId, ws.woId, ws.userId,
                       w.holdReason, w.needsReview
                FROM WorkSegments ws
                LEFT JOIN Work w ON CAST(ws.woId AS TEXT) = CAST(w.ID AS TEXT)
                WHERE ws.segmentState = 'Active'
                  AND ws.startTime < datetime('now', '-' || ? || ' hours')
            `).all(thresholdHours);

            for (const seg of freshSegments) {
                // Exempted hold reasons mean a tech explicitly paused the WO for a
                // legitimate external dependency — closing it as timed-out would
                // generate false-positive supervisor alerts and erode trust in the
                // auto-review queue over time.
                if (EXEMPT_HOLD_REASONS.has(seg.holdReason)) continue;

                // Close the stale segment with 'TimedOut' (not 'Ended') so that
                // labor-time reports and the review queue can distinguish cron
                // closures from tech-initiated closures without a separate flag.
                // AND segmentState = 'Active' ensures a concurrent normal close wins.
                const updateResult = db.prepare(`
                    UPDATE WorkSegments
                    SET endTime = datetime('now'), segmentState = 'TimedOut'
                    WHERE segmentId = ? AND segmentState = 'Active'
                `).run(seg.segmentId);

                if (updateResult.changes === 0) continue; // concurrently closed — skip

                // Only write the review flag when it is not already set — avoids
                // overwriting a more specific reviewReason (e.g. OFFLINE_CONFLICT)
                // that a prior event may have set on the same WO.
                if (!seg.needsReview) {
                    db.prepare(`
                        UPDATE Work
                        SET needsReview   = 1,
                            reviewReason  = 'SILENT_AUTO_CLOSE',
                            reviewStatus  = 'FLAGGED'
                        WHERE ID = ?
                    `).run(seg.woId);
                }

                closed++;
            }
        }).immediate();

        db.close();
        return closed;
    } catch (err) {
        console.warn(`[SilentClose] ${plantName}: ${err.message}`);
        // Best-effort close — db may already be closed if the error came from open()
        try { db?.close(); } catch (_) {}
        return 0;
    }
}

/**
 * Iterates every plant DB, finds Active segments older than the per-plant
 * threshold, and closes them as TimedOut. Called by the hourly cron in index.js.
 */
function runSilentCloseCron() {
    console.log('\n⏱ [Cron] Silent Auto-Close — scanning all plants for stale segments…');
    const dataDir = require('./resolve_data_dir');
    // Same DB-discovery pattern used by pm_engine and enrichment_engine:
    // exclude trier_ prefixed files (corporate master + logistics) which do
    // not have WorkSegments and should not receive maintenance writes from plant engines.
    const dbFiles = fs.readdirSync(dataDir)
        .filter(f => f.endsWith('.db') && !f.includes('trier_'));

    let total = 0;
    for (const dbFile of dbFiles) {
        const plantName  = dbFile.replace('.db', '');
        const dbFilePath = path.join(dataDir, dbFile);
        const closed     = runForPlant(dbFilePath, plantName);
        if (closed > 0) {
            console.log(`  ✅ [SilentClose] ${plantName}: flagged ${closed} stale segment${closed !== 1 ? 's' : ''}`);
            total += closed;
        }
    }

    console.log(`⏱ [SilentClose] Done — ${total} stale segment${total !== 1 ? 's' : ''} flagged across ${dbFiles.length} plant${dbFiles.length !== 1 ? 's' : ''}\n`);
}

module.exports = { runSilentCloseCron };
