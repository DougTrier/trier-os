// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * styledDialog.js — Drop-in replacement for window.confirm / window.alert / window.prompt
 * ==========================================================================================
 * Uses the Trier OS SmartDialog component instead of ugly browser-native popups.
 *
 * Usage (identical API to native):
 *   import { styledConfirm, styledAlert, styledPrompt } from '../utils/styledDialog';
 *
 *   // Instead of: if (confirm('Delete?')) { ... }
 *   // Use:        if (await styledConfirm('Delete this item?')) { ... }
 *
 *   // Instead of: alert('Saved!')
 *   // Use:        await styledAlert('Saved!', 'success')
 *
 *   // Instead of: const name = prompt('Enter name')
 *   // Use:        const name = await styledPrompt('Enter name', 'placeholder...')
 */

// ── Internal state ──────────────────────────────────────────────────────
let _showDialog = null;   // set by DialogProvider's useEffect

/** Called once from <DialogProvider /> to register the setter */
export function _registerDialogSetter(setter) {
    _showDialog = setter;
}

/**
 * styledConfirm — Promise-based confirm dialog
 * @param {string} message - The message to display
 * @param {object} [opts] - Optional overrides
 * @param {string} [opts.title] - Custom title (default: 'Confirm')
 * @param {string} [opts.type] - 'warning' | 'error' | 'info' | 'question' (default: 'warning')
 * @param {string} [opts.confirmLabel] - OK button text (default: 'Confirm')
 * @param {string} [opts.cancelLabel] - Cancel button text (default: 'Cancel')
 * @returns {Promise<boolean>}
 */
export function styledConfirm(message, opts = {}) {
    if (!_showDialog) {
        // Fallback if provider not mounted yet
        return Promise.resolve(window.confirm(message));
    }
    return new Promise(resolve => {
        _showDialog({
            type: opts.type || 'warning',
            title: opts.title || 'Confirm',
            message,
            confirmLabel: opts.confirmLabel || 'Confirm',
            cancelLabel: opts.cancelLabel || 'Cancel',
            isAlert: false,
            showInput: false,
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false),
        });
    });
}

/**
 * styledAlert — Promise-based alert dialog
 * @param {string} message - The message to display
 * @param {string} [type] - 'success' | 'info' | 'warning' | 'error' (default: 'info')
 * @param {string} [title] - Custom title
 * @returns {Promise<void>}
 */
export function styledAlert(message, type = 'info', title) {
    if (!_showDialog) {
        window.alert(message);
        return Promise.resolve();
    }
    return new Promise(resolve => {
        _showDialog({
            type,
            title: title || (
                type === 'success' ? 'Success' :
                type === 'warning' ? 'Warning' :
                type === 'error' ? 'Error' : 'Notice'
            ),
            message,
            confirmLabel: 'OK',
            isAlert: true,
            showInput: false,
            onConfirm: () => resolve(),
            onCancel: () => resolve(),
        });
    });
}

/**
 * styledPrompt — Promise-based prompt dialog
 * @param {string} message - The prompt message
 * @param {string} [placeholder] - Input placeholder text
 * @param {string} [defaultValue] - Pre-filled input value
 * @returns {Promise<string|null>} The entered value or null if cancelled
 */
export function styledPrompt(message, placeholder = '', defaultValue = '') {
    if (!_showDialog) {
        return Promise.resolve(window.prompt(message, defaultValue));
    }
    return new Promise(resolve => {
        let inputVal = defaultValue;
        _showDialog({
            type: 'question',
            title: 'Input Required',
            message,
            confirmLabel: 'OK',
            cancelLabel: 'Cancel',
            isAlert: false,
            showInput: true,
            inputPlaceholder: placeholder,
            inputValue: defaultValue,
            onInputChange: (v) => { inputVal = v; },
            onConfirm: () => resolve(inputVal),
            onCancel: () => resolve(null),
        });
    });
}
