// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Migration: Seed CostCenters + Backfill WorkOrderNumber
 * =======================================================
 * 1. Populates CostCenters with standard manufacturing departments
 * 2. Backfills WorkOrderNumber = ID for any rows where it is null
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', '..', 'data');
const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('trier_') && f !== 'schema_template.db');

const COST_CENTERS = [
    { ID: 'CC-MAINT',   Description: 'Maintenance Department',     Budget: '250000', Comment: 'General maintenance operations' },
    { ID: 'CC-PROD',    Description: 'Production Operations',      Budget: '500000', Comment: 'Production line maintenance' },
    { ID: 'CC-UTIL',    Description: 'Utilities & Facilities',     Budget: '150000', Comment: 'Building systems, HVAC, electrical' },
    { ID: 'CC-SAFETY',  Description: 'Safety & Compliance',        Budget: '75000',  Comment: 'Safety equipment and regulatory' },
    { ID: 'CC-QUAL',    Description: 'Quality Assurance',           Budget: '100000', Comment: 'QA lab and inspection equipment' },
    { ID: 'CC-WHSE',    Description: 'Warehouse & Logistics',      Budget: '120000', Comment: 'Material handling and storage' },
    { ID: 'CC-TOOL',    Description: 'Tooling & Fabrication',      Budget: '80000',  Comment: 'Tool room and custom fabrication' },
    { ID: 'CC-ELEC',    Description: 'Electrical Department',      Budget: '175000', Comment: 'Electrical systems and controls' },
    { ID: 'CC-MECH',    Description: 'Mechanical Department',      Budget: '200000', Comment: 'Mechanical systems and pumps' },
    { ID: 'CC-IT',      Description: 'IT & Automation',            Budget: '90000',  Comment: 'PLC, SCADA, and IT infrastructure' },
    { ID: 'CC-PROJ',    Description: 'Capital Projects',           Budget: '350000', Comment: 'Capital improvement projects' },
    { ID: 'CC-RD',      Description: 'R&D / Engineering',          Budget: '125000', Comment: 'Engineering and research activities' },
];

let totalUpdated = 0;
let totalSeeded = 0;

for (const dbFile of dbFiles) {
    const dbPath = path.join(dataDir, dbFile);
    const plantId = dbFile.replace('.db', '');
    
    try {
        const db = new Database(dbPath);
        
        // 1. Ensure CostCenters table has proper schema
        try {
            const cols = db.prepare("PRAGMA table_info(CostCenters)").all();
            if (cols.length === 0) {
                // Table exists but has no columns — drop and recreate
                db.exec('DROP TABLE IF EXISTS CostCenters');
                db.exec(`
                    CREATE TABLE CostCenters (
                        ID TEXT PRIMARY KEY,
                        Description TEXT,
                        Budget TEXT,
                        Comment TEXT
                    )
                `);
                console.log(`[${plantId}] Recreated CostCenters table with proper schema`);
            }
        } catch (e) {
            // Table doesn't exist at all
            db.exec(`
                CREATE TABLE IF NOT EXISTS CostCenters (
                    ID TEXT PRIMARY KEY,
                    Description TEXT,
                    Budget TEXT,
                    Comment TEXT
                )
            `);
            console.log(`[${plantId}] Created CostCenters table`);
        }

        // 2. Seed cost centers
        const existing = db.prepare('SELECT COUNT(*) as c FROM CostCenters').get().c;
        if (existing === 0) {
            const insert = db.prepare('INSERT OR IGNORE INTO CostCenters (ID, Description, Budget, Comment) VALUES (?, ?, ?, ?)');
            const seedTx = db.transaction(() => {
                for (const cc of COST_CENTERS) {
                    insert.run(cc.ID, cc.Description, cc.Budget, cc.Comment);
                }
            });
            seedTx();
            totalSeeded++;
            console.log(`[${plantId}] Seeded ${COST_CENTERS.length} cost centers`);
        } else {
            console.log(`[${plantId}] Already has ${existing} cost centers — skipped`);
        }

        // 3. Backfill WorkOrderNumber where null
        try {
            const nullCount = db.prepare("SELECT COUNT(*) as c FROM Work WHERE WorkOrderNumber IS NULL").get().c;
            if (nullCount > 0) {
                db.prepare("UPDATE Work SET WorkOrderNumber = ID WHERE WorkOrderNumber IS NULL").run();
                totalUpdated += nullCount;
                console.log(`[${plantId}] Backfilled ${nullCount} WorkOrderNumbers`);
            }
        } catch (e) {
            console.log(`[${plantId}] WorkOrderNumber backfill skipped:`, e.message);
        }

        // 4. Also handle the legacy CostCntr table — drop if it's malformed
        try {
            const cntrCols = db.prepare("PRAGMA table_info(CostCntr)").all();
            if (cntrCols.length === 0) {
                db.exec('DROP TABLE IF EXISTS CostCntr');
                console.log(`[${plantId}] Dropped malformed CostCntr shell table`);
            }
        } catch (e) { /* no CostCntr table, fine */ }

        db.close();
    } catch (err) {
        console.error(`[${plantId}] FAILED:`, err.message);
    }
}

console.log(`\n=== COMPLETE ===`);
console.log(`Seeded cost centers in ${totalSeeded} databases`);
console.log(`Backfilled ${totalUpdated} WorkOrderNumbers`);
