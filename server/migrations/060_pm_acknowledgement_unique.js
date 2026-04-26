// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 060 — UNIQUE constraint on pm_acknowledgements.pm_id
//
// I-10: Without this constraint, two concurrent POST /api/pm/acknowledge
// calls for the same PM can both pass the SELECT existence check and both
// INSERT — dispatching two technicians to the same machine and leaving two
// ownership records in the table.
//
// Safe to apply: pre-migration audit confirmed no duplicate pm_id rows
// exist across any plant DB (2026-04-26). The CREATE UNIQUE INDEX will
// fail loudly if duplicates are present rather than silently truncating.
//
// After this migration the service-layer catch block maps
// SQLITE_CONSTRAINT_UNIQUE → { alreadyClaimed: true } so the second
// concurrent caller receives a clean idempotency response instead of 500.

'use strict';

module.exports = {
    up(db) {
        const hasTable = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='pm_acknowledgements'"
        ).get();
        if (!hasTable) return; // migration 058 will create it with the index on first boot

        // Audit for duplicates before applying — fail loudly if any exist
        // so the operator can deduplicate before re-running migrations.
        const dups = db.prepare(
            'SELECT pm_id, COUNT(*) as cnt FROM pm_acknowledgements GROUP BY pm_id HAVING cnt > 1'
        ).all();
        if (dups.length > 0) {
            throw new Error(
                `[060] Cannot add UNIQUE(pm_id): duplicate pm_id rows exist in pm_acknowledgements — ` +
                `deduplicate first: ${JSON.stringify(dups)}`
            );
        }

        db.exec(
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_pmack_pm_unique ON pm_acknowledgements(pm_id)'
        );
    },
    down(db) {
        try { db.exec('DROP INDEX IF EXISTS idx_pmack_pm_unique'); } catch {}
    },
};
