// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */

module.exports = {
    up: (db) => {
        db.exec(`
            CREATE TABLE IF NOT EXISTS WarrantyClaims (
                ID INTEGER PRIMARY KEY AUTOINCREMENT,
                AssetID INTEGER,
                AssetDescription TEXT,
                WorkOrderID INTEGER,
                WorkOrderNumber TEXT,
                VendorName TEXT,
                ClaimDate TEXT DEFAULT (date('now')),
                ClaimAmount REAL DEFAULT 0,
                AmountRecovered REAL DEFAULT 0,
                Status TEXT DEFAULT 'Submitted',
                ClaimReference TEXT,
                Notes TEXT,
                SubmittedBy TEXT,
                StatusUpdatedAt TEXT,
                StatusUpdatedBy TEXT,
                CreatedAt TEXT DEFAULT (datetime('now'))
            )
        `);
    }
};
