// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — LOTO / Lockout-Tagout View
 * ========================================
 * Standalone full-page wrapper for the LOTO digital permit system.
 * This view provides the navigation shell and header; the core permit
 * workflow lives in LotoPanel.jsx.
 *
 * Accessed from the Mission Control tile or the Safety navigation item.
 * Renders LotoPanel with the current plantId and plantLabel props.
 *
 * LOTO WORKFLOW (in LotoPanel.jsx):
 *   1. Create permit — identify equipment, energy isolation points
 *   2. Apply locks   — technicians sign on; each gets a unique lock entry
 *   3. Perform work  — permit remains open until all work is done
 *   4. Restore       — verify isolation points removed, all locks released
 *   5. Close permit  — supervisor countersign; permit archived
 *
 * Complies with OSHA 29 CFR 1910.147 (Control of Hazardous Energy).
 *
 * @param {string} plantId    - Current plant identifier
 * @param {string} plantLabel - Human-readable plant name for display
 */
import React from 'react';
import { LockKeyhole, ArrowLeft } from 'lucide-react';
import LotoPanel from './LotoPanel';
import { TakeTourButton } from './ContextualTour';
import { useTranslation } from '../i18n/index.jsx';

export default function LotoView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)', overflow: 'hidden' }}>
            {/* Header */}
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <LockKeyhole size={24} /> {t('lotoView.heading', 'LOTO / Lockout-Tagout')}
                </h2>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <TakeTourButton tourId="loto" />
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('pf-nav', { detail: '' }))}
                        className="btn-nav"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36 }}
                        title={t('app.returnToMissionControl', 'Return to Mission Control')}
                    >
                        <ArrowLeft size={15} /> {t('app.missionControl', 'Mission Control')}
                    </button>
                </div>
            </div>

            {/* LOTO Panel Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                    <LotoPanel />
                </div>
            </div>
        </div>
    );
}
