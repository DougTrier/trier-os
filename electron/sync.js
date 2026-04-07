// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS � Desktop Sync Engine
 * 
 * Manages bidirectional data sync between the local SQLite database
 * and the Trier OS server.
 * 
 * Flow:
 *   1. Check connectivity to server (primary on-prem, fallback AWS)
 *   2. Push: Replay sync_queue entries to server (oldest first)
 *   3. Pull: Fetch delta changes from server since last sync
 *   4. Update local database with server changes
 *   5. Handle conflicts (flag for human review)
 * 
 * Runs on interval (default: 30 seconds) when online.
 * All operations are idempotent � safe to retry.
 */

const http = require('http');
const https = require('https');

class SyncEngine {
    constructor(localDB, config) {
        this.db = localDB;
        this.config = config;
        this.isOnline = false;
        this.isSyncing = false;
        this.syncInterval = null;
        this.statusCallback = null;
        this.conflictCallback = null;

        // Tables to sync (in order of priority)
        // NOTE: sensor_readings are NOT synced (too high volume � millions of rows).
        // Only sensor_config and sensor_thresholds sync so the desktop client
        // knows what sensors exist and their alert thresholds.
        this.syncTables = ['work_orders', 'assets', 'parts', 'pm_schedules', 'contacts', 'sensor_config', 'sensor_thresholds'];
    }

    /**
     * Set callback for status updates
     * @param {function} callback - (status, message, details) => void
     */
    onStatusChange(callback) {
        this.statusCallback = callback;
    }

    /**
     * Set callback for conflict resolution
     * @param {function} callback - (conflict) => Promise<resolution>
     */
    onConflict(callback) {
        this.conflictCallback = callback;
    }

    /**
     * Start the sync engine with periodic sync
     */
    start(intervalSeconds = 30) {
        console.log(`[SYNC] Starting engine (${intervalSeconds}s interval)`);
        this.emitStatus('starting', 'Sync engine initializing...');

        // Initial connectivity check
        this.checkConnectivity().then(online => {
            this.isOnline = online;
            this.emitStatus(online ? 'online' : 'offline', 
                online ? 'Connected to server' : 'Server unreachable � working offline');
        });

        // Periodic sync
        this.syncInterval = setInterval(async () => {
            await this.runSyncCycle();
        }, intervalSeconds * 1000);

        // Run first sync immediately
        setTimeout(() => this.runSyncCycle(), 2000);
    }

    /**
     * Stop the sync engine
     */
    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        console.log('[SYNC] Engine stopped');
    }

    /**
     * Run a single sync cycle
     */
    async runSyncCycle() {
        if (this.isSyncing) {
            console.log('[SYNC] Skipping � already syncing');
            return;
        }

        this.isSyncing = true;

        try {
            // Step 1: Check connectivity
            const online = await this.checkConnectivity();
            this.isOnline = online;

            if (!online) {
                this.emitStatus('offline', 'Server unreachable � changes queued locally');
                this.isSyncing = false;
                return;
            }

            // Step 2: Push local changes to server
            const pendingCount = this.db.getPendingCount();
            if (pendingCount > 0) {
                this.emitStatus('syncing', `Pushing ${pendingCount} local changes...`);
                await this.pushChanges();
            }

            // Step 3: Pull server changes
            this.emitStatus('syncing', 'Pulling server updates...');
            await this.pullChanges();

            // Step 4: Update status
            const remaining = this.db.getPendingCount();
            const now = new Date().toISOString();
            this.emitStatus('online', 
                remaining > 0 
                    ? `Synced � ${remaining} changes still pending`
                    : 'All changes synced',
                { lastSync: now, pendingCount: remaining }
            );

            // Save last sync time
            this.db.setLocalConfig('lastSyncTime', now);

        } catch (error) {
            console.error('[SYNC] Cycle error:', error.message);
            this.emitStatus('error', `Sync error: ${error.message}`);
        }

        this.isSyncing = false;
    }

    /**
     * Check server connectivity
     * Tries primary server first, then fallback
     */
    async checkConnectivity() {
        const serverUrl = this.config.serverUrl || 'http://localhost:3000';

        try {
            const response = await this.httpRequest(`${serverUrl}/api/ping`, 'GET', null, 5000);
            return response.status === 200;
        } catch (e) {
            // Try fallback server if configured
            if (this.config.fallbackServerUrl) {
                try {
                    const response = await this.httpRequest(
                        `${this.config.fallbackServerUrl}/api/ping`, 'GET', null, 5000
                    );
                    return response.status === 200;
                } catch (e2) {
                    return false;
                }
            }
            return false;
        }
    }

    /**
     * Push local sync_queue entries to server
     */
    async pushChanges() {
        const pending = this.db.getPendingWrites();
        let sent = 0;
        let failed = 0;
        let conflicts = 0;

        for (const entry of pending) {
            if (entry.retry_count >= 3) {
                console.log(`[SYNC] Skipping entry ${entry.id} � max retries exceeded`);
                continue;
            }

            try {
                let endpoint;
                let method;
                let payload;

                try {
                    payload = JSON.parse(entry.payload);
                } catch (e) {
                    payload = {};
                }

                // Map sync_queue operations to API calls
                switch (entry.operation) {
                    case 'INSERT':
                        endpoint = `/api/${this.tableToEndpoint(entry.target_table)}`;
                        method = 'POST';
                        break;
                    case 'UPDATE':
                        endpoint = `/api/${this.tableToEndpoint(entry.target_table)}/${entry.target_id}`;
                        method = 'PUT';
                        break;
                    case 'DELETE':
                        endpoint = `/api/${this.tableToEndpoint(entry.target_table)}/${entry.target_id}`;
                        method = 'DELETE';
                        break;
                    default:
                        console.warn(`[SYNC] Unknown operation: ${entry.operation}`);
                        this.db.markFailed(entry.id, 'Unknown operation: ' + entry.operation);
                        failed++;
                        continue;
                }

                const serverUrl = this.config.serverUrl || 'http://localhost:3000';
                const response = await this.httpRequest(
                    `${serverUrl}${endpoint}`,
                    method,
                    payload,
                    10000,
                    {
                        'Authorization': `Bearer ${this.config.authToken}`,
                        'x-plant-id': this.config.plantId || 'Demo_Plant_1',
                        'Content-Type': 'application/json'
                    }
                );

                if (response.status >= 200 && response.status < 300) {
                    this.db.markSynced(entry.id, `${response.status} OK`);
                    sent++;
                } else if (response.status === 409) {
                    // Conflict � flag for resolution
                    this.db.markFailed(entry.id, 'Conflict: server has newer data');
                    conflicts++;
                    if (this.conflictCallback) {
                        await this.conflictCallback({
                            entry,
                            serverResponse: response.body
                        });
                    }
                } else {
                    this.db.markFailed(entry.id, `Server returned ${response.status}`);
                    failed++;
                }

            } catch (error) {
                this.db.markFailed(entry.id, error.message);
                failed++;
            }

            // Emit progress
            this.emitStatus('syncing', 
                `Pushing: ${sent + failed + conflicts} / ${pending.length}`,
                { sent, failed, conflicts }
            );
        }

        console.log(`[SYNC] Push complete: ${sent} sent, ${failed} failed, ${conflicts} conflicts`);
        return { sent, failed, conflicts };
    }

    /**
     * Pull changes from server (delta sync)
     */
    async pullChanges() {
        const serverUrl = this.config.serverUrl || 'http://localhost:3000';

        for (const table of this.syncTables) {
            const lastSync = this.db.getLastSync(table);
            const sinceParam = lastSync ? `?since=${encodeURIComponent(lastSync)}` : '';

            try {
                const response = await this.httpRequest(
                    `${serverUrl}/api/sync/delta${sinceParam}`,
                    'GET',
                    null,
                    30000,
                    {
                        'Authorization': `Bearer ${this.config.authToken}`,
                        'x-plant-id': this.config.plantId || 'Demo_Plant_1'
                    }
                );

                if (response.status === 200 && response.body) {
                    const data = JSON.parse(response.body);
                    
                    // The delta endpoint returns data grouped by table
                    if (data[table] && Array.isArray(data[table]) && data[table].length > 0) {
                        this.db.bulkImport(table, data[table]);
                    }
                }
            } catch (error) {
                console.warn(`[SYNC] Pull failed for ${table}:`, error.message);
            }
        }
    }

    /**
     * Force an immediate full sync
     */
    async forceFull() {
        console.log('[SYNC] Force full sync requested');
        this.emitStatus('syncing', 'Full sync in progress...');

        const serverUrl = this.config.serverUrl || 'http://localhost:3000';

        for (const table of this.syncTables) {
            try {
                const endpoint = this.tableToEndpoint(table);
                const response = await this.httpRequest(
                    `${serverUrl}/api/${endpoint}`,
                    'GET',
                    null,
                    60000,
                    {
                        'Authorization': `Bearer ${this.config.authToken}`,
                        'x-plant-id': this.config.plantId || 'Demo_Plant_1'
                    }
                );

                if (response.status === 200) {
                    const records = JSON.parse(response.body);
                    if (Array.isArray(records) && records.length > 0) {
                        this.db.bulkImport(table, records);
                        this.emitStatus('syncing', `Downloaded ${records.length} ${table}`);
                    }
                }
            } catch (error) {
                console.error(`[SYNC] Full sync failed for ${table}:`, error.message);
            }
        }

        this.emitStatus('online', 'Full sync complete');
    }

    // ���� Helpers ����

    tableToEndpoint(table) {
        const map = {
            'work_orders': 'work-orders',
            'assets': 'assets',
            'parts': 'parts',
            'pm_schedules': 'pm-schedules',
            'contacts': 'contacts'
        };
        return map[table] || table;
    }

    emitStatus(status, message, details = {}) {
        if (this.statusCallback) {
            this.statusCallback(status, message, details);
        }
    }

    /**
     * Simple HTTP request helper (no external dependencies)
     */
    httpRequest(url, method = 'GET', body = null, timeout = 10000, headers = {}) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const isHttps = parsedUrl.protocol === 'https:';
            const lib = isHttps ? https : http;

            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method,
                headers: {
                    'User-Agent': 'TrierOS-Desktop/1.0',
                    ...headers
                },
                timeout
            };

            if (body && method !== 'GET') {
                const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
            }

            const req = lib.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    resolve({ status: res.statusCode, body: data, headers: res.headers });
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (body && method !== 'GET') {
                req.write(typeof body === 'string' ? body : JSON.stringify(body));
            }

            req.end();
        });
    }
}

module.exports = SyncEngine;
