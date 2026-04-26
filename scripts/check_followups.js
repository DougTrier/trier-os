#!/usr/bin/env node
// Copyright © 2026 Trier OS. All Rights Reserved.
//
// check_followups.js — CI guard for docs/followups.yaml
//
// Fails (exit 1) if:
//   1. Any deferred item has lastReviewedAt > 90 days ago
//   2. Any deferred item's triggerEnvVar is set in the current environment
//      (accidental deployment of a feature that requires the follow-up to be complete first)
//
// Usage:
//   node scripts/check_followups.js
//   node scripts/check_followups.js --max-age-days 60

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

const now     = Date.now();
const cutoff  = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
let failures  = 0;

for (const item of followups) {
    if (item.status === 'completed') continue;

    const id    = item.id    || '(unknown)';
    const title = item.title || '(no title)';

    // Rule 1: staleness check
    if (item.lastReviewedAt) {
        const reviewedMs = new Date(item.lastReviewedAt).getTime();
        const ageMs      = now - reviewedMs;
        const ageDays    = Math.floor(ageMs / (24 * 60 * 60 * 1000));
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

    // Rule 2: trigger-active check
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

if (failures === 0) {
    const deferred = followups.filter(f => f.status !== 'completed');
    console.log(
        `[check_followups] OK — ${deferred.length} deferred item(s) within review window, ` +
        `no active triggers.`
    );
    process.exit(0);
} else {
    process.exit(1);
}
