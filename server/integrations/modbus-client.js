// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Trier OS — Modbus TCP Client
 * =============================
 * Zero-dependency raw TCP client for reading holding registers
 * from any Modbus TCP server (real PLC or the built-in simulator).
 * Uses Node's net module with a configurable timeout.
 *
 * Usage:
 *   const client = require('./modbus-client');
 *   const values = await client.readHoldingRegisters('127.0.0.1', 5020, 0, 16);
 *   // returns array of 16-bit unsigned integers
 */

'use strict';
const net = require('net');

const DEFAULT_TIMEOUT_MS = 4000;
let   txCounter = 0;

/**
 * Read holding registers (FC03) from a Modbus TCP server.
 * @param {string} host
 * @param {number} port
 * @param {number} startAddress  — 0-based register address
 * @param {number} quantity      — number of registers to read
 * @param {number} [unitId=1]
 * @param {number} [timeoutMs]
 * @returns {Promise<number[]>}  — array of unsigned 16-bit register values
 */
function readHoldingRegisters(host, port, startAddress, quantity, unitId = 1, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const txId = (++txCounter) & 0xFFFF;

        // Build FC03 request
        const request = Buffer.allocUnsafe(12);
        request.writeUInt16BE(txId, 0);         // Transaction ID
        request.writeUInt16BE(0x0000, 2);       // Protocol ID
        request.writeUInt16BE(6, 4);            // Length (unit ID + PDU = 1+1+2+2)
        request.writeUInt8(unitId, 6);          // Unit ID
        request.writeUInt8(0x03, 7);            // FC03
        request.writeUInt16BE(startAddress, 8);
        request.writeUInt16BE(quantity, 10);

        const sock = new net.Socket();
        let resolved = false;
        let buffer = Buffer.alloc(0);

        const finish = (err, values) => {
            if (resolved) return;
            resolved = true;
            sock.destroy();
            if (err) reject(err);
            else resolve(values);
        };

        sock.setTimeout(timeoutMs);
        sock.on('timeout', () => finish(new Error(`Modbus timeout ${host}:${port}`)));
        sock.on('error', (e) => finish(new Error(`Modbus connection error: ${e.message}`)));

        sock.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);

            // Minimum response: 9 bytes (6 MBAP + 1 FC + 1 byte count + 2 data)
            if (buffer.length < 9) return;

            const respTxId = buffer.readUInt16BE(0);
            if (respTxId !== txId) return finish(new Error('Transaction ID mismatch'));

            const fc = buffer.readUInt8(7);
            if (fc & 0x80) {
                const exCode = buffer.readUInt8(8);
                return finish(new Error(`Modbus exception FC=${fc} code=${exCode}`));
            }

            const byteCount = buffer.readUInt8(8);
            const expected = 9 + byteCount;
            if (buffer.length < expected) return; // wait for more data

            const values = [];
            for (let i = 0; i < quantity; i++) {
                values.push(buffer.readUInt16BE(9 + i * 2));
            }
            finish(null, values);
        });

        sock.connect(port, host, () => sock.write(request));
    });
}

module.exports = { readHoldingRegisters };
