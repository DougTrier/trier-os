// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */

/**
 * Trier OS — Error Boundary
 * ==========================
 * React class component that catches JavaScript errors anywhere in the child
 * component tree, logs them to the console, and renders a styled fallback UI
 * instead of crashing the entire application.
 *
 * KEY FEATURES:
 *   - Wraps any component subtree to provide isolated error containment
 *   - Fallback UI: branded error card with module name, error message, and reload button
 *   - Custom fallback: pass your own ReactNode via the `fallback` prop
 *   - Error logging: captures error + component stack in componentDidCatch
 *   - Recovery: "Reload Module" button resets boundary state to re-attempt render
 *   - Used throughout App.jsx to isolate every major view from cascade failures
 *
 * Usage:
 *   <ErrorBoundary label="WorkOrdersView">
 *     <WorkOrdersView />
 *   </ErrorBoundary>
 *
 * @param {string}    label    — Display name for the crashed module (shown in error UI)
 * @param {ReactNode} fallback — Custom fallback UI; defaults to built-in error card
 * @param {ReactNode} children — Component subtree to protect
 */
import React from 'react';
import { useTranslation } from '../i18n/index.jsx';

// Functional inner component so we can use the useTranslation hook
// (class components cannot call hooks directly)
function ErrorFallbackUI({ label, error, info, onReset }) {
    const { t } = useTranslation();
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minHeight: 200, padding: 40, gap: 16,
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 12, margin: 20,
        }}>
            <div style={{ fontSize: '2rem' }}>⚠️</div>
            <h3 style={{ margin: 0, color: '#ef4444', fontSize: '1rem' }}>
                {label} {t('errorBoundary.unexpectedError', 'encountered an unexpected error')}
            </h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', maxWidth: 420 }}>
                {t('errorBoundary.description', 'The error has been logged. Try refreshing the page. If the problem persists, contact your system administrator.')}
            </p>
            {process.env.NODE_ENV !== 'production' && error && (
                <pre style={{
                    background: 'rgba(0,0,0,0.4)', color: '#fca5a5', borderRadius: 8, padding: '10px 14px',
                    fontSize: '0.72rem', maxWidth: '100%', overflowX: 'auto', whiteSpace: 'pre-wrap',
                }}>
                    {error.toString()}
                    {info?.componentStack}
                </pre>
            )}
            <button
                onClick={onReset}
                style={{
                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                    color: '#ef4444', borderRadius: 8, padding: '7px 20px', cursor: 'pointer',
                    fontSize: '0.85rem', fontWeight: 600,
                }}
            >
                {t('errorBoundary.tryAgain', 'Try Again')}
            </button>
        </div>
    );
}

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, info: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        this.setState({ info });
        // Log to console — in production this would go to a telemetry service
        console.error(`[ErrorBoundary:${this.props.label || 'unknown'}]`, error, info?.componentStack);
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        if (this.props.fallback) return this.props.fallback;

        const label = this.props.label || 'Module';

        return (
            <ErrorFallbackUI
                label={label}
                error={this.state.error}
                info={this.state.info}
                onReset={() => this.setState({ hasError: false, error: null, info: null })}
            />
        );
    }
}
