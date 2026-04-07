// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS — Enrollment & Verification API
 * ==========================================
 * Handles access enrollment requests from new users.
 * Requests are stored as pending and require admin approval.
 *
 * ENDPOINTS:
 *   POST /enroll         — Submit enrollment request (public)
 *   GET  /enrollments    — List pending requests (admin only)
 *   POST /enrollments/approve — Approve & create account (admin only)
 *   POST /enrollments/deny    — Deny a request (admin only)
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const authDb = require('../auth_db');
const { logAudit } = require('../logistics_db');

const JWT_SECRET = process.env.JWT_SECRET;

// ── Ensure enrollment_requests table exists ─────────────────────────────────
authDb.exec(`
    CREATE TABLE IF NOT EXISTS enrollment_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        requested_plant TEXT NOT NULL,
        requested_role TEXT DEFAULT 'technician',
        reason TEXT,
        status TEXT DEFAULT 'pending',
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_by TEXT,
        reviewed_at DATETIME,
        review_notes TEXT
    )
`);

// ── Public: Submit Enrollment Request ────────────────────────────────────────
router.post('/enroll', (req, res) => {
    const { fullName, email, phone, requestedPlant, requestedRole, reason } = req.body;

    if (!fullName || !fullName.trim()) {
        return res.status(400).json({ error: 'Full name is required.' });
    }
    if (!requestedPlant) {
        return res.status(400).json({ error: 'Please select a plant location.' });
    }

    // Check for duplicate pending requests
    const existing = authDb.prepare(
        "SELECT 1 FROM enrollment_requests WHERE full_name = ? AND status = 'pending'"
    ).get(fullName.trim());
    if (existing) {
        return res.status(409).json({ error: 'An enrollment request for this name is already pending.' });
    }

    // Check if username already exists
    const existingUser = authDb.prepare('SELECT 1 FROM Users WHERE Username = ?').get(fullName.trim());
    if (existingUser) {
        return res.status(409).json({ error: 'An account with this name already exists. Please sign in or contact your admin.' });
    }

    const validRoles = ['technician', 'mechanic', 'engineer', 'lab_tech', 'plant_manager', 'it_admin', 'executive', 'employee'];
    const role = validRoles.includes(requestedRole) ? requestedRole : 'technician';

    authDb.prepare(`
        INSERT INTO enrollment_requests (full_name, email, phone, requested_plant, requested_role, reason)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(fullName.trim(), email || null, phone || null, requestedPlant, role, reason || null);

    logAudit('GUEST', 'ENROLLMENT_REQUEST', requestedPlant, { name: fullName, role, email }, 'INFO', req.ip);

    res.json({ 
        success: true, 
        message: 'Your enrollment request has been submitted. An administrator will review your request shortly.' 
    });
});

// ── Admin: List Enrollment Requests ─────────────────────────────────────────
router.get('/enrollments', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing token' });

    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        if (!['it_admin', 'creator'].includes(decoded.globalRole)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const requests = authDb.prepare(`
            SELECT * FROM enrollment_requests 
            ORDER BY 
                CASE status WHEN 'pending' THEN 0 ELSE 1 END,
                submitted_at DESC
        `).all();

        res.json(requests);
    } catch (err) {
        res.status(401).json({ error: 'Invalid session' });
    }
});

// ── Admin: Approve Enrollment ───────────────────────────────────────────────
router.post('/enrollments/approve', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing token' });

    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        if (!['it_admin', 'creator'].includes(decoded.globalRole)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { requestId, assignedRole, tempPassword, notes } = req.body;
        if (!requestId) return res.status(400).json({ error: 'Request ID required' });

        const request = authDb.prepare('SELECT * FROM enrollment_requests WHERE id = ?').get(requestId);
        if (!request) return res.status(404).json({ error: 'Enrollment request not found' });
        if (request.status !== 'pending') return res.status(400).json({ error: 'This request has already been reviewed.' });

        // Create the user account
        // SECURITY: Generate random temp password if none provided (never use hardcoded default)
        const password = tempPassword || crypto.randomBytes(8).toString('base64url');
        const hash = await bcrypt.hash(password, 10);
        const role = assignedRole || request.requested_role || 'technician';

        const result = authDb.prepare(`
            INSERT INTO Users (Username, PasswordHash, DefaultRole, MustChangePassword, DisplayName, Email, Phone)
            VALUES (?, ?, ?, 1, ?, ?, ?)
        `).run(request.full_name, hash, role, request.full_name, request.email, request.phone);

        const newUserId = result.lastInsertRowid;

        // Assign plant role
        authDb.prepare("INSERT INTO UserPlantRoles (UserID, PlantID, RoleLevel) VALUES (?, ?, ?)").run(
            newUserId, request.requested_plant, role
        );

        // Update enrollment status
        authDb.prepare(`
            UPDATE enrollment_requests 
            SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_notes = ?
            WHERE id = ?
        `).run(decoded.Username, notes || null, requestId);

        logAudit(decoded.Username, 'ENROLLMENT_APPROVED', request.requested_plant, {
            newUser: request.full_name, role, requestId
        }, 'INFO', req.ip);

        res.json({
            success: true,
            message: `Account created for ${request.full_name}. Temporary password has been generated.`,
            tempPassword: password,
            username: request.full_name
        });
    } catch (err) {
        console.error('Enrollment approval error:', err);
        res.status(500).json({ error: 'Failed to approve enrollment: ' + err.message });
    }
});

// ── Admin: Deny Enrollment ──────────────────────────────────────────────────
router.post('/enrollments/deny', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing token' });

    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        if (!['it_admin', 'creator'].includes(decoded.globalRole)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { requestId, reason } = req.body;
        if (!requestId) return res.status(400).json({ error: 'Request ID required' });

        const request = authDb.prepare('SELECT * FROM enrollment_requests WHERE id = ?').get(requestId);
        if (!request) return res.status(404).json({ error: 'Request not found' });
        if (request.status !== 'pending') return res.status(400).json({ error: 'Already reviewed.' });

        authDb.prepare(`
            UPDATE enrollment_requests 
            SET status = 'denied', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_notes = ?
            WHERE id = ?
        `).run(decoded.Username, reason || 'Denied by administrator', requestId);

        logAudit(decoded.Username, 'ENROLLMENT_DENIED', request.requested_plant, {
            deniedUser: request.full_name, reason, requestId
        }, 'WARNING', req.ip);

        res.json({ success: true, message: `Enrollment request from ${request.full_name} has been denied.` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to deny enrollment: ' + err.message });
    }
});

module.exports = router;
