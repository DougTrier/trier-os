// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * useDialog — Global SmartDialog Hook
 * ====================================
 * Provides a simple API for any component to show themed dialogs
 * that match the Trier OS glassmorphism UI.
 *
 * Usage:
 *   import { DialogProvider, useDialog } from '../hooks/useDialog';
 *
 *   // In App.jsx: wrap your app
 *   <DialogProvider> ... </DialogProvider>
 *
 *   // In any component:
 *   const { alert, confirm, prompt } = useDialog();
 *
 *   // Show an alert (replaces window.alert)
 *   alert('Record saved successfully', 'success');
 *
 *   // Show a confirmation (replaces window.confirm)
 *   const ok = await confirm('Delete this work order?', 'warning');
 *   if (ok) { ... }
 *
 *   // Show a prompt (replaces window.prompt)
 *   const value = await prompt('Enter reason for rejection:');
 *   if (value !== null) { ... }
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import SmartDialog from '../components/SmartDialog';

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
    const [dialogState, setDialogState] = useState(null);
    const resolveRef = useRef(null);

    const showDialog = useCallback((config) => {
        return new Promise((resolve) => {
            resolveRef.current = resolve;
            setDialogState(config);
        });
    }, []);

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

    // Convenience methods
    const alert = useCallback((message, type = 'info', title) => {
        return showDialog({
            type,
            title: title || (type === 'success' ? 'Success' : type === 'error' ? 'Error' : type === 'warning' ? 'Warning' : 'Notice'),
            message,
            isAlert: true,
            confirmLabel: 'OK'
        });
    }, [showDialog]);

    const confirm = useCallback((message, type = 'question', title) => {
        return showDialog({
            type,
            title: title || 'Confirm',
            message,
            isAlert: false,
            confirmLabel: 'Confirm',
            cancelLabel: 'Cancel'
        });
    }, [showDialog]);

    const prompt = useCallback((message, placeholder = 'Enter value...', title) => {
        return showDialog({
            type: 'question',
            title: title || 'Input Required',
            message,
            isAlert: false,
            showInput: true,
            inputPlaceholder: placeholder,
            inputValue: '',
            confirmLabel: 'Submit',
            cancelLabel: 'Cancel'
        });
    }, [showDialog]);

    const contextValue = React.useMemo(() => ({
        showDialog, alert, confirm, prompt
    }), [showDialog, alert, confirm, prompt]);

    return (
        <DialogContext.Provider value={contextValue}>
            {children}
            {dialogState && (
                <SmartDialog
                    {...dialogState}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                    onInputChange={handleInputChange}
                />
            )}
        </DialogContext.Provider>
    );
}

export function useDialog() {
    const ctx = useContext(DialogContext);
    if (!ctx) {
        // Fallback for components not wrapped in DialogProvider — use browser dialogs
        console.warn('[useDialog] Not wrapped in DialogProvider, falling back to browser dialogs');
        return {
            alert: (msg) => window.alert(msg),
            confirm: (msg) => Promise.resolve(window.confirm(msg)),
            prompt: (msg, placeholder) => Promise.resolve(window.prompt(msg)),
            showDialog: () => Promise.resolve(false)
        };
    }
    return ctx;
}

export default useDialog;
