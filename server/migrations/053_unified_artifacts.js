// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 053 — Unified artifact intelligence layer
//
// Replaces the fragmented CatalogTwins / digital_twin_schematics / PeerTwins
// approach with a single canonical artifact table per scope:
//
//   mfg_master.db   → catalog_artifacts   (OEM/enterprise-level, entity_type = equipment_type | part)
//   per-plant DBs   → plant_artifacts     (plant-level, entity_type = asset | part | location)
//
// artifact_type:  twin | cad | vector_drawing | schematic | photo | manual | nameplate | live_data
// artifact_role:  reference (CAD, manuals) | operational (schematics, P&IDs) | analytical (twins, telemetry)
//
// Existing data:
//   CatalogTwins rows → seeded into catalog_artifacts (SubmodelType maps to artifact_type + role)
//   digital_twin_schematics rows → seeded into plant_artifacts

'use strict';

const path     = require('path');
const Database = require('better-sqlite3');
const fs       = require('fs');

// SubmodelType → artifact_type + role
const SUBMODEL_MAP = {
    Geometry:      { artifact_type: 'twin',           role: 'analytical' },
    Documentation: { artifact_type: 'manual',         role: 'reference'  },
    Nameplate:     { artifact_type: 'nameplate',      role: 'reference'  },
    LiveData:      { artifact_type: 'live_data',      role: 'analytical' },
};

// TwinFormat → normalized format bucket
function normalizeFormat(fmt) {
    if (!fmt) return 'UNKNOWN';
    const f = fmt.toUpperCase();
    if (['STEP','STP','IGES','IGS'].includes(f)) return f === 'STP' ? 'STEP' : f === 'IGS' ? 'IGES' : f;
    return f;
}

// ─── catalog_artifacts in mfg_master.db ─────────────────────────────────────
function migrateGlobalCatalog() {
    const mfgPath = path.join(__dirname, '..', '..', 'data', 'mfg_master.db');
    const db = new Database(mfgPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS catalog_artifacts (
            ArtifactID      INTEGER PRIMARY KEY AUTOINCREMENT,
            EntityType      TEXT NOT NULL DEFAULT 'equipment_type',  -- equipment_type | part
            EntityID        TEXT NOT NULL,
            ArtifactType    TEXT NOT NULL,  -- twin|cad|vector_drawing|schematic|manual|nameplate|live_data|photo
            ArtifactRole    TEXT NOT NULL DEFAULT 'reference',       -- reference|operational|analytical
            Format          TEXT,           -- STEP|DXF|IFC|OBJ|STL|SVG|PDF|GLTF|IFC|...
            Source          TEXT,           -- oem_url|grabcad|traceparts|manual_upload|photogrammetry|peer
            FileURL         TEXT,
            PreviewURL      TEXT,
            MetadataJSON    TEXT DEFAULT '{}',
            LinksJSON       TEXT DEFAULT '{}',  -- { failure_mode, procedure, related_parts[] }
            Confidence      REAL DEFAULT 0.5,
            Verified        INTEGER DEFAULT 0,
            CreatedBy       TEXT DEFAULT 'system',
            CreatedAt       TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_ca_entity ON catalog_artifacts(EntityType, EntityID);
        CREATE INDEX IF NOT EXISTS idx_ca_type   ON catalog_artifacts(ArtifactType);
        CREATE INDEX IF NOT EXISTS idx_ca_role   ON catalog_artifacts(ArtifactRole);
        CREATE INDEX IF NOT EXISTS idx_ca_format ON catalog_artifacts(Format);
    `);

    // Seed from CatalogTwins
    const twins = db.prepare('SELECT * FROM CatalogTwins').all();
    const insert = db.prepare(`
        INSERT OR IGNORE INTO catalog_artifacts
            (EntityType, EntityID, ArtifactType, ArtifactRole, Format, Source, FileURL, Confidence, Verified, CreatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const CAD_FORMATS = new Set(['STEP','STP','DXF','IFC','OBJ','STL','DWG','IGES','IGS']);

    let seeded = 0;
    db.transaction(() => {
        for (const t of twins) {
            const { artifact_type, role } = SUBMODEL_MAP[t.SubmodelType] || { artifact_type: 'twin', role: 'analytical' };
            const fmt = normalizeFormat(t.TwinFormat);

            // If format is a CAD format, classify as cad not twin
            const finalType = CAD_FORMATS.has(fmt) ? 'cad' : artifact_type;
            const finalRole = CAD_FORMATS.has(fmt) ? 'reference' : role;

            insert.run(
                'equipment_type',
                t.RefID,
                finalType,
                finalRole,
                fmt,
                t.Source,
                t.TwinURL,
                t.ConfScore,
                t.Validated,
                t.DiscoveredAt,
            );
            seeded++;
        }
    })();

    const total = db.prepare('SELECT COUNT(*) AS n FROM catalog_artifacts').get().n;
    console.log(`[053] catalog_artifacts: ${seeded} twins seeded → ${total} total artifacts in mfg_master.db`);
    db.close();
}

// ─── plant_artifacts in every plant DB ──────────────────────────────────────
function migratePlantDb(dbPath) {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS plant_artifacts (
            ArtifactID      INTEGER PRIMARY KEY AUTOINCREMENT,
            EntityType      TEXT NOT NULL DEFAULT 'asset',  -- asset | part | location
            EntityID        TEXT NOT NULL,
            ArtifactType    TEXT NOT NULL,  -- twin|cad|vector_drawing|schematic|photo|manual|nameplate
            ArtifactRole    TEXT NOT NULL DEFAULT 'reference',
            Format          TEXT,
            Source          TEXT DEFAULT 'manual_upload',
            FileURL         TEXT,
            PreviewURL      TEXT,
            FileName        TEXT,
            FileSizeBytes   INTEGER,
            MetadataJSON    TEXT DEFAULT '{}',
            LinksJSON       TEXT DEFAULT '{}',
            Confidence      REAL DEFAULT 1.0,
            Verified        INTEGER DEFAULT 0,
            VerifiedBy      TEXT,
            VerifiedAt      TEXT,
            CreatedBy       TEXT,
            CreatedAt       TEXT DEFAULT (datetime('now')),
            IsDeleted       INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_pa_entity ON plant_artifacts(EntityType, EntityID);
        CREATE INDEX IF NOT EXISTS idx_pa_type   ON plant_artifacts(ArtifactType);
        CREATE INDEX IF NOT EXISTS idx_pa_role   ON plant_artifacts(ArtifactRole);
    `);

    // Seed from existing digital_twin_schematics (if table exists)
    const hasSchematics = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='digital_twin_schematics'"
    ).get();

    if (hasSchematics) {
        const schemCols = db.prepare('PRAGMA table_info(digital_twin_schematics)').all().map(c => c.name);
        const insert = db.prepare(`
            INSERT OR IGNORE INTO plant_artifacts
                (EntityType, EntityID, ArtifactType, ArtifactRole, Format, Source, FileURL, FileName, CreatedBy, CreatedAt)
            VALUES ('asset', ?, 'photo', 'operational', 'JPEG', 'photogrammetry', ?, ?, ?, ?)
        `);
        const hasIsDeleted = schemCols.includes('IsDeleted');
        const rows = db.prepare(`SELECT * FROM digital_twin_schematics${hasIsDeleted ? ' WHERE IsDeleted = 0' : ''}`).all();
        db.transaction(() => {
            for (const r of rows) {
                const assetId = r.AssetID || r.asset_id || '';
                const fileUrl = r.FileURL || r.file_url || r.PhotoURL || r.SchematicPath || '';
                const fileName = r.FileName || r.file_name || r.Label || '';
                const createdBy = r.CreatedBy || r.created_by || 'system';
                const createdAt = r.CreatedAt || r.created_at || new Date().toISOString();
                if (assetId) insert.run(String(assetId), fileUrl, fileName, createdBy, createdAt);
            }
        })();
    }

    db.close();
}

module.exports = function run() {
    migrateGlobalCatalog();

    const dataDir = path.join(__dirname, '..', '..', 'data');
    const targets = fs.readdirSync(dataDir)
        .filter(f => f.endsWith('.db') && !f.includes('mfg_master') && !f.includes('trier_logistics') && !f.includes('auth_db'))
        .map(f => path.join(dataDir, f));

    for (const dbPath of targets) {
        try {
            migratePlantDb(dbPath);
            console.log(`[053] plant_artifacts created → ${path.basename(dbPath)}`);
        } catch (e) {
            console.warn(`[053] Skipped ${path.basename(dbPath)}: ${e.message}`);
        }
    }
};
