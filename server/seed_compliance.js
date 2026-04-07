// Copyright © 2026 Trier OS. All Rights Reserved.

const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'trier_logistics.db');
const Database = require('better-sqlite3');
const db = new Database(dbPath);

console.log('Seeding compliance data into trier_logistics.db ...');

try {
    // Create tables IF NOT EXISTS
    db.exec(`
        CREATE TABLE IF NOT EXISTS compliance_frameworks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            description TEXT,
            color TEXT DEFAULT '#6366f1',
            icon TEXT DEFAULT '📋',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS compliance_checklists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            framework_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            frequency TEXT DEFAULT 'monthly',
            plant_id TEXT,
            is_template INTEGER DEFAULT 1,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (framework_id) REFERENCES compliance_frameworks(id)
        );
        CREATE TABLE IF NOT EXISTS compliance_checklist_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            checklist_id INTEGER NOT NULL,
            item_text TEXT NOT NULL,
            category TEXT,
            sort_order INTEGER DEFAULT 0,
            required INTEGER DEFAULT 1,
            FOREIGN KEY (checklist_id) REFERENCES compliance_checklists(id)
        );
        CREATE TABLE IF NOT EXISTS compliance_inspections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            checklist_id INTEGER NOT NULL,
            framework_id INTEGER NOT NULL,
            plant_id TEXT NOT NULL,
            inspector TEXT,
            status TEXT DEFAULT 'scheduled',
            scheduled_date DATE,
            completed_date DATETIME,
            score REAL,
            total_items INTEGER DEFAULT 0,
            passed_items INTEGER DEFAULT 0,
            failed_items INTEGER DEFAULT 0,
            na_items INTEGER DEFAULT 0,
            notes TEXT,
            evidence_photos TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (checklist_id) REFERENCES compliance_checklists(id),
            FOREIGN KEY (framework_id) REFERENCES compliance_frameworks(id)
        );
        CREATE TABLE IF NOT EXISTS compliance_findings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            inspection_id INTEGER NOT NULL,
            item_id INTEGER,
            item_text TEXT,
            status TEXT DEFAULT 'pass',
            notes TEXT,
            FOREIGN KEY (inspection_id) REFERENCES compliance_inspections(id)
        );
    `);

    db.exec('DELETE FROM compliance_findings');
    db.exec('DELETE FROM compliance_inspections');
    db.exec('DELETE FROM compliance_checklist_items');
    db.exec('DELETE FROM compliance_checklists');
    db.exec('DELETE FROM compliance_frameworks');

    // 1. Frameworks
    const insertFramework = db.prepare(`INSERT INTO compliance_frameworks (name, code, description, color, icon) VALUES (?, ?, ?, ?, ?)`);
    const frameworks = [
        { name: 'OSHA Safety', code: 'OSHA', description: 'Occupational Safety and Health Administration', color: '#3b82f6', icon: '🛡️' },
        { name: 'FDA Food Safety', code: 'FDA', description: 'Food and Drug Administration GMP', color: '#ec4899', icon: '🥛' },
        { name: 'EPA Environmental', code: 'EPA', description: 'Environmental Protection Agency', color: '#10b981', icon: '🌿' },
        { name: 'PSM (Ammonia)', code: 'PSM', description: 'Process Safety Management', color: '#f59e0b', icon: '⚠️' },
        { name: 'Quality System', code: 'ISO', description: 'ISO 9001 Audits', color: '#8b5cf6', icon: '📋' }
    ];

    const frameworkMap = {};
    for (const f of frameworks) {
        const res = insertFramework.run(f.name, f.code, f.description, f.color, f.icon);
        frameworkMap[f.code] = res.lastInsertRowid;
    }

    // 2. Checklists
    const insertChecklist = db.prepare(`INSERT INTO compliance_checklists (framework_id, title, description, frequency, is_template, created_by) VALUES (?, ?, ?, ?, 1, 'SystemAdmin')`);
    
    const oshaId = frameworkMap['OSHA'];
    const resOsha = insertChecklist.run(oshaId, 'Monthly Safety Walk', 'General facility safety and hazard audit', 'monthly');
    const oshaChecklistId = resOsha.lastInsertRowid;

    const fdaId = frameworkMap['FDA'];
    const resFda = insertChecklist.run(fdaId, 'Pasteurizer Verification (Daily)', 'Critical Control Point GMP tracking', 'daily');
    const fdaChecklistId = resFda.lastInsertRowid;

    const epaId = frameworkMap['EPA'];
    const resEpa = insertChecklist.run(epaId, 'Wastewater Effluent Log', 'Outfall tracking for EPA limits', 'weekly');
    const epaChecklistId = resEpa.lastInsertRowid;

    const psmId = frameworkMap['PSM'];
    const resPsm = insertChecklist.run(psmId, 'Ammonia Engine Room Sweep', 'Daily visual and sensor log for engine room', 'daily');
    const psmChecklistId = resPsm.lastInsertRowid;

    const isoId = frameworkMap['ISO'];
    const resIso = insertChecklist.run(isoId, 'Quarterly ISO Audit', 'ISO Quality documentation validation', 'quarterly');
    const isoChecklistId = resIso.lastInsertRowid;

    // 3. Checklist Items
    const insertItem = db.prepare(`INSERT INTO compliance_checklist_items (checklist_id, item_text, category, sort_order, required) VALUES (?, ?, ?, ?, 1)`);

    const oshaItems = [
        { text: 'Verify all fire extinguishers are fully charged, unblocked, and tagged within the last 30 days', cat: 'Fire & Emergency' },
        { text: 'Ensure all emergency exits and evacuation routes are clearly marked and 100% free of obstructions', cat: 'Fire & Emergency' },
        { text: 'Test emergency lighting units for 30 seconds to ensure backup battery functionality', cat: 'Fire & Emergency' },
        { text: 'Verify LOTO (Lockout/Tagout) stations are fully stocked with specific locks and standardized warning tags', cat: 'Electrical & LOTO' },
        { text: 'Confirm electrical panel covers are closed, latched, and maintain a minimum 36-inch clearance', cat: 'Electrical & LOTO' },
        { text: 'Inspect machine guards on all rotating, cutting, or moving parts to ensure they are securely fastened', cat: 'Machine Guarding' },
        { text: 'Verify eyewash stations and emergency showers are flow-tested and water runs clear for 15 minutes', cat: 'PPE & Safety' },
        { text: 'Check that appropriate PPE (hard hats, safety glasses, steel-toe boots) is being worn in designated zones', cat: 'PPE & Safety' },
        { text: 'Inspect all ladders and scaffolding for structural integrity, missing rungs, and anti-slip feet', cat: 'Fall Protection' },
        { text: 'Verify SDS (Safety Data Sheets) are accessible to all employees for all hazardous chemicals on site', cat: 'HazMat' },
        { text: 'Ensure secondary containment for chemical storage is intact and free of standing liquid', cat: 'HazMat' },
        { text: 'Walk aisles to ensure floors are clean, dry, and free of slip/trip hazards', cat: 'General Workspace' }
    ];
    oshaItems.forEach((it, i) => insertItem.run(oshaChecklistId, it.text, it.cat, i));

    const fdaItems = [
        { text: 'Verify Pasteurizer flow diversion device (FDD) is functioning correctly and sealed', cat: 'Sanitation & CCP' },
        { text: 'Validate temperature charts align with legal pasteurization standards (e.g., HTST 161°F for 15s)', cat: 'Sanitation & CCP' },
        { text: 'Inspect recording thermometer pen mechanisms and verify manual chart annotations', cat: 'Sanitation & CCP' },
        { text: 'Examine product contact surfaces (tanks, pipes) to ensure they are clean and free of bio-film build-up', cat: 'Sanitation & CCP' },
        { text: 'Verify all floor drains are flowing freely without backup and covers are sanitized', cat: 'Sanitation & CCP' },
        { text: 'Inspect overhead pipes and ceilings to ensure NO condensation is dripping near open product zones', cat: 'GMP & Environment' },
        { text: 'Confirm all personnel are wearing proper hairnets, beard nets, and smocks in the processing area', cat: 'GMP & Environment' },
        { text: 'Verify handwashing stations are fully stocked with soap, single-use towels, and warm water', cat: 'GMP & Environment' },
        { text: 'Check that pest control devices (tin cats, fly lights) are operational and correctly positioned', cat: 'Pest Control' },
        { text: 'Ensure no wooden pallets or prohibited porous materials are present in the high-care clean room', cat: 'GMP & Environment' },
        { text: 'Review ingredient lot traceability logs for the current batch to ensure full compliance', cat: 'Record Keeping' }
    ];
    fdaItems.forEach((it, i) => insertItem.run(fdaChecklistId, it.text, it.cat, i));

    const epaItems = [
        { text: 'Record daily outfall pH readings and verify they are within permitted limits (6.0 - 9.0)', cat: 'Testing & Log' },
        { text: 'Record daily effluent flow volume and verify it does not exceed the daily permitted discharge maximum', cat: 'Testing & Log' },
        { text: 'Verify continuous flow meter calibration check against the secondary manual gauge', cat: 'Equipment Verification' },
        { text: 'Perform visual inspection of the outfall for unusual foaming, discoloration, or turbidity', cat: 'Visual Inspection' },
        { text: 'Examine primary settling screens or dissolved air flotation (DAF) units for excessive sludge buildup', cat: 'Treatment Process' },
        { text: 'Verify sludge holding tanks have adequate capacity and are not at risk of overflowing', cat: 'Treatment Process' },
        { text: 'Check chemical dosing pumps for clarifier coagulant/flocculant to ensure proper flow rate', cat: 'Equipment Verification' },
        { text: 'Log temperature of the effluent discharge and verify it is under the environmental permit threshold', cat: 'Testing & Log' },
        { text: 'Take composite sample for external lab BOD/TSS testing and log the chain of custody tracking number', cat: 'Sample Collection' },
        { text: 'Ensure spill response kits near the chemical storage tanks are fully stocked and accessible', cat: 'Emergency Prep' }
    ];
    epaItems.forEach((it, i) => insertItem.run(epaChecklistId, it.text, it.cat, i));

    const psmItems = [
        { text: 'Verify all ambient ammonia sensors in the engine room read 0 ppm and indicator lights are green', cat: 'Sensor Verification' },
        { text: 'Test manual emergency shutdown (E-STOP) lights and indicator circuits on the main panel', cat: 'Safety Systems' },
        { text: 'Verify engine room exhaust ventilation fans are operational in continuous low-speed mode', cat: 'Ventilation' },
        { text: 'Inspect compressor sight glasses to ensure oil levels are within manufacturer designated zones', cat: 'Compressor Integrity' },
        { text: 'Check compressor suction and discharge pressures against standard operating parameters', cat: 'Compressor Integrity' },
        { text: 'Listen and visually inspect compressors and piping for unusual vibration or abnormal noise', cat: 'Compressor Integrity' },
        { text: 'Walk the piping network looking for visual frost anomalies indicating insulation degradation or leaks', cat: 'Piping & Valves' },
        { text: 'Verify king valves and critical manual isolation valves are securely tagged in their correct operating position', cat: 'Piping & Valves' },
        { text: 'Ensure the engine room logbook is updated and the prior shift operators have signed off', cat: 'Documentation' },
        { text: 'Check self-contained breathing apparatus (SCBA) tanks to ensure air pressure reads full and masks are sealed', cat: 'Emergency Prep' },
        { text: 'Verify emergency eye wash and chemical deluge shower inside the engine room vestibule is unobstructed', cat: 'Emergency Prep' }
    ];
    psmItems.forEach((it, i) => insertItem.run(psmChecklistId, it.text, it.cat, i));

    const isoItems = [
        { text: 'Verify the master SOP index is current and available at the production line workstations', cat: 'Document Control' },
        { text: 'Audit recent calibration logs for critical measurement devices (scales, thermometers, gauges)', cat: 'Equipment Calibration' },
        { text: 'Check operator training matrix to ensure all staff on the current shift are certified for their equipment', cat: 'Training Records' },
        { text: 'Review non-conformance reports (NCRs) from the past 30 days and verify corrective/preventive actions (CAPA)', cat: 'Quality Processes' },
        { text: 'Conduct a mock recall trace for a randomly selected raw material batch received within the last week', cat: 'Traceability' },
        { text: 'Ensure raw materials in the warehouse are properly tagged with QA release stickers and status codes', cat: 'Material Control' },
        { text: 'Verify that internal audit schedules are documented and being executed according to the annual plan', cat: 'Audit Management' },
        { text: 'Check customer complaint logs to ensure root cause analysis frameworks were utilized properly', cat: 'Customer Focus' }
    ];
    isoItems.forEach((it, i) => insertItem.run(isoChecklistId, it.text, it.cat, i));

    // 4. Generate Inspections per plant
    // Target only our remaining secure production databases.
    let plantsArr = ['Plant_1', 'Plant_2', 'Corporate_Office', 'examples'];

    const insertInspection = db.prepare(`INSERT INTO compliance_inspections (checklist_id, framework_id, plant_id, inspector, status, scheduled_date, completed_date, score, total_items, passed_items, failed_items, na_items, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertFinding = db.prepare(`INSERT INTO compliance_findings (inspection_id, item_id, item_text, status, notes) VALUES (?, ?, ?, ?, ?)`);

    const getItems = db.prepare('SELECT id, item_text FROM compliance_checklist_items WHERE checklist_id = ?');
    const inspectors = ['JDoe', 'Tech5', 'MaintManager', 'SafetyOfficer', 'QA_Lead', 'AuditorB'];
    const now = new Date();
    let inspectionsCreated = 0;

    // Start a transaction for bulk inserts
    db.exec('BEGIN TRANSACTION;');

    for (const plant of plantsArr) {
        const listConfig = [
            { cId: oshaChecklistId, fId: oshaId, type: 'monthly', baseNum: 36, items: getItems.all(oshaChecklistId) },
            { cId: fdaChecklistId, fId: fdaId, type: 'daily', baseNum: 1095, items: getItems.all(fdaChecklistId) },
            { cId: epaChecklistId, fId: epaId, type: 'weekly', baseNum: 156, items: getItems.all(epaChecklistId) },
            { cId: psmChecklistId, fId: psmId, type: 'daily', baseNum: 1095, items: getItems.all(psmChecklistId) },
            { cId: isoChecklistId, fId: isoId, type: 'quarterly', baseNum: 12, items: getItems.all(isoChecklistId) }
        ];

        for (const conf of listConfig) {
            for (let i = -1; i < conf.baseNum; i++) {
                const inspDate = new Date(now);
                if (conf.type === 'monthly') inspDate.setMonth(now.getMonth() - i);
                if (conf.type === 'weekly') inspDate.setDate(now.getDate() - (i * 7));
                if (conf.type === 'daily') inspDate.setDate(now.getDate() - i);
                if (conf.type === 'quarterly') inspDate.setMonth(now.getMonth() - (i * 3));
                
                let passed = 0; let failed = 0;
                const total = conf.items.length;
                const findings = [];
                
                conf.items.forEach(it => {
                    // Small chance to fail an item
                    const isFail = Math.random() < 0.04; 
                    findings.push({
                        item_id: it.id,
                        item_text: it.item_text,
                        status: isFail ? 'fail' : 'pass',
                        notes: isFail ? (Math.random() > 0.5 ? 'Corrective action initiated.' : 'Needs repair/cleaning.') : 'Pass'
                    });
                    if (isFail) failed++; else passed++;
                });
                
                const score = Math.round((passed / total) * 100);
                const dateStr = inspDate.toISOString().split('T')[0];
                const compStr = inspDate.toISOString();
                const inspector = inspectors[Math.floor(Math.random() * inspectors.length)];
                
                // Add an upcoming/pending inspection if i == -1 (in the future)
                let status = 'completed';
                let cDate = compStr;
                let finalScore = score;
                
                if (i <= 0) { // Current or future
                    status = 'scheduled'; 
                    cDate = null;
                    finalScore = null;
                }

                const resInsp = insertInspection.run(
                    conf.cId, conf.fId, plant, inspector, status, dateStr, cDate, finalScore, total, passed, failed, 0, (status === 'completed' ? 'Routine Inspection Logged' : 'Pending Inspection Schedule')
                );
                
                const inspId = resInsp.lastInsertRowid;
                
                // Always insert findings: either actual results if completed, or pending for scheduled inspections.
                findings.forEach(f => {
                    const statusToInsert = status === 'completed' ? f.status : 'pending';
                    const notesToInsert = status === 'completed' ? f.notes : null;
                    insertFinding.run(inspId, f.item_id, f.item_text, statusToInsert, notesToInsert);
                });
                inspectionsCreated++;
            }
        }
    }

    // Commit bulk inserts
    db.exec('COMMIT;');

    console.log(`✅ Injected ${inspectionsCreated} inspections, ${frameworks.length} frameworks and 5 complete checklists into trier_logistics.db globally.`);
    console.log('Compliance data generation complete.');
} catch (e) {
    console.error('An error occurred while seeding compliance data:', e);
} finally {
    db.close();
}
