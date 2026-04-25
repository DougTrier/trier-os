// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Preventative Maintenance (PM) Engine
 * =========================================================
 * Automated PM work order generator that runs on a 24-hour cron interval.
 *
 * processPlantPMs(): Scans each plant's Schedule table for overdue PMs based on
 *   frequency math (LastComp + FreqComp days). Generates [PM-AUTO] work orders
 *   automatically and updates the LastSch timestamp to prevent duplicates.
 *
 * runMaintenance(): EDR-safe database health maintenance.
 *   - ANALYZE runs daily to update the SQLite query planner statistics.
 *   - VACUUM runs only on Sundays to reclaim disk space. This is staggered
 *     with a 15-second cooldown between databases to avoid triggering
 *     ransomware-like "mass file modification" alerts in endpoint security tools.
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { logAudit } = require('./logistics_db');
const { dispatchEvent } = require('./webhook_dispatcher');

function processPlantPMs(dbPath, plantName) {
    let db;
    try {
        // NOTE: Do NOT use { readonly: true } here — this function performs INSERT/UPDATE
        // operations to generate PM work orders and update Schedule.LastSch timestamps.
        db = new Database(dbPath);
        const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Schedule'").get();
        if (!hasTable) {
            db.close();
            return 0;
        }

        // 1. Identify time-based Preventative Maintenance schedules that are due
        const dueSchedules = db.prepare(`
            SELECT ID, Description, AstID, FreqComp, LastComp, Priority, Skill, EstDown,
                   TriggerType, MeterTrigger, MeterLastTriggered
            FROM Schedule
            WHERE Active = 1 
            AND FreqComp IS NOT NULL 
            AND FreqComp > 0
            AND LastComp IS NOT NULL
            AND (TriggerType IS NULL OR TriggerType = 'time' OR TriggerType = 'both')
        `).all();

        // 2. Filter down to those actually due mathematically.
        //    CriticalityClass adjusts effective PM interval:
        //      A (Critical)    → 0.80× FreqComp (tighten by 20%)
        //      B (Standard)    → 1.00× FreqComp (unchanged)
        //      C (Low Impact)  → 1.20× FreqComp (relax by 20%)
        const today = new Date();
        const critMultiplier = { A: 0.8, B: 1.0, C: 1.2 };
        const dueNow = dueSchedules.filter(pm => {
            let multiplier = 1.0;
            try {
                if (pm.AstID) {
                    const asset = db.prepare('SELECT CriticalityClass FROM Asset WHERE ID = ?').get(pm.AstID);
                    multiplier = critMultiplier[asset?.CriticalityClass] ?? 1.0;
                }
            } catch (_) { /* column not yet migrated — use default */ }
            const adjustedDays = Math.round(pm.FreqComp * multiplier);
            const nextDue = new Date(pm.LastComp);
            nextDue.setDate(nextDue.getDate() + adjustedDays);
            return today >= nextDue;
        });

        if (dueNow.length === 0) {
            db.close();
            return 0;
        }

        let injectedCount = 0;
        const insertWO = db.prepare(`
            INSERT INTO Work (WorkOrderNumber, Description, AstID, Priority, StatusID, AddDate)
            VALUES (?, ?, ?, ?, 10, CURRENT_TIMESTAMP)
        `);

        db.transaction(() => {
            for (const pm of dueNow) {
                // Ensure we don't duplicate inject open WOs for the same PM task natively
                const existingOpen = db.prepare("SELECT 1 FROM Work WHERE Description LIKE ? AND StatusID < 40").get(`%[PM-AUTO] ${pm.Description}%`);
                if (!existingOpen) {
                    // Inject a clean narrative Work Order automatically generated
                    const woNumStr = `PM-${Date.now().toString().slice(-6)}-${pm.ID}`;
                    insertWO.run(woNumStr, `[PM-AUTO] ${pm.Description}`, pm.AstID, pm.Priority || 3);

                    // Update LastSch implicitly to today so it doesn't trigger tomorrow if they haven't completed it
                    db.prepare('UPDATE Schedule SET LastSch = CURRENT_TIMESTAMP WHERE ID = ?').run(pm.ID);
                    injectedCount++;

                    // ── Notify eligible users at this plant ──────────────────
                    try {
                        const authDb = require('./auth_db');
                        const woRow = db.prepare('SELECT last_insert_rowid() AS id').get();
                        const woId = woRow?.id;

                        const eligibleUsers = authDb.prepare(`
                            SELECT DISTINCT u.Username
                            FROM Users u
                            JOIN UserPlantRoles r ON u.UserID = r.UserID
                            WHERE r.PlantID IN (?, 'all_sites')
                            AND r.RoleLevel IN ('technician','maintenance_manager','plant_manager')
                        `).all(plantName);

                        const insertNotif = db.prepare(`
                            INSERT INTO pm_notifications (pm_id, work_order_id, plant_id, notified_user)
                            VALUES (?, ?, ?, ?)
                        `);
                        for (const u of eligibleUsers) {
                            try { insertNotif.run(pm.ID, woId, plantName, u.Username); } catch (_) {}
                        }

                        db.prepare("UPDATE Schedule SET pm_status = 'PM_NOTIFIED', last_notified_at = datetime('now') WHERE ID = ?")
                          .run(pm.ID);
                    } catch (_) { /* non-blocking — table may not exist on older DBs */ }

                    // ── Webhook: Notify PM auto-generation ──
                    try {
                        dispatchEvent('PM_DUE_TODAY', {
                            woNumber: woNumStr,
                            description: pm.Description,
                            assetId: pm.AstID || '',
                            priority: pm.Priority || 3,
                            plant: plantName
                        });
                    } catch (e) { /* non-blocking */ }
                }
            }
        })();

        db.close();
        return injectedCount;
    } catch (err) {
        if (db) db.close();
        console.error(`❌ PM Engine failed on ${plantName}:`, err.message);
        return 0;
    }
}

/**
 * processMeterPMs() — Meter-based PM trigger engine (Feature 2)
 * Scans Schedule entries where TriggerType = 'meter' or 'both',
 * compares current Asset.MeterReading against MeterLastTriggered + MeterTrigger.
 */
function processMeterPMs(dbPath, plantName) {
    let db;
    try {
        db = new Database(dbPath);
        const hasSchedule = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Schedule'").get();
        if (!hasSchedule) { db.close(); return 0; }

        // Only meter-triggered or dual-triggered schedules
        const meterSchedules = db.prepare(`
            SELECT s.ID, s.Description, s.AstID, s.Priority, s.MeterTrigger, s.MeterLastTriggered,
                   a.MeterReading, a.MeterUnit, a.MeterType
            FROM Schedule s
            LEFT JOIN Asset a ON s.AstID = a.ID
            WHERE s.Active = 1
              AND s.TriggerType IN ('meter', 'both')
              AND s.MeterTrigger IS NOT NULL
              AND s.MeterTrigger > 0
              AND a.MeterReading IS NOT NULL
        `).all();

        if (meterSchedules.length === 0) { db.close(); return 0; }

        const insertWO = db.prepare(`
            INSERT INTO Work (WorkOrderNumber, Description, AstID, Priority, StatusID, AddDate)
            VALUES (?, ?, ?, ?, 10, CURRENT_TIMESTAMP)
        `);

        let injectedCount = 0;

        db.transaction(() => {
            for (const pm of meterSchedules) {
                const currentReading = pm.MeterReading || 0;
                const lastTriggered = pm.MeterLastTriggered || 0;
                const delta = currentReading - lastTriggered;

                if (delta >= pm.MeterTrigger) {
                    // Check for duplicate open WO
                    const existingOpen = db.prepare(
                        "SELECT 1 FROM Work WHERE Description LIKE ? AND StatusID < 40"
                    ).get(`%[PM-METER] ${pm.Description}%`);

                    if (!existingOpen) {
                        const woNum = `PM-M-${Date.now().toString().slice(-6)}-${pm.ID}`;
                        const unit = pm.MeterUnit || pm.MeterType || 'units';
                        insertWO.run(
                            woNum,
                            `[PM-METER] ${pm.Description} (at ${currentReading.toLocaleString()} ${unit})`,
                            pm.AstID,
                            pm.Priority || 3
                        );

                        // Update MeterLastTriggered to current reading
                        db.prepare('UPDATE Schedule SET MeterLastTriggered = ? WHERE ID = ?')
                            .run(currentReading, pm.ID);

                        injectedCount++;

                        // Webhook notification
                        try {
                            dispatchEvent('PM_DUE_TODAY', {
                                woNumber: woNum,
                                description: `${pm.Description} (Meter: ${currentReading} ${unit})`,
                                assetId: pm.AstID || '',
                                priority: pm.Priority || 3,
                                plant: plantName,
                                triggerType: 'meter'
                            });
                        } catch (e) { /* non-blocking */ }

                        console.log(`   📏 [Meter PM] ${plantName}: ${pm.Description} triggered at ${currentReading} ${unit} (threshold: every ${pm.MeterTrigger})`);
                    }
                }
            }
        })();

        db.close();
        return injectedCount;
    } catch (err) {
        if (db) db.close();
        console.error(`❌ Meter PM Engine failed on ${plantName}:`, err.message);
        return 0;
    }
}

async function runPMCron() {
    console.log('\n⚙️ [Cron] Preventative Maintenance (PM) Engine Execution Started...');
    const dataDir = require('./resolve_data_dir');
    const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('trier_'));

    let totalInjected = 0;
    let totalMeterInjected = 0;
    for (const dbFile of dbFiles) {
        const plantName = dbFile.replace('.db', '');
        const dbFilePath = path.join(dataDir, dbFile);
        
        // Time-based PM check
        const injected = processPlantPMs(dbFilePath, plantName);
        if (injected > 0) {
            console.log(`   -> Generated ${injected} time-based PM Work Orders for ${plantName}.`);
            totalInjected += injected;
        }

        // Meter-based PM check (Feature 2)
        const meterInjected = processMeterPMs(dbFilePath, plantName);
        if (meterInjected > 0) {
            console.log(`   -> Generated ${meterInjected} meter-based PM Work Orders for ${plantName}.`);
            totalMeterInjected += meterInjected;
        }
    }

    const totalAll = totalInjected + totalMeterInjected;
    console.log(`✅ [Cron] PM Engine Complete. ${totalAll > 0 ? `${totalInjected} time-based + ${totalMeterInjected} meter-based = ${totalAll} WOs injected.` : 'No PMs due today.'}\n`);

    // 2. Perform Database Health Maintenance
    await runMaintenance();
}

/**
 * Weekly Maintenance Strategy
 * Reclaim space and update query optimizer statistics across 40+ databases
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runMaintenance() {
    console.log('🧹 [Maintenance] EDR-Safe Maintenance Starting (Staggered I/O Mode)...');
    const dataDir = require('./resolve_data_dir');
    const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db') && !f.includes('trier_'));

    const isSunday = new Date().getDay() === 0;

    for (const dbFile of dbFiles) {
        let db;
        const plantId = dbFile.replace('.db', '');
        try {
            // Only maintenance if file is healthy (> 1MB)
            if (fs.statSync(path.join(dataDir, dbFile)).size < 1000000) {
                continue;
            }

            db = new Database(path.join(dataDir, dbFile));

            // Flush WAL (Write-Ahead Log) to prevent unbounded growth
            db.pragma('wal_checkpoint(PASSIVE)');

            // ANALYZE updates query planner statistics
            db.exec('ANALYZE');

            // ⚠️ VACUUM reclaims space (Mass Writing) 
            // We stagger this heavily to avoid triggering Ransomware behavior alerts in EDRs
            if (isSunday) {
                console.log(`   -> [EDR-Safe] Maintenance: VACUUMing ${dbFile}...`);
                db.exec('VACUUM');
                logAudit('SYSTEM', 'DB_MAINTENANCE_VACUUM', plantId, { status: 'SUCCESS' });
            } else {
                console.log(`   -> [EDR-Safe] Maintenance: ANALYZE complete for ${dbFile}.`);
                logAudit('SYSTEM', 'DB_MAINTENANCE_ANALYZE', plantId, { status: 'SUCCESS' });
            }

            db.close();
            
            // Cool down period between files to keep EDR "mass modification" scores low
            await sleep(15000); 

        } catch (err) {
            if (db) db.close();
            console.error(`❌ Maintenance failed on ${dbFile}:`, err.message);
        }
    }
    console.log('✅ [Maintenance] Enterprise maintenance cycle complete.\n');
}

// Optionally export for testing, but typically just run on an interval
module.exports = { runPMCron, runMaintenance };
