// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Migration 025 — Asset GPS Coordinates
 * =======================================
 * Adds four GPS columns to the Asset table so outdoor and yard assets can be
 * pinned with a real-world lat/lng captured from the technician's device.
 *
 * GpsLat / GpsLng  — decimal degrees (WGS-84)
 * GpsSetAt         — ISO-8601 timestamp of when the location was captured
 * GpsSetBy         — username of the technician who set it
 *
 * Safety incidents and fleet_vehicles GPS columns are managed inline in their
 * respective route init functions (those tables live in trier_logistics.db
 * which is excluded from this per-plant migration runner).
 */
module.exports = {
    up: (db) => {
        const cols = db.prepare('PRAGMA table_info(Asset)').all().map(c => c.name.toLowerCase());

        if (!cols.includes('gpslat')) {
            db.exec('ALTER TABLE Asset ADD COLUMN GpsLat REAL');
            console.log('   -> Added GpsLat to Asset');
        }
        if (!cols.includes('gpslng')) {
            db.exec('ALTER TABLE Asset ADD COLUMN GpsLng REAL');
            console.log('   -> Added GpsLng to Asset');
        }
        if (!cols.includes('gpssetat')) {
            db.exec("ALTER TABLE Asset ADD COLUMN GpsSetAt TEXT");
            console.log('   -> Added GpsSetAt to Asset');
        }
        if (!cols.includes('gpssetby')) {
            db.exec('ALTER TABLE Asset ADD COLUMN GpsSetBy TEXT');
            console.log('   -> Added GpsSetBy to Asset');
        }
    }
};
