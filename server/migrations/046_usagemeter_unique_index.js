// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 046 — UsageMeter unique index for idempotent daily snapshots 

'use strict';

module.exports = {
    up: () => {
        const logisticsDb = require('../logistics_db').db;
        logisticsDb.exec(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_usagemeter_unique       
            ON UsageMeter(PeriodStart, Metric, COALESCE(PlantID, ''))     
        `);
    }
};
