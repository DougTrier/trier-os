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
 *   POST /api/scan              Main scan endpoint — evaluate + transition
 *   POST /api/scan/action       Submit user choice after a branch prompt
 *   GET  /api/scan/needs-review List WOs flagged needsReview=1 for Mission Control
 *   POST /api/scan/desk-action  Supervisor resolution (Close/Resume/Dismiss) from Mission Control
 *   POST /api/scan/offline-sync Batch sync queued offline scan events
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
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const dataDir = require('../resolve_data_dir');

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
            if (mySegment) {
                // This user is already active — show their action options
                const multiTech = otherSegments.length > 0;
                return res.json({
                    branch: 'ROUTE_TO_ACTIVE_WO',
                    context: multiTech ? 'MULTI_TECH' : 'SOLO',
                    wo: { id: activeWoRef, number: activeWo.WorkOrderNumber, description: activeWo.Description },
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
                    wo: { id: activeWoRef, number: activeWo.WorkOrderNumber, description: activeWo.Description },
                    activeUsers: otherSegments.map(s => s.userId),
                    options: ['JOIN', 'TAKE_OVER', 'ESCALATE'],
                });
            } else {
                // WO is active but no open segments (edge case — open a new segment)
                const segmentId = openSegment(conn, { woId: activeWoRef, userId, segmentReason: 'RESUME' });
                return res.json({
                    branch: 'ROUTE_TO_ACTIVE_WO',
                    context: 'RESUMED_NO_SEGMENT',
                    wo: { id: activeWoRef, number: activeWo.WorkOrderNumber, description: activeWo.Description },
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
                `).all(assetId, userId);
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
            writeAuditEntry(conn, {
                scanId, assetId, userId,
                previousState: null, nextState: null,
                decisionBranch: 'AUTO_REJECT_DUPLICATE_SCAN', // reuse closest code — unknown asset
                deviceTimestamp, offlineCaptured,
            });
            return res.status(404).json({ error: 'Asset not found', assetId });
        }

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
                
            const woInsert = conn.prepare(`
                INSERT INTO Work
                    (WorkOrderNumber, Description, AstID, StatusID, TypeID, AddDate, UserID, AssignToID)
                VALUES (?, ?, ?, ?, 'CORRECTIVE', datetime('now'), ?, ?)
            `).run(woNumber, desc, assetId,
                STATUS.IN_PROGRESS, userId, userId);

            // Use WorkOrderNumber as the stable identifier — ID column is TEXT PRIMARY KEY and not set here
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

            return { woId, woNumber, segmentId };
        }).immediate();

        if (result.duplicate) {
            return res.json({
                branch: 'AUTO_REJECT_DUPLICATE_SCAN',
                message: 'Duplicate scan detected — no action taken.',
                scanId,
            });
        }

        return res.json({
            branch: 'AUTO_CREATE_WO',
            message: 'Work Started',
            wo: { id: result.woId, number: result.woNumber },
            segmentId: result.segmentId,
        });

    } catch (err) {
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
        const conn = req.db;
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

        res.json({ ok: true, branch, nextStatus });
    } catch (err) {
        console.error('[scan] POST /api/scan/desk-action error:', err);
        res.status(500).json({ error: 'Desk action failed', detail: err.message });
    }
});

module.exports = router;
