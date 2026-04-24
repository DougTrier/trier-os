// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * rbac.js — Gatekeeper RBAC Validator
 * =====================================
 * Validates whether the requesting user holds an AD group that is mapped 
 * to the required ActionClass. For SAFETY_CRITICAL actions, performs a   
 * live LDAP re-query rather than relying on cached sync data.
 *
 * Returns: { allowed: boolean, denialReason?: string }
 *
 * Fail-closed contract:
 *   - Any exception → { allowed: false, denialReason: 'RBAC_ERROR' }     
 *   - LDAP not configured + SAFETY_CRITICAL → { allowed: false, denialReason: 'LDAP_REQUIRED_FOR_SAFETY_CRITICAL' }
 *   - LDAP not configured + other class → { allowed: true } (no RBAC to enforce)
 */

'use strict';

// Dependencies
const { db: logisticsDb } = require('../../logistics_db');
const authDb = require('../../auth_db');

async function validateRole(intent) {
    try {
        const configRow = authDb.prepare('SELECT * FROM ldap_config WHERE ID = 1').get();
        const ldapEnabled = configRow && configRow.Enabled === 1;

        if (!ldapEnabled) {
            if (intent.actionClass === 'SAFETY_CRITICAL') {
                return { allowed: false, denialReason: 'LDAP_REQUIRED_FOR_SAFETY_CRITICAL' };
            }
            return { allowed: true };
        }

        // Load GatekeeperRoleMap entries that authorize intent.actionClass
        // Match rows where ActionClass = intent.actionClass AND (PlantID IS NULL OR PlantID = intent.plantId)
        const roleMapRows = logisticsDb.prepare(`
            SELECT ADGroup FROM GatekeeperRoleMap 
            WHERE ActionClass = ? AND (PlantID IS NULL OR PlantID = ?)
        `).all(intent.actionClass, intent.plantId || null);

        if (roleMapRows.length === 0) {
            return { allowed: false, denialReason: 'NO_ROLE_MAP_FOR_ACTION_CLASS' };
        }

        const authorizedGroups = roleMapRows.map(row => row.ADGroup);

        if (intent.actionClass === 'SAFETY_CRITICAL') {
            // Live AD re-check
            let ldap;
            try { 
                ldap = require('ldapjs'); 
            } catch (_) { 
                return { allowed: false, denialReason: 'LDAP_NOT_INSTALLED' };
            }

            return new Promise((resolve) => {
                let client = null;
                try {
                    const url = configRow.UseTLS === 1 ? `ldaps://${configRow.Host}:${configRow.Port}` : `ldap://${configRow.Host}:${configRow.Port}`;
                    client = ldap.createClient({
                        url: url,
                        timeout: 10000,
                        connectTimeout: 10000
                    });

                    let timeoutId = setTimeout(() => {
                        try { if (client) client.destroy(); } catch (e) {}
                        resolve({ allowed: false, denialReason: 'LDAP_TIMEOUT' });
                    }, 10000);

                    client.on('error', () => {
                        clearTimeout(timeoutId);
                        try { if (client) client.destroy(); } catch (e) {}
                        resolve({ allowed: false, denialReason: 'LDAP_LIVE_CHECK_FAILED' });
                    });

                    client.bind(configRow.BindDN, configRow.BindPassword, (err) => {
                        if (err) {
                            clearTimeout(timeoutId);
                            try { client.destroy(); } catch (e) {}
                            return resolve({ allowed: false, denialReason: 'LDAP_LIVE_CHECK_FAILED' });
                        }

                        const filterStr = configRow.SearchFilter ? configRow.SearchFilter.replace('{{username}}', intent.username) : `(sAMAccountName=${intent.username})`;
                        const opts = {
                            filter: filterStr,
                            scope: 'sub',
                            attributes: ['memberOf']
                        };

                        client.search(configRow.BaseDN, opts, (err, res) => {
                            if (err) {
                                clearTimeout(timeoutId);
                                try { client.destroy(); } catch (e) {}
                                return resolve({ allowed: false, denialReason: 'LDAP_LIVE_CHECK_FAILED' });
                            }

                            let foundGroups = [];

                            res.on('searchEntry', (entry) => {
                                const memberOfAttr = entry.attributes.find(a => a.type === 'memberOf');
                                if (memberOfAttr) {
                                    foundGroups = Array.isArray(memberOfAttr.vals) ? memberOfAttr.vals : [memberOfAttr.vals];
                                }
                            });

                            res.on('error', (err) => {
                                clearTimeout(timeoutId);
                                try { client.destroy(); } catch (e) {}
                                resolve({ allowed: false, denialReason: 'LDAP_LIVE_CHECK_FAILED' });
                            });

                            res.on('end', () => {
                                clearTimeout(timeoutId);
                                try { client.destroy(); } catch (e) {}
                                
                                const hasAccess = foundGroups.some(g => authorizedGroups.includes(g));
                                if (hasAccess) {
                                    resolve({ allowed: true });
                                } else {
                                    resolve({ allowed: false, denialReason: 'INSUFFICIENT_ROLE' });
                                }
                            });
                        });
                    });
                } catch (err) {
                    try { if (client) client.destroy(); } catch (e) {}
                    resolve({ allowed: false, denialReason: 'LDAP_LIVE_CHECK_FAILED' });
                }
            });

        } else {
            // Cached check for other classes
            const userGroupRows = authDb.prepare(`
                SELECT ADGroup FROM UserADGroups WHERE Username = ?
            `).all(intent.username);

            const userGroups = userGroupRows.map(r => r.ADGroup);
            const hasAccess = userGroups.some(g => authorizedGroups.includes(g));

            if (hasAccess) {
                return { allowed: true };
            } else {
                return { allowed: false, denialReason: 'INSUFFICIENT_ROLE' };
            }
        }
    } catch (err) {
        return { allowed: false, denialReason: 'RBAC_ERROR' };
    }
}

module.exports = { validateRole };
