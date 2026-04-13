// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * 028_p3_work_asset_additions.js — P3 Advisory Mode Schema Additions
 * ====================================================================
 * Additive migration. Adds P3 fields to the Work and Asset tables.
 * All additions use try/catch to handle existing columns gracefully —
 * SQLite has no ADD COLUMN IF NOT EXISTS syntax.
 *
 * Work table additions:
 *   WOSource        TEXT  — 'PLANNED' | 'UNPLANNED'. Set on creation.
 *   DowntimeCost    REAL  — Auto-calculated on WO close (P3 downtime cost).
 *
 * Asset table additions:
 *   HourlyProductionValue   REAL — USD value of production lost per hour of downtime.
 *   CriticalityScoreSafety  INT  — 1-5 safety impact score.
 *   CriticalityScoreEnv     INT  — 1-5 environmental impact score.
 *   CriticalityScoreProd    INT  — 1-5 production impact score.
 *   CriticalityScoreProb    INT  — 1-5 failure probability score.
 *   CriticalityScoreTotal   INT  — Sum of the four dimension scores (2-20 range).
 */

module.exports = {
    up: (db) => {
        const alterations = [
            // Work table
            `ALTER TABLE Work ADD COLUMN WOSource TEXT DEFAULT 'UNPLANNED'`,
            `ALTER TABLE Work ADD COLUMN DowntimeCost REAL DEFAULT 0`,
            // Asset table
            `ALTER TABLE Asset ADD COLUMN HourlyProductionValue REAL DEFAULT 0`,
            `ALTER TABLE Asset ADD COLUMN CriticalityScoreSafety INTEGER DEFAULT 0`,
            `ALTER TABLE Asset ADD COLUMN CriticalityScoreEnv INTEGER DEFAULT 0`,
            `ALTER TABLE Asset ADD COLUMN CriticalityScoreProd INTEGER DEFAULT 0`,
            `ALTER TABLE Asset ADD COLUMN CriticalityScoreProb INTEGER DEFAULT 0`,
            `ALTER TABLE Asset ADD COLUMN CriticalityScoreTotal INTEGER DEFAULT 0`,
        ];

        for (const sql of alterations) {
            try {
                db.prepare(sql).run();
            } catch (e) {
                // Column already exists — safe to ignore
                if (!e.message.includes('duplicate column name')) throw e;
            }
        }

        // Index on WOSource for the planned vs. unplanned ratio query
        try {
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_work_wosource ON Work(WOSource)`).run();
        } catch (e) { /* ok */ }

        // Index on CriticalityScoreTotal for sort/filter
        try {
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_asset_criticality_total ON Asset(CriticalityScoreTotal)`).run();
        } catch (e) { /* ok */ }
    }
};
