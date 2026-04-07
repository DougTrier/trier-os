// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — IT Route Guard
 * ==========================
 * Access control wrapper for the IT Department module. Renders children only
 * if the current user has IT Admin, Creator, or granted corporate IT access.
 * All other roles see an "Access Restricted" screen.
 *
 * KEY FEATURES:
 *   - Instant local check: IT Admin and Creator roles bypass server call
 *   - Server-side check: hits /api/corp-analytics/access/check for delegated access
 *   - Loading state: spinner shown during async access check
 *   - Restricted state: branded "Access Restricted" screen with contact prompt
 *   - Wraps the entire ITDepartmentView — one guard protects all IT sub-tabs
 *
 * ACCESS RULES:
 *   it_admin  → always allowed (local check)
 *   creator   → always allowed (local check)
 *   others    → allowed only if granted via corporate IT access delegation API
 *
 * @param {ReactNode} children — The IT Department view to render on access granted
 */
import React, { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function ITRouteGuard({ children }) {
    const { t } = useTranslation();
    const [hasAccess, setHasAccess] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        const userRole = localStorage.getItem('userRole') || 'employee';
        if (['it_admin', 'creator'].includes(userRole)) {
            setHasAccess(true);
            setChecking(false);
            return;
        }

        fetch('/api/corp-analytics/access/check', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        })
            .then(r => r.json())
            .then(d => {
                setHasAccess(d.hasAccess);
                setChecking(false);
            })
            .catch(() => {
                setHasAccess(false);
                setChecking(false);
            });
    }, []);

    if (checking) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: '#64748b' }}>
                <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ marginLeft: 10 }}>{t('system.authenticating', 'Authenticating clearance...')}</span>
            </div>
        );
    }

    if (!hasAccess) {
        return (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#ef4444', background: 'rgba(239, 68, 68, 0.05)', borderRadius: 16, border: '1px solid rgba(239, 68, 68, 0.2)', margin: '20px auto', maxWidth: 600 }}>
                <ShieldAlert size={48} style={{ marginBottom: 16, opacity: 0.8 }} />
                <h2 style={{ fontSize: '1.4rem', marginBottom: 8 }}>{t('system.accessDenied', 'Executive Systems Restricted')}</h2>
                <p style={{ color: 'var(--text-muted)' }}>{t('system.accessDeniedDesc', 'You do not have the required clearance or whitelisted access to view this enterprise module.')}</p>
            </div>
        );
    }

    return children;
}
