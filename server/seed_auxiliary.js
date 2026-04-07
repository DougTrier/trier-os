const Database = require('better-sqlite3');
const fs = require('fs');

const dbs = ['g:/Trier OS/data/Plant_1.db', 'g:/Trier OS/data/Plant_2.db'];

for (let dbPath of dbs) {
    if (!fs.existsSync(dbPath)) continue;
    const db = new Database(dbPath);
    console.log('Processing: ' + dbPath);
    db.exec('BEGIN TRANSACTION;');

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    
    // Core empty functional tables
    const targetTables = [
        'TimeCard', 'Schedule', 'FailureCodes',
        'MeterReadings', 'WarrantyClaims', 'UtilityThresholds', 'UtilityAnomalies', 'ProductLoss', 'LabResult'
    ];

    for (let t of tables) {
        if (!targetTables.includes(t.name)) continue;
        
        let count = db.prepare('SELECT COUNT(*) as c FROM ' + t.name).get().c;
        if (count > 0) continue; // Skip already seeded
        
        console.log('Seeding table: ' + t.name);
        try {
            if (t.name === 'UtilityAnomalies') {
                const ins = db.prepare('INSERT INTO UtilityAnomalies (Type, AnomalyType, Severity, MeterReading, ThresholdValue, PercentageOver, Message, DetectedAt) VALUES (?,?,?,?,?,?,?,?)');
                for(let i=0; i<100; i++) {
                     let daysAgo = Math.floor(Math.random() * 760);
                     let dt = new Date(Date.now() - daysAgo*86400000).toISOString();
                     ins.run('Electricity', 'Spike', 'Medium', 1500 + Math.random()*500, 1500, 10 + Math.random()*15, 'Unusual spike in power', dt);
                }
            }
            if (t.name === 'FailureCodes') {
                const wos = db.prepare('SELECT ID FROM Work LIMIT 200').all();
                const ins = db.prepare('INSERT INTO FailureCodes (woId, failureCode, failureDesc, severity, createdAt) VALUES (?,?,?,?,?)');
                for(let wo of wos) {
                    let daysAgo = Math.floor(Math.random() * 760);
                    let dt = new Date(Date.now() - daysAgo*86400000).toISOString();
                    ins.run(wo.ID, 'F' + (Math.floor(Math.random()*90)+10), 'General Component Failure', 'High', dt);
                }
            }
            if (t.name === 'TimeCard') {
                const wos = db.prepare('SELECT ID FROM Work LIMIT 200').all();
                const ins = db.prepare('INSERT INTO TimeCard (WoID, UserID, HrReg, WorkDate) VALUES (?,?,?,?)');
                for(let wo of wos) {
                    let daysAgo = Math.floor(Math.random() * 760);
                    let dt = new Date(Date.now() - daysAgo*86400000).toISOString();
                    ins.run(wo.ID, 'Maint_Bob', 2 + Math.random()*4, dt);
                }
            }
            if (t.name === 'MeterReadings') {
                const asts = db.prepare('SELECT ID FROM Asset LIMIT 20').all();
                const ins = db.prepare('INSERT INTO MeterReadings (assetId, reading, source, recordedBy, recordedAt) VALUES (?,?,?,?,?)');
                for(let ast of asts) {
                    for(let i=0; i<50; i++) {
                        let daysAgo = Math.floor(Math.random() * 760);
                        let dt = new Date(Date.now() - daysAgo*86400000).toISOString();
                        ins.run(ast.ID, 1000 + (Math.random()*5000), 'Manual', 'System', dt);
                    }
                }
            }
            if (t.name === 'ProductLoss') {
                const ins = db.prepare('INSERT INTO ProductLoss (LogDate, Shift, Area, ProductType, LossType, Quantity, Unit, UnitValue, TotalValue) VALUES (?,?,?,?,?,?,?,?,?)');
                for(let i=0; i<100; i++) {
                     let daysAgo = Math.floor(Math.random() * 760);
                     let dt = new Date(Date.now() - daysAgo*86400000).toISOString();
                     ins.run(dt, 'Day', 'Line 1', 'Milk', 'Spill', 50 + Math.random()*200, 'Gallons', 2.50, (50 + Math.random()*200)*2.50);
                }
            }
            if (t.name === 'LabResult') {
                const ins = db.prepare('INSERT INTO LabResult (SampleDate, SampleID, SampleType, SourceTank, OverallPass) VALUES (?,?,?,?,?)');
                for(let i=0; i<100; i++) {
                     let daysAgo = Math.floor(Math.random() * 760);
                     let dt = new Date(Date.now() - daysAgo*86400000).toISOString();
                     ins.run(dt, 'SPL-' + i, 'Finished Product', 'Silo 2', Math.random() > 0.05 ? 1 : 0);
                }
            }
            if (t.name === 'WarrantyClaims') {
                const asts = db.prepare('SELECT ID, Description FROM Asset LIMIT 10').all();
                const ins = db.prepare('INSERT INTO WarrantyClaims (AssetID, AssetDescription, ClaimDate, ClaimAmount, Status) VALUES (?,?,?,?,?)');
                for(let ast of asts) {
                    let daysAgo = Math.floor(Math.random() * 760);
                    let dt = new Date(Date.now() - daysAgo*86400000).toISOString();
                    ins.run(ast.ID, ast.Description, dt, 500 + Math.random()*2000, 'Approved');
                }
            }
            if (t.name === 'Schedule') {
                const asts = db.prepare('SELECT ID FROM Asset LIMIT 20').all();
                const ins = db.prepare('INSERT INTO Schedule (Descript, AstID, TypeID, Freq, FreqUnit, NextDate) VALUES (?,?,?,?,?,?)');
                for(let ast of asts) {
                    let daysAgo = Math.floor(Math.random() * 760);
                    let dt = new Date(Date.now() - daysAgo*86400000).toISOString();
                    ins.run('Weekly Inspection', ast.ID, 1, 7, 'Days', dt);
                }
            }
        } catch(e) { console.log('Err on ' + t.name + ':', e.message); }
    }
    
    db.exec('COMMIT;');
    db.close();
    console.log('Done with ' + dbPath);
}
