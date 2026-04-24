// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS - Migration 034 — Catalog Cross-Reference
 * ==============================================================
 * Adds tables for OEM cross references and vertical-to-core mapping.
 */
module.exports = {
    up: (db) => {
        // This migration runs on the mfg_master.db.
        // We will open it explicitly using better-sqlite3
        const Database = require('better-sqlite3');
        const path = require('path');
        const dataDir = require('../resolve_data_dir');
        
        let mfgDb;
        try {
            mfgDb = new Database(path.join(dataDir, 'mfg_master.db'));
            
            mfgDb.prepare(`
                CREATE TABLE IF NOT EXISTS OEMCrossReference (        
                    CrossRefID  INTEGER PRIMARY KEY,
                    MasterPartID TEXT NOT NULL,
                    OEMManufacturer TEXT NOT NULL,
                    OEMPartNumber TEXT NOT NULL,
                    Notes TEXT,
                    CreatedAt TEXT NOT NULL,
                    CreatedBy TEXT NOT NULL
                )
            `).run();
            
            mfgDb.prepare(`
                CREATE UNIQUE INDEX IF NOT EXISTS uq_oem_crossref     
                    ON OEMCrossReference(OEMManufacturer, OEMPartNumber)
            `).run();

            mfgDb.prepare(`
                CREATE TABLE IF NOT EXISTS VerticalCoreMapping (      
                    MappingID   INTEGER PRIMARY KEY,
                    VerticalPartID TEXT NOT NULL,
                    CorePartID  TEXT NOT NULL,
                    Notes TEXT,
                    CreatedAt TEXT NOT NULL,
                    CreatedBy TEXT NOT NULL
                )
            `).run();

            mfgDb.prepare(`
                CREATE UNIQUE INDEX IF NOT EXISTS uq_vertical_core    
                    ON VerticalCoreMapping(VerticalPartID, CorePartID)
            `).run();

            console.log('   -> Created OEMCrossReference and VerticalCoreMapping tables in mfg_master.db.');
        } catch (err) {
            console.warn('   -> Could not create catalog cross-reference tables:', err.message);
        } finally {
            if (mfgDb) mfgDb.close();
        }
    }
};
