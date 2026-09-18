// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Legacy IT mutation security regression against real routers, JWT middleware
 * and isolated SQLite data. Compares single-item and bulk authorization and
 * checks DELETE/PUT not-found, rollback, dependencies and audit identity.
 * API dependencies: /api/it assets, vendors and relation mutation endpoints.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trier-it-security-'));
    process.env.DATA_DIR = root; process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    const print = console.log; let auth;
    try { console.log = () => {}; auth = require('../../server/auth_db'); } finally { console.log = print; }
    const { db } = require('../../server/logistics_db');
    const tokens = {};
    for (const role of ['technician', 'it_admin', 'creator']) {
        const id = auth.prepare('INSERT INTO Users(Username,PasswordHash,DefaultRole) VALUES (?,?,?)').run('fixture_' + role, 'not-a-login-hash', role).lastInsertRowid;
        tokens[role] = jwt.sign({ UserID: id, Username: 'fixture_' + role, globalRole: role, plantRoles: { Site_A: role }, tokenVersion: 0 }, process.env.JWT_SECRET);
    }
    const app = express(); app.use(express.json()); app.use('/api', require('../../server/middleware/auth')); app.use('/api/it', require('../../server/routes/it'));
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const call = async (method, route, role = 'it_admin', body) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/it${route}`, { method, headers: { Authorization: 'Bearer ' + tokens[role], 'x-plant-id': 'Site_A', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, body: await response.json() };
    };
    try {
        for (const category of ['hardware', 'software', 'infrastructure', 'mobile']) {
            const id = Number(db.prepare(`INSERT INTO it_${category}(Name,PlantID) VALUES (?,?)`).run('Delete fixture', 'Site_B').lastInsertRowid);
            const keep = Number(db.prepare(`INSERT INTO it_${category}(Name,PlantID) VALUES (?,?)`).run('Keep fixture', 'Site_A').lastInsertRowid);
            const items = [{ ID: id, PlantID: 'Site_B' }];
            assert.equal((await call('POST', `/${category}/bulk-delete`, 'technician', { items })).status, 403);
            assert.equal((await call('DELETE', `/${category}/${id}`, 'technician')).status, 403, category + ' cross-site single delete');
            assert.equal((await call('PUT', `/${category}/${id}`, 'technician', { Name: 'unauthorized', PlantID: 'Site_A' })).status, 403);
            assert.equal(db.prepare(`SELECT Name FROM it_${category} WHERE ID=?`).get(id).Name, 'Delete fixture');
            db.prepare('INSERT INTO it_asset_user_link(AssetCategory,AssetID,UserEmail) VALUES (?,?,?)').run(category, id, 'fixture@example.invalid');
            db.prepare('INSERT INTO it_depreciation_schedule(AssetCategory,AssetID,FiscalYear) VALUES (?,?,?)').run(category, id, 2026);
            const result = await call('DELETE', `/${category}/${id}`, 'creator');
            assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(result.body.status, 'DELETED');
            assert.equal((await call('DELETE', `/${category}/${id}`)).status, 404);
            assert.equal((await call('PUT', `/${category}/${id}`, 'it_admin', { Name: 'missing' })).status, 404);
            assert.equal(db.prepare('SELECT COUNT(*) n FROM it_asset_user_link WHERE AssetCategory=? AND AssetID=?').get(category, id).n, 0);
            assert.equal(db.prepare('SELECT COUNT(*) n FROM it_depreciation_schedule WHERE AssetCategory=? AND AssetID=?').get(category, id).n, 0);
            assert.equal(db.prepare(`SELECT Name FROM it_${category} WHERE ID=?`).get(keep).Name, 'Keep fixture');
            const audit = db.prepare("SELECT * FROM AuditLog WHERE Action='IT_ASSET_DELETE' ORDER BY ID DESC LIMIT 1").get();
            assert.equal(audit.UserID, 'fixture_creator'); assert.equal(audit.PlantID, 'Site_B'); assert.equal(JSON.parse(audit.Details).assetId, id);
            assert.equal((await call('DELETE', `/${category}/${keep}`, 'it_admin')).status, 200, 'Authorized same-site deletion');
        }
        const hardware = Number(db.prepare("INSERT INTO it_hardware(Name,PlantID) VALUES ('Related hardware','Site_B')").run().lastInsertRowid);
        const software = Number(db.prepare("INSERT INTO it_software(Name,PlantID) VALUES ('Related software','Site_B')").run().lastInsertRowid);
        const vendor = Number(db.prepare("INSERT INTO it_vendors_contracts(VendorName,PlantID) VALUES ('Related vendor','Site_B')").run().lastInsertRowid);
        const swLink = Number(db.prepare('INSERT INTO it_software_hardware_link(SoftwareID,HardwareID) VALUES (?,?)').run(software, hardware).lastInsertRowid);
        const woLink = Number(db.prepare("INSERT INTO it_asset_workorder_link(AssetCategory,AssetID,WorkOrderID,PlantID) VALUES ('hardware',?,'fixture-work','Site_B')").run(hardware).lastInsertRowid);
        const userLink = Number(db.prepare("INSERT INTO it_asset_user_link(AssetCategory,AssetID,UserEmail) VALUES ('hardware',?,'fixture@example.invalid')").run(hardware).lastInsertRowid);
        const infra = Number(db.prepare("INSERT INTO it_infrastructure(Name,PlantID) VALUES ('Related infra','Site_B')").run().lastInsertRowid);
        for (const [method, route, body] of [
            ['PUT', `/vendors/${vendor}`, { VendorName: 'Updated' }], ['DELETE', `/vendors/${vendor}`],
            ['DELETE', `/links/software-hardware/${swLink}`], ['DELETE', `/links/workorders/${woLink}`], ['DELETE', `/links/users/${userLink}`],
            ['PUT', `/links/infrastructure-location/${infra}`, { location: 'Rack A' }],
        ]) {
            assert.equal((await call(method, route, 'technician', body)).status, 403, route);
            assert.equal((await call(method, route.replace(/\d+$/, '999999999'), 'creator', body)).status, 404, 'Missing ' + route);
            assert.equal((await call(method, route, 'creator', body)).status, 200, 'Authorized ' + route);
            if (method === 'DELETE') assert.equal((await call(method, route, 'creator')).status, 404, 'Repeated ' + route);
        }
        db.exec("CREATE TRIGGER IgnoreDelete BEFORE DELETE ON it_hardware BEGIN SELECT RAISE(IGNORE); END;");
        assert.equal((await call('DELETE', `/hardware/${hardware}`)).status, 500, 'Ignored delete must not report success');
        assert.ok(db.prepare('SELECT ID FROM it_hardware WHERE ID=?').get(hardware));
        assert.equal(db.pragma('integrity_check', { simple: true }), 'ok'); assert.deepEqual(db.pragma('foreign_key_check'), []);
        console.log('PASS legacy IT authorization, same/cross site, not found, cleanup, audit, related routes and ignored-delete failure.');
        console.log('Isolated evidence:', root);
    } finally { await new Promise(resolve => server.close(resolve)); db.close(); auth.close(); }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
