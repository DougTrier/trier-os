// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Toast Notification Provider
 * ========================================
 * Platform-wide toast notification system providing consistent user feedback
 * for save operations, errors, sync status, and warnings across all views.
 *
 * KEY FEATURES:
 *   - Four variants: success (green) / error (red) / info (blue) / warn (amber)
 *   - Auto-dismiss: toasts disappear after 4 seconds by default
 *   - Manual dismiss: ✕ button for immediate close
 *   - Queue: multiple toasts stack vertically in the top-right corner
 *   - Context hook: useToast() hook available anywhere in the app tree
 *   - Zero dependencies: pure React Context + useState (no external library)
 *
 * SETUP (in App.jsx):
 *   import { ToastProvider } from './components/ToastProvider';
 *   <ToastProvider><App /></ToastProvider>
 *
 * USAGE (in any component):
 *   const toast = useToast();
 *   toast.success('Record saved successfully');
 *   toast.error('Failed to save — please try again');
 *   toast.info('Syncing data...');
 *   toast.warn('This record will be permanently deleted');
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        // Fallback for components outside the provider — no-op
        return {
            success: (msg) => console.log('✅', msg),
            error: (msg) => console.error('❌', msg),
            info: (msg) => console.info('ℹ️', msg),
            warn: (msg) => console.warn('⚠️', msg),
        };
    }
    return ctx;
}

let toastId = 0;

const TOAST_CONFIG = {
    success: {
        icon: <CheckCircle size={18} />,
        bg: 'rgba(34, 197, 94, 0.15)',
        border: 'rgba(34, 197, 94, 0.3)',
        color: '#22c55e',
        duration: 3000,
    },
    error: {
        icon: <XCircle size={18} />,
        bg: 'rgba(239, 68, 68, 0.15)',
        border: 'rgba(239, 68, 68, 0.3)',
        color: '#ef4444',
        duration: 0, // Errors don't auto-dismiss
    },
    info: {
        icon: <Info size={18} />,
        bg: 'rgba(59, 130, 246, 0.15)',
        border: 'rgba(59, 130, 246, 0.3)',
        color: '#3b82f6',
        duration: 5000,
    },
    warn: {
        icon: <AlertTriangle size={18} />,
        bg: 'rgba(245, 158, 11, 0.15)',
        border: 'rgba(245, 158, 11, 0.3)',
        color: '#f59e0b',
        duration: 3000,
    },
};

function Toast({ toast, onDismiss }) {
    const config = TOAST_CONFIG[toast.type] || TOAST_CONFIG.info;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                background: config.bg,
                border: `1px solid ${config.border}`,
                borderRadius: '10px',
                backdropFilter: 'blur(16px)',
                color: '#f8fafc',
                fontSize: '0.85rem',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                animation: 'toast-slide-in 0.3s ease-out',
                maxWidth: '400px',
                width: 'max-content',
            }}
        >
            <span style={{ color: config.color, flexShrink: 0 }}>{config.icon}</span>
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button 
                onClick={() => onDismiss(toast.id)}
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                    opacity: 0.6,
                }}
                title="Dismiss"
            >
                <X size={14} />
            </button>
        </div>
    );
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef({});

    const dismiss = useCallback((id) => {
        if (timersRef.current[id]) {
            clearTimeout(timersRef.current[id]);
            delete timersRef.current[id];
        }
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const addToast = useCallback((type, message) => {
        const id = ++toastId;
        const config = TOAST_CONFIG[type] || TOAST_CONFIG.info;

        setToasts(prev => [...prev, { id, type, message }]);

        if (config.duration > 0) {
            timersRef.current[id] = setTimeout(() => {
                dismiss(id);
            }, config.duration);
        }

        return id;
    }, [dismiss]);

    const api = {
        success: (msg) => addToast('success', msg),
        error: (msg) => addToast('error', msg),
        info: (msg) => addToast('info', msg),
        warn: (msg) => addToast('warn', msg),
    };

    // Global bridge — allows window.trierToast.success('msg') from anywhere
    React.useEffect(() => {
        window.trierToast = api;
        return () => { delete window.trierToast; };
    }, [api]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            {/* Toast Container — Fixed bottom-right */}
            {toasts.length > 0 && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: '20px',
                        right: '20px',
                        display: 'flex',
                        flexDirection: 'column-reverse',
                        gap: '8px',
                        zIndex: 99999,
                        pointerEvents: 'auto',
                    }}
                >
                    {toasts.map(t => (
                        <Toast key={t.id} toast={t} onDismiss={dismiss} />
                    ))}
                </div>
            )}
            {/* Inline animation keyframes */}
            <style>{`
                @keyframes toast-slide-in {
                    from { transform: translateX(120%); opacity: 0; }
                    to   { transform: translateX(0);    opacity: 1; }
                }
            `}</style>
        </ToastContext.Provider>
    );
}

export default ToastProvider;
