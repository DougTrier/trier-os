// Copyright © 2026 Trier OS. All Rights Reserved.

const assert = require('assert');
const authDb = require('../../server/auth_db');
const logisticsModule = require('../../server/logistics_db');
const logisticsDb = logisticsModule.db;
const { validateRole } = require('../../server/gatekeeper/validators/rbac');

const originalAuthPrepare = authDb.prepare;
const originalLogisticsPrepare = logisticsDb.prepare;

let authDbState = {
    ldap_config: { Enabled: 0 },
    UserADGroups: []
};

let logisticsDbState = {
    GatekeeperRoleMap: []
};

let mockLdapInstallError = false;
let mockLdapSearchError = false;
let mockLdapFoundGroups = [];

// Mock ldapjs
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
    if (path === 'ldapjs') {
        if (mockLdapInstallError) throw new Error("Cannot find module 'ldapjs'");
        return {
            createClient: () => {
                const EventEmitter = require('events');
                const client = new EventEmitter();
                client.destroy = () => {};
                client.bind = (dn, pw, cb) => cb(null);
                client.search = (dn, opts, cb) => {
                    if (mockLdapSearchError) return cb(new Error('search error'));
                    const res = new EventEmitter();
                    cb(null, res);
                    setTimeout(() => {
                        res.emit('searchEntry', {
                            attributes: [{ type: 'memberOf', vals: mockLdapFoundGroups }]
                        });
                        res.emit('end');
                    }, 5);
                };
                return client;
            }
        };
    }
    return originalRequire.apply(this, arguments);
};

// Mock DB Prepare
authDb.prepare = function(sql) {
    if (sql.includes('ldap_config')) {
        return {
            get: () => authDbState.ldap_config
        };
    }
    if (sql.includes('UserADGroups')) {
        return {
            all: (username) => authDbState.UserADGroups.filter(x => x.Username === username)
        };
    }
    return originalAuthPrepare.apply(this, arguments);
};

logisticsDb.prepare = function(sql) {
    if (sql.includes('GatekeeperRoleMap')) {
        return {
            all: (actionClass, plantId) => logisticsDbState.GatekeeperRoleMap.filter(x => x.ActionClass === actionClass && (x.PlantID === null || x.PlantID === plantId))
        };
    }
    return originalLogisticsPrepare.apply(this, arguments);
};

async function runTests() {
    try {
        console.log('Running RBAC Validator Tests...');

        // 1. No LDAP config -> SAFETY_CRITICAL returns allowed: false
        authDbState.ldap_config = { Enabled: 0 };
        let res = await validateRole({ actionClass: 'SAFETY_CRITICAL', username: 'test_user' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'LDAP_REQUIRED_FOR_SAFETY_CRITICAL');

        // 2. No LDAP config -> NON_CRITICAL returns allowed: true
        res = await validateRole({ actionClass: 'NON_CRITICAL', username: 'test_user' });
        assert.strictEqual(res.allowed, true);

        // 3. LDAP enabled, no role map entries -> NO_ROLE_MAP_FOR_ACTION_CLASS
        authDbState.ldap_config = { Enabled: 1, Host: 'localhost' };
        logisticsDbState.GatekeeperRoleMap = [];
        res = await validateRole({ actionClass: 'NON_CRITICAL', username: 'test_user' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'NO_ROLE_MAP_FOR_ACTION_CLASS');

        // 4. LDAP enabled, cached check, user has matching group -> allowed: true
        logisticsDbState.GatekeeperRoleMap = [{ ADGroup: 'AdminGroup', ActionClass: 'NON_CRITICAL', PlantID: null }];
        authDbState.UserADGroups = [{ Username: 'test_user', ADGroup: 'AdminGroup' }];
        res = await validateRole({ actionClass: 'NON_CRITICAL', username: 'test_user' });
        assert.strictEqual(res.allowed, true);

        // 5. LDAP enabled, cached check, user has no matching group -> INSUFFICIENT_ROLE
        authDbState.UserADGroups = [{ Username: 'test_user', ADGroup: 'OtherGroup' }];
        res = await validateRole({ actionClass: 'NON_CRITICAL', username: 'test_user' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'INSUFFICIENT_ROLE');

        // Restore original functions
        authDb.prepare = originalAuthPrepare;
        logisticsDb.prepare = originalLogisticsPrepare;
        Module.prototype.require = originalRequire;

        console.log('All rbac_validator tests passed.');
        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

runTests();
