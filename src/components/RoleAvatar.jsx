// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Role Avatar
 * =======================
 * 3D role-based avatar component. Displays a color-agnostic mannequin avatar
 * distinguished by role-specific gear and uniform — never by skin color or race.
 * Used in Mission Control hero block, Staff Directory, and Workforce Analytics.
 *
 * KEY FEATURES:
 *   - Role-to-avatar mapping: each role maps to a unique gear/uniform image
 *   - Glow mode: accent color halo ring around avatar for current-user highlight
 *   - Size prop: scale avatar to any pixel size for different UI contexts
 *   - Label mode: show role label below avatar for directory cards
 *   - Fallback: defaults to employee avatar for unknown roles
 *
 * ROLES:
 *   ceo        → CEO / Executive Staff
 *   it_admin   → IT Staff
 *   lab_tech   → Lab Staff
 *   engineer   → Engineer Staff
 *   technician → Maintenance Staff
 *   mechanic   → Mechanic Staff
 *   manager    → Plant Manager
 *   supervisor → Supervisor (not currently a role, maps to manager)
 *   employee   → Ground Floor Staff
 *   creator    → Uses CEO avatar (system creator)
 *   corporate  → Uses CEO avatar
 *
 * Usage:
 *   <RoleAvatar role="technician" size={48} />
 *   <RoleAvatar role="manager" size={80} glow />
 *   <RoleAvatar role="engineer" size={36} showLabel />
 */
import React, { useState } from 'react';

// ── Avatar mapping: role → image file + display label + accent color ──
const AVATAR_MAP = {
    ceo:        { img: '/avatars/ceo.png',            label: 'Executive',       accent: '#3b82f6' },
    creator:    { img: '/avatars/ceo.png',            label: 'System Creator',  accent: '#f59e0b' },
    corporate:  { img: '/avatars/ceo.png',            label: 'Corporate',       accent: '#6366f1' },
    it_admin:   { img: '/avatars/it_staff.png',       label: 'IT Staff',        accent: '#8b5cf6' },
    lab_tech:   { img: '/avatars/lab_staff.png',      label: 'Lab Staff',       accent: '#06b6d4' },
    engineer:   { img: '/avatars/engineer.png',       label: 'Engineer',        accent: '#10b981' },
    technician: { img: '/avatars/maintenance.png',    label: 'Maintenance',     accent: '#f97316' },
    mechanic:   { img: '/avatars/mechanic.png',       label: 'Mechanic',        accent: '#22c55e' },
    manager:    { img: '/avatars/plant_manager.png',  label: 'Plant Manager',   accent: '#eab308' },
    supervisor: { img: '/avatars/supervisor.png',     label: 'Supervisor',      accent: '#ef4444' },
    employee:   { img: '/avatars/ground_floor.png',   label: 'Ground Floor',    accent: '#64748b' },
};

// Fallback for unknown roles
const FALLBACK = { img: '/avatars/ground_floor.png', label: 'Staff', accent: '#64748b' };

export function getAvatarForRole(role) {
    return AVATAR_MAP[role] || FALLBACK;
}

export default function RoleAvatar({
    role = 'employee',
    size = 48,
    glow = false,
    showLabel = false,
    showRole = false,
    onClick = null,
    style = {},
    className = '',
    title: titleOverride,
}) {
    const [hovered, setHovered] = useState(false);
    const avatar = AVATAR_MAP[role] || FALLBACK;

    const imgSize = size;
    const borderWidth = Math.max(2, Math.round(size / 20));

    return (
        <div
            className={`role-avatar ${className}`}
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            title={titleOverride || `${avatar.label}`}
            style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: showLabel ? 6 : 0,
                cursor: onClick ? 'pointer' : 'default',
                ...style,
            }}
        >
            <div style={{
                width: imgSize,
                height: imgSize,
                borderRadius: '50%',
                overflow: 'hidden',
                border: `${borderWidth}px solid ${avatar.accent}${hovered ? 'cc' : '55'}`,
                boxShadow: glow || hovered
                    ? `0 0 ${Math.round(size / 3)}px ${avatar.accent}44, 0 4px 12px rgba(0,0,0,0.3)`
                    : '0 2px 8px rgba(0,0,0,0.2)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: hovered ? 'scale(1.25)' : 'scale(1)',
                flexShrink: 0,
                background: `linear-gradient(135deg, ${avatar.accent}15 0%, transparent 60%)`,
            }}>
                <img src={avatar.img}
                    alt={avatar.label}
                    loading="lazy"
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'center top',
                        filter: hovered ? 'brightness(1.1)' : 'brightness(1)',
                        transition: 'filter 0.3s ease',
                    }}
                    onError={(e) => {
                        // Fallback to initials if image fails
                        e.target.style.display = 'none';
                        e.target.parentNode.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${avatar.accent}22;color:${avatar.accent};font-weight:800;font-size:${Math.round(size / 2.8)}px">${avatar.label.charAt(0)}</div>`;
                    }}
                />
            </div>
            {showLabel && (
                <span style={{
                    fontSize: Math.max(10, Math.round(size / 5)),
                    fontWeight: 600,
                    color: avatar.accent,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    lineHeight: 1.2,
                    textAlign: 'center',
                    maxWidth: size * 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}>
                    {avatar.label}
                </span>
            )}
            {showRole && (
                <span style={{
                    fontSize: Math.max(9, Math.round(size / 6)),
                    color: '#94a3b8',
                    fontWeight: 500,
                    textAlign: 'center',
                }}>
                    {role.replace(/_/g, ' ')}
                </span>
            )}
        </div>
    );
}

/**
 * AvatarPicker — Grid of all role avatars for selection
 * Used in admin user management or profile settings
 */
export function AvatarPicker({ currentRole, onSelect, size = 64 }) {
    const roles = Object.keys(AVATAR_MAP);

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${size + 30}px, 1fr))`,
            gap: 16,
            padding: 16,
        }}>
            {roles.map(role => (
                <div
                    key={role}
                    onClick={() => onSelect && onSelect(role)}
                    style={{
                        cursor: 'pointer',
                        padding: 10,
                        borderRadius: 12,
                        background: currentRole === role ? `${AVATAR_MAP[role].accent}15` : 'transparent',
                        border: currentRole === role
                            ? `2px solid ${AVATAR_MAP[role].accent}66`
                            : '2px solid transparent',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    <RoleAvatar role={role} size={size} />
                    <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: currentRole === role ? AVATAR_MAP[role].accent : '#94a3b8',
                        textAlign: 'center',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                    }}>
                        {AVATAR_MAP[role].label}
                    </span>
                </div>
            ))}
        </div>
    );
}
