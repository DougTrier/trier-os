// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Shared Secret Encryption Helper
 * ============================================
 * AES-256-GCM encryption for secrets stored at rest (TOTP seeds,
 * SMTP credentials, third-party API tokens).
 *
 * Ciphertext format (single UTF-8 string, colon-delimited hex):
 *   <iv_hex>:<tag_hex>:<ciphertext_hex>
 *
 * The encryption key is derived from JWT_SECRET via SHA-256. This
 * means secret ciphertexts become unreadable if JWT_SECRET is rotated;
 * callers that enable this storage must also plan rotation carefully.
 *
 * Originally inlined in creator_console.js for TOTP. Lifted here for
 * reuse by email_service.js (Audit 47 / M-5) and future services.
 */

'use strict';
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

function getEncryptionKey() {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is required for encryption operations');
    return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(text) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + tag + ':' + encrypted;
}

function decrypt(data) {
    const key = getEncryptionKey();
    const parts = data.split(':');
    if (parts.length !== 3) throw new Error('Malformed ciphertext');
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Heuristic: did this string come out of encrypt()? Matches the
// `hex32:hex32:hex+` structure. Used by one-shot migration to detect
// legacy plaintext values that need re-encryption.
function looksEncrypted(str) {
    if (typeof str !== 'string' || !str) return false;
    return /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i.test(str);
}

module.exports = { encrypt, decrypt, looksEncrypted };
