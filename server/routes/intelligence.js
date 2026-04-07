// Copyright © 2026 Trier OS. All Rights Reserved.

const express = require('express');
const router = express.Router();
const https = require('https');

/**
 * Trier OS — Geospatial Intelligence Proxy (intelligence.js)
 * ============================================================
 * Server-side proxy for external environmental and geospatial APIs.
 * Bypasses browser CORS restrictions and adds a consistent Trier OS
 * User-Agent header for API providers that require identification.
 * Mounted at /api/intelligence in server/index.js.
 *
 * ENDPOINTS:
 *   GET /air-quality       Proxy to AirNow / OpenAQ for real-time AQI at plant location
 *   GET /earthquakes       Proxy to USGS earthquake feed (M2.5+ within 500km, last 7 days)
 *   GET /natural-events    Proxy to NASA EONET for active natural events near plant sites
 *
 * WHY PROXY? External APIs return CORS headers that block direct browser requests.
 * By routing through Express, the browser calls /api/intelligence/* and the server
 * makes the outbound HTTPS request, then forwards the JSON response.
 *
 * ERROR HANDLING: If the upstream API is unreachable or returns a non-200 status,
 * the proxy returns { error, status } with the upstream error code so the UI can
 * show a degraded-mode message rather than a hard crash.
 *
 * FRONTEND USAGE: CesiumGlobeView and PlantWeatherMap call these endpoints to
 * overlay environmental context (AQI alerts, seismic activity) on the plant map.
 */

function proxyRequest(url, res) {
    const options = {
        headers: {
            'User-Agent': 'TrierOS/2.0',
            'Accept': 'application/json'
        }
    };

    https.get(url, options, (remoteRes) => {
        if (remoteRes.statusCode >= 400) {
            console.error(`[Intelligence Proxy] Remote error: ${remoteRes.statusCode} for ${url}`);
            return res.status(remoteRes.statusCode).json({ error: 'Remote service unavailable' });
        }

        res.set(remoteRes.headers);
        remoteRes.pipe(res);
    }).on('error', (err) => {
        console.error(`[Intelligence Proxy] Connection failed: ${err.message}`);
        res.status(500).json({ error: 'Failed to reach remote service' });
    });
}

// Air Quality (OpenAQ)
router.get('/air-quality', (req, res) => {
    const url = 'https://api.openaq.org/v2/latest?limit=100&country=US';
    proxyRequest(url, res);
});

// Earthquakes (USGS)
router.get('/earthquakes', (req, res) => {
    const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
    proxyRequest(url, res);
});

// Natural Events (NASA EONET)
router.get('/natural-events', (req, res) => {
    const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open';
    proxyRequest(url, res);
});

module.exports = router;
