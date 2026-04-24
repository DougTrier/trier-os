// Copyright © 2026 Trier OS. All Rights Reserved.

module.exports = {
    up: (db) => {
        // Only modify plant databases that have the Asset table
        const hasAsset = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Asset'").get();
        if (hasAsset) {
            const cols = db.prepare('PRAGMA table_info(Asset)').all().map(c => c.name);
            if (!cols.includes('ReplacementCostUSD')) {
                db.prepare('ALTER TABLE Asset ADD COLUMN ReplacementCostUSD REAL DEFAULT 0').run();
            }
        }

        // Check if MasterEquipment exists in this DB (mfg_master.db)
        const hasMasterEquip = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='MasterEquipment'").get();
        if (hasMasterEquip) {
            const cols = db.prepare('PRAGMA table_info(MasterEquipment)').all().map(c => c.name);
            if (!cols.includes('ExpectedUsefulLifeYears')) {
                db.prepare('ALTER TABLE MasterEquipment ADD COLUMN ExpectedUsefulLifeYears INTEGER').run();
                // Optionally backfill if UsefulLifeYears exists
                if (cols.includes('UsefulLifeYears')) {
                    db.prepare('UPDATE MasterEquipment SET ExpectedUsefulLifeYears = UsefulLifeYears').run();
                }
            }
        }
    }
};
