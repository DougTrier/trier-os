// Copyright © 2026 Trier OS. All Rights Reserved.

module.exports = {
    up: () => {
        const logisticsDb = require('../logistics_db').db;

        logisticsDb.prepare(`
            CREATE TABLE IF NOT EXISTS RecommendationLog (
                RecommendationID  INTEGER PRIMARY KEY,
                Type              TEXT    NOT NULL,
                PlantID           TEXT    NOT NULL,
                AssetID           TEXT,
                RecommendedAction TEXT    NOT NULL,
                ConfidenceScore   REAL    NOT NULL,
                ConfidenceBand    TEXT    NOT NULL,
                EmittedAt         TEXT    NOT NULL,
                EmittedPayload    TEXT    NOT NULL
            )
        `).run();

        logisticsDb.prepare(`
            CREATE INDEX IF NOT EXISTS idx_rec_log_plant ON RecommendationLog(PlantID, EmittedAt DESC)
        `).run();

        logisticsDb.prepare(`
            CREATE TABLE IF NOT EXISTS OperatorFeedback (
                FeedbackID         INTEGER PRIMARY KEY,
                RecommendationID   INTEGER NOT NULL REFERENCES RecommendationLog(RecommendationID),
                PlantID            TEXT    NOT NULL,
                AssetID            TEXT,
                Operator           TEXT    NOT NULL,
                Action             TEXT    NOT NULL,
                ReasonCode         TEXT,
                Annotation         TEXT,
                LinkedWOID         TEXT,
                FeedbackAt         TEXT    NOT NULL
            )
        `).run();

        logisticsDb.prepare(`
            CREATE INDEX IF NOT EXISTS idx_op_feedback_rec ON OperatorFeedback(RecommendationID)
        `).run();
        
        logisticsDb.prepare(`
            CREATE INDEX IF NOT EXISTS idx_op_feedback_plant ON OperatorFeedback(PlantID, FeedbackAt DESC)
        `).run();

        logisticsDb.prepare(`
            CREATE TABLE IF NOT EXISTS RecommendationOutcome (
                OutcomeID          INTEGER PRIMARY KEY,
                RecommendationID   INTEGER NOT NULL UNIQUE REFERENCES RecommendationLog(RecommendationID),
                OutcomeType        TEXT    NOT NULL,
                MatchedWOID        TEXT,
                EvidenceNote       TEXT,
                RecordedAt         TEXT    NOT NULL,
                RecordedBy         TEXT    NOT NULL
            )
        `).run();

        logisticsDb.prepare(`
            CREATE INDEX IF NOT EXISTS idx_rec_outcome_rec ON RecommendationOutcome(RecommendationID)
        `).run();

        console.log('   -> Created RecommendationLog, OperatorFeedback, RecommendationOutcome in trier_logistics.db.');
    }
};
