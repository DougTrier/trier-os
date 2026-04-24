// Copyright © 2026 Trier OS. All Rights Reserved.

module.exports = {
    up: () => {
        const logisticsDb = require('../logistics_db').db;
        logisticsDb.exec(`
            CREATE TABLE IF NOT EXISTS ArtifactRegistry (
                ArtifactID    INTEGER PRIMARY KEY,
                ArtifactName  TEXT    NOT NULL,
                Type          TEXT    NOT NULL,
                PlantID       TEXT,
                Version       INTEGER NOT NULL DEFAULT 1,
                FilePath      TEXT    NOT NULL,
                ContentHash   TEXT    NOT NULL,
                Signature     TEXT    NOT NULL,
                FileSize      INTEGER NOT NULL,
                ExpiresAt     TEXT,
                Superseded    INTEGER NOT NULL DEFAULT 0,
                UploadedBy    TEXT    NOT NULL,
                UploadedAt    TEXT    NOT NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS uq_artifact_name_plant_ver ON ArtifactRegistry(ArtifactName, PlantID, Version);
            CREATE INDEX IF NOT EXISTS idx_artifact_plant ON ArtifactRegistry(PlantID, Superseded);

            CREATE TABLE IF NOT EXISTS EdgeNodeSync (
                SyncID        INTEGER PRIMARY KEY,
                PlantID       TEXT    NOT NULL,
                ArtifactID    INTEGER NOT NULL REFERENCES ArtifactRegistry(ArtifactID),
                Status        TEXT    NOT NULL DEFAULT 'PENDING',
                EdgeVersion   INTEGER,
                LastCheckedAt TEXT,
                SyncedAt      TEXT,
                ErrorNote     TEXT,
                UNIQUE(PlantID, ArtifactID)
            );

            CREATE INDEX IF NOT EXISTS idx_edge_sync_plant ON EdgeNodeSync(PlantID, Status);
        `);
        console.log('   -> Created ArtifactRegistry and EdgeNodeSync tables in trier_logistics.db.');
    }
};
