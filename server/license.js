// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * ═══════════════════════════════════════════════════════════════
 * Trier OS — Hardware Fingerprint License System (v2)
 * ═══════════════════════════════════════════════════════════════
 * 
 * Supports time-limited licenses:
 *   - 15 Day Trial
 *   - 30 Day Trial
 *   - 60 Day Evaluation
 *   - 1 Year Subscription
 *   - 5 Year Enterprise
 *   - Perpetual (no expiry)
 * 
 * Key format: TRIER-LIC-XXXX-XXXX-XXXX-XXXX
 * Expiry is encoded INTO the key signature so it can't be tampered with.
 * ═══════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

// ── Secret used to sign license keys ──
const LICENSE_SECRET = 'TrierCMMS-2026-DougTrier-LicenseSign-v1';

// ── License Duration Options ──
const LICENSE_DURATIONS = {
    '15day':     { days: 15,   label: '15-Day Trial' },
    '30day':     { days: 30,   label: '30-Day Trial' },
    '60day':     { days: 60,   label: '60-Day Evaluation' },
    '1year':     { days: 365,  label: '1-Year Subscription' },
    '5year':     { days: 1825, label: '5-Year Enterprise' },
    'perpetual': { days: 0,    label: 'Perpetual License' }
};

/**
 * Generate a deterministic Machine ID from hardware characteristics.
 */
function getMachineId() {
    const parts = [];
    parts.push(os.hostname());
    const cpus = os.cpus();
    if (cpus.length > 0) {
        parts.push(cpus[0].model);
        parts.push(String(cpus.length));
    }
    parts.push(String(os.totalmem()));
    // NOTE: MAC addresses intentionally excluded — they can change on
    // power outage, VPN toggle, or adapter resets, causing false invalidation.
    const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
    const id = hash.substring(0, 12).toUpperCase();
    return `TRIER-${id.substring(0, 4)}-${id.substring(4, 8)}-${id.substring(8, 12)}`;
}

/**
 * Generate a license key for a given Machine ID + expiry date.
 * The expiry is baked into the HMAC so tampering invalidates the key.
 * 
 * @param {string} machineId - Machine fingerprint
 * @param {string} expiryStr - 'PERPETUAL' or 'YYYY-MM-DD'
 */
function generateLicenseKey(machineId, expiryStr = 'PERPETUAL') {
    const payload = `${machineId}|${expiryStr.toUpperCase()}`;
    const hmac = crypto.createHmac('sha256', LICENSE_SECRET)
        .update(payload)
        .digest('hex');
    const keyPart = hmac.substring(0, 16).toUpperCase();
    return `TRIER-LIC-${keyPart.substring(0, 4)}-${keyPart.substring(4, 8)}-${keyPart.substring(8, 12)}-${keyPart.substring(12, 16)}`;
}

/**
 * Validate a license key against machine ID + expiry.
 */
function validateLicenseKey(licenseKey, machineId, expiryStr = 'PERPETUAL') {
    if (!licenseKey || !machineId) return false;
    const expectedKey = generateLicenseKey(machineId, expiryStr);
    return licenseKey.trim().toUpperCase() === expectedKey.trim().toUpperCase();
}

/**
 * Check if a valid license file exists and is not expired.
 * Returns { valid, machineId, licenseKey, expires, daysLeft, licenseType }
 */
function checkLicense(dataDir) {
    const machineId = getMachineId();
    const licenseFile = path.join(dataDir, 'license.key');
    
    try {
        if (fs.existsSync(licenseFile)) {
            const content = fs.readFileSync(licenseFile, 'utf8').trim();
            const lines = content.split('\n').map(l => l.trim());
            
            // Line 1: License key
            const key = lines[0];
            
            // Line 2: EXPIRES:PERPETUAL or EXPIRES:2027-03-19
            let expiryStr = 'PERPETUAL';
            const expiryLine = lines.find(l => l.startsWith('EXPIRES:'));
            if (expiryLine) {
                expiryStr = expiryLine.replace('EXPIRES:', '').trim().toUpperCase();
            }
            
            // Validate the key matches this machine + expiry combo
            if (validateLicenseKey(key, machineId, expiryStr)) {
                // Check if expired
                if (expiryStr === 'PERPETUAL') {
                    return { valid: true, machineId, licenseKey: key, expires: 'PERPETUAL', daysLeft: Infinity, licenseType: 'Perpetual License' };
                }
                
                const expiryDate = new Date(expiryStr + 'T23:59:59');
                const now = new Date();
                const msLeft = expiryDate.getTime() - now.getTime();
                const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
                
                if (daysLeft > 0) {
                    // Find the license type label
                    let licenseType = `Valid until ${expiryStr}`;
                    for (const [, dur] of Object.entries(LICENSE_DURATIONS)) {
                        if (dur.days > 0) {
                            // rough match
                            const expectedExpiry = new Date();
                            expectedExpiry.setDate(expectedExpiry.getDate() + dur.days);
                        }
                    }
                    
                    return { valid: true, machineId, licenseKey: key, expires: expiryStr, daysLeft, licenseType };
                } else {
                    // EXPIRED
                    return { valid: false, expired: true, machineId, licenseKey: key, expires: expiryStr, daysLeft: 0, licenseType: 'EXPIRED' };
                }
            }
        }
    } catch (e) {
        console.error('[LICENSE] Error reading license file:', e.message);
    }
    
    return { valid: false, machineId };
}

/**
 * Save a license key + expiry to the data directory.
 */
function saveLicense(dataDir, licenseKey, expiryStr = 'PERPETUAL') {
    const licenseFile = path.join(dataDir, 'license.key');
    const content = [
        licenseKey.trim(),
        `EXPIRES:${expiryStr.toUpperCase()}`,
        `# Trier OS License`,
        `# Machine ID: ${getMachineId()}`,
        `# Activated: ${new Date().toISOString()}`,
        `# DO NOT EDIT THIS FILE — key is signed against the expiry date`
    ].join('\n');
    
    fs.writeFileSync(licenseFile, content, 'utf8');
}

/**
 * Generate the HTML for the license activation page.
 */
function getActivationPageHTML(machineId, errorMsg = '', expiredInfo = null) {
    const isExpired = expiredInfo && expiredInfo.expired;
    const headerText = isExpired ? 'License Expired' : 'License Activation Required';
    const subtitleText = isExpired 
        ? `Your license expired on ${expiredInfo.expires}. Contact your administrator for a renewal key.`
        : 'Trier OS needs to be activated on this machine';
    const headerColor = isExpired ? '#f59e0b' : '#e2e8f0';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trier OS — ${headerText}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
            color: #e2e8f0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .card {
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid ${isExpired ? 'rgba(245, 158, 11, 0.4)' : 'rgba(99, 102, 241, 0.3)'};
            border-radius: 20px;
            padding: 50px;
            max-width: 520px;
            width: 90%;
            box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5);
            text-align: center;
        }
        .logo { height: 100px; margin-bottom: 20px; }
        h1 { font-size: 1.6rem; margin-bottom: 8px; color: ${headerColor}; }
        .subtitle { color: #94a3b8; font-size: 0.9rem; margin-bottom: 30px; line-height: 1.6; }
        .expired-badge {
            display: inline-block;
            background: rgba(245, 158, 11, 0.15);
            border: 1px solid rgba(245, 158, 11, 0.4);
            color: #f59e0b;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 700;
            margin-bottom: 20px;
        }
        .machine-id-box {
            background: rgba(0, 0, 0, 0.4);
            border: 2px dashed rgba(99, 102, 241, 0.4);
            border-radius: 12px;
            padding: 16px;
            margin: 20px 0;
        }
        .machine-id-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .machine-id {
            font-size: 1.4rem;
            font-weight: 700;
            font-family: 'Consolas', 'Courier New', monospace;
            color: #818cf8;
            letter-spacing: 2px;
            user-select: all;
            cursor: pointer;
        }
        .copy-hint { font-size: 0.7rem; color: #64748b; margin-top: 6px; }
        .instructions {
            background: rgba(99, 102, 241, 0.06);
            border: 1px solid rgba(99, 102, 241, 0.15);
            border-radius: 10px;
            padding: 16px;
            margin: 20px 0;
            text-align: left;
            font-size: 0.85rem;
            line-height: 1.7;
            color: #94a3b8;
        }
        .instructions strong { color: #e2e8f0; }
        input[type="text"] {
            width: 100%;
            padding: 14px 18px;
            background: rgba(0, 0, 0, 0.4);
            border: 2px solid rgba(99, 102, 241, 0.3);
            border-radius: 10px;
            color: #fff;
            font-size: 1.1rem;
            font-family: 'Consolas', 'Courier New', monospace;
            text-align: center;
            letter-spacing: 1px;
            outline: none;
            transition: border-color 0.3s;
        }
        input[type="text"]:focus {
            border-color: #6366f1;
            box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);
        }
        input[type="text"]::placeholder { color: #475569; }
        .btn {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #6366f1, #4f46e5);
            border: none;
            border-radius: 10px;
            color: #fff;
            font-size: 1rem;
            font-weight: 700;
            cursor: pointer;
            margin-top: 15px;
            transition: all 0.3s;
            letter-spacing: 0.5px;
        }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(99, 102, 241, 0.4); }
        .btn:active { transform: translateY(0); }
        .error {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #f87171;
            padding: 12px;
            border-radius: 8px;
            margin-top: 15px;
            font-size: 0.85rem;
        }
        .footer { margin-top: 30px; font-size: 0.7rem; color: #475569; }
    </style>
</head>
<body>
    <div class="card">
        <img src="/assets/TrierLogo.png" alt="Trier OS" class="logo" onerror="this.style.display='none'">
        ${isExpired ? '<div class="expired-badge">⏰ LICENSE EXPIRED</div>' : ''}
        <h1>${headerText}</h1>
        <p class="subtitle">${subtitleText}</p>
        
        <div class="machine-id-box">
            <div class="machine-id-label">Your Machine ID</div>
            <div class="machine-id" onclick="navigator.clipboard.writeText(this.textContent).then(() => { document.getElementById('copyMsg').textContent = '✓ Copied!'; setTimeout(() => document.getElementById('copyMsg').textContent = 'Click to copy', 2000); })">${machineId}</div>
            <div class="copy-hint" id="copyMsg">Click to copy</div>
        </div>
        
        <div class="instructions">
            <strong>${isExpired ? 'To renew:' : 'To activate:'}</strong><br>
            1. Copy the Machine ID above<br>
            2. Send it to your Trier OS administrator<br>
            3. They will provide a ${isExpired ? 'renewal' : 'License'} Key<br>
            4. Paste it below and click ${isExpired ? 'Renew' : 'Activate'}
        </div>
        
        <form method="POST" action="/api/license/activate">
            <input type="text" name="licenseKey" placeholder="TRIER-LIC-XXXX-XXXX-XXXX-XXXX" required autocomplete="off" spellcheck="false">
            <button type="submit" class="btn">🔑 ${isExpired ? 'Renew License' : 'Activate License'}</button>
        </form>
        
        ${errorMsg ? `<div class="error">❌ ${errorMsg}</div>` : ''}
        
        <div style="margin-top: 20px; padding: 14px; background: rgba(99, 102, 241, 0.06); border: 1px solid rgba(99, 102, 241, 0.15); border-radius: 10px; text-align: center;">
            <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 6px;">Need a license key? Contact support:</div>
            <a href="https://github.com/DougTrier/trier-os/discussions" target="_blank" style="color: #818cf8; font-size: 0.95rem; font-weight: 700; text-decoration: none;">💬 GitHub Discussions</a>
            <div style="font-size: 0.7rem; color: #64748b; margin-top: 6px;">Include your Machine ID in your post • Response within 24 hours</div>
        </div>
        
        <div class="footer">Trier OS v1.0 • © ${new Date().getFullYear()} Doug Trier</div>
    </div>
</body>
</html>`;
}

module.exports = {
    getMachineId,
    generateLicenseKey,
    validateLicenseKey,
    checkLicense,
    saveLicense,
    getActivationPageHTML,
    LICENSE_DURATIONS
};
