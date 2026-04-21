// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Application Entry Point
 * ==================================================
 * Root entry for the React application. Initializes:
 *   - React DOM rendering into #root element
 *   - Service Worker registration for PWA/offline support
 *   - Global error boundary for crash recovery
 *   - App component mount with router context
 *
 * The service worker enables offline-first operation,
 * caching API responses and static assets for field use.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// ── Global styled alert + confirm override ───────────────────────────────────
// Replaces native browser alert() AND confirm() with app-themed glassmorphism
// modals that match the Trier OS dark aesthetic.
(function() {
    const alertQueue = [];
    let isShowing = false;
    let lastMsg = '';
    let lastTime = 0;

    function getAccent(msg) {
        const m = String(msg).toLowerCase();
        if (m.includes('success') || m.includes('saved') || m.includes('complete') || m.includes('updated') || m.includes('backed up') || m.includes('cloned')) return '#10b981';
        if (m.includes('fail') || m.includes('error') || m.includes('delete') || m.includes('reset')) return '#ef4444';
        if (m.includes('required') || m.includes('warn') || m.includes('simulation')) return '#f59e0b';
        return '#6366f1';
    }

    function getTitle(accent) {
        if (accent === '#10b981') return 'Success';
        if (accent === '#ef4444') return 'Error';
        if (accent === '#f59e0b') return 'Warning';
        return 'Notice';
    }

    // ── Shared card builder ──
    function buildCard(message, accent, title) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: '99999', opacity: '0', transition: 'opacity 0.15s ease'
        });
        requestAnimationFrame(() => overlay.style.opacity = '1');

        const card = document.createElement('div');
        Object.assign(card.style, {
            width: '420px', maxWidth: '90vw',
            background: 'linear-gradient(145deg, rgba(30,27,75,0.98) 0%, rgba(15,23,42,0.98) 100%)',
            borderRadius: '16px', overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.05)',
            transform: 'scale(0.95)', transition: 'transform 0.15s ease'
        });
        requestAnimationFrame(() => card.style.transform = 'scale(1)');

        const bar = document.createElement('div');
        Object.assign(bar.style, { height: '3px', background: accent });
        card.appendChild(bar);

        const header = document.createElement('div');
        Object.assign(header.style, { padding: '20px 25px 0' });
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' });
        const iconBox = document.createElement('div');
        Object.assign(iconBox.style, {
            width: '36px', height: '36px', borderRadius: '10px',
            background: accent + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px'
        });
        iconBox.textContent = accent === '#10b981' ? '✅' : accent === '#ef4444' ? '❌' : accent === '#f59e0b' ? '⚠️' : 'ℹ️';
        const h3 = document.createElement('h3');
        Object.assign(h3.style, { margin: '0', fontSize: '1.1rem', color: '#fff' });
        h3.textContent = title;
        row.appendChild(iconBox);
        row.appendChild(h3);
        header.appendChild(row);
        card.appendChild(header);

        const body = document.createElement('div');
        Object.assign(body.style, {
            padding: '0 25px 20px', fontSize: '0.9rem', color: 'rgba(255,255,255,0.65)',
            lineHeight: '1.6', whiteSpace: 'pre-line'
        });
        body.textContent = message;
        card.appendChild(body);

        return { overlay, card };
    }

    function makeBtn(label, bg, textColor) {
        const btn = document.createElement('button');
        btn.textContent = label;
        Object.assign(btn.style, {
            padding: '10px 28px', borderRadius: '10px', cursor: 'pointer',
            fontSize: '0.85rem', fontWeight: '600', letterSpacing: '0.02em',
            background: bg, color: textColor || '#fff', border: 'none',
            transition: 'all 0.15s ease', minWidth: '90px'
        });
        btn.onmouseenter = () => btn.style.filter = 'brightness(1.15)';
        btn.onmouseleave = () => btn.style.filter = '';
        return btn;
    }

    // ── Alert Queue ──
    function showNext() {
        if (alertQueue.length === 0) { isShowing = false; return; }
        isShowing = true;
        const message = alertQueue.shift();
        const accent = getAccent(message);
        const title = getTitle(accent);

        const { overlay, card } = buildCard(message, accent, title);

        if (alertQueue.length > 0) {
            const badge = document.createElement('div');
            Object.assign(badge.style, { padding: '0 25px 10px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' });
            badge.textContent = `+${alertQueue.length} more notification${alertQueue.length > 1 ? 's' : ''}`;
            card.appendChild(badge);
        }

        const footer = document.createElement('div');
        Object.assign(footer.style, {
            padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', justifyContent: 'flex-end', gap: '10px'
        });
        const okBtn = makeBtn(alertQueue.length > 0 ? `OK (${alertQueue.length} more)` : 'OK', accent);

        const close = () => {
            overlay.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
            setTimeout(() => { overlay.remove(); showNext(); }, 150);
        };

        okBtn.onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };
        footer.appendChild(okBtn);
        card.appendChild(footer);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        okBtn.focus();

        if (accent === '#10b981' || accent === '#6366f1') {
            setTimeout(close, 3000);
        }
    }

    window.alert = function(message) {
        const msg = String(message);
        const now = Date.now();
        if (msg === lastMsg && now - lastTime < 500) return;
        lastMsg = msg;
        lastTime = now;
        alertQueue.push(msg);
        if (!isShowing) showNext();
    };

    // ── Styled Confirm Override ──────────────────────────────────────────────
    // Returns a Promise — callers should use: if (await confirm('msg')) { ... }
    // For legacy synchronous callers, we show ONLY our styled dialog (no native fallback).
    window.confirm = function(message) {
        const msg = String(message);
        const accent = msg.toLowerCase().includes('delete') || msg.toLowerCase().includes('remove') || msg.toLowerCase().includes('decommission')
            ? '#ef4444'
            : msg.toLowerCase().includes('sure') || msg.toLowerCase().includes('permanently')
            ? '#f59e0b'
            : '#6366f1';
        const title = accent === '#ef4444' ? 'Confirm Action' : accent === '#f59e0b' ? 'Are You Sure?' : 'Please Confirm';

        // Build a fully styled, non-blocking confirm dialog
        return new Promise(resolve => {
            const { overlay, card } = buildCard(msg, accent, title);

            const footer = document.createElement('div');
            Object.assign(footer.style, {
                padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', justifyContent: 'flex-end', gap: '12px'
            });

            const cancelBtn = makeBtn('Cancel', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.7)');
            cancelBtn.style.border = '1px solid rgba(255,255,255,0.1)';
            const confirmBtn = makeBtn('Confirm', accent);

            const close = (result) => {
                overlay.style.opacity = '0';
                card.style.transform = 'scale(0.95)';
                setTimeout(() => { overlay.remove(); resolve(result); }, 150);
            };

            cancelBtn.onclick = () => close(false);
            confirmBtn.onclick = () => close(true);
            overlay.onclick = (e) => { if (e.target === overlay) close(false); };

            // ESC key to cancel
            const handleEsc = (e) => {
                if (e.key === 'Escape') { window.removeEventListener('keydown', handleEsc); close(false); }
                if (e.key === 'Enter') { window.removeEventListener('keydown', handleEsc); close(true); }
            };
            window.addEventListener('keydown', handleEsc);

            footer.appendChild(cancelBtn);
            footer.appendChild(confirmBtn);
            card.appendChild(footer);
            overlay.appendChild(card);
            document.body.appendChild(overlay);
            confirmBtn.focus();
        });
    };

    // ── Styled Prompt Override ───────────────────────────────────────────────
    window.prompt = function(message, defaultValue) {
        const msg = String(message);
        return new Promise(resolve => {
            const { overlay, card } = buildCard(msg, '#6366f1', 'Input Required');

            // Input field
            const inputWrap = document.createElement('div');
            Object.assign(inputWrap.style, { padding: '0 25px 15px' });
            const input = document.createElement('input');
            input.type = 'text';
            input.value = defaultValue || '';
            Object.assign(input.style, {
                width: '100%', padding: '10px 14px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box'
            });
            input.onfocus = () => input.style.borderColor = '#6366f1';
            input.onblur = () => input.style.borderColor = 'rgba(255,255,255,0.15)';
            inputWrap.appendChild(input);
            card.appendChild(inputWrap);

            const footer = document.createElement('div');
            Object.assign(footer.style, {
                padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', justifyContent: 'flex-end', gap: '12px'
            });

            const cancelBtn = makeBtn('Cancel', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.7)');
            cancelBtn.style.border = '1px solid rgba(255,255,255,0.1)';
            const okBtn = makeBtn('OK', '#6366f1');

            const close = (value) => {
                overlay.style.opacity = '0';
                card.style.transform = 'scale(0.95)';
                setTimeout(() => { overlay.remove(); resolve(value); }, 150);
            };

            cancelBtn.onclick = () => close(null);
            okBtn.onclick = () => close(input.value);
            overlay.onclick = (e) => { if (e.target === overlay) close(null); };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') close(input.value);
                if (e.key === 'Escape') close(null);
            });

            footer.appendChild(cancelBtn);
            footer.appendChild(okBtn);
            card.appendChild(footer);
            overlay.appendChild(card);
            document.body.appendChild(overlay);
            setTimeout(() => input.focus(), 50);
        });
    };
})();
import { BrowserRouter } from 'react-router-dom';

import { interceptTranslation } from './utils/dynTranslate.js';

const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    config = config || {};

    // Check if URL belongs to our API
    const urlStr = (typeof resource === 'string' ? resource : resource.url);
    if (urlStr && urlStr.startsWith('/api')) {
        config.credentials = config.credentials || 'include';
        config.headers = {
            ...config.headers,
            'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
        };

        // Pass temporary cross-site authorization if it exists
        if (window.__TRIER_OVERRIDE_PASS__) {
            config.headers['x-override-password'] = window.__TRIER_OVERRIDE_PASS__;
        }

        const method = (config.method || 'GET').toUpperCase();
        const isWrite = ['POST', 'PUT', 'DELETE'].includes(method);
        const isPing = urlStr === '/api/ping';
        const isAuth = urlStr.startsWith('/api/auth');
        const isTranslate = urlStr.startsWith('/api/translate');

        // ── Offline Write Queue ──────────────────────────────────────
        // For write operations (POST/PUT/DELETE), if the network fails,
        // queue the write to IndexedDB and return a synthetic success.
        if (isWrite && !isAuth && !isPing && !isTranslate) {
            try {
                // Try with a 3-second timeout
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 3000);
                config.signal = config.signal || controller.signal;

                const response = await originalFetch(resource, config);
                clearTimeout(timer);
                return response;
            } catch (err) {
                // Network failed — try LAN hub first, then fall back to IndexedDB queue
                try {
                    const { default: OfflineDB } = await import('./utils/OfflineDB.js');
                    const { default: LanHub }    = await import('./utils/LanHub.js');
                    let payload = null;
                    if (config.body) {
                        try { payload = JSON.parse(config.body); } catch { payload = config.body; }
                    }
                    await OfflineDB.queueWrite(method, urlStr, payload);
                    console.log(`[Offline] Queued ${method} ${urlStr} for sync`);

                    // For scan submissions: try hub first, then predict branch locally
                    if (urlStr === '/api/scan' && payload?.assetId) {
                        // Ensure hub is connected — connect now if not already
                        if (!LanHub.isConnected()) LanHub.connect();

                        // Submit to hub (fire-and-forget; hub broadcasts WO_STATE_CHANGED)
                        const plantId = localStorage.getItem('nativePlantId') || localStorage.getItem('selectedPlantId');
                        LanHub.submitScan({ ...payload, plantId });

                        // Still return a local branch prediction so the UI shows immediately
                        const predicted = await OfflineDB.predictBranch(payload.assetId, payload.userId);
                        return new Response(JSON.stringify({
                            ...predicted,
                            success: true,
                            _offlineQueued: true,
                            _hubSubmitted: LanHub.isConnected(),
                            scanId: payload.scanId,
                        }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }

                    return new Response(JSON.stringify({
                        success: true,
                        _offlineQueued: true,
                        message: 'Saved offline. Will sync when connected.'
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                } catch (queueErr) {
                    console.error('[Offline] Failed to queue write:', queueErr);
                    throw err; // Re-throw original error
                }
            }
        }

        // ── Dynamic Translation Interceptor (GET only, non-translate endpoints) ──
        if (method === 'GET' && !isAuth && !isPing && !isTranslate) {
            const lang = localStorage.getItem('PM_LANGUAGE') || 'en';
            if (lang !== 'en') {
                try {
                    const response = await originalFetch(resource, config);
                    if (response.ok) {
                        const cloned = response.clone();
                        try {
                            const data = await cloned.json();
                            const translated = await interceptTranslation(urlStr, data, lang);
                            return new Response(JSON.stringify(translated), {
                                status: response.status,
                                headers: { 'Content-Type': 'application/json' },
                            });
                        } catch {
                            // Non-JSON response — pass through unchanged
                            return response;
                        }
                    }
                    return response;
                } catch (err) {
                    throw err;
                }
            }
        }
    }

    return originalFetch(resource, config);
};


// ── LAN Hub global listeners ─────────────────────────────────────────────────
// Wire up once at boot so hub events update the local cache and disconnect
// cleanly when the central server comes back.
import('./utils/LanHub.js').then(({ default: LanHub }) => {
    LanHub.onServerOnline(() => {
        console.log('[LanHub] Central server restored — hub disconnected, normal flow resumed');
    });
    LanHub.onWoStateChanged((msg) => {
        console.log('[LanHub] WO state changed:', msg.assetId, msg.branch);
    });
}).catch(() => {});

// Register Service Worker for Offline Resilience (Production only to avoid local SSL warnings)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('🌾 Trier PM: Service Worker Active', reg.scope))
            .catch(err => {
                if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                    console.warn('📡 PWA: Offline features require a trusted SSL certificate when accessed over the network. Logo and main features are unaffected.');
                } else {
                    console.warn('❌ Trier PM: SW Registration Failed', err);
                }
            });
    });
}

import { I18nProvider } from './i18n/index.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <I18nProvider>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </I18nProvider>
    </React.StrictMode>
);
