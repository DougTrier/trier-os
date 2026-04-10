// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Â© 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * App.jsx -- Root Application Shell
 * ====================================
 * Top-level React component orchestrating the entire Trier OS SPA.
 * Every module, modal, and route is a child of this component tree.
 *
 * -- ARCHITECTURE -----------------------------------------------------------------
 * React Router v6 URL-based routing. Each module (Jobs, Assets, Safety, etc.)
 * lives at its own path and renders on navigation from Mission Control or the
 * header. The persistent header provides: plant selector, scan button,
 * notifications, settings, and logout across all pages.
 *
 * -- AUTHENTICATION ---------------------------------------------------------------
 * JWT-based. On login, the server issues a signed token stored in localStorage
 * under 'authToken'. All API calls send it as a Bearer token via the Authorization
 * header. The token carries the user's role, plantId, globalAccess, and isCreator
 * flags. On logout or 15-min inactivity, localStorage is cleared and the component
 * re-renders to the LoginView gate.
 *
 * -- MULTI-TENANCY & PLANT CONTEXT ------------------------------------------------
 * `selectedPlant` drives the x-plant-id header on every API call, routing the
 * backend to the correct SQLite database. Plant-level users are pinned to their
 * nativePlantId; IT admins and creators switch freely via the header dropdown.
 * 'all_sites' is a virtual plant for corporate analytics that aggregates across
 * all plant databases via parallel queries on the server.
 *
 * -- ROLE-BASED ACCESS CONTROL (RBAC) ---------------------------------------------
 * Roles flow: JWT token -> localStorage on login -> render-time conditionals.
 *   isCreator        -- god mode, full access, including Creator Console
 *   isAdminOrCreator -- it_admin + creator for system configuration
 *   hasGlobalAccess  -- cross-plant read for reporting/intelligence
 *   showDashboard    -- whether user can see the plant KPI dashboard
 *   viewAsRole       -- optional impersonation override (RoleSwitcher, dev-only)
 *
 * -- UNIFIED SCAN PIPELINE --------------------------------------------------------
 * Three hardware input sources all funnel into the same handleGlobalHardwareScan():
 *   1. useHardwareScanner -- Zebra/Honeywell keyboard wedge (fast keystrokes)
 *   2. useNFC             -- Web NFC API on Android (tag tap -> text payload)
 *   3. GlobalScanner      -- Camera-based QR/barcode via html5-qrcode (ZXing)
 * The handler identifies scan type by prefix (ASSET-, PART-, IT-, JOB-) and
 * routes the user to the correct module automatically.
 *
 * -- INACTIVITY AUTO-LOGOUT -------------------------------------------------------
 * 15-min auto-logout on shared factory workstations. A 60-second warning banner
 * appears before the logout fires. Timer resets on mouse, keyboard, or touch.
 * On logout, open shift log entries are locked server-side before session clears.
 *
 * -- PRINT PORTAL -----------------------------------------------------------------
 * createPortal renders PrintEngine into document.body outside #root. The @media
 * print CSS hides #root entirely, showing only .print-only-wrapper, producing
 * clean full-page printouts with no application chrome bleeding through.
 *
 * -- OFFLINE SUPPORT --------------------------------------------------------------
 * On login, OfflineDB.fullCacheRefresh() populates IndexedDB with the user's
 * plant data. useOnlineStatus monitors navigator.onLine; the OfflineStatusBar
 * shows a red banner when connectivity is lost. Reads fall back to IndexedDB.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import { LogOut, Settings, ClipboardList, PenTool, CalendarClock, BookOpen, Database as DatabaseIcon, Download, Archive, AlertTriangle, PhoneCall, Mail, Scan, TrendingDown, WifiOff, Monitor, LibraryBig, Zap, Info, UserPlus, Code, HelpCircle, IdCard } from 'lucide-react';
import { DialogProvider } from './hooks/useDialog';
import DialogInterceptor from './components/DialogInterceptor';
import { ToastProvider, useToast } from './components/ToastProvider';
import RoleAvatar from './components/RoleAvatar';
import AboutView from './components/AboutView';
import JobsView from './components/JobsView';
import AssetsDashboard from './components/AssetsDashboard';
import PartsDashboard from './components/PartsDashboard';
import ProceduresDashboard from './components/ProceduresDashboard';
import HistoryDashboard from './components/HistoryDashboard';
import LocationsEditor from './components/LocationsEditor';
import GlobalScanner from './components/GlobalScanner';
import LoginView from './components/LoginView';
import WorkRequestPortal from './components/WorkRequestPortal';
import ImportWizard from './components/ImportWizard';
import PasswordChangeView from './components/PasswordChangeView';
import LeadershipEditor from './components/LeadershipEditor';
import ChatView from './components/ChatView';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import DashboardView from './components/DashboardView';
import MissionControl from './components/MissionControl';
import PortalWidget from './components/PortalWidget';
import SettingsView from './components/SettingsView';
import AdminConsoleView from './components/AdminConsoleView';
import DirectoryView from './components/DirectoryView';
import PersonalIntelligence from './components/PersonalIntelligence';
import RoleSwitcher from './components/RoleSwitcher';
import HeaderLayoutManager from './components/HeaderLayoutManager';
import PrintEngine from './components/PrintEngine';
import InvitePassPopup from './components/InvitePassPopup';
import TaskListView from './components/TaskListView';
import OnboardingWizard from './components/OnboardingWizard';
import OnboardingTour from './components/OnboardingTour';
import NotificationCenter from './components/NotificationCenter';
import useOnlineStatus from './hooks/useOnlineStatus';
import { useTranslation } from './i18n/index.jsx';
import OfflineStatusBar from './components/OfflineStatusBar.jsx';
import PwaInstallPrompt from './components/PwaInstallPrompt.jsx';
import OfflineDB from './utils/OfflineDB.js';
import FleetView from './components/FleetView';
import SafetyView from './components/SafetyView';
import EngineeringView from './components/EngineeringView';
import VendorPortalView from './components/VendorPortalView';
import ToolsView from './components/ToolsView';
import ContractorsView from './components/ContractorsView';
import GovernanceView from './components/GovernanceView';
import ImportApiView from './components/ImportApiView';
import CatalogViewer from './components/CatalogViewer';
import ContextualTour from './components/ContextualTour';
import LotoView from './components/LotoView';
import ComplianceView from './components/ComplianceView';
import GroupPortalView from './components/GroupPortalView';
import ITDepartmentView from './components/ITDepartmentView';
import ITMetricsView from './components/ITMetricsView';
import ITGlobalSearchView from './components/ITGlobalSearchView';
import ITAlertsView from './components/ITAlertsView';
import ITRouteGuard from './components/ITRouteGuard';
import CreatorConsole from './components/CreatorConsole';
import LiveStudio from './components/LiveStudio';
import UtilitiesView from "./components/UtilitiesView";
import CorporateAnalyticsView from './components/CorporateAnalyticsView';
import FloorPlanView from './components/FloorPlanView';
import QualityDashboard from './components/QualityDashboard';
import SupplyChainView from './components/SupplyChainView';
import USMapView from './components/USMapView';
import UnderwriterView from './components/UnderwriterView';
import StoreroomView from './components/StoreroomView';
import TrainingView from './components/TrainingView';
import PlantSetupView from './components/PlantSetupView';
import useHardwareScanner from './hooks/useHardwareScanner';
/**
 * PlantOnboardingRoute — thin route wrapper for the Enterprise Onboarding Wizard.
 * Renders the OnboardingWizard full-screen (it uses modal-overlay / position:fixed)
 * and navigates back to the Facilities & Floor Plans group portal on close.
 */
function PlantOnboardingRoute({ plantId, plantLabel }) {
    const navigate = useNavigate();
    return (
        <OnboardingWizard
            mode="import"
            plantId={plantId}
            plantLabel={plantLabel}
            onClose={() => navigate('/portal/plant-setup-group')}
        />
    );
}

function App() {
    const isOnline = useOnlineStatus();
    const { t, lang, setLang, LANGUAGES } = useTranslation();
    const activeUserRole = localStorage.getItem('userRole') || 'technician';
    const isCreator = activeUserRole === 'creator';
    const [viewAsRole, setViewAsRole] = useState(localStorage.getItem('MC_VIEW_AS_ROLE') || '');
    const effectiveRole = viewAsRole || activeUserRole;
    const isAdminOrCreator = useMemo(() => ['it_admin', 'creator'].includes(activeUserRole) || isCreator, [activeUserRole, isCreator]);
    const canAccessDashboard = localStorage.getItem('canAccessDashboard') === 'true';
    const hasGlobalAccess = localStorage.getItem('globalAccess') === 'true';
    const isManagerOrAdmin = useMemo(() => ['it_admin', 'creator', 'manager'].includes(activeUserRole), [activeUserRole]);
    const showDashboard = useMemo(() => isAdminOrCreator || canAccessDashboard || isManagerOrAdmin, [isAdminOrCreator, canAccessDashboard, isManagerOrAdmin]);

    const [branding, setBranding] = useState({ dashboardLogo: null, documentLogo: null });

    useEffect(() => {
        const fetchBranding = async () => {
            try {
                const res = await fetch('/api/branding');
                const data = await res.json();
                setBranding(data);
            } catch (err) { console.error('Failed to load branding'); }
        };
        fetchBranding();

        const fetchNetworkInfo = async () => {
            try {
                const res = await fetch('/api/network-info');
                const info = await res.json();
                if (info.lanIp) {
                    const port = window.location.port ? `:${window.location.port}` : '';
                    window.systemBaseUrl = `${window.location.protocol}//${info.lanIp}${port}`;
                }
            } catch (err) { }
        };
        fetchNetworkInfo();

        const handleBrandingUpdate = (e) => setBranding(e.detail);
        window.addEventListener('trier-branding-update', handleBrandingUpdate);
        return () => window.removeEventListener('trier-branding-update', handleBrandingUpdate);
    }, []);
    const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('authToken'));

    const location = useLocation();
    const navigate = useNavigate();

    // Derived activeTab from the actual URL path
    const activeTab = useMemo(() => {
        const path = location.pathname.substring(1); // Remove leading slash
        if (!path) return showDashboard ? 'dashboard' : 'jobs';
        return path;
    }, [location.pathname, showDashboard]);

    const setActiveTab = (tab, options = {}) => {
        navigate(`/${tab}`, options);
    };

    useEffect(() => {
        const handleNav = (e) => {

            setActiveTab(e.detail);
        };
        window.addEventListener('pf-nav', handleNav);
        return () => window.removeEventListener('pf-nav', handleNav);
    }, [navigate]);

    const [dbStats, setDbStats] = useState(null);
    const [plants, setPlants] = useState([]);
    const [selectedPlant, setSelectedPlant] = useState(localStorage.getItem('selectedPlantId') || 'all_sites');
    const [plantAddress, setPlantAddress] = useState('...');
    const [globalSearchForm, setGlobalSearchForm] = useState('');
    const [globalSearchResults, setGlobalSearchResults] = useState([]);
    const [isRefreshingDB, setIsRefreshingDB] = useState(false);
    const [isEditingLocations, setIsEditingLocations] = useState(false);
    const [leadershipEditConfig, setLeadershipEditConfig] = useState(null); // { id, label }
    const [mobileMode, setMobileMode] = useState(localStorage.getItem('PM_MOBILE_MODE') === 'true');
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [hwPendingScan, setHwPendingScan] = useState(null); // code to auto-process on GlobalScanner mount
    const isScannerOpenRef = useRef(false);
    const [hwScanFlash, setHwScanFlash] = useState(false); // brief flash on header button when hw scan fires
    const [isTaskListOpen, setIsTaskListOpen] = useState(false);
    const [isOnboarding, setIsOnboarding] = useState(false);
    // dialog state moved to DialogProvider (useDialog hook)
    const [shopFloorMode, setShopFloorMode] = useState(localStorage.getItem('PM_SHOP_FLOOR_MODE') === 'true');
    const [isCreatorConsoleOpen, setIsCreatorConsoleOpen] = useState(false);
    const [isLiveStudioOpen, setIsLiveStudioOpen] = useState(false);
    const [studioInitialFile, setStudioInitialFile] = useState(null);

    // Listen for 'open-studio' events fired by Manual "Go to Code" buttons
    useEffect(() => {
        const handler = (e) => {
            setStudioInitialFile(e.detail?.file || null);
            setIsLiveStudioOpen(true);
        };
        window.addEventListener('open-studio', handler);
        return () => window.removeEventListener('open-studio', handler);
    }, []);
    const [hwScanResult, setHwScanResult] = useState(null); // Global hardware scan result
    const [inviteCode, setInviteCode] = useState(null);
    const [isInvitePopupOpen, setIsInvitePopupOpen] = useState(false);
    const currentUsername = localStorage.getItem('currentUser');

    const toggleShopFloorMode = () => {
        const newVal = !shopFloorMode;
        setShopFloorMode(newVal);
        localStorage.setItem('PM_SHOP_FLOOR_MODE', newVal);
        if (newVal) document.body.classList.add('shop-floor-mode');
        else document.body.classList.remove('shop-floor-mode');
    };

    // Apply shop floor mode on mount
    useEffect(() => {
        if (localStorage.getItem('PM_SHOP_FLOOR_MODE') === 'true') {
            document.body.classList.add('shop-floor-mode');
        }
    }, []);

    const handleEditLeadership = (plant) => {
        setLeadershipEditConfig(plant);
    };

    const toggleMobileMode = () => {
        const newVal = !mobileMode;
        setMobileMode(newVal);
        localStorage.setItem('PM_MOBILE_MODE', newVal);
    };

    // Global Print State
    const [printRequest, setPrintRequest] = useState(null);

    // Global Print Listener
    useEffect(() => {
        const handlePrintEvent = (e) => {

            setPrintRequest(e.detail);
        };
        window.addEventListener('trier-print', handlePrintEvent);
        return () => window.removeEventListener('trier-print', handlePrintEvent);
    }, []);

    // Print Execution Lock
    useEffect(() => {
        if (printRequest) {
            // Give React a moment to mount the print-only-wrapper and render the PrintEngine
            const timer = setTimeout(async () => {
                // In Electron, use printToPDF for proper PDF preview
                if (window.TrierOS?.isElectron && window.TrierOS?.printToPDF) {
                    try {
                        const result = await window.TrierOS.printToPDF();
                        if (!result.success) window.print();
                    } catch (e) { window.print(); }
                    setPrintRequest(null);
                } else {
                    window.print();
                }
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [printRequest]);

    useEffect(() => {
        const clearPrint = () => setPrintRequest(null);
        window.addEventListener('afterprint', clearPrint);
        return () => window.removeEventListener('afterprint', clearPrint);
    }, []);


    window.triggerTrierPrint = (type, data) => {
        window.dispatchEvent(new CustomEvent('trier-print', { detail: { type, data } }));
    };
    const isForeignPlant = !isAdminOrCreator &&
        localStorage.getItem('nativePlantId') &&
        localStorage.getItem('selectedPlantId') !== localStorage.getItem('nativePlantId');

    const handle401 = () => {
        setIsAuthenticated(false);
        localStorage.removeItem('authToken');
        localStorage.removeItem('userRole');
        localStorage.removeItem('nativePlantId');
        localStorage.removeItem('selectedPlantId');
        navigate('/');
    };

    const fetchPlants = () => {
        // Fetch available plants - unprotected endpoint
        fetch('/api/database/plants')
            .then(res => res.json())
            .then(data => setPlants(Array.isArray(data) ? data : []))
            .catch(err => console.error('Failed to load plants:', err));
    };

    useEffect(() => {
        if (!isAuthenticated) return;
        fetchPlants();
    }, [isAuthenticated]);

    // â”€â”€ Onboarding / Setup Document: fetch invite code â”€â”€

    useEffect(() => {
        if (!isAuthenticated || !isAdminOrCreator) return;
        const codeTarget = selectedPlant === 'all_sites' ? 'CORPORATE' : selectedPlant;
        fetch(`/api/logistics/site-code/${codeTarget}`)
            .then(res => res.json())
            .then(data => {
                if (data.inviteCode) {
                    setInviteCode(data.inviteCode);
                } else {
                    fetch('/api/logistics/site-code/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ plantId: codeTarget, userId: localStorage.getItem('userId') })
                    })
                    .then(res => res.json())
                    .then(genData => setInviteCode(genData.inviteCode))
                    .catch(e => console.warn('[App] invite code gen failed', e));
                }
            })
            .catch(err => console.error('Invite code logic failed', err));
    }, [selectedPlant, isAuthenticated, isAdminOrCreator]);

    const handlePrintAccessPack = async () => {
        if (!inviteCode) return;
        // Always fetch live network info at print time so the IP matches the current network
        let httpUrl = window.location.origin;
        let httpsUrl = null;
        try {
            const res = await fetch('/api/network-info');
            const info = await res.json();
            if (info.url) httpUrl = info.url;
            if (info.httpsUrl) httpsUrl = info.httpsUrl;
        } catch { /* fallback to window.location.origin */ }
        const plantLabel = selectedPlant === 'all_sites' ? 'Corporate (All Sites)' : (plants.find(p => p.id === selectedPlant)?.label || selectedPlant);
        const accessUrl = httpUrl.replace(/\/$/, '') + '/setup';
        window.dispatchEvent(new CustomEvent('trier-print', {
            detail: {
                type: 'site-access-pack',
                data: { inviteCode, url: accessUrl, httpsUrl, httpUrl, plantLabel }
            }
        }));
    };

    const fetchDashboardStats = () => {
        if (!isAuthenticated) return;
        setIsRefreshingDB(true);
        fetch('/api/dashboard', {
            headers: {
                'x-plant-id': selectedPlant,
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        })
            .then(res => {
                if (res.status === 401) {
                    handle401();
                    throw new Error('Unauthorized');
                }
                return res.json();
            })
            .then(data => {
                setDbStats(data);
                setIsRefreshingDB(false);
            })
            .catch(err => {
                console.error('Failed to load stats:', err);
                setIsRefreshingDB(false);
            });
    };

    useEffect(() => {
        if (!isAuthenticated) return;
        fetchDashboardStats();
        // Fetch specific plant address
        fetch('/api/address', {
            headers: { 'x-plant-id': selectedPlant, 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        })
            .then(res => {
                if (res.status === 401) {
                    handle401();
                    throw new Error('Unauthorized');
                }
                return res.json();
            })
            .then(data => setPlantAddress(data.address))
            .catch(() => setPlantAddress('Address Unknown'));
    }, [selectedPlant, isAuthenticated]);

    const handlePlantChange = (e) => {
        const val = e.target.value;
        if (val === '_EDIT_LOCATIONS_') {
            setIsEditingLocations(true);
            return;
        }
        if (val === '_ADD_NEW_SITE_') {
            setIsEditingLocations(true);
            return;
        }
        setSelectedPlant(val);
        localStorage.setItem('selectedPlantId', val);
        // Removed window.location.reload() - stats useEffect will trigger on selectedPlant change
    };

    const handleBackup = async () => {
        try {
            const res = await fetch('/api/database/backup', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                window.trierToast?.success(`Database securely backed up to: ${data.file}`);
            } else {
                window.trierToast?.error(`Backup failed: ${data.error}`);
            }
        } catch (err) {
            window.trierToast?.error('Failed to execute backup.');
        }
    };

    const handleLogout = async () => {
        // Lock all open shift log entries for this user before logging out
        const currentUser = localStorage.getItem('currentUser');
        if (currentUser) {
            try {
                await fetch('/api/shift-log/lock', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                        'Content-Type': 'application/json',
                        'x-plant-id': selectedPlant || localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
                    },
                    body: JSON.stringify({ username: currentUser })
                });
            } catch (e) { /* best effort */ }
        }
        localStorage.removeItem('authToken');
        localStorage.removeItem('userRole');
        localStorage.removeItem('nativePlantId');
        localStorage.removeItem('selectedPlantId');
        localStorage.removeItem('currentUser');
        setIsAuthenticated(false);
        navigate('/'); // Go home after logout
    };

    // â”€â”€ Inactivity Auto-Logout (15 min idle â†’ lock entries â†’ force logout) â”€â”€
    const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
    const WARNING_BEFORE = 60 * 1000; // Show warning 60s before logout
    const [showIdleWarning, setShowIdleWarning] = useState(false);
    const idleTimerRef = React.useRef(null);
    const warningTimerRef = React.useRef(null);

    const resetIdleTimer = React.useCallback(() => {
        if (!isAuthenticated) return;
        setShowIdleWarning(false);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

        // Show warning 60s before auto-logout
        warningTimerRef.current = setTimeout(() => {
            setShowIdleWarning(true);
        }, INACTIVITY_TIMEOUT - WARNING_BEFORE);

        // Auto-logout after full timeout
        idleTimerRef.current = setTimeout(() => {
            console.log('[SECURITY] Inactivity auto-logout triggered');
            handleLogout();
        }, INACTIVITY_TIMEOUT);
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;
        const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
        events.forEach(evt => window.addEventListener(evt, resetIdleTimer, { passive: true }));
        resetIdleTimer(); // Start on mount

        return () => {
            events.forEach(evt => window.removeEventListener(evt, resetIdleTimer));
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        };
    }, [isAuthenticated, resetIdleTimer]);

    const currentPlantLabel = useMemo(() => {
        const found = Array.isArray(plants) ? plants.find(p => p.id === selectedPlant) : null;
        return found ? found.label : (selectedPlant || '').replace(/_/g, ' ');
    }, [plants, selectedPlant]);

    const [securityNotice, setSecurityNotice] = useState(null);
    const [showDemoHelp, setShowDemoHelp] = useState(false);

    // Periodic cache refresh every 15 minutes while authenticated
    // NOTE: This hook MUST be above the early return to avoid React hooks ordering violation
    useEffect(() => {
        if (!isAuthenticated) return;
        const interval = setInterval(() => {
            OfflineDB.fullCacheRefresh()
                .then(r => console.log('[OfflineDB] Periodic refresh:', r))
                .catch(() => { });
        }, 15 * 60 * 1000);
        return () => clearInterval(interval);
    }, [isAuthenticated]);

    // Keep ref in sync so handleGlobalHardwareScan doesn't need isScannerOpen in its deps
    useEffect(() => { isScannerOpenRef.current = isScannerOpen; }, [isScannerOpen]);

    // â”€â”€ Global Hardware Scanner Wedge (Zebra/Honeywell â€” active on EVERY page) â”€â”€
    const handleGlobalHardwareScan = useCallback(async (code) => {
        let cleanCode = code;
        try {
            if (cleanCode.includes('?scan=')) {
                cleanCode = cleanCode.split('?scan=')[1].split('&')[0];
            }
            cleanCode = decodeURIComponent(cleanCode);

            // Handle offline embedded payload rows from Zebra/rugged multi-line QR reads
            if (cleanCode.startsWith('ID: ')) {
                cleanCode = cleanCode.replace('ID: ', '').trim();
            } else if (cleanCode === '[TRIER OS ASSET]' || cleanCode.startsWith('Desc:') || cleanCode.startsWith('Model:') || cleanCode.startsWith('Plant:') || cleanCode.startsWith('Location:') || cleanCode.startsWith('Status:')) {
                return; // Silently drop metadata rows, only act on the ID row
            }
        } catch (e) {}

        // Flash the header scan button — confirms the app heard the scan on any page
        setHwScanFlash(true);
        setTimeout(() => setHwScanFlash(false), 600);

        // If GlobalScanner OR another scanner interceptor is open, inject directly — bypasses the hwPendingScan
        // prop path which would not re-fire useEffect if the same item is scanned twice.
        if (isScannerOpenRef.current || window.trierActiveScannerInterceptor) {
            window.dispatchEvent(new CustomEvent('hw-scan-inject', { detail: cleanCode }));
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            return;
        }

        const authHeaders = {
            'x-plant-id': selectedPlant || localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json',
        };

        // 1) Check maintenance parts
        try {
            const r = await fetch(`/api/parts/${encodeURIComponent(cleanCode)}`, { headers: authHeaders });
            const d = await r.json();
            if (r.ok && d.ID) {
                setHwPendingScan(cleanCode);
                setIsScannerOpen(true);
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                return;
            }
        } catch {}

        // 2) Check maintenance assets
        try {
            const r = await fetch(`/api/assets/${encodeURIComponent(cleanCode)}`, { headers: authHeaders });
            const d = await r.json();
            if (r.ok && d.ID) {
                setHwPendingScan(cleanCode);
                setIsScannerOpen(true);
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                return;
            }
        } catch {}

        // 3) Check IT assets (hardware, infrastructure, mobile)
        try {
            const r = await fetch('/api/it/scan/lookup', {
                method: 'POST', headers: authHeaders, body: JSON.stringify({ code: cleanCode })
            });
            const d = await r.json();
            if (d.found) {
                setHwScanResult({ ...d, scannedCode: cleanCode });
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                return;
            }
        } catch {}

        // 4) Nothing found — open GlobalScanner and let it handle registration flow
        setHwPendingScan(cleanCode);
        setIsScannerOpen(true);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }, [selectedPlant]);

    // Ensure deep links are preserved even if the user hits the Login screen
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const scanVal = params.get('scan');
        if (scanVal && !isAuthenticated) {
            sessionStorage.setItem('pendingScanDeepLink', scanVal);
            // Do not replace the URL yet so LoginView can read qDesc/qModel
        }
    }, [isAuthenticated]);

    // Handle deep link from regular mobile camera scanning a QR code URL
    useEffect(() => {
        if (!isAuthenticated) return;
        
        let targetScanId = null;
        const params = new URLSearchParams(window.location.search);
        
        if (params.get('scan')) {
            targetScanId = params.get('scan');
            window.history.replaceState({}, '', window.location.pathname);
        } else if (sessionStorage.getItem('pendingScanDeepLink')) {
            targetScanId = sessionStorage.getItem('pendingScanDeepLink');
            sessionStorage.removeItem('pendingScanDeepLink');
        }

        if (targetScanId) {
            // Simulate the hardware scan to parse and route the user to the correct asset
            setTimeout(() => handleGlobalHardwareScan(targetScanId), 700);
        }
    }, [isAuthenticated, handleGlobalHardwareScan]);

    useHardwareScanner(handleGlobalHardwareScan, isAuthenticated);


    // Public routes — accessible without login
    if (window.location.pathname === '/work-request') {
        return <WorkRequestPortal />;
    }

    if (!isAuthenticated) {
        return <LoginView onLoginSuccess={(data) => {
            setIsAuthenticated(true);
            const hasIntelAccess = ['it_admin', 'creator'].includes(data.userRole) || data.isCreator || data.globalAccess || data.intelAccess;
            const defaultPlant = hasIntelAccess ? 'all_sites' : (data.nativePlantId || 'Demo_Plant_1');

            setSelectedPlant(defaultPlant);
            localStorage.setItem('selectedPlantId', defaultPlant);
            if (data.intelAccess) localStorage.setItem('PF_INTEL_ACCESS', 'true');

            // Trigger offline data cache after login
            setTimeout(() => {
                OfflineDB.fullCacheRefresh((pct, msg) => {
                    console.log(`[OfflineDB] ${pct}% â€” ${msg}`);
                }).then(r => console.log('[OfflineDB] Initial cache complete:', r))
                    .catch(e => console.warn('[OfflineDB] Cache failed:', e.message));
            }, 2000);

            if (data?.mustChangePassword) {
                setTimeout(() => navigate('/settings'), 50);
                setSecurityNotice('Your password was recently reset by an administrator. You must create a new personal password before continuing.');
            } else {
                // Always land on Mission Control (Trier OS home)
                setTimeout(() => navigate('/'), 50);
            }
        }} />;
    }

    return (
        <DialogProvider>
        <ToastProvider>
        <>
            <DialogInterceptor />
            <OfflineStatusBar />
            <PwaInstallPrompt />
            <div className={`container ${mobileMode ? 'mobile-mode-force' : ''}`} title="Trier OS Main Container">
                {/* HEADER - Designed to match Trier Expenses EXACTLY */}
                <header className="no-print" title={t('app.applicationNavigationHeaderTip')} style={{ position: 'relative', zIndex: 100 }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto 1fr',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '0',
                        width: '100%',
                        maxWidth: 1400,
                        margin: '0 auto',
                    }}>
                        {/* â”€â”€ LEFT: Brand â€” Logo large, text block aligns with tile grid â”€â”€ */}
                        <div title="Trier OS" style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <img
                                src="/assets/TrierOS_Logo.png"
                                alt="Trier OS"
                                onClick={() => navigate('/')}
                                style={{
                                    cursor: 'pointer',
                                    height: '225px',
                                    width: 'auto',
                                    filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))',
                                    flexShrink: 0,
                                }}
                                title={t('app.missionControl', 'Mission Control')}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                <h1
                                    onClick={() => navigate('/')}
                                    style={{
                                        cursor: 'pointer', margin: 0,
                                        fontSize: 'clamp(1.3rem, 3vw, 1.8rem)',
                                        fontWeight: 800, letterSpacing: '-0.02em',
                                        lineHeight: 1.1,
                                    }}
                                    title={t('app.missionControl', 'Mission Control')}
                                >
                                    <span style={{ color: '#f1f5f9' }}>Trier</span>
                                    <span style={{ color: '#f59e0b', marginLeft: '8px' }}>OS<sup style={{ fontSize: '0.7em', marginLeft: '4px', color: '#f59e0b' }}>™</sup></span>
                                </h1>
                                <span style={{
                                    fontSize: '0.6rem', fontWeight: 600,
                                    color: '#64748b', letterSpacing: '0.12em',
                                    textTransform: 'uppercase', marginTop: 2,
                                }}>{t('app.subtitle', 'Enterprise Operations Platform')}</span>
                                <p style={{ margin: '4px 0 2px 0', fontSize: '0.65rem', color: '#94a3b8' }}>{t('app.selectPlant', 'Select Plant Location')}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                                    <select
                                        value={selectedPlant}
                                        onChange={handlePlantChange}
                                        title={t('app.selectPlantLocationTip')}
                                        style={{
                                            background: 'rgba(255,255,255,0.1)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: '#fff', padding: '2px 8px',
                                            borderRadius: '4px', fontSize: '0.8rem',
                                            cursor: 'pointer', minWidth: '150px'
                                        }}
                                    >
                                        {(isAdminOrCreator) && (
                                            <option value="_ADD_NEW_SITE_" style={{ fontWeight: 'bold', background: '#1e1e2d', color: '#10b981' }}>{t('app.addNewPlant', 'âž• Add New Plant...')}</option>
                                        )}
                                        {localStorage.getItem('userRole') === 'it_admin' && (
                                            <option value="_EDIT_LOCATIONS_" style={{ fontWeight: 'bold', background: '#1e1e2d', color: '#fff' }}>{t('app.editLocations', '-- Edit Locations --')}</option>
                                        )}
                                        {(hasGlobalAccess || isCreator || activeUserRole === 'it_admin' || localStorage.getItem('PF_INTEL_ACCESS') === 'true') && (
                                            <option value="all_sites" style={{ fontWeight: 'bold', background: '#1e1e2d', color: 'var(--primary)' }}>{t('app.corporateAllSites', 'Corporate (All Sites)')}</option>
                                        )}
                                        {plants.map(p => (
                                            <option key={p.id} value={p.id} style={{ background: '#1e1e2d', color: '#fff' }}>{p.label}</option>
                                        ))}
                                        {plants.length === 0 && <option value="Demo_Plant_1" style={{ background: '#1e1e2d', color: '#fff' }}>Demo Plant 1</option>}
                                    </select>
                                    <HelpCircle 
                                        size={16} 
                                        color="#f59e0b" 
                                        style={{ cursor: 'pointer', opacity: 0.8, transition: 'opacity 0.2s' }}
                                        onMouseEnter={(e) => e.target.style.opacity = '1'}
                                        onMouseLeave={(e) => e.target.style.opacity = '0.8'}
                                        onClick={() => setShowDemoHelp(!showDemoHelp)}
                                        title="Why are these plants here?"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* â”€â”€ CENTER: Scan + Bell + Shop Floor (Ghost Style) â”€â”€ */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifySelf: 'center' }}>
                            <button
                                onClick={() => setIsScannerOpen(true)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    gap: '6px', height: '36px', padding: '0 16px',
                                    borderRadius: '20px',
                                    border: hwScanFlash ? '1px solid rgba(16,185,129,0.9)' : '1px solid rgba(16,185,129,0.35)',
                                    fontSize: '0.8rem', fontWeight: '600', letterSpacing: '0.03em',
                                    background: hwScanFlash ? 'rgba(16,185,129,0.25)' : 'rgba(16,185,129,0.08)',
                                    color: '#34d399',
                                    cursor: 'pointer',
                                    transition: 'all 0.25s ease',
                                    backdropFilter: 'blur(8px)',
                                    boxShadow: hwScanFlash ? '0 0 12px rgba(16,185,129,0.5)' : 'none',
                                    position: 'relative',
                                }}
                                title="Scanner always active — tap to open or just scan with Zebra anytime"
                            >
                                {/* Always-on indicator dot */}
                                <span style={{
                                    position: 'absolute', top: '4px', right: '6px',
                                    width: '6px', height: '6px', borderRadius: '50%',
                                    background: '#10b981',
                                    boxShadow: '0 0 4px #10b981',
                                    animation: 'scannerPulse 2s infinite',
                                }} />
                                <Scan size={15} strokeWidth={2} />
                                <span>{t('header.scan')}</span>
                            </button>

                            <NotificationCenter plantId={selectedPlant} />

                            <button
                                onClick={toggleShopFloorMode}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    gap: '6px', height: '36px', padding: '0 16px',
                                    borderRadius: '20px',
                                    border: shopFloorMode
                                        ? '1px solid rgba(245,158,11,0.5)'
                                        : '1px solid rgba(99,102,241,0.3)',
                                    fontSize: '0.8rem', fontWeight: '600', letterSpacing: '0.03em',
                                    background: shopFloorMode
                                        ? 'rgba(245,158,11,0.12)'
                                        : 'rgba(99,102,241,0.08)',
                                    color: shopFloorMode ? '#fbbf24' : '#818cf8',
                                    cursor: 'pointer',
                                    transition: 'all 0.25s ease',
                                    backdropFilter: 'blur(8px)',
                                }}
                                title={t('app.toggleShopFloorModeTip')}
                            >
                                <Monitor size={15} strokeWidth={2} />
                                <span>{t('header.shopFloor')}</span>
                            </button>
                        </div>

                        {/* â”€â”€ RIGHT: Compact utility icons â”€â”€ */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifySelf: 'end' }}>
                            {/* Onboarding Setup Document â€” admin/creator only */}
                            {isAdminOrCreator && (
                                <button
                                    onClick={() => setIsInvitePopupOpen(true)}
                                    title={t('app.onboardingDocTip', 'Generate Invite Pass for new user registration')}
                                    style={{
                                        width: 42, height: 42, borderRadius: '10px', cursor: 'pointer',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        gap: '2px',
                                        background: isInvitePopupOpen ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.08)',
                                        border: isInvitePopupOpen ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(239, 68, 68, 0.25)',
                                        color: isInvitePopupOpen ? '#f59e0b' : '#f87171',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <UserPlus size={18} />
                                    <span style={{ fontSize: '0.4rem', fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1 }}>INVITE</span>
                                </button>
                            )}
                            <button 
                                onClick={() => navigate('/about?manual=true')}
                                title={t('app.operationalIntelligenceManualTip')}
                                style={{
                                    width: 42, height: 42, borderRadius: '10px', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    gap: '2px',
                                    background: activeTab === 'about' && location.search.includes('manual=true') ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                                    border: activeTab === 'about' && location.search.includes('manual=true') ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.08)',
                                    color: activeTab === 'about' && location.search.includes('manual=true') ? '#34d399' : '#94a3b8',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <BookOpen size={18} />
                                <span style={{ fontSize: '0.45rem', fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1 }}>{t('header.manual', 'MANUAL')}</span>
                            </button>
                            <button 
                                onClick={() => navigate('/about')}
                                title={t('app.aboutTrierOsTip')}
                                style={{
                                    width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: activeTab === 'about' && !location.search.includes('manual=true') ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                                    border: activeTab === 'about' && !location.search.includes('manual=true') ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.08)',
                                    color: activeTab === 'about' && !location.search.includes('manual=true') ? '#34d399' : '#94a3b8',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <Info size={16} />
                            </button>
                            <button 
                                onClick={() => setActiveTab('catalog')}
                                title={t('app.masterDataCatalogTip')}
                                style={{
                                    width: 42, height: 42, borderRadius: '10px', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    gap: '2px',
                                    background: activeTab === 'catalog' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
                                    border: activeTab === 'catalog' ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)',
                                    color: activeTab === 'catalog' ? '#818cf8' : '#94a3b8',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <LibraryBig size={18} />
                                <span style={{ fontSize: '0.45rem', fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1 }}>{t('header.catalog', 'CATALOG')}</span>
                            </button>
                            <button 
                                onClick={() => setActiveTab('settings')}
                                title={t('app.settingsTip')}
                                style={{
                                    width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: activeTab === 'settings' ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)',
                                    border: activeTab === 'settings' ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)',
                                    color: activeTab === 'settings' ? '#818cf8' : '#94a3b8',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <Settings size={16} />
                            </button>
                            {/* Live Studio -- Creator + IT Admin only */}
                            {(currentUsername === 'creator' || isCreator || activeUserRole === 'it_admin') && (
                                <button
                                    onClick={() => setIsLiveStudioOpen(true)}
                                    title={'Live Studio - In-App IDE'}
                                    style={{
                                        width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: 'rgba(99, 102, 241, 0.1)',
                                        border: '1px solid rgba(99, 102, 241, 0.25)',
                                        color: '#818cf8',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <Code size={15} />
                                </button>
                            )}
                            {/* System Console â€” ONLY for username 'creator' */}
                            {currentUsername === 'creator' && (
                                <button
                                    onClick={() => setIsCreatorConsoleOpen(true)}
                                    title={t('app.systemConsoleTip')}
                                    style={{
                                        width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: 'rgba(245, 158, 11, 0.1)',
                                        border: '1px solid rgba(245, 158, 11, 0.25)',
                                        color: '#f59e0b',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <Zap size={15} />
                                </button>
                            )}
                            <button
                                onClick={() => window.triggerTrierPrint('employee-badge', { name: currentUsername, role: activeUserRole, plant: currentPlantLabel })}
                                title="Print My ID Badge"
                                style={{
                                    width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(56, 189, 248, 0.1)',
                                    border: '1px solid rgba(56, 189, 248, 0.25)',
                                    color: '#38bdf8',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <IdCard size={15} />
                            </button>
                            <button
                                onClick={handleLogout}
                                title={t('app.logoutTip')}
                                style={{
                                    width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(239, 68, 68, 0.08)',
                                    border: '1px solid rgba(239, 68, 68, 0.15)',
                                    color: '#f87171',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <LogOut size={15} />
                            </button>
                            <button onClick={() => {
                                const idx = LANGUAGES.findIndex(l => l.code === lang);
                                const nextCode = LANGUAGES[(idx + 1) % LANGUAGES.length].code;
                                setLang(nextCode);
                                window.location.reload();
                            }} title={t('app.switchLanguageTip')} style={{
                                height: 36, borderRadius: 18, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px',
                                padding: '0 10px',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8',
                                transition: 'all 0.2s', userSelect: 'none'
                            }}>
                                <span>{LANGUAGES.find(l => l.code === lang)?.flag || '🇺🇸'}</span>
                                <span>{lang.toUpperCase()}</span>
                            </button>
                        </div>
                    </div>
                </header>

                {/* MAIN CONTENT AREA */}
                <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px',  }} title={t('app.primaryViewContainerTip')}>

                    {isForeignPlant && (
                        <div className="glass-card" style={{
                            background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '12px 20px',
                            borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)',
                            display: 'flex', alignItems: 'center', gap: '10px'
                        }}>
                            <AlertTriangle size={20} />
                            <div>
                                <strong>{t('app.readonlyAccess')}</strong> You are viewing a foreign location's database. Cross-site modifications are strictly disabled.
                            </div>
                        </div>
                    )}

                    <Routes>
                        <Route path="/about" element={<AboutView />} />
                        <Route path="/catalog" element={<CatalogViewer />} />
                        <Route path="/dashboard" element={
                            <DashboardView
                                selectedPlant={selectedPlant}
                                setSelectedPlant={setSelectedPlant}
                                plants={plants}
                                plantAddress={plantAddress}
                                globalSearchForm={globalSearchForm}
                                setGlobalSearchForm={setGlobalSearchForm}
                                globalSearchResults={globalSearchResults}
                                setGlobalSearchResults={setGlobalSearchResults}
                                setIsRefreshingDB={setIsRefreshingDB}
                                dbStats={dbStats}
                                setActiveTab={setActiveTab}
                                onEditLeadership={handleEditLeadership}
                                isAdminOrCreator={isAdminOrCreator}
                                hasGlobalAccess={hasGlobalAccess || localStorage.getItem('PF_INTEL_ACCESS') === 'true'}
                                isForeignPlant={isForeignPlant}
                                showDashboard={showDashboard}
                                onOpenOnboarding={() => setIsOnboarding(true)}
                            />
                        } />
                        <Route path="/jobs" element={<JobsView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/assets" element={<AssetsDashboard plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/parts" element={<PartsDashboard plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/procedures" element={<ProceduresDashboard plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/analytics" element={<AnalyticsDashboard plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/history" element={<HistoryDashboard plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/chat" element={<ChatView selectedPlant={selectedPlant} plants={plants} />} />
                        <Route path="/fleet" element={<FleetView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/safety" element={<SafetyView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/engineering-tools" element={<EngineeringView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/vendor-portal" element={<VendorPortalView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/tools" element={<ToolsView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/contractors" element={<ContractorsView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/loto" element={<LotoView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/compliance" element={<ComplianceView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/utilities" element={<UtilitiesView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/governance" element={<GovernanceView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/it-department" element={<ITRouteGuard><ITDepartmentView plantId={selectedPlant} plantLabel={currentPlantLabel} /></ITRouteGuard>} />
                        <Route path="/it-metrics" element={<ITRouteGuard><ITMetricsView plantId={selectedPlant} plantLabel={currentPlantLabel} /></ITRouteGuard>} />
                        <Route path="/it-global-search" element={<ITRouteGuard><ITGlobalSearchView /></ITRouteGuard>} />
                        <Route path="/it-alerts" element={<ITRouteGuard><ITAlertsView /></ITRouteGuard>} />
                        <Route path="/corp-analytics" element={<ITRouteGuard><CorporateAnalyticsView plantId={selectedPlant} plantLabel={currentPlantLabel} /></ITRouteGuard>} />
                        <Route path="/quality-log" element={<QualityDashboard plantId={selectedPlant} />} />
                        <Route path="/supply-chain" element={<SupplyChainView plantId={selectedPlant} />} />
                        <Route path="/floor-plans" element={<FloorPlanView plantId={selectedPlant} isAdmin={isAdminOrCreator} />} />
                        <Route path="/maps" element={<USMapView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/import-api" element={<ImportApiView currentPlant={selectedPlant} plantLabel={currentPlantLabel} userRole={activeUserRole} />} />
                        <Route path="/underwriter" element={<UnderwriterView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/storeroom" element={<StoreroomView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/training" element={<TrainingView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/work-request-portal" element={<WorkRequestPortal />} />
                        <Route path="/plant-setup" element={<PlantSetupView plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/plant-onboarding" element={<PlantOnboardingRoute plantId={selectedPlant} plantLabel={currentPlantLabel} />} />
                        <Route path="/portal/:groupKey" element={
                            <GroupPortalView
                                plantId={selectedPlant}
                                plantLabel={currentPlantLabel}
                                onOpenWorkspace={(workspace, title) => {
                                    setActiveTab(workspace);
                                }}
                                onBackToMC={() => navigate('/')}
                            />
                        } />
                        <Route path="/directory" element={<DirectoryView
                            plants={plants}
                            onEditLeadership={handleEditLeadership}
                            isAdminOrCreator={isAdminOrCreator}
                        />} />
                        <Route path="/admin-console" element={
                            <AdminConsoleView
                                plantId={selectedPlant}
                                plantLabel={currentPlantLabel}
                                plants={plants}
                            />
                        } />
                        <Route path="/settings" element={
                            <SettingsView
                                selectedPlant={selectedPlant}
                                plants={plants}
                                handleBackup={handleBackup}
                                setIsTaskListOpen={setIsTaskListOpen}
                            />
                        } />
                        <Route path="/" element={
                            <div className="glass-card" style={{ flex: 1, overflow: 'auto' }}>
                                <MissionControl
                                    plantId={selectedPlant}
                                    plantLabel={currentPlantLabel}
                                    userRole={effectiveRole}
                                    isCreator={!viewAsRole && isCreator}
                                    realUserRole={activeUserRole}
                                    realIsCreator={isCreator}
                                    onOpenWorkspace={(workspace, title) => {
                                        setActiveTab(workspace);
                                    }}
                                    onOpenScanner={() => setIsScannerOpen(true)}
                                />
                            </div>
                        } />
                    </Routes>
                </main >
            </div>

            {isEditingLocations && <LocationsEditor plants={plants} onClose={() => setIsEditingLocations(false)} onRefresh={fetchPlants} />}
            {leadershipEditConfig && (
                <LeadershipEditor
                    plantId={leadershipEditConfig.id}
                    plantLabel={leadershipEditConfig.label}
                    initialLeaders={leadershipEditConfig.leaders}
                    onClose={() => setLeadershipEditConfig(null)}
                    onSaved={fetchDashboardStats}
                />
            )}

            {isOnboarding && (
                <OnboardingWizard
                    onClose={() => setIsOnboarding(false)}
                    plantId={selectedPlant}
                    plantLabel={plants.find(p => p.id === selectedPlant)?.label || selectedPlant}
                />
            )}

            {showDemoHelp && (
                <div className="modal-overlay" onClick={() => setShowDemoHelp(false)} style={{ zIndex: 9999999 }}>
                    <div className="glass-card" onClick={e => e.stopPropagation()} style={{
                        width: '480px', maxWidth: '90vw', padding: '32px', background: 'rgba(20,20,35,0.98)', border: '1px solid rgba(245,158,11,0.6)',
                        borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.9)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '12px', color: '#f59e0b', fontWeight: 'bold', fontSize: '1.2rem', alignItems: 'center' }}>
                                <Info size={28} /> Open Source Demo Data
                            </div>
                            <button onClick={() => setShowDemoHelp(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', padding: '6px 16px', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 'bold', transition: 'background 0.2s' }} onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}>Close</button>
                        </div>
                        <div style={{ color: '#ffffff', fontSize: '1.05rem', lineHeight: '1.6' }}>
                            Plant 1 and Plant 2 are fully populated demo databases included so you can explore the analytics and features immediately.
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: '1rem', lineHeight: '1.6' }}>
                            You can safely delete them from the <strong>'Edit Locations'</strong> menu whenever you are ready to use the system in production and add your own facilities.
                        </div>
                    </div>
                </div>
            )}

            {isScannerOpen && (
                <GlobalScanner
                    plantId={selectedPlant}
                    plantLabel={currentPlantLabel}
                    initialScan={hwPendingScan}
                    onClose={() => { setIsScannerOpen(false); setHwPendingScan(null); }}
                />
            )}

            {isTaskListOpen && (
                <TaskListView
                    onClose={() => setIsTaskListOpen(false)}
                />
            )}

            {isCreatorConsoleOpen && <CreatorConsole isOpen={isCreatorConsoleOpen} onClose={() => setIsCreatorConsoleOpen(false)} />}
            {isLiveStudioOpen && <LiveStudio isOpen={isLiveStudioOpen} initialFile={studioInitialFile} onClose={() => { setIsLiveStudioOpen(false); setStudioInitialFile(null); }} />}

            {/* Global IT Asset Scan Result (from Zebra wedge scanner on any page) */}
            {hwScanResult && (
                <div className="modal-overlay" onClick={() => setHwScanResult(null)}>
                    <div className="glass-card" onClick={e => e.stopPropagation()} style={{ width: 500, padding: 30 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ margin: 0, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.1rem' }}>
                                <Scan size={20} /> IT Asset Detected
                            </h2>
                            <button onClick={() => setHwScanResult(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.2rem' }} title="Close">âœ•</button>
                        </div>
                        <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                            <div style={{ fontSize: '0.72rem', color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{hwScanResult.category} ASSET</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f1f5f9', marginTop: 4 }}>{hwScanResult.asset?.Name}</div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4, display: 'flex', gap: 12 }}>
                                <span>{t('app.sn')} <strong>{hwScanResult.asset?.SerialNumber || 'â€”'}</strong></span>
                                <span>{t('app.tag')} <strong>{hwScanResult.asset?.AssetTag || 'â€”'}</strong></span>
                                <span>{t('app.scan')} <strong style={{ color: '#06b6d4', fontFamily: 'monospace' }}>{hwScanResult.scannedCode}</strong></span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 6 }}>
                                Status: <strong>{hwScanResult.asset?.Status}</strong> Â· Location: <strong>{hwScanResult.asset?.Location || hwScanResult.asset?.PlantID || 'â€”'}</strong>
                                {hwScanResult.asset?.CurrentBookValue != null && <span> Â· Book Value: <strong style={{ color: '#10b981' }}>{'$' + parseFloat(hwScanResult.asset.CurrentBookValue).toLocaleString()}</strong></span>}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button className="btn-save" onClick={() => { setHwScanResult(null); navigate('/it-department'); }} style={{ flex: 1, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} title={t('app.goToItDepartmentForTip')}>
                                Open in IT Department
                            </button>
                            <button title="Navigate" className="btn-nav" onClick={() => setHwScanResult(null)} style={{ width: 80 }}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Styled Security Notice Modal â€” replaces browser alert() */}
            {securityNotice && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
                    zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: 'linear-gradient(145deg, #1e293b, #0f172a)',
                        border: '2px solid rgba(245, 158, 11, 0.4)',
                        borderRadius: '20px', padding: '32px', maxWidth: '460px', width: '100%',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(245, 158, 11, 0.15)',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: 'rgba(245, 158, 11, 0.1)', border: '2px solid rgba(245, 158, 11, 0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 20px', fontSize: '2rem'
                        }}>🔑</div>
                        <h2 style={{ margin: '0 0 8px 0', fontSize: '1.3rem', color: '#f59e0b' }}>
                            Security Notice
                        </h2>
                        <p style={{ margin: '0 0 24px 0', color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.6' }}>
                            {securityNotice}
                        </p>
                        <button 
                            onClick={() => setSecurityNotice(null)}
                            className="btn-primary"
                            style={{
                                padding: '12px 40px', fontSize: '1rem', fontWeight: '600',
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                borderRadius: '12px', border: 'none', cursor: 'pointer',
                                boxShadow: '0 4px 20px rgba(245, 158, 11, 0.3)'
                            }}
                            title={t('app.acknowledgeThisSecurityNoticeAndTip')}
                        >
                            Update My Password
                        </button>
                    </div>
                </div>
            )}

            {/* Inactivity Warning Banner */}
            {showIdleWarning && isAuthenticated && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99998,
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(217, 119, 6, 0.95))',
                    padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '16px', animation: 'pulse 2s infinite',
                    boxShadow: '0 4px 20px rgba(245, 158, 11, 0.4)'
                }}>
                    <span style={{ color: '#000', fontWeight: 700, fontSize: '0.9rem' }}>
                        âš ï¸ Session expiring in 60 seconds due to inactivity
                    </span>
                    <button
                        onClick={resetIdleTimer}
                        style={{
                            background: '#000', color: '#f59e0b', border: 'none', borderRadius: '8px',
                            padding: '6px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem'
                        }}
                        title={t('app.clickToResetTheInactivityTip')}
                    >
                        Stay Logged In
                    </button>
                </div>
            )}

            {/* Interactive Onboarding Tour â€” Task 4.4 */}
            {isAuthenticated && <OnboardingTour />}
            {isAuthenticated && <ContextualTour />}

            {/* Portal Widget â€” visible from every workspace, NOT on Mission Control */}
            {activeTab !== '' && location.pathname !== '/' && (
                <PortalWidget
                    onWarpHome={() => navigate('/')}
                />
            )}

            {/* Invite Pass Popup */}
            <InvitePassPopup
                isOpen={isInvitePopupOpen}
                onClose={() => setIsInvitePopupOpen(false)}
                plantId={selectedPlant}
                plantLabel={plants.find(p => p.id === selectedPlant)?.label || selectedPlant}
                plants={plants}
            />

            {/* Print Portal — renders directly into document.body (outside #root) so #root can be hidden during @media print */}
            {printRequest && createPortal(
                <div className="print-only-wrapper">
                    <PrintEngine
                        type={printRequest.type}
                        data={printRequest.data}
                        plantLabel={plants.find(p => p.id === selectedPlant)?.label || selectedPlant.replace('_', ' ')}
                        branding={branding}
                    />
                </div>,
                document.body
            )}
        </>
        </ToastProvider>
        </DialogProvider>
    );
}

export default App;
