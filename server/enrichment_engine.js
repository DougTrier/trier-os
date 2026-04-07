// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

/**
 * Trier OS - Part Enrichment Engine (Background Worker)
 * ===============================================================
 * Automatically enriches parts inventory by querying external sources for
 * manufacturer data, specifications, and cross-references.
 *
 * ARCHITECTURE:
 * - Runs on a 12-hour cron interval (set in index.js).
 * - Batches 5 parts per plant per run to avoid rate-limit violations.
 * - Delegates to a Python subprocess (enrichment/engine.py) for the actual
 *   network lookups. This separation keeps Node.js non-blocking.
 * - 7-10 second randomized delay between queries for secondary safety.
 *
 * NOTE: This module opens its own DB handles (not from the connection pool)
 * because it runs independently of any HTTP request context.
 */

const runEnrichmentCron = async () => {
    console.log('🤖 [Enrichment Engine] Starting background scan...');
    
    const dataDir = require('./resolve_data_dir');
    const plantsFile = path.join(dataDir, 'plants.json');
    if (!fs.existsSync(plantsFile)) return;
    
    const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
    
    for (const plant of plants) {
        const dbPath = path.join(dataDir, `${plant.id}.db`);
        if (!fs.existsSync(dbPath)) continue;
        
        const db = new Database(dbPath);
        try {
            // Find parts with a manufacturer but potentially no enrichment yet
            // We'll just grab a small batch per cron run to avoid hitting rate limits too hard
            const parts = db.prepare('SELECT ID, Manufacturer FROM Part WHERE Manufacturer IS NOT NULL LIMIT 5').all();
            
            for (const part of parts) {
                await enrichPartSilent(part.ID, part.Manufacturer);
                // Randomized delay between 5-10s for secondary safety
                await new Promise(r => setTimeout(r, 7000 + Math.random() * 3000));
            }
        } catch (e) {
            console.error(`Enrichment Cron Error [${plant.id}]:`, e.message);
        } finally {
            db.close();
        }
    }
};

const enrichPartSilent = (id, manuf) => {
    return new Promise((resolve) => {
        const pythonPath = 'python';
        const scriptPath = path.join(__dirname, '..', 'enrichment', 'engine.py');
        const cmd = `${pythonPath} "${scriptPath}" enrich "${id}" "${manuf || ''}"`;
        
        exec(cmd, (error) => {
            if (error) console.error(`Background Enrichment Failed: ${id}`);
            resolve();
        });
    });
};

module.exports = { runEnrichmentCron };
