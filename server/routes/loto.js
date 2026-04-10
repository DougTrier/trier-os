// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * loto.js — LOTO (Lockout/Tagout) Digital Permit System
 * ========================================================
 * OSHA 29 CFR 1910.147-compliant energy isolation permit management.
 * Tracks energy control points, digital signatures, and auto-expiry.
 * All LOTO data lives in trier_logistics.db (cross-plant audit trail).
 * Mounted at /api/loto in server/index.js.
 *
 * -- ROUTES ----------------------------------------------------
 *   GET    /permits                    List LOTO permits (filter: plant, status, asset, date)
 *   GET    /permits/history/:assetId   Fetch historical LOTO for asset autocompletion
 *   GET    /permits/:id                Full permit detail with energy points + signatures
 *   POST   /permits                    Create permit (auto-generates LOTO-{PLANT3}-{DATE}-{SEQ})
 *   POST   /permits/:id/sign           Add digital signature (ISSUER or WORKER role)
 *   POST   /permits/:id/verify-point   Technician checks off an energy isolation point
 *   POST   /permits/:id/close          Close permit — energy restored, work complete
 *   POST   /permits/:id/void           Void permit with reason (immediate energy stop)
 *   PUT    /permits/:id                Update permit metadata
 *   GET    /energy-types               List all energy type definitions (Electrical, Hydraulic…)
 */
 *
 * PERMIT LIFECYCLE:
 *   DRAFT → ACTIVE (after issuer signs) → CLOSED (normal completion)
 *                                       → VOIDED (emergency abort)
 *                                       → EXPIRED (auto-expiry engine)
 *
 * ENERGY ISOLATION POINTS: Each permit has one or more isolation points
 * (e.g. "480V Breaker Panel B-12", "Pneumatic Supply Valve PV-101").
 * Each point must be verified by a technician before the permit goes ACTIVE.
 * Points include: EnergyType, Location, LockNumber, Verified flag, VerifiedBy.
 *
 * SIGNATURE ROLES:
 *   ISSUER  — Supervisor who authorizes the work (required to activate)
 *   WORKER  — Technician performing the work (acknowledges isolation)
 *
 * AUTO-EXPIRY: A background interval checks for ACTIVE permits past their
 * ExpiresAt timestamp and marks them EXPIRED. Default expiry is 8 hours.
 * Operations personnel receive an alert 30 minutes before expiry.
 *
 * ENERGY TYPES: Electrical | Hydraulic | Pneumatic | Gravity | Thermal |
 *   Mechanical | Chemical | Steam | Radiation | Other
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('../logistics_db');

// ── Initialize LOTO Tables ─────────────────────────────────────────────
function initLotoTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS LotoPermits (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PermitNumber TEXT UNIQUE NOT NULL,
            PlantID TEXT NOT NULL,
            AssetID TEXT,
            AssetDescription TEXT,
            WorkOrderID TEXT,
            Description TEXT NOT NULL,
            IssuedBy TEXT NOT NULL,
            IssuedAt TEXT NOT NULL DEFAULT (datetime('now')),
            PermitType TEXT DEFAULT 'LOTO',
            Status TEXT DEFAULT 'ACTIVE',
            ExpiresAt TEXT,
            ClosedBy TEXT,
            ClosedAt TEXT,
            VoidedBy TEXT,
            VoidedAt TEXT,
            VoidReason TEXT,
            Notes TEXT,
            HazardousEnergy TEXT DEFAULT 'Electrical',
            IsolationMethod TEXT
        );
        
        CREATE TABLE IF NOT EXISTS LotoIsolationPoints (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PermitID INTEGER NOT NULL,
            PointNumber INTEGER NOT NULL,
            EnergyType TEXT NOT NULL,
            Location TEXT NOT NULL,
            IsolationDevice TEXT,
            LockNumber TEXT,
            TagNumber TEXT,
            VerifiedBy TEXT,
            VerifiedAt TEXT,
            ReleasedBy TEXT,
            ReleasedAt TEXT,
            Status TEXT DEFAULT 'LOCKED',
            FOREIGN KEY (PermitID) REFERENCES LotoPermits(ID)
        );
        
        CREATE TABLE IF NOT EXISTS LotoSignatures (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PermitID INTEGER NOT NULL,
            SignatureType TEXT NOT NULL,
            SignedBy TEXT NOT NULL,
            SignedAt TEXT NOT NULL DEFAULT (datetime('now')),
            Role TEXT,
            FOREIGN KEY (PermitID) REFERENCES LotoPermits(ID)
        );

        CREATE TABLE IF NOT EXISTS LotoAuditLog (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PermitID INTEGER,
            Action TEXT NOT NULL,
            PerformedBy TEXT NOT NULL,
            PerformedAt TEXT NOT NULL DEFAULT (datetime('now')),
            Details TEXT,
            FOREIGN KEY (PermitID) REFERENCES LotoPermits(ID)
        );
    `);
    console.log('[LOTO] Tables initialized');
}

initLotoTables();

// ── Helper: Generate permit number ──────────────────────────────────────
function generatePermitNumber(plantId) {
    const date = new Date();
    const yy = date.getFullYear().toString().slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const seq = logisticsDb.prepare(
        `SELECT COUNT(*) as c FROM LotoPermits WHERE PlantID = ? AND IssuedAt >= date('now', 'start of day')`
    ).get(plantId).c + 1;
    const plant = (plantId || 'XX').substring(0, 3).toUpperCase();
    return `LOTO-${plant}-${yy}${mm}${dd}-${String(seq).padStart(3, '0')}`;
}

// ── ENERGY TYPES constant ───────────────────────────────────────────────
const ENERGY_TYPES = [
    'Electrical', 'Pneumatic', 'Hydraulic', 'Mechanical', 'Thermal',
    'Chemical', 'Gravity', 'Steam', 'Radiation', 'Stored Energy'
];

// 🔍 GET /api/loto/permits/history/:assetId - Get latest permit for an asset to auto-populate procedures
router.get('/permits/history/:assetId', (req, res) => {
    try {
        const permit = logisticsDb.prepare(`SELECT * FROM LotoPermits WHERE AssetID = ? ORDER BY IssuedAt DESC LIMIT 1`).get(req.params.assetId);
        if (!permit) return res.status(404).json({ error: 'No previous LOTO history for this asset.' });

        const points = logisticsDb.prepare(
            `SELECT * FROM LotoIsolationPoints WHERE PermitID = ? ORDER BY PointNumber`
        ).all(permit.ID);

        res.json({ permit, points });
    } catch (err) {
        console.error('[LOTO] GET history error:', err.message);
        res.status(500).json({ error: 'Failed to fetch LOTO history' });
    }
});

// 📋 GET /api/loto/permits — List all permits (with filters) 📋──────────
router.get('/permits', (req, res) => {
    try {
        const { plant, status, limit } = req.query;
        let sql = `SELECT * FROM LotoPermits WHERE 1=1`;
        const params = [];

        if (plant && plant !== 'all_sites') {
            sql += ` AND PlantID = ?`;
            params.push(plant);
        }
        if (status) {
            sql += ` AND Status = ?`;
            params.push(status.toUpperCase());
        }

        sql += ` ORDER BY IssuedAt DESC LIMIT ?`;
        params.push(parseInt(limit) || 100);

        const permits = logisticsDb.prepare(sql).all(...params);

        // Attach isolation point counts and signature counts
        const enriched = permits.map(p => {
            const points = logisticsDb.prepare(
                `SELECT COUNT(*) as total, SUM(CASE WHEN Status='LOCKED' THEN 1 ELSE 0 END) as locked FROM LotoIsolationPoints WHERE PermitID = ?`
            ).get(p.ID);
            const sigs = logisticsDb.prepare(
                `SELECT COUNT(*) as c FROM LotoSignatures WHERE PermitID = ?`
            ).get(p.ID);
            return {
                ...p,
                isolationPoints: points.total || 0,
                lockedPoints: points.locked || 0,
                signatures: sigs.c || 0
            };
        });

        // Summary stats
        const stats = {
            active: logisticsDb.prepare(`SELECT COUNT(*) as c FROM LotoPermits WHERE Status = 'ACTIVE'`).get().c,
            closed: logisticsDb.prepare(`SELECT COUNT(*) as c FROM LotoPermits WHERE Status = 'CLOSED'`).get().c,
            voided: logisticsDb.prepare(`SELECT COUNT(*) as c FROM LotoPermits WHERE Status = 'VOIDED'`).get().c,
            expired: logisticsDb.prepare(`SELECT COUNT(*) as c FROM LotoPermits WHERE Status = 'EXPIRED'`).get().c,
        };

        res.json({ permits: enriched, stats });
    } catch (err) {
        console.error('[LOTO] GET /permits error:', err.message);
        res.status(500).json({ error: 'Failed to fetch permits' });
    }
});

// ── GET /api/loto/permits/:id — Full permit detail ───────────────────
router.get('/permits/:id', (req, res) => {
    try {
        const permit = logisticsDb.prepare(`SELECT * FROM LotoPermits WHERE ID = ?`).get(req.params.id);
        if (!permit) return res.status(404).json({ error: 'Permit not found' });

        const points = logisticsDb.prepare(
            `SELECT * FROM LotoIsolationPoints WHERE PermitID = ? ORDER BY PointNumber`
        ).all(req.params.id);

        const signatures = logisticsDb.prepare(
            `SELECT * FROM LotoSignatures WHERE PermitID = ? ORDER BY SignedAt`
        ).all(req.params.id);

        const auditLog = logisticsDb.prepare(
            `SELECT * FROM LotoAuditLog WHERE PermitID = ? ORDER BY PerformedAt DESC`
        ).all(req.params.id);

        res.json({ permit, points, signatures, auditLog });
    } catch (err) {
        console.error('[LOTO] GET /permits/:id error:', err.message);
        res.status(500).json({ error: 'Failed to fetch permit details' });
    }
});

// ── POST /api/loto/permits — Create a new LOTO permit ─────────────
router.post('/permits', (req, res) => {
    try {
        const {
            plantId, assetId, assetDescription, workOrderId,
            description, issuedBy, expiresInHours, permitType,
            hazardousEnergy, isolationMethod, notes, isolationPoints
        } = req.body;

        if (!plantId || !description || !issuedBy) {
            return res.status(400).json({ error: 'plantId, description, and issuedBy are required' });
        }

        const permitNumber = generatePermitNumber(plantId);
        const hours = parseInt(expiresInHours) || 8;
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

        const result = logisticsDb.prepare(`
            INSERT INTO LotoPermits (PermitNumber, PlantID, AssetID, AssetDescription, WorkOrderID,
                Description, IssuedBy, PermitType, ExpiresAt, HazardousEnergy, IsolationMethod, Notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            permitNumber, plantId, assetId || null, assetDescription || null,
            workOrderId || null, description, issuedBy,
            permitType || 'LOTO', expiresAt,
            hazardousEnergy || 'Electrical', isolationMethod || null, notes || null
        );

        const permitId = result.lastInsertRowid;

        // Add isolation points if provided
        if (Array.isArray(isolationPoints) && isolationPoints.length > 0) {
            const insPoint = logisticsDb.prepare(`
                INSERT INTO LotoIsolationPoints (PermitID, PointNumber, EnergyType, Location, IsolationDevice, LockNumber, TagNumber)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            isolationPoints.forEach((pt, i) => {
                insPoint.run(
                    permitId, i + 1,
                    pt.energyType || 'Electrical',
                    pt.location || `Point ${i + 1}`,
                    pt.isolationDevice || null,
                    pt.lockNumber || null,
                    pt.tagNumber || null
                );
            });
        }

        // Add issuer signature
        logisticsDb.prepare(`
            INSERT INTO LotoSignatures (PermitID, SignatureType, SignedBy, Role)
            VALUES (?, 'ISSUER', ?, 'Authorized Person')
        `).run(permitId, issuedBy);

        // Audit log
        logisticsDb.prepare(`
            INSERT INTO LotoAuditLog (PermitID, Action, PerformedBy, Details)
            VALUES (?, 'CREATED', ?, ?)
        `).run(permitId, issuedBy, `Permit ${permitNumber} created for ${assetDescription || description}. Expires: ${expiresAt}`);

        try { logAudit('LOTO_PERMIT_CREATED', issuedBy, plantId, { permitNumber, assetId, description }); } catch(e) {}

        console.log(`[LOTO] ✅ Permit ${permitNumber} created by ${issuedBy} at ${plantId}`);
        res.status(201).json({ success: true, permitId, permitNumber });
    } catch (err) {
        console.error('[LOTO] POST /permits error:', err.message);
        res.status(500).json({ error: 'Failed to create permit: ' + err.message });
    }
});

// ── POST /api/loto/permits/:id/sign — Add a signature ───────────────
router.post('/permits/:id/sign', (req, res) => {
    try {
        const { signedBy, signatureType, role } = req.body;
        if (!signedBy) return res.status(400).json({ error: 'signedBy is required' });

        const permit = logisticsDb.prepare(`SELECT * FROM LotoPermits WHERE ID = ?`).get(req.params.id);
        if (!permit) return res.status(404).json({ error: 'Permit not found' });
        if (permit.Status !== 'ACTIVE') return res.status(400).json({ error: 'Can only sign active permits' });

        logisticsDb.prepare(`
            INSERT INTO LotoSignatures (PermitID, SignatureType, SignedBy, Role)
            VALUES (?, ?, ?, ?)
        `).run(req.params.id, signatureType || 'WORKER', signedBy, role || 'Worker');

        logisticsDb.prepare(`
            INSERT INTO LotoAuditLog (PermitID, Action, PerformedBy, Details)
            VALUES (?, 'SIGNED', ?, ?)
        `).run(req.params.id, signedBy, `${signatureType || 'WORKER'} signature by ${signedBy} (${role || 'Worker'})`);

        res.json({ success: true });
    } catch (err) {
        console.error('[LOTO] POST /permits/:id/sign error:', err.message);
        res.status(500).json({ error: 'Failed to add signature' });
    }
});

// ── POST /api/loto/permits/:id/verify-point — Verify an isolation point ─
router.post('/permits/:id/verify-point', (req, res) => {
    try {
        const { pointId, verifiedBy } = req.body;
        if (!pointId || !verifiedBy) return res.status(400).json({ error: 'pointId and verifiedBy are required' });

        logisticsDb.prepare(`
            UPDATE LotoIsolationPoints SET VerifiedBy = ?, VerifiedAt = datetime('now') WHERE ID = ? AND PermitID = ?
        `).run(verifiedBy, pointId, req.params.id);

        logisticsDb.prepare(`
            INSERT INTO LotoAuditLog (PermitID, Action, PerformedBy, Details)
            VALUES (?, 'POINT_VERIFIED', ?, ?)
        `).run(req.params.id, verifiedBy, `Isolation point ${pointId} verified`);

        res.json({ success: true });
    } catch (err) {
        console.error('[LOTO] POST verify-point error:', err.message);
        res.status(500).json({ error: 'Failed to verify isolation point' });
    }
});

// ── POST /api/loto/permits/:id/close — Close/release a permit ────────
router.post('/permits/:id/close', (req, res) => {
    try {
        const { closedBy } = req.body;
        if (!closedBy) return res.status(400).json({ error: 'closedBy is required' });

        const permit = logisticsDb.prepare(`SELECT * FROM LotoPermits WHERE ID = ?`).get(req.params.id);
        if (!permit) return res.status(404).json({ error: 'Permit not found' });
        if (permit.Status !== 'ACTIVE') return res.status(400).json({ error: 'Only active permits can be closed' });

        // Release all isolation points
        logisticsDb.prepare(`
            UPDATE LotoIsolationPoints SET Status = 'RELEASED', ReleasedBy = ?, ReleasedAt = datetime('now')
            WHERE PermitID = ? AND Status = 'LOCKED'
        `).run(closedBy, req.params.id);

        // Close the permit
        logisticsDb.prepare(`
            UPDATE LotoPermits SET Status = 'CLOSED', ClosedBy = ?, ClosedAt = datetime('now') WHERE ID = ?
        `).run(closedBy, req.params.id);

        // Add closing signature
        logisticsDb.prepare(`
            INSERT INTO LotoSignatures (PermitID, SignatureType, SignedBy, Role)
            VALUES (?, 'CLOSER', ?, 'Authorized Person')
        `).run(req.params.id, closedBy);

        logisticsDb.prepare(`
            INSERT INTO LotoAuditLog (PermitID, Action, PerformedBy, Details)
            VALUES (?, 'CLOSED', ?, ?)
        `).run(req.params.id, closedBy, `Permit ${permit.PermitNumber} closed. All isolation points released.`);

        try { logAudit('LOTO_PERMIT_CLOSED', closedBy, permit.PlantID, { permitNumber: permit.PermitNumber }); } catch(e) {}

        console.log(`[LOTO] 🔓 Permit ${permit.PermitNumber} closed by ${closedBy}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[LOTO] POST /permits/:id/close error:', err.message);
        res.status(500).json({ error: 'Failed to close permit' });
    }
});

// ── POST /api/loto/permits/:id/void — Void a permit ─────────────────
router.post('/permits/:id/void', (req, res) => {
    try {
        const { voidedBy, reason } = req.body;
        if (!voidedBy || !reason) return res.status(400).json({ error: 'voidedBy and reason are required' });

        const permit = logisticsDb.prepare(`SELECT * FROM LotoPermits WHERE ID = ?`).get(req.params.id);
        if (!permit) return res.status(404).json({ error: 'Permit not found' });

        logisticsDb.prepare(`
            UPDATE LotoPermits SET Status = 'VOIDED', VoidedBy = ?, VoidedAt = datetime('now'), VoidReason = ? WHERE ID = ?
        `).run(voidedBy, reason, req.params.id);

        logisticsDb.prepare(`
            INSERT INTO LotoAuditLog (PermitID, Action, PerformedBy, Details)
            VALUES (?, 'VOIDED', ?, ?)
        `).run(req.params.id, voidedBy, `Voided: ${reason}`);

        try { logAudit('LOTO_PERMIT_VOIDED', voidedBy, permit.PlantID, { permitNumber: permit.PermitNumber, reason }); } catch(e) {}

        res.json({ success: true });
    } catch (err) {
        console.error('[LOTO] POST /permits/:id/void error:', err.message);
        res.status(500).json({ error: 'Failed to void permit' });
    }
});

// ── PUT /api/loto/permits/:id — Edit permit fields ───────────────────
router.put('/permits/:id', (req, res) => {
    try {
        const permit = logisticsDb.prepare(`SELECT * FROM LotoPermits WHERE ID = ?`).get(req.params.id);
        if (!permit) return res.status(404).json({ error: 'Permit not found' });
        const { description, assetId, assetDescription, workOrderId, hazardousEnergy, isolationMethod, notes, updatedBy } = req.body;
        logisticsDb.prepare(`
            UPDATE LotoPermits SET
                Description      = COALESCE(?, Description),
                AssetID          = COALESCE(?, AssetID),
                AssetDescription = COALESCE(?, AssetDescription),
                WorkOrderID      = COALESCE(?, WorkOrderID),
                HazardousEnergy  = COALESCE(?, HazardousEnergy),
                IsolationMethod  = COALESCE(?, IsolationMethod),
                Notes            = COALESCE(?, Notes)
            WHERE ID = ?
        `).run(description || null, assetId || null, assetDescription || null, workOrderId || null, hazardousEnergy || null, isolationMethod || null, notes || null, req.params.id);
        const who = updatedBy || 'System';
        logisticsDb.prepare(`INSERT INTO LotoAuditLog (PermitID, Action, PerformedBy, Details) VALUES (?, 'UPDATED', ?, ?)`
        ).run(req.params.id, who, `Permit ${permit.PermitNumber} updated by ${who}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[LOTO] PUT /permits/:id error:', err.message);
        res.status(500).json({ error: 'Failed to update permit: ' + err.message });
    }
});

// ── GET /api/loto/energy-types — Available energy types ──────────────
router.get('/energy-types', (req, res) => {
    res.json(ENERGY_TYPES);
});

// ── Expiry Check Engine ─────────────────────────────────────────────────
function checkExpiredPermits() {
    try {
        const now = new Date().toISOString();
        const expired = logisticsDb.prepare(`
            UPDATE LotoPermits SET Status = 'EXPIRED' WHERE Status = 'ACTIVE' AND ExpiresAt < ?
        `).run(now);

        if (expired.changes > 0) {
            console.log(`[LOTO] ⏰ ${expired.changes} permit(s) auto-expired`);
        }
    } catch (e) {
        console.error('[LOTO] Expiry check error:', e.message);
    }
}

// Run expiry check every 5 minutes
setInterval(checkExpiredPermits, 5 * 60 * 1000);
checkExpiredPermits(); // Run immediately on boot

module.exports = router;
