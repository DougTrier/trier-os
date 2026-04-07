// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Master Index (corporate_master.db)
 * =======================================================
 * Central corporate analytics database that stores aggregated data from ALL plants.
 * Populated by crawl_engine.js on a 15-minute interval.
 *
 * TABLES:
 *   PlantStats       - Per-plant aggregate counts (WOs, assets, parts, costs, urgent WOs)
 *   MasterAssetIndex - All assets across all plants with predictive health metrics
 *   PredictiveAlerts - Generated alerts for assets showing chronic failure patterns
 *   MasterPartIndex  - All parts across all plants for global search
 *
 * This DB is the backbone of the "All Sites" dashboard, Enterprise Intelligence,
 * and the global search engine.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const masterDbPath = path.join(require('./resolve_data_dir'), 'corporate_master.db');

// Initialize the Master Index
const masterDb = new Database(masterDbPath);

// Create the core Master Registry tables
masterDb.exec(`
    CREATE TABLE IF NOT EXISTS PlantStats (
        plantId TEXT PRIMARY KEY,
        plantLabel TEXT,
        totalWOs INTEGER DEFAULT 0,
        totalAssets INTEGER DEFAULT 0,
        totalParts INTEGER DEFAULT 0,
        totalSchedules INTEGER DEFAULT 0,
        totalCostMTD REAL DEFAULT 0,
        urgentWOs INTEGER DEFAULT 0,
        lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS MasterAssetIndex (
        assetId TEXT,
        plantId TEXT,
        assetName TEXT,
        model TEXT,
        serial TEXT,
        status TEXT,
        healthScore INTEGER DEFAULT 100,
        mtbfDays INTEGER DEFAULT 0,
        lastRepairDate DATETIME,
        riskLevel TEXT DEFAULT 'Low',
        predictiveAlert TEXT,
        mtbfTrend TEXT DEFAULT 'stable',
        predictedFailureDate TEXT,
        repairCount INTEGER DEFAULT 0,
        PRIMARY KEY (assetId, plantId)
    );

    CREATE TABLE IF NOT EXISTS PredictiveAlerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assetId TEXT,
        plantId TEXT,
        alertType TEXT,
        message TEXT,
        severity TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS MasterPartIndex (
        partId TEXT,
        plantId TEXT,
        partNumber TEXT,
        description TEXT,
        quantity INTEGER,
        location TEXT,
        PRIMARY KEY (partId, plantId)
    );

    CREATE INDEX IF NOT EXISTS idx_asset_name ON MasterAssetIndex(assetName);
    CREATE INDEX IF NOT EXISTS idx_part_num ON MasterPartIndex(partNumber);
`);

// Safe migrations for new predictive columns on existing databases
try { masterDb.exec('ALTER TABLE MasterAssetIndex ADD COLUMN mtbfTrend TEXT DEFAULT "stable"'); } catch(e) { /* column exists */ }
try { masterDb.exec('ALTER TABLE MasterAssetIndex ADD COLUMN predictedFailureDate TEXT'); } catch(e) { /* column exists */ }
try { masterDb.exec('ALTER TABLE MasterAssetIndex ADD COLUMN repairCount INTEGER DEFAULT 0'); } catch(e) { /* column exists */ }

module.exports = masterDb;
