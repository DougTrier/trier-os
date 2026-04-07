// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║                    ⚠️  UNTOUCHABLE  ⚠️                         ║
 * ║                                                                ║
 * ║  mfg_master.db — Dairy Industry Master Data Catalog          ║
 * ║                                                                ║
 * ║  This database is the CROWN JEWEL of the application.          ║
 * ║  It contains 215 equipment types, 505 parts, 48 warranty       ║
 * ║  templates, 50 vendors, and 20 cross-references — all          ║
 * ║  hand-curated industry knowledge built over weeks of work.     ║
 * ║                                                                ║
 * ║  🚫 NEVER DELETE                                               ║
 * ║  🚫 NEVER DROP TABLES                                          ║
 * ║  🚫 NEVER TRUNCATE                                             ║
 * ║  🚫 NEVER INCLUDE IN SANITIZE/RESET/CLEAN SCRIPTS             ║
 * ║  🚫 NEVER EXCLUDE FROM BUILDS                                  ║
 * ║  🚫 NEVER ADD TO .gitignore                                    ║
 * ║                                                                ║
 * ║  This file MUST ship with every build. It is READ-ONLY         ║
 * ║  at runtime. Only seed scripts may write to it.                ║
 * ║                                                                ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Protection layers:
 *   1. This sentinel file (UNTOUCHABLE_dairy_master.js)
 *   2. _PROTECTED_DO_NOT_DELETE.dairy_master marker file in /data
 *   3. Integrity check table inside the database itself
 *   4. Runtime verification on server startup
 *   5. Build script guard (verifyMasterDb)
 *
 * If this file or mfg_master.db is missing, the server will
 * REFUSE TO START and log a CRITICAL error.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const MASTER_DB_NAME = 'mfg_master.db';
const EXPECTED_MIN_PARTS = 500;
const EXPECTED_MIN_EQUIPMENT = 200;
const EXPECTED_MIN_VENDORS = 40;

/**
 * Verifies the integrity of the Master Data Catalog.
 * Call this on server startup. If it fails, the server should NOT start.
 *
 * @param {string} dataDir - Path to the data directory
 * @returns {{ ok: boolean, error?: string, stats?: object }}
 */
function verifyMasterDb(dataDir) {
    const dbPath = path.join(dataDir, MASTER_DB_NAME);

    // Layer 1: File exists?
    if (!fs.existsSync(dbPath)) {
        return {
            ok: false,
            error: `🚨 CRITICAL: ${MASTER_DB_NAME} is MISSING from ${dataDir}! ` +
                   `This is the Master Data Catalog — it MUST exist. ` +
                   `Restore from git: git checkout -- data/${MASTER_DB_NAME}`
        };
    }

    // Layer 2: File size sanity (should be > 200KB with all our data)
    const stat = fs.statSync(dbPath);
    if (stat.size < 100000) {
        return {
            ok: false,
            error: `🚨 CRITICAL: ${MASTER_DB_NAME} is only ${stat.size} bytes — ` +
                   `it should be >200KB. Database may have been truncated or corrupted. ` +
                   `Restore from git: git checkout -- data/${MASTER_DB_NAME}`
        };
    }

    // Layer 3: Open and verify integrity fingerprint
    try {
        const db = new Database(dbPath, { readonly: true });

        // Check the integrity marker table
        const marker = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='_MASTER_DB_FINGERPRINT'"
        ).get();

        if (!marker) {
            db.close();
            return {
                ok: false,
                error: `🚨 CRITICAL: ${MASTER_DB_NAME} is missing its integrity fingerprint. ` +
                       `This may be a corrupted or replaced file. Restore from git.`
            };
        }

        const fp = db.prepare('SELECT * FROM _MASTER_DB_FINGERPRINT').get();
        if (!fp || fp.guardian !== 'UNTOUCHABLE') {
            db.close();
            return {
                ok: false,
                error: `🚨 CRITICAL: ${MASTER_DB_NAME} fingerprint is invalid. ` +
                       `Guardian marker missing. Restore from git.`
            };
        }

        // Layer 4: Verify minimum data counts
        const parts = db.prepare('SELECT COUNT(*) as c FROM MasterParts').get().c;
        const equip = db.prepare('SELECT COUNT(*) as c FROM MasterEquipment').get().c;
        const vendors = db.prepare('SELECT COUNT(*) as c FROM MasterVendors').get().c;
        const warranties = db.prepare('SELECT COUNT(*) as c FROM MasterWarrantyTemplates').get().c;
        const xrefs = db.prepare('SELECT COUNT(*) as c FROM MasterCrossRef').get().c;

        db.close();

        if (parts < EXPECTED_MIN_PARTS) {
            return {
                ok: false,
                error: `🚨 WARNING: ${MASTER_DB_NAME} has only ${parts} parts ` +
                       `(expected ${EXPECTED_MIN_PARTS}+). Data may have been partially deleted.`
            };
        }

        if (equip < EXPECTED_MIN_EQUIPMENT) {
            return {
                ok: false,
                error: `🚨 WARNING: ${MASTER_DB_NAME} has only ${equip} equipment types ` +
                       `(expected ${EXPECTED_MIN_EQUIPMENT}+). Data may have been partially deleted.`
            };
        }

        return {
            ok: true,
            stats: {
                parts,
                equipment: equip,
                vendors,
                warranties,
                crossRefs: xrefs,
                fileSize: stat.size,
                fingerprint: fp.created_at
            }
        };

    } catch (err) {
        return {
            ok: false,
            error: `🚨 CRITICAL: Cannot read ${MASTER_DB_NAME}: ${err.message}. ` +
                   `Database may be corrupted. Restore from git.`
        };
    }
}

module.exports = { verifyMasterDb, MASTER_DB_NAME };
