// Copyright © 2026 Trier OS. All Rights Reserved.

const Database = require('better-sqlite3');

module.exports = {
    up: (dbPath) => {
        const db = new Database(dbPath);
        
        try {
            const columns = db.prepare('PRAGMA table_info(Asset)').all().map(c => c.name);
            
            if (!columns.includes('PartNumber')) {
                db.exec('ALTER TABLE Asset ADD COLUMN PartNumber TEXT DEFAULT NULL');
                console.log(`[Migration] Added PartNumber column to Asset in ${dbPath}`);
            }
        } catch (e) {
            console.error(`[Migration] Failed to add PartNumber in ${dbPath}:`, e.message);
        } finally {
            db.close();
        }
    }
};
