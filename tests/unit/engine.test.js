// Copyright © 2026 Trier OS. All Rights Reserved.

const assert = require('assert');

// Mocks
let mockRbacAllowed = true;
let mockRbacReason = null;
let mockPtwAllowed = true;
let mockPtwReason = null;
let mockMocAllowed = true;
let mockMocReason = null;
let auditCallCount = 0;
let mockDuplicateRequestId = false;

const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(path) {
    if (path.includes('../logistics_db')) {
        return {
            db: {
                prepare: () => ({
                    get: () => mockDuplicateRequestId ? { LedgerID: 1 } : null
                })
            }
        };
    }
    if (path.includes('./audit')) {
        return {
            writeAuditRecord: async () => {
                auditCallCount++;
                return 42;
            }
        };
    }
    if (path.includes('./validators/rbac')) {
        return {
            validateRole: async () => ({ allowed: mockRbacAllowed, denialReason: mockRbacReason })
        };
    }
    if (path.includes('./validators/ptw')) {
        return {
            validatePTW: async () => ({ allowed: mockPtwAllowed, denialReason: mockPtwReason, ptwRef: 99 })
        };
    }
    if (path.includes('./validators/moc')) {
        return {
            validateMOC: async () => ({ allowed: mockMocAllowed, denialReason: mockMocReason, mocRef: 88 })
        };
    }
    if (path.includes('./action_registry')) {
        return originalRequire.apply(this, arguments); // use real module
    }
    return originalRequire.apply(this, arguments);
};

const { runPipeline } = require('../../server/gatekeeper/engine');

async function runTests() {
    try {
        console.log('Running Engine Pipeline Tests...');

        // 1. Missing requestId -> MALFORMED_INTENT
        let res = await runPipeline({ userId: 'u', username: 'u', actionType: 'A' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'MALFORMED_INTENT');

        // 2. Missing actionType -> MALFORMED_INTENT
        res = await runPipeline({ requestId: 'r', userId: 'u', username: 'u' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'MALFORMED_INTENT');

        // 3. Duplicate requestId -> DUPLICATE_REQUEST_ID
        mockDuplicateRequestId = true;
        res = await runPipeline({ requestId: 'r', userId: 'u', username: 'u', actionType: 'A' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'DUPLICATE_REQUEST_ID');
        mockDuplicateRequestId = false;

        // 4. Unknown actionType -> UNKNOWN_ACTION_TYPE
        res = await runPipeline({ requestId: 'r', userId: 'u', username: 'u', actionType: 'DOES_NOT_EXIST' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'UNKNOWN_ACTION_TYPE');

        // 5. READ_ONLY action -> allowed: true and NO audit write
        auditCallCount = 0;
        res = await runPipeline({ requestId: 'r', userId: 'u', username: 'u', actionType: 'REPORT_READ' });
        assert.strictEqual(res.allowed, true);
        assert.strictEqual(auditCallCount, 0);

        // 6. ADVISORY action -> allowed: true and NO audit write
        auditCallCount = 0;
        res = await runPipeline({ requestId: 'r', userId: 'u', username: 'u', actionType: 'ALERT_ACKNOWLEDGE' });
        assert.strictEqual(res.allowed, true);
        assert.strictEqual(auditCallCount, 0);

        // 7. NON_CRITICAL, RBAC allows -> allowed: true, PTW/MOC not called
        auditCallCount = 0;
        mockRbacAllowed = true;
        mockPtwAllowed = false; // set to false to ensure they aren't called
        mockMocAllowed = false;
        res = await runPipeline({ requestId: 'r', userId: 'u', username: 'u', actionType: 'WORK_ORDER_CREATE' });
        assert.strictEqual(res.allowed, true);
        assert.strictEqual(auditCallCount, 1);

        // 8. NON_CRITICAL, RBAC denies -> allowed: false, audit write called
        auditCallCount = 0;
        mockRbacAllowed = false;
        mockRbacReason = 'INSUFFICIENT_ROLE';
        res = await runPipeline({ requestId: 'r', userId: 'u', username: 'u', actionType: 'WORK_ORDER_CREATE' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'INSUFFICIENT_ROLE');
        assert.strictEqual(auditCallCount, 1);

        // 9. SAFETY_CRITICAL, RBAC allows, PTW denies
        auditCallCount = 0;
        mockRbacAllowed = true;
        mockPtwAllowed = false;
        mockPtwReason = 'PTW_REQUIRED';
        res = await runPipeline({ requestId: 'r', userId: 'u', username: 'u', actionType: 'LOTO_ACTIVATE' });
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.denialReason, 'PTW_REQUIRED');
        assert.strictEqual(auditCallCount, 1);

        // 10. SAFETY_CRITICAL, all allow -> allowed: true
        auditCallCount = 0;
        mockPtwAllowed = true;
        mockMocAllowed = true;
        res = await runPipeline({ requestId: 'r', userId: 'u', username: 'u', actionType: 'SETPOINT_WRITE' });
        assert.strictEqual(res.allowed, true);
        assert.strictEqual(auditCallCount, 1);
        assert.strictEqual(res.ptwRef, 99);
        assert.strictEqual(res.mocRef, 88);

        // Restore original functions
        Module.prototype.require = originalRequire;

        console.log('All engine.js tests passed.');
        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

runTests();
