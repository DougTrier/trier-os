#!/usr/bin/env node
// Copyright © 2026 Trier OS. All Rights Reserved.
//
// check_followups.js — CI guard for docs/followups.yaml
//
// Fails (exit 1) if:
//   1. Any deferred item has lastReviewedAt > 90 days ago (staleness)
//   2. Any deferred item's triggerEnvVar is set in the current environment
//      (accidental deployment of a feature that requires the follow-up first)
//   3. (--evidence-report) Any invariant shows evidence.stale == true
//      (previously-active guard has gone quiet — possible dead code path)
//
// Usage:
//   node scripts/check_followups.js
//   node scripts/check_followups.js --max-age-days 60
//   node scripts/check_followups.js --evidence-report /path/to/report.json
//
// The --evidence-report flag enables staleness checks against a snapshot of
// GET /api/invariants/report?plantId=all. Typical post-deploy CI step:
//   curl -s "$API/api/invariants/report?plantId=all" > /tmp/inv-report.json
//   node scripts/check_followups.js --evidence-report /tmp/inv-report.json

'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const MAX_AGE_DAYS = (() => {
    const flag = process.argv.find(a => a.startsWith('--max-age-days='));
    if (flag) return parseInt(flag.split('=')[1], 10);
    const idx = process.argv.indexOf('--max-age-days');
    if (idx !== -1) return parseInt(process.argv[idx + 1], 10);
    return 90;
})();

const EVIDENCE_REPORT_PATH = (() => {
    const flag = process.argv.find(a => a.startsWith('--evidence-report='));
    if (flag) return flag.split('=').slice(1).join('=');
    const idx = process.argv.indexOf('--evidence-report');
    if (idx !== -1) return process.argv[idx + 1];
    return null;
})();

const FOLLOWUPS_PATH = path.join(__dirname, '..', 'docs', 'followups.yaml');

let followups;
try {
    followups = yaml.load(fs.readFileSync(FOLLOWUPS_PATH, 'utf8'));
} catch (err) {
    console.error(`[check_followups] Cannot read ${FOLLOWUPS_PATH}: ${err.message}`);
    process.exit(1);
}

if (!Array.isArray(followups)) {
    console.error('[check_followups] followups.yaml must be an array at the root.');
    process.exit(1);
}

const now    = Date.now();
const cutoff = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
let failures = 0;

// ── Rule 1 + 2: followup staleness and trigger-active checks ─────────────────
for (const item of followups) {
    if (item.status === 'completed') continue;

    const id    = item.id    || '(unknown)';
    const title = item.title || '(no title)';

    if (item.lastReviewedAt) {
        const ageMs   = now - new Date(item.lastReviewedAt).getTime();
        const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        if (ageMs > cutoff) {
            console.error(
                `[FAIL] ${id}: deferred item not reviewed in ${ageDays} days ` +
                `(max ${MAX_AGE_DAYS}). Last reviewed: ${item.lastReviewedAt}. ` +
                `Update lastReviewedAt in docs/followups.yaml after review.`
            );
            failures += 1;
        }
    } else {
        console.error(`[FAIL] ${id}: deferred item has no lastReviewedAt. Add a review date.`);
        failures += 1;
    }

    if (item.triggerEnvVar && process.env[item.triggerEnvVar]) {
        console.error(
            `[FAIL] ${id}: trigger env var ${item.triggerEnvVar} is set but ` +
            `this follow-up is not completed. ` +
            `"${title}" must be implemented before enabling this feature. ` +
            `Complete the follow-up and set status=completed in docs/followups.yaml.`
        );
        failures += 1;
    }
}

// ── Rule 3: evidence staleness check (optional — requires --evidence-report) ─
if (EVIDENCE_REPORT_PATH) {
    let report;
    try {
        report = JSON.parse(fs.readFileSync(EVIDENCE_REPORT_PATH, 'utf8'));
    } catch (err) {
        console.error(`[check_followups] Cannot read evidence report ${EVIDENCE_REPORT_PATH}: ${err.message}`);
        process.exit(1);
    }

    const invariants = report?.invariants ?? [];
    for (const inv of invariants) {
        if (inv.evidence?.stale) {
            console.error(
                `[FAIL] ${inv.id}: invariant evidence is stale — ` +
                `this guard was previously active (${inv.evidence.preventedCount} prevention(s)) ` +
                `but has not fired in over 30 days (last: ${inv.evidence.lastOccurrence}). ` +
                `Possible dead code path — verify the enforcement call site is still reachable.`
            );
            failures += 1;
        }
    }

    // Also check overall FAIL status from the report
    if (report?.overallStatus === 'FAIL') {
        const failing = (invariants).filter(i => i.status === 'FAIL').map(i => i.id);
        console.error(
            `[FAIL] Invariant report shows FAIL for: ${failing.join(', ')}. ` +
            `Run GET /api/invariants/report?plantId=all for details.`
        );
        failures += 1;
    }
}

if (failures === 0) {
    const deferred = followups.filter(f => f.status !== 'completed');
    const evidenceNote = EVIDENCE_REPORT_PATH ? ', no stale evidence' : '';
    console.log(
        `[check_followups] OK — ${deferred.length} deferred item(s) within review window, ` +
        `no active triggers${evidenceNote}.`
    );
    process.exit(0);
} else {
    process.exit(1);
}
