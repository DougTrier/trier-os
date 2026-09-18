// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Migration 063 — repair missing nullable columns required by migration 045's
 * EventLog triggers. Types match the shipped schema template. Existing rows,
 * triggers and event history are retained. No HTTP routes.
 */
'use strict';
module.exports = {
    up(db) {
        const required = {
            Work: { ActualHours: 'REAL' },
            Part: { VendorName: 'TEXT', VendorAddr: 'TEXT', VendorCity: 'TEXT', VendorState: 'TEXT', VendorZip: 'TEXT', VendorPhone: 'TEXT', VendorContact: 'TEXT', VendorEmail: 'TEXT' },
            ProductLoss: { EnteredDate: 'TEXT' },
        };
        for (const [table, columns] of Object.entries(required)) {
            const triggers = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND tbl_name=? AND name LIKE 'el_%'").all(table).map(row => row.sql).join('\n');
            const existing = new Set(db.prepare('SELECT name FROM pragma_table_info(?)').all(table).map(row => row.name.toLowerCase()));
            for (const [column, type] of Object.entries(columns)) {
                if (!existing.has(column.toLowerCase()) && new RegExp('\\b(?:NEW|OLD)\\.' + column + '\\b', 'i').test(triggers)) {
                    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`);
                }
            }
        }
    },
};
