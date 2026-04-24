// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS - Migration 035 — Emissions & Carbon Intensity Tracking
 * ==============================================================
 * Adds EmissionsConfig and EmissionsProductionLog to trier_logistics.db.
 * Adds Scope1EmissionFactor and FuelType columns to Assets table in all plant databases.
 */
module.exports = {
    up: () => {
        const Database = require('better-sqlite3');
        const path = require('path');
        const fs = require('fs');
        const dataDir = require('../resolve_data_dir');
        
        // 1. Update logistics DB
        let logisticsDb;
        try {
            logisticsDb = require('../logistics_db').db;
            
            logisticsDb.prepare(`
                CREATE TABLE IF NOT EXISTS EmissionsConfig (
                    ConfigID     INTEGER PRIMARY KEY,
                    PlantID      TEXT NOT NULL UNIQUE,
                    GridIntensity REAL NOT NULL DEFAULT 0.417,
                    GridRegion   TEXT,
                    UpdatedBy    TEXT NOT NULL,
                    UpdatedAt    TEXT NOT NULL
                )
            `).run();

            logisticsDb.prepare(`
                CREATE TABLE IF NOT EXISTS EmissionsProductionLog (
                    LogID        INTEGER PRIMARY KEY,
                    PlantID      TEXT NOT NULL,
                    PeriodStart  TEXT NOT NULL,
                    PeriodEnd    TEXT NOT NULL,
                    Volume       REAL NOT NULL,
                    Unit         TEXT NOT NULL,
                    RecordedBy   TEXT NOT NULL,
                    RecordedAt   TEXT NOT NULL
                )
            `).run();
            console.log('   -> Created Emissions tables in trier_logistics.db.');
        } catch (err) {
            console.warn('   -> Could not create emissions tables in logistics DB:', err.message);
        }

        // 2. Update plant databases (including schema_template.db)
        const files = fs.readdirSync(dataDir);
        for (const file of files) {
            if (file.endsWith('.db') && file !== 'mfg_master.db' && file !== 'trier_logistics.db') {
                let db;
                try {
                    db = new Database(path.join(dataDir, file));
                    
                    const hasAsset = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Asset'").get();
                    if (hasAsset) {
                        const cols = db.prepare('PRAGMA table_info(Asset)').all().map(c => c.name);
                        
                        if (!cols.includes('Scope1EmissionFactor')) {
                            db.prepare('ALTER TABLE Asset ADD COLUMN Scope1EmissionFactor REAL DEFAULT NULL').run();
                        }
                        if (!cols.includes('FuelType')) {
                            db.prepare('ALTER TABLE Asset ADD COLUMN FuelType TEXT DEFAULT NULL').run();
                        }
                    }
                } catch (err) {
                    console.warn(`   -> Failed to migrate ${file}:`, err.message);
                } finally {
                    if (db) db.close();
                }
            }
        }
        console.log('   -> Updated Asset table in all plant databases.');
    }
};
