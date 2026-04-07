// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * PM2 Ecosystem Configuration — Trier OS
 * ==========================================
 * Enables cluster mode for production deployments.
 * Run with: pm2 start ecosystem.config.js
 * 
 * Cluster mode spawns multiple Node.js processes behind PM2's
 * built-in load balancer, providing:
 *   - 4x throughput (one process per CPU core)
 *   - Zero-downtime restarts (pm2 reload)
 *   - Automatic crash recovery
 *   - Memory limit enforcement
 *
 * NOTE: SQLite is file-based and handles concurrent reads well.
 *       better-sqlite3 uses WAL mode which supports concurrent readers.
 *       Writes are serialized at the DB level — safe for cluster.
 */
const os = require('os');
const path = require('path');

module.exports = {
    apps: [
        {
            name: 'trier-os',
            script: './server/index.js',

            // Cluster mode: fork one worker per CPU core (max 4 for SQLite safety)
            instances: Math.min(os.cpus().length, 4),
            exec_mode: 'cluster',

            // Auto-restart on crash
            autorestart: true,
            watch: false,

            // Memory limit: restart if a worker exceeds 512MB
            max_memory_restart: '512M',

            // Graceful shutdown: give workers 5s to finish requests
            kill_timeout: 5000,
            listen_timeout: 10000,

            // Environment
            env: {
                NODE_ENV: 'production',
                PORT: 3000
            },

            // Logging
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: path.join(__dirname, 'logs', 'pm2-error.log'),
            out_file: path.join(__dirname, 'logs', 'pm2-out.log'),
            merge_logs: true,

            // Exponential backoff restart delay (prevents crash loops)
            exp_backoff_restart_delay: 100,

            // Cron restart: restart all workers at 3 AM daily (optional maintenance)
            // cron_restart: '0 3 * * *',
        }
    ]
};
