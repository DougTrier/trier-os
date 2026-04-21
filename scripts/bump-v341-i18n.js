// One-shot script: bump version strings + add XXXIII manual keys to all 11 i18n files.
// Run once, then delete.
const fs   = require('fs');
const path = require('path');

const I18N_DIR = path.join(__dirname, '..', 'src', 'i18n');
const LANGS    = ['ar','de','en','es','fr','hi','ja','ko','pt','tr','zh'];

// Keys to update (same value in all languages — display version strings)
const VERSION_UPDATES = {
    'about.manualSubtitle':  'Built on 33 Years of Operational Knowledge • Version 3.4.1',
    'printEngine.v1126gold': 'v3.4.1',
};

// New manual keys — English text used as the value for ALL languages.
// Non-English translations will fall back to the t() default arg in JSX if key is absent,
// but having the key present avoids missing-key console warnings.
const NEW_KEYS = {
    'manual.s34.title':   'Part XXXIII: Offline Resilience & Plant LAN Sync',
    'manual.s34.content': 'How Trier OS keeps every plant operational when the central server is unreachable — including real-time device sync over the local network, zero-data-loss scan queuing, and the automated Silent Auto-Close safeguard.',

    'manual.sub.167': 'XXXIII.1 How LAN Sync Works (Plant Hub Architecture)',
    'manual.sub.168': 'XXXIII.2 Offline Scan Queue — Zero-Data-Loss Guarantee',
    'manual.sub.169': 'XXXIII.3 LAN Hub Security — JWT Authentication',
    'manual.sub.170': 'XXXIII.4 Conflict Resolution — Dual-Scan Merge',
    'manual.sub.171': 'XXXIII.5 Silent Auto-Close Threshold',
    'manual.sub.172': 'XXXIII.6 Offline Cache Staleness & Trust Indicators',

    'manual.item.1597': "When the central server becomes unreachable, the Electron desktop application automatically activates a LAN Hub — a lightweight WebSocket server running on port 1940 of the plant's local network.",
    'manual.item.1598': "Every PWA scanner on the same network discovers the hub using the plant's configured Hub IP (set in Plant Setup). The connection is established automatically within seconds of central server loss.",
    'manual.item.1599': 'Once connected, all scans submitted on any PWA device are routed to the hub in real time. The hub stores them in a local SQLite queue and broadcasts WO_STATE_CHANGED events to every other connected device — keeping all screens in sync without the central server.',
    'manual.item.1600': 'When the central server returns, the hub replays its full collected queue to the server automatically, preserving original deviceTimestamp order. All PWA devices switch back to normal server mode and the hub gracefully goes quiet.',
    'manual.item.1601': 'Plant Network Status Panel: Mission Control includes a live "Plant Network" panel showing central server status, LAN hub status (Connected / Not Running), port number, and per-device presence with connection times. This updates in real time via the hub WebSocket.',

    'manual.item.1602': "Every scan submitted while offline is immediately written to the device's local IndexedDB database before any network call is attempted. The scan is never lost, even if the app is closed during submission.",
    'manual.item.1603': 'Scans routed through the LAN hub are marked "hub-submitted" in the local queue. When the central server returns, these entries are skipped by the client\'s own replay — the hub already delivered them. This prevents every scan from being sent twice.',
    'manual.item.1604': 'Branch Prediction: While offline, the app predicts the correct scan outcome (New WO, Resume, MULTI_TECH, etc.) using locally cached work order and segment data. The prediction is shown to the technician immediately — no spinner, no wait.',
    'manual.item.1605': 'Session Persistence: If the app is closed or crashes mid-scan submission, it saves a recovery checkpoint to IndexedDB. On the next launch, a resume prompt appears asking the technician to confirm or re-scan the in-flight asset.',
    'manual.item.1606': 'Sync Error Review: After a batch replay, if any scans conflict (409) or fail permanently, the Offline Status Bar shows a "Review N issues" button. Expanding it lists each affected asset with a color-coded badge (amber = conflict, red = network failure) so the technician knows exactly which assets need a re-scan.',

    'manual.item.1607': "Every device must present a valid JWT on the WebSocket upgrade handshake. The hub validates the token's signature and expiry before accepting the connection. Invalid or expired tokens are refused with a 401 close code — rogue devices on the plant WiFi cannot inject scan events.",
    'manual.item.1608': 'Hub Tokens are distributed to PWA devices at login by the central server. They have the same 7-day lifetime as the session cookie, supporting extended offline plant operation across full shift cycles.',
    'manual.item.1609': 'When a token is near expiry (within 5 minutes) or already expired, the app detects this client-side without a network call. The Offline Status Bar shows an amber "Hub unavailable — local queue only" chip. Scans continue to be queued in IndexedDB and will replay to the server when connectivity returns.',
    'manual.item.1610': "Offline Profile Signing: At every successful login, the app stores a device-bound HMAC signature of the user's profile using a 32-byte secret stored in IndexedDB — never in localStorage. If someone tampers with the stored credentials, the signature check fails and the app refuses the offline login with a clear tamper-detected message.",

    'manual.item.1611': 'Race Condition: Two technicians scan the same asset within seconds of each other while the hub is active. Both devices predict AUTO_CREATE_WO because neither has seen the other\'s scan yet.',
    'manual.item.1612': 'Hub Detection: When the second SCAN message arrives for the same assetId within 30 seconds of the first, the hub identifies the conflict and rejects the duplicate AUTO_CREATE with a SCAN_ACK error: "Another technician is creating a work order for this asset — tap Join instead."',
    'manual.item.1613': 'The conflict is flagged with conflictAutoResolved=1 and surfaced in Mission Control\'s review queue so a supervisor can confirm the merge was handled correctly.',
    'manual.item.1614': 'Deduplication is also enforced at the central server using the scanId UUID — even if a scan somehow reaches the server twice (hub replay + client replay), the second attempt is silently skipped.',

    'manual.item.1615': "The Silent Auto-Close Engine runs every hour on the server. It scans every plant database for WorkSegments that have been in \"Active\" state longer than the plant's configured threshold (default: 12 hours, set in Plant Setup > Scan Config > autoReviewThresholdHours).",
    'manual.item.1616': 'When a stale segment is found, the engine closes it with state "TimedOut" (not "Ended" — this distinction lets reports separate cron-closed segments from technician-closed ones). It then sets needsReview=1, reviewReason=\'SILENT_AUTO_CLOSE\', and reviewStatus=\'FLAGGED\' on the parent Work Order.',
    'manual.item.1617': 'Exempt Hold Reasons: Work orders with hold reasons WAITING_ON_PARTS, WAITING_ON_VENDOR, WAITING_ON_APPROVAL, or SCHEDULED_RETURN are skipped — a WO legitimately waiting on an external dependency should not generate a false-positive review flag.',
    'manual.item.1618': 'Flagged WOs appear in Mission Control\'s review queue under the "Silent Auto-Close" reason. Supervisors can acknowledge, resolve, or dismiss them from the queue. The engine does not re-flag a WO that already has needsReview=1 to avoid overwriting a prior reviewReason.',

    'manual.item.1619': 'Cache Staleness Badge: When the central server is unreachable and the last successful data sync (fullCacheRefresh) was more than 30 minutes ago, the Plant Network panel shows an amber "Offline data last updated Xh ago" badge.',
    'manual.item.1620': 'This gives plant managers a clear signal about how fresh the on-screen WO and asset data is, allowing them to judge whether cached information is safe to act on before the server returns.',
    'manual.item.1621': 'The Status Map (WorkStatuses table) is also cached at login and refreshed on every successful server connection. This means predictBranch() uses plant-specific status IDs rather than hardcoded defaults — accurate even for plants that have customized their status taxonomy.',
    'manual.item.1622': 'LAN Hub Keepalive: The hub connection uses a 20-second PING/PONG keepalive. If the hub becomes unreachable mid-shift, the PWA detects the closed WebSocket within seconds and displays the disconnected state, automatically attempting to reconnect every 5–25 seconds (exponential backoff, max 10 attempts).',
};

let updated = 0;
let errors  = 0;

for (const lang of LANGS) {
    const filePath = path.join(I18N_DIR, `${lang}.json`);
    try {
        const raw  = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);

        // Apply version updates
        for (const [key, val] of Object.entries(VERSION_UPDATES)) {
            if (data[key] !== undefined) data[key] = val;
        }

        // Add new keys (skip if already present — idempotent)
        for (const [key, val] of Object.entries(NEW_KEYS)) {
            if (data[key] === undefined) data[key] = val;
        }

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
        console.log(`  ✅ ${lang}.json updated`);
        updated++;
    } catch (err) {
        console.error(`  ❌ ${lang}.json — ${err.message}`);
        errors++;
    }
}

console.log(`\nDone: ${updated} updated, ${errors} errors.`);
