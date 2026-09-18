// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Copyright © 2026 Doug Trier. SPDX-License-Identifier: MIT.
 * Network command regression: actual validator with a safe process recorder.
 * Covers Windows/Linux DHCP/static argument construction and rejects malformed
 * inputs before any recorded invocation. No host networking or database mocks.
 * API dependency: implementation of PUT /api/network-config/static-ip.
 */
const assert = require('assert/strict');
const { applyNetworkConfig } = require('../../server/network_config');
const fs = require('fs');
const vm = require('vm');
let checks = 0;
for (const platform of ['win32', 'linux']) {
    const calls = [];
    const options = { platform, interfaces: { 'Ethernet 2': [] }, execFileSync: (tool, args, flags) => calls.push({ tool, args, flags }) };
    for (const body of [
        { interface: 'Ethernet 2 & echo MARKER', mode: 'dhcp' },
        { interface: 'Unknown', mode: 'dhcp' },
        { interface: 'Ethernet 2', mode: 'static', ip: '192.168.1.5 & echo MARKER', subnet: '255.255.255.0' },
        { interface: 'Ethernet 2', mode: 'static', ip: '192.168.1.5', subnet: '255.0.255.0' },
        { interface: 'Ethernet 2', mode: 'dhcp', dns1: '8.8.8.8;echo MARKER' },
    ]) {
        assert.throws(() => applyNetworkConfig(body, options), error => error.status === 400);
        assert.equal(calls.length, 0); checks++;
    }
    applyNetworkConfig({ interface: 'Ethernet 2', mode: 'dhcp' }, options);
    assert.equal(calls.length, 2); assert(calls.every(c => c.flags.shell === false)); checks++;
    calls.length = 0;
    applyNetworkConfig({ interface: 'Ethernet 2', mode: 'static', ip: '192.168.1.5', subnet: '255.255.255.0', gateway: '192.168.1.1', dns1: '8.8.8.8' }, options);
    assert(calls.some(c => c.args.includes(platform === 'linux' ? '192.168.1.5/24' : '192.168.1.5')));
    assert(calls.every(c => c.args.includes('Ethernet 2') && c.flags.shell === false)); checks++;
}
// Exercise the actual registered handler as well: record the privileged call,
// rather than sending a legitimate configuration to the host's real adapter.
const source = fs.readFileSync(require.resolve('../../server/index'), 'utf8');
const start = source.indexOf("app.put('/api/network-config/static-ip'");
const end = source.indexOf('function _subnetToPrefix', start);
assert(start >= 0 && end > start);
let handler;
const routeCalls = [];
vm.runInNewContext(source.slice(start, end), {
    app: { put: (_path, fn) => { handler = fn; } }, PORT: 3000,
    console: { log() {}, error() {} },
    require: name => {
        assert.equal(name, './network_config');
        return { applyNetworkConfig: body => applyNetworkConfig(body, {
            platform: 'win32', interfaces: { Ethernet: [] }, execFileSync: (...args) => routeCalls.push(args),
        }) };
    },
});
function invoke(globalRole, body) {
    let status = 200;
    handler({ user: { globalRole, plantRoles: {} }, headers: { 'x-plant-id': 'examples' }, body }, {
        status(code) { status = code; return this; }, json() {},
    });
    return status;
}
for (const role of ['operator', 'technician', 'plant_manager', 'maintenance_manager']) {
    assert.equal(invoke(role, { interface: 'Ethernet', mode: 'dhcp' }), 403);
    assert.equal(routeCalls.length, 0); checks++;
}
assert.equal(invoke('it_admin', { interface: 'Ethernet & echo MARKER', mode: 'dhcp' }), 400);
assert.equal(routeCalls.length, 0); checks++;
assert.equal(invoke('it_admin', { interface: 'Ethernet', mode: 'dhcp' }), 200);
assert.equal(routeCalls.length, 2); checks++;
console.log(`${checks} network command checks passed; no host commands executed.`);
