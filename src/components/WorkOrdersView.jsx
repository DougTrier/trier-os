// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Work Orders Management View
 * ==========================================
 * Primary work order management interface — the most heavily used
 * component in the application. Manages the full WO lifecycle from
 * creation to close-out for maintenance technicians and supervisors.
 *
 * KEY FEATURES:
 *   Table View        — Searchable/sortable WO list with status color-coding
 *   Create Wizard     — New WO form with asset linking, priority, and scheduling
 *   Detail Panel      — Edit all WO fields; status workflow with validation gates
 *   Labor Tracking    — Log actual hours per technician vs. estimated
 *   Parts Consumption — Add parts from storeroom; quantity deducted on save
 *   Close-Out Wizard  — Guided closure: resolution notes, downtime, follow-ups
 *   Print / PDF       — Full work order printout via PrintEngine
 *   GPS Capture       — Mobile technicians record job-site location
 *   Voice Notes       — Push-to-talk audio notes via PushToTalkButton
 *   Attachments       — Photo/file attachments per WO via WOAttachments
 *   Failure Codes     — FCR (Failure / Cause / Remedy) code entry
 *   Draft Auto-Save   — DraftManager saves in-progress edits every 60 seconds
 *
 * FILTER PROPS: Can be mounted with statusFilter / priorityFilter to pre-filter
 *   the list — used by HistoryDashboard (completed WOs) and PM history views.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Filter, RefreshCw, Plus, ChevronLeft, ChevronRight, X, Printer, PenTool, AlertTriangle, ClipboardList, Eye, Network, ChevronDown, Folder, Layers, Info, Package, MapPin } from 'lucide-react';
import ActionBar from './ActionBar';
import WorkTaskChecklist from './WorkTaskChecklist';
import CloseOutWizard from './CloseOutWizard';
import PushToTalkButton from './PushToTalkButton';
import WOAttachments from './WOAttachments';
import FailureCodes from './FailureCodes';
import DraftManager from '../utils/DraftManager';
import useGPS from '../hooks/useGPS';
import { useTranslation } from '../i18n/index.jsx';
import { statusClass, formatDate } from '../utils/formatDate';


export default function WorkOrdersView({ plantId, searchTerm, statusFilter: initialStatus = '', priorityFilter: initialPriority = '', typeFilter: initialType = '', assetFilter: initialAsset = '', calendarAction, onCalendarActionHandled }) {
    const { t, lang } = useTranslation();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
    const [selectedWO, setSelectedWO] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [editData, setEditData] = useState({});
    const [v2Tasks, setV2Tasks] = useState([]);
    const [v2Objects, setV2Objects] = useState([]);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'tree'
    const [hierarchy, setHierarchy] = useState([]);
    const [expandedNodes, setExpandedNodes] = useState(new Set());
    const [showHelp, setShowHelp] = useState(false);
    const [loadingV2, setLoadingV2] = useState(false);
    const [relatedOrders, setRelatedOrders] = useState([]);
    const [showWizard, setShowWizard] = useState(false);
    const [availableDraft, setAvailableDraft] = useState(null); // { key, data }
    const gps = useGPS(); // GPS Location Logging (Feature 1)

    // ── Failure Mode Library (Feature 3) ──────────────────────────
    const [failureModes, setFailureModes] = useState([]);

    // ── Warranty Status (Feature 9) ──────────────────────────────
    const [warrantyInfo, setWarrantyInfo] = useState(null);

    // ── Record Locking ────────────────────────────────────────────
    const [lockInfo, setLockInfo] = useState(null); // { lockedBy, lockedAt, expiresAt } when someone else holds the lock
    const lockHeartbeatRef = React.useRef(null);
    const currentUserName = localStorage.getItem('userName') || localStorage.getItem('userDisplayName') || 'Unknown';

    const acquireLock = async (recordId) => {
        try {
            const res = await fetch('/api/locks/acquire', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recordType: 'work_order', recordId: String(recordId), userName: currentUserName })
            });
            const data = await res.json();
            if (data.locked) {
                setLockInfo(null);
                // Start heartbeat to keep lock alive
                if (lockHeartbeatRef.current) clearInterval(lockHeartbeatRef.current);
                lockHeartbeatRef.current = setInterval(async () => {
                    try {
                        await fetch('/api/locks/heartbeat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ recordType: 'work_order', recordId: String(recordId), userName: currentUserName })
                        });
                    } catch (e) { /* heartbeat failure is non-fatal */ }
                }, 3 * 60 * 1000); // Every 3 minutes (lock expires at 5 min)
                return true;
            } else {
                // Only show lock banner if there's a real username holding the lock
                if (data.lockedBy) {
                    setLockInfo({ lockedBy: data.lockedBy, lockedAt: data.lockedAt, expiresAt: data.expiresAt });
                }
                return false;
            }
        } catch (err) {
            console.error('Lock acquire failed:', err);
            return true; // On network error, allow editing (graceful degradation)
        }
    };

    const releaseLock = async (recordId) => {
        if (lockHeartbeatRef.current) { clearInterval(lockHeartbeatRef.current); lockHeartbeatRef.current = null; }
        try {
            await fetch('/api/locks/release', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recordType: 'work_order', recordId: String(recordId), userName: currentUserName })
            });
        } catch (e) { /* release failure is non-fatal */ }
        setLockInfo(null);
    };

    // Clean up heartbeat on unmount
    React.useEffect(() => {
        return () => { if (lockHeartbeatRef.current) clearInterval(lockHeartbeatRef.current); };
    }, []);


    // Read-only unlock state
    const activeRole = localStorage.getItem('userRole');
    const isCreator = localStorage.getItem('PF_USER_IS_CREATOR') === 'true';
    const hasFullAdminAccess = activeRole === 'it_admin' || activeRole === 'creator' || isCreator;

    const isForeignPlant = !hasFullAdminAccess &&
        localStorage.getItem('nativePlantId') &&
        localStorage.getItem('selectedPlantId') !== localStorage.getItem('nativePlantId');
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [unlockPassword, setUnlockPassword] = useState('');
    const [unlockError, setUnlockError] = useState('');
    const [unlockAction, setUnlockAction] = useState(null); // 'new' | 'edit' | 'delete'

    // Lookup data
    const [statuses, setStatuses] = useState([]);
    const [users, setUsers] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [assets, setAssets] = useState([]);

    // Filters
    const debouncedSearch = searchTerm;
    const [statusFilter, setStatusFilter] = useState(initialStatus);
    const [priorityFilter, setPriorityFilter] = useState(initialPriority);
    const [typeFilter, setTypeFilter] = useState(initialType);
    const [assetFilter, setAssetFilter] = useState(initialAsset);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [userFilter, setUserFilter] = useState('');

    useEffect(() => {
        // Fetch lookup data
        Promise.all([
            fetch('/api/lookups/wo-statuses', { cache: 'no-store' }).then(r => r.json()),
            fetch('/api/lookups/users', { cache: 'no-store' }).then(r => r.json()),
            fetch('/api/lookups/assignments', { cache: 'no-store' }).then(r => r.json()),
            fetch('/api/lookups/assets', { cache: 'no-store' }).then(r => r.json()),
            fetch('/api/failure-modes', { cache: 'no-store' }).then(r => r.json()).catch(() => [])
        ]).then(([statusData, userData, assignData, assetData, fmData]) => {
            setStatuses(statusData || []);
            setUsers(userData || []);
            setAssignments(assignData || []);
            setAssets(assetData || []);
            setFailureModes(fmData || []);
        }).catch(err => console.error('Error fetching lookups:', err));
    }, []);

    const fetchHierarchy = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                search: debouncedSearch || '',
                status: statusFilter || '',
                priority: priorityFilter || ''
            });
            const res = await fetch(`/api/v2/work-orders/hierarchy?${params}`);
            const data = await res.json();
            
            // Build hierarchy grouping logic
            const buildTree = (items) => {
                const groups = {};
                const standalone = [];

                items.forEach(item => {
                    const groupKey = item.ProjID || (parseInt(item.Priority, 10) >= 200 ? `PM Group ${item.Priority}` : null);
                    
                    if (groupKey) {
                        if (!groups[groupKey]) {
                            groups[groupKey] = {
                                ID: `GROUP-${groupKey}`,
                                Description: groupKey,
                                isFolder: true,
                                children: []
                            };
                        }
                        groups[groupKey].children.push(item);
                    } else {
                        standalone.push(item);
                    }
                });

                return [...Object.values(groups), ...standalone];
            };

            setHierarchy(buildTree(data));
        } catch (err) {
            console.error('Failed to load WO hierarchy:', err);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, statusFilter, priorityFilter, plantId]);

    const fetchWorkOrders = useCallback(async (pageToLoad = meta.page) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: pageToLoad,
                limit: meta.limit,
                search: debouncedSearch || '',
                status: statusFilter || '',
                priority: priorityFilter || '',
                type: typeFilter || '',
                asset: assetFilter || '',
                startDate: startDate || '',
                endDate: endDate || '',
                user: userFilter || ''
            });
            const res = await fetch(`/api/work-orders?${params}`, {
                headers: { 'x-plant-id': plantId }
            });
            const data = await res.json();

            setOrders(data.data || []);
            setMeta(data.pagination || data.meta || { page: 1, limit: 50, total: 0, totalPages: 1 });
        } catch (err) {
            console.error('Failed to query work orders:', err);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, statusFilter, priorityFilter, typeFilter, assetFilter, startDate, endDate, userFilter, meta.limit, plantId, lang]);


    useEffect(() => {
        if (viewMode === 'list') {
            fetchWorkOrders(1);
        } else {
            fetchHierarchy();
        }
    }, [debouncedSearch, statusFilter, priorityFilter, typeFilter, startDate, endDate, userFilter, viewMode, fetchWorkOrders, fetchHierarchy, plantId, lang]);

    // Work Order Draft Persistence
    useEffect(() => {
        if (isEditing && editData && !loadingDetails) {
            const dKey = isCreating ? 'NEW_WO' : `EDIT_WO_${editData.ID}`;
            DraftManager.save(dKey, { 
                editData,
                isCreating,
                v2Tasks: editData._v2Tasks || v2Tasks,
                v2Objects: editData._v2Objects || v2Objects
            }, plantId);
        }
    }, [editData, isEditing, isCreating, v2Tasks, v2Objects, plantId, loadingDetails]);

    // PF_NAV: Specialized Auto-Open Logic
    useEffect(() => {
        const pendingViewId = localStorage.getItem('PF_NAV_VIEW');
        if (pendingViewId && orders.length > 0) {
            // Find by primary key (ID) or alternatively by WorkOrderNumber
            const found = orders.find(o =>
                String(o.ID) === String(pendingViewId) ||
                String(o.WorkOrderNumber) === String(pendingViewId)
            );

            if (found) {
                handleView(found.ID_INTERNAL || found.ID); // Favor internal stable handle
                localStorage.removeItem('PF_NAV_VIEW');
            }
        }
    }, [orders]);

    // Handle calendar action (Create WO from calendar double-click)
    useEffect(() => {
        let active = true;
        if (calendarAction && calendarAction.action === 'new-wo') {
            // Auto-trigger new WO creation with pre-filled date
            (async () => {
                try {
                    const res = await fetch('/api/work-orders/next-id');
                    const { nextID } = await res.json();
                    const blankWO = {
                        ID: nextID || '',
                        Description: '',
                        AstID: '',
                        StatusID: 'OPEN',
                        Priority: '2',
                        AddDate: calendarAction.date || new Date().toISOString().split('T')[0],
                        SchDate: calendarAction.date || '',
                        ExpectedDuration: '',
                        Comment: `[Created from Calendar: ${calendarAction.date}]`,
                        RequestBy: '',
                        AssignToID: '',
                        AddedDate: calendarAction.date || new Date().toISOString().split('T')[0]
                    };
                    setSelectedWO(blankWO);
                    setEditData(blankWO);
                    setV2Tasks([]);
                    setV2Objects([]);
                    setIsCreating(true);
                    setIsEditing(true);
                } catch (err) {
                    console.error('Calendar WO creation failed:', err);
                }
            })();
            if (onCalendarActionHandled) onCalendarActionHandled();
        }
        return () => { active = false; };
    }, [calendarAction]);

    const handleView = async (id) => {
        if (!id) {
            console.warn('Attempted to view Work Order with null/undefined ID');
            return;
        }
        setIsEditing(false);
        setIsCreating(false);
        setLockInfo(null);
        setLoadingDetails(true);
        try {
            const res = await fetch(`/api/work-orders/${id}`);
            const data = await res.json();
            setSelectedWO(data);
            setEditData(data);
            
            // FETCH V2 TASKS & RELATED ORDERS - New Integration
            setLoadingV2(true);
            const safeFetchJson = async (url) => {
                try {
                    const r = await fetch(url);
                    if (!r.ok) return [];
                    const text = await r.text();
                    if (!text || text.trim().startsWith('<!DOCTYPE')) return [];
                    return JSON.parse(text);
                } catch (e) { return []; }
            };

            Promise.all([
                safeFetchJson(`/api/v2/work-orders/${id}/tasks`),
                safeFetchJson(`/api/v2/work-orders/${id}/objects`),
                safeFetchJson(`/api/v2/work-orders/${id}/related`)
            ]).then(([taskData, objectData, relatedData]) => {
                setV2Tasks(taskData || []);
                setV2Objects(objectData || []);
                setRelatedOrders(relatedData || []);
                setLoadingV2(false);
            }).catch(err => {
                console.error('V2 Data Fetch Error:', err);
                setLoadingV2(false);
            });


        } catch (err) {
            console.error('Failed to load work order details:', err);
        } finally {
            setLoadingDetails(false);
        }

    };

    const handleNew = async () => {
        if (isForeignPlant && !window.__TRIER_OVERRIDE_PASS__) {
            setUnlockAction('new');
            setShowUnlockModal(true);
            return;
        }
        try {
            const res = await fetch('/api/work-orders/next-id');
            const { nextID } = await res.json();

            const blankWO = {
                ID: nextID || '',
                Description: '',
                AstID: '',
                StatusID: 'OPEN',
                Priority: '2',
                AddDate: new Date().toISOString().split('T')[0],
                ExpectedDuration: '',
                Comment: '',
                RequestBy: '',
                AssignToID: '',
                AddedDate: new Date().toISOString().split('T')[0]
            };

            // Non-blocking draft check
            const draft = DraftManager.get('NEW_WO', plantId);
            if (draft) {
                setAvailableDraft({ key: 'NEW_WO', data: draft });
                // We still open the blank one, but show the restore option
            }

            setSelectedWO(blankWO);
            setEditData(blankWO);
            setV2Tasks([]);
            setV2Objects([]);
            
            setIsCreating(true);
            setIsEditing(true);
        } catch (err) {
            console.error('Failed to prepare new work order:', err);
        }
    };

    const handleUnlockSubmit = async (e) => {
        e.preventDefault();
        setUnlockError('');
        try {
            const res = await fetch('/api/auth/verify-override', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plantId: localStorage.getItem('selectedPlantId'),
                    password: unlockPassword
                })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                window.__TRIER_OVERRIDE_PASS__ = unlockPassword;
                setShowUnlockModal(false);
                setUnlockPassword('');
                if (unlockAction === 'new') handleNew();
                else if (unlockAction === 'edit') handleEditClick();
            } else {
                setUnlockError(data.error || 'Incorrect password for this location.');
            }
        } catch (err) {
            setUnlockError('Network error checking password.');
        }
    };

    const handlePrint = () => {
        if (selectedWO) {
            window.triggerTrierPrint('work-order', { 
                ...selectedWO, 
                _v2Tasks: v2Tasks, 
                _v2Objects: v2Objects,
                _isLocked: isForeignPlant 
            });
        } else {
            // New: Specialized Work Order Catalog Print
            window.triggerTrierPrint('catalog-internal', { type: 'work-orders', 
                items: orders 
            });
        }
    };



    const handleEditClick = async () => {
        if (isForeignPlant && !window.__TRIER_OVERRIDE_PASS__) {
            setUnlockAction('edit');
            setShowUnlockModal(true);
            return;
        }
        
        // Check for existing draft - Non-blocking UI
        const draftKey = `EDIT_WO_${selectedWO.ID}`;
        const draft = DraftManager.get(draftKey, plantId);
        
        if (draft) {
            setAvailableDraft({ key: draftKey, data: draft });
        }

        setEditData({ 
            ...selectedWO, 
            _v2Tasks: v2Tasks || [], 
            _v2Objects: v2Objects || [] 
        });

        // ── Record Lock: Try to acquire before entering edit mode ──
        const woId = selectedWO.ID || selectedWO.WorkOrderNumber;
        const gotLock = await acquireLock(woId);
        if (!gotLock) {
            // Someone else has the lock — don't enter edit mode
            return;
        }
        
        setIsEditing(true);
    };

    const handleDelete = async () => {
        if (!selectedWO) return;
        
        if (isForeignPlant && !window.__TRIER_OVERRIDE_PASS__) {
            setUnlockAction('delete');
            setShowUnlockModal(true);
            return;
        }

        if (!await confirm(`Are you sure you want to delete Work Order ${selectedWO.WorkOrderNumber || selectedWO.ID}?`)) return;

        try {
            const id = selectedWO.ID || selectedWO.rowid;
            const res = await fetch(`/api/work-orders/${id}`, {
                method: 'DELETE',
                headers: { 'x-plant-id': plantId }
            });

            if (res.ok) {
                window.trierToast?.success(`Work Order ${selectedWO.WorkOrderNumber || selectedWO.ID} deleted`);
                setSelectedWO(null);
                fetchWorkOrders(meta.page);
            } else {
                window.trierToast?.error('Failed to delete work order.');
            }
        } catch (err) {
            console.error('Error deleting work order:', err);
            window.trierToast?.error('Delete failed.');
        }
    };


    const handleAddUser = async () => {
        const name = await window.prompt('Enter new User or Team name:');
        if (!name) return;

        try {
            const res = await fetch('/api/lookups/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: name.trim().toUpperCase(),
                    label: name.trim()
                })
            });

            if (res.ok) {
                // Refresh lookups
                const [userData, assignData] = await Promise.all([
                    fetch('/api/lookups/users', { cache: 'no-store' }).then(r => r.json()),
                    fetch('/api/lookups/assignments', { cache: 'no-store' }).then(r => r.json())
                ]);
                setUsers(userData || []);
                setAssignments(assignData || []);
                window.trierToast?.success(`Added user "${name}"`);
            } else {
                const data = await res.json();
                window.trierToast?.error(data.error || 'Failed to create user');
            }
        } catch (err) {
            console.error('Failed to create user:', err);
            window.trierToast?.error('Error creating user.');
        }
    };

    const handleSave = async () => {
        try {
            // Remove linked array structures that aren't on the backend schema for updates/creation
            const { _parts, _tasks, _labor, _misc, ...payload } = editData;

            if (isCreating && !payload.ID) {
                window.trierToast?.warn('Work Order # is required');
                return;
            }

            const url = isCreating ? '/api/work-orders' : `/api/work-orders/${editData.ID}`;
            const method = isCreating ? 'POST' : 'PUT';

            // ── GPS Location Logging (Feature 1) ──
            // Silently capture GPS coords when status changes to Started or Completed
            let gpsData = {};
            if (!isCreating) {
                const statusStr = String(payload.StatusID || '').toLowerCase();
                const isStarting = ['20', 'started', 'in progress'].includes(statusStr);
                const isCompleting = ['40', '50', 'completed', 'complete', 'closed'].includes(statusStr);
                
                // Only automatically trigger GPS logging on mobile devices to prevent desktop popups
                const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
                
                if ((isStarting || isCompleting) && isMobile) {
                    try {
                        const coords = await gps.capture();
                        if (coords) {
                            gpsData = {
                                _gpsLat: coords.lat,
                                _gpsLng: coords.lng,
                                _gpsAccuracy: coords.accuracy
                            };
                        }
                    } catch (e) { /* GPS failure never blocks save */ }
                }
            }
            if (!isCreating) {
                await Promise.all([
                    fetch(`/api/v2/work-orders/${editData.ID}/tasks`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tasks: editData._v2Tasks || v2Tasks })
                    }),
                    fetch(`/api/v2/work-orders/${editData.ID}/objects`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ objects: editData._v2Objects || v2Objects })
                    })
                ]);
            }

            const res = await fetch(url, {

                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, ...gpsData })
            });

            if (res.ok) {
                if (isCreating) {
                    fetchWorkOrders(1); // Refresh list
                } else {
                    // Update list in-place
                    setOrders(orders.map(o => o.ID === editData.ID ? { ...o, ...payload } : o));
                }

                setSelectedWO({ ...selectedWO, ...payload });
                
                // Clear draft on successful save
                const dKey = isCreating ? 'NEW_WO' : `EDIT_WO_${editData.ID}`;
                DraftManager.clear(dKey, plantId);
                
                window.trierToast?.success(isCreating ? `Work Order ${editData.ID} created` : `Work Order ${editData.ID} saved`);

                setIsEditing(false);
                setIsCreating(false);

                // ── Release the record lock on successful save ──
                const lockId = editData.ID || editData.WorkOrderNumber;
                if (lockId && !isCreating) releaseLock(lockId);
            } else {
                const data = await res.json();
                window.trierToast?.error(data.error || 'Failed to save work order.');
            }
        } catch (err) {
            console.error('Failed to save work order:', err);
        }

        // Reset override
        window.__TRIER_OVERRIDE_PASS__ = null;
    };

    return (
        <>
            <div className="glass-card" style={{ padding: 'var(--card-padding)', flex: 1, display: 'flex', flexDirection: 'column' }} title={t('work.orders.workOrdersManagementDatabase')}>
            <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} title={t('work.orders.maintenanceRequestControlCenter')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <h2 style={{ fontSize: '1.2rem' }} title={t('work.orders.listOfAllMaintenance')}>{t('work.orders.workOrdersDatabase')}</h2>

                    {/* Date Filters Moved Up */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '4px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }} title={t('work.orders.filterRecordsByRequest')}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>{t('work.orders.from')}</span>
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            style={{ width: '130px', background: 'transparent', border: 'none', fontSize: '0.85rem' }}
                            title={t('work.orders.startOfTheReporting')}
                        />
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', marginLeft: '5px' }}>{t('work.orders.to')}</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            style={{ width: '130px', background: 'transparent', border: 'none', fontSize: '0.85rem' }}
                            title={t('work.orders.endOfTheReporting')}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => fetchWorkOrders()} className="btn-primary btn-sm" title={t('work.orders.forceRefreshTheWork')}>
                        <RefreshCw size={18} className={loading ? 'spinning' : ''} />
                    </button>
                    <button className="btn-primary btn-sm" onClick={handlePrint} title={t('work.orders.printTheCurrentWorkOrderTip')}>
                        <Printer size={16} /> {t('work.orders.printList')}
                    </button>
                    <button
                        className={isForeignPlant ? 'btn-secondary btn-sm' : 'btn-save'}
                        onClick={handleNew}
                        title={isForeignPlant ? t('work.orders.unlockToAddNewWo') : t('work.orders.initiateANewMaintenanceServiceRequest')}
                    >
                        <Plus size={18} title={t('work.orders.plusIcon')} /> {t('work.orders.newWo')}
                    </button>
                </div>
            </div>

            {/* Multi-Search & Filtering Row */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }} title={t('work.orders.advancedFilteringSuite')}>

                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px', border: '1px solid var(--glass-border)' }}>
                    <button 
                        onClick={() => setViewMode('list')}
                        style={{ 
                            padding: '6px 15px', 
                            fontSize: '0.85rem', 
                            border: 'none', 
                            borderRadius: '6px',
                            background: viewMode === 'list' ? 'var(--primary)' : 'transparent',
                            color: viewMode === 'list' ? '#fff' : 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        title={t('work.orders.standardFlatListOfAllTip')}
                    >
                        {t('work.orders.listView')}
                    </button>
                    <button 
                        onClick={() => setViewMode('tree')}
                        style={{ 
                            padding: '6px 15px', 
                            fontSize: '0.85rem', 
                            border: 'none', 
                            borderRadius: '6px',
                            background: viewMode === 'tree' ? 'var(--primary)' : 'transparent',
                            color: viewMode === 'tree' ? '#fff' : 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px'
                        }}
                        title={t('work.orders.groupWorkOrdersByProjectTip')}
                    >
                        <Layers size={14} /> {t('work.orders.suborders')}
                    </button>
                </div>

                    <button 
                    onClick={() => setShowHelp(true)}
                    className="btn-secondary btn-icon" 
                    style={{ borderRadius: '50%', width: '40px', height: '40px' }}
                    title={t('work.orders.helpScenarios')}
                >
                    <Info size={20} />
                </button>

                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    style={{ minWidth: '150px' }}
                    title={t('work.orders.narrowByWorkOrder')}
                >
                    <option value="">{t('work.orders.allStatuses')}</option>
                    {statuses.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                </select>

                <select
                    value={priorityFilter}
                    onChange={e => setPriorityFilter(e.target.value)}
                    style={{ minWidth: '130px' }}
                    title={t('work.orders.filterBySeverityLevel')}
                >
                    <option value="">{t('work.orders.allPriorities')}</option>
                    <option value="1">{t('work.orders.criticalEmergency')}</option>
                    <option value="2">{t('work.orders.mediumPriority')}</option>
                    <option value="3">{t('work.orders.routineMaintenance')}</option>
                    <option value="4">{t('work.orders.lowPriority')}</option>
                </select>

                {/* User Filter where dates used to be */}
                <select
                    value={userFilter}
                    onChange={e => {
                        if (e.target.value === 'ADD_NEW') {
                            handleAddUser();
                        } else {
                            setUserFilter(e.target.value);
                        }
                    }}
                    style={{ minWidth: '180px', border: '1px solid var(--primary)', boxShadow: '0 0 5px rgba(59, 130, 246, 0.3)' }}
                    title={t('work.orders.filterByAssignedTechnician')}
                >
                    <option value="">{t('work.orders.allAssignedUsers')}</option>
                    <option value="ADD_NEW" style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{t('work.orders.addNewAssignment', '+ Add New Assignment...')}</option>
                    <hr />
                    {users.map(u => (
                        <option key={u.id} value={u.id}>{u.label} {t('work.orders.technicianSuffix', '(Technician)')}</option>
                    ))}
                    {assignments.length > 0 && <hr />}
                    {assignments.map(a => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                </select>
            </div>

            {/* Data Table */}
            <div style={{ border: '1px solid var(--glass-border)', borderRadius: '8px' }} title={t('work.orders.primaryTaskTable')}>
                {viewMode === 'list' ? (
                <table className="data-table" title={t('work.orders.tableOfActiveMaintenance')}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1, backdropFilter: 'blur(10px)' }} title={t('work.orders.sortableColumnHeaders')}>
                        <tr>
                            <th title={t('work.orders.officialReferenceNumber')}>{t('work.orders.wo')}</th>
                            <th title={t('work.orders.workRequestSummary')}>{t('work.orders.description')}</th>
                            <th className="hide-mobile" title={t('work.orders.targetEquipmentCode')}>{t('work.orders.assetId')}</th>
                            <th className="hide-mobile" title={t('work.orders.entryTimestamp')}>{t('work.orders.addedDate')}</th>
                            <th className="hide-mobile" title={t('work.orders.provisionedLaborTime')}>{t('work.orders.expectedDuration')}</th>
                            <th title={t('work.orders.workflowState')}>{t('wo.status')}</th>
                            <th title={t('work.orders.priorityScale')}>{t('wo.priority')}</th>
                            <th style={{ textAlign: 'right' }} title={t('work.orders.managementActions')}>{t('work.orders.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    <RefreshCw className="spinning" size={24} style={{ marginBottom: '10px' }} />
                                    <p>{t('work.orders.queryingDatabase')}</p>
                                </td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    {t('work.orders.noWorkOrdersFound')}
                                </td>
                            </tr>
                        ) : (
                            orders.map(wo => (
                                <tr key={`${wo.plantId || 'local'}-${wo.ID_INTERNAL || wo.ID}`} title={`${t('work.orders.taskDetails')}: ${wo.ID_INTERNAL}`}>
                                    <td style={{ fontWeight: 600, color: 'var(--primary)', cursor: 'pointer' }} onClick={() => handleView(wo.ID_INTERNAL || wo.ID)} title={`${t('work.orders.orderId')}: ${wo.ID || wo.WorkOrderNumber}`}>{wo.ID || wo.WorkOrderNumber || '--'}</td>
                                    <td style={{ maxWidth: '300px', wordBreak: 'break-word' }} title={wo.Description}>
                                        {wo.Description}
                                    </td>
                                    <td className="hide-mobile" style={{ fontFamily: 'monospace' }} title={`${t('work.orders.associatedEquipment')}: ${wo.AstID || 'General'}`}>{wo.AstID || '--'}</td>
                                    <td className="hide-mobile" title={`${t('work.orders.originDate')}: ${wo.AddDate}`}>{formatDate(wo.AddDate) || '--'}</td>
                                    <td className="hide-mobile" style={{ fontWeight: 'bold' }} title={`${t('work.orders.projectedMaintenanceTime')}: ${wo.ExpectedDuration || t('work.orders.notDefined', 'Not Defined')}`}>{wo.ExpectedDuration ? (isNaN(wo.ExpectedDuration) ? wo.ExpectedDuration : parseFloat(Number(wo.ExpectedDuration).toFixed(2)) + ' ' + t('work.orders.hrsUnit', 'hrs')) : '--'}</td>
                                    <td>
                                        {(() => {
                                            const label = wo.StatusLabel || t('work.orders.statusOpenFallback', 'Open');
                                            return <span className={statusClass(label)} title={`${t('work.orders.currentStatus')}: ${label}`}>{label}</span>;
                                        })()}
                                    </td>
                                    <td>
                                        {(() => {
                                            const p = String(wo.Priority);
                                            if (p === '1' || p === '0') return <span className="badge badge-red" title={t('work.orders.emergencyHighPriorityAction')}>{t('work.orders.critical')}</span>;
                                            if (p === '2') return <span className="badge badge-yellow" title={t('work.orders.standardMaintenanceRequirement')}>{t('work.orders.medium')}</span>;
                                            if (p === '3') return <span className="badge badge-blue" title={t('work.orders.routineScheduledMaintenanceTask')}>{t('work.orders.routine')}</span>;
                                            if (p === '4') return <span className="badge badge-gray" title={t('work.orders.lowPriorityMaintenanceTaskTip', 'Low priority maintenance task')}>{t('work.orders.low', 'Low')}</span>;
                                            return <span className="badge badge-gray" title={`${t('work.orders.priorityLevel')}: ${p}`}>{p || t('work.orders.unset', 'Unset')}</span>;
                                        })()}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button 
                                            className="btn-view-standard"
                                            onClick={() => handleView(wo.ID_INTERNAL || wo.ID)}
                                            title={`${t('work.orders.openFullDetailsForOrder')} ${wo.ID || wo.WorkOrderNumber}`}
                                        >
                                            <Eye size={18} /> {t('work.orders.view')}
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                ) : (
                    <div style={{ padding: '20px' }}>
                        {loading ? (
                             <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                <RefreshCw className="spinning" size={24} style={{ marginBottom: '10px' }} />
                                <p>{t('work.orders.buildingSuborderHierarchy')}</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                {hierarchy.map((node, idx) => (
                                    <WOTreeNode 
                                        key={`${node.plantId || 'local'}-${node.ID || idx}`} 
                                        node={node} 
                                        level={0} 
                                        expandedNodes={expandedNodes}
                                        toggleNode={(id) => {
                                            const next = new Set(expandedNodes);
                                            if (next.has(id)) next.delete(id);
                                            else next.add(id);
                                            setExpandedNodes(next);
                                        }}
                                        onView={handleView}
                                    />
                                ))}
                                {hierarchy.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        {t('work.orders.noGroupedWorkOrders')}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {viewMode === 'list' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--glass-border)' }} title={t('work.orders.pageControls')}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }} title={`Subset: ${(meta.page - 1) * meta.limit + (orders.length > 0 ? 1 : 0)} of ${meta.total}`}>
                    {t('work.orders.showingRecords', 'Showing {{start}}–{{end}} of {{total}} records')
                        .replace('{{start}}', (meta.page - 1) * meta.limit + (orders.length > 0 ? 1 : 0))
                        .replace('{{end}}', Math.min(meta.page * meta.limit, meta.total))
                        .replace('{{total}}', meta.total.toLocaleString())}
                </div>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                    <button 
                        onClick={() => fetchWorkOrders(meta.page - 1)}
                        disabled={meta.page <= 1}
                        className="btn-nav"
                        style={{ padding: '6px', opacity: meta.page <= 1 ? 0.5 : 1, cursor: meta.page <= 1 ? 'not-allowed' : 'pointer' }}
                        title={t('work.orders.previousResultsPage')}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span style={{ margin: '0 10px', fontSize: '0.85rem' }} title={`${t('work.orders.page')} ${meta.page}`}>{t('work.orders.pageOf', 'Page {{page}} of {{total}}').replace('{{page}}', meta.page).replace('{{total}}', meta.totalPages)}</span>
                    <button 
                        onClick={() => fetchWorkOrders(meta.page + 1)}
                        disabled={meta.page >= meta.totalPages}
                        className="btn-nav"
                        style={{ padding: '6px', opacity: meta.page >= meta.totalPages ? 0.5 : 1, cursor: meta.page >= meta.totalPages ? 'not-allowed' : 'pointer' }}
                        title={t('work.orders.nextResultsPage')}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
            )}


            </div>

            {/* Work Order Detail Modal */}
            {selectedWO && createPortal((
                <div className="modal-overlay print-exclude" onClick={() => setSelectedWO(null)}>
                    <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()}>
                        
                        <ActionBar
                            title={isCreating ? t('work.orders.createNewTitle', 'Create New Work Order') : (isEditing ? t('work.orders.editingTitle', 'Editing: {{id}}').replace('{{id}}', selectedWO?.WorkOrderNumber || selectedWO?.ID) : t('work.orders.viewTitle', 'Work Order: {{id}}').replace('{{id}}', selectedWO?.WorkOrderNumber || selectedWO?.ID))}
                            icon={<PenTool size={20} />}
                            isEditing={isEditing}
                            isCreating={isCreating}
                            onEdit={handleEditClick}
                            onSave={handleSave}
                            onPrint={handlePrint}
                            onClose={() => {
                                const lockId = selectedWO?.ID || selectedWO?.WorkOrderNumber;
                                if (lockId) releaseLock(lockId);
                                setSelectedWO(null);
                            }}
                            onDelete={handleDelete}
                            onCancel={() => {
                                const lockId = editData?.ID || editData?.WorkOrderNumber;
                                if (lockId && !isCreating) releaseLock(lockId);
                                if (isCreating) setSelectedWO(null);
                                setIsEditing(false);
                                setEditData(selectedWO);
                            }}
                            showDelete={!isForeignPlant}
                        />

                        <div className="scroll-area" style={{ flex: 1, overflowY: 'auto', padding: '30px' }} title={t('work.orders.technicalSpecifications')}>
                            {/* Record Lock Warning Banner */}
                            {lockInfo && lockInfo.lockedBy && (
                                <div style={{ 
                                    background: 'rgba(245, 158, 11, 0.1)', 
                                    border: '1px solid rgba(245, 158, 11, 0.4)', 
                                    borderRadius: '8px', 
                                    padding: '15px', 
                                    marginBottom: '20px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <AlertTriangle size={20} color="#f59e0b" />
                                        <div>
                                            <div style={{ fontWeight: 'bold', color: '#fbbf24' }}>{t('work.orders.lockWarning', '🔒 {{user}} is currently editing this work order').replace('{{user}}', lockInfo.lockedBy)}</div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                {t('work.orders.lockWaitMessage', 'Please wait until they finish, or the lock will automatically release at {{time}}.').replace('{{time}}', new Date(lockInfo.expiresAt).toLocaleTimeString())}
                                            </div>
                                        </div>
                                    </div>
                                    <button                                         className="btn-nav" 
                                        style={{ whiteSpace: 'nowrap' }}
                                        onClick={() => setLockInfo(null)}
                                        title={t('work.orders.dismissThisNotificationTip')}
                                    >{t('work.orders.dismiss', 'Dismiss')}</button>
                                </div>
                            )}
                            {/* Draft Notification Banner */}
                            {availableDraft && isEditing && (
                                <div style={{ 
                                    background: 'rgba(59, 130, 246, 0.1)', 
                                    border: '1px solid var(--primary)', 
                                    borderRadius: '8px', 
                                    padding: '15px', 
                                    marginBottom: '20px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <Info size={20} color="var(--primary)" />
                                        <div>
                                            <div style={{ fontWeight: 'bold', color: '#fff' }}>{t('work.orders.unsavedChangesDetected')}</div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('work.orders.weFoundALocal')}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button 
                                            className="btn-nav" 
                                            title={t('work.orders.discardTheSavedDraftAndTip')}
                                            style={{ padding: '6px 15px', fontSize: '0.85rem' }}
                                            onClick={() => {
                                                DraftManager.clear(availableDraft.key, plantId);
                                                setAvailableDraft(null);
                                            }}
                                        >
                                            {t('work.orders.discard')}
                                        </button>
                                        <button 
                                            className="btn-primary btn-sm" 
                                            title={t('work.orders.restoreThePreviouslySavedDraftTip')}
                                            onClick={() => {
                                                setEditData(availableDraft.data.editData);
                                                setV2Tasks(availableDraft.data.v2Tasks || []);
                                                setV2Objects(availableDraft.data.v2Objects || []);
                                                setAvailableDraft(null);
                                            }}
                                        >
                                            {t('work.orders.restoreDraft')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="detail-grid">
                                {/* Properties Panel */}
                                <div className="panel-box" title={t('work.orders.workOrderCoreProperties')}>
                                    <h3>{t('work.orders.properties')}</h3>

                                    <div className="detail-row" title={t('work.orders.officialReferenceNumberAutoassigned')}>
                                        <span className="detail-label">{t('work.orders.workOrder')}</span>
                                        {isCreating ? (
                                            <input
                                                type="text"
                                                placeholder={t('work.orders.enterWo')}
                                                style={{ width: '100%', maxWidth: '200px' }}
                                                value={editData.ID || ''}
                                                onChange={e => setEditData({ ...editData, ID: e.target.value })}
                                                title={t('work.orders.assignAUniqueReference')}
                                            />
                                        ) : <span style={{ fontWeight: 'bold' }}>{selectedWO?.ID || selectedWO?.WorkOrderNumber || '--'}</span>}
                                    </div>
                                    <div className="detail-row" title={t('work.orders.targetPieceOfMachinery')}>
                                        <span className="detail-label">{t('work.orders.asset')}</span>
                                        {isEditing ? (
                                            <select style={{ width: '100%', maxWidth: '200px' }} value={editData.AstID || ''} onChange={e => setEditData({ ...editData, AstID: e.target.value })} title={t('work.orders.selectTheSpecificMachine')}>
                                                <option value="">{t('work.orders.selectAsset')}</option>
                                                {assets.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                                            </select>
                                        ) : <span style={{ fontWeight: 600 }}>{selectedWO.AstID || t('common.na', 'N/A')}</span>}
                                    </div>
                                    <div className="detail-row" title={t('work.orders.currentLifecycleStageOf')}>
                                        <span className="detail-label">{t('work.orders.status')}</span>
                                        {isEditing ? (
                                            <select style={{ width: '100%', maxWidth: '200px' }} value={editData.StatusID || ''} onChange={e => setEditData({ ...editData, StatusID: e.target.value })} title={t('work.orders.updateTheProgressOf')}>
                                                <option value="">{t('work.orders.selectStatus')}</option>
                                                {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                            </select>
                                        ) : (
                                            (() => {
                                                const s = statuses.find(st => String(st.id) === String(selectedWO?.StatusID));
                                                const label = s ? s.label : (selectedWO?.StatusID || t('work.orders.statusOpenFallback', 'Open'));
                                                return <span className={statusClass(label)} title={`${t('work.orders.currentWorkflowState')}: ${label}`}>{label}</span>;
                                            })()
                                        )}
                                    </div>
                                    <div className="detail-row" title={t('work.orders.importanceAndUrgencyLevel')}>
                                        <span className="detail-label">{t('work.orders.priority')}</span>
                                        {isEditing ? (
                                            <select style={{ width: '100%', maxWidth: '200px' }} value={editData.Priority || ''} onChange={e => setEditData({ ...editData, Priority: e.target.value })} title={t('work.orders.emergencyLevel1Jobs')}>
                                                <option value="">{t('work.orders.prioritySelect', '-- Priority --')}</option>
                                                <option value="1">{t('work.orders.1High')}</option>
                                                <option value="2">{t('work.orders.2Medium')}</option>
                                                <option value="3">{t('work.orders.3Low')}</option>
                                            </select>
                                        ) : <span style={{ fontWeight: 600 }}>{selectedWO.Priority || t('common.na', 'N/A')}</span>}
                                    </div>
                                    {/* ── Failure Mode (Feature 3) ── */}
                                    <div className="detail-row" title={t('work.orders.rootCauseFailureClassificationForTip')}>
                                        <span className="detail-label">{t('work.orders.failureMode')}</span>
                                        {isEditing ? (
                                            <select style={{ width: '100%', maxWidth: '200px' }} value={editData.FailureMode || ''} onChange={e => setEditData({ ...editData, FailureMode: e.target.value })} title={t('work.orders.selectTheFailureModeThatTip')}>
                                                <option value="">{t('work.orders.selectFailureMode')}</option>
                                                {failureModes.map(fm => <option key={fm.code} value={fm.code}>{fm.code} — {fm.description}</option>)}
                                            </select>
                                        ) : <span>{selectedWO.FailureMode || <span style={{ color: 'var(--text-muted)' }}>{t('work.orders.notClassified', 'Not classified')}</span>}</span>}
                                    </div>
                                    <div className="detail-row" title={t('work.orders.initiatingStaffMember')}>
                                        <span className="detail-label">{t('work.orders.reqBy')}</span>
                                        {isEditing ? (
                                            <select style={{ width: '100%', maxWidth: '200px' }} value={editData.RequestBy || ''} onChange={e => setEditData({ ...editData, RequestBy: e.target.value })} title={t('work.orders.identifyTheRequester')}>
                                                <option value="">{t('work.orders.selectUser')}</option>
                                                {Array.from(new Set(users.map(u => String(u.id)))).map(id => {
                                                    const u = users.find(x => String(x.id) === id);
                                                    return <option key={id} value={id}>{u?.label || id}</option>;
                                                })}
                                            </select>
                                        ) : <span>{selectedWO.RequestBy || t('common.na', 'N/A')}</span>}
                                    </div>
                                    <div className="detail-row" title={t('work.orders.executingTechnicianOrGroup')}>
                                        <span className="detail-label">{t('work.orders.assigned')}</span>
                                        {isEditing ? (
                                            <select style={{ width: '100%', maxWidth: '200px' }} value={editData.AssignToID || ''} onChange={e => setEditData({ ...editData, AssignToID: e.target.value })} title={t('work.orders.assignLaborResource')}>
                                                <option value="">{t('work.orders.selectTeam')}</option>
                                                {Array.from(new Set(users.map(u => String(u.id)))).map(id => {
                                                    const u = users.find(x => String(x.id) === id);
                                                    return <option key={id} value={id}>{u?.label || id}</option>;
                                                })}
                                            </select>
                                        ) : <span>{selectedWO.AssignToID || t('common.na', 'N/A')}</span>}
                                    </div>
                                </div>

                                {/* Timeline Panel */}
                                <div className="panel-box" title={t('work.orders.scheduleMilestones')}>
                                    <h3>{t('work.orders.timeline')}</h3>

                                    <div className="detail-row" title={t('work.orders.dateOfFormalEntry')}><span className="detail-label">{t('work.orders.addedDate')}</span> <span style={{ fontWeight: 600 }}>{formatDate(selectedWO.AddDate) || t('common.na', 'N/A')}</span></div>
                                    <div className="detail-row" title={t('work.orders.laborBudgetForThis')}><span className="detail-label">{t('work.orders.expectedDuration')}</span> <span style={{ fontWeight: 600 }}>{selectedWO.ExpectedDuration ? (isNaN(selectedWO.ExpectedDuration) ? selectedWO.ExpectedDuration : parseFloat(Number(selectedWO.ExpectedDuration).toFixed(2)) + ' ' + t('work.orders.hrsUnit', 'hrs')) : t('work.orders.notDefined', 'Not Defined')}</span></div>
                                    <div className="detail-row" title={t('work.orders.scheduledAppointmentTime')}><span className="detail-label">{t('work.orders.schDate')}</span> <span style={{ fontWeight: 600 }}>{formatDate(selectedWO.SchDate) || t('common.na', 'N/A')}</span></div>
                                    <div className="detail-row" title={t('work.orders.finalResolutionTime')}><span className="detail-label">{t('work.orders.duration')}</span> <span style={{ fontWeight: 600 }}>{selectedWO.Duration || '0.00'} {t('work.orders.hrsUnit', 'hrs')}</span></div>

                                    {/* GPS Location Badge */}
                                    {(selectedWO.StartLat || selectedWO.CompleteLat) && (
                                        <div className="detail-row" title={t('work.orders.gpsCoordinatesCapturedAt')}>
                                            <span className="detail-label">{t('work.orders.location')}</span>
                                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                {selectedWO.StartLat && (
                                                    <span 
                                                        className="badge badge-primary" 
                                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'default', fontSize: '0.75rem' }}
                                                        title={`Start: ${selectedWO.StartLat.toFixed(5)}, ${selectedWO.StartLng.toFixed(5)} (±${selectedWO.GPSAccuracy || '?'}m)`}
                                                    >
                                                        <MapPin size={12} /> {t('work.orders.started')}
                                                    </span>
                                                )}
                                                {selectedWO.CompleteLat && (
                                                    <span 
                                                        className="badge badge-blue" 
                                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'default', fontSize: '0.75rem' }}
                                                        title={`Complete: ${selectedWO.CompleteLat.toFixed(5)}, ${selectedWO.CompleteLng.toFixed(5)} (±${selectedWO.GPSAccuracy || '?'}m)`}
                                                    >
                                                        <MapPin size={12} /> {t('work.orders.completed')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Checklist/Tasks Panel */}
                                <div className="panel-box" style={{ gridColumn: 'span 2' }}>
                                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <ClipboardList size={18} color="var(--primary)" /> 
                                        {isEditing ? t('work.orders.proceduralChecklist', 'Procedural Checklist') : t('work.orders.taskStatusProcedures', 'Task Status & Procedures')}
                                    </h3>
                                    <WorkTaskChecklist 
                                        tasks={isEditing ? (editData._v2Tasks || []) : v2Tasks} 
                                        loading={loadingV2}
                                        isEditing={isEditing}
                                        onTaskChange={(idx, val) => {
                                            const tasks = [...(editData._v2Tasks || v2Tasks)];
                                            tasks[idx] = { ...tasks[idx], DynamicText: val };
                                            setEditData({ ...editData, _v2Tasks: tasks });
                                        }}
                                    />
                                    {loadingV2 && (
                                        <div style={{ padding: '10px', textAlign: 'center', opacity: 0.6 }}>
                                            <RefreshCw size={14} className="spinning" /> {t('work.orders.syncingChecklist')}
                                        </div>
                                    )}
                                </div>

                                {/* Linked Equipment Panel */}
                                <div className="panel-box" style={{ gridColumn: 'span 2' }}>
                                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Package size={18} color="var(--primary)" /> 
                                        {t('work.orders.associatedEquipmentObjects')}
                                    </h3>
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {(isEditing ? (editData._v2Objects || []) : v2Objects).map((obj, idx) => (
                                            <div key={`item-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--glass-border)' }}>
                                                <div style={{ display: 'flex', gap: '15px' }}>
                                                    <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{obj.ObjID}</span>
                                                    <span style={{ color: 'var(--text-muted)' }}>{obj.ObjectComment || t('work.orders.noComment', 'No comment')}</span>
                                                </div>
                                                {isEditing && (
                                                    <button 
                                                        onClick={() => {
                                                            const next = [...(editData._v2Objects || [])];
                                                            next.splice(idx, 1);
                                                            setEditData({ ...editData, _v2Objects: next });
                                                        }}
                                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                                        title={t('work.orders.removeThisLinkedEquipmentFromTip')}
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}

                                        {isEditing && (
                                            <button 
                                                className="btn-primary" 
                                                style={{ alignSelf: 'flex-start', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', border: '1px dashed var(--primary)' }}
                                                title={t('work.orders.linkAnAdditionalAssetOrTip')}
                                                onClick={async () => {
                                                    const assetId = await window.prompt("Enter Asset ID to link:");
                                                    if (assetId) {
                                                        const next = [...(editData._v2Objects || [])];
                                                        next.push({ ObjID: assetId, ObjectComment: '', WoPrint: 1 });
                                                        setEditData({ ...editData, _v2Objects: next });
                                                    }
                                                }}
                                            >
                                                <Plus size={16} /> {t('work.orders.linkEquipment')}
                                            </button>
                                        )}

                                        {(!isEditing && v2Objects.length === 0) && (
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', italic: 'true' }}>{t('work.orders.noAdditionalObjectsLinked')}</div>
                                        )}
                                    </div>
                                </div>

                                {/* Comments Panel */}
                                <div className="panel-box" style={{ gridColumn: 'span 2' }} title={t('work.orders.fullNarrativeOfWork')}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                        <h3 style={{ margin: 0 }}>{t('work.orders.workScopeComments')}</h3>
                                        {isEditing && (
                                            <PushToTalkButton 
                                                onResult={(text) => setEditData({ ...editData, Comment: (editData.Comment || '') + ' ' + text })}
                                            />
                                        )}
                                    </div>
                                    {isEditing ? (
                                        <textarea
                                            style={{ width: '100%', minHeight: '220px', fontSize: '0.95rem', lineHeight: '1.6' }}
                                            value={editData.Comment || ''}
                                            onChange={e => setEditData({ ...editData, Comment: e.target.value })}
                                            placeholder={t('work.orders.enterDetailedWorkInstructions')}
                                            title={t('work.orders.narrativeForThisMaintenance')}
                                        />
                                    ) : (
                                        <p style={{ lineHeight: '1.6', color: 'var(--text-muted)', fontSize: '0.95rem', whiteSpace: 'pre-wrap' }}>
                                            {selectedWO.Comment || t('work.orders.noProjectScope', 'No additional project scope provided.')}
                                        </p>
                                    )}
                                </div>

                                {/* Related Sub-Orders Panel */}
                                {relatedOrders.length > 0 && (
                                    <div className="panel-box" style={{ gridColumn: 'span 2' }}>
                                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <Layers size={18} color="var(--primary)" /> 
                                            {t('work.orders.relatedSubOrders', 'Related Sub-Orders (Project {{id}})').replace('{{id}}', selectedWO.ProjID)}
                                        </h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                                            {relatedOrders.map(ro => (
                                                <div 
                                                    key={ro.ID} 
                                                    className="asset-row-hover"
                                                    onClick={() => handleView(ro.ID)}
                                                    style={{ 
                                                        padding: '12px', 
                                                        background: 'rgba(255,255,255,0.03)', 
                                                        borderRadius: '8px', 
                                                        border: '1px solid var(--glass-border)',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '5px'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>#{ro.WorkOrderNumber || ro.ID}</span>
                                                        <span className={statusClass(statuses.find(s => s.id == ro.StatusID)?.label || t('work.orders.statusOpenFallback', 'Open'))} style={{ fontSize: '0.7rem' }}>{statuses.find(s => s.id == ro.StatusID)?.label || t('work.orders.statusOpenFallback', 'Open')}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.85rem', color: '#fff' }}>{ro.Description}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('work.orders.dateLabel', 'Date:')} {formatDate(ro.SchDate) || t('common.na', 'N/A')}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Resource Tables */}
                            {!isCreating && (
                                <div style={{ marginTop: '30px' }} title={t('work.orders.inventoryRequirements')}>
                                    <h3 style={{ marginBottom: '15px' }}>{t('work.orders.partsInventory')}</h3>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>{t('work.orders.reference')}</th>
                                                <th>{t('work.orders.description')}</th>
                                                <th>Mfr Part #</th>
                                                <th style={{ textAlign: 'center' }}>{t('work.orders.quantity')}</th>
                                                <th style={{ textAlign: 'right' }}>{t('work.orders.totalCost')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(!selectedWO?._parts || selectedWO._parts.length === 0) ? (
                                                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>{t('work.orders.noInventoryPartsLinked')}</td></tr>
                                            ) : selectedWO._parts.map((part, idx) => (
                                                <tr key={`item-${idx}`} title={`${t('work.orders.part')}: ${part.Description}`}>
                                                    <td style={{ fontWeight: 600 }}>{part.ID || '--'}</td>
                                                    <td>{part.Description || '--'}</td>
                                                    <td style={{ color: part.ManufNum ? '#f1f5f9' : 'var(--text-muted)' }}>{part.ManufNum || '--'}</td>
                                                    <td style={{ textAlign: 'center' }}>{part.EstQty || '0'}</td>
                                                    <td style={{ textAlign: 'right' }}>${parseFloat(part.EstCost || 0).toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Added Misc Costs if exist */}
                            {selectedWO?._misc?.length > 0 && (
                                <div style={{ marginTop: '30px' }}>
                                    <h3 style={{ marginBottom: '15px' }}>{t('work.orders.miscellaneousExpenses')}</h3>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>{t('work.orders.type')}</th>
                                                <th>{t('work.orders.description')}</th>
                                                <th>{t('work.orders.cost')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedWO._misc.map((M, idx) => (
                                                <tr key={`item-${idx}`} title={`${t('work.orders.miscCost')}: ${M.Type}`}>
                                                    <td title={`${t('work.orders.costType')}: ${M.Type}`}>{M.Type || '--'}</td>
                                                    <td title={`${t('work.orders.narrative')}: ${M.Descript}`}>{M.Descript || '--'}</td>
                                                    <td title={`${t('energy.cost')}: ${M.Cost || 0}`}>${parseFloat(M.Cost || 0).toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* WO Attachments (Photos, Videos, Files) — Gap Feature #1 & #2 */}
                            {!isCreating && (
                                <WOAttachments woId={selectedWO?.ID_INTERNAL || selectedWO?.ID || selectedWO?.WorkOrderNumber} />
                            )}

                            {/* Failure / Cause / Remedy Codes — Gap Feature #4 */}
                            {!isCreating && (
                                <FailureCodes woId={selectedWO?.ID_INTERNAL || selectedWO?.ID || selectedWO?.WorkOrderNumber} />
                            )}
                        </div>


                        <div className="modal-footer">
                            {isEditing ? (
                                <>
                                    <button className="btn-nav" title={t('work.orders.cancelEditingAndDiscardUnsavedTip')} onClick={() => {
                                        // ── Release lock on cancel ──
                                        const lockId = editData?.ID || editData?.WorkOrderNumber;
                                        if (lockId && !isCreating) releaseLock(lockId);
                                        if (isCreating) setSelectedWO(null); setIsEditing(false); setEditData(selectedWO);
                                    }}>{t('work.orders.cancel')}</button>
                                    <button className="btn-save" title={isCreating ? t('work.orders.submitNewTip', 'Submit the new work order to the database') : t('work.orders.saveAllTip', 'Save all modifications to this work order')} onClick={handleSave}>{isCreating ? t('schedule.calendar.createWorkOrder', 'Create Work Order') : t('common.saveChanges', 'Save Changes')}</button>
                                </>
                            ) : (
                                <>
                                    <button className="btn-nav" title={t('work.orders.closeThisWorkOrderDetailTip')} onClick={() => {
                                        // Release any lock when closing the detail panel
                                        const lockId = selectedWO?.ID || selectedWO?.WorkOrderNumber;
                                        if (lockId) releaseLock(lockId);
                                        setSelectedWO(null);
                                    }}>{t('work.orders.close')}</button>
                                    <button className="btn-primary" onClick={handleEditClick} title={isForeignPlant ? t('assets.unlockToEdit') : t('assets.modifyRecord')}>{t('work.orders.edit')}</button>
                                    {!isForeignPlant && (
                                        <button                                             className="btn-primary" 
                                            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)' }} 
                                            onClick={() => {
                                            // Check warranty status before opening wizard
                                            if (selectedWO?.AstID) {
                                                fetch(`/api/assets/${encodeURIComponent(selectedWO.AstID)}/warranty-status`)
                                                .then(r => r.json())
                                                .then(data => {
                                                    if (data && data.isUnderWarranty) {
                                                        setWarrantyInfo({ underWarranty: true, warrantyEnd: data.warrantyEnd, vendor: data.warrantyVendor });
                                                    }
                                                })
                                                .catch(e => console.warn('[WorkOrdersView] fetch error:', e));
                                            }
                                            setShowWizard(true);
                                        }}
                                            title={t('work.orders.recordLaborpartsAndClose')}
                                        >
                                            {selectedWO?.StatusID === 40 ? t('work.orders.updateCosts', 'Update Costs') : t('work.orders.completeWithCosts', 'Complete with Costs')}
                                        </button>
                                    )}
                                    <button className="btn-danger" title={t('work.orders.permanentlyDeleteThisWorkOrderTip')} onClick={handleDelete}>{t('work.orders.delete')}</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            ), document.body)}

            {showUnlockModal && createPortal((
                <div className="modal-overlay print-exclude" style={{ zIndex: 9999 }} onClick={() => setShowUnlockModal(false)}>
                    <div className="glass-card" style={{ padding: '30px', width: '400px', borderRadius: '12px' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <PenTool color="var(--primary)" /> {t('work.orders.unlockEditMode')}
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>
                            {t('work.orders.youAreInReadonly')} <strong>{localStorage.getItem('selectedPlantId')}</strong>.
                            {t('work.orders.unlockPrivilegesPrompt', "Enter this specific location's password to temporarily unlock privileges.")}
                        </p>

                        {unlockError && <div style={{ color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px', marginBottom: '15px' }}>{unlockError}</div>}

                        <form onSubmit={handleUnlockSubmit}>
                            <input
                                type="password"
                                value={unlockPassword}
                                onChange={e => setUnlockPassword(e.target.value)}
                                placeholder={t('work.orders.locationPassword')}
                                style={{ width: '100%', padding: '12px', background: 'var(--bg-main)', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: '6px', marginBottom: '15px', outline: 'none' }}
                                autoFocus
                                required
                                title={t('work.orders.enterTheSitePasswordToTip')}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => { setShowUnlockModal(false); setUnlockError(''); setUnlockPassword(''); }} title={t('work.orders.cancelAndReturnToReadonlyTip')} className="btn-nav">{t('work.orders.cancel')}</button>
                                <button type="submit" className="btn-save" title={t('work.orders.verifyTheSitePasswordAndTip')}>{t('work.orders.unlockAccess')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            ), document.body)}

            <WOHelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
            
            {/* ── Warranty Warning Banner (Feature 9) ── */}
            {warrantyInfo && warrantyInfo.underWarranty && showWizard && (
                <div style={{ position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 10001, background: 'linear-gradient(135deg, #ff9800, #f57c00)', color: '#fff', padding: '12px 24px', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', maxWidth: 600, textAlign: 'center', fontSize: '0.95rem' }}>
                    <strong>{t('work.orders.warrantyActive')}</strong> {t('work.orders.thisAssetIsUnderWarranty')} <strong>{warrantyInfo.warrantyEnd}</strong>.
                    {t('work.orders.warrantyContactPrompt', 'Contact {{vendor}} before repairing in-house.').replace('{{vendor}}', warrantyInfo.vendor || t('work.orders.theVendor', 'the vendor'))}
                    <button onClick={() => setWarrantyInfo(null)} style={{ marginLeft: 12, background: 'rgba(255,255,255,0.3)', border: 'none', color: '#fff', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }} title={t('work.orders.dismiss', 'Dismiss')}>{t('work.orders.dismiss', 'Dismiss')}</button>
                </div>
            )}

            <CloseOutWizard 
                isOpen={showWizard}
                onClose={() => { setShowWizard(false); setWarrantyInfo(null); }}
                woId={selectedWO?.ID_INTERNAL || selectedWO?.ID}
                woNumber={selectedWO?.WorkOrderNumber || selectedWO?.ID}
                assetId={selectedWO?.AstID}
                onComplete={() => {
                    fetchWorkOrders(meta.page);
                    setSelectedWO(null);
                    setWarrantyInfo(null);
                }}
            />
        </>
    );

}

function WOTreeNode({ node, level, expandedNodes, toggleNode, onView }) {
    const { t } = useTranslation();
    const isExpanded = expandedNodes.has(node.ID);
    const hasChildren = node.isFolder && node.children && node.children.length > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div 
                style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '8px 12px', 
                    borderRadius: '6px',
                    background: node.isFolder ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                    borderLeft: level > 0 ? '1px solid var(--glass-border)' : 'none',
                    marginLeft: level > 0 ? '20px' : '0',
                    gap: '10px',
                    cursor: 'pointer',
                    hover: { background: 'rgba(255,255,255,0.05)' }
                }}
                className="asset-row-hover"
                onClick={() => node.isFolder ? toggleNode(node.ID) : onView(node.ID)}
            >
                <div style={{ width: '24px', display: 'flex', justifyContent: 'center' }}>
                    {node.isFolder ? (
                        isExpanded ? <ChevronDown size={18} color="var(--primary)" /> : <ChevronRight size={18} />
                    ) : (
                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                    )}
                </div>
                
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
                    {node.isFolder ? (
                        <>
                            <Folder size={18} color="var(--primary)" />
                            <span style={{ fontWeight: 600, color: '#fff' }}>{node.Description}</span>
                            <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>{t('work.orders.ordersCount', '{{n}} Orders').replace('{{n}}', node.children.length)}</span>
                        </>
                    ) : (
                        <>
                            <span style={{ fontWeight: 600, color: 'var(--primary)', minWidth: '80px', fontSize: '0.9rem' }}>{node.WorkOrderNumber || node.ID}</span>
                            <span style={{ fontSize: '0.9rem', color: '#fff' }}>{node.Description}</span>
                            <span>
                                {(() => {
                                    const label = node.StatusLabel || t('work.orders.statusOpenFallback', 'Open');
                                    let badgeClass = 'badge-gray';
                                    if (label === 'Completed') badgeClass = 'badge-blue';
                                    if (label === 'Canceled') badgeClass = 'badge-red';
                                    if (label === 'Started') badgeClass = 'badge-yellow';
                                    if (label === 'Open' || label === 'Request') badgeClass = 'badge-primary';
                                    return <span className={`badge ${badgeClass}`} style={{ fontSize: '0.7rem' }}>{label}</span>;
                                })()}
                            </span>
                        </>
                    )}
                </div>

                {!node.isFolder && (
                    <div className="actions" style={{ opacity: 0.6 }}>
                        <button 
                            className="btn-view-standard" 
                            onClick={(e) => { e.stopPropagation(); onView(node.ID); }}
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            title={t('work.orders.viewThisWorkOrdersFullTip')}
                        >
                            <Eye size={14} /> {t('work.orders.view')}
                        </button>
                    </div>
                )}
            </div>

            {hasChildren && isExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {node.children.map((child, idx) => (
                        <WOTreeNode 
                            key={child.ID || `child-${idx}`} 
                            node={child} 
                            level={level + 1} 
                            expandedNodes={expandedNodes}
                            toggleNode={toggleNode}
                            onView={onView}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function WOHelpModal({ isOpen, onClose }) {
    const { t } = useTranslation();
    if (!isOpen) return null;
    return createPortal((
        <div className="modal-overlay print-exclude" style={{ zIndex: 20000 }} onClick={onClose}>
            <div className="glass-card modal-content-standard" style={{ maxWidth: '700px', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '25px 30px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
                    <h2 style={{ margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <Info size={28} /> {t('work.orders.jobsDashboardGuide')}
                    </h2>
                    <button onClick={onClose} title={t('work.orders.closeHelpGuideTip')} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ flex: 1, padding: '30px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '25px', lineHeight: '1.6' }}>
                    <section>
                        <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '10px' }}>1. Sub-Order Hierarchy</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                            {t('work.orders.the')} <strong>{t('work.orders.suborders')}</strong> toggle organizes the database into active groups.
                        </p>
                        <div className="panel-box" style={{ background: 'rgba(255,255,255,0.02)', padding: '15px' }}>
                            <ul style={{ paddingLeft: '20px', color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                                <li><strong>{t('work.orders.projects')}</strong> {t('work.orders.workOrdersLinkedBy')}</li>
                                <li><strong>{t('work.orders.pmGroups')}</strong> {t('work.orders.automatedMaintenanceSequencesTriggered')}</li>
                            </ul>
                        </div>
                    </section>

                    <section style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                        <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '10px' }}>2. Navigating the Workspace</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <div style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center' }}><Folder size={20} /></div>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
                                    <strong>{t('work.orders.masterGroup')}</strong> {t('work.orders.representsAProjectOr')}
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <div style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center' }}><Network size={20} /></div>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
                                    <strong>{t('work.orders.activeWo')}</strong> {t('work.orders.aSpecificActionableTask')}
                                </p>
                            </div>
                        </div>
                    </section>
                </div>

                <div className="modal-footer" style={{ flexShrink: 0, padding: '20px 30px' }}>
                    <button className="btn-primary" onClick={onClose} title={t('work.orders.closeThisHelpInformationTip')} style={{ width: '100%' }}>
                        {t('work.orders.closeInformation')}
                    </button>
                </div>
            </div>
        </div>
    ), document.body);
}
