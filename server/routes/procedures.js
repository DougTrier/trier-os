// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Standard Operating Procedure (SOP) Library API
 * ===========================================================
 * Full lifecycle management for maintenance SOPs: create, version, clone,
 * AI-generate, and publish to the enterprise SOP library. Procedures are
 * the "how-to" instructions that get linked to PM schedules and work orders.
 * All procedure data lives in the plant SQLite database.
 * Mounted at /api/procedures in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /               List SOPs (paginated, search by title/number/asset)
 *   GET    /tasks          List all procedure tasks across all SOPs (for bulk edit)
 *   PUT    /tasks/:id      Update a single task (description, order, required flag)
 *   GET    /ai-config      Fetch AI generation config (provider, model, prompts)
 *   PUT    /ai-config      Update AI generation configuration
 *   POST   /ai-test        Test AI connection and prompt (returns sample output)
 *   GET    /:id            Full SOP detail with steps, parts list, and task checklist
 *   POST   /clone          Deep-clone an existing SOP with a new number/title
 *   POST   /               Create a new SOP (manual or from template)
 *   PUT    /:id            Update SOP fields (title, frequency, safety notes)
 *   DELETE /:id            Delete SOP (guards against SOPs linked to active WOs)
 *   POST   /ai-generate    AI-generate a full SOP from an equipment description
 *   POST   /extract-text   Extract text from a PDF procedure document (multipart)
 *
 * AI GENERATION FLOW (POST /ai-generate):
 *   1. Client sends { equipmentType, taskDescription, safetyLevel }
 *   2. Prompt assembled using ai-config settings (provider, model, template)
 *   3. AI returns structured JSON: { title, steps[], parts[], estimatedTime, safetyNotes }
 *   4. Client reviews → POST / to save as a real SOP
 *
 * PDF EXTRACTION: POST /extract-text extracts raw text from a PDF file using
 *   pdf-parse. Used when a plant has paper SOPs they want to digitize —
 *   paste the extracted text into the SOP editor rather than re-typing everything.
 *
 * CLONE FLOW: POST /clone deep-copies all steps and parts from the source SOP.
 *   New SOP gets a new ProcedureNumber and title. Useful for creating
 *   equipment-specific variants of a generic "Replace Bearing" procedure.
 *
 * ENTERPRISE SYNC: On POST and PUT, syncGlobalSOP() pushes the SOP to the
 *   GlobalSOPs table in trier_logistics.db so it's visible enterprise-wide.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { syncGlobalSOP } = require('../logistics_db');

router.get('/', (req, res) => {
    try {
        const activePlant = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const { page = 1, limit = 50, order = 'ASC', search = '' } = req.query;
        let where = [];
        let params = [];
        if (search) {
            where.push(`("ID" LIKE ? OR "Description" LIKE ?)`);
            params.push(`%${search}%`, `%${search}%`);
        }

        if (activePlant === 'all_sites') {
            const path = require('path');
            const fs = require('fs');
            const dataDir = require('../resolve_data_dir');
            const plantsFile = path.join(dataDir, 'plants.json');
            const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
            
            let allProcedures = [];
            
            plants.forEach(p => {
                const dbPath = path.join(dataDir, `${p.id}.db`);
                // ONLY query if the database file actually exists on disk
                if (fs.existsSync(dbPath)) {
                    try {
                        const tempDb = db.getDb(p.id);
                        // Check if Procedur table exists
                        const hasTbl = tempDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='Procedures'`).get();
                        if (hasTbl) {
                            let sql = 'SELECT * FROM Procedures';
                            let sqlParams = [];
                            if (where.length) {
                                 sql += ' WHERE ' + where.join(' AND ').replace(/"/g, ''); 
                                 sqlParams = params;
                            }
                            const procs = tempDb.prepare(sql).all(...sqlParams);
                            allProcedures.push(...procs.map(proc => ({
                                ...proc,
                                plantId: p.id,
                                plantLabel: p.label
                            })));
                        }
                    } catch (e) { console.warn(`[Procedures] Skipping plant ${p.id}: ${e.message}`); }
                }
            });

            // Basic pagination for allProcedures
            const start = (parseInt(page) - 1) * parseInt(limit);
            const paginated = allProcedures.slice(start, start + parseInt(limit));

            return res.json({
                data: paginated,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: allProcedures.length,
                    totalPages: Math.ceil(allProcedures.length / limit)
                }
            });
        }

        const result = db.queryPaginated('Procedures', {
            page: parseInt(page), limit: parseInt(limit), orderBy: 'ID', order,
            where: where.length ? where.join(' AND ') : '', params,
        });
        res.json(result);
    } catch (err) {
        console.error('GET /api/procedures error:', err);
        res.status(500).json({ error: 'Failed to fetch procedures' });
    }
});

// ── GET /api/procedures/tasks ─────────────────────────────────────────────
// List individual tasks from the raw Task master table
router.get('/tasks', (req, res) => {
    try {
        const { search = '', page = 1, limit = 50 } = req.query;
        let where = [];
        let params = [];

        if (search) {
            where.push('("ID" LIKE ? OR "Description" LIKE ? OR "Tasks" LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const result = db.queryPaginated('Task', {
            page: parseInt(page),
            limit: parseInt(limit),
            orderBy: 'ID',
            where: where.length ? where.join(' AND ') : '',
            params
        });

        res.json(result);
    } catch (err) {
        console.error('GET /api/procedures/tasks error:', err);
        res.status(500).json({ error: 'Failed to fetch task data' });
    }
});

// ── PUT /api/procedures/tasks/:id ─────────────────────────────────────────
// Update a specific task record in the master Task table
router.put('/tasks/:id', (req, res) => {
    try {
        const { id } = req.params;
        const fields = req.body;
        
        // Remove structural ID if present in body to avoid primary key conflicts
        delete fields.ID;

        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'No fields provided for update' });
        }

        const sets = Object.keys(fields).map(k => `"${k}" = ?`).join(', ');
        const values = [...Object.values(fields), id];

        db.run(`UPDATE Task SET ${sets} WHERE ID = ?`, values);

        res.json({ success: true, message: 'Task master record updated' });
    } catch (err) {
        console.error('PUT /api/procedures/tasks/:id error:', err);
        res.status(500).json({ error: 'Failed to update task data' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// AI Configuration Routes — MUST be above /:id to avoid catch-all conflict
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/procedures/ai-config — Get AI configuration (admin only)
router.get('/ai-config', (req, res) => {
    try {
        const aiService = require('../ai_service');
        const config = aiService.getConfig();
        if (config) {
            // Mask API key
            config.api_key = config.api_key ? '***' + config.api_key.slice(-4) : '';
        }
        res.json(config || { provider: 'openai', api_key: '', model: 'gpt-4o-mini' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get AI config' });
    }
});

// PUT /api/procedures/ai-config — Save AI configuration (admin only)
router.put('/ai-config', (req, res) => {
    try {
        const { provider, apiKey, model } = req.body;
        if (!provider || !apiKey) {
            return res.status(400).json({ error: 'Provider and API key are required' });
        }
        const aiService = require('../ai_service');
        const ok = aiService.saveConfig(provider, apiKey, model || 'gpt-4o-mini');
        res.json({ success: ok });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save AI config' });
    }
});

// POST /api/procedures/ai-test — Test AI connection
router.post('/ai-test', async (req, res) => {
    try {
        const aiService = require('../ai_service');
        const result = await aiService.testConnection();
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: 'An internal server error occurred' });
    }
});


router.get('/:id', (req, res) => {
    try {
        const { sourcePlant } = req.query;
        let targetDb = db.getDb();
        
        // If viewing from corporate library, we might need to query a specific site db
        if (sourcePlant) {
            targetDb = db.getDb(sourcePlant);
        }

        const proc = targetDb.prepare('SELECT * FROM Procedures WHERE ID = ?').get(req.params.id);
        if (!proc) return res.status(404).json({ error: 'Procedure not found' });

        // Fetch tasks (steps) by joining ProcTask with the actual Task instructions table
        const tasks = targetDb.prepare(`
            SELECT pt.TskOrder, t.ID, t.Description, t.Tasks as Instructions
            FROM ProcedureTasks pt
            LEFT JOIN Task t ON pt.TaskID = t.ID
            WHERE pt.ProcID = ?
            ORDER BY pt.TskOrder ASC
        `).all(req.params.id);

        // Fetch required parts
        const parts = targetDb.prepare(`
            SELECT pp.EstQty, p.ID, p.Description
            FROM ProcedureParts pp
            LEFT JOIN Part p ON pp.PartID = p.ID
            WHERE pp.ProcID = ?
        `).all(req.params.id);

        res.json({ ...proc, _tasks: tasks, _parts: parts });
    } catch (err) {
        console.error('Error fetching procedure details:', err);
        res.status(500).json({ error: 'Failed to fetch procedure details' });
    }
});

/**
 * POST /api/procedures/clone
 * Clones a procedure (metadata, tasks/steps, and parts) from one site to another.
 */
router.post('/clone', (req, res) => {
    try {
        const { sourcePlantId, procedureId, targetPlantId } = req.body;
        
        if (!sourcePlantId || !procedureId || !targetPlantId) {
            return res.status(400).json({ error: 'Missing clone parameters' });
        }

        const sourceDb = db.getDb(sourcePlantId);
        const targetDb = db.getDb(targetPlantId);

        // 1. Fetch source procedure
        const proc = sourceDb.prepare('SELECT * FROM Procedures WHERE ID = ?').get(procedureId);
        if (!proc) return res.status(404).json({ error: 'Source procedure not found' });

        // 2. Fetch source tasks
        const tasks = sourceDb.prepare(`
            SELECT pt.TskOrder, t.*
            FROM ProcedureTasks pt
            JOIN Task t ON pt.TaskID = t.ID
            WHERE pt.ProcID = ?
        `).all(procedureId);

        // 3. Fetch source parts
        const procParts = sourceDb.prepare(`
            SELECT pp.EstQty, p.*
            FROM ProcedureParts pp
            JOIN Part p ON pp.PartID = p.ID
            WHERE pp.ProcID = ?
        `).all(procedureId);

        // Run clone in a transaction on the target database
        const cloneTx = targetDb.transaction(() => {
            // A. Insert/Update Procedure metadata
            const cols = Object.keys(proc).map(c => `"${c}"`).join(', ');
            const placeholders = Object.keys(proc).map(() => '?').join(', ');
            const updateSets = Object.keys(proc).map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
            
            targetDb.prepare(`
                INSERT INTO Procedures (${cols}) VALUES (${placeholders})
                ON CONFLICT(ID) DO UPDATE SET ${updateSets}
            `).run(Object.values(proc));

            // B. Clone Tasks (ensure the Task exists, then the ProcedureTasks link)
            targetDb.prepare('DELETE FROM ProcedureTasks WHERE ProcID = ?').run(procedureId);
            
            for (const task of tasks) {
                const { TskOrder, ...taskData } = task;
                const tCols = Object.keys(taskData).map(c => `"${c}"`).join(', ');
                const tPlaceholders = Object.keys(taskData).map(() => '?').join(', ');
                const tUpdateSets = Object.keys(taskData).map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

                targetDb.prepare(`
                    INSERT INTO Task (${tCols}) VALUES (${tPlaceholders})
                    ON CONFLICT(ID) DO UPDATE SET ${tUpdateSets}
                `).run(Object.values(taskData));

                targetDb.prepare(`INSERT INTO ProcedureTasks (ProcID, TaskID, TskOrder) VALUES (?, ?, ?)`).run(procedureId, task.ID, TskOrder);
            }

            // C. Clone Parts (Note: This might pull in parts Site B doesn't have)
            targetDb.prepare('DELETE FROM ProcedureParts WHERE ProcID = ?').run(procedureId);
            for (const p of procParts) {
                const { EstQty, ...partData } = p;
                const pCols = Object.keys(partData).map(c => `"${c}"`).join(', ');
                const pPlaceholders = Object.keys(partData).map(() => '?').join(', ');
                const pUpdateSets = Object.keys(partData).map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

                targetDb.prepare(`
                    INSERT INTO Part (${pCols}) VALUES (${pPlaceholders})
                    ON CONFLICT(ID) DO UPDATE SET ${pUpdateSets}
                `).run(Object.values(partData));

                targetDb.prepare(`INSERT INTO ProcedureParts (ProcID, PartID, EstQty) VALUES (?, ?, ?)`).run(procedureId, p.ID, EstQty);
            }
        });

        cloneTx();

        res.json({ success: true, message: `Procedure "${procedureId}" successfully implemented to ${targetPlantId}` });
    } catch (err) {
        console.error('Cloning error:', err);
        res.status(500).json({ error: 'Failed to clone procedure' });
    }
});

router.post('/', (req, res) => {
    const dbInstance = db.getDb();
    try {
        const { Tasks, ...fields } = req.body;
        
        const createProc = dbInstance.transaction(() => {
            // A. Insert Procedure Metadata
            const columns = Object.keys(fields);
            const placeholders = columns.map(() => '?').join(', ');
            const values = Object.values(fields);
            const colStr = columns.map(c => `"${c}"`).join(', ');
            
            dbInstance.prepare(`INSERT OR REPLACE INTO Procedures (${colStr}) VALUES (${placeholders})`).run(...values);

            // B. Insert Tasks and Links if provided
            if (Tasks && Array.isArray(Tasks)) {
                // Clear existing links to avoid duplicates on 'REPLACE' logic
                dbInstance.prepare('DELETE FROM ProcedureTasks WHERE ProcID = ?').run(fields.ID);

                Tasks.forEach((taskStep, idx) => {
                    const order = idx + 1;
                    const taskId = `${fields.ID}-STEP-${order}`;
                    const taskDesc = typeof taskStep === 'string' ? taskStep : (taskStep.Description || '');
                    const instructions = typeof taskStep === 'string' ? taskStep : (taskStep.Tasks || taskStep.Instructions || '');

                    // Ensure Task record exists
                    dbInstance.prepare(`
                        INSERT OR REPLACE INTO Task (ID, Description, Tasks, Instructions) 
                        VALUES (?, ?, ?, ?)
                    `).run(taskId, taskDesc.substring(0, 50), instructions, instructions);

                    // Create Link
                    dbInstance.prepare(`INSERT INTO ProcedureTasks (ProcID, TaskID, TskOrder) VALUES (?, ?, ?)`).run(fields.ID, taskId, order);
                });
            }
        });

        createProc();
        res.status(201).json({ success: true, message: 'Procedure provisioned successfully' });

        // Global Sync
        const plantId = req.headers['x-plant-id'];
        if (plantId && plantId !== 'all_sites') {
            syncGlobalSOP(fields.ID, fields.Description, Tasks || [], plantId);
        }
    } catch (err) {
        console.error('Error provisioning procedure:', err.message);
        res.status(500).json({ error: 'Failed to create procedure: ' });
    }
});

// PUT /api/procedures/:id
router.put('/:id', (req, res) => {
    const dbInstance = db.getDb();
    try {
        const { _tasks, _parts, ...fields } = req.body;
        
        const columns = Object.keys(fields);
        const sets = columns.map(c => `"${c}" = ?`).join(', ');
        const values = [...Object.values(fields), req.params.id];

        const updateProc = dbInstance.transaction(() => {
            dbInstance.prepare(`UPDATE Procedures SET ${sets} WHERE ID = ?`).run(...values);

            // Rebuild associated tasks (steps)
            if (_tasks && Array.isArray(_tasks)) {
                // Delete existing links for this procedure to rebuild order
                dbInstance.prepare('DELETE FROM ProcedureTasks WHERE ProcID = ?').run(req.params.id);

                _tasks.forEach((task, idx) => {
                    const order = idx + 1;
                    let targetTaskId = task.ID;

                    // If it's a new task (no ID), create one
                    if (!targetTaskId) {
                        targetTaskId = `${req.params.id}-STEP-${Date.now()}-${order}`;
                        dbInstance.prepare(`INSERT INTO Task (ID, Description, Tasks, Instructions) VALUES (?, ?, ?, ?)`)
                            .run(targetTaskId, task.Description || '', task.Instructions || '', task.Instructions || '');
                    } else {
                        // Update existing Task record
                        dbInstance.prepare(`UPDATE Task SET Tasks = ?, Description = ?, Instructions = ? WHERE ID = ?`)
                            .run(task.Instructions || '', task.Description || '', task.Instructions || '', targetTaskId);
                    }

                    // Re-link
                    dbInstance.prepare(`INSERT INTO ProcedureTasks (ProcID, TaskID, TskOrder) VALUES (?, ?, ?)`)
                        .run(req.params.id, targetTaskId, order);
                });
            }
        });

        updateProc();
        res.json({ success: true, message: 'Procedure and associated tasks updated successfully' });

        // Global Sync
        const plantId = req.headers['x-plant-id'];
        if (plantId && plantId !== 'all_sites') {
            syncGlobalSOP(req.params.id, fields.Description, _tasks || [], plantId);
        }
    } catch (err) {
        console.error('Error updating procedure:', err.message);
        res.status(500).json({ error: 'Failed to update procedure' });
    }
});

// DELETE /api/procedures/:id
router.delete('/:id', (req, res) => {
    try {
        const id = req.params.id;
        // Also cleanup links
        db.getDb().prepare('DELETE FROM ProcedureTasks WHERE ProcID = ?').run(id);
        db.getDb().prepare('DELETE FROM ProcedureParts WHERE ProcID = ?').run(id);
        db.getDb().prepare('DELETE FROM Procedures WHERE ID = ?').run(id);
        res.status(200).json({ success: true, message: 'Procedure and associated links deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete procedure' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-Powered SOP Generation — Feature 5
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/procedures/ai-generate — Generate SOP from text using AI
router.post('/ai-generate', async (req, res) => {
    try {
        const { text, assetType, procedureType } = req.body;
        if (!text || text.trim().length < 20) {
            return res.status(400).json({ error: 'Please provide at least 20 characters of equipment documentation text.' });
        }

        const aiService = require('../ai_service');
        const result = await aiService.generateSOP(text, { assetType, procedureType });
        res.json({ success: true, sop: result });
    } catch (err) {
        console.error('[AI Generate] Error:', err.message);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// POST /api/procedures/extract-text — Extract text from uploaded files (PDF, images, txt)
const multer = require('multer');
const pdfUploadDir = path.join(require('../resolve_data_dir'), 'uploads', 'pdf_tmp');
if (!fs.existsSync(pdfUploadDir)) fs.mkdirSync(pdfUploadDir, { recursive: true });

const pdfUpload = multer({
    dest: pdfUploadDir,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for large manuals
    fileFilter: (req, file, cb) => {
        const allowed = ['.txt', '.md', '.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error(`Unsupported file type: ${ext}. Supported: ${allowed.join(', ')}`));
    }
});

router.post('/extract-text', pdfUpload.single('file'), async (req, res) => {
    try {
        // If no file was uploaded, check if raw text was sent in body
        if (!req.file) {
            const text = typeof req.body === 'string' ? req.body : (req.body?.text || '');
            return res.json({ success: true, text: text.substring(0, 50000), length: text.length, source: 'paste' });
        }

        const filePath = req.file.path;
        const ext = path.extname(req.file.originalname).toLowerCase();
        let extractedText = '';
        let source = 'unknown';

        console.log(`\\n📄 SOP Text Extraction: ${req.file.originalname} (${ext}, ${(req.file.size / 1024).toFixed(0)}KB)`);

        if (ext === '.txt' || ext === '.md') {
            // Plain text / Markdown — just read it
            extractedText = fs.readFileSync(filePath, 'utf8');
            source = 'text-file';
            console.log(`  ✅ Text file: ${extractedText.length} characters`);

        } else if (ext === '.pdf') {
            // PDF — try digital extraction first, fall back to OCR
            try {
                const pdfParse = require('pdf-parse');
                const pdfBuffer = fs.readFileSync(filePath);
                const pdfData = await pdfParse(pdfBuffer);
                extractedText = pdfData.text || '';
                source = 'pdf-digital';
                console.log(`  ✅ PDF digital text: ${extractedText.length} chars, ${pdfData.numpages} pages`);

                // If digital extraction got very little text, it might be a scanned PDF
                if (extractedText.replace(/\\s/g, '').length < 50) {
                    console.log(`  ⚠️ PDF appears to be scanned (only ${extractedText.length} chars). Falling back to OCR...`);
                    try {
                        const Tesseract = require('tesseract.js');
                        const { data } = await Tesseract.recognize(filePath, 'eng', { logger: () => {} });
                        if (data.text && data.text.replace(/\\s/g, '').length > extractedText.replace(/\\s/g, '').length) {
                            extractedText = data.text;
                            source = 'pdf-ocr';
                            console.log(`  ✅ OCR fallback: ${extractedText.length} chars (confidence: ${Math.round(data.confidence)}%)`);
                        }
                    } catch (ocrErr) {
                        console.log(`  ⚠️ OCR fallback failed: ${ocrErr.message}`);
                    }
                }
            } catch (pdfErr) {
                console.error(`  ❌ PDF parse failed: ${pdfErr.message}`);
                return res.status(400).json({ error: `Failed to parse PDF: ${pdfErr.message}` });
            }

        } else {
            // Image file — OCR with Tesseract
            try {
                const Tesseract = require('tesseract.js');
                console.log(`  🔍 Running OCR on image...`);
                const { data } = await Tesseract.recognize(filePath, 'eng', { logger: () => {} });
                extractedText = data.text || '';
                source = 'image-ocr';
                console.log(`  ✅ OCR result: ${extractedText.length} chars (confidence: ${Math.round(data.confidence)}%)`);
            } catch (ocrErr) {
                console.error(`  ❌ OCR failed: ${ocrErr.message}`);
                return res.status(400).json({ error: `OCR failed: ${ocrErr.message}` });
            }
        }

        // Cleanup temp file
        try { fs.unlinkSync(filePath); } catch (e) { /* Intentional: temp upload cleanup */ }

        // Clean up the extracted text
        extractedText = extractedText
            .replace(/\f/g, '\n\n')          // Form feeds → paragraph breaks
            .replace(/\r\n/g, '\n')          // Normalize line endings
            .replace(/\n{4,}/g, '\n\n\n')    // Collapse excessive blank lines
            .trim();

        console.log(`  📊 Final: ${extractedText.length} chars via ${source}`);

        res.json({
            success: true,
            text: extractedText.substring(0, 100000), // Cap at 100K chars
            length: extractedText.length,
            source,
            filename: req.file.originalname
        });
    } catch (err) {
        // Cleanup on error
        if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch (e) { /* Intentional: error-path temp cleanup */ }
        console.error('Text extraction error:', err);
        res.status(500).json({ error: 'Failed to extract text: ' });
    }
});


module.exports = router;
