// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Portal Navigation Widget
 * =====================================
 * Compact header navigation widget replacing the old Portal ring.
 * Shows a "Mission Control" home button and a contextual "← Back"
 * button on every workspace page except Mission Control itself.
 *
 * KEY FEATURES:
 *   - Home button: always-visible return to Mission Control tile grid
 *   - Back button: contextual label derived from parent tile group
 *     (e.g. "← IT Department" when in IT sub-views)
 *   - Route-to-parent mapping: auto-generates back labels from TILE_GROUPS
 *   - Hidden on Mission Control itself to avoid redundant navigation
 *   - Compact design: fits in a fixed header bar without taking vertical space
 *
 * DATA SOURCES:
 *   TILE_GROUPS and ALL_TILES from MissionControl.jsx — used for back-label resolution
 */
import React, { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { TILE_GROUPS, ALL_TILES } from './MissionControl';
import { useTranslation } from '../i18n/index.jsx';

// Map workspace routes back to their parent group title for contextual back labels
const ROUTE_TO_PARENT = {};
for (const [gid, g] of Object.entries(TILE_GROUPS)) {
    for (const childKey of g.children) {
        const tile = ALL_TILES[childKey];
        if (tile?.workspace) {
            ROUTE_TO_PARENT[tile.workspace] = { title: g.title, path: `/portal/${gid}`, gid: gid };
        }
    }
}

export default function PortalWidget({ onWarpHome }) {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const [mcHovered, setMcHovered] = useState(false);
    const [backHovered, setBackHovered] = useState(false);

    // Determine contextual back label
    const currentRoute = location.pathname.replace(/^\//, '');
    const parentInfo = useMemo(() => {
        // Check if current route has a parent group
        if (ROUTE_TO_PARENT[currentRoute]) {
            const p = ROUTE_TO_PARENT[currentRoute];
            return { title: t(`mc.tile.${p.gid}.title`, p.title), path: p.path };
        }

        // If we're on a portal page, back goes to Mission Control
        if (currentRoute.startsWith('portal/')) {
            return { title: t('app.missionControl', 'Mission Control'), path: '/' };
        }

        // Default: just use browser back
        return null;
    }, [currentRoute, t]);

    const handleBack = () => {
        if (location.state?.fromDashboard) {
            navigate('/dashboard');
            return;
        }
        if (parentInfo) {
            navigate(parentInfo.path);
        } else {
            // Use browser history
            window.history.back();
        }
    };

    const btnBase = {
        display: 'flex', alignItems: 'center', gap: 7,
        border: 'none', borderRadius: 10,
        cursor: 'pointer', fontWeight: 600,
        fontSize: '0.76rem', letterSpacing: '0.02em',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        whiteSpace: 'nowrap',
    };

    return (
        <div
            className="nav-widget hide-mobile"
            style={{
                position: 'fixed',
                top: 18,
                left: 18,
                zIndex: 9500,
                display: 'flex', flexDirection: 'column', gap: 6,
                animation: 'navWidgetIn 0.4s ease-out',
            }}
        >
            {/* Mission Control button */}
            <button
                onClick={onWarpHome}
                onMouseEnter={() => setMcHovered(true)}
                onMouseLeave={() => setMcHovered(false)}
                title={t('portal.goToMissionControlTip', 'Return to Mission Control')}
                style={{
                    ...btnBase,
                    padding: '10px 16px',
                    background: mcHovered
                        ? 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.1))'
                        : 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.05))',
                    color: mcHovered ? '#fbbf24' : '#f59e0b',
                    boxShadow: mcHovered
                        ? '0 6px 24px rgba(245,158,11,0.2), 0 0 0 1px rgba(245,158,11,0.3)'
                        : '0 2px 8px rgba(0,0,0,0.2), 0 0 0 1px rgba(245,158,11,0.15)',
                    transform: mcHovered ? 'translateY(-1px)' : 'none',
                }}
            >
                <Home size={16} strokeWidth={2.2} />
                <span>{t('app.missionControl', 'Mission Control')}</span>
            </button>

            {/* Back button */}
            <button
                onClick={handleBack}
                onMouseEnter={() => setBackHovered(true)}
                onMouseLeave={() => setBackHovered(false)}
                title={location.state?.fromDashboard ? t('portal.goBackToPlantMetrics', 'Go back to Plant Metrics') : (parentInfo ? t('portal.goBackTo', `Go back to ${parentInfo.title}`) : t('portal.goBack', 'Go back'))}
                style={{
                    ...btnBase,
                    padding: '8px 14px',
                    background: backHovered
                        ? 'rgba(255,255,255,0.1)'
                        : 'rgba(255,255,255,0.05)',
                    color: backHovered ? '#e2e8f0' : '#94a3b8',
                    boxShadow: backHovered
                        ? '0 4px 16px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.15)'
                        : '0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.06)',
                    transform: backHovered ? 'translateY(-1px)' : 'none',
                }}
            >
                <ArrowLeft size={15} strokeWidth={2} />
                <span>{location.state?.fromDashboard ? `← ${t('app.plantMetrics', 'Plant Metrics')}` : (parentInfo ? `← ${parentInfo.title}` : `← ${t('portal.back', 'Back')}`)}</span>
            </button>

            {/* Widget CSS */}
            <style>{`
                @keyframes navWidgetIn {
                    from {
                        opacity: 0;
                        transform: translateX(-12px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }

                /* Mobile: tighter layout */
                @media (max-width: 640px) {
                    .nav-widget {
                        top: 8px !important;
                        left: 8px !important;
                    }
                    .nav-widget button {
                        padding: 7px 10px !important;
                        font-size: 0.68rem !important;
                    }
                }
            `}</style>
        </div>
    );
}
