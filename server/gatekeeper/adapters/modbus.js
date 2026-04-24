// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * modbus.js — Modbus TCP Control Adapter
 * ========================================
 * Connects to a Modbus TCP device and writes a holding register.
 * Uses modbus-serial (optional package). Falls back to simulated if not installed.
 *
 * Install: npm install modbus-serial
 *
 * Fail-closed: any connection or write error returns { success: false }.
 * Never throws.
 */

'use strict';

async function execute(command) {
    let ModbusRTU;
    try {
        ModbusRTU = require('modbus-serial');
    } catch (_) {
        console.warn('[MODBUS] modbus-serial not installed — falling back to simulated');
        return require('./simulated').execute(command);
    }

    let client;
    try {
        const endpoint = command.endpoint || command.Endpoint || '';
        const [host, portStr] = endpoint.split(':');
        const port = parseInt(portStr) || 502;
        
        const register = command.register ?? command.Register ?? 0;
        const unitId = command.unitId ?? command.UnitID ?? 1;
        const value = command.payload?.value ?? command.payload;
        const timeoutMs = command.timeoutMs ?? command.TimeoutMs ?? 5000;

        client = new ModbusRTU();
        client.setTimeout(timeoutMs);

        await client.connectTCP(host, { port });
        client.setID(unitId);

        await client.writeRegister(register, value);

        return { success: true, register, value };
    } catch (err) {
        return { success: false, error: err.message };
    } finally {
        if (client) {
            try {
                client.close();
            } catch (_) {}
        }
    }
}

async function testConnection(config) {
    let ModbusRTU;
    try {
        ModbusRTU = require('modbus-serial');
    } catch (_) {
        return { success: false, error: 'modbus-serial not installed' };
    }

    let client;
    try {
        const endpoint = config.Endpoint || '';
        const [host, portStr] = endpoint.split(':');
        const port = parseInt(portStr) || 502;

        client = new ModbusRTU();
        client.setTimeout(config.TimeoutMs || 5000);

        await client.connectTCP(host, { port });

        return { success: true, message: 'Modbus TCP endpoint reachable' };
    } catch (err) {
        return { success: false, error: err.message };
    } finally {
        if (client) {
            try {
                client.close();
            } catch (_) {}
        }
    }
}

module.exports = { execute, testConnection };
