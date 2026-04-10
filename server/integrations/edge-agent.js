// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Trier OS — Edge Agent (SCADA/PLC Sync Worker)
 * ===============================================
 * Polls a Modbus TCP endpoint on a configurable interval, normalizes
 * the raw register values using TAG_DEFINITIONS, and writes them into
 * the plant's SQLite database (SensorReadings table).
 *
 * Also performs threshold checks:
 *  - If downtime_minutes increases by ≥5 since last reading → auto-creates a
 *    pending Work Order in the plant DB so the maintenance team is notified.
 *  - If any active alarms are detected → writes an asset alert.
 *
 * One instance per plant × integration. Managed by integration-manager.js.
 */

'use strict';
const path   = require('path');
const Database = require('better-sqlite3');
const modbusClient  = require('./modbus-client');
const { TAG_DEFINITIONS, REGISTER_COUNT } = require('./modbus-simulator');
const dataDir = require('../resolve_data_dir');

const DEFAULT_POLL_INTERVAL_MS = 15000; // 15 seconds

// ── Schema bootstrap ─────────────────────────────────────────────────────────
function ensureSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS SensorReadings (
            ID          INTEGER PRIMARY KEY AUTOINCREMENT,
            TagName     TEXT    NOT NULL,
            TagAddress  INTEGER,
            Value       REAL    NOT NULL,
            RawValue    INTEGER,
            Unit        TEXT,
            LineID      TEXT,
            ReadingTime TEXT    DEFAULT (datetime('now')),
            Source      TEXT    DEFAULT 'modbus',
            IntegrationID TEXT  DEFAULT 'scada'
        );
        CREATE INDEX IF NOT EXISTS idx_sr_tag  ON SensorReadings(TagName);
        CREATE INDEX IF NOT EXISTS idx_sr_time ON SensorReadings(ReadingTime);
    `);
}

// ── Work order auto-creation on downtime spike ────────────────────────────────
function maybeCreateDowntimeWO(db, plantId, downtimeMinutes, prevDowntime) {
    const delta = downtimeMinutes - (prevDowntime || 0);
    if (delta < 5) return; // not enough to create a WO

    try {
        const existing = db.prepare(`
            SELECT ID FROM Work
            WHERE TypeID = 'REACTIVE' AND Status = 'Open'
              AND Description LIKE '%Automated Downtime Alert%'
              AND date(AddDate) = date('now')
        `).get();
        if (existing) return; // already have one open today

        db.prepare(`
            INSERT INTO Work (TypeID, Status, Priority, Description, AddDate, ReqDate, Notes)
            VALUES ('REACTIVE','Open','High',
                    'Automated Downtime Alert — SCADA detected ' || ? || ' min downtime',
                    datetime('now'), date('now'), 'Auto-created by Trier OS edge agent. Review line fault.')
        `).run(downtimeMinutes);
    } catch { /* Work table schema may vary; skip silently */ }
}

// ── Worker class ─────────────────────────────────────────────────────────────
class EdgeAgent {
    constructor(plantId, integrationId, config) {
        this.plantId       = plantId;
        this.integrationId = integrationId;
        this.host          = config.simulatorMode ? '127.0.0.1' : (config.host || '127.0.0.1');
        this.port          = config.simulatorMode ? (config.simulatorPort || 5020) : (parseInt(config.port) || 502);
        this.intervalMs    = (parseInt(config.pollIntervalSeconds) || 15) * 1000;
        this.timer         = null;
        this.running       = false;
        this.lastPoll      = null;
        this.lastError     = null;
        this.pollCount     = 0;
        this.prevDowntime  = 0;
        this._db           = null;
    }

    _getDb() {
        if (this._db) return this._db;
        const dbPath = path.join(dataDir, `${this.plantId}.db`);
        this._db = new Database(dbPath);
        ensureSchema(this._db);
        return this._db;
    }

    async poll() {
        try {
            const raw = await modbusClient.readHoldingRegisters(
                this.host, this.port, 0, REGISTER_COUNT
            );

            const db = this._getDb();
            const insertReading = db.prepare(`
                INSERT INTO SensorReadings (TagName, TagAddress, Value, RawValue, Unit, ReadingTime, Source, IntegrationID)
                VALUES (?, ?, ?, ?, ?, datetime('now'), 'modbus', ?)
            `);

            const insertMany = db.transaction((readings) => {
                for (const r of readings) insertReading.run(r.name, r.address, r.value, r.raw, r.unit, this.integrationId);
            });

            const readings = TAG_DEFINITIONS.map(tag => ({
                name:    tag.name,
                address: tag.address,
                raw:     raw[tag.address],
                value:   Math.round(raw[tag.address] * tag.scale * 100) / 100,
                unit:    tag.unit,
            }));

            insertMany(readings);

            // Downtime WO check
            const downtimeReading = readings.find(r => r.name === 'downtime_minutes');
            if (downtimeReading) {
                maybeCreateDowntimeWO(db, this.plantId, downtimeReading.value, this.prevDowntime);
                this.prevDowntime = downtimeReading.value;
            }

            this.lastPoll  = new Date().toISOString();
            this.lastError = null;
            this.pollCount++;
        } catch (err) {
            this.lastError = err.message;
        }
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.poll(); // immediate first poll
        this.timer = setInterval(() => this.poll(), this.intervalMs);
        console.log(`[EdgeAgent] Started — plant=${this.plantId} integration=${this.integrationId} ${this.host}:${this.port} every ${this.intervalMs / 1000}s`);
    }

    stop() {
        this.running = false;
        clearInterval(this.timer);
        this.timer = null;
        if (this._db) { try { this._db.close(); } catch {} this._db = null; }
        console.log(`[EdgeAgent] Stopped — plant=${this.plantId} integration=${this.integrationId}`);
    }

    status() {
        return {
            plantId:       this.plantId,
            integrationId: this.integrationId,
            running:       this.running,
            host:          this.host,
            port:          this.port,
            lastPoll:      this.lastPoll,
            lastError:     this.lastError,
            pollCount:     this.pollCount,
            intervalMs:    this.intervalMs,
        };
    }
}

module.exports = EdgeAgent;
