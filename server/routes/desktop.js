// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Desktop Client (Electron) Download API
 * ===================================================
 * Serves pre-built Electron desktop client installers to authenticated users.
 * Enables one-click download from the Settings panel — no IT ticket required.
 * Build once with `npm run electron:build`; the resulting installers land in
 * electron-dist/ and are immediately available to all connected users.
 * Mounted at /api/desktop in server/index.js.
 *
 * ENDPOINTS:
 *   GET /status       Check if installers are available and return metadata
 *   GET /download/:type   Stream the installer file to the browser
 *
 * BUILD TYPES: windows (.exe, NSIS installer) | mac (.dmg) | linux (.AppImage)
 *   The :type param maps to the platform string used by electron-builder output.
 *
 * FILE DISCOVERY: GET /status scans electron-dist/ for installer files,
 *   reads their sizes and modification dates, and returns a manifest so the
 *   frontend can show "Windows installer — 85 MB — built 3 days ago".
 *
 * STREAMING: GET /download/:type pipes the installer file directly to the
 *   response stream with the correct Content-Disposition header for browser
 *   "Save As" dialog. No temp files or memory buffering for large installers.
 *
 * WHY ELECTRON: The desktop client enables offline mode with full local SQLite
 *   access, system tray notifications, barcode scanner USB HID input, and
 *   native file system access for LiDAR point cloud imports.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Where electron-builder outputs installers
const DIST_DIR = path.join(__dirname, '..', '..', 'electron-dist');

/**
 * GET /api/desktop/status
 * Check if installers are available for each platform
 */
router.get('/status', (req, res) => {
    const installers = {};

    try {
        if (!fs.existsSync(DIST_DIR)) {
            return res.json({ available: false, installers, message: 'No installers have been built yet.' });
        }

        const files = fs.readdirSync(DIST_DIR);

        // Look for Windows installer (.exe)
        const winFile = files.find(f => f.endsWith('.exe') && f.toLowerCase().includes('setup'));
        if (winFile) {
            const stat = fs.statSync(path.join(DIST_DIR, winFile));
            installers.windows = {
                filename: winFile,
                size: stat.size,
                sizeLabel: formatSize(stat.size),
                modified: stat.mtime.toISOString()
            };
        }

        // Look for macOS installer (.dmg)
        const macFile = files.find(f => f.endsWith('.dmg'));
        if (macFile) {
            const stat = fs.statSync(path.join(DIST_DIR, macFile));
            installers.mac = {
                filename: macFile,
                size: stat.size,
                sizeLabel: formatSize(stat.size),
                modified: stat.mtime.toISOString()
            };
        }

        // Look for Linux installer (.AppImage)
        const linuxFile = files.find(f => f.endsWith('.AppImage'));
        if (linuxFile) {
            const stat = fs.statSync(path.join(DIST_DIR, linuxFile));
            installers.linux = {
                filename: linuxFile,
                size: stat.size,
                sizeLabel: formatSize(stat.size),
                modified: stat.mtime.toISOString()
            };
        }

        const available = Object.keys(installers).length > 0;
        res.json({
            available,
            installers,
            message: available ? 'Installers ready for download.' : 'No installers have been built yet.'
        });
    } catch (err) {
        console.error('[Desktop] Status check error:', err.message);
        res.json({ available: false, installers: {}, message: 'Error checking installer status.' });
    }
});

/**
 * GET /api/desktop/download/:platform
 * Download the installer for the specified platform (windows, mac, linux)
 */
router.get('/download/:platform', (req, res) => {
    const platform = req.params.platform.toLowerCase();

    if (!fs.existsSync(DIST_DIR)) {
        return res.status(404).json({ error: 'No installers have been built yet. Ask your system administrator.' });
    }

    const files = fs.readdirSync(DIST_DIR);
    let targetFile = null;

    switch (platform) {
        case 'windows':
            targetFile = files.find(f => f.endsWith('.exe') && f.toLowerCase().includes('setup'));
            break;
        case 'mac':
            targetFile = files.find(f => f.endsWith('.dmg'));
            break;
        case 'linux':
            targetFile = files.find(f => f.endsWith('.AppImage'));
            break;
        default:
            return res.status(400).json({ error: `Unknown platform: ${platform}` });
    }

    if (!targetFile) {
        return res.status(404).json({ error: `No ${platform} installer found. Ask your system administrator to build it.` });
    }

    const filePath = path.join(DIST_DIR, targetFile);
    res.download(filePath, targetFile, (err) => {
        if (err) {
            console.error(`[Desktop] Download error for ${targetFile}:`, err.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Download failed.' });
            }
        }
    });
});

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

module.exports = router;
