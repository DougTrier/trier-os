// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Login & Authentication View
 * ==========================================
 * Entry point for all users. Handles JWT-based authentication with
 * support for LDAP/AD pass-through, TOTP 2FA (creator account),
 * and new-user enrollment requests.
 *
 * FLOWS:
 *   Standard Login   — Username + password → JWT issued → redirect to Mission Control
 *   LDAP Login       — Credentials forwarded to AD; JWT issued on success
 *   2FA (Creator)    — After password, prompted for TOTP code (Google Authenticator)
 *   Enrollment       — New users submit name, plant, role request → admin approval queue
 *   Password Reset   — Admin-initiated reset link or invite code entry
 *
 * TOKEN STORAGE: Auth JWT is stored in an httpOnly cookie set by the server on
 *   successful login — invisible to JavaScript, never touches localStorage.
 *   Plant selection stored as 'selectedPlantId' in localStorage.
 *   Cookie cleared server-side on logout (POST /api/auth/logout) or token expiry (401).
 *
 * BRANDING: Logo and primary color loaded from /api/branding before the
 *   login form renders, so each plant can show its own identity on the login screen.
 *
 * @param {Function} onLoginSuccess — Callback fired after successful auth; receives user object
 */
import React, { useState, useEffect } from 'react';
import { Lock, User, UserPlus, X, MapPin, KeyRound, CheckCircle2, Send, Briefcase, Mail, Phone, Shield, Cpu, Github, Star } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

const ROLE_OPTIONS = [
    { value: 'technician', label: '🔧 Maintenance Technician', desc: 'Field repairs & inspections' },
    { value: 'mechanic', label: '⚙️ Mechanic', desc: 'Heavy equipment & motor work' },
    { value: 'engineer', label: '📐 Engineer', desc: 'Design, specs & root cause analysis' },
    { value: 'lab_tech', label: '🧪 Lab Technician', desc: 'Testing, compliance & quality' },
    { value: 'plant_manager', label: '🏭 Plant Manager', desc: 'Full site operations oversight' },
    { value: 'it_admin', label: '🖥️ IT Administrator', desc: 'System config & user management' },
    { value: 'executive', label: '👔 Corporate Executive', desc: 'Enterprise analytics & oversight' },
    { value: 'employee', label: '👤 Regular Employee', desc: 'Basic access & work requests' },
];

export default function LoginView({ onLoginSuccess }) {
    const { t } = useTranslation();
    const [plants, setPlants] = useState([]);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // Registration State
    const [showRegister, setShowRegister] = useState(false);
    const [regPlant, setRegPlant] = useState('');
    const [regPlantPw, setRegPlantPw] = useState('');
    const [regInviteCode, setRegInviteCode] = useState('');
    const [useInviteCode, setUseInviteCode] = useState(false);
    const [regUser, setRegUser] = useState('');
    const [regPw, setRegPw] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPhone, setRegPhone] = useState('');
    const [regTitle, setRegTitle] = useState('');
    const [regSuccess, setRegSuccess] = useState('');

    // Auto-fill invite code from URL parameter
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const inviteParam = params.get('invite');
        if (inviteParam) {
            setRegInviteCode(inviteParam);
            setUseInviteCode(true);
            setShowRegister(true);
        }
    }, []);

    // Public Asset Display (From Smart QR Code Scan Without Login)
    const [publicAsset, setPublicAsset] = useState(null);
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const scanId = params.get('scan');
        if (scanId && params.get('qDesc')) {
            setPublicAsset({
                id: scanId,
                desc: params.get('qDesc'),
                model: params.get('qModel'),
                plant: params.get('qPlant'),
                loc: params.get('qLoc')
            });
        }
    }, []);

    // Enrollment State
    const [showEnroll, setShowEnroll] = useState(false);
    const [enrollName, setEnrollName] = useState('');
    const [enrollEmail, setEnrollEmail] = useState('');
    const [enrollPhone, setEnrollPhone] = useState('');
    const [enrollPlant, setEnrollPlant] = useState('');
    const [enrollRole, setEnrollRole] = useState('technician');
    const [enrollReason, setEnrollReason] = useState('');
    const [enrollSuccess, setEnrollSuccess] = useState('');

    // 2FA State
    const [show2FA, setShow2FA] = useState(false);
    const [preAuthToken, setPreAuthToken] = useState('');
    const [twoFACode, setTwoFACode] = useState('');
    const [twoFAMessage, setTwoFAMessage] = useState('');

    useEffect(() => {
        fetch('/api/database/plants')
            .then(res => res.json())
            .then(data => setPlants(data))
            .catch(err => console.error('Failed to load plants', err));
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            // 2FA Challenge
            if (data.requires2FA) {
                setPreAuthToken(data.preAuthToken);
                setTwoFAMessage(data.message);
                setShow2FA(true);
                setIsLoading(false);
                return;
            }

            if (res.ok && data.success) {
                localStorage.setItem('userRole', data.role);
                localStorage.setItem('currentUser', data.username || username);
                localStorage.setItem('PF_USER_IS_CREATOR', 'false');
                localStorage.setItem('canAccessDashboard', data.canAccessDashboard ? 'true' : 'false');
                localStorage.setItem('globalAccess', data.globalAccess ? 'true' : 'false');
                localStorage.setItem('canImport', data.canImport ? 'true' : 'false');
                localStorage.setItem('canSensorConfig', data.canSensorConfig ? 'true' : 'false');
                localStorage.setItem('canSensorThresholds', data.canSensorThresholds ? 'true' : 'false');
                localStorage.setItem('canSensorView', data.canSensorView ? 'true' : 'false');
                localStorage.setItem('canViewAnalytics', data.canViewAnalytics ? 'true' : 'false');
                localStorage.setItem('selectedPlantId', data.globalAccess ? 'all_sites' : (data.nativePlantId || 'Demo_Plant_1'));
                localStorage.setItem('nativePlantId', data.nativePlantId || 'Demo_Plant_1');
                if (data.hubIp) localStorage.setItem('plantHubIp', data.hubIp);
                else localStorage.removeItem('plantHubIp');
                if (data.hubToken) localStorage.setItem('hubToken', data.hubToken);
                else localStorage.removeItem('hubToken');
                onLoginSuccess(data);
            } else {
                setError(data.error || 'Invalid username or password');
            }
        } catch (err) {
            setError('Unable to reach the server. Check that the backend is running.');
        }
        setIsLoading(false);
    };

    const handle2FAVerify = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/verify-2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preAuthToken, code: twoFACode })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                localStorage.setItem('userRole', data.role);
                localStorage.setItem('currentUser', data.username || username);
                localStorage.setItem('PF_USER_IS_CREATOR', 'false');
                localStorage.setItem('canAccessDashboard', data.canAccessDashboard ? 'true' : 'false');
                localStorage.setItem('globalAccess', data.globalAccess ? 'true' : 'false');
                localStorage.setItem('canImport', data.canImport ? 'true' : 'false');
                localStorage.setItem('canSensorConfig', data.canSensorConfig ? 'true' : 'false');
                localStorage.setItem('canSensorThresholds', data.canSensorThresholds ? 'true' : 'false');
                localStorage.setItem('canSensorView', data.canSensorView ? 'true' : 'false');
                localStorage.setItem('canViewAnalytics', data.canViewAnalytics ? 'true' : 'false');
                localStorage.setItem('selectedPlantId', data.globalAccess ? 'all_sites' : (data.nativePlantId || 'Demo_Plant_1'));
                localStorage.setItem('nativePlantId', data.nativePlantId || 'Demo_Plant_1');
                if (data.hubIp) localStorage.setItem('plantHubIp', data.hubIp);
                else localStorage.removeItem('plantHubIp');
                setShow2FA(false);
                onLoginSuccess(data);
            } else {
                setError(data.error || 'Invalid verification code');
            }
        } catch (err) {
            setError('Verification failed — network error');
        }
        setIsLoading(false);
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const body = {
                username: regUser,
                password: regPw,
                email: regEmail,
                phone: regPhone,
                title: regTitle,
                plantId: regPlant || undefined
            };

            // Use invite code path or legacy plant password
            if (useInviteCode && regInviteCode) {
                body.inviteCode = regInviteCode;
            } else {
                body.plantId = regPlant;
                body.plantPassword = regPlantPw;
            }

            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await res.json();
            if (res.ok) {
                setRegSuccess(`Account for ${regUser} created! You can now log in.`);
                setTimeout(() => {
                    setShowRegister(false);
                    setRegSuccess('');
                    setUseInviteCode(false);
                    setRegInviteCode('');
                }, 3000);
            } else {
                setError(data.error || 'Registration failed');
            }
        } catch (err) {
            setError('Failed to reach authentication server');
        }
        setIsLoading(false);
    };

    const handleEnroll = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const res = await fetch('/api/enrollment/enroll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName: enrollName,
                    email: enrollEmail,
                    phone: enrollPhone,
                    requestedPlant: enrollPlant,
                    requestedRole: enrollRole,
                    reason: enrollReason
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setEnrollSuccess(data.message);
                setTimeout(() => {
                    setShowEnroll(false);
                    setEnrollSuccess('');
                    setEnrollName(''); setEnrollEmail(''); setEnrollPhone('');
                    setEnrollPlant(''); setEnrollRole('technician'); setEnrollReason('');
                }, 5000);
            } else {
                setError(data.error || 'Enrollment failed');
            }
        } catch (err) {
            setError('Failed to reach enrollment server');
        }
        setIsLoading(false);
    };

    const inputStyle = {
        padding: '12px', borderRadius: '8px', width: '100%', boxSizing: 'border-box',
        background: 'rgba(0,0,0,0.2)', color: '#fff',
        border: '1px solid rgba(255,255,255,0.2)', outline: 'none'
    };

    return (
        <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            minHeight: '100vh', background: 'var(--bg-main)', color: '#fff',
            fontFamily: 'system-ui, sans-serif'
        }}>
            <div className="glass-card" style={{
                padding: '40px', width: '100%', maxWidth: '400px',
                borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column', gap: '20px'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                    <img src="/assets/TrierLogo.png" alt="Trier OS" style={{ height: '240px', display: 'block', margin: '0 auto 10px auto' }} />
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>{t('login.trierOS')}</h1>
                    <p style={{ margin: '5px 0 0 0', color: 'var(--text-muted)' }}>{t('login.secureAccessPortal')}</p>
                </div>

                {error && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.5)',
                        color: '#f87171', padding: '10px', borderRadius: '8px', textAlign: 'center', fontSize: '0.9rem'
                    }}>
                        {error}
                    </div>
                )}

                {publicAsset ? (
                    <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#818cf8', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            <Cpu size={16} /> Asset Quick Look
                        </div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f8fafc', margin: '4px 0' }}>{publicAsset.desc}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem', color: '#cbd5e1', marginTop: '5px' }}>
                            <div>ID: <strong>{publicAsset.id}</strong></div>
                            <div>Model: <strong>{publicAsset.model}</strong></div>
                            <div>Plant: <strong>{publicAsset.plant}</strong></div>
                            <div>Loc: <strong>{publicAsset.loc}</strong></div>
                        </div>
                        <button 
                            type="button" 
                            onClick={() => setPublicAsset(null)}
                            style={{ padding: '10px', marginTop: '15px', borderRadius: '8px', background: 'var(--primary)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                        >
                            Log in for Full Management
                        </button>
                    </div>
                ) : (
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('login.username')}</label>
                        <div style={{ position: 'relative' }}>
                            <User size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder={t('login.enterUsername')}
                                title={t('login.enterYourAssignedUsernameEgTip')}
                                style={{ ...inputStyle, paddingLeft: '40px' }}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('login.password')}</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder={t('login.enterPassword')}
                                title={t('login.enterYourPersonalPasswordTip')}
                                style={{ ...inputStyle, paddingLeft: '40px' }}
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="btn-primary"
                        title={t('login.authenticateAndEnterTheSystemTip')}
                        style={{ padding: '12px', marginTop: '10px', fontSize: '1rem' }}
                    >
                        {isLoading ? 'Authenticating...' : 'Sign In'}
                    </button>

                    {/* Open Source Demo Shortcuts */}
                    <div style={{ marginTop: '5px', padding: '15px', background: 'rgba(99,102,241,0.05)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>Open Source Demo Accounts</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <button type="button" onClick={() => { setUsername('demo_tech'); setPassword('TrierDemo2026!'); }} style={{ padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#cbd5e1', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left' }}>🔧 Technician</button>
                            <button type="button" onClick={() => { setUsername('demo_operator'); setPassword('TrierDemo2026!'); }} style={{ padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#cbd5e1', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left' }}>⚙️ Operator</button>
                            <button type="button" onClick={() => { setUsername('demo_maint_mgr'); setPassword('TrierDemo2026!'); }} style={{ padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#cbd5e1', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left' }}>📋 Maint. Manager</button>
                            <button type="button" onClick={() => { setUsername('demo_plant_mgr'); setPassword('TrierDemo2026!'); }} style={{ padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#cbd5e1', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left' }}>🏭 Plant Manager</button>
                        </div>
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '10px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                        <button 
                            type="button" 
                            onClick={() => setShowRegister(true)}
                            title={t('login.createANewAccountUsingTip')}
                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}
                        >
                            <UserPlus size={16} /> {t('login.newUserRegisterHere')}
                        </button>
                        <button 
                            type="button" 
                            onClick={() => setShowEnroll(true)}
                            title={t('login.requestAccessAnAdministratorWillTip')}
                            style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
                        >
                            <Send size={14} /> Request Access (No Site Code)
                        </button>
                    </div>
                </form>
                )}

                {/* Open Source footer */}
                <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    paddingTop: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <a
                        href="https://github.com/DougTrier/trier-os"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '7px',
                            color: '#cbd5e1', textDecoration: 'none', fontSize: '0.875rem',
                            fontWeight: 500, transition: 'color 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#f1f5f9'}
                        onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}
                    >
                        <Github size={15} />
                        github.com/DougTrier/trier-os
                    </a>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8', textAlign: 'center', lineHeight: 1.6 }}>
                        If this brings you value,{' '}
                        <a
                            href="https://github.com/DougTrier/trier-os"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#fbbf24', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#fde68a'}
                            onMouseLeave={e => e.currentTarget.style.color = '#fbbf24'}
                        >
                            <Star size={13} fill="#fbbf24" /> star the repo
                        </a>
                        {' '}— it helps fund development.
                    </p>
                </div>

            </div>

            {/* 2FA Verification Modal (TOTP / Authenticator App) */}
            {show2FA && (
                <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.92)', zIndex: 1000 }}>
                    <div className="glass-card" style={{
                        width: '100%', maxWidth: '420px', padding: '40px', textAlign: 'center',
                        border: '1px solid rgba(245,158,11,0.25)',
                        boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 40px rgba(245,158,11,0.1)'
                    }}>
                        <div style={{
                            width: 64, height: 64, borderRadius: '50%',
                            background: 'rgba(245,158,11,0.1)', border: '2px solid rgba(245,158,11,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 20px'
                        }}>
                            <Shield size={28} style={{ color: '#f59e0b' }} />
                        </div>
                        <h2 style={{ margin: '0 0 8px 0', fontSize: '1.3rem', color: '#f59e0b' }}>Authenticator Verification</h2>
                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 24 }}>
                            {twoFAMessage || 'Open your authenticator app and enter the 6-digit code.'}
                        </p>

                        {error && (
                            <div style={{
                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
                                color: '#f87171', padding: '8px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: 16
                            }}>{error}</div>
                        )}

                        <form onSubmit={handle2FAVerify} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <input
                                type="text" value={twoFACode} onChange={e => setTwoFACode(e.target.value.replace(/\D/g, ''))} 
                                placeholder="000000" maxLength={6} autoFocus
                                style={{
                                    padding: '16px', borderRadius: 12, textAlign: 'center',
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
                                    color: '#e2e8f0', fontSize: '2rem', letterSpacing: '0.4em',
                                    fontFamily: 'monospace', fontWeight: 700, outline: 'none'
                                }}
                            />
                            <button title="Button action" type="submit" disabled={isLoading || twoFACode.length < 6}
                                style={{
                                    padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                                    background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000',
                                    fontWeight: 700, fontSize: '1rem',
                                    opacity: twoFACode.length < 6 ? 0.5 : 1
                                }}>
                                {isLoading ? 'Verifying...' : '🔐 Verify & Sign In'}
                            </button>
                            <button title="Button action" type="button" onClick={() => { setShow2FA(false); setError(''); setTwoFACode(''); }}
                                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem', marginTop: 4 }}>
                                ← Back to Login
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Registration Modal (existing - with plant password) */}
            {showRegister && (
                <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 1000 }}>
                    <div className="glass-card" style={{ width: '100%', maxWidth: '450px', padding: '30px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <UserPlus color="var(--primary)" /> {t('login.userRegistration')}
                            </h2>
                            <button onClick={() => setShowRegister(false)} title={t('login.closeRegistrationFormTip')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>

                        {regSuccess ? (
                            <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                <CheckCircle2 size={64} color="#10b981" style={{ marginBottom: '20px' }} />
                                <h3 style={{ marginBottom: '10px' }}>{t('login.success')}</h3>
                                <p style={{ opacity: 0.8 }}>{regSuccess}</p>
                            </div>
                        ) : (
                            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {/* Invite Code vs Plant Password Toggle */}
                                <div style={{ display: 'flex', gap: '4px', padding: '3px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <button type="button" onClick={() => setUseInviteCode(true)}
                                        style={{
                                            flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                            background: useInviteCode ? 'rgba(245,158,11,0.2)' : 'transparent',
                                            color: useInviteCode ? '#f59e0b' : '#64748b',
                                            fontSize: '0.75rem', fontWeight: 600, transition: 'all 0.2s'
                                        }}>🎟️ Invite Code</button>
                                    <button type="button" onClick={() => setUseInviteCode(false)}
                                        style={{
                                            flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                            background: !useInviteCode ? 'rgba(99,102,241,0.2)' : 'transparent',
                                            color: !useInviteCode ? '#818cf8' : '#64748b',
                                            fontSize: '0.75rem', fontWeight: 600, transition: 'all 0.2s'
                                        }}>🔑 Site Password</button>
                                </div>

                                <div style={{ background: useInviteCode ? 'rgba(245,158,11,0.05)' : 'rgba(99, 102, 241, 0.05)', padding: '15px', borderRadius: '10px', marginBottom: '10px', border: useInviteCode ? '1px solid rgba(245,158,11,0.2)' : '1px solid rgba(99,102,241,0.2)' }}>
                                    {useInviteCode ? (
                                        /* Invite Code Path */
                                        <>
                                            <p style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '10px' }}>
                                                <strong>{t('login.step1')}</strong> Enter the invite code from your administrator or scan the QR code.
                                            </p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <div style={{ position: 'relative' }}>
                                                    <KeyRound size={16} style={{ position: 'absolute', left: '10px', top: '10px', opacity: 0.5, color: '#f59e0b' }} />
                                                    <input
                                                        type="text"
                                                        placeholder="TROS-XXXX-XXXX"
                                                        value={regInviteCode}
                                                        onChange={e => setRegInviteCode(e.target.value.toUpperCase())}
                                                        title="Enter the single-use invite code provided by your administrator"
                                                        style={{ padding: '12px 10px 12px 35px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.3)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700, letterSpacing: '2px' }}
                                                        required
                                                    />
                                                </div>
                                                <select
                                                    value={regPlant}
                                                    onChange={e => setRegPlant(e.target.value)}
                                                    title={t('login.selectThePlantLocationWhereTip')}
                                                    style={{ padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                                                    required
                                                >
                                                    <option value="" disabled>{t('login.selectYourLocation')}</option>
                                                    {plants.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                                                </select>
                                            </div>
                                        </>
                                    ) : (
                                        /* Legacy Plant Password Path */
                                        <>
                                            <p style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '10px' }}>
                                                <strong>{t('login.step1')}</strong> Select your home location and enter the location's security password to authorize your account.
                                            </p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <select
                                                    value={regPlant}
                                                    onChange={e => setRegPlant(e.target.value)}
                                                    title={t('login.selectThePlantLocationWhereTip')}
                                                    style={{ padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                                                    required
                                                >
                                                    <option value="" disabled>{t('login.selectYourLocation')}</option>
                                                    {plants.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                                                </select>
                                                <div style={{ position: 'relative' }}>
                                                    <KeyRound size={16} style={{ position: 'absolute', left: '10px', top: '10px', opacity: 0.5 }} />
                                                    <input
                                                        type="password"
                                                        placeholder={t('login.locationPassword')}
                                                        value={regPlantPw}
                                                        onChange={e => setRegPlantPw(e.target.value)}
                                                        title={t('login.enterTheSiteSecurityCodeTip')}
                                                        style={{ padding: '10px 10px 10px 35px', borderRadius: '6px', width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                                                        required
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <p style={{ fontSize: '0.8rem', opacity: 0.8 }}><strong>{t('login.step2')}</strong> {t('login.chooseYourPersonalLogin')}</p>
                                    <input
                                        type="text"
                                        placeholder={t('login.enterYourFullName')}
                                        value={regUser}
                                        onChange={e => setRegUser(e.target.value)}
                                        title={t('login.enterYourFullNameThisTip')}
                                        style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                                        required
                                    />
                                    <input
                                        type="password"
                                        placeholder={t('login.createAPersonalPassword')}
                                        value={regPw}
                                        onChange={e => setRegPw(e.target.value)}
                                        title={t('login.createAStrongPersonalPasswordTip')}
                                        style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                                        required
                                    />
                                </div>

                                <div style={{ background: 'rgba(16,185,129,0.05)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.15)', marginBottom: '2px' }}>
                                    <p style={{ fontSize: '0.8rem', opacity: 0.8, margin: '0 0 10px' }}><strong>{t('login.step3')}</strong> {t('login.contactInfoAutoaddedToSite')}</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div style={{ position: 'relative' }}>
                                            <Briefcase size={14} style={{ position: 'absolute', left: '10px', top: '13px', color: 'var(--text-muted)' }} />
                                            <input
                                                type="text"
                                                placeholder={t('login.jobTitleEgMaintenanceTechPlaceholder')}
                                                value={regTitle}
                                                onChange={e => setRegTitle(e.target.value)}
                                                title={t('login.yourJobTitleTip')}
                                                style={{ padding: '10px 10px 10px 34px', borderRadius: '6px', width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.85rem' }}
                                            />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div style={{ position: 'relative' }}>
                                                <Mail size={14} style={{ position: 'absolute', left: '10px', top: '13px', color: 'var(--text-muted)' }} />
                                                <input
                                                    type="email"
                                                    placeholder={t('login.workEmailPlaceholder')}
                                                    value={regEmail}
                                                    onChange={e => setRegEmail(e.target.value)}
                                                    title={t('login.yourCompanyEmailAddressTip')}
                                                    style={{ padding: '10px 10px 10px 34px', borderRadius: '6px', width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.85rem' }}
                                                />
                                            </div>
                                            <div style={{ position: 'relative' }}>
                                                <Phone size={14} style={{ position: 'absolute', left: '10px', top: '13px', color: 'var(--text-muted)' }} />
                                                <input
                                                    type="tel"
                                                    placeholder={t('login.companyPhonePlaceholder')}
                                                    value={regPhone}
                                                    onChange={e => setRegPhone(e.target.value)}
                                                    title={t('login.yourCompanyPhoneNumberTip')}
                                                    style={{ padding: '10px 10px 10px 34px', borderRadius: '6px', width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.85rem' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <button type="submit" className="btn-primary" title={t('login.submitRegistrationAndCreateYourTip')} style={{ padding: '12px', marginTop: '10px' }} disabled={isLoading}>
                                    {isLoading ? 'Creating Account...' : 'Complete Registration'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Enrollment Request Modal (NEW — no plant password needed) */}
            {showEnroll && (
                <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 1000 }}>
                    <div className="glass-card" style={{ width: '100%', maxWidth: '480px', padding: '30px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Send color="#10b981" /> Request Access
                            </h2>
                            <button onClick={() => { setShowEnroll(false); setError(''); }} title={t('login.closeEnrollmentFormTip')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>

                        {enrollSuccess ? (
                            <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                <CheckCircle2 size={64} color="#10b981" style={{ marginBottom: '20px' }} />
                                <h3 style={{ marginBottom: '10px', color: '#10b981' }}>Request Submitted!</h3>
                                <p style={{ opacity: 0.8, lineHeight: 1.5 }}>{enrollSuccess}</p>
                            </div>
                        ) : (
                            <form onSubmit={handleEnroll} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div style={{ background: 'rgba(16,185,129,0.05)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.2)', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>
                                    Don't have a site code? Submit an enrollment request and an administrator will review and activate your account.
                                </div>

                                {error && (
                                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', padding: '8px', borderRadius: '6px', fontSize: '0.85rem', textAlign: 'center' }}>
                                        {error}
                                    </div>
                                )}

                                {/* Full Name */}
                                <div style={{ position: 'relative' }}>
                                    <User size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                    <input type="text" placeholder={t('login.fullNamePlaceholder')} value={enrollName} onChange={e => setEnrollName(e.target.value)}
                                        style={{ ...inputStyle, paddingLeft: '38px' }} required title={t('login.yourFullLegalNameTip')} />
                                </div>

                                {/* Email + Phone */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <div style={{ position: 'relative' }}>
                                        <Mail size={14} style={{ position: 'absolute', left: '10px', top: '13px', color: 'var(--text-muted)' }} />
                                        <input type="email" placeholder={t('login.emailPlaceholder')} value={enrollEmail} onChange={e => setEnrollEmail(e.target.value)}
                                            style={{ ...inputStyle, paddingLeft: '34px', fontSize: '0.85rem' }} title={t('login.yourWorkEmailTip')} />
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                        <Phone size={14} style={{ position: 'absolute', left: '10px', top: '13px', color: 'var(--text-muted)' }} />
                                        <input type="tel" placeholder={t('login.phonePlaceholder')} value={enrollPhone} onChange={e => setEnrollPhone(e.target.value)}
                                            style={{ ...inputStyle, paddingLeft: '34px', fontSize: '0.85rem' }} title={t('login.yourWorkPhoneNumberTip')} />
                                    </div>
                                </div>

                                {/* Plant Location */}
                                <div style={{ position: 'relative' }}>
                                    <MapPin size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                    <select value={enrollPlant} onChange={e => setEnrollPlant(e.target.value)}
                                        style={{ ...inputStyle, paddingLeft: '38px' }} required title={t('login.selectYourPlantLocationTip')}>
                                        <option value="" disabled>{t('login.selectPlantLocation')}</option>
                                        {plants.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                                    </select>
                                </div>

                                {/* Role Selection */}
                                <div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Briefcase size={14} /> Requested Role
                                    </p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                        {ROLE_OPTIONS.map(r => (
                                            <button key={r.value} type="button" onClick={() => setEnrollRole(r.value)}
                                                style={{
                                                    padding: '8px 10px', borderRadius: '8px', textAlign: 'left',
                                                    background: enrollRole === r.value ? 'rgba(16,185,129,0.15)' : 'rgba(0,0,0,0.2)',
                                                    border: enrollRole === r.value ? '1.5px solid rgba(16,185,129,0.5)' : '1px solid rgba(255,255,255,0.1)',
                                                    color: enrollRole === r.value ? '#10b981' : '#94a3b8',
                                                    cursor: 'pointer', fontSize: '0.75rem', transition: 'all 0.2s',
                                                }} title={t('login.enrollRoleTip')}>
                                                <div style={{ fontWeight: 700 }}>{r.label}</div>
                                                <div style={{ fontSize: '0.65rem', opacity: 0.7 }}>{r.desc}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Reason */}
                                <textarea placeholder={t('login.reasonForAccessOptionalPlaceholder')} value={enrollReason} onChange={e => setEnrollReason(e.target.value)}
                                    style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', fontSize: '0.85rem' }}
                                    title={t('login.brieflyDescribeWhyYouNeedTip')} />

                                <button type="submit" className="btn-primary" disabled={isLoading}
                                    style={{ padding: '12px', marginTop: '5px', background: '#10b981', border: 'none', fontSize: '1rem' }} title={t('login.submittingSubmitEnrollmentRequestTip')}>
                                    {isLoading ? 'Submitting...' : '📨 Submit Enrollment Request'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
