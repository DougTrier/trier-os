const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'trier_logistics.db');
const Database = require('better-sqlite3');
const db = new Database(dbPath);

console.log('Seeding Calibration data into trier_logistics.db (25 months) ...');

try {
    db.exec(`DELETE FROM calibration_records; DELETE FROM calibration_instruments;`);

    const plantsArr = ['Plant_1', 'Plant_2', 'Corporate', 'examples'];
    const types = ['Gauge', 'Thermometer', 'Pressure Transmitter', 'Flow Meter', 'Scale/Balance', 'pH Meter', 'Torque Wrench', 'Multimeter'];
    const mfg = ['Fluke', 'Endress+Hauser', 'Rosemount', 'Mettler Toledo', 'Ashcroft', 'WIKA'];
    
    const insertInst = db.prepare(`
        INSERT INTO calibration_instruments (InstrumentID, Description, InstrumentType, Manufacturer, Location, PlantID, CalibrationInterval, Unit, Status, LastCalibrationDate, NextCalibrationDue)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertRecord = db.prepare(`
        INSERT INTO calibration_records (InstrumentDBID, CalibrationDate, DueDate, Result, AsFoundReading, AsLeftReading, Temperature, Humidity, PerformedBy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.exec('BEGIN TRANSACTION;');

    let instCount = 0;
    let recCount = 0;

    let globalInstIndex = 0;
    for (let pId of plantsArr) {
        // approx 100 instruments per plant
        for (let i = 0; i < 100; i++) {
            globalInstIndex++;
            const instId = `CAL-${String(globalInstIndex).padStart(5, '0')}`;
            const type = types[Math.floor(Math.random() * types.length)];
            const interv = [90, 180, 365][Math.floor(Math.random() * 3)];
            
            // Backdate to generate history
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 760); // 25 months ago
            
            // Loop through intervals up to near current date
            let currentDate = new Date(startDate);
            let lastCalDate, nextDue;
            let status = 'Active';

            const resInst = insertInst.run(
                instId,
                `${type} - Line ${Math.floor(Math.random() * 10) + 1}`,
                type,
                mfg[Math.floor(Math.random() * mfg.length)],
                `Process Area ${Math.floor(Math.random() * 5) + 1}`,
                pId,
                interv,
                type.includes('Pressure') ? 'PSI' : (type.includes('Therm') ? 'C' : 'N/A'),
                'Active', // update later
                null, 
                null
            );
            const dbId = resInst.lastInsertRowid;
            instCount++;

            while(currentDate < new Date()) {
                const calDate = new Date(currentDate);
                const isFail = Math.random() < 0.05;
                const rStr = isFail ? 'Fail' : (Math.random() < 0.2 ? 'Adjusted' : 'Pass');
                
                nextDue = new Date(calDate.getTime() + (interv * 86400000));
                
                insertRecord.run(
                    dbId,
                    calDate.toISOString().split('T')[0],
                    nextDue.toISOString().split('T')[0],
                    rStr,
                    (Math.random() * 100).toFixed(2),
                    rStr === 'Fail' ? (Math.random() * 100).toFixed(2) : (Math.random() * 5).toFixed(2),
                    22.5 + Math.random() * 5,
                    45 + Math.random() * 15,
                    'Tech_' + Math.floor(Math.random() * 10)
                );
                recCount++;
                
                lastCalDate = calDate;
                if (rStr === 'Fail' && calDate > new Date(Date.now() - interv * 86400000)) {
                    status = 'Out of Tolerance';
                }
                
                currentDate = nextDue;
            }

            db.prepare('UPDATE calibration_instruments SET LastCalibrationDate = ?, NextCalibrationDue = ?, Status = ? WHERE ID = ?')
              .run(lastCalDate.toISOString().split('T')[0], nextDue.toISOString().split('T')[0], status, dbId);
        }
    }

    db.exec('COMMIT;');
    console.log(`✅ Seeded ${instCount} instruments and ${recCount} historical calibration records spanning 25 months.`);
} catch(e) {
    if (db.inTransaction) db.exec('ROLLBACK;');
    console.error('Error seeding calibration:', e);
} finally {
    db.close();
}
