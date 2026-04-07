// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Site Leadership Directory API
 * ==========================================
 * Manages the leadership contact list for each plant — Plant Manager,
 * Maintenance Manager, Safety Manager, and other key personnel.
 * Leadership records appear in the dashboard header and the "All Sites"
 * corporate overview so every user knows who to call at any plant.
 * All data lives in trier_logistics.db (cross-plant directory).
 * Mounted at /api/leadership in server/index.js.
 *
 * ENDPOINTS:
 *   GET  /all        All leadership records across every plant (corporate view)
 *   GET  /           Leadership for the current plant (x-plant-id header)
 *   POST /sync       Bulk-sync leadership from an external source or import file
 *
 * DATA SOURCE: Records are bootstrapped from extracted_managers.json
 *   (parsed from the vendor address book during initial plant onboarding)
 *   and maintained manually via the LeadershipEditor.jsx component.
 *
 * RECORD FIELDS:
 *   PlantID, Name, Title, Email, Phone, Mobile, Department,
 *   IsEmergencyContact, DisplayOrder, PhotoURL
 *
 * CORPORATE VIEW: GET /all aggregates leadership across all plants for the
 *   executive dashboard and the USMapView plant tooltip cards.
 *   Returns records grouped by PlantID with plant metadata joined in.
 */
const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/leadership/all - Sweep all databases for an enterprise directory
router.get('/all', (req, res) => {
    try {
        console.log('  [Enterprise] Directory Sweep Initiated...');
        const fs = require('fs');
        const path = require('path');
        const plantsFile = path.join(require('../resolve_data_dir'), 'plants.json');
        const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

        const directory = [];

        // Corporate HQ entry removed — corporate contacts are managed
        // within the Corporate Dashboard quadrant view, not the site directory.

        // 2. Sweep all site DBs for SiteLeadership entries
        for (const p of plants) {
            const dbPath = path.join(require('../resolve_data_dir'), `${p.id}.db`);
            if (fs.existsSync(dbPath)) {
                try {
                    const tempDb = db.getDb(p.id);
                    const hasTable = tempDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='SiteLeadership'").get();
                    if (hasTable) {
                        const leaders = tempDb.prepare('SELECT * FROM SiteLeadership ORDER BY ID').all();
                        directory.push({ siteId: p.id, siteLabel: p.label, leaders: leaders });
                    } else {
                        directory.push({ siteId: p.id, siteLabel: p.label, leaders: [] });
                    }
                } catch (e) {
                    console.error(`Error sweeping site ${p.id}:`, e.message);
                    directory.push({ siteId: p.id, siteLabel: p.label, leaders: [] });
                }
            }
        }

        // 3. Auto-discover registered users from auth_db and merge into directory
        try {
            const authDb = require('../auth_db');
            const allUsers = authDb.prepare(
                `SELECT u.UserID, u.Username, u.DisplayName, u.Title, u.Email, u.Phone, u.DefaultRole
                 FROM Users u
                 WHERE u.DisplayName IS NOT NULL AND u.DisplayName != ''`
            ).all();
            const plantRoles = authDb.prepare('SELECT UserID, PlantID, RoleLevel FROM UserPlantRoles').all();

            // Build map: plantId -> [{Name, Title, Phone, Email, _source}]
            const usersByPlant = {};
            for (const role of plantRoles) {
                const user = allUsers.find(u => u.UserID === role.UserID);
                if (!user) continue;
                const contact = {
                    Name: user.DisplayName || user.Username,
                    Title: user.Title || role.RoleLevel || '',
                    Phone: user.Phone || '',
                    Email: user.Email || '',
                    _source: 'auth_db'
                };
                if (role.PlantID === 'all_sites') {
                    // Global/admin users should NOT appear in individual site contacts.
                    // They are system-level users, not site leadership.
                    continue;
                } else {
                    if (!usersByPlant[role.PlantID]) usersByPlant[role.PlantID] = [];
                    usersByPlant[role.PlantID].push(contact);
                }
            }

            // Merge into directory entries, avoiding name duplicates
            for (const entry of directory) {
                const extraUsers = usersByPlant[entry.siteId] || [];
                for (const u of extraUsers) {
                    const exists = entry.leaders.some(l => (l.Name || '').toLowerCase() === (u.Name || '').toLowerCase());
                    if (!exists) entry.leaders.push(u);
                }
            }
        } catch (e) {
            console.error('[Enterprise] Auto-discover auth_db users failed:', e.message);
        }

        console.log(`  [Enterprise] Directory Sweep Success. Compiled ${directory.length} sites.`);
        res.json(directory);
    } catch (err) {
        console.error('Failed to compile enterprise directory:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

// Get leadership for the current plant
router.get('/', (req, res) => {
    try {
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';

        if (plantId === 'all_sites') {
            const fs = require('fs');
            const path = require('path');
            const corpFile = path.join(require('../resolve_data_dir'), 'corporate_leadership.json');
            const corp = fs.existsSync(corpFile) ? JSON.parse(fs.readFileSync(corpFile, 'utf8')) : [];
            return res.json(corp);
        }

        const connection = db.getDb(plantId);
        const leadership = connection.prepare('SELECT * FROM SiteLeadership ORDER BY ID').all();
        res.json(leadership);
    } catch (err) {
        console.error('Failed to fetch leadership:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

// Update leadership (replaces the entire list for simple sync)
router.post('/sync', (req, res) => {
    try {
        const { leaders } = req.body; // Array of { Name, Title, Phone, Email }
        if (!Array.isArray(leaders)) {
            return res.status(400).json({ error: 'Expected an array' });
        }

        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';

        if (plantId === 'all_sites') {
            // Update corporate_leadership.json
            const fs = require('fs');
            const path = require('path');
            const corpFile = path.join(require('../resolve_data_dir'), 'corporate_leadership.json');
            fs.writeFileSync(corpFile, JSON.stringify(leaders, null, 2));
            return res.json({ success: true });
        }

        const connection = db.getDb(plantId);
        const syncTx = connection.transaction(() => {
            // Clear current
            connection.prepare('DELETE FROM SiteLeadership').run();

            // Insert new
            const stmt = connection.prepare(`
                INSERT INTO SiteLeadership (Name, Title, Phone, Email)
                VALUES (@Name, @Title, @Phone, @Email)
            `);

            for (const leader of leaders) {
                stmt.run(leader);
            }
        });

        syncTx();
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to sync leadership:', err);
        res.status(500).json({ error: 'Failed' });
    }
});


module.exports = router;
