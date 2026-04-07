// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Extended Features API
 * ===================================
 * Supplementary features covering file attachments, the public work request
 * portal, failure code libraries, scheduled report delivery, and technician
 * workload analytics. Mounted at /api/gap in server/index.js.
 *
 * ENDPOINTS:
 *   Work Order Attachments (photos, videos, documents)
 *   GET    /work-orders/:woId/attachments              List attachments for a work order
 *   POST   /work-orders/:woId/attachments              Upload a file (photo/video/doc, max 50MB)
 *   DELETE /work-orders/:woId/attachments/:filename    Remove an attachment
 *
 *   Generic Entity Attachments (assets, equipment, incidents)
 *   GET    /:entityType/:entityId/attachments          List attachments for any entity type
 *   POST   /:entityType/:entityId/attachments          Upload attachment for an entity
 *   DELETE /:entityType/:entityId/attachments/:filename Remove entity attachment
 *
 *   Public Work Request Portal (no authentication required)
 *   POST   /public/work-request                        Submit a maintenance request (rate-limited)
 *                                                      Returns a reference number for status tracking
 *   GET    /public/plants                              List plants available in the request form
 *   GET    /public/request-status/:ref                 Check status of a submitted request
 *
 *   Failure / Cause / Remedy Codes
 *   GET    /failure-codes/library                      Master library of failure, cause, and remedy codes
 *   GET    /failure-codes/:woId                        Codes logged against a specific work order
 *   POST   /failure-codes/:woId                        Attach failure/cause/remedy codes to a WO
 *   DELETE /failure-codes/:id                          Remove a code entry
 *
 *   Scheduled Report Delivery
 *   GET    /scheduled-reports                          List all scheduled report jobs
 *   POST   /scheduled-reports                          Create a scheduled report (frequency, recipients)
 *   PUT    /scheduled-reports/:id                      Update schedule or recipients
 *   DELETE /scheduled-reports/:id                      Cancel a scheduled report
 *
 *   Workload Analytics
 *   GET    /technician-workload                        Open WO count and hours per technician
 *
 * PUBLIC PORTAL: Rate-limited to 5 requests/15 minutes per IP to prevent spam.
 *   Submitted requests create a Work record with Status=10 (Pending Review) and
 *   generate a random reference number (e.g. REQ-A3F9) for the requester to track.
 *   Requests are NOT visible to non-maintenance staff — they appear in the WO queue.
 *
 * ATTACHMENT STORAGE: Files saved to /data/uploads/attachments/{entityType}/{entityId}/
 *   Supported MIME types: image/*, video/*, application/pdf, .xlsx, .docx
 *   Max file size: 50MB per file (configurable via MAX_ATTACHMENT_SIZE env var).
 *
 * FAILURE CODE LIBRARY: 3-level taxonomy — Failure Type → Cause Code → Remedy Code.
 *   Used for RCA reporting and FMEA correlation. Codes are plant-agnostic.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const dataDir = require('../resolve_data_dir');
const rateLimit = require('express-rate-limit');

// ═══════════════════════════════════════════════════════════════
// 1 & 2. WORK ORDER ATTACHMENTS (Photos + Videos + Files)
// ═══════════════════════════════════════════════════════════════

const woAttachmentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const safeId = req.params.woId.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const dir = path.join(dataDir, 'uploads', 'workorders', safeId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
    }
});

const woUpload = multer({
    storage: woAttachmentStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB — support video
    fileFilter: (req, file, cb) => {
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];
        const videoExts = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
        const docExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt'];
        const allowed = [...imageExts, ...videoExts, ...docExts];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error(`File type not allowed: ${ext}. Supported: images, videos, PDFs, Office docs.`));
    }
});

// GET /api/work-orders/:woId/attachments — list all attachments
router.get('/work-orders/:woId/attachments', (req, res) => {
    try {
        const safeId = req.params.woId.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const dir = path.join(dataDir, 'uploads', 'workorders', safeId);

        if (!fs.existsSync(dir)) {
            return res.json([]);
        }

        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];
        const videoExts = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];

        const files = fs.readdirSync(dir)
            .map(f => {
                const ext = path.extname(f).toLowerCase();
                const stats = fs.statSync(path.join(dir, f));
                let fileType = 'document';
                if (imageExts.includes(ext)) fileType = 'image';
                else if (videoExts.includes(ext)) fileType = 'video';

                return {
                    filename: f,
                    originalName: f.replace(/^\d+-\d+/, '').replace(/^-/, '') || f,
                    url: `/uploads/workorders/${safeId}/${f}`,
                    type: fileType,
                    ext: ext,
                    size: stats.size,
                    uploadedAt: stats.mtime.toISOString()
                };
            })
            .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        res.json(files);
    } catch (err) {
        console.error('GET WO attachments error:', err);
        res.status(500).json({ error: 'Failed to list attachments' });
    }
});

// POST /api/work-orders/:woId/attachments — upload attachment
router.post('/work-orders/:woId/attachments', woUpload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const safeId = req.params.woId.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const ext = path.extname(req.file.originalname).toLowerCase();
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];
        const videoExts = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
        let fileType = 'document';
        if (imageExts.includes(ext)) fileType = 'image';
        else if (videoExts.includes(ext)) fileType = 'video';

        const fileUrl = `/uploads/workorders/${safeId}/${req.file.filename}`;
        console.log(`📎 WO attachment uploaded: WO ${req.params.woId} → ${fileType} ${fileUrl}`);

        res.json({
            success: true,
            attachment: {
                filename: req.file.filename,
                originalName: req.file.originalname,
                url: fileUrl,
                type: fileType,
                ext: ext,
                size: req.file.size,
                uploadedAt: new Date().toISOString()
            }
        });
    } catch (err) {
        console.error('POST WO attachment error:', err);
        res.status(500).json({ error: 'Failed to upload attachment' });
    }
});

// DELETE /api/work-orders/:woId/attachments/:filename
router.delete('/work-orders/:woId/attachments/:filename', (req, res) => {
    try {
        const safeId = req.params.woId.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const safeFilename = path.basename(req.params.filename);
        const filePath = path.join(dataDir, 'uploads', 'workorders', safeId, safeFilename);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ WO attachment deleted: WO ${req.params.woId} → ${safeFilename}`);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Attachment not found' });
        }
    } catch (err) {
        console.error('DELETE WO attachment error:', err);
        res.status(500).json({ error: 'Failed to delete attachment' });
    }
});


// ═══════════════════════════════════════════════════════════════
// 1b. GENERIC ATTACHMENTS (Parts + Procedures + any entity)
// ═══════════════════════════════════════════════════════════════

function makeGenericAttachmentRoutes(entityType) {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const safeId = req.params.entityId.replace(/[^a-zA-Z0-9_\-]/g, '_');
            const dir = path.join(dataDir, 'uploads', entityType, safeId);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
        }
    });

    const upload = multer({
        storage,
        limits: { fileSize: 50 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            const allowed = ['.jpg','.jpeg','.png','.gif','.webp','.heic','.mp4','.mov','.avi','.webm','.mkv','.pdf','.doc','.docx','.xls','.xlsx','.csv','.txt'];
            const ext = path.extname(file.originalname).toLowerCase();
            if (allowed.includes(ext)) cb(null, true);
            else cb(new Error(`File type not allowed: ${ext}`));
        }
    });

    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];
    const videoExts = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];

    // GET list
    router.get(`/${entityType}/:entityId/attachments`, (req, res) => {
        try {
            const safeId = req.params.entityId.replace(/[^a-zA-Z0-9_\-]/g, '_');
            const dir = path.join(dataDir, 'uploads', entityType, safeId);
            if (!fs.existsSync(dir)) return res.json([]);

            const files = fs.readdirSync(dir).map(f => {
                const ext = path.extname(f).toLowerCase();
                const stats = fs.statSync(path.join(dir, f));
                let fileType = 'document';
                if (imageExts.includes(ext)) fileType = 'image';
                else if (videoExts.includes(ext)) fileType = 'video';
                return {
                    filename: f,
                    originalName: f.replace(/^\d+-\d+/, '').replace(/^-/, '') || f,
                    url: `/uploads/${entityType}/${safeId}/${f}`,
                    type: fileType, ext, size: stats.size,
                    uploadedAt: stats.mtime.toISOString()
                };
            }).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
            res.json(files);
        } catch (err) {
            console.error(`GET ${entityType} attachments error:`, err);
            res.status(500).json({ error: 'Failed to list attachments' });
        }
    });

    // POST upload
    router.post(`/${entityType}/:entityId/attachments`, upload.single('file'), (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No file provided' });
            const safeId = req.params.entityId.replace(/[^a-zA-Z0-9_\-]/g, '_');
            const ext = path.extname(req.file.originalname).toLowerCase();
            let fileType = 'document';
            if (imageExts.includes(ext)) fileType = 'image';
            else if (videoExts.includes(ext)) fileType = 'video';
            const fileUrl = `/uploads/${entityType}/${safeId}/${req.file.filename}`;
            console.log(`📎 ${entityType} attachment uploaded: ${req.params.entityId} → ${fileType} ${fileUrl}`);
            res.json({
                success: true,
                attachment: {
                    filename: req.file.filename, originalName: req.file.originalname,
                    url: fileUrl, type: fileType, ext, size: req.file.size,
                    uploadedAt: new Date().toISOString()
                }
            });
        } catch (err) {
            console.error(`POST ${entityType} attachment error:`, err);
            res.status(500).json({ error: 'Failed to upload attachment' });
        }
    });

    // DELETE
    router.delete(`/${entityType}/:entityId/attachments/:filename`, (req, res) => {
        try {
            const safeId = req.params.entityId.replace(/[^a-zA-Z0-9_\-]/g, '_');
            const safeFilename = path.basename(req.params.filename);
            const filePath = path.join(dataDir, 'uploads', entityType, safeId, safeFilename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ ${entityType} attachment deleted: ${req.params.entityId} → ${safeFilename}`);
                res.json({ success: true });
            } else {
                res.status(404).json({ error: 'Attachment not found' });
            }
        } catch (err) {
            console.error(`DELETE ${entityType} attachment error:`, err);
            res.status(500).json({ error: 'Failed to delete attachment' });
        }
    });
}

// Register attachment routes for Parts and Procedures
makeGenericAttachmentRoutes('parts');
makeGenericAttachmentRoutes('procedures');


// ═══════════════════════════════════════════════════════════════
// 3. WORK ORDER REQUEST PORTAL (Public, No Login)
// ═══════════════════════════════════════════════════════════════

// SECURITY: Rate limit for unauthenticated endpoint (5 requests per 10 minutes per IP)
const publicRequestLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' }
});

// Multer for public work-request uploads (images + PDFs only, 10MB, 3 files max)
// Files land in uploads/public_tmp/ and are moved to workorders/REQ-N/ after the WO is created.
const publicUploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tmpDir = path.join(dataDir, 'uploads', 'public_tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        cb(null, tmpDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`);
    }
});

const publicUpload = multer({
    storage: publicUploadStorage,
    limits: { fileSize: 10 * 1024 * 1024, files: 3 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error(`Only images and PDFs accepted. Got: ${ext}`));
    }
});

// POST /api/public/work-request — Submit a maintenance request without authentication
router.post('/public/work-request', publicRequestLimiter, (req, res, next) => {
    publicUpload.array('files', 3)(req, res, err => {
        if (err instanceof multer.MulterError) {
            const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large. Max 10 MB per file.'
                      : err.code === 'LIMIT_FILE_COUNT' ? 'Too many files. Max 3.'
                      : err.message;
            return res.status(400).json({ error: msg });
        }
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}, (req, res) => {
    try {
        const { plantId, description, location, requesterName, requesterEmail, requesterPhone, priority, assetId } = req.body;

        if (!description || !requesterName) {
            return res.status(400).json({ error: 'Description and requester name are required' });
        }

        // SECURITY: Validate plantId against known plants to prevent arbitrary file creation
        const targetPlant = (plantId || 'Demo_Plant_1').replace(/[^a-zA-Z0-9_\s-]/g, '');
        const plantsFile = path.join(dataDir, 'plants.json');
        let validPlants = ['Demo_Plant_1'];
        try {
            if (fs.existsSync(plantsFile)) {
                validPlants = JSON.parse(fs.readFileSync(plantsFile, 'utf8')).map(p => p.id);
            }
        } catch (e) { /* use default */ }
        if (!validPlants.includes(targetPlant)) {
            return res.status(400).json({ error: 'Invalid plant specified' });
        }

        // Create the work order in the target plant's database
        const Database = require('better-sqlite3');
        const dbPath = path.join(dataDir, `${targetPlant}.db`);

        if (!fs.existsSync(dbPath)) {
            return res.status(400).json({ error: 'Invalid plant specified' });
        }

        const plantDb = new Database(dbPath);

        // Ensure Work table exists
        const hasWork = plantDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Work'").get();
        if (!hasWork) {
            plantDb.close();
            return res.status(500).json({ error: 'Plant database not initialized' });
        }

        // Generate WO number
        const maxId = plantDb.prepare('SELECT MAX(CAST(ID AS INTEGER)) as maxID FROM Work').get();
        const nextId = (maxId?.maxID || 0) + 1;
        const woNumber = `REQ-${nextId}`;

        const now = new Date().toISOString();
        const desc = `[PUBLIC REQUEST] ${description}\n\nRequester: ${requesterName}${requesterEmail ? `\nEmail: ${requesterEmail}` : ''}${requesterPhone ? `\nPhone: ${requesterPhone}` : ''}${location ? `\nLocation: ${location}` : ''}`;

        plantDb.prepare(`
            INSERT INTO Work (ID, WorkOrderNumber, Description, StatusID, Priority, TypeID, AddDate, AstID, UserID)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            nextId,
            woNumber,
            desc,
            '10',  // Status: Open/Pending
            priority || '3',  // Default: Normal
            'Request',
            now,
            assetId || '',
            `PUBLIC:${requesterName}`
        );

        plantDb.close();

        // Move any uploaded files from public_tmp → workorders/REQ-N/
        const attachments = [];
        const uploadedFiles = req.files || [];
        if (uploadedFiles.length > 0) {
            const safeWoNum = woNumber.replace(/[^a-zA-Z0-9_\-]/g, '_');
            const woDir = path.join(dataDir, 'uploads', 'workorders', safeWoNum);
            if (!fs.existsSync(woDir)) fs.mkdirSync(woDir, { recursive: true });
            const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];
            for (const file of uploadedFiles) {
                const destPath = path.join(woDir, file.filename);
                try {
                    fs.renameSync(file.path, destPath);
                    const ext = path.extname(file.originalname).toLowerCase();
                    attachments.push({
                        filename: file.filename,
                        originalName: file.originalname,
                        url: `/uploads/workorders/${safeWoNum}/${file.filename}`,
                        type: imageExts.includes(ext) ? 'image' : 'document',
                        size: file.size
                    });
                } catch (moveErr) {
                    console.warn(`[PublicUpload] Could not move ${file.filename}:`, moveErr.message);
                }
            }
        }

        console.log(`📋 Public WO request: ${woNumber} at ${targetPlant} from ${requesterName}${attachments.length ? ` (+${attachments.length} file(s))` : ''}`);

        res.status(201).json({
            success: true,
            message: 'Maintenance request submitted successfully',
            referenceNumber: woNumber,
            plant: targetPlant,
            submittedAt: now,
            attachments
        });
    } catch (err) {
        // Clean up any temp files if WO creation failed
        (req.files || []).forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });
        console.error('Public work request error:', err);
        res.status(500).json({ error: 'Failed to submit maintenance request' });
    }
});

// GET /api/public/plants — Get list of plants for the request portal dropdown
router.get('/public/plants', (req, res) => {
    try {
        const plantsFile = path.join(dataDir, 'plants.json');
        if (!fs.existsSync(plantsFile)) {
            return res.json([]);
        }
        const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
        // Only return id and label — no internal data
        res.json(plants.map(p => ({ id: p.id, label: p.label })));
    } catch (err) {
        console.error('Public plants list error:', err);
        res.status(500).json({ error: 'Failed to fetch plants' });
    }
});

// GET /api/public/request-status/:ref — Check status of a submitted request
router.get('/public/request-status/:ref', (req, res) => {
    try {
        const ref = req.params.ref;
        const plantsFile = path.join(dataDir, 'plants.json');
        const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
        const Database = require('better-sqlite3');

        for (const p of plants) {
            const dbPath = path.join(dataDir, `${p.id}.db`);
            if (!fs.existsSync(dbPath)) continue;
            try {
                const plantDb = new Database(dbPath, { readonly: true });
                const wo = plantDb.prepare('SELECT WorkOrderNumber, Description, StatusID, Priority, AddDate, CompDate FROM Work WHERE WorkOrderNumber = ?').get(ref);
                plantDb.close();
                if (wo) {
                    return res.json({
                        found: true,
                        referenceNumber: wo.WorkOrderNumber,
                        status: wo.StatusID,
                        priority: wo.Priority,
                        submittedAt: wo.AddDate,
                        completedAt: wo.CompDate || null,
                        plant: p.label
                    });
                }
            } catch (e) { /* skip */ }
        }

        res.json({ found: false, message: 'Reference number not found' });
    } catch (err) {
        console.error('Request status check error:', err);
        res.status(500).json({ error: 'Failed to check request status' });
    }
});


// ═══════════════════════════════════════════════════════════════
// 4. FAILURE / CAUSE / REMEDY CODES
// ═══════════════════════════════════════════════════════════════

// Ensure FailureCodes table exists
function ensureFailureCodesTable(plantDb) {
    try {
        plantDb.prepare(`
            CREATE TABLE IF NOT EXISTS FailureCodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                woId TEXT NOT NULL,
                failureCode TEXT,
                failureDesc TEXT,
                causeCode TEXT,
                causeDesc TEXT,
                remedyCode TEXT,
                remedyDesc TEXT,
                severity TEXT DEFAULT 'Medium',
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                createdBy TEXT
            )
        `).run();
    } catch (e) {
        // Ignore errors for readonly databases like all_sites
    }
}

// Ensure FailureCodeLibrary table exists (master list of codes)
function ensureFailureLibrary(plantDb) {
    try {
        plantDb.prepare(`
            CREATE TABLE IF NOT EXISTS FailureCodeLibrary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codeType TEXT NOT NULL,
                code TEXT NOT NULL,
                description TEXT,
                category TEXT,
                active INTEGER DEFAULT 1,
                UNIQUE(codeType, code)
            )
        `).run();

        // Seed default codes if empty
        const count = plantDb.prepare('SELECT COUNT(*) as c FROM FailureCodeLibrary').get().c;
        if (count === 0) {
            const defaults = [
                // Failure codes
                ['failure', 'F-BRK', 'Bearing Failure', 'Mechanical'],
                ['failure', 'F-MTR', 'Motor Failure', 'Electrical'],
                ['failure', 'F-SEAL', 'Seal/Gasket Failure', 'Mechanical'],
                ['failure', 'F-PUMP', 'Pump Failure', 'Mechanical'],
                ['failure', 'F-CORR', 'Corrosion/Erosion', 'Material'],
                ['failure', 'F-ELEC', 'Electrical Fault', 'Electrical'],
                ['failure', 'F-INST', 'Instrument Failure', 'Instrumentation'],
                ['failure', 'F-BELT', 'Belt/Chain Failure', 'Mechanical'],
                ['failure', 'F-VALVE', 'Valve Failure', 'Mechanical'],
                ['failure', 'F-LEAK', 'Leak/Rupture', 'Piping'],
                ['failure', 'F-CTRL', 'Control System Failure', 'Electrical'],
                ['failure', 'F-VIBR', 'Excessive Vibration', 'Mechanical'],
                ['failure', 'F-TEMP', 'Overheating', 'Thermal'],
                ['failure', 'F-FAT', 'Fatigue/Stress Crack', 'Material'],
                ['failure', 'F-MISC', 'Other/Unknown', 'General'],
                // Cause codes
                ['cause', 'C-WEAR', 'Normal Wear', 'Wear'],
                ['cause', 'C-ABUSE', 'Operator Error/Misuse', 'Human'],
                ['cause', 'C-LUBE', 'Lubrication Failure', 'Maintenance'],
                ['cause', 'C-ALIGN', 'Misalignment', 'Installation'],
                ['cause', 'C-OVERLD', 'Overload/Overspeed', 'Operational'],
                ['cause', 'C-CONTAM', 'Contamination', 'Environmental'],
                ['cause', 'C-AGE', 'Age/End of Life', 'Wear'],
                ['cause', 'C-DESIGN', 'Design Deficiency', 'Engineering'],
                ['cause', 'C-MAINT', 'Inadequate Maintenance', 'Maintenance'],
                ['cause', 'C-INST', 'Improper Installation', 'Installation'],
                ['cause', 'C-POWER', 'Power Supply Issue', 'Electrical'],
                ['cause', 'C-ENV', 'Environmental (weather, chemicals)', 'Environmental'],
                ['cause', 'C-MISC', 'Other/Unknown', 'General'],
                // Remedy codes
                ['remedy', 'R-REP', 'Repair in Place', 'Repair'],
                ['remedy', 'R-REPL', 'Replace Component', 'Replace'],
                ['remedy', 'R-REBLD', 'Rebuild/Overhaul', 'Rebuild'],
                ['remedy', 'R-ADJ', 'Adjust/Align', 'Adjust'],
                ['remedy', 'R-LUBE', 'Lubricate/Grease', 'Lubrication'],
                ['remedy', 'R-CLEAN', 'Clean/Flush', 'Cleaning'],
                ['remedy', 'R-CALIB', 'Calibrate/Tune', 'Calibration'],
                ['remedy', 'R-WELD', 'Weld/Fabricate', 'Fabrication'],
                ['remedy', 'R-ELECT', 'Electrical Repair/Rewire', 'Electrical'],
                ['remedy', 'R-TEMP', 'Temporary Fix/Bypass', 'Temporary'],
                ['remedy', 'R-MOD', 'Modify/Upgrade', 'Modification'],
                ['remedy', 'R-MISC', 'Other', 'General'],
            ];

            const insert = plantDb.prepare('INSERT OR IGNORE INTO FailureCodeLibrary (codeType, code, description, category) VALUES (?, ?, ?, ?)');
            const insertMany = plantDb.transaction((rows) => {
                for (const row of rows) insert.run(...row);
            });
            insertMany(defaults);
            console.log(`📋 Seeded ${defaults.length} default failure/cause/remedy codes`);
        }
    } catch (e) {
        // Ignore errors for readonly databases like all_sites
    }
}

// GET /api/failure-codes/library — Get all available codes
router.get('/failure-codes/library', (req, res) => {
    try {
        const plantDb = db.getDb();
        ensureFailureLibrary(plantDb);
        let codes = [];
        try {
            codes = plantDb.prepare('SELECT * FROM FailureCodeLibrary WHERE active = 1 ORDER BY codeType, code').all();
        } catch (e) {
            // Table might not exist yet on readonly dbs
        }
        res.json(codes);
    } catch (err) {
        console.error('GET failure code library error:', err);
        res.status(500).json({ error: 'Failed to fetch failure codes library' });
    }
});

// GET /api/failure-codes/:woId — Get failure codes for a work order
router.get('/failure-codes/:woId', (req, res) => {
    try {
        const plantDb = db.getDb();
        ensureFailureCodesTable(plantDb);
        let codes = [];
        try {
            codes = plantDb.prepare('SELECT * FROM FailureCodes WHERE woId = ? ORDER BY createdAt DESC').all(req.params.woId);
        } catch (e) {
            // Table might not exist yet on readonly dbs
        }
        res.json(codes);
    } catch (err) {
        console.error('GET failure codes error:', err);
        res.status(500).json({ error: 'Failed to fetch failure codes' });
    }
});

// POST /api/failure-codes/:woId — Add failure code to work order
router.post('/failure-codes/:woId', (req, res) => {
    try {
        const { failureCode, failureDesc, causeCode, causeDesc, remedyCode, remedyDesc, severity } = req.body;
        const plantDb = db.getDb();
        ensureFailureCodesTable(plantDb);

        const result = plantDb.prepare(`
            INSERT INTO FailureCodes (woId, failureCode, failureDesc, causeCode, causeDesc, remedyCode, remedyDesc, severity, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            req.params.woId,
            failureCode || '', failureDesc || '',
            causeCode || '', causeDesc || '',
            remedyCode || '', remedyDesc || '',
            severity || 'Medium',
            req.user?.Username || 'system'
        );

        console.log(`🔧 Failure code added to WO ${req.params.woId}: ${failureCode} / ${causeCode} / ${remedyCode}`);
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        console.error('POST failure code error:', err);
        res.status(500).json({ error: 'Failed to add failure code' });
    }
});

// DELETE /api/failure-codes/:id — Remove a failure code entry
router.delete('/failure-codes/:id', (req, res) => {
    try {
        const plantDb = db.getDb();
        plantDb.prepare('DELETE FROM FailureCodes WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE failure code error:', err);
        res.status(500).json({ error: 'Failed to delete failure code' });
    }
});


// ═══════════════════════════════════════════════════════════════
// 5. SCHEDULED REPORT DELIVERY
// ═══════════════════════════════════════════════════════════════

// Ensure ScheduledReports table exists
function ensureScheduledReportsTable(plantDb) {
    try {
        plantDb.prepare(`
            CREATE TABLE IF NOT EXISTS ScheduledReports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reportName TEXT NOT NULL,
                reportType TEXT NOT NULL,
                schedule TEXT NOT NULL DEFAULT 'weekly',
                dayOfWeek INTEGER DEFAULT 1,
                dayOfMonth INTEGER DEFAULT 1,
                timeOfDay TEXT DEFAULT '07:00',
                recipients TEXT NOT NULL,
                format TEXT DEFAULT 'pdf',
                filters TEXT,
                active INTEGER DEFAULT 1,
                lastSent TEXT,
                nextSend TEXT,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                createdBy TEXT
            )
        `).run();
    } catch (e) {
        // Ignore errors for readonly databases like all_sites
    }
}

// GET /api/scheduled-reports — List all scheduled reports
router.get('/scheduled-reports', (req, res) => {
    try {
        const plantDb = db.getDb();
        ensureScheduledReportsTable(plantDb);
        let reports = [];
        try {
            reports = plantDb.prepare('SELECT * FROM ScheduledReports ORDER BY reportName').all();
        } catch (e) {
            // Table might not exist yet on readonly dbs
        }
        res.json(reports);
    } catch (err) {
        console.error('GET scheduled reports error:', err);
        res.status(500).json({ error: 'Failed to fetch scheduled reports' });
    }
});

// POST /api/scheduled-reports — Create a scheduled report
router.post('/scheduled-reports', (req, res) => {
    try {
        const { reportName, reportType, schedule, dayOfWeek, dayOfMonth, timeOfDay, recipients, format, filters } = req.body;

        if (!reportName || !reportType || !recipients) {
            return res.status(400).json({ error: 'reportName, reportType, and recipients are required' });
        }

        const plantDb = db.getDb();
        ensureScheduledReportsTable(plantDb);

        // Calculate next send time
        const nextSend = calculateNextSend(schedule || 'weekly', dayOfWeek || 1, dayOfMonth || 1, timeOfDay || '07:00');

        const result = plantDb.prepare(`
            INSERT INTO ScheduledReports (reportName, reportType, schedule, dayOfWeek, dayOfMonth, timeOfDay, recipients, format, filters, nextSend, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            reportName, reportType, schedule || 'weekly',
            dayOfWeek || 1, dayOfMonth || 1, timeOfDay || '07:00',
            recipients, format || 'pdf',
            JSON.stringify(filters || {}),
            nextSend,
            req.user?.Username || 'system'
        );

        console.log(`📊 Scheduled report created: "${reportName}" (${schedule}) → ${recipients}`);
        res.status(201).json({ success: true, id: result.lastInsertRowid, nextSend });
    } catch (err) {
        console.error('POST scheduled report error:', err);
        res.status(500).json({ error: 'Failed to create scheduled report' });
    }
});

// PUT /api/scheduled-reports/:id — Update a scheduled report
router.put('/scheduled-reports/:id', (req, res) => {
    try {
        const { reportName, reportType, schedule, dayOfWeek, dayOfMonth, timeOfDay, recipients, format, filters, active } = req.body;
        const plantDb = db.getDb();

        const nextSend = calculateNextSend(schedule || 'weekly', dayOfWeek || 1, dayOfMonth || 1, timeOfDay || '07:00');

        plantDb.prepare(`
            UPDATE ScheduledReports SET reportName=?, reportType=?, schedule=?, dayOfWeek=?, dayOfMonth=?, timeOfDay=?, recipients=?, format=?, filters=?, active=?, nextSend=?
            WHERE id = ?
        `).run(
            reportName, reportType, schedule || 'weekly',
            dayOfWeek || 1, dayOfMonth || 1, timeOfDay || '07:00',
            recipients, format || 'pdf',
            JSON.stringify(filters || {}),
            active !== undefined ? active : 1,
            nextSend,
            req.params.id
        );

        res.json({ success: true, nextSend });
    } catch (err) {
        console.error('PUT scheduled report error:', err);
        res.status(500).json({ error: 'Failed to update scheduled report' });
    }
});

// DELETE /api/scheduled-reports/:id
router.delete('/scheduled-reports/:id', (req, res) => {
    try {
        const plantDb = db.getDb();
        plantDb.prepare('DELETE FROM ScheduledReports WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE scheduled report error:', err);
        res.status(500).json({ error: 'Failed to delete scheduled report' });
    }
});

// Helper: Calculate next send timestamp
function calculateNextSend(schedule, dayOfWeek, dayOfMonth, timeOfDay) {
    const now = new Date();
    const [hours, minutes] = (timeOfDay || '07:00').split(':').map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);

    if (schedule === 'daily') {
        if (next <= now) next.setDate(next.getDate() + 1);
    } else if (schedule === 'weekly') {
        const currentDay = now.getDay();
        let daysUntil = (dayOfWeek - currentDay + 7) % 7;
        if (daysUntil === 0 && next <= now) daysUntil = 7;
        next.setDate(next.getDate() + daysUntil);
    } else if (schedule === 'monthly') {
        next.setDate(dayOfMonth || 1);
        if (next <= now) next.setMonth(next.getMonth() + 1);
    }

    return next.toISOString();
}

// ═══════════════════════════════════════════════════════════════
// 6. TECHNICIAN WORKLOAD CAPACITY VIEW
// ═══════════════════════════════════════════════════════════════

router.get('/technician-workload', (req, res) => {
    try {
        const plantDb = db.getDb();
        const CAPACITY_THRESHOLD = 8; // WOs before "overloaded"

        // Get all active (non-completed, non-cancelled) WOs grouped by assigned tech
        const activeWOs = plantDb.prepare(`
            SELECT 
                w.rowid as id,
                w.WorkOrderNumber as woNumber,
                w.Description as description,
                w.AssignToID as assignedTo,
                w.StatusID as statusId,
                w.TypeID as typeId,
                w.Priority as priority,
                w.SchDate as schDate,
                w.AstID as assetId
            FROM Work w
            WHERE w.AssignToID IS NOT NULL 
              AND w.AssignToID != ''
              AND (
                  w.StatusID NOT IN ('50', 'Completed', 'completed', 'complete', 'closed', 'Cancelled', 'cancelled', 'canceled')
                  OR w.StatusID IS NULL
              )
            ORDER BY w.AssignToID, w.Priority ASC
        `).all();

        // Get completed WOs in last 30 days per tech
        const recentCompleted = plantDb.prepare(`
            SELECT AssignToID as assignedTo, COUNT(*) as cnt 
            FROM Work 
            WHERE AssignToID IS NOT NULL AND AssignToID != ''
              AND StatusID IN ('50', 'Completed', 'completed', 'complete', 'closed')
              AND CompDate >= datetime('now', '-30 days')
            GROUP BY AssignToID
        `).all();

        const completedMap = {};
        recentCompleted.forEach(r => { completedMap[r.assignedTo] = r.cnt; });

        // Group by technician
        const techMap = {};
        activeWOs.forEach(wo => {
            const tech = wo.assignedTo;
            if (!techMap[tech]) {
                techMap[tech] = {
                    name: tech,
                    activeCount: 0,
                    pmCount: 0,
                    emergencyCount: 0,
                    completedCount: completedMap[tech] || 0,
                    workOrders: []
                };
            }

            const desc = (wo.description || '').toLowerCase();
            const typeId = (wo.typeId || '').toString().toLowerCase();
            const statusId = String(wo.statusId || '');

            let type = 'wo';
            if (desc.includes('emergency') || typeId.includes('emergency') || wo.priority <= 1) {
                type = 'emergency';
                techMap[tech].emergencyCount++;
            } else if (desc.includes('[pm-auto]') || typeId === 'pm') {
                type = 'pm';
                techMap[tech].pmCount++;
            }

            let statusLabel = 'Open';
            if (statusId === '20' || statusId.toLowerCase() === 'in progress') statusLabel = 'In Progress';
            else if (statusId === '40' || statusId.toLowerCase() === 'plan') statusLabel = 'Planned';
            else if (statusId === '10') statusLabel = 'Requested';

            techMap[tech].activeCount++;
            techMap[tech].workOrders.push({
                id: wo.id,
                woNumber: wo.woNumber,
                description: wo.description || 'Untitled',
                type,
                status: statusLabel,
                priority: wo.priority,
                schDate: wo.schDate,
                assetId: wo.assetId,
            });
        });

        const technicians = Object.values(techMap).sort((a, b) => b.activeCount - a.activeCount);
        const totalActive = technicians.reduce((sum, t) => sum + t.activeCount, 0);
        const totalCompleted = Object.values(completedMap).reduce((sum, c) => sum + c, 0);
        const overloaded = technicians.filter(t => t.activeCount >= CAPACITY_THRESHOLD).length;

        res.json({
            technicians,
            capacityThreshold: CAPACITY_THRESHOLD,
            summary: {
                totalActive,
                totalCompleted,
                overloaded,
                avgPerTech: technicians.length > 0 ? totalActive / technicians.length : 0,
            }
        });
    } catch (err) {
        console.error('GET technician-workload error:', err);
        res.status(500).json({ error: 'Failed to fetch workload data' });
    }
});

module.exports = router;
