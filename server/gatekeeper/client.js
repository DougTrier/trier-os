// Copyright © 2026 Trier OS. All Rights Reserved.

const http = require('http');

/**
 * Trier OS Gatekeeper Client
 * Sends intent validation requests to the Gatekeeper Service.
 */
function validateIntent(intent) {
    return new Promise((resolve) => {
        const urlStr = process.env.GATEKEEPER_URL;
        
        // Fail-closed contract: if GATEKEEPER_URL is not set
        if (!urlStr) {
            return resolve({
                allowed: false,
                denialReason: 'GATEKEEPER_NOT_CONFIGURED'
            });
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(urlStr + '/validate-intent');
        } catch (e) {
            return resolve({
                allowed: false,
                denialReason: 'GATEKEEPER_NOT_CONFIGURED'
            });
        }

        const payload = JSON.stringify(intent);
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 80,
            path: parsedUrl.pathname,
            method: 'POST',
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return resolve({
                        allowed: false,
                        denialReason: 'GATEKEEPER_UNREACHABLE'
                    });
                }
                try {
                    const result = JSON.parse(data);
                    resolve(result);
                } catch (err) {
                    resolve({
                        allowed: false,
                        denialReason: 'GATEKEEPER_UNREACHABLE'
                    });
                }
            });
        });

        // Fail-closed contract: network failure -> NOT ALLOWED
        req.on('error', (err) => {
            console.error('[GATEKEEPER CLIENT] Request error: ' + err.message);
            resolve({
                allowed: false,
                denialReason: 'GATEKEEPER_UNREACHABLE'
            });
        });

        req.on('timeout', () => {
            console.error('[GATEKEEPER CLIENT] Request timeout');
            req.destroy();
            resolve({
                allowed: false,
                denialReason: 'GATEKEEPER_UNREACHABLE'
            });
        });

        req.write(payload);
        req.end();
    });
}

function preCertify(intent) {
    return new Promise((resolve) => {
        const urlStr = process.env.GATEKEEPER_URL;
        
        if (!urlStr) {
            return resolve({
                certified: false,
                causalExplanation: 'GATEKEEPER_NOT_CONFIGURED'
            });
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(urlStr + '/pre-certify');
        } catch (e) {
            return resolve({
                certified: false,
                causalExplanation: 'GATEKEEPER_NOT_CONFIGURED'
            });
        }

        const payload = JSON.stringify(intent);
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 80,
            path: parsedUrl.pathname,
            method: 'POST',
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return resolve({
                        certified: false,
                        causalExplanation: 'GATEKEEPER_UNREACHABLE'
                    });
                }
                try {
                    const result = JSON.parse(data);
                    resolve(result);
                } catch (err) {
                    resolve({
                        certified: false,
                        causalExplanation: 'GATEKEEPER_UNREACHABLE'
                    });
                }
            });
        });

        req.on('error', (err) => {
            console.error('[GATEKEEPER CLIENT] Request error: ' + err.message);
            resolve({
                certified: false,
                causalExplanation: 'GATEKEEPER_UNREACHABLE'
            });
        });

        req.on('timeout', () => {
            console.error('[GATEKEEPER CLIENT] Request timeout');
            req.destroy();
            resolve({
                certified: false,
                causalExplanation: 'GATEKEEPER_UNREACHABLE'
            });
        });

        req.write(payload);
        req.end();
    });
}

module.exports = {
    validateIntent,
    preCertify
};
