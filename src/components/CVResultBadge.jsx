// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Computer Vision Result Badge
 * =========================================
 * Renders a colored pill overlay on photo thumbnails indicating the AI vision
 * analysis result: Normal / Monitor / Action Required. Used across WorkOrders,
 * Assets, and Inspections wherever PhotoAssembly renders image thumbnails.
 *
 * SEVERITY SCALE:
 *   1–2  → Normal       (green)  — No defect detected; part within tolerance
 *   3    → Monitor      (amber)  — Minor anomaly; flag for next PM cycle
 *   4–5  → Action Req.  (red)    — Defect confirmed; schedule repair now
 *
 * CONDITION VALUES:
 *   'New'     → green Normal badge
 *   'Good'    → green Normal badge
 *   'Worn'    → amber Monitor badge
 *   'Replace' → red Action Required badge
 *
 * @param {number} severity  — 1–5 defect severity score (from analyze-defect API)
 * @param {string} condition — 'New' | 'Good' | 'Worn' | 'Replace' (from condition API)
 * @param {string} label     — Override the auto-derived badge label text
 * @param {object} style     — Additional inline styles applied to the badge container
 */
import React from 'react';

const SEVERITY_META = {
    1: { color: '#10b981', bg: 'rgba(16,185,129,0.85)', icon: '🟢', label: 'Normal' },
    2: { color: '#10b981', bg: 'rgba(16,185,129,0.85)', icon: '🟢', label: 'Normal' },
    3: { color: '#f59e0b', bg: 'rgba(245,158,11,0.85)', icon: '🟡', label: 'Monitor' },
    4: { color: '#ef4444', bg: 'rgba(239,68,68,0.85)',  icon: '🔴', label: 'Action Required' },
    5: { color: '#ef4444', bg: 'rgba(239,68,68,0.85)',  icon: '🔴', label: 'Critical' },
};

const CONDITION_META = {
    New:     { bg: 'rgba(16,185,129,0.85)',  icon: '🟢', label: 'New' },
    Good:    { bg: 'rgba(16,185,129,0.85)',  icon: '🟢', label: 'Good' },
    Worn:    { bg: 'rgba(245,158,11,0.85)',  icon: '🟡', label: 'Worn' },
    Replace: { bg: 'rgba(239,68,68,0.85)',   icon: '🔴', label: 'Replace' },
};

export default function CVResultBadge({ severity, condition, label, style = {} }) {
    let meta;
    if (severity != null) {
        meta = SEVERITY_META[Math.min(Math.max(Math.round(severity), 1), 5)];
    } else if (condition) {
        meta = CONDITION_META[condition] || CONDITION_META.Good;
    } else {
        return null;
    }

    return (
        <div style={{
            position: 'absolute',
            bottom: 4,
            left: 4,
            background: meta.bg,
            backdropFilter: 'blur(4px)',
            borderRadius: 5,
            padding: '2px 6px',
            fontSize: '0.6rem',
            fontWeight: 700,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 2,
            ...style,
        }}>
            {meta.icon} {label || meta.label}
        </div>
    );
}
