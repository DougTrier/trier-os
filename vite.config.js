// Copyright © 2026 Trier OS. All Rights Reserved.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import fs from 'fs';
import path from 'path';

// ── HTTPS configuration ───────────────────────────────────────────────────────
// Production: uses real certs (Let's Encrypt or CA-signed) when present.
// Development: falls back to plain HTTP so browsers never hit SSL cert errors.
//   - localhost is a W3C "secure context" even over HTTP, so the service worker,
//     crypto.subtle, and all PWA features work normally on localhost:5173.
//   - @vitejs/plugin-basic-ssl is intentionally removed: its self-signed cert is
//     not in the Windows trust store, which blocks script loads and SW registration.

const dataDir = path.resolve(__dirname, 'data');
const certDir = path.join(dataDir, 'certs');
const leDir = process.env.TLS_CERT_DIR || path.join(certDir, 'letsencrypt');
const leKey = path.join(leDir, 'privkey.pem');
const leCert = path.join(leDir, 'fullchain.pem');

const keyPath = path.join(certDir, 'server.key');
const certPath = path.join(certDir, 'server.cert');

// Default: HTTP (no SSL errors in dev)
// Certs are only loaded in production (NODE_ENV=production) to avoid untrusted-cert
// errors in dev. localhost is a W3C secure context over plain HTTP.
let httpsConfig = false;

// Attempt to load CA-signed or Certbot certificates for Vite
if (fs.existsSync(leKey) && fs.existsSync(leCert)) {
    httpsConfig = {
        key: fs.readFileSync(leKey),
        cert: fs.readFileSync(leCert)
    };
    console.log('[Vite] Using Certbot certificates from ' + leDir);
} else if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const certContent = fs.readFileSync(certPath, 'utf8');
    if (!certContent.includes('CN=TrierCMMS')) {
        httpsConfig = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        };
        console.log('[Vite] Using CA-signed certificates from data/certs');
    } else {
        httpsConfig = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        };
        console.log('[Vite] Using self-signed fallback certificates');
    }
}

if (!httpsConfig) {
    console.log('[Vite] Running on HTTP (dev mode) — SW and crypto.subtle work on localhost');
}

// Copy Monaco editor files into dist/monaco-vs so production builds can load
// the editor without a CDN dependency. In dev the default CDN path is used.
const copyMonaco = {
    name: 'copy-monaco-vs',
    writeBundle() {
        const src = path.resolve(__dirname, 'node_modules/monaco-editor/min/vs');
        const dest = path.resolve(__dirname, 'dist/monaco-vs');
        if (fs.existsSync(src)) {
            fs.cpSync(src, dest, { recursive: true });
        }
    }
};

const activePlugins = [react(), cesium(), copyMonaco];

// https://vitejs.dev/config/
export default defineConfig({
    plugins: activePlugins,
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        host: '0.0.0.0', // Allow network access (Phone/Tablet)
        port: 5173,
        strictPort: true,
        https: httpsConfig, // Uses valid certs if available, otherwise fallback
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:3000',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path
            },
            '/uploads': {
                target: 'http://127.0.0.1:3000',
                changeOrigin: true,
                secure: false
            }
        }
    }
});
