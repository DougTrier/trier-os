// Copyright © 2026 Trier OS. All Rights Reserved.

const crypto = require('crypto');
const { validateIntent } = require('../gatekeeper/client');
const { getActionClass } = require('../gatekeeper/action_registry');

function requireGatekeeper(actionType, getTargetId, targetType) {
    return async (req, res, next) => {
        try {
            const actionClass = getActionClass(actionType);
            
            const intent = {
                requestId:   crypto.randomUUID(),
                userId:      req.user?.UserID || 'anonymous',
                username:    req.user?.Username || 'anonymous',
                plantId:     req.headers['x-plant-id'] || null,
                actionClass: actionClass,
                actionType:  actionType,
                targetType:  targetType,
                targetId:    getTargetId(req),
                payload:     req.body,
                ipAddress:   req.ip
            };
            
            const result = await validateIntent(intent);
            
            if (result.allowed === true) {
                req.gatekeeperRef = {
                    requestId: intent.requestId,
                    auditRef: result.auditRef
                };
                next();
            } else {
                res.status(403).json({
                    error: result.denialReason || 'DENIED',
                    requestId: intent.requestId
                });
            }
        } catch (err) {
            console.error('[GATEKEEPER MIDDLEWARE] Error:', err);
            if (err.message && err.message.startsWith('Unknown actionType')) {
                return res.status(500).json({ error: 'INTERNAL: unregistered actionType' });
            }
            res.status(500).json({ error: 'GATEKEEPER_MIDDLEWARE_ERROR' });
        }
    };
}

module.exports = requireGatekeeper;
