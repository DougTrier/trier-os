// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * config.js — Lightweight configuration endpoints for PWA caching
 * ================================================================
 * Returns lookup tables that the PWA caches in IndexedDB so offline
 * logic (predictBranch, status display) stays accurate without
 * hardcoded constants.
 *
 * -- ROUTES ----------------------------------------------------
 *   GET /api/config/statuses   WorkStatuses lookup + active/waiting groupings
 */

'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

// Description patterns that classify a status into the active / waiting groups
// used by predictBranch. Matching is case-insensitive substring.
const ACTIVE_PATTERNS  = ['open', 'in progress', 'in-progress'];
const WAITING_PATTERNS = ['waiting', 'on hold', 'hold', 'vendor', 'parts'];

router.get('/statuses', (req, res) => {
    try {
        const rows = db.getDb().prepare('SELECT ID, Description FROM WorkStatuses ORDER BY ID').all();

        const activeIds  = rows.filter(r => ACTIVE_PATTERNS.some(p  => r.Description.toLowerCase().includes(p))).map(r => r.ID);
        const waitingIds = rows.filter(r => WAITING_PATTERNS.some(p => r.Description.toLowerCase().includes(p))).map(r => r.ID);

        // Guaranteed fallback: if DB has no recognisable rows, return the known defaults
        res.json({
            statuses:  rows,
            activeIds:  activeIds.length  ? activeIds  : [20, 30],
            waitingIds: waitingIds.length ? waitingIds : [31, 32, 35],
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
