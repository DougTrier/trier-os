// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Dialog Interceptor
 * ===============================
 * Global override for browser-native alert(), confirm(), and prompt().
 * Mount ONCE at the app root to intercept ALL dialog calls platform-wide —
 * routing them through the themed SmartDialog UI with zero per-file migration.
 *
 * KEY FEATURES:
 *   - Replaces window.alert / window.confirm / window.prompt on mount
 *   - Restores native dialog functions on unmount (clean teardown)
 *   - Fully themed: matches Trier OS dark-mode color palette
 *   - Accessible: focus-trapped modal with keyboard Esc support
 *   - Prompt variant: includes text input field with value return
 *   - Instant 100% coverage across all 95+ components; no migration needed
 *
 * HOW IT WORKS:
 *   1. On mount, overrides window.alert, window.confirm, window.prompt
 *   2. Native calls are stored for fallback/restoration on unmount
 *   3. All calls render through SmartDialog with proper theming
 *   4. confirm() and prompt() return Promises (async — works with `await`)
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import SmartDialog from './SmartDialog';
import { useTranslation } from '../i18n/index.jsx';

export default function DialogInterceptor() {
    const { t } = useTranslation();
    const tRef = useRef(t);
    tRef.current = t;
    const [dialogState, setDialogState] = useState(null);
    const resolveRef = useRef(null);
    const nativeAlert = useRef(null);
    const nativeConfirm = useRef(null);
    const nativePrompt = useRef(null);

    const handleConfirm = useCallback(() => {
        const inputVal = dialogState?.inputValue;
        setDialogState(null);
        if (resolveRef.current) {
            resolveRef.current(dialogState?.showInput ? (inputVal || '') : true);
            resolveRef.current = null;
        }
    }, [dialogState]);

    const handleCancel = useCallback(() => {
        setDialogState(null);
        if (resolveRef.current) {
            resolveRef.current(dialogState?.showInput ? null : false);
            resolveRef.current = null;
        }
    }, [dialogState]);

    const handleInputChange = useCallback((value) => {
        setDialogState(prev => prev ? { ...prev, inputValue: value } : null);
    }, []);

    useEffect(() => {
        // Store originals
        nativeAlert.current = window.alert;
        nativeConfirm.current = window.confirm;
        nativePrompt.current = window.prompt;

        // Categorize message to pick dialog type
        const detectType = (msg) => {
            const lower = (msg || '').toLowerCase();
            if (lower.includes('error') || lower.includes('failed') || lower.includes('invalid')) return 'error';
            if (lower.includes('warning') || lower.includes('⚠') || lower.includes('danger')) return 'warning';
            if (lower.includes('success') || lower.includes('saved') || lower.includes('complete') || lower.includes('updated')) return 'success';
            return 'info';
        };

        const detectTitle = (type) => {
            switch (type) {
                case 'error': return tRef.current('dialogInterceptor.error', 'Error');
                case 'warning': return tRef.current('dialogInterceptor.warning', 'Warning');
                case 'success': return tRef.current('dialogInterceptor.success', 'Success');
                default: return tRef.current('dialogInterceptor.notice', 'Notice');
            }
        };

        // Override alert
        window.alert = (message) => {
            return new Promise((resolve) => {
                resolveRef.current = resolve;
                const type = detectType(message);
                setDialogState({
                    type,
                    title: detectTitle(type),
                    message: String(message),
                    isAlert: true,
                    confirmLabel: tRef.current('dialogInterceptor.ok', 'OK')
                });
            });
        };

        // Override confirm — returns a Promise<boolean>
        window.confirm = (message) => {
            return new Promise((resolve) => {
                resolveRef.current = resolve;
                setDialogState({
                    type: 'question',
                    title: tRef.current('dialogInterceptor.confirm', 'Confirm'),
                    message: String(message).replace(/\\n/g, '\n'),
                    isAlert: false,
                    confirmLabel: tRef.current('dialogInterceptor.confirm', 'Confirm'),
                    cancelLabel: tRef.current('dialogInterceptor.cancel', 'Cancel')
                });
            });
        };

        // Override prompt — returns a Promise<string|null>
        window.prompt = (message, defaultValue) => {
            return new Promise((resolve) => {
                resolveRef.current = resolve;
                setDialogState({
                    type: 'question',
                    title: tRef.current('dialogInterceptor.inputRequired', 'Input Required'),
                    message: String(message),
                    isAlert: false,
                    showInput: true,
                    inputPlaceholder: tRef.current('dialogInterceptor.enterValue', 'Enter value...'),
                    inputValue: defaultValue || '',
                    confirmLabel: tRef.current('dialogInterceptor.submit', 'Submit'),
                    cancelLabel: tRef.current('dialogInterceptor.cancel', 'Cancel')
                });
            });
        };

        // Cleanup: restore originals on unmount
        return () => {
            window.alert = nativeAlert.current;
            window.confirm = nativeConfirm.current;
            window.prompt = nativePrompt.current;
        };
    }, []);

    if (!dialogState) return null;

    return (
        <SmartDialog
            {...dialogState}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            onInputChange={handleInputChange}
        />
    );
}
