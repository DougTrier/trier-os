// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * DialogProvider — Hosts the global SmartDialog for styledConfirm/styledAlert/styledPrompt
 * ========================================================================================
 * Wrap your app with <DialogProvider> once. All components can then call the
 * styled dialog functions without needing any local state or imports of SmartDialog.
 */
import React, { useState, useEffect, useCallback } from 'react';
import SmartDialog from '../components/SmartDialog';
import { _registerDialogSetter } from './styledDialog';

export default function DialogProvider({ children }) {
    const [dialog, setDialog] = useState(null);

    // Wrap setter to auto-close on confirm/cancel
    const showDialog = useCallback((cfg) => {
        const wrappedConfirm = () => { setDialog(null); cfg.onConfirm?.(); };
        const wrappedCancel = () => { setDialog(null); cfg.onCancel?.(); };
        setDialog({ ...cfg, onConfirm: wrappedConfirm, onCancel: wrappedCancel });
    }, []);

    useEffect(() => {
        _registerDialogSetter(showDialog);
        return () => _registerDialogSetter(null);
    }, [showDialog]);

    // For prompt dialogs, track the input value locally so re-renders work
    const [promptValue, setPromptValue] = useState('');

    useEffect(() => {
        if (dialog?.showInput) {
            setPromptValue(dialog.inputValue || '');
        }
    }, [dialog?.showInput, dialog?.inputValue]);

    const handlePromptChange = (v) => {
        setPromptValue(v);
        dialog?.onInputChange?.(v);
    };

    return (
        <>
            {children}
            {dialog && (
                <SmartDialog
                    type={dialog.type}
                    title={dialog.title}
                    message={dialog.message}
                    confirmLabel={dialog.confirmLabel}
                    cancelLabel={dialog.cancelLabel}
                    isAlert={dialog.isAlert}
                    showInput={dialog.showInput}
                    inputPlaceholder={dialog.inputPlaceholder}
                    inputValue={promptValue}
                    onInputChange={handlePromptChange}
                    onConfirm={dialog.onConfirm}
                    onCancel={dialog.onCancel}
                />
            )}
        </>
    );
}
