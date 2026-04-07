// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Plant Manifest Cache
 * ==========================================
 * Loads plants.json ONCE at startup and provides a cached getter.
 * Eliminates redundant fs.readFileSync calls on every request.
 * 
 * Auto-refreshes every 5 minutes to pick up new plant additions
 * without requiring a server restart.
 */
const fs = require('fs');
const path = require('path');

const PLANTS_FILE = path.join(require('./resolve_data_dir'), 'plants.json');
let _cache = null;
let _lastLoad = 0;
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

function getPlants() {
    const now = Date.now();
    if (!_cache || (now - _lastLoad) > REFRESH_INTERVAL) {
        try {
            _cache = JSON.parse(fs.readFileSync(PLANTS_FILE, 'utf8'));
            _lastLoad = now;
        } catch (err) {
            console.error('⚠️ Failed to load plants.json:', err.message);
            return _cache || []; // Return stale cache if available
        }
    }
    return _cache;
}

function invalidate() {
    _cache = null;
    _lastLoad = 0;
}

module.exports = { getPlants, invalidate };
