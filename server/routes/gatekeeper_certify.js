// Copyright © 2026 Trier OS. All Rights Reserved.

const express = require('express');
const router = express.Router();
const { preCertify } = require('../gatekeeper/client');

router.post('/pre-certify', async (req, res) => {
    try {
        const intent = req.body;
        if (!intent || !intent.actionType) {
            return res.status(400).json({ error: 'MALFORMED_INTENT' });
        }

        const result = await preCertify(intent);
        res.json(result);
    } catch (err) {
        console.error('[CERTIFY ROUTE] Proxy error:', err);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
