// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Invite Pass Popup
 * ==============================
 * Single-use invite code generator with QR code for streamlined user onboarding.
 * Admins generate a pass code that new users enter at the login screen to
 * self-register with pre-approved plant and role assignment.
 *
 * KEY FEATURES:
 *   - Generate invite code: server creates a short alphanumeric code (expires in 72h)
 *   - QR code display: scan with phone to auto-fill code on mobile enrollment screen
 *   - Plant selector: assign the invite to a specific plant or all plants
 *   - Copy to clipboard: one-click copy for sharing via text or email
 *   - Print pass: formatted printable card for physical distribution
 *   - Code management: view and revoke all outstanding invite codes
 *   - Single-use enforcement: code is invalidated immediately after first use
 *
 * API CALLS:
 *   GET    /api/admin/invite-codes          — List active invite codes
 *   POST   /api/admin/invite-codes          — Generate new invite code
 *   DELETE /api/admin/invite-codes/:id      — Revoke an invite code
 *
 * @param {boolean}  isOpen      — Controls popup visibility
 * @param {Function} onClose     — Callback to dismiss popup
 * @param {string}   plantId     — Default plant pre-selected for invite
 * @param {string}   plantLabel  — Display name of the pre-selected plant
 * @param {Array}    plants      — Full list of available plants for plant selector
 */
import React, { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, Printer, Copy, Check, QrCode, Shield, Users, Trash2 } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function InvitePassPopup({ isOpen, onClose, plantId, plantLabel, plants }) {
    const { t } = useTranslation();
    const [currentCode, setCurrentCode] = useState(null);
    const [currentPlant, setCurrentPlant] = useState(plantId || 'all_sites');
    const [isGenerating, setIsGenerating] = useState(false);
    const [copied, setCopied] = useState(false);
    const [serverUrl, setServerUrl] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [codeHistory, setCodeHistory] = useState([]);
    const qrRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            fetchNetworkUrl();
            generateCode();
        }
    }, [isOpen]);

    const fetchNetworkUrl = async () => {
        try {
            const res = await fetch('/api/network-info');
            const info = await res.json();
            // Prefer HTTPS URL (needed for mobile camera/scanning)
            setServerUrl(info.httpsUrl || info.url || window.location.origin);
        } catch { setServerUrl(window.location.origin); }
    };

    const generateCode = async () => {
        setIsGenerating(true);
        const target = currentPlant === 'all_sites' ? 'CORPORATE' : currentPlant;
        try {
            const res = await fetch('/api/logistics/invite/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                body: JSON.stringify({ plantId: target, createdBy: localStorage.getItem('currentUser') || 'Admin' })
            });
            const data = await res.json();
            if (data.success) {
                setCurrentCode(data.code);
            }
        } catch (err) {
            console.error('Failed to generate invite code:', err);
        }
        setIsGenerating(false);
    };

    const fetchHistory = async () => {
        try {
            const res = await fetch('/api/logistics/invite/list', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            setCodeHistory(await res.json());
        } catch {}
    };

    const revokeCode = async (id) => {
        try {
            await fetch(`/api/logistics/invite/revoke/${id}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            fetchHistory();
        } catch {}
    };

    const handleCopy = () => {
        if (!currentCode) return;
        navigator.clipboard.writeText(currentCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const registrationUrl = currentCode ? `${serverUrl}/?invite=${currentCode}` : '';
    
    // Generate QR code locally via server endpoint (works offline, no external API)
    const qrDataUrl = currentCode ? `/api/qr?data=${encodeURIComponent(registrationUrl)}` : '';

    const handlePrint = () => {
        const pLabel = currentPlant === 'all_sites' ? t('invite.corporateAllSites', 'Corporate (All Sites)') : (plants?.find(p => p.id === currentPlant)?.label || currentPlant);
        const printWindow = window.open('', '_blank', 'width=600,height=800');
        printWindow.document.write(`<!DOCTYPE html><html><head><title>Trier OS - Invite Pass</title>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; background: #fff; color: #1a1a2e; text-align: center; }
            .pass { border: 2px solid #334155; border-radius: 16px; padding: 40px; max-width: 500px; margin: 0 auto; }
            .logo { font-size: 24px; font-weight: 800; margin-bottom: 5px; color: #1e293b; }
            .subtitle { font-size: 14px; color: #64748b; margin-bottom: 30px; }
            .qr-container { background: #f8fafc; padding: 20px; border-radius: 12px; display: inline-block; margin: 20px 0; border: 1px solid #e2e8f0; }
            .code { font-family: 'Courier New', monospace; font-size: 28px; font-weight: 800; letter-spacing: 3px; color: #1e293b; margin: 20px 0 10px; }
            .plant { font-size: 14px; color: #64748b; margin-bottom: 20px; }
            .instructions { text-align: left; padding: 20px; background: #f1f5f9; border-radius: 10px; margin-top: 25px; }
            .instructions h3 { margin: 0 0 12px; font-size: 14px; color: #334155; }
            .instructions ol { margin: 0; padding-left: 20px; font-size: 13px; line-height: 2; color: #475569; }
            .url { font-family: monospace; font-size: 12px; color: #3b82f6; word-break: break-all; margin-top: 15px; padding: 10px; background: #eff6ff; border-radius: 6px; }
            .footer { margin-top: 25px; font-size: 11px; color: #94a3b8; }
            .single-use { display: inline-block; padding: 4px 12px; background: #fef3c7; color: #b45309; border-radius: 20px; font-size: 11px; font-weight: 600; margin-top: 10px; }
        </style></head><body>
        <div class="pass">
            <div class="logo">🔧 Trier OS</div>
            <div class="subtitle">${t('invite.printSubtitle', 'Trier OS Maintenance — User Setup Invite')}</div>
            <div class="qr-container">
                <img src="${serverUrl}/api/qr?data=${encodeURIComponent(registrationUrl)}" alt="QR Code" width="200" height="200" />
            </div>
            <div class="code">${currentCode}</div>
            <div class="plant">📍 ${pLabel}</div>
            <div class="single-use">⚡ ${t('invite.printSingleUse', 'SINGLE-USE CODE — One registration only')}</div>
            <div class="instructions">
                <h3>📋 ${t('invite.printGettingStarted', 'Getting Started')}</h3>
                <ol>
                    <li>${t('invite.printStep1', 'Scan the QR code above with your phone camera')}</li>
                    <li>${t('invite.printStep2', 'Or visit:')} <strong>${serverUrl}</strong></li>
                    <li>${t('invite.printStep3', 'Click')} <strong>&quot;${t('invite.printStep3Link', 'New User? Register Here')}&quot;</strong></li>
                    <li>${t('invite.printStep4', 'Enter your invite code:')} <strong>${currentCode}</strong></li>
                    <li>${t('invite.printStep5', 'Create your username and password')}</li>
                </ol>
            </div>
            <div class="url">${registrationUrl}</div>
            <div class="footer">${t('invite.printFooter', 'This code can only be used once. Contact your administrator for a new code if needed.')}</div>
        </div>
        </body></html>`);
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); }, 500);
    };

    if (!isOpen) return null;

    const targetPlantLabel = currentPlant === 'all_sites' ? t('invite.corporate', 'Corporate') : (plants?.find(p => p.id === currentPlant)?.label || currentPlant);

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)'
        }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{
                width: '100%', maxWidth: showHistory ? '900px' : '480px',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.6)', overflow: 'hidden',
                transition: 'max-width 0.3s ease'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(245,158,11,0.05))'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: '10px',
                            background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Shield size={20} color="#fff" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0' }}>{t('invite.title', 'Invite Pass Generator')}</div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{t('invite.subtitle', 'Single-use registration codes')}</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory(); }}
                            style={{
                                background: showHistory ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                                border: showHistory ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.1)',
                                color: showHistory ? '#818cf8' : '#94a3b8', cursor: 'pointer',
                                padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem',
                                display: 'flex', alignItems: 'center', gap: '5px'
                            }}
                            title="View code history and manage issued codes"
                        >
                            <Users size={14} /> {t('invite.history', 'History')}
                        </button>
                        <button onClick={onClose} style={{
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: '#94a3b8', cursor: 'pointer', padding: '6px', borderRadius: '8px'
                        }} title="Close invite pass popup"><X size={18} /></button>
                    </div>
                </div>

                <div style={{ display: 'flex' }}>
                    {/* Main Panel */}
                    <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                        {/* Plant Selector */}
                        <div style={{ width: '100%' }}>
                            <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                                {t('invite.targetLocation', 'Target Location')}
                            </label>
                            <select value={currentPlant} onChange={e => setCurrentPlant(e.target.value)}
                                style={{
                                    width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
                                    color: '#e2e8f0', fontSize: '0.85rem'
                                }}
                                title="Select the plant this invite code is for"
                            >
                                {(plants || []).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                        </div>

                        {/* QR Code */}
                        <div style={{
                            background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '16px',
                            border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center'
                        }}>
                            {currentCode ? (
                                <>
                                    <div ref={qrRef} style={{
                                        width: '180px', height: '180px', margin: '0 auto 15px',
                                        background: '#020617', borderRadius: '12px', overflow: 'hidden',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px'
                                    }}>
                                        <img
                                            src={qrDataUrl}
                                            alt="QR Code"
                                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                            onError={e => { e.target.style.display = 'none'; }}
                                        />
                                    </div>
                                    <div style={{
                                        fontFamily: "'Courier New', monospace", fontSize: '1.5rem',
                                        fontWeight: 800, letterSpacing: '3px', color: '#f59e0b',
                                        marginBottom: '6px'
                                    }}>
                                        {currentCode}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                        📍 {targetPlantLabel} • ⚡ {t('invite.singleUse', 'Single-use')}
                                    </div>
                                </>
                            ) : (
                                <div style={{ padding: '40px', color: '#64748b', fontSize: '0.85rem' }}>
                                    <RefreshCw size={24} className="spinning" style={{ marginBottom: '10px' }} />
                                    <div>{t('invite.generatingCode', 'Generating invite code...')}</div>
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                            <button onClick={generateCode} disabled={isGenerating}
                                title="Generate a fresh single-use code (previous code remains valid until used)"
                                style={{
                                    flex: 1, padding: '12px', borderRadius: '10px', cursor: 'pointer',
                                    background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))',
                                    border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b',
                                    fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', gap: '8px', opacity: isGenerating ? 0.5 : 1
                                }}>
                                <RefreshCw size={16} className={isGenerating ? 'spinning' : ''} />
                                {isGenerating ? t('invite.generating', 'Generating...') : t('invite.newCode', 'New Code')}
                            </button>
                            <button onClick={handleCopy} disabled={!currentCode}
                                title="Copy the invite code to clipboard"
                                style={{
                                    flex: 1, padding: '12px', borderRadius: '10px', cursor: 'pointer',
                                    background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                                    border: copied ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.1)',
                                    color: copied ? '#10b981' : '#e2e8f0',
                                    fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', gap: '8px'
                                }}>
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                {copied ? t('invite.copied', 'Copied!') : t('invite.copyCode', 'Copy Code')}
                            </button>
                            <button onClick={handlePrint} disabled={!currentCode}
                                title="Print this invite pass for handing out"
                                style={{
                                    flex: 1, padding: '12px', borderRadius: '10px', cursor: 'pointer',
                                    background: 'rgba(59,130,246,0.1)',
                                    border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa',
                                    fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', gap: '8px'
                                }}>
                                <Printer size={16} /> {t('invite.print', 'Print')}
                            </button>
                        </div>

                        {/* Instructions */}
                        <div style={{
                            width: '100%', padding: '14px', background: 'rgba(255,255,255,0.03)',
                            borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)'
                        }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '8px' }}>📋 {t('invite.howItWorks', 'How it works')}</div>
                            <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '0.7rem', color: '#64748b', lineHeight: 2 }}>
                                <li>{t('invite.step1', 'Employee scans QR or visits')} <span style={{ color: '#60a5fa', fontFamily: 'monospace' }}>{serverUrl}</span></li>
                                <li>{t('invite.step2PreLink', 'Clicks')} <strong style={{ color: '#e2e8f0' }}>&ldquo;{t('invite.registerLink', 'Register')}&rdquo;</strong> {t('invite.step2PostLink', 'and enters the code')}</li>
                                <li>{t('invite.step3', 'Creates their username & password')}</li>
                                <li>{t('invite.step4Pre', 'Code is')} <strong style={{ color: '#f59e0b' }}>{t('invite.burned', 'burned')}</strong> {t('invite.step4Post', '— never used again')}</li>
                            </ol>
                        </div>
                    </div>

                    {/* History Panel (slide-in) */}
                    {showHistory && (
                        <div style={{
                            width: '400px', borderLeft: '1px solid rgba(255,255,255,0.08)',
                            padding: '20px', overflowY: 'auto', maxHeight: '600px'
                        }}>
                            <h3 style={{ fontSize: '0.9rem', margin: '0 0 14px', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <QrCode size={16} color="#6366f1" /> {t('invite.codeHistory', 'Code History')}
                            </h3>
                            {codeHistory.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '0.8rem' }}>
                                    {t('invite.noCodesYet', 'No codes generated yet')}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {codeHistory.map(c => (
                                        <div key={c.ID} style={{
                                            padding: '10px 12px', borderRadius: '8px',
                                            background: c.Status === 'available' ? 'rgba(16,185,129,0.05)' : c.Status === 'used' ? 'rgba(99,102,241,0.05)' : 'rgba(239,68,68,0.05)',
                                            border: `1px solid ${c.Status === 'available' ? 'rgba(16,185,129,0.2)' : c.Status === 'used' ? 'rgba(99,102,241,0.15)' : 'rgba(239,68,68,0.15)'}`,
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.8rem', color: '#e2e8f0' }}>{c.Code}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: '10px', fontSize: '0.6rem', fontWeight: 600,
                                                        background: c.Status === 'available' ? 'rgba(16,185,129,0.15)' : c.Status === 'used' ? 'rgba(99,102,241,0.15)' : 'rgba(239,68,68,0.15)',
                                                        color: c.Status === 'available' ? '#10b981' : c.Status === 'used' ? '#818cf8' : '#ef4444'
                                                    }}>
                                                        {c.Status === 'available' ? `🟢 ${t('invite.statusActive', 'Active')}` : c.Status === 'used' ? `🔵 ${t('invite.statusUsed', 'Used')}` : `🔴 ${t('invite.statusRevoked', 'Revoked')}`}
                                                    </span>
                                                    {c.Status === 'available' && (
                                                        <button onClick={() => revokeCode(c.ID)}
                                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                                                            title="Revoke this code"
                                                        ><Trash2 size={12} /></button>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '4px' }}>
                                                {c.PlantID} • {new Date(c.CreatedAt).toLocaleDateString()}
                                                {c.RegisteredUsername && <span> • {t('invite.registered', 'Registered:')} <strong style={{ color: '#818cf8' }}>{c.RegisteredUsername}</strong></span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
