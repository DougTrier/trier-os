// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * 031_shift_handover.js — P5-3 Shift Handover Schema
 * ====================================================
 * Adds tables for Shift Handover (Digital Turnover Log).
 * Tables: ShiftHandover, ShiftHandoverItems
 */

module.exports = {
    up: (db) => {
        db.prepare(`
            CREATE TABLE IF NOT EXISTS ShiftHandover (
                ID TEXT PRIMARY KEY,
                PlantID TEXT NOT NULL,
                OutgoingTech TEXT NOT NULL,
                IncomingTech TEXT,
                ShiftDate TEXT NOT NULL,
                Notes TEXT,
                Status TEXT DEFAULT 'PENDING_ACK',
                CreatedAt TEXT NOT NULL
            )
        `).run();

        db.prepare(`
            CREATE TABLE IF NOT EXISTS ShiftHandoverItems (
                ID TEXT PRIMARY KEY,
                HandoverID TEXT NOT NULL,
                ItemType TEXT NOT NULL,
                RefID TEXT NOT NULL,
                Notes TEXT,
                FOREIGN KEY(HandoverID) REFERENCES ShiftHandover(ID)
            )
        `).run();
        
        try {
            db.prepare('CREATE INDEX idx_shifthandover_plant ON ShiftHandover(PlantID)').run();
        } catch(e) {}
        try {
            db.prepare('CREATE INDEX idx_shifthandover_status ON ShiftHandover(Status)').run();
        } catch(e) {}
    }
};
