// Copyright © 2026 Trier OS. All Rights Reserved.
// server/services/explainCache.js
//
// Explain payload cache (Phase 3, Better Scan Flow).
//
// Pre-warms GET /api/assets/:id/explain so scan-triggered explain reads are served
// from memory instead of querying multiple tables on every request.
//
// Cache contract:
//   - In-memory Map, keyed by `${plantId}:${assetId}`
//   - TTL: 60s (safety net only — primary invalidation is event-driven)
//   - Miss path: compute synchronously, cache, return
//   - Failure path: return minimal deterministic payload + warmAsync for next call
//
// Hard rule: Fast is good. Stale is fatal.
// All 6 invalidation events delete from cache before returning.
// warmAsync repopulates for the next request — never serves stale.

'use strict';

const path     = require('path');
const Database = require('better-sqlite3');
const dataDir  = require('../resolve_data_dir');

// ── Cache store ───────────────────────────────────────────────────────────────
// entry shape: { payload, computedAt: number, timer: NodeJS.Timeout }
const _cache = new Map();
const TTL_MS = 60_000;

function _key(plantId, assetId) {
    return `${plantId}:${assetId}`;
}

function _drop(k) {
    const entry = _cache.get(k);
    if (entry?.timer) clearTimeout(entry.timer);
    _cache.delete(k);
}

// ── Public cache ops ──────────────────────────────────────────────────────────

function get(plantId, assetId) {
    const k = _key(plantId, assetId);
    const entry = _cache.get(k);
    if (!entry) return null;
    if (Date.now() - entry.computedAt > TTL_MS) { _drop(k); return null; }
    return entry.payload;
}

function set(plantId, assetId, payload) {
    const k = _key(plantId, assetId);
    _drop(k); // clear any existing timer
    const timer = setTimeout(() => _cache.delete(k), TTL_MS);
    _cache.set(k, { payload, computedAt: Date.now(), timer });
}

/**
 * Remove a cached entry. Always call this before warmAsync so the stale
 * entry is gone immediately — warmAsync may lag by one setImmediate tick.
 */
function invalidate(plantId, assetId) {
    _drop(_key(plantId, assetId));
}

/** Fire-and-forget background compute. Safe to call from synchronous code. */
function warmAsync(plantId, assetId) {
    setImmediate(() => {
        try {
            const payload = computeExplain(plantId, assetId);
            if (payload) set(plantId, assetId, payload);
        } catch { /* cache failure must never surface */ }
    });
}

/** Entries currently cached (for monitoring). */
function size() { return _cache.size; }

// ── Computation ───────────────────────────────────────────────────────────────

/**
 * Compute the full explain payload for a plant+asset pair.
 * Uses db.getDb(plantId) — safe to call outside HTTP request context.
 * Returns null only if the asset cannot be found.
 */
function computeExplain(plantId, assetId) {
    const { getDb } = require('../database');
    const plant = getDb(plantId);

    const mfgPath = path.join(dataDir, 'mfg_master.db');
    const mfg = new Database(mfgPath, { readonly: true });

    try {
        // 1. Asset identity — columns vary by plant schema, try richest first
        let asset = null;
        try {
            asset = plant.prepare(
                'SELECT ID, Description, AssetType, Status, Manufacturer, Model, InstallDate, Location, EquipmentTypeID FROM Object WHERE ID = ? LIMIT 1'
            ).get(assetId);
        } catch {
            try { asset = plant.prepare('SELECT ID, Description FROM Object WHERE ID = ? LIMIT 1').get(assetId); } catch {}
        }
        if (!asset) {
            try { asset = plant.prepare('SELECT ID, Description FROM Asset WHERE ID = ? LIMIT 1').get(assetId); } catch {}
        }

        // 2. Live state snapshot
        let liveState = null;
        try {
            const row = plant.prepare(
                'SELECT StateJSON, Source, LastUpdated, StaleAfterS FROM AssetLiveState WHERE AssetID = ?'
            ).get(assetId);
            if (row) {
                const ageS = Math.floor((Date.now() - new Date(row.LastUpdated).getTime()) / 1000);
                liveState = {
                    state:       JSON.parse(row.StateJSON || '{}'),
                    source:      row.Source,
                    lastUpdated: row.LastUpdated,
                    stale:       ageS > row.StaleAfterS,
                };
            }
        } catch { /* AssetLiveState absent */ }

        // 3. Recent failures (last 60 days)
        const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
        let recentFailures = [];
        try {
            recentFailures = plant.prepare(`
                SELECT fc.failureCode, fc.failureDesc, fc.causeDesc, fc.severity,
                       fm.normalized_mode, fm.failure_class
                FROM FailureCodes fc
                JOIN WOMaster wo ON wo.ID = fc.woId
                LEFT JOIN failure_modes fm ON fm.code = fc.failureCode
                WHERE wo.AstID = ? AND wo.AddDate >= ?
                ORDER BY wo.AddDate DESC LIMIT 5
            `).all(assetId, cutoff);
        } catch { /* FailureCodes / WOMaster absent */ }

        // 4. PM status
        let pmStatus = null;
        try {
            const pm = plant.prepare(`
                SELECT NextDate, FreqType,
                       CAST(julianday('now') - julianday(NextDate) AS INTEGER) AS daysOverdue
                FROM Schedule
                WHERE AstID = ? AND IsActive = 1
                ORDER BY daysOverdue DESC LIMIT 1
            `).get(assetId);
            if (pm) pmStatus = { nextDate: pm.NextDate, freqType: pm.FreqType, daysOverdue: pm.daysOverdue };
        } catch { /* Schedule absent */ }

        // 5. Contextual artifacts from artifact_context_map
        const contextualArtifacts = [];
        const equipmentTypeId = asset?.EquipmentTypeID || null;
        try {
            const triggers = [];
            if (recentFailures[0]?.normalized_mode)
                triggers.push({ type: 'failure_mode', value: recentFailures[0].normalized_mode });
            if (recentFailures[0]?.failure_class)
                triggers.push({ type: 'failure_class', value: recentFailures[0].failure_class });
            if (pmStatus?.daysOverdue > 0)
                triggers.push({ type: 'state', value: 'overdue_pm' });
            if (triggers.length === 0)
                triggers.push({ type: 'state', value: 'maintenance' });

            for (const trigger of triggers) {
                const rows = mfg.prepare(`
                    SELECT a.ArtifactID, a.EntityID, a.ArtifactType, a.ArtifactRole,
                           a.Format, a.Source, a.FileURL, a.Confidence, a.Verified,
                           m.Priority
                    FROM artifact_context_map m
                    JOIN catalog_artifacts a ON (
                        (m.ArtifactID IS NOT NULL AND a.ArtifactID = m.ArtifactID)
                        OR (m.ArtifactID IS NULL AND a.ArtifactType = m.ArtifactType
                            ${equipmentTypeId ? 'AND a.EntityID = ?' : ''})
                    )
                    WHERE m.TriggerType = ? AND m.TriggerValue = ?
                      AND a.IsActive = 1
                    ORDER BY m.Priority ASC, a.Confidence DESC
                    LIMIT 3
                `).all(...(equipmentTypeId
                    ? [equipmentTypeId, trigger.type, trigger.value]
                    : [trigger.type, trigger.value]));
                for (const r of rows) {
                    if (!contextualArtifacts.find(a => a.ArtifactID === r.ArtifactID))
                        contextualArtifacts.push({ ...r, triggeredBy: trigger });
                }
            }
        } catch { /* mfg_master absent or schema mismatch */ }

        // 6. Recommended actions (deterministic, no AI)
        const actions = [];
        if (pmStatus?.daysOverdue > 0)
            actions.push({ priority: 1, action: `PM overdue by ${pmStatus.daysOverdue} days — schedule preventive maintenance`, type: 'pm' });
        if (recentFailures.length > 0) {
            const f = recentFailures[0];
            actions.push({
                priority: 2,
                action: `Recent failure: ${f.failureDesc || f.normalized_mode || f.failureCode}${f.causeDesc ? ' — ' + f.causeDesc : ''}`,
                type: 'failure', severity: f.severity,
            });
        }
        if (contextualArtifacts.some(a => a.ArtifactType === 'manual'))
            actions.push({ priority: 3, action: 'Service manual available — review before repair', type: 'artifact' });
        if (contextualArtifacts.some(a => a.ArtifactType === 'cad'))
            actions.push({ priority: 4, action: 'CAD exploded view available — reference for part replacement', type: 'artifact' });

        return {
            assetId,
            identity:            asset || { ID: assetId, Description: assetId },
            liveState,
            recentFailures,
            pmStatus,
            contextualArtifacts,
            recommendedActions:  actions.sort((a, b) => a.priority - b.priority),
            generatedAt:         new Date().toISOString(),
        };
    } finally {
        mfg.close();
    }
}

module.exports = { get, set, invalidate, warmAsync, computeExplain, size };
