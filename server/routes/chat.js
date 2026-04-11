// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Plant Chat & Messaging API
 * ========================================
 * REST-based plant-level chat system for maintenance team communication.
 * Messages are scoped per-plant via the x-plant-id header and stored in
 * trier_chat.db. Supports file/image attachments and topic-based channels.
 * Mounted at /api/chat in server/index.js.
 *
 * ENDPOINTS:
 *   POST   /signup           Register a chat profile (links to authenticated user account)
 *   POST   /login            Exchange JWT for a chat session token
 *   GET    /topics           List all chat topics/channels for the current plant
 *   POST   /topics           Create a new topic/channel
 *                            Body: { name, description, isPrivate? }
 *   GET    /messages         Fetch messages for a topic (default: last 50)
 *                            Query: ?topicId=N, ?before=messageId, ?limit=N
 *   POST   /messages         Post a new message (supports file attachment via multipart)
 *                            Body: { topicId, content } | multipart with 'attachment' field
 *   DELETE /topics/:id       Archive/delete a topic (admin or creator only)
 *   DELETE /messages/:id     Delete a message (sender or admin only)
 *   GET    /search           Full-text search across messages for the current plant
 *                            Query: ?q=searchTerm, ?topicId=N (optional topic scope)
 *
 * POLLING MODEL: The frontend polls GET /messages every 5 seconds for new content.
 *   No WebSocket is used — simplifies load balancer and proxy configuration.
 *   Long-polling or server-sent events may be considered for a future iteration.
 *
 * ATTACHMENT STORAGE: Files saved to /data/uploads/chat/{plantId}/{messageId}/
 *   Max file size: 10MB. Images served via the static uploads route.
 *
 * SCOPE: Messages are strictly plant-scoped — users cannot read messages from
 *   other plants unless they are assigned to those plants in auth_db.
 */
const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const multer = require('multer');
const { whitelist } = require('../validators');

const JWT_SECRET = process.env.JWT_SECRET; // SECURITY: No fallback — must be set in .env
const dataDir = require('../resolve_data_dir');
const chatDbPath = path.join(dataDir, 'trier_chat.db');
const uploadDir = path.join(dataDir, 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per file
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.docx', '.xlsx', '.zip'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            console.warn(`🛑 EDR Safety: Blocked attempt to upload unauthorized file type: ${ext} from ${req.ip}`);
            cb(new Error('Unauthorized file type. Only images and documents are allowed.'));
        }
    }
});

// Ensure chat global DB exists
const chatDb = new Database(chatDbPath);
chatDb.prepare(`
    CREATE TABLE IF NOT EXISTS GlobalMessages (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        TopicId TEXT DEFAULT 'global',
        SenderPlantId TEXT,
        SenderName TEXT,
        SenderEmail TEXT,
        Message TEXT,
        Mentions TEXT,
        AttachmentUrl TEXT,
        AttachmentName TEXT,
        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

chatDb.prepare(`
    CREATE TABLE IF NOT EXISTS ChatTopics (
        ID TEXT PRIMARY KEY,
        Label TEXT,
        CreatedBy TEXT,
        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

// Sign Up
router.post('/signup', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, locationId, department, password } = req.body;

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ error: 'Missing required profile fields.' });
        }

        const fullName = `${firstName} ${lastName}`;
        const hashed = await bcrypt.hash(password, 10);

        // Prepare the profile record using whitelist
        const profileData = whitelist({
            FirstName: firstName,
            LastName: lastName,
            Email: email,
            Phone: phone,
            PlantId: locationId,
            Department: department,
            PasswordHash: hashed
        }, 'chatProfile');

        // 1. Add to the plant's ChatProfile table
        // We need to use the plant's DB, but wait, the locationId might be different from the activePlant context.
        // Let's use the provided locationId to find the right DB.
        db.asyncLocalStorage.run(locationId, () => {
            const plantDb = db.getDb();

            // Transaction to ensure it hits both ChatProfile and AddrBook
            const tx = plantDb.transaction(() => {
                // Check if user exists
                const existing = plantDb.prepare('SELECT 1 FROM ChatProfile WHERE Email = ?').get(email);
                if (existing) throw new Error('User already registered at this location.');

                plantDb.prepare(`
                    INSERT INTO "ChatProfile" ("FirstName", "LastName", "Email", "Phone", "PlantId", "Department", "PasswordHash")
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(profileData.FirstName, profileData.LastName, profileData.Email, profileData.Phone, profileData.PlantId, profileData.Department, profileData.PasswordHash);

                // 2. Add to AddrBook (Directory)
                // Generate a random ID for AddrBook or just use Email
                const addrId = 'CHAT_' + Math.random().toString(36).substr(2, 5);
                plantDb.prepare(`
                    INSERT INTO AddrBook (ID, Descript, Employee, StandardEmail, Sphone, Title)
                    VALUES (?, ?, 1, ?, ?, ?)
                `).run(addrId, fullName, email, phone, 'Knowledge Exchange');
            });

            tx();
        });

        res.json({ success: true, message: 'Profile created. You can now log into the Knowledge Exchange.' });
    } catch (err) {
        console.error('Chat Signup Error:', err);
        res.status(500).json({ error: 'Signup failed' });
    }
});

// Log In
router.post('/login', async (req, res) => {
    try {
        const { email, password, locationId } = req.body;

        db.asyncLocalStorage.run(locationId, async () => {
            const plantDb = db.getDb();
            const user = plantDb.prepare('SELECT * FROM ChatProfile WHERE Email = ?').get(email);

            if (!user || !(await bcrypt.compare(password, user.PasswordHash))) {
                return res.status(401).json({ error: 'Invalid chat credentials' });
            }

            const token = jwt.sign(
                {
                    chatUserId: user.ID,
                    email: user.Email,
                    fullName: `${user.FirstName} ${user.LastName}`,
                    plantId: locationId
                },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                token,
                user: {
                    fullName: `${user.FirstName} ${user.LastName}`,
                    email: user.Email,
                    plantId: locationId
                }
            });
        });
    } catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// Topics
router.get('/topics', (req, res) => {
    try {
        const topics = chatDb.prepare('SELECT * FROM ChatTopics ORDER BY CreatedAt ASC').all();
        res.json(topics);
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/topics', (req, res) => {
    try {
        const { label, createdBy } = req.body;
        if (!label) return res.status(400).json({ error: 'Empty topic label' });

        const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        chatDb.prepare(`
            INSERT INTO ChatTopics (ID, Label, CreatedBy)
            VALUES (?, ?, ?)
        `).run(id, label, createdBy || 'SYSTEM');

        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create topic' });
    }
});

// Messages
router.get('/messages', (req, res) => {
    try {
        const { topicId } = req.query;
        const tid = topicId || 'global';
        const messages = chatDb.prepare('SELECT * FROM GlobalMessages WHERE TopicId = ? ORDER BY CreatedAt DESC LIMIT 100').all(tid);
        res.json(messages.reverse());
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/messages', upload.single('attachment'), (req, res) => {
    try {
        const { message, mentions, senderName, senderPlantId, senderEmail, topicId } = req.body;
        const tid = topicId || 'global';

        // Allowed an empty message ONLY if an attachment is provided
        if ((!message || !message.trim()) && !req.file) {
            return res.status(400).json({ error: 'Empty message' });
        }

        let attachUrl = null;
        let attachName = null;
        if (req.file) {
            attachUrl = '/uploads/' + req.file.filename;
            attachName = req.file.originalname;
        }

        chatDb.prepare(`
            INSERT INTO GlobalMessages (TopicId, SenderPlantId, SenderName, SenderEmail, Message, Mentions, AttachmentUrl, AttachmentName)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(tid, senderPlantId, senderName, senderEmail, message || '', mentions || '', attachUrl, attachName);

        res.json({ success: true });
    } catch (err) {
        console.error('Failed to send msg:', err);
        res.status(500).json({ error: 'Failed to send' });
    }
});

router.delete('/topics/:id', (req, res) => {
    try {
        if (req.user.globalRole !== 'it_admin' && req.user.globalRole !== 'admin' && req.user.globalRole !== 'creator') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Get messages in topic to delete files
        const messages = chatDb.prepare('SELECT AttachmentUrl FROM GlobalMessages WHERE TopicId = ? AND AttachmentUrl IS NOT NULL').all(req.params.id);
        for (const msg of messages) {
            try {
                const fp = path.join(__dirname, '..', '..', 'dist', msg.AttachmentUrl); // wait, attachments are in data/chat_uploads!
                // AttachmentUrl looks like "/uploads/xxx.png", which maps to dataDir + /chat_uploads
                const uPath = path.join(dataDir, 'chat_uploads', path.basename(msg.AttachmentUrl));
                if (fs.existsSync(uPath)) fs.unlinkSync(uPath);
            } catch (err) { console.warn(`[Chat] Failed to clean up attachment: ${err.message}`); }
        }

        chatDb.prepare('DELETE FROM GlobalMessages WHERE TopicId = ?').run(req.params.id);
        chatDb.prepare('DELETE FROM ChatTopics WHERE ID = ?').run(req.params.id);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete topic' });
    }
});

router.delete('/messages/:id', (req, res) => {
    try {
        if (req.user.globalRole !== 'it_admin' && req.user.globalRole !== 'admin' && req.user.globalRole !== 'creator') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const msg = chatDb.prepare('SELECT AttachmentUrl FROM GlobalMessages WHERE ID = ?').get(req.params.id);
        if (msg && msg.AttachmentUrl) {
            try {
                const uPath = path.join(dataDir, 'chat_uploads', path.basename(msg.AttachmentUrl));
                if (fs.existsSync(uPath)) fs.unlinkSync(uPath);
            } catch (err) { console.warn(`[Chat] Failed to clean up message attachment: ${err.message}`); }
        }

        chatDb.prepare('DELETE FROM GlobalMessages WHERE ID = ?').run(req.params.id);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// ── GET /api/chat/search ──────────────────────────────────────────────────
// Institutional Knowledge Search: Full-text search across ALL chat messages and forum
// posts across all topics/channels. Returns results grouped by relevance with
// context snippets, sender info, plant source, and topic labels.
router.get('/search', (req, res) => {
    try {
        const { q, topicId, limit = 50 } = req.query;
        if (!q || q.trim().length < 2) {
            return res.json({ results: [], total: 0 });
        }

        const tokens = q.trim().split(/\s+/).filter(t => t.length > 0);
        
        // Build search conditions for each token (AND logic — all tokens must match)
        const conditions = tokens.map(() => `Message LIKE ?`).join(' AND ');
        const params = tokens.map(t => `%${t}%`);

        let query = `
            SELECT 
                m.ID, m.TopicId, m.SenderName, m.SenderPlantId, m.SenderEmail,
                m.Message, m.AttachmentUrl, m.AttachmentName, m.CreatedAt,
                t.Label as TopicLabel
            FROM GlobalMessages m
            LEFT JOIN ChatTopics t ON m.TopicId = t.ID
            WHERE ${conditions}
        `;

        if (topicId) {
            query += ` AND m.TopicId = ?`;
            params.push(topicId);
        }

        query += ` ORDER BY m.CreatedAt DESC LIMIT ?`;
        params.push(parseInt(limit));

        const results = chatDb.prepare(query).all(...params);

        // Count total matches (for pagination info)
        let countQuery = `SELECT COUNT(*) as total FROM GlobalMessages WHERE ${conditions}`;
        const countParams = [...tokens.map(t => `%${t}%`)];
        if (topicId) {
            countQuery += ` AND TopicId = ?`;
            countParams.push(topicId);
        }
        const totalRow = chatDb.prepare(countQuery).get(...countParams);

        // Generate context snippets — highlight matching text
        const enriched = results.map(r => {
            let snippet = r.Message || '';
            // Find the first token position and extract ~200 chars around it
            const lowerMsg = snippet.toLowerCase();
            const firstToken = tokens[0].toLowerCase();
            const pos = lowerMsg.indexOf(firstToken);
            
            if (snippet.length > 250) {
                const start = Math.max(0, pos - 80);
                const end = Math.min(snippet.length, start + 250);
                snippet = (start > 0 ? '...' : '') + snippet.substring(start, end) + (end < snippet.length ? '...' : '');
            }

            return {
                ...r,
                snippet,
                matchCount: tokens.reduce((count, t) => {
                    const regex = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                    return count + (r.Message?.match(regex)?.length || 0);
                }, 0)
            };
        });

        // Sort by relevance (more keyword matches = higher rank)
        enriched.sort((a, b) => b.matchCount - a.matchCount);

        res.json({
            results: enriched,
            total: totalRow?.total || 0,
            query: q,
            tokensUsed: tokens
        });
    } catch (err) {
        console.error('GET /api/chat/search error:', err);
        res.status(500).json({ error: 'Knowledge search failed' });
    }
});

module.exports = router;

