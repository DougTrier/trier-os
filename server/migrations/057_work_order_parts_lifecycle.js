// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 057 — Work order parts lifecycle tracking
//
// Adds audit columns to WorkParts and creates inventory_movements for movement-
// based stock tracking (ISSUE → USE → RETURN).
//
// WorkParts additions:
//   qty_returned  REAL    — quantity physically returned to bin
//   status        TEXT    — issued | partial_return | fully_returned
//   issued_by     TEXT    — username who issued
//   returned_by   TEXT    — username who returned
//   returned_at   TEXT    — ISO timestamp of last return
//
// inventory_movements — immutable audit log of every stock movement
//   movement_type: ISSUE_TO_WORK_ORDER | USE_ON_WORK_ORDER | RETURN_TO_STOCK
//
// qty_returnable (computed) = EstQty - COALESCE(ActQty,0) - COALESCE(qty_returned,0)

'use strict';

module.exports = {
    up(db) {
        // Only run on databases that have the WorkParts table
        const hasWP = db.prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='WorkParts'`
        ).get();
        if (!hasWP) return;

        const cols = db.prepare('PRAGMA table_info(WorkParts)').all().map(c => c.name);
        if (!cols.includes('qty_returned')) db.exec('ALTER TABLE WorkParts ADD COLUMN qty_returned  REAL DEFAULT 0');
        if (!cols.includes('status'))       db.exec("ALTER TABLE WorkParts ADD COLUMN status        TEXT DEFAULT 'issued'");
        if (!cols.includes('issued_by'))    db.exec('ALTER TABLE WorkParts ADD COLUMN issued_by     TEXT');
        if (!cols.includes('returned_by'))  db.exec('ALTER TABLE WorkParts ADD COLUMN returned_by   TEXT');
        if (!cols.includes('returned_at'))  db.exec('ALTER TABLE WorkParts ADD COLUMN returned_at   TEXT');

        db.exec(`
            CREATE TABLE IF NOT EXISTS inventory_movements (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                work_order_id INTEGER,
                part_id       TEXT    NOT NULL,
                movement_type TEXT    NOT NULL,
                qty           REAL    NOT NULL,
                unit_cost     REAL,
                location      TEXT,
                performed_by  TEXT,
                performed_at  TEXT    NOT NULL DEFAULT (datetime('now')),
                notes         TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_im_wo   ON inventory_movements(work_order_id);
            CREATE INDEX IF NOT EXISTS idx_im_part ON inventory_movements(part_id);
            CREATE INDEX IF NOT EXISTS idx_im_type ON inventory_movements(movement_type);
        `);

        // Backfill ISSUE_TO_WORK_ORDER movements for any existing WorkParts rows
        // that don't already have one recorded (idempotent via INSERT OR IGNORE).
        db.exec(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_im_wo_part_issue
                ON inventory_movements(work_order_id, part_id, movement_type)
                WHERE movement_type = 'ISSUE_TO_WORK_ORDER'
        `);
        const existing = db.prepare(`
            SELECT wp.WoID, wp.PartID, wp.EstQty, wp.UnitCost, wp.Location, wp.UseDate
            FROM WorkParts wp
            WHERE wp.EstQty > 0
        `).all();
        const ins = db.prepare(`
            INSERT OR IGNORE INTO inventory_movements
                (work_order_id, part_id, movement_type, qty, unit_cost, location, performed_by, performed_at)
            VALUES (?, ?, 'ISSUE_TO_WORK_ORDER', ?, ?, ?, 'system_backfill', ?)
        `);
        db.transaction(() => {
            for (const r of existing) {
                ins.run(r.WoID, r.PartID, r.EstQty, parseFloat(r.UnitCost) || 0, r.Location || null,
                    r.UseDate || new Date().toISOString());
            }
        })();
    },
};
