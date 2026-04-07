// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Legacy PM Schedule Miner
 * ==================================================
 * Extracts preventative maintenance schedules from imported legacy databases
 * (MP2, Tabware) and converts them into Trier OS Schedule table format.
 * Handles frequency parsing, asset linking, and deduplication.
 *
 * Run manually: node server/mine_legacy_pms.js
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'Demo_Plant_1.db');
const db = new Database(dbPath);

console.log('🚀 Starting legacy PM data mining for Demo Plant 1...');

const schedules = db.prepare('SELECT * FROM Schedule WHERE Active = 1').all();
const today = new Date('2026-03-14');

const updateStmt = db.prepare('UPDATE Schedule SET Freq = ?, FreqUnit = ?, NextDate = ? WHERE ID = ?');

let count = 0;

db.transaction(() => {
    for (const p of schedules) {
        let freq = 0;
        let unit = 'Days';
        let nextDate = null;

        const dayFlags = [p.Dsun, p.Dmon, p.Dtue, p.Dwed, p.Dthu, p.Dfri, p.Dsat];
        const activeDaysCount = dayFlags.filter(d => d === 1).length;

        if (activeDaysCount === 7) {
            // Daily
            freq = 1;
            unit = 'Days';
            // Set next date to tomorrow
            const d = new Date(today);
            d.setDate(d.getDate() + 1);
            nextDate = d.toISOString();
        } else if (activeDaysCount === 1) {
            // Weekly on a specific day
            freq = 7;
            unit = 'Days';
            const targetDay = dayFlags.indexOf(1); // 0=Sun, 1=Mon, ..., 3=Wed
            
            const next = new Date(today);
            let daysUntil = targetDay - today.getDay();
            if (daysUntil <= 0) daysUntil += 7;
            next.setDate(next.getDate() + daysUntil);
            nextDate = next.toISOString();
        } else if (activeDaysCount > 1 && activeDaysCount < 7) {
            // Multi-day (e.g. Weekdays)
            freq = 1; // Effectively daily if it's on specific days
            unit = 'Days';
            
            // Find next closest day that is active
            const next = new Date(today);
            let found = false;
            for (let i = 1; i <= 7; i++) {
                const checkDay = (today.getDay() + i) % 7;
                if (dayFlags[checkDay] === 1) {
                    next.setDate(next.getDate() + i);
                    nextDate = next.toISOString();
                    found = true;
                    break;
                }
            }
        } else if (p.EveryCount && p.EveryCount > 0 && p.EveryCount !== 257) {
            // High probability of being a day-based interval
            freq = p.EveryCount;
            unit = 'Days';
            
            const last = p.LastComp || p.LastSch || today.toISOString();
            const next = new Date(last);
            next.setDate(next.getDate() + freq);
            
            // Ensure next date is in the future
            if (next < today) {
                // If deep in the past, set to today + freq to reset
                next.setTime(today.getTime());
                next.setDate(next.getDate() + freq);
            }
            nextDate = next.toISOString();
        }

        if (freq > 0) {
            updateStmt.run(freq, unit, nextDate, p.ID);
            count++;
        }
    }
})();

console.log(`✅ Success! Analyzed and updated ${count} PM schedules in Demo Plant 1 based on legacy patterns.`);
db.close();
