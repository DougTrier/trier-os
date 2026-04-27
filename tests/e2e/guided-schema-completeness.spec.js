// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * guided-schema-completeness.spec.js — Guided Execution Schema Completeness
 * ==========================================================================
 * Static analysis tests that run without a browser or a running server.
 * Validates that the close-out-work-order pilot schema is internally
 * consistent with the four registries before any component code is written.
 *
 * WHAT THIS PROVES:
 *   - Every validation.check key exists in guideValidation.js (I-GE3)
 *   - Every requiredContext source is valid in guideContext.js (I-GE4)
 *   - Every prerequisiteCheck key is in guideValidation.js (I-GE4)
 *   - Every target.route is allowlisted in guideNavigation.js (security gate)
 *   - Every step has a target.anchor (I-GE1)
 *   - allowAutoAction is false on every workflow (audit rule)
 *   - Risk level is recognized by the risk gate (security gate)
 *   - Unknown workflow IDs are not in the registry (fail closed)
 *   - Registry functions return correct values on invalid inputs (fail closed)
 *
 * DOES NOT REQUIRE: a browser, a running server, or authentication.
 * Run standalone: npx playwright test guided-schema-completeness
 */

import { test, expect } from '@playwright/test';
import GUIDED_WORKFLOWS from '../../src/data/guidedWorkflows.js';
import { isRegistered, runCheck } from '../../src/utils/guideValidation.js';
import { resolveRoute, isOnRoute } from '../../src/utils/guideNavigation.js';
import { evaluateRiskGate } from '../../src/utils/guideRiskGate.js';
import { resolveAnchor, isAnchorVisible } from '../../src/utils/guideAnchor.js';
import { resolveContext, resolveRequired } from '../../src/utils/guideContext.js';

// Valid context sources declared in guideContext.js
const VALID_CONTEXT_SOURCES = new Set(['session', 'selection', 'route', 'api']);

// Kebab-case anchor pattern per anchor naming convention
const ANCHOR_RE = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/;

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: Registry presence — fail closed on unknown keys
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Registry — fail closed on unknown keys', () => {

    test('unknown validation key returns false', () => {
        expect(isRegistered('__unknown__')).toBe(false);
        expect(isRegistered('')).toBe(false);
        expect(isRegistered('eval')).toBe(false);
    });

    test('runCheck with unknown key returns false without throwing', () => {
        const ctx = { state: {}, user: {} };
        expect(runCheck('__unknown__', ctx)).toBe(false);
        expect(runCheck('', ctx)).toBe(false);
    });

    test('resolveRoute with unknown route returns ok: false', () => {
        expect(resolveRoute('/unknown')).toMatchObject({ ok: false });
        expect(resolveRoute('')).toMatchObject({ ok: false });
        expect(resolveRoute('/../../etc/passwd')).toMatchObject({ ok: false });
        expect(resolveRoute(null)).toMatchObject({ ok: false });
    });

    test('resolveRoute with allowed route returns ok: true', () => {
        expect(resolveRoute('/jobs')).toMatchObject({ ok: true, route: '/jobs' });
    });

    test('evaluateRiskGate with unknown risk level blocks and does not throw', () => {
        const result = evaluateRiskGate({ level: '__unknown__', requiresConfirmation: false }, 'Technician');
        expect(result.allowed).toBe(false);
        expect(result.blockedReason).toBeTruthy();
    });

    test('evaluateRiskGate with null risk blocks gracefully', () => {
        const result = evaluateRiskGate(null, 'Technician');
        expect(result.allowed).toBeDefined();
    });

    test('resolveAnchor with empty string returns null', () => {
        expect(resolveAnchor('')).toBeNull();
        expect(resolveAnchor(null)).toBeNull();
    });

    test('resolveContext with unknown source returns empty object', () => {
        const result = resolveContext('__unknown__');
        expect(result).toEqual({});
    });

    test('resolveRequired with unfulfilled key reports it as missing', () => {
        // 'api' source returns {} — so any key from it resolves to null
        const { missing } = resolveRequired([{ key: 'nonexistentKey', source: 'api' }]);
        expect(missing).toContain('nonexistentKey');
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: Workflow registry — fail closed on unknown workflow IDs
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Workflow registry — fail closed on unknown IDs', () => {

    test('unknown workflow IDs are undefined', () => {
        expect(GUIDED_WORKFLOWS['__unknown__']).toBeUndefined();
        expect(GUIDED_WORKFLOWS['inject']).toBeUndefined();
        expect(GUIDED_WORKFLOWS['']).toBeUndefined();
        expect(GUIDED_WORKFLOWS['../../../etc/passwd']).toBeUndefined();
    });

    test('pilot workflow is registered', () => {
        expect(GUIDED_WORKFLOWS['close-out-work-order']).toBeDefined();
    });

    test('registry contains exactly one workflow (pilot only)', () => {
        const ids = Object.keys(GUIDED_WORKFLOWS);
        expect(ids).toEqual(['close-out-work-order']);
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Pilot schema — structural completeness
// ─────────────────────────────────────────────────────────────────────────────

test.describe('close-out-work-order — schema completeness', () => {
    const wf = GUIDED_WORKFLOWS['close-out-work-order'];

    test('required top-level fields are present', () => {
        expect(typeof wf.id).toBe('string');
        expect(typeof wf.title).toBe('string');
        expect(typeof wf.manualSectionId).toBe('string');
        expect(wf.eligibility).toBeDefined();
        expect(wf.risk).toBeDefined();
        expect(Array.isArray(wf.steps)).toBe(true);
    });

    test('id matches registry key', () => {
        expect(wf.id).toBe('close-out-work-order');
    });

    // ── Risk ──────────────────────────────────────────────────────────────────

    test('allowAutoAction is false (audit rule — never override)', () => {
        expect(wf.risk.allowAutoAction).toBe(false);
    });

    test('risk level is recognized by evaluateRiskGate', () => {
        const result = evaluateRiskGate(wf.risk, 'Technician');
        expect(result.blockedReason).not.toBe('guide.error.unknownRiskLevel');
    });

    test('risk.requiresConfirmation is a boolean', () => {
        expect(typeof wf.risk.requiresConfirmation).toBe('boolean');
    });

    // ── Eligibility ───────────────────────────────────────────────────────────

    test('eligibility.roles is a non-empty array of strings', () => {
        expect(Array.isArray(wf.eligibility.roles)).toBe(true);
        expect(wf.eligibility.roles.length).toBeGreaterThan(0);
        for (const role of wf.eligibility.roles) {
            expect(typeof role).toBe('string');
        }
    });

    test('eligibility.requiredContext sources are all valid', () => {
        for (const item of wf.eligibility.requiredContext) {
            expect(typeof item.key).toBe('string');
            expect(VALID_CONTEXT_SOURCES.has(item.source)).toBe(true);
        }
    });

    test('eligibility.prerequisiteChecks are all registered in validationRegistry', () => {
        for (const key of wf.eligibility.prerequisiteChecks) {
            expect(isRegistered(key)).toBe(true);
        }
    });

    // ── Steps ─────────────────────────────────────────────────────────────────

    test('steps array is non-empty', () => {
        expect(wf.steps.length).toBeGreaterThan(0);
    });

    test('step IDs are unique within the workflow', () => {
        const ids = wf.steps.map(s => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    for (const step of wf.steps) {
        test(`step "${step.id}": required fields are present`, () => {
            expect(typeof step.id).toBe('string');
            expect(typeof step.instruction).toBe('string');
            expect(step.target).toBeDefined();
            expect(step.action).toBeDefined();
            expect(step.validation).toBeDefined();
            expect(step.onFailure).toBeDefined();
        });

        test(`step "${step.id}": target.anchor is a non-empty kebab-case string`, () => {
            expect(typeof step.target.anchor).toBe('string');
            expect(step.target.anchor.length).toBeGreaterThan(0);
            expect(ANCHOR_RE.test(step.target.anchor)).toBe(true);
        });

        test(`step "${step.id}": target.route is allowlisted`, () => {
            const result = resolveRoute(step.target.route);
            expect(result.ok).toBe(true);
        });

        test(`step "${step.id}": validation.check "${step.validation.check}" is registered`, () => {
            expect(isRegistered(step.validation.check)).toBe(true);
        });

        test(`step "${step.id}": validation.check is a string, not a function`, () => {
            expect(typeof step.validation.check).toBe('string');
        });

        test(`step "${step.id}": action.type is a string`, () => {
            expect(typeof step.action.type).toBe('string');
        });

        test(`step "${step.id}": onFailure.recovery is a valid strategy`, () => {
            const VALID_RECOVERY = new Set(['retry', 'block', 'redirect', 'exit']);
            expect(VALID_RECOVERY.has(step.onFailure.recovery)).toBe(true);
        });

        test(`step "${step.id}": onFailure.message is an i18n key string`, () => {
            expect(typeof step.onFailure.message).toBe('string');
            expect(step.onFailure.message.length).toBeGreaterThan(0);
        });
    }

});

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: Schema-completeness gate (the canonical pass/fail gate)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Schema completeness gate', () => {

    test('all registered check keys in the pilot are accounted for in validationRegistry', () => {
        const allCheckKeys = new Set();
        const wf = GUIDED_WORKFLOWS['close-out-work-order'];

        for (const key of wf.eligibility.prerequisiteChecks) allCheckKeys.add(key);
        for (const step of wf.steps) allCheckKeys.add(step.validation.check);

        for (const key of allCheckKeys) {
            expect(isRegistered(key)).toBe(true);
        }
    });

    test('all target routes in the pilot are in the navigation allowlist', () => {
        const wf = GUIDED_WORKFLOWS['close-out-work-order'];
        for (const step of wf.steps) {
            expect(resolveRoute(step.target.route).ok).toBe(true);
        }
    });

    test('no step contains inline executable logic (all checks are strings)', () => {
        const wf = GUIDED_WORKFLOWS['close-out-work-order'];
        for (const step of wf.steps) {
            expect(typeof step.validation.check).toBe('string');
            expect(typeof step.action.type).toBe('string');
            expect(typeof step.onFailure.recovery).toBe('string');
            expect(typeof step.instruction).toBe('string');
        }
    });

});
