// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Trier OS — Modbus TCP Simulator
 * ================================
 * A zero-dependency raw TCP Modbus server that emulates a real PLC.
 * Serves 16 holding registers with realistic manufacturing data that
 * drifts over time so the edge agent has live data to pull and write
 * to the plant DB.
 *
 * Protocol: Modbus TCP (MBAP header + PDU, Function Code 03 only)
 * Default port: 5020 (non-privileged; real PLCs use 502)
 *
 * Registers (FC03, addresses 0–15):
 *   0  Line 1 Temperature   ×10 °F   (e.g. 1652 = 165.2°F)
 *   1  Line 2 Temperature   ×10 °F
 *   2  Line 1 Speed         units/min
 *   3  Line 2 Speed         units/min
 *   4  Tank 1 Level         ×10 %    (e.g. 758 = 75.8%)
 *   5  Tank 2 Level         ×10 %
 *   6  Downtime Today       minutes
 *   7  Units Produced Today count
 *   8  CIP Status           0=off 1=active
 *   9  Line 1 Status        0=stopped 1=running 2=fault
 *  10  Line 2 Status        0=stopped 1=running 2=fault
 *  11  Pressure             ×10 PSI
 *  12  Power Draw           ×10 kW
 *  13  Active Alarm Count   count
 *  14  Shift Code           1=day 2=swing 3=night
 *  15  OEE                  ×10 %
 */

'use strict';
const net = require('net');

const FC_READ_HOLDING = 0x03;
const FC_EXCEPTION    = 0x80;
const EX_ILLEGAL_FUNC = 0x01;
const EX_ILLEGAL_ADDR = 0x02;
const REGISTER_COUNT  = 16;

// ── Live register bank ────────────────────────────────────────────────────────
// All values are 16-bit unsigned integers (0–65535).
const registers = new Uint16Array(REGISTER_COUNT);

function initRegisters() {
    registers[0]  = 1652;   // Line 1 Temp: 165.2°F (HTST pasteurizer range)
    registers[1]  = 1612;   // Line 2 Temp: 161.2°F
    registers[2]  = 120;    // Line 1 Speed: 120 units/min
    registers[3]  = 95;     // Line 2 Speed: 95 units/min
    registers[4]  = 758;    // Tank 1 Level: 75.8%
    registers[5]  = 422;    // Tank 2 Level: 42.2%
    registers[6]  = 0;      // Downtime Today: 0 min
    registers[7]  = 0;      // Units Produced: 0
    registers[8]  = 0;      // CIP: off
    registers[9]  = 1;      // Line 1: running
    registers[10] = 1;      // Line 2: running
    registers[11] = 250;    // Pressure: 25.0 PSI
    registers[12] = 1840;   // Power: 184.0 kW
    registers[13] = 0;      // Alarms: none
    registers[14] = 1;      // Shift: day
    registers[15] = 872;    // OEE: 87.2%
}

// ── Realistic drift engine ────────────────────────────────────────────────────
// Updates every 5s with small random walks so dashboards show live movement.
let downtimeAccumulator = 0;
let producedAccumulator = 0;
let tickCount = 0;

function drift(current, min, max, maxStep) {
    const delta = (Math.random() - 0.5) * 2 * maxStep;
    return Math.max(min, Math.min(max, Math.round(current + delta)));
}

function updateRegisters() {
    tickCount++;

    // Temperatures drift slightly around setpoints
    registers[0] = drift(registers[0], 1605, 1720, 8);
    registers[1] = drift(registers[1], 1605, 1680, 6);

    // Line speeds drift with production variation
    const line1Running = registers[9] === 1;
    const line2Running = registers[10] === 1;
    registers[2] = line1Running ? drift(registers[2], 80, 200, 5) : 0;
    registers[3] = line2Running ? drift(registers[3], 60, 180, 5) : 0;

    // Tank levels: slowly drain during production, fill during CIP
    const cipActive = registers[8] === 1;
    if (!cipActive) {
        registers[4] = Math.max(100, registers[4] - Math.round(Math.random() * 3));
        registers[5] = Math.max(50,  registers[5] - Math.round(Math.random() * 2));
    } else {
        registers[4] = Math.min(950, registers[4] + Math.round(Math.random() * 8));
        registers[5] = Math.min(950, registers[5] + Math.round(Math.random() * 6));
    }

    // Simulate occasional short stops (1% chance each tick)
    if (Math.random() < 0.01 && line1Running) {
        registers[9] = 2; // fault
        registers[13] = Math.min(9, registers[13] + 1);
    } else if (registers[9] === 2 && Math.random() < 0.3) {
        registers[9] = 1; // recover
        registers[13] = Math.max(0, registers[13] - 1);
    }

    // CIP toggles at tank level thresholds
    if (registers[4] < 150 && !cipActive) registers[8] = 1;
    if (registers[4] > 800 && cipActive)  registers[8] = 0;

    // Downtime accumulates when a line is stopped
    if (!line1Running || registers[9] === 2) {
        downtimeAccumulator += 5 / 60; // 5s per tick
        if (downtimeAccumulator >= 1) {
            registers[6] = Math.min(65535, registers[6] + 1);
            downtimeAccumulator -= 1;
        }
    }

    // Production counts when lines are running
    if (line1Running) producedAccumulator += registers[2] * (5 / 60);
    if (line2Running) producedAccumulator += registers[3] * (5 / 60);
    registers[7] = Math.min(65535, Math.round(producedAccumulator));

    // Pressure and power drift
    registers[11] = drift(registers[11], 200, 400, 5);
    registers[12] = drift(registers[12], 1200, 2500, 30);

    // Shift cycle (every 8 hours = 5760 ticks at 5s)
    const shiftTick = tickCount % (8 * 3600 / 5);
    registers[14] = shiftTick < 5760 / 3 ? 1 : shiftTick < (5760 * 2) / 3 ? 2 : 3;

    // OEE = f(speeds, downtime)
    const maxPossible = 200;
    const actualSpeed = (registers[2] + registers[3]) / 2;
    registers[15] = Math.round(Math.min(999, (actualSpeed / maxPossible) * 1000));
}

// ── Modbus TCP frame encoder / decoder ───────────────────────────────────────
function buildResponse(txId, unitId, pdu) {
    const buf = Buffer.allocUnsafe(6 + 1 + pdu.length);
    buf.writeUInt16BE(txId, 0);      // Transaction ID
    buf.writeUInt16BE(0x0000, 2);    // Protocol ID
    buf.writeUInt16BE(1 + pdu.length, 4); // Length
    buf.writeUInt8(unitId, 6);       // Unit ID
    pdu.copy(buf, 7);
    return buf;
}

function buildException(txId, unitId, fc, code) {
    const pdu = Buffer.from([fc | FC_EXCEPTION, code]);
    return buildResponse(txId, unitId, pdu);
}

function handleRequest(data) {
    if (data.length < 8) return null; // too short

    const txId   = data.readUInt16BE(0);
    const unitId = data.readUInt8(6);
    const fc     = data.readUInt8(7);

    if (fc !== FC_READ_HOLDING) {
        return buildException(txId, unitId, fc, EX_ILLEGAL_FUNC);
    }

    if (data.length < 12) return buildException(txId, unitId, fc, EX_ILLEGAL_ADDR);

    const startAddr = data.readUInt16BE(8);
    const quantity  = data.readUInt16BE(10);

    if (startAddr + quantity > REGISTER_COUNT) {
        return buildException(txId, unitId, fc, EX_ILLEGAL_ADDR);
    }

    // Build response PDU
    const byteCount = quantity * 2;
    const pdu = Buffer.allocUnsafe(2 + byteCount);
    pdu.writeUInt8(fc, 0);
    pdu.writeUInt8(byteCount, 1);
    for (let i = 0; i < quantity; i++) {
        pdu.writeUInt16BE(registers[startAddr + i], 2 + i * 2);
    }
    return buildResponse(txId, unitId, pdu);
}

// ── Server lifecycle ──────────────────────────────────────────────────────────
let server = null;
let driftTimer = null;

function start(port = 5020) {
    return new Promise((resolve, reject) => {
        if (server) return resolve({ port, running: true });

        initRegisters();
        driftTimer = setInterval(updateRegisters, 5000);

        server = net.createServer((sock) => {
            sock.on('data', (data) => {
                const response = handleRequest(data);
                if (response) sock.write(response);
            });
            sock.on('error', () => {});
        });

        server.on('error', (err) => {
            server = null;
            clearInterval(driftTimer);
            reject(err);
        });

        server.listen(port, '127.0.0.1', () => {
            console.log(`[Modbus Simulator] Listening on 127.0.0.1:${port} (${REGISTER_COUNT} registers)`);
            resolve({ port, running: true });
        });
    });
}

function stop() {
    return new Promise((resolve) => {
        clearInterval(driftTimer);
        driftTimer = null;
        if (!server) return resolve();
        server.close(() => {
            server = null;
            console.log('[Modbus Simulator] Stopped');
            resolve();
        });
    });
}

function isRunning() { return server !== null && server.listening; }

function getRegisters() {
    return Array.from(registers);
}

// Tag metadata for UI / normalization
const TAG_DEFINITIONS = [
    { address: 0,  name: 'line1_temp_f',      label: 'Line 1 Temperature', unit: '°F',     scale: 0.1  },
    { address: 1,  name: 'line2_temp_f',       label: 'Line 2 Temperature', unit: '°F',     scale: 0.1  },
    { address: 2,  name: 'line1_speed',        label: 'Line 1 Speed',       unit: 'u/min',  scale: 1    },
    { address: 3,  name: 'line2_speed',        label: 'Line 2 Speed',       unit: 'u/min',  scale: 1    },
    { address: 4,  name: 'tank1_level_pct',    label: 'Tank 1 Level',       unit: '%',      scale: 0.1  },
    { address: 5,  name: 'tank2_level_pct',    label: 'Tank 2 Level',       unit: '%',      scale: 0.1  },
    { address: 6,  name: 'downtime_minutes',   label: 'Downtime Today',     unit: 'min',    scale: 1    },
    { address: 7,  name: 'units_produced',     label: 'Units Produced',     unit: 'count',  scale: 1    },
    { address: 8,  name: 'cip_status',         label: 'CIP Status',         unit: 'bool',   scale: 1    },
    { address: 9,  name: 'line1_status',       label: 'Line 1 Status',      unit: 'state',  scale: 1    },
    { address: 10, name: 'line2_status',       label: 'Line 2 Status',      unit: 'state',  scale: 1    },
    { address: 11, name: 'pressure_psi',       label: 'System Pressure',    unit: 'PSI',    scale: 0.1  },
    { address: 12, name: 'power_kw',           label: 'Power Draw',         unit: 'kW',     scale: 0.1  },
    { address: 13, name: 'alarm_count',        label: 'Active Alarms',      unit: 'count',  scale: 1    },
    { address: 14, name: 'shift_code',         label: 'Current Shift',      unit: 'code',   scale: 1    },
    { address: 15, name: 'oee_pct',            label: 'OEE',                unit: '%',      scale: 0.1  },
];

module.exports = { start, stop, isRunning, getRegisters, TAG_DEFINITIONS, REGISTER_COUNT };
