// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * 030_add_critical_spare_flag.js — P5-2 Spare Parts Optimization
 * ================================================================
 * Adds CriticalSpare flag to the Part table.
 */

module.exports = {
    up: (db) => {
        try {
            db.prepare(`ALTER TABLE Part ADD COLUMN CriticalSpare INTEGER DEFAULT 0`).run();
        } catch (e) {
            if (!e.message.includes('duplicate column name')) throw e;
        }

        try {
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_part_critical_spare ON Part(CriticalSpare)`).run();
        } catch (e) { /* ok */ }
    }
};
