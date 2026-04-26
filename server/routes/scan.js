// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * scan.js — Scan State Machine API
 * ==================================
 * POST /api/scan is the single server-side entry point for every QR/barcode
 * scan on the plant floor, regardless of input device (Zebra hardware scanner,
 * phone camera, tablet camera, or numeric fallback). The server evaluates asset
 * state deterministically and returns a branch response — the device never
 * decides workflow logic.
 *
 * The state machine is the authoritative implementation of the formal spec
 * in ROADMAP.md (P1 — Scan State Machine) and SCAN_STATE_MACHINE_SCHEMA_DELTA.md.
 *
 * -- ROUTES ----------------------------------------------------
 *   POST /api/scan                    Main scan endpoint — evaluate + transition
 *   POST /api/scan/action             Submit user choice after a branch prompt
 *   GET  /api/scan/enrichment/:id     SSE stream — pushes semantic enrichment result when ready
 *   GET  /api/scan/needs-review       List WOs flagged needsReview=1 for Mission Control
 *   POST /api/scan/desk-action        Supervisor resolution (Close/Resume/Dismiss) from Mission Control
 *   POST /api/scan/offline-sync       Batch sync queued offline scan events
 *
 * -- SERVER EVALUATION ORDER (deterministic, no implicit branching) ----------
 *   1. Duplicate scanId?          → Reject. No further evaluation.
 *   2. Active WO on asset?        → Route into active WO flow (multi-tech aware).
 *   3. No active WO, waiting WO?  → Branch prompt: Resume / Create New / View.
 *   4. No WOs at all?             → Auto-create WO, open segment, flash confirm.
 *
 * -- WO STATUS IDS (WorkStatuses table) ------------------------------------
 *   20 = Open      30 = Started (InProgress)   31 = Waiting Parts
 *   32 = Waiting Contractor                    33 = Escalated
 *   35 = On Hold   40 = Completed/Closed
 *
 * -- DECISION BRANCH CODES (ScanAuditLog.decisionBranch) ------------------
 *   See SCAN_STATE_MACHINE_SCHEMA_DELTA.md §5 Decision Branch enum for full list.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const dataDir = require('../resolve_data_dir');
const enrichmentQueue  = require('../services/enrichmentQueue');
const outcomeTracker   = require('../services/outcomeTracker');
const explainCache     = require('../services/explainCache');
const authDb           = require('../auth_db');
const { logInvariant } = require('../logistics_db');

// ── Idempotent migration: add scan-workflow columns to Work table ────────────
// SQLite doesn't support IF NOT EXISTS for ALTER TABLE — use try/catch per col.
const SCAN_WORK_COLUMNS = [
    'holdReason TEXT',
    'reviewReason TEXT',
    'reviewStatus TEXT',
    'acknowledgedByUserId TEXT',
    'acknowledgedAt TEXT',
    'returnAt TEXT',
    'closedByUserId TEXT',
    'needsReview INTEGER DEFAULT 0',
    'scheduledByUserId TEXT',
    'conflictAutoResolved INTEGER DEFAULT 0',
    'resolvedMode TEXT',
];

function ensureScanColumns(conn) {
    for (const colDef of SCAN_WORK_COLUMNS) {
        try { conn.prepare(`ALTER TABLE Work ADD COLUMN ${colDef}`).run(); } catch { /* already exists */ }
    }
    // Also ensure supporting tables exist
    try {
        conn.exec(`
            CREATE TABLE IF NOT EXISTS ScanAuditLog (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                auditEventId     TEXT    UNIQUE,
                scanId           TEXT,
                woId             TEXT,
                assetId          TEXT,
                userId           TEXT,
                previousState    TEXT,
                nextState        TEXT,
                decisionBranch   TEXT,
                deviceTimestamp  TEXT,
                serverTimestamp  TEXT,
                offlineCaptured  INTEGER DEFAULT 0,
                conflictAutoResolved INTEGER DEFAULT 0,
                resolvedMode     TEXT
            );
            CREATE TABLE IF NOT EXISTS WorkSegments (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                segmentId            TEXT    UNIQUE,
                woId                 TEXT,
                userId               TEXT,
                startTime            TEXT,
                endTime              TEXT,
                segmentState         TEXT    DEFAULT 'Active',
                segmentReason        TEXT,
                origin               TEXT    DEFAULT 'SCAN',
                endedByUserId        TEXT,
                holdReason           TEXT,
                conflictAutoResolved INTEGER DEFAULT 0
            );
        `);
    } catch { /* already exists */ }

    // R-1 fix: UNIQUE constraint on ScanAuditLog.scanId enforces idempotency at the
    // DB layer. Without this, concurrent cluster workers that both pass the pre-check
    // SELECT could both insert audit entries for the same physical scan.
    // Wrapped in try/catch so a pre-existing table with no duplicates migrates cleanly;
    // if actual duplicates exist the index creation fails loudly so the operator can audit.
    try {
        conn.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_audit_scanid ON ScanAuditLog(scanId)`);
    } catch (e) {
        console.warn('[scan] Could not create unique index on ScanAuditLog.scanId:', e.message,
            '— check for duplicate scanId rows before this index can be applied.');
    }
}

// Run migration on the default DB at startup — also called per-request below
try { ensureScanColumns(db.getDb()); } catch { /* db not ready yet */ }

// ── Status ID constants — maps spec states to existing WorkStatuses rows ────
const STATUS = {
    OPEN:        20,   // WO created, not yet started
    IN_PROGRESS: 30,   // Active work in progress (segment open)
    WAITING_PARTS: 31, // On Hold — Waiting on Parts
    WAITING_VENDOR: 32, // On Hold — Waiting on Vendor/Contractor
    ESCALATED:   33,   // Escalated — requires supervisor attention
    ON_HOLD:     35,   // On Hold — generic (Continue Later, Shift End, etc.)
    COMPLETED:   40,   // Closed
};

// ── Hold reason → StatusID mapping ─────────────────────────────────────────
// Maps the holdReason code the tech selects to the concrete WorkStatuses row.
const HOLD_REASON_TO_STATUS = {
    WAITING_ON_PARTS:    STATUS.WAITING_PARTS,
    WAITING_ON_VENDOR:   STATUS.WAITING_VENDOR,
    WAITING_ON_APPROVAL: STATUS.ON_HOLD,
    SCHEDULED_RETURN:    STATUS.ON_HOLD,
    CONTINUE_LATER:      STATUS.ON_HOLD,
    SHIFT_END_UNRESOLVED: STATUS.ON_HOLD,
    UNKNOWN_HOLD:        STATUS.ON_HOLD,
};

// ── Hold reasons exempt from auto-review timeout ────────────────────────────
const { EXEMPT_HOLD_REASONS } = require('../constants/holdReasons');

// ── Active WO StatusIDs — these have at least one open segment ──────────────
const ACTIVE_STATUSES = new Set([STATUS.IN_PROGRESS, STATUS.OPEN]);

// ── Non-terminal hold StatusIDs — WO is paused but not closed ───────────────
const HOLD_STATUSES = new Set([
    STATUS.WAITING_PARTS, STATUS.WAITING_VENDOR,
    STATUS.ON_HOLD, STATUS.ESCALATED,
]);

// ── Helper: write an immutable ScanAuditLog entry ───────────────────────────
function writeAuditEntry(conn, { scanId, woId = null, assetId, userId,
    previousState = null, nextState = null, decisionBranch,
    deviceTimestamp, offlineCaptured = 0, conflictAutoResolved = 0, resolvedMode = null }) {
    conn.prepare(`
        INSERT INTO ScanAuditLog
            (auditEventId, scanId, woId, assetId, userId,
             previousState, nextState, decisionBranch,
             deviceTimestamp, serverTimestamp,
             offlineCaptured, conflictAutoResolved, resolvedMode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
    `).run(uuidv4(), scanId, woId, assetId, userId,
        previousState ? String(previousState) : null,
        nextState ? String(nextState) : null,
        decisionBranch, deviceTimestamp,
        offlineCaptured ? 1 : 0, conflictAutoResolved ? 1 : 0, resolvedMode);
}

// ── Helper: human-readable time-ago string ──────────────────────────────────
function timeAgo(isoString) {
    if (!isoString) return '';
    const diffMin = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
    if (diffMin < 1)  return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const h = Math.floor(diffMin / 60);
    if (h < 24)       return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

// ── Helper: most-recent WO segment → lastAction shape ───────────────────────
// Returns null on any failure — never blocks the scan path.
function getLastAction(conn, woId) {
    try {
        const seg = conn.prepare(`
            SELECT userId, endedByUserId, startTime, endTime
            FROM WorkSegments
            WHERE woId = ?
            ORDER BY rowid DESC
            LIMIT 1
        `).get(woId);
        if (!seg) return null;

        const effectiveUserId = seg.endedByUserId || seg.userId;
        let userName = effectiveUserId;
        try {
            const u = authDb.prepare('SELECT DisplayName, Username FROM Users WHERE Username = ?').get(effectiveUserId);
            if (u) userName = u.DisplayName || u.Username || effectiveUserId;
        } catch (_) {}

        const isActive = !seg.endTime;
        const at       = seg.endTime || seg.startTime;
        const label    = isActive
            ? `${userName} is currently working`
            : `${userName} stopped work ${timeAgo(seg.endTime)}`;

        return { type: isActive ? 'SEGMENT_ACTIVE' : 'SEGMENT_ENDED', userId: effectiveUserId, userName, at, label };
    } catch (_) {
        return null;
    }
}

// ── Helper: open a new segment ───────────────────────────────────────────────
function openSegment(conn, { woId, userId, segmentReason = null, origin = 'SCAN', conflictAutoResolved = 0 }) {
    const segmentId = uuidv4();
    conn.prepare(`
        INSERT INTO WorkSegments
            (segmentId, woId, userId, startTime, segmentState, segmentReason, origin, conflictAutoResolved)
        VALUES (?, ?, ?, datetime('now'), 'Active', ?, ?, ?)
    `).run(segmentId, woId, userId, segmentReason, origin, conflictAutoResolved ? 1 : 0);
    return segmentId;
}

// ── Helper: close a segment ──────────────────────────────────────────────────
function closeSegment(conn, { segmentId, endedByUserId, holdReason = null }) {
    conn.prepare(`
        UPDATE WorkSegments
        SET endTime = datetime('now'), segmentState = 'Ended',
            endedByUserId = ?, holdReason = ?
        WHERE segmentId = ?
    `).run(endedByUserId, holdReason, segmentId);
}

// ── Helper: auto-review threshold check (called by background job hook) ──────
// Returns threshold hours from PlantScanConfig, or the default of 12.
function getAutoReviewThreshold(conn) {
    const cfg = conn.prepare('SELECT autoReviewThresholdHours FROM PlantScanConfig LIMIT 1').get();
    return cfg ? (cfg.autoReviewThresholdHours || 12) : 12;
}

// ── Helper: resolve SCHEDULED_RETURN returnAt timestamp ──────────────────────
// Uses plant config offsets; falls back to safe defaults if not configured.
function resolveReturnAt(conn, returnWindow) {
    const cfg = conn.prepare('SELECT * FROM PlantScanConfig LIMIT 1').get();
    const shiftHours = cfg?.shiftLengthHours || 8;
    const changeoverMins = cfg?.shiftChangeoverMinutes || 30;

    const offsetMap = {
        LATER_THIS_SHIFT: cfg?.returnOffset_laterThisShift ?? Math.round(shiftHours / 2),
        NEXT_SHIFT:       cfg?.returnOffset_nextShift ?? Math.round(shiftHours + changeoverMins / 60),
        TOMORROW:         cfg?.returnOffset_tomorrow ?? 24,
    };
    const hours = offsetMap[returnWindow];
    if (!hours) return null;
    // Return ISO timestamp: now + hours
    return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

// ── POST /api/scan ───────────────────────────────────────────────────────────
// Main scan endpoint. Accepts { scanId, assetId, userId, deviceTimestamp }.
// Returns a branch response the client uses to render the correct action prompt.
router.post('/', (req, res) => {
    try {
        const { scanId, assetId, deviceTimestamp, offlineCaptured = false, segmentReason } = req.body;
        const userId = req.user?.UserID || req.user?.Username;

        if (!scanId || !assetId || !deviceTimestamp) {
            return res.status(400).json({ error: 'scanId, assetId, and deviceTimestamp are required' });
        }

        const conn = db.getDb();
        ensureScanColumns(conn);

        // ── Step 1: Idempotency — reject duplicate scanId ────────────────────
        // scanId is a UUID generated on the device at scan time. If we've seen
        // it before, return the same soft-warning response with no state change.
        const seen = conn.prepare('SELECT auditEventId FROM ScanAuditLog WHERE scanId = ? LIMIT 1').get(scanId);
        if (seen) {
            return res.json({
                branch: 'AUTO_REJECT_DUPLICATE_SCAN',
                message: 'Duplicate scan detected — no action taken.',
                scanId,
            });
        }

        // ── Step 2: Active WO on this asset? ────────────────────────────────
        const activeWo = conn.prepare(`
            SELECT w.ID, w.WorkOrderNumber, w.StatusID, w.Description, w.AstID,
                   w.holdReason, w.needsReview, w.reviewReason
            FROM Work w
            WHERE w.AstID = ?
              AND w.StatusID IN (${STATUS.IN_PROGRESS}, ${STATUS.OPEN})
            ORDER BY w.ID DESC
            LIMIT 1
        `).get(assetId);

        if (activeWo) {
            // Find all active segments on this WO
            const activeSegments = conn.prepare(`
                SELECT segmentId, userId FROM WorkSegments
                WHERE woId = ? AND segmentState = 'Active'
            `).all(String(activeWo.ID));

            const mySegment = activeSegments.find(s => s.userId === userId);
            const otherSegments = activeSegments.filter(s => s.userId !== userId);

            writeAuditEntry(conn, {
                scanId, assetId, userId,
                woId: String(activeWo.ID),
                previousState: activeWo.StatusID,
                nextState: activeWo.StatusID,
                decisionBranch: 'ROUTE_TO_ACTIVE_WO',
                deviceTimestamp, offlineCaptured,
            });

            // Use WorkOrderNumber as canonical woId — ID is TEXT PRIMARY KEY and may be NULL for auto-created WOs
            const activeWoRef = activeWo.WorkOrderNumber || String(activeWo.ID);
            const activeLastAction = getLastAction(conn, activeWoRef);
            if (mySegment) {
                // This user is already active — show their action options
                const multiTech = otherSegments.length > 0;
                return res.json({
                    branch: 'ROUTE_TO_ACTIVE_WO',
                    context: multiTech ? 'MULTI_TECH' : 'SOLO',
                    wo: { id: activeWoRef, number: activeWo.WorkOrderNumber, description: activeWo.Description, assetId: activeWo.AstID, lastAction: activeLastAction },
                    mySegmentId: mySegment.segmentId,
                    activeUserCount: activeSegments.length,
                    options: multiTech
                        ? ['LEAVE_WORK', 'TEAM_CLOSE', 'WAITING', 'ESCALATE', 'CONTINUE_LATER']
                        : ['CLOSE_WO', 'WAITING', 'ESCALATE', 'CONTINUE_LATER'],
                });
            } else if (otherSegments.length > 0) {
                // Another user is active — offer Join / Take Over / Escalate
                return res.json({
                    branch: 'ROUTE_TO_ACTIVE_WO',
                    context: 'OTHER_USER_ACTIVE',
                    wo: { id: activeWoRef, number: activeWo.WorkOrderNumber, description: activeWo.Description, assetId: activeWo.AstID, lastAction: activeLastAction },
                    activeUsers: otherSegments.map(s => s.userId),
                    options: ['JOIN', 'TAKE_OVER', 'ESCALATE'],
                });
            } else {
                // WO is active but no open segments (edge case — open a new segment)
                const segmentId = openSegment(conn, { woId: activeWoRef, userId, segmentReason: 'RESUME' });
                return res.json({
                    branch: 'ROUTE_TO_ACTIVE_WO',
                    context: 'RESUMED_NO_SEGMENT',
                    wo: { id: activeWoRef, number: activeWo.WorkOrderNumber, description: activeWo.Description, assetId: activeWo.AstID, lastAction: activeLastAction },
                    segmentId,
                    options: ['CLOSE_WO', 'WAITING', 'ESCALATE', 'CONTINUE_LATER'],
                });
            }
        }

        // ── Step 3: No active WO — waiting/hold WO on this asset? ────────────
        const waitingWo = conn.prepare(`
            SELECT w.ID, w.WorkOrderNumber, w.StatusID, w.Description, w.AstID,
                   w.holdReason, w.returnAt
            FROM Work w
            WHERE w.AstID = ?
              AND w.StatusID IN (${STATUS.WAITING_PARTS}, ${STATUS.WAITING_VENDOR}, ${STATUS.ON_HOLD})
            ORDER BY w.ID DESC
            LIMIT 1
        `).get(assetId);

        if (waitingWo) {
            const waitingWoRef = waitingWo.WorkOrderNumber || String(waitingWo.ID);
            writeAuditEntry(conn, {
                scanId, assetId, userId,
                woId: waitingWoRef,
                previousState: waitingWo.StatusID,
                nextState: waitingWo.StatusID,
                decisionBranch: 'ROUTE_TO_WAITING_WO',
                deviceTimestamp, offlineCaptured,
            });

            return res.json({
                branch: 'ROUTE_TO_WAITING_WO',
                wo: {
                    id: waitingWoRef,
                    number: waitingWo.WorkOrderNumber,
                    description: waitingWo.Description,
                    holdReason: waitingWo.holdReason,
                    returnAt: waitingWo.returnAt,
                    lastAction: getLastAction(conn, waitingWoRef),
                },
                options: ['RESUME_WAITING_WO', 'CREATE_NEW_WO', 'VIEW_STATUS'],
            });
        }

        // ── Step 3.5: Digital Twin Schematic Check ───────────────────────────
        const schematic = conn.prepare('SELECT ID, SchematicPath, Label FROM digital_twin_schematics WHERE AssetID = ? LIMIT 1').get(assetId);
        if (schematic) {
            const pins = conn.prepare('SELECT ID, PinLabel, XPercent, YPercent, LinkedAssetID FROM digital_twin_pins WHERE SchematicID = ? AND LinkedAssetID IS NOT NULL').all(schematic.ID);
            if (pins && pins.length > 0) {
                // Offline scans can't load schematic images — push to offline blocked branch
                if (offlineCaptured) {
                    writeAuditEntry(conn, {
                        scanId, assetId, userId,
                        previousState: null, nextState: null,
                        decisionBranch: 'ROUTE_TO_DIGITAL_TWIN_OFFLINE_BLOCKED',
                        deviceTimestamp, offlineCaptured,
                    });
                    return res.json({ branch: 'ROUTE_TO_DIGITAL_TWIN_OFFLINE_BLOCKED' });
                }

                const childData = {};
                try {
                    try { conn.exec(`ATTACH DATABASE '${path.join(dataDir, 'mfg_master.db')}' AS master`); } catch (_) { /* already attached */ }
                    const childIds = pins.map(p => p.LinkedAssetID);
                    if (childIds.length > 0) {
                        const placeholders = childIds.map(() => '?').join(',');
                        const rows = conn.prepare(`
                            SELECT a.ID, m.CommonFailureModes 
                            FROM Asset a 
                            LEFT JOIN master.MasterEquipment m ON a.CategoryID = m.EquipmentTypeID OR a.Model = m.EquipmentTypeID
                            WHERE a.ID IN (${placeholders})
                        `).all(...childIds);
                        
                        rows.forEach(r => {
                            try {
                                childData[r.ID] = r.CommonFailureModes ? JSON.parse(r.CommonFailureModes) : [];
                            } catch (_) { childData[r.ID] = []; }
                        });
                    }
                } catch (_) { /* mfg_master.db absent or query failed — pins return with empty failureModes */ }
                
                pins.forEach(p => {
                    p.failureModes = childData[p.LinkedAssetID] || [];
                });
                
                writeAuditEntry(conn, {
                    scanId, assetId, userId,
                    previousState: null, nextState: null,
                    decisionBranch: 'ROUTE_TO_DIGITAL_TWIN',
                    deviceTimestamp, offlineCaptured
                });
                
                return res.json({
                    branch: 'ROUTE_TO_DIGITAL_TWIN',
                    schematic: {
                        id: schematic.ID,
                        path: schematic.SchematicPath,
                        label: schematic.Label,
                        pins
                    }
                });
            }
        }

        // ── Step 3.6: Child asset picker fallback ────────────────────────────────────
        // When an asset has registered sub-components but no visual schematic, surface
        // a tap-to-select list so the WO is created against the specific sub-component.
        {
            const childAssets = conn.prepare(`
                SELECT ID, Description, Model, PartNumber FROM Asset
                WHERE ParentAssetID = ? AND (IsDeleted IS NULL OR IsDeleted = 0)
                ORDER BY SortOrder ASC, Description ASC
            `).all(assetId);

            if (childAssets.length > 0) {
                const parentRow = conn.prepare('SELECT Description FROM Asset WHERE ID = ? LIMIT 1').get(assetId);
                writeAuditEntry(conn, {
                    scanId, assetId, userId,
                    previousState: null, nextState: null,
                    decisionBranch: 'ROUTE_TO_CHILD_SELECTOR',
                    deviceTimestamp, offlineCaptured,
                });
                return res.json({
                    branch: 'ROUTE_TO_CHILD_SELECTOR',
                    parentAsset: { id: assetId, description: parentRow?.Description || assetId },
                    children: childAssets,
                });
            }
        }

        // ── Step 3.7: SOP Re-Acknowledgment Gate ─────────────────────────────────────
        // Before creating a new WO against this asset, verify the tech has acknowledged
        // all SOPs linked to this asset that were flagged by an MOC change.
        // This is the enforcement gate — SOPAcknowledgmentBanner.jsx is only a passive warning.
        {
            let pendingSops = [];
            try {
                // ProcObj links Procedures to assets by ObjID = AssetID
                pendingSops = conn.prepare(`
                    SELECT DISTINCT p.ID, p.ProcedureCode, p.Descript, p.Updated
                    FROM ProcObj po
                    JOIN Procedures p ON p.ID = po.ProcID
                    WHERE po.ObjID = ?
                      AND p.SOPAcknowledgmentRequired = 1
                      AND p.ID NOT IN (
                          SELECT ProcedureID FROM SOPAcknowledgments WHERE TechID = ?
                      )
                `).all(assetId, req.user.Username);
            } catch (err) {
                console.error('[SCAN] Step 3.7 Error:', err);
                // ProcObj or SOPAcknowledgments absent — gate passes, WO creation proceeds
            }

            if (pendingSops.length > 0) {
                writeAuditEntry(conn, {
                    scanId, assetId, userId,
                    previousState: null, nextState: null,
                    decisionBranch: 'REQUIRE_SOP_ACK',
                    deviceTimestamp, offlineCaptured,
                });
                return res.json({
                    branch: 'REQUIRE_SOP_ACK',
                    pendingSops,
                    message: `${pendingSops.length} procedure${pendingSops.length > 1 ? 's require' : ' requires'} acknowledgment before work can begin.`,
                    assetId
                });
            }
        }

        // ── Step 4: No WOs at all — auto-create WO and open first segment ────
        // Verify the asset exists before creating a WO against it.
        const asset = conn.prepare('SELECT ID, Description FROM Asset WHERE ID = ? LIMIT 1').get(assetId);
        if (!asset) {
            // Maybe the scanned QR is a part barcode — check Part table before returning 404
            const part = conn.prepare(
                'SELECT ID, Descript, Description, Stock, Location, UnitCost FROM Part WHERE ID = ? LIMIT 1'
            ).get(assetId);
            if (part) {
                const activeSegment = conn.prepare(`
                    SELECT ws.woId FROM WorkSegments ws
                    WHERE ws.userId = ? AND ws.segmentState = 'Active'
                    ORDER BY ws.startTime DESC LIMIT 1
                `).get(userId);

                // If tech has an active WO: auto-add qty 1 immediately (scan = action, no dialog)
                if (activeSegment) {
                    const activeWoRow = conn.prepare(
                        'SELECT ID, WorkOrderNumber, Description FROM Work WHERE WorkOrderNumber = ? OR CAST(ID AS TEXT) = ? LIMIT 1'
                    ).get(String(activeSegment.woId), String(activeSegment.woId));

                    if (activeWoRow) {
                        const existing = conn.prepare(
                            'SELECT EstQty FROM WorkParts WHERE WoID = ? AND PartID = ? LIMIT 1'
                        ).get(activeWoRow.ID, part.ID);

                        let movementId = null;
                        conn.transaction(() => {
                            if (existing) {
                                conn.prepare('UPDATE WorkParts SET EstQty = EstQty + 1, issued_by = ? WHERE WoID = ? AND PartID = ?')
                                    .run(userId || null, activeWoRow.ID, part.ID);
                            } else {
                                conn.prepare(`INSERT INTO WorkParts (WoID, PartID, EstQty, UnitCost, UseDate, issued_by) VALUES (?, ?, 1, ?, datetime('now'), ?)`)
                                    .run(activeWoRow.ID, part.ID, parseFloat(part.UnitCost) || 0, userId || null);
                            }
                            conn.prepare('UPDATE Part SET Stock = MAX(0, Stock - 1) WHERE ID = ?').run(part.ID);
                            try {
                                const ins = conn.prepare(`INSERT INTO inventory_movements (work_order_id, part_id, movement_type, qty, unit_cost, performed_by) VALUES (?, ?, 'ISSUE_TO_WORK_ORDER', 1, ?, ?)`);
                                const r = ins.run(activeWoRow.ID, part.ID, parseFloat(part.UnitCost) || 0, userId || 'unknown');
                                movementId = r.lastInsertRowid;
                            } catch (_) {}
                        })();

                        return res.json({
                            branch: 'AUTO_ADDED_PART',
                            part: {
                                id: part.ID,
                                description: part.Description || part.Descript,
                                available: Math.max(0, (part.Stock || 0) - 1),
                                location: part.Location,
                            },
                            woId: activeSegment.woId,
                            woDescription: activeWoRow.Description,
                            qtyAdded: 1,
                            totalQty: (existing?.EstQty || 0) + 1,
                            movementId,
                        });
                    }
                }

                // No active WO — show checkout UI so tech knows to start work first
                return res.json({
                    branch: 'ROUTE_TO_PART_CHECKOUT',
                    part: {
                        id: part.ID,
                        description: part.Description || part.Descript,
                        available: part.Stock,
                        location: part.Location,
                    },
                    activeWo: null,
                });
            }
            // Check master catalog — give the UI enough info to offer an import
            let catalogSuggestion = null;
            let digitalTwin = null;
            let semanticMatch = null;
            try {
                const Database  = require('better-sqlite3');
                const sqliteVec = require('sqlite-vec');
                const mfgDb = new Database(path.join(dataDir, 'mfg_master.db'), { readonly: true });
                sqliteVec.load(mfgDb);

                const eq = mfgDb.prepare(
                    'SELECT EquipmentTypeID, Description, Category, TypicalMakers, PMIntervalDays, UsefulLifeYears FROM MasterEquipment WHERE EquipmentTypeID = ? LIMIT 1'
                ).get(assetId);
                if (eq) {
                    let makers = [];
                    try { makers = JSON.parse(eq.TypicalMakers || '[]'); } catch {}
                    catalogSuggestion = { type: 'equipment', id: eq.EquipmentTypeID, description: eq.Description, category: eq.Category, primaryMaker: makers[0] || null };
                    const twin = mfgDb.prepare(
                        'SELECT TwinURL, TwinFormat, Source, ConfScore FROM CatalogTwins WHERE RefType = ? AND RefID = ? ORDER BY Validated DESC, ConfScore DESC LIMIT 1'
                    ).get('equipment', eq.EquipmentTypeID);
                    if (twin) digitalTwin = { url: twin.TwinURL, format: twin.TwinFormat, source: twin.Source, confidence: twin.ConfScore };
                } else {
                    const mp = mfgDb.prepare(
                        'SELECT MasterPartID, Description, StandardizedName, Manufacturer, Category FROM MasterParts WHERE MasterPartID = ? LIMIT 1'
                    ).get(assetId);
                    if (mp) {
                        catalogSuggestion = { type: 'part', id: mp.MasterPartID, description: mp.StandardizedName || mp.Description, manufacturer: mp.Manufacturer, category: mp.Category };
                        const twin = mfgDb.prepare(
                            'SELECT TwinURL, TwinFormat, Source, ConfScore FROM CatalogTwins WHERE RefType = ? AND RefID = ? ORDER BY Validated DESC, ConfScore DESC LIMIT 1'
                        ).get('part', mp.MasterPartID);
                        if (twin) digitalTwin = { url: twin.TwinURL, format: twin.TwinFormat, source: twin.Source, confidence: twin.ConfScore };
                    }
                }

                mfgDb.close();
            } catch (_) {}

            // Also check peer-contributed twins in logistics_db
            let peerTwin = null;
            if (catalogSuggestion) {
                try {
                    const logisticsDb = require('../logistics_db');
                    const pt = logisticsDb().prepare(
                        'SELECT TwinURL, TwinFormat, SubmodelType, ConfScore, ContributorPlantID FROM PeerTwins WHERE RefType = ? AND RefID = ? ORDER BY PeerVerified DESC, ConfScore DESC LIMIT 1'
                    ).get(catalogSuggestion.type, catalogSuggestion.id);
                    if (pt) peerTwin = { url: pt.TwinURL, format: pt.TwinFormat, submodelType: pt.SubmodelType, confidence: pt.ConfScore, contributedBy: pt.ContributorPlantID };
                } catch (_) {}
            }

            // Last-known-good live state — if asset exists in NATS telemetry but not yet registered
            let liveState = null;
            try {
                const stateRow = conn.prepare(
                    `SELECT StateJSON, Source, LastUpdated, StaleAfterS FROM AssetLiveState WHERE AssetID = ?`
                ).get(assetId);
                if (stateRow) {
                    const ageS = Math.floor((Date.now() - new Date(stateRow.LastUpdated).getTime()) / 1000);
                    liveState = {
                        state:       JSON.parse(stateRow.StateJSON || '{}'),
                        source:      stateRow.Source,
                        lastUpdated: stateRow.LastUpdated,
                        stale:       ageS > stateRow.StaleAfterS,
                    };
                }
            } catch (_) {}

            const enrichmentId = enrichmentQueue.enqueue({
                assetId,
                scanId,
                scanTimestamp: new Date(deviceTimestamp).getTime() || Date.now(),
            });

            return res.status(404).json({ error: 'Asset not found', assetId, catalogSuggestion, digitalTwin, peerTwin, semanticMatch: null, enrichmentId, liveState });
        }

        // ── PM WO check: before creating a new WO, look for an open PM WO ─────
        // If a PM-generated WO is waiting at StatusID=10 (Requested), route to
        // the PM acknowledgement card instead of creating a duplicate WO.
        try {
            const pmWo = conn.prepare(`
                SELECT w.ID, w.WorkOrderNumber, w.Description,
                       pa.acknowledged_by, pa.acknowledged_at
                FROM Work w
                LEFT JOIN pm_acknowledgements pa ON pa.work_order_id = w.ID
                WHERE w.AstID = ? AND w.StatusID = 10
                AND (w.WorkOrderNumber LIKE 'PM-%'
                     OR w.Description LIKE '[PM-AUTO]%'
                     OR w.Description LIKE '[PM-METER]%')
                ORDER BY w.AddDate DESC LIMIT 1
            `).get(assetId);

            if (pmWo) {
                const pmIdMatch = (pmWo.WorkOrderNumber || '').match(/PM-\d+-(\d+)$/);
                const pmId = pmIdMatch ? parseInt(pmIdMatch[1], 10) : null;

                let notifiedCount = 0;
                let pmStatus = 'PM_NOTIFIED';
                if (pmId) {
                    try {
                        const nc = conn.prepare(
                            "SELECT COUNT(*) AS n FROM pm_notifications WHERE pm_id = ? AND status IN ('pending','acknowledged')"
                        ).get(pmId);
                        notifiedCount = nc?.n || 0;
                        const sched = conn.prepare('SELECT pm_status FROM Schedule WHERE ID = ?').get(pmId);
                        pmStatus = sched?.pm_status || 'PM_NOTIFIED';
                    } catch (_) {}
                }

                return res.json({
                    branch: 'ROUTE_TO_PM_ACKNOWLEDGE',
                    wo: { id: pmWo.ID, number: pmWo.WorkOrderNumber, description: pmWo.Description, assetId },
                    pmInfo: {
                        pmId,
                        woId: pmWo.ID,
                        pmStatus,
                        notifiedCount,
                        acknowledgedBy:  pmWo.acknowledged_by  || null,
                        acknowledgedAt:  pmWo.acknowledged_at  || null,
                    },
                });
            }
        } catch (_) { /* pm tables may not exist on older plant DBs */ }

        // Auto-create WO inside a transaction so WO + segment + audit are atomic.
        // R-1: .immediate() acquires a write lock upfront so two cluster workers that
        // both passed the pre-check SELECT above are serialized here. The inner re-check
        // makes the UNIQUE INDEX on ScanAuditLog.scanId the authoritative dedup guard.
        const result = conn.transaction(() => {
            const alreadySeen = conn.prepare('SELECT auditEventId FROM ScanAuditLog WHERE scanId = ? LIMIT 1').get(scanId);
            if (alreadySeen) return { duplicate: true };

            // R-7: Timestamp alone collides when two workers hit this on the same ms.
            // 3 random bytes (6 hex chars) makes collision probability negligible.
            const woNumber = `AUTO-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
            const desc = segmentReason
                ? `Work Order — ${asset.Description || assetId} — ${segmentReason}`
                : `Work Order — ${asset.Description || assetId}`;

            // el_work_insert trigger writes NEW.ID to EventLog.AggregateID (NOT NULL).
            // Compute next ID inside the IMMEDIATE transaction to satisfy that constraint.
            const nextWoId = (conn.prepare('SELECT COALESCE(MAX(ID), 0) + 1 AS n FROM Work').get()?.n) || 1;

            const woInsert = conn.prepare(`
                INSERT INTO Work
                    (ID, WorkOrderNumber, Description, AstID, StatusID, TypeID, AddDate, UserID, AssignToID)
                VALUES (?, ?, ?, ?, ?, 'CORRECTIVE', datetime('now'), ?, ?)
            `).run(nextWoId, woNumber, desc, assetId,
                STATUS.IN_PROGRESS, userId, userId);

            const woRowId = woInsert.lastInsertRowid;
            const woId = woNumber;
            const segmentId = openSegment(conn, { 
                woId, 
                userId, 
                origin: offlineCaptured ? 'OFFLINE_SYNC' : 'SCAN',
                segmentReason 
            });

            writeAuditEntry(conn, {
                scanId, assetId, userId, woId,
                previousState: null,
                nextState: STATUS.IN_PROGRESS,
                decisionBranch: 'AUTO_CREATE_WO',
                deviceTimestamp, offlineCaptured,
            });

            // Auto-populate parts from AssetParts BOM — wrapped so absent BOM never fails WO creation
            try {
                const bomParts = conn.prepare(`
                    SELECT ap.PartID, ap.Quantity, COALESCE(p.UnitCost, 0) AS UnitCost
                    FROM AssetParts ap
                    LEFT JOIN Part p ON ap.PartID = p.ID
                    WHERE ap.AstID = ?
                `).all(assetId);
                if (bomParts.length > 0) {
                    const insertWoPart = conn.prepare(
                        'INSERT INTO WorkParts (WoID, PartID, EstQty, UnitCost, UseDate) VALUES (?, ?, ?, ?, datetime(\'now\'))'
                    );
                    for (const part of bomParts) {
                        insertWoPart.run(woRowId, part.PartID, part.Quantity, part.UnitCost);
                    }
                }
            } catch (_) { /* AssetParts absent or WorkParts schema mismatch — WO creation unaffected */ }

            return { woId, woNumber, segmentId, desc };
        }).immediate();

        if (result.duplicate) {
            return res.json({
                branch: 'AUTO_REJECT_DUPLICATE_SCAN',
                message: 'Duplicate scan detected — no action taken.',
                scanId,
            });
        }

        // Phase 2+3: new WO may reopen pending outcome; always invalidate explain cache
        try {
            const newWo = conn.prepare('SELECT ID FROM Work WHERE WorkOrderNumber = ? LIMIT 1').get(result.woId);
            if (newWo) {
                outcomeTracker.markReopened(conn, {
                    assetId,
                    newWoId:  newWo.ID,
                    openedAt: deviceTimestamp,
                });
            }
        } catch (_) {}
        // Trigger 1: new WO created — explain data changes
        const newWoPlantId = req.headers['x-plant-id'];
        if (newWoPlantId) {
            explainCache.invalidate(newWoPlantId, assetId);
            explainCache.warmAsync(newWoPlantId, assetId);
        }

        return res.json({
            branch: 'AUTO_CREATE_WO',
            message: 'Work Started',
            wo: { id: result.woId, number: result.woNumber, description: result.desc, assetId, lastAction: getLastAction(conn, result.woId) },
            segmentId: result.segmentId,
        });

    } catch (err) {
        // I-04: UNIQUE constraint on ScanAuditLog.scanId means a concurrent request
        // with the same scanId already committed the audit entry — the DB-layer dedup
        // guard fired correctly. No business state was mutated (writeAuditEntry was
        // the failing statement). Return a clean idempotency response, not a 500.
        if (err.message?.includes('UNIQUE constraint failed: ScanAuditLog.scanId')) {
            logInvariant('I-04', 'I-04:DUPLICATE_SCAN_PREVENTED', {
                plantId:    req.headers['x-plant-id'],
                entityType: 'scan',
                entityId:   req.body?.scanId,
                actor:      req.user?.Username || req.user?.UserID,
                metadata:   { assetId: req.body?.assetId },
            });
            return res.json({ ok: true, idempotent: true, branch: 'DUPLICATE_SCAN', message: 'Scan already processed' });
        }
        console.error('[scan] POST /api/scan error:', err);
        res.status(500).json({ error: 'Scan processing failed', detail: err.message });
    }
});

// ── POST /api/scan/action ────────────────────────────────────────────────────
// Submit the user's choice after a branch prompt was shown.
// Body: { scanId, woId, action, holdReason?, returnWindow?, deviceTimestamp }
router.post('/action', (req, res) => {
    try {
        const {
            scanId, woId, action,
            holdReason, returnWindow, deviceTimestamp,
            offlineCaptured = false,
        } = req.body;
        // R-2: userId must come from the authenticated JWT, never from req.body.
        // req.body.userId was an open audit-log injection vector identical to A-5 on POST /.
        const userId = req.user?.UserID || req.user?.Username;

        if (!scanId || !woId || !action || !deviceTimestamp) {
            return res.status(400).json({ error: 'scanId, woId, action, and deviceTimestamp are required' });
        }

        const conn = db.getDb();
        const wo = conn.prepare(`
            SELECT ID, WorkOrderNumber, StatusID, AstID, holdReason FROM Work
            WHERE ID = ? OR WorkOrderNumber = ?
        `).get(woId, woId);

        if (!wo) return res.status(404).json({ error: 'Work order not found' });

        const prevStatus = wo.StatusID;

        // Each action branch is explicit — no implicit fallthrough.
        const tx = conn.transaction(() => {
            switch (action) {

                case 'CLOSE_WO':
                case 'LAST_ACTIVE_CLOSE': {
                    // Close own segment + WO. Valid only when this user is the last active tech.
                    const mySegment = conn.prepare(
                        `SELECT segmentId FROM WorkSegments WHERE woId = ? AND userId = ? AND segmentState = 'Active' LIMIT 1`
                    ).get(String(wo.ID), userId);
                    const otherActive = conn.prepare(
                        `SELECT COUNT(*) as c FROM WorkSegments WHERE woId = ? AND userId != ? AND segmentState = 'Active'`
                    ).get(String(wo.ID), userId);

                    if (otherActive.c > 0) {
                        // Caller should have used TEAM_CLOSE — reject
                        return { ok: false, error: 'Other technicians still active. Use TEAM_CLOSE.' };
                    }
                    if (mySegment) closeSegment(conn, { segmentId: mySegment.segmentId, endedByUserId: userId });
                    conn.prepare(`UPDATE Work SET StatusID = ?, closedByUserId = ?, closeMode = ? WHERE ID = ?`)
                        .run(STATUS.COMPLETED, userId, 'LAST_ACTIVE_CLOSE', wo.ID);
                    writeAuditEntry(conn, { scanId, woId: String(wo.ID), assetId: wo.AstID, userId,
                        previousState: prevStatus, nextState: STATUS.COMPLETED,
                        decisionBranch: 'PROMPT_SELF_CLOSE', deviceTimestamp, offlineCaptured });
                    return { ok: true, branch: 'PROMPT_SELF_CLOSE', nextStatus: STATUS.COMPLETED };
                }

                case 'LEAVE_WORK': {
                    // Close own segment only — WO stays open for other active techs.
                    const mySegment = conn.prepare(
                        `SELECT segmentId FROM WorkSegments WHERE woId = ? AND userId = ? AND segmentState = 'Active' LIMIT 1`
                    ).get(String(wo.ID), userId);
                    if (mySegment) closeSegment(conn, { segmentId: mySegment.segmentId, endedByUserId: userId });
                    writeAuditEntry(conn, { scanId, woId: String(wo.ID), assetId: wo.AstID, userId,
                        previousState: prevStatus, nextState: prevStatus,
                        decisionBranch: 'PROMPT_LEAVE_WORK', deviceTimestamp, offlineCaptured });
                    return { ok: true, branch: 'PROMPT_LEAVE_WORK', nextStatus: prevStatus };
                }

                case 'TEAM_CLOSE': {
                    // Close all active segments and the WO. Requires explicit confirmation from caller.
                    const closeEventId = uuidv4();
                    const allActive = conn.prepare(
                        `SELECT segmentId, userId FROM WorkSegments WHERE woId = ? AND segmentState = 'Active'`
                    ).all(String(wo.ID));

                    const insertParticipant = conn.prepare(`
                        INSERT INTO WOCloseParticipants
                            (closeEventId, woId, userId, segmentId, closedByUserId, closeMode, serverTimestamp)
                        VALUES (?, ?, ?, ?, ?, 'TEAM_CLOSE', datetime('now'))
                    `);
                    for (const seg of allActive) {
                        closeSegment(conn, { segmentId: seg.segmentId, endedByUserId: userId });
                        insertParticipant.run(closeEventId, String(wo.ID), seg.userId, seg.segmentId, userId);
                    }
                    conn.prepare(`UPDATE Work SET StatusID = ?, closedByUserId = ?, closeMode = ? WHERE ID = ?`)
                        .run(STATUS.COMPLETED, userId, 'TEAM_CLOSE', wo.ID);
                    writeAuditEntry(conn, { scanId, woId: String(wo.ID), assetId: wo.AstID, userId,
                        previousState: prevStatus, nextState: STATUS.COMPLETED,
                        decisionBranch: 'PROMPT_TEAM_CLOSE', deviceTimestamp, offlineCaptured });
                    return { ok: true, branch: 'PROMPT_TEAM_CLOSE', nextStatus: STATUS.COMPLETED, closeEventId };
                }

                case 'JOIN': {
                    // Open a concurrent segment on the same WO for this user.
                    const segmentId = openSegment(conn, {
                        woId: String(wo.ID), userId, segmentReason: 'JOIN',
                        origin: offlineCaptured ? 'OFFLINE_SYNC' : 'SCAN',
                    });
                    writeAuditEntry(conn, { scanId, woId: String(wo.ID), assetId: wo.AstID, userId,
                        previousState: prevStatus, nextState: prevStatus,
                        decisionBranch: 'PROMPT_JOIN_EXISTING', deviceTimestamp, offlineCaptured });
                    return { ok: true, branch: 'PROMPT_JOIN_EXISTING', segmentId, nextStatus: prevStatus };
                }

                case 'TAKE_OVER': {
                    // Close the current owner's segment, open a new one for this user.
                    const currentSeg = conn.prepare(
                        `SELECT segmentId FROM WorkSegments WHERE woId = ? AND segmentState = 'Active' ORDER BY startTime DESC LIMIT 1`
                    ).get(String(wo.ID));
                    if (currentSeg) {
                        closeSegment(conn, { segmentId: currentSeg.segmentId, endedByUserId: userId });
                        // Record TAKEOVER in close participants for audit trail
                        conn.prepare(`
                            INSERT INTO WOCloseParticipants
                                (closeEventId, woId, userId, segmentId, closedByUserId, closeMode, serverTimestamp)
                            VALUES (?, ?, (SELECT userId FROM WorkSegments WHERE segmentId = ?), ?, ?, 'SELF_ONLY', datetime('now'))
                        `).run(uuidv4(), String(wo.ID), currentSeg.segmentId, currentSeg.segmentId, userId);
                    }
                    const segmentId = openSegment(conn, {
                        woId: String(wo.ID), userId, segmentReason: 'TAKEOVER',
                        origin: offlineCaptured ? 'OFFLINE_SYNC' : 'SCAN',
                    });
                    writeAuditEntry(conn, { scanId, woId: String(wo.ID), assetId: wo.AstID, userId,
                        previousState: prevStatus, nextState: prevStatus,
                        decisionBranch: 'PROMPT_TAKE_OVER', deviceTimestamp, offlineCaptured });
                    return { ok: true, branch: 'PROMPT_TAKE_OVER', segmentId, nextStatus: prevStatus };
                }

                case 'RESUME_WAITING_WO': {
                    // Resume a waiting WO — open a new segment, set status to InProgress.
                    const segmentId = openSegment(conn, {
                        woId: String(wo.ID), userId, segmentReason: 'RESUME',
                        origin: offlineCaptured ? 'OFFLINE_SYNC' : 'SCAN',
                    });
                    conn.prepare(`UPDATE Work SET StatusID = ?, holdReason = NULL, needsReview = 0,
                                   reviewStatus = 'RESOLVED_BY_FIELD', reviewReason = NULL WHERE ID = ?`)
                        .run(STATUS.IN_PROGRESS, wo.ID);
                    writeAuditEntry(conn, { scanId, woId: String(wo.ID), assetId: wo.AstID, userId,
                        previousState: prevStatus, nextState: STATUS.IN_PROGRESS,
                        decisionBranch: 'PROMPT_RESUME_EXISTING', deviceTimestamp, offlineCaptured });
                    return { ok: true, branch: 'PROMPT_RESUME_EXISTING', segmentId, nextStatus: STATUS.IN_PROGRESS };
                }

                case 'WAITING': {
                    // Place WO on hold with the given holdReason.
                    if (!holdReason || !HOLD_REASON_TO_STATUS[holdReason]) {
                        return { ok: false, error: 'Valid holdReason required for WAITING action' };
                    }
                    const newStatus = HOLD_REASON_TO_STATUS[holdReason];
                    const mySegment = conn.prepare(
                        `SELECT segmentId FROM WorkSegments WHERE woId = ? AND userId = ? AND segmentState = 'Active' LIMIT 1`
                    ).get(String(wo.ID), userId);
                    if (mySegment) closeSegment(conn, { segmentId: mySegment.segmentId, endedByUserId: userId, holdReason });

                    // For SCHEDULED_RETURN, resolve the returnAt timestamp from plant config
                    let returnAt = null;
                    if (holdReason === 'SCHEDULED_RETURN' && returnWindow) {
                        returnAt = resolveReturnAt(conn, returnWindow);
                    }
                    conn.prepare(`
                        UPDATE Work SET StatusID = ?, holdReason = ?, returnAt = ?,
                            scheduledByUserId = CASE WHEN ? = 'SCHEDULED_RETURN' THEN ? ELSE scheduledByUserId END,
                            scheduledAt = CASE WHEN ? = 'SCHEDULED_RETURN' THEN datetime('now') ELSE scheduledAt END
                        WHERE ID = ?
                    `).run(newStatus, holdReason, returnAt, holdReason, userId, holdReason, wo.ID);

                    writeAuditEntry(conn, { scanId, woId: String(wo.ID), assetId: wo.AstID, userId,
                        previousState: prevStatus, nextState: newStatus,
                        decisionBranch: 'STATE_SET_ON_HOLD', deviceTimestamp, offlineCaptured });
                    return { ok: true, branch: 'STATE_SET_ON_HOLD', nextStatus: newStatus };
                }

                case 'ESCALATE': {
                    // Escalate WO — mandatory Mission Control flag, optional notifications.
                    const mySegment = conn.prepare(
                        `SELECT segmentId FROM WorkSegments WHERE woId = ? AND userId = ? AND segmentState = 'Active' LIMIT 1`
                    ).get(String(wo.ID), userId);
                    if (mySegment) closeSegment(conn, { segmentId: mySegment.segmentId, endedByUserId: userId });
                    conn.prepare(`UPDATE Work SET StatusID = ? WHERE ID = ?`).run(STATUS.ESCALATED, wo.ID);
                    writeAuditEntry(conn, { scanId, woId: String(wo.ID), assetId: wo.AstID, userId,
                        previousState: prevStatus, nextState: STATUS.ESCALATED,
                        decisionBranch: 'STATE_SET_ESCALATED', deviceTimestamp, offlineCaptured });
                    return { ok: true, branch: 'STATE_SET_ESCALATED', nextStatus: STATUS.ESCALATED };
                }

                case 'CONTINUE_LATER': {
                    // Tech stepping away — CONTINUE_LATER hold reason, timer starts.
                    const mySegment = conn.prepare(
                        `SELECT segmentId FROM WorkSegments WHERE woId = ? AND userId = ? AND segmentState = 'Active' LIMIT 1`
                    ).get(String(wo.ID), userId);
                    if (mySegment) closeSegment(conn, { segmentId: mySegment.segmentId, endedByUserId: userId, holdReason: 'CONTINUE_LATER' });
                    conn.prepare(`UPDATE Work SET StatusID = ?, holdReason = 'CONTINUE_LATER' WHERE ID = ?`)
                        .run(STATUS.ON_HOLD, wo.ID);
                    writeAuditEntry(conn, { scanId, woId: String(wo.ID), assetId: wo.AstID, userId,
                        previousState: prevStatus, nextState: STATUS.ON_HOLD,
                        decisionBranch: 'STATE_SET_ON_HOLD', deviceTimestamp, offlineCaptured });
                    return { ok: true, branch: 'STATE_SET_ON_HOLD', nextStatus: STATUS.ON_HOLD };
                }

                default:
                    return { ok: false, error: `Unknown action: ${action}` };
            }
        })();

        // Phase 2+3: provisional outcome + explain cache invalidation on WO close
        if (tx.ok && tx.nextStatus === STATUS.COMPLETED) {
            outcomeTracker.recordOutcome(conn, {
                workOrderId: wo.ID,
                assetId:     wo.AstID,
                completedAt: new Date().toISOString(),
            });
            // Trigger 2: WO closed — explain data changes
            const closePlantId = req.headers['x-plant-id'];
            if (closePlantId) {
                explainCache.invalidate(closePlantId, wo.AstID);
                explainCache.warmAsync(closePlantId, wo.AstID);
            }
        }

        if (!tx.ok) return res.status(400).json({ error: tx.error });
        return res.json(tx);

    } catch (err) {
        console.error('[scan] POST /api/scan/action error:', err);
        res.status(500).json({ error: 'Action processing failed', detail: err.message });
    }
});

// ── GET /api/scan/active-segments ────────────────────────────────────────────
// Returns all currently active WorkSegments for offline caching.
// Used by the PWA to predict multi-tech branch decisions without a server round-trip.
router.get('/active-segments', (req, res) => {
    try {
        const conn = db.getDb();
        const segments = conn.prepare(`
            SELECT segmentId, woId, userId, startTime, segmentState, origin
            FROM WorkSegments
            WHERE segmentState = 'Active'
            ORDER BY startTime DESC
        `).all();
        res.json({ segments });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/scan/asset-status/:assetId ──────────────────────────────────────
// Live work status for an asset card: active WO, how many techs are currently
// working (WorkSegments), and when work was last performed.
// Consumed by ScanEntryPoint to render the richer status badge.
router.get('/asset-status/:assetId', (req, res) => {
    try {
        const { assetId } = req.params;
        if (!assetId) return res.status(400).json({ error: 'assetId required' });
        const conn = db.getDb();
        ensureScanColumns(conn);

        const activeWo = conn.prepare(`
            SELECT w.ID, w.WorkOrderNumber, w.Description, w.StatusID, w.holdReason, w.AssignToID
            FROM Work w
            WHERE w.AstID = ?
              AND w.StatusID != ${STATUS.COMPLETED}
            ORDER BY w.ID DESC
            LIMIT 1
        `).get(assetId);

        if (!activeWo) {
            const lastWork = conn.prepare(`
                SELECT MAX(ws.endTime) as lastWorked
                FROM WorkSegments ws
                JOIN Work w ON (ws.woId = w.WorkOrderNumber OR CAST(ws.woId AS TEXT) = CAST(w.ID AS TEXT))
                WHERE w.AstID = ?
            `).get(assetId);
            return res.json({ activeWo: null, activeTechs: [], lastWorked: lastWork?.lastWorked || null });
        }

        const woKey = activeWo.WorkOrderNumber || String(activeWo.ID);
        const activeSegments = conn.prepare(`
            SELECT userId, startTime
            FROM WorkSegments
            WHERE (woId = ? OR CAST(woId AS TEXT) = CAST(? AS TEXT)) AND segmentState = 'Active'
            ORDER BY startTime ASC
        `).all(woKey, String(activeWo.ID));

        const lastWork = conn.prepare(`
            SELECT MAX(endTime) as lastWorked FROM WorkSegments
            WHERE woId = ? OR CAST(woId AS TEXT) = CAST(? AS TEXT)
        `).get(woKey, String(activeWo.ID));

        res.json({
            activeWo: {
                id: activeWo.ID,
                number: activeWo.WorkOrderNumber,
                description: activeWo.Description,
                statusId: activeWo.StatusID,
                holdReason: activeWo.holdReason || null,
                assignedTo: activeWo.AssignToID || null,
            },
            activeTechs: activeSegments.map(s => ({ userId: s.userId, since: s.startTime })),
            lastWorked: lastWork?.lastWorked || null,
        });
    } catch (err) {
        console.error('[scan] GET /api/scan/asset-status error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/scan/asset-status-batch ────────────────────────────────────────
// Returns active WO status for a list of asset IDs in one query.
// Body: { assetIds: string[] }
// Response: { [assetId]: { statusId, woNumber, startedAt } | null }
router.post('/asset-status-batch', (req, res) => {
    try {
        const { assetIds } = req.body;
        if (!Array.isArray(assetIds) || assetIds.length === 0) return res.json({});
        const conn = db.getDb();
        ensureScanColumns(conn);

        const placeholders = assetIds.map(() => '?').join(',');
        const rows = conn.prepare(`
            SELECT w.AstID, w.StatusID, w.WorkOrderNumber,
                   MIN(ws.startTime) as startedAt
            FROM Work w
            LEFT JOIN WorkSegments ws ON (ws.woId = w.WorkOrderNumber OR CAST(ws.woId AS TEXT) = CAST(w.ID AS TEXT))
                                      AND ws.segmentState = 'Active'
            WHERE w.AstID IN (${placeholders})
              AND w.StatusID != ${STATUS.COMPLETED}
            GROUP BY w.AstID, w.ID
            ORDER BY w.ID DESC
        `).all(...assetIds);

        // Keep only the most recent WO per asset
        const result = {};
        for (const row of rows) {
            if (!result[row.AstID]) {
                result[row.AstID] = {
                    statusId: row.StatusID,
                    woNumber: row.WorkOrderNumber,
                    startedAt: row.startedAt || null,
                };
            }
        }
        res.json(result);
    } catch (err) {
        console.error('[scan] POST /api/scan/asset-status-batch error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/scan/needs-review ───────────────────────────────────────────────
// Returns all WOs flagged needsReview=1 for the Mission Control supervisor queue.
// Separated into AUTO_TIMEOUT and OFFLINE_CONFLICT buckets for distinct surfacing.
// Also returns overdue SCHEDULED_RETURN WOs (returnAt has passed, not yet resumed).
router.get('/needs-review', (req, res) => {
    try {
        // all_sites uses a readonly schema template with no real work orders
        const plantId = (req.headers['x-plant-id'] || '').toLowerCase().replace(/\s+/g, '_');
        if (plantId === 'all_sites') {
            return res.json({ flagged: [], overdueScheduled: [], counts: { flagged: 0, overdueScheduled: 0 } });
        }
        const conn = db.getDb();
        ensureScanColumns(conn);

        const flagged = conn.prepare(`
            SELECT w.ID, w.WorkOrderNumber, w.Description, w.AstID, w.StatusID,
                   w.holdReason, w.reviewReason, w.reviewStatus,
                   w.acknowledgedByUserId, w.acknowledgedAt, w.returnAt,
                   w.closedByUserId, w.needsReview,
                   a.Description as AssetName
            FROM Work w
            LEFT JOIN Asset a ON w.AstID = a.ID
            WHERE w.needsReview = 1
            ORDER BY w.ID DESC
        `).all();

        // Overdue scheduled returns: returnAt passed, WO still on hold, no needsReview flag yet
        const overdueScheduled = conn.prepare(`
            SELECT w.ID, w.WorkOrderNumber, w.Description, w.AstID, w.StatusID,
                   w.holdReason, w.returnAt, w.scheduledByUserId,
                   a.Description as AssetName
            FROM Work w
            LEFT JOIN Asset a ON w.AstID = a.ID
            WHERE w.holdReason = 'SCHEDULED_RETURN'
              AND w.returnAt IS NOT NULL
              AND w.returnAt < datetime('now')
              AND w.StatusID IN (${STATUS.ON_HOLD}, ${STATUS.WAITING_PARTS}, ${STATUS.WAITING_VENDOR})
              AND w.needsReview = 0
            ORDER BY w.returnAt ASC
        `).all();

        res.json({
            flagged,
            overdueScheduled,
            counts: {
                flagged: flagged.length,
                overdueScheduled: overdueScheduled.length,
            },
        });
    } catch (err) {
        console.error('[scan] GET /api/scan/needs-review error:', err);
        res.status(500).json({ error: 'Failed to load review queue', detail: err.message });
    }
});

// ── POST /api/scan/offline-sync ──────────────────────────────────────────────
// Batch endpoint for syncing queued offline scan events when connectivity is restored.
// Each event is processed through the same state machine as a live scan.
// scanId idempotency ensures replaying the same queue multiple times is safe.
// Offline multi-tech conflicts resolve via Auto-Join (see ROADMAP.md spec).
//
// Accepts two body shapes for backward compatibility:
//   { events: [...] }  — PWA client (OfflineDB.replayQueue)
//   { scans: [...] }   — LAN hub replay (lan_hub.replayToServer)
//
// When called from the LAN hub (x-hub-replay: '1'), an HMAC-SHA256 signature
// covering ts.nonce.plantId.canonicalBody must be present and valid.
router.post('/offline-sync', (req, res) => {
    try {
        // Accept either field name so PWA clients and the LAN hub both work
        const events = req.body.events || req.body.scans;
        if (!Array.isArray(events) || events.length === 0) {
            return res.status(400).json({ error: 'events array is required' });
        }

        // ── HMAC verification for LAN hub replays ────────────────────────────
        if (req.headers['x-hub-replay'] === '1') {
            const ts       = req.headers['x-hub-ts'];
            const nonce    = req.headers['x-hub-nonce'];
            const sig      = req.headers['x-hub-sig'];
            const plantId  = req.headers['x-plant-id'];
            const secret   = process.env.JWT_SECRET;

            if (!ts || !nonce || !sig) {
                return res.status(401).json({ error: 'Hub replay missing auth headers' });
            }
            if (Math.abs(Date.now() - parseInt(ts, 10)) > 5 * 60 * 1000) {
                return res.status(401).json({ error: 'Hub replay timestamp expired' });
            }

            // Canonical body: re-serialize with 'scans' key to match what the hub signed
            const canonicalBody = JSON.stringify({ scans: events });
            const expected = crypto.createHmac('sha256', secret)
                .update(`${ts}.${nonce}.${plantId}.${canonicalBody}`)
                .digest('hex');

            try {
                const expectedBuf = Buffer.from(expected, 'hex');
                const sigBuf      = Buffer.from(sig, 'hex');
                if (sigBuf.length !== expectedBuf.length ||
                    !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
                    console.warn(`[scan] Hub replay HMAC mismatch from plant=${plantId}`);
                    return res.status(401).json({ error: 'Hub replay signature invalid' });
                }
            } catch {
                return res.status(401).json({ error: 'Hub replay signature invalid' });
            }
        }

        const conn = db.getDb();
        // S-11: Ensure the UNIQUE INDEX on ScanAuditLog.scanId exists before any
        // per-event processing. Without this, a DB that has only ever received
        // offline-sync requests (no live POST / scans) has no dedup index, and
        // concurrent offline-sync calls for the same scanId can create duplicate WOs.
        ensureScanColumns(conn);

        // I-03: Replay in capture order regardless of network arrival order.
        // A WO close arriving before its part-issue events would push the state
        // machine to a terminal state with incomplete history. Sort ascending by
        // deviceTimestamp so the WO lifecycle is always monotonic.
        // Events missing deviceTimestamp sort last and are rejected per-event below.
        const needsReorder = events.some((e, i) =>
            i > 0 &&
            events[i - 1].deviceTimestamp &&
            e.deviceTimestamp &&
            new Date(events[i - 1].deviceTimestamp).getTime() > new Date(e.deviceTimestamp).getTime()
        );
        events.sort((a, b) => {
            const ta = a.deviceTimestamp ? new Date(a.deviceTimestamp).getTime() : Infinity;
            const tb = b.deviceTimestamp ? new Date(b.deviceTimestamp).getTime() : Infinity;
            return ta - tb;
        });
        if (needsReorder) {
            logInvariant('I-03', 'I-03:OFFLINE_REPLAY_REORDERED', {
                plantId:    req.headers['x-plant-id'],
                entityType: 'scan',
                actor:      req.user?.Username || req.user?.UserID,
                metadata:   { eventCount: events.length, scanIds: events.map(e => e.scanId) },
            });
        }

        const results = [];

        for (const event of events) {
            const { scanId, assetId, userId: eventUserId, deviceTimestamp, userAction, holdReason, segmentReason } = event;
            // R-11: For direct client replays, the authenticated JWT user is the authoritative
            // identity. Allowing event.userId lets any client write arbitrary names into
            // audit logs. Hub replays are HMAC-verified — event.userId is the device user.
            const userId = req.headers['x-hub-replay'] === '1'
                ? eventUserId
                : (req.user?.UserID || req.user?.Username);

            if (!scanId || !assetId || !userId || !deviceTimestamp) {
                results.push({ scanId, status: 'FAILED', reason: 'Missing required fields' });
                continue;
            }

            // Check idempotency — skip if already processed
            const seen = conn.prepare('SELECT auditEventId FROM ScanAuditLog WHERE scanId = ? LIMIT 1').get(scanId);
            if (seen) {
                results.push({ scanId, status: 'SKIPPED', reason: 'Already processed' });
                continue;
            }

            try {
                // S-11: .immediate() serializes concurrent offline-sync calls for the
                // same scanId. The inner re-check is the authoritative dedup guard;
                // the outer `seen` check above is an early-return optimization only.
                const syncResult = conn.transaction(() => {
                    const alreadySeenOffline = conn.prepare('SELECT auditEventId FROM ScanAuditLog WHERE scanId = ? LIMIT 1').get(scanId);
                    if (alreadySeenOffline) return { status: 'SKIPPED', reason: 'Already processed' };

                    // Check for an existing active WO — offline conflict scenario
                    const activeWo = conn.prepare(`
                        SELECT ID, WorkOrderNumber, StatusID, AstID FROM Work
                        WHERE AstID = ? AND StatusID IN (${STATUS.IN_PROGRESS}, ${STATUS.OPEN})
                        ORDER BY ID DESC LIMIT 1
                    `).get(assetId);

                    let txResult;

                    if (activeWo && userAction !== 'TAKE_OVER') {
                        // Auto-Join: open concurrent segment, flag for review
                        const segmentId = openSegment(conn, {
                            woId: String(activeWo.ID), userId,
                            segmentReason: 'JOIN', origin: 'OFFLINE_SYNC', conflictAutoResolved: 1,
                        });
                        conn.prepare(`UPDATE Work SET needsReview = 1, reviewReason = 'OFFLINE_CONFLICT', reviewStatus = 'FLAGGED' WHERE ID = ?`)
                            .run(activeWo.ID);
                        writeAuditEntry(conn, {
                            scanId, woId: String(activeWo.ID), assetId, userId,
                            previousState: activeWo.StatusID, nextState: activeWo.StatusID,
                            decisionBranch: 'AUTO_JOIN_OFFLINE_CONFLICT',
                            deviceTimestamp, offlineCaptured: 1, conflictAutoResolved: 1, resolvedMode: 'AUTO_JOIN',
                        });
                        txResult = { status: 'SYNCED', branch: 'AUTO_JOIN_OFFLINE_CONFLICT', segmentId };
                    } else if (!activeWo) {
                        // No conflict — auto-create WO
                        const asset = conn.prepare('SELECT ID, Description FROM Asset WHERE ID = ? LIMIT 1').get(assetId);
                        if (!asset) {
                            // R-9: Update queue inside transaction for consistency even on FAILED path.
                            conn.prepare(`UPDATE OfflineScanQueue SET syncStatus = 'FAILED', failReason = ? WHERE scanId = ?`)
                                .run('Asset not found', scanId);
                            return { status: 'FAILED', reason: 'Asset not found' };
                        }

                        // R-7: Same randomness guard as POST / — concurrent offline-sync
                        // calls can land on the same millisecond.
                        const woNumber = `AUTO-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
                        const desc = segmentReason 
                            ? `Work Order — ${asset.Description || assetId} — ${segmentReason}`
                            : `Work Order — ${asset.Description || assetId}`;
                            
                        const woInsert = conn.prepare(`
                            INSERT INTO Work (WorkOrderNumber, Description, AstID, StatusID, TypeID, AddDate, UserID, AssignToID)
                            VALUES (?, ?, ?, ?, 'CORRECTIVE', ?, ?, ?)
                        `).run(woNumber, desc, assetId,
                            STATUS.IN_PROGRESS, deviceTimestamp, userId, userId);

                        const woId = String(woInsert.lastInsertRowid);
                        const segmentId = openSegment(conn, { woId, userId, origin: 'OFFLINE_SYNC', segmentReason });
                        writeAuditEntry(conn, {
                            scanId, woId, assetId, userId,
                            previousState: null, nextState: STATUS.IN_PROGRESS,
                            decisionBranch: 'AUTO_CREATE_WO',
                            deviceTimestamp, offlineCaptured: 1,
                        });
                        txResult = { status: 'SYNCED', branch: 'AUTO_CREATE_WO', woId, segmentId };
                    } else {
                        txResult = { status: 'SYNCED', branch: 'ROUTE_TO_ACTIVE_WO' };
                    }

                    // R-9: Update queue inside the transaction so WO creation and queue
                    // status are always consistent. A crash between a committed transaction
                    // and an external UPDATE would leave the WO created but the queue entry
                    // still PENDING, causing a duplicate replay on the next reconnect.
                    conn.prepare(`UPDATE OfflineScanQueue SET syncStatus = ?, syncedAt = datetime('now') WHERE scanId = ?`)
                        .run(txResult.status, scanId);

                    return txResult;
                }).immediate();

                results.push({ scanId, ...syncResult });
            } catch (e) {
                conn.prepare(`UPDATE OfflineScanQueue SET syncStatus = 'FAILED', failReason = ? WHERE scanId = ?`)
                    .run(e.message, scanId);
                results.push({ scanId, status: 'FAILED', reason: e.message });
            }
        }

        res.json({ processed: results.length, results });
    } catch (err) {
        console.error('[scan] POST /api/scan/offline-sync error:', err);
        res.status(500).json({ error: 'Offline sync failed', detail: err.message });
    }
});

// ── POST /api/scan/desk-action ───────────────────────────────────────────────
// Supervisor desk resolution for WOs in the Mission Control needsReview queue.
// Does NOT require a scan event — supervisor acts directly from the dashboard.
// Generates a synthetic auditEventId for the audit trail.
//
//   DESK_DISMISS  — clear needsReview flag, set reviewStatus = 'DISMISSED_BY_DESK'
//   DESK_CLOSE    — close WO (status=40), clear review flag, closeMode = 'DESK_CLOSE'
//   DESK_RESUME   — reopen WO (status=30), clear review flag and holdReason
//
// Body: { woId, userId, deskAction }
router.post('/desk-action', (req, res) => {
    const { woId, deskAction } = req.body;
    const userId = req.user?.UserID || req.user?.Username;
    if (!woId || !deskAction) {
        return res.status(400).json({ error: 'woId, userId, and deskAction are required' });
    }
    const validActions = ['DESK_DISMISS', 'DESK_CLOSE', 'DESK_RESUME'];
    if (!validActions.includes(deskAction)) {
        return res.status(400).json({ error: `deskAction must be one of: ${validActions.join(', ')}` });
    }
    try {
        const conn = db.getDb();
        const wo = conn.prepare('SELECT ID, StatusID, AstID FROM Work WHERE ID = ?').get(woId);
        if (!wo) return res.status(404).json({ error: 'Work order not found' });

        const prevStatus = wo.StatusID;
        // Synthetic scanId — desk actions are not scan-triggered but must be audited.
        const syntheticScanId = `DESK-${uuidv4()}`;
        const serverTs = new Date().toISOString();

        let nextStatus = prevStatus;
        let branch;

        switch (deskAction) {
            case 'DESK_DISMISS':
                conn.prepare(`
                    UPDATE Work SET needsReview = 0, reviewStatus = 'DISMISSED_BY_DESK',
                        acknowledgedByUserId = ?, acknowledgedAt = datetime('now')
                    WHERE ID = ?
                `).run(userId, woId);
                branch = 'DESK_DISMISS';
                break;

            case 'DESK_CLOSE':
                conn.prepare(`
                    UPDATE Work SET StatusID = ?, needsReview = 0, reviewStatus = 'DISMISSED_BY_DESK',
                        closedByUserId = ?, closeMode = 'DESK_CLOSE',
                        acknowledgedByUserId = ?, acknowledgedAt = datetime('now')
                    WHERE ID = ?
                `).run(STATUS.COMPLETED, userId, userId, woId);
                nextStatus = STATUS.COMPLETED;
                branch = 'DESK_CLOSE';
                break;

            case 'DESK_RESUME':
                conn.prepare(`
                    UPDATE Work SET StatusID = ?, needsReview = 0, holdReason = NULL,
                        reviewStatus = 'DISMISSED_BY_DESK',
                        acknowledgedByUserId = ?, acknowledgedAt = datetime('now'),
                        returnAt = NULL
                    WHERE ID = ?
                `).run(STATUS.IN_PROGRESS, userId, woId);
                nextStatus = STATUS.IN_PROGRESS;
                branch = 'DESK_RESUME';
                break;
        }

        writeAuditEntry(conn, {
            scanId: syntheticScanId, woId: String(woId), assetId: wo.AstID, userId,
            previousState: prevStatus, nextState: nextStatus,
            decisionBranch: branch, deviceTimestamp: serverTs,
        });

        // Phase 2+3: provisional outcome + explain cache invalidation on desk-close
        if (branch === 'DESK_CLOSE') {
            outcomeTracker.recordOutcome(conn, {
                workOrderId: wo.ID,
                assetId:     wo.AstID,
                completedAt: serverTs,
            });
            const deskPlantId = req.headers['x-plant-id'];
            if (deskPlantId) {
                explainCache.invalidate(deskPlantId, wo.AstID);
                explainCache.warmAsync(deskPlantId, wo.AstID);
            }
        }

        res.json({ ok: true, branch, nextStatus });
    } catch (err) {
        console.error('[scan] POST /api/scan/desk-action error:', err);
        res.status(500).json({ error: 'Desk action failed', detail: err.message });
    }
});

// ── GET /api/scan/parts-search ───────────────────────────────────────────────
// Lightweight part lookup for the scan flow parts-checkout UI.
// Returns up to 20 matching parts by name, legacy Descript, or ID.
router.get('/parts-search', (req, res) => {
    try {
        const { q = '' } = req.query;
        if (!q.trim()) return res.json({ parts: [] });
        const conn = db.getDb();
        const term = `%${q.trim()}%`;
        const parts = conn.prepare(`
            SELECT ID,
                   COALESCE(Description, Descript) AS description,
                   Stock AS available,
                   Location AS location,
                   UnitCost
            FROM Part
            WHERE (COALESCE(Description, Descript) LIKE ? OR ID LIKE ?)
            ORDER BY COALESCE(Description, Descript)
            LIMIT 20
        `).all(term, term);
        res.json({ parts });
    } catch (err) {
        console.error('[scan] GET /api/scan/parts-search error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/scan/wo-parts ────────────────────────────────────────────────────
// Returns all parts on a work order with full lifecycle state.
// qty_returnable = EstQty - COALESCE(ActQty,0) - COALESCE(qty_returned,0)
router.get('/wo-parts', (req, res) => {
    try {
        const { woId } = req.query;
        if (!woId) return res.status(400).json({ error: 'woId required' });
        const conn = db.getDb();
        const wo = conn.prepare(
            'SELECT ID FROM Work WHERE WorkOrderNumber = ? OR CAST(ID AS TEXT) = ? LIMIT 1'
        ).get(String(woId), String(woId));
        if (!wo) return res.json({ parts: [] });
        const parts = conn.prepare(`
            SELECT wp.PartID,
                   COALESCE(p.Description, p.Descript) AS description,
                   wp.EstQty                                                        AS qty_issued,
                   COALESCE(wp.ActQty, 0)                                          AS qty_used,
                   COALESCE(wp.qty_returned, 0)                                    AS qty_returned,
                   wp.EstQty - COALESCE(wp.ActQty,0) - COALESCE(wp.qty_returned,0) AS qty_returnable,
                   COALESCE(wp.status, 'issued')                                   AS status,
                   wp.UnitCost, wp.Location,
                   p.Stock AS stock_available, p.UOM
            FROM WorkParts wp
            JOIN Part p ON wp.PartID = p.ID
            WHERE wp.WoID = ?
            ORDER BY COALESCE(p.Description, p.Descript)
        `).all(wo.ID);
        res.json({ woId: wo.ID, parts });
    } catch (err) {
        console.error('[scan] GET /api/scan/wo-parts error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/scan/return-part ────────────────────────────────────────────────
// Return qty of a part from a work order back to stock.
// Body: { woId, partId, qty }
// Rules: qty <= qty_returnable; decrements WorkParts.qty_returned; increments Part.Stock.
router.post('/return-part', (req, res) => {
    try {
        const { woId, partId, qty: rawQty } = req.body;
        const userId = req.user?.Username || req.user?.UserID || 'unknown';
        if (!woId || !partId || !rawQty) return res.status(400).json({ error: 'woId, partId, qty required' });
        const qty = Number(rawQty);
        if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'qty must be a positive number' });

        const conn = db.getDb();
        const wo = conn.prepare(
            'SELECT ID FROM Work WHERE WorkOrderNumber = ? OR CAST(ID AS TEXT) = ? LIMIT 1'
        ).get(String(woId), String(woId));
        if (!wo) return res.status(404).json({ error: 'Work order not found' });

        // Fast 404 check outside the transaction (no qty logic yet)
        const wpExists = conn.prepare(
            'SELECT 1 FROM WorkParts WHERE WoID = ? AND PartID = ? LIMIT 1'
        ).get(wo.ID, String(partId));
        if (!wpExists) return res.status(404).json({ error: 'Part not on this work order' });

        // I-01/I-02: Re-read qty inside an IMMEDIATE transaction so the returnable
        // check and the UPDATE share the same write lock. A DEFERRED read outside
        // the transaction leaves a TOCTOU window where a concurrent return can read
        // the same qty_returned value, both pass the check, and together over-return.
        let txResult;
        conn.transaction(() => {
            const fresh = conn.prepare(`
                SELECT wp.EstQty, COALESCE(wp.ActQty,0) AS qty_used,
                       COALESCE(wp.qty_returned,0)       AS qty_returned,
                       wp.UnitCost, wp.Location
                FROM WorkParts wp
                WHERE wp.WoID = ? AND wp.PartID = ? LIMIT 1
            `).get(wo.ID, String(partId));

            const returnable = fresh.EstQty - fresh.qty_used - fresh.qty_returned;
            if (qty > returnable + 0.001) {
                logInvariant('I-01', 'I-01:OVER_RETURN_PREVENTED', {
                    plantId:    req.headers['x-plant-id'],
                    entityType: 'workOrder',
                    entityId:   String(woId),
                    actor:      userId,
                    metadata:   { partId, attempted: qty, returnable },
                });
                txResult = { err: `Cannot return ${qty} — only ${returnable} returnable`, status: 400 };
                return; // no writes; transaction commits as a no-op
            }

            const newReturned = fresh.qty_returned + qty;
            const newStatus   = newReturned >= fresh.EstQty - fresh.qty_used - 0.001 ? 'fully_returned'
                              : newReturned > 0 ? 'partial_return' : 'issued';

            conn.prepare(`
                UPDATE WorkParts SET qty_returned = ?, status = ?, returned_by = ?, returned_at = datetime('now')
                WHERE WoID = ? AND PartID = ?
            `).run(newReturned, newStatus, userId, wo.ID, String(partId));

            conn.prepare(`UPDATE Part SET Stock = Stock + ? WHERE ID = ?`).run(qty, String(partId));

            try {
                conn.prepare(`
                    INSERT INTO inventory_movements
                        (work_order_id, part_id, movement_type, qty, unit_cost, location, performed_by, performed_at)
                    VALUES (?, ?, 'RETURN_TO_STOCK', ?, ?, ?, ?, datetime('now'))
                `).run(wo.ID, String(partId), qty, parseFloat(fresh.UnitCost) || 0, fresh.Location || null, userId);
            } catch (_) { /* older DBs without inventory_movements — non-fatal */ }

            txResult = { ok: true, partId, returned: qty, newStatus };
        }).immediate()();

        if (txResult?.err) return res.status(txResult.status).json({ error: txResult.err });
        res.json(txResult);
    } catch (err) {
        console.error('[scan] POST /return-part error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/scan/undo-part-add ──────────────────────────────────────────────
// Reverse an AUTO_ADDED_PART scan. Restores stock, decrements WorkParts qty.
// Body: { woId, partId, movementId, qty }
router.post('/undo-part-add', (req, res) => {
    try {
        const { woId, partId, movementId, qty: rawQty = 1 } = req.body;
        if (!woId || !partId || !movementId) return res.status(400).json({ error: 'woId, partId, movementId required' });
        const qty = Number(rawQty);
        const conn = db.getDb();
        const wo = conn.prepare('SELECT ID FROM Work WHERE WorkOrderNumber = ? OR CAST(ID AS TEXT) = ? LIMIT 1')
            .get(String(woId), String(woId));
        if (!wo) return res.status(404).json({ error: 'Work order not found' });

        conn.transaction(() => {
            conn.prepare('UPDATE Part SET Stock = Stock + ? WHERE ID = ?').run(qty, String(partId));
            const wp = conn.prepare('SELECT EstQty FROM WorkParts WHERE WoID = ? AND PartID = ? LIMIT 1').get(wo.ID, String(partId));
            if (wp) {
                const newQty = (wp.EstQty || 0) - qty;
                if (newQty <= 0) {
                    conn.prepare('DELETE FROM WorkParts WHERE WoID = ? AND PartID = ?').run(wo.ID, String(partId));
                } else {
                    conn.prepare('UPDATE WorkParts SET EstQty = ? WHERE WoID = ? AND PartID = ?').run(newQty, wo.ID, String(partId));
                }
            }
            try { conn.prepare('DELETE FROM inventory_movements WHERE id = ?').run(Number(movementId)); } catch (_) {}
        })();

        res.json({ ok: true });
    } catch (err) {
        console.error('[scan] POST /undo-part-add error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/scan/suggested-parts ─────────────────────────────────────────────
// Returns parts for an asset in priority order:
//   issued   → parts already on this WO (WorkParts)
//   suggested → BOM parts for this asset (AssetParts) + recent history parts
// Query params: assetId (required), woId (optional)
router.get('/suggested-parts', (req, res) => {
    try {
        const { assetId, woId } = req.query;
        if (!assetId) return res.status(400).json({ error: 'assetId required' });
        const conn = db.getDb();

        // Layer 1: Parts already on this WO
        let issuedParts = [];
        const issuedIds = new Set();
        if (woId) {
            const wo = conn.prepare('SELECT ID FROM Work WHERE WorkOrderNumber = ? OR CAST(ID AS TEXT) = ? LIMIT 1')
                .get(String(woId), String(woId));
            if (wo) {
                issuedParts = conn.prepare(`
                    SELECT wp.PartID,
                           COALESCE(p.Description, p.Descript) AS description,
                           wp.EstQty                                                        AS qty_issued,
                           COALESCE(wp.ActQty, 0)                                          AS qty_used,
                           COALESCE(wp.qty_returned, 0)                                    AS qty_returned,
                           wp.EstQty - COALESCE(wp.ActQty,0) - COALESCE(wp.qty_returned,0) AS qty_returnable,
                           COALESCE(wp.status, 'issued')                                   AS status,
                           wp.Location, p.Stock AS stock_available, p.UOM
                    FROM WorkParts wp
                    JOIN Part p ON wp.PartID = p.ID
                    WHERE wp.WoID = ?
                    ORDER BY COALESCE(p.Description, p.Descript)
                `).all(wo.ID);
                issuedParts.forEach(p => issuedIds.add(p.PartID));
            }
        }

        // Layer 2: BOM parts for this asset (AssetParts table)
        const bomParts = conn.prepare(`
            SELECT ap.PartID, COALESCE(p.Description, p.Descript) AS description,
                   p.Stock AS stock_available, p.UOM,
                   CAST(COALESCE(ap.Quantity, 1) AS INTEGER) AS suggested_qty,
                   'bom' AS source, 1.0 AS confidence
            FROM AssetParts ap
            JOIN Part p ON ap.PartID = p.ID
            WHERE ap.AstID = ?
            ORDER BY COALESCE(p.Description, p.Descript)
        `).all(String(assetId)).filter(p => !issuedIds.has(p.PartID));

        // Layer 3: Recent work history for this asset (parts not in BOM or WO)
        const knownIds = new Set([...issuedIds, ...bomParts.map(p => p.PartID)]);
        let historyParts = [];
        try {
            historyParts = conn.prepare(`
                SELECT wp.PartID, COALESCE(p.Description, p.Descript) AS description,
                       p.Stock AS stock_available, p.UOM,
                       CAST(AVG(wp.EstQty) AS INTEGER) AS suggested_qty,
                       'history' AS source, 0.7 AS confidence
                FROM WorkParts wp
                JOIN Part p ON wp.PartID = p.ID
                JOIN Work w ON wp.WoID = w.ID
                WHERE w.AstID = ? AND wp.PartID IS NOT NULL AND wp.WoID IS NOT NULL
                GROUP BY wp.PartID
                ORDER BY MAX(w.AddDate) DESC
                LIMIT 10
            `).all(String(assetId)).filter(p => !knownIds.has(p.PartID));
        } catch (_) {}

        res.json({
            assetId,
            issued: issuedParts,
            suggested: [...bomParts, ...historyParts],
        });
    } catch (err) {
        console.error('[scan] GET /suggested-parts error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/scan/save-asset-part ────────────────────────────────────────────
// Save a part as common for an asset (adds to AssetParts BOM).
// Body: { assetId, partId, quantity }
router.post('/save-asset-part', (req, res) => {
    try {
        const { assetId, partId, quantity = 1 } = req.body;
        if (!assetId || !partId) return res.status(400).json({ error: 'assetId and partId required' });
        const conn = db.getDb();
        conn.prepare(`
            INSERT OR IGNORE INTO AssetParts (AstID, PartID, Quantity, Comment)
            VALUES (?, ?, ?, 'tech_confirmed')
        `).run(String(assetId), String(partId), Number(quantity) || 1);
        res.json({ ok: true });
    } catch (err) {
        console.error('[scan] POST /save-asset-part error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/scan/parts-checkout ────────────────────────────────────────────
// Add a part to a work order's parts list. Idempotent: increments qty if part
// already exists on the WO rather than inserting a duplicate row.
router.post('/parts-checkout', (req, res) => {
    try {
        const { woId, partId, quantity } = req.body;
        const userId = req.user?.UserID || req.user?.Username;
        if (!woId || !partId || !quantity) {
            return res.status(400).json({ error: 'woId, partId, and quantity are required' });
        }
        const qty = Number(quantity);
        if (!Number.isFinite(qty) || qty < 1) {
            return res.status(400).json({ error: 'quantity must be a positive number' });
        }
        const conn = db.getDb();
        const wo = conn.prepare(
            'SELECT ID FROM Work WHERE WorkOrderNumber = ? OR CAST(ID AS TEXT) = ? LIMIT 1'
        ).get(String(woId), String(woId));
        if (!wo) return res.status(404).json({ error: 'Work order not found' });

        const part = conn.prepare(
            'SELECT ID, COALESCE(Description, Descript) AS description, UnitCost FROM Part WHERE ID = ? LIMIT 1'
        ).get(String(partId));
        if (!part) return res.status(404).json({ error: 'Part not found' });

        const unitCost = parseFloat(part.UnitCost) || 0;
        conn.transaction(() => {
            const existing = conn.prepare(
                'SELECT EstQty FROM WorkParts WHERE WoID = ? AND PartID = ? LIMIT 1'
            ).get(wo.ID, part.ID);
            if (existing) {
                conn.prepare(
                    'UPDATE WorkParts SET EstQty = EstQty + ?, issued_by = ? WHERE WoID = ? AND PartID = ?'
                ).run(qty, userId || null, wo.ID, part.ID);
            } else {
                conn.prepare(
                    `INSERT INTO WorkParts (WoID, PartID, EstQty, UnitCost, UseDate, issued_by)
                     VALUES (?, ?, ?, ?, datetime('now'), ?)`
                ).run(wo.ID, part.ID, qty, unitCost, userId || null);
            }
            // Record inventory movement (idempotent via INSERT OR IGNORE on the unique index)
            try {
                conn.prepare(`
                    INSERT OR IGNORE INTO inventory_movements
                        (work_order_id, part_id, movement_type, qty, unit_cost, performed_by, performed_at)
                    VALUES (?, ?, 'ISSUE_TO_WORK_ORDER', ?, ?, ?, datetime('now'))
                `).run(wo.ID, part.ID, qty, unitCost, userId || 'unknown');
            } catch (_) { /* inventory_movements may not exist yet on older DBs */ }
        })();
        res.json({ ok: true, partAdded: { id: part.ID, description: part.description, quantity: qty } });
    } catch (err) {
        console.error('[scan] POST /parts-checkout error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/scan/add-child-asset ───────────────────────────────────────────
// Quick-register a sub-component under a parent asset from the scan flow.
// Accepts an optional base64 photoDataUrl that is saved to disk as a JPEG.
// After creation the caller should POST /api/scan with the new child ID.
router.post('/add-child-asset', (req, res) => {
    try {
        const { name, parentId, photoDataUrl } = req.body;
        const userId = req.user?.UserID || req.user?.Username;
        if (!name || !parentId) {
            return res.status(400).json({ error: 'name and parentId are required' });
        }

        const conn = db.getDb();
        const parent = conn.prepare('SELECT ID, Description, LocationID FROM Asset WHERE ID = ? LIMIT 1').get(String(parentId));
        if (!parent) return res.status(404).json({ error: 'Parent asset not found' });

        // Generate a unique child ID: parent prefix + hex timestamp suffix
        const suffix = Date.now().toString(16).slice(-6);
        const childId = `${parentId.slice(0, 10)}-${suffix}`.toUpperCase();

        // Persist optional photo
        let photoPath = null;
        if (photoDataUrl && photoDataUrl.startsWith('data:image/')) {
            const photoDir = path.join(__dirname, '..', 'data', 'asset-photos');
            if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });
            const base64Data = photoDataUrl.replace(/^data:image\/\w+;base64,/, '');
            photoPath = path.join(photoDir, `${childId}.jpg`);
            fs.writeFileSync(photoPath, Buffer.from(base64Data, 'base64'));
        }

        conn.prepare(`
            INSERT INTO Asset (ID, Description, ParentAssetID, LocationID, Active, OperationalStatus)
            VALUES (?, ?, ?, ?, 1, 'In Production')
        `).run(childId, name.trim(), parent.ID, parent.LocationID || null);

        res.status(201).json({ ok: true, id: childId, description: name.trim() });
    } catch (err) {
        console.error('[scan] POST /add-child-asset error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/scan/enrichment/:id ─────────────────────────────────────────────
// SSE stream — client connects here after receiving enrichmentId from a 404 scan.
// Sends exactly one event: { type:'enrichment', enrichmentId, semanticMatch:{...}|null }
// Stream closes immediately after the event, or after 12s if enrichment never completes.
// No auth required — enrichmentId is a scan-scoped UUID with a 60s TTL.
router.get('/enrichment/:id', (req, res) => {
    const { id } = req.params;
    if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
        return res.status(400).json({ error: 'Invalid enrichmentId' });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    enrichmentQueue.registerSSEListener(id, res);
});

module.exports = router;
