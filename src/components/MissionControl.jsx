// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying or distribution is prohibited.
 */
/**
 * Trier OS — Mission Control
 * ===========================
 * Role-contextual home command center. The first screen users see after login.
 * Renders a personalized grid of navigation
 * tiles filtered by the user's active role (persona). A Technician sees only their
 * work tools; a Plant Manager sees operations, analytics, and people tiles.
 *
 * -- HOW TILE ROUTING WORKS -------------------------------------------------------
 * Each tile in ALL_TILES has either a `workspace` key (maps to a tab/route string)
 * or a `route` key (absolute URL path). On click, onOpenWorkspace() is called with
 * the workspace string, which triggers setActiveTab() in App.jsx to navigate to the
 * correct module -- no React Router Link components needed at this level.
 *
 * -- TILE GROUPS ------------------------------------------------------------------
 * TILE_GROUPS lets multiple tiles collapse into a single expandable group card.
 * For example, the IT suite (it-department, it-metrics, it-global-search, it-alerts)
 * appears as one 'IT Department' group with sub-tiles that expand on click.
 * This keeps the grid clean for roles with access to many modules.
 *
 * -- ROLE_TILES MAP ---------------------------------------------------------------
 * ROLE_TILES maps each user role to an ordered array of tile IDs they can see.
 * Order matters -- tiles render in sequence. New modules must be added to ALL_TILES
 * first, then to the relevant ROLE_TILES entries. 'creator' sees every tile.
 *
 * -- HOVER BACK-GLOW EFFECT -------------------------------------------------------
 * Each tile has a unique accent color from ALL_TILES. On hover, a box-shadow is
 * generated using that tile's specific hex color (not a generic shared shadow),
 * creating a visually distinct colored back-glow per module. This is applied via
 * inline style injection on the onMouseEnter event handler.
 *
 * -- PERSONA_META -----------------------------------------------------------------
 * Maps each role key to an emoji, label, and tooltip tip shown in the MCHeroBlock
 * header. Reinforces which role the user is currently operating under.
 *
 * @param {string}   activeRole        The user's current effective role key
 * @param {function} onOpenWorkspace   Navigates to a module (sets active tab in App)
 * @param {string}   username          Displayed in the hero header
 * @param {string}   selectedPlant     Current plant name for context display
 * @param {boolean}  showDashboard     Whether the dashboard tile is unlocked
 * @param {boolean}  isCreator         Unlocks Creator Console and all tiles
 * @param {string}   viewAsRole        Optional role override for impersonation mode
 * @param {function} setViewAsRole     Setter for the impersonation role
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Factory, Wrench, Cog, Truck, Package, ShieldCheck, Lock, MessageSquare, BarChart3, Activity, ChevronRight, Scan, FlaskConical, Users, Monitor, Download, BookOpen, HardHat, Star, ShieldAlert, Lightbulb, Globe, Hammer, LockKeyhole, Server, Crown, Map, MapPin, Zap, Droplets, GraduationCap, Warehouse, ClipboardList, AlertTriangle, Clock, CheckCircle, RotateCcw, XCircle, RefreshCw } from 'lucide-react';
import RoleSwitcher from './RoleSwitcher';
import RoleAvatar from './RoleAvatar';
import PlantNetworkStatus from './PlantNetworkStatus';
import { useTranslation } from '../i18n/index.jsx';

const PERSONA_META = {
    technician:  { emoji: '🔧', label: 'Maintenance Technician', tip: 'I fix and maintain equipment' },
    mechanic:    { emoji: '🔨', label: 'Mechanic', tip: 'I repair and rebuild machinery' },
    engineer:    { emoji: '🏗️', label: 'Engineer', tip: 'I design and optimize systems' },
    lab_tech:    { emoji: '🧪', label: 'Lab Technician', tip: 'I test, sample, and verify quality' },
    manager:     { emoji: '🏭', label: 'Plant Manager', tip: 'I run this facility' },
    plant_manager: { emoji: '🏭', label: 'Plant Manager', tip: 'I run this facility' },
    maintenance_manager: { emoji: '📋', label: 'Maintenance Manager', tip: 'I oversee the maintenance dept' },
    operator:    { emoji: '⚙️', label: 'Machine Operator', tip: 'I track production & log issues' },
    corporate:   { emoji: '🏢', label: 'Corporate Executive', tip: 'I oversee the enterprise' },
    executive:   { emoji: '👔', label: 'Corporate Executive', tip: 'I oversee the enterprise' },
    it_admin:    { emoji: '💻', label: 'IT Administrator', tip: 'I manage the platform' },
    creator:     { emoji: '🔑', label: 'System Creator', tip: 'Full domain access' },
    employee:    { emoji: '👤', label: 'Employee', tip: 'Basic facility access' },
};

const ALL_TILES = {
    'plant-overview':   { icon: Activity,      accent: '#10b981', title: 'Plant Overview',       desc: 'Today\'s KPIs, recent work orders, shift summary, urgent items, and staffing.',         pills: ['Dashboard', 'Calendar', 'Shifts'],     workspace: 'dashboard' },
    'my-work-orders':   { icon: Wrench,        accent: '#f59e0b', title: 'My Work Orders',       desc: 'Your assigned work orders, priorities, due dates, and completion tracking.',             pills: ['Open', 'Overdue', 'Completed'],         workspace: 'jobs' },
    'maintenance':      { icon: Wrench,        accent: '#f59e0b', title: 'Maintenance',           desc: 'Work orders, preventive maintenance, scheduling, history, and shift handoff.',           pills: ['Jobs', 'PMs', 'Schedule', 'History'],   workspace: 'jobs' },
    'engineering':      { icon: Cog,           accent: '#3b82f6', title: 'Engineering',            desc: 'Asset registry, bill of materials, operating procedures, reliability, and energy.',      pills: ['Assets', 'BOMs', 'SOPs', 'Energy'],     workspace: 'assets' },
    'supply-chain':     { icon: Package,       accent: '#8b5cf6', title: 'Supply Chain',           desc: 'Ingredients, packaging, chemicals & consumables — POs, receiving, vendor management.',  pills: ['Inventory', 'Purchase Orders', 'Receiving', 'Suppliers'], route: '/supply-chain' },
    'parts-needed':     { icon: Package,       accent: '#8b5cf6', title: 'Parts I Need',           desc: 'Parts required for your open work orders, stock status, and substitute availability.',   pills: ['Required', 'In Stock', 'Substitutes'],  workspace: 'parts' },
    'assets-boms':      { icon: Cog,           accent: '#3b82f6', title: 'Assets & BOMs',          desc: 'Equipment registry, health scores, bill of materials, and downtime tracking.',           pills: ['Assets', 'Health', 'BOMs'],             workspace: 'assets' },
    'sops':             { icon: BookOpen,       accent: '#06b6d4', title: 'SOPs & Procedures',      desc: 'Standard operating procedures linked to your equipment and work assignments.',           pills: ['Procedures', 'Steps', 'Safety'],        workspace: 'procedures' },
    'scanner':          { icon: Scan,          accent: '#10b981', title: 'Smart Scanner',          desc: 'QR/barcode scan for instant asset lookup, part identification, and work order creation.',pills: ['QR', 'Barcode', 'Lookup'],              workspace: 'scanner' },
    'comms':            { icon: MessageSquare,  accent: '#6366f1', title: 'Communications',         desc: 'Knowledge Exchange, shift handoff notes, plant directory, and notifications.',           pills: ['Chat', 'Directory', 'Shifts'],          workspace: 'chat' },
    'plant-metrics':    { icon: Factory,       accent: '#10b981', title: 'Plant Metrics',          desc: 'Overall efficiency, OEE rankings, plant comparisons, and operational trends.',           pills: ['Rankings', 'OEE', 'Efficiency'],        workspace: 'dashboard' },
    'asset-metrics':    { icon: Cog,           accent: '#3b82f6', title: 'Asset Metrics',          desc: 'Fleet health, MTBF ratings, reliability scores, downtime cost, and triage index.',       pills: ['Health', 'MTBF', 'Downtime'],           workspace: 'assets' },
    'logistics-fleet':  { icon: Truck,         accent: '#ea580c', title: 'Logistics & Fleet',      desc: 'Transportation, vehicles, DVIRs, fuel tracking, CDL management, and DOT inspections.',   pills: ['Transfers', 'Vehicles', 'DVIR', 'Fuel'], workspace: 'fleet' },
    'compliance':       { icon: ShieldCheck,   accent: '#06b6d4', title: 'Compliance',             desc: 'SOP adherence, audit scores, training certifications, and regulatory gaps.',             pills: ['SOPs', 'Audits', 'Training'],           workspace: 'compliance' },
    'governance':       { icon: Lock,          accent: '#ef4444', title: 'Governance',             desc: 'Audit trail, user activity, security events, role compliance, and RBAC enforcement.',    pills: ['Audit', 'Users', 'Security'],           workspace: 'governance' },
    'analytics':        { icon: BarChart3,     accent: '#ec4899', title: 'Reports & Analytics',    desc: 'Report builder, budget forecasting, labor efficiency, and trend analysis.',              pills: ['Reports', 'Budget', 'Trends'],          workspace: 'analytics' },
    'admin-console':    { icon: Monitor,       accent: '#ef4444', title: 'Admin Console',          desc: 'Database management, user accounts, integrations, branding, and system configuration.',  pills: ['Database', 'Users', 'Config'],          workspace: 'admin-console' },
    'import-wizard':    { icon: Download,      accent: '#06b6d4', title: 'Import & API Hub',       desc: 'Data import, REST API keys, BI/Power BI feeds, webhooks, and integration management.',   pills: ['Import', 'API Keys', 'Power BI'],       workspace: 'import-api' },
    'directory':        { icon: Users,         accent: '#a855f7', title: 'Directory',              desc: 'Enterprise-wide site contacts, organizational structure, and personnel.',                pills: ['Contacts', 'Sites', 'Staff'],           workspace: 'directory' },
    'floor-plans':      { icon: MapPin,        accent: '#06b6d4', title: 'Floor Plans',              desc: 'Interactive facility floor plans with equipment placement, zones, and LiDAR 3D scanning.',  pills: ['Plans', 'Zones', '3D Scan'],            workspace: 'floor-plans' },
    'maps':             { icon: Map,           accent: '#22c55e', title: 'Maps',                     desc: 'Facility maps, site layouts, campus navigation, and geographic plant views.',               pills: ['Site Map', 'Campus', 'GPS'],            workspace: 'maps' },
    'safety':           { icon: ShieldAlert,   accent: '#ef4444', title: 'Safety & Compliance',     desc: 'Hot work permits, confined space, safety incidents, calibration management, and OSHA tracking.', pills: ['Permits', 'Incidents', 'Calibration'],  workspace: 'safety' },
    'engineering-tools': { icon: Lightbulb,    accent: '#3b82f6', title: 'Engineering Tools',       desc: 'RCA, FMEA, repair vs replace, engineering change notices, capital projects, lube routes, oil analysis.', pills: ['RCA', 'FMEA', 'ECN', 'Lube', 'Oil'], workspace: 'engineering-tools' },
    'vendor-portal':    { icon: Globe,         accent: '#a855f7', title: 'Vendor Portal',           desc: 'Vendor access tokens, RFQ workflow, vendor messaging, and procurement collaboration.',    pills: ['Access', 'RFQ', 'Messages'],            workspace: 'vendor-portal' },
    'tool-crib':        { icon: Hammer,        accent: '#f59e0b', title: 'Tool Crib',               desc: 'Tool inventory, checkout and return, overdue tracking, condition reports, and asset value.',pills: ['Inventory', 'Checkout', 'Overdue'],     workspace: 'tools' },
    'contractors':      { icon: HardHat,       accent: '#06b6d4', title: 'Contractor Management',   desc: 'Contractor profiles, certifications, insurance tracking, job history, ratings, and spend.', pills: ['Profile', 'Certs', 'Jobs', 'Spend'],   workspace: 'contractors' },
    'loto':             { icon: LockKeyhole,   accent: '#dc2626', title: 'LOTO / Lockout-Tagout',   desc: 'Digital lockout-tagout permits, isolation points, energy source verification, and audit trail.', pills: ['Permits', 'Isolations', 'Audit'],  workspace: 'loto' },
    'it-department':    { icon: Server,        accent: '#6366f1', title: 'IT Department',           desc: 'Software licenses, hardware inventory, network infrastructure, and mobile device management.', pills: ['Software', 'Hardware', 'Network', 'Mobile'], workspace: 'it-department' },
    'it-metrics':       { icon: BarChart3,     accent: '#6366f1', title: 'IT Metrics',              desc: 'Financial intelligence: spending, depreciation, license utilization, hardware lifecycle, infrastructure health, and asset location map.', pills: ['Spend', 'Depreciation', 'Licenses', 'Lifecycle'], workspace: 'it-metrics' },
    'it-global-search': { icon: Globe,         accent: '#06b6d4', title: 'IT Global Search',        desc: 'Enterprise-wide IT asset search. Find any equipment across all plants by name, serial, tag, IP, or IMEI.', pills: ['Search', 'Cross-Plant', 'Locate'], workspace: 'it-global-search' },
    'it-alerts':        { icon: ShieldAlert,   accent: '#ef4444', title: 'IT Alerts',               desc: 'License expiry, warranty, offline infrastructure, MDM compliance, in-transit delays, and depreciation milestones.', pills: ['Expiry', 'Warranty', 'MDM', 'Transit'], workspace: 'it-alerts' },
    'corp-analytics':   { icon: Crown,         accent: '#f59e0b', title: 'Corporate Analytics',     desc: 'Executive intelligence: enterprise KPIs, plant rankings, financial rollup, risk matrix, operational forecasting, and workforce analytics.', pills: ['KPIs', 'Rankings', 'Risk', 'Forecast'], workspace: 'corp-analytics' },
    'utilities':       { icon: Zap,           accent: '#3b82f6', title: 'Utility Intelligence',    desc: 'Monitor Water, Electricity, and Gas consumption, supplier metrics, and business-case cost analysis.', pills: ['Water', 'Electric', 'Gas'], workspace: 'utilities' },
    'underwriter':     { icon: ShieldCheck,   accent: '#7c3aed', title: 'Underwriter Portal',      desc: 'Insurance risk score (0-100), safety incident log, calibration status, LOTO audit trail, training certifications, and Evidence Packet print.', pills: ['Risk Score', 'Incidents', 'LOTO', 'Certs', 'Print'], workspace: 'underwriter' },
    'quality-log':     { icon: Droplets,      accent: '#ef4444', title: 'Quality & Loss Log',      desc: 'Log product drains, spills, and startup losses to the floor. Submit cryo freezing point tests, bacteria counts (SPC, Coliform, SCC), and drug residue results. Track COPQ in real time.', pills: ['Product Loss', 'Cryo Test', 'Bacteria', 'COPQ'], workspace: 'quality-log' },
    'storeroom':       { icon: Warehouse,      accent: '#f59e0b', title: 'Storeroom Intelligence', desc: 'ABC classification, dead stock alerts, slow-moving parts, carrying cost analysis, and total capital tied up in inventory.', pills: ['ABC', 'Dead Stock', 'Carrying Cost'], route: '/storeroom' },
    'training':        { icon: GraduationCap,  accent: '#10b981', title: 'Training & Certifications', desc: 'Track employee training completions, certification expiry alerts, compliance scorecard, and the full skills matrix across the workforce.', pills: ['Records', 'Expiring', 'Compliance', 'Matrix'], route: '/training' },
    'work-request-portal': { icon: ClipboardList, accent: '#10b981', title: 'Work Request Portal', desc: 'Submit a maintenance or repair request on behalf of an operator. No scanner needed — fill it out directly from any device.', pills: ['Submit', 'Status Check', 'No Login Needed'], workspace: 'work-request-portal' },
    'plant-setup':         { icon: Factory,       accent: '#0ea5e9', title: 'Plant Setup',          desc: 'Configure production model, units, SKUs, shifts, scheduling calendar, network settings, and facility parameters for this plant.', pills: ['Production', 'SKUs', 'Shifts', 'Network'], route: '/plant-setup' },
    'plant-onboarding':    { icon: Globe,         accent: '#6366f1', title: 'Enterprise Onboarding', desc: 'Provision a new facility using corporate master data — vendors, assets, SOPs, and parts pulled from the enterprise catalog.', pills: ['Vendors', 'Assets', 'SOPs', 'Parts'], route: '/plant-onboarding' },
};

const ROLE_TILES = {
    // Row 1: Safety | Quality | Operations (group) | SOPs
    // Row 2: Asset Metrics | Logistics & Fleet | Supply Chain (group) | Floor Plans & Maps (group)
    // Row 3: IT (group) | People & Comms (group) | Reports & Analytics | Plant Metrics
    // Last:  Corporate Analytics
    // Technicians: focused on their work queue, parts they need, safety, SOPs
    technician: ['scanner', 'my-work-orders', 'parts-needed', 'assets-boms', 'quality-log', 'sops', 'tool-crib', 'loto', 'floor-plans', 'maps', 'utilities', 'work-request-portal'],
    operator:   ['quality-log', 'sops', 'floor-plans', 'maps', 'work-request-portal'],
    // Mechanics: same but with fleet/logistics and full asset access
    mechanic:   ['scanner', 'my-work-orders', 'assets-boms', 'parts-needed', 'storeroom', 'logistics-fleet', 'tool-crib', 'loto', 'sops', 'floor-plans', 'maps', 'utilities', 'work-request-portal'],
    // Engineers: assets, BOMs, engineering tools, supply chain visibility
    engineer:   ['engineering-tools', 'parts-needed', 'storeroom', 'utilities', 'sops', 'supply-chain', 'comms', 'floor-plans', 'maps', 'work-request-portal'],
    lab_tech:   ['quality-log', 'sops', 'safety', 'compliance', 'comms', 'floor-plans', 'maps', 'utilities'],
    manager:    ['safety', 'loto', 'compliance', 'quality-log', 'maintenance', 'engineering-tools', 'parts-needed', 'storeroom', 'utilities', 'underwriter', 'sops',
                 'asset-metrics', 'logistics-fleet', 'supply-chain', 'vendor-portal', 'tool-crib', 'floor-plans', 'maps', 'plant-setup', 'plant-onboarding',
                 'comms', 'directory', 'contractors', 'analytics', 'plant-metrics', 'scanner', 'work-request-portal'],
    plant_manager: ['safety', 'loto', 'compliance', 'quality-log', 'maintenance', 'engineering-tools', 'parts-needed', 'storeroom', 'utilities', 'underwriter', 'sops',
                 'asset-metrics', 'logistics-fleet', 'supply-chain', 'vendor-portal', 'tool-crib', 'floor-plans', 'maps', 'plant-setup', 'plant-onboarding',
                 'comms', 'directory', 'contractors', 'analytics', 'plant-metrics', 'scanner', 'work-request-portal'],
    maintenance_manager: ['scanner', 'maintenance', 'my-work-orders', 'parts-needed', 'storeroom', 'asset-metrics', 'tool-crib', 'contractors', 'analytics', 'sops', 'loto', 'safety', 'floor-plans', 'maps', 'work-request-portal'],
    corporate:  ['safety', 'loto', 'compliance', 'quality-log', 'maintenance', 'engineering-tools', 'storeroom', 'sops',
                 'asset-metrics', 'logistics-fleet', 'supply-chain', 'floor-plans', 'maps',
                 'comms', 'directory', 'contractors', 'analytics', 'plant-metrics', 'utilities', 'underwriter'],
    executive:  ['safety', 'loto', 'compliance', 'quality-log', 'maintenance', 'engineering-tools', 'storeroom', 'sops',
                 'asset-metrics', 'logistics-fleet', 'supply-chain', 'floor-plans', 'maps',
                 'comms', 'directory', 'contractors', 'analytics', 'plant-metrics', 'utilities', 'underwriter'],
    it_admin:   ['safety', 'loto', 'compliance', 'quality-log', 'maintenance', 'engineering-tools', 'parts-needed', 'storeroom', 'utilities', 'underwriter', 'sops',
                 'asset-metrics', 'logistics-fleet', 'supply-chain', 'vendor-portal', 'tool-crib', 'floor-plans', 'maps', 'plant-setup', 'plant-onboarding',
                 'it-department', 'it-metrics', 'it-global-search', 'it-alerts', 'governance', 'admin-console', 'import-wizard',
                 'comms', 'directory', 'contractors', 'analytics', 'plant-metrics'],
    creator:    ['safety', 'loto', 'compliance', 'quality-log', 'maintenance', 'engineering-tools', 'parts-needed', 'storeroom', 'utilities', 'underwriter', 'sops',
                 'asset-metrics', 'logistics-fleet', 'supply-chain', 'vendor-portal', 'tool-crib', 'floor-plans', 'maps', 'plant-setup', 'plant-onboarding',
                 'it-department', 'it-metrics', 'it-global-search', 'it-alerts', 'governance', 'admin-console', 'import-wizard',
                 'comms', 'directory', 'contractors', 'analytics', 'plant-metrics', 'corp-analytics', 'scanner', 'work-request-portal'],
    employee:   ['plant-overview', 'directory', 'comms', 'sops', 'floor-plans', 'maps', 'utilities', 'work-request-portal'],
};

const TILE_GROUPS = {
    // Operations: everything Maintenance, Mechanics, and Engineers touch day-to-day
    'operations': {
        icon: Wrench,
        accent: '#f59e0b',
        title: 'Operations',
        desc: 'Work orders, PMs, assets, parts inventory, storeroom analytics, engineering tools, asset health metrics, and utilities.',
        pills: ['Jobs', 'Assets', 'Parts', 'Storeroom'],
        children: ['maintenance', 'engineering-tools', 'asset-metrics', 'parts-needed', 'storeroom', 'utilities', 'work-request-portal']
    },
    'supply-chain-group': { icon: Package, accent: '#8b5cf6', title: 'Supply Chain', desc: 'Ingredients, packaging, chemicals, consumables — POs, receiving, vendor management, tool crib, and contractor management.', pills: ['Inventory', 'POs', 'Vendors', 'Tools', 'Contractors'], children: ['supply-chain', 'vendor-portal', 'tool-crib', 'contractors'] },
    'safety-group': { icon: ShieldAlert, accent: '#ef4444', title: 'Safety & Risk', desc: 'Hot work permits, confined space, safety incidents, LOTO, compliance, OSHA tracking, and insurance risk scoring.', pills: ['Permits', 'LOTO', 'Compliance', 'Risk Score'], children: ['safety', 'loto', 'compliance', 'underwriter'] },
    'people-comms': { icon: Users, accent: '#6366f1', title: 'People & Comms', desc: 'Knowledge exchange messaging and enterprise directory.', pills: ['Chat', 'Directory'], children: ['comms', 'directory'] },
    'it-group': { icon: Server, accent: '#6366f1', title: 'Information Technology', desc: 'IT asset management, software licensing, system administration, governance, and data integration.', pills: ['Assets', 'Metrics', 'Admin', 'Governance'], children: ['it-department', 'it-metrics', 'it-global-search', 'it-alerts', 'governance', 'admin-console', 'import-wizard'] },
    'plant-setup-group': { icon: Factory, accent: '#0ea5e9', title: 'Facilities & Floor Plans', desc: 'Interactive facility floor plans, equipment placement zones, LiDAR 3D scanning, and site maps.', pills: ['Floor Plans', 'Campus Maps', 'CAD Models'], children: ['floor-plans', 'maps', 'plant-setup', 'plant-onboarding'] },
};

// ── Roles that see the needsReview supervisor queue ───────────────────────────
const REVIEW_QUEUE_ROLES = new Set([
    'manager', 'plant_manager', 'maintenance_manager',
    'corporate', 'executive', 'it_admin', 'creator',
]);

// ── Roles that see the Plant Network status panel ─────────────────────────────
const PLANT_NETWORK_ROLES = new Set([
    'manager', 'plant_manager', 'it_admin', 'creator',
]);

// ── reviewReason display labels ───────────────────────────────────────────────
const REVIEW_REASON_LABELS = {
    AUTO_TIMEOUT:      'Auto-timeout: no activity',
    OFFLINE_CONFLICT:  'Offline conflict — Auto-Joined',
    MANUAL_FLAG:       'Manually flagged',
    SHIFT_END:         'Shift ended unresolved',
};

// ── Fetch and expose the needsReview queue for the current plant ──────────────
function useNeedsReview(plantId) {
    const [data, setData]       = useState({ flagged: [], overdueScheduled: [], counts: { flagged: 0, overdueScheduled: 0 } });
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');

    const load = useCallback(() => {
        if (!plantId) return;
        setLoading(true);
        fetch('/api/scan/needs-review', { headers: { 'x-plant-id': plantId } })
            .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
            .then(d => { setData(d); setError(''); })
            .catch(e => setError(String(e)))
            .finally(() => setLoading(false));
    }, [plantId]);

    useEffect(() => { load(); }, [load]);

    return { data, loading, error, reload: load };
}

// ── Single review-queue row — one WO with supervisor resolution actions ───────
function ReviewRow({ wo, plantId, userId, onResolved }) {
    const [busy, setBusy]   = useState(false);
    const [err, setErr]     = useState('');

    const act = useCallback(async (deskAction) => {
        setBusy(true);
        setErr('');
        try {
            const res = await fetch('/api/scan/desk-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({ woId: wo.ID, userId, deskAction }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
            onResolved();
        } catch (e) {
            setErr(e.message);
            setBusy(false);
        }
    }, [plantId, userId, wo.ID, onResolved]);

    const reasonLabel = REVIEW_REASON_LABELS[wo.reviewReason] || wo.reviewReason || 'Flagged';

    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 10, padding: '12px 16px', marginBottom: 8,
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14 }}>
                        {wo.WorkOrderNumber} — {wo.Description || wo.AssetName || 'No description'}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                        {reasonLabel}
                        {wo.holdReason && (
                            <span style={{ marginLeft: 10, color: '#64748b' }}>{wo.holdReason.replace(/_/g, ' ')}</span>
                        )}
                    </div>
                    {err && <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 4 }}>{err}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <ActionBtn icon={CheckCircle} label="Close"   color="#22c55e" onClick={() => act('DESK_CLOSE')}   disabled={busy} />
                    <ActionBtn icon={RotateCcw}   label="Resume"  color="#60a5fa" onClick={() => act('DESK_RESUME')}  disabled={busy} />
                    <ActionBtn icon={XCircle}     label="Dismiss" color="#94a3b8" onClick={() => act('DESK_DISMISS')} disabled={busy} />
                </div>
            </div>
        </div>
    );
}

// ── Single overdue scheduled-return row — simpler, fewer actions ──────────────
function OverdueReturnRow({ wo, plantId, userId, onResolved }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState('');

    const act = useCallback(async (deskAction) => {
        setBusy(true);
        setErr('');
        try {
            const res = await fetch('/api/scan/desk-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({ woId: wo.ID, userId, deskAction }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
            onResolved();
        } catch (e) {
            setErr(e.message);
            setBusy(false);
        }
    }, [plantId, userId, wo.ID, onResolved]);

    const overdueSince = wo.returnAt
        ? new Date(wo.returnAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '—';

    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 10, padding: '12px 16px', marginBottom: 8,
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14 }}>
                        {wo.WorkOrderNumber} — {wo.Description || wo.AssetName || 'No description'}
                    </div>
                    <div style={{ color: '#f87171', fontSize: 12, marginTop: 2 }}>
                        Return was due at {overdueSince}
                    </div>
                    {err && <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 4 }}>{err}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <ActionBtn icon={RotateCcw}     label="Resume"  color="#60a5fa" onClick={() => act('DESK_RESUME')}  disabled={busy} />
                    <ActionBtn icon={AlertTriangle} label="Escalate" color="#f59e0b" onClick={() => act('DESK_DISMISS')} disabled={busy} />
                </div>
            </div>
        </div>
    );
}

// ── Compact icon+label button used inside review rows ────────────────────────
function ActionBtn({ icon: Icon, label, color, onClick, disabled }) {
    const [hov, setHov] = useState(false);
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 6, border: 'none',
                background: hov && !disabled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                color: disabled ? '#334155' : color,
                fontSize: 12, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
                transition: 'background 0.15s',
            }}
        >
            <Icon size={13} />
            {label}
        </button>
    );
}

// ── Supervisor review queue — shown at top of Mission Control for managers ────
function NeedsReviewQueue({ plantId, userId }) {
    const { data, loading, error, reload } = useNeedsReview(plantId);
    const [expanded, setExpanded] = useState(true);
    const totalCount = data.counts.flagged + data.counts.overdueScheduled;

    // Don't render the section at all when there's nothing to show
    if (!loading && totalCount === 0 && !error) return null;

    return (
        <div style={{
            maxWidth: 1400, margin: '0 auto 20px', padding: '0 16px',
        }}>
            <div
                onClick={() => setExpanded(x => !x)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: expanded ? 12 : 0,
                    cursor: 'pointer', userSelect: 'none',
                }}
            >
                <AlertTriangle size={16} color="#f59e0b" />
                <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14 }}>
                    Review Queue
                </span>
                {totalCount > 0 && (
                    <span style={{
                        background: '#ef4444', color: '#fff', fontSize: 11,
                        padding: '1px 7px', borderRadius: 8, fontWeight: 700,
                    }}>
                        {totalCount}
                    </span>
                )}
                <button
                    onClick={(e) => { e.stopPropagation(); reload(); }}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 4 }}
                    title="Refresh queue"
                >
                    <RefreshCw size={13} />
                </button>
                <ChevronRight size={16} color="#475569" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
            </div>

            {expanded && (
                <div>
                    {error && (
                        <div style={{ color: '#fca5a5', fontSize: 13, marginBottom: 8 }}>
                            Failed to load review queue: {error}
                        </div>
                    )}
                    {loading && (
                        <div style={{ color: '#475569', fontSize: 13, marginBottom: 8 }}>Loading…</div>
                    )}

                    {/* Overdue scheduled returns — highest urgency, shown first */}
                    {data.overdueScheduled.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ color: '#f87171', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                                <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                Overdue Scheduled Returns ({data.counts.overdueScheduled})
                            </div>
                            {data.overdueScheduled.map(wo => (
                                <OverdueReturnRow key={wo.ID} wo={wo} plantId={plantId} userId={userId} onResolved={reload} />
                            ))}
                        </div>
                    )}

                    {/* Flagged WOs requiring desk review */}
                    {data.flagged.length > 0 && (
                        <div>
                            <div style={{ color: '#f59e0b', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                                <AlertTriangle size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                Flagged Work Orders ({data.counts.flagged})
                            </div>
                            {data.flagged.map(wo => (
                                <ReviewRow key={wo.ID} wo={wo} plantId={plantId} userId={userId} onResolved={reload} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function buildDisplayList(tileKeys) {
    const assigned = new Set(tileKeys);
    const claimed = new Set();
    const display = [];

    const activeGroups = [];
    for (const [gid, g] of Object.entries(TILE_GROUPS)) {
        const visibleKids = g.children.filter(c => assigned.has(c));
        if (visibleKids.length >= 2) {
            activeGroups.push({ gid, children: visibleKids });
            visibleKids.forEach(c => claimed.add(c));
        }
    }

    const groupInserted = new Set();
    for (const key of tileKeys) {
        if (claimed.has(key)) {
            const g = activeGroups.find(ag => ag.children.includes(key));
            if (g && !groupInserted.has(g.gid)) {
                display.push({ type: 'group', key: g.gid, children: g.children });
                groupInserted.add(g.gid);
            }
        } else {
            display.push({ type: 'tile', key });
        }
    }
    return display;
}

function useTileMetrics(plantId) {
    const { t } = useTranslation();
    const [metrics, setMetrics] = useState({});
    const [urgency, setUrgency] = useState({});

    useEffect(() => {
        const headers = { 'x-plant-id': plantId };

        fetch('/api/dashboard', { headers })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                setMetrics({
                    'plant-overview':  `${data.openWorkOrders || 0} ${t('mc.metric.openWOs', 'open WOs')}`,
                    'my-work-orders':  `${data.openWorkOrders || 0} ${t('mc.metric.open', 'open')} · ${data.overdueWorkOrders || 0} ${t('mc.metric.overdue', 'overdue')}`,
                    'maintenance':     `${data.openWorkOrders || 0} ${t('mc.metric.open', 'open')} · ${data.overdueWorkOrders || 0} ${t('mc.metric.overdue', 'overdue')}`,
                    'engineering':     `${data.totalAssets || 0} ${t('mc.metric.assetsTracked', 'assets tracked')}`,
                    'supply-chain':    `${data.totalParts || 0} ${t('mc.metric.partsInInventory', 'parts in inventory')}`,
                    'parts-needed':    `${data.totalParts || 0} ${t('mc.metric.partsAvailable', 'parts available')}`,
                    'assets-boms':     `${data.totalAssets || 0} ${t('mc.metric.assets', 'assets')}`,
                    'plant-metrics':   `${data.plants || 41} ${t('mc.metric.plantsMonitored', 'plants monitored')}`,
                    'asset-metrics':   `${data.totalAssets || 0} ${t('mc.metric.assetsFleetwide', 'assets fleet-wide')}`,
                    'logistics-fleet': `${data.pendingTransfers || 0} ${t('mc.metric.pendingTransfers', 'pending transfers')}`,
                    'compliance':      `${data.totalProcedures || 0} ${t('mc.metric.activeSOPs', 'active SOPs')}`,
                    'governance':      t('mc.metric.auditSecurity', 'Audit & Security'),
                    'analytics':       t('mc.metric.reportsForecasting', 'Reports & Forecasting'),
                    'comms':           t('mc.metric.knowledgeExchange', 'Knowledge Exchange'),
                    'sops':            `${data.totalProcedures || 0} ${t('mc.metric.procedures', 'procedures')}`,
                    'admin-console':   t('mc.metric.sysAdmin', 'System Administration'),
                    'import-wizard':   t('mc.metric.dataImport', 'Data Import Tools'),
                    'directory':       t('mc.metric.enterpriseDirectory', 'Enterprise Directory'),
                    'safety':          t('mc.metric.loadingSafety', 'Loading safety data...'),
                    'engineering-tools': t('mc.metric.loadingEngineering', 'Loading engineering data...'),
                    'vendor-portal':   t('mc.metric.loadingVendor', 'Loading vendor data...'),
                    'tool-crib':       t('mc.metric.loadingTools', 'Loading tool data...'),
                    'contractors':     t('mc.metric.loadingContractors', 'Loading contractor data...'),
                    'scanner':         t('mc.metric.scanToIdentify', 'Scan to Identify'),
                    'floor-plans':     t('mc.metric.facilityPlans', 'Interactive facility plans'),
                    'maps':            t('mc.metric.facilityMaps', 'Facility maps & GPS'),
                    'it-department':   t('mc.metric.itAssetMgmt', 'IT Asset Management'),
                    'it-global-search': t('mc.metric.crossPlantSearch', 'Cross-Plant IT Asset Search'),
                    'it-alerts':       t('mc.metric.itAlerts', 'IT Notifications & Alerts'),
                    'corp-analytics':  t('mc.metric.execIntelligence', 'Executive Intelligence'),
                    'utilities':       t('mc.metric.utilityDashboard', 'Utility intelligence dashboard'),
                    'underwriter':     t('mc.metric.riskEvidence', 'Risk Score · Evidence Packet'),
                    'quality-log':     t('mc.metric.qualityLog', 'Log losses · Cryo · Bacteria'),
                    'storeroom':       t('mc.metric.storeroom', 'ABC · Dead Stock · Carrying Cost'),
                    'training':        t('mc.metric.training', 'Certifications · Compliance · Expiry'),
                });

                const u = {};
                if (data.overdueWorkOrders > 0) {
                    const woTip = t('mc.urgency.overdueWOs', '⚠ {{n}} overdue work order(s)').replace('{{n}}', data.overdueWorkOrders);
                    u['my-work-orders'] = { count: data.overdueWorkOrders, tooltip: woTip };
                    u['maintenance'] = { count: data.overdueWorkOrders, tooltip: woTip };
                }
                setUrgency(u);
            })
            .catch(e => console.warn('[MissionControl] fetch error:', e));
    }, [plantId, t]);

    return { metrics, urgency };
}

function LiveClock() {
    const [now, setNow] = useState(new Date());
    const { lang } = useTranslation();
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const localeMap = { en: 'en-US', es: 'es-MX', fr: 'fr-FR', de: 'de-DE', zh: 'zh-CN', pt: 'pt-BR', ja: 'ja-JP', ko: 'ko-KR', ar: 'ar-SA', hi: 'hi-IN', tr: 'tr-TR' };
    const locale = localeMap[lang] || 'en-US';
    const time = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = now.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    return (
        <div style={{ textAlign: 'center', marginBottom: 2 }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 200, color: '#94a3b8', letterSpacing: '0.06em', fontFamily: 'system-ui, sans-serif' }}>
                {time}
            </div>
            <span style={{ color: '#334155', margin: '0 10px' }}>·</span>
            <span style={{ fontSize: '0.72rem', color: '#475569', letterSpacing: '0.04em' }}>
                {date}
            </span>
        </div>
    );
}

function MCHeroBlock({ isCorporate, persona, currentUser, metrics, userRole, effectiveRole, onOpenWorkspace }) {
    const { t } = useTranslation();
    const greeting = (() => {
        const h = new Date().getHours();
        if (h < 12) return `☀️ ${t('mc.greeting.morning', 'Good morning')}`;
        if (h < 17) return `☁️ ${t('mc.greeting.afternoon', 'Good afternoon')}`;
        return `🌙 ${t('mc.greeting.evening', 'Good evening')}`;
    })();

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none',
            borderRadius: 0,
            border: 'none',
            width: '100%', maxWidth: 1400, margin: '0 auto',
            padding: '2px 16px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <RoleAvatar role={userRole} size={80} glow style={{ margin: 0, zIndex: 10 }} title={`Logged in as ${persona.label} — Click to view Settings & Alerts`} onClick={() => onOpenWorkspace && onOpenWorkspace('settings', 'System Settings')} />
                <h1 className="hide-mobile" style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#fff' }}>{t('app.missionControl', 'Mission Control')}</h1>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{greeting}</span>
            </div>
            <LiveClock />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8, padding: '3px 10px', fontSize: '0.68rem', color: '#cbd5e1'
                }}>
                    <span>{persona.emoji}</span>
                    <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{t(`persona.${effectiveRole}`, persona.label)}</span>
                </div>
            </div>
        </div>
    );
}

function MissionTile({ tileKey, metric, urgencyData, onClick, index, dragIndex, onDragStart, onDragOver, onDrop, isDragTarget }) {
    const [hovered, setHovered] = useState(false);
    const { t } = useTranslation();
    const tile = ALL_TILES[tileKey] || TILE_GROUPS[tileKey];
    if (!tile) return null;
    const Icon = tile.icon;

    const urgencyCount = typeof urgencyData === 'object' ? urgencyData?.count : (urgencyData || 0);

    return (
        <div
            data-testid={`tile-${tileKey}`}
            draggable
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(12px)',
                borderRadius: 16,
                padding: 'clamp(18px, 2.5vw, 36px)',
                cursor: 'pointer',
                transition: 'all 0.35s',
                transform: hovered ? 'translateY(-6px)' : 'translateY(0)',
                boxShadow: hovered ? `0 30px 60px rgba(0,0,0,0.6), 0 0 60px ${tile.accent}90, inset 0 0 20px ${tile.accent}15` : `0 4px 12px rgba(0,0,0,0.2)`,
                border: hovered ? `1px solid ${tile.accent}66` : '1px solid rgba(255,255,255,0.05)',
                position: 'relative',
                display: 'flex', flexDirection: 'column', gap: 12, height: '100%'
            }}
        >
            {urgencyCount > 0 && <div style={{ position: 'absolute', top: 14, right: 14, background: '#ef4444', color: '#fff', fontSize: '0.65rem', padding: '2px 8px', borderRadius: 8 }}>{urgencyCount}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: tile.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={24} color="#fff" />
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>{t(`mc.tile.${tileKey}.title`, tile.title)}</div>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>{t(`mc.tile.${tileKey}.desc`, tile.desc)}</p>
            {metric && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{metric}</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {tile.pills.map(p => <span key={p} style={{ background: `${tile.accent}20`, color: tile.accent, fontSize: '0.6rem', padding: '2px 8px', borderRadius: 8 }}>{t(`mc.tile.${tileKey}.pill.${p}`, p)}</span>)}
            </div>
        </div>
    );
}

function FreeDragTile({ children }) { return <div>{children}</div>; }

export default function MissionControl({ plantId, onOpenWorkspace }) {
    const userRole = localStorage.getItem('userRole') || 'technician';
    const [viewAsRole, setViewAsRole] = useState(localStorage.getItem('MC_VIEW_AS_ROLE') || '');
    const effectiveRole = viewAsRole || userRole;
    const persona = PERSONA_META[effectiveRole] || PERSONA_META.technician;
    const { metrics, urgency } = useTileMetrics(plantId);
    
    // Check for creator access
    const [corpAnalyticsAccess, setCorpAnalyticsAccess] = useState(false);
    useEffect(() => {
        fetch('/api/corp-analytics/access/check', {
            headers: {},
        }).then(r => r.ok ? r.json() : {hasAccess:false}).then(d => {
            if (d.hasAccess) setCorpAnalyticsAccess(true);
        });
    }, [effectiveRole]);

    const baseTileKeys = ROLE_TILES[effectiveRole] || ROLE_TILES.technician;
    const tileKeys = useMemo(() => {
        let keys = [...baseTileKeys];
        if (corpAnalyticsAccess) {
            if (!keys.includes('corp-analytics')) keys.unshift('corp-analytics');
            // Corporate Analytics group members also get enterprise IT intelligence
            ['it-department', 'it-metrics', 'it-global-search', 'it-alerts'].forEach(it => {
                if (!keys.includes(it)) keys.push(it);
            });
        }
        


        return keys;
    }, [baseTileKeys, corpAnalyticsAccess, plantId]);

    const displayList = useMemo(() => buildDisplayList(tileKeys), [tileKeys]);

    return (
        <div className="mc-container" style={{ minHeight: '100vh', background: 'transparent', padding: '20px' }}>
            <MCHeroBlock isCorporate={plantId === 'all_sites'} persona={persona} currentUser={{}} metrics={metrics} userRole={userRole} effectiveRole={effectiveRole} onOpenWorkspace={onOpenWorkspace} />
            
            <div style={{ display: 'flex', gap: 10, margin: '20px auto', maxWidth: 1400, padding: '0 16px' }}>
                <RoleSwitcher userRole={userRole} onRoleChange={(r) => setViewAsRole(r)} />
            </div>

            {/* Supervisor review queue — only visible to management roles */}
            {REVIEW_QUEUE_ROLES.has(effectiveRole) && plantId && (
                <NeedsReviewQueue
                    plantId={plantId}
                    userId={localStorage.getItem('userId') || userRole}
                />
            )}

            {/* Plant Network status — hub + central server + device presence */}
            {PLANT_NETWORK_ROLES.has(effectiveRole) && plantId && (
                <PlantNetworkStatus plantId={plantId} />
            )}

            <div className="mission-control-grid" style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20, maxWidth: 1400, margin: '0 auto' 
            }}>
                {displayList.map((item, i) => {
                    if (item.type === 'group') {
                        const group = TILE_GROUPS[item.key];
                        return (
                            <MissionTile 
                                key={item.key} 
                                tileKey={item.key} 
                                index={i} 
                                onClick={() => onOpenWorkspace(`portal/${item.key}`, group.title)} 
                            />
                        );
                    }
                    return (
                        <MissionTile 
                            key={item.key} 
                            tileKey={item.key} 
                            index={i} 
                            metric={metrics[item.key]}
                            urgencyData={urgency[item.key]}
                            onClick={() => {
                                const tile = ALL_TILES[item.key];
                                if (tile?.route) {
                                    // Direct route navigation (quality-log, supply-chain, etc.)
                                    onOpenWorkspace(tile.route.replace(/^\//, ''), tile.title);
                                } else {
                                    onOpenWorkspace(tile?.workspace, tile?.title);
                                }
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}

export { PERSONA_META, ROLE_TILES, ALL_TILES, TILE_GROUPS };
