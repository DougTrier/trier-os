// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Creator System Console
 * ===================================
 * Top-level system administration panel exclusive to the 'creator' superuser.
 * Hidden from all other roles. Provides TOTP 2FA setup, executive account
 * management, live diagnostics, and a full system audit trail.
 *
 * TABS:
 *   twofa       — TOTP 2FA enrollment: QR code generation, secret key display,
 *                 verify token flow, enable/disable 2FA per account
 *   executive   — Grant/revoke Executive role; manage C-suite account access
 *   diagnostics — Live server health: memory, CPU, DB connection pool, queue depth
 *   audit       — Full system audit log: all admin actions with actor + timestamp
 *   accounts    — Master user list: create, disable, reset passwords system-wide
 *
 * SECURITY:
 *   - All /api/creator/* endpoints require JWT with role === 'creator'
 *   - 2FA must be enabled for creator account before any tab is accessible
 *   - All actions logged to immutable audit table with IP + user-agent
 *
 * API CALLS:
 *   GET  /api/creator/twofa/setup     — Generate TOTP QR code and secret
 *   POST /api/creator/twofa/verify    — Verify TOTP token and enable 2FA
 *   GET  /api/creator/diagnostics     — Live server health metrics
 *   GET  /api/creator/audit           — Full audit log
 *   GET  /api/creator/accounts        — All user accounts
 *
 * @param {boolean}  isOpen  — Controls console modal visibility
 * @param {Function} onClose — Callback to dismiss the console
 */
import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Shield, Users, Activity, FileText, X, Plus, Trash2, CheckCircle, AlertTriangle, RefreshCw, Zap, Smartphone, Copy, Server } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

const API = (path, opts = {}) => fetch(`/api/creator${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
});

export default function CreatorConsole({ isOpen, onClose }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('twofa');
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);

    const fetchSettings = useCallback(() => {
        setLoading(true);
        API('/settings').then(r => r.json()).then(d => { setSettings(d); setLoading(false); }).catch(() => setLoading(false));
    }, []);

    useEffect(() => { if (isOpen) fetchSettings(); }, [isOpen, fetchSettings]);

    if (!isOpen) return null;

    const tabs = [
        { id: 'twofa', label: 'Authenticator 2FA', icon: Smartphone },
        { id: 'executives', label: 'Executive Access', icon: Users },
        { id: 'diagnostics', label: 'System Health', icon: Activity },
        { id: 'audit', label: 'Audit Log', icon: FileText },
    ];

    return ReactDOM.createPortal(
        <div style={{
            position: 'fixed', inset: 0, zIndex: 200000,
            background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.3s ease'
        }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{
                width: '90vw', maxWidth: 1100, height: '85vh',
                background: 'linear-gradient(145deg, #0a0e1a, #111827)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                boxShadow: '0 40px 100px rgba(0,0,0,0.7), 0 0 60px rgba(245,158,11,0.1)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'linear-gradient(90deg, rgba(245,158,11,0.08), transparent)',
                    borderBottom: '1px solid rgba(245,158,11,0.15)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 12,
                            background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.1))',
                            border: '1px solid rgba(245,158,11,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Zap size={22} style={{ color: '#f59e0b' }} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f59e0b', fontWeight: 800 }}>System Console</h2>
                            <span style={{ fontSize: '0.7rem', color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Creator Administration</span>
                        </div>
                    </div>
                    <button title="Close" onClick={onClose} style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: '#94a3b8', transition: 'all 0.2s'
                    }}><X size={18} /></button>
                </div>

                {/* Tabs */}
                <div style={{
                    display: 'flex', gap: 4, padding: '0 24px', background: 'rgba(0,0,0,0.2)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)'
                }}>
                    {tabs.map(tabItem => (
                        <button title="Button action" key={tabItem.id} onClick={() => setTab(tabItem.id)} style={{
                            padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8,
                            background: tab === tabItem.id ? 'rgba(245,158,11,0.1)' : 'transparent',
                            border: 'none', borderBottom: tab === tabItem.id ? '2px solid #f59e0b' : '2px solid transparent',
                            color: tab === tabItem.id ? '#f59e0b' : '#64748b',
                            cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                            transition: 'all 0.2s'
                        }}>
                            <tabItem.icon size={15} />
                            {tabItem.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
                    {loading ? <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>Loading...</div> :
                        tab === 'twofa' ? <TOTPTab settings={settings} onRefresh={fetchSettings} /> :
                        tab === 'executives' ? <ExecutivesTab /> :
                        tab === 'diagnostics' ? <DiagnosticsTab /> :
                        tab === 'audit' ? <AuditTab /> : null
                    }
                </div>
            </div>
        </div>,
        document.body
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOTP 2FA SETUP TAB (Google Authenticator / Microsoft Authenticator)
// ═══════════════════════════════════════════════════════════════════════════════
function TOTPTab({ settings, onRefresh }) {
    const { t } = useTranslation();
    const [step, setStep] = useState('idle'); // idle, scanning, done
    const [qrCode, setQrCode] = useState('');
    const [manualKey, setManualKey] = useState('');
    const [code, setCode] = useState('');
    const [disableCode, setDisableCode] = useState('');
    const [msg, setMsg] = useState('');
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    const startSetup = async () => {
        setSaving(true); setMsg('');
        try {
            const res = await API('/settings/totp-setup', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setQrCode(data.qrCode);
                setManualKey(data.manualKey);
                setStep('scanning');
                setMsg(data.message);
            } else setMsg(data.error);
        } catch (e) { setMsg('Setup failed'); }
        setSaving(false);
    };

    const verifyCode = async () => {
        setSaving(true);
        try {
            const res = await API('/settings/totp-verify', { method: 'POST', body: JSON.stringify({ code }) });
            const data = await res.json();
            if (data.success) {
                setStep('done');
                setMsg(data.message);
                onRefresh();
            } else setMsg(data.error);
        } catch (e) { setMsg('Verification failed'); }
        setSaving(false);
    };

    const disable2FA = async () => {
        if (!window.confirm('Are you sure you want to disable 2FA? This reduces security on the creator account.')) return;
        setSaving(true);
        try {
            const res = await API('/settings/totp-disable', { method: 'POST', body: JSON.stringify({ code: disableCode }) });
            const data = await res.json();
            if (data.success) {
                setMsg(data.message);
                setDisableCode('');
                onRefresh();
            } else setMsg(data.error);
        } catch (e) { setMsg('Failed to disable'); }
        setSaving(false);
    };

    const copyKey = () => {
        navigator.clipboard.writeText(manualKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div style={{ maxWidth: 600 }}>
            <h3 style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Shield size={20} style={{ color: '#f59e0b' }} />
                Two-Factor Authentication
            </h3>

            {/* Status Card */}
            <div style={{
                padding: 20, borderRadius: 14, marginBottom: 24,
                background: settings.totpConfigured
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))'
                    : 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.03))',
                border: `1px solid ${settings.totpConfigured ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {settings.totpConfigured
                        ? <><CheckCircle size={20} style={{ color: '#10b981' }} /><span style={{ color: '#10b981', fontWeight: 700 }}>2FA Enabled — Authenticator App</span></>
                        : <><AlertTriangle size={20} style={{ color: '#f87171' }} /><span style={{ color: '#f87171', fontWeight: 700 }}>2FA Not Configured</span></>
                    }
                </div>
                {settings.totpConfigured ? (
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 10, lineHeight: 1.6 }}>
                        Login requires a 6-digit code from your authenticator app (Google Authenticator, Microsoft Authenticator, or Authy).
                    </p>
                ) : (
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 10, lineHeight: 1.6 }}>
                        Set up 2FA to secure the creator account. You'll scan a QR code with your phone's authenticator app — <strong>{t('creatorConsole.noEmailOrInternetRequired')}</strong>.
                    </p>
                )}
            </div>

            {/* Setup Flow */}
            {!settings.totpConfigured && step === 'idle' && (
                <div>
                    <div style={{
                        padding: 20, borderRadius: 14, marginBottom: 20,
                        background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)'
                    }}>
                        <h4 style={{ margin: '0 0 12px 0', color: '#818cf8', fontSize: '0.9rem' }}>📱 What you'll need:</h4>
                        <ul style={{ margin: 0, padding: '0 0 0 20px', color: '#94a3b8', fontSize: '0.85rem', lineHeight: 2 }}>
                            <li>A phone with <strong style={{ color: '#e2e8f0' }}>Google Authenticator</strong> or <strong style={{ color: '#e2e8f0' }}>Microsoft Authenticator</strong></li>
                            <li>{t('creatorConsole.worksOfflineNoEmailOr')}</li>
                            <li>{t('creatorConsole.codesRefreshEvery30Seconds')}</li>
                        </ul>
                    </div>
                    <button title="Button action" onClick={startSetup} disabled={saving} style={{
                        padding: '14px 28px', borderRadius: 12, border: 'none', cursor: 'pointer',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000',
                        fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 10
                    }}>
                        <Smartphone size={18} />
                        {saving ? 'Generating...' : 'Set Up Authenticator App'}
                    </button>
                </div>
            )}

            {/* QR Code Scanning Step */}
            {step === 'scanning' && (
                <div>
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
                        padding: 30, borderRadius: 16, marginBottom: 20,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)'
                    }}>
                        <p style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center', margin: 0 }}>
                            <strong style={{ color: '#e2e8f0' }}>Step 1:</strong> Open your authenticator app and scan this QR code
                        </p>
                        {qrCode && (
                            <div style={{
                                padding: 16, borderRadius: 16,
                                background: '#0f172a', border: '2px solid rgba(245,158,11,0.25)',
                                boxShadow: '0 0 30px rgba(245,158,11,0.08)'
                            }}>
                                <img src={qrCode} alt="Scan with authenticator app" style={{ display: 'block', width: 220, height: 220 }} />
                            </div>
                        )}
                        <div style={{ width: '100%' }}>
                            <p style={{ color: '#64748b', fontSize: '0.75rem', textAlign: 'center', margin: '0 0 8px 0' }}>
                                Can't scan? Enter this key manually:
                            </p>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                justifyContent: 'center'
                            }}>
                                <code style={{
                                    padding: '8px 16px', borderRadius: 8,
                                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                                    color: '#f59e0b', fontSize: '0.85rem', fontFamily: 'monospace',
                                    letterSpacing: '0.15em', wordBreak: 'break-all'
                                }}>
                                    {manualKey}
                                </code>
                                <button title="Button action" onClick={copyKey} style={{
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                                    color: copied ? '#10b981' : '#94a3b8', display: 'flex', alignItems: 'center', gap: 4,
                                    fontSize: '0.75rem', transition: 'all 0.2s'
                                }}>
                                    <Copy size={14} /> {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <p style={{ color: '#e2e8f0', fontSize: '0.9rem', marginBottom: 10 }}>
                            <strong>{t('creatorConsole.step2')}</strong> Enter the 6-digit code from the app to verify
                        </p>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <input
                                type="text" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="000000" maxLength={6} autoFocus
                                style={{
                                    flex: 1, padding: '14px 16px', borderRadius: 12,
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#e2e8f0', fontSize: '1.6rem', letterSpacing: '0.35em',
                                    textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, outline: 'none'
                                }}
                            />
                            <button title="Button action" onClick={verifyCode} disabled={saving || code.length < 6} style={{
                                padding: '14px 28px', borderRadius: 12, border: 'none', cursor: 'pointer',
                                background: code.length >= 6 ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.05)',
                                color: code.length >= 6 ? '#fff' : '#64748b',
                                fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap',
                                transition: 'all 0.3s'
                            }}>{saving ? 'Verifying...' : '✓ Verify'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Already Configured — Disable Option */}
            {settings.totpConfigured && step !== 'scanning' && (
                <div>
                    <div style={{
                        padding: 20, borderRadius: 14, marginBottom: 16,
                        background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)'
                    }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#f87171', fontSize: '0.85rem' }}>Disable 2FA</h4>
                        <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: 12, lineHeight: 1.5 }}>
                            To disable, enter your current authenticator code. This is <strong>{t('creatorConsole.notRecommended')}</strong> — 2FA protects the creator account from unauthorized access.
                        </p>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <input
                                type="text" value={disableCode} onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="000000" maxLength={6}
                                style={{
                                    flex: 1, padding: '10px 14px', borderRadius: 10,
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#e2e8f0', fontSize: '1.2rem', letterSpacing: '0.2em',
                                    textAlign: 'center', fontFamily: 'monospace', outline: 'none'
                                }}
                            />
                            <button title="Button action" onClick={disable2FA} disabled={saving || disableCode.length < 6} style={{
                                padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                color: '#f87171', fontWeight: 700, fontSize: '0.8rem', whiteSpace: 'nowrap'
                            }}>Disable 2FA</button>
                        </div>
                    </div>

                    <button title="Button action" onClick={() => { setStep('idle'); startSetup(); }} style={{
                        padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
                        background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                        fontWeight: 700, fontSize: '0.85rem',
                        border: '1px solid rgba(245,158,11,0.2)'
                    }}>
                        🔄 Re-setup on New Device
                    </button>
                </div>
            )}

            {msg && <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: '0.85rem', lineHeight: 1.5 }}>{msg}</div>}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTIVE ACCESS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ExecutivesTab() {
    const { t } = useTranslation();
    const [list, setList] = useState([]);
    const [newUser, setNewUser] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(true);

    const fetch_ = useCallback(() => {
        setLoading(true);
        API('/executives').then(r => r.json()).then(d => { setList(d); setLoading(false); }).catch(() => setLoading(false));
    }, []);
    useEffect(() => { fetch_(); }, [fetch_]);

    const add = async () => {
        if (!newUser.trim()) return;
        await API('/executives', { method: 'POST', body: JSON.stringify({ username: newUser.trim(), notes: notes.trim() }) });
        setNewUser(''); setNotes('');
        fetch_();
    };

    const remove = async (username) => {
        if (!window.confirm(`Revoke executive access for ${username}?`)) return;
        await API(`/executives/${encodeURIComponent(username)}`, { method: 'DELETE' });
        fetch_();
    };

    return (
        <div style={{ maxWidth: 700 }}>
            <h3 style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Users size={20} style={{ color: '#f59e0b' }} />
                Executive Access Whitelist
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 20, lineHeight: 1.6 }}>
                Only users listed here (plus the creator account) can access Corporate Analytics. These are typically C-suite and senior leadership — 5-6 people max.
            </p>

            {/* Add Form */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <input value={newUser} onChange={e => setNewUser(e.target.value)} placeholder={t('creatorConsole.usernamePlaceholder')}
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', fontSize: '0.9rem', outline: 'none' }} />
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('creatorConsole.roleNotesOptionalPlaceholder')}
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', fontSize: '0.9rem', outline: 'none' }} />
                <button title="Button action" onClick={add} style={{
                    padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                    fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6
                }}><Plus size={16} /> Add</button>
            </div>

            {/* List */}
            {loading ? <div style={{ color: '#64748b' }}>Loading...</div> :
                list.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#475569', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.1)' }}>
                        No executives added yet. Only the creator account has access.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {list.map(e => (
                            <div key={e.Username} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '14px 18px', borderRadius: 12,
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <div>
                                    <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{e.Username}</div>
                                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                        {e.Notes || 'No notes'} · Added {new Date(e.GrantedAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <button title="Button action" onClick={() => remove(e.Username)} style={{
                                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                                    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: '#f87171',
                                    display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600
                                }}><Trash2 size={14} /> Revoke</button>
                            </div>
                        ))}
                    </div>
                )
            }
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIAGNOSTICS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function DiagnosticsTab() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchDiag = useCallback(() => {
        setLoading(true);
        API('/diagnostics').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    }, []);
    useEffect(() => { fetchDiag(); }, [fetchDiag]);

    if (loading || !data) return <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>Loading diagnostics...</div>;

    const statCard = (label, value, color = '#e2e8f0') => (
        <div style={{
            padding: '16px 20px', borderRadius: 12,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'
        }}>
            <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
            <div style={{ color, fontSize: '1.1rem', fontWeight: 700 }}>{value}</div>
        </div>
    );

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                    <Server size={20} style={{ color: '#f59e0b' }} />
                    System Diagnostics
                </h3>
                <button title="Button action" onClick={fetchDiag} style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', color: '#94a3b8',
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem'
                }}><RefreshCw size={14} /> Refresh</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                {statCard('Hostname', data.system.hostname)}
                {statCard('Platform', `${data.system.platform}/${data.system.arch}`)}
                {statCard('CPUs', data.system.cpus)}
                {statCard('Node.js', data.system.nodeVersion, '#10b981')}
                {statCard('Uptime', `${data.process.uptimeHours}h`, '#f59e0b')}
                {statCard('Heap Used', `${data.process.heapUsedMB} MB`)}
                {statCard('Total Memory', `${data.system.totalMemGB} GB`)}
                {statCard('Free Memory', `${data.system.freeMemGB} GB`, data.system.freeMemGB < 1 ? '#f87171' : '#10b981')}
            </div>

            <h4 style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, marginBottom: 10 }}>Database Files</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
                {data.databases.map(db => (
                    <div key={db.name} style={{
                        padding: '12px 16px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'
                    }}>
                        <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.85rem' }}>{db.name}</div>
                        <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 4 }}>
                            {db.sizeMB} MB · Modified {new Date(db.modified).toLocaleDateString()}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG TAB
// ═══════════════════════════════════════════════════════════════════════════════
function AuditTab() {
    const { t } = useTranslation();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ action: '', user: '', severity: '' });

    const fetchLogs = useCallback(() => {
        setLoading(true);
        const params = new URLSearchParams();
        if (filters.action) params.set('action', filters.action);
        if (filters.user) params.set('user', filters.user);
        if (filters.severity) params.set('severity', filters.severity);
        params.set('limit', '200');

        API(`/audit?${params}`).then(r => r.json()).then(d => { setLogs(d); setLoading(false); }).catch(() => setLoading(false));
    }, [filters]);
    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const severityColor = { INFO: '#94a3b8', WARNING: '#f59e0b', ERROR: '#f87171', CRITICAL: '#ef4444' };

    const inputStyle = {
        padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', fontSize: '0.8rem', outline: 'none'
    };

    return (
        <div>
            <h3 style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <FileText size={20} style={{ color: '#f59e0b' }} />
                Audit Log
            </h3>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <input value={filters.action} onChange={e => setFilters(f => ({...f, action: e.target.value}))} placeholder={t('creatorConsole.filterByActionPlaceholder')} style={inputStyle} />
                <input value={filters.user} onChange={e => setFilters(f => ({...f, user: e.target.value}))} placeholder={t('creatorConsole.filterByUserPlaceholder')} style={inputStyle} />
                <select value={filters.severity} onChange={e => setFilters(f => ({...f, severity: e.target.value}))} style={{...inputStyle, cursor: 'pointer'}}>
                    <option value="">{t('creatorConsole.allSeverities')}</option>
                    <option value="INFO">{t('creatorConsole.info')}</option>
                    <option value="WARNING">{t('creatorConsole.warning')}</option>
                    <option value="ERROR">{t('creatorConsole.error')}</option>
                    <option value="CRITICAL">{t('creatorConsole.critical')}</option>
                </select>
            </div>

            <div style={{ maxHeight: '50vh', overflow: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                            {['Time', 'User', 'Action', 'Severity', 'Details'].map(h => (
                                <th key={h} style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? <tr><td colSpan={5} style={{ textAlign: 'center', color: '#64748b', padding: 30 }}>Loading...</td></tr> :
                            logs.map(log => (
                                <tr key={log.ID} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                    <td style={{ padding: '8px 14px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{new Date(log.Timestamp).toLocaleString()}</td>
                                    <td style={{ padding: '8px 14px', color: '#e2e8f0', fontWeight: 600 }}>{log.UserID}</td>
                                    <td style={{ padding: '8px 14px', color: '#e2e8f0' }}>{log.Action}</td>
                                    <td style={{ padding: '8px 14px' }}>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700,
                                            background: `${severityColor[log.Severity] || '#94a3b8'}15`,
                                            color: severityColor[log.Severity] || '#94a3b8'
                                        }}>{log.Severity}</span>
                                    </td>
                                    <td style={{ padding: '8px 14px', color: '#64748b', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.Details || '—'}</td>
                                </tr>
                            ))
                        }
                    </tbody>
                </table>
            </div>
        </div>
    );
}
