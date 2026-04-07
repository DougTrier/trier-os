// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — PWA Install Prompt
 * ==============================
 * Polished "Install Trier OS" banner for mobile Chrome/Safari users
 * who haven't yet installed the app to their home screen.
 *
 * KEY FEATURES:
 *   - Chrome/Edge: captures the beforeinstallprompt event and shows native install dialog
 *   - Safari/iOS: shows step-by-step "Add to Home Screen" manual instructions
 *   - Already installed or dismissed: hidden automatically (no repeated nagging)
 *   - Dismiss tracking: localStorage flag suppresses prompt for 30 days after dismiss
 *   - Branded install card: Trier OS logo, name, and "Install for offline access" CTA
 *
 * DETECTION:
 *   Checks navigator.standalone (iOS) and display-mode: standalone (others)
 *   to determine if already running as installed PWA — hides prompt if so.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../i18n/index.jsx';
export default function PwaInstallPrompt() {
    const { t } = useTranslation();
    const [showBanner, setShowBanner] = useState(false);
    const [platform, setPlatform] = useState(null); // 'chrome' | 'safari' | null
    const [showSafariGuide, setShowSafariGuide] = useState(false);
    const deferredPromptRef = useRef(null);

    useEffect(() => {
        // Don't show if user previously dismissed (30-day cooldown)
        const dismissedAt = localStorage.getItem('pwa_install_dismissed');
        if (dismissedAt) {
            const daysSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
            if (daysSince < 30) return;
        }

        // Don't show if already running as standalone PWA
        if (window.matchMedia('(display-mode: standalone)').matches) return;
        if (window.navigator.standalone === true) return; // iOS standalone check

        // Detect platform
        const ua = navigator.userAgent.toLowerCase();
        const isIOS = /iphone|ipad|ipod/.test(ua);
        const isSafari = isIOS && /safari/.test(ua) && !/chrome|crios|fxios/.test(ua);
        const isAndroid = /android/.test(ua);
        const isMobile = isIOS || isAndroid || /mobile/.test(ua);

        if (!isMobile) return; // Only show on mobile devices

        // Chrome/Edge: Listen for the native install prompt
        const handleBeforeInstall = (e) => {
            e.preventDefault();
            deferredPromptRef.current = e;
            setPlatform('chrome');
            setShowBanner(true);
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstall);

        // Safari/iOS: Show manual instructions after 3-second delay
        if (isIOS) {
            const timer = setTimeout(() => {
                setPlatform('safari');
                setShowBanner(true);
            }, 3000);
            return () => {
                clearTimeout(timer);
                window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
            };
        }

        // Android Chrome: If beforeinstallprompt fires, we'll show it.
        // Give it 4 seconds then fall back to showing a generic prompt if Chrome hasn't fired.
        if (isAndroid) {
            const timer = setTimeout(() => {
                if (!deferredPromptRef.current) {
                    // Chrome may not fire if criteria not met; show basic prompt anyway
                    setPlatform('chrome');
                    setShowBanner(true);
                }
            }, 4000);
            return () => {
                clearTimeout(timer);
                window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
            };
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        };
    }, []);

    const handleInstallClick = async () => {
        if (deferredPromptRef.current) {
            // Native Chrome install
            deferredPromptRef.current.prompt();
            const result = await deferredPromptRef.current.userChoice;
            if (result.outcome === 'accepted') {
                console.log('[PWA] User accepted install');
            }
            deferredPromptRef.current = null;
            setShowBanner(false);
        } else if (platform === 'safari') {
            // Show Safari-specific instructions
            setShowSafariGuide(true);
        } else {
            // Generic — open browser's add to home screen
            setShowSafariGuide(true);
        }
    };

    const handleDismiss = () => {
        localStorage.setItem('pwa_install_dismissed', Date.now().toString());
        setShowBanner(false);
        setShowSafariGuide(false);
    };

    if (!showBanner) return null;

    // Safari "Add to Home Screen" step-by-step guide overlay
    if (showSafariGuide) {
        return (
            <div style={{
                position: 'fixed', inset: 0, zIndex: 99999,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px',
                animation: 'fadeIn 0.3s ease'
            }}>
                <div style={{
                    background: 'linear-gradient(145deg, #1e293b, #0f172a)',
                    border: '2px solid rgba(99, 102, 241, 0.4)',
                    borderRadius: '24px',
                    padding: '32px 28px',
                    maxWidth: '380px',
                    width: '100%',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(99, 102, 241, 0.15)',
                    textAlign: 'center'
                }}>
                    <div style={{
                        width: '72px', height: '72px', borderRadius: '18px',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 20px', fontSize: '2rem',
                        boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)'
                    }}>📲</div>

                    <h3 style={{ margin: '0 0 8px', color: '#e2e8f0', fontSize: '1.15rem', fontWeight: 700 }}>
                        Install Trier OS
                    </h3>
                    <p style={{ margin: '0 0 24px', color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.6 }}>
                        Get the full app experience with offline access and home screen launch.
                    </p>

                    <div style={{
                        textAlign: 'left',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '16px',
                        padding: '16px 20px',
                        border: '1px solid rgba(255,255,255,0.06)',
                        marginBottom: '20px'
                    }}>
                        {platform === 'safari' ? (
                            <>
                                <Step num="1" text={'Tap the Share button'} icon="⬆️" detail="(square with arrow at bottom of Safari)" />
                                <Step num="2" text={'Scroll down and tap'} icon="+" detail={'"Add to Home Screen"'} />
                                <Step num="3" text={'Tap "Add" in the top right'} icon="✅" />
                            </>
                        ) : (
                            <>
                                <Step num="1" text={'Tap the ⋮ menu'} icon="⋮" detail="(three dots in Chrome)" />
                                <Step num="2" text={'Tap "Add to Home screen"'} icon="📱" />
                                <Step num="3" text={'Tap "Add" to confirm'} icon="✅" />
                            </>
                        )}
                    </div>

                    <button
                        onClick={handleDismiss}
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#94a3b8',
                            padding: '10px 32px',
                            borderRadius: '12px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        title={t('pwaInstallPrompt.dismissTheInstallPromptForTip')}
                    >
                        Maybe Later
                    </button>
                </div>

                <style>{`
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                `}</style>
            </div>
        );
    }

    // Main install banner — bottom of screen, non-intrusive
    return (
        <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 99997,
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.97), rgba(30, 41, 59, 0.97))',
            borderTop: '1px solid rgba(99, 102, 241, 0.3)',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
            animation: 'slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
            <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem', flexShrink: 0,
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)'
            }}>
                📲
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#e2e8f0', fontSize: '0.88rem', fontWeight: 700 }}>
                    Install Trier OS
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '2px' }}>
                    Works offline · Faster loads · Home screen access
                </div>
            </div>

            <button
                onClick={handleInstallClick}
                style={{
                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    border: 'none',
                    color: '#fff',
                    padding: '9px 20px',
                    borderRadius: '10px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
                    transition: 'all 0.2s'
                }}
                title={t('pwaInstallPrompt.installTrierOsAsATip')}
            >
                Install
            </button>

            <button
                onClick={handleDismiss}
                style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    lineHeight: 1,
                    flexShrink: 0
                }}
                title={t('pwaInstallPrompt.dismissTip')}
            >
                {'\u2715'}
            </button>

            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}

/** Helper: Single instruction step */
function Step({ num, text, icon, detail }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '8px 0',
            borderBottom: '1px solid rgba(255,255,255,0.04)'
        }}>
            <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: '0.75rem', fontWeight: 800, flexShrink: 0
            }}>
                {num}
            </div>
            <div>
                <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600 }}>{text} </span>
                <span style={{ fontSize: '1rem' }}>{icon}</span>
                {detail && <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '2px' }}>{detail}</div>}
            </div>
        </div>
    );
}
