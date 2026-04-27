// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - About & System Information Component
 * ==========================================================
 * System information and version display page.
 * Shows application version, license details, system diagnostics,
 * database statistics, and server health checks. Includes the
 * changelog, feature matrix, and keyboard shortcut reference.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Info, HelpCircle, FileText, Settings, Database, User, Calendar, MessageCircle, Shield, Globe, HardDrive, Printer, BookOpen, AlertCircle, Search, Lightbulb, Clock, CheckCircle, List, ShieldAlert, HelpCircle as HelpIcon, ArrowRight, Settings2, Download, History, Users, ClipboardList, Activity, Key, Server, Type, Cloud, Github, Star, Scan, Wifi } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

const AboutView = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [viewingManual, setViewingManual] = useState(searchParams.get('manual') === 'true');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery), 350);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const _aboutRole = localStorage.getItem('userRole');
    const _isAdminOrCreator = _aboutRole === 'it_admin' || _aboutRole === 'creator' || localStorage.getItem('PF_USER_IS_CREATOR') === 'true';
    const [editingCreator, setEditingCreator] = useState(false);

    const yearsExp = Math.floor((new Date() - new Date('1992-09-21')) / (1000 * 60 * 60 * 24 * 365.25));

    const defaultCreator = {
        name: t('manual.scenario.0.name', 'Doug Trier'),
        email: 'github.com/DougTrier/trier-os/discussions',
        titles: [
            'Platform Architect',
            'Systems Administrator',
            'Enterprise Operations Technologist',
            'Mobile Infrastructure Specialist'
        ],
        bio: `Bridging ${yearsExp} years of industrial grit and enterprise technology. Doug's journey began on the front lines—driving wholesale delivery routes, picking in coolers, loading trucks, and operating production equipment, with decades of operational management experience. This 'boots-on-the-ground' foundation evolved into architecting enterprise digital infrastructure. From racking server foundations to acting as the architect for enterprise mobile infrastructure, this platform is the culmination of three decades of operational knowledge.`,
        badges: ['Industrial Engineering', 'V-Sphere/Cloud', 'Mobile Infra'],
        version: '3.6.1',
        buildDate: 'April 2026',
        experience: yearsExp
    };

    const loadCreatorInfo = () => {
        try {
            const saved = localStorage.getItem('trier_creator_info');
            if (saved) {
                const parsed = JSON.parse(saved);
                return { ...defaultCreator, ...parsed, experience: yearsExp };
            }
        } catch (e) { console.warn('[AboutView] caught:', e); }
        return defaultCreator;
    };

    const [creatorInfo, setCreatorInfo] = useState(loadCreatorInfo);

    const saveCreatorInfo = () => {
        const { version, buildDate, experience, ...saveable } = creatorInfo;
        localStorage.setItem('trier_creator_info', JSON.stringify(saveable));
        setEditingCreator(false);
    };

    const updateCreatorField = (field, value) => {
        setCreatorInfo(prev => ({ ...prev, [field]: value }));
    }

    const enterpriseManual = [
        {
            section: t('manual.s0.title', 'Trier OS vs. The Industry — Feature Comparison'),
            id: 'competitive-comparison',
            navigateTo: '/dashboard',
            filePath: 'src/components/AboutView.jsx',
            icon: <Globe size={22} />,
            content: t('manual.s0.content', 'How Trier OS compares across two tiers of the market. CMMS tier: Fiix, UpKeep, Limble, MaintainX, eMaint. Enterprise EAM tier: SAP S/4HANA PM, IBM Maximo. Legend: [YES] Full Support | [PARTIAL] Partial | [NO] Not Available | [UNIQUE] Industry-First / Unique to Trier. For a detailed head-to-head against SAP PM and IBM Maximo, see the Comparison document in the docs/ folder.'),
            subsections: [
                {
                    title: t('manual.unique.0', '[UNIQUE] Trier-Exclusive Features (No Competitor Offers These)'),
                    items: [
                        t('manual.item.0', '[UNIQUE] Cross-Plant Parts & Asset Logistics — Search all 40+ plants for any part or asset in real time. No competitor has this.'),
                        t('manual.item.1', '[UNIQUE] Enterprise System Data Migration Bridge — Direct database import from PMC, MP2, Access, and SQL Server with auto-mapped columns.'),
                        t('manual.item.2', '[UNIQUE] OCR Nameplate Scanner (Experimental) — Photo a nameplate → OCR attempts to read text from labels. Review results before saving.'),
                        t('manual.item.3', '[UNIQUE] Network Onboarding Wizard — New plant browses existing sites and clones PMs, parts, vendors, and SOPs in one session.'),
                        t('manual.item.4', '[UNIQUE] Shift Handoff Digital Logbook — Auto-locking shift notes with timestamps. Replaces the paper logbook at every plant.'),
                        t('manual.item.5', '[UNIQUE] Push-to-Talk Voice Input — Speak into any text field. Built for gloves-on, dirty, and cold environments.'),
                        t('manual.item.6', '[UNIQUE] Enterprise Contact Directory — Find the right person at any plant, integrated directly into the logistics workflow.'),
                        t('manual.item.7', '[UNIQUE] Network Price Discovery — Automatic alerts when a sister plant finds a lower price on a common part.'),
                        t('manual.item.8', '[UNIQUE] Shop Floor Mode — Purpose-built high-contrast display for bright industrial environments and large monitors.'),
                        t('manual.item.9', '[UNIQUE] Snapshot Rollback — One-click database recovery to any previous point in time.'),
                        t('manual.item.10', '[UNIQUE] In-House Data — No Vendor Lock-In — Your data belongs to you. Supports centralized hosting, cloud, or local installs with periodic sync.'),
                        t('manual.item.11', 'Built-In Searchable Operational Intelligence Manual — Training documentation lives inside the app, always current and printable.'),
                        t('manual.item.12', '[UNIQUE] Mobile Offline (PWA + IndexedDB) — Phone/tablet app works in coolers, basements, and dead zones. Auto-syncs changes when reconnected.'),
                        t('manual.item.13', '[UNIQUE] Server-to-Server HA Replication — Primary → Secondary replication every 60 seconds with manual failover and pre-sync snapshots.'),
                        t('manual.item.1551', '[UNIQUE] Per-User Email Alert Subscriptions — Each user picks their own alerts and email — no IT involvement after one-time SMTP setup.'),
                        t('manual.item.1552', '[UNIQUE] PM Calendar with Sticky Notes — The PM calendar supports pinned, color-coded notes that persist across schedule views. No other Enterprise System lets planners leave contextual notes directly on the calendar grid.'),
                        t('manual.item.1553', '[UNIQUE] IT Asset & License Depreciation Inside Enterprise System — Track software licenses, hardware, network infrastructure, and mobile devices with straight-line and declining-balance depreciation, live book-value calculations, and expiry alerts — all inside the maintenance platform. Every competitor requires a separate ERP or ITAM system.'),
                        t('manual.item.1554', '[UNIQUE] Asset Health Score & Reliability Index — Every asset carries a continuously updated Health Score computed from failure frequency, downtime duration, MTBF, MTTR, and PM compliance rate. Presented as a 0-100 index with trend line. No competitor calculates a unified reliability index at the asset level.'),
                        t('manual.item.1555', '[UNIQUE] In-App IDE & Live Deploy Pipeline (Live Studio) — A fully integrated, browser-based Monaco code editor with a 4-step deploy pipeline (stage, build, tag, reload) built directly into the Enterprise System. Authorized engineers can inspect, edit, and ship source code changes without leaving the platform. No Enterprise System vendor in the market offers anything approaching this capability.'),
                        t('manual.item.1556', '[UNIQUE] Frictional Cost Engine — Before deploying any UI change, Trier OS automatically quantifies its dollar cost in operator productivity. The engine counts the delta in interactive elements (fields, dropdowns, buttons, barcode scans) and projects the annual wrench-time impact across all plants and shifts using physics-based time constants. Displays a pre-deploy verdict: e.g., "This change costs 63 hours of operator time annually (-$1,575/yr)." No other platform in any category does this.'),
                        t('manual.item.1557', '[UNIQUE] Parallel Universe Simulation Engine — Clone any plant database to a historical cutoff date, strip records after that point, and run a split-screen KPI comparison between the live system and the simulation snapshot. Used to validate logic changes against real historical data before deployment. Unprecedented in any Enterprise System or ERP product.'),
                        t('manual.item.1558', '[UNIQUE] Visual Change Consequence Analyzer (Blast-Radius Mapper) — Traces modified source files through ES6 import chains to every React Router route they affect, translating code diffs into plain-English business workflow impact ("This deploy touches the Work Order close-out flow and the PM scheduling screen"). No competitor exposes this level of pre-deploy consequence mapping.'),
                        t('manual.item.1559', '[UNIQUE] Contextual Documentation-to-Source Linking — Every section of the built-in Operations Manual has a "Go to Code" button that opens the IDE with the exact corresponding source file pre-loaded. The manual and the codebase are live-linked. No other platform connects user-facing documentation to source code in this way.'),
                        t('manual.item.1560', '[UNIQUE] Deterministic Boot Safe Mode — Every successful deployment auto-tags a stable-YYYY-MM-DD git anchor. If a cascading failure locks out the platform, a single environment variable (NODE_ENV=safe_mode) restores the last confirmed-stable build with no human judgment required. No Enterprise System has a codified, autonomous incident recovery path of this kind.')
                    ]
                },
                {
                    title: t('manual.cat.0', 'Core Maintenance Operations'),
                    items: [
                        t('manual.item.14', 'Work Order Management — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [YES] | MaintainX [YES] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.15', 'Close-Out Wizard (Labor, Parts, Costs, Signature) — Trier [YES] | Fiix [YES] | UpKeep [PARTIAL] | Limble [PARTIAL] | MaintainX [PARTIAL] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.16', 'Preventive Maintenance Scheduling — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [YES] | MaintainX [YES] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.17', 'Meter-Based PM Triggers — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [YES] | MaintainX [PARTIAL] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.18', 'PM Calendar with Sticky Notes — Trier [YES][UNIQUE] | Fiix [PARTIAL] | UpKeep [PARTIAL] | Limble [YES] | MaintainX [NO] | eMaint [PARTIAL] | SAP PM [PARTIAL] | IBM Maximo [PARTIAL]'),
                        t('manual.item.19', 'Task Checklists on Work Orders — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [YES] | MaintainX [YES] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.20', 'SOP / Procedure Library — Trier [YES] | Fiix [PARTIAL] | UpKeep [PARTIAL] | Limble [PARTIAL] | MaintainX [YES] | eMaint [PARTIAL] | SAP PM [PARTIAL] | IBM Maximo [YES]'),
                        t('manual.item.1561', 'Print Engine (WOs, Reports, SOPs) — Trier [YES] | Fiix [YES] | UpKeep [PARTIAL] | Limble [PARTIAL] | MaintainX [NO] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.1562', 'LOTO Digital Permit System — Trier [YES] | Fiix [PARTIAL] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [PARTIAL] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.1563', 'Compliance & Inspection Management — Trier [YES] | Fiix [YES] | UpKeep [PARTIAL] | Limble [PARTIAL] | MaintainX [PARTIAL] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.1564', 'Calibration / Instrument Tracking — Trier [YES] | Fiix [YES] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.1565', 'IT Asset & License Depreciation — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [PARTIAL] | IBM Maximo [PARTIAL]')
                    ]
                },
                {
                    title: t('manual.cat.1', 'Asset Management'),
                    items: [
                        t('manual.item.21', 'Asset Registry — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [YES] | MaintainX [YES] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.22', 'Asset Timeline (Visual History) — Trier [YES] | Fiix [PARTIAL] | UpKeep [PARTIAL] | Limble [NO] | MaintainX [NO] | eMaint [PARTIAL] | SAP PM [PARTIAL] | IBM Maximo [YES]'),
                        t('manual.item.23', 'Meter Tracking (Runtime Hours) — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [YES] | MaintainX [PARTIAL] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.24', 'Predictive Analytics (MTBF/MTTR) — Trier [YES] | Fiix [YES] | UpKeep [PARTIAL] | Limble [PARTIAL] | MaintainX [NO] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.25', 'Health Score & Reliability Index — Trier [YES][UNIQUE] | Fiix [PARTIAL] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [PARTIAL] | SAP PM [PARTIAL] | IBM Maximo [PARTIAL]'),
                        t('manual.item.1566', 'Cross-Plant Asset Search — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [PARTIAL] | IBM Maximo [PARTIAL]')
                    ]
                },
                {
                    title: t('manual.cat.2', 'Parts & Inventory'),
                    items: [
                        t('manual.item.26', 'Parts Database with Stock Levels — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [YES] | MaintainX [YES] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.27', 'Purchase Order Management — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [YES] | MaintainX [YES] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.28', 'Stock Adjustments with Audit Trail — Trier [YES] | Fiix [YES] | UpKeep [PARTIAL] | Limble [YES] | MaintainX [NO] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.29', 'Vendor Management — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [YES] | MaintainX [PARTIAL] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.30', 'Cross-Plant Parts Search (Global Logistics) — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [PARTIAL] | IBM Maximo [PARTIAL]'),
                        t('manual.item.31', 'Cross-Plant Transfer Requests — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [PARTIAL] | IBM Maximo [PARTIAL]'),
                        'Network Price Discovery — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'
                    ]
                },
                {
                    title: t('manual.cat.3', 'Enterprise & Multi-Site'),
                    items: [
                        t('manual.item.32', 'Multi-Site Management (40+ Plants) — Trier [YES] | Fiix [YES] | UpKeep [PARTIAL] | Limble [PARTIAL] | MaintainX [PARTIAL] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.33', 'Corporate Dashboard (All-Sites View) — Trier [YES][UNIQUE] | Fiix [YES] | UpKeep [PARTIAL] | Limble [PARTIAL] | MaintainX [NO] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.34', 'Enterprise Intelligence (Cross-Plant KPIs) — Trier [YES][UNIQUE] | Fiix [PARTIAL] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [PARTIAL] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.35', 'Network Onboarding Wizard (Clone from Sister Plant) — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.36', 'Role-Based Access Control (RBAC) — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [YES] | MaintainX [PARTIAL] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.37', 'Enterprise Contact Directory — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        'SAP/ERP Integration — Trier [YES] | Fiix [YES] | UpKeep [PARTIAL] | Limble [PARTIAL] | MaintainX [PARTIAL] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'
                    ]
                },
                {
                    title: t('manual.cat.4', 'Communication & Collaboration'),
                    items: [
                        t('manual.item.38', 'Built-In Plant-to-Plant Chat — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [YES] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.39', 'Push-to-Talk (Voice-to-Text) — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.40', 'Webhook Alerts (Slack/Teams/Discord) — Trier [YES] | Fiix [YES] | UpKeep [PARTIAL] | Limble [PARTIAL] | MaintainX [PARTIAL] | eMaint [YES] | SAP PM [PARTIAL] | IBM Maximo [YES]'),
                        t('manual.item.41', 'Email Notifications — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [YES] | MaintainX [YES] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.42', 'In-App Notification Center — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [YES] | MaintainX [YES] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        'Shift Handoff Log (Digital Logbook) — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'
                    ]
                },
                {
                    title: t('manual.cat.5', 'Technology & Platform'),
                    items: [
                        t('manual.item.43', 'Barcode + QR Code Scanner — Trier [YES] | Fiix [PARTIAL] | UpKeep [YES] | Limble [YES] | MaintainX [YES] | eMaint [PARTIAL] | SAP PM [PARTIAL] | IBM Maximo [YES]'),
                        t('manual.item.44', 'OCR Nameplate Reader (Experimental) — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.45', 'IoT / SCADA Sensor Gateway — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [NO] | MaintainX [PARTIAL] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.46', 'OPC-UA / Tetra Pak Integration — Trier [YES][UNIQUE] | Fiix [PARTIAL] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [PARTIAL] | SAP PM [PARTIAL] | IBM Maximo [PARTIAL]'),
                        t('manual.item.47', 'PWA / Offline Mode (Cooler-Proof) — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [PARTIAL] | Limble [NO] | MaintainX [PARTIAL] | eMaint [NO] | SAP PM [NO] | IBM Maximo [PARTIAL]'),
                        t('manual.item.48', 'Server-to-Server HA Replication — Trier [YES][UNIQUE] | Fiix [PARTIAL] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [PARTIAL] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.49', 'Shop Floor Mode (High-Contrast Display) — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.50', 'Multi-Language Support (11 Languages) — Trier [YES] | Fiix [PARTIAL] | UpKeep [PARTIAL] | Limble [PARTIAL] | MaintainX [PARTIAL] | eMaint [PARTIAL] | SAP PM [YES] | IBM Maximo [YES]'),
                        'In-House Data — No Vendor Lock-In — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'
                    ]
                },
                {
                    title: t('manual.cat.6', 'Data Management & Administration'),
                    items: [
                        t('manual.item.51', 'Enterprise System-to-Enterprise System Data Migration Bridge — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.52', 'Legacy Database Import (PMC, MP2, Access, SQL) — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.53', 'Database Backup & Export — Trier [YES] | Fiix [PARTIAL] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [PARTIAL] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.54', 'Snapshot Rollback (Point-in-Time Recovery) — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.55', 'Audit Trail / Compliance Logging — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [YES] | MaintainX [PARTIAL] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.56', 'Report Center (Pre-Built Reports) — Trier [YES] | Fiix [YES] | UpKeep [YES] | Limble [YES] | MaintainX [PARTIAL] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.57', 'Custom Report Builder (Drag & Drop) — Trier [YES] | Fiix [YES] | UpKeep [PARTIAL] | Limble [PARTIAL] | MaintainX [NO] | eMaint [YES] | SAP PM [YES] | IBM Maximo [YES]'),
                        'Built-In Operational Intelligence Manual — Trier [YES+UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'
                    ]
                },
                {
                    title: t('manual.cat.7', 'Keyboardless Workflows'),
                    items: [
                        t('manual.item.1570', 'Scan-to-Consume (Parts on WOs) — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.1571', 'Badge-and-Scan Employee Tool Checkout — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.1572', 'Blind Vendor Receive / Cycle Counts — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.1573', 'Voice-to-Text Native Shift Narratives — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.1574', 'Fleet DVIR & Fuel Scan-and-Type — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.1575', 'Utility Meter Direct Scan-and-Read — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.1576', 'LOTO Scan-to-Lock & Autofill Procedure — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]'),
                        t('manual.item.1758', 'Built-In Report Center & Scan Audit Log — Trier [YES][UNIQUE] | Fiix [PARTIAL] | UpKeep [NO] | Limble [PARTIAL] | MaintainX [NO] | eMaint [PARTIAL] | SAP PM [YES] | IBM Maximo [YES]'),
                        t('manual.item.1759', 'Formal Correctness Invariants (Runtime-Verified, 13 guarantees) — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]')
                    ]
                }
            ]
        },
        {
            section: 'TCO Analysis: True Cost vs. Market Leaders',
            id: 'tco-analysis',
            navigateTo: '/dashboard',
            filePath: 'src/components/AboutView.jsx',
            icon: <Cloud size={22} />,
            content: t('manual.tco.content', 'Trier OS is free — forever. It installs in under 10 minutes on any existing Windows server or VM, requires no database license (SQLite is built-in), no cloud hosting, no integration middleware, no dedicated IT staff, and no training budget (every user is onboarded automatically with a built-in guided tour). There are no per-user fees, no annual contracts, and no vendor price escalations. The comparison below shows what a company must spend to get each competing platform operational vs. the true cost of Trier OS. All competitor figures are USD, 2025–2026 market rates.'),
            subsections: [
                {
                    title: t('manual.tco.0.title', '1 — The Full Dependency Stack'),
                    tcoNote: t('manual.tco.0.note', 'Before a single user logs in, competing platforms require this entire supporting ecosystem. Trier OS requires none of it — install takes under 10 minutes on existing infrastructure.'),
                    tcoTable: {
                        headers: [t('tco.col.dep', 'Dependency'), 'SAP S/4HANA', 'IBM Maximo', 'Oracle Fusion', 'Hexagon EAM', 'UpKeep / Fiix', 'Trier OS'],
                        highlight: 6,
                        rows: [
                            [t('tco.0.1.0', 'Application License'), t('tco.0.1.1', '$200/user/mo'), t('tco.0.1.2', 'Custom quote'), t('tco.0.1.3', '$500–625/user/mo'), t('tco.0.1.4', '~$7,000+/mo flat'), t('tco.0.1.5', '$45–75/user/mo'), t('tco.free', '$0 — free forever')],
                            [t('tco.0.2.0', 'Database Engine'), 'SQL Server / HANA', 'Db2 / SQL Server', 'Oracle DB Enterprise', 'SQL Server', t('tco.0.2.5', 'Vendor-managed'), t('tco.sqlite', 'SQLite — built-in, $0')],
                            [t('tco.0.3.0', 'Cloud Infrastructure'), t('tco.req1', 'Azure / AWS required'), t('tco.req2', 'AWS / IBM Cloud req.'), t('tco.req3', 'Oracle Cloud (OCI)'), t('tco.req1', 'Azure / AWS required'), t('tco.req4', 'SaaS only (vendor cloud)'), t('tco.req5', 'Not required — existing VM or server')],
                            [t('tco.0.4.0', 'Integration Middleware'), 'SAP BTP / MuleSoft', 'IBM App Connect', 'Oracle Integration', 'MuleSoft / Boomi', t('tco.0.4.5', 'Limited APIs'), t('tco.api', 'Built-in REST API, $0')],
                            [t('tco.0.5.0', 'Dedicated IT / DBA Staff'), t('tco.0.5.1', 'SAP BASIS Admin req.'), t('tco.0.5.2', 'Maximo Admin req.'), t('tco.0.5.3', 'Oracle DBA req.'), t('tco.0.5.4', 'EAM Admin req.'), t('tco.none', 'None'), t('tco.nonestaff', 'None — no specialized staff needed')],
                            [t('tco.0.6.0', 'Annual Support Contract'), t('tco.0.6.1', '22% of license/yr'), t('tco.0.6.2', '18–22%/yr'), t('tco.0.6.3', '22%/yr'), t('tco.0.6.4', '18–22%/yr'), t('tco.inc', 'Included in SaaS'), t('tco.nofee', '$0 — no support fees ever')],
                            [t('tco.0.7.0', 'Implementation Timeline'), t('tco.0.7.1', '6–18 months + SI partner'), t('tco.0.7.2', '3–12 months + partner'), t('tco.0.7.3', '6–18 months + partner'), t('tco.0.7.4', '3–9 months + partner'), t('tco.0.7.5', '1–4 weeks'), t('tco.0.7.6', '10-minute install — no partner')],
                            [t('tco.0.8.0', 'User Onboarding / Training'), t('tco.0.8.1', '$1,000–$3,000/user'), t('tco.0.8.2', '$1,200–$2,500/user'), t('tco.0.8.3', '$1,500–$2,500/user'), t('tco.0.8.4', '$1,000–$2,000/user'), t('tco.0.8.5', '$200–500/user'), t('tco.0.8.6', 'Built-in guided tour — $0')],
                            [t('tco.0.9.0', 'Per-Plant License'), t('tco.sku', 'Per-plant SKU'), t('tco.sku', 'Per-plant SKU'), t('tco.sku', 'Per-plant SKU'), t('tco.addon', 'Per-plant add-on'), t('tco.addon', 'Per-plant add-on'), t('tco.upl', 'Unlimited plants — $0')],
                            [t('tco.0.10.0', 'Mobile App License'), t('tco.addoncost', 'Add-on cost'), t('tco.inc_mas', 'Included (MAS)'), t('tco.addoncost', 'Add-on cost'), t('tco.addoncost', 'Add-on cost'), t('tco.inc2', 'Included'), t('tco.unl', '$0 — unlimited users')],
                            [t('tco.0.11.0', 'Vendor Lock-In Risk'), t('tco.0.11.1', 'High — proprietary formats'), t('tco.0.11.2', 'High — proprietary DB'), t('tco.0.11.3', 'High — Oracle Cloud'), t('tco.med', 'Medium'), t('tco.medsaas', 'Medium — SaaS'), t('tco.0.11.6', 'None — open SQLite, you own the data')],
                        ]
                    }
                },
                {
                    title: t('manual.tco.1.title', '2 — Infrastructure Cost Before Any Software Is Purchased'),
                    tcoNote: t('manual.tco.1.note', 'These costs exist regardless of user count. They appear on separate purchase orders — never in the software quote.'),
                    tcoTable: {
                        headers: [t('tco.col.comp', 'Component'), t('tco.col.one', 'One-Time Cost'), t('tco.col.ann', 'Annual Recurring'), t('tco.col.5y', '5-Year Total'), 'Trier OS'],
                        highlight: 4,
                        rows: [
                            [t('tco.1.1.0', 'SQL Server Enterprise (16-core server)'), t('tco.1.1.1', '$120,984'), t('tco.1.1.2', '$30,246/yr (SA)'), t('tco.1.1.3', '$242,214'), '$0'],
                            [t('tco.1.2.0', 'Oracle Database Enterprise (4 processors)'), t('tco.1.2.1', '$190,000'), t('tco.1.2.2', '$41,800/yr support'), t('tco.1.2.3', '$399,200'), '$0'],
                            [t('tco.1.3.0', 'IBM Db2 (mid-size PVU licensing)'), t('tco.1.3.1', '$50,000'), t('tco.1.3.2', '$10,000–12,500/yr'), t('tco.1.3.3', '$100,000–$112,500'), '$0'],
                            [t('tco.1.4.0', 'Azure cloud hosting — SAP mid-size'), '—', t('tco.1.4.2', '$96,000–$144,000/yr'), t('tco.1.4.3', '$480K–$720K'), t('tco.req5', 'Not required — existing VM')],
                            [t('tco.1.5.0', 'AWS / IBM Cloud — Maximo'), '—', t('tco.1.5.2', '$60,000–$96,000/yr'), t('tco.1.5.3', '$300K–$480K'), '$0'],
                            [t('tco.1.6.0', 'SAP BTP / MuleSoft integration middleware'), '—', t('tco.1.6.2', '$50,000–$150,000/yr'), t('tco.1.6.3', '$250K–$750K'), '$0'],
                            [t('tco.1.7.0', 'SAP BASIS Administrator (1 FTE salary)'), '—', t('tco.1.7.2', '$130,000–$184,000/yr'), t('tco.1.7.3', '$650K–$920K'), '$0'],
                            [t('tco.1.8.0', 'Oracle DBA (1 FTE salary)'), '—', t('tco.1.8.2', '$120,000–$165,000/yr'), t('tco.1.8.3', '$600K–$825K'), '$0'],
                            [t('tco.1.9.0', 'Maximo / EAM Platform Admin (1 FTE)'), '—', t('tco.1.9.2', '$100,000–$150,000/yr'), t('tco.1.9.3', '$500K–$750K'), '$0'],
                        ]
                    }
                },
                {
                    title: t('manual.tco.2.title', '3 — Year 1 Total Cost of Ownership — 75 Users, 1 Plant'),
                    tcoNote: t('manual.tco.2.note', 'All costs required to get each platform operational for 75 users at a single facility. Trier OS installs in 10 minutes on existing infrastructure — no licenses, no partners, no training budget, no hosting fees.'),
                    tcoTable: {
                        headers: [t('tco.col.cat', 'Cost Category'), 'SAP S/4HANA', 'IBM Maximo', 'Oracle Fusion', 'Hexagon EAM', 'UpKeep Pro', 'Trier OS'],
                        highlight: 6,
                        isTotals: true,
                        rows: [
                            [t('tco.2.1.0', 'Software License (Year 1)'), '$180,000', '$175,000', '$506,250', '$150,000', '$67,500', '$0'],
                            [t('tco.2.2.0', 'Database License (one-time)'), '$120,984', '$50,000', '$190,000', '$90,000', '$0', '$0'],
                            [t('tco.2.3.0', 'Cloud Hosting (annual)'), '$120,000', '$78,000', '$96,000', '$66,000', '$0', '$0'],
                            [t('tco.2.4.0', 'Implementation / Consulting'), '$300,000', '$250,000', '$350,000', '$150,000', '$5,000', '$0'],
                            [t('tco.2.5.0', 'Integration Middleware'), '$60,000', '$35,000', '$45,000', '$35,000', '$0', '$0'],
                            [t('tco.2.6.0', 'IT Admin Staff (incremental FTE)'), '$140,000', '$110,000', '$130,000', '$100,000', '$0', '$0'],
                            [t('tco.2.7.0', 'Training'), '$45,000', '$40,000', '$50,000', '$35,000', '$10,000', '$0'],
                            [t('tco.2.8.0', 'Annual Support Contract'), t('tco.inc3', 'Included'), '$35,000', '$111,375', '$30,000', t('tco.inc3', 'Included'), '$0'],
                            [t('tco.2.9.0', 'Mobile & Add-on Licensing'), '$15,000', t('tco.inc3', 'Included'), '$18,000', '$12,000', t('tco.inc3', 'Included'), '$0'],
                            [t('tco.2.10.0', 'YEAR 1 TOTAL'), '$980,984', '$773,000', '$1,496,625', '$668,000', '$82,500', '$0'],
                        ]
                    }
                },
                {
                    title: t('manual.tco.3.title', '4 — 5-Year Total Cost of Ownership'),
                    tcoNote: t('manual.tco.3.note', 'Year 1 costs plus four years of recurring fees with standard 4–6% annual vendor price escalation. Trier OS has no recurring costs — the 5-year total is the same as year one: $0.'),
                    tcoTable: {
                        headers: [t('tco.col.plat', 'Platform'), t('tco.col.y1', 'Year 1'), t('tco.col.y2', 'Year 2'), t('tco.col.y3', 'Year 3'), t('tco.col.y4', 'Year 4'), t('tco.col.y5', 'Year 5'), t('tco.col.y5tot', '5-Year Total')],
                        triRow: 'Trier OS',
                        rows: [
                            ['SAP S/4HANA', '$980,984', '$470,000', '$490,000', '$511,000', '$532,000', '$2,983,984'],
                            ['IBM Maximo', '$773,000', '$385,000', '$400,000', '$416,000', '$432,000', '$2,406,000'],
                            ['Oracle Fusion EAM', '$1,496,625', '$745,000', '$774,000', '$805,000', '$837,000', '$4,657,625'],
                            ['Hexagon EAM', '$668,000', '$290,000', '$302,000', '$314,000', '$326,000', '$1,900,000'],
                            ['UpKeep Professional', '$82,500', '$73,000', '$77,000', '$81,000', '$85,000', '$398,500'],
                            ['Fiix Professional', '$92,500', '$72,000', '$76,000', '$80,000', '$84,000', '$404,500'],
                            ['Trier OS', '$0', '$0', '$0', '$0', '$0', '$0'],
                        ]
                    }
                },
                {
                    title: t('manual.tco.4.title', '5 — 5-Year Savings vs. Trier OS'),
                    tcoNote: t('manual.tco.4.note', 'Total money returned to operations over 5 years by choosing Trier OS. Trier OS costs $0 — every dollar the competitor charges is a dollar saved.'),
                    tcoTable: {
                        headers: [t('tco.col.comp2', 'Competitor'), t('tco.col.c5', '5-Year Competitor Cost'), t('tco.col.c5t', '5-Year Trier OS Cost'), t('tco.col.sav', 'Total Savings'), t('tco.col.per', 'Savings %')],
                        savingsHighlight: true,
                        rows: [
                            ['SAP S/4HANA', '$2,983,984', '$0', '$2,983,984', '100%'],
                            ['IBM Maximo', '$2,406,000', '$0', '$2,406,000', '100%'],
                            ['Oracle Fusion EAM', '$4,657,625', '$0', '$4,657,625', '100%'],
                            ['Hexagon EAM', '$1,900,000', '$0', '$1,900,000', '100%'],
                            ['UpKeep Professional', '$398,500', '$0', '$398,500', '100%'],
                            ['Fiix Professional', '$404,500', '$0', '$404,500', '100%'],
                        ]
                    }
                },
                {
                    title: t('manual.tco.5.title', '6 — Per-Employee & Per-User Cost (5-Year)'),
                    tcoNote: t('manual.tco.5.note', '200-employee plant, 75 system users, 5-year horizon. Trier OS is free — the per-employee and per-user cost is $0.'),
                    tcoTable: {
                        headers: [t('tco.col.plat', 'Platform'), t('tco.col.y5tot', '5-Year TCO'), t('tco.col.cem', 'Cost / Employee / Year'), t('tco.col.cum', 'Cost / User / Month')],
                        triRow: 'Trier OS',
                        rows: [
                            ['SAP S/4HANA', '$2,983,984', '$2,984', '$664'],
                            ['IBM Maximo', '$2,406,000', '$2,406', '$535'],
                            ['Oracle Fusion EAM', '$4,657,625', '$4,658', '$1,035'],
                            ['Hexagon EAM', '$1,900,000', '$1,900', '$422'],
                            ['UpKeep Professional', '$398,500', '$399', '$89'],
                            ['Fiix Professional', '$404,500', '$405', '$90'],
                            ['Trier OS', '$0', '$0', '$0'],
                        ]
                    }
                },
                {
                    title: t('manual.tco.6.title', '7 — Multi-Plant Scale Economics'),
                    tcoNote: t('manual.tco.6.note', 'Trier OS has no per-plant licensing and no cost at any scale. Every competitor multiplies their fees per plant. Trier OS stays at $0 whether the company has 1 plant or 100.'),
                    tcoTable: {
                        headers: [t('tco.col.plat', 'Platform'), t('tco.col.1p', '1 Plant (5yr)'), t('tco.col.3p', '3 Plants (5yr)'), t('tco.col.10p', '10 Plants (5yr)'), t('tco.col.sav10', 'Savings vs. Trier OS at 10 Plants')],
                        triRow: 'Trier OS',
                        rows: [
                            ['SAP S/4HANA', '$2,983,984', '~$7,500,000', '~$22,000,000', t('tco.sav22', 'Save ~$22M')],
                            ['IBM Maximo', '$2,406,000', '~$6,000,000', '~$18,000,000', t('tco.sav18', 'Save ~$18M')],
                            ['Oracle Fusion', '$4,657,625', '~$11,600,000', '~$35,000,000', t('tco.sav35', 'Save ~$35M')],
                            ['Hexagon EAM', '$1,900,000', '~$4,750,000', '~$14,000,000', t('tco.sav14', 'Save ~$14M')],
                            ['UpKeep / Fiix', '$398,500', '~$995,000', '~$3,000,000', t('tco.sav3', 'Save ~$3M')],
                            ['Trier OS', '$0', '$0', '$0', t('tco.nocost', 'No cost at any scale')],
                        ]
                    }
                },
                {
                    title: t('manual.tco.7.title', '8 — What Trier OS Eliminates Entirely'),
                    tcoNote: t('manual.tco.7.note', 'Every item below is a real line item on a competitor\'s total invoice that simply does not exist with Trier OS.'),
                    tcoItems: [
                        { label: t('tco.elim.1l', 'Software license fees'), value: t('tco.elim.1v', '$45–$625/user/month with every competitor — Trier OS is free forever, no user cap, no seat fees') },
                        { label: t('tco.elim.2l', 'Database engine license (SQL Server / Oracle / Db2)'), value: t('tco.elim.2v', '$60,000–$399,000 one-time + $15–42K/yr — Trier OS uses SQLite, which is built in and free') },
                        { label: t('tco.elim.3l', 'Mandatory cloud hosting (Azure / AWS / IBM Cloud)'), value: t('tco.elim.3v', '$36,000–$720,000/yr — Trier OS runs on your existing VM or server, no cloud account required') },
                        { label: t('tco.elim.4l', 'Integration middleware (MuleSoft, Boomi, SAP BTP)'), value: t('tco.elim.4v', '$20,000–$250,000/yr — Trier OS has a built-in REST API, no middleware needed') },
                        { label: t('tco.elim.5l', 'Dedicated ERP IT staff (BASIS Admin, DBA, EAM Admin)'), value: t('tco.elim.5v', '$100,000–$280,000/yr permanently — Trier OS requires no specialized platform staff') },
                        { label: t('tco.elim.6l', 'Implementation partner fees'), value: t('tco.elim.6v', '$75,000–$1,000,000+ — Trier OS installs in under 10 minutes by any IT generalist') },
                        { label: t('tco.elim.7l', 'User training and onboarding programs'), value: t('tco.elim.7v', '$1,000–$3,000/user — Trier OS includes a built-in guided tour that onboards every user automatically') },
                        { label: t('tco.elim.8l', 'Annual vendor support contracts'), value: t('tco.elim.8v', '18–22% of license cost per year, compounding indefinitely — Trier OS has no support fees') },
                        { label: t('tco.elim.9l', 'Per-plant expansion licensing'), value: t('tco.elim.9v', 'Every competitor multiplies costs per plant — Trier OS supports unlimited plants at no additional cost') },
                        { label: t('tco.elim.10l', 'Add-on module purchases (floor plans, energy advisor, shift logbook, OCR)'), value: t('tco.elim.10v', '$15,000–$100,000/yr per module — every feature is included in Trier OS at no cost') },
                        { label: t('tco.elim.11l', 'Mandatory upgrade and migration projects'), value: t('tco.elim.11v', '$100,000–$500,000 per major version — Trier OS updates are free') },
                        { label: t('tco.elim.12l', 'Multi-year vendor lock-in contracts'), value: t('tco.elim.12v', '3-year minimum with SAP and Oracle — Trier OS has no contract, no commitment, you own the software and data') },
                        { label: t('tco.elim.13l', 'Annual vendor price escalation'), value: t('tco.elim.13v', '4–15%/yr compounding with SaaS and enterprise vendors — Trier OS has no price to escalate') },
                    ]
                },
                {
                    title: t('manual.tco.8.title', '9 — Data Sources'),
                    tcoNote: t('manual.tco.8.note', 'All figures are based on published vendor pricing and verified analyst reports (2025–2026).'),
                    tcoItems: [
                        { label: 'SAP S/4HANA $200/user/mo', value: t('tco.src.1', 'SAP RISE published pricing, Top10ERP 2026') },
                        { label: 'SQL Server Enterprise $15,123/2-core pack', value: t('tco.src.2', 'Microsoft official price list 2025') },
                        { label: 'Azure / AWS hosting ranges', value: t('tco.src.3', 'Intercept Cloud, TrustRadius 2025 pricing review, Cloudburn.io') },
                        { label: 'IBM Maximo AppPoints estimate', value: t('tco.src.4', 'Capterra analyst averages, G2 verified buyer reports 2025') },
                        { label: 'Oracle Fusion $500–625/user/mo', value: t('tco.src.5', 'Top10ERP Oracle Fusion guide 2026') },
                        { label: 'Oracle DB Enterprise $47,500/processor', value: t('tco.src.6', 'Oracle published technology price list') },
                        { label: 'SAP BASIS Administrator salary $130K–$184K', value: t('tco.src.7', 'Payscale US 2025, Glassdoor cross-reference') },
                        { label: 'SAP annual maintenance 22%', value: t('tco.src.8', 'SAP official maintenance policy, SAPRiseNegotiations.com') },
                        { label: 'MuleSoft / Boomi middleware pricing', value: t('tco.src.9', 'Vendor pricing pages + APIX-Drive comparison 2025') },
                        { label: 'UpKeep / Fiix $75/user/mo Professional tier', value: t('tco.src.10', 'UpKeep and Fiix published pricing pages (April 2025)') },
                        { label: 'Hexagon EAM $7,000+/mo', value: t('tco.src.11', 'G2 verified buyer reports and analyst estimates 2025') },
                        { label: 'Infor / Hexagon implementation $75K–$200K', value: t('tco.src.12', 'Dynaway EAM implementation cost guide, eworkorders.com') },
                    ]
                },
            ]
        },
        {
            section: t('manual.s1.title', 'Part 1: Logging In & First Look'),
            id: 'login',
            navigateTo: '/dashboard',
            filePath: 'src/components/LoginView.jsx',
            icon: <User size={22} />,
            content: t('manual.s1.content', 'How to access, log in, and navigate Trier OS for the first time.'),
            subsections: [
                {
                    title: t('manual.sub.0', '1.1 Accessing the System'),
                    items: [
                        t('manual.item.58', 'Trier OS runs on your company\'s private network. No internet connection is required.'),
                        t('manual.item.59', 'From a Desktop: Open your browser (Chrome, Edge, or Firefox) and navigate to the address provided by IT.'),
                        t('manual.item.60', 'From a Tablet or Phone: Navigate to the same address. Select "Add to Home Screen" to install it as an app icon.'),
                        'The app works even in areas with poor Wi-Fi (Cooler-Proof Mode).'
                    ]
                },
                {
                    title: t('manual.sub.1', '1.2 Logging In'),
                    items: [
                        t('manual.item.61', '1. Enter your Username (assigned by your IT administrator).'),
                        t('manual.item.62', '2. Enter your Password.'),
                        t('manual.item.63', '3. Click "Sign In".'),
                        t('manual.item.64', 'First-Time Users: You will be prompted to change your temporary password immediately.'),
                        'Site Code Login: New users can self-register using a Site Code provided by their supervisor.'
                    ]
                },
                {
                    title: t('manual.sub.2', '1.3 The Navigation Bar'),
                    items: [
                        t('manual.item.65', 'SCAN — Opens the smart barcode/QR scanner. Scan any asset tag, part label, or work order to instantly find or create records.'),
                        t('manual.item.66', 'SHOP FLOOR — High-contrast, large-text display optimized for plant floor monitors.'),
                        t('manual.item.67', 'Dashboard — Enterprise overview with statistics, charts, recent work orders, and leadership contacts.'),
                        t('manual.item.68', 'History — Completed work orders and past maintenance records.'),
                        t('manual.item.69', 'Chat — Plant-to-plant messaging for sharing knowledge across facilities.'),
                        t('manual.item.70', 'Directory — Contact information for leadership at all Trier OS locations.'),
                        t('manual.item.71', 'Settings — Account settings. Admins see system configuration here.'),
                        t('manual.item.72', 'Jobs — Your primary workspace: active work orders, creating new jobs, tracking assignments.'),
                        t('manual.item.73', 'Parts — Parts inventory: stock levels, vendors, adjustments.'),
                        t('manual.item.74', 'Assets — Equipment registry: every machine and its maintenance history.'),
                        t('manual.item.75', 'Procedures — SOP library: step-by-step instructions for any task.'),
                        '→ Logout — Signs you out and locks your shift log entries.'
                    ]
                },
                {
                    title: t('manual.sub.3', '1.4 Plant Selection'),
                    items: [
                        t('manual.item.76', 'The plant dropdown in the header controls which location\'s data you see.'),
                        t('manual.item.77', 'Your Home Plant is selected automatically. You have full read/write access.'),
                        t('manual.item.78', 'Other Plants: Admins can switch to view other plants. Data is read-only with a red warning banner.'),
                        'Corporate (All Sites): Admins see aggregated data across all 40+ facilities.'
                    ]
                },
                {
                    title: t('manual.sub.4', '1.5 Session Security'),
                    items: [
                        t('manual.item.79', 'Automatic Timeout: 15 minutes of inactivity triggers a warning. Click "Stay Logged In" or the system logs you out.'),
                        'Shift Log Lock: When you log out, your open shift log entries are automatically locked.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s2.title', 'Part 2: Starting Your Shift'),
            id: 'shift-start',
            navigateTo: '/dashboard',
            filePath: 'src/components/ShiftHandoff.jsx',
            icon: <Clock size={22} />,
            content: t('manual.s2.content', 'Reading the shift handoff, checking the dashboard, and seeing your assignments.'),
            subsections: [
                {
                    title: t('manual.sub.5', '2.1 The Shift Handoff Log'),
                    items: [
                        t('manual.item.80', 'The Shift Handoff Log is the digital replacement for the paper logbook at the front of the plant.'),
                        t('manual.item.81', 'Reading Previous Notes: From the Dashboard, read entries from the previous shift in the Shift Handoff card.'),
                        t('manual.item.82', 'Writing Your Entry: Click the text area and type your observations. Entries auto-save in real time.'),
                        t('manual.item.83', 'Once you log out, your entry is locked and cannot be edited except by administrators.'),
                        'A profanity filter is active on all shift log entries. Keep entries professional.'
                    ,
                        '',
                        t('manual.item.84', 'HOW TO USE THE SHIFT HANDOFF LOG:'),
                        t('manual.item.85', '1. Open the Shift Handoff page from the navigation.'),
                        t('manual.item.86', '2. The previous shift notes are displayed automatically.'),
                        t('manual.item.87', '3. Type your handoff notes in the text area — it auto-saves every 2 seconds.'),
                        t('manual.item.88', '4. Include: equipment status changes, pending work orders, safety concerns, and parts on order.'),
                        t('manual.item.89', '5. Your notes will be visible to the next shift when they log in.'),
                        '',
                        t('manual.item.90', 'BEST PRACTICES:'),
                        t('manual.item.91', '   • Always note any equipment running in degraded mode.'),
                        t('manual.item.92', '   • Flag any work orders that need priority attention from the incoming shift.'),
                        t('manual.item.93', '   • Include contact info if a vendor is expected on-site.'),
                        '',
                        t('manual.item.94', 'TROUBLESHOOTING:'),
                        t('manual.item.95', '   • Notes not saving? — Check your internet connection. Auto-save requires server access.'),
                        '   • Cannot see previous shift notes? — Handoff logs are per-plant. Verify your plant selection.'
                    ]
                },
                {
                    title: t('manual.sub.6', '2.2 Dashboard Stat Cards'),
                    items: [
                        t('manual.item.96', 'Work Orders — Total active work orders at your plant. Click to jump to Jobs.'),
                        t('manual.item.97', 'Equipment Assets — Total registered machines. Click to jump to Assets.'),
                        t('manual.item.98', 'Parts Catalog — Total parts in inventory. Click to jump to Parts.'),
                        'Active PM Schedules — Number of PM schedules running. Click to jump to the calendar.'
                    ]
                },
                {
                    title: t('manual.sub.7', '2.3 Checking Your Assignments'),
                    items: [
                        t('manual.item.99', '1. Click "Jobs" in the navigation bar.'),
                        t('manual.item.100', '2. In the "Assigned User" dropdown, select your name.'),
                        t('manual.item.101', '3. The list shows only work orders assigned to you.'),
                        t('manual.item.102', '[P1] Priority 1 — Emergency: Production is stopped. Drop everything.'),
                        t('manual.item.103', '[P2] Priority 2 — High: Needs attention today.'),
                        t('manual.item.104', '[P3] Priority 3 — Medium: Scheduled maintenance, complete this week.'),
                        '[P4] Priority 4 — Routine: Low urgency, complete when available.'
                    ]
                },
                {
                    title: t('manual.sub.8', '2.4 Using the Global Search'),
                    items: [
                        t('manual.item.105', '1. Type your search term in the Dashboard search bar (WO number, asset name, part number).'),
                        t('manual.item.106', '2. Press Enter.'),
                        '3. Results appear grouped by category. Click any result to jump to that record.'
                    ]
                },
                {
                    title: t('manual.sub.165', '2.5 Vendor Inflation Tile'),
                    items: [
                        t('manual.vendorInflation.item1', 'The Vendor Inflation tile on the Dashboard monitors part price drift at your plant over a rolling 365-day window.'),
                        t('manual.vendorInflation.item2', 'The tile header shows the total number of parts tracked and the average price drift percentage across all monitored items. If any parts are rising in price, a yellow badge appears showing the count.'),
                        t('manual.vendorInflation.item3', 'Below the header, the top three inflating parts are listed by name, vendor, and percentage change — giving you immediate visibility into your highest-cost-pressure items without opening a report.'),
                        t('manual.vendorInflation.item4', 'Click the tile to open the Vendor Price Drift detail modal. This modal shows the full list of drifting parts grouped by vendor, with columns for part name, unit cost change, and percentage drift. Use this to identify which vendors are driving price increases.'),
                        t('manual.vendorInflation.item5', 'Parts with a positive drift are shown in amber/red. Parts with negative drift (price drops) are shown in green — these represent negotiation wins or supply chain improvements.'),
                        t('manual.vendorInflation.item6', 'The modal includes a Print button that generates a formatted Vendor Price Drift report, suitable for purchasing reviews or vendor renegotiation meetings.'),
                        t('manual.vendorInflation.item7', 'The enterprise-wide view of vendor inflation (across all 40+ plants) is available in Corporate Analytics → OpEx Intel tab → Vendor Price Drift card.'),
                    ]
                }
            ]
        },
        {
            section: t('manual.s3.title', 'Part 3: Working a Job'),
            id: 'working-job',
            navigateTo: '/jobs',
            filePath: 'src/components/JobsView.jsx',
            icon: <ClipboardList size={22} />,
            content: t('manual.s3.content', 'Viewing work orders, updating status, following procedures, finding parts, and creating new jobs.'),
            subsections: [
                {
                    title: t('manual.sub.9', '3.1 Viewing a Work Order'),
                    items: [
                        t('manual.item.107', '1. Go to "Jobs" in the navigation.'),
                        t('manual.item.108', '2. Find your work order using search, filters, or scrolling.'),
                        t('manual.item.109', '3. Click "View" on the right side of the row.'),
                        '4. The detail screen shows: WO Number, Description, Asset, Priority, Status, Assigned Technician, Dates, Comments, Procedure, and Parts Used.'
                    ]
                },
                {
                    title: t('manual.sub.10', '3.2 Updating Status'),
                    items: [
                        t('manual.item.110', '1. Open the Work Order detail (click "View").'),
                        t('manual.item.111', '2. Click the Edit (pencil) button.'),
                        t('manual.item.112', '3. Change Status from "Open" to "Started".'),
                        t('manual.item.113', '4. Add a Comment describing what you found or are doing.'),
                        t('manual.item.114', '5. Click "Save Changes".'),
                        'Why This Matters: Changing to "Started" tells your supervisor you are actively working the job and clears emergency notifications.'
                    ]
                },
                {
                    title: t('manual.sub.11', '3.3 Following a Procedure (Task Checklist)'),
                    items: [
                        t('manual.item.115', '1. Open the Work Order.'),
                        t('manual.item.116', '2. Look for the "Tasks" or "Procedure" section.'),
                        t('manual.item.117', '3. Each step is listed in order with a checkbox.'),
                        t('manual.item.118', '4. Check off each step as you complete it.'),
                        '5. Progress saves automatically.'
                    ]
                },
                {
                    title: t('manual.sub.12', '3.4 Looking Up a Part'),
                    items: [
                        t('manual.item.119', '1. Click "Parts" in the navigation.'),
                        t('manual.item.120', '2. Type the part number or name in the Search bar.'),
                        t('manual.item.121', '3. Check "QTY On Hand" to see if it is in stock.'),
                        t('manual.item.122', '4. The "Location" column tells you where to find it (warehouse, aisle, bin).'),
                        '5. If out of stock — see Part V for how to search other plants.'
                    ]
                },
                {
                    title: t('manual.sub.13', '3.5 Creating a New Work Order'),
                    items: [
                        t('manual.item.123', '1. Go to "Jobs".'),
                        t('manual.item.124', '2. Click the green "+ New WO" button.'),
                        t('manual.item.125', '3. Select the Asset from the dropdown.'),
                        t('manual.item.126', '4. Enter a clear Description of the problem.'),
                        t('manual.item.127', '5. Set Priority (1=Emergency through 4=Routine).'),
                        t('manual.item.128', '6. Select Assigned To (yourself or another technician).'),
                        t('manual.item.129', '7. Click "Save Changes".'),
                        'Tip: Use the SCAN button to scan the asset barcode — it pre-fills the asset info automatically.'
                    ]
                },
                {
                    title: t('manual.sub.14', '3.6 Adding Notes & Printing'),
                    items: [
                        t('manual.item.130', 'Adding Notes: Open the WO, scroll to Comments, type your note, and click "Add Note". Notes are timestamped.'),
                        'Printing: Open the WO and click the Print button. A formatted print version appears. Use Ctrl+P to send to your printer.'
                    ]
                },
                {
                    title: t('manual.sub.15', '3.7 Photo & Video Attachments'),
                    items: [
                        t('manual.item.131', 'Attach photos, videos, and documents directly to any work order for documentation and evidence tracking.'),
                        '',
                        t('manual.item.132', 'ADDING ATTACHMENTS:'),
                        t('manual.item.133', '1. Open or create a Work Order and click Edit.'),
                        t('manual.item.134', '2. Scroll down to the Attachments section.'),
                        t('manual.item.135', '3. You can add files three ways:'),
                        t('manual.item.136', '   \u2022 Drag and Drop \u2014 Drag files from your computer onto the attachment drop zone.'),
                        t('manual.item.137', '   \u2022 Click Browse Files \u2014 Opens a file picker to select photos, videos, or documents.'),
                        t('manual.item.138', '   \u2022 Camera Capture \u2014 Click the camera icon to take a photo directly from your device.'),
                        t('manual.item.139', '4. Supported file types: JPEG, PNG, GIF, WebP, MP4, MOV, AVI, WebM, PDF, DOC, and more.'),
                        t('manual.item.140', '5. Maximum file size: 50 MB per attachment.'),
                        '',
                        t('manual.item.141', 'VIEWING ATTACHMENTS:'),
                        t('manual.item.142', '   \u2022 Thumbnails display below the work order details.'),
                        t('manual.item.143', '   \u2022 Click any image to open full-size preview.'),
                        t('manual.item.144', '   \u2022 Video files play inline with controls.'),
                        t('manual.item.145', '   \u2022 PDF and document files download when clicked.'),
                        '',
                        t('manual.item.146', 'DELETING ATTACHMENTS:'),
                        t('manual.item.147', '   \u2022 Click the trash icon on any attachment thumbnail.'),
                        t('manual.item.148', '   \u2022 A styled confirmation dialog appears matching the Trier OS theme.'),
                        t('manual.item.149', '   \u2022 Deleting is permanent.'),
                        '',
                        t('manual.item.150', 'BEST PRACTICES:'),
                        t('manual.item.151', '   \u2022 Take before and after photos of all repairs.'),
                        t('manual.item.152', '   \u2022 Video-record complex disassembly procedures for training reference.'),
                        t('manual.item.153', '   \u2022 Attach nameplate photos for quick reference during parts ordering.'),
                        '',
                        t('manual.item.154', 'TROUBLESHOOTING:'),
                        t('manual.item.155', '   \u2022 Upload fails? \u2014 Check file size (50 MB limit) and file type.'),
                        t('manual.item.156', '   \u2022 Camera not working? \u2014 Browser must have camera permission granted.'),
                        '   \u2022 Photos appear rotated? \u2014 Try re-taking in landscape mode.'
                    ]
                },
                {
                    title: t('manual.sub.16', '3.8 Failure / Cause / Remedy Codes'),
                    items: [
                        t('manual.item.157', 'Document root causes and corrective actions on every work order using standardized Failure/Cause/Remedy codes.'),
                        '',
                        t('manual.item.158', 'WHY USE FAILURE CODES:'),
                        t('manual.item.159', '   \u2022 Builds a searchable history of equipment failures across your entire operation.'),
                        t('manual.item.160', '   \u2022 Powers reliability analytics \u2014 identify repeat failures and track MTBF trends.'),
                        t('manual.item.161', '   \u2022 Enables FMEA (Failure Mode and Effects Analysis) directly from real operational data.'),
                        '',
                        t('manual.item.162', 'ADDING FAILURE CODES:'),
                        t('manual.item.163', '1. Open a Work Order and click Edit.'),
                        t('manual.item.164', '2. Scroll down to the Failure / Cause / Remedy section.'),
                        t('manual.item.165', '3. Select from the library dropdowns:'),
                        t('manual.item.166', '   \u2022 Failure Code \u2014 What broke? (e.g., Bearing Failure, Electrical Short)'),
                        t('manual.item.167', '   \u2022 Cause Code \u2014 Why? (e.g., Normal Wear, Operator Error, Contamination)'),
                        t('manual.item.168', '   \u2022 Remedy Code \u2014 What was done? (e.g., Replaced Component, Adjusted Settings)'),
                        t('manual.item.169', '4. Add optional notes for additional context.'),
                        t('manual.item.170', '5. Click + Add Code to save the entry.'),
                        '',
                        t('manual.item.171', 'MULTIPLE ENTRIES:'),
                        t('manual.item.172', '   \u2022 You can add multiple failure code entries per work order.'),
                        t('manual.item.173', '   \u2022 Each entry is independently tracked and deletable.'),
                        '',
                        t('manual.item.174', 'TROUBLESHOOTING:'),
                        t('manual.item.175', '   \u2022 Dropdown is empty? \u2014 The failure code library needs to be populated by an admin.'),
                        '   \u2022 Cannot delete an entry? \u2014 You must be in Edit mode on the work order.'
                    ]
                },
                {
                    title: t('manual.sub.17', '3.9 Labor Timer'),
                    items: [
                        t('manual.item.176', 'Track job duration automatically with the built-in labor timer on every work order.'),
                        '',
                        t('manual.item.177', 'USING THE TIMER:'),
                        t('manual.item.178', '1. Open the Work Order you are about to start.'),
                        t('manual.item.179', '2. Click the Start Timer button (clock icon).'),
                        t('manual.item.180', '3. The timer runs in real-time, even if you navigate away.'),
                        t('manual.item.181', '4. When done, click Stop Timer.'),
                        t('manual.item.182', '5. The elapsed time auto-fills into labor hours during close-out.'),
                        '',
                        t('manual.item.183', 'IMPORTANT NOTES:'),
                        t('manual.item.184', '   \u2022 The timer runs in your browser \u2014 closing your browser resets the timer.'),
                        t('manual.item.185', '   \u2022 You can manually adjust hours during the Close-Out Wizard.'),
                        t('manual.item.186', '   \u2022 Multiple technicians should each use their own timer on their own device.'),
                        '',
                        t('manual.item.187', 'TROUBLESHOOTING:'),
                        t('manual.item.188', '   \u2022 Timer hours seem wrong? \u2014 The timer captures wall-clock time including breaks. Adjust manually.'),
                        '   \u2022 Timer not visible? \u2014 Make sure you are viewing the WO in detail view (click View).'
                    ]
                }
            ]
        },
        {
            section: t('manual.s4.title', 'Part 4: Closing a Job — The Close-Out Wizard'),
            id: 'close-out',
            navigateTo: '/jobs',
            filePath: 'src/components/JobsView.jsx',
            icon: <CheckCircle size={22} />,
            content: t('manual.s4.content', 'Closing a job properly is critical — it tracks costs, deducts parts from inventory, and builds predictive maintenance history.'),
            subsections: [
                {
                    title: t('manual.sub.18', '4.1 Opening the Close-Out Wizard'),
                    items: [
                        t('manual.item.189', '1. Open the completed Work Order.'),
                        t('manual.item.190', '2. Click the "Close Work Order" button (green, at the bottom).'),
                        '3. The Close-Out Wizard opens as a multi-step form.'
                    ]
                },
                {
                    title: t('manual.sub.19', '4.2 Step 1 — Labor'),
                    items: [
                        t('manual.item.191', '1. Click "Add Labor Entry".'),
                        t('manual.item.192', '2. Select the Employee who performed the work.'),
                        t('manual.item.193', '3. Enter Regular Hours, Overtime Hours, and Double-Time Hours as applicable.'),
                        t('manual.item.194', '4. Repeat for each person who worked on this job.'),
                        'Why: Labor hours feed cost reports and calculate Mean Time To Repair (MTTR).'
                    ,
                        '',
                        t('manual.item.195', 'DETAILED LABOR ENTRY GUIDE:'),
                        t('manual.item.196', '   • Regular Hours: Enter straight-time hours (e.g., 2.5 for two and a half hours).'),
                        t('manual.item.197', '   • Overtime Hours: Any hours beyond the standard shift. Tracked separately for cost analysis.'),
                        t('manual.item.198', '   • Pay Rates: Enter the regular hourly rate. Overtime rate auto-calculates at 1.5x.'),
                        t('manual.item.199', '   • Timer Integration: If you used the Job Timer, hours are pre-filled automatically.'),
                        t('manual.item.200', '   • Multiple Technicians: Click "+ Add Labor" for each person who worked the job.'),
                        t('manual.item.201', '   • Comments: Add notes like "Called in from home" or "Training a new tech."'),
                        '',
                        t('manual.item.202', 'TROUBLESHOOTING:'),
                        t('manual.item.203', '   • Timer hours seem wrong? — The timer captures wall-clock time. Adjust manually if you took breaks.'),
                        t('manual.item.204', '   • Cannot find a technician in the dropdown? — They must be in the system as a registered user.'),
                        '   • Draft data disappeared? — Drafts are saved per work order. Clear browser data clears drafts.'
                    ]
                },
                {
                    title: t('manual.sub.20', '4.3 Step 2 — Parts Used'),
                    items: [
                        t('manual.item.205', '1. Click "Add Part".'),
                        t('manual.item.206', '2. Search for and select the part.'),
                        t('manual.item.207', '3. Enter the Quantity Used.'),
                        t('manual.item.208', '4. Unit cost auto-fills from the database.'),
                        t('manual.item.209', '5. Repeat for every part consumed.'),
                        'Important: Adding parts here automatically deducts them from your plant\'s inventory.'
                    ,
                        '',
                        t('manual.item.210', 'DETAILED PARTS ENTRY GUIDE:'),
                        t('manual.item.211', '   • Search by part number, description, or keyword.'),
                        t('manual.item.212', '   • If no search text is entered, the "Most Frequently Used" parts are shown for quick add.'),
                        t('manual.item.213', '   • Click any part in the dropdown to add it to the close-out.'),
                        t('manual.item.214', '   • Adjust the "Qty Used" field for each part.'),
                        t('manual.item.215', '   • Stock levels are shown so you know what is available.'),
                        t('manual.item.216', '   • Parts consumed here automatically deduct from inventory.'),
                        '',
                        t('manual.item.217', 'TROUBLESHOOTING:'),
                        t('manual.item.218', '   • Part not found? — Check spelling or search by partial description.'),
                        t('manual.item.219', '   • Stock shows 0 but you used one? — Enter it anyway. Inventory will go negative (flags a count issue).'),
                        '   • Accidentally added wrong part? — Click the X icon to remove it before submitting.'
                    ]
                },
                {
                    title: t('manual.sub.21', '4.4 Step 3 — Misc Costs & Downtime'),
                    items: [
                        t('manual.item.220', 'Misc Costs: Add external expenses (crane rental, contractor fees, specialty tools).'),
                        t('manual.item.221', 'Downtime: Enter actual hours the machine was out of production.'),
                        'Resolution: Select the type (Repaired, Replaced, Temporary Fix, etc.) and write a brief summary.'
                    ]
                },
                {
                    title: t('manual.sub.22', '4.5 Step 4 — Signature & Completion'),
                    items: [
                        t('manual.item.222', '1. Sign your name in the Signature field.'),
                        t('manual.item.223', '2. Review all entered data.'),
                        t('manual.item.224', '3. Click "Execute Close-Out".'),
                        t('manual.item.225', '4. The work order status changes to "Closed" and all costs are permanently recorded.'),
                        'Once closed, a work order cannot be re-opened. If you made a mistake, contact your supervisor.'
                    ]
                }
            ]
        },
        {
            section: t('manual.zeroScan.title', 'Part IV-B: Zero-Keyboard Work Order Scanner'),
            id: 'zero-keyboard-scan',
            navigateTo: '/scanner',
            filePath: 'src/components/ScannerWorkspace.jsx',
            icon: <Scan size={22} />,
            content: t('manual.zeroScan.content', 'The shop-floor scan system lets a technician open, update, hold, escalate, or close a work order by scanning an asset barcode and tapping a single button — no keyboard, no typing, no navigation required. Built for Zebra TC77/TC78 hardware scanners and gloved environments.'),
            subsections: [
                {
                    title: t('manual.zeroScan.sub1', 'IV-B.1 How It Works — The Scan State Machine'),
                    items: [
                        t('manual.zeroScan.item1', 'Navigate to /scanner (the Scan tile in Mission Control). The server owns all workflow logic — the device only captures the barcode and displays tap buttons.'),
                        t('manual.zeroScan.item2', 'Three capture modes: (1) Hardware wedge scanner (Zebra TC77/TC78) — point and pull trigger, the barcode lands automatically; (2) Camera scan — tap the camera icon and aim at the label; (3) Numeric fallback — type a short asset code when the label is damaged.'),
                        t('manual.zeroScan.item3', 'After capture, a 1-second confirmation flash shows the asset name and current WO state — prevents wrong-asset errors on camera devices where aiming is less precise.'),
                        t('manual.zeroScan.item4', 'The server evaluates the asset state and returns a branch code. The device renders the correct tap-only action set for that branch — no client-side logic.'),
                    ]
                },
                {
                    title: t('manual.zeroScan.sub2', 'IV-B.2 What Happens After Each Scan'),
                    items: [
                        t('manual.zeroScan.item5', 'No active WO on asset → System AUTO-CREATES a new Open work order immediately. A green confirmation screen appears — no form filling required.'),
                        t('manual.zeroScan.item6', 'Active WO, you are the assigned tech (SOLO) → Tap: Close WO | Mark Waiting | Escalate | Continue Later.'),
                        t('manual.zeroScan.item7', 'Active WO, multiple techs (MULTI_TECH) → Tap: Leave Work | Close for Team | Mark Waiting | Escalate | Continue Later.'),
                        t('manual.zeroScan.item8', 'Active WO, assigned to a different tech → Tap: Join Team | Take Over | Escalate.'),
                        t('manual.zeroScan.item9', 'WO exists but is in Waiting status → Tap: Resume Waiting WO | Create New WO | View Status.'),
                        t('manual.zeroScan.item10', 'WO is Escalated → Tap: Join Response | Take Over Response | View Status.'),
                        t('manual.zeroScan.item11', 'Duplicate scan (same scanId already processed) → Rejected silently. Prevents accidental double-processing if the gun fires twice.'),
                    ]
                },
                {
                    title: t('manual.zeroScan.sub3', 'IV-B.3 Hold Reasons — Tap Only, No Typing'),
                    items: [
                        t('manual.zeroScan.item12', 'When you tap "Mark Waiting", a secondary hold-reason picker appears. All choices are tap buttons:'),
                        t('manual.zeroScan.item13', '  • Waiting on Parts (PM-exempt)'),
                        t('manual.zeroScan.item14', '  • Waiting on Vendor (PM-exempt)'),
                        t('manual.zeroScan.item15', '  • Waiting on Approval (PM-exempt)'),
                        t('manual.zeroScan.item16', '  • Scheduled Return — triggers a second picker for the return window (Later This Shift / Next Shift / Tomorrow)'),
                        t('manual.zeroScan.item17', '  • Continue Later'),
                        t('manual.zeroScan.item18', '  • Shift End — Unresolved'),
                        t('manual.zeroScan.item19', 'PM-exempt reasons prevent the WO from aging against PM compliance metrics while the hold is active.'),
                    ]
                },
                {
                    title: t('manual.zeroScan.sub4', 'IV-B.4 Supervisor Review Queue (Mission Control)'),
                    items: [
                        t('manual.zeroScan.item20', 'Escalated WOs and flagged scan events surface in the Mission Control Needs Review queue. Supervisors see them without leaving the desk.'),
                        t('manual.zeroScan.item21', 'Desk actions available for each flagged WO: Close (supervisor override), Resume (revert to active), Dismiss (clear the flag without status change).'),
                        t('manual.zeroScan.item22', 'Every scan event is logged to ScanAuditLog with: scanId, assetId, userId, previous state, next state, decision branch, device timestamp, and server timestamp. The log is immutable.'),
                    ]
                },
                {
                    title: t('manual.zeroScan.sub5', 'IV-B.5 Offline Mode'),
                    items: [
                        t('manual.zeroScan.item23', 'Scan events captured while offline are queued in IndexedDB on the device.'),
                        t('manual.zeroScan.item24', 'When connectivity is restored, POST /api/scan/offline-sync replays the queue in order. Each event is processed exactly as if it arrived live — the server resolves any state conflicts that emerged while the device was disconnected.'),
                        t('manual.zeroScan.item25', 'The conflict resolution rules prioritize: (1) Explicit close, (2) Escalation, (3) Waiting, (4) Continue Later. The resolvedMode and conflictAutoResolved fields in ScanAuditLog record how each conflict was settled.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s5.title', 'Part 5: Finding What You Need'),
            id: 'finding',
            navigateTo: '/parts',
            filePath: 'src/components/StoreroomView.jsx',
            icon: <Search size={22} />,
            content: t('manual.s5.content', 'Using the scanner, searching parts at your plant and across all 40+ facilities, adjusting inventory, and OCR snap-to-add.'),
            subsections: [
                {
                    title: t('manual.sub.23', '5.1 The Smart Scanner'),
                    items: [
                        t('manual.item.226', 'Click SCAN in the header to open the camera-based scanner.'),
                        t('manual.item.227', 'Scan asset tags to jump to that asset\'s record.'),
                        t('manual.item.228', 'Scan part labels to see stock levels and vendor info.'),
                        t('manual.item.229', 'Scan printed work order barcodes to find the job instantly.'),
                        t('manual.item.230', 'If no record exists, you can create a new asset or part from the scan.'),
                        'Tip: Wipe your camera lens in cold environments — frost causes focus issues.'
                    ]
                },
                {
                    title: t('manual.sub.24', '5.2 Searching Parts at Your Plant'),
                    items: [
                        t('manual.item.231', '1. Click "Parts" in the navigation.'),
                        t('manual.item.232', '2. Type your search term.'),
                        t('manual.item.233', '3. Results show: Part ID, Description, QTY On Hand, Location, Unit Cost, Vendor.'),
                        '4. Click any part for full details including substitutes.'
                    ]
                },
                {
                    title: t('manual.sub.25', '5.3 Global Logistics — Finding Parts at Other Plants'),
                    items: [
                        t('manual.item.234', '1. Go to the Parts page.'),
                        t('manual.item.235', '2. Click the "Global Logistics" tab.'),
                        t('manual.item.236', '3. Search by part description or number.'),
                        t('manual.item.237', '4. Results show which plants have it, quantity, and unit cost.'),
                        '5. Click "Request Transfer" to start getting the part from a sister plant.'
                    ]
                },
                {
                    title: t('manual.sub.26', '5.4 Asset Logistics — Finding Equipment Enterprise-Wide'),
                    items: [
                        t('manual.item.238', '1. Go to the Assets page.'),
                        t('manual.item.239', '2. Click the "Asset Logistics" tab.'),
                        t('manual.item.240', '3. Search by asset description, model, or manufacturer.'),
                        '4. Results show location, operational status (In Production vs. Spare), and plant.'
                    ]
                },
                {
                    title: t('manual.sub.27', '5.5 Adjusting Inventory Levels'),
                    items: [
                        t('manual.item.241', '1. Go to Parts and find the part that needs correction.'),
                        t('manual.item.242', '2. Click "Adjust Stock".'),
                        t('manual.item.243', '3. Enter the new quantity.'),
                        t('manual.item.244', '4. Select a Reason (Cycle Count, Correction, Damage, Found Stock, etc.).'),
                        '5. Click "Update". The adjustment is recorded in the audit trail.'
                    ]
                },
                {
                    title: t('manual.sub.28', '5.6 OCR Snap-to-Add'),
                    items: [
                        t('manual.item.245', '1. Take a photo of an equipment nameplate.'),
                        t('manual.item.246', '2. The OCR engine reads model, serial number, and manufacturer from the photo.'),
                        t('manual.item.247', '3. Review the extracted fields.'),
                        '4. Click "Create Asset" or "Create Part" to add it with pre-filled data.'
                    ]
                },
                {
                    title: t('manual.sub.29', '5.7 Part Photo & File Attachments'),
                    items: [
                        t('manual.item.248', 'Attach photos, videos, and reference documents directly to any part record.'),
                        '',
                        t('manual.item.249', 'HOW TO ADD ATTACHMENTS:'),
                        t('manual.item.250', '1. Open a part by clicking it in the Parts table.'),
                        t('manual.item.251', '2. Scroll down to the Photos & Files section.'),
                        t('manual.item.252', '3. Drag and drop files, click Browse or use the Camera button.'),
                        t('manual.item.253', '4. Supported types: JPEG, PNG, GIF, WebP, MP4, MOV, PDF, DOC, and more.'),
                        t('manual.item.254', '5. Maximum file size: 50 MB per attachment.'),
                        '',
                        'USE CASES:',
                        t('manual.item.255', '   \u2022 Attach a photo of the actual part for visual identification.'),
                        t('manual.item.256', '   \u2022 Upload the manufacturer data sheet or spec PDF.'),
                        t('manual.item.257', '   \u2022 Take a photo of the shelf label showing bin location.'),
                        t('manual.item.258', '   \u2022 Attach nameplate photos of equipment that uses this part.'),
                        '',
                        t('manual.item.259', 'TROUBLESHOOTING:'),
                        t('manual.item.260', '   \u2022 Upload fails? \u2014 Check file size (50 MB limit) and file type.'),
                        '   \u2022 Photos not showing? \u2014 Refresh the page. Thumbnails load on demand.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s6.title', 'Part 6: Preventive Maintenance & Scheduling'),
            id: 'pm-scheduling',
            navigateTo: '/jobs',
            filePath: 'server/routes/pmSchedules.js',
            icon: <Calendar size={22} />,
            content: t('manual.s6.content', 'The PM calendar, how PM triggers work, implementing procedures, and calendar reminders.'),
            subsections: [
                {
                    title: t('manual.sub.30', '6.1 The PM Calendar'),
                    items: [
                        t('manual.item.261', '1. Click "Jobs" then select the "Calendar" tab.'),
                        t('manual.item.262', '2. The calendar shows all scheduled PMs by date.'),
                        t('manual.item.263', '3. Overdue PMs are highlighted in red.'),
                        '4. Click any PM entry to see its details.'
                    ,
                        '',
                        t('manual.item.264', 'UNDERSTANDING THE CALENDAR:'),
                        t('manual.item.265', '   • Each colored sticky note represents a scheduled PM job.'),
                        t('manual.item.266', '   • Colors indicate status: Green = On Time, Yellow = Due Soon, Red = Overdue.'),
                        t('manual.item.267', '   • Click any sticky note to view the full PM details and linked work order.'),
                        t('manual.item.268', '   • The top-right shows the count of active PM schedules.'),
                        '',
                        t('manual.item.269', 'TROUBLESHOOTING:'),
                        t('manual.item.270', '   • Calendar is empty? — No PM schedules have been created yet. Go to Jobs to create one.'),
                        t('manual.item.271', '   • PM not generating work orders? — Check that the PM schedule is set to "Active" status.'),
                        '   • Wrong frequency? — Edit the PM schedule and adjust the interval (daily, weekly, monthly, or by meter).'
                    ]
                },
                {
                    title: t('manual.sub.31', '6.2 How PMs Work'),
                    items: [
                        t('manual.item.272', 'Time-Based: PM comes due every X days (e.g., "Inspect fire extinguishers every 30 days").'),
                        t('manual.item.273', 'Meter-Based: PM comes due after X runtime hours or cycles (e.g., "Change oil every 500 hours").'),
                        t('manual.item.274', 'Dual Trigger: PM comes due at whichever happens first — time OR meter.'),
                        'When a PM comes due, the system automatically creates a work order tagged [PM-AUTO] or [PM-METER].'
                    ]
                },
                {
                    title: t('manual.sub.32', '6.3 Implementing a Procedure'),
                    items: [
                        t('manual.item.275', 'The "Implement" button on the Procedures page creates a real Work Order from a procedure template.'),
                        t('manual.item.276', 'Think of a Procedure as the recipe — Implement puts it on the stove.'),
                        t('manual.item.277', '1. Go to Procedures.'),
                        t('manual.item.278', '2. Find the procedure and click "Implement".'),
                        t('manual.item.279', '3. Select the Asset this procedure applies to.'),
                        t('manual.item.280', '4. Set the Schedule (date, frequency, or meter trigger).'),
                        '5. Click "Create" — the system now auto-generates work orders on schedule.'
                    ,
                        '',
                        t('manual.item.281', 'BUILDING AN EFFECTIVE SOP:'),
                        t('manual.item.282', '1. Define a clear, specific title (e.g., "Quarterly Belt Inspection - Conveyor #4").'),
                        t('manual.item.283', '2. Break the work into numbered steps — each step should be one action.'),
                        t('manual.item.284', '3. List required parts and consumables with quantities.'),
                        t('manual.item.285', '4. List required tools (wrenches, meters, PPE).'),
                        t('manual.item.286', '5. Include safety warnings at the appropriate steps (e.g., "LOTO required before step 3").'),
                        t('manual.item.287', '6. Set estimated duration for planning purposes.'),
                        '',
                        t('manual.item.288', 'AI SOP GENERATOR:'),
                        t('manual.item.289', '   • Click "Generate SOP with AI" to auto-create procedures.'),
                        t('manual.item.290', '   • Provide the equipment type and maintenance type — AI generates a complete procedure.'),
                        t('manual.item.291', '   • Always review and customize AI-generated SOPs for your specific equipment.'),
                        '',
                        t('manual.item.292', 'TROUBLESHOOTING:'),
                        t('manual.item.293', '   • SOP steps not saving? — Each step must have text content. Empty steps are not saved.'),
                        '   • AI generator not working? — Ensure you have an internet connection for the AI service.'
                    ]
                },
                {
                    title: t('manual.sub.33', '6.4 SOP Photo & Document Attachments'),
                    items: [
                        t('manual.item.294', 'Attach reference photos, diagrams, and documents to any SOP or procedure template.'),
                        '',
                        t('manual.item.295', 'HOW TO ADD ATTACHMENTS:'),
                        t('manual.item.296', '1. Open a procedure from the SOPs tab.'),
                        t('manual.item.297', '2. Scroll down below the task steps to the Photos & Files section.'),
                        t('manual.item.298', '3. Drag and drop files, click Browse, or use the Camera button.'),
                        t('manual.item.299', '4. Supported types: JPEG, PNG, WebP, MP4, PDF, DOC, and more.'),
                        '',
                        'USE CASES:',
                        t('manual.item.300', '   \u2022 Attach step-by-step photos showing how to perform each task.'),
                        t('manual.item.301', '   \u2022 Upload manufacturer service manuals or technical bulletins.'),
                        t('manual.item.302', '   \u2022 Add safety diagrams or LOTO placards as reference images.'),
                        t('manual.item.303', '   \u2022 Include wiring diagrams or exploded parts views.'),
                        '',
                        t('manual.item.304', 'BEST PRACTICES:'),
                        t('manual.item.305', '   \u2022 Number your photos to match procedure step numbers.'),
                        t('manual.item.306', '   \u2022 Use landscape orientation for clearer detail on mobile.'),
                        '   \u2022 Attach the OEM manual PDF so technicians have it at the machine.'
                    ]
                },
                {
                    title: t('manual.sub.34', '6.5 Calendar Sticky Notes'),
                    items: [
                        t('manual.item.307', '1. Click on any date in the calendar.'),
                        t('manual.item.308', '2. Type your reminder (e.g., "Vendor arriving at 10AM").'),
                        t('manual.item.309', '3. Click "Add Reminder". The note appears as a colored sticky note.'),
                        '4. Check it off as "Completed" when done.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s7.title', 'Part 7: Communicating Across the Enterprise'),
            id: 'communication',
            navigateTo: '/chat',
            filePath: 'src/components/ChatView.jsx',
            icon: <MessageCircle size={22} />,
            content: t('manual.s7.content', 'Plant-to-plant chat, push-to-talk, notifications, webhooks, and email alerts.'),
            subsections: [
                {
                    title: t('manual.sub.35', '7.1 Plant-to-Plant Chat'),
                    items: [
                        t('manual.item.310', '1. Go to "Chat" in the navigation.'),
                        t('manual.item.311', '2. Click "Create New Topic".'),
                        t('manual.item.312', '3. Enter a descriptive title (e.g., "VFD Trip Codes on Boiler Feed Pump").'),
                        t('manual.item.313', '4. Write your message, optionally attach photos or documents with attach files.'),
                        '5. Submit your post. Your plant name and username appear with the message.'
                    ,
                        '',
                        t('manual.item.314', 'CHAT FEATURES IN DETAIL:'),
                        t('manual.item.315', '   • Messages are organized by plant — select which plant channel to view.'),
                        t('manual.item.316', '   • Messages persist and are visible to all users at that plant.'),
                        t('manual.item.317', '   • File attachments supported — share photos, documents, or spreadsheets.'),
                        t('manual.item.318', '   • Messages are timestamped with sender name and role.'),
                        '',
                        t('manual.item.319', 'TROUBLESHOOTING:'),
                        t('manual.item.320', '   • Cannot see messages? — You must be assigned to the plant to see its chat channel.'),
                        '   • Message not sending? — Check your internet connection. Messages queue if offline.'
                    ]
                },
                {
                    title: t('manual.sub.36', '7.2 Push-to-Talk (Voice-to-Text)'),
                    items: [
                        t('manual.item.321', '1. Press and hold the Microphone button in any message box.'),
                        t('manual.item.322', '2. Speak clearly into your device.'),
                        t('manual.item.323', '3. Release the button. Speech is converted to text.'),
                        '4. Review and send. Ideal for gloves-on or dirty environments.'
                    ]
                },
                {
                    title: t('manual.sub.37', '7.3 Notifications (The Bell)'),
                    items: [
                        t('manual.item.324', 'The Bell icon shows unread alerts.'),
                        t('manual.item.325', '[ALERT] Emergency Work Order Created — Priority 1 needs immediate attention.'),
                        t('manual.item.326', 'PM Due Today — A scheduled PM is ready.'),
                        t('manual.item.327', '[YES] Work Order Completed — A tracked job has been closed.'),
                        t('manual.item.328', 'Transfer Request — Another plant needs a part from you.'),
                        'To permanently clear a notification, take action on the underlying item.'
                    ]
                },
                {
                    title: t('manual.sub.38', '7.4 Webhook & Email Alerts'),
                    items: [
                        t('manual.item.329', 'Webhooks: Your plant can send real-time alerts to Slack, Microsoft Teams, or Discord. Configured by IT in Settings.'),
                        'Email: SMTP email alerts for critical events — configurable per-plant and per-user in Settings.'
                    ,
                        '',
                        t('manual.item.330', 'SETTING UP WEBHOOK ALERTS:'),
                        t('manual.item.331', '   • Webhooks send automated notifications to Slack, Microsoft Teams, or Discord.'),
                        t('manual.item.332', '   • Go to Settings > Integrations > Webhooks.'),
                        t('manual.item.333', '   • Enter the webhook URL from your chat platform.'),
                        t('manual.item.334', '   • Select which events trigger notifications (new WO, emergency, PM due, etc.).'),
                        t('manual.item.335', '   • Test the webhook to confirm delivery.'),
                        '',
                        t('manual.item.336', 'SUPPORTED PLATFORMS:'),
                        t('manual.item.337', '   • Slack — Use an Incoming Webhook URL.'),
                        t('manual.item.338', '   • Microsoft Teams — Use a Connector Webhook URL.'),
                        t('manual.item.339', '   • Discord — Use a Discord Webhook URL.'),
                        t('manual.item.340', '   • Custom — Any HTTP endpoint that accepts POST requests.'),
                        '',
                        t('manual.item.341', 'TROUBLESHOOTING:'),
                        t('manual.item.342', '   • Webhook not firing? — Verify the URL is correct and the platform has not disabled the webhook.'),
                        t('manual.item.343', '   • Duplicate alerts? — Check that you do not have both webhook AND email enabled for the same event.'),
                        '   • Webhook returns errors? — Check the webhook log in Settings for response codes.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s8.title', 'Part 8: Training Scenarios — Real-World Walkthroughs'),
            id: 'scenarios',
            navigateTo: '/training',
            filePath: 'src/components/TrainingView.jsx',
            icon: <Lightbulb size={22} />,
            content: t('manual.s8.content', 'Real-world paths through the application for common maintenance situations.'),
            scenarios: [
                {
                    name: t('manual.scenario.1.name', 'SCENARIO 1: Emergency Line Breakdown'),
                    description: t('manual.scenario.0.desc', 'A critical conveyor motor has burned out. Production is stopped.'),
                    steps: [
                        t('manual.item.344', '1. Create an EMERGENCY Work Order (Jobs → + New WO, Priority 1).'),
                        t('manual.item.345', '2. Search Inventory for a replacement motor (Parts → Search).'),
                        t('manual.item.346', '3. If zero stock, use Global Logistics to find one at a sister plant.'),
                        t('manual.item.347', '4. Post in Chat: "URGENT PART REQUEST: [Motor] for [Your Plant]".'),
                        t('manual.item.348', '5. Once the motor arrives, perform the repair.'),
                        t('manual.item.349', '6. Open the Close-Out Wizard — add labor, parts, downtime, and resolution.'),
                        '7. Sign and Execute Close-Out.'
                    ]
                },
                {
                    name: t('manual.scenario.2.name', 'SCENARIO 2: Annual Asset Audit'),
                    description: t('manual.scenario.1.desc', 'Quality Control needs all PMs for the Main Boiler over the last 12 months.'),
                    steps: [
                        t('manual.item.350', '1. Go to the "History" tab.'),
                        t('manual.item.351', '2. Filter by Asset: select the boiler.'),
                        t('manual.item.352', '3. Set Date Range to the past 12 months.'),
                        '4. Click "Print" to generate the audit report.'
                    ]
                },
                {
                    name: t('manual.scenario.3.name', 'SCENARIO 3: Onboarding a New Technician'),
                    description: t('manual.scenario.2.desc', 'Train a new lead tech on how to use the system for daily tasks.'),
                    steps: [
                        t('manual.item.353', '1. Show them the "Jobs" page and the "Assigned User" filter.'),
                        t('manual.item.354', '2. Demonstrate View → Edit → change status to "Started".'),
                        t('manual.item.355', '3. Walk through the Close-Out Wizard on a completed job.'),
                        t('manual.item.356', '4. Show them Chat and how to search past solutions.'),
                        '5. Have them practice scanning an asset tag with the SCAN button.'
                    ]
                },
                {
                    name: t('manual.scenario.4.name', 'SCENARIO 4: Correcting an Inventory Count'),
                    description: t('manual.scenario.3.desc', 'You count 10 motors on the shelf, but the system shows 2.'),
                    steps: [
                        t('manual.item.357', '1. Go to Parts and search for the motor.'),
                        t('manual.item.358', '2. Click "Adjust Stock".'),
                        t('manual.item.359', '3. Enter the correct count: 10.'),
                        t('manual.item.360', '4. Select reason: "Manual Cycle Count".'),
                        '5. Click "Update" — the system records the adjustment with your name.'
                    ]
                },
                {
                    name: t('manual.scenario.5.name', 'SCENARIO 5: Design Flaw Reporting'),
                    description: t('manual.scenario.4.desc', 'A part keeps breaking every 2 months. Alert Corporate Engineering.'),
                    steps: [
                        t('manual.item.361', '1. Go to Chat and create a topic: "DESIGN ALERT: [Part] Failing Prematurely".'),
                        t('manual.item.362', '2. Attach your recent work order history showing the pattern.'),
                        t('manual.item.363', '3. Tag Corporate Engineering.'),
                        '4. The Predictive Foresight system may also auto-flag this via MTBF analysis.'
                    ]
                },
                {
                    name: t('manual.scenario.6.name', 'SCENARIO 6: Machine Decommissioning'),
                    description: t('manual.scenario.5.desc', 'The old sorter is being scrapped and needs to be archived.'),
                    steps: [
                        t('manual.item.364', '1. Go to Assets and find the sorter.'),
                        t('manual.item.365', '2. Open its detail view.'),
                        t('manual.item.366', '3. Click "Change Status" → "Decommissioned".'),
                        '4. The asset is archived — no new WOs can be created, but all history is preserved.'
                    ]
                },
                {
                    name: t('manual.scenario.7.name', 'SCENARIO 7: Cross-Plant Tool Lending'),
                    description: t('manual.scenario.6.desc', 'Another plant needs your specialty alignment laser.'),
                    steps: [
                        t('manual.item.367', '1. Go to Chat and respond to the tool request.'),
                        t('manual.item.368', '2. Use the Logistics view to create a Transfer Task.'),
                        '3. Mark the tool as "Checked Out" in your local registry to track its location.'
                    ]
                }
            ]
        },

        {
            section: t('manual.s9.title', 'Part 9: Fleet & Truck Shop'),
            id: 'fleet',
            navigateTo: '/fleet',
            filePath: 'src/components/FleetView.jsx',
            icon: <Settings2 size={22} />,
            content: t('manual.s9.content', 'Manage your fleet vehicles, inspections, fuel tracking, tires, CDL licenses, and DOT compliance.'),
            subsections: [
                {
                    title: t('manual.sub.39', '8.1 Fleet Overview'),
                    items: [
                        t('manual.item.369', 'Fleet & Truck Shop is a complete vehicle management module with 6 tabs:'),
                        t('manual.item.370', '   \u2022 Vehicles \u2014 Fleet inventory, status tracking, and service history.'),
                        t('manual.item.371', '   \u2022 DVIR \u2014 Driver Vehicle Inspection Reports (pre-trip/post-trip).'),
                        t('manual.item.372', '   \u2022 Fuel Log \u2014 Fill-up tracking with MPG calculations.'),
                        t('manual.item.373', '   \u2022 Tires \u2014 Tire inventory, tread depth readings, and position tracking.'),
                        t('manual.item.374', '   \u2022 CDL / Licenses \u2014 Driver license and medical card expiry monitoring.'),
                        t('manual.item.375', '   \u2022 DOT Inspections \u2014 Federal DOT inspection records with violation tracking.'),
                        '',
                        t('manual.item.376', 'HOW TO ACCESS:'),
                        t('manual.item.377', '   \u2022 Click the Fleet & Truck Shop tile in the Portal.'),
                        '   \u2022 Use the search bar to filter across all tabs by unit number, driver, make, or VIN.'
                    ]
                },
                {
                    title: t('manual.sub.40', '8.2 Managing Vehicles'),
                    items: [
                        t('manual.item.378', 'HOW TO ADD A VEHICLE:'),
                        t('manual.item.379', '1. Click "+ Add Vehicle" in the Vehicles tab.'),
                        t('manual.item.380', '2. Enter: Unit Number, VIN, Type (Tractor, Trailer, Pickup, etc.), Year, Make, Model.'),
                        t('manual.item.381', '3. Set Fuel Type, Assigned Driver, License Plate, and current Odometer.'),
                        t('manual.item.382', '4. Click "Save Vehicle."'),
                        '',
                        t('manual.item.383', 'VEHICLE TYPES SUPPORTED:'),
                        t('manual.item.384', '   \u2022 Tractor, Trailer, Straight Truck, Van, Pickup, Refrigerated Truck,'),
                        t('manual.item.385', '     Tanker, Flatbed, Box Truck, Forklift, Other.'),
                        '',
                        t('manual.item.386', 'FUEL TYPES: Diesel, Gasoline, CNG, Electric, Hybrid, Propane.'),
                        '',
                        t('manual.item.387', 'VIEWING VEHICLE DETAILS:'),
                        t('manual.item.388', '   \u2022 Click the eye icon to view full vehicle detail with service history and fuel log.'),
                        t('manual.item.389', '   \u2022 Click the pencil icon to edit vehicle information or change status.'),
                        '',
                        t('manual.item.390', 'VEHICLE STATUSES: Active, In Shop, Out of Service, Retired, Sold.'),
                        '',
                        t('manual.item.391', 'PM TRACKING:'),
                        t('manual.item.392', '   \u2022 Each vehicle tracks PM intervals by mileage.'),
                        t('manual.item.393', '   \u2022 The "PM Due" column shows upcoming or overdue preventive maintenance.'),
                        '   \u2022 Overdue PMs display in red with a warning icon.'
                    ]
                },
                {
                    title: t('manual.sub.41', '8.3 DVIR (Driver Vehicle Inspections)'),
                    items: [
                        t('manual.item.394', 'DVIRs are federal-required pre-trip and post-trip inspections.'),
                        '',
                        t('manual.item.395', 'HOW TO CREATE A DVIR:'),
                        t('manual.item.396', '1. Go to the DVIR tab and click "+ New DVIR."'),
                        t('manual.item.397', '2. Select the vehicle, enter driver name, and choose inspection type.'),
                        t('manual.item.398', '3. Types: Pre-Trip, Post-Trip, Annual, Random.'),
                        t('manual.item.399', '4. Click "Create DVIR" \u2014 the system auto-populates the checklist.'),
                        '',
                        t('manual.item.400', 'COMPLETING THE CHECKLIST:'),
                        t('manual.item.401', '   \u2022 Click the eye icon to open a DVIR, then click "Edit."'),
                        t('manual.item.402', '   \u2022 For each checklist item, select: OK, Defective, or Needs Attention.'),
                        t('manual.item.403', '   \u2022 Add Defect Notes for any items that are not OK.'),
                        t('manual.item.404', '   \u2022 Click "Save" to record \u2014 defect counts update automatically.'),
                        '',
                        t('manual.item.405', 'RESULTS: Pass, Defects Found, or Out of Service.'),
                        t('manual.item.406', 'A supervisor can set "Reviewed By" to sign off on defects.'),
                        '',
                        'PRINTING: Use the Print button on any DVIR to generate a branded printout.'
                    ]
                },
                {
                    title: t('manual.sub.42', '8.4 Fuel Tracking & MPG'),
                    items: [
                        t('manual.item.407', 'HOW TO LOG A FUEL FILL:'),
                        t('manual.item.408', '1. Go to the Fuel Log tab and click "+ Log Fuel."'),
                        t('manual.item.409', '2. Select vehicle, enter Gallons, Cost per Gallon, Odometer, Station, and Fuel Type.'),
                        t('manual.item.410', '3. DEF (Diesel Exhaust Fluid) gallons can be logged separately.'),
                        t('manual.item.411', '4. Click "Log Fuel."'),
                        '',
                        t('manual.item.412', 'AUTOMATIC CALCULATIONS:'),
                        t('manual.item.413', '   \u2022 Total Cost = Gallons \u00d7 Cost per Gallon.'),
                        t('manual.item.414', '   \u2022 MPG is auto-calculated from odometer readings between fills.'),
                        t('manual.item.415', '   \u2022 Low MPG (< 5) is flagged in red for investigation.'),
                        '',
                        'EDITING: Click the pencil icon on any fuel entry to correct gallons, cost, or odometer.'
                    ]
                },
                {
                    title: t('manual.sub.43', '8.5 Tire Tracking'),
                    items: [
                        t('manual.item.416', 'HOW TO MOUNT A TIRE:'),
                        t('manual.item.417', '1. Go to the Tires tab and click "+ Mount Tire."'),
                        t('manual.item.418', '2. Select vehicle and tire position: LF, RF, LRO, LRI, RRO, RRI, or Spare.'),
                        t('manual.item.419', '3. Enter Serial Number, Brand, Model, Size, and initial Tread Depth (in 32nds of an inch).'),
                        '',
                        t('manual.item.420', 'TREAD DEPTH MONITORING:'),
                        t('manual.item.421', '   \u2022 Green: Good condition (6/32" or more).'),
                        t('manual.item.422', '   \u2022 Orange: Monitor closely (4-6/32").'),
                        t('manual.item.423', '   \u2022 Red: Replace soon (below 4/32").'),
                        '',
                        t('manual.item.424', 'TIRE STATUSES: In Service, Removed, Retread, Scrapped.'),
                        '',
                        'EDITING: Click pencil to update tread depth readings, change position, or retire a tire.'
                    ]
                },
                {
                    title: t('manual.sub.44', '8.6 CDL & License Management'),
                    items: [
                        t('manual.item.425', 'HOW TO ADD A LICENSE:'),
                        t('manual.item.426', '1. Go to CDL / Licenses tab and click "+ Add License."'),
                        t('manual.item.427', '2. Enter Driver Name, License Number, State, Class (A/B/C/D), and Endorsements.'),
                        t('manual.item.428', '3. Set Issue Date, Expiry Date, and Medical Card Expiry.'),
                        '',
                        t('manual.item.429', 'ENDORSEMENT CODES: H=Hazmat, N=Tank, T=Doubles/Triples, X=Hazmat+Tank.'),
                        '',
                        t('manual.item.430', 'EXPIRY ALERTS:'),
                        t('manual.item.431', '   \u2022 Green: 30+ days remaining.'),
                        t('manual.item.432', '   \u2022 Orange: Expiring within 30 days.'),
                        t('manual.item.433', '   \u2022 Red: Expired \u2014 shows days overdue.'),
                        t('manual.item.434', '   \u2022 Medical card expiry is tracked separately.'),
                        '',
                        'Always keep driver medical cards current \u2014 expired cards invalidate the CDL.'
                    ]
                },
                {
                    title: t('manual.sub.45', '8.7 DOT Inspections'),
                    items: [
                        t('manual.item.435', 'HOW TO LOG A DOT INSPECTION:'),
                        t('manual.item.436', '1. Go to the DOT Inspections tab and click "+ Log Inspection."'),
                        t('manual.item.437', '2. Select vehicle, enter date, inspector name, and inspection type.'),
                        t('manual.item.438', '3. Types: Annual, Random, Roadside, Follow-Up.'),
                        t('manual.item.439', '4. Set Result: Pass, Fail, Conditional Pass, or Out of Service.'),
                        t('manual.item.440', '5. Enter Violation Count, Decal Number, and Next Annual Due date.'),
                        '',
                        'TRACKING:',
                        t('manual.item.441', '   \u2022 Each vehicle tracks when the next annual inspection is due.'),
                        t('manual.item.442', '   \u2022 Violations are counted and displayed for audit purposes.'),
                        t('manual.item.443', '   \u2022 All inspections are printable with the Print button.'),
                        '',
                        t('manual.item.444', 'TROUBLESHOOTING:'),
                        t('manual.item.445', '   \u2022 Vehicle not appearing? \u2014 Add it in the Vehicles tab first.'),
                        t('manual.item.446', '   \u2022 MPG showing "\u2014"? \u2014 Log at least 2 fuel fills with odometer readings.'),
                        t('manual.item.447', '   \u2022 DVIR checklist empty? \u2014 Contact your admin to verify the checklist template.'),
                        '   \u2022 Print not formatting correctly? \u2014 Use Chrome or Edge for best print quality.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s10.title', 'Part 10: Troubleshooting & Field FAQs'),
            id: 'troubleshooting',
            navigateTo: '/settings',
            filePath: 'src/components/SettingsView.jsx',
            icon: <HelpCircle size={22} />,
            content: t('manual.s10.content', 'Common questions and technical hurdles encountered on the plant floor.'),
            subsections: [
                {
                    title: t('manual.sub.46', '9.1 Common Issues'),
                    items: [
                        t('manual.item.448', '- Scanner won\'t read barcodes in the cooler → Wipe the camera lens with a dry cloth. Frost buildup causes focus issues in cold environments.'),
                        t('manual.item.449', '- App is slow during Wi-Fi handoffs → Ensure your device is on the "PF-MOBILE" SSID. Guest networks throttle data and block internal ports.'),
                        t('manual.item.450', '- A part I just added doesn\'t show in search → Click the refresh icon. Parts are cached for speed and may need a manual sync after bulk changes.'),
                        t('manual.item.451', '- I got locked out after being idle → The system auto-logs you out after 15 minutes. Log back in — your work is saved.'),
                        t('manual.item.452', '- Everything is grayed out — I can\'t edit → You are viewing a different plant\'s data (read-only mode). Switch back to your home plant in the dropdown.'),
                        t('manual.item.453', '- Push-to-talk isn\'t converting speech → Your device needs a microphone and HTTPS (padlock icon). Grant permission when the browser asks.'),
                        t('manual.item.454', '- Dashboard shows zeros after an import → Refresh the page (F5). The dashboard caches data and may need a fresh pull after large imports.'),
                        t('manual.item.455', '- My work order changes didn\'t save → Check for error messages. If your network dropped, look for the "Recover Draft" prompt on your next visit.'),
                        '- The printer isn\'t producing output → Trier OS uses your browser\'s print function. Press Ctrl+P after clicking the print button. Ensure your printer is on the network.'
                    ]
                },
                {
                    title: t('manual.sub.47', '9.2 Login & Access Issues'),
                    items: [
                        t('manual.item.456', '- "Too many login attempts" error → The system blocks login after 5 failed attempts in a 5-minute window. Wait 5 minutes from your first failed attempt, then try again. The timer does NOT reset with each attempt.'),
                        t('manual.item.457', '- Password won\'t work → Passwords are case-sensitive. Check Caps Lock. If you changed your password recently, make sure you\'re using the new one.'),
                        t('manual.item.458', '- Can log in but can\'t see my plant → Your account may not be assigned to that plant. Contact your IT administrator to verify your plant roles in User Management.'),
                        t('manual.item.459', '- I see "No data available" → Check your plant selector in the top bar. You may be on "All Sites" (corporate-only) or a plant that hasn\'t been seeded with data yet.'),
                        '- Session keeps timing out → The default idle timeout is set by your administrator. Periodically interact with the screen (scroll, click) to keep the session alive during long inspections.'
                    ]
                },
                {
                    title: t('manual.sub.48', '9.3 Field FAQs'),
                    items: [
                        t('manual.item.460', 'Q: Can I use Trier OS on my personal phone? — Yes. It\'s a Progressive Web App (PWA) that runs in any modern browser. Go to the server URL, log in, and optionally "Add to Home Screen" for an app-like experience.'),
                        t('manual.item.461', 'Q: What happens if I lose Wi-Fi during a work order? — If using the PWA with offline mode, your changes are saved locally. When reconnected, the system syncs automatically. Look for the "Pending Sync" indicator.'),
                        t('manual.item.462', 'Q: Can I close a work order from my phone? — Yes. The full close-out wizard works on mobile. You can add labor, parts, notes, and close the WO from any device.'),
                        t('manual.item.463', 'Q: Why does the parts count differ from what\'s on the shelf? — Trier tracks quantities via transactions. If someone took a part without recording it, the count will be off. Perform a physical inventory count and use the inventory adjustment feature to correct it.'),
                        t('manual.item.464', 'Q: I found a part cheaper from another supplier. Can I update the price? — Yes. Edit the part record and update the Unit Cost. Network Price Discovery will alert sister plants if your price is lower.'),
                        t('manual.item.465', 'Q: Where do I find reports? — Under Reports & Analytics in the main navigation. Key reports: Enterprise Cost Comparison, PM Compliance, Asset Reliability (MTBF), and Labor Utilization.'),
                        t('manual.item.466', 'Q: How do I transfer a part to another plant? — Go to Global Logistics → Part Transfers. Search for the part, select sending/receiving plants, enter quantity, and submit.'),
                        t('manual.item.467', 'Q: Someone else is editing the same work order. What happens? — Trier uses record locking. A WO is locked to the editing user for up to 5 minutes. After 5 minutes of inactivity, the lock releases automatically.'),
                        t('manual.item.468', 'Q: How do I reset my password? — Contact your IT administrator or plant manager. They can reset it through Administration → User Management. Password resets are logged in the audit trail.'),
                        'Q: What do the colored dots next to sensors mean? — [P4] Green = Normal (within thresholds). [P3] Yellow = Warning (approaching threshold). [P1] Red = Critical alarm (exceeded threshold). [--] Gray = No data (sensor hasn\'t reported or is offline).'
                    ]
                },
                {
                    title: t('manual.sub.49', '9.4 Sensor & SCADA Troubleshooting'),
                    items: [
                        t('manual.item.469', '- Sensor shows "No Data" (gray dot) → The sensor hasn\'t reported within the expected interval. Check the PLC/SCADA connection and verify the sensor endpoint URL is correct.'),
                        t('manual.item.470', '- Sensor reads are delayed → The polling interval is set at the PLC level. Trier receives data — it doesn\'t pull it. Check the PLC program\'s POST interval to /api/sensors/reading.'),
                        t('manual.item.471', '- False alarm on a sensor → You can silence the alarm for that specific reading from the sensor detail view. This does NOT globally disable the sensor — only the individual triggered alarm. The alarm re-engages on the next reading.'),
                        t('manual.item.472', '- "Sensor rate limit exceeded" → The system allows up to 1,000 sensor readings per minute per IP. If your PLC is polling faster, slow down the POST interval.'),
                        '- Sensor thresholds seem wrong → Thresholds are configured per-sensor in the Sensor Gateway settings. Check that min/max values match equipment specifications.'
                    ]
                },
                {
                    title: t('manual.sub.50', '9.5 Mobile & Tablet Troubleshooting'),
                    items: [
                        t('manual.item.473', '- App doesn\'t load on my phone → Use a modern browser (Chrome 90+, Safari 14+, Edge 90+). Clear the browser cache and try again.'),
                        t('manual.item.474', '- Offline mode isn\'t working → You must visit the site at least once while online for the service worker to install. After that, previously visited pages will be available offline.'),
                        t('manual.item.475', '- Photos from inspection aren\'t uploading → Photos queue for upload when offline. Connect to Wi-Fi and open the app — pending uploads should process automatically.'),
                        t('manual.item.476', '- Keyboard covers input fields on tablet → Scroll down or rotate to landscape mode. Some Android tablets have a "floating keyboard" option.'),
                        '- Voice input not working on Safari (iPhone/iPad) → Safari requires HTTPS for microphone access. Check Settings → Safari → Microphone to ensure the site has permission.'
                    ]
                },
                {
                    title: t('manual.sub.51', '9.6 When to Call IT'),
                    items: [
                        t('manual.item.477', 'HANDLE IT YOURSELF: Locked out after too many attempts → wait 5 minutes.'),
                        t('manual.item.478', 'HANDLE IT YOURSELF: Dashboard shows old data → refresh the page (F5).'),
                        t('manual.item.479', 'HANDLE IT YOURSELF: Can\'t edit a record → check if you\'re in the right plant.'),
                        t('manual.item.480', 'HANDLE IT YOURSELF: Part count is off → do an inventory adjustment.'),
                        t('manual.item.481', 'HANDLE IT YOURSELF: Sensor shows a false alarm → silence the individual alarm.'),
                        t('manual.item.482', 'CALL IT: Can\'t log in even with the correct password after waiting.'),
                        t('manual.item.483', 'CALL IT: Dashboard shows incorrect numbers that don\'t match after refresh.'),
                        t('manual.item.484', 'CALL IT: Can\'t edit records at your own plant despite having access.'),
                        t('manual.item.485', 'CALL IT: System won\'t save adjustments or gives error messages.'),
                        t('manual.item.486', 'CALL IT: Sensor is permanently stuck in alarm state across multiple readings.'),
                        'CALL IT: System is consistently slow for everyone at the plant.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s11.title', 'Part 11: Complete Screen & Button Reference'),
            id: 'screen-reference',
            navigateTo: '/dashboard',
            filePath: 'src/components/DashboardView.jsx',
            icon: <List size={22} />,
            content: t('manual.s11.content', 'Detailed reference for every screen, tab, button, and control in Trier OS.'),
            subsections: [
                {
                    title: t('manual.sub.52', '10.1 Jobs Page Buttons'),
                    items: [
                        t('manual.item.487', '+ New WO (green) — Creates a new work order.'),
                        t('manual.item.488', 'Search bar — Filters by WO#, description, asset, or keyword.'),
                        t('manual.item.489', 'Status filter — Show Open, Started, Completed, or Closed.'),
                        t('manual.item.490', 'Priority filter — Show by priority level.'),
                        t('manual.item.491', 'Assigned User filter — Show by technician.'),
                        t('manual.item.492', 'Date From / To — Filter by date range.'),
                        t('manual.item.493', 'View — Opens work order detail.'),
                        t('manual.item.494', 'Print — Formatted print version.'),
                        t('manual.item.495', 'Edit — Enable editing all fields.'),
                        t('manual.item.496', 'Save Changes — Saves your edits.'),
                        t('manual.item.497', 'Close Work Order — Opens the Close-Out Wizard.'),
                        'Add Note — Appends a timestamped comment.'
                    ]
                },
                {
                    title: t('manual.sub.53', '10.2 Assets Page Buttons'),
                    items: [
                        t('manual.item.498', '+ Register Equipment — Creates a new asset.'),
                        t('manual.item.499', 'Search — By asset ID, description, model, serial, manufacturer.'),
                        t('manual.item.500', 'View — Full detail with history, meters, and linked parts.'),
                        t('manual.item.501', 'Timeline — Visual chronological maintenance history.'),
                        t('manual.item.502', 'Meter — Update current runtime hours/cycles.'),
                        t('manual.item.503', 'Change Status — In Production / Spare / Decommissioned.'),
                        'Asset Logistics tab — Enterprise-wide equipment search.'
                    ]
                },
                {
                    title: t('manual.sub.54', '10.3 Parts Page Buttons'),
                    items: [
                        t('manual.item.504', '+ Register New Part — Creates a new inventory item.'),
                        t('manual.item.505', 'Search — By part ID, description, manufacturer, vendor.'),
                        t('manual.item.506', 'Low Stock Only — Show items below minimum stock level.'),
                        t('manual.item.507', 'Details — Full record: vendor info, cost history, substitutes.'),
                        t('manual.item.508', 'Adjust Stock — Opens stock adjustment form.'),
                        t('manual.item.509', 'Global Logistics tab — Search all plants. Request transfers.'),
                        t('manual.item.510', 'Adjustments tab — Stock adjustment history with audit trail.'),
                        'Vendors & POs tab — Purchase order management.'
                    ]
                },
                {
                    title: t('manual.sub.55', '10.4 Procedures Page Buttons'),
                    items: [
                        t('manual.item.511', '+ New Procedure — Creates a new SOP.'),
                        t('manual.item.512', 'AI SOP Generator — Auto-generates a procedure from equipment documentation.'),
                        t('manual.item.513', 'Implement — Creates a work order from this procedure template.'),
                        t('manual.item.514', 'Open — View/edit the procedure: steps, tools, parts, safety warnings.'),
                        'Print — Formatted copy for the field.'
                    ]
                },
                {
                    title: t('manual.sub.56', '10.5 Dashboard Buttons'),
                    items: [
                        t('manual.item.515', 'Onboard Site — Launches new-site setup wizard (admin only).'),
                        t('manual.item.516', 'Search bar — Global search across WOs, assets, and parts.'),
                        t('manual.item.517', 'About & Manual — Opens this manual and system credits.'),
                        t('manual.item.518', 'User Setup Document — Configuration guide.'),
                        'Stat Cards — Click any card to jump to that section.'
                    ]
                },
                {
                    title: t('manual.sub.57', '10.6 Settings Page'),
                    items: [
                        t('manual.item.519', 'All Users: Change Password, Language selection.'),
                        t('manual.item.520', 'Managers: User Accounts, Site Leadership, Backup, Report Center.'),
                        'IT Admin/Creator: Admin Console, Data Bridge, Webhooks, Email Settings, Sensor Gateway, SAP Integration, API Docs, Plant Reset, Snapshot Rollback.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s12.title', 'Part 12: Administration & User Management'),
            id: 'admin',
            navigateTo: '/settings',
            filePath: 'src/components/SettingsView.jsx',
            adminOnly: true,
            icon: <ShieldAlert size={22} />,
            content: t('manual.s12.content', 'Managing users, roles, permissions, backups, and database snapshots.'),
            subsections: [
                {
                    title: t('manual.sub.58', '11.1 User Role Hierarchy'),
                    items: [
                        t('manual.item.521', 'Creator — Full access to all plants, all features, all admin functions.'),
                        t('manual.item.522', 'IT Admin — Full access to all plants, all features, all admin functions.'),
                        t('manual.item.523', 'Manager — Read all plants, write own plant only, Dashboard access, no admin.'),
                        t('manual.item.524', 'Technician — Read/write own plant only, optional Dashboard access.'),
                        'Role changes take effect immediately on the user\'s next page refresh.'
                    ,
                        '',
                        t('manual.item.525', 'ROLE DEFINITIONS:'),
                        t('manual.item.526', '   • Technician — Can view and update work orders assigned to them. Can use scanner, view parts/assets.'),
                        t('manual.item.527', '   • Supervisor — Can create work orders, assign technicians, approve close-outs, and view analytics.'),
                        t('manual.item.528', '   • Planner — Can manage PM schedules, job plans, procedures, and parts inventory.'),
                        t('manual.item.529', '   • IT Admin — Full system access including user management, settings, integrations, and data bridge.'),
                        t('manual.item.530', '   • Creator — Unrestricted access to all features including license management and database admin.'),
                        '',
                        t('manual.item.531', 'IMPORTANT NOTES:'),
                        t('manual.item.532', '   • Multi-plant users can switch between plants without re-logging.'),
                        t('manual.item.533', '   • Foreign plant editing requires unlock password (ask the plant IT admin).'),
                        t('manual.item.534', '   • Role changes take effect immediately — no logout required.'),
                        '',
                        t('manual.item.535', 'TROUBLESHOOTING:'),
                        t('manual.item.536', '   • User cannot see a module? — Check their role. Some modules require Supervisor or above.'),
                        t('manual.item.537', '   • Role change not working? — Refresh the page after role update.'),
                        '   • Locked out of foreign plant? — The plant-specific override password is set by the plant admin.'
                    ]
                },
                {
                    title: t('manual.sub.59', '11.2 Creating a New User'),
                    items: [
                        t('manual.item.538', '1. Go to Settings → User Accounts.'),
                        t('manual.item.539', '2. Click "+ Add User".'),
                        t('manual.item.540', '3. Enter Username, Display Name, and a temporary password.'),
                        t('manual.item.541', '4. Select the Role (Technician, Manager, IT Admin).'),
                        t('manual.item.542', '5. Assign the user to their Home Plant.'),
                        t('manual.item.543', '6. Optionally grant Dashboard Access.'),
                        '7. Click "Create Account". The user must change their password on first login.'
                    ]
                },
                {
                    title: t('manual.sub.60', '11.3 Resetting a Password'),
                    items: [
                        t('manual.item.544', '1. Go to Settings → User Accounts.'),
                        t('manual.item.545', '2. Find the user and click "Reset Password".'),
                        t('manual.item.546', '3. Enter a new temporary password.'),
                        '4. The user will be forced to create a personal password on next login.'
                    ]
                },
                {
                    title: t('manual.sub.61', '11.4 Database Backup & Snapshots'),
                    items: [
                        t('manual.item.547', 'Backup: Go to Settings and click "Backup Database". A timestamped backup file is created.'),
                        t('manual.item.548', 'Snapshots: Go to Admin Console → Snapshot Rollback to view auto-created snapshots.'),
                        t('manual.item.549', 'Rollback: Select a snapshot and click "Restore" to roll back to that point in time.'),
                        'Warning: Rollback replaces all current data with the snapshot contents.'
                    ,
                        '',
                        t('manual.item.550', 'BACKUP BEST PRACTICES:'),
                        t('manual.item.551', '   • Trier OS automatically creates snapshots at configurable intervals.'),
                        t('manual.item.552', '   • Manual snapshots can be created before major changes (data imports, bulk updates).'),
                        t('manual.item.553', '   • Snapshots capture the full database state — all tables, configurations, and user data.'),
                        '',
                        t('manual.item.554', 'HOW TO RESTORE A SNAPSHOT:'),
                        t('manual.item.555', '1. Go to Settings > Backup and Snapshots.'),
                        t('manual.item.556', '2. Select the snapshot to restore from the list.'),
                        t('manual.item.557', '3. Review the snapshot details (date, size, description).'),
                        t('manual.item.558', '4. Click "Rollback to This Snapshot."'),
                        t('manual.item.559', '5. Confirm the rollback — this replaces the current database with the snapshot version.'),
                        '',
                        t('manual.item.560', 'TROUBLESHOOTING:'),
                        t('manual.item.561', '   • Snapshot creation failed? — Check disk space on the server.'),
                        t('manual.item.562', '   • Rollback not working? — The database must not be locked by active connections.'),
                        '   • Lost data after rollback? — Any changes made after the snapshot timestamp are lost. This is by design.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s13.title', 'Part 13: Data Bridge & Legacy Import'),
            id: 'data-bridge',
            navigateTo: '/import',
            filePath: 'src/components/DataBridge.jsx',
            adminOnly: true,
            icon: <Download size={22} />,
            content: t('manual.s13.content', 'Importing data from PMC, MP2, SQL Server, Access databases, and CSV files.'),
            subsections: [
                {
                    title: t('manual.sub.62', '12.1 Supported Source Systems'),
                    items: [
                        t('manual.item.563', 'PMC (Trier Manufacturing Enterprise System) — .accdb / .mdb files with automatic password handling.'),
                        t('manual.item.564', 'MP2 / Datastream / Infor EAM — .mdb files with verified column mappings.'),
                        t('manual.item.565', 'SQL Server / Express — Direct connection via connection string.'),
                        t('manual.item.566', 'Generic MS Access — .accdb / .mdb with manual column mapping.'),
                        'CSV — Flat file import with field mapping.'
                    ]
                },
                {
                    title: t('manual.sub.63', '12.2 Running an Import'),
                    items: [
                        t('manual.item.567', '1. Go to Settings → Data Bridge (IT Admin or Creator only).'),
                        t('manual.item.568', '2. Click "Browse Local" and select your legacy database file.'),
                        t('manual.item.569', '3. Confirm the connector type (PMC, MP2, or generic).'),
                        t('manual.item.570', '4. Preview tables and review column mappings.'),
                        t('manual.item.571', '5. Select which tables to import.'),
                        t('manual.item.572', '6. Type the confirmation code "TrierCMMS" and click "Execute Import".'),
                        t('manual.item.573', '7. A pre-import snapshot is automatically saved.'),
                        '8. View the import report with insert/update/skip/fail counts.'
                    ,
                        '',
                        t('manual.item.574', 'STEP-BY-STEP IMPORT GUIDE:'),
                        t('manual.item.575', '1. Prepare your data in CSV or Excel format.'),
                        t('manual.item.576', '2. Navigate to Data Bridge > Import Wizard.'),
                        t('manual.item.577', '3. Select the data type: Assets, Parts, Work Orders, or Users.'),
                        t('manual.item.578', '4. Upload your file.'),
                        t('manual.item.579', '5. Map source columns to Trier OS fields using the drag-and-drop mapper.'),
                        t('manual.item.580', '6. Preview the first 10 rows to verify mapping is correct.'),
                        t('manual.item.581', '7. Choose import mode: "Add New Only" or "Add + Update Existing."'),
                        t('manual.item.582', '8. Click "Start Import."'),
                        t('manual.item.583', '9. Review the import log for any skipped or errored rows.'),
                        '',
                        t('manual.item.584', 'SUPPORTED DATA SOURCES:'),
                        t('manual.item.585', '   • CSV files (comma or semicolon delimited)'),
                        t('manual.item.586', '   • Excel files (.xlsx)'),
                        t('manual.item.587', '   • MP2, Maximo, SAP PM, Fiix, and UpKeep export formats'),
                        t('manual.item.588', '   • Custom API imports via the Import API endpoint'),
                        '',
                        t('manual.item.589', 'TROUBLESHOOTING:'),
                        t('manual.item.590', '   • Import stuck at 0%? — Check that the file is not open in another program.'),
                        t('manual.item.591', '   • Rows skipped? — Check the import log. Common causes: missing required fields, duplicate IDs.'),
                        t('manual.item.592', '   • Dates not importing correctly? — Use ISO format (YYYY-MM-DD) for best compatibility.'),
                        '   • Special characters broken? — Save your CSV as UTF-8 encoding.'
                    ]
                },
                {
                    title: t('manual.sub.64', '12.3 Import Safety Features'),
                    items: [
                        t('manual.item.593', 'Pre-Import Snapshot: Database is backed up automatically before every import.'),
                        t('manual.item.594', 'Duplicate Prevention: Existing records are updated, not duplicated.'),
                        t('manual.item.595', 'Auto-Heal: Failed records are cross-referenced against other plants to fill missing data.'),
                        t('manual.item.596', 'Failure Tracking: Every failed record is logged with raw source data for review.'),
                        'Audit Trail: Complete import history with timestamps and statistics.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s14.title', 'Part 14: Reports & Predictive Analytics'),
            id: 'reports-analytics',
            navigateTo: '/analytics',
            filePath: 'src/components/ReportCenter.jsx',
            icon: <Activity size={22} />,
            content: t('manual.s14.content', 'Pre-built reports, custom report builder, enterprise intelligence, and the predictive maintenance engine.'),
            subsections: [
                {
                    title: t('manual.sub.65', '13.1 Report Center'),
                    items: [
                        t('manual.item.597', 'Access from Settings → Report Center.'),
                        t('manual.item.598', 'Maintenance Manifest — Cost and labor summary.'),
                        t('manual.item.599', 'Work Order Summary — Filtered by date, asset, technician, or priority.'),
                        t('manual.item.600', 'PM Compliance — On-time vs. overdue preventive maintenance.'),
                        t('manual.item.601', 'Part Usage — Most-used parts and cost trends.'),
                        t('manual.item.602', 'Asset Downtime — Total downtime ranked by impact.'),
                        'Labor Distribution — Hours by technician, craft, and overtime.'
                    ]
                },
                {
                    title: t('manual.sub.66', '13.2 Custom Report Builder'),
                    items: [
                        t('manual.item.603', '1. Go to Settings → Reports & Analytics category → Custom Report Builder.'),
                        t('manual.item.604', '2. Select your data source (Work Orders, Assets, Parts, Schedules).'),
                        t('manual.item.605', '3. Pick the columns you want in your report.'),
                        t('manual.item.606', '4. Apply filters (date range, priority, status, asset, technician).'),
                        t('manual.item.607', '5. Add grouping and sorting as needed.'),
                        t('manual.item.608', '6. Click "Generate" to preview.'),
                        '7. Export to Excel, PDF, or CSV.'
                    ]
                },
                {
                    title: '13.2a Example: Monthly Maintenance Cost Report',
                    items: [
                        t('manual.item.609', '1. Data Source: Work Orders.'),
                        t('manual.item.610', '2. Columns: WO Number, Asset Name, Priority, Labor Cost, Parts Cost, Total Cost, Close Date.'),
                        t('manual.item.611', '3. Filter: Date Range = March 1-31, Status = Closed.'),
                        t('manual.item.612', '4. Group By: Asset Name.'),
                        t('manual.item.613', '5. Sort: Total Cost (highest first).'),
                        t('manual.item.614', '6. Generate → Export to PDF.'),
                        'Result: A printable report showing how much you spent per machine last month.'
                    ]
                },
                {
                    title: '13.2b Example: Overdue PM Compliance Report',
                    items: [
                        t('manual.item.615', '1. Data Source: Schedules.'),
                        t('manual.item.616', '2. Columns: Schedule Name, Asset, Frequency, Last Completed, Next Due, Status.'),
                        t('manual.item.617', '3. Filter: Status = Overdue.'),
                        t('manual.item.618', '4. Sort: Next Due Date (oldest first).'),
                        t('manual.item.619', '5. Generate → Export to Excel.'),
                        'Result: A list of every PM that\'s past due. Hand this to your Plant Manager for accountability.'
                    ]
                },
                {
                    title: '13.2c Example: Top 10 Breakdown Assets',
                    items: [
                        t('manual.item.620', '1. Data Source: Work Orders.'),
                        t('manual.item.621', '2. Columns: Asset Name, WO Count, Total Downtime Hours, Total Cost.'),
                        t('manual.item.622', '3. Filter: Date Range = Last 12 months, Priority = 1 (Emergency) + 2 (High).'),
                        t('manual.item.623', '4. Group By: Asset Name.'),
                        t('manual.item.624', '5. Sort: WO Count (highest first), Limit: Top 10.'),
                        t('manual.item.625', '6. Generate → Export to PDF.'),
                        'Result: Your worst-performing machines — perfect for capital replacement proposals.'
                    ]
                },
                {
                    title: t('manual.sub.67', '13.3 Predictive Risk Alerts & MTBF'),
                    items: [
                        t('manual.item.626', 'The Dashboard shows Predictive Risk Alerts for equipment at risk of failure.'),
                        t('manual.item.627', 'Health Score: 80-100 [P4] Healthy | 60-79 [P3] At Risk | 0-59 [P1] Critical.'),
                        t('manual.item.628', 'MTBF (Mean Time Between Failures): Average days between unexpected breakdowns. High = reliable. Low = needs attention.'),
                        t('manual.item.629', 'MTBF Trend: Improving, Stable, or Worsening based on recent vs. historical data.'),
                        t('manual.item.630', 'Predicted Failure Date: Last Repair Date + MTBF Days.'),
                        'Reliability Index (ISO 14224): STABLE (>93%), AT RISK (89-93%), CRITICAL (<89%).'
                    ]
                },
                {
                    title: t('manual.sub.68', '13.4 Enterprise Intelligence'),
                    items: [
                        t('manual.item.631', 'Cross-Plant Comparison — Compare KPIs across all plants.'),
                        t('manual.item.632', 'Price Intelligence — See which plant pays most/least for common parts.'),
                        t('manual.item.633', 'Labor Efficiency — Compare technician productivity across sites.'),
                        'Failure Patterns — Identify equipment failing at multiple plants.'
                    ]
                },
                {
                    title: t('manual.sub.69', '13.5 Power BI / BI Export'),
                    items: [
                        t('manual.item.634', 'Structured data exports compatible with Power BI, Tableau, and other BI tools.'),
                        'Access from Settings → BI Export.'
                    ]
                },
                {
                    title: t('manual.sub.166', '13.6 Corporate Analytics — 11-Tab Intelligence Suite'),
                    items: [
                        t('manual.corpAnalytics.item1', 'Access Corporate Analytics from the Mission Control tile or the navigation bar (corporate users and above). The view provides an 11-tab enterprise intelligence suite spanning financial, operational, and strategic analytics across all facilities.'),
                        t('manual.corpAnalytics.tab1', 'Tab 1 — Overview: Enterprise KPI summary. Shows total active work orders, network PM compliance rate, average asset health score, and open safety permits across all plants. Entry point for the corporate dashboard.'),
                        t('manual.corpAnalytics.tab2', 'Tab 2 — Plant Rankings: Ranked performance table comparing every plant on cost efficiency, PM compliance, MTBF, downtime, and parts spend. Identify top-performing and underperforming sites at a glance.'),
                        t('manual.corpAnalytics.tab3', 'Tab 3 — Financial: Cross-plant cost breakdown — labor, parts, and miscellaneous spend by plant and category. Trend charts show month-over-month cost movement. Used for budget allocation and variance reviews.'),
                        t('manual.corpAnalytics.tab4', 'Tab 4 — OpEx Intel: The OpEx savings engine. Scans all 41 plants for 14 categories of operational savings opportunities (overstock lockup, rental vs. ownership arbitrage, consumable shrink, and more). Each finding shows predicted annual savings and a one-click "Commit to Action" button. Also contains the Vendor Price Drift card showing parts inflation across the network.'),
                        t('manual.corpAnalytics.tab5', 'Tab 5 — OpEx Tracking: The self-healing commitment loop. Shows the enterprise dashboard of every committed action plan — open, in-progress, validated, missed, and overdue. Includes the Plant Realization Heatmap, Category Performance table, and total predicted vs. realized savings. See Part XXXI of this manual for the full OpEx Tracking reference.'),
                        t('manual.corpAnalytics.tab6', 'Tab 6 — Equipment Intel: Network-wide asset intelligence. Aggregates health scores, MTBF trends, and failure patterns across all plants. Surfaces equipment that is failing at multiple facilities — useful for network-wide capital replacement decisions.'),
                        t('manual.corpAnalytics.tab7', 'Tab 7 — Risk Matrix: Enterprise risk scoring. Every plant is rated on a risk matrix combining compliance gaps, overdue PMs, critical asset health, open safety permits, and incident frequency. Used for insurance audits and executive risk briefings.'),
                        t('manual.corpAnalytics.tab8', 'Tab 8 — Forecast: Predictive spend and maintenance forecasting. Projects maintenance costs, PM workload, and parts demand over the next 90–365 days based on historical trends and scheduled activity.'),
                        t('manual.corpAnalytics.tab9', 'Tab 9 — Workforce: Labor analytics across all sites. Shows technician headcount, overtime ratios, labor cost per plant, and open work order backlogs by plant. Supports staffing decisions and cross-plant labor rebalancing.'),
                        t('manual.corpAnalytics.tab10', 'Tab 10 — Property & Real Estate: Facility-level data — square footage, property values, lease vs. own status, and maintenance cost per square foot by plant. Connects operational spend to real estate footprint for CFO-level reporting.'),
                        t('manual.corpAnalytics.tab11', 'Tab 11 — Maintenance KPIs: Standardized maintenance performance metrics across the network — wrench time, schedule compliance, backlog hours, mean time to repair, and first-time fix rate — normalized for cross-plant comparison.'),
                    ]
                }
            ]
        },
        {
            section: t('manual.s15.title', 'Part 15: SCADA/OPC-UA & Equipment Integration'),
            id: 'scada-opcua',
            navigateTo: '/settings',
            adminOnly: true,
            filePath: 'server/routes/sensors.js',
            icon: <Activity size={22} />,
            content: t('manual.s15.content', 'Connecting PLCs, SCADA systems, and OEM equipment to the Sensor Gateway for real-time monitoring and automatic work order generation.'),
            subsections: [
                {
                    title: t('manual.sub.70', '14.1 Supported Connections'),
                    items: [
                        t('manual.item.635', 'Tetra Pak (Factory OS / PlantMaster) — OPC-UA direct connection.'),
                        t('manual.item.636', 'Allen-Bradley / Rockwell (CompactLogix, ControlLogix) — Via Ignition, Node-RED, or direct REST.'),
                        t('manual.item.637', 'Siemens (S7-1200, S7-1500) — Native OPC-UA via TIA Portal.'),
                        'Any HTTP-capable device — Direct POST to the REST API.'
                    ]
                },
                {
                    title: t('manual.sub.71', '14.2 How Sensor Monitoring Works'),
                    items: [
                        t('manual.item.638', '1. Equipment sends readings to Trier OS (temperature, pressure, vibration, runtime).'),
                        t('manual.item.639', '2. The Threshold Engine compares each reading against configured min/max values.'),
                        t('manual.item.640', '3. If exceeded: alert notification (bell, webhook, email) + optional auto-generated Emergency WO.'),
                        '4. The Sensor Dashboard shows real-time readings and 30-day trends.'
                    ]
                },
                {
                    title: t('manual.sub.72', '14.3 Configuring Thresholds'),
                    items: [
                        t('manual.item.641', '1. Go to Settings → Sensor Gateway → Thresholds.'),
                        t('manual.item.642', '2. Select the sensor and metric.'),
                        t('manual.item.643', '3. Set Min Value and Max Value.'),
                        t('manual.item.644', '4. Toggle "Auto-Create WO" for automatic emergency work orders.'),
                        '5. Set a Cooldown Period (default 30 min) to prevent duplicate alerts.'
                    ]
                },
                {
                    title: t('manual.sub.73', '14.4 Common Tetra Pak Tags'),
                    items: [
                        t('manual.item.645', 'Separator: RPM, bearing temperature, vibration (mm/s), runtime hours, bowl pressure.'),
                        t('manual.item.646', 'HTST/Pasteurizer: Product temperature, holding tube temp, divert valve status, flow rate (GPM).'),
                        t('manual.item.647', 'Homogenizer: Pressure (PSI), motor amperage, plunger cycle count, oil temperature.'),
                        t('manual.item.648', 'Filling Machine: Cycle count, fill accuracy, sealing temperature, downtime events.'),
                        'Contact your Tetra Pak field engineer or Rockwell distributor for tag documentation.'
                    ]
                },
                {
                    title: t('manual.sub.74', '14.5 Network Requirements'),
                    items: [
                        t('manual.item.649', 'Industrial equipment networks (OT) are typically segmented from IT networks. Work with your security team.'),
                        t('manual.item.650', 'Recommended: Place a DMZ bridge between OT and IT. The reader forwards data to Trier via HTTPS.'),
                        t('manual.item.651', 'Never expose PLC/SCADA devices directly to the IT network. Use unidirectional data flow (OT to IT only).'),
                        'Ports: HTTPS 3001 (Trier), OPC-UA 4840 (standard), EtherNet/IP 44818 (Rockwell), Modbus TCP 502.'
                    ]
                },
                {
                    title: t('manual.sub.75', '14.6 Troubleshooting Sensors'),
                    items: [
                        t('manual.item.652', 'SENSOR OFFLINE: No reading in 5 minutes. Check network, PLC run mode, polling script.'),
                        t('manual.item.653', 'DUPLICATE WORK ORDERS: Increase threshold cooldown time.'),
                        t('manual.item.654', 'OPC-UA REFUSED: Verify endpoint URL, security policy, certificates, PLC firewall.'),
                        t('manual.item.655', 'NO THRESHOLDS FIRE: Verify threshold is Enabled and metric name matches exactly (case-sensitive).'),
                        'TEST: Use Settings → Sensor Gateway → Simulate Reading to inject test data.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s17.title', 'Part 16: SCADA Connection Guides — Working Examples'),
            id: 'scada-guides',
            navigateTo: '/settings',
            adminOnly: true,
            filePath: 'server/routes/sensors.js',
            icon: <Activity size={22} />,
            content: t('manual.s17.content', 'Step-by-step setup guides for connecting each supported PLC/SCADA system to Trier OS, with real configuration examples.'),
            subsections: [
                {
                    title: t('manual.sub.95', '16.1 Allen-Bradley / Rockwell → Ignition MQTT Bridge'),
                    items: [
                        t('manual.item.885', 'What you need: Ignition Gateway (by Inductive Automation) installed on the OT network. Free trial works for testing.'),
                        t('manual.item.886', 'Step 1: In Ignition, go to Config → OPC → Device Connections → Add Device → Allen-Bradley.'),
                        t('manual.item.887', 'Step 2: Enter the PLC IP address (e.g., 192.168.1.100) and select the processor type (CompactLogix or ControlLogix).'),
                        t('manual.item.888', 'Step 3: Browse tags to confirm Ignition can read them (Controller → Tags → Your_Program → YourTag).'),
                        t('manual.item.889', 'Step 4: Install the MQTT Transmission module in Ignition (Config → Modules → Install).'),
                        t('manual.item.890', 'Step 5: Create an MQTT connection: Host = your Trier server IP, Port = 1883, Topic prefix = trier/sensors.'),
                        t('manual.item.891', 'Step 6: Create a Tag Publication: Source = your PLC tags, Destination = the MQTT connection, Publish interval = 30 seconds.'),
                        t('manual.item.892', 'Step 7: In Trier OS → Settings → Sensor Gateway → Add Connection: Type = MQTT, Topic = trier/sensors/#.'),
                        t('manual.item.893', 'Step 8: Click "Test Connection". You should see live readings within 60 seconds.'),
                        'Result: PLC tag values (temperature, pressure, runtime) now appear in the Trier Sensor Dashboard.'
                    ]
                },
                {
                    title: t('manual.sub.96', '16.2 Siemens S7 → Node-RED OPC-UA Connector'),
                    items: [
                        t('manual.item.894', 'What you need: Node-RED installed on a server/PC that can reach both the Siemens PLC and Trier OS.'),
                        t('manual.item.895', 'Step 1: In TIA Portal on your Siemens PLC, enable OPC-UA Server: PLC Properties → OPC UA → Enable Server.'),
                        t('manual.item.896', 'Step 2: Note the OPC-UA endpoint URL: opc.tcp://192.168.1.50:4840.'),
                        t('manual.item.897', 'Step 3: Install Node-RED on a server: npm install -g node-red, then start with: node-red.'),
                        t('manual.item.898', 'Step 4: In Node-RED, install the OPC-UA palette: Menu → Manage Palette → Install → node-red-contrib-opcua.'),
                        t('manual.item.899', 'Step 5: Drag an "OpcUa-Client" node onto the flow. Set Endpoint to your PLC\'s OPC-UA URL.'),
                        t('manual.item.900', 'Step 6: Drag a "Function" node to format the data: msg.payload = { sensorId: "BOILER_TEMP", value: msg.payload, unit: "°F" }.'),
                        t('manual.item.901', 'Step 7: Drag an "HTTP Request" node. Set: Method = POST, URL = http://YOUR_PRAIRIE_SERVER:3000/api/sensors/reading.'),
                        t('manual.item.902', 'Step 8: Add an "Inject" node set to repeat every 30 seconds. Wire: Inject → OPC-UA → Function → HTTP Request.'),
                        t('manual.item.903', 'Step 9: Deploy the flow. Check Trier\'s Sensor Dashboard — live readings should appear.'),
                        'Tip: Add a "Catch" node to log errors. Siemens OPC-UA sometimes requires certificate trust.'
                    ]
                },
                {
                    title: t('manual.sub.97', '16.3 Generic Modbus → Python Polling Script'),
                    items: [
                        t('manual.item.904', 'What you need: Python 3.x installed. A Modbus-capable device (VFD, meter, sensor) on your network.'),
                        t('manual.item.905', 'Step 1: Install the library: pip install pymodbus requests.'),
                        t('manual.item.906', 'Step 2: Create a file called modbus_to_prairie.py with this content:'),
                        t('manual.item.907', '   from pymodbus.client import ModbusTcpClient'),
                        t('manual.item.908', '   import requests, time'),
                        t('manual.item.909', '   client = ModbusTcpClient("192.168.1.200", port=502)'),
                        t('manual.item.910', '   while True:'),
                        t('manual.item.911', '       result = client.read_holding_registers(0, 2)  # Register 0-1'),
                        t('manual.item.912', '       if result.isError(): print("Read error"); time.sleep(30); continue'),
                        t('manual.item.913', '       temp = result.registers[0] / 10.0  # Scale as needed'),
                        t('manual.item.914', '       requests.post("http://YOUR_PRAIRIE_SERVER:3000/api/sensors/reading",'),
                        t('manual.item.915', '           json={"sensorId": "VFD_TEMP", "value": temp, "unit": "°F"},'),
                        t('manual.item.916', '           headers={"Authorization": "Bearer YOUR_API_KEY"})'),
                        t('manual.item.917', '       time.sleep(30)  # Poll every 30 seconds'),
                        t('manual.item.918', 'Step 3: Run: python modbus_to_prairie.py.'),
                        t('manual.item.919', 'Step 4: Check the Sensor Dashboard in Trier. Your readings should appear.'),
                        'Tip: Run as a Windows Service or Linux systemd service for production use.'
                    ]
                },
                {
                    title: t('manual.sub.98', '16.4 MQTT Broker → Subscribe & Forward'),
                    items: [
                        t('manual.item.920', 'What you need: An MQTT broker already running (Mosquitto, HiveMQ, AWS IoT).'),
                        t('manual.item.921', 'Step 1: In Trier → Settings → Sensor Gateway → Add Connection.'),
                        t('manual.item.922', 'Step 2: Select Type: MQTT Subscriber.'),
                        t('manual.item.923', 'Step 3: Enter Broker Host (e.g., mqtt.example.com), Port (1883 or 8883 for TLS), Username, Password.'),
                        t('manual.item.924', 'Step 4: Enter Topic Filter (e.g., plant/sensors/# to catch all subtopics).'),
                        t('manual.item.925', 'Step 5: Set the JSON Path for the value (e.g., $.temperature or $.value).'),
                        t('manual.item.926', 'Step 6: Click "Test Connection". Trier connects and listens for messages.'),
                        t('manual.item.927', 'Step 7: Publish a test message: mosquitto_pub -h mqtt.example.com -t plant/sensors/boiler -m \'{"value": 185, "unit": "°F"}\'.'),
                        t('manual.item.928', 'Step 8: The reading appears in the Sensor Dashboard within seconds.'),
                        'Tip: For AWS IoT, use port 8883 with TLS and download the root CA certificate.'
                    ]
                }
            ]
        },
                {
            section: t('manual.s16.title', 'Part 17: Floor Plans & Facility Mapping'),
            id: 'floor-plans',
            navigateTo: '/assets',
            filePath: 'src/components/FloorPlanView.jsx',
            icon: <Globe size={22} />,
            content: t('manual.s16.content', 'Upload facility floor plans, import AutoCAD drawings, import LiDAR 3D scans, place multi-layer pins, drag-drop equipment icons, draw evacuation routes, and manage multiple plans per plant.'),
            subsections: [
                {
                    title: t('manual.sub.76', '15.1 What Are Floor Plans?'),
                    items: [
                        t('manual.item.656', 'Floor Plans let you upload, import, or scan your plant layout and place interactive equipment "pins" on it.'),
                        t('manual.item.657', 'Each pin links to a real asset in the database \u2014 click it to see work orders, history, and status.'),
                        t('manual.item.658', 'Supports 6 pin layer types: Assets, Fire, Tornado, Flood, Exits, and Utility \u2014 filter layers to see only what matters.'),
                        t('manual.item.659', 'Use floor plans for: walk-through inspections, onboarding new techs, planning shutdowns, emergency evacuation, and visualizing where equipment lives.'),
                        'Multiple input methods: image upload, clipboard paste (Google Maps screenshots), AutoCAD DXF import, and LiDAR 3D scan import.'
                    ]
                },
                {
                    title: t('manual.sub.77', '15.2 Creating Your First Floor Plan'),
                    items: [
                        t('manual.item.660', '1. Go to Assets & Machinery \u2192 click the "Floor Plan" tab.'),
                        t('manual.item.661', '2. If no plans exist, you see the landing page with upload options.'),
                        t('manual.item.662', '3. Choose one of the input methods:'),
                        t('manual.item.663', '   \u2022 Upload Floor Plan \u2014 Select any image (JPEG, PNG). Works for photos, scanned drawings, or screenshots.'),
                        t('manual.item.664', '   \u2022 Paste from Clipboard \u2014 Copy a Google Maps satellite screenshot (Win+Shift+S), then paste directly.'),
                        t('manual.item.665', '   \u2022 Import CAD File (.dxf) \u2014 Upload an AutoCAD .dxf file. Server auto-converts entities to a high-res PNG.'),
                        t('manual.item.666', '   \u2022 Import LiDAR Scan (.ply/.obj) \u2014 Upload a 3D scan from Polycam or RoomPlan. Server projects to 2D floor plan.'),
                        t('manual.item.667', '4. Enter a Name for the plan (e.g., "Building 1 \u2014 Ground Floor").'),
                        '5. The floor plan appears \u2014 ready for pins, annotations, and icons.'
                    ]
                },
                {
                    title: t('manual.sub.78', '15.3 Multiple Floor Plans Per Plant'),
                    items: [
                        t('manual.item.668', 'Each plant can have unlimited floor plans \u2014 one per building, floor, area, or purpose.'),
                        t('manual.item.669', 'Plans are categorized by type: Facility, Fire Safety, Emergency, Utility, CAD/Engineering, Custom.'),
                        t('manual.item.670', 'When you have 2+ plans, a plan type tab bar appears at the top for quick filtering.'),
                        t('manual.item.671', 'Each tab shows a count badge so you can see how many plans exist per type.'),
                        t('manual.item.672', 'Use the plan dropdown selector to switch between plans within the current category.'),
                        'To add more plans: Click the "+ Add Plan" button in the toolbar.'
                    ]
                },
                {
                    title: t('manual.sub.79', '15.4 AutoCAD DXF Import'),
                    items: [
                        t('manual.item.673', 'If your plant has AutoCAD floor plan drawings, you can import them directly.'),
                        t('manual.item.674', '1. Click "Import CAD File (.dxf)" on the landing page, or "+ Add Plan \u2192 Import CAD" in the toolbar.'),
                        t('manual.item.675', '2. Select your .dxf file.'),
                        t('manual.item.676', '3. Enter a name for the floor plan.'),
                        t('manual.item.677', '4. The server parses all DXF entities (walls, polylines, circles, arcs, text, dimensions), respects AutoCAD layer colors, flips the Y-axis correctly, and renders to high-resolution PNG (up to 4000px wide).'),
                        t('manual.item.678', '5. Import stats are shown: entity count, layers detected, entity types.'),
                        t('manual.item.679', 'Supported entities: LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, ELLIPSE, TEXT, MTEXT, DIMENSION, POINT.'),
                        'Tip: Export from AutoCAD as DXF R2018 or earlier for best compatibility.'
                    ]
                },
                {
                    title: t('manual.sub.80', '15.5 LiDAR 3D Scan Import (iPhone/iPad Pro)'),
                    items: [
                        t('manual.item.680', 'If you have an iPhone Pro or iPad Pro with LiDAR, you can scan your facility and import the 3D model as a 2D floor plan.'),
                        t('manual.item.681', 'Note: The LiDAR sensor is not accessible from a web browser. You scan with a free app, then upload the file to Trier OS.'),
                        '',
                        t('manual.item.682', 'RECOMMENDED FREE APPS (download from the App Store):'),
                        t('manual.item.683', '   \u2022 Polycam (iOS/Android) \u2014 Most popular. Export as .obj or .ply. Best results for floor plans.'),
                        t('manual.item.684', '   \u2022 3D Scanner App (iOS) \u2014 Simple and fast. Exports .ply point clouds.'),
                        t('manual.item.685', '   \u2022 RoomPlan (iOS 16+, built into Apple ARKit) \u2014 Best for individual rooms.'),
                        t('manual.item.686', '   \u2022 Scaniverse (iOS) \u2014 High quality scans. Export as .obj.'),
                        '',
                        t('manual.item.687', 'HOW TO SCAN & IMPORT:'),
                        t('manual.item.688', '1. Open Polycam (or your preferred LiDAR app) on your iPhone/iPad Pro.'),
                        t('manual.item.689', '2. Select "LiDAR Mode" or "Room Scan" mode.'),
                        t('manual.item.690', '3. Walk slowly around the space. Keep the phone steady and pointed at walls/floor.'),
                        t('manual.item.691', '4. Walk the entire perimeter of the room or building at about 1 step per second.'),
                        t('manual.item.692', '5. When done, tap "Finish Scan" in the app.'),
                        t('manual.item.693', '6. Export the scan: In Polycam, tap Share \u2192 Export \u2192 select ".OBJ" format \u2192 Save to Files.'),
                        t('manual.item.694', '   In 3D Scanner App, tap Share \u2192 Export as "PLY" \u2192 Save to Files.'),
                        t('manual.item.695', '7. Transfer the file to your computer (AirDrop, email, or cloud storage).'),
                        t('manual.item.696', '8. In Trier OS: Click "Import LiDAR Scan (.ply/.obj)" or "+ Add Plan \u2192 LiDAR Scan".'),
                        t('manual.item.697', '9. Select the .ply or .obj file and enter a name.'),
                        t('manual.item.698', '10. The server parses all 3D vertices, filters to wall-height level, projects to top-down 2D, and renders as PNG with a 1-meter scale bar.'),
                        '',
                        t('manual.item.699', 'TIPS FOR BEST RESULTS:'),
                        t('manual.item.700', '   \u2022 Scan during the day with lights on for best texture capture.'),
                        t('manual.item.701', '   \u2022 Walk the entire perimeter for a complete outline.'),
                        t('manual.item.702', '   \u2022 For large buildings, scan section by section and upload as separate plans.'),
                        '   \u2022 Polycam .obj files generally produce the cleanest results.'
                    ]
                },
                {
                    title: t('manual.sub.81', '15.6 Google Maps Satellite Floor Plan (Quick Start)'),
                    items: [
                        t('manual.item.703', 'The fastest way to create a floor plan \u2014 no scanning or CAD software needed.'),
                        t('manual.item.704', '1. Open Google Maps \u2192 go to your plant address.'),
                        t('manual.item.705', '2. Switch to Satellite view.'),
                        t('manual.item.706', '3. Right-click \u2192 "Measure distance" \u2192 click points around the building perimeter.'),
                        t('manual.item.707', '4. Use Snipping Tool (Win+Shift+S) \u2192 drag to select the map area.'),
                        t('manual.item.708', '5. In Trier OS \u2192 click "Paste from Clipboard" \u2192 crop if needed.'),
                        '6. Use Calibrate + Blueprint to finish setup.'
                    ]
                },
                {
                    title: t('manual.sub.82', '15.7 Photo Assembly (Build Floor Plan from Photos)'),
                    items: [
                        t('manual.item.709', 'Build a composite floor plan from multiple facility photos taken with your phone.'),
                        t('manual.item.710', 'Click the "\uD83D\uDCF8 Photo Build" button in the toolbar to open the Photo Assembly workspace.'),
                        '',
                        'WORKFLOW:',
                        t('manual.item.711', '1. TAKE PHOTOS \u2014 Walk your facility and take photos every 10-15 feet. Hold your phone level at chest height.'),
                        t('manual.item.712', '2. UPLOAD \u2014 Select all photos. GPS coordinates and compass heading are automatically extracted from EXIF data.'),
                        t('manual.item.713', '3. AUTO-ARRANGE \u2014 Photos with GPS are positioned based on real-world coordinates. Photos without GPS go into a grid.'),
                        t('manual.item.714', '4. MANUAL ADJUST \u2014 Drag to reposition, use sliders for width (80\u2013800px), rotation (\u00B1180\u00B0), and opacity (10\u2013100%).'),
                        t('manual.item.715', '5. EXPORT \u2014 All photos are merged into a single composite image and saved as a floor plan.'),
                        '',
                        'FEATURES:',
                        t('manual.item.716', '   \u2022 EXIF GPS extraction (latitude, longitude) for auto-positioning.'),
                        t('manual.item.717', '   \u2022 Compass heading extraction for auto-rotation alignment.'),
                        t('manual.item.718', '   \u2022 GPS proximity stitching \u2014 overlapping photos auto-arrange by real-world position.'),
                        t('manual.item.719', '   \u2022 Guided Walk-Through with 5-step wizard and tips.'),
                        t('manual.item.720', '   \u2022 Zoomable/pannable canvas with grid background.'),
                        t('manual.item.721', '   \u2022 Photo list panel showing GPS \u2713, compass bearing, camera model, and timestamp.'),
                        t('manual.item.722', '   \u2022 Add or remove photos at any stage.'),
                        '',
                        t('manual.item.723', 'TIPS FOR BEST RESULTS:'),
                        t('manual.item.724', '   \u2022 Enable Location Services on your phone camera for GPS tagging.'),
                        t('manual.item.725', '   \u2022 Ensure 20-30% overlap between adjacent photos.'),
                        t('manual.item.726', '   \u2022 Photos with compass heading data will be auto-rotated to align.'),
                        '   \u2022 Use opacity adjustment to blend overlapping areas smoothly.'
                    ]
                },
                {
                    title: t('manual.sub.83', '15.8 Placing Equipment Pins (Multi-Layer)'),
                    items: [
                        t('manual.item.727', '1. Open a floor plan and click "Edit" to enter edit mode.'),
                        t('manual.item.728', '2. Select the Layer Type: Assets, Fire, Tornado, Flood, Exits, or Utility.'),
                        t('manual.item.729', '3. For Asset pins: select the asset from the dropdown. For other layers: type a label.'),
                        t('manual.item.730', '4. Click "Place Pin" then click on the floor plan image where the item is located.'),
                        t('manual.item.731', '5. Drag pins to reposition them. Position auto-saves.'),
                        t('manual.item.732', '6. Use the Layer Filter buttons (ALL, ASSETS, FIRE, etc.) to show/hide layers.'),
                        'Asset pins show health colors: Green = Healthy, Orange = At Risk, Red = Critical, Gray = Unknown.'
                    ]
                },
                {
                    title: t('manual.sub.84', '15.9 Equipment Icon Library (Drag & Drop)'),
                    items: [
                        t('manual.item.733', 'A library of 24+ SVG equipment icons across 7 categories for visual facility mapping.'),
                        t('manual.item.734', '1. Enter Edit mode on any floor plan.'),
                        t('manual.item.735', '2. Click the "Icons" button on the left edge \u2014 the icon palette slides open.'),
                        t('manual.item.736', '3. Browse categories: Processing, Packaging, HVAC/Utility, Storage, Logistics, Safety, Electrical.'),
                        t('manual.item.737', '4. Drag any icon and drop it directly onto the floor plan.'),
                        'Icons include: Separators, Pasteurizers, Homogenizers, CIP Systems, Boilers, Compressors, Fillers, Forklifts, and more.'
                    ]
                },
                {
                    title: t('manual.sub.85', '15.10 Drawing Tools, Measurements & Evacuation Routes'),
                    items: [
                        t('manual.item.738', '1. Enter Edit mode and select a drawing tool from the toolbar.'),
                        t('manual.item.739', '2. Arrow tool \u2014 Click start point, then end point. Creates a directional arrow with optional label.'),
                        t('manual.item.740', '3. Route tool \u2014 Click to place waypoints, double-click to finish. Creates a multi-point path.'),
                        t('manual.item.741', '4. Measure tool \u2014 Click two points to measure the distance between them.'),
                        t('manual.item.742', '5. Text tool \u2014 Click to place a text label at any position.'),
                        t('manual.item.743', '6. Select a color: Red (fire/emergency), Green (safe), Blue (utility), Yellow (caution).'),
                        '',
                        t('manual.item.744', 'CALIBRATION & SCALE:'),
                        t('manual.item.745', '   \u2022 Click "\u2699 Calibrate" to set a reference scale.'),
                        t('manual.item.746', '   \u2022 Enter a known distance (e.g., 800 ft from Google Maps "Measure distance").'),
                        t('manual.item.747', '   \u2022 Click the two endpoints of that distance on the floor plan.'),
                        t('manual.item.748', '   \u2022 Once calibrated, all measurements auto-calculate in real-world units.'),
                        t('manual.item.749', '   \u2022 Hover over any pin to see the distance to the nearest pin.'),
                        t('manual.item.750', '   \u2022 A dashed cyan line shows the distance between hovered pin and nearest neighbor.'),
                        t('manual.item.751', '   \u2022 Zone areas auto-calculate using the calibrated scale (shown in ft\u00B2, m\u00B2, etc.).'),
                        '',
                        'Tip: Create a dedicated "Emergency" type floor plan with exit routes for safety compliance.'
                    ]
                },
                {
                    title: t('manual.sub.86', '15.11 Blueprint Conversion'),
                    items: [
                        t('manual.item.752', 'Convert any satellite image or photo into a clean engineering-style blueprint.'),
                        t('manual.item.753', '1. Upload or paste your floor plan.'),
                        t('manual.item.754', '2. Click the "Blueprint" button in the toolbar.'),
                        t('manual.item.755', '3. Toggle between Satellite and Blueprint views using the view mode button.'),
                        '4. Both views share the same pins and annotations.'
                    ]
                },
                {
                    title: t('manual.sub.87', '15.12 Using Floor Plans for Walk-Through Inspections'),
                    items: [
                        t('manual.item.756', '1. Open the floor plan for the area you are inspecting.'),
                        t('manual.item.757', '2. Start at one end and work your way across.'),
                        t('manual.item.758', '3. Click each pin to see the asset details and any open work orders.'),
                        t('manual.item.759', '4. If you spot an issue, click "Create WO" directly from the pin \u2014 it pre-fills the asset.'),
                        t('manual.item.760', '5. Continue to the next pin. This ensures no equipment is missed.'),
                        'Use the zoom controls to get detailed views of dense equipment areas.'
                    ]
                },
                {
                    title: t('manual.sub.88', '15.13 Version History & Snapshots'),
                    items: [
                        t('manual.item.761', 'Track changes to your floor plans over time with automatic and manual versioning.'),
                        '',
                        t('manual.item.762', 'ACCESSING VERSION HISTORY:'),
                        t('manual.item.763', '   \u2022 Click the "History" button in the toolbar (purple clock icon).'),
                        t('manual.item.764', '   \u2022 A slide-over panel shows all saved versions as a timeline.'),
                        t('manual.item.765', '   \u2022 Each version shows: version number, description, date/time, and who made the change.'),
                        '',
                        t('manual.item.766', 'CREATING SNAPSHOTS:'),
                        t('manual.item.767', '   \u2022 Click "\uD83D\uDCF8 Save Snapshot" to manually save the current state.'),
                        t('manual.item.768', '   \u2022 Enter a note describing what changed (e.g., "Added fire exit pins").'),
                        t('manual.item.769', '   \u2022 Snapshots are also created automatically when you generate blueprints or re-upload images.'),
                        '',
                        t('manual.item.770', 'COMPARING VERSIONS:'),
                        t('manual.item.771', '   \u2022 Click "\uD83D\uDC41 Compare" on any version to see a side-by-side view.'),
                        t('manual.item.772', '   \u2022 The previous version appears on the left, the current version on the right.'),
                        t('manual.item.773', '   \u2022 Click "\u2715 Close Compare" to dismiss.'),
                        '',
                        'REVERTING:',
                        t('manual.item.774', '   \u2022 Click "\u23EA Revert" on any version to restore that version.'),
                        t('manual.item.775', '   \u2022 Your current state is automatically saved as a snapshot before reverting.'),
                        '   \u2022 This means you can always undo a revert by reverting again.'
                    ]
                },
                {
                    title: t('manual.sub.89', '15.14 Zone Management'),
                    items: [
                        t('manual.item.776', 'Zones are polygonal areas drawn directly on the floor plan to define functional regions.'),
                        t('manual.item.777', 'Support for 8 zone types: Production, Storage, Utility, Restricted, Hazard, Emergency, Office, Custom.'),
                        '',
                        t('manual.item.778', 'HOW TO CREATE A ZONE:'),
                        t('manual.item.779', '1. Enter Edit mode and select the "Zone" draw tool from the toolbar.'),
                        t('manual.item.780', '2. Choose the Zone Type from the selector that appears (e.g., Production, Hazard, Storage).'),
                        t('manual.item.781', '3. Click on the floor plan to place polygon vertices \u2014 each click adds a corner point.'),
                        t('manual.item.782', '4. Double-click to finish the polygon. A dialog asks for the zone name.'),
                        t('manual.item.783', '5. For Hazard zones, an additional prompt asks for the hazard classification (e.g., Ammonia, Electrical, Confined Space).'),
                        t('manual.item.784', '6. The zone appears as a semi-transparent colored polygon with a label at its center.'),
                        '',
                        t('manual.item.785', 'ZONE FEATURES:'),
                        t('manual.item.786', '   \u2022 Color-coded fills \u2014 each zone type has a distinct color.'),
                        t('manual.item.787', '   \u2022 Dashed borders \u2014 Hazard and Restricted zones use dashed outlines for visibility.'),
                        t('manual.item.788', '   \u2022 Hazard badges \u2014 hazard classification shown below the zone name (e.g., \u26A0 Ammonia).'),
                        t('manual.item.789', '   \u2022 Click a zone to see its info panel (name, type, hazard class, capacity, area).'),
                        t('manual.item.790', '   \u2022 Hover in edit mode to reveal the \u2715 delete button.'),
                        t('manual.item.791', '   \u2022 Zone counter shows total zones alongside annotation count.'),
                        t('manual.item.792', '   \u2022 Area calculation \u2014 zone area auto-computed using Shoelace formula.'),
                        '   \u2022 When scale is calibrated, area shows in real-world units\u00B2 (ft\u00B2, m\u00B2). Otherwise shows px\u00B2.'
                    ]
                },
                {
                    title: t('manual.sub.90', '15.15 Multi-Floor Support'),
                    items: [
                        t('manual.item.793', 'For multi-story buildings, assign each floor plan to a specific building and floor level.'),
                        '',
                        t('manual.item.794', 'HOW TO ASSIGN A FLOOR:'),
                        t('manual.item.795', '1. Click the "Set Floor" button in the toolbar (cyan building icon).'),
                        t('manual.item.796', '2. Enter the Building Name (e.g., "Building A", "Main Plant", "Warehouse").'),
                        t('manual.item.797', '3. Enter the Floor Level (e.g., "Ground Floor", "2nd Floor", "Basement", "Mezzanine", "Roof Level").'),
                        t('manual.item.798', '4. The plan is now tagged with building and floor information.'),
                        '',
                        t('manual.item.799', 'FLOOR NAVIGATION:'),
                        t('manual.item.800', '   \u2022 When plans have floor data, a Building/Floor navigation bar auto-appears.'),
                        t('manual.item.801', '   \u2022 Click building buttons to filter by building \u2014 count badges show plans per building.'),
                        t('manual.item.802', '   \u2022 Click floor buttons (B2, B1, G, Mezz, 1F, 2F, 3F, 4F, Roof) to filter by floor.'),
                        t('manual.item.803', '   \u2022 Floors are sorted by physical order: Basement \u2192 Ground \u2192 Mezzanine \u2192 Upper Floors \u2192 Roof.'),
                        t('manual.item.804', '   \u2022 Switching floors auto-selects the first plan on that floor.'),
                        t('manual.item.805', '   \u2022 The plan dropdown shows floor level and building in the name.'),
                        '',
                        t('manual.item.806', 'SUPPORTED FLOOR LEVELS:'),
                        t('manual.item.807', '   B2 (Basement 2), B1 (Basement), G (Ground Floor), Mezz (Mezzanine),'),
                        t('manual.item.808', '   1F (1st Floor), 2F (2nd Floor), 3F (3rd Floor), 4F (4th Floor), Roof (Roof Level).'),
                        '',
                        t('manual.item.809', 'CROSS-FLOOR TRACKING:'),
                        t('manual.item.810', '   \u2022 Equipment assets appear in the Master Equipment Catalog regardless of which floor they are pinned on.'),
                        t('manual.item.811', '   \u2022 Dashboard search finds assets across all buildings and floors.'),
                        '   \u2022 Work orders link to the correct floor plan automatically.'
                    ]
                },
                {
                    title: t('manual.sub.91', '15.16 Mobile & AR Features'),
                    items: [
                        t('manual.item.812', 'Floor plans are fully optimized for mobile devices with touch controls and real-time features.'),
                        '',
                        t('manual.item.813', 'TOUCH CONTROLS (Mobile/Tablet):'),
                        t('manual.item.814', '   \u2022 Pinch to zoom \u2014 Two-finger pinch gesture zooms in/out centered on your fingers.'),
                        t('manual.item.815', '   \u2022 Single-finger drag \u2014 Pan the floor plan by swiping with one finger.'),
                        t('manual.item.816', '   \u2022 All toolbar buttons and pins remain fully interactive on touch screens.'),
                        '',
                        t('manual.item.817', 'GPS "YOU ARE HERE" (\uD83D\uDCCD):'),
                        t('manual.item.818', '   \u2022 Click the "GPS" button in the toolbar to enable location tracking.'),
                        t('manual.item.819', '   \u2022 A blue pulsing dot shows your real-time position on the floor plan.'),
                        t('manual.item.820', '   \u2022 Position is calculated using GPS reference data from existing pins.'),
                        t('manual.item.821', '   \u2022 For best accuracy, ensure at least 2 pins have GPS coordinates set.'),
                        t('manual.item.822', '   \u2022 Click "GPS On" again to stop tracking.'),
                        '',
                        t('manual.item.823', 'AR VIEW (\uD83D\uDCF1):'),
                        t('manual.item.824', '   \u2022 Click the "AR" button to open the augmented reality overlay.'),
                        t('manual.item.825', '   \u2022 Your device camera activates with equipment status badges floating on screen.'),
                        t('manual.item.826', '   \u2022 Each badge shows: asset name, health status (Healthy/Critical/Has WO), and layer type.'),
                        t('manual.item.827', '   \u2022 Color-coded dots: Green = Healthy, Red = Critical, Orange = Has Work Orders.'),
                        t('manual.item.828', '   \u2022 Point your camera at equipment to see status information overlaid.'),
                        '   \u2022 Click "\u2715 Close AR" to return to the standard floor plan view.'
                    ]
                },
                {
                    title: t('manual.sub.92', '15.17 Real-Time Sensors & Heat Map'),
                    items: [
                        t('manual.item.829', 'Overlay live sensor data directly on your floor plan with automatic status monitoring.'),
                        '',
                        t('manual.item.830', 'SENSOR TYPES (6 supported):'),
                        t('manual.item.831', '   \u2022 \uD83C\uDF21\uFE0F Temperature \u2014 °F monitoring with heat map visualization.'),
                        t('manual.item.832', '   \u2022 \uD83D\uDD35 Pressure \u2014 PSI monitoring for pneumatic/hydraulic systems.'),
                        t('manual.item.833', '   \u2022 \uD83D\uDCF3 Vibration \u2014 mm/s monitoring for rotating equipment.'),
                        t('manual.item.834', '   \u2022 \uD83D\uDCA7 Humidity \u2014 %RH monitoring for climate-controlled areas.'),
                        t('manual.item.835', '   \u2022 \uD83D\uDEB6 Motion \u2014 Binary detection for safety monitoring.'),
                        t('manual.item.836', '   \u2022 \uD83D\uDC65 Occupancy \u2014 People count for zone capacity tracking.'),
                        '',
                        t('manual.item.837', 'PLACING SENSORS:'),
                        t('manual.item.838', '1. Enter Edit mode and click "Sensors" to enable the sensor overlay.'),
                        t('manual.item.839', '2. Click a sensor type button (Temperature, Pressure, etc.) in the placement bar.'),
                        t('manual.item.840', '3. Click on the floor plan where the sensor is located. Enter a name.'),
                        t('manual.item.841', '4. The sensor appears as a live-updating badge with real-time value.'),
                        '',
                        t('manual.item.842', 'LIVE DATA & ALERTS:'),
                        t('manual.item.843', '   \u2022 Sensor values update every 5 seconds via automatic polling.'),
                        t('manual.item.844', '   \u2022 Status colors: Green = Normal, Orange = Warning, Red = Critical.'),
                        t('manual.item.845', '   \u2022 Critical sensors pulse to draw attention.'),
                        t('manual.item.846', '   \u2022 Each sensor has configurable alert thresholds (e.g., alert if temp > 90°F).'),
                        t('manual.item.847', '   \u2022 The sensor status bar shows counts: Normal, Warning, Critical.'),
                        '',
                        'HEAT MAP:',
                        t('manual.item.848', '   \u2022 Click "Heat Map" to toggle the temperature/humidity gradient overlay.'),
                        t('manual.item.849', '   \u2022 Warm areas show red gradients, cool areas show blue gradients.'),
                        t('manual.item.850', '   \u2022 Motion/occupancy zones show purple intensity gradients.'),
                        '',
                        t('manual.item.851', 'SCADA/IoT INTEGRATION:'),
                        t('manual.item.852', '   \u2022 Each sensor supports a SCADA Endpoint URL and Tag for live data.'),
                        t('manual.item.853', '   \u2022 When configured, the system polls the endpoint instead of using simulated values.'),
                        '   \u2022 Compatible with Modbus TCP, OPC-UA, or any REST-based IoT gateway.'
                    ]
                },
                {
                    title: t('manual.sub.93', '15.18 Emergency Mode'),
                    items: [
                        t('manual.item.854', 'One-click Emergency Mode transforms the floor plan into an evacuation command center.'),
                        '',
                        t('manual.item.855', 'ACTIVATING:'),
                        t('manual.item.856', '   \u2022 Click the "\uD83D\uDED1 Emergency" button in the toolbar.'),
                        t('manual.item.857', '   \u2022 Confirm activation \u2014 this enables all emergency features simultaneously.'),
                        t('manual.item.858', '   \u2022 A pulsing red banner appears: "EMERGENCY MODE ACTIVE".'),
                        t('manual.item.859', '   \u2022 All fire, exit, tornado, and flood pins become visible regardless of layer filter.'),
                        '',
                        t('manual.item.860', 'NEAREST EXIT:'),
                        t('manual.item.861', '   \u2022 The system automatically identifies the nearest emergency exit.'),
                        t('manual.item.862', '   \u2022 If GPS is active, it calculates from your real position.'),
                        t('manual.item.863', '   \u2022 A cyan pulsing badge at the bottom shows the exit name and location.'),
                        '',
                        t('manual.item.864', 'HEADCOUNT TRACKER:'),
                        t('manual.item.865', '   \u2022 A panel on the right tracks evacuation headcount.'),
                        t('manual.item.866', '   \u2022 Shows ACCOUNTED (green) and MISSING (red, pulsing) counters.'),
                        t('manual.item.867', '   \u2022 Click "Mark Person Accounted" to log each person by name + time.'),
                        t('manual.item.868', '   \u2022 "Set Expected Total" to update the expected headcount.'),
                        t('manual.item.869', '   \u2022 Total defaults from zone capacity data.'),
                        '',
                        t('manual.item.870', 'PRINT EMERGENCY PACKET:'),
                        t('manual.item.871', '   \u2022 Click "Print Packet" in the emergency banner.'),
                        t('manual.item.872', '   \u2022 Opens a printable document with: floor plan image, equipment legend,'),
                        t('manual.item.873', '     all emergency pin locations, evacuation routes, and a printable headcount sheet.'),
                        t('manual.item.874', '   \u2022 Suitable for posting at assembly points or distributing during drills.'),
                        '',
                        t('manual.item.875', 'DEACTIVATING:'),
                        '   \u2022 Click "\u2715 Deactivate" in the emergency banner to return to normal mode.'
                    ]
                },
                {
                    title: t('manual.sub.94', '15.19 Best Practices'),
                    items: [
                        t('manual.item.876', '1. Start with a Google Maps satellite screenshot \u2014 it takes 30 seconds.'),
                        t('manual.item.877', '2. Create separate plans for separate purposes: Facility for equipment, Fire Safety for extinguishers/exits, Emergency for evacuation.'),
                        t('manual.item.878', '3. If you have AutoCAD drawings, use DXF Import \u2014 most accurate results.'),
                        t('manual.item.879', '4. Use LiDAR scanning for areas where no CAD drawings exist.'),
                        t('manual.item.880', '5. Place Asset pins during your first equipment walk-through.'),
                        t('manual.item.881', '6. Keep Fire and Exit pins on their own layers so they can be shown/hidden independently.'),
                        t('manual.item.882', '7. Use the Blueprint conversion for a clean, professional look suitable for posting.'),
                        t('manual.item.883', '8. Draw zones to define production areas, hazard zones, and emergency assembly points.'),
                        t('manual.item.884', '9. For multi-story buildings, use "Set Floor" to tag each plan \u2014 enables floor-by-floor navigation.'),
                        '10. Combine all three filters (Plan Type + Building + Floor) for instant access to any plan in large facilities.'
                    ]
                }
            ]
        },

        {
            section: t('manual.s18.title', 'Part 18: Safety & Compliance'),
            id: 'safety-compliance',
            navigateTo: '/safety',
            filePath: 'src/components/SafetyView.jsx',
            icon: <ShieldAlert size={22} />,
            content: t('manual.s18.content', 'Built-in safety management: incidents, near-misses, LOTO, permits, JSA/JHA, and OSHA recordkeeping.'),
            subsections: [
                {
                    title: '17A.1 Safety Module Overview',
                    items: [
                        t('manual.item.929', 'The Safety & Compliance module provides tools for managing workplace safety directly within the Enterprise System.'),
                        '',
                        t('manual.item.930', 'KEY FEATURES:'),
                        t('manual.item.931', '   \u2022 Incident Tracking \u2014 Record workplace injuries, near-misses, and property damage.'),
                        t('manual.item.932', '   \u2022 Near-Miss Logging \u2014 Capture close calls before they become incidents.'),
                        t('manual.item.933', '   \u2022 Safety Observations \u2014 Positive safety behavior recognition and hazard reporting.'),
                        t('manual.item.934', '   \u2022 JSA/JHA Templates \u2014 Job Safety Analysis and Job Hazard Analysis forms.'),
                        t('manual.item.935', '   \u2022 OSHA Recordkeeping \u2014 OSHA 300 log data collection and tracking.'),
                        t('manual.item.936', '   \u2022 LOTO (Lock Out / Tag Out) \u2014 Energy isolation procedures linked to assets.'),
                        t('manual.item.937', '   \u2022 Safety Permits \u2014 Hot work, confined space, and other permit types.'),
                        t('manual.item.938', '   \u2022 Compliance Tracker \u2014 Track regulatory compliance across all plants.'),
                        '',
                        t('manual.item.939', 'HOW TO ACCESS:'),
                        t('manual.item.940', '   \u2022 Click the Safety & Compliance tile in the Portal.'),
                        '   \u2022 All safety data integrates with work orders and asset records.'
                    ]
                },
                {
                    title: '17A.2 Logging an Incident',
                    items: [
                        t('manual.item.941', 'HOW TO LOG A SAFETY INCIDENT:'),
                        t('manual.item.942', '1. Navigate to Safety & Compliance.'),
                        t('manual.item.943', '2. Click "+ New Incident."'),
                        t('manual.item.944', '3. Select incident type: Injury, Near-Miss, Property Damage, Environmental.'),
                        t('manual.item.945', '4. Enter date, time, location, and description.'),
                        t('manual.item.946', '5. Assign severity level and root cause category.'),
                        t('manual.item.947', '6. Attach photos and witness statements.'),
                        t('manual.item.948', '7. Submit for review.'),
                        '',
                        t('manual.item.949', 'FOLLOW-UP ACTIONS:'),
                        t('manual.item.950', '   \u2022 Corrective actions can be created as work orders automatically.'),
                        t('manual.item.951', '   \u2022 Track investigation status and resolution.'),
                        t('manual.item.952', '   \u2022 All incidents feed into safety KPI dashboards.'),
                        '',
                        t('manual.item.953', 'LOTO PROCEDURES:'),
                        t('manual.item.954', '   \u2022 Each asset can have LOTO procedures attached.'),
                        t('manual.item.955', '   \u2022 LOTO procedures list all energy sources (electrical, hydraulic, pneumatic, etc.).'),
                        t('manual.item.956', '   \u2022 Step-by-step isolation and verification instructions.'),
                        '',
                        t('manual.item.957', 'TROUBLESHOOTING:'),
                        t('manual.item.958', '   \u2022 Cannot submit incident? \u2014 All required fields must be filled.'),
                        '   \u2022 LOTO not showing for an asset? \u2014 LOTO procedures must be created by a supervisor.'
                    ,
                        '',
                        t('manual.item.959', 'NEAR-MISS REPORTING:'),
                        t('manual.item.960', '   • Near-misses are critical for preventing future incidents.'),
                        t('manual.item.961', '   • Anyone can report a near-miss — technicians, operators, supervisors.'),
                        t('manual.item.962', '   • Near-miss reports are reviewed by safety committee and may trigger corrective actions.'),
                        t('manual.item.963', '   • Anonymous reporting option available if enabled by plant admin.'),
                        '',
                        t('manual.item.964', 'SAFETY OBSERVATIONS:'),
                        t('manual.item.965', '   • Positive observations — recognize safe behavior ("Caught doing it right").'),
                        t('manual.item.966', '   • Hazard observations — report unsafe conditions before they cause incidents.'),
                        t('manual.item.967', '   • Observations feed into the safety culture metrics dashboard.'),
                        '',
                        t('manual.item.968', 'JSA / JHA TEMPLATES:'),
                        t('manual.item.969', '   • Job Safety Analysis templates list hazards, risks, and controls for specific job types.'),
                        t('manual.item.970', '   • Pre-built templates for common maintenance tasks (confined space, hot work, electrical).'),
                        t('manual.item.971', '   • Custom JSAs can be created for site-specific procedures.'),
                        '   • JSAs can be linked to work orders — technicians review before starting work.'
                    ]
                },
                {
                    title: t('manual.sub.99', '17.1 Downtime Logging & Analysis'),
                    items: [
                        t('manual.item.1150', 'The Downtime Logs module aggregates downtime data from closed work orders to show equipment reliability.'),
                        '',
                        t('manual.item.1151', 'ACCESSING DOWNTIME LOGS:'),
                        t('manual.item.1152', '   \u2022 Navigate to Downtime Logs from the Portal tile or navigation menu.'),
                        t('manual.item.1153', '   \u2022 Data is auto-populated from work orders with ActDown > 0.'),
                        '',
                        'VIEWS:',
                        t('manual.item.1154', '   \u2022 Summary View \u2014 KPI cards showing total downtime hours, affected assets, and cost impact.'),
                        t('manual.item.1155', '   \u2022 Detail View \u2014 Per-asset breakdown with expandable rows.'),
                        t('manual.item.1156', '   \u2022 Click any asset row to expand and see individual downtime events.'),
                        '',
                        'KPI CARDS:',
                        t('manual.item.1157', '   \u2022 Total Downtime Hours \u2014 Across all assets in the selected period.'),
                        t('manual.item.1158', '   \u2022 Assets Affected \u2014 Count of unique assets with downtime.'),
                        t('manual.item.1159', '   \u2022 Avg Downtime per Event \u2014 Average hours per downtime incident.'),
                        t('manual.item.1160', '   \u2022 Cost Impact \u2014 Estimated production loss from downtime.'),
                        '',
                        t('manual.item.1161', 'Use the search bar to filter by asset name or ID.'),
                        '',
                        t('manual.item.1162', 'TROUBLESHOOTING:'),
                        t('manual.item.1163', '   \u2022 No data showing? \u2014 Ensure work orders have downtime hours entered in ActDown.'),
                        '   \u2022 Cost impact inaccurate? \u2014 Verify the hourly production cost in Settings.'
                    ]
                },
                {
                    title: t('manual.sub.100', '17.2 Digital Twin Interactive Schematic'),
                    items: [
                        t('manual.item.1164', 'The Digital Twin viewer provides interactive equipment schematics with live health overlays.'),
                        '',
                        'FEATURES:',
                        t('manual.item.1165', '   \u2022 Upload equipment schematics, piping diagrams, or wiring layouts.'),
                        t('manual.item.1166', '   \u2022 Place draggable pins on component locations \u2014 pins show live health status.'),
                        t('manual.item.1167', '   \u2022 Pin Types: Component (\u2699\ufe0f), Sensor (\ud83d\udce1), Lubrication (\ud83d\udee2\ufe0f), Electrical (\u26a1), Inspection (\ud83d\udd0d).'),
                        '',
                        t('manual.item.1168', 'HOW TO USE:'),
                        t('manual.item.1169', '1. Upload a schematic image (engineering drawing, photo, or diagram).'),
                        t('manual.item.1170', '2. Click "+ Add Pin" and click on the schematic to place a health-monitoring pin.'),
                        t('manual.item.1171', '3. Link each pin to an asset \u2014 it will show real-time work order status.'),
                        t('manual.item.1172', '4. Pin colors: Green = Healthy, Yellow = Warning, Red = Critical, Purple = Unknown.'),
                        '',
                        t('manual.item.1173', 'ZOOM & PAN:'),
                        t('manual.item.1174', '   \u2022 Mouse wheel to zoom in/out.'),
                        t('manual.item.1175', '   \u2022 Click and drag to pan the schematic.'),
                        t('manual.item.1176', '   \u2022 "Fit" button resets the view.'),
                        '',
                        t('manual.item.1177', 'LAYERS: Toggle pin visibility by layer type (Components, Sensors, Lube Points, etc.).'),
                        '',
                        t('manual.item.1178', 'TROUBLESHOOTING:'),
                        t('manual.item.1179', '   \u2022 Schematic blurry? \u2014 Upload a higher resolution image (2000px+ recommended).'),
                        '   \u2022 Pins not updating? \u2014 Ensure the linked asset has work orders in the system.'
                    ]
                },
                {
                    title: t('manual.sub.101', '17.3 Governance & Security Dashboard'),
                    items: [
                        t('manual.item.1180', 'The Governance module provides audit trail visibility, security monitoring, and RBAC compliance.'),
                        '',
                        'FEATURES:',
                        t('manual.item.1181', '   \u2022 Audit Trail \u2014 Complete log of all user actions (logins, changes, deletions).'),
                        t('manual.item.1182', '   \u2022 Activity Timeline \u2014 Visual timeline of system events.'),
                        t('manual.item.1183', '   \u2022 Security Events \u2014 Failed logins, permission violations, suspicious activity.'),
                        t('manual.item.1184', '   \u2022 User Activity \u2014 Per-user action counts and last-seen timestamps.'),
                        t('manual.item.1185', '   \u2022 RBAC Monitoring \u2014 Role-based access control overview.'),
                        '',
                        t('manual.item.1186', 'HOW TO USE:'),
                        t('manual.item.1187', '   \u2022 Use filters to narrow events by date, user, or event type.'),
                        t('manual.item.1188', '   \u2022 Click "Refresh" to get the latest data.'),
                        t('manual.item.1189', '   \u2022 Export audit logs for compliance reporting.'),
                        t('manual.item.1190', '   \u2022 Security events are color-coded by severity.'),
                        '',
                        t('manual.item.1191', 'COMMON USE CASES:'),
                        t('manual.item.1192', '   \u2022 Investigate who changed a work order status \u2014 filter by WO number.'),
                        t('manual.item.1193', '   \u2022 Monitor for unauthorized access attempts \u2014 check Security Events.'),
                        t('manual.item.1194', '   \u2022 Compliance audits \u2014 export full audit trail with timestamps.'),
                        '',
                        t('manual.item.1195', 'TROUBLESHOOTING:'),
                        t('manual.item.1196', '   \u2022 Not seeing events? \u2014 Audit logging may be disabled in Settings. Contact IT.'),
                        '   \u2022 Export failing? \u2014 Large date ranges may time out. Narrow the filter.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s19.title', 'Part 19: Engineering Excellence'),
            id: 'engineering-excellence',
            navigateTo: '/engineering',
            filePath: 'src/components/EngineeringView.jsx',
            icon: <Activity size={22} />,
            content: t('manual.s19.content', 'Advanced reliability engineering: RCA, FMEA, Repair vs. Replace, Capital Projects, Lubrication Routes, Oil Analysis, and Calibration.'),
            subsections: [
                {
                    title: '17B.1 Engineering Module Overview',
                    items: [
                        t('manual.item.972', 'The Engineering Excellence module provides reliability-focused tools for continuous improvement.'),
                        '',
                        t('manual.item.973', 'TOOLS AVAILABLE:'),
                        t('manual.item.974', '   \u2022 RCA (Root Cause Analysis) \u2014 5-Why analysis tool for finding true failure causes.'),
                        t('manual.item.975', '   \u2022 FMEA \u2014 Failure Mode and Effects Analysis with auto-calculated RPN scores.'),
                        t('manual.item.976', '   \u2022 Repair vs. Replace Calculator \u2014 Financial comparison to guide buy/fix decisions.'),
                        t('manual.item.977', '   \u2022 ECN Workflow \u2014 Engineering Change Notice approval routing.'),
                        t('manual.item.978', '   \u2022 Capital Projects \u2014 Track large improvement projects with budget and timeline.'),
                        t('manual.item.979', '   \u2022 Lubrication Routes \u2014 Planned lube routes with points, grades, and frequencies.'),
                        t('manual.item.980', '   \u2022 Oil Analysis \u2014 Sample results tracking with wear metal trending and alerts.'),
                        '   \u2022 Calibration \u2014 Instrument calibration tracking with due dates and certificates.'
                    ]
                },
                {
                    title: '17B.2 Running a 5-Why RCA',
                    items: [
                        t('manual.item.981', 'HOW TO PERFORM A ROOT CAUSE ANALYSIS:'),
                        t('manual.item.982', '1. Navigate to Engineering Excellence and select "Root Cause Analysis."'),
                        t('manual.item.983', '2. Click "+ New RCA."'),
                        t('manual.item.984', '3. Link the RCA to a work order or equipment failure event.'),
                        t('manual.item.985', '4. Define the problem statement clearly.'),
                        t('manual.item.986', '5. Enter each "Why" level \u2014 keep asking "Why?" until you reach the root cause.'),
                        t('manual.item.987', '6. Document the root cause and recommended corrective action.'),
                        t('manual.item.988', '7. Create a follow-up work order directly from the RCA.'),
                        '',
                        t('manual.item.989', 'FMEA ANALYSIS:'),
                        t('manual.item.990', '1. Select the asset or component to analyze.'),
                        t('manual.item.991', '2. List potential failure modes.'),
                        t('manual.item.992', '3. Rate Severity (1-10), Occurrence (1-10), and Detection (1-10).'),
                        t('manual.item.993', '4. RPN (Risk Priority Number) = Severity \u00d7 Occurrence \u00d7 Detection.'),
                        t('manual.item.994', '5. RPN > 100 triggers automatic alert for engineering review.'),
                        '',
                        t('manual.item.995', 'REPAIR VS. REPLACE:'),
                        t('manual.item.996', '   \u2022 Enter remaining useful life, annual repair costs, and replacement cost.'),
                        t('manual.item.997', '   \u2022 The calculator recommends Replace or Continue Repair based on NPV analysis.'),
                        '',
                        t('manual.item.998', 'TROUBLESHOOTING:'),
                        t('manual.item.999', '   \u2022 RPN not calculating? \u2014 All three scores (S, O, D) must be entered.'),
                        '   \u2022 ECN stuck in review? \u2014 Check the approval chain in Engineering settings.'
                    ]
                },
                {
                    title: '17B.3 Lubrication Routes & Oil Analysis',
                    items: [
                        t('manual.item.1000', 'LUBRICATION ROUTES:'),
                        t('manual.item.1001', '   \u2022 Define lube points on each asset (bearing, chain, gearbox, etc.).'),
                        t('manual.item.1002', '   \u2022 Assign grease/oil type and grade for each point.'),
                        t('manual.item.1003', '   \u2022 Set frequency interval (daily, weekly, monthly, by meter reading).'),
                        t('manual.item.1004', '   \u2022 Group points into routes for technician walkthrough efficiency.'),
                        t('manual.item.1005', '   \u2022 Print route sheets for field use.'),
                        '',
                        t('manual.item.1006', 'OIL ANALYSIS:'),
                        t('manual.item.1007', '   \u2022 Log oil sample results (draw date, lab, ISO cleanliness, viscosity).'),
                        t('manual.item.1008', '   \u2022 Track wear metals: Iron, Copper, Lead, Aluminum, Silicon.'),
                        t('manual.item.1009', '   \u2022 Trend analysis \u2014 watch for increasing wear metal levels.'),
                        t('manual.item.1010', '   \u2022 Automatic alerts when metals exceed threshold limits.'),
                        t('manual.item.1011', '   \u2022 Link to predictive maintenance decisions.'),
                        '',
                        t('manual.item.1012', 'CALIBRATION:'),
                        t('manual.item.1013', '   \u2022 Track instrument calibration schedules and certificates.'),
                        t('manual.item.1014', '   \u2022 Set calibration intervals and due date alerts.'),
                        t('manual.item.1015', '   \u2022 Record as-found and as-left values.'),
                        '   \u2022 Supports compliance with ISO, FDA, and GMP requirements.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s20.title', 'Part 20: Contractors & Vendor Portal'),
            id: 'contractors-vendors',
            navigateTo: '/contractors',
            filePath: 'src/components/ContractorsView.jsx',
            icon: <Users size={22} />,
            content: t('manual.s20.content', 'Manage outside contractors, track their jobs, insurance, and certifications. Self-service vendor portal for status updates.'),
            subsections: [
                {
                    title: '17C.1 Contractor Management',
                    items: [
                        t('manual.item.1016', 'HOW TO ADD A CONTRACTOR:'),
                        t('manual.item.1017', '1. Navigate to Contractors & Vendors.'),
                        t('manual.item.1018', '2. Click "+ Add Contractor."'),
                        t('manual.item.1019', '3. Enter company name, contact info, trade specialty, and hourly rate.'),
                        t('manual.item.1020', '4. Upload insurance certificate and set expiry date.'),
                        t('manual.item.1021', '5. Add any certifications or safety training records.'),
                        '',
                        t('manual.item.1022', 'MANAGING CONTRACTOR JOBS:'),
                        t('manual.item.1023', '   \u2022 Assign work orders to outside contractors.'),
                        t('manual.item.1024', '   \u2022 Track job progress, hours, and costs separately from in-house labor.'),
                        t('manual.item.1025', '   \u2022 Performance rating auto-calculated from job history (on-time, budget, quality).'),
                        '',
                        t('manual.item.1026', 'INSURANCE & CERTIFICATION ALERTS:'),
                        t('manual.item.1027', '   \u2022 System alerts 30 days before insurance or certification expires.'),
                        t('manual.item.1028', '   \u2022 Expired contractors are flagged and cannot be assigned new jobs.'),
                        '',
                        t('manual.item.1029', 'VENDOR PORTAL:'),
                        t('manual.item.1030', '   \u2022 Vendors can log in to a self-service portal.'),
                        t('manual.item.1031', '   \u2022 View assigned jobs, update status, and submit completion reports.'),
                        t('manual.item.1032', '   \u2022 No access to internal plant data \u2014 only their own jobs.'),
                        '',
                        t('manual.item.1033', 'TROUBLESHOOTING:'),
                        t('manual.item.1034', '   \u2022 Contractor not showing in assignment list? \u2014 Check if their insurance is expired.'),
                        '   \u2022 Vendor portal login issues? \u2014 Portal credentials are separate from internal logins.'
                    ,
                        '',
                        t('manual.item.1035', 'PERFORMANCE TRACKING IN DETAIL:'),
                        t('manual.item.1036', '   • On-Time Score: Percentage of jobs completed by the due date.'),
                        t('manual.item.1037', '   • Budget Score: Percentage of jobs completed within quoted cost.'),
                        t('manual.item.1038', '   • Quality Score: Based on rework rate (did the same issue recur within 30 days?).'),
                        t('manual.item.1039', '   • Overall Rating: Weighted average of the three scores.'),
                        t('manual.item.1040', '   • Ratings update automatically as jobs are closed out.'),
                        '',
                        t('manual.item.1041', 'INSURANCE CERTIFICATE MANAGEMENT:'),
                        t('manual.item.1042', '   • Upload General Liability, Workers Comp, and Auto certificates.'),
                        t('manual.item.1043', '   • Set expiry dates for each certificate.'),
                        t('manual.item.1044', '   • System sends alerts 30 and 7 days before expiry.'),
                        t('manual.item.1045', '   • Expired contractors are automatically flagged and blocked from new assignments.'),
                        '',
                        'REPORTING:',
                        t('manual.item.1046', '   • Contractor Spend Report — Total costs by contractor over a date range.'),
                        t('manual.item.1047', '   • Compliance Report — Which contractors have valid vs. expired insurance.'),
                        '   • Performance Comparison — Side-by-side rating of contractors by trade.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s21.title', 'Part 21: OEE, Workforce & Advanced Analytics'),
            id: 'oee-workforce',
            navigateTo: '/analytics',
            filePath: 'src/components/OeeDashboard.jsx',
            icon: <Activity size={22} />,
            content: t('manual.s21.content', 'OEE Dashboard (Availability \u00d7 Performance \u00d7 Quality), Workforce Analytics, Technician Metrics, Budget Forecaster, and Energy Dashboard.'),
            subsections: [
                {
                    title: '17D.1 OEE Dashboard',
                    items: [
                        t('manual.item.1048', 'OEE (Overall Equipment Effectiveness) is the gold standard manufacturing metric.'),
                        '',
                        t('manual.item.1049', 'HOW OEE IS CALCULATED:'),
                        t('manual.item.1050', '   \u2022 Availability = Planned Run Time minus Downtime, divided by Planned Run Time.'),
                        t('manual.item.1051', '   \u2022 Performance = Actual Output divided by Maximum Possible Output.'),
                        t('manual.item.1052', '   \u2022 Quality = Good Units divided by Total Units.'),
                        t('manual.item.1053', '   \u2022 OEE = Availability \u00d7 Performance \u00d7 Quality.'),
                        '',
                        t('manual.item.1054', 'OEE BENCHMARKS:'),
                        t('manual.item.1055', '   \u2022 85%+ = World Class (green).'),
                        t('manual.item.1056', '   \u2022 65-84% = Average (yellow).'),
                        t('manual.item.1057', '   \u2022 Below 65% = Below Target (red).'),
                        '',
                        t('manual.item.1058', 'DASHBOARD VIEWS:'),
                        t('manual.item.1059', '   \u2022 Enterprise OEE gauge \u2014 Overall company OEE.'),
                        t('manual.item.1060', '   \u2022 OEE by Asset table \u2014 See each machine\'s individual OEE.'),
                        t('manual.item.1061', '   \u2022 OEE by Plant \u2014 Compare plants to each other.'),
                        t('manual.item.1062', '   \u2022 12-Month OEE Trend \u2014 Track improvement over time.'),
                        '',
                        t('manual.item.1063', 'HOW TO ACCESS: Open Analytics Dashboard \u2014 the OEE Dashboard is embedded at the bottom.'),
                        '',
                        t('manual.item.1064', 'TROUBLESHOOTING:'),
                        t('manual.item.1065', '   \u2022 OEE showing 0%? \u2014 Downtime hours must be logged on work orders (ActDown field).'),
                        '   \u2022 Only seeing a few assets? \u2014 Assets need work order history for OEE calculation.'
                    ]
                },
                {
                    title: '17D.2 Workforce Analytics & Technician Metrics',
                    items: [
                        t('manual.item.1066', 'WORKFORCE ANALYTICS provides management oversight of technician performance.'),
                        '',
                        t('manual.item.1067', 'METRICS TRACKED:'),
                        t('manual.item.1068', '   \u2022 Work orders completed per technician.'),
                        t('manual.item.1069', '   \u2022 Average completion time.'),
                        t('manual.item.1070', '   \u2022 On-time completion rate (% of WOs finished before due date).'),
                        t('manual.item.1071', '   \u2022 Labor hours logged (regular and overtime).'),
                        t('manual.item.1072', '   \u2022 Overtime rate percentage.'),
                        t('manual.item.1073', '   \u2022 Top performers ranking.'),
                        '',
                        t('manual.item.1074', 'TECHNICIAN METRICS provides per-tech detail cards and rankings.'),
                        '',
                        t('manual.item.1075', 'HOW TO ACCESS: Open the Analytics section and navigate to "Workforce Analytics."'),
                        '',
                        t('manual.item.1076', 'TROUBLESHOOTING:'),
                        t('manual.item.1077', '   \u2022 Technician not listed? \u2014 They must have at least one closed work order.'),
                        '   \u2022 Hours seem wrong? \u2014 Labor is pulled from close-out wizard entries.'
                    ]
                },
                {
                    title: '17D.3 Budget Forecaster & Energy Dashboard',
                    items: [
                        t('manual.item.1078', 'BUDGET FORECASTER:'),
                        t('manual.item.1079', '   \u2022 Predicts future maintenance spend based on historical trends.'),
                        t('manual.item.1080', '   \u2022 Breaks down by labor, parts, and contractor costs.'),
                        t('manual.item.1081', '   \u2022 Helps set annual maintenance budgets with data-driven projections.'),
                        '',
                        t('manual.item.1082', 'ENERGY DASHBOARD:'),
                        t('manual.item.1083', '   \u2022 Tracks energy consumption metrics per plant.'),
                        t('manual.item.1084', '   \u2022 Monitors utility costs and consumption trends.'),
                        t('manual.item.1085', '   \u2022 Helps identify energy waste and improvement opportunities.'),
                        '',
                        t('manual.item.1086', 'PLANT WEATHER MAP:'),
                        t('manual.item.1087', '   \u2022 Live weather conditions for each plant location.'),
                        t('manual.item.1088', '   \u2022 Useful for outdoor maintenance planning and safety decisions.'),
                        '',
                        'HOW TO ACCESS: All three are accessible from the Analytics section in the Portal.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s22.title', 'Part 22: Onboarding, Enrollment & Platform Features'),
            id: 'platform-features',
            navigateTo: '/dashboard',
            filePath: 'src/components/MissionControl.jsx',
            icon: <Settings size={22} />,
            content: t('manual.s22.content', 'Portal launcher, onboarding tour, enrollment process, asset photos & OCR, warranty tracking, tribal knowledge, LDAP, and UI features.'),
            subsections: [
                {
                    title: '18A.1 Portal / Mission Control',
                    items: [
                        t('manual.item.1089', 'The Portal (also called Mission Control) is your application launcher.'),
                        '',
                        'FEATURES:',
                        t('manual.item.1090', '   \u2022 Tile-based layout with category grouping.'),
                        t('manual.item.1091', '   \u2022 Role-based visibility \u2014 you only see tiles your role has access to.'),
                        t('manual.item.1092', '   \u2022 Recent items and quick-access favorites.'),
                        t('manual.item.1093', '   \u2022 Session uptime timer.'),
                        '',
                        t('manual.item.1094', 'Each tile shows a title, description, and quick-access pills (keywords) for context.'),
                        'Click any tile to open that workspace.',
                        '',
                        t('manual.item.1734', 'AUDIT & HISTORY TILE: Access the Audit & History module from Mission Control. Available to Manager, Plant Manager, Maintenance Manager, IT Admin, and Creator roles. Opens HistoryDashboard with tabs for Work Order History, PM History, Scan Audit Log, and Dynamic Reports.'),
                    ]
                },
                {
                    title: '18A.2 Onboarding Tour & Enrollment',
                    items: [
                        t('manual.item.1095', 'FIRST-TIME ONBOARDING:'),
                        t('manual.item.1096', '   \u2022 New users see a guided tour highlighting key features.'),
                        t('manual.item.1097', '   \u2022 The Onboarding Wizard walks through plant selection, role confirmation, and basic navigation.'),
                        t('manual.item.1098', '   \u2022 Tour can be replayed from Settings at any time.'),
                        '',
                        t('manual.item.1099', 'ENROLLMENT / APPROVAL QUEUE:'),
                        t('manual.item.1100', '   \u2022 Users can self-register for access.'),
                        t('manual.item.1101', '   \u2022 Enrollment requests go to the Approval Queue.'),
                        t('manual.item.1102', '   \u2022 Admins review and approve/deny access requests.'),
                        t('manual.item.1103', '   \u2022 Approved users get their role and plant assignment automatically.'),
                        '',
                        t('manual.item.1104', 'TROUBLESHOOTING:'),
                        t('manual.item.1105', '   \u2022 Tour not appearing? \u2014 It only shows once. Replay from Settings > Onboarding.'),
                        '   \u2022 Enrollment pending for too long? \u2014 Contact your plant administrator.'
                    ]
                },
                {
                    title: '18A.3 Asset Photos, OCR & Warranty',
                    items: [
                        t('manual.item.1106', 'ASSET PHOTO MANAGEMENT:'),
                        t('manual.item.1107', '   \u2022 Each asset can have multiple photos attached.'),
                        t('manual.item.1108', '   \u2022 Click the camera icon on any asset detail to upload a photo.'),
                        t('manual.item.1109', '   \u2022 Photos support lightbox view (click to zoom).'),
                        t('manual.item.1110', '   \u2022 Delete individual photos with the trash icon.'),
                        '',
                        t('manual.item.1111', 'OCR (Optical Character Recognition):'),
                        t('manual.item.1112', '   \u2022 After uploading a photo of a nameplate or label, OCR runs automatically.'),
                        t('manual.item.1113', '   \u2022 The system detects serial numbers, model numbers, and part numbers.'),
                        t('manual.item.1114', '   \u2022 Click "Apply" to auto-fill detected values into the asset record.'),
                        t('manual.item.1115', '   \u2022 This is the fastest way to register equipment \u2014 snap a photo of the data plate!'),
                        '',
                        t('manual.item.1116', 'WARRANTY TRACKING:'),
                        t('manual.item.1117', '   \u2022 Each asset can have warranty coverage recorded.'),
                        t('manual.item.1118', '   \u2022 Start Date, End Date, Vendor, and Terms/Notes fields.'),
                        t('manual.item.1119', '   \u2022 When closing a work order on a warranty-covered asset, a yellow banner warns:'),
                        t('manual.item.1120', '     "This asset is under warranty. Contact the vendor before self-repair."'),
                        t('manual.item.1121', '   \u2022 This prevents accidentally voiding warranty coverage.'),
                        '',
                        t('manual.item.1122', 'TROUBLESHOOTING:'),
                        t('manual.item.1123', '   \u2022 OCR not detecting anything? \u2014 Take a clearer, well-lit photo of the nameplate.'),
                        '   \u2022 Warranty warning not showing? \u2014 Ensure dates are set in the asset Warranty section.'
                    ]
                },
                {
                    title: '18A.4 Tribal Knowledge / Wisdom Exchange',
                    items: [
                        t('manual.item.1124', 'Tribal Knowledge (also called Wisdom Exchange) captures institutional know-how for each asset.'),
                        '',
                        t('manual.item.1125', 'HOW IT WORKS:'),
                        t('manual.item.1126', '   \u2022 On any asset detail, scroll to "Wisdom Exchange."'),
                        t('manual.item.1127', '   \u2022 Click "+ Share Knowledge" to add a tip, warning, or best practice.'),
                        t('manual.item.1128', '   \u2022 Examples:'),
                        t('manual.item.1129', '     - "This pump cavitates if inlet pressure drops below 10 PSI."'),
                        t('manual.item.1130', '     - "Don\'t over-tighten the packing gland \u2014 1/8 turn past snug."'),
                        t('manual.item.1131', '     - "The Allen key for this cover is a 7/64, not 1/8."'),
                        '',
                        t('manual.item.1132', 'WHY IT MATTERS:'),
                        t('manual.item.1133', '   \u2022 When senior technicians retire, their knowledge leaves with them.'),
                        t('manual.item.1134', '   \u2022 Wisdom Exchange preserves decades of experience for new hires.'),
                        t('manual.item.1135', '   \u2022 Every entry is timestamped and attributed to the contributor.'),
                        '',
                        t('manual.item.1136', 'TROUBLESHOOTING:'),
                        '   \u2022 Cannot add knowledge? \u2014 You must have technician role or above.'
                    ]
                },
                {
                    title: '18A.5 LDAP / Active Directory & Escalation Rules',
                    items: [
                        t('manual.item.1137', 'LDAP / ACTIVE DIRECTORY INTEGRATION:'),
                        t('manual.item.1138', '   \u2022 Trier OS can authenticate against your corporate Active Directory.'),
                        t('manual.item.1139', '   \u2022 Configured by IT Admin in Settings > LDAP Configuration.'),
                        t('manual.item.1140', '   \u2022 Enter server URL, Base DN, Bind DN, and credentials.'),
                        t('manual.item.1141', '   \u2022 Users log in with their corporate credentials \u2014 no separate password needed.'),
                        t('manual.item.1142', '   \u2022 LDAP users are auto-provisioned on first login.'),
                        '',
                        t('manual.item.1143', 'ESCALATION RULES:'),
                        t('manual.item.1144', '   \u2022 Set rules for automatic escalation of overdue work orders.'),
                        t('manual.item.1145', '   \u2022 Define escalation levels: email supervisor after X hours, alert plant manager after Y hours.'),
                        t('manual.item.1146', '   \u2022 Notification types: In-App, Email, Webhook.'),
                        t('manual.item.1147', '   \u2022 Configure per priority level (Emergency escalates faster than Normal).'),
                        '',
                        t('manual.item.1148', 'TROUBLESHOOTING:'),
                        t('manual.item.1149', '   \u2022 LDAP login failing? \u2014 Verify server URL, port, and Base DN with IT.'),
                        '   \u2022 Escalation not triggering? \u2014 Check that rules are active and thresholds are correctly set.'
                    ]
                },
                {
                    title: t('manual.sub.102', '18.1 Purchase Orders'),
                    items: [
                        t('manual.item.1197', 'The Purchase Orders module tracks procurement from request to delivery.'),
                        '',
                        t('manual.item.1198', 'HOW TO CREATE A PO:'),
                        t('manual.item.1199', '1. Click "+ New PO" from the Purchase Orders view.'),
                        t('manual.item.1200', '2. Select the vendor and enter line items (part, quantity, unit cost).'),
                        t('manual.item.1201', '3. Add shipping, tax, and notes as needed.'),
                        t('manual.item.1202', '4. Submit for approval \u2014 the PO enters the approval workflow.'),
                        '',
                        t('manual.item.1203', 'PO STATUSES:'),
                        t('manual.item.1204', '   \u2022 Draft \u2014 Being created, not yet submitted.'),
                        t('manual.item.1205', '   \u2022 Pending Approval \u2014 Awaiting manager authorization.'),
                        t('manual.item.1206', '   \u2022 Approved \u2014 Ready to send to vendor.'),
                        t('manual.item.1207', '   \u2022 Ordered \u2014 Sent to vendor, awaiting delivery.'),
                        t('manual.item.1208', '   \u2022 Partially Received \u2014 Some items have arrived.'),
                        t('manual.item.1209', '   \u2022 Received \u2014 All items delivered.'),
                        t('manual.item.1210', '   \u2022 Closed \u2014 PO complete and archived.'),
                        '',
                        t('manual.item.1211', 'RECEIVING ITEMS:'),
                        t('manual.item.1212', '   \u2022 When parts arrive, update the PO with received quantities.'),
                        t('manual.item.1213', '   \u2022 Inventory adjusts automatically upon receiving.'),
                        '',
                        'TRACKING:',
                        t('manual.item.1214', '   \u2022 View total PO cost, line item details, and delivery dates.'),
                        t('manual.item.1215', '   \u2022 Filter by status, vendor, or date range.'),
                        t('manual.item.1216', '   \u2022 Print POs for submittal to vendors.'),
                        '',
                        t('manual.item.1217', 'TROUBLESHOOTING:'),
                        t('manual.item.1218', '   \u2022 PO stuck in "Pending"? \u2014 Check with the approver or adjust approval thresholds in Settings.'),
                        '   \u2022 Parts not in catalog? \u2014 Add them to Parts first, then add to PO.'
                    ]
                },
                {
                    title: t('manual.sub.103', '18.2 Inventory Adjustments'),
                    items: [
                        t('manual.item.1219', 'Inventory Adjustments tracks all stock-level changes outside of normal work order consumption.'),
                        '',
                        t('manual.item.1220', 'ADJUSTMENT TYPES:'),
                        t('manual.item.1221', '   \u2022 Physical Count \u2014 Results of cycle counts or annual inventory.'),
                        t('manual.item.1222', '   \u2022 Receiving \u2014 New stock arriving from purchase orders.'),
                        t('manual.item.1223', '   \u2022 Write-Off \u2014 Damaged, expired, or obsolete parts.'),
                        t('manual.item.1224', '   \u2022 Transfer \u2014 Parts moved between plants (logged by both sites).'),
                        t('manual.item.1225', '   \u2022 Correction \u2014 Manual fix for data entry errors.'),
                        '',
                        t('manual.item.1226', 'HOW TO ADJUST:'),
                        t('manual.item.1227', '1. Select the part and adjustment type.'),
                        t('manual.item.1228', '2. Enter the quantity change (positive for additions, negative for removals).'),
                        t('manual.item.1229', '3. Add a reason/note for audit trail.'),
                        t('manual.item.1230', '4. Submit \u2014 inventory levels update immediately.'),
                        '',
                        t('manual.item.1231', 'All adjustments are logged with who, what, when, and why for audit compliance.'),
                        '',
                        t('manual.item.1232', 'TROUBLESHOOTING:'),
                        t('manual.item.1233', '   \u2022 Adjustment not reflecting? \u2014 Refresh the parts view.'),
                        '   \u2022 Negative inventory? \u2014 System allows it but flags a warning. Investigate promptly.'
                    ]
                },
                {
                    title: t('manual.sub.104', '18.3 SAP Integration'),
                    items: [
                        t('manual.item.1234', 'The SAP Integration module connects Trier OS to SAP ERP systems for data synchronization.'),
                        '',
                        'FEATURES:',
                        t('manual.item.1235', '   \u2022 Import assets, parts, and work orders from SAP.'),
                        t('manual.item.1236', '   \u2022 Export completed work orders and inventory changes back to SAP.'),
                        t('manual.item.1237', '   \u2022 Bi-directional sync with configurable field mapping.'),
                        '',
                        t('manual.item.1238', 'CONFIGURATION (IT Admin):'),
                        t('manual.item.1239', '1. Enter your SAP server URL, client ID, and credentials in Settings.'),
                        t('manual.item.1240', '2. Configure field mapping \u2014 map SAP fields to Trier OS fields.'),
                        t('manual.item.1241', '3. Set sync schedule (manual, hourly, daily).'),
                        t('manual.item.1242', '4. Test connection before enabling production sync.'),
                        '',
                        t('manual.item.1243', 'SYNC TYPES:'),
                        t('manual.item.1244', '   \u2022 Full Sync \u2014 Imports all records (use for initial setup).'),
                        t('manual.item.1245', '   \u2022 Delta Sync \u2014 Only syncs changes since last run.'),
                        t('manual.item.1246', '   \u2022 Manual Push \u2014 Export specific records on demand.'),
                        '',
                        t('manual.item.1247', 'TROUBLESHOOTING:'),
                        t('manual.item.1248', '   \u2022 Connection failed? \u2014 Verify SAP server URL and credentials. Check firewall rules.'),
                        t('manual.item.1249', '   \u2022 Duplicate records? \u2014 Ensure unique key mapping (e.g., asset number, part number).'),
                        t('manual.item.1250', '   \u2022 Sync errors? \u2014 Check the sync log for specific field validation failures.'),
                        '   \u2022 SAP timeout? \u2014 Reduce batch size in sync settings.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s23.title', 'Part 23: Email Notifications & SMTP Relay'),
            id: 'email-notifications',
            navigateTo: '/settings',
            adminOnly: true,
            filePath: 'src/components/SettingsView.jsx',
            icon: <MessageCircle size={22} />,
            content: t('manual.s23.content', 'Organization-wide email alerts with per-user subscription control. IT configures SMTP once, each user picks their own alerts.'),
            subsections: [
                {
                    title: t('manual.sub.105', '19.1 How Email Notifications Work'),
                    items: [
                        t('manual.item.1251', 'Trier OS uses a two-layer email system:'),
                        t('manual.item.1252', '1. Organization-Wide SMTP Relay — Configured once by IT. This is the "mail pipeline" for all outbound emails.'),
                        t('manual.item.1253', '2. Per-User Subscriptions — Each user chooses which alerts they want and provides their email address.'),
                        'No IT involvement needed after the initial SMTP setup — users manage their own alerts.'
                    ]
                },
                {
                    title: t('manual.sub.106', '19.2 IT Admin: Configuring SMTP'),
                    items: [
                        t('manual.item.1254', '1. Go to Settings → Admin Console → Integrations & API.'),
                        t('manual.item.1255', '2. Find the "Organization-Wide Outbound Email Relay" panel.'),
                        t('manual.item.1256', '3. Enter SMTP Host (e.g., smtp.office365.com), Port (587 TLS or 465 SSL), Username, Password, and From Name.'),
                        t('manual.item.1257', '4. Toggle SSL/TLS ON for encrypted connections.'),
                        t('manual.item.1258', '5. Click "Test Relay" to send a test email.'),
                        t('manual.item.1259', '6. Look for "[YES] Relay Verified" — this confirms emails are flowing.'),
                        'This is a one-time setup. Once configured, all users across all plants can subscribe to alerts.'
                    ]
                },
                {
                    title: t('manual.sub.107', '19.3 Setting Up Your Notifications'),
                    items: [
                        t('manual.item.1260', '1. Go to Settings (gear icon in the navigation bar).'),
                        t('manual.item.1261', '2. Find the "My Notifications" panel.'),
                        t('manual.item.1262', '3. Enter your email address.'),
                        t('manual.item.1263', '4. Toggle ON the alerts you want:'),
                        t('manual.item.1264', '   [ALERT] Emergency Work Orders — Priority 1 alerts (always sent immediately).'),
                        t('manual.item.1265', '   PM Due Reminders — Daily PM reminders.'),
                        t('manual.item.1266', '   [YES] Work Order Completed — When a tracked job is closed.'),
                        t('manual.item.1267', '   Transfer Requests — When another plant requests a part from you.'),
                        t('manual.item.1268', '   [PARTIAL] Low Stock Alerts — When parts drop below minimum stock.'),
                        t('manual.item.1269', '   Sensor Threshold Breach — When a sensor exceeds limits.'),
                        t('manual.item.1270', '    Compliance Due — Regulatory checklist reminders.'),
                        t('manual.item.1271', '    Security Events — Failed logins and account changes.'),
                        t('manual.item.1272', '5. Select Digest Frequency: Immediate, Hourly Digest, or Daily Digest.'),
                        '6. Click "Save Preferences".'
                    ]
                }
            ]
        },
        {
            section: t('manual.s24.title', 'Part 24: Mobile Offline Mode (PWA)'),
            id: 'mobile-offline',
            navigateTo: '/settings',
            filePath: 'public/manifest.json',
            icon: <Globe size={22} />,
            content: t('manual.s24.content', 'Field technicians can keep working when the server is unreachable. Auto-syncs when connectivity returns.'),
            subsections: [
                {
                    title: t('manual.sub.108', '20.1 What Is Offline Mode?'),
                    items: [
                        t('manual.item.1273', 'Trier OS is a Progressive Web App (PWA) — install it like a native app on any phone or tablet.'),
                        t('manual.item.1274', 'It continues working even when: you are in a plant basement, the server is down, or your Wi-Fi drops mid-shift.'),
                        'Your work is saved locally and automatically synced when you reconnect.'
                    ]
                },
                {
                    title: t('manual.sub.109', '20.2 Installing the PWA'),
                    items: [
                        t('manual.item.1275', 'Android (Chrome): Tap the three-dot menu → "Add to Home Screen". Or use the "Install Trier OS" banner.'),
                        t('manual.item.1276', 'iPhone/iPad (Safari): Tap the Share button → "Add to Home Screen".'),
                        'The app icon appears on your home screen like any other app.'
                    ]
                },
                {
                    title: t('manual.sub.110', '20.3 How Offline Mode Works'),
                    items: [
                        t('manual.item.1277', '1. Outage detected — An amber banner appears: " Offline Mode — Changes saved locally".'),
                        t('manual.item.1278', '2. Data served from cache — Work orders, assets, parts, and contacts available from local storage.'),
                        t('manual.item.1279', '3. Changes queued — Any work you do is saved to a local queue.'),
                        '4. Pending count shown — Banner displays: " 3 pending".'
                    ]
                },
                {
                    title: t('manual.sub.111', '20.4 What Works Offline'),
                    items: [
                        t('manual.item.1280', '[YES] View work orders, assets, parts inventory.'),
                        t('manual.item.1281', '[YES] Create new work orders (queued).'),
                        t('manual.item.1282', '[YES] Update work order status (queued).'),
                        t('manual.item.1283', '[YES] Add notes/comments (queued).'),
                        t('manual.item.1284', '[YES] Adjust inventory (queued).'),
                        t('manual.item.1285', '[NO] Upload photos/attachments (requires server).'),
                        t('manual.item.1286', '[NO] Barcode scanner (requires server lookup).'),
                        t('manual.item.1287', '[NO] Global Logistics search (requires live connection to all plants).'),
                        '[NO] Run reports (requires server-side queries).'
                    ]
                },
                {
                    title: t('manual.sub.112', '20.5 Reconnecting — Automatic Sync'),
                    items: [
                        t('manual.item.1288', '1. Banner changes to green: "[YES] Back online — Syncing..."'),
                        t('manual.item.1289', '2. Queued changes replayed in order: "Syncing 1 of 3..."'),
                        t('manual.item.1290', '3. Completion: "[YES] Done. All changes saved."'),
                        t('manual.item.1291', '4. Banner auto-dismisses.'),
                        'If a sync conflict occurs, the system flags it for your review rather than silently overwriting.'
                    ]
                },
                {
                    title: t('manual.sub.113', '20.6 Keeping Cache Fresh'),
                    items: [
                        t('manual.item.1292', 'On login: Full data download (2-second delay to let the page load).'),
                        t('manual.item.1293', 'Every 15 minutes: Background delta sync pulls only changed records.'),
                        'Manually: Pull down to refresh on mobile devices.'
                    ]
                }
            ]
        },
        {

            section: t('manual.s25.title', 'Part 25: High Availability & Server Replication'),
            id: 'high-availability',
            navigateTo: '/settings',
            adminOnly: true,
            filePath: 'server/routes/live_studio.js',
            icon: <Shield size={22} />,
            content: t('manual.s25.content', 'Hot standby server replication with manual failover for disaster recovery. Primary → Secondary sync every 60 seconds.'),
            subsections: [
                {
                    title: t('manual.sub.114', '22.1 What Is High Availability?'),
                    items: [
                        t('manual.item.1294', 'HA means running two copies of Trier OS:'),
                        t('manual.item.1295', 'Primary (Master) — Active server on-premises. Accepts all writes.'),
                        t('manual.item.1296', 'Secondary (Replica) — Standby server in AWS Cloud (or another location). Read-only.'),
                        t('manual.item.1297', 'The Primary pushes all database changes to the Secondary every 60 seconds.'),
                        'If the Primary goes down, you promote the Secondary to Primary and keep working.'
                    ]
                },
                {
                    title: t('manual.sub.115', '22.2 How Replication Works'),
                    items: [
                        t('manual.item.1298', '1. Change Capture — Every INSERT/UPDATE/DELETE is recorded in a sync_ledger via SQLite triggers.'),
                        t('manual.item.1299', '2. Batch Push — Every 60 seconds, unsynced entries are sent to the Secondary via secure API.'),
                        t('manual.item.1300', '3. Apply on Secondary — Changes applied to the Secondary databases, keeping them in sync.'),
                        '4. Pairing Key — Servers authenticate using a shared pairing key (not user credentials).'
                    ]
                },
                {
                    title: t('manual.sub.116', '22.3 Configuring HA (IT Admin)'),
                    items: [
                        t('manual.item.1301', 'Go to Settings → Admin Console → Branding & Config → High Availability.'),
                        t('manual.item.1302', 'PRIMARY SETUP:'),
                        t('manual.item.1303', '1. Select "[P4] Primary (Master)" from the role selector.'),
                        t('manual.item.1304', '2. Enter the Secondary server\'s address.'),
                        t('manual.item.1305', '3. Click " Generate Pairing Key" and copy the 64-character key.'),
                        t('manual.item.1306', '4. Click "Save Configuration".'),
                        t('manual.item.1307', 'SECONDARY SETUP:'),
                        t('manual.item.1308', '1. Select "[P3] Secondary (Replica)" from the role selector.'),
                        t('manual.item.1309', '2. Enter the Primary server\'s address.'),
                        t('manual.item.1310', '3. Paste the key into "Import Key" and click Import.'),
                        '4. Click "Save Configuration". Replication begins automatically.'
                    ]
                },
                {
                    title: t('manual.sub.117', '22.4 Monitoring Sync Status'),
                    items: [
                        t('manual.item.1311', 'The HA panel displays a live 6-metric dashboard:'),
                        t('manual.item.1312', 'Plants Synced — How many of your 40+ plants are fully synced (e.g., 40/40).'),
                        t('manual.item.1313', 'Pending Changes — Changes waiting to be pushed.'),
                        t('manual.item.1314', 'Replication Lag — Seconds behind. Green (<60s), Amber (<120s), Red (>120s).'),
                        t('manual.item.1315', 'Total Ledger — Total change entries tracked.'),
                        t('manual.item.1316', 'Last Sync — Most recent successful sync timestamp.'),
                        t('manual.item.1317', 'Total DB Size — Combined size of all plant databases.'),
                        'Use the "Test" button to check Secondary reachability and latency.'
                    ]
                },
                {
                    title: t('manual.sub.118', '22.5 Manual Failover'),
                    items: [
                        t('manual.item.1318', 'If the Primary goes down (hardware failure, power outage, etc.):'),
                        t('manual.item.1319', '1. Access the Secondary server\'s web interface directly.'),
                        t('manual.item.1320', '2. Go to Settings → Admin Console → Branding & Config → High Availability.'),
                        t('manual.item.1321', '3. Click "[PARTIAL] Promote to Primary".'),
                        t('manual.item.1322', '4. Enter your admin password to confirm.'),
                        t('manual.item.1323', '5. Click "[PARTIAL] Confirm Failover".'),
                        t('manual.item.1324', '6. Restart the server for the change to take effect.'),
                        'IMPORTANT: When the original Primary comes back online, reconfigure it as Secondary to prevent split-brain.'
                    ]
                },
                {
                    title: t('manual.sub.119', '22.6 Force Sync & Rollback'),
                    items: [
                        t('manual.item.1325', 'Force Sync: Click " Force Sync Now" on the Primary to push changes immediately.'),
                        t('manual.item.1326', 'Pre-Sync Snapshots: The Secondary auto-snapshots before applying changes.'),
                        t('manual.item.1327', 'Snapshots stored in data/ha_snapshots/ — last 5 per plant are kept.'),
                        t('manual.item.1328', 'Rollback: If replication introduces corrupt data, restore from the latest snapshot.'),
                        'HA uses Active-Passive architecture by design. Auto-failover was intentionally NOT implemented to prevent split-brain.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s26.title', 'Part 26: Testing Process & Data Validation'),
            id: 'testing-validation',
            navigateTo: '/it-department',
            filePath: 'src/components/ITDepartmentView.jsx',
            icon: <CheckCircle size={22} />,
            content: t('manual.s26.content', 'Trier OS undergoes a structured, multi-phase testing process before any release. This section describes what gets tested, how it gets tested, and what the results mean for day-to-day operations.'),
            subsections: [
                {
                    title: t('manual.sub.120', '23.1 Why We Test'),
                    items: [
                        t('manual.item.1329', 'A Enterprise System manages safety-critical work orders, regulatory compliance records, and financial data across 40+ facilities.'),
                        t('manual.item.1330', 'A bug in a calculation, a missing work order, or a failed data sync could impact plant operations.'),
                        'Our testing process exists to catch these problems before they reach the production floor.'
                    ]
                },
                {
                    title: t('manual.sub.121', '23.2 How Testing Works — 7 Phases'),
                    items: [
                        t('manual.item.1331', 'Phase 1 — Data Integrity: Database tables, record counts, required fields. Ensures no data is missing or corrupted after imports.'),
                        t('manual.item.1332', 'Phase 2 — Dashboard Calculations: Totals, averages, percentages shown on dashboards. Confirms the numbers management sees are accurate.'),
                        t('manual.item.1333', 'Phase 3 — Financial Audit: Cost rollups, parts spend, labor totals, depreciation. Verifies financial data used for budgeting.'),
                        t('manual.item.1334', 'Phase 4 — Integration Testing: Email, sensors, webhooks, BI exports, HA sync. Confirms external systems can communicate with Trier.'),
                        t('manual.item.1335', 'Phase 5 — Multi-Plant & Corporate: All-sites data aggregation, global search, plant registry. Ensures corporate views combine data from all 40+ plants correctly.'),
                        t('manual.item.1336', 'Phase 6 — User Journey Validation: Complete workflows — WO lifecycle, asset management, parts, SOPs. Walks through every step a technician or manager would perform.'),
                        'Phase 7 — Security & Edge Cases: Authentication, bad data handling, injection attacks. Proves the system doesn\'t crash or leak data under abnormal conditions.'
                    ]
                },
                {
                    title: t('manual.sub.122', '23.3 Test Results — March 2026'),
                    items: [
                        t('manual.item.1337', 'Phase 4 — Integrations: 29/29 tests passed (100% [YES])'),
                        t('manual.item.1338', 'Phase 5 — Multi-Plant: 18/18 tests passed (100% [YES])'),
                        t('manual.item.1339', 'Phase 6 — User Journeys: 23/23 tests passed (100% [YES])'),
                        t('manual.item.1340', 'Phase 7 — Security: 21/21 tests passed (100% [YES])'),
                        'TOTAL: 91 tests run, 91 tests passed — 100% pass rate.'
                    ]
                },
                {
                    title: t('manual.sub.123', '23.4 What Gets Validated'),
                    items: [
                        t('manual.item.1341', 'Data Accuracy: Work order totals on dashboards match actual database counts.'),
                        t('manual.item.1342', 'Data Accuracy: Asset cost calculations produce clean numbers — no "NaN" or "undefined" values.'),
                        t('manual.item.1343', 'Data Accuracy: Cross-plant corporate views aggregate data from all 40 plants correctly (991 work orders verified).'),
                        t('manual.item.1344', 'Workflow Completeness: A work order can be created → assigned → updated → closed → verified in history → deleted (full lifecycle).'),
                        t('manual.item.1345', 'Workflow Completeness: Parts search returns results across the correct plant databases.'),
                        t('manual.item.1346', 'Error Handling: Searching for something that doesn\'t exist returns "0 results" — not an error page.'),
                        t('manual.item.1347', 'Error Handling: Very long text (1,000+ characters), special characters, and emoji all save correctly.'),
                        'Error Handling: If a sensor sends data for a non-existent device, the system handles it gracefully.'
                    ]
                },
                {
                    title: t('manual.sub.124', '23.5 What This Means for You'),
                    items: [
                        t('manual.item.1348', 'Technicians: The work orders, parts counts, and schedules you see on screen have been verified to be accurate.'),
                        t('manual.item.1349', 'Managers: The dashboard numbers, compliance rates, and financial summaries are tested against the actual data in the database.'),
                        'IT Staff: Integration points (email, sensors, HA replication) are verified, including handling expected failures gracefully.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s27.title', 'Part 27: Security Testing & Results'),
            id: 'security-testing',
            navigateTo: '/it-department',
            filePath: 'server/index.js',
            icon: <Shield size={22} />,
            content: t('manual.s27.content', 'Trier OS was built with security in mind from day one. This section summarizes the security measures in place and the results of formal security testing.'),
            subsections: [
                {
                    title: t('manual.sub.125', '24.1 Authentication & Access Control'),
                    items: [
                        t('manual.item.1350', 'Every API request requires a valid authentication token. If you\'re not logged in, you can\'t see or change anything.'),
                        t('manual.item.1351', '[YES] No login token provided → 401 Unauthorized (request rejected)'),
                        t('manual.item.1352', '[YES] Expired or fake token used → Request rejected, no data exposed'),
                        t('manual.item.1353', '[YES] Garbage/malformed token → Request rejected, system doesn\'t crash'),
                        t('manual.item.1354', '[YES] Wrong password at login → Login denied with clear error message'),
                        t('manual.item.1355', '[YES] Non-existent username → Login denied — system does NOT reveal whether the username exists'),
                        '[YES] Admin-only features accessed by non-admin → Blocked with 403 Forbidden'
                    ]
                },
                {
                    title: t('manual.sub.126', '24.2 Brute Force Protection (Rate Limiting)'),
                    items: [
                        t('manual.item.1356', 'Trier OS includes automatic brute force protection on the login page.'),
                        t('manual.item.1357', 'Each IP address is allowed 5 login attempts per 5-minute window.'),
                        t('manual.item.1358', 'After 5 failures, all further login attempts from that IP are blocked.'),
                        t('manual.item.1359', 'The lockout lasts for the remainder of the 5-minute window — it does NOT extend with each additional attempt.'),
                        t('manual.item.1360', 'After the window expires, the counter resets and you can try again.'),
                        t('manual.item.1361', 'What to do if locked out: Wait 5 minutes from your first failed attempt, then try again.'),
                        'Important: The rate limiter is per IP address. If multiple people share the same network, failures from one can affect others at the same location.'
                    ]
                },
                {
                    title: t('manual.sub.127', '24.3 Plant Data Isolation ("Plant Jail")'),
                    items: [
                        t('manual.item.1362', 'Technicians can only see and modify data at their assigned plant(s).'),
                        t('manual.item.1363', 'Managers can view data at plants where they have an explicit role.'),
                        t('manual.item.1364', 'IT Administrators can access all plants (required for enterprise-wide support).'),
                        t('manual.item.1365', 'If you try to access a plant where you have no role: "Access Denied: You do not have an authorized role at [Plant Name]."'),
                        'This ensures a technician at Anderson, IN cannot view or modify work orders at Tyler, TX.'
                    ]
                },
                {
                    title: t('manual.sub.128', '24.4 Injection Attack Protection'),
                    items: [
                        t('manual.item.1366', 'SQL Injection: All queries use parameterized statements — injection is impossible. [YES]'),
                        t('manual.item.1367', 'Script Injection (XSS): The interface auto-escapes all output — scripts cannot execute. [YES]'),
                        t('manual.item.1368', 'Path Traversal: File paths are validated and sanitized. [YES]'),
                        t('manual.item.1369', 'Test: Typing \' OR 1=1 -- (classic SQL injection) into search → 0 results, no data leak, no crash. [YES]'),
                        t('manual.item.1370', 'Test: Saving <script>alert(\'hack\')</script> as a WO description → stored as plain text, never executes. [YES]'),
                        'Test: Attempting ../../etc/passwd in a URL → blocked, no file access. [YES]'
                    ]
                },
                {
                    title: t('manual.sub.129', '24.5 Data Handling Under Stress'),
                    items: [
                        t('manual.item.1371', '[YES] Work order with 1,000+ character description — accepted and stored correctly.'),
                        t('manual.item.1372', '[YES] Plant names with apostrophes (O\'Fallon) — no issues.'),
                        t('manual.item.1373', '[YES] Unicode characters and emoji (検査完了) — saved and displayed correctly.'),
                        t('manual.item.1374', '[YES] Negative numbers in cost fields — no server crash.'),
                        t('manual.item.1375', '[YES] Empty form submission — handled gracefully (system tracks who submitted it).'),
                        '[YES] Requesting 999,999 records at once — no crash, query completes normally.'
                    ]
                },
                {
                    title: t('manual.sub.130', '24.6 What This Means for Your Organization'),
                    items: [
                        t('manual.item.1376', '1. Your data is protected — unauthorized access attempts are rejected immediately with no data exposure.'),
                        t('manual.item.1377', '2. Password guessing is blocked — the rate limiter stops automated attacks before they can succeed.'),
                        t('manual.item.1378', '3. Plant boundaries are enforced — a user at one plant cannot see another plant\'s data without explicit authorization.'),
                        t('manual.item.1379', '4. The system doesn\'t crash — even under extreme or abnormal inputs, Trier OS continues operating normally.'),
                        '5. Common web attacks don\'t work — SQL injection, XSS, and path traversal are all neutralized.'
                    ]
                },
                {
                    title: t('manual.sub.145', '24.7 Security Hardening (March 2026)'),
                    items: [
                        t('manual.item.1461', 'A comprehensive security audit and remediation was completed in March 2026, strengthening the system against modern attack vectors.'),
                        '',
                        t('manual.item.1462', 'PASSWORD SECURITY:'),
                        t('manual.item.1463', '   • Password complexity is enforced: minimum 8 characters with at least one uppercase letter, one lowercase letter, one digit, and one special character.'),
                        t('manual.item.1464', '   • Default passwords have been eliminated — all new accounts are created with unique, randomly generated passwords.'),
                        t('manual.item.1465', '   • Password resets generate random temporary passwords. Users must change their password on first login.'),
                        '',
                        t('manual.item.1466', 'CONTENT SECURITY POLICY (CSP):'),
                        t('manual.item.1467', '   • Browser-level protection against cross-site scripting (XSS) attacks is now active.'),
                        t('manual.item.1468', '   • The CSP restricts which scripts, styles, fonts, and images the browser is allowed to load.'),
                        t('manual.item.1469', '   • Only resources from the Trier OS server itself and trusted sources (Google Fonts) are permitted.'),
                        '',
                        t('manual.item.1470', 'INJECTION PROTECTION:'),
                        t('manual.item.1471', '   • LDAP Injection: Login usernames are sanitized before being sent to Active Directory, preventing authentication bypass attacks.'),
                        t('manual.item.1472', '   • Command Injection: External system calls use safe argument passing that prevents shell command manipulation.'),
                        t('manual.item.1473', '   • Path Traversal: File download endpoints strip directory navigation characters, preventing unauthorized file access.'),
                        '',
                        t('manual.item.1474', 'API SECURITY:'),
                        t('manual.item.1475', '   • All high-availability replication endpoints now require shared authentication keys — no anonymous replication.'),
                        t('manual.item.1476', '   • The public maintenance request form is limited to 5 submissions per 10 minutes per IP address to prevent spam flooding.'),
                        t('manual.item.1477', '   • The server will not start if the encryption secret is missing, preventing operation in an insecure state.'),
                        '',
                        '6. All security measures are transparent to end users — they work automatically without requiring any user action or training.'
                    ]
                },
                {
                    title: t('manual.sub.208', '27.8 Additional SOC2-Aligned Controls'),
                    items: [
                        t('manual.item.1760', 'SSRF PREVENTION: Outbound HTTP from server-side code is validated against an allowlist. Requests to internal network ranges (169.254.x.x, 10.x.x.x, 127.x.x.x) are blocked at the transport layer.'),
                        t('manual.item.1761', 'AT-REST ENCRYPTION: Sensitive fields (license keys, API tokens, SMTP passwords) are stored using AES-256-GCM. The key is derived from the machine hardware ID — never stored in plaintext.'),
                        t('manual.item.1762', 'PLANT DATA ISOLATION: Every query runs through AsyncLocalStorage plant scoping enforced at the query layer. Cross-plant data leakage is structurally impossible.'),
                        t('manual.item.1763', 'RUNTIME INVARIANT PROOF: GET /api/invariants/report returns machine-readable PASS/FAIL for all 13 correctness invariants. Run automatically before every release.'),
                    ]
                }
            ]
        },
        {
            section: t('manual.s29.title', 'Part 28: IT Department — Asset & License Management'),
            id: 'it-department',
            icon: <Server size={22} />,
            navigateTo: '/it-department',
            filePath: 'src/components/ITDepartmentView.jsx',
            adminOnly: true,
            content: t('manual.s29.content', 'The IT Department module provides enterprise-wide visibility into software licensing, hardware inventory, network infrastructure, mobile device management, and financial depreciation tracking. IT manages the servers and infrastructure; every physical asset is scan-trackable with a unique barcode.'),
            subsections: [
                {
                    title: t('manual.sub.136', '26.1 Overview & Access Control'),
                    items: [
                        t('manual.item.1407', 'The IT Department section is located within the Information Technology group on Mission Control.'),
                        t('manual.item.1408', 'Access Levels:'),
                        t('manual.item.1409', '  • IT Admin & Creator: Full access to all IT assets — view, add, edit, delete, and see license keys in plain text.'),
                        t('manual.item.1410', '  • Corporate: Can view the IT Department tile for metrics only. License keys are masked (••••••••). No edit or delete access.'),
                        t('manual.item.1411', '  • Plant roles (Manager, Supervisor, Technician, etc.): No access to the IT tile. IT assets are corporate-managed.'),
                        'The IT group also contains: Governance & Security, Admin Console, and Import & API Hub.'
                    ]
                },
                {
                    title: t('manual.sub.137', '26.2 Software Licenses'),
                    items: [
                        t('manual.item.1412', 'Track all enterprise software: Microsoft 365, Fortinet security stack, SOTI MDM, ASCtrack, AutoCAD, SolidWorks, VMware, Veeam, and more.'),
                        t('manual.item.1413', 'Every license record includes: Name, Vendor, Version, License Type (Subscription/Perpetual/Open Source), Seats, Seats Used, Expiry Date, Renewal Cost, and License Key.'),
                        t('manual.item.1414', 'Expiry tracking: Licenses approaching expiry (<30 days) show amber warnings. Expired licenses show red alerts.'),
                        t('manual.item.1415', 'License keys are sensitive data — only IT Admin and Creator roles can view them. Corporate users see "••••••••" in the key field.'),
                        t('manual.item.1416', 'Seat utilization: Track how many seats are used vs. available to prevent over-deployment or identify opportunities to reduce licensing costs.'),
                        'Categories include: Operating System, Productivity, Security, Database, Communication, ERP, CAD/CAM, Analytics, and DevOps.'
                    ]
                },
                {
                    title: t('manual.sub.138', '26.3 Hardware Inventory'),
                    items: [
                        t('manual.item.1417', 'Manage all IT hardware: Dell OptiPlex desktops, Dell Latitude laptops, Dell monitors, Zebra ZT411 label printers, and peripherals.'),
                        t('manual.item.1418', 'Each asset has: Name, Type, Manufacturer, Model, Serial Number, Asset Tag, Barcode ID (auto-generated), Assigned To, Location, and Department.'),
                        t('manual.item.1419', 'Barcode IDs are automatically generated in the format IT-HW-XXXXX when assets are created. These barcodes are scan-compatible for chain of custody.'),
                        t('manual.item.1420', 'Depreciation tracking: Each hardware asset has Purchase Cost, Salvage Value, Useful Life (default 5 years for hardware), and Depreciation Method (Straight-Line or Declining Balance).'),
                        t('manual.item.1421', 'Current Book Value is calculated on-the-fly based on the depreciation schedule. This appears in the table and detail views.'),
                        t('manual.item.1422', 'Condition tracking: New → Good → Fair → Poor → End of Life.'),
                        'Status tracking: Active, Inactive, In Transit, Retired, Disposed, In Repair.'
                    ]
                },
                {
                    title: t('manual.sub.139', '26.4 Network Infrastructure'),
                    items: [
                        t('manual.item.1423', 'Track enterprise network infrastructure: Fortinet FortiGate firewalls, FortiSwitch managed switches, FortiAP wireless access points, Dell PowerEdge servers, and APC UPS systems.'),
                        t('manual.item.1424', 'Unique fields for infrastructure: IP Address, MAC Address, Rack Position (e.g., R2-U15), Firmware Version, Last Firmware Update, Port Count, and Criticality level.'),
                        t('manual.item.1425', 'Criticality levels: Critical, High, Medium, Low. Used for prioritizing maintenance and replacement.'),
                        t('manual.item.1426', 'Status tracking: Online, Offline, Degraded, In Transit, Maintenance, Decommissioned.'),
                        t('manual.item.1427', 'Infrastructure assets have a 7-year default useful life for depreciation calculations.'),
                        t('manual.item.1428', 'Firmware tracking helps identify devices that need security patches or updates.'),
                        'Rack position tracking (e.g., "R2-U15") helps IT staff locate equipment in server rooms and IDF closets.'
                    ]
                },
                {
                    title: t('manual.sub.140', '26.5 Mobile Device Management'),
                    items: [
                        t('manual.item.1429', 'Manage all mobile devices: Zebra MC9300, MC9400, MC3300, TC72, TC77, TC78 rugged scanners, ZQ521 mobile printers, and Samsung Galaxy tablets.'),
                        t('manual.item.1430', 'MDM integration: Track SOTI MobiControl enrollment status, MDM provider, and OS version for each device.'),
                        t('manual.item.1431', 'Carrier tracking: Carrier (Verizon, AT&T, T-Mobile), Phone Number, Monthly Cost per device.'),
                        t('manual.item.1432', 'IMEI tracking for each cellular-enabled device.'),
                        t('manual.item.1433', 'Mobile devices have a 3-year default useful life for depreciation.'),
                        t('manual.item.1434', 'Devices are assigned to specific plant locations and users. Corporate IT has full visibility across all plants.'),
                        'The SOTI MDM platform manages remote wipe, application deployment, and device configuration.'
                    ]
                },
                {
                    title: t('manual.sub.141', '26.6 Asset Tracking & Chain of Custody'),
                    items: [
                        t('manual.item.1435', 'Every physical IT asset (hardware, infrastructure, mobile) has a unique Barcode ID for scan tracking.'),
                        t('manual.item.1436', 'Barcode format: IT-HW-XXXXX (hardware), IT-INF-XXXXX (infrastructure), IT-MOB-XXXXX (mobile).'),
                        t('manual.item.1437', 'Movement types: Received, Shipped, Internal Transfer, Audit Scan.'),
                        t('manual.item.1438', 'Each movement records: Asset Category, Asset ID, From Plant/Location, To Plant/Location, Scanned By, Timestamp, Tracking Number, and Notes.'),
                        t('manual.item.1439', 'Scan workflow (mirrors parts receiving): Scan barcode → Identify asset → Confirm movement → Log to movement ledger.'),
                        'All movements are permanent records — they cannot be deleted. This creates an auditable chain of custody for every IT asset.'
                    ]
                },
                {
                    title: t('manual.sub.142', '26.7 Depreciation & Financial Reporting'),
                    items: [
                        t('manual.item.1440', 'Two depreciation methods are supported:'),
                        t('manual.item.1441', '  • Straight-Line: Equal monthly depreciation = (Purchase Cost − Salvage Value) ÷ (Useful Life in months).'),
                        t('manual.item.1442', '  • Declining Balance: Accelerated depreciation with double the straight-line rate in early years.'),
                        t('manual.item.1443', 'The Depreciation Report (under Asset Tracking → Depreciation Report) shows:'),
                        t('manual.item.1444', '  • Total Original Cost: Sum of all IT asset purchase costs.'),
                        t('manual.item.1445', '  • Accumulated Depreciation: Total depreciation to date.'),
                        t('manual.item.1446', '  • Current Book Value: Total book value of all IT assets.'),
                        t('manual.item.1447', '  • Monthly Expense: Monthly depreciation charge across all categories.'),
                        t('manual.item.1448', 'Reports are broken down by category (Hardware, Infrastructure, Mobile) with per-asset detail.'),
                        'Book values are calculated on-the-fly from purchase dates and depreciation parameters — not stored statically.'
                    ]
                },
                {
                    title: t('manual.sub.143', '26.8 Vendors & Contracts'),
                    items: [
                        t('manual.item.1449', 'Track all IT vendor relationships: SOTI, Fortinet, Dell, EMP, GHA, PCS, ASCtrack, and any other service or hardware provider.'),
                        t('manual.item.1450', 'Each vendor record includes: Vendor Name, Category, Contact (Name, Email, Phone), Website, and Address.'),
                        t('manual.item.1451', 'Vendor categories: MDM, Security, Hardware, Software, Networking, Cloud, Telecom, Consulting, Managed Services.'),
                        t('manual.item.1452', 'Each vendor can have an associated contract with: Contract Number, Contract Type, Start/End/Renewal Dates, Annual Cost, Payment Terms, and Auto-Renew flag.'),
                        t('manual.item.1453', 'Contract types: Support, SLA, Licensing, Maintenance, Managed Service, Subscription, Warranty, Consulting, Lease.'),
                        t('manual.item.1454', 'SLA tracking: Response Time (e.g., "4 hours", "Next Business Day") and Uptime Guarantee (e.g., "99.9%").'),
                        t('manual.item.1455', 'Contract expiry alerting: Contracts within 60 days of expiration show amber warnings in the table. Expired contracts show red.'),
                        t('manual.item.1456', 'Payment terms: Net 15, Net 30, Net 45, Net 60, Net 90, Annual Prepay, Monthly, Quarterly.'),
                        'The stats bar shows total vendor/contract count with an alert for contracts expiring soon.'
                    ]
                },
                {
                    title: t('manual.sub.144', '26.9 Future: Native Import Adapters'),
                    items: [
                        t('manual.item.1457', 'Planned integration adapters for direct import from:'),
                        t('manual.item.1458', '  • SOTI MobiControl: Auto-sync mobile device inventory including IMEI, OS version, enrollment status, and assigned users.'),
                        t('manual.item.1459', '  • Fortinet / FortiGate: Import network device inventory including IP addresses, MAC addresses, firmware versions, and models.'),
                        t('manual.item.1460', '  • Domain Active Directory: Sync computer objects from AD including hostname, OS, department (OU), last logon, and assigned users.'),
                        'These adapters will support both one-click CSV import and scheduled API sync for automated inventory updates.'
                    ]
                },
                {
                    title: t('manual.sub.146', '26.10 IT Metrics & Financial Intelligence'),
                    items: [
                        t('manual.item.1478', 'The IT Metrics dashboard provides real-time financial visibility into your entire IT portfolio.'),
                        t('manual.item.1479', '   • Total Asset Value: Sum of all IT asset purchase costs across hardware, infrastructure, and mobile.'),
                        t('manual.item.1480', '   • Current Book Value: Live depreciation calculations showing what your IT assets are worth today.'),
                        t('manual.item.1481', '   • Monthly Depreciation Expense: The monthly charge for IT asset depreciation by category.'),
                        t('manual.item.1482', '   • License Spend: Total annual software licensing costs with seat utilization tracking.'),
                        t('manual.item.1483', '   • Category breakdowns: Hardware, Infrastructure, Mobile, and Software costs shown separately.'),
                        t('manual.item.1484', '   • Trend charts: Monthly spending trends and depreciation curves over time.'),
                        'Access: IT Metrics is available from the IT Department group on Mission Control.'
                    ]
                },
                {
                    title: t('manual.sub.147', '26.11 IT Global Search'),
                    items: [
                        t('manual.item.1485', 'Search across all IT assets enterprise-wide — hardware, infrastructure, mobile, software, and contracts.'),
                        t('manual.item.1486', '   • Search by asset name, serial number, barcode ID, model, or manufacturer.'),
                        t('manual.item.1487', '   • Results show asset type, location, assigned user, status, and current book value.'),
                        t('manual.item.1488', '   • Click any result to jump directly to the full asset detail.'),
                        'Similar to Global Logistics for parts, but for IT equipment across all plants.'
                    ]
                },
                {
                    title: t('manual.sub.148', '26.12 IT Alerts & Expiry Tracking'),
                    items: [
                        t('manual.item.1489', 'Automated alerting for upcoming expirations and renewals:'),
                        t('manual.item.1490', '   • Software licenses approaching expiry (<30 days) show amber warnings.'),
                        t('manual.item.1491', '   • Expired licenses show red alerts with days past expiration.'),
                        t('manual.item.1492', '   • Vendor contracts within 60 days of renewal show renewal warnings.'),
                        t('manual.item.1493', '   • Hardware nearing end-of-life based on useful life depreciation schedule.'),
                        'The IT Alerts dashboard aggregates all expiry warnings in one view.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s30.title', 'Part 29: LOTO — Lockout/Tagout Permit System'),
            id: 'loto-permits',
            icon: <ShieldAlert size={22} />,
            navigateTo: '/loto',
            filePath: 'src/components/LotoView.jsx',
            content: t('manual.s30.content', 'The LOTO (Lockout/Tagout) module provides a digital permit system for safely isolating equipment during maintenance. Replaces paper-based LOTO permits with an auditable, timestamped digital workflow.'),
            subsections: [
                {
                    title: t('manual.sub.149', '27.1 What is LOTO?'),
                    items: [
                        t('manual.item.1494', 'Lockout/Tagout (LOTO) is an OSHA-mandated safety procedure for isolating hazardous energy sources before maintenance.'),
                        t('manual.item.1495', 'Trier OS provides a digital LOTO permit system that tracks every lock application, verification, and release with timestamps.'),
                        t('manual.item.1496', 'Digital permits replace paper forms — no more lost or illegible lockout tags.'),
                        'All LOTO activity is permanently recorded in the audit trail for regulatory compliance.'
                    ]
                },
                {
                    title: t('manual.sub.150', '27.2 Creating a LOTO Permit'),
                    items: [
                        t('manual.item.1497', '1. Navigate to the LOTO module from the Safety & Compliance group on Mission Control.'),
                        t('manual.item.1498', '2. Click "+ New Permit" to start a new lockout permit.'),
                        t('manual.item.1499', '3. Select the Asset being locked out.'),
                        t('manual.item.1500', '4. Identify the energy sources (Electrical, Pneumatic, Hydraulic, Mechanical, Chemical, Thermal, Gravity, Radiation).'),
                        t('manual.item.1501', '5. Enter isolation procedures for each energy source.'),
                        t('manual.item.1502', '6. Add personnel applying locks — each person gets a numbered lock entry.'),
                        '7. Submit the permit for approval (if required by your plant procedure).'
                    ]
                },
                {
                    title: t('manual.sub.151', '27.3 Lock Lifecycle'),
                    items: [
                        t('manual.item.1503', 'APPLIED — Lock is placed on the energy isolation point. Timestamp and user recorded.'),
                        t('manual.item.1504', 'VERIFIED — A second person verifies the lockout is effective (zero energy check).'),
                        t('manual.item.1505', 'RELEASED — Work is complete. Lock is removed, energy is restored. Timestamp recorded.'),
                        t('manual.item.1506', 'Each step is timestamped and tied to the employee who performed it.'),
                        'Active locks on an asset prevent work order close-out until all locks are released.'
                    ]
                },
                {
                    title: t('manual.sub.152', '27.4 LOTO Best Practices'),
                    items: [
                        t('manual.item.1507', '   • Always verify zero energy before starting work. Use the Verify button to confirm.'),
                        t('manual.item.1508', '   • Never remove another person\'s lock — each person must remove their own.'),
                        t('manual.item.1509', '   • Document any deviations or abnormalities in the permit notes.'),
                        '   • Shift changes: If work extends into the next shift, transfer locks using the handoff procedure.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s31.title', 'Part 30: Compliance & Inspection Management'),
            id: 'compliance-inspections',
            icon: <Shield size={22} />,
            navigateTo: '/compliance',
            filePath: 'src/components/ComplianceView.jsx',
            content: t('manual.s31.content', 'Track regulatory inspections, safety audits, compliance findings, and corrective actions. Ensures your facility stays audit-ready at all times with documented evidence trails.'),
            subsections: [
                {
                    title: t('manual.sub.153', '28.1 Inspection Scheduling'),
                    items: [
                        t('manual.item.1510', 'Schedule recurring inspections: Fire safety, boiler, ammonia, OSHA, FDA, environmental, and custom inspection types.'),
                        t('manual.item.1511', 'Each inspection record includes: Inspector, Date, Type, Area, Result (Pass/Fail/Conditional), and Notes.'),
                        t('manual.item.1512', 'Overdue inspections appear as alerts to ensure no compliance deadlines are missed.'),
                        'The inspection calendar integrates with the PM calendar for a unified maintenance and compliance view.'
                    ]
                },
                {
                    title: t('manual.sub.154', '28.2 Findings & Corrective Actions'),
                    items: [
                        t('manual.item.1513', 'When an inspection identifies an issue, create a Finding with:'),
                        t('manual.item.1514', '   • Severity (Critical, Major, Minor, Observation)'),
                        t('manual.item.1515', '   • Description of the non-conformance'),
                        t('manual.item.1516', '   • Corrective action required'),
                        t('manual.item.1517', '   • Assigned responsible party and due date'),
                        t('manual.item.1518', '   • Status tracking (Open → In Progress → Closed)'),
                        'Findings can be linked to work orders for repair tracking and closed with evidence documentation.'
                    ]
                },
                {
                    title: t('manual.sub.155', '28.3 Compliance Reporting'),
                    items: [
                        t('manual.item.1519', 'Generate compliance reports for auditors showing:'),
                        t('manual.item.1520', '   • All inspections performed within a date range'),
                        t('manual.item.1521', '   • Open vs. closed findings with aging metrics'),
                        t('manual.item.1522', '   • Corrective action completion rates'),
                        t('manual.item.1523', '   • Equipment-specific compliance history'),
                        'All records are permanent and auditable — required for OSHA, FDA, and ISO compliance environments.'
                    ]
                }
            ]
        },
        {
            section: t('manual.s32.title', 'Part 31: Multi-Language Support'),
            id: 'multi-language',
            icon: <Globe size={22} />,
            navigateTo: '/settings',
            filePath: 'src/components/SettingsView.jsx',
            content: t('manual.s32.content', 'Trier OS supports 11 languages across the entire application. Every screen, button, label, menu, notification, and tooltip can be displayed in your preferred language.'),
            subsections: [
                {
                    title: t('manual.sub.156', '29.1 Supported Languages'),
                    items: [
                        t('manual.item.1524', 'Trier OS is available in the following languages:'),
                        t('manual.item.1525', '   • English (EN) — Default'),
                        t('manual.item.1526', '   • Spanish (ES) — Español'),
                        t('manual.item.1527', '   • French (FR) — Français'),
                        t('manual.item.1528', '   • German (DE) — Deutsch'),
                        t('manual.item.1529', '   • Chinese (ZH) — 中文'),
                        t('manual.item.1530', '   • Portuguese (PT) — Português'),
                        t('manual.item.1531', '   • Japanese (JA) — 日本語'),
                        t('manual.item.1532a', '   • Korean (KO) — 한국어'),
                        t('manual.item.1533', '   • Arabic (AR) — العربية'),
                        t('manual.item.1534', '   • Hindi (HI) — हिन्दी'),
                        '   • Turkish (TR) — Türkçe'
                    ]
                },
                {
                    title: t('manual.sub.157', '29.2 Changing Your Language'),
                    items: [
                        t('manual.item.1535', '1. Click Settings in the navigation bar.'),
                        t('manual.item.1536', '2. Find the Language selector.'),
                        t('manual.item.1537', '3. Select your preferred language from the dropdown.'),
                        t('manual.item.1538', '4. The entire interface updates immediately — no logout or page refresh required.'),
                        'Your language preference is saved to your device and persists across sessions.'
                    ]
                },
                {
                    title: t('manual.sub.158', '29.3 What Translates'),
                    items: [
                        t('manual.item.1539', 'The following elements translate when you change language:'),
                        t('manual.item.1540', '   • All buttons, labels, menus, and navigation items'),
                        t('manual.item.1541', '   • Mission Control tile titles, descriptions, and pill labels'),
                        t('manual.item.1542', '   • Form fields, placeholders, and validation messages'),
                        t('manual.item.1543', '   • Toast notifications and alert messages'),
                        t('manual.item.1544', '   • Calendar and date displays (locale-aware formatting)'),
                        t('manual.item.1545', '   • Greeting messages (Good morning/afternoon/evening)'),
                        'Over 4,200 text elements are translated across every screen.'
                    ]
                },
                {
                    title: t('manual.sub.159', '29.4 What Stays in English'),
                    items: [
                        t('manual.item.1546', 'Certain content intentionally remains in English regardless of language setting:'),
                        t('manual.item.1547', '   • Industry acronyms: MTBF, MTTR, OEE, LOTO, DVIR, CDL, FMEA, ECN, RCA, PM, WO, SOP, BOM — these are universal standards.'),
                        t('manual.item.1548', '   • Proper nouns: "Trier OS", "Mission Control", plant names, and user names.'),
                        t('manual.item.1549', '   • Data values: Part numbers, serial numbers, work order numbers, and barcode IDs.'),
                        t('manual.item.1550', '   • This Operations Manual — reference documentation remains in English for consistency.'),
                        'If a translation is missing for any element, the system automatically shows the English version as a fallback.'
                    ]
                }
            ]
        },
        {
            section: t('manual.studio.title', 'Part XXX: Live Studio — In-App IDE & DevOps Console'),
            id: 'live-studio',
            icon: <Server size={22} />,
            filePath: 'server/routes/live_studio.js',
            adminOnly: true,
            content: t('manual.studio.content', 'Live Studio is a fully integrated, browser-based code editor and deployment pipeline built directly into Trier OS. It allows authorized Creators and IT Admins to inspect, edit, and deploy source code changes without ever leaving the platform — with zero-downtime deployment, financial impact analysis, historical simulation, and a blast-radius consequence mapper built in.'),
            subsections: [
                {
                    title: t('manual.studio.1', '30.1 Access & Security Model'),
                    items: [
                        t('manual.studio.items.1', 'Live Studio is restricted to two roles: Creator (Doug Trier) and IT Admin. It is completely invisible to all other users — no tile, no button, no route.'),
                        t('manual.studio.items.2', 'Access is enforced at three layers: (1) the indigo Code icon in the header only renders for authorized sessions, (2) every API endpoint is gated by the requireStudio middleware on the server, and (3) the Monaco editor bundle is never transmitted to technician endpoints (Zebra TC77, mobile devices) because those sessions never pass the RBAC check.'),
                        t('manual.studio.items.3', 'The "Human Airgap" mandate is architecturally enforced: no AI model, API, or automated code-generation system has any access to Live Studio endpoints. All code is written by humans and pasted in manually.'),
                        t('manual.studio.items.4', 'A persistent red legal banner is displayed on every Studio session: "Caution: Operations in this workspace will permanently modify the running Trier OS environment."'),
                        t('manual.studio.items.5', 'To open Live Studio: click the indigo </> Code icon in the top navigation bar. Alternatively, open any section of this manual and click the indigo </> Go to Code button — the Studio opens with that exact file pre-loaded in the editor.')
                    ]
                },
                {
                    title: t('manual.studio.2', '30.2 The Monaco Editor (Editor Tab)'),
                    items: [
                        t('manual.studio.items.6', 'Live Studio embeds Monaco Editor — the same engine that powers Visual Studio Code. It is lazy-loaded only when the Studio modal opens, so it never impacts page load time for standard users.'),
                        t('manual.studio.items.7', 'File scope is hard-whitelisted to two directories only: src/components/ (React frontend) and server/routes/ (backend API routes). No other files can be read, written, or accessed.'),
                        t('manual.studio.items.8', 'Critical pipeline files (vite.config.js, package.json, index.js) are blocked from direct writes. Modifications to these require going through the deploy pipeline.'),
                        t('manual.studio.items.9', 'File writes are capped at 1MB. Symlinks are explicitly rejected. Binary files are blocked.'),
                        t('manual.studio.items.10', 'The file browser sidebar on the left groups files by section (components vs. routes). Clicking a file loads it into Monaco immediately.'),
                        t('manual.studio.items.11', 'Save with Ctrl+S (or the Save button). Unsaved changes are flagged with a yellow dot. If you try to switch files with unsaved changes, the system asks you to confirm before discarding them.'),
                        t('manual.studio.items.12', 'Editor features: real-time syntax highlighting, minimap, word wrap, 4-space tabs, JetBrains Mono font, and automatic layout adjustment.')
                    ]
                },
                {
                    title: t('manual.studio.3', '30.3 Git Branch Management & Deploy Pipeline (Deploy Tab)'),
                    items: [
                        t('manual.studio.items.13', 'Before making changes, create a sandbox branch following the naming convention: studio/<your-name>/<descriptor> — for example, studio/doug/fix-calendar-bug. The Studio will reject branch names that do not match this pattern.'),
                        t('manual.studio.items.14', 'The Deploy tab shows the current Git branch, whether the working tree is dirty (files changed), the number of changed files, and the last stable-* recovery tag.'),
                        t('manual.studio.items.15', 'The deploy pipeline is a 4-step sequence: (1) Stage all changes in src/components/ and server/routes/, (2) Commit to the sandbox branch, (3) Run npm run build with a 120-second timeout, (4) Auto-tag the commit stable-YYYY-MM-DD.'),
                        t('manual.studio.items.16', 'To trigger a deploy, type DEPLOY NOW exactly in the confirmation field — the server rejects any other string. This is a deliberate friction gate.'),
                        t('manual.studio.items.17', 'Deploy responds immediately with a ledger ID. The client then polls the server with exponential backoff (starting at 2 seconds, capped at 10 seconds) and streams the live build log into the log panel in real time.'),
                        t('manual.studio.items.18', 'Deploy states: Idle → Building → Success or Failed. If the build fails, the full error output is captured in the log panel and the ledger entry is marked FAILED.'),
                        t('manual.studio.items.19', 'A mutex lock prevents two users from deploying simultaneously — if another deploy is BUILDING when you trigger one, the system blocks yours with a 409 and tells you who has the lock.'),
                        t('manual.studio.items.20', 'Emergency Revert: the "Revert to Stable Tag" button rolls the entire working tree back to the most recent stable-* tag. This is the Boot Safe Mode recovery path — no guessing, no judgment calls required.')
                    ]
                },
                {
                    title: t('manual.studio.4', '30.4 Contextual "Go to Code" from This Manual'),
                    items: [
                        t('manual.studio.items.21', 'Every section of this Operations Manual that corresponds to a specific source file has a blue </> Go to Code button displayed next to the "Go There" navigation button.'),
                        t('manual.studio.items.22', 'This button is only visible to Creator and IT Admin roles — standard users never see it.'),
                        t('manual.studio.items.23', 'Clicking it fires a browser event that opens the Studio and pre-loads the exact source file in Monaco. You do not need to navigate the file browser.'),
                        t('manual.studio.items.24', '22 manual sections are currently mapped to their source files, covering: login, shift handoff, work orders, storeroom, PM schedules, chat, fleet, settings, data bridge, reports, floor plans, safety, engineering, contractors, OEE, mission control, IT department, LOTO, compliance, SCADA sensors, and the Live Studio backend itself.'),
                        t('manual.studio.items.25', 'This pattern separates concerns cleanly: the Manual is the entry point for context-driven editing. The Admin Console tile (Settings → Admin Console → Live Studio / DevOps) is the control room for managing running deploys and reading the audit ledger.')
                    ]
                },
                {
                    title: t('manual.studio.5', '30.5 Frictional Cost Engine (Friction Tab)'),
                    items: [
                        t('manual.studio.items.26', 'The Frictional Cost Engine is a deterministic UX financial analyzer. Before you deploy a UI change, it calculates the real-world dollar cost — or savings — of adding or removing interactive elements.'),
                        t('manual.studio.items.27', 'It works by comparing the current editor content against the git HEAD baseline of the same file, counting the delta in interactive elements using physics-based time constants:'),
                        t('manual.studio.items.28', '  • Text input field: 3.0 seconds (locate, tap, type, confirm)'),
                        t('manual.studio.items.29', '  • Number input: 2.0 seconds'),
                        t('manual.studio.items.30', '  • Dropdown select: 1.0 second'),
                        t('manual.studio.items.31', '  • Checkbox / Radio: 0.3 seconds'),
                        t('manual.studio.items.32', '  • Button click: 0.5 seconds'),
                        t('manual.studio.items.33', '  • Barcode scan: 1.5 seconds (raise scanner, aim, trigger, wait for beep)'),
                        t('manual.studio.items.34', '  • Textarea: 5.0 seconds'),
                        t('manual.studio.items.35', 'The delta time is projected across: estimated daily workflow usage (derived from AuditLog), 250 working days per year, 40 plants, and a $25/hr operator wage.'),
                        t('manual.studio.items.36', 'The verdict is shown as a banner: green (savings) if you removed friction, red (cost warning) if you added friction, or neutral if no interactive elements changed.'),
                        t('manual.studio.items.37', 'Example: Adding 2 text inputs to a form used 30 times/day across 40 plants = +60 seconds/day = 250 hours/year = -$6,250/yr in operator productivity. The engine shows you this number before you deploy.'),
                        t('manual.studio.items.38', 'To run it: open a file in the Editor tab, switch to Friction, and click "Run Friction Analysis".')
                    ]
                },
                {
                    title: t('manual.studio.6', '30.6 Parallel Universe — Future Simulation Engine (Universe Tab)'),
                    items: [
                        t('manual.studio.items.39', 'The Parallel Universe engine lets you safely test how a change would have affected a plant by running historical event data through a cloned database stripped to a specific point in time.'),
                        t('manual.studio.items.40', 'Select a plant and a cutoff date. The engine copies that plant\'s SQLite database to a temporary file, strips all Work Orders, Schedule records, and AuditLog entries added after the cutoff date, and presents a split-screen KPI comparison.'),
                        t('manual.studio.items.41', 'The comparison shows 6 KPIs side-by-side between the live database and the simulation snapshot:'),
                        t('manual.studio.items.42', '  • Open Work Orders (total active WOs)'),
                        t('manual.studio.items.43', '  • Completed Work Orders'),
                        t('manual.studio.items.44', '  • Overdue Work Orders (past scheduled date, still open)'),
                        t('manual.studio.items.45', '  • Active PM Schedules'),
                        t('manual.studio.items.46', '  • PM Compliance % (on-time completions vs. total PMs)'),
                        t('manual.studio.items.47', '  • Total Assets'),
                        t('manual.studio.items.48', 'Delta badges below the split-screen highlight every metric that differs between the two states, colored green (improved) or red (regressed).'),
                        t('manual.studio.items.49', 'Simulation sessions auto-expire after 30 minutes and are deleted from the temp directory. Click "Destroy Simulation & Reset" to clean up immediately.'),
                        t('manual.studio.items.50', 'Use case: if you are refactoring the PM scheduling logic, you can clone Plant 5 at a date 3 months ago and verify the new logic produces the same (or better) compliance numbers as the live system did at that time.')
                    ]
                },
                {
                    title: t('manual.studio.7', '30.7 Visual Change Consequence Analyzer (Impact Tab)'),
                    items: [
                        t('manual.studio.items.51', 'The Impact tab traces your code changes through ES6 import chains to the React Router routes that expose them to users — answering the question: "If I deploy this, which screens in the app does it touch?"'),
                        t('manual.studio.items.52', 'Scope: if a file is open in the Editor tab, the analysis uses that file. If no file is open, it scans all files in git diff HEAD (all uncommitted changes).'),
                        t('manual.studio.items.53', 'The engine reads App.jsx to extract the full route map — every <Route path="..." element={<Component />} pair — then checks whether any changed component appears directly in that map (direct hit) or is imported by a component that does (indirect hit).'),
                        t('manual.studio.items.54', 'Results are shown in three panels:'),
                        t('manual.studio.items.55', '  • Changed Components: the files identified as modified'),
                        t('manual.studio.items.56', '  • Affected Routes: each route that will be impacted, with its URL path, component name, and a "direct" or "indirect" badge'),
                        t('manual.studio.items.57', '  • Downstream Importers: other components that import the changed file, even if they are not directly on a route'),
                        t('manual.studio.items.58', 'A red summary banner appears if any routes are affected. An indigo banner appears if the changed file is a utility/shared component not directly mounted on any route.'),
                        t('manual.studio.items.59', 'Click "Map Blast Radius" to run the analysis. Every run is logged to the AuditLog.')
                    ]
                },
                {
                    title: t('manual.studio.8', '30.8 Executive Intelligence Audit Ledger (Ledger Tab)'),
                    items: [
                        t('manual.studio.items.60', 'The Ledger tab is a permanent, immutable record of every deployment, revert, and failed build attempt. Records cannot be deleted.'),
                        t('manual.studio.items.61', 'Each ledger entry shows: entry number, status badge (Success / Failed / Building / Reverted), deployed-by user, sandbox branch name, stable tag applied, commit SHA (12 characters), started timestamp, completed timestamp, and deploy notes.'),
                        t('manual.studio.items.62', 'SHA copy-to-clipboard: click the copy icon next to any commit SHA to copy the full 40-character hash. A green checkmark confirms the copy for 2 seconds.'),
                        t('manual.studio.items.63', 'Search & Filter: the search panel supports 5 simultaneous filters:'),
                        t('manual.studio.items.64', '  • Free text (q): searches notes, branch name, SHA, and user name'),
                        t('manual.studio.items.65', '  • User: filter by who deployed'),
                        t('manual.studio.items.66', '  • Date From / Date To: filter by deploy start date'),
                        t('manual.studio.items.67', '  • Status: Success, Failed, Reverted, or Building'),
                        t('manual.studio.items.68', 'Press Enter in any filter field or click Search to run the query. Click "All" to reload the last 50 unfiltered entries.'),
                        t('manual.studio.items.69', 'Export PDF: opens a print-ready HTML page in a new tab with the current filtered ledger as a formatted table. Click "Print / Save as PDF" in that window to produce a court-ready PDF with all columns: #, Status, Deployed By, Branch, Tag, Commit SHA, Started, Notes.'),
                        t('manual.studio.items.70', 'The ledger is stored in prairie_logistics.db (StudioDeployLedger table) — it survives server restarts, deploys, and reverts.')
                    ]
                },
                {
                    title: t('manual.studio.9', '30.9 Boot Safe Mode & Disaster Recovery'),
                    items: [
                        t('manual.studio.items.71', 'Every successful deploy is automatically tagged with the convention stable-YYYY-MM-DD. This tag is the deterministic recovery anchor for Boot Safe Mode.'),
                        t('manual.studio.items.72', 'If a cascading failure locks out the UI after a bad deploy, start the server with NODE_ENV=safe_mode. This bypasses the latest commit and loads the most recent stable-* tag automatically — no human judgment required during an incident.'),
                        t('manual.studio.items.73', 'The Emergency Revert button in the Deploy tab executes the same recovery path from inside the UI: it resolves the latest stable-* tag via git tag --list "stable-*" --sort=-version:refname and checks it out.'),
                        t('manual.studio.items.74', 'Every revert is recorded in the ledger with Status=REVERTED, the tag that was restored, and the user who triggered it.'),
                        t('manual.studio.items.75', 'If the tag already exists for today (e.g., you deploy twice in one day), the pipeline skips re-tagging without error — the first deploy of the day holds the stable anchor.')
                    ]
                }
            ]
        },
        {
            section: t('manual.opexTracking.title', 'Part XXXI: OpEx Self-Healing Loop — Commitment Tracking & Outcome Validation'),
            id: 'opex-tracking',
            navigateTo: '/corp-analytics',
            filePath: 'server/routes/opex_tracking.js',
            icon: <Activity size={22} />,
            content: t('manual.opexTracking.content', 'The OpEx Self-Healing Loop closes the gap between identifying savings and proving they happened. It tracks every action-plan commitment, automatically re-measures the underlying metric at 30, 60, and 90 days, and feeds real-world outcomes back into the prediction models — making every future forecast more accurate than the last.'),
            subsections: [
                {
                    title: t('manual.opexTracking.sub1', '31.1 What Problem This Solves'),
                    items: [
                        t('manual.opexTracking.item1', 'The standard OpEx Intelligence engine identifies savings opportunities across 14 categories. Without a tracking layer, there is no way to know whether a plant actually acted on the recommendation — or whether the savings materialized.'),
                        t('manual.opexTracking.item2', 'This module adds three layers on top of the existing engine: Execution Tracking (did the action happen?), Outcome Validation (did savings materialize?), and Feedback into the prediction model (how accurate was the estimate?).'),
                        t('manual.opexTracking.item3', 'No CMMS — including Maximo, SAP PM, or any subscription platform — provides this closed loop automatically from live operational data. Trier OS generates it without manual entry beyond the initial commitment click.'),
                    ]
                },
                {
                    title: t('manual.opexTracking.sub2', '31.2 Creating a Commitment'),
                    items: [
                        t('manual.opexTracking.item4', '1. Navigate to Corporate Analytics → OpEx Intel tab.'),
                        t('manual.opexTracking.item5', '2. Click any savings card (e.g., Overstock Capital Lockup — $933K).'),
                        t('manual.opexTracking.item6', '3. In the Game Plan modal, click the green "Commit to This Action" button.'),
                        t('manual.opexTracking.item7', 'The system immediately: snapshots the current live baseline value for that category at that plant, creates three outcome checkpoints scheduled for 30, 60, and 90 days, and records the commitment with your username, plant, and predicted savings.'),
                        t('manual.opexTracking.item8', 'A confirmation banner appears confirming the checkpoints are set. The commitment is visible immediately in the OpEx Tracking tab.'),
                    ]
                },
                {
                    title: t('manual.opexTracking.sub3', '31.3 What the Tracking Tab Shows'),
                    items: [
                        t('manual.opexTracking.item9', 'Navigate to Corporate Analytics → OpEx Tracking tab to see the enterprise commitment dashboard.'),
                        t('manual.opexTracking.item10', 'KPI Bar: Open Actions, In Progress, Completed, Missed, Overdue, Total Predicted Savings, Total Realized Savings, and Enterprise Realization Rate — all live from the database.'),
                        t('manual.opexTracking.item11', 'Plant Realization Heatmap: A card for every plant showing its average realization rate across all validated outcomes. Green (≥80%), amber (50–79%), red (<50%). Plants that consistently follow through are immediately visible.'),
                        t('manual.opexTracking.item12', 'Category Performance Table: Which savings categories are generating the most predicted value, and what percentage of that value is actually being realized across all plants.'),
                        t('manual.opexTracking.item13', 'Alert Banner: If any escalation alerts (overdue, missed at 90 days, or disputed) are unresolved, a red banner shows the count.'),
                    ]
                },
                {
                    title: t('manual.opexTracking.sub4', '31.4 The Automated 30/60/90-Day Measurement Cycle'),
                    items: [
                        t('manual.opexTracking.item14', 'Every night at 2:00 AM, the outcome cron (Stage 5.9, server/index.js) automatically runs for every commitment marked COMPLETED whose 30, 60, or 90-day checkpoint is now due.'),
                        t('manual.opexTracking.item15', 'The cron re-runs the exact same algorithm that generated the original prediction — against the current live plant database — and computes the delta between the current metric and the baseline snapshot captured at commit time.'),
                        t('manual.opexTracking.item16', 'Outcome thresholds: VALIDATED (≥80% of predicted savings realized), PARTIAL (30–79%), MISSED (<30%). Each result is permanently recorded in OpExOutcomes.'),
                        t('manual.opexTracking.item17', 'If a commitment is still OPEN or IN_PROGRESS past its TargetDate, the cron automatically generates an OVERDUE alert. If the 90-day checkpoint is MISSED, an ESCALATION alert is created and surfaced to corporate.'),
                    ]
                },
                {
                    title: t('manual.opexTracking.sub5', '31.5 Plant Manager Resolution Workflow'),
                    items: [
                        t('manual.opexTracking.item18', 'Plant managers see a dedicated OpEx Action Items widget on their Dashboard showing only their plant\'s commitments — not the full enterprise view.'),
                        t('manual.opexTracking.item19', 'Each action item shows: category, description, predicted savings at stake, due date, and current status (OPEN / IN_PROGRESS / OVERDUE).'),
                        t('manual.opexTracking.item20', '"Mark Complete" records the completion date and triggers the first 30-day outcome measurement window.'),
                        t('manual.opexTracking.item21', 'Once an outcome is measured as VALIDATED, the item turns green and the realized savings appear in the plant\'s contribution to the corporate Tracking dashboard.'),
                        t('manual.opexTracking.item22', 'MISSED items do not disappear — they re-surface in the next OpEx scan with a "previously committed, not realized" badge and elevated priority. The loop persists until the savings are achieved or the item is formally disputed with a written note.'),
                    ]
                },
                {
                    title: t('manual.opexTracking.sub6', '31.6 The Self-Calibrating Prediction Model'),
                    items: [
                        t('manual.opexTracking.item23', 'Every validated (or missed) outcome updates the OpExPlantCalibration table for that plant and category using a Bayesian rolling average: new_rate = (old_rate × N + outcome_rate) ÷ (N + 1).'),
                        t('manual.opexTracking.item24', 'Initially, all plants use the enterprise-wide default realization rate (22%). As outcomes are recorded, each plant develops its own historical rate per category.'),
                        t('manual.opexTracking.item25', 'Example: if Plant 3 has 8 validated Overstock outcomes averaging 67%, the next Overstock finding at Plant 3 will show a projected realized savings of 67% of the identified amount — not the generic 22%.'),
                        t('manual.opexTracking.item26', 'A plant that consistently follows through earns a higher rate. A plant that consistently misses gets a lower rate — meaning the numbers shown to corporate are automatically conservative for that plant. The model self-corrects.'),
                        t('manual.opexTracking.item27', 'The Calibration rates are visible in full at: GET /api/opex-tracking/calibration — showing PlantId, Category, RealizationRate, and SampleCount for every plant-category pair that has at least one outcome.'),
                    ]
                },
                {
                    title: t('manual.opexTracking.sub7', '31.7 What a CFO Can Now Show the Board'),
                    items: [
                        t('manual.opexTracking.item28', 'After one quarter of use, the OpEx Tracking tab generates a board-ready financial narrative automatically from live data:'),
                        t('manual.opexTracking.item29', '   • "We committed to X actions across Y plants in Q1."'),
                        t('manual.opexTracking.item30', '   • "Z were completed on time. W were validated by algorithm remeasurement."'),
                        t('manual.opexTracking.item31', '   • "Total realized savings: $X.XM — YY% of the $Z.ZM identified."'),
                        t('manual.opexTracking.item32', '   • "Plant 3 is our highest realizer at 94%. Plant 7 has missed 3 consecutive actions — escalation in progress."'),
                        t('manual.opexTracking.item33', 'This report is generated from live operational data with zero manual entry beyond the initial commitment click. No consulting firm, no CMMS, and no ERP produces this automatically.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s33.title', 'Part 32: Integration & Enterprise Automation'),
            id: 'integration-enterprise-automation',
            navigateTo: '/settings',
            filePath: 'src/components/DataBridge.jsx',
            icon: <Server size={22} />,
            content: t('manual.s33.content', 'Connecting Trier OS to the outside world: ERP systems, Active Directory, and OT floor devices like PLCs and sensors.'),
            subsections: [
                {
                    title: t('manual.sub.160', 'XXXII.1 SCADA / PLC EdgeAgents & Device Registry (OT Network)'),
                    items: [
                        t('manual.item.1580', 'The Device Registry allows Plant Admins to quickly ingest and monitor OT assets connected to the local network via Modbus TCP.'),
                        t('manual.item.1581', 'Device Discovery Wizard: In the Plant Setup > Integrations view, you can perform a subnet sweep to discover open Modbus devices (port 502).'),
                        t('manual.item.1582', 'A background MAC→IP resolution worker maps IP addresses back to MAC addresses, guaranteeing device telemetry persists through DHCP renewals.'),
                        t('manual.item.1583', 'The internal SCADA EdgeAgent automatically initializes mapped registers and streams telemetry back to the Trier OS interface.')
                    ]
                },
                {
                    title: t('manual.sub.161', 'XXXII.2 Sensor Thresholds & Automated Work Orders'),
                    items: [
                        t('manual.item.1584', 'Plant Setup > Integrations tracks all incoming sensor telemetry from the SCADA EdgeAgents.'),
                        t('manual.item.1585', 'You can attach operational thresholds to any mapped analog input (e.g., Temp > 150F).'),
                        t('manual.item.1586', 'When a threshold violation occurs, the edge agent dispatches a hardcoded Auto-Work Order using Priority 1 or 2 as designated.'),
                        t('manual.item.1587', 'Cooldowns automatically engage to prevent duplicating work orders if a machine bounces its temperature repeatedly.')
                    ]
                },
                {
                    title: t('manual.sub.162', 'XXXII.3 Corporate Supply Chain "All Sites" Rollup'),
                    items: [
                        t('manual.item.1588', 'Corporate Directors can switch their context to "All Sites" from the navigation header.'),
                        t('manual.item.1589', 'This loads the Corporate Rollup dashboard within the Supply Chain View.'),
                        t('manual.item.1590', 'Data pulls asynchronously across all attached plant databases to surface network-wide open/overdue POs and MTD spend profiles.')
                    ]
                },
                {
                    title: t('manual.sub.163', 'XXXII.4 ERP Synchronization Pipeline & Output Outbox'),
                    items: [
                        t('manual.item.1591', 'Trier OS operates a dual-bridge methodology for SAP/ERP interactions: Pull Integrations and Push Outboxes.'),
                        t('manual.item.1592', 'ERP Pull Worker: Executes over standard HTTP REST. Routinely fetches new parts and purchase structures dropping from the central ERP.'),
                        t('manual.item.1593', 'ERP Write-Back Outbox: Consumed parts and closed work orders queue seamlessly inside local erp_outbox tables automatically.'),
                        t('manual.item.1594', 'A dedicated background drain loop transmits those events (Status 50, Status 99, Issue, Receive) off to the ERP, protecting local performance while guaranteeing sequence delivery.')
                    ]
                },
                {
                    title: t('manual.sub.164', 'XXXII.5 IT Admin Configurations (LDAP, SQL Server, Access Imports)'),
                    items: [
                        t('manual.item.1595', 'LDAP: Enable Active Directory integration to centralize logins. This removes the need to provision new mechanics manually.'),
                        t('manual.item.1596', 'Legacy Migration: Import utility scripts allow bringing in direct relational data stores from MS Access (.accdb, .mdb), SQL Server exports, and obsolete systems directly into modern SQLite instances.')
                    ]
                }
            ]
        },
        {
            section: t('manual.s34.title', 'Part 33: Offline Resilience & Plant LAN Sync'),
            id: 'offline-resilience-lan-sync',
            navigateTo: '/scanner',
            filePath: 'src/utils/LanHub.js',
            icon: <Wifi size={22} />,
            content: t('manual.s34.content', 'How Trier OS keeps every plant operational when the central server is unreachable — including real-time device sync over the local network, zero-data-loss scan queuing, and the automated Silent Auto-Close safeguard.'),
            subsections: [
                {
                    title: t('manual.sub.167', 'XXXIII.1 How LAN Sync Works (Plant Hub Architecture)'),
                    items: [
                        t('manual.item.1597', "When the central server becomes unreachable, the Electron desktop application automatically activates a LAN Hub — a lightweight WebSocket server running on port 1940 of the plant's local network."),
                        t('manual.item.1598', "Every PWA scanner on the same network discovers the hub using the plant's configured Hub IP (set in Plant Setup). The connection is established automatically within seconds of central server loss."),
                        t('manual.item.1599', 'Once connected, all scans submitted on any PWA device are routed to the hub in real time. The hub stores them in a local SQLite queue and broadcasts WO_STATE_CHANGED events to every other connected device — keeping all screens in sync without the central server.'),
                        t('manual.item.1600', 'When the central server returns, the hub replays its full collected queue to the server automatically, preserving original deviceTimestamp order. All PWA devices switch back to normal server mode and the hub gracefully goes quiet.'),
                        t('manual.item.1601', 'Plant Network Status Panel: Mission Control includes a live "Plant Network" panel showing central server status, LAN hub status (Connected / Not Running), port number, and per-device presence with connection times. This updates in real time via the hub WebSocket.'),
                    ]
                },
                {
                    title: t('manual.sub.168', 'XXXIII.2 Offline Scan Queue — Zero-Data-Loss Guarantee'),
                    items: [
                        t('manual.item.1602', "Every scan submitted while offline is immediately written to the device's local IndexedDB database before any network call is attempted. The scan is never lost, even if the app is closed during submission."),
                        t('manual.item.1603', 'Scans routed through the LAN hub are marked "hub-submitted" in the local queue. When the central server returns, these entries are skipped by the client\'s own replay — the hub already delivered them. This prevents every scan from being sent twice.'),
                        t('manual.item.1604', 'Branch Prediction: While offline, the app predicts the correct scan outcome (New WO, Resume, MULTI_TECH, etc.) using locally cached work order and segment data. The prediction is shown to the technician immediately — no spinner, no wait.'),
                        t('manual.item.1605', 'Session Persistence: If the app is closed or crashes mid-scan submission, it saves a recovery checkpoint to IndexedDB. On the next launch, a resume prompt appears asking the technician to confirm or re-scan the in-flight asset.'),
                        t('manual.item.1606', 'Sync Error Review: After a batch replay, if any scans conflict (409) or fail permanently, the Offline Status Bar shows a "Review N issues" button. Expanding it lists each affected asset with a color-coded badge (amber = conflict, red = network failure) so the technician knows exactly which assets need a re-scan.'),
                    ]
                },
                {
                    title: t('manual.sub.169', 'XXXIII.3 LAN Hub Security — JWT Authentication'),
                    items: [
                        t('manual.item.1607', "Every device must present a valid JWT on the WebSocket upgrade handshake. The hub validates the token's signature and expiry before accepting the connection. Invalid or expired tokens are refused with a 401 close code — rogue devices on the plant WiFi cannot inject scan events."),
                        t('manual.item.1608', 'Hub Tokens are distributed to PWA devices at login by the central server. They have the same 7-day lifetime as the session cookie, supporting extended offline plant operation across full shift cycles.'),
                        t('manual.item.1609', 'When a token is near expiry (within 5 minutes) or already expired, the app detects this client-side without a network call. The Offline Status Bar shows an amber "Hub unavailable — local queue only" chip. Scans continue to be queued in IndexedDB and will replay to the server when connectivity returns.'),
                        t('manual.item.1610', "Offline Profile Signing: At every successful login, the app stores a device-bound HMAC signature of the user's profile using a 32-byte secret stored in IndexedDB — never in localStorage. If someone tampers with the stored credentials, the signature check fails and the app refuses the offline login with a clear tamper-detected message."),
                    ]
                },
                {
                    title: t('manual.sub.170', 'XXXIII.4 Conflict Resolution — Dual-Scan Merge'),
                    items: [
                        t('manual.item.1611', "Race Condition: Two technicians scan the same asset within seconds of each other while the hub is active. Both devices predict AUTO_CREATE_WO because neither has seen the other's scan yet."),
                        t('manual.item.1612', 'Hub Detection: When the second SCAN message arrives for the same assetId within 30 seconds of the first, the hub identifies the conflict and rejects the duplicate AUTO_CREATE with a SCAN_ACK error: "Another technician is creating a work order for this asset — tap Join instead."'),
                        t('manual.item.1613', 'The conflict is flagged with conflictAutoResolved=1 and surfaced in Mission Control\'s review queue so a supervisor can confirm the merge was handled correctly.'),
                        t('manual.item.1614', 'Deduplication is also enforced at the central server using the scanId UUID — even if a scan somehow reaches the server twice (hub replay + client replay), the second attempt is silently skipped.'),
                    ]
                },
                {
                    title: t('manual.sub.171', 'XXXIII.5 Silent Auto-Close Threshold'),
                    items: [
                        t('manual.item.1615', "The Silent Auto-Close Engine runs every hour on the server. It scans every plant database for WorkSegments that have been in \"Active\" state longer than the plant's configured threshold (default: 12 hours, set in Plant Setup > Scan Config > autoReviewThresholdHours)."),
                        t('manual.item.1616', 'When a stale segment is found, the engine closes it with state "TimedOut" (not "Ended" — this distinction lets reports separate cron-closed segments from technician-closed ones). It then sets needsReview=1, reviewReason=\'SILENT_AUTO_CLOSE\', and reviewStatus=\'FLAGGED\' on the parent Work Order.'),
                        t('manual.item.1617', 'Exempt Hold Reasons: Work orders with hold reasons WAITING_ON_PARTS, WAITING_ON_VENDOR, WAITING_ON_APPROVAL, or SCHEDULED_RETURN are skipped — a WO legitimately waiting on an external dependency should not generate a false-positive review flag.'),
                        t('manual.item.1618', 'Flagged WOs appear in Mission Control\'s review queue under the "Silent Auto-Close" reason. Supervisors can acknowledge, resolve, or dismiss them from the queue. The engine does not re-flag a WO that already has needsReview=1 to avoid overwriting a prior reviewReason.'),
                    ]
                },
                {
                    title: t('manual.sub.172', 'XXXIII.6 Offline Cache Staleness & Trust Indicators'),
                    items: [
                        t('manual.item.1619', 'Cache Staleness Badge: When the central server is unreachable and the last successful data sync (fullCacheRefresh) was more than 30 minutes ago, the Plant Network panel shows an amber "Offline data last updated Xh ago" badge.'),
                        t('manual.item.1620', 'This gives plant managers a clear signal about how fresh the on-screen WO and asset data is, allowing them to judge whether cached information is safe to act on before the server returns.'),
                        t('manual.item.1621', 'The Status Map (WorkStatuses table) is also cached at login and refreshed on every successful server connection. This means predictBranch() uses plant-specific status IDs rather than hardcoded defaults — accurate even for plants that have customized their status taxonomy.'),
                        t('manual.item.1622', 'LAN Hub Keepalive: The hub connection uses a 20-second PING/PONG keepalive. If the hub becomes unreachable mid-shift, the PWA detects the closed WebSocket within seconds and displays the disconnected state, automatically attempting to reconnect every 5–25 seconds (exponential backoff, max 10 attempts).'),
                        t('manual.item.1764', 'EVENT REPLAY ORDER GUARANTEE: Offline scan events queued on the LAN Hub are sorted by device timestamp before replay to the central server (Invariant I-03). This guarantees work order state transitions are applied in the correct chronological sequence regardless of the order in which devices reconnect. Verified PASS via GET /api/invariants/report.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s35.title', 'Part 34: Emissions & Carbon Intensity Tracking'),
            id: 'emissions-carbon',
            navigateTo: '/emissions',
            filePath: 'src/components/EmissionsView.jsx',
            icon: <Activity size={22} />,
            content: t('manual.s35.content', 'ESG-grade Scope 1 and Scope 2 emissions tracking built on top of the existing Energy module. No new sensor infrastructure required — all calculations use meter readings already logged in the system. Generates monthly and annual ESG reports exportable as PDF and CSV.'),
            subsections: [
                {
                    title: t('manual.sub.173', 'LIX.1 Scope 1 & Scope 2 Emissions'),
                    items: [
                        t('manual.item.1623', 'Scope 1 — Direct Combustion: Emissions from on-site fuel use. Tracked per asset: natural gas boilers, diesel generators, propane process heaters, and fleet vehicles. Each asset with a combustion fuel type generates a CO2-equivalent figure from its logged meter readings.'),
                        t('manual.item.1624', 'Scope 2 — Purchased Electricity: Plant-level electricity consumption (kWh from the Energy module) multiplied by the applicable regional grid carbon intensity factor. Grid factors are configurable per plant to reflect local utility mix.'),
                        t('manual.item.1625', 'Carbon Intensity per Unit: Total plant emissions divided by production output — expressed as kg CO2e per unit produced. Tracks whether efficiency improvements are reducing the carbon cost per unit of output over time.'),
                        t('manual.item.1626', 'Corporate Rollup: The /emissions corporate view aggregates Scope 1 and Scope 2 across all plants. Plants are ranked by total emissions and by carbon intensity per unit — identifying the highest-impact facilities and tracking year-over-year improvement trends.'),
                    ]
                },
                {
                    title: t('manual.sub.174', 'LIX.2 ESG Report Export'),
                    items: [
                        t('manual.item.1627', 'Monthly ESG Report: Generates a structured summary of Scope 1 and Scope 2 emissions for the selected month. Includes per-asset Scope 1 breakdown, total electricity-driven Scope 2 figure, and carbon intensity vs. production output.'),
                        t('manual.item.1628', 'Annual ESG Report: Full-year rollup with month-by-month trend, year-over-year comparison, and a corporate summary covering all facilities. Export formats: PDF (for board and regulatory submissions) and CSV (for ESG data platforms and auditors).'),
                        t('manual.item.1629', 'Access: Mission Control → Emissions & Carbon tile. Corporate view requires Manager-level access or above. Plant-level view is available to Engineers and Plant Managers.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s36.title', 'Part 35: Vendor / Supplier Performance Scorecard'),
            id: 'vendor-scorecard',
            navigateTo: '/vendor-scorecard',
            filePath: 'src/components/VendorScorecardView.jsx',
            icon: <Star size={22} />,
            content: t('manual.s36.content', 'Automatic vendor performance analytics built entirely on existing purchase order and parts data — no new data entry required. Ranks every supplier on delivery, quality, and lead time accuracy, with a corporate rollup identifying the worst performers by plant and by spend volume.'),
            subsections: [
                {
                    title: t('manual.sub.175', 'LX.1 Scorecard Metrics'),
                    items: [
                        t('manual.item.1630', 'On-Time Delivery Rate: Compares the PO due date to the actual receipt date in the Receiving Log. A receipt on or before the due date counts as on-time. Rate is expressed as a percentage over the selected period.'),
                        t('manual.item.1631', 'Quality Defect Rate: NCR (Non-Conformance Report) count attributed to vendor-supplied parts, expressed as a defect rate against total parts received from that vendor. High defect rate triggers a quality flag on the scorecard.'),
                        t('manual.item.1632', 'Lead Time Accuracy: Promised lead time (from the PO) vs. actual elapsed days from order to receipt. Chronic over-promising scores negatively regardless of whether the delivery was technically on time.'),
                        t('manual.item.1633', 'Spend Volume: Total dollar value of parts received from each vendor in the period. Used to weight rankings — a 60% OTD rate from a high-spend vendor is a higher priority concern than the same rate from a minor supplier.'),
                    ]
                },
                {
                    title: t('manual.sub.176', 'LX.2 Corporate Rollup'),
                    items: [
                        t('manual.item.1634', 'Worst Performers by Plant: Identifies which vendors are failing most severely at each facility. Plant managers can see at a glance which suppliers are causing the most disruption to their local operation.'),
                        t('manual.item.1635', 'Worst Performers by Spend: Enterprise-level view ranking vendors by performance weighted against total spend across all plants. Flags high-spend, low-performance suppliers for enterprise-level renegotiation or replacement.'),
                        t('manual.item.1636', 'Access: Mission Control → Vendor Scorecard tile. Available to Plant Managers, Maintenance Managers, and Corporate/Executive roles.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s37.title', 'Part 36: Asset Lifecycle & Capital Replacement Planning'),
            id: 'asset-lifecycle',
            navigateTo: '/assets',
            filePath: 'src/components/AssetLifecycleView.jsx',
            icon: <History size={22} />,
            content: t('manual.s37.content', 'Answers the repair-vs-replace question with data instead of gut feel. Tracks cumulative repair costs against replacement costs and Expected Useful Life to generate replacement recommendations, payback calculations, and a multi-year capital expenditure forecast.'),
            subsections: [
                {
                    title: t('manual.sub.177', 'LXI.1 Repair vs. Replace Analytics'),
                    items: [
                        t('manual.item.1637', "Expected Useful Life (EUL): Configured per asset class in Master Equipment. When an asset's age approaches or exceeds its EUL, it is flagged for replacement review regardless of current repair cost status."),
                        t('manual.item.1638', 'Cumulative Repair Cost: Automatically summed from all closed work orders linked to the asset. No manual entry — the system calculates this from the WO labor and parts history already in the system.'),
                        t('manual.item.1639', 'Replacement Recommendation Trigger: A recommendation is generated when cumulative repair cost exceeds the configured threshold (default: 60% of replacement cost), MTBF trend crosses the critical threshold, or the asset age exceeds EUL.'),
                        t('manual.item.1640', 'Payback Period Calculator: Compares the current annual repair spend rate against the annualized cost of replacement (replacement cost divided by expected new asset life). Displays the break-even point in months.'),
                    ]
                },
                {
                    title: t('manual.sub.178', 'LXI.2 Capital Expenditure Forecast'),
                    items: [
                        t('manual.item.1641', '1 / 3 / 5 Year Forecast: Projects all assets expected to hit replacement threshold within 1, 3, and 5 years. Allows capital budget planning cycles to be driven by asset condition data rather than annual guesswork.'),
                        t('manual.item.1642', 'Corporate Rollup: Total replacement liability by plant and by asset class across all facilities. Executives can see where capital concentration risk is highest across the enterprise.'),
                        t('manual.item.1643', 'Access: Mission Control → Capital Replacement tile. Available to Engineers, Plant Managers, and Corporate/Executive roles.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s38.title', 'Part 37: Spare Parts Inventory Optimization'),
            id: 'spare-parts-optimization',
            navigateTo: '/storeroom',
            filePath: 'src/components/StoreroomView.jsx',
            icon: <Database size={22} />,
            content: t('manual.s38.content', 'Stocking recommendations driven by MTBF data and vendor lead times. Works entirely from data already in the system — no new inputs required. Surfaces dead stock, critical spare gaps, and reorder recommendations in the Storeroom view.'),
            subsections: [
                {
                    title: t('manual.sub.179', 'LXII.1 Reorder Intelligence'),
                    items: [
                        t('manual.item.1644', 'Min/Max Reorder Calculation: Reorder point = (average daily usage × vendor lead time days) + safety stock factor. Updated automatically as usage patterns change over time. Displayed on each part record and surfaced in the reorder suggestion queue.'),
                        t('manual.item.1645', 'Critical Spare Flagging: Parts whose absence would cause a Severity 1 production stoppage can be designated as Critical Spares. Critical spare stockout risk is elevated in the alert queue and reported separately to plant and corporate management.'),
                        t('manual.item.1646', 'Reorder Suggestion Queue: Surfaces all parts currently below their calculated safety stock level, sorted by criticality. Plant buyers can action reorders directly from this list without searching through the full inventory.'),
                    ]
                },
                {
                    title: t('manual.sub.180', 'LXII.2 Dead Stock & Stockout Risk'),
                    items: [
                        t('manual.item.1647', 'Dead Stock Identification: Parts with zero work order consumption in the past 12 months are flagged as dead stock. Value of dead stock by plant is reported in the corporate storeroom rollup — a direct measure of capital tied up in unused parts.'),
                        t('manual.item.1648', 'Stockout Risk Alert: Real-time flag for any critical spare whose quantity on hand has fallen below the calculated safety stock threshold. Pushes into the plant alert queue so buyers are notified before a stockout occurs, not after.'),
                        t('manual.item.1649', 'ABC Classification: Parts are automatically classified as A (high-value, low-volume), B (medium), or C (low-value, high-volume). Classification is used to prioritize storeroom management attention and optimize physical storage layout.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s39.title', 'Part 38: Scan-to-Segment Work Order (Digital Twin Pin Entry)'),
            id: 'scan-to-segment',
            navigateTo: '/scan',
            filePath: 'src/components/ScanView.jsx',
            icon: <Scan size={22} />,
            content: t('manual.s39.content', 'For complex machines with multiple sub-components, scanning the top-level asset QR no longer forces labor and parts to the machine level. The Digital Twin schematic appears and the technician taps the specific segment that failed — work orders are created against the exact sub-component.'),
            subsections: [
                {
                    title: t('manual.sub.181', 'LXIII.1 Scan-to-Segment Flow'),
                    items: [
                        t('manual.item.1650', 'Step 1 — Scan the asset QR code. The system detects that this asset has a Digital Twin schematic with defined sub-component pins.'),
                        t('manual.item.1651', 'Step 2 — The Digital Twin schematic loads on screen. Each sub-component is shown as a pin (e.g., Blowmold, Filler, Conveyor). Tap the segment that failed.'),
                        t('manual.item.1652', "Step 3 — The pin's LinkedAssetID resolves the child asset. CommonFailureModes for that segment surface as one-tap job type options — no typing required."),
                        t('manual.item.1653', 'Step 4 — The work order is created against the child AssetID (the segment), not the parent machine. The AssetParts bill of materials for that segment auto-populates the parts list.'),
                    ]
                },
                {
                    title: t('manual.sub.182', 'LXIII.2 What Scan-to-Segment Unlocks'),
                    items: [
                        t('manual.item.1654', 'Labor and parts are attributed to the correct sub-component. Over time, this builds per-segment MTBF, failure frequency, and cost histories — something impossible when all work is logged against the top-level machine.'),
                        t('manual.item.1655', 'CommonFailureModes from MasterEquipment drive job type suggestions with one tap. This preserves the zero-keystroke contract even for complex multi-segment machines.'),
                        t('manual.item.1656', 'Prerequisites: Digital Twin schematics must be loaded for the asset with pins placed on sub-components and LinkedAssetIDs set. No schema changes are required — digital_twin_pins.LinkedAssetID and the asset hierarchy cover it.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s40.title', 'Part 39: Shift Handover / Digital Turnover Log'),
            id: 'shift-handover',
            navigateTo: '/shift-handover',
            filePath: 'src/components/ShiftHandoverView.jsx',
            icon: <ClipboardList size={22} />,
            content: t('manual.s40.content', "A formal digital shift-to-shift transfer record. The outgoing shift documents completed work, open work orders, failures, and safety concerns. The incoming shift acknowledges before taking over — replacing the 'outgoing shift didn't tell us' incident root cause with a timestamped, signed record."),
            subsections: [
                {
                    title: t('manual.sub.183', 'LXIV.1 Creating a Turnover Log'),
                    items: [
                        t('manual.item.1657', 'At shift end, the outgoing supervisor or lead tech opens the Shift Handover module and creates a new turnover entry. The system pre-populates the date, shift, plant, and supervisor from the session context.'),
                        t('manual.item.1658', 'The log entry captures: completed work orders (linked directly from WO records), open work orders still in progress, equipment that broke during the shift, any active holds or lockouts, safety flags or near-misses, and a freetext notes field.'),
                        t('manual.item.1659', 'Active holds, safety flags, and open critical WOs are highlighted so the incoming shift cannot miss them. The log is read-only once submitted — no retroactive edits.'),
                    ]
                },
                {
                    title: t('manual.sub.184', 'LXIV.2 Acknowledgment & Chain of Custody'),
                    items: [
                        t('manual.item.1660', 'The incoming shift supervisor opens the pending turnover log, reviews all flagged items, and clicks Acknowledge. This creates a digital signature record — name, timestamp, shift — permanently attached to the log.'),
                        t('manual.item.1661', 'Until acknowledged, the incoming shift has an unresolved item in their Mission Control review queue. They cannot dismiss it — they must read and sign the log.'),
                        t('manual.item.1662', 'All turnover logs feed into the incident investigation chain. If a failure occurs in the first hours of a new shift, investigators can pull the turnover log to see exactly what the incoming shift was told at handover time.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s41.title', 'Part 40: SOP Re-Acknowledgment on MOC Change'),
            id: 'sop-reack',
            navigateTo: '/sop',
            filePath: 'src/components/SOPView.jsx',
            icon: <BookOpen size={22} />,
            content: t('manual.s41.content', 'Closes the gap between the Management of Change system and field execution. When an approved MOC changes a procedure, all linked SOPs are automatically flagged for re-acknowledgment — technicians must read and sign the updated version before their next job assignment.'),
            subsections: [
                {
                    title: t('manual.sub.185', 'LXV.1 How SOP Re-Acknowledgment Works'),
                    items: [
                        t('manual.item.1663', 'On MOC Close: When a Management of Change record is closed with an Approved status, the system scans all SOPs linked to that MOC. Each linked SOP is flagged as requiring re-acknowledgment — a new version stamp is attached.'),
                        t('manual.item.1664', 'WO Assignment Gate: When a work order is being assigned to a technician, the system checks whether that technician has any outstanding SOP re-acknowledgments for the procedures linked to that WO. Behavior is configurable: Warn (proceed with alert) or Hard-Block (assignment fails until acknowledged).'),
                        t('manual.item.1665', 'Acknowledgment Record: When the technician reads the updated SOP and clicks Acknowledge, a record is created linking: technician name, SOP version acknowledged, timestamp, and the originating MOC number.'),
                        t('manual.item.1666', 'Compliance Scorecard: Outstanding re-acknowledgments appear in the Training & Competency compliance scorecard. Plant managers can see which technicians are behind on acknowledgments and which SOPs have the highest outstanding counts.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s42.title', 'Part 41: Industry Vertical Catalog Packs'),
            id: 'industry-catalogs',
            navigateTo: '/master-catalog',
            filePath: 'src/components/MasterCatalogView.jsx',
            icon: <List size={22} />,
            content: t('manual.s42.content', 'Trier OS ships with pre-built master data catalogs for six industrial verticals beyond the core dairy/food manufacturing catalog. Each vertical includes equipment types, common failure modes, parts, and cross-references to the shared core catalog — eliminating the blank-slate setup problem for new plant deployments.'),
            subsections: [
                {
                    title: t('manual.sub.186', 'LXVI.1 Available Industry Catalogs'),
                    items: [
                        t('manual.item.1667', 'Manufacturing & Automotive: Robotic arm components, end-effectors, servo drives, CNC tooling, mold sets, press dies, fixturing, and assembly line conveyor components. CommonFailureModes seeded per equipment class.'),
                        t('manual.item.1668', 'Mining & Extraction: Drill bits, rock bolts, shotcrete equipment, conveyor belt components, idlers, pulleys, haul truck drivetrain and hydraulic components, ventilation fans, and refuge chambers. GIS-linked asset locations tie to the 3D mapping module.'),
                        t('manual.item.1669', 'Energy Plants: Turbine blades, seals, bearings, switchgear, breakers, transformer components, instrumentation (pressure transmitters, RTDs, flow meters), and cooling tower components.'),
                        t('manual.item.1670', 'Logistics & Ports: Crane wire rope, sheaves, spreaders, RTG and reach stacker components, forklift mast and hydraulic components, dock levelers, seals, and restraints.'),
                        t('manual.item.1671', 'Agro-Industry: Harvester blades, threshing components, grain augers, irrigation pumps, pivot components, food-grade seals, sanitary fittings, CIP components, and cold storage refrigeration components.'),
                        t('manual.item.1672', 'Water & Wastewater: Pumps, impellers, mechanical seals, clarifier mechanisms, membrane filtration elements, chemical dosing systems, blower components, and SCADA instrument components. Heavily regulated (EPA, state DEQ) — catalog is designed for PTW and LOTO-compliant workflows.'),
                    ]
                },
                {
                    title: t('manual.sub.187', 'LXVI.2 Cross-Catalog Reference Engine'),
                    items: [
                        t('manual.item.1673', 'OEM Cross-Reference: Maps manufacturer part numbers to the master SKU. When a technician searches for a part by OEM number, the system returns the master record plus all equivalent aftermarket options.'),
                        t('manual.item.1674', 'Industry-to-Core Mapping: Every vertical catalog entry links to its shared core catalog equivalent. Corporate spend rollups use the core SKU regardless of which vertical the part was ordered through — enabling true enterprise spend analysis across all facilities and verticals.'),
                        t('manual.item.1675', "Search Coverage: A single parts search returns results from the plant's own vertical catalog, the shared core catalog, and cross-reference matches simultaneously. Technicians never need to know which catalog a part lives in."),
                    ]
                },
            ]
        },
        {
            section: t('manual.s43.title', 'Part 42: REST API Public Specification (OpenAPI 3.1)'),
            id: 'rest-api',
            navigateTo: '/api-docs',
            filePath: 'server/routes/',
            icon: <Key size={22} />,
            content: t('manual.s43.content', 'A machine-readable OpenAPI 3.1 specification covering all Trier OS API route modules. Available at /api-docs as a live interactive endpoint. Enables hardware vendors and third-party integrators to build certified connectors without requiring source code access.'),
            subsections: [
                {
                    title: t('manual.sub.188', 'LXVII.1 Using the API'),
                    items: [
                        t('manual.item.1676', 'Authentication: All API calls require a Bearer token in the Authorization header. Tokens are issued via POST /api/auth/login, or via API keys created in the Admin Console → Import & API Hub.'),
                        t('manual.item.1677', 'Plant Context: All plant-scoped endpoints require the x-plant-id request header. Set this to the plant ID of the facility you are querying (e.g., Plant_1). Corporate-scope endpoints accept all_sites.'),
                        t('manual.item.1678', 'Rate Limiting: The API enforces per-key rate limits configurable in Admin Console. API key usage is tracked in the UsageMeter — metered calls are logged per key and available in the SaaS Admin panel for billing export.'),
                        t('manual.item.1679', 'Interactive Docs: Navigate to /api-docs on any running Trier OS instance to browse all endpoints, view request/response schemas, and execute test calls directly from the browser.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s44.title', 'Part 43: Digital Twin Platform Integration'),
            id: 'digital-twin-integration',
            navigateTo: '/digital-twin',
            filePath: 'src/components/DigitalTwinView.jsx',
            icon: <Cloud size={22} />,
            content: t('manual.s44.content', 'Two-way synchronization between the Trier OS asset registry and external digital twin platforms including Bentley iTwin, Siemens NX, and PTC ThingWorx. Push asset data outbound to maintain a live digital replica in the external platform; pull spatial data inbound to enrich Trier OS asset records.'),
            subsections: [
                {
                    title: t('manual.sub.189', 'LXVIII.1 Sync Configuration'),
                    items: [
                        t('manual.item.1680', 'Access: Mission Control → IT Group → Digital Twin Integration tile. Requires IT Admin or Creator role.'),
                        t('manual.item.1681', 'Add a Platform Connection: Select the platform type, enter the API endpoint URL, and provide credentials or API key. Test the connection before enabling live sync.'),
                        t('manual.item.1682', 'Outbound Push (Trier → External): Asset registry changes are pushed to the configured external platform on a scheduled interval or on-demand via the Sync Now button.'),
                        t('manual.item.1683', 'Inbound Pull (External → Trier): Spatial positioning data, 3D model references, and structural relationships are pulled from the external platform and linked to asset records, enriching the Digital Twin schematics visible in the scan flow.'),
                        t('manual.item.1684', 'Sync History: Every sync operation is logged — platform, direction, record count, and any errors. The Sync History tab shows the last 30 operations with status indicators.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s45.title', 'Part 44: SaaS & Ecosystem Administration'),
            id: 'saas-admin',
            navigateTo: '/saas',
            filePath: 'src/components/SaaSAdminView.jsx',
            icon: <Globe size={22} />,
            content: t('manual.s45.content', 'Platform administration for ecosystem builders who wrap Trier OS in a managed offering. Provides usage metering, API key plant-scoping, white-label instance configuration, and billing data export. Access restricted to Creator and IT Admin roles.'),
            subsections: [
                {
                    title: t('manual.sub.190', 'LXIX.1 Usage Metering'),
                    items: [
                        t('manual.item.1685', 'Four KPI metrics tracked daily: API Calls (delta of total request count since previous snapshot), Active Users (distinct users with audit log entries in the period), Storage (total size of all database and upload files), and Seat Count (total licensed user accounts).'),
                        t('manual.item.1686', 'Historical snapshots are recorded automatically at midnight UTC and on demand via the Snapshot Now button. History is displayed as a pivoted table — one row per day, one column per metric.'),
                        t('manual.item.1687', 'Billing Export: Select a date range and download a CSV file containing all metered usage records in a format billing systems can consume. Use for monthly invoicing, usage reconciliation, or SLA reporting.'),
                    ]
                },
                {
                    title: t('manual.sub.191', 'LXIX.2 API Key Management & Instance Configuration'),
                    items: [
                        t('manual.item.1688', 'API Key Scoping: Each API key can be restricted to a specific set of plant IDs. A scoped key returns 403 for any request outside its allowed list. Leave scope blank to grant global access (default).'),
                        t('manual.item.1689', "White-Label Configuration: Set a custom instance name, primary and secondary brand colors (hex, via native color picker), support email, and support URL. Toggle the 'Powered by Trier OS' branding on or off. Changes take effect immediately."),
                        t('manual.item.1690', "All configuration changes are written to the AuditLog with the administrator's username, timestamp, and changed values — providing a full history of branding and access policy changes."),
                    ]
                },
            ]
        },
        {
            section: t('manual.s46.title', 'Part 45: Operator Trust Layer — Human-in-the-Loop Recommendations'),
            id: 'operator-trust',
            navigateTo: '/operator-trust',
            filePath: 'src/components/OperatorTrustView.jsx',
            icon: <Users size={22} />,
            content: t('manual.s46.content', 'Every system-generated recommendation surfaces with a confidence level, a plain-language explanation, and a record of past outcomes for similar recommendations. Operators approve, reject, or annotate every decision — and every outcome feeds back into the recommendation engine.'),
            subsections: [
                {
                    title: t('manual.sub.192', 'LXX.1 Reviewing Recommendations'),
                    items: [
                        t('manual.item.1691', 'Access: Mission Control → Operator Trust tile. Available to Technicians, Engineers, Plant Managers, and Corporate roles — anyone who acts on system recommendations.'),
                        t('manual.item.1692', 'Each recommendation card shows: the recommended action, the confidence score (0–100%), the data signals driving the recommendation, the number of times similar recommendations were previously approved or rejected, and the historical outcome rate.'),
                        t('manual.item.1693', 'Approve: The operator agrees and proceeds. The approval is logged against the recommendation ID and the outcome is tracked when the linked work order is eventually closed.'),
                        t('manual.item.1694', 'Reject: The operator disagrees. They must select a rejection reason (Wrong Asset, Wrong Failure Mode, Not Actionable Now, or Other). Rejection data trains the recommendation engine over time.'),
                        t('manual.item.1695', 'Annotate: The operator adds a freetext note to the recommendation — capturing domain knowledge the system cannot infer from data alone. Annotations are visible to future operators reviewing the same asset.'),
                    ]
                },
                {
                    title: t('manual.sub.193', 'LXX.2 Feedback Loop'),
                    items: [
                        t('manual.item.1696', 'Outcome Tracking: When a work order linked to an approved recommendation is closed, the system records whether the recommended action resolved the issue. This outcome updates the recommendation model.'),
                        t('manual.item.1697', "Trust Score: Each recommendation type accumulates a trust score based on historical accuracy. High-trust recommendations show a green confidence badge; low-trust recommendations show amber with an explicit 'verify before acting' notice."),
                    ]
                },
            ]
        },
        {
            section: t('manual.s47.title', 'Part 46: Deterministic Time Machine — Plant State Rollback & Branching Simulation'),
            id: 'time-machine',
            navigateTo: '/time-machine',
            filePath: 'src/components/TimeMachineView.jsx',
            icon: <Clock size={22} />,
            content: t('manual.s47.content', "Not just event replay — controlled rewind to any point T-X, decision modification, and deterministic forward simulation from that branch. Answers: 'What if we hadn't made that change at 14:32?' Requires Creator or IT Admin role."),
            subsections: [
                {
                    title: t('manual.sub.194', 'LXXI.1 Event Log & State Snapshots'),
                    items: [
                        t('manual.item.1698', "Every database change is captured by SQLite AFTER triggers that fire atomically within the same transaction as the originating write. Events — INSERT, UPDATE, DELETE — are stored in the plant's EventLog table with sub-second timestamps, the affected table, aggregate type, and full before/after payload."),
                        t('manual.item.1699', 'State Snapshots are consistent point-in-time copies of the plant database, created automatically on every HA replication cycle. Each snapshot record includes the event watermark (highest EventID at snapshot time), the file hash, and the file size.'),
                        t('manual.item.1700', 'The Timeline tab shows all state snapshots for the selected plant, sorted chronologically. Click any snapshot to see the events that occurred after it — the gap that would be replayed if you branch from that point.'),
                    ]
                },
                {
                    title: t('manual.sub.195', 'LXXI.2 Navigating the Timeline'),
                    items: [
                        t('manual.item.1701', 'Event Feed: The Events tab displays every logged event in descending order. Each event shows the table name, event type (INSERT / UPDATE / DELETE), the record identifier, and the exact timestamp. Click any event to expand its before/after payload diff — changed fields are highlighted in amber.'),
                        t('manual.item.1702', 'Seek to Point: Use the Seek control to navigate to a specific timestamp. The system returns the exact state of the plant database at that moment — which snapshot to restore from and which events to replay on top of it to reach the requested time.'),
                    ]
                },
                {
                    title: t('manual.sub.196', 'LXXI.3 Creating and Using Branches'),
                    items: [
                        t('manual.item.1703', 'Branch From Before This Event: Click the branch icon on any event. The system creates an isolated branch database by restoring the nearest prior snapshot, replaying all events up to (but not including) the selected event, and registering the branch in memory.'),
                        t('manual.item.1704', 'Branch Query: Once a branch is created, query its state against live plant APIs using the branch ID. This lets you compare what the plant looked like before a critical decision vs. after — without touching the live production database.'),
                        t('manual.item.1705', 'Active Branches tab shows all currently open branches with creation timestamp, the event they diverged from, and record counts vs. the live database. Branches are held in process memory and cleared on server restart.'),
                        t('manual.item.1706', 'Primary use case: Post-incident investigation. After an unplanned failure, navigate to the moment before the failure event, branch from that point, and query the branch to understand what the system state was before the problem occurred.'),
                    ]
                },
                {
                    title: t('manual.sub.207', 'LXXI.4 Parallel Universe Engine — Pre-Deploy Verification'),
                    items: [
                        t('manual.item.1754', 'The Parallel Universe Engine extends the Time Machine from post-incident investigation to pre-deployment verification. Before any code change is deployed via Live Studio, the engine replays the last N events through both the current codebase and the proposed change simultaneously, comparing outcomes.'),
                        t('manual.item.1755', 'Purpose: If the proposed code change would have produced a different result on any historical event, the engine flags the divergence. This prevents regressions invisible to unit tests but visible in real operational data.'),
                        t('manual.item.1756', 'Difference from Time Machine: Time Machine = post-incident investigation (what happened). Parallel Universe Engine = pre-deploy verification (what would have happened differently). Both share the same event log and snapshot infrastructure.'),
                        t('manual.item.1757', 'Access: Available in Live Studio (Creator role only). Run from the Deploy tab before confirming a production deployment.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s48.title', 'Part 47: Safe Action Certification Layer — Pre-Execution Proof'),
            id: 'safe-action-certification',
            navigateTo: '/gatekeeper',
            filePath: 'src/components/GatekeeperView.jsx',
            icon: <Shield size={22} />,
            content: t('manual.s48.content', 'Before any write action executes through the Gatekeeper service, Trier OS proves via simulation that the action will not violate defined safety and operational constraints. Returns: certified safe (proceed) or unsafe (blocked with full causal explanation). Certified actions receive a proof receipt stored in the audit log.'),
            subsections: [
                {
                    title: t('manual.sub.197', 'LXXII.1 How Certification Works'),
                    items: [
                        t('manual.item.1707', "Every write action submitted through Gatekeeper is evaluated against the plant's constraint set before execution. Constraints include: active PTW permit requirements, MOC approval status, RBAC role permissions, system state (Normal / Advisory-Only / Isolated), and asset-specific safety flags."),
                        t('manual.item.1708', 'Certified Safe: If all constraints pass, a proof receipt is generated containing the action ID, the certifying constraint set version, the timestamp, and the operator credentials. The receipt is written to the immutable audit log before the action executes.'),
                        t('manual.item.1709', 'Unsafe — Blocked: If any constraint fails, the action is blocked immediately. The operator receives a full causal explanation: which constraint failed, why it failed, and what change would be required to make the action certifiable.'),
                        t('manual.item.1710', 'The certification layer cannot be bypassed by application code. It is enforced at the Gatekeeper service boundary — a separate runtime from the main Trier OS process. No route handler, no admin shortcut, and no API key can skip the pre-execution check.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s49.title', 'Part 48: Distributed Edge Execution Mesh (Trier Network Mesh)'),
            id: 'edge-mesh',
            navigateTo: '/edge-mesh',
            filePath: 'src/components/EdgeMeshView.jsx',
            icon: <Server size={22} />,
            content: t('manual.s49.content', 'A peer-to-peer execution mesh that uses secure relay nodes to distribute and cache large artifacts — 3D Digital Twin models, large manual PDFs, firmware packages — across the plant floor. Devices serve artifacts to each other locally, eliminating network choke points and ensuring offline resilience.'),
            subsections: [
                {
                    title: t('manual.sub.198', 'LXXIII.1 How the Mesh Works'),
                    items: [
                        t('manual.item.1711', 'Relay Nodes: Designated edge devices on the plant LAN are registered as relay nodes in the mesh registry. Each node stores a local artifact cache. When a device requests an artifact, the mesh locates the nearest node that has it cached and serves it from there.'),
                        t('manual.item.1712', 'Artifact Types: Any file registered in the Artifact Registry can be distributed via the mesh: 3D Digital Twin models, equipment manuals (PDF), firmware packages, and SOP attachments. Artifacts are indexed by content hash — duplicate files are stored once.'),
                        t('manual.item.1713', 'Cache Propagation: When a new artifact version is published, the mesh propagates the update to all registered nodes on the next sync cycle. Stale versions are automatically evicted based on a configurable TTL.'),
                        t('manual.item.1714', 'Offline Resilience: Relay nodes continue serving cached artifacts even when the central server is unreachable. Technicians accessing Digital Twin schematics on the plant floor experience no disruption during a central server outage.'),
                    ]
                },
                {
                    title: t('manual.sub.199', 'LXXIII.2 Fleet Sync Status'),
                    items: [
                        t('manual.item.1715', 'Access: Mission Control → IT Group → Edge Mesh tile. Requires IT Admin or Creator role.'),
                        t('manual.item.1716', 'Registry: The Artifact Registry tab shows all artifacts managed by the mesh — name, version, size, content hash, and which nodes have it cached. Use the Publish button to add a new artifact or upload a new version.'),
                        t('manual.item.1717', 'Sync Status: The Sync Status tab shows every registered relay node — hostname, IP address, last heartbeat, cache hit rate, and sync lag. Nodes that have not sent a heartbeat in the configured interval are flagged as offline.'),
                        t('manual.item.1718', 'Cache Hit Rate: The ratio of artifact requests served by a node from its local cache vs. requests requiring a central server fetch. A high hit rate means the mesh is working effectively; a low rate signals that the cache is undersized or artifacts are not being pre-positioned correctly.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s28.title', 'Part 51: Licensing, Support & Renewals'),
            id: 'licensing-support',
            navigateTo: '/settings',
            filePath: 'src/components/SettingsView.jsx',
            icon: <Key size={22} />,
            content: t('manual.s28.content', 'Trier OS uses a hardware-locked license system. Each installation is tied to the machine it runs on and may be time-limited or perpetual.'),
            subsections: [
                {
                    title: t('manual.sub.131', '25.1 License Types'),
                    items: [
                        t('manual.item.1380', '15-Day Trial — Short evaluation period for initial demonstrations.'),
                        t('manual.item.1381', '30-Day Trial — Standard evaluation period for pilot programs.'),
                        t('manual.item.1382', '60-Day Evaluation — Extended evaluation for comprehensive testing.'),
                        t('manual.item.1383', '1-Year Subscription — Annual license, renewable each year.'),
                        t('manual.item.1384', '5-Year Enterprise — Multi-year commitment at a discounted rate.'),
                        'Perpetual License — One-time purchase, no expiration.'
                    ]
                },
                {
                    title: t('manual.sub.132', '25.2 First-Time Activation'),
                    items: [
                        t('manual.item.1385', '1. Start the Trier OS server on your machine.'),
                        t('manual.item.1386', '2. Open your browser — you will see the License Activation page.'),
                        t('manual.item.1387', '3. Your unique Machine ID is displayed on screen (e.g., TRIER-4A7F-B12C-9D3E).'),
                        t('manual.item.1388', '4. Click the Machine ID to copy it to your clipboard.'),
                        t('manual.item.1389', '5. Send the Machine ID to your Trier OS administrator (see Support Contact below).'),
                        t('manual.item.1390', '6. You will receive a License Key — paste it into the activation field and click Activate.'),
                        '7. The application will unlock and you can proceed to log in.'
                    ]
                },
                {
                    title: t('manual.sub.133', '25.3 License Renewal'),
                    items: [
                        t('manual.item.1391', 'When your license expires, the server will display a License Expired page.'),
                        t('manual.item.1392', 'Your Machine ID is shown on the expired page — copy it and contact support for a renewal key.'),
                        t('manual.item.1393', 'Renewal keys are generated instantly — typical turnaround is within 24 hours.'),
                        t('manual.item.1394', 'Paste the new key on the renewal page to reactivate immediately.'),
                        t('manual.item.1395', 'All your data, settings, and work orders are preserved — nothing is lost when a license expires.'),
                        'The application simply pauses access until a new key is entered.'
                    ]
                },
                {
                    title: t('manual.sub.134', '25.4 Important Notes'),
                    items: [
                        t('manual.item.1396', 'License keys are unique to each machine — they cannot be transferred to a different computer.'),
                        t('manual.item.1397', 'If you replace your server hardware, contact support for a new key at no additional charge.'),
                        t('manual.item.1398', 'The license file is stored locally and does not require internet connectivity to validate.'),
                        t('manual.item.1399', 'Do not edit the license.key file manually — the key is cryptographically signed and will be invalidated.'),
                        'Your license status can be checked at any time via Settings → About.'
                    ]
                },
                {
                    title: t('manual.sub.135', '25.5 Support Contact'),
                    items: [
                        t('manual.item.1400', 'For license activation, renewals, technical support, or sales inquiries:'),
                        t('manual.item.1401', ' Email: github.com/DougTrier/trier-os/discussions'),
                        t('manual.item.1402', ' Trier OS — Industrial Maintenance Management Solutions'),
                        t('manual.item.1403', '⏱️ Typical response time: Within 24 hours on business days.'),
                        t('manual.item.1404', 'When contacting support, please include:'),
                        t('manual.item.1405', '  • Your Machine ID (shown on the activation or expired page)'),
                        t('manual.item.1406', '  • Your plant/facility name'),
                        '  • A brief description of your issue or request'
                    ]
                }
            ]
        },
        {
            section: t('manual.s50.title', 'Part 49: Audit & History'),
            id: 'audit-history',
            navigateTo: '/history',
            filePath: 'src/components/HistoryDashboard.jsx',
            icon: <History size={22} />,
            content: t('manual.s50.content', 'Unified view of all historical operational data across the platform. Work order history, completed PM records, scan audit trail, asset utilization trends, and a dynamic report builder are all accessible from Mission Control → Audit & History.'),
            subsections: [
                {
                    title: t('manual.sub.200', '50.1 Work Order History'),
                    items: [
                        t('manual.item.1719', 'Access: Mission Control → Audit & History tile. Available to Manager, Plant Manager, Maintenance Manager, IT Admin, and Creator roles.'),
                        t('manual.item.1720', 'Work Order History tab shows all closed and auto-closed work orders across the selected plant. Columns: WO number, asset, job type, technician, opened date, closed date, labor hours, and parts cost.'),
                        t('manual.item.1721', 'Filter by date range, asset, technician, or job type. Export to CSV for external analysis or compliance records.'),
                        t('manual.item.1722', 'Click any row to open the full work order detail: steps completed, parts used, technician notes, and the full audit trail of every status change.'),
                    ]
                },
                {
                    title: t('manual.sub.201', '50.2 PM (Preventive Maintenance) History'),
                    items: [
                        t('manual.item.1723', 'PM History tab shows all completed PM cycles — the asset, the scheduled interval, the actual completion date, the technician who completed it, and whether it was completed on time or overdue.'),
                        t('manual.item.1724', 'On-time vs. overdue rate is calculated per asset and per plant. This feeds the PM compliance score shown on the corporate dashboard.'),
                        t('manual.item.1725', 'PM history is the source of truth for MTBF calculations. Each PM completion resets the failure interval clock for that asset.'),
                    ]
                },
                {
                    title: t('manual.sub.202', '50.3 Scan Audit Log'),
                    items: [
                        t('manual.item.1726', 'The Audit Log tab shows every scan event recorded by the system — asset scanned, technician, device, timestamp, and the resulting action (WO opened, WO closed, part issued, PM acknowledged, etc.).'),
                        t('manual.item.1727', 'Scan events are idempotent — duplicate scans within the dedup window are recorded once with a count. This prevents phantom work orders from multi-scan events.'),
                        t('manual.item.1728', 'Offline scan events (recorded on the LAN Hub while disconnected) are marked with their device timestamp and the server sync timestamp. Both are visible in the audit log.'),
                        t('manual.item.1729', 'The audit log is cross-plant — accessible from the corporate dashboard with plant filter. Every entry is write-once; no record can be modified or deleted after creation.'),
                    ]
                },
                {
                    title: t('manual.sub.203', '50.4 Dynamic Report Builder'),
                    items: [
                        t('manual.item.1730', 'The Reports tab provides a drag-and-drop report builder. Select data source (Work Orders, PMs, Parts, Assets, or Audit Log), choose columns, apply filters, and set date range.'),
                        t('manual.item.1731', 'Reports can be saved as named templates and re-run at any time. Saved reports are visible to all users with access to the Audit & History module.'),
                        t('manual.item.1732', 'Export formats: CSV (for Excel/BI tools), printable PDF (via the PrintEngine), and on-screen pivot table view.'),
                        t('manual.item.1733', 'Scheduled reports are not currently supported — run reports on demand or export and schedule delivery externally.'),
                    ]
                },
            ]
        },
        {
            section: t('manual.s51.title', 'Part 50: Architectural Correctness & Invariant System'),
            id: 'invariants',
            navigateTo: '/api/invariants/report',
            filePath: 'server/routes/invariants.js',
            adminOnly: true,
            icon: <Shield size={22} />,
            content: t('manual.s51.content', 'Trier OS maintains 13 formally verified architectural invariants — runtime-enforced correctness guarantees that prevent the system from entering an invalid state. Every invariant is monitored continuously and verified via GET /api/invariants/report, which returns a machine-readable proof of system health.'),
            subsections: [
                {
                    title: t('manual.sub.204', '51.1 What Are Invariants?'),
                    items: [
                        t('manual.item.1735', 'An invariant is a condition that must always be true. If it is ever violated, the system has entered an incorrect state. Trier OS enforces 13 invariants at the database and application layer — not as assertions that can be bypassed, but as UNIQUE constraints, transactional guards, and idempotency checks built into every write path.'),
                        t('manual.item.1736', 'Runtime Proof: GET /api/invariants/report returns a JSON document listing all 13 invariants with their current status (PASS or FAIL), the assertion type (database constraint, idempotency guard, state machine enforcement, etc.), and the last evidence timestamp.'),
                        t('manual.item.1737', 'Current Status: All 13 invariants return overallStatus: PASS as of v3.6.1. This is verified as part of every pre-release checklist.'),
                    ]
                },
                {
                    title: t('manual.sub.205', '51.2 The 13 Invariants'),
                    items: [
                        t('manual.item.1738', 'I-01: Parts returned to stock cannot exceed the quantity originally issued on a work order. Enforced inside a DB IMMEDIATE transaction.'),
                        t('manual.item.1739', 'I-02: A work order cannot be closed while it has unreturned parts with returnable quantity > 0. Blocked at the close endpoint.'),
                        t('manual.item.1740', 'I-03: Offline scan events replay in device-timestamp order. Sorted before replay to prevent out-of-sequence state transitions.'),
                        t('manual.item.1741', 'I-04: Duplicate scan events within the dedup window are recorded exactly once. Enforced by UNIQUE INDEX on ScanAuditLog.'),
                        t('manual.item.1742', 'I-05: A scanner device owns exactly one active scan session at a time. ScanCapture claims ownership flag on mount; released on unmount.'),
                        t('manual.item.1743', 'I-06: Work order status transitions follow the defined state machine (IDLE → ACTIVE → WAITING → CLOSED/AUTO_CLOSED). No skip transitions permitted.'),
                        t('manual.item.1744', 'I-07: Every audit log write is atomic with the triggering operation. Partial writes (operation succeeds, audit fails) are impossible.'),
                        t('manual.item.1745', 'I-08: Plant database access is always scoped to the authenticated user\'s plant via AsyncLocalStorage. Cross-plant data leakage is structurally impossible.'),
                        t('manual.item.1746', 'I-09: Receiving events are idempotent — replaying the same receiving event does not double-count inventory. Enforced by UNIQUE INDEX.'),
                        t('manual.item.1747', 'I-10: A PM can be acknowledged by exactly one technician (first-claim ownership). Enforced by UNIQUE constraint on the acknowledgment record.'),
                        t('manual.item.1748', 'I-11: A work order cannot be silently closed when issued parts have returnable quantity. Generates a needsReview flag instead.'),
                        t('manual.item.1749', 'I-12: Batch endpoint HTTP 200 is a transport ACK only. Per-item status must be checked. Documented and enforced in all batch consumers.'),
                        t('manual.item.1750', 'I-13: Artifact source field is always labeled in /artifacts/for/:entityId response. No unlabeled artifact references permitted.'),
                    ]
                },
                {
                    title: t('manual.sub.206', '51.3 Accessing the Invariant Report'),
                    items: [
                        t('manual.item.1751', 'Endpoint: GET /api/invariants/report — requires IT Admin or Creator role. Returns JSON with overallStatus, per-invariant status, assertion type, severity, and last evidence timestamp.'),
                        t('manual.item.1752', 'The report is also run automatically as part of the pre-release checklist before every version build. A build is not released unless overallStatus: PASS.'),
                        t('manual.item.1753', 'Invariant violations generate entries in the InvariantLog table, which is accessible via the Governance & Security panel in Mission Control for IT Admin and Creator roles.'),
                    ]
                },
            ]
        },
    ];


    // Multi-keyword search: split on commas, trim each term, match ANY term
    const parseSearchTerms = (query) => {
        if (!query) return [];
        return query.split(',').map(tag => tag.trim().toLowerCase()).filter(t => t.length > 0);
    };

    const textMatchesAny = (text, terms) => {
        const lower = text.toLowerCase();
        return terms.some(t => lower.includes(t));
    };

    const isMatch = (item, query) => {
        const terms = parseSearchTerms(query);
        if (terms.length === 0) return true;
        if (textMatchesAny(item.section, terms)) return true;
        if (textMatchesAny(item.content, terms)) return true;
        if (item.subsections && item.subsections.some(s =>
            textMatchesAny(s.title, terms) ||
            (s.items?.some(i => textMatchesAny(i, terms))) ||
            (s.tcoItems?.some(i => textMatchesAny(i.label, terms) || textMatchesAny(i.value, terms)))
        )) return true;
        if (item.scenarios && item.scenarios.some(sc =>
            textMatchesAny(sc.name, terms) ||
            textMatchesAny(sc.description, terms) ||
            sc.steps.some(st => textMatchesAny(st, terms))
        )) return true;
        return false;
    };

    // Filter subsections/scenarios to only matching ones (unless section title itself matches)
    const getFilteredSection = (item, query) => {
        const terms = parseSearchTerms(query);
        if (terms.length === 0) return item;
        if (textMatchesAny(item.section, terms) || textMatchesAny(item.content, terms)) return item;
        const filtered = { ...item };
        if (item.subsections) {
            filtered.subsections = item.subsections.filter(s =>
                textMatchesAny(s.title, terms) ||
                (s.items?.some(i => textMatchesAny(i, terms))) ||
                (s.tcoItems?.some(i => textMatchesAny(i.label, terms) || textMatchesAny(i.value, terms)))
            );
        }
        if (item.scenarios) {
            filtered.scenarios = item.scenarios.filter(sc =>
                textMatchesAny(sc.name, terms) ||
                textMatchesAny(sc.description, terms) ||
                sc.steps.some(st => textMatchesAny(st, terms))
            );
        }
        return filtered;
    };

    const filteredManual = React.useMemo(() => {
        return enterpriseManual
            .filter(item => !debouncedQuery || isMatch(item, debouncedQuery))
            .map(item => getFilteredSection(item, debouncedQuery));
    }, [debouncedQuery, t]);

    if (viewingManual) {
        return (
            <>
            <div className="glass-card" style={{ padding: '0', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {/* Fixed Header with solid background to prevent rolling text overlap */}
                <div style={{ padding: '25px', background: '#0f172a', borderBottom: '1px solid var(--glass-border)', zIndex: 100 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <img src="/assets/TrierLogo.png" alt="Trier OS" style={{ height: '48px', borderRadius: '8px' }} />
                            <div>
                                <h1 style={{ fontSize: '1.6rem', margin: 0 }}>{t('about.manualTitle', 'Trier OS — Operational Intelligence Manual')}</h1>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>{t('about.manualSubtitle', 'Built on 33 Years of Operational Knowledge • Version 3.6.1')}</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {_isAdminOrCreator && (
                                <button
                                    onClick={() => window.dispatchEvent(new CustomEvent('open-studio', { detail: { file: 'src/components/AboutView.jsx' } }))}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '8px 18px', fontSize: '0.8rem', fontWeight: 600,
                                        background: 'rgba(99, 102, 241, 0.12)',
                                        border: '1px solid rgba(99, 102, 241, 0.3)',
                                        color: '#818cf8', borderRadius: '10px', cursor: 'pointer'
                                    }}
                                    title="Open AboutView.jsx in Live Studio"
                                >
                                    {'</>'} {t('about.goToCode', 'Go to Code')}
                                </button>
                            )}
                            <button onClick={() => window.triggerTrierPrint('manual', { sections: filteredManual, searchQuery: searchQuery || '' })} className="btn-save" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={t('about.printTheEntireOperationsManualTip')}>
                                <Printer size={18} /> {t('about.printRecord')}
                            </button>
                            <button onClick={() => setViewingManual(false)} className="btn-primary" title={t('about.exitTheOperationsManualAndTip')}>
                                {t('about.exitManual')}
                            </button>
                            <button onClick={() => navigate('/')} className="btn-secondary" style={{ padding: '8px 16px' }} title={t('about.closeAndReturnToTheTip')}>
                                {t('about.close')}
                            </button>
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px 20px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <Search size={22} color="var(--primary)" />
                        <input 
                            placeholder={t('about.searchManualEgSmtpOrPlaceholder')} 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.1rem', outline: 'none', width: '100%' }}
                            title={t('about.filterTheManualContents')}
                        />
                        {searchQuery && <button onClick={() => setSearchQuery('')} className="text-btn" style={{ color: '#f87171' }} title={t('about.clearSearchFilterTip')}>{t('about.clear')}</button>}
                    </div>
                </div>


                {/* Content Area */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '40px' }} className="manual-scroll-area scroll-area">
                    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '50px' }}>
                        
                        {filteredManual.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '80px', opacity: 0.5 }}>
                                <AlertCircle size={64} style={{ margin: '0 auto 20px' }} />
                                <h2>{t('about.noInformationFound')}</h2>
                                <p>{t('about.refineYourQueryTryBroad')}</p>
                            </div>
                        ) : (
                            filteredManual.map((m) => (
                                <section key={m.id} id={m.id} style={{ scrollMarginTop: '200px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px', color: 'var(--primary)' }}>
                                        <div style={{ padding: '10px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px' }}>
                                            {m.icon}
                                        </div>
                                        <h2 style={{ fontSize: '1.8rem', margin: 0, borderBottom: '2px solid rgba(99, 102, 241, 0.2)', flex: 1, paddingBottom: '5px' }}>
                                            {m.section}
                                        </h2>
                                        {m.navigateTo && (
                                            (m.adminOnly && !_isAdminOrCreator) ? (
                                                <span
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '8px',
                                                        padding: '8px 18px', fontSize: '0.8rem', fontWeight: 600,
                                                        background: 'rgba(100, 116, 139, 0.1)',
                                                        border: '1px solid rgba(100, 116, 139, 0.2)',
                                                        color: '#64748b', borderRadius: '10px',
                                                        whiteSpace: 'nowrap', flexShrink: 0,
                                                        cursor: 'not-allowed'
                                                    }}
                                                    title={t('about.thisSectionRequiresItAdminTip')}
                                                >
                                                    🔒 {t('about.adminOnly', 'Admin Only')}
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        setViewingManual(false);
                                                        setTimeout(() => navigate(m.navigateTo), 150);
                                                    }}
                                                    className="btn-primary"
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '8px',
                                                        padding: '8px 18px', fontSize: '0.8rem', fontWeight: 600,
                                                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.1))',
                                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                                        color: '#10b981', borderRadius: '10px',
                                                        whiteSpace: 'nowrap', flexShrink: 0
                                                    }}
                                                    title={`Navigate to the ${m.section.replace(/Part \w+(-\w+)?:\s*/,'')} screen and explore it live`}
                                                >
                                                    🎯 {t('about.goThere', 'Go There')}
                                                </button>
                                            )
                                        )}
                                        {m.filePath && _isAdminOrCreator && (
                                            <button
                                                onClick={() => window.dispatchEvent(new CustomEvent('open-studio', { detail: { file: m.filePath } }))}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '8px',
                                                    padding: '8px 18px', fontSize: '0.8rem', fontWeight: 600,
                                                    background: 'rgba(99, 102, 241, 0.12)',
                                                    border: '1px solid rgba(99, 102, 241, 0.3)',
                                                    color: '#818cf8', borderRadius: '10px',
                                                    whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer'
                                                }}
                                                title={`Open ${m.filePath} in Live Studio`}
                                            >
                                                {'</>'} {t('about.goToCode', 'Go to Code')}
                                            </button>
                                        )}
                                    </div>

                                    <div style={{ paddingLeft: '60px' }}>
                                        <p style={{ fontSize: '1.1rem', lineHeight: '1.6', color: 'var(--text-main)', marginBottom: '30px' }}>
                                            {m.content}
                                        </p>

                                        {m.details && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '25px', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                {m.details.map((d, idx) => (
                                                    <div key={idx} style={{ display: 'flex', gap: '15px' }}>
                                                        <div style={{ width: '6px', height: '6px', minWidth: '6px', background: 'var(--primary)', borderRadius: '50%', marginTop: '8px' }}></div>
                                                        <span style={{ fontSize: '1rem', whiteSpace: 'pre-wrap' }}>{d}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {m.subsections && m.subsections.map((sub, sidx) => {
                                            const isComparisonTable = m.id === 'competitive-comparison' && sub.items.some(i => i.includes('\u2014 Trier'));
                                            const isExclusiveList = m.id === 'competitive-comparison' && sub.title.includes('Trier-Exclusive');
                                            const thBase = { padding: '10px 12px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid rgba(99,102,241,0.25)', whiteSpace: 'nowrap' };
                                            const tdBase = { padding: '10px 12px', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'middle' };

                                            if (isComparisonTable) {
                                                const vendors = ['Trier', 'Fiix', 'UpKeep', 'Limble', 'MaintainX', 'eMaint', 'SAP PM', 'IBM'];
                                                // Positional parser — splits by | so vendor names don't need to be in English
                                                const rows = sub.items.map(item => {
                                                    // Handle all separator variants translations may use
                                                    let dashIdx = -1, sepLen = 3;
                                                    const SEP_TRIES = [
                                                        [' \u2014 ', 3], ['\u2014 ', 2], ['\u2014', 1],  // em dash
                                                        [' \u2013 ', 3], ['\u2013 ', 2], ['\u2013', 1],  // en dash
                                                        [' - ', 3],                                        // spaced hyphen
                                                        ['- ', 2],                                         // hyphen+space (e.g. ）- )
                                                    ];
                                                    for (const [sep, len] of SEP_TRIES) {
                                                        const idx = item.indexOf(sep);
                                                        if (idx > -1) { dashIdx = idx; sepLen = len; break; }
                                                    }
                                                    const feature = dashIdx > -1 ? item.substring(0, dashIdx).trim() : item;
                                                    const rest = dashIdx > -1 ? item.substring(dashIdx + sepLen) : '';
                                                    const statuses = {};
                                                    if (rest) {
                                                        const segments = rest.split('|');
                                                        segments.forEach((seg, i) => {
                                                            if (i < vendors.length) {
                                                                const tokens = seg.match(/\[[^\]]+\]/g) || [];
                                                                statuses[vendors[i]] = tokens.join('');
                                                            }
                                                        });
                                                    }
                                                    vendors.forEach(v => { if (!statuses[v]) statuses[v] = ''; });
                                                    return { feature, statuses };
                                                });
                                                // Normalize status tokens from any language to a canonical value
                                                const normalizeStatus = (val) => {
                                                    if (!val) return '';
                                                    const YES_TOKENS   = ['YES','SÍ','SI','OUI','JA','SIM','是','예','نعم','हाँ','EVET','はい'];
                                                    const NO_TOKENS    = ['NO','NON','NEIN','NÃO','NAO','否','아니오','아니요','لا','नहीं','HAYIR','いいえ'];
                                                    const PART_TOKENS  = ['PARTIAL','PARCIAL','PARTIEL','TEILWEISE','部分','부분','일부','جزئي','आंशिक','सं.','सं0','KISMİ','KISMI'];
                                                    const UNIQ_TOKENS  = ['UNIQUE','ÚNICO','UNICO','EINZIGARTIG','独特','고유','فريد','अद्वितीय','BENZERSİZ','BENZERSIZ','独自','ユニーク','固有'];
                                                    const has = (tokens) => tokens.some(t => val.includes(t));
                                                    const isUniq = has(UNIQ_TOKENS);
                                                    if (isUniq && has(YES_TOKENS)) return 'YES_UNIQUE';
                                                    if (has(YES_TOKENS))  return 'YES';
                                                    if (has(PART_TOKENS)) return 'PARTIAL';
                                                    if (has(NO_TOKENS))   return 'NO';
                                                    return '';
                                                };
                                                const badge = (val) => {
                                                    const s = normalizeStatus(val);
                                                    if (s === 'YES_UNIQUE') return <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', background: 'rgba(234,179,8,0.2)', color: '#eab308', fontWeight: 800, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{'\u2605'} {t('matrix.yes', 'YES')}</span>;
                                                    if (s === 'YES')        return <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', background: 'rgba(16,185,129,0.15)', color: '#34d399', fontWeight: 700, fontSize: '0.7rem' }}>{t('matrix.yes', 'YES')}</span>;
                                                    if (s === 'PARTIAL')    return <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', background: 'rgba(245,158,11,0.12)', color: '#fbbf24', fontWeight: 600, fontSize: '0.7rem' }}>{t('matrix.partial', 'PARTIAL')}</span>;
                                                    if (s === 'NO')         return <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', color: '#f87171', fontSize: '0.7rem' }}>{t('matrix.no', 'NO')}</span>;
                                                    return <span style={{ color: '#475569', fontSize: '0.7rem' }}>{'\u2014'}</span>;
                                                };
                                                return (
                                                    <div key={sidx} style={{ marginTop: '35px' }}>
                                                        <h3 style={{ fontSize: '1.3rem', color: '#fff', marginBottom: '12px', fontFamily: "'Outfit', sans-serif" }}>{sub.title}</h3>
                                                        <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.15)' }}>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                                                <colgroup>
                                                                    <col style={{ width: '28%' }} />
                                                                    {vendors.map(v => <col key={v} style={{ width: '9%' }} />)}
                                                                </colgroup>
                                                                <thead>
                                                                    <tr style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
                                                                        <th style={{ ...thBase, textAlign: 'left', color: '#94a3b8' }}>{t('about.feature', 'Feature')}</th>
                                                                        {vendors.map(v => (
                                                                            <th key={v} style={{ ...thBase, textAlign: 'center', color: v === 'Trier' ? '#818cf8' : '#94a3b8', fontWeight: v === 'Trier' ? 900 : 700 }}>{v}</th>
                                                                        ))}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {rows.map((row, ridx) => (
                                                                        <tr key={ridx} style={{ background: ridx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                                                            <td style={{ ...tdBase, color: '#e2e8f0', fontWeight: 500 }}>{row.feature}</td>
                                                                            {vendors.map(v => (
                                                                                <td key={v} style={{ ...tdBase, textAlign: 'center' }}>
                                                                                    {badge(row.statuses[v])}
                                                                                </td>
                                                                            ))}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (isExclusiveList) {
                                                const exclusiveRows = sub.items.map(item => {
                                                    const clean = item.replace(/\[UNIQUE\]\s*/g, '');
                                                    const dashIdx = clean.indexOf(' \u2014 ');
                                                    if (dashIdx > -1) return { feature: clean.substring(0, dashIdx), desc: clean.substring(dashIdx + 3) };
                                                    return { feature: clean, desc: '' };
                                                });
                                                return (
                                                    <div key={sidx} style={{ marginTop: '35px' }}>
                                                        <h3 style={{ fontSize: '1.3rem', color: '#eab308', marginBottom: '12px', fontFamily: "'Outfit', sans-serif" }}>
                                                            {sub.title.replace('[UNIQUE] ', '')}
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94a3b8', marginLeft: '12px' }}>{t('about.noCompetitorOffersThese', 'No competitor offers these')}</span>
                                                        </h3>
                                                        <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid rgba(234,179,8,0.15)', background: 'rgba(234,179,8,0.02)' }}>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                                                <colgroup>
                                                                    <col style={{ width: '35%' }} />
                                                                    <col style={{ width: '65%' }} />
                                                                </colgroup>
                                                                <thead>
                                                                    <tr style={{ background: 'rgba(234,179,8,0.08)' }}>
                                                                        <th style={{ ...thBase, textAlign: 'left', color: '#eab308', borderBottom: '2px solid rgba(234,179,8,0.2)' }}>Feature</th>
                                                                        <th style={{ ...thBase, textAlign: 'left', color: '#94a3b8', borderBottom: '2px solid rgba(234,179,8,0.2)' }}>{t('about.description', 'Description')}</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {exclusiveRows.map((row, ridx) => (
                                                                        <tr key={ridx} style={{ background: ridx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                                                            <td style={{ ...tdBase, color: '#fff', fontWeight: 600, borderBottom: '1px solid rgba(234,179,8,0.06)' }}>{row.feature}</td>
                                                                            <td style={{ ...tdBase, color: '#94a3b8', borderBottom: '1px solid rgba(234,179,8,0.06)' }}>{row.desc}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            // ── TCO Analysis tables ─────────────────────────────────────
                                            if (sub.tcoTable || sub.tcoItems) {
                                                const thTco = { padding: '9px 13px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid rgba(16,185,129,0.2)', whiteSpace: 'nowrap', background: 'rgba(0,0,0,0.25)', color: '#64748b' };
                                                const tdTco = { padding: '9px 13px', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle' };
                                                return (
                                                    <div key={sidx} style={{ marginTop: '32px' }}>
                                                        <h3 style={{ fontSize: '1.05rem', color: '#34d399', marginBottom: '8px', fontFamily: "'Outfit', sans-serif", fontWeight: 700 }}>{sub.title}</h3>
                                                        {sub.tcoNote && (
                                                            <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.6', marginBottom: '14px', borderLeft: '3px solid rgba(16,185,129,0.3)', paddingLeft: '14px', margin: '0 0 14px 0' }}>
                                                                {sub.tcoNote}
                                                            </p>
                                                        )}
                                                        {sub.tcoTable && (() => {
                                                            const { headers, rows, highlight, isTotals, savingsHighlight, triRow } = sub.tcoTable;
                                                            return (
                                                                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.13)', background: 'rgba(0,0,0,0.18)' }}>
                                                                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                                                                        <thead>
                                                                            <tr>
                                                                                {headers.map((h, hi) => (
                                                                                    <th key={hi} style={{ ...thTco, textAlign: hi === 0 ? 'left' : 'center', color: highlight && hi === highlight ? '#34d399' : savingsHighlight && hi >= headers.length - 2 ? '#34d399' : '#64748b', fontWeight: (highlight && hi === highlight) || (savingsHighlight && hi >= headers.length - 2) ? 900 : 700 }}>
                                                                                        {h}
                                                                                    </th>
                                                                                ))}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {rows.map((row, ri) => {
                                                                                const isTrierRow = triRow && row[0] === triRow;
                                                                                const isTotalRow = isTotals && ri === rows.length - 1;
                                                                                return (
                                                                                    <tr key={ri} style={{ background: isTrierRow ? 'rgba(16,185,129,0.07)' : isTotalRow ? 'rgba(99,102,241,0.07)' : ri % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                                                                        {row.map((cell, ci) => {
                                                                                            const isTrierCol = highlight && ci === highlight;
                                                                                            const isZero = cell === '$0';
                                                                                            const isSavingsMoney = savingsHighlight && ci === row.length - 2;
                                                                                            const isSavingsPct = savingsHighlight && ci === row.length - 1;
                                                                                            const green = isTrierCol || isTrierRow || isZero || isSavingsMoney || isSavingsPct;
                                                                                            return (
                                                                                                <td key={ci} style={{
                                                                                                    ...tdTco,
                                                                                                    textAlign: ci === 0 ? 'left' : 'center',
                                                                                                    color: isTotalRow && ci > 0 ? (isTrierCol ? '#34d399' : '#f1f5f9') : green ? '#34d399' : '#94a3b8',
                                                                                                    fontWeight: isTotalRow || isTrierRow || isZero ? 700 : 400,
                                                                                                    fontSize: isTotalRow && ci > 0 ? '0.85rem' : '0.8rem',
                                                                                                    background: isTrierCol ? 'rgba(16,185,129,0.05)' : 'transparent',
                                                                                                    borderLeft: isTrierCol ? '1px solid rgba(16,185,129,0.12)' : undefined,
                                                                                                    borderTop: isTotalRow ? '2px solid rgba(99,102,241,0.2)' : undefined,
                                                                                                }}>
                                                                                                    {cell}
                                                                                                </td>
                                                                                            );
                                                                                        })}
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            );
                                                        })()}
                                                        {sub.tcoItems && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '12px' }}>
                                                                {sub.tcoItems.map((item, ii) => (
                                                                    <div key={ii} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', padding: '9px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                                                                        <span style={{ minWidth: 6, height: 6, width: 6, borderRadius: '50%', background: '#34d399', marginTop: 7, flexShrink: 0, display: 'inline-block' }} />
                                                                        <div>
                                                                            <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.82rem' }}>{item.label}</span>
                                                                            <span style={{ color: '#34d399', fontSize: '0.79rem', marginLeft: 10 }}>{item.value}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div key={sidx} style={{ marginTop: '30px', borderLeft: '3px solid rgba(99, 102, 241, 0.2)', paddingLeft: '25px' }}>
                                                    <h3 style={{ fontSize: '1.3rem', color: '#fff', marginBottom: '15px' }}>{sub.title}</h3>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                        {sub.items.map((item, iidx) => (
                                                            <p key={iidx} style={{ margin: 0, opacity: 0.9, lineHeight: '1.5' }}>{item}</p>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}


                                        {m.scenarios && m.scenarios.map((sc, scidx) => (
                                            <div key={scidx} style={{ marginTop: '30px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.1)', borderRadius: '15px', padding: '30px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981', marginBottom: '15px' }}>
                                                    <Lightbulb size={24} />
                                                    <h3 style={{ margin: 0, fontSize: '1.3rem' }}>{sc.name}</h3>
                                                </div>
                                                <p style={{ marginBottom: '20px', fontSize: '1rem', fontStyle: 'italic', opacity: 0.8 }}>{sc.description}</p>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    {sc.steps.map((st, sidx) => (
                                                        <div key={sidx} style={{ display: 'flex', gap: '10px' }}>
                                                            <div style={{ color: '#10b981', fontWeight: 'bold' }}>•</div>
                                                            <span style={{ fontSize: '0.95rem' }}>{st}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}

                                        {m.terms && (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginTop: '30px' }}>
                                                {m.terms.map((term, tidx) => (
                                                    <div key={tidx} style={{ padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                        <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '5px' }}>{term.term}</strong>
                                                        <p style={{ fontSize: '0.85rem', margin: 0, opacity: 0.8 }}>{term.def}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {m.items && m.items.map((item, iidx) => (
                                            <div key={iidx} style={{ marginTop: '20px', padding: '20px', background: 'rgba(248, 113, 113, 0.05)', borderRadius: '12px', border: '1px solid rgba(248, 113, 113, 0.1)' }}>
                                                <h4 style={{ color: '#f87171', margin: '0 0 10px 0' }}>{item.issue}</h4>
                                                <p style={{ margin: 0, fontSize: '0.95rem' }}><strong>{t('about.fix')}</strong> {item.fix}</p>
                                            </div>
                                        ))}

                                        {m.channels && (
                                            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {m.channels.map((chan, cidx) => (
                                                    <div key={cidx} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                                                        <ArrowRight size={16} color="var(--primary)" />
                                                        <span>{chan}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                    </div>
                                </section>
                            ))
                        )}

                        {/* App Footer In Manual */}
                        <div style={{ marginTop: '50px', padding: '40px', textAlign: 'center', borderTop: '1px solid var(--glass-border)' }}>
                            <img src="/assets/TrierLogo.png" alt="Trier OS" style={{ height: '60px', marginBottom: '20px' }} />
                            <p style={{ opacity: 0.5 }}>© 2026 Doug Trier — {t('about.yearsOfKnowledge', '33 Years of Operational Knowledge')}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ FLOATING ACTION BAR — OUTSIDE glass-card so position:fixed works ═══ */}
            <div style={{
                position: 'fixed', bottom: '20px', right: '30px', zIndex: 10000,
                display: 'flex', gap: '8px', alignItems: 'center',
                background: 'rgba(15, 23, 42, 0.92)',
                padding: '10px 14px', borderRadius: '14px',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
            }}>
                <button 
                    onClick={() => {
                        const el = document.querySelector('.manual-scroll-area');
                        if (el) { el.scrollTop = 0; el.scrollTo({ top: 0, behavior: 'smooth' }); }
                        const firstSection = document.querySelector('.manual-scroll-area section');
                        if (firstSection) firstSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    title={t('about.scrollBackToTheTopTip')}
                    style={{
                        background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                        borderRadius: '10px', padding: '8px 14px', color: '#818cf8',
                        cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                >
                    ↑ {t('about.top', 'Top')}
                </button>
                <button 
                    onClick={() => setViewingManual(false)}
                    title={t('about.exitTheOperationalIntelligenceManualTip')}
                    style={{
                        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                        border: 'none', borderRadius: '10px', padding: '8px 16px',
                        color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '6px',
                        boxShadow: '0 2px 10px rgba(239,68,68,0.3)'
                    }}
                >
                    X {t('about.exitManual', 'Exit Manual')}
                </button>
            </div>
            </>
        );
    }

    return (
        <div className="glass-card" style={{ padding: 'var(--card-padding)', flex: 1, overflowY: 'auto' }}>
            <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '20px', marginBottom: '30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ padding: '12px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px' }}>
                        <Info size={32} color="var(--primary)" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ fontSize: '1.8rem', fontFamily: 'Outfit, sans-serif', margin: 0 }}>{t('about.aboutSystem', 'About Trier OS')}</h2>
                        <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('about.operationsManualSystemCredits')}</p>
                    </div>
                    <a
                        href="https://github.com/sponsors/DougTrier"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6', border: '1px solid rgba(236, 72, 153, 0.3)', textDecoration: 'none', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, fontSize: '0.875rem', lineHeight: '1.25rem', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
                        title={t('about.sponsorProject', 'Sponsor Trier OS Open Source Development')}
                    >
                        💖 {t('about.sponsor', 'Sponsor Trier OS')}
                    </a>
                    <a
                        href="https://github.com/DougTrier/trier-os"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.3)', textDecoration: 'none', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, fontSize: '0.875rem', lineHeight: '1.25rem', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
                        title="Star Trier OS on GitHub"
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.2)'; e.currentTarget.style.borderColor = 'rgba(251,191,36,0.5)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.1)'; e.currentTarget.style.borderColor = 'rgba(251,191,36,0.3)'; }}
                    >
                        <Star size={15} fill="#fbbf24" /> Star on GitHub
                    </a>
                    <button 
                        onClick={() => setViewingManual(true)}
                        className="btn-primary" 
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--primary)', color: '#fff' }}
                        title={t('about.openTheFullOperationalIntelligenceTip')}
                    >
                        <BookOpen size={18} /> {t('about.viewOperationsManual')}
                    </button>
                    <button 
                        onClick={() => navigate('/')}
                        className="btn-secondary" 
                        style={{ padding: '8px 16px', borderRadius: '10px' }}
                        title={t('about.closeTheAboutPageTip')}
                    >
                        {t('about.close')}
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                    <section>
                        <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertCircle size={20} /> {t('about.platformHighlights')}
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            {[
                                { title: t('about.feat.enterpriseDashboard', 'Enterprise Dashboard'), desc: t('about.feat.enterpriseDashboardDesc', 'Real-time financial and labor aggregation across 40+ facilities.'), icon: <Database size={16} /> },
                                { title: t('about.feat.knowledgeExchange', 'Knowledge Exchange'), desc: t('about.feat.knowledgeExchangeDesc', 'Secure forum with PDF/Media support for expert collaboration.'), icon: <MessageCircle size={16} /> },
                                { title: t('about.feat.inventoryMatrix', 'Inventory Matrix'), desc: t('about.feat.inventoryMatrixDesc', 'Global parts visibility with deep stock searching and transfers.'), icon: <HardDrive size={16} /> },
                                { title: t('about.feat.closeOutWizard', 'Close-Out Wizard'), desc: t('about.feat.closeOutWizardDesc', 'A strict financial ledger for labor, parts, and misc costs.'), icon: <Settings size={16} /> },
                                { title: t('about.feat.pmAutomation', 'PM Automation'), desc: t('about.feat.pmAutomationDesc', 'Auto-generation of work orders based on frequency or meter.'), icon: <Calendar size={16} /> },
                                { title: t('about.feat.procedureLibrary', 'Procedure Library'), desc: t('about.feat.procedureLibraryDesc', 'Fully detailed SOPs with linked tasks, tools, and parts.'), icon: <BookOpen size={16} /> },
                                { title: t('about.feat.plantScoping', 'Plant Scoping'), desc: t('about.feat.plantScopingDesc', 'RBAC-enforced data isolation for localized security.'), icon: <Globe size={16} /> },
                                { title: t('about.feat.assetLifecycle', 'Asset Lifecycle'), desc: t('about.feat.assetLifecycleDesc', 'Detailed equipment registry with full historical repair logs.'), icon: <FileText size={16} /> }
                            ].map((feat, i) => (
                                <div key={i} style={{ padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <h4 style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                                        {feat.icon} {feat.title}
                                    </h4>
                                    <p style={{ fontSize: '0.8rem', opacity: 0.7, lineHeight: '1.4' }}>{feat.desc}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section>
                        <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <User size={20} /> {t('about.creatorInformation')}
                            </span>
                        </h3>
                        <div className="glass-card" style={{ padding: '25px', background: 'rgba(99, 102, 241, 0.05)' }}>
                            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 'bold', flexShrink: 0 }}>
                                    {creatorInfo.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                                </div>
                                <div style={{ flex: 1 }}>
                                    {editingCreator ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <input value={creatorInfo.name} onChange={e => updateCreatorField('name', e.target.value)} placeholder={t('about.namePlaceholder')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: 600 }} title={t('about.editTheCreatorsDisplayNameTip')} />
                                            <input value={creatorInfo.email} onChange={e => updateCreatorField('email', e.target.value)} placeholder={t('about.emailPlaceholder')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--primary)', fontSize: '0.9rem' }} title={t('about.editTheCreatorsEmailAddressTip')} />
                                        </div>
                                    ) : (
                                        <>
                                            <h3 style={{ fontSize: '1.4rem' }}>{creatorInfo.name}</h3>
                                            <p style={{ color: 'var(--primary)', margin: 0 }}>{creatorInfo.email}</p>
                                        </>
                                    )}
                                    <p style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '2px' }}>{creatorInfo.experience} Years of Industrial Legacy</p>
                                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {editingCreator ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                {creatorInfo.titles.map((title, i) => (
                                                    <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                        <input value={title} onChange={e => { const newTitles = [...creatorInfo.titles]; newTitles[i] = e.target.value; updateCreatorField('titles', newTitles); }} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '4px 8px', color: 'var(--text-main)', fontSize: '0.82rem' }} title={t('about.editThisProfessionalTitleTip')} />
                                                        <button onClick={() => { const newTitles = creatorInfo.titles.filter((_, idx) => idx !== i); updateCreatorField('titles', newTitles); }} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontSize: '0.7rem' }} title={t('about.removeThisTitleTip')}>X</button>
                                                    </div>
                                                ))}
                                                <button onClick={() => updateCreatorField('titles', [...creatorInfo.titles, ''])} style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '6px', border: '1px dashed var(--glass-border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', marginTop: '4px' }} title={t('about.addNewTitle', 'Add a new title')}>+ Add Title</button>
                                            </div>
                                        ) : (
                                            creatorInfo.titles.map((title, i) => (
                                                <div key={i} style={{ fontSize: '0.82rem', opacity: 0.9, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
                                                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--primary)' }}></div> {title}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            <div style={{ marginTop: '25px', padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <h4 style={{ fontSize: '0.8rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <History size={14} /> {t('about.theArchitectsJourney')}
                                </h4>
                                {editingCreator ? (
                                    <textarea value={creatorInfo.bio} onChange={e => updateCreatorField('bio', e.target.value)} rows={5} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '10px', color: 'var(--text-main)', fontSize: '0.9rem', lineHeight: '1.6', resize: 'vertical', fontFamily: 'inherit' }} title={t('about.editTheCreatorsBiographyTip')} />
                                ) : (
                                    <p style={{ fontSize: '0.9rem', lineHeight: '1.6', opacity: 0.8, margin: 0 }}>
                                        {creatorInfo.bio}
                                    </p>
                                )}
                                <div style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    {editingCreator ? (
                                        (creatorInfo.badges || ['Industrial Engineering', 'V-Sphere/Cloud', 'Mobile Infra']).map((badge, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <input value={badge} onChange={e => { const newBadges = [...(creatorInfo.badges || ['Industrial Engineering', 'V-Sphere/Cloud', 'Mobile Infra'])]; newBadges[i] = e.target.value; updateCreatorField('badges', newBadges); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '4px 10px', color: 'var(--text-main)', fontSize: '0.7rem', width: '130px' }} title={t('about.editThisExpertiseBadgeTip')} />
                                                <button onClick={() => { const newBadges = (creatorInfo.badges || []).filter((_, idx) => idx !== i); updateCreatorField('badges', newBadges); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.7rem', padding: '0 2px' }} title={t('about.removeThisBadgeTip')}>X</button>
                                            </div>
                                        ))
                                    ) : (
                                        <>
                                            {(creatorInfo.badges || ['Industrial Engineering', 'V-Sphere/Cloud', 'Mobile Infra']).map((badge, i) => {
                                                const colors = [['rgba(16, 185, 129, 0.1)', '#10b981', 'rgba(16, 185, 129, 0.2)'], ['rgba(99, 102, 241, 0.1)', 'var(--primary)', 'rgba(99, 102, 241, 0.2)'], ['rgba(245, 158, 11, 0.1)', '#f59e0b', 'rgba(245, 158, 11, 0.2)']];
                                                const c = colors[i % colors.length];
                                                return <span key={i} style={{ fontSize: '0.7rem', background: c[0], color: c[1], padding: '4px 10px', borderRadius: '20px', border: `1px solid ${c[2]}` }}>{badge}</span>;
                                            })}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="glass-card" style={{ padding: '20px', background: 'rgba(255, 255, 255, 0.03)' }}>
                        <h3 style={{ fontSize: '1rem', marginBottom: '20px', opacity: 0.8 }}>{t('about.systemBuildInformation')}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('about.buildVersion')}</p>
                                <p style={{ fontWeight: 600 }}>{creatorInfo.version}</p>
                            </div>
                            <div>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('about.releaseDate')}</p>
                                <p style={{ fontWeight: 600 }}>{creatorInfo.buildDate}</p>
                            </div>
                        </div>
                        <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid var(--glass-border)', textAlign: 'center' }}>
                            <p style={{ fontSize: '0.75rem', marginTop: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Trier OS™</p>
                            <p style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>© 2026 Doug Trier. All Rights Reserved.</p>
                            <p style={{ fontSize: '0.65rem', color: 'var(--primary)', opacity: 0.8, marginTop: '5px' }}>USPTO Trademark Serial No: 99733829</p>
                            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', opacity: 0.5, marginTop: '5px' }}>{t('about.proprietaryMaintenanceSolutions')}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AboutView;
