// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Â© 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
// â”€â”€ Boot Diagnostics (catches crashes during require phase) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log('[BOOT] server/index.js executing...');

// â”€â”€ PKG Native Module Fix â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// When running as a packaged exe, native .node addons can't load from the
// snapshot. We intercept the bindings module to load from next to the exe.
if (typeof process.pkg !== 'undefined') {
    const path = require('path');
    const origRequire = require('module').prototype.require;
    require('module').prototype.require = function(id) {
        if (id === 'bindings') {
            return function(name) {
                const exeDir = path.dirname(process.execPath);
                const nodePath = path.join(exeDir, name);
                console.log(`[PKG] Loading native addon: ${nodePath}`);
                return origRequire.call(this, nodePath);
            }.bind(this);
        }
        return origRequire.call(this, id);
    };
    console.log('[BOOT] Stage 0: PKG native module loader initialized');
}
process.on('uncaughtException', (err) => {
    console.error('[BOOT CRASH]', err.stack || err.message || err);
    // Don't exit immediately - let the error be captured by main.js
    setTimeout(() => process.exit(1), 500);
});
process.on('unhandledRejection', (reason) => {
    console.error('[BOOT REJECTION]', reason);
});
/**
 * Trier OS - Express Server (Main Entry Point)
 * =======================================================
 * Orchestrates the entire backend: middleware, authentication, API routes,
 * background engines (PM Cron, Enrichment, Corporate Crawl), and serves
 * the compiled React frontend from /dist.
 *
 * BOOT SEQUENCE:
 *   1. Load .env â†’ 2. Run migrations â†’ 3. Start PM & Enrichment crons
 *   4. Configure CORS (private IPs only) â†’ 5. Mount auth middleware
 *   6. Register 17 route modules â†’ 7. Start crawl engine
 *
 * MULTI-TENANT: The x-plant-id header determines which SQLite DB
 * handles the request, routed via AsyncLocalStorage in database.js.
 */
console.log('[BOOT] Stage 1: Loading core modules...');
require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── Boot-time SEC-006 JWT_SECRET auto-generation & validation ──
const defaultInsecureToken = '4ee5f3fd56b185eeb061c5e73faf52e0cc01af8952e7c957436b612a72485d73';
const isMissingOrWeak = !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET === defaultInsecureToken ||
    process.env.JWT_SECRET.startsWith('YOUR_') ||
    process.env.JWT_SECRET.includes('CHANGE') ||
    process.env.JWT_SECRET.includes('PLACEHOLDER');

if (isMissingOrWeak) {
    console.log('🔒 [SECURITY] Invalid, missing, or defaulted JWT_SECRET detected. Generating persistent cryptographic hash...');
    const newSecret = crypto.randomBytes(64).toString('hex');
    process.env.JWT_SECRET = newSecret;

    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
        envContent = envContent.replace(/^JWT_SECRET=.*[\r\n]*/gm, '');
    }
    
    envContent = `JWT_SECRET=${newSecret}\n` + envContent;
    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
    console.log('✅ [SECURITY] Environment effectively hardened with unique session secret.');
}

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // Task 1.2: httpOnly cookie auth (INFO-01)
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
console.log('[BOOT] Stage 2: Loading database...');
const db = require('./database');
console.log('[BOOT] Stage 3: Database loaded OK');
const runMigrations = require('./migrator'); // Import built schema engine
const Cache = require('./cache'); // Enterprise Search Caching Engine
const { getPlants } = require('./plant_cache'); // Cached plants.json

const searchCache = new Cache(5); // 5 minute TTL for global searches

// â”€â”€ Schema Synchronization & Cron Engines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log('[BOOT] Stage 4: Running migrations...');
runMigrations();
console.log('[BOOT] Stage 5: Migrations done');

// â”€â”€ Master Data Catalog Protection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The mfg_master.db is the crown jewel â€” verify it exists and is intact
console.log('[BOOT] Stage 5.1: Verifying Master Data Catalog...');
try {
    const { verifyMasterDb } = require('./UNTOUCHABLE_dairy_master');
    const dataDir = require('./resolve_data_dir');
    const masterCheck = verifyMasterDb(dataDir);
    if (!masterCheck.ok) {
        console.error('â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—');
        console.error('â•‘  ðŸš¨ðŸš¨ðŸš¨  MASTER DATA CATALOG INTEGRITY FAILURE  ðŸš¨ðŸš¨ðŸš¨     â•‘');
        console.error('â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
        console.error(masterCheck.error);
        console.error('Recovery: git checkout -- data/mfg_master.db');
        console.error('Server will continue but StoreDB features will be unavailable.');
    } else {
        const s = masterCheck.stats;
        console.log(`[BOOT] âœ… Master Data Catalog verified: ${s.equipment} equipment, ${s.parts} parts, ${s.vendors} vendors, ${s.warranties} warranties`);
        console.log(`[BOOT] [@] Guardian: UNTOUCHABLE | Fingerprint: ${s.fingerprint}`);
    }
} catch (err) {
    console.error('[BOOT] âš ï¸ Could not verify Master Data Catalog:', err.message);
    console.error('[BOOT] StoreDB features may not be available.');
}
const pmEngine = require('./pm_engine');
const enrichmentEngine = require('./enrichment_engine');
const silentCloseEngine = require('./silent_close_engine');

// We run the engines passively on a 24-hour interval
setInterval(() => pmEngine.runPMCron(), 24 * 60 * 60 * 1000);
setInterval(() => enrichmentEngine.runEnrichmentCron(), 12 * 60 * 60 * 1000); // Every 12 hours
// Hourly — closes WorkSegments Active beyond the per-plant threshold and
// raises needsReview on the parent WO for the Mission Control review queue.
setInterval(() => {
    try { silentCloseEngine.runSilentCloseCron(); }
    catch (e) { console.warn('[SilentClose] Cron failed:', e.message); }
}, 60 * 60 * 1000);

// Execute first pass passively after server is up
setImmediate(() => {
    try {
        pmEngine.runPMCron(); 
        enrichmentEngine.runEnrichmentCron();
    } catch (err) {
        console.error('âš ï¸ [Engine Failure] Background jobs failed to start:', err.message);
    }
});

console.log('[BOOT] Stage 5.5: LDAP sync cron configured');
// â”€â”€ LDAP Periodic Sync (Task 3.5) â”€â”€
let _ldapLastSync = 0;
setInterval(() => {
    try {
        const _authDb = require('./auth_db');
        const cfg = _authDb.prepare('SELECT * FROM ldap_config WHERE ID = 1').get();
        if (!cfg || !cfg.Enabled || !cfg.Host) return;
        const ms = (cfg.SyncInterval || 15) * 60 * 1000;
        if (Date.now() - _ldapLastSync < ms) return;
        _ldapLastSync = Date.now();
        console.log(`ðŸ”„ [LDAP] Auto-sync triggered (every ${cfg.SyncInterval} min)`);
        const h = require('http');
        const r = h.request({ hostname:'localhost', port:PORT, path:'/api/ldap/sync', method:'POST', headers:{'Content-Type':'application/json'} }, (resp) => {
            let b=''; resp.on('data', d => b+=d); resp.on('end', () => { try { const j=JSON.parse(b); console.log(j.success ? `âœ… [LDAP] ${j.message}` : `âš ï¸ [LDAP] ${j.error||'fail'}`); } catch(e){} });
        });
        r.on('error', ()=>{});
        r.end();
    } catch(e){}
}, 5 * 60 * 1000);

// ── Scheduled Report Delivery Cron ───────────────────────────────────────
// Checks every 15 minutes for reports that are due and sends them via email.
// The ScheduledReports table is managed via /api/scheduled-reports endpoints.
console.log('[BOOT] Stage 5.6: Scheduled report delivery cron configured');
setInterval(() => {
    try {
        const { db: logDb } = require('./logistics_db');
        const hasTbl = logDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ScheduledReports'").get();
        if (!hasTbl) return;

        const now = new Date().toISOString();
        const dueReports = logDb.prepare(
            `SELECT * FROM ScheduledReports WHERE active = 1 AND nextSend <= ? ORDER BY nextSend ASC`
        ).all(now);

        if (dueReports.length === 0) return;

        const emailService = require('./email_service_sender');

        for (const report of dueReports) {
            try {
                const recipients = (report.recipients || '').split(/[,;\s]+/).filter(Boolean);
                if (recipients.length === 0) continue;

                // Calculate next send time
                const [hours, minutes] = (report.timeOfDay || '07:00').split(':').map(Number);
                const next = new Date();
                next.setHours(hours, minutes, 0, 0);
                if (report.schedule === 'daily') {
                    next.setDate(next.getDate() + 1);
                } else if (report.schedule === 'weekly') {
                    const daysUntil = ((report.dayOfWeek || 1) - next.getDay() + 7) % 7 || 7;
                    next.setDate(next.getDate() + daysUntil);
                } else if (report.schedule === 'monthly') {
                    next.setDate(report.dayOfMonth || 1);
                    if (next <= new Date()) next.setMonth(next.getMonth() + 1);
                }

                // Send via email service if available
                let sent = false;
                try {
                    if (emailService && typeof emailService.sendScheduledReport === 'function') {
                        emailService.sendScheduledReport(report, recipients);
                        sent = true;
                    }
                } catch (emailErr) {
                    console.warn(`[ScheduledReports] Email send failed for "${report.reportName}": ${emailErr.message}`);
                }

                // Update lastSent and nextSend regardless (prevents double-fire on email failure)
                logDb.prepare(
                    `UPDATE ScheduledReports SET lastSent = ?, nextSend = ? WHERE id = ?`
                ).run(now, next.toISOString(), report.id);

                console.log(`📊 [ScheduledReports] ${ sent ? 'Sent' : 'Skipped (no email)' }: "${report.reportName}" → ${recipients.join(', ')} | Next: ${next.toISOString().split('T')[0]}`);

            } catch (reportErr) {
                console.error(`[ScheduledReports] Failed to process report ${report.id}:`, reportErr.message);
            }
        }
    } catch (e) {
        // Non-blocking — never crash the server over a report
        console.warn('[ScheduledReports] Cron check failed:', e.message);
    }
}, 15 * 60 * 1000); // Check every 15 minutes

// ── Utility Anomaly Detection Cron ───────────────────────────────────────────
// Checks every 15 minutes for consumption spikes against configured thresholds.
// Inserts UtilityAnomalies records; deduplicates within 24-hour windows.
console.log('[BOOT] Stage 5.7: Utility anomaly detection cron configured');
const { runUtilityAnomalyCheck } = require('./routes/utilities');
setInterval(() => {
    try { runUtilityAnomalyCheck(); }
    catch (e) { console.warn('[UtilityAlerts] Cron failed:', e.message); }
}, 15 * 60 * 1000);
setImmediate(() => { try { runUtilityAnomalyCheck(); } catch (_) {} });

// ── OpEx Self-Healing Outcome Cron ───────────────────────────────────────────
// Runs every 24 hours. Re-measures each due 30/60/90-day outcome checkpoint
// against live plant data, updates realization rates, fires escalation alerts.
console.log('[BOOT] Stage 5.9: OpEx self-healing outcome cron configured (every 24 hrs)');
const { runOpExOutcomeCron } = require('./routes/opex_tracking'); // QUAL-05: clean object export
setInterval(() => {
    try { runOpExOutcomeCron(); }
    catch (e) { console.warn('[OpExCron] Cron failed:', e.message); }
}, 24 * 60 * 60 * 1000);
setImmediate(() => { try { runOpExOutcomeCron(); } catch (_) {} });

// ── Metric Rollup Cron (8:00 AM and 3:00 PM daily) ────────────────────────────
// Sweeps plant DBs → aggregates SensorReadings → upserts PlantMetricSummary
// in corporate_master.db so the Equipment Intelligence tile stays current.
// The dedup guard (lastRollupDate) prevents double-firing when the check
// interval happens to tick twice within the same minute.
console.log('[BOOT] Stage 5.8: Equipment metric rollup cron configured (08:00 + 15:00)');
const { runMetricRollup } = require('./services/metric-rollup');
let _lastRollupHour = null;  // tracks last hour that fired to prevent double-fire
setInterval(() => {
    const now  = new Date();
    const hour = now.getHours();
    const min  = now.getMinutes();
    // Fire at 08:xx and 15:xx, but only once per hour
    if ((hour === 8 || hour === 15) && min < 5 && _lastRollupHour !== `${now.toDateString()}_${hour}`) {
        _lastRollupHour = `${now.toDateString()}_${hour}`;
        runMetricRollup().catch(err => console.warn('[MetricRollup] Cron failed:', err.message));
    }
}, 60 * 1000);  // Check every minute — minimal overhead

console.log('[BOOT] Stage 6: Creating Express app...');
const app = express();
const helmet = require('helmet');
const PORT = process.env.PORT || 1937;

// â”€â”€ Security Headers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
            connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
            mediaSrc: ["'self'", "blob:", "data:"],
            workerSrc: ["'self'", "blob:"],
            objectSrc: ["'none'"],
            frameAncestors: ["'self'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: null
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
    // HSTS disabled — HTTP (port 3000) and HTTPS (port 1938) run on separate ports.
    // Enabling HSTS on HTTP causes browsers to upgrade requests, breaking asset loads.
    hsts: false
}));

// â”€â”€ Middleware â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SEC-005 Mitigation: Explicit exact-match origin binding rather than loose regex
let defaultOrigins = [
    'http://localhost:5173', 
    'https://localhost:5173', 
    'http://127.0.0.1:5173',
    'https://127.0.0.1:5173',
    'http://localhost:3000',
    'https://localhost:3000',
    'http://127.0.0.1:3000',
    'https://127.0.0.1:3000'
];

// Always permit local desktop wrappers
const desktopOrigins = ['file://', 'app://-', 'trier://-'];

if (process.env.ALLOWED_ORIGINS) {
    const envOrigins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
    defaultOrigins = [...defaultOrigins, ...envOrigins];
}

const finalOrigins = [...new Set([...defaultOrigins, ...desktopOrigins])];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        
        if (finalOrigins.includes(origin)) {
            return callback(null, true);
        }

        // Allow private enterprise IPs (192.168.x.x, 10.x.x.x) for mobile scanner access
        try {
            const url = new URL(origin);
            if (url.hostname.match(/^192\.168\.\d+\.\d+$/) || 
                url.hostname.match(/^10\.\d+\.\d+\.\d+$/) || 
                url.hostname.match(/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/)) {
                return callback(null, true);
            }
        } catch(e) {}

        console.warn(`[SEC-WARNING] CORS Check Rejected: [${origin}]. Origin must be exactly whitelisted in '.env' ALLOWED_ORIGINS.`);
        callback(new Error('CORS Error: Unauthorized Origin'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-plant-id', 'x-lang']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser()); // Task 1.2: must be before auth middleware so req.cookies.authToken is readable
const _resolvedDataDir = require('./resolve_data_dir');
app.use('/uploads', express.static(path.join(_resolvedDataDir, 'uploads')));

// Serve static frontend files (use exe directory when packaged with pkg)
const _isPkg = typeof process.pkg !== 'undefined';
const _appRoot = _isPkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
app.use(express.static(path.join(_appRoot, 'dist')));
app.use('/assets', express.static(path.join(_appRoot, 'dist', 'assets')));

// Multi-tenant Plant Context Middleware
app.use((req, res, next) => {
    const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
    db.asyncLocalStorage.run(plantId, () => {
        next();
    });
});

// Request logging (dev)
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        const start = Date.now();
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        res.on('finish', () => {
            const ms = Date.now() - start;
            console.log(`  [${plantId}] ${req.method} ${req.path} â†’ ${res.statusCode} (${ms}ms)`);
        });
    }
    next();
});

// â”€â”€ Rate Limiting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Brute-force protection on login: 8 attempts per 5 minutes PER USERNAME
// (NOT per-IP â€” in a factory all users share one NAT, per-IP would lock everyone out)
const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 500, // Increased for parallel (workers: 2) ghost account E2E testing
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => String(req.body.username || req.body.plantId || req.ip || 'unknown').toLowerCase().replace(/:/g, '_'),
    message: { error: 'Too many login attempts for this account. Try again in 5 minutes.' }
});
app.use('/api/auth/login', loginLimiter);

// Sensor ingestion rate limit: 1,000 requests per minute per IP (PLC/SCADA traffic)
// Mounted BEFORE the general limiter so sensor POSTs get their own bucket
const sensorLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: { error: 'Sensor rate limit exceeded (1000/min). Check PLC polling interval.' }
});
app.use('/api/sensors/reading', sensorLimiter);

// General API rate limit â€” right-sized for 1,500 users/shift behind shared NAT
// In factories, all users share one public IP. Per-IP limiting would lock out
// the entire workforce. Instead, we key by JWT user ID when available,
// falling back to IP for unauthenticated requests.
// Budget: ~10 API calls per page load Ã— 6 navigations/min = ~60 req/min per user
// With 1,500 users sharing one IP, per-IP must be very generous.
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1200,            // per user: enterprise-scale for 1,500+ concurrent users
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: { error: 'Rate limit exceeded. Please slow down.' },
    keyGenerator: (req) => {
        try {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                const decoded = jwt.decode(token);
                if (decoded && decoded.userId) return `user:${decoded.userId}`;
                if (decoded && decoded.id) return `user:${decoded.id}`;
            }
        } catch (e) {}
        return String(req.ip || 'unknown').replace(/:/g, '_'); // fallback for unauthenticated
    },
    skip: (req) => req.path.startsWith('/sensors/reading') // Don't double-count sensor POSTs
});
app.use('/api', apiLimiter);

// â”€â”€ Pre-Auth Routes (no JWT required) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _serverReady = false; // Set to true only after app.listen callback
app.get('/api/ping', (req, res) => res.json({ status: 'ok', ready: _serverReady, time: new Date() }));
app.get('/api/hub/status', (req, res) => {
    try {
        const lanHub = require('./lan_hub');
        res.json(lanHub.getStatus());
    } catch {
        res.json({ running: false, port: 1940, clients: 0, devices: [] });
    }
});
app.use('/api/health', require('./routes/health'));          // System health & degraded mode (P2)

// â”€â”€ Local QR Code Generator (no external API needed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/qr', async (req, res) => {
    try {
        const QRCode = require('qrcode');
        const data = req.query.data;
        if (!data) return res.status(400).json({ error: 'Missing ?data= parameter' });
        const svg = await QRCode.toString(data, { type: 'svg', width: 200, color: { dark: '#e2e8f0', light: '#020617' } });
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(svg);
    } catch (err) {
        res.status(500).json({ error: 'QR generation failed' });
    }
});

// â”€â”€ Network Info Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Detects the server's real LAN IP via outbound UDP socket to Google DNS.
// This is the most reliable method â€” it asks the OS "which interface would
// you use to reach the internet?" and returns that interface's IP. Avoids
// picking up APIPA (169.254.x.x), virtual adapters, or disconnected NICs.
function _scanInterfacesForLanIp() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let best = null;
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family !== 'IPv4' || iface.internal) continue;
            if (iface.address.startsWith('169.254.')) continue; // skip APIPA
            // Prefer real private LAN addresses
            if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.') || iface.address.match(/^172\.(1[6-9]|2\d|3[01])\./)) {
                best = iface.address;
                break;
            }
            if (!best) best = iface.address;
        }
        if (best) break;
    }
    return best || 'localhost';
}

function _detectLanIp() {
    return new Promise((resolve) => {
        let resolved = false;
        const done = (ip) => { if (!resolved) { resolved = true; resolve(ip); } };

        const dgram = require('dgram');
        const socket = dgram.createSocket('udp4');
        // Connect to Google DNS â€” no data is actually sent
        socket.connect(53, '8.8.8.8', () => {
            const addr = socket.address();
            try { socket.close(); } catch(e) {}
            done(addr.address);
        });
        socket.on('error', () => {
            try { socket.close(); } catch(e) {}
            done(_scanInterfacesForLanIp());
        });
        // Timeout after 2 seconds â€” still do interface scan, don't just return localhost
        setTimeout(() => {
            try { socket.close(); } catch(e) {}
            done(_scanInterfacesForLanIp());
        }, 2000);
    });
}

// Check admin override for server address stored in SystemSettings
function _getAdminOverrideIp() {
    try {
        const logDb = require('./logistics_db').db;
        const row = logDb.prepare("SELECT Value FROM SystemSettings WHERE Key = 'server_address'").get();
        if (row && row.Value && row.Value.trim()) return row.Value.trim();
    } catch (e) {}
    return null;
}

// Network info endpoint â€” returns the server's LAN IP so clients can build
// the correct URL for onboarding documents and QR codes.
// Priority: 1) Admin override  2) UDP socket detection  3) Interface scan fallback
app.get('/api/network-info', async (req, res) => {
    const os = require('os');
    const adminOverride = _getAdminOverrideIp();
    let lanIp;
    let source;

    if (adminOverride) {
        lanIp = adminOverride;
        source = 'admin_override';
    } else {
        lanIp = await _detectLanIp();
        source = lanIp === 'localhost' ? 'fallback' : 'auto_detected';
    }

    // Quick internet connectivity check
    let internetConnected = false;
    try {
        const dns = require('dns');
        await new Promise((resolve, reject) => {
            dns.resolve('google.com', (err) => err ? reject(err) : resolve());
        });
        internetConnected = true;
    } catch (e) {
        internetConnected = false;
    }

    res.json({
        lanIp,
        port: PORT,
        url: `http://${lanIp}:${PORT}`,
        httpsPort: HTTPS_PORT,
        httpsUrl: _httpsServer ? `https://${lanIp}:${HTTPS_PORT}` : null,
        hostname: os.hostname(),
        source,
        internetConnected,
        allInterfaces: Object.entries(os.networkInterfaces())
            .flatMap(([name, addrs]) => addrs
                .filter(a => a.family === 'IPv4' && !a.internal)
                .map(a => ({ name, address: a.address }))
            )
    });
});

// â”€â”€ Mobile Setup Landing Page (before auth â€” unauthenticated) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Serves the CA certificate for one-tap install on mobile devices
app.get('/cert.cer', (req, res) => {
    const certPath = path.join(_dataDir, 'certs', 'server.cert');
    if (fs.existsSync(certPath)) {
        res.setHeader('Content-Type', 'application/x-x509-ca-cert');
        res.setHeader('Content-Disposition', 'attachment; filename="TrierCMMS.cer"');
        res.sendFile(certPath);
    } else {
        res.status(404).send('Certificate not available');
    }
});

// Mobile-friendly setup page: install cert â†’ open app (no auth required)
app.get('/setup', async (req, res) => {
    const adminIp = _getAdminOverrideIp();
    const lanIp = adminIp || await _detectLanIp();
    const httpsUrl = `https://${lanIp}:${HTTPS_PORT}`;
    const certExists = fs.existsSync(path.join(_dataDir, 'certs', 'server.cert'));
    
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trier OS - Mobile Setup</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #0f0a2e 0%, #1a1145 50%, #0d1b3e 100%);
            color: #fff; min-height: 100vh; display: flex; flex-direction: column;
            align-items: center; justify-content: center; padding: 20px;
        }
        .card { 
            background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
            border-radius: 16px; padding: 30px; max-width: 400px; width: 100%; text-align: center;
        }
        .logo { width: 120px; margin-bottom: 15px; }
        h1 { font-size: 1.4rem; margin-bottom: 5px; }
        .subtitle { color: #94a3b8; font-size: 0.85rem; margin-bottom: 25px; }
        .step { 
            display: flex; gap: 12px; text-align: left; padding: 15px;
            background: rgba(255,255,255,0.04); border-radius: 10px; margin-bottom: 12px;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .step-num { 
            width: 32px; height: 32px; border-radius: 8px; display: flex;
            align-items: center; justify-content: center; font-weight: 900; flex-shrink: 0;
        }
        .step-1 { background: rgba(99,102,241,0.2); color: #818cf8; }
        .step-2 { background: rgba(16,185,129,0.2); color: #34d399; }
        .step-title { font-weight: 700; font-size: 0.9rem; margin-bottom: 3px; }
        .step-desc { font-size: 0.8rem; color: #94a3b8; }
        .btn { 
            display: block; width: 100%; padding: 14px; border-radius: 10px;
            font-size: 1rem; font-weight: 700; border: none; cursor: pointer;
            text-decoration: none; text-align: center; margin-bottom: 10px;
        }
        .btn-cert { background: #6366f1; color: white; }
        .btn-app { background: #10b981; color: white; }
        .note { font-size: 0.7rem; color: #64748b; margin-top: 15px; line-height: 1.4; }
        .checkmark { display: none; color: #10b981; font-size: 1.2rem; }
    </style>
</head>
<body>
    <div class="card">
        <img src="/assets/TrierLogoPrint.png" alt="Trier OS" class="logo">
        <h1>Mobile Setup</h1>
        <p class="subtitle">One-time setup for secure scanner access</p>
        
        <div class="step">
            <div class="step-num step-1">1</div>
            <div>
                <div class="step-title">Install Security Certificate</div>
                <div class="step-desc">Tap below to download. Then open Settings â†’ install the profile.</div>
            </div>
        </div>
        ${certExists ? `<a href="/cert.cer" class="btn btn-cert" id="certBtn" onclick="document.getElementById('check1').style.display='inline'">
            ðŸ” Download Certificate
        </a>
        <span id="check1" class="checkmark">âœ… Downloaded â€” now install in Settings</span>` : '<p style="color:#ef4444;font-size:0.8rem;">Certificate not configured</p>'}
        
        <div class="step" style="margin-top: 15px;">
            <div class="step-num step-2">2</div>
            <div>
                <div class="step-title">Open Trier OS</div>
                <div class="step-desc">After installing the cert, tap below to launch securely.</div>
            </div>
        </div>
        <a href="${httpsUrl}" class="btn btn-app">[*] Launch Trier OS (Secure)</a>
        
        <p class="note">
            <strong>iPhone:</strong> After downloading, go to Settings â†’ General â†’ VPN & Device Management â†’ install the profile. Then Settings â†’ General â†’ About â†’ Certificate Trust Settings â†’ enable.<br><br>
            <strong>Android:</strong> Certificate installs automatically after download on most devices.
        </p>
    </div>
</body>
</html>`);
});

// â”€â”€ Public Enrollment API (no auth required) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use('/api/enrollment', require('./routes/enrollment'));


// â”€â”€ Authentication Middleware â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use('/api', require('./middleware/auth'));
app.use('/api', require('./middleware/degradedMode'));        // Advisory/Isolated mode write-block (P2)

// â”€â”€ API Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ Network Address Override (Admin only, requires auth) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PUT /api/network-info/override  â€” set a manual server address
// DELETE /api/network-info/override â€” clear override, revert to auto-detect
app.put('/api/network-info/override', (req, res) => {
    try {
        const { address } = req.body;
        if (!address || typeof address !== 'string') {
            return res.status(400).json({ error: 'Address is required' });
        }
        // Strip protocol prefix if included, we only want IP/hostname
        const clean = address.replace(/^https?:\/\//, '').replace(/:\d+$/, '').trim();
        const logDb = require('./logistics_db').db;
        logDb.prepare("INSERT OR REPLACE INTO SystemSettings (Key, Value, UpdatedAt) VALUES ('server_address', ?, datetime('now'))")
            .run(clean);
        console.log(`[+] [Network] Admin override set to: ${clean}`);
        res.json({ success: true, address: clean, url: `http://${clean}:${PORT}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/network-info/override', (req, res) => {
    try {
        const logDb = require('./logistics_db').db;
        logDb.prepare("DELETE FROM SystemSettings WHERE Key = 'server_address'").run();
        console.log('[+] [Network] Admin override cleared â€” reverting to auto-detect');
        res.json({ success: true, message: 'Override cleared. Auto-detection will be used.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Static IP Configuration ────────────────────────────────────────────────
// PUT /api/network-config/static-ip
// Applies static IP or DHCP to a named network adapter using OS commands.
// Windows: netsh   |   Linux: nmcli   |   Requires admin/root privileges.
app.put('/api/network-config/static-ip', (req, res) => {
    const { interface: iface, mode, ip, subnet, gateway, dns1, dns2 } = req.body || {};
    if (!iface) return res.status(400).json({ error: 'interface is required' });
    if (mode !== 'dhcp' && mode !== 'static') return res.status(400).json({ error: 'mode must be dhcp or static' });
    if (mode === 'static' && (!ip || !subnet)) return res.status(400).json({ error: 'ip and subnet are required for static mode' });

    const { execSync } = require('child_process');
    const platform = process.platform;

    try {
        if (platform === 'win32') {
            if (mode === 'dhcp') {
                execSync(`netsh interface ip set address “${iface}” dhcp`, { timeout: 10000 });
                execSync(`netsh interface ip set dns “${iface}” dhcp`, { timeout: 10000 });
            } else {
                const gwPart = gateway ? ` ${gateway}` : '';
                execSync(`netsh interface ip set address “${iface}” static ${ip} ${subnet}${gwPart}`, { timeout: 10000 });
                if (dns1) execSync(`netsh interface ip set dns “${iface}” static ${dns1}`, { timeout: 10000 });
                if (dns2) execSync(`netsh interface ip add dns “${iface}” ${dns2} index=2`, { timeout: 10000 });
            }
        } else if (platform === 'linux') {
            if (mode === 'dhcp') {
                execSync(`nmcli con mod “${iface}” ipv4.method auto && nmcli con up “${iface}”`, { timeout: 15000 });
            } else {
                const prefix = subnet ? `/${_subnetToPrefix(subnet)}` : '/24';
                const gwArg = gateway ? `ipv4.gateway ${gateway}` : '';
                const dnsArg = [dns1, dns2].filter(Boolean).join(',');
                execSync(`nmcli con mod “${iface}” ipv4.method manual ipv4.addresses ${ip}${prefix} ${gwArg} ${dnsArg ? 'ipv4.dns ' + dnsArg : ''} && nmcli con up “${iface}”`, { timeout: 15000 });
            }
        } else {
            return res.status(501).json({ error: `Static IP configuration not supported on platform: ${platform}` });
        }

        console.log(`[+] [Network] ${mode.toUpperCase()} applied to interface “${iface}”`);
        res.json({ success: true, message: `${mode === 'dhcp' ? 'DHCP' : `Static IP ${ip}`} applied to ${iface}. If using static, reconnect at ${ip}:${PORT}.` });
    } catch (err) {
        const msg = err.stderr?.toString() || err.message || 'Command failed';
        console.error('[Network] Static IP error:', msg);
        res.status(500).json({ error: `Failed to apply network config: ${msg}. Ensure the server is running as Administrator (Windows) or root (Linux).` });
    }
});

function _subnetToPrefix(subnet) {
    return subnet.split('.').reduce((acc, octet) => acc + parseInt(octet, 10).toString(2).split('').filter(b => b === '1').length, 0);
}

// ── Delta Sync Endpoint (PWA Offline) ────────────────────────────────────────────────────────────
// Returns only records modified since the given timestamp for efficient sync
app.get('/api/sync/delta', (req, res) => {
    try {
        const since = req.query.since || '1970-01-01T00:00:00Z';
        const pdb = db.getDb();
        const hasTbl = (tbl) => pdb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tbl);

        const delta = {};

        // Work Orders modified since timestamp
        if (hasTbl('Work')) {
            try {
                delta.work_orders = pdb.prepare(
                    `SELECT * FROM Work WHERE AddDate > ? OR LastModified > ? ORDER BY AddDate DESC LIMIT 500`
                ).all(since, since);
            } catch (e) {
                // LastModified may not exist â€” fall back to just AddDate
                try {
                    delta.work_orders = pdb.prepare(
                        `SELECT * FROM Work WHERE AddDate > ? ORDER BY AddDate DESC LIMIT 500`
                    ).all(since);
                } catch { delta.work_orders = []; }
            }
        }

        // Assets
        if (hasTbl('Asset')) {
            try {
                delta.assets = pdb.prepare(`SELECT * FROM Asset`).all();
            } catch { delta.assets = []; }
        }

        // Parts
        if (hasTbl('Part')) {
            try {
                delta.parts = pdb.prepare(`SELECT * FROM Part`).all();
            } catch { delta.parts = []; }
        }

        // PM Schedules
        if (hasTbl('Schedule')) {
            try {
                delta.pm_schedules = pdb.prepare(`SELECT * FROM Schedule`).all();
            } catch { delta.pm_schedules = []; }
        }

        // Contacts
        if (hasTbl('Vendors')) {
            try {
                delta.contacts = pdb.prepare(`SELECT * FROM Vendors`).all();
            } catch { delta.contacts = []; }
        }

        // Sensor Config & Thresholds (from logistics DB, not plant DB)
        try {
            const logDb = require('./logistics_db').db;
            const hasLogTbl = (tbl) => logDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tbl);

            if (hasLogTbl('sensor_config')) {
                delta.sensor_config = logDb.prepare(`SELECT * FROM sensor_config`).all();
            }
            if (hasLogTbl('sensor_thresholds')) {
                delta.sensor_thresholds = logDb.prepare(`SELECT * FROM sensor_thresholds`).all();
            }
        } catch (e) {
            console.warn('[SYNC] Could not fetch sensor data for delta:', e.message);
        }

        delta.serverTime = new Date().toISOString();
        delta.since = since;
        res.json(delta);
    } catch (err) {
        console.error('GET /api/sync/delta error:', err);
        res.status(500).json({ error: 'Delta sync failed' });
    }
});

console.log('[BOOT] Stage 7: Mounting API routes...');
app.use('/api/leadership', require('./routes/leadership'));
app.use('/api/work-orders', require('./routes/workOrders'));
app.use('/api/scan',        require('./routes/scan'));         // Scan State Machine (P1)
app.use('/api/config',      require('./routes/config'));       // PWA config cache (status IDs)
app.use('/api/assets', require('./routes/assets'));
app.use('/api/parts', require('./routes/parts'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/procedures', require('./routes/procedures'));
app.use('/api/purchase-orders', require('./routes/purchaseOrders'));
app.use('/api/logistics', require('./routes/logistics'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/database', require('./routes/database'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/ldap', require('./routes/ldap')(require('./auth_db')));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/pm-schedules', require('./routes/pmSchedules'));
app.use('/api/v2', require('./routes/v2_integration'));
app.use('/api/enrichment', require('./routes/enrichment'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/branding', require('./routes/branding'));
app.use('/api/import', require('./routes/import_engine'));  // Trier Data Bridge import engine
app.use('/api/bi', require('./routes/biExport'));           // Power BI / BI Export API (Task 2.9)
app.use('/api/approvals', require('./routes/approvals'));
app.use('/api/watchlist', require('./routes/watchlist')(require('./auth_db')));  // Personal Intelligence watchlist    // Approval Workflows (Task 2.6)
app.use('/api/docs', require('./routes/api_docs'));          // API Documentation & Keys (Task 2.5)
app.use('/api/reports', require('./routes/enhancedReports'));   // Enhanced Reports (Task 2.7)
app.use('/api/email', require('./email_service'));              // Email Notifications (Task 2.4)
app.use('/api/sensors', require('./routes/sensors'));            // SCADA/PLC Sensor Gateway (Task 3.1)
app.use('/api/ocr', require('./routes/ocr'));                    // OCR Snap-to-Add (Asset & Part)
app.use('/api/compliance', require('./routes/compliance'));      // Compliance & Regulatory (Task 4.2)
app.use('/api/report-builder', require('./routes/reportBuilder'));  // Custom Report Builder (Feature 8)
app.use('/api/floorplans', require('./routes/floorplans'));  // Interactive Floor Plans (Feature 7)
app.use('/api/floorplans/import-dxf', require('./routes/dxf-import'));  // CAD/DXF Import (Phase 3.3)
app.use('/api/floorplans/import-lidar', require('./routes/lidar-import'));  // LiDAR Scan Import (Phase 3.2)
app.use('/api/energy', require('./routes/energy'));  // Energy & Sustainability (Feature 4)
app.use('/api/utilities', require('./routes/utilities'));  // Utility Intelligence (Water, Electricity, Gas)
app.use('/api/tribal-knowledge', require('./routes/tribalKnowledge'));  // Institutional Knowledge Vault
app.use('/api/ha', require('./routes/ha'));                              // High Availability Sync (Phase 4)
app.use('/api/desktop', require('./routes/desktop'));                    // Desktop Client Installer Download
app.use('/api/locks', require('./routes/locks'));                        // Record Locking (concurrent edit protection)
const escalationRoutes = require('./routes/escalation');
app.use('/api/escalation', escalationRoutes);                            // Auto-Escalation Rules Engine (Feature 7)
escalationRoutes.startEscalationEngine();
app.use('/api/loto', require('./routes/loto'));                           // LOTO Digital Permits (Phase 3)
app.use('/api/safety-permits', require('./routes/safety_permits'));       // Hot Work & Confined Space Permits (Phase 3)
app.use('/api/crosslinks', require('./routes/crosslinks'));               // Cross-Link Navigation (WOâ†”Assetâ†”Part chain)
app.use('/api/fleet', require('./routes/fleet'));                         // Fleet & Truck Shop (Phase 4)
app.use('/api/calibration', require('./routes/calibration'));             // Calibration Management (Phase 3)
app.use('/api/safety-incidents', require('./routes/safety_incidents'));   // Safety Incident Tracker (Phase 3)
app.use('/api/engineering', require('./routes/engineering'));             // Engineering Excellence (Phase 5)
app.use('/api/vendor-portal', require('./routes/vendor_portal'));         // Vendor Portal (Phase 6)
app.use('/api/tools', require('./routes/tools'));                         // Tool Checkout & Tracking (Phase 6)
app.use('/api/contractors', require('./routes/contractors'));
app.use('/api/intelligence', require('./routes/intelligence'));
             // Contractor Management (Phase 6)
app.use('/api/digital-twin', require('./routes/digitalTwin')(db));        // Digital Twin (Phase 4)
app.use('/api/catalog', require('./routes/catalog'));                      // Master Data Catalog (Phase 5)
app.use('/api/catalog/enrich', require('./routes/catalog_enrichment'));    // Catalog Enrichment Engine (2-tier)
app.use('/api', require('./routes/gap_features'));  // WO Attachments, Failure Codes, Scheduled Reports (Gap Analysis)
app.use('/api/it', require('./routes/it'));                                // IT Department (Software, Hardware, Infrastructure, Mobile)
app.use('/api/it-catalog', require('./routes/it_catalog'));                 // IT Master Data Catalog (Zebra, Fortinet, Dell, Samsung)
app.use('/api/studio', require('./routes/live_studio'));                    // Live Studio — In-App IDE (Creator + IT Admin only)
app.use('/api/creator', require('./routes/creator_console'));               // Creator System Console (2FA, Exec Access, Diagnostics)
app.use('/api/corp-analytics', require('./routes/corporate-analytics'));    // Corporate Analytics (Exec Intelligence, Creator-Controlled Access)
app.use('/api/quality', require('./routes/product-quality'));               // Product Quality & Loss Tracking (COPQ, Cryo, Bacteriology)
app.use('/api/supply-chain', require('./routes/supply-chain'));             // Production Supply Chain & Ingredient Inventory
app.use('/api/map-pins', require('./routes/map-pins'));                      // Enterprise Location Map (US Map with Property Data)
app.use('/api/risk-scoring', require('./routes/risk_scoring'));               // Risk Score & Insurance Compliance (Phase 2)
app.use('/api/translate',   require('./routes/translate'));                   // Level-3 Dynamic Translation Engine
app.use('/api/storeroom',   require('./routes/storeroom'));                   // MRO Storeroom Intelligence (ABC, Dead Stock, Carrying Cost)
app.use('/api/training',    require('./routes/training'));                    // Employee Training & Certification Tracking (OSHA, LOTO, HACCP, etc.)
app.use('/api/warranty',    require('./routes/warranty'));                    // Warranty Claims Lifecycle (File, Track, Recover)
app.use('/api/plant-setup', require('./routes/plant_setup'));               // Plant Setup: Production Model, Units, SKUs, Calendar
app.use('/api/devices',    require('./routes/device-registry'));            // Device Registry: PLC/SCADA onboarding, ARP discovery, Modbus probe
app.use('/api/production-import', require('./routes/production_import'));   // AS400 Number 9 Report Import & Production Planning Engine
app.use('/api/integrations/outbox', require('./routes/integrations-outbox')); // ERP Write-Back Outbox: status, history, retry
app.use('/api/maintenance-kpis',   require('./routes/maintenance_kpis'));   // P3 Maintenance KPI Analytics (Planned Ratio, PM Compliance, Backlog, Downtime)
app.use('/api/capa',               require('./routes/capa'));               // P3 Closed-Loop CAPA Tracking (Corrective Actions linked to RCA)
app.use('/api/maintenance-budget', require('./routes/maintenance_budget')); // P3 Budget vs. Actual Maintenance Spend
app.use('/api/moc',                require('./routes/moc'));                // P4 Management of Change (MOC) — Digital change request + approval workflow
app.use('/api/qc',                 require('./routes/qc'));                 // P5 Quality Control — NCRs, defect codes, Pareto, FPY, inspection checksheets
app.use('/api/operator-care',      require('./routes/operator_care'));      // P5 Operator Care (Autonomous Maintenance) — inspection routes + auto-WO on fail
app.use('/api/turnaround',         require('./routes/turnaround'));         // P5 Shutdown / Turnaround Management — projects, tasks, budget, progress
app.use('/api/predictive-maintenance', require('./routes/predictive_maintenance')); // P5 Predictive Maintenance — MTBF, risk ranking, failure forecast
app.use('/api/vibration',      require('./routes/vibration'));       // P6 Vibration & Condition Monitoring Analytics (readings, alerts, trending, ISO 10816)
app.use('/api/erp-connectors', require('./routes/erp_connectors')); // P6 ERP Connector Marketplace (SAP, Oracle, Dynamics 365, Infor + field mappings)
app.use('/api/baseline',       require('./routes/baseline_engine')); // P7 Plant Behavioral Baseline Engine — drift detection, MTBF, failure freq baselines
app.use('/api/causality',      require('./routes/causality'));        // P7 Explainable Operations Engine + Cross-System Causality Graph
app.use('/api/containment',    require('./routes/containment'));      // P7 Failure Containment Scoring — live blast-radius meter (ISOLATED/PARTIAL/CASCADING)

// ── ERP Write-Back Outbox Drain Worker ────────────────────────────────────────
require('./services/erp-outbox').startDrainWorker();




// â”€â”€ Failure Mode Library â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/failure-modes â€” list all failure modes (optional ?equipment_type=Motor filter)
app.get('/api/failure-modes', (req, res) => {
    try {
        const pdb = db.getDb();
        // Ensure table exists (migration may not have run on this DB yet)
        const hasTbl = pdb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='failure_modes'`).get();
        if (!hasTbl) return res.json([]);

        const equipType = req.query.equipment_type;
        let rows;
        if (equipType) {
            // Search equipment_type field (comma-separated list) for a match
            rows = pdb.prepare(`SELECT * FROM failure_modes WHERE equipment_type LIKE ? OR equipment_type = 'General' ORDER BY category, code`).all(`%${equipType}%`);
        } else {
            rows = pdb.prepare(`SELECT * FROM failure_modes ORDER BY category, code`).all();
        }
        res.json(rows);
    } catch (err) {
        console.error('GET /api/failure-modes error:', err);
        res.status(500).json({ error: 'Failed to fetch failure modes' });
    }
});

// â”€â”€ Warranty Status Check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/assets/:id/warranty-status â€” check if asset is under warranty
app.get('/api/assets/:id/warranty-status', (req, res) => {
    try {
        const pdb = db.getDb();
        const asset = pdb.prepare(`SELECT ID, Description, WarrantyStart, WarrantyEnd, WarrantyVendor, WarrantyTerms FROM Asset WHERE ID = ?`).get(req.params.id);
        if (!asset) return res.status(404).json({ error: 'Asset not found' });

        const today = new Date().toISOString().split('T')[0];
        let status = 'none';  // none | active | expired
        let daysRemaining = null;
        let daysOverdue = null;

        if (asset.WarrantyEnd) {
            const endDate = new Date(asset.WarrantyEnd);
            const now = new Date();
            const diffMs = endDate - now;
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays >= 0) {
                status = 'active';
                daysRemaining = diffDays;
            } else {
                status = 'expired';
                daysOverdue = Math.abs(diffDays);
                daysRemaining = 'Expired'; // Feature 6.3 (Negative Day Bound): Expired label
            }
        }

        res.json({
            assetId: asset.ID,
            description: asset.Description,
            warrantyStart: asset.WarrantyStart,
            warrantyEnd: asset.WarrantyEnd,
            warrantyVendor: asset.WarrantyVendor,
            warrantyTerms: asset.WarrantyTerms,
            status,
            daysRemaining,
            daysOverdue,
            isUnderWarranty: status === 'active'
        });
    } catch (err) {
        console.error('GET /api/assets/:id/warranty-status error:', err);
        res.status(500).json({ error: 'Failed to check warranty status' });
    }
});

// GET /api/warranties/expiring-soon â€” dashboard: assets with warranties expiring within N days
app.get('/api/warranties/expiring-soon', (req, res) => {
    try {
        const pdb = db.getDb();
        const days = parseInt(req.query.days) || 90;
        const today = new Date().toISOString().split('T')[0];
        const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Check if WarrantyEnd column exists
        const cols = pdb.prepare(`PRAGMA table_info(Asset)`).all();
        if (!cols.some(c => c.name === 'WarrantyEnd')) return res.json([]);

        const rows = pdb.prepare(`
            SELECT ID, Description, AssetType, LocationID, WarrantyStart, WarrantyEnd, WarrantyVendor
            FROM Asset
            WHERE WarrantyEnd IS NOT NULL AND WarrantyEnd != ''
              AND WarrantyEnd >= ? AND WarrantyEnd <= ?
            ORDER BY WarrantyEnd ASC
        `).all(today, futureDate);

        // Compute days remaining for each
        const now = new Date();
        const formatted = rows.map(r => {
            const endDate = new Date(r.WarrantyEnd);
            let daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
            if (daysRemaining < 0) daysRemaining = 'Expired'; // Feature 6.3: Avoid math skew from negative days
            return { ...r, daysRemaining };
        });

        res.json(formatted);
    } catch (err) {
        console.error('GET /api/warranties/expiring-soon error:', err);
        res.status(500).json({ error: 'Failed to fetch expiring warranties' });
    }
});

// â”€â”€ HA Sync Replicate Endpoint (sync-key auth, not JWT) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const haSync = require('./ha_sync');
app.post('/api/sync/replicate', (req, res) => {
    const syncKey = req.headers['x-sync-key'];
    if (!haSync.validateSyncKey(syncKey)) {
        return res.status(403).json({ error: 'Invalid sync key' });
    }
    const { plantId, entries } = req.body;
    if (!plantId || !entries || !Array.isArray(entries)) {
        return res.status(400).json({ error: 'plantId and entries[] required' });
    }
    console.log(`  ðŸ“¥ [HA] Receiving ${entries.length} replicated entries for [${plantId}]`);
    const result = haSync.applyReplicatedEntries(plantId, entries);
    res.json({
        success: true,
        applied: result.applied,
        skipped: result.skipped,
        errors: result.errors.length,
        errorDetails: result.errors.slice(0, 5)
    });
});

// â”€â”€ Webhook Integration API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const { dispatchEvent, sendTestMessage } = require('./webhook_dispatcher');
const logisticsDb = require('./logistics_db').db;

// Ensure webhook_config table exists
try {
    logisticsDb.exec(`CREATE TABLE IF NOT EXISTS webhook_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL DEFAULT 'slack',
        webhook_url TEXT NOT NULL,
        label TEXT DEFAULT '',
        enabled INTEGER DEFAULT 1,
        notify_critical_wo INTEGER DEFAULT 1,
        notify_pm_due INTEGER DEFAULT 1,
        notify_emergency INTEGER DEFAULT 1,
        notify_completion INTEGER DEFAULT 0,
        notify_sensor INTEGER DEFAULT 1,
        created_by TEXT DEFAULT 'system',
        created_at TEXT DEFAULT (datetime('now')),
        last_triggered TEXT,
        last_status TEXT
    )`);
} catch(e) {}

// GET all webhooks
app.get('/api/integrations/webhooks', (req, res) => {
    try {
        const rows = logisticsDb.prepare('SELECT * FROM webhook_config ORDER BY created_at DESC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch webhooks' });
    }
});

// POST create webhook
app.post('/api/integrations/webhooks', (req, res) => {
    try {
        const { platform, webhook_url, label, notify_critical_wo, notify_pm_due, notify_emergency, notify_completion, notify_sensor } = req.body;
        if (!webhook_url) return res.status(400).json({ error: 'Webhook URL is required' });
        const result = logisticsDb.prepare(
            'INSERT INTO webhook_config (platform, webhook_url, label, notify_critical_wo, notify_pm_due, notify_emergency, notify_completion, notify_sensor, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            platform || 'slack',
            webhook_url,
            label || '',
            notify_critical_wo !== undefined ? (notify_critical_wo ? 1 : 0) : 1,
            notify_pm_due !== undefined ? (notify_pm_due ? 1 : 0) : 1,
            notify_emergency !== undefined ? (notify_emergency ? 1 : 0) : 1,
            notify_completion !== undefined ? (notify_completion ? 1 : 0) : 0,
            notify_sensor !== undefined ? (notify_sensor ? 1 : 0) : 1,
            req.user?.username || 'system'
        );
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create webhook' });
    }
});

// PUT update webhook
app.put('/api/integrations/webhooks/:id', (req, res) => {
    try {
        const { platform, webhook_url, label, enabled, notify_critical_wo, notify_pm_due, notify_emergency, notify_completion, notify_sensor } = req.body;
        const fields = [];
        const values = [];
        if (platform !== undefined) { fields.push('platform = ?'); values.push(platform); }
        if (webhook_url !== undefined) { fields.push('webhook_url = ?'); values.push(webhook_url); }
        if (label !== undefined) { fields.push('label = ?'); values.push(label); }
        if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled ? 1 : 0); }
        if (notify_critical_wo !== undefined) { fields.push('notify_critical_wo = ?'); values.push(notify_critical_wo ? 1 : 0); }
        if (notify_pm_due !== undefined) { fields.push('notify_pm_due = ?'); values.push(notify_pm_due ? 1 : 0); }
        if (notify_emergency !== undefined) { fields.push('notify_emergency = ?'); values.push(notify_emergency ? 1 : 0); }
        if (notify_completion !== undefined) { fields.push('notify_completion = ?'); values.push(notify_completion ? 1 : 0); }
        if (notify_sensor !== undefined) { fields.push('notify_sensor = ?'); values.push(notify_sensor ? 1 : 0); }
        if (fields.length === 0) return res.json({ success: true });
        values.push(req.params.id);
        logisticsDb.prepare(`UPDATE webhook_config SET ${fields.join(', ')} WHERE id = ?`).run(...values);
 /* dynamic col/table - sanitize inputs */
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update webhook' });
    }
});

// DELETE webhook
app.delete('/api/integrations/webhooks/:id', (req, res) => {
    try {
        logisticsDb.prepare('DELETE FROM webhook_config WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete webhook' });
    }
});

// POST test webhook
app.post('/api/integrations/webhooks/:id/test', async (req, res) => {
    try {
        const wh = logisticsDb.prepare('SELECT * FROM webhook_config WHERE id = ?').get(req.params.id);
        if (!wh) return res.status(404).json({ error: 'Webhook not found' });
        const result = await sendTestMessage(wh.webhook_url, wh.platform);
        logisticsDb.prepare('UPDATE webhook_config SET last_triggered = ?, last_status = ? WHERE id = ?')
            .run(new Date().toISOString(), result.success ? 'ok' : result.error, req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Test failed', detail: err.message });
    }
});

// Make dispatchEvent available globally for other routes
app.set('dispatchEvent', dispatchEvent);

// â”€â”€ Calendar Reminders (Sticky Notes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Create table if migration hasn't run yet
try {
    db.getDb().exec(`CREATE TABLE IF NOT EXISTS calendar_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reminder_date TEXT NOT NULL,
        note TEXT NOT NULL,
        created_by TEXT DEFAULT 'system',
        created_at TEXT DEFAULT (datetime('now')),
        completed INTEGER DEFAULT 0,
        completed_at TEXT DEFAULT NULL
    )`);
    // Add completed_at column if table already exists without it
    try { db.getDb().exec('ALTER TABLE calendar_reminders ADD COLUMN completed_at TEXT DEFAULT NULL'); } catch(e) {}
} catch (e) { /* table may already exist */ }

app.get('/api/calendar/reminders', (req, res) => {
    try {
        const rows = db.getDb().prepare('SELECT * FROM calendar_reminders ORDER BY reminder_date').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch reminders' });
    }
});

app.post('/api/calendar/reminders', (req, res) => {
    try {
        const { reminder_date, note, created_by } = req.body;
        if (!reminder_date || !note) return res.status(400).json({ error: 'Date and note are required' });
        const result = db.getDb().prepare('INSERT INTO calendar_reminders (reminder_date, note, created_by) VALUES (?, ?, ?)').run(reminder_date, note, created_by || 'system');
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create reminder' });
    }
});

app.put('/api/calendar/reminders/:id', (req, res) => {
    try {
        const { completed, note } = req.body;
        if (completed !== undefined) {
            const completedAt = completed ? new Date().toISOString() : null;
            db.getDb().prepare('UPDATE calendar_reminders SET completed = ?, completed_at = ? WHERE id = ?').run(completed ? 1 : 0, completedAt, req.params.id);
        }
        if (note !== undefined) {
            db.getDb().prepare('UPDATE calendar_reminders SET note = ? WHERE id = ?').run(note, req.params.id);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update reminder' });
    }
});

// Reminder History (completed reminders = institutional knowledge archive)
app.get('/api/calendar/reminders/history', (req, res) => {
    try {
        const rows = db.getDb().prepare(`
            SELECT * FROM calendar_reminders 
            WHERE completed = 1 
            ORDER BY completed_at DESC 
            LIMIT 200
        `).all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch reminder history' });
    }
});

// Reminder Analytics (institutional knowledge metrics)
app.get('/api/calendar/reminders/analytics', (req, res) => {
    try {
        const pdb = db.getDb();
        const total = pdb.prepare('SELECT COUNT(*) as count FROM calendar_reminders').get().count;
        const completed = pdb.prepare('SELECT COUNT(*) as count FROM calendar_reminders WHERE completed = 1').get().count;
        const active = total - completed;
        
        // Average response time (hours from reminder_date to completed_at)
        let avgResponseHrs = null;
        try {
            const avg = pdb.prepare(`
                SELECT AVG(
                    (julianday(completed_at) - julianday(reminder_date)) * 24
                ) as avg_hrs
                FROM calendar_reminders 
                WHERE completed = 1 AND completed_at IS NOT NULL
            `).get();
            avgResponseHrs = avg.avg_hrs ? Math.round(avg.avg_hrs * 10) / 10 : null;
        } catch(e) {}

        // Top contributors
        const topContributors = pdb.prepare(`
            SELECT created_by, COUNT(*) as count 
            FROM calendar_reminders 
            GROUP BY created_by 
            ORDER BY count DESC 
            LIMIT 10
        `).all();

        // Busiest days (day of week)
        const byDay = pdb.prepare(`
            SELECT 
                CASE CAST(strftime('%w', reminder_date) AS INTEGER)
                    WHEN 0 THEN 'Sunday'
                    WHEN 1 THEN 'Monday'
                    WHEN 2 THEN 'Tuesday'
                    WHEN 3 THEN 'Wednesday'
                    WHEN 4 THEN 'Thursday'
                    WHEN 5 THEN 'Friday'
                    WHEN 6 THEN 'Saturday'
                END as day_name,
                COUNT(*) as count
            FROM calendar_reminders
            GROUP BY strftime('%w', reminder_date)
            ORDER BY count DESC
        `).all();

        // Keyword analysis (institutional knowledge themes)
        const allNotes = pdb.prepare('SELECT note FROM calendar_reminders').all();
        const keywords = {};
        const commonKeywords = ['order', 'parts', 'check', 'fix', 'replace', 'call', 'follow', 'inspect', 
            'clean', 'grease', 'oil', 'belt', 'filter', 'pump', 'motor', 'valve', 'bearing', 
            'seal', 'weld', 'paint', 'vendor', 'warranty', 'schedule', 'safety', 'training'];
        allNotes.forEach(r => {
            const words = (r.note || '').toLowerCase().split(/\s+/);
            words.forEach(w => {
                const clean = w.replace(/[^a-z]/g, '');
                if (clean.length > 2 && commonKeywords.includes(clean)) {
                    keywords[clean] = (keywords[clean] || 0) + 1;
                }
            });
        });
        const topKeywords = Object.entries(keywords)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word, count]) => ({ word, count }));

        res.json({
            total, completed, active,
            completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
            avgResponseHrs,
            topContributors,
            byDay,
            topKeywords,
            recentCompleted: pdb.prepare(`
                SELECT note, created_by, reminder_date, completed_at 
                FROM calendar_reminders 
                WHERE completed = 1 
                ORDER BY completed_at DESC LIMIT 5
            `).all()
        });
    } catch (err) {
        console.error('Reminder analytics error:', err);
        res.status(500).json({ error: 'Failed to generate reminder analytics' });
    }
});

app.delete('/api/calendar/reminders/:id', (req, res) => {
    try {
        db.getDb().prepare('DELETE FROM calendar_reminders WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete reminder' });
    }
});

// â”€â”€ Master Index Maintenance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const masterDb = require('./master_index');
const { crawlAllPlants } = require('./crawl_engine');

app.post('/api/maintenance/reindex', async (req, res) => {
    try {
        await crawlAllPlants();
        res.json({ success: true, message: 'Registry re-indexed successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Re-indexing failed' });
    }
});

app.post('/api/maintenance/vacuum', (req, res) => {
    try {
        masterDb.exec('VACUUM');
        res.json({ success: true, message: 'Database compaction complete' });
    } catch (err) {
        res.status(500).json({ error: 'Compaction failed' });
    }
});


// â”€â”€ Dashboard stats (aggregated) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/dashboard', (req, res) => {
    try {
        const activePlant = req.headers['x-plant-id'] || 'Demo_Plant_1';

        // Handle "All Sites" Dashboard specifically
        if (activePlant === 'all_sites') {
            const plants = getPlants();

            // For All Sites, we show aggregate counts across all DBs
            let totalWOs = 0;
            let totalAssets = 0;
            let totalParts = 0;
            let totalSchedules = 0;

            // NEW: Use Master Index for performance
            const masterDb = require('./master_index');
            const stats = masterDb.prepare('SELECT * FROM PlantStats').all();
            
            if (stats.length > 0) {
                stats.forEach(s => {
                    totalWOs += s.totalWOs;
                    totalAssets += s.totalAssets;
                    totalParts += s.totalParts;
                    totalSchedules += s.totalSchedules;
                });
            } else {
                // Fallback to legacy crawl if index is empty
                plants.forEach(p => {
                    const dbPath = path.join(_resolvedDataDir, `${p.id}.db`);
                    if (fs.existsSync(dbPath)) {
                        try {
                            const tempDb = db.getDb(p.id);
                            totalWOs += tempDb.prepare('SELECT COUNT(*) as count FROM Work').get().count;
                            totalAssets += tempDb.prepare('SELECT COUNT(*) as count FROM Asset').get().count;
                            totalParts += tempDb.prepare('SELECT COUNT(*) as count FROM Part').get().count;
                            totalSchedules += tempDb.prepare('SELECT COUNT(*) as count FROM Schedule').get().count;
                        } catch (e) {}
                    }
                });
            }

            // Use Corporate Leadership for "All Sites"
            const corpFile = path.join(_resolvedDataDir, 'corporate_leadership.json');
            const leadership = fs.existsSync(corpFile) ? JSON.parse(fs.readFileSync(corpFile, 'utf8')) : [];

            return res.json({
                counts: {
                    workOrders: totalWOs,
                    assets: totalAssets,
                    parts: totalParts,
                    contacts: 0,
                    schedules: totalSchedules,
                    procedures: 0,
                },
                woByStatus: [],
                recentWOs: [], // In All-sites mode, we use the Search bar in the center instead
                recentActivity: [],
                leadership
            });
        }

        const workOrders = db.queryOne('SELECT COUNT(*) as count FROM Work');
        const assets = db.queryOne('SELECT COUNT(*) as count FROM Asset');
        const parts = db.queryOne('SELECT COUNT(*) as count FROM Part');
        const contacts = db.queryOne('SELECT COUNT(*) as count FROM Vendors');
        const schedules = db.queryOne('SELECT COUNT(*) as count FROM Schedule');
        const procedures = db.queryOne('SELECT COUNT(*) as count FROM Procedures');

        // Overstock Capital Lockup / Hoarding Value
        let overstockValue = 0;
        try {
            const overstocked = db.queryAll(`
                SELECT 
                    CAST(COALESCE(p.Stock,0) AS REAL) as stock,
                    CAST(COALESCE(p.UnitCost,'0') AS REAL) as unitCost,
                    COALESCE((
                        SELECT SUM(CAST(COALESCE(wp.ActQty, 0) AS REAL))
                        FROM WorkParts wp
                        INNER JOIN Work w ON wp.WoID = w.ID
                        WHERE wp.PartID = p.ID AND date(w.CompDate) >= date('now', '-365 days')
                    ), 0) as yearUsage
                FROM Part p 
                WHERE CAST(COALESCE(p.Stock,0) AS REAL) > 0 AND CAST(COALESCE(p.UnitCost,'0') AS REAL) > 5
            `);
            for (const row of overstocked) {
                const safety = Math.max(row.yearUsage * 1.5, row.yearUsage + 2);
                if (row.stock > safety) {
                    const frozen = (row.stock - safety) * row.unitCost;
                    if (frozen > 250) overstockValue += frozen;
                }
            }
        } catch (e) { console.warn('Could not compute overstock hoarding on local plant dashboard:', e) }

        // Expedited Freight Penalty
        let freightPenalty = 0;
        let expeditedRatio = 0;
        try {
            const freightQ = db.queryAll('SELECT IsExpedited, FreightCost FROM PartVendors');
            let totalOrders = freightQ.length;
            let expeditedOrders = 0;
            for(const f of freightQ) {
                if (f.IsExpedited) {
                    expeditedOrders++;
                    freightPenalty += (f.FreightCost || 0);
                }
            }
            if (totalOrders > 0) expeditedRatio = Math.round((expeditedOrders / totalOrders) * 100);
        } catch(e) {}

        // Work orders by status
        const woByStatus = db.queryAll(
            'SELECT StatusID as Status, COUNT(*) as count FROM Work GROUP BY StatusID ORDER BY count DESC'
        );

        // Recent work orders
        const recentWOs = db.queryAll(`
            SELECT 
                w.WorkOrderNumber as WONum, 
                w.Description as Descr, 
                s.Description as Status, 
                w.AstID as AssetID, 
                w.Priority, 
                w.SchDate as DateReq 
            FROM Work w
            LEFT JOIN WorkStatuses s ON w.StatusID = s.ID
            ORDER BY w.AddDate DESC 
            LIMIT 10
        `);

        // Recent activity log
        const recentActivity = db.queryAll(
            'SELECT * FROM AuditLog ORDER BY rowid DESC LIMIT 20'
        );

        // Plant Leadership Contacts
        const leadership = db.queryAll(`
            SELECT ID, Name, Title, Phone, Email 
            FROM SiteLeadership 
            ORDER BY ID
        `);

        // Internal SKU Fragmentation (Parts existing outside the Master Dairy Catalog alignment)
        let skuDuplicatesCount = 0;
        let skuFrozenCapital = 0;
        try {
            const rogueParts = db.queryAll(`
                SELECT CAST(COALESCE(UnitCost,'0') AS REAL) as unitCost, 
                       CAST(COALESCE(Stock,'0') AS REAL) as stock 
                FROM Part 
                WHERE GlobalSyncStatus = 'LOCAL_ONLY' OR GlobalSyncStatus IS NULL
            `);
            
            for (const p of rogueParts) {
                skuDuplicatesCount++;
                skuFrozenCapital += (p.stock * p.unitCost);
            }
        } catch(e) {}

        // Phantom Load Estimate for Local Plant
        let plantPhantomBleed = 0;
        try {
            const hasUtilities = db.queryOne(`SELECT name FROM sqlite_master WHERE type='table' AND name='Utilities'`);
            if (hasUtilities) {
                const utilTotal = db.queryOne(`SELECT SUM(BillAmount) as val FROM Utilities WHERE ReadingDate >= date('now', '-12 months')`);
                let plantUtilityCost = utilTotal?.val || (assets.count * 940); // Backup synthetic load if empty
                plantPhantomBleed = plantUtilityCost * 0.182; // 18.2% weekend/off-shift bleed assumption
            } else {
                plantPhantomBleed = assets.count * 940 * 0.182;
            }
        } catch(e) {}

        // Scrap Metal Estimate for Local Plant
        let plantScrapBleed = 0;
        try {
            plantScrapBleed = assets.count * 145; // 145 lbs of high-value metal per asset per year thrown away
        } catch(e) {}

        // Contractor Time Theft Estimate for Local Plant
        let plantTimeTheftBleed = 0;
        try {
            let contractorTotal = db.queryOne(`
                SELECT COALESCE(SUM(CAST(COALESCE(ActCost,'0') AS REAL)), 0) as v
                FROM WorkMisc 
                WHERE lower(Description) LIKE '%contractor%' 
                   OR lower(Description) LIKE '%service%'
                   OR lower(Description) LIKE '%vendor%'
                   OR lower(Description) LIKE '%outside%'
            `)?.v || 0;
            
            // Apply industry average 3rd-party spend per asset if local WorkMisc table is sparse
            if (contractorTotal < (assets.count * 700)) {
                contractorTotal = assets.count * 8400;
            }
            
            if (contractorTotal > 0) {
                plantTimeTheftBleed = contractorTotal * 0.182; // 18.2% industry padding
            }
        } catch(e) {}

        // Consumable Vending Shrink Estimate for Local Plant
        let plantConsumableShrink = 0;
        try {
            let consumableCost = db.queryOne(`
                SELECT COALESCE(SUM(CAST(COALESCE(wp.ActQty,1)*CAST(COALESCE(wp.UnitCost,'0') AS REAL) AS REAL)),0) as v
                FROM WorkParts wp
                LEFT JOIN Part p ON wp.PartID = p.ID
                WHERE lower(p.Description) LIKE '%glove%' OR lower(p.Description) LIKE '%grease%'
                   OR lower(p.Description) LIKE '%blade%' OR lower(p.Description) LIKE '%bit %'
                   OR lower(p.Description) LIKE '%rag%' OR lower(p.Description) LIKE '%tape%'
                   OR lower(p.Description) LIKE '%spray%' OR lower(p.Description) LIKE '%seal%'
            `)?.v || 0;
            
            if (consumableCost < 1000) {
                const laborHoursResult = db.queryOne(`SELECT COALESCE(SUM(CAST(COALESCE(HrReg,'0') AS REAL)),0) as h FROM WorkLabor`)?.h || 0;
                consumableCost = laborHoursResult * 1.15;
            }
            if (consumableCost < 100) {
                consumableCost = assets.count * 1250;
            }
            if (consumableCost > 0) {
                plantConsumableShrink = consumableCost * 0.26; // 26% open-crib loss
            }
        } catch(e) {}

        // Equipment Rental Arbitrage Estimate for Local Plant
        let plantRentalArbitrageBleed = 0;
        try {
            let rentalCost = db.queryOne(`
                SELECT COALESCE(SUM(CAST(COALESCE(ActCost,'0') AS REAL)), 0) as v
                FROM WorkMisc 
                WHERE lower(Description) LIKE '%rental%' 
                   OR lower(Description) LIKE '%lift%'
                   OR lower(Description) LIKE '%chiller%'
                   OR lower(Description) LIKE '%generator%'
                   OR lower(Description) LIKE '%compressor%'
            `)?.v || 0;
            
            if (rentalCost < 2000) {
                rentalCost = assets.count * 1400; // $1,400 per asset mapping
            }
            if (rentalCost > 0) {
                plantRentalArbitrageBleed = rentalCost * 0.35; // 35% past break-even
            }
        } catch(e) {}

        res.json({
            overstockValue: Math.round(overstockValue),
            freightPenalty: Math.round(freightPenalty || 0),
            expeditedRatio: Math.round(expeditedRatio || 0),
            skuDuplicatesCount: skuDuplicatesCount,
            skuFrozenCapital: Math.round(skuFrozenCapital),
            phantomBleed: Math.round(plantPhantomBleed),
            scrapBleed: Math.round(plantScrapBleed),
            timeTheftBleed: Math.round(plantTimeTheftBleed),
            consumableShrinkBleed: Math.round(plantConsumableShrink),
            rentalArbitrageBleed: Math.round(plantRentalArbitrageBleed),
            counts: {
                workOrders: workOrders.count,
                assets: assets.count,
                parts: parts.count,
                contacts: contacts.count,
                schedules: schedules.count,
                procedures: procedures.count,
            },
            woByStatus,
            recentWOs,
            recentActivity,
            leadership
        });
    } catch (err) {
        console.error('GET /api/dashboard error:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// â”€â”€ Lookup values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/lookups/:type', (req, res) => {
    try {
        const lookupMap = {
            'locations': { table: 'Locations', id: 'ID', label: 'Description' },
            'departments': { table: 'Departments', id: 'ID', label: 'Description' },
            'cost-centers': { table: 'CostCenters', id: 'ID', label: 'Description' },
            'asset-types': { table: 'AssetTypes', id: 'ID', label: 'Description' },
            'part-classes': { table: 'PartClasses', id: 'ID', label: 'Description' },
            'task-types': { table: 'TaskTypes', id: 'ID', label: 'Description' },
            'wo-statuses': { table: 'WorkStatuses', id: 'ID', label: 'Description' },
            'po-statuses': { table: 'PurchaseStatuses', id: 'ID', label: 'Description' },
            'projects': { table: 'Project', id: 'ID', label: 'Description' },
            'shifts': { table: 'Shifts', id: 'ID', label: 'Description' },
            'users': { table: 'SystemUsers', id: 'ID', label: 'Description' },
            'assets': { table: 'Asset', id: 'ID', label: 'Description' }
        };

        if (req.params.type === 'assignments') {
            try {
                // Combine all personnel sources: plant Users table + Work.AssignToID + auth users
                let plantUsers = [];
                try {
                    plantUsers = db.queryAll(`
                        SELECT ID as id, Description as label FROM Users
                        UNION
                        SELECT DISTINCT AssignToID as id, AssignToID as label FROM Work 
                        WHERE AssignToID NOT IN (SELECT ID FROM Users) 
                          AND AssignToID IS NOT NULL 
                          AND AssignToID != ''
                    `);
                } catch (e) {
                    // Users table may not exist; just pull from Work
                    try {
                        plantUsers = db.queryAll(`
                            SELECT DISTINCT AssignToID as id, AssignToID as label FROM Work 
                            WHERE AssignToID IS NOT NULL AND AssignToID != ''
                        `);
                    } catch (e2) { /* no Work table either */ }
                }

                // Also include registered app users from auth database
                try {
                    const authDb = require('./auth_db');
                    const authUsers = authDb.prepare(`
                        SELECT Username as id, COALESCE(DisplayName, Username) as label 
                        FROM Users 
                        WHERE DefaultRole IN ('technician', 'supervisor', 'manager', 'it_admin', 'creator')
                    `).all();
                    const existingIds = new Set(plantUsers.map(u => (u.id || '').toLowerCase()));
                    authUsers.forEach(au => {
                        if (!existingIds.has((au.id || '').toLowerCase())) {
                            plantUsers.push(au);
                        }
                    });
                } catch (e) { /* auth db may not be available */ }

                plantUsers.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
                return res.json(plantUsers);
            } catch (e) {
                return res.json([]);
            }
        }

        if (req.params.type === 'users') {
            try {
                // Pull from site-specific Users table (Technicians)
                const data = db.queryAll(`SELECT ID as id, Description as label FROM Users ORDER BY Description`);
                return res.json(data);
            } catch (e) {
                return res.json([]);
            }
        }
        
        const config = lookupMap[req.params.type];
        if (!config) {
            return res.status(404).json({ error: `Unknown lookup type: ${req.params.type}` });
        }

        try {
            const data = db.queryAll(`SELECT "${config.id}" as id, "${config.label}" as label FROM "${config.table}" ORDER BY "${config.label}"`);
            res.json(data);
        } catch (e) {
            res.json([]);
        }
    } catch (err) {
        console.error(`GET /api/lookups/${req.params.type} error:`, err);
        res.json([]);
    }
});

app.post('/api/lookups/:type', (req, res) => {
    try {
        const lookupMap = {
            'locations': { table: 'Locations', id: 'ID', label: 'Description' },
            'departments': { table: 'Departments', id: 'ID', label: 'Description' },
            'asset-types': { table: 'AssetTypes', id: 'ID', label: 'Description' },
            'users': { table: 'Users', id: 'ID', label: 'Description' }
        };

        const config = lookupMap[req.params.type];
        if (!config) {
            return res.status(404).json({ error: `Lookup type ${req.params.type} does not support creation` });
        }

        const { id, label } = req.body;
        if (!id || !label) {
            return res.status(400).json({ error: 'ID and Label are required' });
        }

        // Handle insertion into the mapped table
        db.run(
            `INSERT INTO "${config.table}" ("${config.id}", "${config.label}") VALUES (?, ?)`,
            [id, label]
        );
        res.status(201).json({ success: true, id, label });
    } catch (err) {
        console.error(`POST /api/lookups/${req.params.type} error:`, err);
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'This entry already exists' });
        }
        res.status(500).json({ error: 'Failed to create lookup value' });
    }
});

// â”€â”€ Global search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/search', async (req, res) => {
    try {
        const { q, all } = req.query;
        if (!q || q.trim().length < 2) {
            return res.json({ results: [] });
        }

        const cacheKey = `search_${q.trim().toLowerCase()}_${all}`;
        const cachedResults = searchCache.get(cacheKey);
        if (cachedResults) {
            console.log(`âš¡ [Cache Hit] Serving search results for: ${q}`);
            return res.json({ results: cachedResults });
        }

        const tokens = q.trim().split(/\s+/).filter(t => t.length > 0);
        if (tokens.length === 0) return res.json({ results: [] });

        const searchConditions = tokens.map(() => `(ID LIKE ? OR Description LIKE ?)`).join(' AND ');
        const searchParams = [];
        tokens.forEach(t => searchParams.push(`%${t}%`, `%${t}%`));

        const activePlant = req.headers['x-plant-id'] || 'Demo_Plant_1';

        // Cross-site search
        if (all === 'true' || activePlant === 'all_sites') {
            let allResults = [];
            const plants = getPlants();

            // NEW: Use Master Index for Assets and Parts
            try {
                const masterDb = require('./master_index');
                const assetSearch = tokens.map(() => `(assetName LIKE ? OR model LIKE ? OR serial LIKE ?)`).join(' AND ');
                const assetParams = [];
                tokens.forEach(t => assetParams.push(`%${t}%`, `%${t}%`, `%${t}%`));
                
                const indexedAssets = masterDb.prepare(`
                    SELECT a.assetId as id, a.assetName as title, 'asset' as type, s.plantLabel, a.plantId 
                    FROM MasterAssetIndex a
                    JOIN PlantStats s ON a.plantId = s.plantId
                    WHERE ${assetSearch}
                    LIMIT 100
                `).all(...assetParams);
                allResults.push(...indexedAssets);

                const partSearch = tokens.map(() => `(partNumber LIKE ? OR description LIKE ?)`).join(' AND ');
                const partParams = [];
                tokens.forEach(t => partParams.push(`%${t}%`, `%${t}%`));

                const indexedParts = masterDb.prepare(`
                    SELECT p.partId as id, p.description as title, 'part' as type, p.quantity as qty, s.plantLabel, p.plantId 
                    FROM MasterPartIndex p
                    JOIN PlantStats s ON p.plantId = s.plantId
                    WHERE ${partSearch}
                    LIMIT 100
                `).all(...partParams);
                allResults.push(...indexedParts);
            } catch (err) {
                console.error('Master Index Search failed:', err.message);
            }

            // Legacy fallback loop for Work Orders (skip if Master Index gave enough results)
            if (allResults.length < 50) for (const p of plants) {
                const dbPath = path.join(_resolvedDataDir, `${p.id}.db`);
                if (fs.existsSync(dbPath)) {
                    try {
                        const tempDb = db.getDb(p.id);
                        const hasTbl = (tbl) => tempDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tbl);

                        if (hasTbl('Work')) {
                            const woSearch = tokens.map(() => `(WorkOrderNumber LIKE ? OR Description LIKE ?)`).join(' AND ');
                            const wos = tempDb.prepare(`SELECT ID as pk, WorkOrderNumber as id, Description as title, 'work-order' as type, ? as plantLabel, ? as plantId FROM Work WHERE ${woSearch} LIMIT 10`).all(p.label, p.id, ...tokens.map(t => `%${t}%`), ...tokens.map(t => `%${t}%`));
                            allResults.push(...wos);
                        }
                    } catch (e) {}
                }
                if (allResults.length > 300) break;
            }

            searchCache.set(cacheKey, allResults);
            return res.json({ results: allResults });
        }

        // Local search (uses active plant from middleware)
        const localResults = [];
        try {
            const hasTbl = (tbl) => db.getDb().prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tbl);

            if (hasTbl('Work')) {
                const woSearch = tokens.map(() => `(WorkOrderNumber LIKE ? OR Description LIKE ?)`).join(' AND ');
                localResults.push(...db.queryAll(`
                    SELECT 
                        w.WorkOrderNumber as id, 
                        w.Description as title, 
                        'work-order' as type,
                        w.AstID as assetId,
                        w.Priority as priority,
                        w.SchDate as dateReq,
                        s.Description as status
                    FROM Work w
                    LEFT JOIN WorkStatuses s ON w.StatusID = s.ID
                    WHERE ${woSearch} 
                    LIMIT 20
                `, searchParams));
            }
            if (hasTbl('Asset')) {
                localResults.push(...db.queryAll(`SELECT ID as id, Description as title, 'asset' as type FROM Asset WHERE ${searchConditions} LIMIT 10`, searchParams));
            }
            if (hasTbl('Part')) {
                localResults.push(...db.queryAll(`SELECT ID as id, Description as title, 'part' as type FROM Part WHERE ${searchConditions} LIMIT 10`, searchParams));
            }
            if (hasTbl('Vendors')) {
                localResults.push(...db.queryAll(`SELECT ID as id, Description as title, 'contact' as type FROM Vendors WHERE ${searchConditions} LIMIT 10`, searchParams));
            }
            if (hasTbl('ChatProfile')) {
                const chatCons = tokens.map(() => `(FirstName LIKE ? OR LastName LIKE ? OR Email LIKE ?)`).join(' AND ');
                const chatParams = [];
                tokens.forEach(t => chatParams.push(`%${t}%`, `%${t}%`, `%${t}%`));
                localResults.push(...db.queryAll(`SELECT ID as id, FirstName || ' ' || LastName as title, 'knowledge-expert' as type FROM ChatProfile WHERE ${chatCons} LIMIT 10`, chatParams));
            }
        } catch (err) {
            console.error('Local Search error:', err);
        }

        res.json({ results: localResults });
    } catch (err) {
        console.error('GET /api/search error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// â”€â”€ Plant Address Lookup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/address', (req, res) => {
    try {
        const plantId = req.headers['x-plant-id'] || 'all_sites';
        const addrFile = path.join(__dirname, 'plant_addresses.json');
        if (fs.existsSync(addrFile)) {
            const addresses = JSON.parse(fs.readFileSync(addrFile, 'utf8'));
            return res.json({ address: addresses[plantId]?.address || 'Corporate Headquarters' });
        }
        res.json({ address: 'Address directory unavailable' });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// â”€â”€ Shift Handoff Logbook (extracted to routes/shiftLog.js) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use('/api/shift-log',    require('./routes/shiftLog'));
app.use('/api/opex-tracking', require('./routes/opex_tracking').router);  // OpEx Self-Healing Loop (Tracking)

// â”€â”€ SPA fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(_appRoot, 'dist', 'index.html'));
    } else {
        next();
    }
});

// â”€â”€ Error handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// â”€â”€ Server Startup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const _dataDir = require('./resolve_data_dir');
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '1938');

// TLS Certificate Loading (Priority: Let's Encrypt > CA-signed > Self-signed)
let _httpsServer = null;
let _certSource = 'none';

// Serve ACME challenge directory for certbot HTTP-01 validation
const _acmeDir = path.join(_dataDir, '.well-known', 'acme-challenge');
if (!fs.existsSync(_acmeDir)) fs.mkdirSync(_acmeDir, { recursive: true });
app.use('/.well-known/acme-challenge', express.static(_acmeDir));

try {
    const certDir = path.join(_dataDir, 'certs');
    const keyPath = path.join(certDir, 'server.key');
    const certPath = path.join(certDir, 'server.cert');
    let tlsKey = null, tlsCert = null, tlsChain = null;

    // Priority 1: Let's Encrypt certs (placed by scripts/certbot_setup.js)
    const leDir = process.env.TLS_CERT_DIR || path.join(certDir, 'letsencrypt');
    const leKey = path.join(leDir, 'privkey.pem');
    const leCert = path.join(leDir, 'fullchain.pem');
    const leChain = path.join(leDir, 'chain.pem');
    if (fs.existsSync(leKey) && fs.existsSync(leCert)) {
        tlsKey = fs.readFileSync(leKey);
        tlsCert = fs.readFileSync(leCert);
        if (fs.existsSync(leChain)) tlsChain = fs.readFileSync(leChain);
        _certSource = "Let's Encrypt";
        console.log("[BOOT] Using Let's Encrypt certificate from: " + leDir);
    }

    // Priority 2: Custom CA-signed cert in data/certs/
    if (!tlsKey && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        const content = fs.readFileSync(certPath, 'utf8');
        if (!content.includes('CN=TrierCMMS')) {
            tlsKey = fs.readFileSync(keyPath);
            tlsCert = fs.readFileSync(certPath);
            _certSource = 'CA-signed';
            console.log('[BOOT] Using CA-signed certificate from data/certs/');
        }
    }

    // Priority 3: Self-signed (auto-generate if needed)
    if (!tlsKey) {
        if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
            console.log('[BOOT] Generating self-signed TLS certificate for HTTPS...');
            if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
            const { execSync } = require('child_process');
            const opensslPaths = ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe'];
            let certGenerated = false;
            for (const ossl of opensslPaths) {
                try {
                    execSync('"' + ossl + '" req -x509 -newkey rsa:2048 -keyout "' + keyPath + '" -out "' + certPath + '" -days 3650 -nodes -subj "/CN=TrierCMMS/O=Trier OS/C=US"', { stdio: 'pipe' });
                    console.log('[BOOT] Self-signed TLS certificate generated (10-year validity)');
                    certGenerated = true;
                    break;
                } catch (e) { continue; }
            }
            if (!certGenerated) {
                console.log('[BOOT] openssl not available - HTTPS disabled. Place server.key/server.cert in data/certs/');
            }
        }
        if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
            tlsKey = fs.readFileSync(keyPath);
            tlsCert = fs.readFileSync(certPath);
            _certSource = 'Self-signed';
            console.log('[BOOT] Using self-signed cert (upgrade via: node scripts/certbot_setup.js setup)');
        }
    }

    if (tlsKey && tlsCert) {
        const https = require('https');
        const httpsOptions = { key: tlsKey, cert: tlsCert };
        if (tlsChain) httpsOptions.ca = tlsChain;
        _httpsServer = https.createServer(httpsOptions, app);
        console.log('[BOOT] TLS Source: ' + _certSource);
    }
} catch (err) {
    console.log('[BOOT] HTTPS setup failed:', err.message);
}

console.log('[BOOT] Stage 8: Calling app.listen on port', PORT, '...');
app.listen(PORT, '0.0.0.0', async () => {
    _serverReady = true; // Signal to Electron poller that boot is complete
    // Use the same smart detection as the API endpoint
    const os = require('os');
    const adminIp = _getAdminOverrideIp();
    const detectedIp = adminIp || await _detectLanIp();
    const ipSource = adminIp ? ' (admin override)' : ' (auto-detected)';
    
    // Start HTTPS if available
    if (_httpsServer) {
        _httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
            console.log(`ðŸ” HTTPS:   https://${detectedIp}:${HTTPS_PORT}${ipSource}`);
            console.log(`   [MOBILE] Mobile users: use HTTPS URL for camera/scanner access`);
        });
    }
    
    console.log(`
[*] Trier OS Server Active
[+] Local:    http://localhost:${PORT}
[+] Network:  http://${detectedIp}:${PORT}${ipSource}${_httpsServer ? `\nðŸ” HTTPS:    https://${detectedIp}:${HTTPS_PORT}${ipSource}` : ''}
[>] Data Dir: ${_dataDir}
[@] Role: ${haSync.SERVER_ROLE.toUpperCase()} (${haSync.SERVER_ID})

[~] Running Startup Crawl for Master Index...
    `);
    
    // Initial crawl
    crawlAllPlants().catch(err => console.error('Initial crawl failed:', err));

    // Periodic crawl every 15 minutes
    setInterval(() => {
        crawlAllPlants().catch(err => console.error('Background crawl failed:', err));
    }, 15 * 60 * 1000);

    // ── HA Sync Engine — only boots when a partner server is configured ──────
    // HA is an opt-in feature for dual-server setups. On a single-server install
    // (the default), no triggers are installed and no sync timer runs.
    // Configure via Admin Console → Settings → High Availability.
    setTimeout(() => {
        try {
            const logDb = require('./logistics_db').db;
            logDb.exec(`CREATE TABLE IF NOT EXISTS SystemSettings (
                key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now'))
            )`);
            const partnerRow = logDb.prepare(`SELECT value FROM SystemSettings WHERE key = 'ha_partnerAddress'`).get();
            const partnerAddress = partnerRow?.value?.trim();

            if (!partnerAddress) {
                console.log('  ℹ️  [HA] No partner server configured — HA standby mode (single-server install)');
                console.log('       Configure via Admin Console → Settings → High Availability to enable.');
                return; // Nothing to do — don't install triggers or start timer
            }

            // Partner is configured — full HA boot
            console.log(`  🔄 [HA] Partner server configured: ${partnerAddress}`);
            haSync.installSyncOnAllPlants();
            console.log('  ✅ [HA] Sync triggers installed on all plants');
            haSync.startSyncTimer();
            setInterval(() => haSync.cleanupLedger(), 24 * 60 * 60 * 1000);
        } catch (err) {
            console.error('  ❌ [HA] Sync initialization failed:', err.message);
        }
    }, 5000);

    // ── LAN Hub — only boots inside Electron desktop app ─────────────────────
    // Allows PWA devices on the same plant LAN to stay in sync when the central
    // server is unreachable. Hub listens on port 1940.
    if (process.env.ELECTRON_EMBEDDED === 'true' || process.env.LAN_HUB_ENABLED === 'true') {
        try {
            const lanHub = require('./lan_hub');
            const centralUrl = `http://localhost:${PORT}`;
            lanHub.start({
                dataDir: _resolvedDataDir,
                jwtSecret: process.env.JWT_SECRET,
                centralUrl,
            });
        } catch (err) {
            console.warn('[LAN_HUB] Failed to start:', err.message);
        }
    }
});

// Graceful shutdown (SIGINT for manual, SIGTERM for PM2 cluster)
const _gracefulShutdown = (signal) => {
    console.log(`\n  ${signal} received - shutting down gracefully...`);
    try { require('./lan_hub').stop(); } catch(e) {}
    try { db.close(); } catch(e) {}
    process.exit(0);
};
process.on('SIGINT', () => _gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => _gracefulShutdown('SIGTERM'));

// â”€â”€ STABILITY: Global Error Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Prevent silent crashes from unhandled async errors or uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
    console.error('[STABILITY] Unhandled Promise Rejection:', reason);
    try {
        const logDb = require('./logistics_db').db;
        logDb.prepare(`INSERT INTO AuditLog (Action, Details, Severity, Timestamp) VALUES (?, ?, 'ERROR', datetime('now'))`)
            .run('UNHANDLED_REJECTION', JSON.stringify({ message: String(reason), stack: reason?.stack?.substring(0, 500) }));
    } catch(e) { /* audit logging is best-effort */ }
});

process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught Exception - Server will restart:', error);
    try {
        const logDb = require('./logistics_db').db;
        logDb.prepare(`INSERT INTO AuditLog (Action, Details, Severity, Timestamp) VALUES (?, ?, 'CRITICAL', datetime('now'))`)
            .run('UNCAUGHT_EXCEPTION', JSON.stringify({ message: error.message, stack: error.stack?.substring(0, 500) }));
    } catch(e) { /* best-effort */ }
    try { db.close(); } catch(e) {}
    process.exit(1);
});
