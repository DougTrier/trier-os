// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Edge Node Execution Mesh (P7-4)
 * ============================================
 * Standalone Edge Node process.
 * Polls corporate server for artifact manifests, downloads/verifies artifacts,
 * and serves them locally to plant clients.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dataDir = require('./resolve_data_dir');

const CORP_URL = process.env.CORP_URL;
const PLANT_ID = process.env.PLANT_ID;
const EDGE_MESH_TOKEN = process.env.EDGE_MESH_TOKEN;
const POLL_INTERVAL = parseInt(process.env.EDGE_POLL_INTERVAL || '300000', 10);
const SERVE_PORT = parseInt(process.env.EDGE_SERVE_PORT || '1941', 10);

if (!CORP_URL || !PLANT_ID || !EDGE_MESH_TOKEN) {
    console.error('[EDGE-NODE] Missing required environment variables (CORP_URL, PLANT_ID, EDGE_MESH_TOKEN)');
    process.exit(1);
}

function loadPublicKeyFromFile() {
    const pubPath = path.join(dataDir, 'edge_keys', 'public.pem');
    if (!fs.existsSync(pubPath)) {
        console.error(`[EDGE-NODE] Public key not found at ${pubPath}`);
        process.exit(1);
    }
    return fs.readFileSync(pubPath, 'utf8');
}

const EDGE_PUB_KEY = process.env.EDGE_PUB_KEY || loadPublicKeyFromFile();

const localArtifactsDir = path.join(dataDir, 'trier-artifacts');
if (!fs.existsSync(localArtifactsDir)) {
    fs.mkdirSync(localArtifactsDir, { recursive: true });
}

function makeRequest(urlStr, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(urlStr);
        const requestModule = parsedUrl.protocol === 'https:' ? https : http;
        const req = requestModule.request(urlStr, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return makeRequest(res.headers.location, options).then(resolve).catch(reject);
            }
            if (options.streamToPath) {
                if (res.statusCode >= 400) {
                    return reject(new Error(`HTTP ${res.statusCode}`));
                }
                const fileStream = fs.createWriteStream(options.streamToPath);
                res.pipe(fileStream);
                fileStream.on('finish', () => resolve());
                fileStream.on('error', reject);
            } else {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
            }
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function reportStatus(artifactId, status, version, errorNote = null) {
    try {
        const body = JSON.stringify({ artifactId, status, version, errorNote });
        await makeRequest(`${CORP_URL}/api/edge-mesh/sync-status/${PLANT_ID}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${EDGE_MESH_TOKEN}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            body
        });
    } catch (err) {
        console.error(`[EDGE-NODE] Failed to report status ${status} for artifact ${artifactId}: ${err.message}`);
    }
}

async function pollAndSync() {
    try {
        console.log(`[EDGE-NODE] Polling manifest for ${PLANT_ID}...`);
        const res = await makeRequest(`${CORP_URL}/api/edge-mesh/pull-manifest?plantId=${PLANT_ID}`, {
            headers: { 'Authorization': `Bearer ${EDGE_MESH_TOKEN}` }
        });

        if (res.statusCode !== 200) {
            console.error(`[EDGE-NODE] Manifest poll failed. Status: ${res.statusCode}, Body: ${res.data}`);
            return;
        }

        const { artifacts } = JSON.parse(res.data);
        if (!artifacts) return;

        for (const artifact of artifacts) {
            const { artifactId, artifactName, type, version, contentHash, signature, expiresAt, downloadUrl } = artifact;
            const finalPath = path.join(localArtifactsDir, `${artifactId}_v${version}`);
            const manifestPath = `${finalPath}.manifest.json`;

            // a. Check if exists
            if (fs.existsSync(finalPath) && fs.existsSync(manifestPath)) {
                await reportStatus(artifactId, 'SYNCED', version);
                continue;
            }

            // b. Check expiry
            if (expiresAt && new Date(expiresAt) < new Date()) {
                await reportStatus(artifactId, 'EXPIRED', version);
                continue;
            }

            // c. Download
            console.log(`[EDGE-NODE] Downloading artifact ${artifactId} (v${version})...`);
            const tempPath = path.join(localArtifactsDir, `.tmp_${artifactId}`);
            try {
                await makeRequest(downloadUrl, {
                    headers: { 'Authorization': `Bearer ${EDGE_MESH_TOKEN}` },
                    streamToPath: tempPath
                });
            } catch (err) {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                await reportStatus(artifactId, 'FAILED', version, `Download failed: ${err.message}`);
                continue;
            }

            // d. Verify SHA-256
            const buf = fs.readFileSync(tempPath);
            const actualHash = crypto.createHash('sha256').update(buf).digest('hex');
            if (actualHash !== contentHash) {
                fs.unlinkSync(tempPath);
                await reportStatus(artifactId, 'FAILED', version, 'SHA-256 hash mismatch');
                continue;
            }

            // e. Verify Ed25519 signature
            const isValid = crypto.verify(null, Buffer.from(contentHash), EDGE_PUB_KEY, Buffer.from(signature, 'base64'));
            if (!isValid) {
                fs.unlinkSync(tempPath);
                await reportStatus(artifactId, 'FAILED', version, 'Ed25519 signature verification failed');
                continue;
            }

            // f. Finalize
            fs.renameSync(tempPath, finalPath);
            const sidecar = {
                artifactId, artifactName, type, version, contentHash, signature, expiresAt,
                syncedAt: new Date().toISOString()
            };
            fs.writeFileSync(manifestPath, JSON.stringify(sidecar, null, 2));

            // g. Report SYNCED
            await reportStatus(artifactId, 'SYNCED', version);
            console.log(`[EDGE-NODE] Successfully synced artifact ${artifactId} (v${version})`);
        }
    } catch (err) {
        console.error(`[EDGE-NODE] pollAndSync error: ${err.message}`);
    }
}

// -- Local HTTP Server --
const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/artifacts') {
        try {
            const files = fs.readdirSync(localArtifactsDir);
            const manifests = files
                .filter(f => f.endsWith('.manifest.json'))
                .map(f => JSON.parse(fs.readFileSync(path.join(localArtifactsDir, f), 'utf8')));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(manifests));
        } catch (err) {
            res.writeHead(500);
            res.end('Internal Server Error');
        }
    } 
    else if (req.method === 'GET' && req.url.startsWith('/artifacts/')) {
        const id = req.url.split('/')[2];
        // find manifest matching this artifact ID
        try {
            const files = fs.readdirSync(localArtifactsDir);
            const manifestFile = files.find(f => f.startsWith(`${id}_v`) && f.endsWith('.manifest.json'));
            
            if (!manifestFile) {
                res.writeHead(404);
                res.end('Artifact not found');
                return;
            }

            const manifest = JSON.parse(fs.readFileSync(path.join(localArtifactsDir, manifestFile), 'utf8'));
            if (manifest.expiresAt && new Date(manifest.expiresAt) < new Date()) {
                res.writeHead(410);
                res.end('Artifact expired');
                return;
            }

            const artifactFile = manifestFile.replace('.manifest.json', '');
            const filePath = path.join(localArtifactsDir, artifactFile);
            
            if (!fs.existsSync(filePath)) {
                res.writeHead(404);
                res.end('Artifact file missing');
                return;
            }

            const contentType = manifest.type === 'SOP_PDF' ? 'application/pdf' : 'application/octet-stream';
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Disposition': `inline; filename="${manifest.artifactName}"`
            });
            fs.createReadStream(filePath).pipe(res);
        } catch (err) {
            res.writeHead(500);
            res.end('Internal Server Error');
        }
    }
    else if (req.method === 'GET' && req.url === '/health') {
        try {
            const files = fs.readdirSync(localArtifactsDir).filter(f => f.endsWith('.manifest.json'));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', plantId: PLANT_ID, artifactCount: files.length }));
        } catch (err) {
            res.writeHead(500);
            res.end('Internal Server Error');
        }
    }
    else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(SERVE_PORT, () => {
    console.log(`[EDGE-NODE] Local server listening on port ${SERVE_PORT}`);
    pollAndSync(); // initial poll
    setInterval(pollAndSync, POLL_INTERVAL);
});
