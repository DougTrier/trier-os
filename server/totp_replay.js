// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Persistent TOTP consumption for POST /api/auth/verify-2fa.
 * Stores absolute counters separately per user and secret enrollment, using the
 * existing creator_settings primary key and an immediate transaction to exclude
 * concurrent replays. Storage errors propagate; they cannot grant a session.
 */
const crypto = require('node:crypto');
function consumeCounter(db, { userId, secret, counter, currentCounter, legacyCreator = false }) {
    const key = 'totp_replay:' + userId;
    const secretHash = crypto.createHash('sha256').update(secret).digest('hex');
    return db.transaction(() => {
        const row = db.prepare('SELECT Value FROM creator_settings WHERE Key=?').get(key);
        const saved = row ? JSON.parse(row.Value) : null;
        let counters = saved?.secretHash === secretHash ? saved.counters : [];
        // Preserve replay protection when upgrading the old creator-only cache.
        // Confirming a new enrollment removes that ambiguous legacy row.
        if (!saved && legacyCreator) {
            const old = db.prepare("SELECT Value FROM creator_settings WHERE Key='totp_last_delta'").get();
            if (old) {
                const value = JSON.parse(old.Value);
                if (Number.isFinite(value.at) && Number.isInteger(value.delta)) counters.push(Math.floor(value.at / 30000) + value.delta);
            }
        }
        counters = counters.filter(value => value >= currentCounter - 1);
        const replay = counters.includes(counter);
        if (!replay) counters.push(counter);
        db.prepare("INSERT OR REPLACE INTO creator_settings(Key,Value,UpdatedAt) VALUES (?,?,datetime('now'))")
            .run(key, JSON.stringify({ secretHash, counters }));
        if (legacyCreator) db.prepare("DELETE FROM creator_settings WHERE Key='totp_last_delta'").run();
        return !replay;
    }).immediate();
}
module.exports = { consumeCounter };
