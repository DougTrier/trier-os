// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Cluster Mode Entry Point
 * =====================================
 * Spawns one Express worker per CPU core for horizontal throughput.
 * Each worker runs the full server/index.js independently.
 * SQLite handles this perfectly — each worker opens its own DB connections.
 *
 * Usage:
 *   node server/cluster.js          (auto-detect CPU cores)
 *   WORKERS=4 node server/cluster.js (manual worker count)
 *
 * In production, use PM2 for process management:
 *   pm2 start server/cluster.js --name "trier-os"
 */
const cluster = require('cluster');
const os = require('os');

// How many workers to spawn (default: CPU cores, capped at 8)
const WORKER_COUNT = parseInt(process.env.WORKERS || '0') || Math.min(os.cpus().length, 8);

if (cluster.isPrimary) {
    console.log(`
 ╔══════════════════════════════════════════════════╗
 ║         Trier OS — Cluster Mode                  ║
 ║   Enterprise Maintenance Management System       ║
 ║   © 2026 Doug Trier. All Rights Reserved.        ║
 ╚══════════════════════════════════════════════════╝

 🖥️  CPU Cores:  ${os.cpus().length}
 👷 Workers:    ${WORKER_COUNT}
 🧠 Memory:     ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB total
 📦 Node.js:    ${process.version}
 🔧 Platform:   ${os.platform()} ${os.arch()}
`);

    // Fork workers — first worker is designated the cron worker so background
    // engines (PM, silent-close, enrichment, safety-permit expiry, etc.) run
    // on exactly one process regardless of cluster size.
    let cronWorkerId = null;
    for (let i = 0; i < WORKER_COUNT; i++) {
        const isCronWorker = i === 0;
        const worker = cluster.fork(isCronWorker ? { IS_CRON_WORKER: '1' } : {});
        if (isCronWorker) cronWorkerId = worker.id;
        console.log(`  ✅ Worker ${worker.process.pid} spawned (${i + 1}/${WORKER_COUNT})${isCronWorker ? ' [cron]' : ''}`);
    }

    // Handle worker crashes — auto-restart; preserve cron designation if the
    // cron worker was the one that died.
    cluster.on('exit', (worker, code, signal) => {
        if (signal === 'SIGTERM' || signal === 'SIGINT') {
            console.log(`  🛑 Worker ${worker.process.pid} shut down gracefully`);
            return;
        }
        console.error(`  ❌ Worker ${worker.process.pid} crashed (code: ${code}). Restarting...`);
        const wasCronWorker = worker.id === cronWorkerId;
        const newWorker = cluster.fork(wasCronWorker ? { IS_CRON_WORKER: '1' } : {});
        if (wasCronWorker) cronWorkerId = newWorker.id;
        console.log(`  🔄 Replacement worker ${newWorker.process.pid} spawned${wasCronWorker ? ' [cron]' : ''}`);
    });

    // Relay degraded-mode changes from any worker to all other workers.
    cluster.on('message', (sender, msg) => {
        if (msg && msg.type === 'DEGRADED_MODE_SYNC') {
            for (const id in cluster.workers) {
                if (cluster.workers[id].id !== sender.id) {
                    cluster.workers[id].send(msg);
                }
            }
        }
    });

    // Graceful shutdown: kill all workers on master SIGINT/SIGTERM
    const shutdown = (signal) => {
        console.log(`\n  ${signal} → Shutting down all ${WORKER_COUNT} workers...`);
        for (const id in cluster.workers) {
            cluster.workers[id].process.kill('SIGTERM');
        }
        setTimeout(() => process.exit(0), 3000);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Health monitor: log status every 5 minutes
    setInterval(() => {
        const alive = Object.keys(cluster.workers).length;
        const mem = process.memoryUsage();
        console.log(`  [CLUSTER] ${alive}/${WORKER_COUNT} workers alive | Master RSS: ${Math.round(mem.rss / 1024 / 1024)}MB`);
    }, 5 * 60 * 1000);

} else {
    // Worker process: run the full Express server
    // Each worker gets its own port binding via SO_REUSEPORT (Node handles this)
    require('./index.js');
}
