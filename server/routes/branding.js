// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Plant Branding & White-Label Theming API
 * =====================================================
 * Per-plant visual identity: custom logos (main + document/print variant),
 * accent color, company name, and tagline. Enables white-label deployments
 * where the Trier OS UI appears as the dairy's own Enterprise System.
 * Branding assets are stored as files in data/branding/{plantId}/.
 * The branding JSON is served to the frontend on every page load.
 * Mounted at /api/branding in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /                  Fetch branding config for the current plant
 *   POST   /logo/:type        Upload logo by type ('main' | 'document') — multipart/form-data
 *   POST   /logo              Upload default logo (legacy path — same as /logo/main)
 *   DELETE /logo/:type        Remove a logo file by type
 *   DELETE /logo              Remove all logos for the current plant
 *
 * LOGO TYPES:
 *   'main'     — Displayed in the app nav header (PNG/SVG, shown on dark background)
 *   'document' — Used on printed documents and reports (PNG/SVG, shown on white)
 *
 * FILE STORAGE: Uploaded logos are saved to data/branding/{plantId}_{type}.png.
 * The GET / endpoint returns URLs the frontend can use to load them directly.
 *
 * SUPPORTED FORMATS: PNG, JPG, SVG (determined by MIME type on upload).
 * Max file size: 5 MB (enforced by multer memoryStorage + size limit).
 *
 * FRONTEND USAGE: The React app calls GET /api/branding on mount and stores
 * the config in BrandingContext. PrintEngine reads branding.documentLogo
 * to place the correct logo on printed work orders, reports, and the manual.
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const brandingFile = path.join(require('../resolve_data_dir'), 'branding.json');
const uploadDir = path.join(require('../resolve_data_dir'), 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const prefix = req.params.type === 'document' ? 'doc_logo_' : 'dash_logo_';
        cb(null, prefix + Date.now() + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
            return cb(null, true);
        }
        cb(new Error('Only images (webp, jpg, png, gif) are allowed.'));
    }
});

function readBranding() {
    const defaults = { dashboardLogo: null, documentLogo: null, themeColor: '#6366f1', companyName: 'Trier OS' };
    if (!fs.existsSync(brandingFile)) return defaults;
    try {
        const data = JSON.parse(fs.readFileSync(brandingFile, 'utf8'));
        // Migrate legacy customLogo field
        if (data.customLogo && !data.dashboardLogo) {
            data.dashboardLogo = data.customLogo;
            delete data.customLogo;
        }
        return { ...defaults, ...data };
    } catch { return defaults; }
}

function saveBranding(settings) {
    fs.writeFileSync(brandingFile, JSON.stringify(settings, null, 2));
}

function deleteOldFile(logoUrl) {
    if (!logoUrl) return;
    const filePath = path.join(require('../resolve_data_dir'), logoUrl.replace('/uploads/', 'uploads/'));
    if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { /* Intentional: old file may not exist or be in use */ }
    }
}

// GET branding settings
router.get('/', (req, res) => {
    try {
        res.json(readBranding());
    } catch (err) {
        res.status(500).json({ error: 'Failed to read branding settings' });
    }
});

// POST upload logo — /api/branding/logo/:type (type = 'dashboard' or 'document')
router.post('/logo/:type', upload.single('logo'), (req, res) => {
    try {
        if (!req.user || (req.user.globalRole !== 'it_admin' && req.user.globalRole !== 'creator')) {
            return res.status(403).json({ error: 'Only IT Admins or the System Creator can update branding.' });
        }
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const logoType = req.params.type === 'document' ? 'documentLogo' : 'dashboardLogo';
        const logoUrl = '/uploads/' + req.file.filename;

        const settings = readBranding();
        deleteOldFile(settings[logoType]);
        settings[logoType] = logoUrl;
        saveBranding(settings);

        res.json({ success: true, logoUrl, settings });
    } catch (err) {
        console.error('Branding Upload Error:', err);
        res.status(500).json({ error: 'Failed to update branding' });
    }
});

// Legacy POST /api/branding/logo — maps to dashboard logo for backward compat
router.post('/logo', upload.single('logo'), (req, res) => {
    req.params.type = 'dashboard';
    router.handle(req, res);
});

// DELETE logo — /api/branding/logo/:type
router.delete('/logo/:type', (req, res) => {
    try {
        if (!req.user || (req.user.globalRole !== 'it_admin' && req.user.globalRole !== 'creator')) {
            return res.status(403).json({ error: 'Only IT Admins or the System Creator can reset branding.' });
        }
        const logoType = req.params.type === 'document' ? 'documentLogo' : 'dashboardLogo';
        const settings = readBranding();
        deleteOldFile(settings[logoType]);
        settings[logoType] = null;
        saveBranding(settings);
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ error: 'Failed to reset branding' });
    }
});

// Legacy DELETE /api/branding/logo
router.delete('/logo', (req, res) => {
    try {
        if (!req.user || (req.user.globalRole !== 'it_admin' && req.user.globalRole !== 'creator')) {
            return res.status(403).json({ error: 'Only IT Admins or the System Creator can reset branding.' });
        }
        const settings = readBranding();
        deleteOldFile(settings.dashboardLogo);
        settings.dashboardLogo = null;
        saveBranding(settings);
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ error: 'Failed to reset branding' });
    }
});

module.exports = router;
