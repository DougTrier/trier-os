// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Copyright © 2026 Doug Trier. SPDX-License-Identifier: MIT.
 * Network configuration command boundary.
 * Used only by PUT /api/network-config/static-ip after administrator authorization.
 * Validates a local adapter and IPv4 settings, then invokes fixed network tools
 * with argument arrays and no shell. Tests may record process calls safely.
 * Actions: applyNetworkConfig; no exposed routes of its own.
 */
const net = require('net');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

function invalid(message) { const error = new Error(message); error.status = 400; throw error; }
function ipv4(value, label, optional = false) {
    if (optional && (value === '' || value == null)) return;
    if (typeof value !== 'string' || net.isIP(value) !== 4) invalid(`${label} must be a valid IPv4 address`);
}
function applyNetworkConfig(body, options = {}) {
    const { interface: iface, mode, ip, subnet, gateway, dns1, dns2 } = body || {};
    const interfaces = options.interfaces || os.networkInterfaces();
    if (typeof iface !== 'string' || !/^[\p{L}\p{N}_. ()-]{1,128}$/u.test(iface) ||
        !Object.prototype.hasOwnProperty.call(interfaces, iface)) invalid('A valid local network interface is required');
    if (!['dhcp', 'static'].includes(mode)) invalid('mode must be dhcp or static');
    let prefix;
    if (mode === 'static') {
        ipv4(ip, 'ip'); ipv4(subnet, 'subnet');
        const bits = subnet.split('.').map(octet => Number(octet).toString(2).padStart(8, '0')).join('');
        if (!/^1+0*$/.test(bits)) invalid('subnet must be a contiguous IPv4 mask');
        prefix = bits.indexOf('0') === -1 ? 32 : bits.indexOf('0');
    }
    ipv4(gateway, 'gateway', true); ipv4(dns1, 'dns1', true); ipv4(dns2, 'dns2', true);
    const platform = options.platform || process.platform;
    const execute = options.execFileSync || childProcess.execFileSync;
    const run = (executable, args, timeout) => execute(executable, args, { timeout, windowsHide: true, shell: false });
    if (platform === 'win32') {
        const netsh = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'netsh.exe');
        if (mode === 'dhcp') {
            run(netsh, ['interface', 'ip', 'set', 'address', iface, 'dhcp'], 10000);
            run(netsh, ['interface', 'ip', 'set', 'dns', iface, 'dhcp'], 10000);
        } else {
            run(netsh, ['interface', 'ip', 'set', 'address', iface, 'static', ip, subnet, ...(gateway ? [gateway] : [])], 10000);
            if (dns1) run(netsh, ['interface', 'ip', 'set', 'dns', iface, 'static', dns1], 10000);
            if (dns2) run(netsh, ['interface', 'ip', 'add', 'dns', iface, dns2, 'index=2'], 10000);
        }
    } else if (platform === 'linux') {
        const args = ['con', 'mod', iface, 'ipv4.method', mode === 'dhcp' ? 'auto' : 'manual'];
        if (mode === 'static') {
            args.push('ipv4.addresses', `${ip}/${prefix}`);
            if (gateway) args.push('ipv4.gateway', gateway);
            const dns = [dns1, dns2].filter(Boolean).join(',');
            if (dns) args.push('ipv4.dns', dns);
        }
        run('/usr/bin/nmcli', args, 15000);
        run('/usr/bin/nmcli', ['con', 'up', iface], 15000);
    } else {
        const error = new Error(`Static IP configuration not supported on platform: ${platform}`); error.status = 501; throw error;
    }
}
module.exports = { applyNetworkConfig };
