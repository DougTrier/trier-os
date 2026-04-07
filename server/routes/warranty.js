// Copyright © 2026 Trier OS. All Rights Reserved.
// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */

/**
 * Trier OS — Warranty Claims Lifecycle API
 * =========================================
 * Tracks parts and equipment warranty claims from initial submission
 * through vendor acknowledgement, approval/denial, and reimbursement.
 * Cross-plant recovery reporting queries all plant DBs for an enterprise view.
 * Mounted at /api/warranty in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /claims              List claims for the current plant (filter: status, assetId)
 *   POST   /claims              Submit a new warranty claim
 *   PATCH  /claims/:id/status   Advance claim through the lifecycle
 *   GET    /report              Cross-plant warranty recovery report (all plants, date range)
 *
 * CLAIM STATUS LIFECYCLE:
 *   Submitted → Acknowledged → Approved → Reimbursed  (successful path)
 *                            → Denied                  (vendor rejects claim)
 *
 * CROSS-PLANT REPORT: GET /report opens each plant DB via better-sqlite3 and
 * aggregates claim counts + total recovery amounts by status. Uses the same
 * multi-DB fan-out pattern as corporate-analytics.js and the crawl engine.
 * Returns { plants: [{ plantId, claims: [...] }], grandTotal } for the
 * enterprise warranty recovery dashboard.
 *
 * VALID STATUSES: Submitted | Acknowledged | Approved | Denied | Reimbursed
 * Invalid status transitions return 400 with the list of valid values.
 *
 * TABLE: warranty_claims (per-plant DB)
 *   ID, AssetID, PartID, WorkOrderNumber, VendorName, ClaimDate,
 *   Amount, Description, Status, Notes, CreatedAt, UpdatedAt
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const VALID_STATUSES = ['Submitted', 'Acknowledged', 'Approved', 'Denied', 'Reimbursed'];
const DATA_DIR = path.join(__dirname, '../../data');

// ── PUT /api/warranty/asset/:id ─────────────────────────────────────────────
// Update an asset's warranty timeline from the WarrantyDashboard
router.put('/asset/:id', (req, res) => {
    try {
        const db = getDb();
        const { WarrantyEnd, WarrantyStart, WarrantyVendor } = req.body;
        db.prepare('UPDATE Asset SET WarrantyStart = ?, WarrantyEnd = ?, WarrantyVendor = ? WHERE ID = ?').run(
            WarrantyStart || null, WarrantyEnd || null, WarrantyVendor || null, req.params.id
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[Warranty Update] Error:', err.message);
        res.status(500).json({ error: 'Failed to update asset warranty' });
    }
});

// ── GET /api/warranty/claims ────────────────────────────────────────────────
// List claims for the current plant (honoured by getDb() via x-plant-id header)
router.get('/claims', (req, res) => {
    try {
        const db = getDb();
        const { status, limit = 200 } = req.query;
        let sql = 'SELECT * FROM WarrantyClaims';
        const params = [];
        if (status && VALID_STATUSES.includes(status)) {
            sql += ' WHERE Status = ?';
            params.push(status);
        }
        sql += ' ORDER BY CreatedAt DESC LIMIT ?';
        params.push(parseInt(limit, 10));
        const claims = db.prepare(sql).all(...params);
        res.json({ claims });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── POST /api/warranty/claims ───────────────────────────────────────────────
// Create a new claim
router.post('/claims', (req, res) => {
    try {
        const db = getDb();
        const {
            AssetID, AssetDescription, WorkOrderID, WorkOrderNumber,
            VendorName, ClaimDate, ClaimAmount, Notes, ClaimReference
        } = req.body;
        const user = req.user?.username || req.user?.name || 'unknown';
        const result = db.prepare(`
            INSERT INTO WarrantyClaims
                (AssetID, AssetDescription, WorkOrderID, WorkOrderNumber, VendorName,
                 ClaimDate, ClaimAmount, Notes, ClaimReference, SubmittedBy, Status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted')
        `).run(
            AssetID || null,
            AssetDescription || '',
            WorkOrderID || null,
            WorkOrderNumber || '',
            VendorName || '',
            ClaimDate || new Date().toISOString().slice(0, 10),
            parseFloat(ClaimAmount) || 0,
            Notes || '',
            ClaimReference || '',
            user
        );
        const claim = db.prepare('SELECT * FROM WarrantyClaims WHERE ID = ?').get(result.lastInsertRowid);
        res.json({ success: true, claim });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── PATCH /api/warranty/claims/:id/status ──────────────────────────────────
// Advance or update claim status: Submitted → Acknowledged → Approved/Denied → Reimbursed
router.patch('/claims/:id/status', (req, res) => {
    try {
        const db = getDb();
        const id = parseInt(req.params.id, 10);
        const { Status, AmountRecovered, Notes, ClaimReference } = req.body;

        if (!VALID_STATUSES.includes(Status)) {
            return res.status(400).json({ error: `Invalid status. Valid values: ${VALID_STATUSES.join(', ')}` });
        }

        const user = req.user?.username || req.user?.name || 'unknown';
        const now = new Date().toISOString();
        const setClauses = ['Status = ?', 'StatusUpdatedAt = ?', 'StatusUpdatedBy = ?'];
        const params = [Status, now, user];

        if (AmountRecovered !== undefined) {
            setClauses.push('AmountRecovered = ?');
            params.push(parseFloat(AmountRecovered) || 0);
        }
        if (Notes !== undefined) {
            setClauses.push('Notes = ?');
            params.push(Notes);
        }
        if (ClaimReference !== undefined) {
            setClauses.push('ClaimReference = ?');
            params.push(ClaimReference);
        }

        params.push(id);
        db.prepare(`UPDATE WarrantyClaims SET ${setClauses.join(', ')} WHERE ID = ?`).run(...params);
        const claim = db.prepare('SELECT * FROM WarrantyClaims WHERE ID = ?').get(id);
        if (!claim) return res.status(404).json({ error: 'Claim not found' });
        res.json({ success: true, claim });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── GET /api/warranty/report ────────────────────────────────────────────────
// Cross-plant recovery report: $ filed vs. $ recovered, by status, per plant
router.get('/report', (req, res) => {
    try {
        const plantFiles = fs.readdirSync(DATA_DIR).filter(f =>
            f.endsWith('.db') &&
            !f.includes('trier_') &&
            !f.includes('corporate_') &&
            !f.includes('schema_') &&
            !f.includes('dairy_')
        );

        const plants = [];
        let totalClaims = 0, totalFiled = 0, totalRecovered = 0, totalDenied = 0, totalPending = 0;

        for (const file of plantFiles) {
            const db = new Database(path.join(DATA_DIR, file), { readonly: true });
            try {
                const tableExists = db.prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='WarrantyClaims'"
                ).get();
                if (!tableExists) { db.close(); continue; }

                const summary = db.prepare(`
                    SELECT
                        COUNT(*) as totalClaims,
                        COALESCE(SUM(ClaimAmount), 0) as filed,
                        COALESCE(SUM(CASE WHEN Status = 'Reimbursed' THEN AmountRecovered ELSE 0 END), 0) as recovered,
                        COALESCE(SUM(CASE WHEN Status = 'Denied' THEN 1 ELSE 0 END), 0) as denied,
                        COALESCE(SUM(CASE WHEN Status NOT IN ('Reimbursed', 'Denied') THEN 1 ELSE 0 END), 0) as pending
                    FROM WarrantyClaims
                `).get();

                if (summary.totalClaims > 0) {
                    const plantId = file.replace('.db', '');
                    const plantLabel = plantId.replace('Plant_', 'Plant ');
                    const recoveryRate = summary.filed > 0
                        ? Math.round((summary.recovered / summary.filed) * 100)
                        : 0;
                    plants.push({
                        plantId, plantLabel,
                        totalClaims: summary.totalClaims,
                        filed: summary.filed,
                        recovered: summary.recovered,
                        denied: summary.denied,
                        pending: summary.pending,
                        recoveryRate
                    });
                    totalClaims  += summary.totalClaims;
                    totalFiled   += summary.filed;
                    totalRecovered += summary.recovered;
                    totalDenied  += summary.denied;
                    totalPending += summary.pending;
                }
            } catch (_) {
                // WarrantyClaims table not yet migrated on this plant — skip
            } finally {
                db.close();
            }
        }

        const recoveryRate = totalFiled > 0
            ? Math.round((totalRecovered / totalFiled) * 100)
            : 0;

        res.json({
            plants,
            totals: {
                totalClaims,
                filed: totalFiled,
                recovered: totalRecovered,
                denied: totalDenied,
                pending: totalPending,
                recoveryRate
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
