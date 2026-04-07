// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Draft Auto-Save Manager
 * ==================================================
 * Persists in-progress form data to localStorage to prevent
 * data loss from accidental navigation or browser crashes.
 * Used by the work order creation form and procedure editor.
 * Drafts are automatically restored on next visit and cleared on submission.
 */
/**
 * DraftManager - Industrial Reliability Layer
 * ==========================================
 * Handles local persistence of form data to prevent data loss 
 * during signal drops, crashes, or accidental refreshes.
 */

const STORAGE_KEY_PREFIX = 'PF_DRAFT_';

const DraftManager = {
    /**
     * Save a draft to localStorage
     * @param {string} formKey - e.g., 'WO_CLOSEOUT' or 'ASSET_EDIT'
     * @param {object} data - The form state object
     * @param {string} plantId - Current plant context
     */
    save: (formKey, data, plantId = 'global') => {
        try {
            const key = `${STORAGE_KEY_PREFIX}${plantId}_${formKey}`;
            const payload = {
                data,
                timestamp: new Date().getTime(),
                version: '1.0'
            };
            localStorage.setItem(key, JSON.stringify(payload));
        } catch (e) {
            console.warn('DraftManager: Failed to save draft', e);
        }
    },

    /**
     * Retrieve a draft
     * @param {string} formKey 
     * @param {string} plantId 
     * @returns {object|null}
     */
    get: (formKey, plantId = 'global') => {
        try {
            const key = `${STORAGE_KEY_PREFIX}${plantId}_${formKey}`;
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            
            const payload = JSON.parse(raw);
            
            // Check for expiration (e.g., drafts older than 48 hours are discarded)
            const ageHours = (new Date().getTime() - payload.timestamp) / (1000 * 60 * 60);
            if (ageHours > 48) {
                localStorage.removeItem(key);
                return null;
            }
            
            return payload.data;
        } catch (e) {
            return null;
        }
    },

    /**
     * Clear a draft after successful submission
     */
    clear: (formKey, plantId = 'global') => {
        const key = `${STORAGE_KEY_PREFIX}${plantId}_${formKey}`;
        localStorage.removeItem(key);
    },

    /**
     * Get all active drafts for a plant
     */
    getAllForPlant: (plantId) => {
        const drafts = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(`${STORAGE_KEY_PREFIX}${plantId}_`)) {
                drafts.push(key.replace(`${STORAGE_KEY_PREFIX}${plantId}_`, ''));
            }
        }
        return drafts;
    }
};

export default DraftManager;
