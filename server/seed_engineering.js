const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'trier_logistics.db');
const Database = require('better-sqlite3');

function seedEngineeringData() {
    console.log('Seeding Engineering Tools into trier_logistics.db (25 months) ...');
    let db;
    try {
        db = new Database(dbPath);
        
        // Clean out existing seeded data
        db.exec(`
            DELETE FROM rca_fishbone;
            DELETE FROM rca_why_steps;
            DELETE FROM rca_investigations;
            
            DELETE FROM fmea_modes;
            DELETE FROM fmea_worksheets;
            
            DELETE FROM ecn_approvals;
            DELETE FROM engineering_changes;
            
            DELETE FROM project_milestones;
            DELETE FROM capital_projects;
            
            DELETE FROM repair_replace_analyses;
            
            DELETE FROM lube_records;
            DELETE FROM lube_points;
            DELETE FROM lube_routes;
            
            DELETE FROM oil_analysis_results;
            DELETE FROM oil_analysis_samples;
        `);

        const plantsArr = ['Plant_1', 'Plant_2', 'Corporate', 'examples'];
        const workers = ['Maint_Bob', 'Tech_Sally', 'Elec_Mike', 'Operator_Dave', 'Reliability_Jane'];
        const rootCauses = ['Unsafe Act', 'Unsafe Condition', 'Inadequate Training', 'Equipment Failure', 'Fatigue', 'Material Defect'];
        const now = new Date();
        
        db.exec('BEGIN TRANSACTION;');

        // 1. RCA
        const insertRCA = db.prepare(`
            INSERT INTO rca_investigations (Title, IncidentDate, AssetID, PlantID, Investigator, Status, Summary, RootCause, CorrectiveAction, CreatedAt) 
            VALUES (?,?,?,?,?,?,?,?,?,?)
        `);
        const insertWhy = db.prepare(`INSERT INTO rca_why_steps (RCAID, StepNumber, Question, Answer) VALUES (?,?,?,?)`);
        
        for (let i = 0; i < 600; i++) {
            const pId = plantsArr[Math.floor(Math.random() * plantsArr.length)];
            const daysAgo = Math.floor(Math.random() * 760);
            const incDate = new Date(now.getTime() - (daysAgo * 86400000));
            const incDateStr = incDate.toISOString().split('T')[0];
            const isClosed = daysAgo > 30;

            const r = insertRCA.run(
                `RCA for Equipment Failure #${1000 + i}`,
                incDateStr,
                `AST-${Math.floor(Math.random() * 500) + 100}`,
                pId,
                workers[Math.floor(Math.random() * workers.length)],
                isClosed ? 'Closed' : 'In Progress',
                'Unplanned downtime event triggered RCA protocol.',
                isClosed ? rootCauses[Math.floor(Math.random() * rootCauses.length)] : null,
                isClosed ? 'Updated preventive maintenance schedule and retrained operators.' : null,
                incDateStr
            );

            for (let w = 1; w <= 5; w++) {
                insertWhy.run(r.lastInsertRowid, w, `Why #${w} did this occur?`, `Investigative answer #${w}`);
            }
        }

        // 2. FMEA
        const insertFMEA = db.prepare(`
            INSERT INTO fmea_worksheets (Title, AssetID, SystemComponent, PlantID, CreatedBy, Status, CreatedAt) 
            VALUES (?,?,?,?,?,?,?)
        `);
        const insertMode = db.prepare(`
            INSERT INTO fmea_modes (WorksheetID, FailureMode, FailureEffect, FailureCause, Severity, Occurrence, Detection, RPN, RecommendedAction, ActionOwner)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        `);

        for (let i = 0; i < 300; i++) {
            const pId = plantsArr[Math.floor(Math.random() * plantsArr.length)];
            const daysAgo = Math.floor(Math.random() * 760);
            const incDate = new Date(now.getTime() - (daysAgo * 86400000)).toISOString().split('T')[0];
            
            const r = insertFMEA.run(
                `FMEA Study: System ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`,
                `AST-${Math.floor(Math.random() * 500) + 100}`,
                `Component Group ${i}`,
                pId,
                workers[Math.floor(Math.random() * workers.length)],
                'Active',
                incDate
            );

            const numModes = Math.floor(Math.random() * 5) + 2;
            for (let m = 0; m < numModes; m++) {
                const s = Math.floor(Math.random() * 10) + 1;
                const o = Math.floor(Math.random() * 10) + 1;
                const d = Math.floor(Math.random() * 10) + 1;
                insertMode.run(
                    r.lastInsertRowid,
                    `Mode ${m+1} Degradation`,
                    'Complete system halt',
                    'Wear and tear',
                    s, o, d, s * o * d,
                    'Increase inspection frequency',
                    workers[Math.floor(Math.random() * workers.length)]
                );
            }
        }

        // 3. ECN
        const insertECN = db.prepare(`
            INSERT INTO engineering_changes (ECNNumber, Title, Description, AssetID, ChangeType, Status, RequestedBy, PlantID, CreatedAt)
            VALUES (?,?,?,?,?,?,?,?,?)
        `);
        const ecnTypes = ['Design', 'Process', 'Safety', 'Material'];
        
        for (let i = 0; i < 400; i++) {
            const pId = plantsArr[Math.floor(Math.random() * plantsArr.length)];
            const daysAgo = Math.floor(Math.random() * 760);
            const incDateObj = new Date(now.getTime() - (daysAgo * 86400000));
            const yearStr = incDateObj.getFullYear();
            const incDateStr = incDateObj.toISOString().split('T')[0];
            const isClosed = daysAgo > 45;
            
            insertECN.run(
                `ECN-${yearStr}-${String(i+1).padStart(4, '0')}`,
                `Retrofit upgrade for throughput`,
                `Improves overall cycle time by reducing bottleneck.`,
                `AST-${Math.floor(Math.random() * 500) + 100}`,
                ecnTypes[Math.floor(Math.random() * ecnTypes.length)],
                isClosed ? 'Implemented' : 'Approved',
                workers[Math.floor(Math.random() * workers.length)],
                pId,
                incDateStr
            );
        }

        // 4. Projects
        const insertProj = db.prepare(`
            INSERT INTO capital_projects (ProjectNumber, Title, Description, PlantID, Category, Budget, ActualSpend, StartDate, TargetEndDate, Status, ProjectManager, CreatedAt)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        `);
        for (let i = 0; i < 150; i++) {
            const pId = plantsArr[Math.floor(Math.random() * plantsArr.length)];
            const daysAgo = Math.floor(Math.random() * 760);
            const incDateObj = new Date(now.getTime() - (daysAgo * 86400000));
            const yearStr = incDateObj.getFullYear();
            const incDateStr = incDateObj.toISOString().split('T')[0];
            const isClosed = daysAgo > 180;
            const budget = Math.floor(Math.random() * 500000) + 10000;
            const spend = Math.floor(budget * (Math.random() * 1.1));

            insertProj.run(
                `CP-${yearStr}-${String(i+1).padStart(3, '0')}`,
                `Capital Upgrade Project ${i+1}`,
                `Major structural and technical upgrades.`,
                pId,
                'New Equipment',
                budget,
                spend,
                incDateStr,
                new Date(incDateObj.getTime() + (90 * 86400000)).toISOString().split('T')[0],
                isClosed ? 'Complete' : 'In Progress',
                workers[Math.floor(Math.random() * workers.length)],
                incDateStr
            );
        }

        // 5. Repair Replace
        const insertRR = db.prepare(`
            INSERT INTO repair_replace_analyses (AssetID, Title, CurrentAge, UsefulLife, ReplacementCost, AnnualRepairCost, BreakEvenYear, Recommendation, AnalyzedBy, PlantID, CreatedAt)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        `);
        for (let i = 0; i < 200; i++) {
            const pId = plantsArr[Math.floor(Math.random() * plantsArr.length)];
            const daysAgo = Math.floor(Math.random() * 760);
            const incDateStr = new Date(now.getTime() - (daysAgo * 86400000)).toISOString().split('T')[0];
            
            const life = Math.floor(Math.random() * 20) + 10;
            const age = Math.floor(Math.random() * life);
            const rCost = Math.floor(Math.random() * 150000) + 5000;
            const aRepair = Math.floor(Math.random() * 20000) + 1000;
            
            insertRR.run(
                `AST-${Math.floor(Math.random() * 500) + 100}`,
                `Analysis for AST-${i}`,
                age, life, rCost, aRepair,
                Math.floor(Math.random() * 10) + 1,
                Math.random() > 0.5 ? 'REPAIR' : 'REPLACE',
                workers[Math.floor(Math.random() * workers.length)],
                pId,
                incDateStr
            );
        }

        // 6. Lube Routes
        const insertRoute = db.prepare(`
            INSERT INTO lube_routes (RouteName, Description, PlantID, Frequency, NextDue, AssignedTo, CreatedAt)
            VALUES (?,?,?,?,?,?,?)
        `);
        const freqs = ['Daily', 'Weekly', 'Bi-Weekly', 'Monthly'];
        for (let i = 0; i < 50; i++) {
            const pId = plantsArr[Math.floor(Math.random() * plantsArr.length)];
            const daysAgo = Math.floor(Math.random() * 760);
            const incDateStr = new Date(now.getTime() - (daysAgo * 86400000)).toISOString().split('T')[0];
            
            insertRoute.run(
                `Lube Route ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${i}`,
                `Complete path for zone ${i}`,
                pId,
                freqs[Math.floor(Math.random() * freqs.length)],
                new Date(now.getTime() + (7 * 86400000)).toISOString().split('T')[0],
                workers[Math.floor(Math.random() * workers.length)],
                incDateStr
            );
        }

        // 7. Oil Analysis
        const insertOil = db.prepare(`
            INSERT INTO oil_analysis_samples (AssetID, SampleDate, SamplePoint, OilType, LabName, SampledBy, PlantID, OverallStatus, CreatedAt)
            VALUES (?,?,?,?,?,?,?,?,?)
        `);
        for (let i = 0; i < 800; i++) {
            const pId = plantsArr[Math.floor(Math.random() * plantsArr.length)];
            const daysAgo = Math.floor(Math.random() * 760);
            const incDateStr = new Date(now.getTime() - (daysAgo * 86400000)).toISOString().split('T')[0];
            
            insertOil.run(
                `AST-${Math.floor(Math.random() * 500) + 100}`,
                incDateStr,
                `Gearbox Bottom Port`,
                `ISO 220`,
                `MobilServ`,
                workers[Math.floor(Math.random() * workers.length)],
                pId,
                Math.random() > 0.1 ? 'Normal' : 'Warning',
                incDateStr
            );
        }

        db.exec('COMMIT;');
        console.log(`✅ ALL Engineering tables successfully seeded with 25 months of history.`);

    } catch (e) {
        if (db && db.inTransaction) db.exec('ROLLBACK;');
        console.error('Error seeding engineering data:', e);
    } finally {
        if (db) db.close();
    }
}

seedEngineeringData();
