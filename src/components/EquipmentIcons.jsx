// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Equipment Icon Library
 * ===================================
 * SVG-based equipment icon set for industrial facility floor plans and
 * digital twin schematics. Each icon is a self-contained React component
 * renderable at any size via the `size` prop.
 *
 * KEY FEATURES:
 *   - EQUIPMENT_ICONS array: all available icons with id, label, category, and component
 *   - Categories: Production, Utilities, HVAC, Conveyors, Safety, Electrical, Custom
 *   - Drag-and-drop ready: icons are draggable onto the FloorPlanView canvas
 *   - Consistent sizing: all icons honor the `size` prop (default 32px)
 *   - Dark-mode aware: stroke/fill colors adapt to current theme
 *   - Extensible: add new icons by appending to EQUIPMENT_ICONS with an SVG component
 *
 * USAGE:
 *   import { EQUIPMENT_ICONS } from './EquipmentIcons';
 *   const PumpIcon = EQUIPMENT_ICONS.find(i => i.id === 'pump').component;
 *   <PumpIcon size={48} />
 *
 * @param {number} size — Icon dimensions in pixels (applied to both width and height)
 */
import React from 'react';

// ── SVG Icon Components ──
// Each returns an SVG element sized to the given `size` prop

const iconStyle = (size) => ({ width: size, height: size, display: 'block' });

// Translation key map for categories — use with t(CATEGORY_LABEL_KEYS[cat], cat) in consuming components
export const CATEGORY_LABEL_KEYS = {
    'Production': 'equipmentCategory.production',
    'HVAC': 'equipmentCategory.hvac',
    'Electrical': 'equipmentCategory.electrical',
    'Safety': 'equipmentCategory.safety',
    'Plumbing': 'equipmentCategory.plumbing',
    'Material Handling': 'equipmentCategory.materialHandling',
    'Instrumentation': 'equipmentCategory.instrumentation',
};

export const EQUIPMENT_ICONS = [
    // ── Production Equipment ──
    {
        id: 'pump', label: 'Pump', labelKey: 'equipmentIcon.pump', category: 'Production',
        icon: ({ size = 32, color = '#06b6d4' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <circle cx="32" cy="32" r="22" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <circle cx="32" cy="32" r="10" fill={color} opacity="0.3"/>
                <path d="M20 32 L12 32 M44 32 L52 32 M32 20 L32 12" stroke={color} strokeWidth="3" strokeLinecap="round"/>
                <path d="M26 26 L38 38 M38 26 L26 38" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
            </svg>
        )
    },
    {
        id: 'motor', label: 'Motor', labelKey: 'equipmentIcon.motor', category: 'Production',
        icon: ({ size = 32, color = '#8b5cf6' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="14" y="20" width="36" height="24" rx="4" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <circle cx="32" cy="32" r="8" fill={color} opacity="0.3"/>
                <line x1="50" y1="32" x2="58" y2="32" stroke={color} strokeWidth="3" strokeLinecap="round"/>
                <rect x="8" y="26" width="6" height="12" rx="2" fill={color} opacity="0.4"/>
                <path d="M28 32 L36 28 L36 36 Z" fill={color} opacity="0.7"/>
            </svg>
        )
    },
    {
        id: 'conveyor', label: 'Conveyor', labelKey: 'equipmentIcon.conveyor', category: 'Production',
        icon: ({ size = 32, color = '#f59e0b' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="8" y="24" width="48" height="16" rx="8" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <circle cx="16" cy="32" r="5" fill={color} opacity="0.5"/>
                <circle cx="48" cy="32" r="5" fill={color} opacity="0.5"/>
                <line x1="21" y1="32" x2="43" y2="32" stroke={color} strokeWidth="1.5" strokeDasharray="4 3"/>
                <path d="M38 29 L43 32 L38 35" fill={color} opacity="0.6"/>
            </svg>
        )
    },
    {
        id: 'tank', label: 'Tank', labelKey: 'equipmentIcon.tank', category: 'Production',
        icon: ({ size = 32, color = '#3b82f6' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="18" y="12" width="28" height="40" rx="6" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <ellipse cx="32" cy="14" rx="14" ry="5" fill={`${color}33`} stroke={color} strokeWidth="2"/>
                <line x1="18" y1="30" x2="46" y2="30" stroke={color} strokeWidth="1" opacity="0.4"/>
                <line x1="18" y1="38" x2="46" y2="38" stroke={color} strokeWidth="1" opacity="0.3"/>
                <rect x="28" y="48" width="8" height="8" rx="1" fill={color} opacity="0.3"/>
            </svg>
        )
    },
    {
        id: 'valve', label: 'Valve', labelKey: 'equipmentIcon.valve', category: 'Production',
        icon: ({ size = 32, color = '#10b981' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <path d="M16 24 L32 32 L16 40 Z" fill={`${color}33`} stroke={color} strokeWidth="2"/>
                <path d="M48 24 L32 32 L48 40 Z" fill={`${color}33`} stroke={color} strokeWidth="2"/>
                <line x1="32" y1="32" x2="32" y2="14" stroke={color} strokeWidth="3" strokeLinecap="round"/>
                <rect x="26" y="10" width="12" height="6" rx="2" fill={color} opacity="0.4"/>
            </svg>
        )
    },
    {
        id: 'compressor', label: 'Compressor', labelKey: 'equipmentIcon.compressor', category: 'Production',
        icon: ({ size = 32, color = '#ec4899' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="12" y="18" width="40" height="28" rx="6" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <circle cx="28" cy="32" r="9" fill={color} opacity="0.2" stroke={color} strokeWidth="1.5"/>
                <path d="M24 28 L28 32 L24 36" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
                <rect x="42" y="24" width="6" height="16" rx="2" fill={color} opacity="0.4"/>
                <line x1="45" y1="18" x2="45" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round"/>
            </svg>
        )
    },
    {
        id: 'mixer', label: 'Mixer', labelKey: 'equipmentIcon.mixer', category: 'Production',
        icon: ({ size = 32, color = '#f97316' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="16" y="20" width="32" height="32" rx="4" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <line x1="32" y1="20" x2="32" y2="10" stroke={color} strokeWidth="3" strokeLinecap="round"/>
                <rect x="26" y="6" width="12" height="6" rx="2" fill={color} opacity="0.4"/>
                <path d="M26 30 L32 36 L38 30 M26 40 L32 46 L38 40" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
        )
    },
    {
        id: 'heat_exchanger', label: 'Heat Exchanger', labelKey: 'equipmentIcon.heatExchanger', category: 'Production',
        icon: ({ size = 32, color = '#ef4444' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <circle cx="32" cy="32" r="20" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <path d="M20 28 L44 28 M20 32 L44 32 M20 36 L44 36" stroke={color} strokeWidth="2" strokeLinecap="round"/>
                <path d="M14 32 L8 32 M50 32 L56 32" stroke={color} strokeWidth="3" strokeLinecap="round"/>
            </svg>
        )
    },
    // ── HVAC & Utility ──
    {
        id: 'ahu', label: 'AHU', labelKey: 'equipmentIcon.ahu', category: 'HVAC',
        icon: ({ size = 32, color = '#06b6d4' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="10" y="16" width="44" height="32" rx="4" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <circle cx="28" cy="32" r="10" fill="none" stroke={color} strokeWidth="1.5"/>
                <path d="M22 32 C22 26 34 26 34 32 C34 38 22 38 22 32" fill={color} opacity="0.3"/>
                <rect x="42" y="22" width="8" height="20" rx="2" fill={color} opacity="0.2"/>
                <line x1="46" y1="26" x2="46" y2="38" stroke={color} strokeWidth="1" strokeDasharray="3 2"/>
            </svg>
        )
    },
    {
        id: 'chiller', label: 'Chiller', labelKey: 'equipmentIcon.chiller', category: 'HVAC',
        icon: ({ size = 32, color = '#38bdf8' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="10" y="16" width="44" height="32" rx="6" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <path d="M24 24 L24 40 M32 22 L32 42 M40 24 L40 40" stroke={color} strokeWidth="2" strokeLinecap="round"/>
                <path d="M20 32 L44 32" stroke={color} strokeWidth="1" opacity="0.4"/>
                <circle cx="24" cy="24" r="2" fill={color} opacity="0.6"/>
                <circle cx="40" cy="40" r="2" fill={color} opacity="0.6"/>
            </svg>
        )
    },
    {
        id: 'boiler', label: 'Boiler', labelKey: 'equipmentIcon.boiler', category: 'HVAC',
        icon: ({ size = 32, color = '#ef4444' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="16" y="14" width="32" height="38" rx="6" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <path d="M24 20 C24 16 28 14 28 18 C28 22 32 20 32 16 C32 20 36 18 36 22 C36 26 40 24 40 20" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round"/>
                <circle cx="32" cy="36" r="8" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
                <line x1="28" y1="36" x2="36" y2="36" stroke={color} strokeWidth="1.5"/>
            </svg>
        )
    },
    // ── Electrical ──
    {
        id: 'panel', label: 'Elec Panel', labelKey: 'equipmentIcon.elecPanel', category: 'Electrical',
        icon: ({ size = 32, color = '#f59e0b' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="14" y="10" width="36" height="44" rx="3" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <rect x="20" y="16" width="10" height="8" rx="1" fill={color} opacity="0.3"/>
                <rect x="34" y="16" width="10" height="8" rx="1" fill={color} opacity="0.3"/>
                <rect x="20" y="28" width="10" height="8" rx="1" fill={color} opacity="0.2"/>
                <rect x="34" y="28" width="10" height="8" rx="1" fill={color} opacity="0.2"/>
                <rect x="20" y="40" width="10" height="8" rx="1" fill={color} opacity="0.15"/>
                <rect x="34" y="40" width="10" height="8" rx="1" fill={color} opacity="0.15"/>
                <path d="M30 8 L30 4 L34 4 L34 8" stroke={color} strokeWidth="2"/>
            </svg>
        )
    },
    {
        id: 'transformer', label: 'Transformer', labelKey: 'equipmentIcon.transformer', category: 'Electrical',
        icon: ({ size = 32, color = '#a78bfa' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <circle cx="24" cy="32" r="14" fill="none" stroke={color} strokeWidth="2.5"/>
                <circle cx="40" cy="32" r="14" fill="none" stroke={color} strokeWidth="2.5"/>
                <circle cx="24" cy="32" r="14" fill={`${color}15`}/>
                <circle cx="40" cy="32" r="14" fill={`${color}15`}/>
                <line x1="8" y1="32" x2="10" y2="32" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="54" y1="32" x2="56" y2="32" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
        )
    },
    {
        id: 'generator', label: 'Generator', labelKey: 'equipmentIcon.generator', category: 'Electrical',
        icon: ({ size = 32, color = '#22c55e' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="10" y="18" width="44" height="28" rx="6" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <text x="32" y="37" textAnchor="middle" fill={color} fontSize="18" fontWeight="700" fontFamily="monospace">G</text>
                <path d="M10 28 L6 28 M10 36 L6 36 M54 32 L58 32" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
        )
    },
    // ── Safety Equipment ──
    {
        id: 'fire_extinguisher', label: 'Fire Extinguisher', labelKey: 'equipmentIcon.fireExtinguisher', category: 'Safety',
        icon: ({ size = 32, color = '#ef4444' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="22" y="18" width="20" height="36" rx="4" fill={`${color}33`} stroke={color} strokeWidth="2.5"/>
                <rect x="26" y="16" width="12" height="6" rx="2" fill={color} opacity="0.5"/>
                <path d="M32 16 L32 8 L38 6" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
                <rect x="26" y="30" width="12" height="3" rx="1" fill={color} opacity="0.6"/>
            </svg>
        )
    },
    {
        id: 'eye_wash', label: 'Eye Wash', labelKey: 'equipmentIcon.eyeWash', category: 'Safety',
        icon: ({ size = 32, color = '#06b6d4' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <path d="M12 32 C12 32 22 18 32 18 C42 18 52 32 52 32 C52 32 42 46 32 46 C22 46 12 32 12 32Z" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <circle cx="32" cy="32" r="8" fill={color} opacity="0.3" stroke={color} strokeWidth="1.5"/>
                <circle cx="32" cy="32" r="3" fill={color} opacity="0.6"/>
                <path d="M24 50 L24 56 M32 52 L32 58 M40 50 L40 56" stroke={color} strokeWidth="2" strokeLinecap="round"/>
            </svg>
        )
    },
    {
        id: 'first_aid', label: 'First Aid', labelKey: 'equipmentIcon.firstAid', category: 'Safety',
        icon: ({ size = 32, color = '#22c55e' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="12" y="16" width="40" height="32" rx="6" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <rect x="28" y="22" width="8" height="20" rx="2" fill={color} opacity="0.5"/>
                <rect x="22" y="28" width="20" height="8" rx="2" fill={color} opacity="0.5"/>
            </svg>
        )
    },
    // ── Plumbing / Process ──
    {
        id: 'pipe_junction', label: 'Pipe Junction', labelKey: 'equipmentIcon.pipeJunction', category: 'Plumbing',
        icon: ({ size = 32, color = '#64748b' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <line x1="8" y1="32" x2="56" y2="32" stroke={color} strokeWidth="4" strokeLinecap="round"/>
                <line x1="32" y1="8" x2="32" y2="56" stroke={color} strokeWidth="4" strokeLinecap="round"/>
                <circle cx="32" cy="32" r="6" fill={`${color}33`} stroke={color} strokeWidth="2"/>
            </svg>
        )
    },
    {
        id: 'filter', label: 'Filter', labelKey: 'equipmentIcon.filter', category: 'Plumbing',
        icon: ({ size = 32, color = '#818cf8' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <path d="M14 14 L50 14 L36 38 L36 52 L28 52 L28 38 Z" fill={`${color}22`} stroke={color} strokeWidth="2.5" strokeLinejoin="round"/>
                <line x1="20" y1="22" x2="44" y2="22" stroke={color} strokeWidth="1.5" opacity="0.5"/>
                <line x1="24" y1="28" x2="40" y2="28" stroke={color} strokeWidth="1.5" opacity="0.4"/>
            </svg>
        )
    },
    // ── General / Misc ──
    {
        id: 'forklift', label: 'Forklift', labelKey: 'equipmentIcon.forklift', category: 'Material Handling',
        icon: ({ size = 32, color = '#f59e0b' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="20" y="20" width="24" height="24" rx="4" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <rect x="12" y="16" width="6" height="32" rx="1" fill={color} opacity="0.4"/>
                <line x1="15" y1="16" x2="15" y2="10" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="26" cy="48" r="4" fill={color} opacity="0.5"/>
                <circle cx="38" cy="48" r="4" fill={color} opacity="0.5"/>
            </svg>
        )
    },
    {
        id: 'dock_door', label: 'Dock Door', labelKey: 'equipmentIcon.dockDoor', category: 'Material Handling',
        icon: ({ size = 32, color = '#94a3b8' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="10" y="10" width="44" height="44" rx="4" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <line x1="10" y1="18" x2="54" y2="18" stroke={color} strokeWidth="1.5"/>
                <line x1="10" y1="26" x2="54" y2="26" stroke={color} strokeWidth="1.5" opacity="0.7"/>
                <line x1="10" y1="34" x2="54" y2="34" stroke={color} strokeWidth="1.5" opacity="0.5"/>
                <line x1="10" y1="42" x2="54" y2="42" stroke={color} strokeWidth="1.5" opacity="0.3"/>
                <path d="M28 48 L32 54 L36 48" stroke={color} strokeWidth="2" fill="none"/>
            </svg>
        )
    },
    {
        id: 'scale', label: 'Scale', labelKey: 'equipmentIcon.scale', category: 'Production',
        icon: ({ size = 32, color = '#10b981' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="12" y="38" width="40" height="8" rx="2" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <line x1="32" y1="38" x2="32" y2="16" stroke={color} strokeWidth="2.5"/>
                <path d="M18 24 L32 16 L46 24" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <path d="M14 24 C14 24 16 28 22 28 L18 24 Z" fill={color} opacity="0.3"/>
                <path d="M50 24 C50 24 48 28 42 28 L46 24 Z" fill={color} opacity="0.3"/>
            </svg>
        )
    },
    {
        id: 'sensor', label: 'Sensor', labelKey: 'equipmentIcon.sensor', category: 'Instrumentation',
        icon: ({ size = 32, color = '#a78bfa' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <circle cx="32" cy="32" r="12" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <circle cx="32" cy="32" r="4" fill={color} opacity="0.6"/>
                <path d="M20 20 C16 16 12 20 16 24" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round"/>
                <path d="M44 20 C48 16 52 20 48 24" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round"/>
                <path d="M14 14 C8 8 4 14 10 20" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.5"/>
                <path d="M50 14 C56 8 60 14 54 20" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.5"/>
            </svg>
        )
    },
    {
        id: 'camera', label: 'Camera', labelKey: 'equipmentIcon.camera', category: 'Safety',
        icon: ({ size = 32, color = '#64748b' }) => (
            <svg viewBox="0 0 64 64" style={iconStyle(size)}>
                <rect x="14" y="22" width="36" height="24" rx="4" fill={`${color}22`} stroke={color} strokeWidth="2.5"/>
                <circle cx="32" cy="34" r="8" fill="none" stroke={color} strokeWidth="2"/>
                <circle cx="32" cy="34" r="3" fill={color} opacity="0.5"/>
                <rect x="22" y="18" width="10" height="6" rx="2" fill={color} opacity="0.3"/>
                <circle cx="44" cy="26" r="2" fill={color} opacity="0.6"/>
            </svg>
        )
    },
];

// Group icons by category
export const getIconCategories = () => {
    const cats = {};
    EQUIPMENT_ICONS.forEach(icon => {
        if (!cats[icon.category]) cats[icon.category] = [];
        cats[icon.category].push(icon);
    });
    return cats;
};

// Find icon by ID
export const getEquipmentIcon = (id) => EQUIPMENT_ICONS.find(i => i.id === id);
