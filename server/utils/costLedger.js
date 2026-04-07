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

    const updateStock = sqlite.prepare(`
        UPDATE "Part" SET "Stock" = COALESCE("Stock", 0) - ? WHERE "ID" = ?
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
            
            // Decrement Stock (non-critical — allow graceful failure)
            try {
                updateStock.run(Number(p.ActQty || 0), p.PartID);
            } catch (e) {
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
        try {
            const result = updateWOStatus.run(woId);
            if (result.changes === 0) {
                // If the ID doesn't match a main Work ID row, try matching WorkOrderNumber
                const fallback = sqlite.prepare(`UPDATE "Work" SET "StatusID" = ?, "CompDate" = CURRENT_TIMESTAMP WHERE "WorkOrderNumber" = ?`)
                      .run(COMPLETED_STATUS, String(woId));
                console.log(`[CostLedger] WO status update fallback: ${fallback.changes} rows affected`);
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

    return transaction(woId, labor, parts, misc);
}

module.exports = {
    closeWorkOrderWithCosts
};
