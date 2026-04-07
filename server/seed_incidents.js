const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'trier_logistics.db');
const Database = require('better-sqlite3');
const db = new Database(dbPath);

console.log('Seeding Safety Incidents into trier_logistics.db (25 months) ...');

try {
    db.exec(`DELETE FROM safety_incident_expenses; DELETE FROM safety_incident_actions; DELETE FROM safety_incidents;`);

    const plantsArr = ['Plant_1', 'Plant_2', 'Corporate', 'examples'];
    const types = ['Near Miss', 'First Aid', 'Recordable Injury', 'Lost Time Injury', 'Property Damage', 'Environmental Release', 'Fire', 'Slip/Trip/Fall', 'Chemical Exposure'];
    const severities = ['Low', 'Medium', 'High', 'Critical'];
    const workers = ['Maint_Bob', 'Tech_Sally', 'Elec_Mike', 'Operator_Dave', 'Safety_Sam'];
    const injuryT = ['Cut/Laceration', 'Burn', 'Fracture', 'Strain/Sprain', 'Contusion/Bruise', 'Chemical Burn', 'Other', null];
    const bodyP = ['Hand', 'Finger(s)', 'Back (Lower)', 'Eye', 'Arm', 'Leg', 'Foot', 'Head', null];
    const rootC = ['Unsafe Act', 'Unsafe Condition', 'Inadequate Training', 'Equipment Failure', 'PPE Not Used', 'Housekeeping', 'Complacency'];

    const insertInc = db.prepare(`
        INSERT INTO safety_incidents (
            IncidentNumber, IncidentType, Severity, Status, Title, Description,
            IncidentDate, ReportedBy, PlantID, InjuredPerson, InjuryType, BodyPart,
            FirstAidGiven, MedicalTreatment, LostTime, LostDays, OSHARecordable,
            RootCause, CorrectiveAction, ClosedBy, ClosedDate, DirectCost
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    // 25 months ~ 760 days. Let's do 1200 incidents across 760 days for nice distribution.
    const now = new Date();
    let numIncidents = 0;
    db.exec('BEGIN TRANSACTION;');

    for (let i = 0; i < 1200; i++) {
        const pId = plantsArr[Math.floor(Math.random() * plantsArr.length)];
        const daysAgo = Math.floor(Math.random() * 760);
        const incDate = new Date(now.getTime() - (daysAgo * 86400000));
        
        const type = types[Math.floor(Math.random() * types.length)];
        // make near miss / first aid very common, severity skewed low
        let sev = 'Low';
        let isOsha = 0;
        let lostD = 0;
        
        if (type === 'Lost Time Injury') { sev = 'Critical'; isOsha = 1; lostD = 3 + Math.floor(Math.random() * 20); }
        else if (type === 'Recordable Injury') { sev = 'High'; isOsha = 1; }
        else if (type === 'First Aid') { sev = 'Medium'; }

        // Incident Number
        const incNum = `INC-${incDate.getFullYear()}-${String(i+1).padStart(4, '0')}`;
        
        const status = daysAgo > 14 ? 'Closed' : (Math.random() > 0.5 ? 'Closed' : 'Under Investigation');
        
        const inj = injuryT[Math.floor(Math.random() * injuryT.length)];
        const bdy = bodyP[Math.floor(Math.random() * bodyP.length)];

        insertInc.run(
            incNum, type, sev, status, 
            `${type} reported in ${pId}`,
            `Routine mock data generation for ${type} incident.`,
            incDate.toISOString().split('T')[0],
            workers[Math.floor(Math.random() * workers.length)],
            pId,
            (type.includes('Injury') || type === 'First Aid') ? 'Employee ' + Math.floor(Math.random()*100) : null,
            (type.includes('Injury') || type === 'First Aid') ? inj : null,
            (type.includes('Injury') || type === 'First Aid') ? bdy : null,
            type === 'First Aid' ? 1 : 0,
            isOsha,
            lostD > 0 ? 1 : 0,
            lostD,
            isOsha,
            status === 'Closed' ? rootC[Math.floor(Math.random() * rootC.length)] : null,
            status === 'Closed' ? 'Retrained employee and updated SOP.' : null,
            status === 'Closed' ? 'SystemAdmin' : null,
            status === 'Closed' ? new Date(incDate.getTime() + 86400000 * 5).toISOString() : null,
            isOsha ? 500 + Math.floor(Math.random() * 4500) : 0
        );
        numIncidents++;
    }

    db.exec('COMMIT;');
    console.log(`✅ Seeded ${numIncidents} historical safety incidents spanning 25 months.`);
} catch(e) {
    if (db.inTransaction) db.exec('ROLLBACK;');
    console.error('Error seeding safety incidents:', e);
} finally {
    db.close();
}
