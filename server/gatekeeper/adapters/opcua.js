// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * opcua.js — OPC-UA Control Adapter
 * ===================================
 * Connects to an OPC-UA server and writes a node value.
 * Uses node-opcua (optional package). Falls back to simulated if not installed.
 *
 * Install: npm install node-opcua
 *
 * Fail-closed: any connection or write error returns { success: false }.
 * Never throws.
 */

'use strict';

async function execute(command) {
    let opcua;
    try {
        opcua = require('node-opcua');
    } catch (_) {
        console.warn('[OPCUA] node-opcua not installed — falling back to simulated');
        return require('./simulated').execute(command);
    }

    try {
        const endpointUrl = command.endpoint || command.Endpoint;
        const nodeId = command.nodeId || command.NodeID || command.targetId;
        const valueToWrite = command.payload?.value ?? command.payload;
        const timeoutMs = command.timeoutMs || command.TimeoutMs || 5000;

        const client = opcua.OPCUAClient.create({
            endpointMustExist: false,
            requestedSessionTimeout: timeoutMs
        });

        await client.connect(endpointUrl);
        const session = await client.createSession();

        const dataValue = {
            value: new opcua.Variant({ dataType: opcua.DataType.String, value: String(valueToWrite) })
        };

        const statusCode = await session.write({
            nodeId: opcua.resolveNodeId(nodeId),
            attributeId: opcua.AttributeIds.Value,
            value: dataValue
        });

        await session.close();
        await client.disconnect();

        if (statusCode !== opcua.StatusCodes.Good) {
            return { success: false, error: `OPC-UA write failed with status: ${statusCode.name}` };
        }

        return { success: true, nodeId, value: valueToWrite };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function testConnection(config) {
    let opcua;
    try {
        opcua = require('node-opcua');
    } catch (_) {
        return { success: false, error: 'node-opcua not installed' };
    }

    try {
        const endpointUrl = config.Endpoint;
        const client = opcua.OPCUAClient.create({
            endpointMustExist: false,
            requestedSessionTimeout: config.TimeoutMs || 5000
        });

        await client.connect(endpointUrl);
        await client.disconnect();

        return { success: true, message: 'OPC-UA endpoint reachable' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

module.exports = { execute, testConnection };
