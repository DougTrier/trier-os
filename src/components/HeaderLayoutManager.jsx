// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Header Layout Manager
 * ==================================
 * Renders Mission Control header widgets at their persisted positions.
 * Layout positions are loaded from localStorage (MC_HEADER_POSITIONS key)
 * and applied as absolute positioning within the header bar.
 * Editing mode has been permanently removed — layout is locked in place.
 *
 * KEY FEATURES:
 *   - Reads saved widget positions from localStorage on mount
 *   - Applies absolute CSS positioning to each widget based on saved x/y
 *   - Graceful fallback: if no saved positions found, renders in default flow
 *   - Locked layout: prevents accidental repositioning by field users
 *   - Used by MissionControl.jsx to arrange KPI widgets in the top header bar
 *
 * @param {Array<{ id: string, component: ReactNode }>} widgets — Ordered widget list
 */
import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'MC_HEADER_POSITIONS';

export default function HeaderLayoutManager({ widgets }) {
    const [positions] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (saved && typeof saved === 'object') return saved;
        } catch (e) { console.warn('[HeaderLayoutManager] caught:', e); }
        return {};
    });

    const hasPosition = (id) => positions[id] && typeof positions[id].x === 'number';

    return (
        <>
            {/* Flow container for widgets without saved positions */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                width: '100%',
                position: 'relative',
                minHeight: '40px',
            }}>
                {widgets.filter(w => !hasPosition(w.id)).map(w => (
                    <div key={w.id} style={{ position: 'relative' }}>
                        {w.render()}
                    </div>
                ))}
            </div>

            {/* Pinned widgets at their saved positions */}
            {widgets.filter(w => hasPosition(w.id)).map(w => (
                <div
                    key={`pinned-${w.id}`}
                    style={{
                        position: 'fixed',
                        left: positions[w.id].x,
                        top: positions[w.id].y,
                        zIndex: 9999,
                    }}
                >
                    {w.render()}
                </div>
            ))}
        </>
    );
}
