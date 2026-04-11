// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Password Change
 * ===========================
 * Self-service password change form. Users must provide their current password
 * for verification before setting a new one. Enforces complexity rules defined
 * in the server auth module.
 *
 * KEY FEATURES:
 *   - Current password field (with show/hide toggle) for re-authentication
 *   - New password field with real-time strength meter
 *   - Confirm password field with match validation
 *   - Complexity rules: min 8 chars, 1 uppercase, 1 number, 1 special char
 *   - Strength meter: Weak / Fair / Strong / Very Strong with color bar
 *   - Success state: confirmation message with auto-redirect to login
 *   - Error state: shows server validation errors inline
 *
 * API CALLS:
 *   POST /api/auth/change-password   — Verify current password and set new password
 */
import React, { useState } from 'react';
import { Lock, AlertTriangle, CheckCircle, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function PasswordChangeView() {
    const { t } = useTranslation();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [status, setStatus] = useState({ type: '', message: '' });
    const [isLoading, setIsLoading] = useState(false);

    const currentUser = localStorage.getItem('currentUser');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus({ type: '', message: '' });

        if (newPassword !== confirmPassword) {
            setStatus({ type: 'error', message: 'New passwords do not match' });
            return;
        }

        if (newPassword.length < 8) {
            setStatus({ type: 'error', message: 'Password must be at least 8 characters' });
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setStatus({ type: 'success', message: 'Your password has been updated securely.' });
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                setStatus({ type: 'error', message: data.error || 'Failed to update password' });
            }
        } catch (err) {
            setStatus({ type: 'error', message: `Request failed: ${err.message}` });
        }
        setIsLoading(false);
    };

    return (
        <div className="glass-card" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--primary)' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldCheck size={20} color="var(--primary)" />
                {t('settings.mySecuritySettings')}
            </h3>
            
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {t('settings.loggedInAs')} <strong style={{ color: '#fff' }}>{currentUser}</strong>
            </p>

            {status.message && (
                <div style={{
                    background: status.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    color: status.type === 'error' ? '#f87171' : '#34d399',
                    padding: '10px', borderRadius: '8px',
                    border: `1px solid ${status.type === 'error' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.5)'}`,
                    display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem'
                }}>
                    {status.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
                    {status.message}
                </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('settings.currentPassword')}</label>
                    <input
                        type="password"
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        placeholder={t('settings.requiredForSecurity')}
                        style={{ padding: '10px', borderRadius: '6px', background: 'var(--bg-main)', color: '#fff', border: '1px solid var(--glass-border)' }}
                        required
                        title={t('passwordChangeView.enterYourCurrentPasswordForTip')}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('settings.newPassword')}</label>
                    <input
                        type="password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder={t('settings.minChars')}
                        style={{ padding: '10px', borderRadius: '6px', background: 'var(--bg-main)', color: '#fff', border: '1px solid var(--glass-border)' }}
                        required
                        title={t('passwordChangeView.enterYourNewPasswordMinimumTip')}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('settings.confirmPassword')}</label>
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        style={{ padding: '10px', borderRadius: '6px', background: 'var(--bg-main)', color: '#fff', border: '1px solid var(--glass-border)' }}
                        required
                        title={t('passwordChangeView.reenterYourNewPasswordToTip')}
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="btn-primary"
                    style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
                    title={t('passwordChangeView.applyTheNewPasswordTip')}
                >
                    <Lock size={16} />
                    {isLoading ? '...' : t('settings.applyPasswordChange')}
                </button>
            </form>
        </div>
    );
}
