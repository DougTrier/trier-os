// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Migration 001 — Initial Schema Normalization
 * ================================================================
 * Normalizes legacy MP2/Tabware column names to the standardized Trier OS schema.
 */
/**
 * 001_initial_normalization.js
 * Complex logic to normalize column names across diverse legacy schemas.
 */

module.exports = {
    up: (db) => {
        const tables = ['Work', 'Schedule', 'Procedur', 'Part', 'Task'];

        tables.forEach(table => {
            // Check if table exists
            const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
            if (!tableExists) return;

            // 1. Get existing columns
            const columns = db.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name);
 /* dynamic col/table - sanitize inputs */

            // 2. Standardize Description
            if (!columns.includes('Description')) {
                db.exec(`ALTER TABLE "${table}" ADD COLUMN Description TEXT`);
                if (columns.includes('Descript')) {
                    db.prepare(`UPDATE "${table}" SET Description = Descript`).run();
 /* dynamic col/table - sanitize inputs */
                } else if (columns.includes('Descr')) {
                    db.prepare(`UPDATE "${table}" SET Description = Descr`).run();
 /* dynamic col/table - sanitize inputs */
                }
            }

            // 3. Table-specific mappings
            if (table === 'Work') {
                if (!columns.includes('WorkOrderNumber')) {
                    db.exec(`ALTER TABLE Work ADD COLUMN WorkOrderNumber TEXT`);
                    if (columns.includes('WONum')) {
                        db.prepare(`UPDATE Work SET WorkOrderNumber = WONum`).run();
                    } else if (columns.includes('ID')) {
                        db.prepare(`UPDATE Work SET WorkOrderNumber = ID`).run();
                    }
                }
            }

            if (table === 'Procedur') {
                if (!columns.includes('ProcedureCode')) {
                    db.exec(`ALTER TABLE Procedur ADD COLUMN ProcedureCode TEXT`);
                    if (columns.includes('ID')) {
                        db.prepare(`UPDATE Procedur SET ProcedureCode = ID`).run();
                    } else if (columns.includes('ProcID')) {
                        db.prepare(`UPDATE Procedur SET ProcedureCode = ProcID`).run();
                    }
                }
            }

            if (table === 'Task') {
                if (!columns.includes('Instructions')) {
                    db.exec(`ALTER TABLE Task ADD COLUMN Instructions TEXT`);
                    if (columns.includes('Tasks')) {
                        db.prepare(`UPDATE Task SET Instructions = Tasks`).run();
                    }
                }
            }
        });
    }
};
