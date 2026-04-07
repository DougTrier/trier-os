// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Interactive Onboarding Tour
 * ========================================
 * First-time user walkthrough that guides new users through the app
 * with highlighted tooltip overlays on key UI elements.
 * Tracks completion in localStorage — launches once, re-launchable from Settings.
 *
 * KEY FEATURES:
 *   - Step-by-step element highlighting with spotlight overlay
 *   - Welcome screen: no element target (full-screen modal intro)
 *   - TOUR_STEPS array: each step has target selector, title, and body copy
 *   - Navigation: Prev / Next with step counter and progress dots
 *   - Skip button: exit tour at any step; marks as completed
 *   - Restart: re-launchable from Settings → "Take the Tour Again"
 *   - Completion flag stored in localStorage ('trierOS_tourComplete')
 *   - Keyboard: → / ← to navigate, Esc to exit
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, ChevronRight, ChevronLeft, X, RotateCcw } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

/**
 * Interactive Onboarding Tour — Task 4.4
 * Walks first-time users through the app with highlighted tooltips.
 * Tracks completion in localStorage. Can be relaunched from Settings.
 */

const TOUR_STEPS = [
    {
        target: null, // Welcome screen — no element to highlight
        title: '👋 Welcome to Trier OS',
        body: 'This quick tour will show you the key features of your Enterprise System platform. Takes less than 2 minutes!',
        position: 'center',
        icon: '🏭'
    },
    {
        targetQuery: '.btn-header-grid',
        targetText: 'Dashboard',
        title: '📊 Enterprise Dashboard',
        body: 'Your command center. View work order counts, asset health, predictive risk alerts, and enterprise-wide KPIs at a glance.',
        position: 'bottom',
        icon: '📊'
    },
    {
        targetQuery: '.btn-header-grid',
        targetText: 'Jobs',
        title: '🔧 Work Orders & Jobs',
        body: 'Create, assign, and track work orders. Manage preventive maintenance schedules, set priorities, and log labor hours.',
        position: 'bottom',
        icon: '🔧'
    },
    {
        targetQuery: '.btn-header-grid',
        targetText: 'Parts',
        title: '📦 Parts & Inventory',
        body: 'Full inventory management with vendor contacts, reorder alerts, cross-plant logistics, and part substitution tracking.',
        position: 'bottom',
        icon: '📦'
    },
    {
        targetQuery: '.btn-header-grid',
        targetText: 'Assets',
        title: '⚙️ Equipment & Assets',
        body: 'Track every piece of equipment — downtime history, parts used, maintenance records, and reliability metrics.',
        position: 'bottom',
        icon: '⚙️'
    },
    {
        targetQuery: 'button[title*="Global Smart Scan"]',
        title: '📸 Smart Scanner',
        body: 'Use your camera to scan barcodes or QR codes. Instantly look up parts, assets, or work orders from any device.',
        position: 'bottom',
        icon: '📸'
    },
    {
        targetQuery: '.btn-header-grid',
        targetText: 'Chat',
        title: '💬 Knowledge Exchange',
        body: 'Share maintenance knowledge with your team. Post tips, ask questions, and preserve institutional knowledge across sites.',
        position: 'bottom',
        icon: '💬'
    },
    {
        targetQuery: '.btn-header-grid',
        targetText: 'History',
        title: '📜 Work History',
        body: 'Complete audit trail of all completed work orders, PMs, and maintenance activities. Search history by date, asset, or technician.',
        position: 'bottom',
        icon: '📜'
    },
    {
        targetQuery: '.btn-header-grid',
        targetText: 'Directory',
        title: '📞 Enterprise Directory',
        body: 'Find contacts at any plant location. Direct dial, email, or view org charts for leadership and key personnel.',
        position: 'bottom',
        icon: '📞'
    },
    {
        targetQuery: '.btn-header-grid',
        targetText: 'Settings',
        title: '⚙️ Your Settings',
        body: 'Change your password, configure email alerts, and manage your account preferences. Admins can also manage users, sensors, and compliance.',
        position: 'bottom',
        icon: '⚙️'
    },
    {
        targetQuery: 'button[title*="Shop Floor"]',
        title: '🏗️ Shop Floor Mode',
        body: 'High-contrast display optimized for shop floor monitors and tablets. Large text, simplified navigation for the plant floor.',
        position: 'bottom',
        icon: '🏗️'
    },
    {
        target: null,
        title: '🎉 You\'re All Set!',
        body: 'That\'s the tour! Start by checking your Dashboard or creating a Work Order. You can replay this tour anytime from Settings.',
        position: 'center',
        icon: '🚀',
        isFinal: true
    }
];

const getUserKey = (base) => {
    const username = localStorage.getItem('username') || 'default';
    return `${base}_${username}`;
};

export default function OnboardingTour({ forceShow = false, onComplete }) {
    const { t } = useTranslation();
    const [isActive, setIsActive] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [targetRect, setTargetRect] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
    const tooltipRef = useRef(null);
    const animFrameRef = useRef(null);

    // Determine if tour should show
    useEffect(() => {
        if (forceShow) {
            setIsActive(true);
            setCurrentStep(0);
            return;
        }
        const completed = localStorage.getItem(getUserKey('pf_onboarding_complete'));
        const dismissed = localStorage.getItem(getUserKey('pf_onboarding_dismissed'));
        if (!completed && !dismissed) {
            // First-time user — auto-show after a short delay
            const timer = setTimeout(() => setIsActive(true), 1500);
            return () => clearTimeout(timer);
        }
    }, [forceShow]);

    // Listen for replay event
    useEffect(() => {
        const handleReplay = () => {
            setCurrentStep(0);
            setIsActive(true);
        };
        window.addEventListener('pf-replay-onboarding', handleReplay);
        return () => window.removeEventListener('pf-replay-onboarding', handleReplay);
    }, []);

    const step = TOUR_STEPS[currentStep];
    const isAdminOrCreator = ['it_admin', 'creator'].includes(localStorage.getItem('userRole')) ||
        localStorage.getItem('PF_USER_IS_CREATOR') === 'true';

    // Skip admin-only steps for non-admins
    const getVisibleSteps = useCallback(() => {
        return TOUR_STEPS.filter(s => !s.adminOnly || isAdminOrCreator);
    }, [isAdminOrCreator]);

    const visibleSteps = getVisibleSteps();
    const visibleIndex = visibleSteps.indexOf(step);
    const totalVisible = visibleSteps.length;

    // Find and highlight the target element
    const findTarget = useCallback(() => {
        if (!step || step.position === 'center') {
            setTargetRect(null);
            return;
        }

        let el = null;

        if (step.targetQuery && step.targetText) {
            // Find button by class + text content
            const candidates = document.querySelectorAll(step.targetQuery);
            for (const c of candidates) {
                if (c.textContent.trim().includes(step.targetText)) {
                    el = c;
                    break;
                }
            }
        } else if (step.targetQuery) {
            el = document.querySelector(step.targetQuery);
        }

        if (el) {
            const rect = el.getBoundingClientRect();
            setTargetRect({
                top: rect.top - 8,
                left: rect.left - 8,
                width: rect.width + 16,
                height: rect.height + 16,
                element: el
            });
        } else {
            setTargetRect(null);
        }
    }, [step]);

    // Position tooltip
    useEffect(() => {
        if (!isActive) return;

        const positionTooltip = () => {
            findTarget();
            animFrameRef.current = requestAnimationFrame(positionTooltip);
        };

        // Initial delay for DOM to settle
        const timer = setTimeout(() => {
            positionTooltip();
        }, 100);

        return () => {
            clearTimeout(timer);
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [isActive, currentStep, findTarget]);

    // Calculate tooltip position based on target and preferred placement
    useEffect(() => {
        if (!isActive || !tooltipRef.current) return;

        const tooltip = tooltipRef.current;
        const tooltipWidth = 360;
        const tooltipHeight = tooltip.offsetHeight || 200;
        const padding = 16;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        if (!targetRect || step?.position === 'center') {
            // Center on screen
            setTooltipPos({
                top: Math.max(padding, (vh - tooltipHeight) / 2),
                left: Math.max(padding, (vw - tooltipWidth) / 2)
            });
            return;
        }

        let top, left;
        const targetCenterX = targetRect.left + targetRect.width / 2;

        // Always place below the target (bottom)
        top = targetRect.top + targetRect.height + 16;
        left = targetCenterX - tooltipWidth / 2;

        // If tooltip goes below viewport, place above
        if (top + tooltipHeight > vh - padding) {
            top = targetRect.top - tooltipHeight - 16;
        }

        // Clamp to viewport
        left = Math.max(padding, Math.min(left, vw - tooltipWidth - padding));
        top = Math.max(padding, Math.min(top, vh - tooltipHeight - padding));

        setTooltipPos({ top, left });
    }, [targetRect, isActive, currentStep, step]);

    const goNext = () => {
        // Find next visible step
        let next = currentStep + 1;
        while (next < TOUR_STEPS.length && TOUR_STEPS[next].adminOnly && !isAdminOrCreator) {
            next++;
        }
        if (next >= TOUR_STEPS.length) {
            completeTour();
        } else {
            setCurrentStep(next);
        }
    };

    const goPrev = () => {
        let prev = currentStep - 1;
        while (prev >= 0 && TOUR_STEPS[prev].adminOnly && !isAdminOrCreator) {
            prev--;
        }
        if (prev >= 0) setCurrentStep(prev);
    };

    const completeTour = () => {
        localStorage.setItem(getUserKey('pf_onboarding_complete'), 'true');
        setIsActive(false);
        setCurrentStep(0);
        if (onComplete) onComplete();
    };

    const dismissTour = () => {
        localStorage.setItem(getUserKey('pf_onboarding_dismissed'), 'true');
        setIsActive(false);
        setCurrentStep(0);
    };

    if (!isActive || !step) return null;

    const progressPct = ((visibleIndex + 1) / totalVisible) * 100;

    return (
        <>
            {/* Overlay with cutout for highlighted element */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 99990,
                pointerEvents: 'none'
            }}>
                {/* Full overlay */}
                <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
                    <defs>
                        <mask id="tour-mask">
                            <rect width="100%" height="100%" fill="white" />
                            {targetRect && (
                                <rect
                                    x={targetRect.left}
                                    y={targetRect.top}
                                    width={targetRect.width}
                                    height={targetRect.height}
                                    rx="12"
                                    fill="black"
                                />
                            )}
                        </mask>
                    </defs>
                    <rect
                        width="100%" height="100%"
                        fill="rgba(0, 0, 0, 0.75)"
                        mask="url(#tour-mask)"
                    />
                </svg>

                {/* Glowing border around target */}
                {targetRect && (
                    <div style={{
                        position: 'absolute',
                        top: targetRect.top,
                        left: targetRect.left,
                        width: targetRect.width,
                        height: targetRect.height,
                        borderRadius: '12px',
                        border: '2px solid #818cf8',
                        boxShadow: '0 0 20px rgba(129, 140, 248, 0.5), 0 0 40px rgba(129, 140, 248, 0.2)',
                        animation: 'tourPulse 2s ease-in-out infinite',
                        pointerEvents: 'none'
                    }} />
                )}
            </div>

            {/* Clickable backdrop to dismiss */}
            <div
                onClick={dismissTour}
                style={{
                    position: 'fixed', inset: 0, zIndex: 99991,
                    cursor: 'pointer'
                }}
            />

            {/* Tooltip Card */}
            <div
                ref={tooltipRef}
                onClick={e => e.stopPropagation()}
                style={{
                    position: 'fixed',
                    top: tooltipPos.top,
                    left: tooltipPos.left,
                    zIndex: 99992,
                    width: '360px',
                    background: 'linear-gradient(145deg, #1e293b, #0f172a)',
                    border: '2px solid rgba(129, 140, 248, 0.4)',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 30px rgba(129, 140, 248, 0.15)',
                    transition: 'top 0.3s ease, left 0.3s ease',
                    cursor: 'default'
                }}
            >
                {/* Close button */}
                <button
                    onClick={dismissTour}
                    style={{
                        position: 'absolute', top: '12px', right: '12px',
                        background: 'rgba(255,255,255,0.05)', border: 'none',
                        color: '#94a3b8', cursor: 'pointer', padding: '4px',
                        borderRadius: '6px', display: 'flex', alignItems: 'center'
                    }}
                    title={t('onboarding.tour.skipTour')}
                >
                    <X size={16} />
                </button>

                {/* Step icon + title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <div style={{
                        fontSize: '2rem', width: '50px', height: '50px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(129, 140, 248, 0.1)',
                        borderRadius: '14px', border: '1px solid rgba(129, 140, 248, 0.2)',
                        flexShrink: 0
                    }}>
                        {step.icon}
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f1f5f9', fontWeight: '700' }}>
                            {step.title}
                        </h3>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                            Step {visibleIndex + 1} of {totalVisible}
                        </div>
                    </div>
                </div>

                {/* Body text */}
                <p style={{
                    margin: '0 0 20px 0', fontSize: '0.9rem', lineHeight: '1.5',
                    color: '#cbd5e1'
                }}>
                    {step.body}
                </p>

                {/* Progress bar */}
                <div style={{
                    height: '4px', borderRadius: '2px',
                    background: 'rgba(255,255,255,0.06)', marginBottom: '16px',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        height: '100%', width: `${progressPct}%`,
                        background: 'linear-gradient(90deg, #818cf8, #6366f1)',
                        borderRadius: '2px',
                        transition: 'width 0.4s ease'
                    }} />
                </div>

                {/* Navigation buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        onClick={dismissTour}
                        style={{
                            background: 'none', border: 'none', color: '#64748b',
                            cursor: 'pointer', fontSize: '0.8rem', padding: '6px 0'
                        }}
                        title={t('onboardingTour.skipTheTourAndExploreTip')}
                    >{t('tour.skipTour', 'Skip Tour')}</button>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        {visibleIndex > 0 && (
                            <button
                                onClick={goPrev}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                    padding: '8px 16px', borderRadius: '8px',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#94a3b8', cursor: 'pointer',
                                    fontSize: '0.85rem', fontWeight: '500'
                                }}
                                title={t('onboardingTour.goToThePreviousTourTip')}
                            >
                                <ChevronLeft size={16} /> {t('onboarding.tour.back')}
                            </button>
                        )}
                        <button
                            onClick={step.isFinal ? completeTour : goNext}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 20px', borderRadius: '8px',
                                background: step.isFinal
                                    ? 'linear-gradient(135deg, #10b981, #059669)'
                                    : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                border: 'none', color: '#fff', cursor: 'pointer',
                                fontSize: '0.85rem', fontWeight: '600',
                                boxShadow: step.isFinal
                                    ? '0 4px 15px rgba(16, 185, 129, 0.3)'
                                    : '0 4px 15px rgba(99, 102, 241, 0.3)'
                            }}
                            title={step.isFinal ? 'Complete the tour and start using the app' : 'Move to the next tour step'}
                        >
                            {step.isFinal ? 'Get Started!' : 'Next'}
                            {!step.isFinal && <ChevronRight size={16} />}
                            {step.isFinal && <Sparkles size={16} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* CSS Animation */}
            <style>{`
                @keyframes tourPulse {
                    0%, 100% { box-shadow: 0 0 20px rgba(129, 140, 248, 0.5), 0 0 40px rgba(129, 140, 248, 0.2); }
                    50% { box-shadow: 0 0 30px rgba(129, 140, 248, 0.7), 0 0 60px rgba(129, 140, 248, 0.3); }
                }
            `}</style>
        </>
    );
}

/**
 * Small replay button for Settings — dispatches event to restart tour
 */
export function ReplayTourButton() {
    const { t } = useTranslation();
    const handleReplay = () => {
        localStorage.removeItem(getUserKey('pf_onboarding_complete'));
        localStorage.removeItem(getUserKey('pf_onboarding_dismissed'));
        window.dispatchEvent(new CustomEvent('pf-replay-onboarding'));
    };

    return (
        <button
            onClick={handleReplay}
            className="btn-primary"
            style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 20px', fontSize: '0.85rem',
                background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.2), rgba(99, 102, 241, 0.2))',
                border: '1px solid rgba(129, 140, 248, 0.3)',
                borderRadius: '10px', cursor: 'pointer', color: '#818cf8'
            }}
            title={t('onboardingTour.restartTheOnboardingTourFromTip')}
        >
            <RotateCcw size={16} /> {t('onboarding.tour.replayOnboardingTour')}
        </button>
    );
}
