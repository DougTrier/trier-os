const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'trier_logistics.db');
const Database = require('better-sqlite3');
const db = new Database(dbPath);

console.log('Seeding Safety Permits into trier_logistics.db (25 months) ...');

try {
    db.exec(`
        DELETE FROM SafetyPermitAuditLog;
        DELETE FROM SafetyPermitGasLog;
        DELETE FROM SafetyPermitSignatures;
        DELETE FROM SafetyPermitChecklist;
        DELETE FROM SafetyPermits WHERE PermitType != 'LOTO';
    `);

    const plantsArr = ['Demo_Plant_1', 'Greeley_CO', 'Green_Bay_WI', 'Dallas_TX', 'Amarillo_TX'];
    const pTypes = ['HOT_WORK', 'CONFINED_SPACE', 'EXCAVATION', 'ELECTRICAL', 'WORKING_AT_HEIGHTS', 'LINE_BREAKING', 'CRANE_RIGGING'];
    const workers = ['Maint_Bob', 'Tech_Sally', 'Elec_Mike', 'Operator_Dave', 'Safety_Sam'];

    const insertPermit = db.prepare(`
        INSERT INTO SafetyPermits (PermitNumber, PermitType, PlantID, Location, Description, IssuedBy, IssuedAt, ExpiresAt, Status, ClosedBy, ClosedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.exec('BEGIN TRANSACTION;');

    const now = new Date();
    let permitCount = 0;

    for (let i = 0; i < 2000; i++) {
        const plantId = plantsArr[Math.floor(Math.random() * plantsArr.length)];
        const daysAgo = Math.floor(Math.random() * 760);
        const issueDate = new Date(now.getTime() - (daysAgo * 86400000) - (Math.random() * 12 * 3600000));
        
        const type = pTypes[Math.floor(Math.random() * pTypes.length)];
        
        const durationHours = type === 'CONFINED_SPACE' ? 8 : 4;
        const expiresDate = new Date(issueDate.getTime() + (durationHours * 3600000));
        const closeDate = new Date(issueDate.getTime() + (durationHours * 0.8 * 3600000));

        let status = 'CLOSED';
        if (daysAgo === 0 && Math.random() < 0.2) status = 'ACTIVE';

        const pNum = `${type.substring(0,3)}-${plantId.substring(0,3).toUpperCase()}-${String(i).padStart(4,'0')}`;
        const issuer = workers[Math.floor(Math.random() * workers.length)];

        insertPermit.run(
            pNum, type, plantId, 
            `Area ${Math.floor(Math.random() * 10) + 1}`,
            `Routine ${type} operations`,
            issuer,
            issueDate.toISOString(),
            expiresDate.toISOString(),
            status,
            status === 'CLOSED' ? issuer : null,
            status === 'CLOSED' ? closeDate.toISOString() : null
        );
        permitCount++;
    }

    db.exec('COMMIT;');
    console.log(`✅ Seeded ${permitCount} historical safety permits spanning 25 months.`);
} catch(e) {
    if (db.inTransaction) db.exec('ROLLBACK;');
    console.error('Error seeding safety permits:', e);
} finally {
    db.close();
}
