// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Loading Spinner
 * ===========================
 * Platform-standard loading state indicator. Displays a centered animated
 * spinner with optional status message during data fetch operations.
 * Used across all 30+ views whenever async data is loading.
 *
 * KEY FEATURES:
 *   - Default: full-panel centered spinner with "Loading..." text
 *   - Custom message: pass any string for context-aware loading text
 *   - Size prop: scale the spinner icon for different container sizes
 *   - Inline mode: renders as an inline-flex element (for button spinners)
 *   - Dark-mode themed; matches current Trier OS color palette
 *
 * Usage:
 *   <LoadingSpinner />
 *   <LoadingSpinner message="Loading work orders..." />
 *   <LoadingSpinner size={32} />
 *   <LoadingSpinner inline />
 *
 * @param {string}  [message] — Optional status text displayed below the spinner
 * @param {number}  [size]    — Spinner icon size in pixels (default 24)
 * @param {boolean} [inline]  — Render inline for use inside buttons or text
 */
import React from 'react';
import { RefreshCw } from 'lucide-react';

export default function LoadingSpinner({
    message = 'Loading...',
    size = 24,
    inline = false,
    style = {},
}) {
    if (inline) {
        return (
            <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--text-muted)',
                fontSize: '0.85rem',
                ...style,
            }}>
                <RefreshCw size={size * 0.66} className="spinning" />
                {message}
            </span>
        );
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            color: 'var(--text-muted)',
            ...style,
        }}>
            <RefreshCw size={size} className="spinning" style={{ marginBottom: 12, opacity: 0.5 }} />
            {message && (
                <span style={{ fontSize: '0.85rem', opacity: 0.6 }}>{message}</span>
            )}
        </div>
    );
}
