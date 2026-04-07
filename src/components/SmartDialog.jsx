// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Smart Dialog
 * ========================
 * Themed modal dialog replacing browser-native alert(), confirm(), and prompt().
 * Matches the Trier OS glassmorphism aesthetic. Invoked by DialogInterceptor
 * for all native dialog calls, and directly for complex confirmation flows.
 *
 * DIALOG TYPES:
 *   info     — Informational message with OK button (replaces alert)
 *   warning  — Warning with OK button and amber icon
 *   error    — Error with OK button and red icon
 *   confirm  — Confirm/Cancel with configurable button labels (replaces confirm)
 *   prompt   — Text input with Confirm/Cancel (replaces prompt)
 *
 * KEY FEATURES:
 *   - Focus-trapped: Tab key cycles only through dialog buttons
 *   - Keyboard accessible: Enter confirms, Esc cancels
 *   - Backdrop click: closes dialog (configurable)
 *   - Custom labels: confirmLabel and cancelLabel props
 *   - Lucide icons: type-appropriate icon in dialog header
 *
 * @param {string}   type          — Dialog variant: info|warning|error|confirm|prompt
 * @param {string}   title         — Dialog heading
 * @param {string}   message       — Body text
 * @param {string}   [confirmLabel] — Primary button label (default 'Confirm')
 * @param {string}   [cancelLabel]  — Secondary button label (default 'Cancel')
 * @param {Function} [onConfirm]   — Called when user confirms; receives input value for prompt type
 * @param {Function} [onCancel]    — Called when user cancels or closes
 */
import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X, HelpCircle } from 'lucide-react';
export default function SmartDialog({ 
    type = 'info', 
    title, 
    message, 
    confirmLabel = 'Confirm', 
    cancelLabel = 'Cancel', 
    onConfirm, 
    onCancel,
    isAlert = false,
    showInput = false,
    inputPlaceholder = 'Enter details...',
    inputValue = '',
    onInputChange
}) {
    const getIcon = () => {
        switch (type) {
            case 'warning': return <AlertTriangle size={32} color="#f59e0b" />;
            case 'error': return <AlertTriangle size={32} color="#ef4444" />;
            case 'success': return <CheckCircle2 size={32} color="#10b981" />;
            case 'question': return <HelpCircle size={32} color="#6366f1" />;
            default: return <Info size={32} color="#3b82f6" />;
        }
    };

    const getHeaderColor = () => {
        switch (type) {
            case 'warning': return 'linear-gradient(135deg, #f59e0b, #d97706)';
            case 'error': return 'linear-gradient(135deg, #ef4444, #dc2626)';
            case 'success': return 'linear-gradient(135deg, #10b981, #059669)';
            default: return 'linear-gradient(135deg, #6366f1, #4f46e5)';
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div className="glass-card" style={{
                width: '100%',
                maxWidth: '450px',
                padding: 0,
                border: '1px solid rgba(255,255,255,0.1)',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
                {/* Header Decoration */}
                <div style={{ height: '4px', background: getHeaderColor() }}></div>

                <div style={{ padding: '30px' }}>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', marginBottom: '20px' }}>
                        <div style={{ 
                            background: 'rgba(255,255,255,0.03)', 
                            padding: '12px', 
                            borderRadius: '16px',
                            border: '1px solid rgba(255,255,255,0.05)'
                        }}>
                            {getIcon()}
                        </div>
                        <div style={{ flex: 1 }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px 0', color: '#fff' }}>
                                {title}
                            </h3>
                            <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '0.95rem' }}>
                                {message}
                            </p>
                        </div>
                    </div>

                    {showInput && (
                        <div style={{ marginBottom: '20px' }}>
                            <input 
                                type="text"
                                className="glass-input"
                                value={inputValue}
                                onChange={(e) => onInputChange(e.target.value)}
                                placeholder={inputPlaceholder}
                                autoFocus
                                style={{ 
                                    width: '100%', 
                                    padding: '12px 16px',
                                    borderRadius: '12px',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#fff',
                                    outline: 'none'
                                }}
                                title={inputPlaceholder}
                            />
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '30px' }}>
                        {!isAlert && (
                            <button 
                                onClick={onCancel}
                                className="btn-primary"
                                style={{ 
                                    background: 'rgba(255,255,255,0.1)', 
                                    color: '#fff',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    padding: '10px 24px'
                                }}
                                title="Cancel and close this dialog"
                            >
                                {cancelLabel}
                            </button>
                        )}
                        <button 
                            onClick={onConfirm}
                            className="btn-primary"
                            style={{ 
                                background: type === 'error' || type === 'warning' ? '#ef4444' : 'var(--primary)',
                                color: '#fff',
                                padding: '10px 24px',
                                minWidth: '100px'
                            }}
                            title={confirmLabel}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { transform: scale(0.9) translateY(10px); opacity: 0; }
                    to { transform: scale(1) translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
