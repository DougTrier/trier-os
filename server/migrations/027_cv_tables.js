// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Migration 027 — Computer Vision Tables
 * ========================================
 * Creates tables for defect observations, PPE compliance photo checks,
 * and condition classifier results.
 *
 * Lives in trier_logistics.db (cross-plant, excluded from per-plant migrator).
 * Managed via inline CREATE TABLE IF NOT EXISTS in server/routes/cv.js init.
 * This migration file exists for documentation and tooling reference only.
 */
module.exports = {
    up: (db) => {
        // This migration targets trier_logistics.db, not per-plant DBs.
        // Tables are created in cv.js route init. Nothing to do here.
        console.log('   -> CV tables managed inline by server/routes/cv.js');
    }
};
