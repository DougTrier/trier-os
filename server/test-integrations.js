// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Trier OS — Integration Stack Test
 * ====================================
 * Standalone end-to-end test for the Modbus simulator → EdgeAgent → plant DB pipeline.
 * Does NOT require the Express server to be running — imports modules directly.
 *
 * Tests (in order):
 *   1. Simulator starts on port 5099 (dedicated test port, does not disturb production)
 *   2. Modbus client reads 16 holding registers from the simulator
 *   3. Register values are within expected realistic ranges
 *   4. EdgeAgent polls the simulator and writes SensorReadings to a temp test DB
 *   5. SensorReadings table exists and has rows after one poll
 *   6. TAG_DEFINITIONS map correctly to register addresses
 *   7. Simulator stop cleans up the TCP server
 *   8. integration-manager startSimulator / stopSimulator lifecycle
 *   9. integration-manager startWorker / stopWorker lifecycle
 *  10. Temp test DB is removed on cleanup
 *
 * Usage:
 *   node server/test-integrations.js
 *
 * Exit codes: 0 = all pass, 1 = one or more failures
 */

'use strict';

const path     = require('path');
const fs       = require('fs');
const Database = require('better-sqlite3');

// ── Test harness ──────────────────────────────────────────────────────────────
const TEST_PORT   = 5099;           // isolated test port — never clashes with prod (5020-5025)
const TEST_PLANT  = 'TEST_PLANT_integration_check';
const TEST_DB     = path.join(__dirname, '..', 'data', `${TEST_PLANT}.db`);
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const INFO = '\x1b[36mℹ\x1b[0m';

let passed = 0;
let failed = 0;

function ok(name, result, detail = '') {
    if (result) {
        console.log(`  ${PASS}  ${name}`);
        passed++;
    } else {
        console.log(`  ${FAIL}  ${name}${detail ? ' — ' + detail : ''}`);
        failed++;
    }
}

function section(title) {
    console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Load modules ──────────────────────────────────────────────────────────────
const simulator    = require('./integrations/modbus-simulator');
const modbusClient = require('./integrations/modbus-client');
const EdgeAgent    = require('./integrations/edge-agent');
const intManager   = require('./integrations/integration-manager');
const { TAG_DEFINITIONS, REGISTER_COUNT } = require('./integrations/modbus-simulator');

// ── Main test runner ──────────────────────────────────────────────────────────
(async () => {
    console.log('\n\x1b[1m\x1b[36m════════════════════════════════════════════════════\x1b[0m');
    console.log('\x1b[1m\x1b[36m  Trier OS — Integration Stack End-to-End Test\x1b[0m');
    console.log('\x1b[1m\x1b[36m════════════════════════════════════════════════════\x1b[0m');
    console.log(`  ${INFO}  Test port: ${TEST_PORT} | Plant: ${TEST_PLANT}`);

    // ── 1. Simulator startup ──────────────────────────────────────────────────
    section('1. Modbus TCP Simulator');
    let simStarted = false;
    try {
        await simulator.start(TEST_PORT);
        simStarted = true;
        ok('Simulator starts on test port ' + TEST_PORT, true);
        ok('isRunning() returns true after start', simulator.isRunning());
    } catch (err) {
        ok('Simulator starts on test port ' + TEST_PORT, false, err.message);
    }

    if (!simStarted) {
        console.log(`\n  ${FAIL}  Cannot continue — simulator failed to start`);
        process.exit(1);
    }

    // Give the drift engine one tick to populate registers
    await sleep(200);

    // ── 2. Register values ────────────────────────────────────────────────────
    section('2. Simulator Register Values');
    const regs = simulator.getRegisters();
    ok('getRegisters() returns Uint16Array of length ' + REGISTER_COUNT, regs?.length === REGISTER_COUNT);
    ok('Line 1 Temp (reg 0) in plausible range (1500–1800)', regs[0] >= 1500 && regs[0] <= 1800, `got ${regs[0]}`);
    ok('Line 1 Speed (reg 2) ≥ 0', regs[2] >= 0, `got ${regs[2]}`);
    ok('Tank 1 Level (reg 4) > 0', regs[4] > 0, `got ${regs[4]}`);
    ok('OEE (reg 15) in 0–1000 range', regs[15] >= 0 && regs[15] <= 1000, `got ${regs[15]}`);
    ok(`TAG_DEFINITIONS has ${REGISTER_COUNT} entries`, TAG_DEFINITIONS.length === REGISTER_COUNT);
    ok('Every TAG_DEFINITION has required fields (address, name, unit, scale)', TAG_DEFINITIONS.every(t => t.address != null && t.name && t.unit && t.scale != null));

    // ── 3. Modbus TCP client read ─────────────────────────────────────────────
    section('3. Modbus TCP Client (FC03 Read Holding Registers)');
    let rawValues = null;
    try {
        rawValues = await modbusClient.readHoldingRegisters('127.0.0.1', TEST_PORT, 0, REGISTER_COUNT);
        ok('Client connects and reads without error', true);
        ok(`Response contains ${REGISTER_COUNT} register values`, rawValues?.length === REGISTER_COUNT, `got ${rawValues?.length}`);
        ok('Register values match simulator bank', rawValues[0] === regs[0] && rawValues[4] === regs[4], `client[0]=${rawValues[0]} sim[0]=${regs[0]}`);
        ok('All values are 16-bit unsigned integers', rawValues.every(v => Number.isInteger(v) && v >= 0 && v <= 65535));
    } catch (err) {
        ok('Client connects and reads without error', false, err.message);
        ok('Response contains register values', false, 'skipped — connection failed');
        ok('Register values match simulator bank', false, 'skipped');
        ok('All values are 16-bit unsigned integers', false, 'skipped');
    }

    // ── 4. EdgeAgent poll → plant DB ─────────────────────────────────────────
    section('4. EdgeAgent — Poll & Write to Plant DB');

    // Remove any leftover test DB from a previous run
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

    const agent = new EdgeAgent(TEST_PLANT, 'scada', {
        simulatorMode: true,
        simulatorPort: TEST_PORT,
        pollIntervalSeconds: 60,  // long interval — we drive poll() manually in the test
    });

    let pollError = null;
    try {
        await agent.poll();
    } catch (err) {
        pollError = err.message;
    }
    ok('agent.poll() completes without throwing', !pollError, pollError || '');

    const dbExists = fs.existsSync(TEST_DB);
    ok('Plant DB created at expected path', dbExists, TEST_DB);

    if (dbExists) {
        const db = new Database(TEST_DB, { readonly: true });
        const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='SensorReadings'`).get();
        ok('SensorReadings table created by ensureSchema()', !!tableExists);

        const rowCount = db.prepare('SELECT COUNT(*) as n FROM SensorReadings').get()?.n || 0;
        ok(`SensorReadings has ${rowCount} rows after one poll (expect ${REGISTER_COUNT})`, rowCount === REGISTER_COUNT, `got ${rowCount}`);

        const firstRow = db.prepare(`SELECT * FROM SensorReadings ORDER BY ID ASC LIMIT 1`).get();
        ok('First row has TagName', !!firstRow?.TagName);
        ok('First row has numeric Value', typeof firstRow?.Value === 'number');
        ok('First row Source = "modbus"', firstRow?.Source === 'modbus');
        ok('First row IntegrationID = "scada"', firstRow?.IntegrationID === 'scada');

        const tagNames = db.prepare('SELECT DISTINCT TagName FROM SensorReadings').all().map(r => r.TagName);
        ok(`All ${REGISTER_COUNT} tag names present in readings`, tagNames.length === REGISTER_COUNT, `got ${tagNames.length}: ${tagNames.slice(0,3).join(', ')}…`);
        db.close();
    } else {
        ['SensorReadings table created','Row count correct','TagName present','Value numeric','Source correct','IntegrationID correct','All tags present'].forEach(n => ok(n, false, 'DB not created'));
    }

    // ── 5. EdgeAgent status ───────────────────────────────────────────────────
    section('5. EdgeAgent Status Object');
    const status = agent.status();
    ok('status() returns object with plantId', status?.plantId === TEST_PLANT);
    ok('status() running is false (not started via start())', status?.running === false);
    ok('status() pollCount is 1 after one manual poll', status?.pollCount === 1, `got ${status?.pollCount}`);
    ok('status() lastError is null after successful poll', status?.lastError === null);
    ok('status() lastPoll is an ISO date string', !!status?.lastPoll && !isNaN(Date.parse(status.lastPoll)));

    // ── 6. integration-manager lifecycle ─────────────────────────────────────
    section('6. Integration Manager — Simulator Lifecycle');
    const simResult = await intManager.startSimulator('testonly');
    ok('startSimulator() returns ok:true', simResult?.ok === true, JSON.stringify(simResult));
    ok('simulatorStatus() shows running after start', intManager.simulatorStatus('testonly')?.running === true);
    const simStop = await intManager.stopSimulator('testonly');
    ok('stopSimulator() returns ok:true', simStop?.ok === true);
    ok('simulatorStatus() shows running:false after stop', intManager.simulatorStatus('testonly')?.running === false);
    // Start again should be idempotent (called when already stopped)
    await intManager.startSimulator('testonly');
    const simAgain = await intManager.startSimulator('testonly');
    ok('startSimulator() is idempotent (already running)', simAgain?.ok === true);
    await intManager.stopSimulator('testonly');

    section('7. Integration Manager — Worker Lifecycle');
    const wStart = intManager.startWorker(TEST_PLANT, 'scada', { simulatorMode: true, simulatorPort: TEST_PORT, pollIntervalSeconds: 60 });
    ok('startWorker() returns ok:true', wStart?.ok === true, JSON.stringify(wStart));
    ok('getWorkerStatus() returns status object', !!intManager.getWorkerStatus(TEST_PLANT, 'scada'));
    const wDupe = intManager.startWorker(TEST_PLANT, 'scada', {});
    ok('startWorker() rejects duplicate (worker already running)', wDupe?.ok === false, JSON.stringify(wDupe));
    const wStop = intManager.stopWorker(TEST_PLANT, 'scada');
    ok('stopWorker() returns ok:true', wStop?.ok === true, JSON.stringify(wStop));
    ok('getWorkerStatus() returns null after stop', intManager.getWorkerStatus(TEST_PLANT, 'scada') === null);
    const wStopAgain = intManager.stopWorker(TEST_PLANT, 'scada');
    ok('stopWorker() handles already-stopped gracefully', wStopAgain?.ok === false);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    section('8. Cleanup');
    agent.stop();
    ok('agent.stop() cleans up without throwing', true);
    await simulator.stop();
    ok('simulator.stop() closes TCP server', !simulator.isRunning());
    if (fs.existsSync(TEST_DB)) {
        fs.unlinkSync(TEST_DB);
        ok('Temp test DB removed', !fs.existsSync(TEST_DB));
    } else {
        ok('Temp test DB removed (was never created)', true);
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const total = passed + failed;
    console.log('\n\x1b[1m════════════════════════════════════════════════════\x1b[0m');
    console.log(`  Results: \x1b[32m${passed} passed\x1b[0m  \x1b[31m${failed} failed\x1b[0m  (${total} total)`);
    console.log('\x1b[1m════════════════════════════════════════════════════\x1b[0m\n');

    process.exit(failed > 0 ? 1 : 0);
})();
