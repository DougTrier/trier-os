// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * 029_p4_moc.js — P4 Management of Change Schema
 * ================================================
 * Creates the ManagementOfChange, MOCApprovals, and MOCAffectedItems tables
 * in trier_logistics.db for cross-plant MOC visibility.
 *
 * All three tables are created by moc.js at startup (idempotent), so this
 * migration file exists for documentation and explicit ordering purposes.
 * The try/catch pattern handles re-runs safely.
 */

module.exports = {
    up: (db) => {
        // MOC tables are created inline in routes/moc.js at startup.
        // This migration is a no-op marker for version tracking.
        // If the logistics DB is ever migrated separately, add the CREATE
        // statements here matching those in moc.js.
    }
};
