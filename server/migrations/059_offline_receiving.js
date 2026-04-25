// Copyright © 2026 Trier OS. All Rights Reserved.
// Migration 059 — Offline Receiving Event Store
//
// The OfflineReceivingEvents table lives in trier_logistics.db and is
// initialized by the route at startup (migrator skips logistics_db).
//
// This migration is a no-op on plant DBs — reserved as a version marker
// so future plant-DB schema additions for receiving can use migration 060+.

'use strict';

module.exports = {
    up(_db) {
        // No plant-DB schema changes in this version.
        // OfflineReceivingEvents is created in trier_logistics.db
        // by server/routes/offline_receiving.js at boot.
    },
    down(_db) {},
};
