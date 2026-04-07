// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Authentication Database (trier_auth.db)
 * ==============================================================
 * Initializes and manages the centralized RBAC security database.
 *
 * SCHEMA:
 *   Users          - UserID, Username, PasswordHash (bcrypt), DefaultRole, feature flags
 *   UserPlantRoles - Maps users to plant-specific roles (technician/manager/it_admin)
 *
 * DESIGN DECISIONS:
 *   - Inline ALTER TABLE migrations use try/catch to be idempotent (safe to re-run).
 *   - creator@trieros is always elevated to 'creator' role with full privileges.
 *   - creator account is seeded on first boot if not present.
 *   - Legacy auth.json is automatically migrated and renamed to .bak on first run.
 *
 * This module EXPORTS the raw Database handle (not a wrapper) because auth
 * queries are made directly by the auth routes and middleware.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const dataDir = require('./resolve_data_dir');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'trier_auth.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Seed schema for RBAC Security Model
db.exec(`
    CREATE TABLE IF NOT EXISTS Users (
        UserID INTEGER PRIMARY KEY AUTOINCREMENT,
        Username TEXT UNIQUE NOT NULL,
        PasswordHash TEXT NOT NULL,
        DefaultRole TEXT DEFAULT 'technician',
        MustChangePassword INTEGER DEFAULT 0,
        CanAccessDashboard INTEGER DEFAULT 0,
        GlobalAccess INTEGER DEFAULT 0,
        DisplayName TEXT,
        Email TEXT,
        Phone TEXT,
        Title TEXT
    );

    CREATE TABLE IF NOT EXISTS UserPlantRoles (
        UserID INTEGER NOT NULL,
        PlantID TEXT NOT NULL,
        RoleLevel TEXT NOT NULL,
        PRIMARY KEY (UserID, PlantID),
        FOREIGN KEY(UserID) REFERENCES Users(UserID) ON DELETE CASCADE
    );
`);

// Migration: Add columns if they don't exist (catches intentionally empty — column may already exist)
try { db.exec("ALTER TABLE Users ADD COLUMN MustChangePassword INTEGER DEFAULT 0;"); } catch(e){}
try { db.exec("ALTER TABLE Users ADD COLUMN CanAccessDashboard INTEGER DEFAULT 0;"); } catch(e){}
try { db.exec("ALTER TABLE Users ADD COLUMN GlobalAccess INTEGER DEFAULT 0;"); } catch(e){}
try { db.exec("ALTER TABLE Users ADD COLUMN CanImport INTEGER DEFAULT 0;"); } catch(e){}
try { db.exec("ALTER TABLE Users ADD COLUMN CanSAP INTEGER DEFAULT 0;"); } catch(e){}
try { db.exec("ALTER TABLE Users ADD COLUMN CanSensorConfig INTEGER DEFAULT 0;"); } catch(e){}
try { db.exec("ALTER TABLE Users ADD COLUMN CanSensorThresholds INTEGER DEFAULT 0;"); } catch(e){}
try { db.exec("ALTER TABLE Users ADD COLUMN CanSensorView INTEGER DEFAULT 0;"); } catch(e){}
try { db.exec("ALTER TABLE Users ADD COLUMN DisplayName TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE Users ADD COLUMN Email TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE Users ADD COLUMN Phone TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE Users ADD COLUMN Title TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE Users ADD COLUMN CanViewAnalytics INTEGER DEFAULT 0;"); } catch(e){}

// Ensure creator@trieros has the formal 'creator' role and IT Admin is fully empowered
db.prepare(`
    UPDATE Users 
    SET DefaultRole = 'creator', CanAccessDashboard = 1, GlobalAccess = 1, CanImport = 1, CanSAP = 1,
        CanSensorConfig = 1, CanSensorThresholds = 1, CanSensorView = 1, CanViewAnalytics = 1
    WHERE Username = 'creator@trieros'
`).run();

db.prepare(`
    UPDATE Users 
    SET CanAccessDashboard = 1, GlobalAccess = 1, CanImport = 1, CanSAP = 1,
        CanSensorConfig = 1, CanSensorThresholds = 1, CanSensorView = 1, CanViewAnalytics = 1
    WHERE DefaultRole IN ('creator', 'it_admin')
`).run();

// Auto-grant analytics access for management roles
db.prepare(`
    UPDATE Users SET CanViewAnalytics = 1
    WHERE DefaultRole IN ('general_manager', 'plant_manager', 'maintenance_manager')
`).run();

// Seed creator@trieros's contact info if he exists
db.prepare(`
    UPDATE Users 
    SET DisplayName = 'creator@trieros', 
        Title = 'System Creator', 
        Email = 'creator@trieros', 
        Phone = '555-0000' 
    WHERE Username = 'creator@trieros'
`).run();

// NOTE: it_admin is no longer auto-seeded. Administrators are created manually
// via Settings → Accounts & Permissions after first login as 'creator'.

// Seed 'creator' system admin account — separate identity for administrative access
const creatorAcctExists = db.prepare("SELECT 1 FROM Users WHERE Username = 'creator'").get();
if (!creatorAcctExists) {
    // SECURITY: Generate unique random password per deployment
    const creatorPassword = crypto.randomBytes(10).toString('base64url');
    const creatorHash = bcrypt.hashSync(creatorPassword, 10);
    const result = db.prepare(`
        INSERT INTO Users (Username, PasswordHash, DefaultRole, MustChangePassword,
                           CanAccessDashboard, GlobalAccess, CanImport, CanSAP,
                           CanSensorConfig, CanSensorThresholds, CanSensorView, CanViewAnalytics,
                           DisplayName, Title)
        VALUES ('creator', ?, 'creator', 1, 1, 1, 1, 1, 1, 1, 1, 1, 'System Creator', 'System Administrator')
    `).run(creatorHash);
    db.prepare("INSERT INTO UserPlantRoles (UserID, PlantID, RoleLevel) VALUES (?, 'all_sites', 'creator')").run(result.lastInsertRowid);
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  🔑  Creator System Admin Account Created                   ║');
    console.log(`║  Username: creator                                           ║`);
    console.log(`║  Password: ${creatorPassword.padEnd(46)}║`);
    console.log('║  ⚠️  SAVE THIS PASSWORD — it will not be shown again!       ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
}

// Ensure creator account always has full permissions
db.prepare(`
    UPDATE Users
    SET DefaultRole = 'creator', CanAccessDashboard = 1, GlobalAccess = 1, CanImport = 1, CanSAP = 1,
        CanSensorConfig = 1, CanSensorThresholds = 1, CanSensorView = 1, CanViewAnalytics = 1
    WHERE Username = 'creator'
`).run();

// --- OPEN SOURCE DEMO ACCOUNTS (Task 0.6) ---
// These accounts are strictly hardcoded to 'examples' bridging them off from real production data.
const demoAccounts = [
    { user: 'demo_tech', role: 'technician', name: 'Demo Technician', title: 'Maintenance Tech' },
    { user: 'demo_operator', role: 'operator', name: 'Demo Operator', title: 'Machine Operator' },
    { user: 'demo_maint_mgr', role: 'maintenance_manager', name: 'Demo Maintenance Mgr', title: 'Maintenance Manager' },
    { user: 'demo_plant_mgr', role: 'plant_manager', name: 'Demo Plant Mgr', title: 'Plant Manager' }
];

const demoPasswordHash = bcrypt.hashSync('TrierDemo2026!', 10);

demoAccounts.forEach(acc => {
    const exists = db.prepare("SELECT 1 FROM Users WHERE Username = ?").get(acc.user);
    if (!exists) {
        // Create user
        const result = db.prepare(`
            INSERT INTO Users (Username, PasswordHash, DefaultRole, MustChangePassword, DisplayName, Title, CanAccessDashboard, CanViewAnalytics)
            VALUES (?, ?, ?, 0, ?, ?, ?, ?)
        `).run(
            acc.user, demoPasswordHash, acc.role, acc.name, acc.title,
            (acc.role === 'technician' || acc.role === 'operator') ? 0 : 1, // Only managers get general dashboard 
            (acc.role === 'maintenance_manager' || acc.role === 'plant_manager') ? 1 : 0 // Only managers get analytics
        );
        // Bind strictly to examples
        db.prepare("INSERT INTO UserPlantRoles (UserID, PlantID, RoleLevel) VALUES (?, 'examples', ?)").run(result.lastInsertRowid, acc.role);
    }
});
// ----------------------------------------------

// NOTE: ghost_admin (Playwright test account) has been removed.
// E2E tests should authenticate as 'creator' or 'demo_*' accounts instead.

// Map existing auth.json locations to distinct user accounts, providing a clean upgrade path.
const authJsonPath = path.join(dataDir, 'auth.json');
if (fs.existsSync(authJsonPath)) {
    try {
        const authData = JSON.parse(fs.readFileSync(authJsonPath, 'utf8'));

        // Ensure master password from old structure aligns with it_admin
        if (authData.master) {
            db.prepare("UPDATE Users SET PasswordHash = ? WHERE Username = 'it_admin'").run(authData.master);
        }

        if (authData.plants) {
            for (const [plantId, passHash] of Object.entries(authData.plants)) {
                const username = `${plantId.toLowerCase()}_user`;
                const userExists = db.prepare('SELECT 1 FROM Users WHERE Username = ?').get(username);

                if (!userExists) {
                    const result = db.prepare("INSERT INTO Users (Username, PasswordHash, DefaultRole) VALUES (?, ?, 'technician')").run(username, passHash);
                    db.prepare("INSERT INTO UserPlantRoles (UserID, PlantID, RoleLevel) VALUES (?, ?, 'technician')").run(result.lastInsertRowid, plantId);
                }
            }
        }

        // Rename auth.json to auth.json.bak so the old legacy model is permanently retired
        fs.renameSync(authJsonPath, authJsonPath + '.bak');
        console.log('✅ RBAC Model Upgraded: auth.json successfully migrated to trier_auth.db Users table.');
    } catch (err) {
        console.error('❌ Failed to migrate auth.json to User Database:', err);
    }
}

// ── PERMANENT ACCOUNT PURGE ──────────────────────────────────────────────────
// These accounts are removed on every boot. They were internal dev/test accounts
// that are not part of the public open-source release.
const purgeAccounts = ['it_admin', 'ghost_admin', 'ghost_exec', 'ghost_tech'];
purgeAccounts.forEach(username => {
    const u = db.prepare('SELECT UserID FROM Users WHERE Username = ?').get(username);
    if (u) {
        db.prepare('DELETE FROM UserPlantRoles WHERE UserID = ?').run(u.UserID);
        db.prepare('DELETE FROM Users WHERE UserID = ?').run(u.UserID);
        console.log(`[Auth] Purged retired account: ${username}`);
    }
});
// ─────────────────────────────────────────────────────────────────────────────

module.exports = db;
