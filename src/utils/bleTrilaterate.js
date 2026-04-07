// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * BLE Trilateration Engine
 * =========================
 * Estimates a 2-D position from RSSI readings against known BLE anchor beacons.
 *
 * Algorithm: Weighted centroid — each anchor is weighted by 1/distance².
 * This is simpler than full least-squares trilateration but accurate enough
 * for zone-level indoor positioning (±2–5 m typical).
 *
 * For higher accuracy, replace the centroid with the iterative least-squares
 * method described in: https://doi.org/10.3390/s21103501
 *
 * RSSI → distance model:
 *   d = 10 ^ ((TxPower − RSSI) / (10 × n))
 *   TxPower = −59 dBm at 1 m (iBeacon standard)
 *   n = 2.0 (free space path loss exponent; use 2.5–3.5 indoors)
 *
 * @param {Array<{ mac: string, rssi: number, x: number, y: number }>} readings
 *   Anchor beacons with their floor-plan coordinates and measured RSSI.
 *   x, y are in metres from the floor-plan origin (bottom-left corner).
 *
 * @returns {{ x: number, y: number } | null}
 *   Estimated position in the same coordinate space as the anchors,
 *   or null if fewer than 2 valid readings are available.
 */
export function bleTrilaterate(readings) {
    const TX_POWER = -59;
    const N = 2.0;

    const valid = readings
        .filter(r => r.rssi !== undefined && r.rssi !== 0 && r.x != null && r.y != null)
        .map(r => {
            const exponent = (TX_POWER - r.rssi) / (10 * N);
            const distance = Math.max(0.01, Math.pow(10, exponent));
            return { x: r.x, y: r.y, distance };
        });

    if (valid.length < 2) return null;

    // Weighted centroid: weight = 1 / d²
    let totalWeight = 0;
    let wx = 0;
    let wy = 0;

    for (const { x, y, distance } of valid) {
        const w = 1 / (distance * distance);
        wx += x * w;
        wy += y * w;
        totalWeight += w;
    }

    if (totalWeight === 0) return null;

    return {
        x: wx / totalWeight,
        y: wy / totalWeight,
    };
}

/**
 * floorPlanPercent — Convert a trilaterated (x, y) in metres to percentage
 * coordinates suitable for absolute CSS positioning on a floor plan image.
 *
 * @param {{ x: number, y: number }} pos  — position in metres
 * @param {{ widthM: number, heightM: number }} planDims  — floor plan real-world dimensions
 * @returns {{ xPct: number, yPct: number }}
 */
export function floorPlanPercent(pos, planDims) {
    if (!planDims?.widthM || !planDims?.heightM) return null;
    return {
        xPct: Math.min(100, Math.max(0, (pos.x / planDims.widthM) * 100)),
        yPct: Math.min(100, Math.max(0, (1 - pos.y / planDims.heightM) * 100)), // Y-axis flipped
    };
}
