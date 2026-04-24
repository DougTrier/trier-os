// Copyright © 2026 Trier OS. All Rights Reserved.

const assert = require('assert');
const { getActionClass, isGoverned } = require('../../server/gatekeeper/action_registry');

function runTests() {
    try {
        console.log('Running action_registry tests...');

        assert.strictEqual(getActionClass('LOTO_ACTIVATE'), 'SAFETY_CRITICAL');
        assert.strictEqual(getActionClass('WORK_ORDER_CREATE'), 'NON_CRITICAL');
        assert.strictEqual(getActionClass('ALERT_ACKNOWLEDGE'), 'ADVISORY');

        assert.throws(() => {
            getActionClass('UNKNOWN_TYPE');
        }, /Unknown actionType: UNKNOWN_TYPE/);

        assert.strictEqual(isGoverned('LOTO_ACTIVATE'), true);
        assert.strictEqual(isGoverned('WORK_ORDER_CREATE'), true);
        assert.strictEqual(isGoverned('ALERT_ACKNOWLEDGE'), false);
        assert.strictEqual(isGoverned('REPORT_READ'), false);

        assert.throws(() => {
            isGoverned('UNKNOWN_TYPE');
        }, /Unknown actionType: UNKNOWN_TYPE/);

        console.log('All action_registry tests passed.');
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

runTests();
