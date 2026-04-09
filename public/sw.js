/**
 * Trier OS � Enhanced Service Worker v2
 * ==========================================
 * Cache-First for app shell, Network-First for API calls.
 * Provides full offline resilience for mobile/tablet/desktop PWA users.
 */

const CACHE_VERSION  = 'trier-v2026.04.09c';
const API_CACHE      = 'trier-api-v2';
const XLAT_CACHE_PFX = 'trier-xlat-'; // one cache per language

// App shell files to pre-cache on install
const APP_SHELL = [
    '/',
    '/index.html',
    '/manifest.json',
    '/assets/TrierLogo.png',
    '/assets/pwa-icon-192.png',
    '/assets/pwa-icon-512.png'
];

// ���� Install: Pre-cache app shell ����������������������������������������������������������������������������������
self.addEventListener('install', (event) => {
    console.log('[SW] Installing', CACHE_VERSION);
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => {
            console.log('[SW] Pre-caching app shell');
            return cache.addAll(APP_SHELL);
        })
    );
    self.skipWaiting();
});

// ���� Activate: Clean old caches ��������������������������������������������������������������������������������������
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating', CACHE_VERSION);
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_VERSION && key !== API_CACHE && !key.startsWith(XLAT_CACHE_PFX))
                    .map((key) => {
                        console.log('[SW] Removing old cache:', key);
                        return caches.delete(key);
                    })
            );
        })
    );
    self.clients.claim();
});

// ���� Language switch: pre-warm translation cache for new lang ��������������������������
self.addEventListener('message', (event) => {
    if (event.data?.type === 'XLAT_LANG_SWITCH') {
        const lang = event.data.lang;
        if (!lang || lang === 'en') return;
        console.log(`[SW] Language switched to ${lang} � translation cache ready`);
        // Ensure the per-language cache exists (created on first translation response)
        caches.open(XLAT_CACHE_PFX + lang).then(() => {
            event.source?.postMessage({ type: 'XLAT_READY', lang });
        });
    }
});

// ���� Fetch: Routing strategy ��������������������������������������������������������������������������������������������
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // ���� Translation POST: stale-while-revalidate per language ��������������������������������
    // Keyed by lang + body hash so identical translation requests are served
    // from cache offline. We must handle POST here because SW normally skips them.
    if (request.method === 'POST' && url.pathname === '/api/translate') {
        event.respondWith((async () => {
            const bodyText = await request.clone().text();
            let lang = 'en';
            try { lang = JSON.parse(bodyText).lang || 'en'; } catch { /* ok */ }
            const cacheName = XLAT_CACHE_PFX + lang;
            const cacheKey  = new Request(url.pathname + '?k=' + btoa(bodyText).slice(0, 40));

            const cached = await caches.match(cacheKey, { cacheName });
            // Serve cache immediately while revalidating in background
            const networkPromise = fetch(request.clone()).then(async (resp) => {
                if (resp.ok) {
                    const cache = await caches.open(cacheName);
                    cache.put(cacheKey, resp.clone());
                }
                return resp;
            }).catch(() => null);

            if (cached) return cached;

            const fresh = await networkPromise;
            if (fresh) return fresh;
            // Fully offline + no cache � return empty results (client falls back to original text)
            return new Response(JSON.stringify({ results: {} }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        })());
        return;
    }

    // Skip non-GET requests � POST/PUT/DELETE are handled by the offline queue
    if (request.method !== 'GET') return;

    // Skip non-http(s) requests (chrome-extension://, data:, blob:, etc.) � they can't be cached
    if (!url.protocol.startsWith('http')) return;

    // Strategy 1: API calls �  Network-first, cache fallback
    if (url.pathname.startsWith('/api')) {
        // Don't cache ping, auth, or upload endpoints
        if (url.pathname === '/api/ping' || url.pathname.startsWith('/api/auth')) {
            return;
        }

        event.respondWith(
            fetchWithTimeout(request, 5000)
                .then((response) => {
                    // Cache successful API responses for offline fallback
                    if (response && response.ok) {
                        const responseClone = response.clone();
                        caches.open(API_CACHE).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Network failed � try cache
                    return caches.match(request).then((cached) => {
                        if (cached) {
                            console.log('[SW] Serving cached API:', url.pathname);
                            return cached;
                        }
                        // No cache � return offline JSON response
                        return new Response(
                            JSON.stringify({ 
                                _offline: true, 
                                error: 'Offline � this data is not cached yet',
                                cachedAt: null 
                            }),
                            { 
                                status: 503,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                    });
                })
        );
        return;
    }

    // Strategy 2: Static assets �  Cache-first, network fallback, background update
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            // Start a background fetch regardless (stale-while-revalidate)
            const fetchPromise = fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_VERSION).then((cache) => {
                            cache.put(request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => null);

            // Return cached version immediately if available
            if (cachedResponse) {
                return cachedResponse;
            }

            // No cache � wait for network
            return fetchPromise.then(response => {
                if (response) return response;
                // Everything failed � return offline page for navigation requests
                if (request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
                return new Response('Offline', { status: 503 });
            });
        })
    );
});

// ���� Helper: Fetch with timeout ��������������������������������������������������������������������������������������
function fetchWithTimeout(request, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
        fetch(request)
            .then((response) => {
                clearTimeout(timer);
                resolve(response);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

// ���� Background Sync: Replay offline writes when connection returns ��������������
self.addEventListener('sync', (event) => {
    if (event.tag === 'trier-sync-queue') {
        console.log('[SW] Background sync triggered');
        event.waitUntil(
            self.clients.matchAll().then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({ type: 'SYNC_TRIGGERED' });
                });
            })
        );
    }
});

// ���� Push notification handler (future use) ��������������������������������������������������������������
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        self.registration.showNotification(data.title || 'Trier OS', {
            body: data.body || 'New alert',
            icon: '/assets/TrierLogo.png',
            badge: '/assets/pwa-icon-192.png',
            data: data.url || '/'
        });
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.openWindow(event.notification.data)
    );
});
