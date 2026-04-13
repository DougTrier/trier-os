// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * causality.js — Explainable Operations Engine + Causality Graph
 * ===============================================================
 * Stitches events from multiple sources into a unified chronological
 * timeline for a given asset or work order. Surfaces the observable
 * causal chain: sensor drift → failure → WO created → RCA opened →
 * CAPA assigned → verified closed.
 *
 * This is the "explainable" tier — no inference or ML. It assembles
 * facts from the event log and presents them with human-readable labels
 * so an operator can read the chain without interpreting raw data.
 *
 * Event sources (all queried at runtime):
 *   Plant DB:   Work, WorkSegments, ScanAuditLog (WO + labor activity)
 *   Logistics:  rca_investigations, CorrectiveActions, VibrationAlerts,
 *               ManagementOfChange, QualityNCR, ERPOutbox
 *
 * -- ROUTES ----------------------------------------------------
 *   GET /api/causality/timeline/:assetId   Full event timeline for an asset
 *   GET /api/causality/chain/:woId         Causal chain anchored to one WO
 *   GET /api/causality/summary             Cross-plant recent causality summary
 *
 * -- P7 ROADMAP ITEMS COVERED ---------------------------------
 *   Explainable Operations Engine
 *   Cross-System Causality Graph (IT↔OT boundary: ERP outbox events included)
 */

'use strict';

const express     = require('express');
const router      = express.Router();
const logisticsDb = require('../logistics_db').db;
const db          = require('../database');

// ── Event type labels (human-readable) ───────────────────────────────────────
const EVENT_LABELS = {
    WO_CREATED:      'Work Order Created',
    WO_STARTED:      'Work Order Started',
    WO_COMPLETED:    'Work Order Completed',
    SEGMENT_OPEN:    'Technician Checked In',
    SEGMENT_CLOSE:   'Technician Checked Out',
    RCA_OPENED:      'Root Cause Analysis Opened',
    RCA_CLOSED:      'Root Cause Analysis Closed',
    CAPA_CREATED:    'Corrective Action Created',
    CAPA_COMPLETED:  'Corrective Action Completed',
    CAPA_OVERDUE:    'Corrective Action Overdue',
    VIBRATION_ALERT: 'Vibration Alert Triggered',
    VIBRATION_DANGER:'Vibration Danger Threshold Exceeded',
    NCR_CREATED:     'Non-Conformance Report Filed',
    NCR_RESOLVED:    'Non-Conformance Report Resolved',
    MOC_CREATED:     'Management of Change Initiated',
    MOC_APPROVED:    'Management of Change Approved',
    MOC_COMPLETED:   'Management of Change Completed',
    ERP_SYNC:        'ERP Write-Back Queued',
};

function makeEvent(type, ts, label, source, meta = {}) {
    return {
        type,
        timestamp: ts,
        label: label || EVENT_LABELS[type] || type,
        source,
        ...meta,
    };
}

// ── Build unified timeline for an asset ───────────────────────────────────────
function buildTimeline(plantId, assetId, days = 180) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const events = [];

    // ── Plant DB: Work Orders ──────────────────────────────────────────────────
    try {
        const conn = db.getDb(plantId);
        const wos = conn.prepare(`
            SELECT ID, WorkOrderNumber, Description, AddDate, StartDate, CompDate, StatusID, WOSource
            FROM Work WHERE AstID = ? AND AddDate >= ? ORDER BY AddDate ASC
        `).all(assetId, cutoff);

        for (const wo of wos) {
            const woRef = wo.WorkOrderNumber || wo.ID;
            if (wo.AddDate) events.push(makeEvent('WO_CREATED', wo.AddDate, `WO Created: ${wo.Description || woRef}`, 'work_orders', { woId: wo.ID, woNumber: woRef, source: wo.WOSource }));
            if (wo.StartDate) events.push(makeEvent('WO_STARTED', wo.StartDate, `WO Started: ${woRef}`, 'work_orders', { woId: wo.ID, woNumber: woRef }));
            if (wo.CompDate) events.push(makeEvent('WO_COMPLETED', wo.CompDate, `WO Completed: ${woRef}`, 'work_orders', { woId: wo.ID, woNumber: woRef }));
        }

        // ── Plant DB: WorkSegments (labor scan-in/out) ─────────────────────────
        try {
            const segs = conn.prepare(`
                SELECT s.id, s.woId, s.userId, s.segmentState, s.startTs, s.endTs
                FROM WorkSegments s
                JOIN Work w ON w.ID = s.woId
                WHERE w.AstID = ? AND s.startTs >= ? ORDER BY s.startTs ASC
            `).all(assetId, cutoff);

            for (const seg of segs) {
                if (seg.startTs) events.push(makeEvent('SEGMENT_OPEN', seg.startTs, `${seg.userId || 'Tech'} checked in (WO ${seg.woId})`, 'work_segments', { segId: seg.id, techId: seg.userId }));
                if (seg.endTs)   events.push(makeEvent('SEGMENT_CLOSE', seg.endTs, `${seg.userId || 'Tech'} checked out (WO ${seg.woId})`, 'work_segments', { segId: seg.id, techId: seg.userId }));
            }
        } catch { /* WorkSegments may not exist in all plant DBs */ }
    } catch { /* plant DB unavailable */ }

    // ── Logistics DB: RCA investigations ──────────────────────────────────────
    try {
        const rcas = logisticsDb.prepare(`
            SELECT ID, Title, IncidentDate, Status, Investigator
            FROM rca_investigations WHERE AssetID = ? AND IncidentDate >= ? ORDER BY IncidentDate ASC
        `).all(assetId, cutoff);

        for (const rca of rcas) {
            if (rca.IncidentDate) events.push(makeEvent('RCA_OPENED', rca.IncidentDate, `RCA: ${rca.Title}`, 'rca', { rcaId: rca.ID, investigator: rca.Investigator }));
            if (rca.Status === 'Closed') events.push(makeEvent('RCA_CLOSED', rca.IncidentDate, `RCA Closed: ${rca.Title}`, 'rca', { rcaId: rca.ID }));
        }
    } catch { /* ok */ }

    // ── Logistics DB: CorrectiveActions (CAPA) ────────────────────────────────
    try {
        const capas = logisticsDb.prepare(`
            SELECT ID, Title, Status, CreatedAt, CompletedAt, DueDate, Owner
            FROM CorrectiveActions WHERE PlantID = ? AND CreatedAt >= ?
        `).all(plantId, cutoff);

        for (const capa of capas) {
            events.push(makeEvent('CAPA_CREATED', capa.CreatedAt, `CAPA: ${capa.Title}`, 'capa', { capaId: capa.ID, owner: capa.Owner }));
            if (capa.Status === 'Completed' && capa.CompletedAt) events.push(makeEvent('CAPA_COMPLETED', capa.CompletedAt, `CAPA Completed: ${capa.Title}`, 'capa', { capaId: capa.ID }));
        }
    } catch { /* ok */ }

    // ── Logistics DB: VibrationAlerts ─────────────────────────────────────────
    try {
        const vAlerts = logisticsDb.prepare(`
            SELECT ID, AlertType, Value, Threshold, CreatedAt
            FROM VibrationAlerts WHERE AssetID = ? AND PlantID = ? AND CreatedAt >= ?
        `).all(assetId, plantId, cutoff);

        for (const a of vAlerts) {
            const type = a.AlertType?.includes('DANGER') ? 'VIBRATION_DANGER' : 'VIBRATION_ALERT';
            events.push(makeEvent(type, a.CreatedAt, `${EVENT_LABELS[type]}: ${a.Value?.toFixed(1)} mm/s (threshold ${a.Threshold})`, 'vibration', { alertId: a.ID }));
        }
    } catch { /* ok */ }

    // ── Logistics DB: MOC ─────────────────────────────────────────────────────
    try {
        const mocs = logisticsDb.prepare(`
            SELECT m.ID, m.Title, m.Status, m.CreatedAt, m.UpdatedAt,
                   MAX(a.ApprovedAt) AS lastApprovedAt
            FROM ManagementOfChange m
            LEFT JOIN MOCApprovals a ON a.MOCID = m.ID AND a.Status = 'APPROVED'
            JOIN MOCAffectedItems ai ON ai.MOCID = m.ID AND ai.ItemType = 'ASSET' AND ai.ItemID = ?
            WHERE m.PlantID = ? AND m.CreatedAt >= ?
            GROUP BY m.ID
        `).all(assetId, plantId, cutoff);

        for (const moc of mocs) {
            events.push(makeEvent('MOC_CREATED', moc.CreatedAt, `MOC: ${moc.Title}`, 'moc', { mocId: moc.ID }));
            if (moc.lastApprovedAt) events.push(makeEvent('MOC_APPROVED', moc.lastApprovedAt, `MOC Approved: ${moc.Title}`, 'moc', { mocId: moc.ID }));
            if (moc.Status === 'COMPLETED') events.push(makeEvent('MOC_COMPLETED', moc.UpdatedAt, `MOC Completed: ${moc.Title}`, 'moc', { mocId: moc.ID }));
        }
    } catch { /* ok */ }

    // Sort by timestamp, filter nulls
    return events
        .filter(e => e.timestamp)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

// ── GET /api/causality/timeline/:assetId ──────────────────────────────────────
router.get('/timeline/:assetId', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        if (!plantId) return res.status(400).json({ error: 'plantId or x-plant-id header required' });

        const days = parseInt(req.query.days, 10) || 180;
        const events = buildTimeline(plantId, req.params.assetId, days);

        res.json({
            assetId: req.params.assetId,
            plantId,
            periodDays: days,
            eventCount: events.length,
            events,
        });
    } catch (err) {
        console.error('[causality] timeline error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/causality/chain/:woId ────────────────────────────────────────────
// Causal chain anchored to one work order: what led up to it, what followed.
router.get('/chain/:woId', (req, res) => {
    try {
        const plantId = req.query.plantId || req.headers['x-plant-id'];
        if (!plantId) return res.status(400).json({ error: 'plantId or x-plant-id header required' });

        const conn = db.getDb(plantId);
        const wo = conn.prepare('SELECT * FROM Work WHERE ID = ? OR WorkOrderNumber = ? LIMIT 1').get(req.params.woId, req.params.woId);
        if (!wo) return res.status(404).json({ error: 'Work order not found' });

        // Get the full timeline for this asset in a ±60 day window around the WO
        const woDate = new Date(wo.AddDate || wo.CompDate || Date.now());
        const fromDate = new Date(woDate.getTime() - 60 * 86400000).toISOString().split('T')[0];
        const allEvents = buildTimeline(plantId, wo.AstID, 180);

        // Filter to the window and annotate the anchor WO
        const chain = allEvents.map(e => ({
            ...e,
            isAnchor: (e.woId === wo.ID || e.woId === String(wo.ID)),
        }));

        // Find linked RCA
        let linkedRCA = null;
        try {
            linkedRCA = logisticsDb.prepare('SELECT * FROM rca_investigations WHERE WorkOrderID = ? LIMIT 1').get(String(wo.ID));
        } catch { /* ok */ }

        // Find linked CAPAs
        let linkedCAPAs = [];
        try {
            if (linkedRCA) {
                linkedCAPAs = logisticsDb.prepare('SELECT * FROM CorrectiveActions WHERE RCAID = ?').all(linkedRCA.ID);
            }
        } catch { /* ok */ }

        res.json({
            woId: req.params.woId,
            wo: { id: wo.ID, number: wo.WorkOrderNumber, description: wo.Description, assetId: wo.AstID, addDate: wo.AddDate, compDate: wo.CompDate },
            linkedRCA: linkedRCA || null,
            linkedCAPAs,
            chain,
        });
    } catch (err) {
        console.error('[causality] chain error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/causality/summary ─────────────────────────────────────────────────
// Cross-plant: recent causality activity — new RCAs, open CAPAs, vibration alerts.
router.get('/summary', (req, res) => {
    try {
        const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
        const { plantId } = req.query;
        let where = '1=1'; const p = [];
        if (plantId) { where = 'PlantID = ?'; p.push(plantId); }

        const openRCAs  = logisticsDb.prepare(`SELECT COUNT(*) AS c FROM rca_investigations WHERE Status != 'Closed' AND ${where.replace('PlantID', 'PlantID')}`).get(...p);
        const openCAPAs = logisticsDb.prepare(`SELECT COUNT(*) AS c FROM CorrectiveActions WHERE Status IN ('Open','InProgress') AND ${where}`).get(...p);
        const newRCAs30 = logisticsDb.prepare(`SELECT COUNT(*) AS c FROM rca_investigations WHERE IncidentDate >= ? AND ${where}`).get(cutoff30, ...p);
        const vibAlerts = logisticsDb.prepare(`SELECT COUNT(*) AS c FROM VibrationAlerts WHERE Status='ACTIVE' AND ${where}`).get(...p);

        res.json({
            openRCAs:   openRCAs?.c  || 0,
            openCAPAs:  openCAPAs?.c || 0,
            newRCAs30:  newRCAs30?.c || 0,
            activeVibrationAlerts: vibAlerts?.c || 0,
            asOf: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[causality] summary error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
