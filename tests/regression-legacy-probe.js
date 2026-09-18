// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Isolated diagnostic for legacy single-item IT mutation semantics. Records
 * observed behavior, including defects; it is not a passing regression test.
 * API: DELETE /api/it/hardware/:id, POST /api/it/hardware/bulk-delete,
 * GET /api/invariants/report. Only this probe's rows are removed in cleanup.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
async function main() {
    const root = path.resolve(process.argv[2]);
    const app = path.join(root, 'app');
    const marker = JSON.parse(fs.readFileSync(path.join(app, '.regression-sandbox.json')));
    if (path.resolve(marker.source) === app || path.resolve(marker.root) !== root) throw new Error('Isolated sandbox required');
    const env = JSON.parse(fs.readFileSync(path.join(root, 'server-env.json')));
    if (path.resolve(env.DATA_DIR) !== path.join(app, 'data')) throw new Error('Unsafe test data');
    const auth = new Database(path.join(env.DATA_DIR, 'trier_auth.db'));
    const logistics = new Database(path.join(env.DATA_DIR, 'trier_logistics.db'));
    const name = 'audit_legacy_' + crypto.randomBytes(8).toString('hex');
    const userId = Number(auth.prepare("INSERT INTO Users (Username,PasswordHash,DefaultRole) VALUES (?,?,'technician')").run(name, 'not-a-login-hash').lastInsertRowid);
    auth.prepare("INSERT INTO UserPlantRoles (UserID,PlantID,RoleLevel) VALUES (?,'Demo_Plant_1','technician')").run(userId);
    const ids = [];
    const result = { at: new Date().toISOString(), historicalPaths: true };
    try {
        const token = jwt.sign({ UserID: userId, Username: name, globalRole: 'technician', plantRoles: { Demo_Plant_1: 'technician' }, tokenVersion: 0 }, env.JWT_SECRET);
        const headers = { Authorization: 'Bearer ' + token, 'x-plant-id': 'Demo_Plant_1', 'Content-Type': 'application/json' };
        const call = async (route, method, body) => {
            const response = await fetch('http://127.0.0.1:3000' + route, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
            return { status: response.status, body: await response.json() };
        };
        for (let i = 0; i < 2; i++) ids.push(Number(logistics.prepare("INSERT INTO it_hardware (Name,PlantID) VALUES (?,'Plant_2')").run(name + '-' + i).lastInsertRowid));
        result.bulkBoundary = await call('/api/it/hardware/bulk-delete', 'POST', { items: [{ ID: ids[0], PlantID: 'Plant_2' }] });
        result.bulkPreserved = !!logistics.prepare('SELECT ID FROM it_hardware WHERE ID=?').get(ids[0]);
        result.legacyCrossSiteDelete = await call('/api/it/hardware/' + ids[1], 'DELETE');
        result.legacyTargetSurvived = !!logistics.prepare('SELECT ID FROM it_hardware WHERE ID=?').get(ids[1]);
        result.repeatedMissingDelete = await call('/api/it/hardware/' + ids[1], 'DELETE');
        result.invariants = await call('/api/invariants/report?plantId=all', 'GET');
    } finally {
        for (const id of ids) logistics.prepare('DELETE FROM it_hardware WHERE ID=?').run(id);
        auth.prepare('DELETE FROM UserPlantRoles WHERE UserID=?').run(userId);
        auth.prepare('DELETE FROM Users WHERE UserID=?').run(userId);
        auth.close(); logistics.close();
    }
    fs.writeFileSync(path.join(root, 'legacy-api-probe.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ bulkStatus: result.bulkBoundary.status, bulkPreserved: result.bulkPreserved,
        legacyStatus: result.legacyCrossSiteDelete.status, legacyTargetSurvived: result.legacyTargetSurvived,
        repeatedMissingDelete: result.repeatedMissingDelete, invariants: result.invariants.status }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
