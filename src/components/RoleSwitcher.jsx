// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Role Switcher (Admin/Creator Only)
 * ===============================================
 * Persistent impersonation dropdown for admins to view the platform
 * through the eyes of any employee persona. Instantly reshapes Mission
 * Control tiles and navigation to reflect the selected role.
 *
 * KEY FEATURES:
 *   - Persona dropdown: 10+ role options from Technician to CEO
 *   - Instant reshape: Mission Control tile grid updates immediately on change
 *   - Persistence: viewAsRole stored in localStorage across page refreshes
 *   - Reset button: one-click return to admin's own actual view
 *   - Role-gated: visible only to Creator and IT Admin users
 *   - Used for: UX testing, training demos, support troubleshooting
 *
 * PERSONAS AVAILABLE:
 *   My View (actual) | Technician | Mechanic | Engineer | Lab Tech
 *   Plant Manager | IT Admin | Executive | Employee | Contractor
 *
 * @param {string}   viewAsRole    — Currently active impersonated role ('' = own view)
 * @param {Function} setViewAsRole — Setter to update impersonated role
 */
import React, { useState, useEffect, useRef } from 'react';
import { Eye, ChevronDown, RotateCcw } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

const PERSONAS = [
    { value: '', label: '👁️ My View', desc: 'Your actual role', color: '#94a3b8' },
    { value: 'technician', label: '🔧 Technician', desc: 'Field repairs & inspections', color: '#f59e0b' },
    { value: 'mechanic', label: '🔩 Mechanic', desc: 'Heavy equipment & motor work', color: '#f97316' },
    { value: 'engineer', label: '🏗️ Engineer', desc: 'Design, specs & root cause', color: '#3b82f6' },
    { value: 'lab_tech', label: '🥼 Lab Tech', desc: 'Testing & compliance', color: '#06b6d4' },
    { value: 'manager', label: '🏭 Plant Manager', desc: 'Full site operations', color: '#10b981' },
    { value: 'corporate', label: '🏢 Corporate', desc: 'Enterprise oversight', color: '#8b5cf6' },
    { value: 'it_admin', label: '💻 IT Admin', desc: 'System & user management', color: '#ef4444' },
    { value: 'employee', label: '👤 Employee', desc: 'Basic access', color: '#64748b' },
];

export default function RoleSwitcher({ isCreator, userRole, onRoleChange }) {
    const { t } = useTranslation();
    const [viewAs, setViewAs] = useState(localStorage.getItem('MC_VIEW_AS_ROLE') || '');
    const [open, setOpen] = useState(false);
    const ref = useRef(null);


    useEffect(() => {
        const handleClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Only render for Creator or IT Admin
    const canSwitch = isCreator || userRole === 'it_admin';
    if (!canSwitch) return null;


    const handleSelect = (role) => {
        setViewAs(role);
        if (role) {
            localStorage.setItem('MC_VIEW_AS_ROLE', role);
        } else {
            localStorage.removeItem('MC_VIEW_AS_ROLE');
        }
        setOpen(false);
        if (onRoleChange) onRoleChange(role);
    };

    const current = PERSONAS.find(p => p.value === viewAs) || PERSONAS[0];

    return (
        <div ref={ref} style={{ position: 'relative', zIndex: 9900 }}>
            {/* Trigger button */}
            <button 
                onClick={() => setOpen(!open)}
                title={t('roleSwitcher.switchRoleViewSeeWhatTip')}
                style={{
                    background: viewAs
                        ? 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(236,72,153,0.1))'
                        : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${viewAs ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 10,
                    padding: '6px 12px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    color: viewAs ? '#f59e0b' : '#94a3b8',
                    fontSize: '0.78rem', fontWeight: 600,
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                }}
            >
                <Eye size={14} />
                <span>{current.label}</span>
                <ChevronDown size={12} style={{
                    transition: 'transform 0.2s',
                    transform: open ? 'rotate(180deg)' : 'rotate(0)',
                }} />
            </button>

            {/* Dropdown */}
            {open && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    width: 260,
                    background: 'rgba(15,23,42,0.98)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
                    padding: '6px',
                    animation: 'roleSwitcherIn 0.2s ease',
                    backdropFilter: 'blur(20px)',
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '8px 12px', fontSize: '0.7rem', fontWeight: 700,
                        color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        marginBottom: 4,
                    }}>
                        👁️ View As Role
                    </div>

                    {/* Options */}
                    {PERSONAS.map(p => {
                        const isActive = p.value === viewAs;
                        return (
                            <button 
                                key={p.value}
                                onClick={() => handleSelect(p.value)}
                                style={{
                                    width: '100%',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 12px',
                                    background: isActive ? `${p.color}15` : 'transparent',
                                    border: 'none',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'background 0.15s',
                                    color: '#e2e8f0',
                                }}
                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                             title={t('roleSwitcher.selectTip')}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 8,
                                    background: `${p.color}18`,
                                    border: isActive ? `2px solid ${p.color}` : '2px solid transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '1rem', flexShrink: 0,
                                    transition: 'border 0.15s',
                                }}>
                                    {p.label.split(' ')[0]}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isActive ? p.color : '#e2e8f0' }}>
                                        {p.label.split(' ').slice(1).join(' ')}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                        {p.desc}
                                    </div>
                                </div>
                                {isActive && (
                                    <div style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: p.color,
                                        boxShadow: `0 0 8px ${p.color}80`,
                                    }} />
                                )}
                            </button>
                        );
                    })}

                    {/* Reset hint */}
                    {viewAs && (
                        <div style={{
                            padding: '6px 12px', marginTop: 4,
                            borderTop: '1px solid rgba(255,255,255,0.05)',
                            fontSize: '0.68rem', color: '#475569',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <RotateCcw size={10} /> Select "My View" to return to your actual role
                        </div>
                    )}
                </div>
            )}

            {/* Animation */}
            <style>{`
                @keyframes roleSwitcherIn {
                    from { opacity: 0; transform: translateY(-8px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}
