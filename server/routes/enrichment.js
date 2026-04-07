// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Part Enrichment Engine API
 * ==================================================
 * Exposes endpoints for the automated part data enrichment system.
 * The enrichment engine scans Part records for incomplete data
 * (missing manufacturer, UOM, cost) and attempts to fill gaps
 * from vendor catalogs and cross-plant comparison.
 *
 * ENDPOINTS:
 *   GET  /status    — Current enrichment queue status
 *   POST /trigger   — Manually trigger enrichment cycle
 *   GET  /conflicts — Parts with conflicting enrichment data
 */
const express = require('express');
const router = express.Router();
const { execFile } = require('child_process');
const path = require('path');
const db = require('../database');

// MISSION: Automatically enrich part data using global network data, 
// cached enrichment data, and controlled online lookups.
// Using Python engine for SQL connectivity to leverage native LocalDB support.

const pythonPath = 'python';
const scriptPath = path.join(__dirname, '..', '..', 'enrichment', 'engine.py');

// Progress tracking for Bulk Enrichment
let bulkProgress = {
    active: false,
    total: 0,
    processed: 0,
    currentPart: '',
    startTime: null,
    errors: []
};

// SECURITY: Regex to validate enrichment inputs — reject shell metacharacters
const SAFE_INPUT = /^[a-zA-Z0-9._\-\s\/\\#]+$/;

// Get List of Supported Manufacturers
router.get('/manufacturers', (req, res) => {
    execFile(pythonPath, [scriptPath, 'manuf_list'], (error, stdout) => {
        if (error) {
            console.error('Enrichment Engine (Manuf List) Error:', error);
            return res.json([]);
        }
        try {
            res.json(JSON.parse(stdout));
        } catch (e) {
            res.json([]);
        }
    });
});

// Bulk Status Endpoint
router.get('/bulk/status', (req, res) => {
    res.json(bulkProgress);
});

// Trigger Bulk Enrichment
router.post('/bulk/start', async (req, res) => {
    if (bulkProgress.active) {
        return res.status(400).json({ error: 'Bulk enrichment already in progress' });
    }

    const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
    
    try {
        console.log(`[Enrichment] Fetching batch for plant: ${plantId}`);
        // Identify parts that need enrichment (no ManufID)
        const partsToEnrich = db.queryAll("SELECT ID, ManufID FROM Part WHERE ManufID IS NULL OR ManufID = '' LIMIT 500");
        console.log(`[Enrichment] Found ${partsToEnrich.length} candidates.`);
        
        if (partsToEnrich.length === 0) {
            return res.json({ message: 'No parts require enrichment at this time.' });
        }

        // Initialize progress
        bulkProgress = {
            active: true,
            total: partsToEnrich.length,
            processed: 0,
            currentPart: '',
            startTime: new Date(),
            errors: []
        };

        // Start background loop
        (async () => {
            console.log(`[Enrichment] Starting bulk job for ${partsToEnrich.length} parts...`);
            
            for (const part of partsToEnrich) {
                if (!bulkProgress.active) break; // Allow cancellation if needed

                bulkProgress.currentPart = part.ID;
                
                const currentData = JSON.stringify({ manufacturer: part.ManufID || '' });
                
                await new Promise((resolve) => {
                    execFile(pythonPath, [scriptPath, 'enrich', String(part.ID), '', currentData], (error, stdout) => {
                        if (error) {
                            bulkProgress.errors.push({ id: part.ID, error: error.message });
                        }
                        // Note: We don't necessarily update the DB here because enrichment engine 
                        // should be writing to its own cache, but we could sync it if we wanted.
                        // For now, discovery mode is the priority.
                        
                        if (stdout) {
                            try {
                                const data = JSON.parse(stdout);
                                if (data.conflict) {
                                    db.run('UPDATE Part SET EnrichmentConflict = 1 WHERE ID = ?', [part.ID]);
                                }
                            } catch (e) { /* ignore parse errors in bulk */ }
                        }
                        
                        bulkProgress.processed++;
                        
                        // Enforce discovery mode rate limiting (3-5 sec)
                        // The Python engine also has its own cooldowns, but we'll add a buffer here.
                        setTimeout(resolve, 3500); 
                    });
                });
            }
            
            console.log(`[Enrichment] Bulk job complete. Processed ${bulkProgress.processed} parts.`);
            bulkProgress.active = false;
        })();

        res.json({ message: 'Bulk enrichment started in background.', total: partsToEnrich.length });

    } catch (err) {
        console.error('Bulk enrichment startup error:', err);
        res.status(500).json({ error: 'Failed to start bulk enrichment' });
    }
});

router.get('/:partNumber', (req, res) => {
    const { partNumber } = req.params;
    const { manufacturer, currentCategory } = req.query;

    if (!partNumber) {
        return res.status(400).json({ error: 'Part number is required' });
    }

    // SECURITY: Validate inputs to prevent injection even though execFile is safe
    if (!SAFE_INPUT.test(partNumber)) {
        return res.status(400).json({ error: 'Invalid part number format' });
    }
    if (manufacturer && !SAFE_INPUT.test(manufacturer)) {
        return res.status(400).json({ error: 'Invalid manufacturer format' });
    }

    const currentData = JSON.stringify({ 
        manufacturer: manufacturer || '',
        category: currentCategory || ''
    });

    execFile(pythonPath, [scriptPath, 'enrich', partNumber, manufacturer || '', currentData], (error, stdout, stderr) => {
        if (error) {
            console.error(`Enrichment Engine Error: ${error}`);
            return res.status(500).json({ 
                error: 'Enrichment engine failure', 
                details: stderr,
                instruction: 'Review proxy settings or manufacturer rate limits.'
            });
        }
        try {
            const data = JSON.parse(stdout);
            
            // Sync conflict status to local DB
            if (data.conflict) {
                db.run('UPDATE Part SET EnrichmentConflict = 1 WHERE ID = ?', [partNumber]);
            } else {
                // If we explicitly enriched and there's NO conflict now, clear the flag
                db.run('UPDATE Part SET EnrichmentConflict = 0 WHERE ID = ?', [partNumber]);
            }
            
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse enrichment data', output: stdout });
        }
    });
});

module.exports = router;
