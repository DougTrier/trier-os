// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Copyright © 2026 Doug Trier. SPDX-License-Identifier: MIT.
 * Public demo authorization scope.
 * Centralizes the four published demo identities and checks client-selected
 * plant fields before route dispatch. A separate AsyncLocalStorage guard keeps
 * explicit getDb selectors inside examples even after multipart parsing.
 * Actions: isDemoUser, hasForeignPlant, context.run for authenticated requests.
 * No exposed API routes.
 */
const { AsyncLocalStorage } = require('async_hooks');
const context = new AsyncLocalStorage();
const USERS = new Set(['demo_tech', 'demo_operator', 'demo_maint_mgr', 'demo_plant_mgr']);
const SELECTOR = /^(?:plant(?:id|ids)?|sourceplant(?:id)?|targetplant(?:id)?|destinationplant(?:id)?|siteid)$/;

function isDemoUser(user) { return USERS.has(user?.Username); }
function hasForeignPlant(value) {
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, field]) => {
        if (SELECTOR.test(key.replace(/_/g, '').toLowerCase()) && field != null && field !== '') {
            const plants = Array.isArray(field) ? field : [field];
            if (plants.some(plant => plant !== 'examples')) return true;
        }
        return field && typeof field === 'object' && hasForeignPlant(field);
    });
}
module.exports = { context, isDemoUser, hasForeignPlant };
