// Copyright © 2026 Trier OS. All Rights Reserved.

const Database = require('better-sqlite3');
const { exec } = require('child_process');
const path = require('path');

const db = new Database('data/Demo_Plant_1.db');
const parts = db.prepare('SELECT ID, ManufID FROM Part WHERE ManufID IS NOT NULL LIMIT 10').all();

console.log(`Starting enrichment for ${parts.length} parts...`);

const enrichPart = (part) => {
    return new Promise((resolve, reject) => {
        const pythonPath = 'python';
        const scriptPath = path.join(__dirname, 'engine.py');
        const cmd = `${pythonPath} "${scriptPath}" enrich "${part.ID}" "${part.ManufID}"`;
        
        exec(cmd, (error, stdout) => {
            if (error) {
                console.error(`Error enriching ${part.ID}: ${error}`);
                resolve(null);
            } else {
                try {
                    const result = JSON.parse(stdout);
                    console.log(`�S& Enriched: ${part.ID} (${part.ManufID})`);
                    resolve(result);
                } catch (e) {
                    resolve(null);
                }
            }
        });
    });
};

async function run() {
    for (const part of parts) {
        await enrichPart(part);
        // respect rate limits (controlled by python engine, but we add a safety gap here too)
        await new Promise(r => setTimeout(r, 1000));
    }
    console.log('Population batch complete.');
    db.close();
}

run();
