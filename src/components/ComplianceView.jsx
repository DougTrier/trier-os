// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Compliance & Regulatory Tracking View
 * ===================================================
 * Standalone full-page wrapper for the compliance management system.
 * Provides the navigation shell; the core workflow lives in ComplianceTracker.jsx.
 *
 * Accessed from the Mission Control tile or the Safety navigation item.
 * Renders ComplianceTracker with the current plantId and plantLabel context.
 *
 * WHAT'S INSIDE (ComplianceTracker.jsx):
 *   Frameworks        — OSHA, EPA, FDA, and custom compliance programs
 *   Checklists        — Requirement items per framework with due dates
 *   Inspections       — Scheduled audits with findings and corrective actions
 *   Compliance Score  — Overall % current, overdue items, trend over 90 days
 *
 * Regulatory frameworks supported: OSHA 29 CFR 1910, EPA 40 CFR,
 * FDA 21 CFR Part 117 (FSMA / food safety), and unlimited custom frameworks.
 *
 * @param {string} plantId    - Current plant identifier
 * @param {string} plantLabel - Human-readable plant name for display
 */
import React from 'react';
import { ShieldCheck } from 'lucide-react';
import ComplianceTracker from './ComplianceTracker';
import { TakeTourButton } from './ContextualTour';
import { useTranslation } from '../i18n/index.jsx';

export default function ComplianceView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)', overflow: 'hidden' }}>
            {/* Header */}
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <ShieldCheck size={24} /> {t('complianceView.heading', 'Compliance & Regulatory')}
                </h2>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <TakeTourButton tourId="compliance" />
                </div>
            </div>

            {/* Compliance Tracker Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                <div className="glass-card" style={{ padding: 'var(--card-padding)' }}>
                    <ComplianceTracker plantId={plantId} plantLabel={plantLabel} />
                </div>
            </div>
        </div>
    );
}
