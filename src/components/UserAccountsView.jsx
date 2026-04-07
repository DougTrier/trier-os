// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — User Account Management
 * =====================================
 * IT Admin interface for managing all application user accounts and roles.
 * The single source of truth for who has access to what across every plant.
 *
 * KEY FEATURES:
 *   - User roster: all accounts with role, plant assignment, and last login
 *   - Create user: name, email, role, plant access, send welcome email
 *   - Per-plant role mapping: a user can have different roles at different plants
 *   - Password reset: admin-triggered reset link sent to user's email
 *   - Account activation/deactivation: disable access without deleting history
 *   - Activity log: last login timestamp and IP per user
 *   - Bulk role assignment: change role for multiple users at once
 *   - Search and filter: find users by name, email, role, or plant
 *
 * API CALLS:
 *   GET    /api/admin/users              — All user accounts
 *   POST   /api/admin/users              — Create new user account
 *   PUT    /api/admin/users/:id          — Update user role/access/status
 *   DELETE /api/admin/users/:id          — Delete user account
 *   POST   /api/admin/users/:id/reset    — Trigger password reset email
 */
import React, { useState, useEffect } from 'react';
import { Users, Shield, RefreshCw, AlertCircle, CheckCircle2, UserPen, MapPin, LayoutDashboard, Globe, Save, X, Download, UserPlus, Eye, EyeOff, Copy, ChevronDown, ChevronUp, Trash2, Lock, BarChart3 } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import LoadingSpinner from './LoadingSpinner';

export default function UserAccountsView() {
    const { t } = useTranslation();
    const [users, setUsers] = useState([]);
    const [plants, setPlants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [editingUser, setEditingUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddUser, setShowAddUser] = useState(false);
    const [editForm, setEditForm] = useState({
        defaultRole: 'technician',
        canAccessDashboard: false,
        globalAccess: false,
        canImport: false,
        canSAP: false,
        canSensorConfig: false,
        canSensorThresholds: false,
        canSensorView: false,
        canViewAnalytics: false,
        displayName: '',
        email: '',
        phone: '',
        title: '',
        plantRoles: [] // [{plantId, role}]
    });

    const fetchUsers = () => {
        setLoading(true);
        fetch('/api/auth/users/list', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        })
            .then(res => res.json())
            .then(data => {
                setUsers(data || []);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to load users', err);
                setLoading(false);
            });
    };

    const fetchPlants = () => {
        fetch('/api/database/plants')
            .then(res => res.json())
            .then(data => setPlants(data))
            .catch(err => console.error('Failed to load plants', err));
    };

    useEffect(() => {
        fetchUsers();
        fetchPlants();
    }, []);

    const startEditing = (user) => {
        setEditingUser(user);
        
        // Parse current plant access
        const currentPlants = user.PlantAccess ? user.PlantAccess.split(',').map(p => ({ plantId: p, role: 'technician' })) : [];
        
        setEditForm({
            defaultRole: user.DefaultRole || 'technician',
            canAccessDashboard: !!user.CanAccessDashboard,
            globalAccess: !!user.GlobalAccess,
            canImport: !!user.CanImport,
            canSAP: !!user.CanSAP,
            canSensorConfig: !!user.CanSensorConfig,
            canSensorThresholds: !!user.CanSensorThresholds,
            canSensorView: !!user.CanSensorView,
            canViewAnalytics: !!user.CanViewAnalytics,
            displayName: user.DisplayName || '',
            email: user.Email || '',
            phone: user.Phone || '',
            title: user.Title || '',
            plantRoles: currentPlants
        });
    };

    const togglePlant = (plantId) => {
        const index = editForm.plantRoles.findIndex(p => p.plantId === plantId);
        if (index > -1) {
            setEditForm({ ...editForm, plantRoles: editForm.plantRoles.filter(p => p.plantId !== plantId) });
        } else {
            setEditForm({ ...editForm, plantRoles: [...editForm.plantRoles, { plantId, role: 'technician' }] });
        }
    };

    const handleSaveAccess = async () => {
        setStatus({ type: '', message: '' });
        try {
            const res = await fetch('/api/auth/users/update-access', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({
                    targetUsername: editingUser.Username,
                    ...editForm
                })
            });

            if (res.ok) {
                setStatus({ type: 'success', message: `Permissions updated for ${editingUser.Username}` });
                setEditingUser(null);
                fetchUsers();
            } else {
                const data = await res.json();
                setStatus({ type: 'error', message: data.error || 'Update failed' });
            }
        } catch (err) {
            setStatus({ type: 'error', message: 'Network error' });
        }
    };

    const handleReset = async (username) => {
        if (!await confirm(`Are you sure you want to reset the password for ${username}?`)) return;

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ targetUsername: username })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setStatus({ type: 'success', message: data.message || `Password reset for ${username}` });
                fetchUsers();
            } else {
                setStatus({ type: 'error', message: data.error || 'Failed to reset password' });
            }
        } catch (err) {
            setStatus({ type: 'error', message: `Reset failed: ${err.message}` });
        }
    };

    const handleDeleteUser = async (user) => {
        const isCreator = user.DefaultRole === 'creator' || user.Username === 'Doug Trier';
        if (isCreator) return; // Should never reach here — button is hidden

        if (!await confirm(`⚠️ DELETE USER\n\nAre you sure you want to permanently delete "${user.DisplayName || user.Username}"?\n\nThis action cannot be undone.`)) return;
        if (!await confirm(`🔴 FINAL CONFIRMATION\n\nType OK to permanently remove:\n  Username: ${user.Username}\n  User ID: ${user.UserID}\n\nAll permissions and plant assignments will be destroyed.`)) return;

        try {
            const res = await fetch('/api/auth/users/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ targetUsername: user.Username })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setStatus({ type: 'success', message: data.message });
                setEditingUser(null);
                fetchUsers();
            } else {
                setStatus({ type: 'error', message: data.error || 'Deletion failed' });
            }
        } catch (err) {
            setStatus({ type: 'error', message: 'Network error during deletion' });
        }
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', color: '#fff', minWidth: 0, overflow: 'hidden', flex: 1 }}>
            <div className="glass-card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary)' }}>
                    <Users size={24} /> {t('user.accounts.userAccountPermissions')}
                </h2>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <Download size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', opacity: 0.5, pointerEvents: 'none' }} />
                        <input 
                            type="text" 
                            placeholder={t('user.accounts.filterByNameRole')} 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ 
                                paddingLeft: '35px', 
                                width: '260px', 
                                height: '38px',
                                fontSize: '0.85rem',
                                background: 'rgba(0,0,0,0.2)'
                            }}
                            title={t('userAccountsView.filterUsersByNameRoleTip')}
                        />
                    </div>
                    <button 
                        onClick={() => setShowAddUser(!showAddUser)} 
                        className={showAddUser ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
                        title={t('userAccountsView.toggleTheNewUserCreationTip')}
                    >
                        <UserPlus size={16} /> Add User {showAddUser ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button onClick={fetchUsers} className="btn-secondary" style={{ padding: '8px 12px', height: '38px' }} title={t('userAccountsView.reloadTheUserListTip')}>
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            {/* ── ADD USER PANEL ── */}
            {showAddUser && (
                <AddUserPanel 
                    plants={plants} 
                    onCreated={(msg) => { 
                        setStatus({ type: 'success', message: msg });
                        setShowAddUser(false);
                        fetchUsers();
                    }}
                    onError={(msg) => setStatus({ type: 'error', message: msg })}
                    onCancel={() => setShowAddUser(false)}
                />
            )}

            {status.message && (
                <div style={{
                    background: status.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    color: status.type === 'error' ? '#f87171' : '#34d399',
                    padding: '15px', borderRadius: '12px', border: '1px solid currentColor',
                    display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                    {status.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
                    {status.message}
                </div>
            )}

            <div className="glass-card" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontSize: '0.85rem', position: 'sticky', top: 0, zIndex: 10 }}>
                            <tr>
                                <th style={{ padding: '15px' }}>{t('user.accounts.userIdentities')}</th>
                                <th style={{ padding: '15px' }}>{t('user.accounts.globalPermissions')}</th>
                                <th style={{ padding: '15px' }}>{t('user.accounts.status')}</th>
                                <th style={{ padding: '15px', textAlign: 'right' }}>{t('user.accounts.management')}</th>
                                <th style={{ padding: '15px' }}>{t('user.accounts.plantOwnership')}</th>
                            </tr>
                        </thead>
                    </table>
                </div>

                <div className="scroll-area" style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minHeight: 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <tbody style={{ borderTop: 'none' }}>
                            {users.filter(u => {
                                const term = searchTerm.toLowerCase();
                                return u.Username.toLowerCase().includes(term) || 
                                       (u.PlantAccess || '').toLowerCase().includes(term) ||
                                       (u.DefaultRole || '').toLowerCase().includes(term);
                            }).map(user => (
                            <React.Fragment key={user.UserID}>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: editingUser?.UserID === user.UserID ? 'rgba(99, 102, 241, 0.05)' : 'transparent' }}>
                                    <td style={{ padding: '15px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ fontWeight: 600 }}>{user.DisplayName || user.Username}</div>
                                            <span style={{ 
                                                fontSize: '0.6rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                                                background: user.DefaultRole === 'creator' ? 'rgba(245,158,11,0.15)' : user.DefaultRole === 'it_admin' ? 'rgba(139,92,246,0.15)' : ['general_manager','plant_manager','maintenance_manager'].includes(user.DefaultRole) ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
                                                color: user.DefaultRole === 'creator' ? '#f59e0b' : user.DefaultRole === 'it_admin' ? '#a78bfa' : ['general_manager','plant_manager','maintenance_manager'].includes(user.DefaultRole) ? '#34d399' : 'var(--text-muted)',
                                                border: `1px solid ${user.DefaultRole === 'creator' ? 'rgba(245,158,11,0.3)' : user.DefaultRole === 'it_admin' ? 'rgba(139,92,246,0.3)' : ['general_manager','plant_manager','maintenance_manager'].includes(user.DefaultRole) ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`
                                            }}>
                                                {(user.DefaultRole || 'technician').replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{user.Title || t('user.accounts.technician')} | ID: {user.UserID}</div>
                                    </td>
                                    <td style={{ padding: '15px' }}>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {user.CanAccessDashboard === 1 && (
                                                <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>
                                                    <LayoutDashboard size={10} style={{ marginRight: '4px' }} /> {t('user.accounts.dashboard')}
                                                </span>
                                            )}
                                            {user.GlobalAccess === 1 && (
                                                <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                                                    <Globe size={10} style={{ marginRight: '4px' }} /> {t('user.accounts.global')}
                                                </span>
                                            )}
                                            {user.CanImport === 1 && (
                                                <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                                                    <Download size={10} style={{ marginRight: '4px' }} /> {t('user.accounts.importer')}
                                                </span>
                                            )}
                                            {user.CanSAP === 1 && (
                                                <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                                                    <Shield size={10} style={{ marginRight: '4px' }} /> {t('user.accounts.sapAuth')}
                                                </span>
                                            )}
                                            {!user.CanAccessDashboard && !user.GlobalAccess && !user.CanImport && !user.CanSAP && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('user.accounts.none')}</span>}
                                        </div>
                                    </td>
                                    <td style={{ padding: '15px' }}>
                                        {user.MustChangePassword ? (
                                            <span style={{ color: '#fbbf24', fontSize: '0.8rem' }}>⚠️ Action Pending</span>
                                        ) : (
                                            <span style={{ color: '#34d399', fontSize: '0.8rem' }}>{t('user.accounts.verified')}</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '15px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button 
                                                onClick={() => startEditing(user)}
                                                className="btn-primary btn-sm" 
                                                disabled={user.Username === 'it_admin' && localStorage.getItem('currentUser') !== 'Doug Trier'}
                                                title={`Edit permissions for ${user.DisplayName || user.Username}`}
                                            >
                                                <UserPen size={14} /> {t('user.accounts.permissions')}
                                            </button>
                                            <button 
                                                onClick={() => handleReset(user.Username)}
                                                className="btn-danger btn-sm" 
                                                disabled={user.Username === 'it_admin' || user.Username === 'Doug Trier'}
                                                title={`Reset password for ${user.Username}`}
                                            >
                                                <RefreshCw size={14} /> {t('user.accounts.reset')}
                                            </button>
                                            {(user.DefaultRole === 'creator' || user.Username === 'Doug Trier') ? (
                                                <button 
                                                    disabled
                                                    className="btn-secondary btn-sm" 
                                                    style={{ opacity: 0.3, cursor: 'not-allowed' }}
                                                    title={t('user.accounts.creatorAccountIsPermanently')}
                                                >
                                                    <Lock size={14} />
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={() => handleDeleteUser(user)}
                                                    className="btn-danger btn-sm" 
                                                    title={`${t('btn.delete')} ${user.Username}`}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '15px', fontSize: '0.85rem' }}>
                                        {user.PlantAccess ? user.PlantAccess.split(',').map(p => (
                                            <span key={p} style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', marginRight: '5px' }}>{p}</span>
                                        )) : <span style={{ color: 'var(--text-muted)' }}>{t('user.accounts.localOnly')}</span>}
                                    </td>
                                </tr>
                                
                                {editingUser?.UserID === user.UserID && (
                                    <tr>
                                        <td colSpan="5" style={{ padding: '20px', background: 'rgba(0,0,0,0.2)', borderBottom: '2px solid var(--primary)' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '30px' }}>
                                                <div>
                                                    <h4 style={{ margin: '0 0 12px 0', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b' }}>🎖️ Role & Authority Level</h4>
                                                    <div style={{ marginBottom: '20px' }}>
                                                        <select 
                                                            value={editForm.defaultRole}
                                                            onChange={e => {
                                                                const r = e.target.value;
                                                                const mgmt = ['general_manager', 'plant_manager', 'maintenance_manager', 'it_admin', 'creator'];
                                                                setEditForm(prev => ({
                                                                    ...prev,
                                                                    defaultRole: r,
                                                                    canViewAnalytics: mgmt.includes(r) ? true : prev.canViewAnalytics,
                                                                    canAccessDashboard: mgmt.includes(r) ? true : prev.canAccessDashboard,
                                                                    globalAccess: r === 'general_manager' || ['it_admin','creator'].includes(r) ? true : prev.globalAccess
                                                                }));
                                                            }}
                                                            style={{ width: '100%', padding: '10px 12px', fontSize: '0.9rem', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                                                            title={t('userAccountsView.setTheAuthorityLevelForTip')}
                                                            disabled={editingUser?.DefaultRole === 'creator' && localStorage.getItem('PF_USER_IS_CREATOR') !== 'true'}
                                                        >
                                                            <option value="technician">{t('userAccountsView.technicianStandardPlantWorker')}</option>
                                                            <option value="supervisor">{t('userAccountsView.supervisorTeamLeadShiftSupervisor')}</option>
                                                            <option value="maintenance_manager">{t('userAccountsView.maintenanceManagerPlantMaintenanceAuthority')}</option>
                                                            <option value="plant_manager">{t('userAccountsView.plantManagerFullPlantOperations')}</option>
                                                            <option value="general_manager">{t('userAccountsView.generalManagerMultisiteCorporateAuthority')}</option>
                                                            <option value="it_admin">{t('userAccountsView.itAdministratorSystemAdministration')}</option>
                                                            {editForm.defaultRole === 'creator' && <option value="creator">{t('userAccountsView.creatorSystemCreatorLocked')}</option>}
                                                        </select>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px', padding: '0 2px' }}>
                                                            {editForm.defaultRole === 'technician' && 'Standard access: can view and update work orders at assigned plants.'}
                                                            {editForm.defaultRole === 'supervisor' && 'Team lead access: can manage shift assignments and oversee technician work.'}
                                                            {editForm.defaultRole === 'maintenance_manager' && '✅ Includes Workforce Analytics access. Authority over maintenance operations at assigned plants.'}
                                                            {editForm.defaultRole === 'plant_manager' && '✅ Includes Workforce Analytics access. Full operational authority over assigned plant(s).'}
                                                            {editForm.defaultRole === 'general_manager' && '✅ Includes Workforce Analytics + Global Access. Corporate-level multi-site authority.'}
                                                            {editForm.defaultRole === 'it_admin' && '✅ Full system access including all features, analytics, and administration tools.'}
                                                            {editForm.defaultRole === 'creator' && '🔒 Permanent system creator with irrevocable full access.'}
                                                        </div>
                                                    </div>

                                                    <h4 style={{ margin: '0 0 15px 0', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>{t('user.accounts.featureAccess')}</h4>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={editForm.canAccessDashboard} 
                                                                onChange={e => setEditForm({...editForm, canAccessDashboard: e.target.checked})}
                                                                title={t('userAccountsView.allowThisUserToAccessTip')}
                                                            />
                                                            <span>{t('user.accounts.authorizeAnalyticsDashboard')}</span>
                                                        </label>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={editForm.globalAccess} 
                                                                onChange={e => setEditForm({...editForm, globalAccess: e.target.checked})}
                                                                title={t('userAccountsView.grantMultisiteVisibilityAcrossAllTip')}
                                                            />
                                                            <span>{t('user.accounts.grantMultisiteVisibilityCorporate')}</span>
                                                        </label>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={editForm.canImport} 
                                                                onChange={e => setEditForm({...editForm, canImport: e.target.checked})}
                                                                title={t('userAccountsView.authorizeThisUserToRunTip')}
                                                            />
                                                            <span>{t('user.accounts.authorizeUniversalDataImporter')}</span>
                                                        </label>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={editForm.canSAP} 
                                                                onChange={e => setEditForm({...editForm, canSAP: e.target.checked})}
                                                                title={t('userAccountsView.authorizeSapEnterpriseIntegrationAccessTip')}
                                                            />
                                                            <span>{t('user.accounts.authorizeSapEnterpriseIntegration')}</span>
                                                        </label>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={editForm.canViewAnalytics} 
                                                                onChange={e => setEditForm({...editForm, canViewAnalytics: e.target.checked})}
                                                                title={t('userAccountsView.allowThisUserToAccessTip')}
                                                            />
                                                            <span>{t('userAccountsView.authorizeWorkforceAnalytics')}</span>
                                                        </label>
                                                    </div>

                                                    <h4 style={{ margin: '20px 0 15px 0', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', color: '#10b981' }}>🌡️ SCADA / Sensor Gateway</h4>
                                                    {['technician', 'supervisor'].includes(editForm.defaultRole) && (
                                                        <div style={{ background: 'rgba(245,158,11,0.1)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.8rem', color: '#fbbf24', marginBottom: '10px', lineHeight: '1.5' }}>
                                                            ⚠️ <strong>{t('userAccountsView.sensorConfigThresholdsAreRestricted')}</strong> (Maintenance Manager, Plant Manager, General Manager, IT Admin). Technicians and Supervisors can only view live sensor readings. <em>{t('userAccountsView.toGrantConfigAccessPromote')}</em>
                                                        </div>
                                                    )}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: ['technician', 'supervisor'].includes(editForm.defaultRole) ? 'not-allowed' : 'pointer', opacity: ['technician', 'supervisor'].includes(editForm.defaultRole) ? 0.4 : 1 }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={editForm.canSensorConfig} 
                                                                onChange={e => setEditForm({...editForm, canSensorConfig: e.target.checked})}
                                                                disabled={['technician', 'supervisor'].includes(editForm.defaultRole)}
                                                                title={['technician', 'supervisor'].includes(editForm.defaultRole) ? 'Requires management role (Maintenance Manager or higher)' : 'Allow this user to register and configure physical sensors'}
                                                            />
                                                            <span>{t('user.accounts.physicalSensorRegistration')}</span>
                                                        </label>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: ['technician', 'supervisor'].includes(editForm.defaultRole) ? 'not-allowed' : 'pointer', opacity: ['technician', 'supervisor'].includes(editForm.defaultRole) ? 0.4 : 1 }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={editForm.canSensorThresholds} 
                                                                onChange={e => setEditForm({...editForm, canSensorThresholds: e.target.checked})}
                                                                disabled={['technician', 'supervisor'].includes(editForm.defaultRole)}
                                                                title={['technician', 'supervisor'].includes(editForm.defaultRole) ? 'Requires management role (Maintenance Manager or higher)' : 'Allow this user to configure sensor thresholds and auto-WO rules'}
                                                            />
                                                            <span>{t('user.accounts.thresholdRulesAutowoSetup')}</span>
                                                        </label>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={editForm.canSensorView} 
                                                                onChange={e => setEditForm({...editForm, canSensorView: e.target.checked})}
                                                                title={t('userAccountsView.allowThisUserToViewTip')}
                                                            />
                                                            <span>{t('user.accounts.viewLiveSensorReadings')}</span>
                                                        </label>
                                                    </div>

                                                    <h4 style={{ margin: '20px 0 15px 0', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>{t('user.accounts.contactDetailsDiscovery')}</h4>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>FULL NAME</label>
                                                            <input type="text" value={editForm.displayName} onChange={e => setEditForm({...editForm, displayName: e.target.value})} style={{ width: '100%', fontSize: '0.85rem' }} title={t('userAccountsView.usersFullDisplayNameTip')} />
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>JOB TITLE</label>
                                                            <input type="text" placeholder={t('user.accounts.egMaintenanceManager')} value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} style={{ width: '100%', fontSize: '0.85rem' }} title={t('userAccountsView.usersJobTitleTip')} />
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('user.accounts.emailAddress')}</label>
                                                            <input type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} style={{ width: '100%', fontSize: '0.85rem' }} title={t('userAccountsView.usersEmailAddressTip')} />
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('user.accounts.phoneNumber')}</label>
                                                            <input type="text" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} style={{ width: '100%', fontSize: '0.85rem' }} title={t('userAccountsView.usersPhoneNumberTip')} />
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div>
                                                    <h4 style={{ margin: '0 0 15px 0', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>{t('user.accounts.siteAssignments')}</span>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{plants.length} Total Facilities</span>
                                                    </h4>
                                                    <div className="scroll-area" style={{ 
                                                        display: 'grid', 
                                                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                                                        gap: '8px',
                                                        maxHeight: '250px',
                                                        overflowY: 'scroll',
                                                        padding: '10px',
                                                        background: 'rgba(0,0,0,0.2)',
                                                        borderRadius: '8px',
                                                        border: '1px solid var(--glass-border)'
                                                    }}>
                                                        {plants.map(p => (
                                                            <label key={p.id} style={{ 
                                                                display: 'flex', alignItems: 'center', gap: '8px', 
                                                                padding: '6px 10px', background: 'rgba(255,255,255,0.05)', 
                                                                borderRadius: '6px', border: editForm.plantRoles.some(pr => pr.plantId === p.id) ? '1px solid var(--primary)' : '1px solid transparent',
                                                                cursor: 'pointer'
                                                            }}>
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={editForm.plantRoles.some(pr => pr.plantId === p.id)} 
                                                                    onChange={() => togglePlant(p.id)}
                                                                    title={`Toggle access to ${p.label}`}
                                                                />
                                                                <span style={{ fontSize: '0.85rem' }}>{p.label}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--glass-border)', paddingTop: '15px' }}>
                                                <button onClick={() => setEditingUser(null)} className="btn-secondary" style={{ padding: '8px 16px' }} title={t('userAccountsView.cancelEditingAndCloseTheTip')}>
                                                    <X size={16} style={{ marginRight: '6px' }} /> {t('user.accounts.cancel')}
                                                </button>
                                                <button onClick={handleSaveAccess} className="btn-save" style={{ padding: '8px 20px',  }} title={t('userAccountsView.saveAllPermissionChangesForTip')}>
                                                    <Save size={16} style={{ marginRight: '6px' }} /> {t('user.accounts.applySecurityChanges')}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD USER PANEL — Admin/Creator Only
// ═══════════════════════════════════════════════════════════════════════════════

function AddUserPanel({ plants, onCreated, onError, onCancel }) {
    const { t } = useTranslation();
    const generateTempPassword = () => `Trier${Math.floor(1000 + Math.random() * 9000)}!`;

    const [form, setForm] = useState({
        username: '',
        tempPassword: generateTempPassword(),
        displayName: '',
        title: '',
        email: '',
        phone: '',
        defaultRole: 'technician',
        plantAssignments: [],
        canAccessDashboard: false,
        globalAccess: false,
        canImport: false,
        canSAP: false,
        canViewAnalytics: false
    });
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [createdInfo, setCreatedInfo] = useState(null);
    const [localError, setLocalError] = useState('');

    const togglePlant = (plantId) => {
        const exists = form.plantAssignments.find(a => a.plantId === plantId);
        if (exists) {
            setForm({ ...form, plantAssignments: form.plantAssignments.filter(a => a.plantId !== plantId) });
        } else {
            setForm({ ...form, plantAssignments: [...form.plantAssignments, { plantId, role: form.defaultRole }] });
        }
    };

    const handleSubmit = async () => {
        setLocalError('');
        if (!form.username.trim()) { setLocalError('Username is required.'); return; }
        if (form.plantAssignments.length === 0) { setLocalError('Select at least one plant assignment.'); return; }

        setSubmitting(true);
        try {
            const res = await fetch('/api/auth/users/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setCreatedInfo(data);
            } else {
                setLocalError(data.error || 'Failed to create user');
                onError(data.error || 'Failed to create user');
            }
        } catch (err) {
            setLocalError('Network error: ' + err.message);
        }
        setSubmitting(false);
    };

    const copyPassword = () => {
        navigator.clipboard.writeText(form.tempPassword);
        // Brief visual feedback via the button
    };

    const inputStyle = { width: '100%', padding: '9px 12px', fontSize: '0.85rem', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' };
    const labelStyle = { display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 };

    // ── SUCCESS STATE ──
    if (createdInfo) {
        return (
            <div className="glass-card" style={{ padding: '25px', border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <CheckCircle2 size={28} color="#10b981" />
                    <div>
                        <h3 style={{ margin: 0, color: '#10b981' }}>{t('user.accounts.userCreatedSuccessfully')}</h3>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>User ID: {createdInfo.userId}</div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>{t('user.accounts.username')}</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', fontFamily: "'Outfit', sans-serif" }}>{form.username}</div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>{t('user.accounts.temporaryPassword')}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '1.1rem', fontFamily: "'Outfit', sans-serif", color: '#f59e0b' }}>{form.tempPassword}</span>
                            <button onClick={copyPassword} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }} title={t('user.accounts.copyPassword')}>
                                <Copy size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.85rem', color: '#fbbf24', marginBottom: '15px' }}>
                    ⚠️ Share this temporary password with the user. They will be required to change it on first login.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => onCreated(`User "${form.username}" created successfully`)} className="btn-primary" title={t('userAccountsView.closeThisPanelAndReturnTip')}>
                        {t('user.accounts.done')}
                    </button>
                </div>
            </div>
        );
    }

    // ── CREATE FORM ──
    return (
        <div className="glass-card" style={{ padding: '25px', border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary)' }}>
                    <UserPlus size={20} /> {t('user.accounts.createNewUserAccount')}
                </h3>
                <div className="badge badge-purple" style={{ fontSize: '0.72rem' }}>
                    <Shield size={10} style={{ marginRight: '4px' }} /> {t('user.accounts.adminOnly')}
                </div>
            </div>

            {localError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', padding: '10px 15px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.4)', fontSize: '0.85rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={16} /> {localError}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                {/* Column 1: Identity */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', paddingBottom: '8px', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}>{t('user.accounts.identity')}</h4>
                    <div>
                        <label style={labelStyle}>{t('user.accounts.username')} <span style={{ color: '#ef4444' }}>*</span></label>
                        <input type="text" value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder={t('user.accounts.egJsmith')} style={inputStyle} title={t('userAccountsView.loginUsernameForTheNewTip')} />
                    </div>
                    <div>
                        <label style={labelStyle}>{t('user.accounts.temporaryPassword')}</label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <input 
                                    type={showPassword ? 'text' : 'password'} 
                                    value={form.tempPassword} 
                                    onChange={e => setForm({...form, tempPassword: e.target.value})}
                                    style={{ ...inputStyle, paddingRight: '35px' }} 
                                    title={t('userAccountsView.temporaryPasswordForTheNewTip')}
                                />
                                <button 
                                    onClick={() => setShowPassword(!showPassword)} 
                                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                                    title={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                            <button onClick={copyPassword} className="btn-secondary" style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontSize: '0.75rem' }} title={t('user.accounts.copyToClipboard')}>
                                <Copy size={14} />
                            </button>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>{t('user.accounts.userWillBeRequired')}</div>
                    </div>
                    <div>
                        <label style={labelStyle}>{t('user.accounts.displayName')}</label>
                        <input type="text" value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} placeholder={t('user.accounts.fullName')} style={inputStyle} title={t('userAccountsView.usersFullDisplayNameTip')} />
                    </div>
                    <div>
                        <label style={labelStyle}>{t('user.accounts.jobTitle')}</label>
                        <input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder={t('user.accounts.egMaintenanceTech')} style={inputStyle} title={t('userAccountsView.usersJobTitleTip')} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                            <label style={labelStyle}>{t('user.accounts.email')}</label>
                            <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder={t('user.accounts.optional')} style={inputStyle} title={t('userAccountsView.usersEmailAddressOptionalTip')} />
                        </div>
                        <div>
                            <label style={labelStyle}>{t('user.accounts.phone')}</label>
                            <input type="text" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder={t('user.accounts.optional')} style={inputStyle} title={t('userAccountsView.usersPhoneNumberOptionalTip')} />
                        </div>
                    </div>
                </div>

                {/* Column 2: Role & Permissions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', paddingBottom: '8px', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}>{t('user.accounts.rolePermissions')}</h4>
                    <div>
                        <label style={labelStyle}>{t('user.accounts.defaultRole')}</label>
                        <select 
                            value={form.defaultRole} 
                            onChange={e => {
                                const r = e.target.value;
                                const mgmt = ['general_manager', 'plant_manager', 'maintenance_manager', 'it_admin', 'creator'];
                                setForm(prev => ({
                                    ...prev,
                                    defaultRole: r,
                                    canViewAnalytics: mgmt.includes(r) ? true : prev.canViewAnalytics,
                                    canAccessDashboard: mgmt.includes(r) ? true : prev.canAccessDashboard,
                                    globalAccess: r === 'general_manager' || ['it_admin','creator'].includes(r) ? true : prev.globalAccess
                                }));
                            }}
                            style={{ ...inputStyle, cursor: 'pointer' }}
                            title={t('userAccountsView.setTheDefaultRoleForTip')}
                        >
                            <option value="technician">{t('user.accounts.technician')}</option>
                            <option value="supervisor">{t('user.accounts.supervisor')}</option>
                            <option value="maintenance_manager">{t('userAccountsView.maintenanceManager')}</option>
                            <option value="plant_manager">{t('userAccountsView.plantManager')}</option>
                            <option value="general_manager">{t('userAccountsView.generalManager')}</option>
                            <option value="it_admin">{t('user.accounts.itAdmin')}</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                        {[
                            { key: 'canAccessDashboard', label: 'Analytics Dashboard', icon: LayoutDashboard, desc: 'View plant-wide KPIs and analytics' },
                            { key: 'globalAccess', label: 'Multi-Site Visibility', icon: Globe, desc: 'View data across all plants' },
                            { key: 'canImport', label: 'Data Importer', icon: Download, desc: 'Run Enterprise System import operations' },
                            { key: 'canSAP', label: 'SAP Integration', icon: Shield, desc: 'Access SAP enterprise bridge' },
                            { key: 'canViewAnalytics', label: 'Workforce Analytics', icon: BarChart3, desc: 'View workforce performance analytics' }
                        ].map(perm => (
                            <label key={perm.key} style={{ 
                                display: 'flex', alignItems: 'center', gap: '10px', 
                                padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                                background: form[perm.key] ? 'rgba(99,102,241,0.08)' : 'rgba(0,0,0,0.15)',
                                border: form[perm.key] ? '1px solid rgba(99,102,241,0.25)' : '1px solid transparent',
                                transition: 'all 0.2s'
                            }}>
                                <input 
                                    type="checkbox" 
                                    checked={form[perm.key]} 
                                    onChange={e => setForm({...form, [perm.key]: e.target.checked})}
                                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                                    title={`Toggle ${perm.label}: ${perm.desc}`}
                                />
                                <perm.icon size={16} color={form[perm.key] ? 'var(--primary)' : 'var(--text-muted)'} />
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: form[perm.key] ? 600 : 400 }}>{perm.label}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{perm.desc}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Column 3: Plant Assignments */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', paddingBottom: '8px', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t('user.accounts.plantAssignments')} <span style={{ color: '#ef4444' }}>*</span></span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>{form.plantAssignments.length} selected</span>
                    </h4>
                    <div className="scroll-area" style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr', 
                        gap: '4px', 
                        maxHeight: '340px', 
                        overflowY: 'auto', 
                        padding: '8px',
                        background: 'rgba(0,0,0,0.15)',
                        borderRadius: '8px',
                        border: '1px solid var(--glass-border)'
                    }}>
                        {plants.map(p => {
                            const isSelected = form.plantAssignments.some(a => a.plantId === p.id);
                            return (
                                <label key={p.id} style={{ 
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '7px 10px', borderRadius: '6px', cursor: 'pointer',
                                    background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent',
                                    border: isSelected ? '1px solid rgba(99,102,241,0.25)' : '1px solid transparent',
                                    transition: 'all 0.15s'
                                }}>
                                    <input 
                                        type="checkbox" 
                                        checked={isSelected}
                                        onChange={() => togglePlant(p.id)}
                                        style={{ accentColor: 'var(--primary)' }}
                                        title={`Toggle access to ${p.label}`}
                                    />
                                    <MapPin size={12} color={isSelected ? 'var(--primary)' : 'var(--text-muted)'} />
                                    <span style={{ fontSize: '0.82rem', fontWeight: isSelected ? 600 : 400 }}>{p.label}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Action bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', paddingTop: '15px', borderTop: '1px solid var(--glass-border)' }}>
                <button onClick={onCancel} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }} title={t('userAccountsView.cancelAndCloseUserCreationTip')}>
                    <X size={14} style={{ marginRight: '6px' }} /> {t('user.accounts.cancel')}
                </button>
                    <button 
                    onClick={handleSubmit} 
                    disabled={submitting}
                    className="btn-save" 
                    title={t('userAccountsView.createThisUserAccountAndTip')}
                >
                    {submitting ? <><RefreshCw size={14} className="spinning" /> {t('user.accounts.creating')}</> : <><UserPlus size={14} /> {t('user.accounts.createUserAccount')}</>}
                </button>
            </div>
        </div>
    );
}
