// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Cost Ledger Utility
 * ==================================================
 * Calculates and tracks maintenance costs per work order, asset,
 * and department. Aggregates labor, parts, and miscellaneous costs
 * for MTD/YTD reporting and budget forecasting.
 */
/**
 * Cost Ledger Utility
 * Handles transactional recording of work order costs
 */
const db = require('../database');

/**
 * Closes a work order and records all associated costs in a single transaction
 * @param {string} woId - The Work Order ID
 * @param {Object} costs - Object containing labor, parts, and misc arrays
 * @param {string} [plantId] - Optional explicit plant ID (required when called from 'all_sites' context)
 * @returns {Object} - Success status
 */
function closeWorkOrderWithCosts(woId, costs, plantId = null) {
    const { labor = [], parts = [], misc = [] } = costs;
    
    console.log(`[CostLedger] Closing WO ${woId} with ${labor.length} labor, ${parts.length} parts, ${misc.length} misc (plant: ${plantId || 'context'})`);
    
    let sqlite;
    try {
        // Use explicit plantId if provided, otherwise fall back to AsyncLocalStorage context.
        // This is critical when the request comes from 'all_sites' which opens a read-only handle.
        sqlite = db.getDb(plantId || undefined);
    } catch (e) {
        console.error('[CostLedger] FATAL: Failed to get database handle:', e.message);
        throw e;
    }

    // Verify the Work table has the necessary structure
    try {
        const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('WorkLabor','WorkParts','WorkMisc','Work','Part')").all();
        const tableNames = tables.map(t => t.name);
        console.log(`[CostLedger] Available tables: ${tableNames.join(', ')}`);
        
        if (!tableNames.includes('WorkLabor')) {
            console.warn('[CostLedger] WorkLabor table missing – creating...');
            sqlite.prepare(`CREATE TABLE IF NOT EXISTS WorkLabor (
                WoID INTEGER, cc TEXT, CraftID TEXT, LaborID TEXT, WorkDate TEXT,
                EstHour REAL, HrReg REAL, HrOver REAL, HrDouble REAL, HrOther REAL,
                PayReg TEXT, PayOver TEXT, PayDouble TEXT, PayOther TEXT,
                CostID TEXT, Comment TEXT, RemHour REAL, Schdate TEXT, POID INTEGER, AssignTo INTEGER
            )`).run();
        }
        if (!tableNames.includes('WorkParts')) {
            console.warn('[CostLedger] WorkParts table missing – creating...');
            sqlite.prepare(`CREATE TABLE IF NOT EXISTS WorkParts (
                WoID INTEGER, cc TEXT, PartID TEXT, UseDate TEXT, Location TEXT,
                EstQty REAL, ActQty REAL, UnitCost TEXT, CostID TEXT, PoID INTEGER, Comment TEXT
            )`).run();
        }
        if (!tableNames.includes('WorkMisc')) {
            console.warn('[CostLedger] WorkMisc table missing – creating...');
            sqlite.prepare(`CREATE TABLE IF NOT EXISTS WorkMisc (
                WoID INTEGER, cc TEXT, Description TEXT, WorkDate TEXT,
                EstCost REAL, ActCost REAL, CostID TEXT, POID INTEGER, Comment TEXT
            )`).run();
        }
    } catch (e) {
        console.error('[CostLedger] Table check failed:', e.message);
    }

    // Prepare statements
    const insertLabor = sqlite.prepare(`
        INSERT INTO "WorkLabor" (WoID, LaborID, WorkDate, HrReg, HrOver, HrDouble, HrOther, PayReg, PayOver, PayDouble, PayOther, Comment)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPart = sqlite.prepare(`
        INSERT INTO "WorkParts" (WoID, PartID, UseDate, ActQty, UnitCost, Comment)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Audit 47 / H-3: Atomic stock decrement with a negative-stock guard.
    // The WHERE clause's `COALESCE("Stock",0) >= ?` precondition makes the UPDATE
    // a no-op (changes=0) when stock is insufficient. Combined with IMMEDIATE
    // transaction mode (see bottom of this function), two concurrent WO closes
    // on the same part cannot both succeed when only one unit is available.
    const updateStock = sqlite.prepare(`
        UPDATE "Part"
        SET "Stock" = COALESCE("Stock", 0) - ?
        WHERE "ID" = ? AND COALESCE("Stock", 0) >= ?
    `);

    const insertMisc = sqlite.prepare(`
        INSERT INTO "WorkMisc" (WoID, Description, WorkDate, ActCost, Comment)
        VALUES (?, ?, ?, ?, ?)
    `);

    // Use a completion status that aligns with the WorkStatuses lookup table.
    // The official PMC convention:  0=Request, 30=Started, 40=Completed, 50=Canceled
    const COMPLETED_STATUS = 40;

    const updateWOStatus = sqlite.prepare(`
        UPDATE "Work" SET "StatusID" = ${COMPLETED_STATUS}, "CompDate" = CURRENT_TIMESTAMP WHERE "ID" = ?
    `);

    // Define the transaction
    const transaction = sqlite.transaction((woId, labor, parts, misc) => {
        let totalActualHours = 0;

        // 1. Record Labor
        for (const l of labor) {
            try {
                const reg = Number(l.HrReg || 0);
                const over = Number(l.HrOver || 0);
                const doublet = Number(l.HrDouble || 0);
                const other = Number(l.HrOther || 0);
                totalActualHours += (reg + over + doublet + other);

                insertLabor.run(
                    woId, 
                    l.LaborID, 
                    l.WorkDate || new Date().toISOString(), 
                    reg, 
                    over, 
                    doublet,
                    other,
                    Number(l.PayReg || 0), 
                    Number(l.PayOver || 0), 
                    Number(l.PayDouble || 0),
                    Number(l.PayOther || 0),
                    l.Comment || ''
                );
            } catch (e) {
                console.error(`[CostLedger] Failed to insert labor for ${l.LaborID}:`, e.message);
                throw e;
            }
        }

        // 2. Record Parts & Update Inventory
        for (const p of parts) {
            try {
                insertPart.run(
                    woId, 
                    p.PartID, 
                    p.UseDate || new Date().toISOString(), 
                    Number(p.ActQty || 0), 
                    Number(p.UnitCost || 0), 
                    p.Comment || ''
                );
            } catch (e) {
                console.error(`[CostLedger] Failed to insert part ${p.PartID}:`, e.message);
                throw e;
            }
            
            // Decrement Stock. Audit 47 / H-3: if the guarded UPDATE makes no
            // changes, disambiguate between "part not in inventory catalog"
            // (legacy graceful skip) and "insufficient stock" (must abort the
            // WO close so we don't record consumption that can't be honored).
            try {
                const qty = Number(p.ActQty || 0);
                if (qty > 0) {
                    const stockResult = updateStock.run(qty, p.PartID, qty);
                    if (stockResult.changes === 0) {
                        const partRow = sqlite.prepare('SELECT "Stock" FROM "Part" WHERE "ID" = ?').get(p.PartID);
                        if (partRow) {
                            // Part exists but not enough stock → abort the transaction.
                            throw new Error(`Insufficient stock for part ${p.PartID} (requested ${qty}, available ${Number(partRow.Stock || 0)})`);
                        }
                        // Part not in Part table — silent skip preserves legacy behavior.
                    }
                }
            } catch (e) {
                // Escalate the intentional insufficient-stock throw; swallow schema-shape
                // errors (missing Part table/column in legacy plant schemas) as before.
                if (/^Insufficient stock/.test(e.message)) throw e;
                console.warn(`[CostLedger] Stock update skipped for ${p.PartID}:`, e.message);
            }
        }

        // 3. Record Misc Costs
        for (const m of misc) {
            try {
                insertMisc.run(
                    woId, 
                    m.Description, 
                    m.WorkDate || new Date().toISOString(), 
                    Number(m.ActCost || 0), 
                    m.Comment || ''
                );
            } catch (e) {
                console.error(`[CostLedger] Failed to insert misc cost:`, e.message);
                throw e;
            }
        }

        // 4. Update Work Order Status to 'Completed'
        // Audit 47 / M-14: the sqlite handle is already plant-scoped (see the
        // explicit plantId pass-through at the top of this function), so both
        // lookups stay inside the correct plant DB. The new behavior is that
        // total failure (neither ID nor WorkOrderNumber matches a row) now
        // throws, rolling back the labor/parts/misc inserts rather than
        // silently committing a partial close against no WO.
        try {
            const result = updateWOStatus.run(woId);
            if (result.changes === 0) {
                const fallback = sqlite.prepare(`UPDATE "Work" SET "StatusID" = ?, "CompDate" = CURRENT_TIMESTAMP WHERE "WorkOrderNumber" = ?`)
                      .run(COMPLETED_STATUS, String(woId));
                console.log(`[CostLedger] WO status update fallback: ${fallback.changes} rows affected`);
                if (fallback.changes === 0) {
                    throw new Error(`Work order ${woId} not found in this plant — aborting close so labor/parts are not orphaned`);
                }
            }
        } catch (e) {
            console.error(`[CostLedger] Failed to update WO status:`, e.message);
            throw e;
        }

        // 5. Update ActualHours for Workforce Analytics Efficiency
        try {
            if (totalActualHours > 0) {
                const updateHours = sqlite.prepare(`UPDATE "Work" SET "ActualHours" = ? WHERE "ID" = ? OR "WorkOrderNumber" = ?`);
                updateHours.run(totalActualHours, woId, String(woId));
            }
        } catch (e) {
            console.warn(`[CostLedger] Failed to update ActualHours for WO ${woId} (Column might be missing in legacy plant schema). Skipping.`, e.message);
        }

        return { success: true, woId };
    });

    // Audit 47 / H-3: run in IMMEDIATE mode so the write lock is acquired at
    // BEGIN, serializing concurrent WO closes against the same plant DB.
    return transaction.immediate(woId, labor, parts, misc);
}

module.exports = {
    closeWorkOrderWithCosts
};
