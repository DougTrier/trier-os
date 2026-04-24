// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS — LDAP / Active Directory Integration Routes
 * ======================================================
 * Enterprise directory integration with toggle switch.
 * When OFF: all local auth, zero external dependencies.
 * When ON: LDAP-first auth with local fallback.
 *
 * ENDPOINTS:
 *   GET  /api/ldap/config     — Get current LDAP config (password masked)
 *   PUT  /api/ldap/config     — Save LDAP configuration
 *   POST /api/ldap/test       — Test connection to AD server
 *   POST /api/ldap/sync       — Manual sync: pull users from AD → local; writes UserADGroups
 *   GET  /api/ldap/role-map   — List GatekeeperRoleMap entries (AD group → ActionClass)
 *   PUT  /api/ldap/role-map   — Upsert a GatekeeperRoleMap entry
 */
const express = require('express');
const router = express.Router();

module.exports = function(authDb) {

    // ── Helper: ensure ldap_config table exists ──
    const ensureTable = () => {
        authDb.exec(`
            CREATE TABLE IF NOT EXISTS ldap_config (
                ID INTEGER PRIMARY KEY DEFAULT 1,
                Enabled INTEGER DEFAULT 0,
                Host TEXT DEFAULT '',
                Port INTEGER DEFAULT 389,
                UseTLS INTEGER DEFAULT 0,
                BaseDN TEXT DEFAULT '',
                BindDN TEXT DEFAULT '',
                BindPassword TEXT DEFAULT '',
                SearchFilter TEXT DEFAULT '(&(objectClass=user)(sAMAccountName={{username}}))',
                RoleMapping TEXT DEFAULT '{}',
                SyncInterval INTEGER DEFAULT 15,
                LastSyncAt TEXT,
                UpdatedAt TEXT DEFAULT (datetime('now'))
            );
            INSERT OR IGNORE INTO ldap_config (ID) VALUES (1);
        `);
    };
    ensureTable();

    // ── GET /api/ldap/config — Return config (password masked) ──
    router.get('/config', (req, res) => {
        try {
            const config = authDb.prepare('SELECT * FROM ldap_config WHERE ID = 1').get();
            if (!config) return res.json({ Enabled: 0 });
            // Mask the bind password
            const masked = { ...config };
            if (masked.BindPassword) {
                masked.BindPassword = masked.BindPassword.length > 0 ? '••••••••' : '';
            }
            res.json(masked);
        } catch (err) {
            console.error('[LDAP] Config fetch error:', err.message);
            res.status(500).json({ error: 'Failed to fetch LDAP config' });
        }
    });

    // ── PUT /api/ldap/config — Save LDAP configuration ──
    router.put('/config', (req, res) => {
        try {
            const {
                Enabled, Host, Port, UseTLS,
                BaseDN, BindDN, BindPassword,
                SearchFilter, RoleMapping, SyncInterval
            } = req.body;

            // Get current config to preserve password if not changed
            const current = authDb.prepare('SELECT BindPassword FROM ldap_config WHERE ID = 1').get();
            const actualPassword = (BindPassword && BindPassword !== '••••••••')
                ? BindPassword
                : (current?.BindPassword || '');

            authDb.prepare(`
                UPDATE ldap_config SET
                    Enabled = ?,
                    Host = ?,
                    Port = ?,
                    UseTLS = ?,
                    BaseDN = ?,
                    BindDN = ?,
                    BindPassword = ?,
                    SearchFilter = ?,
                    RoleMapping = ?,
                    SyncInterval = ?,
                    UpdatedAt = datetime('now')
                WHERE ID = 1
            `).run(
                Enabled ? 1 : 0,
                Host || '',
                Port || 389,
                UseTLS ? 1 : 0,
                BaseDN || '',
                BindDN || '',
                actualPassword,
                SearchFilter || '(&(objectClass=user)(sAMAccountName={{username}}))',
                typeof RoleMapping === 'string' ? RoleMapping : JSON.stringify(RoleMapping || {}),
                SyncInterval || 15
            );

            console.log(`[LDAP] Config updated. Enabled: ${Enabled ? 'YES' : 'NO'}, Host: ${Host || '(none)'}`);
            res.json({ success: true, message: 'LDAP configuration saved' });
        } catch (err) {
            console.error('[LDAP] Config save error:', err.message);
            res.status(500).json({ error: 'Failed to save LDAP config' });
        }
    });

    // ── POST /api/ldap/test — Test connection to AD server ──
    router.post('/test', async (req, res) => {
        try {
            const config = authDb.prepare('SELECT * FROM ldap_config WHERE ID = 1').get();
            if (!config || !config.Host) {
                return res.json({ success: false, error: 'No LDAP host configured' });
            }

            // Try to dynamically require ldapjs
            let ldap;
            try {
                ldap = require('ldapjs');
            } catch (e) {
                // ldapjs not installed — simulate the test
                return res.json({
                    success: false,
                    error: 'ldapjs package not installed. Run: npm install ldapjs',
                    simulated: true,
                    details: {
                        host: config.Host,
                        port: config.Port,
                        tls: config.UseTLS ? 'Yes' : 'No',
                        baseDN: config.BaseDN,
                        bindDN: config.BindDN,
                        message: 'Connection test requires the ldapjs npm package. Install it when ready to connect to your Active Directory server.'
                    }
                });
            }

            // Real LDAP connection test
            const url = `${config.UseTLS ? 'ldaps' : 'ldap'}://${config.Host}:${config.Port}`;
            const client = ldap.createClient({
                url,
                connectTimeout: 5000,
                timeout: 5000,
                tlsOptions: { rejectUnauthorized: false }
            });

            const testResult = await new Promise((resolve) => {
                const timer = setTimeout(() => {
                    client.destroy();
                    resolve({ success: false, error: 'Connection timed out after 5 seconds' });
                }, 6000);

                client.on('error', (err) => {
                    clearTimeout(timer);
                    resolve({ success: false, error: 'Connection failed' });
                });

                client.on('connect', () => {
                    // Try to bind
                    if (config.BindDN && config.BindPassword) {
                        client.bind(config.BindDN, config.BindPassword, (bindErr) => {
                            clearTimeout(timer);
                            if (bindErr) {
                                client.unbind();
                                resolve({ success: false, error: `Bind failed: ${bindErr.message}`, connected: true });
                            } else {
                                // Test search
                                client.search(config.BaseDN, { scope: 'sub', filter: '(objectClass=user)', sizeLimit: 1 }, (searchErr, searchRes) => {
                                    if (searchErr) {
                                        client.unbind();
                                        resolve({ success: true, connected: true, bound: true, searchable: false, error: `Search failed: ${searchErr.message}` });
                                        return;
                                    }
                                    let count = 0;
                                    searchRes.on('searchEntry', () => count++);
                                    searchRes.on('end', () => {
                                        client.unbind();
                                        resolve({ success: true, connected: true, bound: true, searchable: true, sampleCount: count, message: `Successfully connected, authenticated, and searched. Found ${count} sample user(s).` });
                                    });
                                    searchRes.on('error', (e) => {
                                        client.unbind();
                                        resolve({ success: true, connected: true, bound: true, searchable: false, error: e.message });
                                    });
                                });
                            }
                        });
                    } else {
                        clearTimeout(timer);
                        client.unbind();
                        resolve({ success: true, connected: true, bound: false, message: 'Connected to LDAP server (anonymous). Set Bind DN and password for full test.' });
                    }
                });
            });

            console.log(`[LDAP] Test result:`, JSON.stringify(testResult));
            res.json(testResult);
        } catch (err) {
            console.error('[LDAP] Test error:', err.message);
            res.status(500).json({ success: false, error: 'An internal server error occurred' });
        }
    });

    // ── POST /api/ldap/sync — Manual sync: pull users from AD → local ──
    router.post('/sync', async (req, res) => {
        try {
            const config = authDb.prepare('SELECT * FROM ldap_config WHERE ID = 1').get();
            if (!config || !config.Enabled) {
                return res.json({ success: false, error: 'LDAP integration is not enabled' });
            }
            if (!config.Host) {
                return res.json({ success: false, error: 'No LDAP host configured' });
            }

            let ldap;
            try {
                ldap = require('ldapjs');
            } catch (e) {
                return res.json({
                    success: false,
                    error: 'ldapjs package not installed. Run: npm install ldapjs',
                    simulated: true
                });
            }

            const url = `${config.UseTLS ? 'ldaps' : 'ldap'}://${config.Host}:${config.Port}`;
            const client = ldap.createClient({
                url,
                connectTimeout: 10000,
                timeout: 10000,
                tlsOptions: { rejectUnauthorized: false }
            });

            const syncResult = await new Promise((resolve) => {
                client.bind(config.BindDN, config.BindPassword, (bindErr) => {
                    if (bindErr) {
                        resolve({ success: false, error: `Bind failed: ${bindErr.message}` });
                        return;
                    }

                    // SECURITY: Use objectClass filter for full sync (not user-supplied input here)
                    // The SearchFilter with '*' is safe for sync as it's not user-controlled
                    const filter = config.SearchFilter.replace('{{username}}', '*');
                    client.search(config.BaseDN, {
                        scope: 'sub',
                        filter,
                        attributes: ['sAMAccountName', 'displayName', 'mail', 'telephoneNumber', 'title', 'memberOf']
                    }, (searchErr, searchRes) => {
                        if (searchErr) {
                            client.unbind();
                            resolve({ success: false, error: `Search failed: ${searchErr.message}` });
                            return;
                        }

                        const users = [];
                        searchRes.on('searchEntry', (entry) => {
                            const attrs = {};
                            const pojo = entry.ppiPojo || entry.pojo || entry;
                            if (pojo.attributes) {
                                pojo.attributes.forEach(a => {
                                    if (a.type === 'memberOf') {
                                        attrs[a.type] = a.values || [];
                                    } else {
                                        attrs[a.type] = a.values && a.values.length > 0 ? a.values[0] : '';
                                    }
                                });
                            }
                            users.push(attrs);
                        });

                        searchRes.on('end', () => {
                            client.unbind();

                            // Parse role mapping
                            let roleMap = {};
                            try { roleMap = JSON.parse(config.RoleMapping || '{}'); } catch (e) {}

                            let created = 0, updated = 0, skipped = 0;

                            for (const u of users) {
                                const username = u.sAMAccountName || u.cn;
                                if (!username) { skipped++; continue; }

                                // Determine role from AD group membership
                                let role = 'employee';
                                const memberOf = Array.isArray(u.memberOf) ? u.memberOf : (u.memberOf ? [u.memberOf] : []);
                                for (const [adGroup, trierRole] of Object.entries(roleMap)) {
                                    if (memberOf.some(g => g.toLowerCase().includes(adGroup.toLowerCase()))) {
                                        role = trierRole;
                                        break;
                                    }
                                }

                                // Check if user exists
                                let userId;
                                const existing = authDb.prepare('SELECT UserID FROM Users WHERE Username = ?').get(username);
                                if (existing) {
                                    userId = existing.UserID;
                                    // Update display name, email, etc.
                                    authDb.prepare(`
                                        UPDATE Users SET
                                            DisplayName = COALESCE(?, DisplayName),
                                            Email = COALESCE(?, Email),
                                            Phone = COALESCE(?, Phone),
                                            Title = COALESCE(?, Title),
                                            DefaultRole = ?
                                        WHERE Username = ?
                                    `).run(
                                        u.displayName || null,
                                        u.mail || null,
                                        u.telephoneNumber || null,
                                        u.title || null,
                                        role,
                                        username
                                    );
                                    updated++;
                                } else {
                                    // Create new user with random password (they'll auth via LDAP)
                                    const bcrypt = require('bcryptjs');
                                    const hash = bcrypt.hashSync('LDAP_AUTH_' + Date.now(), 10);
                                    const resInsert = authDb.prepare(`
                                        INSERT INTO Users (Username, PasswordHash, DefaultRole, DisplayName, Email, Phone, Title)
                                        VALUES (?, ?, ?, ?, ?, ?, ?)
                                    `).run(
                                        username,
                                        hash,
                                        role,
                                        u.displayName || username,
                                        u.mail || '',
                                        u.telephoneNumber || '',
                                        u.title || ''
                                    );
                                    userId = resInsert.lastInsertRowid;
                                    created++;
                                }

                                // Delete stale groups for this user, then insert current ones
                                authDb.prepare('DELETE FROM UserADGroups WHERE UserID = ?').run(userId);
                                const insertGroup = authDb.prepare(
                                    'INSERT OR IGNORE INTO UserADGroups (UserID, Username, ADGroup, SyncedAt) VALUES (?, ?, ?, ?)'
                                );
                                const now = new Date().toISOString();
                                for (const group of memberOf) {
                                    insertGroup.run(userId, username, group, now);
                                }
                            }

                            // Update last sync timestamp
                            authDb.prepare("UPDATE ldap_config SET LastSyncAt = datetime('now') WHERE ID = 1").run();

                            resolve({
                                success: true,
                                message: `Sync complete. ${created} created, ${updated} updated, ${skipped} skipped.`,
                                stats: { total: users.length, created, updated, skipped }
                            });
                        });

                        searchRes.on('error', (e) => {
                            client.unbind();
                            resolve({ success: false, error: e.message });
                        });
                    });
                });
            });

            console.log(`[LDAP] Sync result:`, JSON.stringify(syncResult));
            res.json(syncResult);
        } catch (err) {
            console.error('[LDAP] Sync error:', err.message);
            res.status(500).json({ success: false, error: 'An internal server error occurred' });
        }
    });

    // ── GET /api/ldap/status — Quick status check ──
    router.get('/status', (req, res) => {
        try {
            const config = authDb.prepare('SELECT Enabled, Host, Port, LastSyncAt, SyncInterval FROM ldap_config WHERE ID = 1').get();
            res.json({
                enabled: config?.Enabled === 1,
                host: config?.Host || '',
                lastSync: config?.LastSyncAt || null,
                syncInterval: config?.SyncInterval || 15
            });
        } catch (err) {
            res.json({ enabled: false });
        }
    });

    // ── GET /api/ldap/role-map ──
    router.get('/role-map', (req, res) => {
        try {
            const logisticsDb = require('../logistics_db').db;
            const rows = logisticsDb.prepare('SELECT * FROM GatekeeperRoleMap ORDER BY ActionClass, ADGroup').all();
            res.json(rows);
        } catch (err) {
            console.error('[LDAP] GET /role-map error:', err.message);
            res.status(500).json({ error: 'Failed to fetch role map' });
        }
    });

    // ── PUT /api/ldap/role-map ──
    router.put('/role-map', (req, res) => {
        try {
            const { adGroup, actionClass, plantId, notes } = req.body;
            if (!adGroup || !actionClass) return res.status(400).json({ error: 'adGroup and actionClass are required' });
            
            const validClasses = ['SAFETY_CRITICAL', 'NON_CRITICAL', 'ADVISORY', 'READ_ONLY'];
            if (!validClasses.includes(actionClass)) {
                return res.status(400).json({ error: 'Invalid actionClass' });
            }

            const logisticsDb = require('../logistics_db').db;
            const result = logisticsDb.prepare(`
                INSERT OR REPLACE INTO GatekeeperRoleMap 
                (ADGroup, ActionClass, PlantID, Notes, UpdatedAt) 
                VALUES (?, ?, ?, ?, datetime('now'))
            `).run(adGroup, actionClass, plantId || null, notes || null);
            
            res.json({ ok: true, id: result.lastInsertRowid });
        } catch (err) {
            console.error('[LDAP] PUT /role-map error:', err.message);
            res.status(500).json({ error: 'Failed to update role map' });
        }
    });

    return router;
};
