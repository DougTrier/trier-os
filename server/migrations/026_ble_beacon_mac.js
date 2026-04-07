// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Migration 026 — Asset BLE Beacon MAC
 * ======================================
 * Adds a BleBeaconMac column to the Asset table so each piece of equipment
 * can be linked to a physical BLE beacon tag. The MAC address is stored in
 * lowercase colon-delimited format (e.g. "aa:bb:cc:dd:ee:ff").
 *
 * The global beacon registry lives in ble_beacons (trier_logistics.db).
 * This column is a denormalised cache on the asset record for fast client-side
 * proximity matching without a round-trip to the server on every scan.
 */
module.exports = {
    up: (db) => {
        const cols = db.prepare('PRAGMA table_info(Asset)').all().map(c => c.name.toLowerCase());
        if (!cols.includes('blebeaconmac')) {
            db.exec('ALTER TABLE Asset ADD COLUMN BleBeaconMac TEXT');
            console.log('   -> Added BleBeaconMac to Asset');
        }
    }
};
