const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

console.log('Seeding 3 years (1095 days) for [examples.db] and trier_logistics.db ...');

const pDb = new Database(path.join(__dirname, '..', 'data', 'examples.db'));
const cDb = new Database(path.join(__dirname, '..', 'data', 'trier_logistics.db'));

try {
    pDb.exec('BEGIN TRANSACTION;');
    cDb.exec('BEGIN TRANSACTION;');

    // 1. Auxiliary local tables
    const insTime = pDb.prepare('INSERT INTO TimeCard (WoID, UserID, HrReg, WorkDate) VALUES (?,?,?,?)');
    const insLoss = pDb.prepare('INSERT INTO ProductLoss (LogDate, Shift, Area, ProductType, LossType, Quantity, UnitValue, TotalValue) VALUES (?,?,?,?,?,?,?,?)');
    const insLabs = pDb.prepare('INSERT INTO LabResult (SampleDate, SampleID, SampleType, SourceTank, OverallPass) VALUES (?,?,?,?,?)');
    
    for(let i=0; i<300; i++) {
        let daysAgo = Math.floor(Math.random() * 1095);
        let dt = new Date(Date.now() - daysAgo*86400000).toISOString();
        
        insTime.run(100+i, 'Example_Tech', 2 + Math.random()*6, dt);
        insLoss.run(dt, 'Day', 'Package Line', 'Product A', 'Waste', 10 + Math.random()*50, 1.50, 15 + Math.random()*75);
        insLabs.run(dt, 'SPL-EX-'+i, 'Inline', 'Tank 1', Math.random() > 0.05 ? 1 : 0);
    }

    // 2. Logistics globals (LOTO, Permits, Compliance, Incidents)
    const insLoto = cDb.prepare('INSERT INTO LotoPermits (PermitNumber, PlantID, AssetID, AssetDescription, Description, IssuedBy, IssuedAt, PermitType, Status, ExpiresAt) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const insInc = cDb.prepare('INSERT INTO safety_incidents (IncidentNumber, Title, PlantID, Location, ReportedBy, IncidentDate, Description, Severity, Status) VALUES (?,?,?,?,?,?,?,?,?)');
    const insPerm = cDb.prepare('INSERT INTO SafetyPermits (PermitNumber, PermitType, PlantID, Location, Description, IssuedBy, IssuedAt, ExpiresAt, Status) VALUES (?,?,?,?,?,?,?,?,?)');
    const insCal = cDb.prepare('INSERT INTO calibration_instruments (InstrumentID, Description, PlantID, InstrumentType, CalibrationInterval, Unit, LastCalibrationDate, NextCalibrationDue) VALUES (?,?,?,?,?,?,?,?)');

    const types = ['HOT_WORK', 'CONFINED_SPACE', 'EXCAVATION'];

    for(let i=0; i<300; i++) {
        let daysAgo = Math.floor(Math.random() * 1095);
        let dt = new Date(Date.now() - daysAgo*86400000).toISOString();

        // LOTO
        insLoto.run(`LOTO-EX-${i}`, 'examples', 'Asset_X', 'Demo Pump', 'Routine maintenance', 'Safety_Lead', dt, 'LOTO', 'CLOSED', dt);
        
        // Incident
        if(i < 50) insInc.run(`INC-EX-${i}`, 'Forklift Struck Rack', 'examples', 'Floor 1', 'Operator', dt, 'Simulated incident', 'Low', 'Closed');

        // Permit
        insPerm.run(`EX-${i}`, types[Math.floor(Math.random()*types.length)], 'examples', 'Zone B', 'Maintenance', 'Issuer', dt, dt, 'CLOSED');
    }
    
    // 30 examples for calibration
    for(let i=0; i<30; i++) {
        let daysAgo = Math.floor(Math.random() * 1095);
        let dt = new Date(Date.now() - daysAgo*86400000).toISOString();
        let due = new Date(Date.now() - (daysAgo - 90)*86400000).toISOString();
        insCal.run(`CAL-EX-${i}`, 'Thermometer', 'examples', 'Thermometer', 90, 'C', dt, due);
    }

    pDb.exec('COMMIT;');
    cDb.exec('COMMIT;');
    console.log('✅ Success: [examples.db] fully hydrated with 36 months (1,095 days) of independent records.');
} catch(e) {
    console.error('Error generating example DB:', e);
} finally {
    pDb.close();
    cDb.close();
}
