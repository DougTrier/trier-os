// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Empty State
 * =======================
 * Platform-standard empty state component. Renders a centered icon, heading,
 * body message, and optional CTA button when a list or table has no data.
 * Used across all 30+ views to ensure consistent zero-state UX.
 *
 * KEY FEATURES:
 *   - Centered layout with configurable icon, title, message, and action
 *   - Optional primary action button (create, import, configure, etc.)
 *   - Supports any lucide-react icon or custom ReactNode as the icon prop
 *   - Dark-mode themed; inherits parent container width
 *
 * Usage:
 *   <EmptyState
 *     icon={<FolderOpen size={48} />}
 *     title="No work orders found"
 *     message="Create your first work order to get started."
 *     action={{ label: '+ Create New', onClick: handleCreate }}
 *   />
 *
 * @param {ReactNode} icon    — Icon displayed above the title
 * @param {string}    title   — Primary heading (bold)
 * @param {string}    message — Supporting explanation text
 * @param {{ label: string, onClick: Function }} [action] — Optional CTA button
 */
import React from 'react';
import { FolderOpen } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function EmptyState({
    icon,
    title,
    message = '',
    action,
    style = {},
}) {
    const { t } = useTranslation();
    const displayTitle = title !== undefined ? title : t('emptyState.noRecordsFound', 'No records found');

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            ...style,
        }}>
            <div style={{
                marginBottom: '16px',
                opacity: 0.4,
                color: 'var(--text-muted)',
            }}>
                {icon || <FolderOpen size={48} />}
            </div>
            <h3 style={{
                margin: '0 0 8px 0',
                fontSize: '1.1rem',
                fontWeight: 600,
                color: 'var(--text-main)',
                opacity: 0.7,
            }}>
                {displayTitle}
            </h3>
            {message && (
                <p style={{
                    margin: '0 0 20px 0',
                    fontSize: '0.85rem',
                    maxWidth: '360px',
                    lineHeight: 1.5,
                    opacity: 0.6,
                }}>
                    {message}
                </p>
            )}
            {action && (
                <button
                    className="btn-primary"
                    onClick={action.onClick}
                    title={action.label}
                    style={{
                        padding: '8px 20px',
                        fontSize: '0.85rem',
                    }}
                >
                    {action.icon && <span style={{ marginRight: 6 }}>{action.icon}</span>}
                    {action.label}
                </button>
            )}
        </div>
    );
}
