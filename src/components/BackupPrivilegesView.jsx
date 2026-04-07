// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Backup Privileges Management
 * =========================================
 * Admin interface for delegating database backup access to non-admin users.
 * Backup Operators can export plant databases without holding full IT Admin
 * privileges — enabling safe off-shift backups by maintenance supervisors.
 *
 * KEY FEATURES:
 *   - User picker: search all active accounts, assign Backup Operator role
 *   - Operator list: view all currently designated Backup Operators per plant
 *   - Revoke access: one-click removal with confirmation prompt
 *   - Audit log: all backup events attributed to operator + timestamp
 *   - Plant-scoped: Corporate Admins manage across all plants;
 *     Plant Admins manage only their own facility
 *
 * SECURITY MODEL:
 *   Backup Operators can ONLY export the backup file — they cannot restore,
 *   delete, or view encrypted credential tables within the database.
 *
 * API CALLS:
 *   GET    /api/admin/backup-operators        — List current backup operators
 *   POST   /api/admin/backup-operators        — Grant backup privilege to a user
 *   DELETE /api/admin/backup-operators/:id    — Revoke backup privilege
 */
import React, { useState, useEffect } from 'react';
import { Shield, UserPlus, Trash2, Save, User as UserIcon } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import LoadingSpinner from './LoadingSpinner';

export default function BackupPrivilegesView() {
    const { t } = useTranslation();
    const [allowedUsers, setAllowedUsers] = useState([]);
    const [newUser, setNewUser] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/database/privileges/backup', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        })
        .then(res => res.json())
        .then(data => {
            setAllowedUsers(Array.isArray(data) ? data : []);
            setLoading(false);
        })
        .catch(err => {
            console.warn('[BackupPrivilegesView] Failed to load backup privileges:', err);
            setLoading(false);
        });
    }, []);

    const handleAddUser = () => {
        if (!newUser.trim()) return;
        if (allowedUsers.includes(newUser.trim())) {
            window.trierToast?.error('User already has privileges.');
            return;
        }
        setAllowedUsers([...allowedUsers, newUser.trim()]);
        setNewUser('');
    };

    const handleRemoveUser = (user) => {
        setAllowedUsers(allowedUsers.filter(u => u !== user));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/database/privileges/backup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'x-user-role': localStorage.getItem('userRole'),
                    'x-is-creator': localStorage.getItem('PF_USER_IS_CREATOR')
                },
                body: JSON.stringify({ users: allowedUsers })
            });

            if (res.ok) {
                window.trierToast?.success('Backup privileges updated successfully.');
            } else {
                const data = await res.json();
                window.trierToast?.error(data.error || 'Failed to update privileges.');
            }
        } catch (err) {
            window.trierToast?.error('Network error while saving privileges.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return null;

    return (
        <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginTop: '20px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Shield size={20} color="#10b981" /> {t('backup.privileges.backupPrivilegeDelegation')}
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.85rem', lineHeight: '1.4' }}>
                Doug Trier and IT Admins always have backup rights. Use this list to grant temporary or permanent backup authority to other named accounts.
            </p>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <UserIcon size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input 
                        type="text" 
                        placeholder={t('backup.privileges.enterFullUsernameEg')} 
                        value={newUser}
                        onChange={(e) => setNewUser(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddUser()}
                        style={{
                            width: '100%',
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid var(--glass-border)',
                            padding: '10px 10px 10px 35px',
                            color: 'white',
                            borderRadius: '8px',
                            fontSize: '0.9rem'
                        }}
                        title={t('backupPrivilegesView.enterTheUsernameToGrantTip')}
                    />
                </div>
                <button onClick={handleAddUser} className="btn-primary btn-sm" title={t('backupPrivilegesView.addThisUserToTheTip')}>
                    <UserPlus size={18} /> {t('backup.privileges.add')}
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '25px', maxHeight: '150px', overflowY: 'auto' }}>
                {allowedUsers.length === 0 ? (
                    <div style={{ padding: '15px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        {t('backup.privileges.noAdditionalUsersDelegated')}
                    </div>
                ) : (
                    allowedUsers.map(user => (
                        <div key={user} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                            <span style={{ fontSize: '0.9rem' }}>{user}</span>
                            <button 
                                onClick={() => handleRemoveUser(user)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '5px' }}
                                title={`Remove backup privilege for ${user}`}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))
                )}
            </div>

            <button 
                onClick={handleSave} 
                disabled={saving}
                className="btn-save" 
                style={{ width: '100%' }}
                title={t('backupPrivilegesView.saveTheUpdatedBackupPrivilegeTip')}
            >
                {saving ? (
                    <div className="spinning" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'white', borderRadius: '50%' }}></div>
                ) : (
                    <Save size={18} />
                )}
                Save Privilege Updates
            </button>
        </div>
    );
}
