// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 061 — GuideExecutionLog table in trier_logistics.db
//
// Stores structured telemetry for every guided workflow execution that
// reached ACTIVE status.  Pre-start eligibility blocks are NOT stored here
// (those remain in AuditLog only).
//
// Key diagnostic field: StepsJson[].attempts — poll cycles before a step
// passed validation.  High attempt counts flag confusing instructions or
// broken validation before any user files a bug.
//
// Cross-plant visibility: stored in trier_logistics.db, queryable across
// all plants by workflowId, plantId, userId, and outcome.

'use strict';

module.exports = {
    up() {
        const logisticsDb = require('../logistics_db').db;

        logisticsDb.exec(`
            CREATE TABLE IF NOT EXISTS GuideExecutionLog (
                ID              INTEGER PRIMARY KEY AUTOINCREMENT,
                WorkflowId      TEXT    NOT NULL,
                WorkflowVersion INTEGER NOT NULL DEFAULT 1,
                UserId          TEXT    NOT NULL,
                PlantId         TEXT,
                Outcome         TEXT    NOT NULL CHECK(Outcome IN ('COMPLETE', 'ABANDONED')),
                FailureReason   TEXT,
                StartedAt       TEXT    NOT NULL,
                CompletedAt     TEXT    NOT NULL,
                TotalElapsedMs  INTEGER NOT NULL,
                StepCount       INTEGER NOT NULL,
                StepsJson       TEXT    NOT NULL,
                CreatedAt       TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_gel_workflow_outcome
                ON GuideExecutionLog(WorkflowId, Outcome, CreatedAt DESC);

            CREATE INDEX IF NOT EXISTS idx_gel_plant
                ON GuideExecutionLog(PlantId, CreatedAt DESC);

            CREATE INDEX IF NOT EXISTS idx_gel_user
                ON GuideExecutionLog(UserId, CreatedAt DESC);
        `);

        console.log('   -> Created GuideExecutionLog table in trier_logistics.db.');
    },
    down() {
        const logisticsDb = require('../logistics_db').db;
        try {
            logisticsDb.exec(`
                DROP INDEX IF EXISTS idx_gel_workflow_outcome;
                DROP INDEX IF EXISTS idx_gel_plant;
                DROP INDEX IF EXISTS idx_gel_user;
                DROP TABLE IF EXISTS GuideExecutionLog;
            `);
        } catch {}
    },
};
