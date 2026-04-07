// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Data Directory Resolver
 * =============================================
 * Single source of truth for resolving the data directory path.
 * Handles all deployment scenarios:
 *   - Development: data/ is at project root (../data relative to server/)
 *   - Packaged Electron: data/ is at resources/data (../../data relative to server/)
 *   - DATA_DIR env var: Always takes priority when set
 * 
 * USAGE:
 *   const dataDir = require('./resolve_data_dir');
 */
const path = require('path');
const fs = require('fs');

function resolveDataDir() {
    // 1. Environment variable always wins (set by electron/main.js when spawning server)
    if (process.env.DATA_DIR) {
        const resolved = path.resolve(process.env.DATA_DIR);
        if (!fs.existsSync(resolved)) {
            console.log('[DATA_DIR] Creating DATA_DIR from env var:', resolved);
            fs.mkdirSync(resolved, { recursive: true });
        }
        return resolved;
    }

    // 2. Packaged with pkg — __dirname is inside a snapshot, use exe location instead
    const isPkg = typeof process.pkg !== 'undefined';
    if (isPkg) {
        const exeDir = path.dirname(process.execPath);
        const pkgDataPath = path.join(exeDir, 'data');
        if (!fs.existsSync(pkgDataPath)) {
            console.log('[DATA_DIR] Creating data dir next to exe:', pkgDataPath);
            fs.mkdirSync(pkgDataPath, { recursive: true });
        }
        console.log('[DATA_DIR] Resolved to pkg path:', pkgDataPath);
        return pkgDataPath;
    }

    // 3. Development fallback: ../data (project_root/data)
    const devPath = path.join(__dirname, '..', 'data');
    if (fs.existsSync(devPath)) {
        return devPath;
    }

    // 4. Packaged Electron fallback: ../../data (resources/data)
    //    When packaged, __dirname is resources/app/server
    //    extraResources puts data at resources/data
    const electronPath = path.join(__dirname, '..', '..', 'data');
    if (fs.existsSync(electronPath)) {
        console.log('[DATA_DIR] Resolved to packaged Electron path:', electronPath);
        return electronPath;
    }

    // 5. Last resort: create the dev path
    console.warn('[DATA_DIR] No data directory found, creating:', devPath);
    fs.mkdirSync(devPath, { recursive: true });
    return devPath;
}

module.exports = resolveDataDir();
