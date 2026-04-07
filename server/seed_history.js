const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DURATION_DAYS = 365 * 2 + 30; // 2 years and 1 month
const START_DATE = new Date();
START_DATE.setDate(START_DATE.getDate() - DURATION_DAYS);

function seedHistoricalData(dbPath, plantName) {
    if (!fs.existsSync(dbPath)) {
        console.log(`Skipping ${plantName} - DB not found at ${dbPath}`);
        return;
    }
    
    console.log(`Seeding 25 months of history into ${plantName}...`);
    const db = new Database(dbPath);
    
    try {
        const assets = db.prepare('SELECT ID as AstID FROM Asset').all().map(a => a.AstID);
        const parts = db.prepare('SELECT ID as PartID, UnitCost FROM Part WHERE ID IS NOT NULL').all();
        
        if (assets.length === 0) {
            console.log(`No assets found in ${plantName}, skipping...`);
            return;
        }

        const insertWork = db.prepare(`
            INSERT INTO Work (ID, Descript, AstID, StatusID, AddDate, CompDate, Priority, ActDown, TypeID, ExpectedDuration, ActualHours)
            VALUES (?, ?, ?, 4, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const insertLabor = db.prepare(`
            INSERT INTO WorkLabor (WoID, LaborID, PayReg, HrReg)
            VALUES (?, ?, ?, ?)
        `);
        
        const insertPart = db.prepare(`
            INSERT INTO WorkParts (WoID, PartID, ActQty, UnitCost)
            VALUES (?, ?, ?, ?)
        `);

        // Begin transaction
        const generate = db.transaction(() => {
            let maxIdRow = db.prepare('SELECT MAX(ID) as maxId FROM Work').get();
            let nextWorkId = (maxIdRow && maxIdRow.maxId ? maxIdRow.maxId : 100000) + 1;
            
            // Generate approx 1200 work orders over the 760 days
            const numOrders = 1200;
            const timeSpanMs = Date.now() - START_DATE.getTime();
            
            for (let i = 0; i < numOrders; i++) {
                // Random time in the past 25 months
                const woTime = new Date(START_DATE.getTime() + Math.random() * timeSpanMs);
                const addDateStr = woTime.toISOString().replace('T', ' ').substring(0, 19);
                
                // Complete date is 1-4 days later
                const completeTime = new Date(woTime.getTime() + (Math.random() * 4 * 24 * 60 * 60 * 1000));
                const compDateStr = completeTime.toISOString().replace('T', ' ').substring(0, 19);
                
                const astId = assets[Math.floor(Math.random() * assets.length)];
                
                // 70% PMs, 30% Unplanned (Breakdown/Repair)
                const isPM = Math.random() < 0.7;
                const typeID = isPM ? 'PM' : 'REPAIR';
                const priority = isPM ? 3 : (Math.random() < 0.2 ? 1 : 2); // Occasional emergency 1
                
                const descript = isPM ? `Scheduled Maintenance for ${astId}` : `Unexpected failure on ${astId}`;
                
                // Unplanned might cause downtime
                const actDown = !isPM ? parseFloat((Math.random() * 8 + 0.5).toFixed(2)) : 0;
                const laborHours = parseFloat((Math.random() * 6 + 1).toFixed(2));
                const expectDuration = laborHours + 1.0;
                
                const curWoId = nextWorkId++;
                
                insertWork.run(
                    curWoId, descript, astId, addDateStr, compDateStr, priority, actDown, typeID, expectDuration, laborHours
                );
                
                // Assign some labor
                insertLabor.run(curWoId, 'MAINT-TECH-1', 45.50, laborHours);
                
                // Assign some parts (20% probability for PMs, 80% for repairs)
                if (parts.length > 0 && Math.random() < (isPM ? 0.2 : 0.8)) {
                    const numParts = Math.floor(Math.random() * 3) + 1;
                    for (let p = 0; p < numParts; p++) {
                        const part = parts[Math.floor(Math.random() * parts.length)];
                        const qty = Math.floor(Math.random() * 4) + 1;
                        const unitCost = part.UnitCost || 15.0;
                        insertPart.run(curWoId, part.PartID, qty, unitCost);
                    }
                }
            }
            console.log(`Seeded ${numOrders} full historical work orders successfully.`);
        });
        
        generate();
        
    } catch (err) {
        console.error(`Error seeding ${plantName}:`, err);
    } finally {
        db.close();
    }
}

seedHistoricalData('g:/Trier OS/data/Plant_1.db', 'Plant_1');
seedHistoricalData('g:/Trier OS/data/Plant_2.db', 'Plant 2');
