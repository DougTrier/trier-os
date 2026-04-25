// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 058 — PM acknowledgement and notification tables
//
// Adds per-plant PM lifecycle tracking so the eligible maintenance role pool
// is notified when a PM is due and ownership is claimed by one technician.
//
// Tables added (plant DB):
//   pm_notifications   — one row per eligible user per PM event
//   pm_acknowledgements — immutable record of who claimed the PM
//
// Schedule additions:
//   pm_status       TEXT  — PM_SCHEDULED | PM_DUE | PM_NOTIFIED |
//                           PM_ACKNOWLEDGED | PM_IN_PROGRESS | PM_COMPLETED | PM_OVERDUE
//   last_notified_at TEXT  — when the last notification round was sent

'use strict';

module.exports = {
    up(db) {
        const hasSchedule = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='Schedule'"
        ).get();
        if (!hasSchedule) return;

        db.exec(`
            CREATE TABLE IF NOT EXISTS pm_notifications (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                pm_id         INTEGER NOT NULL,
                work_order_id INTEGER,
                plant_id      TEXT    NOT NULL,
                notified_user TEXT    NOT NULL,
                notified_at   TEXT    NOT NULL DEFAULT (datetime('now')),
                status        TEXT    NOT NULL DEFAULT 'pending'
            );
            CREATE INDEX IF NOT EXISTS idx_pmnot_user ON pm_notifications(notified_user, status);
            CREATE INDEX IF NOT EXISTS idx_pmnot_pm   ON pm_notifications(pm_id);

            CREATE TABLE IF NOT EXISTS pm_acknowledgements (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                pm_id           INTEGER NOT NULL,
                work_order_id   INTEGER,
                plant_id        TEXT    NOT NULL,
                acknowledged_by TEXT    NOT NULL,
                acknowledged_at TEXT    NOT NULL DEFAULT (datetime('now')),
                ack_method      TEXT    DEFAULT 'button'
            );
            CREATE INDEX IF NOT EXISTS idx_pmack_pm ON pm_acknowledgements(pm_id);
        `);

        const cols = db.prepare('PRAGMA table_info(Schedule)').all().map(c => c.name);
        if (!cols.includes('pm_status'))
            db.exec("ALTER TABLE Schedule ADD COLUMN pm_status TEXT DEFAULT 'PM_SCHEDULED'");
        if (!cols.includes('last_notified_at'))
            db.exec('ALTER TABLE Schedule ADD COLUMN last_notified_at TEXT');
    },
};
