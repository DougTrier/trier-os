// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Safety Permits API (Hot Work, Confined Space, & More)
 * =========================================================================
 * Digital permit-to-work (PTW) system for hazardous operations.
 * Mounted at /api/safety-permits in server/index.js.
 * All data is stored in logistics_db (trier_logistics.db) via SafetyPermits
 * and related tables, so permits persist across all plant contexts.
 *
 * PERMIT TYPES: HOT_WORK, CONFINED_SPACE, EXCAVATION, ELECTRICAL,
 *   WORKING_AT_HEIGHTS, LINE_BREAKING, CRANE_RIGGING, CHEMICAL_HANDLING,
 *   RADIATION, ROOF_ACCESS, ENERGY_ISOLATION, CUSTOM
 *
 * ENDPOINTS:
 *   GET  /by-contractor/:id             Permits linked to a specific contractor
 *   GET  /permits                       List permits (filterable by plant/status/type)
 *   GET  /permits/:id                   Full permit with checklist, signatures, gas log
 *   POST /permits                       Create permit (auto-generates number + checklist)
 *   PUT  /permits/:id                   Update permit fields
 *   POST /permits/:id/checklist/:cid    Check/uncheck a checklist item
 *   POST /permits/:id/sign              Add a signature (ISSUER/ENTRANT/ATTENDANT/CLOSER)
 *   POST /permits/:id/gas-reading       Log atmospheric gas reading with alarm detection
 *   POST /permits/:id/close             Close permit (enforces fire watch + checklist)
 *   POST /permits/:id/void              Void permit with reason
 *   GET  /constants                     Return all enums and default checklist templates
 *
 * DEFAULT CHECKLISTS: Each permit type ships with a pre-populated OSHA/NFPA-compliant
 * checklist from the DEFAULT_CHECKLISTS constant. Hot Work = 14 items (35-ft clearance,
 * fire watch, egress). Confined Space = 18 items (O2/LEL/CO/H2S testing, rescue plan).
 * Excavation, Electrical, Working at Heights, etc. each have their own tailored lists.
 *
 * GAS ALARM THRESHOLDS (enforced in POST /:id/gas-reading):
 *   O2: must be 19.5%–23.5% | LEL: <10% | CO: <35 ppm | H2S: <10 ppm
 *   Out-of-range readings trigger a 'GAS_WARNING' audit log entry and console alert.
 *
 * FIRE WATCH ENFORCEMENT: Hot work permits require FireWatchRequired=1 by default.
 * Attempting to close without fireWatchComplete=true throws a 400 error.
 * Fire watch must remain 30+ minutes post-work (FireWatchDurationMin column).
 *
 * AUTO-EXPIRY ENGINE: A 5-minute interval (setInterval) runs checkExpiredSafetyPermits()
 * which batch-updates Status='EXPIRED' for all ACTIVE permits past their ExpiresAt time.
 * Default expiry: 4 hours for most permit types, 8 hours for CONFINED_SPACE.
 *
 * PERMIT NUMBER FORMAT: {PREFIX}-{PLANT3}-{YYMMDD}-{SEQ:3}
 *   e.g. HWP-JEF-260404-001 (Hot Work Permit, Demo Plant 1, April 4 2026, first of day)
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('../logistics_db');

// ── Initialize Safety Permit Tables ──────────────────────────────────────
function initSafetyPermitTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS SafetyPermits (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PermitNumber TEXT UNIQUE NOT NULL,
            PermitType TEXT NOT NULL DEFAULT 'HOT_WORK',
            PlantID TEXT NOT NULL,
            AssetID TEXT,
            AssetDescription TEXT,
            WorkOrderID TEXT,
            LotoPermitID INTEGER,
            Location TEXT NOT NULL,
            Description TEXT NOT NULL,
            IssuedBy TEXT NOT NULL,
            IssuedAt TEXT NOT NULL DEFAULT (datetime('now')),
            Status TEXT DEFAULT 'ACTIVE',
            ExpiresAt TEXT,
            ClosedBy TEXT,
            ClosedAt TEXT,
            VoidedBy TEXT,
            VoidedAt TEXT,
            VoidReason TEXT,
            Notes TEXT,

            /* Hot Work specific */
            HotWorkType TEXT,
            FireWatchRequired INTEGER DEFAULT 1,
            FireWatchDurationMin INTEGER DEFAULT 30,
            FireWatchAssignedTo TEXT,
            SprinklerSystemStatus TEXT DEFAULT 'ACTIVE',
            NearestFireExtinguisher TEXT,
            CombustiblesCleared INTEGER DEFAULT 0,
            FloorsCoveredProtected INTEGER DEFAULT 0,
            
            /* Confined Space specific */
            SpaceClassification TEXT DEFAULT 'PERMIT_REQUIRED',
            VentilationType TEXT,
            RescuePlanReviewed INTEGER DEFAULT 0,
            CommunicationMethod TEXT DEFAULT 'Voice',
            EntryPurpose TEXT,
            Attendant TEXT,
            EntrySupervisor TEXT,
            
            /* Gas Monitoring */
            InitialO2 REAL,
            InitialLEL REAL,
            InitialCO REAL,
            InitialH2S REAL,
            GasMonitorSerial TEXT,
            ContinuousMonitoring INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS SafetyPermitChecklist (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PermitID INTEGER NOT NULL,
            CheckItem TEXT NOT NULL,
            Category TEXT DEFAULT 'General',
            Required INTEGER DEFAULT 1,
            Checked INTEGER DEFAULT 0,
            CheckedBy TEXT,
            CheckedAt TEXT,
            Notes TEXT,
            SortOrder INTEGER DEFAULT 0,
            FOREIGN KEY (PermitID) REFERENCES SafetyPermits(ID)
        );

        CREATE TABLE IF NOT EXISTS SafetyPermitSignatures (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PermitID INTEGER NOT NULL,
            SignatureType TEXT NOT NULL,
            SignedBy TEXT NOT NULL,
            SignedAt TEXT NOT NULL DEFAULT (datetime('now')),
            Role TEXT,
            FOREIGN KEY (PermitID) REFERENCES SafetyPermits(ID)
        );

        CREATE TABLE IF NOT EXISTS SafetyPermitGasLog (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PermitID INTEGER NOT NULL,
            ReadingTime TEXT NOT NULL DEFAULT (datetime('now')),
            O2Level REAL,
            LELLevel REAL,
            COLevel REAL,
            H2SLevel REAL,
            ReadBy TEXT,
            Location TEXT,
            ActionTaken TEXT,
            FOREIGN KEY (PermitID) REFERENCES SafetyPermits(ID)
        );

        CREATE TABLE IF NOT EXISTS SafetyPermitAuditLog (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PermitID INTEGER,
            Action TEXT NOT NULL,
            PerformedBy TEXT NOT NULL,
            PerformedAt TEXT NOT NULL DEFAULT (datetime('now')),
            Details TEXT,
            FOREIGN KEY (PermitID) REFERENCES SafetyPermits(ID)
        );
    `);
    console.log('[SAFETY] Permit tables initialized');

    // Add contractor linkage columns (safe idempotent migration)
    try { logisticsDb.exec(`ALTER TABLE SafetyPermits ADD COLUMN ContractorID INTEGER REFERENCES contractors(ID)`); } catch (_) {}
    try { logisticsDb.exec(`ALTER TABLE SafetyPermits ADD COLUMN ContractorName TEXT`); } catch (_) {}
}

initSafetyPermitTables();

// ── Constants ───────────────────────────────────────────────────────────
const PERMIT_TYPES = [
    'HOT_WORK', 'CONFINED_SPACE', 'EXCAVATION', 'ELECTRICAL',
    'WORKING_AT_HEIGHTS', 'LINE_BREAKING', 'CRANE_RIGGING',
    'CHEMICAL_HANDLING', 'RADIATION', 'ROOF_ACCESS',
    'ENERGY_ISOLATION', 'CUSTOM'
];

const HOT_WORK_TYPES = [
    'Welding (Arc)', 'Welding (MIG/TIG)', 'Welding (Stick)', 
    'Torch Cutting', 'Brazing/Soldering', 'Grinding/Cutting Disc',
    'Heat Gun', 'Thawing Pipes', 'Roofing/Tar Kettle', 'Other'
];

const SPACE_CLASSIFICATIONS = [
    'PERMIT_REQUIRED', 'NON_PERMIT', 'ALTERNATE_ENTRY', 'RECLASSIFIED'
];

const VENTILATION_TYPES = [
    'Natural', 'Mechanical (Blower)', 'Mechanical (Exhaust)', 
    'Continuous Forced Air', 'None Required'
];

// Default checklists per permit type
const DEFAULT_CHECKLISTS = {
    HOT_WORK: [
        { item: 'Area inspected — all combustibles removed or protected (35 ft radius)', category: 'Pre-Work', required: true },
        { item: 'Floors swept clean of debris, dust, and flammable residue', category: 'Pre-Work', required: true },
        { item: 'Openings in floors/walls covered to prevent spark travel', category: 'Pre-Work', required: true },
        { item: 'Fire-resistant blankets/shields in place', category: 'Pre-Work', required: true },
        { item: 'Sprinkler system operational (or fire watch compensating)', category: 'Pre-Work', required: true },
        { item: 'Fire extinguisher staged within 25 feet', category: 'Pre-Work', required: true },
        { item: 'Smoke/fire detection notified if area will produce smoke', category: 'Pre-Work', required: false },
        { item: 'Adjacent areas checked — no flammable vapors/materials', category: 'Pre-Work', required: true },
        { item: 'Equipment grounded and in good condition', category: 'Equipment', required: true },
        { item: 'PPE verified: welding helmet, gloves, fire-resistant clothing', category: 'PPE', required: true },
        { item: 'Fire watch assigned and briefed on duties', category: 'Fire Watch', required: true },
        { item: 'Fire watch will remain 30+ minutes after work completion', category: 'Fire Watch', required: true },
        { item: 'Emergency procedures reviewed with all workers', category: 'Emergency', required: true },
        { item: 'Nearest fire alarm pull station identified', category: 'Emergency', required: true },
    ],
    CONFINED_SPACE: [
        { item: 'Space has been identified and classified', category: 'Pre-Entry', required: true },
        { item: 'All energy sources isolated — LOTO procedures completed', category: 'Pre-Entry', required: true },
        { item: 'Space has been cleaned/purged of hazardous materials', category: 'Pre-Entry', required: true },
        { item: 'Atmospheric testing completed (O2, LEL, CO, H2S)', category: 'Atmosphere', required: true },
        { item: 'O2 level between 19.5% and 23.5%', category: 'Atmosphere', required: true },
        { item: 'LEL below 10% of Lower Explosive Limit', category: 'Atmosphere', required: true },
        { item: 'CO level below 35 ppm', category: 'Atmosphere', required: true },
        { item: 'H2S level below 10 ppm', category: 'Atmosphere', required: true },
        { item: 'Continuous air monitoring in place', category: 'Atmosphere', required: true },
        { item: 'Ventilation equipment set up and operational', category: 'Ventilation', required: true },
        { item: 'Entry/exit route established and clear', category: 'Access', required: true },
        { item: 'Communication method established (voice/radio/signal line)', category: 'Communication', required: true },
        { item: 'Rescue equipment staged (tripod, harness, lifeline)', category: 'Rescue', required: true },
        { item: 'Rescue team notified and on standby', category: 'Rescue', required: true },
        { item: 'Attendant assigned — will not leave post', category: 'Personnel', required: true },
        { item: 'All entrants trained on confined space hazards', category: 'Personnel', required: true },
        { item: 'PPE verified: harness, hard hat, gloves, respirator if needed', category: 'PPE', required: true },
        { item: 'Emergency procedures reviewed with all personnel', category: 'Emergency', required: true },
    ],
    EXCAVATION: [
        { item: 'Underground utilities located and marked (call 811)', category: 'Pre-Work', required: true },
        { item: 'Soil type classified (Type A, B, C, or combination)', category: 'Pre-Work', required: true },
        { item: 'Competent person designated for excavation', category: 'Personnel', required: true },
        { item: 'Shoring, sloping, or trench box in place (>5 ft depth)', category: 'Protection', required: true },
        { item: 'Spoils placed at least 2 feet from edge of excavation', category: 'Protection', required: true },
        { item: 'Means of egress provided (ladder/ramp) within 25 feet', category: 'Access', required: true },
        { item: 'Barricades and warning signs in place', category: 'Access', required: true },
        { item: 'Atmospheric testing completed if >4 ft deep', category: 'Atmosphere', required: true },
        { item: 'Water removal equipment available if needed', category: 'Equipment', required: false },
        { item: 'PPE verified: hard hat, safety vest, steel-toe boots', category: 'PPE', required: true },
        { item: 'Emergency rescue plan reviewed', category: 'Emergency', required: true },
    ],
    ELECTRICAL: [
        { item: 'Electrical system de-energized and LOTO applied', category: 'Isolation', required: true },
        { item: 'Zero energy verification performed (test before touch)', category: 'Isolation', required: true },
        { item: 'Qualified electrical worker assigned', category: 'Personnel', required: true },
        { item: 'Arc flash hazard assessment completed', category: 'Hazard Analysis', required: true },
        { item: 'Arc flash PPE level determined and worn', category: 'PPE', required: true },
        { item: 'Insulated tools being used', category: 'Equipment', required: true },
        { item: 'Rubber insulating gloves and leather protectors verified', category: 'PPE', required: true },
        { item: 'Barriers/barricades around work area', category: 'Access', required: true },
        { item: 'Secondary worker/safety watch present if >50V', category: 'Personnel', required: true },
        { item: 'Emergency response plan reviewed — AED location known', category: 'Emergency', required: true },
    ],
    WORKING_AT_HEIGHTS: [
        { item: 'Fall protection plan reviewed for this task', category: 'Pre-Work', required: true },
        { item: 'Fall protection equipment inspected (harness, lanyard, SRL)', category: 'Equipment', required: true },
        { item: 'Anchor points identified and rated (5,000 lbs min)', category: 'Equipment', required: true },
        { item: 'Guardrails/hole covers in place where applicable', category: 'Protection', required: true },
        { item: 'Scaffolding inspected by competent person (if used)', category: 'Equipment', required: false },
        { item: 'Ladder secured and extends 3 ft above landing', category: 'Equipment', required: false },
        { item: 'Area below barricaded and warning signs posted', category: 'Access', required: true },
        { item: 'Tools secured to prevent dropped objects', category: 'Equipment', required: true },
        { item: 'Weather conditions assessed (wind, rain, ice)', category: 'Pre-Work', required: true },
        { item: 'Rescue plan established — how to retrieve a fallen worker', category: 'Emergency', required: true },
        { item: 'PPE verified: harness, hard hat, non-slip footwear', category: 'PPE', required: true },
    ],
    LINE_BREAKING: [
        { item: 'Line identified and contents verified', category: 'Pre-Work', required: true },
        { item: 'Line drained, depressurized, and purged', category: 'Isolation', required: true },
        { item: 'Double block and bleed or blind/blank installed', category: 'Isolation', required: true },
        { item: 'Chemical hazards identified (SDS reviewed)', category: 'Hazard Analysis', required: true },
        { item: 'Spill containment in place', category: 'Protection', required: true },
        { item: 'Atmospheric monitoring for toxic/flammable vapors', category: 'Atmosphere', required: true },
        { item: 'LOTO applied to all energy sources', category: 'Isolation', required: true },
        { item: 'PPE verified: face shield, chemical-resistant gloves, apron', category: 'PPE', required: true },
        { item: 'Emergency eyewash/shower location identified', category: 'Emergency', required: true },
    ],
    CRANE_RIGGING: [
        { item: 'Crane inspected — annual and daily pre-use', category: 'Equipment', required: true },
        { item: 'Load weight verified — within crane capacity', category: 'Pre-Lift', required: true },
        { item: 'Lift plan reviewed (critical lift requires engineered plan)', category: 'Pre-Lift', required: true },
        { item: 'Rigging equipment inspected (slings, shackles, hooks)', category: 'Equipment', required: true },
        { item: 'Outriggers/stabilizers fully extended and on pads', category: 'Equipment', required: true },
        { item: 'Overhead power line clearance verified (10+ ft for <50kV)', category: 'Hazard Analysis', required: true },
        { item: 'Signal person designated and hand signals reviewed', category: 'Personnel', required: true },
        { item: 'Exclusion zone barricaded — no personnel under load', category: 'Access', required: true },
        { item: 'Wind speed verified below crane rated limit', category: 'Pre-Lift', required: true },
        { item: 'Tag lines attached to control load', category: 'Equipment', required: true },
    ],
    CHEMICAL_HANDLING: [
        { item: 'Safety Data Sheet (SDS) reviewed for all chemicals', category: 'Hazard Analysis', required: true },
        { item: 'Chemical compatibility verified', category: 'Hazard Analysis', required: true },
        { item: 'Proper containers and labeling in place', category: 'Storage', required: true },
        { item: 'Secondary containment available', category: 'Protection', required: true },
        { item: 'Ventilation adequate for chemical vapors', category: 'Ventilation', required: true },
        { item: 'Spill kit staged nearby', category: 'Emergency', required: true },
        { item: 'PPE verified per SDS: gloves, goggles, apron, respirator', category: 'PPE', required: true },
        { item: 'Emergency eyewash/shower within 10 seconds travel', category: 'Emergency', required: true },
        { item: 'Workers trained on chemical hazards and emergency response', category: 'Personnel', required: true },
    ],
    RADIATION: [
        { item: 'Radiation survey completed and documented', category: 'Pre-Work', required: true },
        { item: 'Dosimetry (TLD/badge) worn by all workers', category: 'Monitoring', required: true },
        { item: 'Radiation area posted with proper signage', category: 'Access', required: true },
        { item: 'Shielding in place and verified', category: 'Protection', required: true },
        { item: 'Time, distance, shielding (ALARA) plan documented', category: 'Pre-Work', required: true },
        { item: 'Radiation Safety Officer notified', category: 'Personnel', required: true },
        { item: 'Contamination control measures in place', category: 'Protection', required: true },
        { item: 'Emergency exposure procedures reviewed', category: 'Emergency', required: true },
    ],
    ROOF_ACCESS: [
        { item: 'Roof access authorized by facility management', category: 'Pre-Work', required: true },
        { item: 'Roof condition assessed (wet, icy, damaged areas)', category: 'Pre-Work', required: true },
        { item: 'Fall protection in place — guardrails or harness/anchor', category: 'Protection', required: true },
        { item: 'Skylights and openings covered or guarded', category: 'Protection', required: true },
        { item: 'Ladder secured at roof access point', category: 'Access', required: true },
        { item: 'Weather conditions checked (wind, lightning, rain)', category: 'Pre-Work', required: true },
        { item: 'Tools/materials secured to prevent falling objects', category: 'Equipment', required: true },
        { item: 'Communication plan established', category: 'Personnel', required: true },
        { item: 'PPE verified: harness, hard hat, non-slip footwear', category: 'PPE', required: true },
    ],
    ENERGY_ISOLATION: [
        { item: 'All energy sources identified (electrical, mechanical, hydraulic, pneumatic, thermal, chemical, gravitational)', category: 'Pre-Work', required: true },
        { item: 'Written LOTO procedure specific to this equipment', category: 'Pre-Work', required: true },
        { item: 'All affected/authorized employees notified', category: 'Personnel', required: true },
        { item: 'Equipment shut down using normal procedures', category: 'Isolation', required: true },
        { item: 'Isolation devices (locks, tags, blanks) applied', category: 'Isolation', required: true },
        { item: 'Stored energy dissipated/restrained', category: 'Isolation', required: true },
        { item: 'Zero energy verification performed (try to start)', category: 'Isolation', required: true },
        { item: 'Each authorized worker applied personal lock and tag', category: 'Isolation', required: true },
        { item: 'Group lockout coordinator designated (if multi-crew)', category: 'Personnel', required: false },
    ],
    CUSTOM: [
        { item: 'Hazard assessment completed for this task', category: 'Pre-Work', required: true },
        { item: 'Required PPE identified and available', category: 'PPE', required: true },
        { item: 'Workers trained on specific hazards', category: 'Personnel', required: true },
        { item: 'Emergency response plan reviewed', category: 'Emergency', required: true },
        { item: 'Area secured and warning signs posted', category: 'Access', required: true },
    ]
};

// ── Helper: Generate permit number ──────────────────────────────────────
function generatePermitNumber(plantId, type) {
    const date = new Date();
    const yy = date.getFullYear().toString().slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const prefixMap = {
        HOT_WORK: 'HWP', CONFINED_SPACE: 'CSE', EXCAVATION: 'EXC',
        ELECTRICAL: 'ELE', WORKING_AT_HEIGHTS: 'WAH', LINE_BREAKING: 'LBK',
        CRANE_RIGGING: 'CRG', CHEMICAL_HANDLING: 'CHM', RADIATION: 'RAD',
        ROOF_ACCESS: 'ROF', ENERGY_ISOLATION: 'EIS', CUSTOM: 'CUS'
    };
    const prefix = prefixMap[type] || 'SPT';
    const seq = logisticsDb.prepare(
        `SELECT COUNT(*) as c FROM SafetyPermits WHERE PlantID = ? AND PermitType = ? AND IssuedAt >= date('now', 'start of day')`
    ).get(plantId, type).c + 1;
    const plant = (plantId || 'XX').substring(0, 3).toUpperCase();
    return `${prefix}-${plant}-${yy}${mm}${dd}-${String(seq).padStart(3, '0')}`;
}

// ── GET /api/safety-permits/by-contractor/:id — Permits linked to a contractor ──
router.get('/by-contractor/:contractorId', (req, res) => {
    try {
        const permits = logisticsDb.prepare(`
            SELECT ID, PermitNumber, PermitType, Location, Status, IssuedAt, ExpiresAt, PlantID, IssuedBy
            FROM SafetyPermits WHERE ContractorID = ? ORDER BY IssuedAt DESC LIMIT 50
        `).all(req.params.contractorId);
        res.json({ permits });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/safety-permits/permits — List permits ────────────────────
router.get('/permits', (req, res) => {
    try {
        const { plant, status, type, limit } = req.query;
        let sql = `SELECT * FROM SafetyPermits WHERE 1=1`;
        const params = [];

        if (plant && plant !== 'all_sites') { sql += ` AND PlantID = ?`; params.push(plant); }
        if (status) { sql += ` AND UPPER(Status) = ?`; params.push(status.toUpperCase()); }
        if (type) { sql += ` AND REPLACE(UPPER(PermitType), ' ', '_') = ?`; params.push(type.replace(/ /g, '_').toUpperCase()); }

        sql += ` ORDER BY IssuedAt DESC LIMIT ?`;
        params.push(parseInt(limit) || 100);

        const permits = logisticsDb.prepare(sql).all(...params);

        // Enrich with checklist/signature counts
        const enriched = permits.map(p => {
            const checklist = logisticsDb.prepare(
                `SELECT COUNT(*) as total, SUM(CASE WHEN Checked=1 THEN 1 ELSE 0 END) as done FROM SafetyPermitChecklist WHERE PermitID = ?`
            ).get(p.ID);
            const sigs = logisticsDb.prepare(
                `SELECT COUNT(*) as c FROM SafetyPermitSignatures WHERE PermitID = ?`
            ).get(p.ID);
            return {
                ...p,
                checklistTotal: checklist.total || 0,
                checklistDone: checklist.done || 0,
                signatures: sigs.c || 0
            };
        });

        // Summary stats
        const stats = {
            active: logisticsDb.prepare(`SELECT COUNT(*) as c FROM SafetyPermits WHERE UPPER(Status) = 'ACTIVE'`).get().c,
            closed: logisticsDb.prepare(`SELECT COUNT(*) as c FROM SafetyPermits WHERE UPPER(Status) = 'CLOSED'`).get().c,
            voided: logisticsDb.prepare(`SELECT COUNT(*) as c FROM SafetyPermits WHERE UPPER(Status) = 'VOIDED'`).get().c,
            expired: logisticsDb.prepare(`SELECT COUNT(*) as c FROM SafetyPermits WHERE UPPER(Status) = 'EXPIRED'`).get().c,
            hotWork: logisticsDb.prepare(`SELECT COUNT(*) as c FROM SafetyPermits WHERE REPLACE(UPPER(PermitType), ' ', '_') = 'HOT_WORK' AND UPPER(Status) = 'ACTIVE'`).get().c,
            confinedSpace: logisticsDb.prepare(`SELECT COUNT(*) as c FROM SafetyPermits WHERE REPLACE(UPPER(PermitType), ' ', '_') = 'CONFINED_SPACE' AND UPPER(Status) = 'ACTIVE'`).get().c,
        };

        res.json({ permits: enriched, stats });
    } catch (err) {
        console.error('[SAFETY] GET /permits error:', err.message);
        res.status(500).json({ error: 'Failed to fetch safety permits' });
    }
});

// ── GET /api/safety-permits/permits/:id — Full permit detail ─────────
router.get('/permits/:id', (req, res) => {
    try {
        const permit = logisticsDb.prepare(`SELECT * FROM SafetyPermits WHERE ID = ?`).get(req.params.id);
        if (!permit) return res.status(404).json({ error: 'Permit not found' });

        const checklist = logisticsDb.prepare(
            `SELECT * FROM SafetyPermitChecklist WHERE PermitID = ? ORDER BY SortOrder, ID`
        ).all(req.params.id);

        const signatures = logisticsDb.prepare(
            `SELECT * FROM SafetyPermitSignatures WHERE PermitID = ? ORDER BY SignedAt`
        ).all(req.params.id);

        const gasLog = logisticsDb.prepare(
            `SELECT * FROM SafetyPermitGasLog WHERE PermitID = ? ORDER BY ReadingTime DESC`
        ).all(req.params.id);

        const auditLog = logisticsDb.prepare(
            `SELECT * FROM SafetyPermitAuditLog WHERE PermitID = ? ORDER BY PerformedAt DESC`
        ).all(req.params.id);

        res.json({ permit, checklist, signatures, gasLog, auditLog });
    } catch (err) {
        console.error('[SAFETY] GET /permits/:id error:', err.message);
        res.status(500).json({ error: 'Failed to fetch permit details' });
    }
});

// ── POST /api/safety-permits/permits — Create a new permit ───────────
router.post('/permits', (req, res) => {
    try {
        const {
            permitType, plantId, assetId, assetDescription, workOrderId, lotoPermitId,
            location, description, issuedBy, expiresInHours, notes,
            // Contractor linkage
            contractorId, contractorName,
            // Hot work fields
            hotWorkType, fireWatchRequired, fireWatchDurationMin, fireWatchAssignedTo,
            sprinklerSystemStatus, nearestFireExtinguisher, combustiblesCleared, floorsCoveredProtected,
            // Confined space fields
            spaceClassification, ventilationType, rescuePlanReviewed, communicationMethod,
            entryPurpose, attendant, entrySupervisor,
            // Gas monitoring
            initialO2, initialLEL, initialCO, initialH2S, gasMonitorSerial, continuousMonitoring
        } = req.body;

        if (!plantId || !location || !description || !issuedBy) {
            return res.status(400).json({ error: 'plantId, location, description, and issuedBy are required' });
        }

        const type = (permitType || 'HOT_WORK').toUpperCase();
        // Accept known types AND custom user-defined types
        // No strict validation — if they typed it, they need it

        const permitNumber = generatePermitNumber(plantId, type);
        const hours = parseInt(expiresInHours) || (type === 'CONFINED_SPACE' ? 8 : 4);
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

        const result = logisticsDb.prepare(`
            INSERT INTO SafetyPermits (
                PermitNumber, PermitType, PlantID, AssetID, AssetDescription, WorkOrderID, LotoPermitID,
                Location, Description, IssuedBy, ExpiresAt, Notes,
                ContractorID, ContractorName,
                HotWorkType, FireWatchRequired, FireWatchDurationMin, FireWatchAssignedTo,
                SprinklerSystemStatus, NearestFireExtinguisher, CombustiblesCleared, FloorsCoveredProtected,
                SpaceClassification, VentilationType, RescuePlanReviewed, CommunicationMethod,
                EntryPurpose, Attendant, EntrySupervisor,
                InitialO2, InitialLEL, InitialCO, InitialH2S, GasMonitorSerial, ContinuousMonitoring
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            permitNumber, type, plantId, assetId || null, assetDescription || null,
            workOrderId || null, lotoPermitId || null,
            location, description, issuedBy, expiresAt, notes || null,
            contractorId || null, contractorName || null,
            hotWorkType || null, fireWatchRequired ? 1 : 0, fireWatchDurationMin || 30,
            fireWatchAssignedTo || null, sprinklerSystemStatus || 'ACTIVE',
            nearestFireExtinguisher || null, combustiblesCleared ? 1 : 0, floorsCoveredProtected ? 1 : 0,
            spaceClassification || 'PERMIT_REQUIRED', ventilationType || null,
            rescuePlanReviewed ? 1 : 0, communicationMethod || 'Voice',
            entryPurpose || null, attendant || null, entrySupervisor || null,
            initialO2 || null, initialLEL || null, initialCO || null, initialH2S || null,
            gasMonitorSerial || null, continuousMonitoring ? 1 : 0
        );

        const permitId = result.lastInsertRowid;

        // Auto-populate default checklist
        const defaultItems = DEFAULT_CHECKLISTS[type] || [];
        const insCheck = logisticsDb.prepare(`
            INSERT INTO SafetyPermitChecklist (PermitID, CheckItem, Category, Required, SortOrder)
            VALUES (?, ?, ?, ?, ?)
        `);
        defaultItems.forEach((item, i) => {
            insCheck.run(permitId, item.item, item.category, item.required ? 1 : 0, i + 1);
        });

        // Add issuer signature
        logisticsDb.prepare(`
            INSERT INTO SafetyPermitSignatures (PermitID, SignatureType, SignedBy, Role)
            VALUES (?, 'ISSUER', ?, 'Permit Issuer')
        `).run(permitId, issuedBy);

        // Audit log
        logisticsDb.prepare(`
            INSERT INTO SafetyPermitAuditLog (PermitID, Action, PerformedBy, Details)
            VALUES (?, 'CREATED', ?, ?)
        `).run(permitId, issuedBy, `${type} permit ${permitNumber} created at ${location}. Expires: ${expiresAt}`);

        try { logAudit('SAFETY_PERMIT_CREATED', issuedBy, plantId, { permitNumber, type, location, description }); } catch(e) {}

        console.log(`[SAFETY] ✅ ${type} permit ${permitNumber} created by ${issuedBy} at ${plantId}`);
        res.status(201).json({ success: true, permitId, permitNumber, type, checklistItems: defaultItems.length });
    } catch (err) {
        console.error('[SAFETY] POST /permits error:', err.message);
        res.status(500).json({ error: 'Failed to create permit: ' + err.message });
    }
});

// ── PUT /api/safety-permits/permits/:id — Update an existing permit ──
router.put('/permits/:id', (req, res) => {
    try {
        const permit = logisticsDb.prepare(`SELECT * FROM SafetyPermits WHERE ID = ?`).get(req.params.id);
        if (!permit) return res.status(404).json({ error: 'Permit not found' });

        const { location, description, notes, hotWorkType, fireWatchAssignedTo,
                attendant, entrySupervisor, ventilationType, communicationMethod,
                contractorId, contractorName } = req.body;

        logisticsDb.prepare(`
            UPDATE SafetyPermits SET
                Location = COALESCE(?, Location),
                Description = COALESCE(?, Description),
                Notes = COALESCE(?, Notes),
                HotWorkType = COALESCE(?, HotWorkType),
                FireWatchAssignedTo = COALESCE(?, FireWatchAssignedTo),
                Attendant = COALESCE(?, Attendant),
                EntrySupervisor = COALESCE(?, EntrySupervisor),
                VentilationType = COALESCE(?, VentilationType),
                CommunicationMethod = COALESCE(?, CommunicationMethod),
                ContractorID = COALESCE(?, ContractorID),
                ContractorName = COALESCE(?, ContractorName)
            WHERE ID = ?
        `).run(location, description, notes, hotWorkType, fireWatchAssignedTo,
               attendant, entrySupervisor, ventilationType, communicationMethod,
               contractorId || null, contractorName || null, req.params.id);

        logisticsDb.prepare(`
            INSERT INTO SafetyPermitAuditLog (PermitID, Action, PerformedBy, Details)
            VALUES (?, 'UPDATED', ?, 'Permit details updated')
        `).run(req.params.id, req.body.updatedBy || 'System');

        res.json({ success: true });
    } catch (err) {
        console.error('[SAFETY] PUT /permits/:id error:', err.message);
        res.status(500).json({ error: 'Failed to update permit' });
    }
});

// ── POST /api/safety-permits/permits/:id/checklist/:checkId — Check/uncheck item ─
router.post('/permits/:id/checklist/:checkId', (req, res) => {
    try {
        const { checked, checkedBy, notes } = req.body;
        if (checkedBy === undefined) return res.status(400).json({ error: 'checkedBy is required' });

        const permit = logisticsDb.prepare(`SELECT * FROM SafetyPermits WHERE ID = ?`).get(req.params.id);
        if (!permit || permit.Status !== 'ACTIVE') return res.status(400).json({ error: 'Permit not found or not active' });

        logisticsDb.prepare(`
            UPDATE SafetyPermitChecklist SET Checked = ?, CheckedBy = ?, CheckedAt = datetime('now'), Notes = COALESCE(?, Notes)
            WHERE ID = ? AND PermitID = ?
        `).run(checked ? 1 : 0, checkedBy, notes || null, req.params.checkId, req.params.id);

        logisticsDb.prepare(`
            INSERT INTO SafetyPermitAuditLog (PermitID, Action, PerformedBy, Details)
            VALUES (?, ?, ?, ?)
        `).run(req.params.id, checked ? 'CHECK_COMPLETED' : 'CHECK_UNCHECKED', checkedBy, `Checklist item ${req.params.checkId} ${checked ? 'completed' : 'unchecked'}`);

        res.json({ success: true });
    } catch (err) {
        console.error('[SAFETY] POST checklist error:', err.message);
        res.status(500).json({ error: 'Failed to update checklist item' });
    }
});

// ── POST /api/safety-permits/permits/:id/sign — Add a signature ──────
router.post('/permits/:id/sign', (req, res) => {
    try {
        const { signedBy, signatureType, role } = req.body;
        if (!signedBy) return res.status(400).json({ error: 'signedBy is required' });

        const permit = logisticsDb.prepare(`SELECT * FROM SafetyPermits WHERE ID = ?`).get(req.params.id);
        if (!permit) return res.status(404).json({ error: 'Permit not found' });
        if (permit.Status !== 'ACTIVE') return res.status(400).json({ error: 'Can only sign active permits' });

        logisticsDb.prepare(`
            INSERT INTO SafetyPermitSignatures (PermitID, SignatureType, SignedBy, Role)
            VALUES (?, ?, ?, ?)
        `).run(req.params.id, signatureType || 'WORKER', signedBy, role || 'Worker');

        logisticsDb.prepare(`
            INSERT INTO SafetyPermitAuditLog (PermitID, Action, PerformedBy, Details)
            VALUES (?, 'SIGNED', ?, ?)
        `).run(req.params.id, signedBy, `${signatureType || 'WORKER'} signature by ${signedBy} (${role || 'Worker'})`);

        res.json({ success: true });
    } catch (err) {
        console.error('[SAFETY] POST sign error:', err.message);
        res.status(500).json({ error: 'Failed to add signature' });
    }
});

// ── POST /api/safety-permits/permits/:id/gas-reading — Log gas reading ─
router.post('/permits/:id/gas-reading', (req, res) => {
    try {
        const { o2, lel, co, h2s, readBy, location, actionTaken } = req.body;
        if (!readBy) return res.status(400).json({ error: 'readBy is required' });

        const permit = logisticsDb.prepare(`SELECT * FROM SafetyPermits WHERE ID = ?`).get(req.params.id);
        if (!permit) return res.status(404).json({ error: 'Permit not found' });

        logisticsDb.prepare(`
            INSERT INTO SafetyPermitGasLog (PermitID, O2Level, LELLevel, COLevel, H2SLevel, ReadBy, Location, ActionTaken)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(req.params.id, o2 || null, lel || null, co || null, h2s || null, readBy, location || null, actionTaken || null);

        // Check for dangerous readings and log warning
        let warnings = [];
        if (o2 !== undefined && (o2 < 19.5 || o2 > 23.5)) warnings.push(`O2 ${o2}% OUT OF RANGE`);
        if (lel !== undefined && lel >= 10) warnings.push(`LEL ${lel}% ABOVE SAFE LIMIT`);
        if (co !== undefined && co >= 35) warnings.push(`CO ${co}ppm ABOVE SAFE LIMIT`);
        if (h2s !== undefined && h2s >= 10) warnings.push(`H2S ${h2s}ppm ABOVE SAFE LIMIT`);

        if (warnings.length > 0) {
            logisticsDb.prepare(`
                INSERT INTO SafetyPermitAuditLog (PermitID, Action, PerformedBy, Details)
                VALUES (?, 'GAS_WARNING', ?, ?)
            `).run(req.params.id, readBy, `⚠️ DANGEROUS READING: ${warnings.join(', ')}`);
            console.log(`[SAFETY] ⚠️ Permit ${permit.PermitNumber}: ${warnings.join(', ')}`);
        }

        logisticsDb.prepare(`
            INSERT INTO SafetyPermitAuditLog (PermitID, Action, PerformedBy, Details)
            VALUES (?, 'GAS_READING', ?, ?)
        `).run(req.params.id, readBy, `O2:${o2 || '-'}% LEL:${lel || '-'}% CO:${co || '-'}ppm H2S:${h2s || '-'}ppm`);

        res.json({ success: true, warnings });
    } catch (err) {
        console.error('[SAFETY] POST gas-reading error:', err.message);
        res.status(500).json({ error: 'Failed to log gas reading' });
    }
});

// ── POST /api/safety-permits/permits/:id/close — Close a permit ──────
router.post('/permits/:id/close', (req, res) => {
    try {
        const { closedBy, fireWatchComplete } = req.body;
        if (!closedBy) return res.status(400).json({ error: 'closedBy is required' });

        const permit = logisticsDb.prepare(`SELECT * FROM SafetyPermits WHERE ID = ?`).get(req.params.id);
        if (!permit) return res.status(404).json({ error: 'Permit not found' });
        if (permit.Status !== 'ACTIVE') return res.status(400).json({ error: 'Only active permits can be closed' });

        // Check if fire watch requirement is met for hot work
        if (permit.PermitType === 'HOT_WORK' && permit.FireWatchRequired && !fireWatchComplete) {
            return res.status(400).json({ error: 'Fire watch period must be completed before closing a hot work permit' });
        }

        // Check mandatory checklist items
        const unchecked = logisticsDb.prepare(
            `SELECT COUNT(*) as c FROM SafetyPermitChecklist WHERE PermitID = ? AND Required = 1 AND Checked = 0`
        ).get(req.params.id);

        if (unchecked.c > 0) {
            return res.status(400).json({ error: `${unchecked.c} required checklist item(s) not completed` });
        }

        logisticsDb.prepare(`
            UPDATE SafetyPermits SET Status = 'CLOSED', ClosedBy = ?, ClosedAt = datetime('now') WHERE ID = ?
        `).run(closedBy, req.params.id);

        logisticsDb.prepare(`
            INSERT INTO SafetyPermitSignatures (PermitID, SignatureType, SignedBy, Role)
            VALUES (?, 'CLOSER', ?, 'Permit Closer')
        `).run(req.params.id, closedBy);

        logisticsDb.prepare(`
            INSERT INTO SafetyPermitAuditLog (PermitID, Action, PerformedBy, Details)
            VALUES (?, 'CLOSED', ?, ?)
        `).run(req.params.id, closedBy, `Permit ${permit.PermitNumber} closed. All conditions satisfied.`);

        try { logAudit('SAFETY_PERMIT_CLOSED', closedBy, permit.PlantID, { permitNumber: permit.PermitNumber, type: permit.PermitType }); } catch(e) {}

        console.log(`[SAFETY] ✅ Permit ${permit.PermitNumber} closed by ${closedBy}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[SAFETY] POST close error:', err.message);
        res.status(500).json({ error: 'Failed to close permit' });
    }
});

// ── POST /api/safety-permits/permits/:id/void — Void a permit ────────
router.post('/permits/:id/void', (req, res) => {
    try {
        const { voidedBy, reason } = req.body;
        if (!voidedBy || !reason) return res.status(400).json({ error: 'voidedBy and reason are required' });

        const permit = logisticsDb.prepare(`SELECT * FROM SafetyPermits WHERE ID = ?`).get(req.params.id);
        if (!permit) return res.status(404).json({ error: 'Permit not found' });

        logisticsDb.prepare(`
            UPDATE SafetyPermits SET Status = 'VOIDED', VoidedBy = ?, VoidedAt = datetime('now'), VoidReason = ? WHERE ID = ?
        `).run(voidedBy, reason, req.params.id);

        logisticsDb.prepare(`
            INSERT INTO SafetyPermitAuditLog (PermitID, Action, PerformedBy, Details)
            VALUES (?, 'VOIDED', ?, ?)
        `).run(req.params.id, voidedBy, `Voided: ${reason}`);

        try { logAudit('SAFETY_PERMIT_VOIDED', voidedBy, permit.PlantID, { permitNumber: permit.PermitNumber, reason }); } catch(e) {}

        console.log(`[SAFETY] ❌ Permit ${permit.PermitNumber} voided by ${voidedBy}: ${reason}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[SAFETY] POST void error:', err.message);
        res.status(500).json({ error: 'Failed to void permit' });
    }
});

// ── GET /api/safety-permits/constants — Return enums/constants ───────
router.get('/constants', (req, res) => {
    res.json({
        permitTypes: PERMIT_TYPES,
        hotWorkTypes: HOT_WORK_TYPES,
        spaceClassifications: SPACE_CLASSIFICATIONS,
        ventilationTypes: VENTILATION_TYPES,
        defaultChecklists: DEFAULT_CHECKLISTS
    });
});

// ── Expiry Check Engine ─────────────────────────────────────────────────
function checkExpiredSafetyPermits() {
    try {
        const now = new Date().toISOString();
        const expired = logisticsDb.prepare(`
            UPDATE SafetyPermits SET Status = 'EXPIRED' WHERE Status = 'ACTIVE' AND ExpiresAt < ?
        `).run(now);

        if (expired.changes > 0) {
            console.log(`[SAFETY] ⏰ ${expired.changes} safety permit(s) auto-expired`);
        }
    } catch (e) {
        console.error('[SAFETY] Expiry check error:', e.message);
    }
}

// Run expiry check every 5 minutes
setInterval(checkExpiredSafetyPermits, 5 * 60 * 1000);
checkExpiredSafetyPermits();

module.exports = router;
