// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — ARP Scanner
 * ======================
 * Resolves a MAC address to an IP address using the host OS ARP table.
 * Used by the Device Registry wizard to auto-populate the IP field once
 * the technician enters or scans a device's MAC address.
 *
 * How it works:
 *   1. Run `arp -a` to dump the local ARP cache.
 *   2. Search the output for the normalized MAC address.
 *   3. If not found (device hasn't talked recently), optionally run a
 *      lightweight ICMP ping sweep of the subnet to populate the cache,
 *      then repeat the ARP lookup.
 *
 * OT / IT network note:
 *   The Trier OS server must be on the same Layer-2 subnet as the PLCs
 *   for ARP to work. If the devices are on a separate OT VLAN reachable
 *   only via a router, ARP will not see them — in that case configure IP
 *   addresses manually and use the Modbus probe to verify connectivity.
 *
 * Exports:
 *   lookupMac(mac, options?)  → Promise<{ ip: string|null, found: boolean, raw: string }>
 *   normalizeMac(mac)         → string  (always XX:XX:XX:XX:XX:XX)
 */

'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

// ── MAC Normalization ─────────────────────────────────────────────────────────

/**
 * Normalizes any common MAC address format to lowercase colon-separated pairs.
 * Accepts: 00:11:22:33:44:55 / 00-11-22-33-44-55 / 001122334455
 * Returns: "00:11:22:33:44:55"
 * Throws if the input cannot be parsed as a 6-byte MAC address.
 *
 * @param {string} mac
 * @returns {string}
 */
function normalizeMac(mac) {
    if (!mac || typeof mac !== 'string') throw new Error('MAC address is required');
    const cleaned = mac.replace(/[:\-\.]/g, '').replace(/\s/g, '').toLowerCase();
    if (!/^[0-9a-f]{12}$/.test(cleaned)) {
        throw new Error(`Invalid MAC address: "${mac}"`);
    }
    // Re-format as colon-separated pairs
    return cleaned.match(/.{2}/g).join(':');
}

// ── ARP Table Parser ──────────────────────────────────────────────────────────

/**
 * Parses `arp -a` output (Windows or Linux) and returns an array of
 * { ip, mac } objects with normalized MAC addresses.
 *
 * Windows ARP line format:
 *   "  192.168.1.1          00-11-22-33-44-55     dynamic"
 * Linux ARP line format:
 *   "192.168.1.1 ether 00:11:22:33:44:55 C eth0"
 *
 * @param {string} arpOutput  Raw stdout from `arp -a`
 * @returns {{ ip: string, mac: string }[]}
 */
function parseArpTable(arpOutput) {
    const entries = [];
    const lines = arpOutput.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('Interface') || trimmed.startsWith('Address')) continue;

        // Match any run of hex pairs separated by colons or dashes (MAC address pattern)
        const macMatch = trimmed.match(/([0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2}[:\-][0-9a-fA-F]{2})/);
        // Match IPv4 address
        const ipMatch = trimmed.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);

        if (macMatch && ipMatch) {
            try {
                entries.push({ ip: ipMatch[1], mac: normalizeMac(macMatch[1]) });
            } catch (_) {
                // skip malformed entries
            }
        }
    }

    return entries;
}

// ── ARP Lookup ────────────────────────────────────────────────────────────────

/**
 * Runs `arp -a` and searches for the given MAC address.
 * Returns the first matching IP, or null if not found.
 *
 * @param {string} arpOutput
 * @param {string} normalizedMac  Already normalized (XX:XX:XX:XX:XX:XX)
 * @returns {string|null}
 */
function findIpInArpOutput(arpOutput, normalizedMac) {
    const entries = parseArpTable(arpOutput);
    const hit = entries.find(e => e.mac === normalizedMac);
    return hit ? hit.ip : null;
}

// ── Ping Sweep ────────────────────────────────────────────────────────────────

/**
 * Sends a single ICMP ping to each host in a /24 subnet to warm the ARP
 * cache so a freshly-powered device becomes discoverable.
 * Pings are fire-and-forget (no error handling per-host) — the goal is
 * only to generate ARP replies, not to confirm reachability of every host.
 *
 * @param {string} subnet  Base address, e.g. "192.168.1"  (last octet omitted)
 * @returns {Promise<void>}
 */
async function pingSweep(subnet) {
    const isWindows = process.platform === 'win32';
    const promises = [];

    for (let i = 1; i <= 254; i++) {
        const ip = `${subnet}.${i}`;
        const args = isWindows
            ? ['-n', '1', '-w', '200', ip]   // 1 ping, 200ms timeout
            : ['-c', '1', '-W', '1', ip];     // 1 ping, 1s timeout
        // Fire and forget — we do not await individual pings
        promises.push(
            execFileAsync('ping', args, { timeout: 2000 }).catch(() => {})
        );
    }

    // Allow up to 8 seconds for the sweep; remaining pings run in background
    await Promise.race([
        Promise.allSettled(promises),
        new Promise(r => setTimeout(r, 8000)),
    ]);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolves a MAC address to an IP address using the host ARP table.
 *
 * @param {string} mac  Any common MAC format (colons, dashes, or plain hex)
 * @param {object} [options]
 * @param {boolean} [options.sweep=false]   If true and MAC not found on first
 *   pass, run a /24 ping sweep then retry. Adds up to ~10 seconds but greatly
 *   improves discovery of recently-powered devices.
 * @param {string}  [options.subnetHint]    Base subnet for sweep, e.g. "192.168.1".
 *   Required when sweep:true. Ignored if MAC is found on the first pass.
 *
 * @returns {Promise<{ ip: string|null, found: boolean, raw: string, error?: string }>}
 */
async function lookupMac(mac, options = {}) {
    let normalizedMac;
    try {
        normalizedMac = normalizeMac(mac);
    } catch (err) {
        return { ip: null, found: false, raw: '', error: err.message };
    }

    // ── First pass: query the existing ARP cache ──────────────────────────────
    let arpOutput = '';
    try {
        const { stdout } = await execFileAsync('arp', ['-a'], { timeout: 5000 });
        arpOutput = stdout;
    } catch (err) {
        return { ip: null, found: false, raw: '', error: `arp command failed: ${err.message}` };
    }

    const ip = findIpInArpOutput(arpOutput, normalizedMac);
    if (ip) {
        return { ip, found: true, raw: arpOutput };
    }

    // ── Second pass: ping sweep to warm the cache, then retry ─────────────────
    if (options.sweep && options.subnetHint) {
        try {
            await pingSweep(options.subnetHint);
        } catch (_) {
            // sweep failure is non-fatal — still retry ARP
        }

        try {
            const { stdout: stdout2 } = await execFileAsync('arp', ['-a'], { timeout: 5000 });
            arpOutput = stdout2;
            const ip2 = findIpInArpOutput(arpOutput, normalizedMac);
            if (ip2) {
                return { ip: ip2, found: true, raw: arpOutput };
            }
        } catch (_) {}
    }

    return { ip: null, found: false, raw: arpOutput };
}

module.exports = { lookupMac, normalizeMac, parseArpTable };
