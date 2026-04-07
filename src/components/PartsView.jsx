// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Parts & Inventory Management
 * =========================================
 * Comprehensive storeroom parts management (1400+ lines).
 * The authoritative interface for all spare parts inventory operations.
 *
 * KEY FEATURES:
 *   - Parts table: searchable, sortable, filterable by category and status
 *   - Stock indicators: In Stock / Low Stock / Out of Stock color badges
 *   - Part detail panel: description, part number, vendor, cost, bin location, BOM links
 *   - Stock adjustment: add/remove quantity with reason codes and audit trail
 *   - Reorder point alerts: red callout when quantity ≤ reorder threshold
 *   - Part enrichment status: shows if AI auto-enrichment is pending/complete
 *   - Vendor management: multiple vendors per part with lead times and pricing
 *   - Usage history: all WOs that consumed this part with quantities and dates
 *   - Barcode/QR scanning: scan part barcode via GlobalScanner → auto-fill search
 *   - OCR label reading: camera scan of part label for identification
 *   - Transfer: move parts between plants with approval workflow
 *   - Export: CSV download of full parts list for procurement or audit
 *
 * API CALLS:
 *   GET    /api/parts                 — Parts list (plant-scoped)
 *   POST   /api/parts                 — Create new part
 *   PUT    /api/parts/:id             — Update part details
 *   DELETE /api/parts/:id             — Delete part (soft delete)
 *   POST   /api/parts/:id/adjust      — Stock quantity adjustment
 *   GET    /api/parts/:id/history     — Usage history for a part
 */
import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, ChevronLeft, ChevronRight, X, Printer, Package, AlertTriangle, Eye, Info, TrendingDown, Phone, Mail, User, Trash2, Globe, CheckCircle2, Settings } from 'lucide-react';
import SearchBar from './SearchBar';
import SmartDialog from './SmartDialog';
import ActionBar from './ActionBar';
import WhereUsedPanel from './WhereUsedPanel';
import GenericAttachments from './GenericAttachments';
import { useTranslation } from '../i18n/index.jsx';

export default function PartsView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [parts, setParts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
    const [selectedPart, setSelectedPart] = useState(null);
    const [enriching, setEnriching] = useState(false);
    const [enrichedData, setEnrichedData] = useState(null);
    const [showConflictResolver, setShowConflictResolver] = useState(false);
    const [isResolving, setIsResolving] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [editData, setEditData] = useState({});
    const [stats, setStats] = useState({ totalValue: 0, lowStockCount: 0 });
    const [priceAlert, setPriceAlert] = useState(null);
    const [plantManagers, setPlantManagers] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [ignoredParts, setIgnoredParts] = useState([]);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [dialog, setDialog] = useState(null);
    const [bulkStatus, setBulkStatus] = useState({ active: false, total: 0, processed: 0, currentPart: '' });
    const [bulkAlerts, setBulkAlerts] = useState({}); // partId -> alertData
    const [substitutes, setSubstitutes] = useState({ substitutes: [], hasInStockSubstitutes: false, currentStock: 0 });
    const [addSubMode, setAddSubMode] = useState(false);
    const [newSubId, setNewSubId] = useState('');
    const [newSubComment, setNewSubComment] = useState('');
    const [catalogPrompt, setCatalogPrompt] = useState(null); // { match, source, fields }
    const [alignmentPrompt, setAlignmentPrompt] = useState(null); // { diffs, masterData, masterPartId }
    const [partIntel, setPartIntel] = useState(null); // Part Intelligence Panel data
    const [priceAlertThreshold, setPriceAlertThreshold] = useState(() => {
        const saved = localStorage.getItem(`priceAlertThreshold_${plantId || 'default'}`);
        return saved ? parseInt(saved, 10) : 5;
    });


    // Lookups
    const [classes, setClasses] = useState([]);
    const [orderRules, setOrderRules] = useState([]);
    const [manufacturers, setManufacturers] = useState([]);

    // Filters
    const [search, setSearch] = useState('');
    const [classFilter, setClassFilter] = useState('');
    const [lowStockOnly, setLowStockOnly] = useState(false);
    const [sort, setSort] = useState('usage');
    const [order, setOrder] = useState('DESC');

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
    const [unlockAction, setUnlockAction] = useState(null);

    useEffect(() => {
        // Safe JSON helper - returns fallback on non-200 or parse errors
        const safeJson = (res, fallback = []) => res.ok ? res.json().catch(() => fallback) : Promise.resolve(fallback);
        
        // Fetch lookups and stats
        Promise.all([
            fetch('/api/v2/lookups/part-classes', { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } }).then(r => safeJson(r)),
            fetch('/api/v2/lookups/part-order-rules', { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } }).then(r => safeJson(r)),
            fetch('/api/parts/stats', { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}`, 'x-plant-id': localStorage.getItem('selectedPlantId') } }).then(r => safeJson(r, { totalValue: 0, lowStockCount: 0 })),
            fetch('/api/enrichment/manufacturers', { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } }).then(r => safeJson(r))
        ]).then(([classData, ruleData, statsData, manufData]) => {
            setClasses(classData || []);
            setOrderRules(ruleData || []);
            setStats(statsData || { totalValue: 0, lowStockCount: 0 });
            setManufacturers(manufData || []);
        }).catch(err => console.error('Lookup fetch error:', err));
        
        // Fetch ignored parts for this site
        const currentSite = localStorage.getItem('selectedPlantId');
        if (currentSite) {
            fetch(`/api/v2/network/ignored-prices/${currentSite}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            })
                .then(r => r.json())
                .then(data => setIgnoredParts(data || []))
                .catch(e => console.error("Ignored parts fetch error:", e));
        }
    }, [plantId]);

    const fetchParts = useCallback(async (pageToLoad = meta.page) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: pageToLoad,
                limit: meta.limit,
                search: search,
                classId: classFilter,
                lowStock: lowStockOnly ? '1' : '0',
                sort,
                order
            });
            const res = await fetch(`/api/parts?${params}`, {
                headers: { 
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
                }
            });
            const data = await res.json();

            setParts(data.data || []);
            setMeta(data.pagination || data.meta || { page: 1, limit: 50, total: 0, totalPages: 1 });

            // Fetch bulk sourcing alerts for the current page
            const ids = (data.data || []).map(p => p.ID);
            if (ids.length > 0) {
                fetch('/api/v2/network/sync/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ partIds: ids })
                })
                .then(r => r.json())
                .then(alertData => setBulkAlerts(alertData))
                .catch(e => console.error("Bulk price check failed", e));
            }
        } catch (err) {
            console.error('Failed to query inventory:', err);
        } finally {
            setLoading(false);
        }
    }, [search, classFilter, lowStockOnly, sort, order, meta.limit, plantId]);

    useEffect(() => {
        fetchParts(1);
    }, [search, classFilter, lowStockOnly, sort, order, fetchParts, plantId]);

    // Bulk Enrichment Polling
    const pollBulkStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/enrichment/bulk/status', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            const data = await res.json();
            setBulkStatus(data);
            if (data.active) {
                setTimeout(pollBulkStatus, 3000);
            }
        } catch (err) {
            console.error('Failed to poll bulk status:', err);
        }
    }, []);

    useEffect(() => {
        pollBulkStatus();
    }, [pollBulkStatus]);

    const handleBulkEnrich = async () => {
        if (!await confirm("This will start a background process to lookup metadata for up to 500 parts without manufacturers. It operates in 'Discovery Mode' with rate-limiting (3.5sec/part). Start now?")) return;
        
        try {
            const res = await fetch('/api/enrichment/bulk/start', { 
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
                }
            });
            const data = await res.json();
            if (res.ok) {
                setStatus({ type: 'success', message: data.message });
                pollBulkStatus();
            } else {
                setStatus({ type: 'error', message: data.error });
            }
        } catch (err) {
            setStatus({ type: 'error', message: 'Network error starting bulk job' });
        }
    };

    // PF_NAV: Specialized Auto-Open Logic
    useEffect(() => {
        const pendingViewId = localStorage.getItem('PF_NAV_VIEW');
        if (pendingViewId && parts.length > 0) {
            const found = parts.find(p => String(p.ID) === String(pendingViewId));
            if (found) {
                handleView(found.ID);
                localStorage.removeItem('PF_NAV_VIEW');
            }
        }
    }, [parts]);

    const handleView = async (id) => {
        setEnriching(false);
        setEnrichedData(null);
        setLoadingDetails(true);
        setIsEditing(false);
        setIsCreating(false);
        setAlignmentPrompt(null);
        try {
            const res = await fetch(`/api/parts/${encodeURIComponent(id)}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            const data = await res.json();
            setSelectedPart(data);
            setEditData(data);
            
            // Background price check when viewing
            if (data.ID && data.UnitCost) {
                const numericCost = parseFloat((data.UnitCost || '0').toString().replace(/[^0-9.]/g, ''));
                checkPriceNetwork(data.ID, numericCost, true);
            }

            // Background Master Catalog alignment check
            if (data.ID) {
                checkCatalogAlignment(data.ID);
                fetchPartIntelligence(data.ID);
            }
        } catch (err) {
            console.error('Failed to load part details:', err);
        } finally {
            setLoadingDetails(false);
        }
    };

    // ── Master Catalog Alignment Check (existing parts) ─────────────────────
    const checkCatalogAlignment = async (partId) => {
        try {
            const res = await fetch(`/api/catalog/enrich/${encodeURIComponent(partId)}/compare`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
                }
            });
            if (!res.ok) return;
            const data = await res.json();

            if (!data.aligned && data.diffs && data.diffs.length > 0) {
                setAlignmentPrompt({
                    partId,
                    masterPartId: data.masterPartId,
                    confidence: data.confidence,
                    matchType: data.matchType,
                    diffs: data.diffs,
                    masterData: data.masterData,
                });
            }
        } catch (e) {
            // Silent fail — alignment check is non-critical
        }
    };

    // ── Part Intelligence Fetch ─────────────────────────────────────────────
    const fetchPartIntelligence = async (partId) => {
        try {
            const res = await fetch(`/api/catalog/enrich/${encodeURIComponent(partId)}/intelligence`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
                }
            });
            if (!res.ok) return;
            const data = await res.json();
            setPartIntel(data);
        } catch (e) {
            setPartIntel(null);
        }
    };

    const handleAcceptAlignment = async () => {
        if (!alignmentPrompt) return;
        try {
            const res = await fetch(`/api/catalog/enrich/${encodeURIComponent(alignmentPrompt.partId)}/align`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                },
                body: JSON.stringify({ masterData: alignmentPrompt.masterData }),
            });
            if (res.ok) {
                // Refresh the part data
                handleView(alignmentPrompt.partId);
                setAlignmentPrompt(null);
                setStatus({ type: 'success', message: `Part aligned with Master Dairy Catalog.` });
            } else {
                setStatus({ type: 'error', message: 'Alignment failed.' });
            }
        } catch (e) {
            setStatus({ type: 'error', message: 'Alignment request failed.' });
        }
    };

    const handleNew = () => {
        if (isForeignPlant && !window.__TRIER_OVERRIDE_PASS__) {
            setUnlockAction('new');
            setShowUnlockModal(true);
            return;
        }

        const blankPart = {
            ID: '',
            Description: '',
            ClassID: '',
            Location: '',
            UnitCost: 0,
            Stock: 0,
            OrdMin: 0,
            OrdQty: 0,
            Equiv: '',
            VendorID: '',
            Comment: '',
            _transactions: []
        };
        setSelectedPart(blankPart);
        setEditData(blankPart);
        setIsEditing(true);
        setIsCreating(true);
        setCatalogPrompt(null);
    };

    // ── Master Dairy Catalog Lookup (Prompt-Based) ──────────────────────────
    const checkCatalogOnPartId = async (partIdValue) => {
        if (!partIdValue || partIdValue.length < 2) return;
        
        try {
            const res = await fetch(`/api/catalog/enrich/${encodeURIComponent(partIdValue)}?description=${encodeURIComponent(editData.Description || '')}&manufacturer=${encodeURIComponent(editData.Manufacturer || '')}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
                }
            });
            if (!res.ok) return;
            const data = await res.json();

            // Tier 1: Master Catalog match
            if (data.masterMatches && data.masterMatches.length > 0) {
                const best = data.masterMatches[0];
                if (best.confidence >= 50) {
                    setCatalogPrompt({
                        tier: 1,
                        source: 'Master Dairy Catalog',
                        match: best,
                        fields: {
                            Description: best.Description || best.StandardizedName || '',
                            Manufacturer: best.Manufacturer || '',
                            PartClassID: best.Category || '',
                            UOM: best.UOM || '',
                            UnitCost: best.TypicalPriceMin ? `$${best.TypicalPriceMin}` : '',
                        },
                        confidence: best.confidence,
                        matchType: best.matchType,
                    });
                    return;
                }
            }

            // Tier 2: Cross-plant match
            if (data.crossPlantMatches && data.crossPlantMatches.length > 0) {
                const best = data.crossPlantMatches[0];
                if (best.confidence >= 60) {
                    setCatalogPrompt({
                        tier: 2,
                        source: `${best.plantLabel}`,
                        sourcePlantId: best.plantId,
                        match: best,
                        fields: {
                            Description: best.Description || '',
                            Manufacturer: best.Manufacturer || '',
                            PartClassID: best.PartClassID || '',
                            UOM: best.UOM || 'EA',
                            UnitCost: best.UnitCost || '',
                            OrdMin: best.OrdMin || '',
                            Location: best.Location || '',
                        },
                        confidence: best.confidence,
                        matchType: best.matchType,
                    });
                }
            }
        } catch (e) {
            console.warn('[Catalog Lookup] Error:', e.message);
        }
    };

    const handleAcceptCatalogImport = () => {
        if (!catalogPrompt) return;
        const newData = { ...editData };
        Object.entries(catalogPrompt.fields).forEach(([key, val]) => {
            if (val && !newData[key]) {
                newData[key] = val;
            }
        });
        setEditData(newData);
        setCatalogPrompt(null);
        setStatus({ type: 'success', message: `Data imported from ${catalogPrompt.source}. Review and save.` });
    };

    const handleEditClick = () => {
        if (isForeignPlant && !window.__TRIER_OVERRIDE_PASS__) {
            setUnlockAction('edit');
            setShowUnlockModal(true);
            return;
        }
        setIsEditing(true);
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

    const handleEnrich = async () => {
        if (!editData?.ID) return;
        setEnriching(true);
        try {
            const res = await fetch(`/api/enrichment/${editData.ID}?manufacturer=${encodeURIComponent(editData.Manufacturer || '')}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            const data = await res.json();
            if (data.attributes) {
                setEnrichedData(data);
            }
        } catch (err) {
            console.error('Enrichment failed:', err);
        } finally {
            setEnriching(false);
        }
    };

    const handleSyncEnrichment = () => {
        if (!enrichedData) return;
        
        // Map enriched data to local fields if possible
        const newEditData = { ...editData };
        if (enrichedData.attributes.Category) {
            // Find class ID that matches the enriched category name
            const matchingClass = classes.find(c => c.label.toLowerCase() === enrichedData.attributes.Category.toLowerCase());
            if (matchingClass) newEditData.ClassID = matchingClass.id;
        }
        
        // Add enriched attributes to comments or specifications if field exists
        const specs = Object.entries(enrichedData.attributes)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' | ');
        
        newEditData.Comment = (newEditData.Comment ? newEditData.Comment + '\n' : '') + '[ENRICHED] ' + specs;
        
        setEditData(newEditData);
        window.trierToast?.info('Enriched data synced to local fields. Review and click Save Changes to persist.');
    };

    const handleDismissConflict = async () => {
        setIsResolving(true);
        try {
            const res = await fetch(`/api/parts/${encodeURIComponent(selectedPart.ID)}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ EnrichmentConflict: 0 })
            });
            if (res.ok) {
                setSelectedPart({ ...selectedPart, EnrichmentConflict: 0 });
                setShowConflictResolver(false);
                fetchParts(meta.page);
            }
        } catch (err) {
            console.error('Failed to dismiss conflict:', err);
        } finally {
            setIsResolving(false);
        }
    };

    const handleAcceptNetwork = async () => {
        if (!enrichedData) return;
        setIsResolving(true);
        
        const updates = { EnrichmentConflict: 0 };
        if (enrichedData.manufacturer) {
            updates.Manufacturer = enrichedData.manufacturer;
        }
        
        if (enrichedData.attributes?.Category) {
            const matchingClass = classes.find(c => c.label.toLowerCase() === enrichedData.attributes.Category.toLowerCase());
            if (matchingClass) updates.ClassID = matchingClass.id;
        }

        try {
            const res = await fetch(`/api/parts/${encodeURIComponent(selectedPart.ID)}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(updates)
            });
            if (res.ok) {
                const updated = { ...selectedPart, ...updates };
                setSelectedPart(updated);
                setEditData({ ...editData, ...updates });
                setShowConflictResolver(false);
                fetchParts(meta.page);
            }
        } catch (err) {
            console.error('Failed to accept network data:', err);
        } finally {
            setIsResolving(false);
        }
    };

    const handleSave = async () => {
        try {
            const { _transactions, ...payload } = editData;

            if (isCreating && !payload.ID) {
                window.trierToast?.warn('Part ID is required');
                return;
            }

            // Verification Prompt for Corporate/IT users
            if (isCreating && hasFullAdminAccess) {
                setDialog({
                    type: 'question',
                    title: 'Multi-Site Verification',
                    message: `You are about to add a NEW part to the [${plantLabel}] project database. Is this correct?`,
                    confirmLabel: 'Yes, Proceed',
                    onConfirm: () => performSave(payload),
                    onCancel: () => setDialog(null)
                });
                return;
            }

            await performSave(payload);
        } catch (err) {
            setStatus({ type: 'error', message: 'Fatal save error.' });
        }
    };

    const performSave = async (payload) => {
        setDialog(null);
        try {
            const url = isCreating ? '/api/parts' : `/api/parts/${encodeURIComponent(selectedPart.ID)}`;
            const method = isCreating ? 'POST' : 'PUT';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                if (isCreating) {
                    fetchParts(1);
                } else {
                    setParts(parts.map(p => p.ID === selectedPart.ID ? { ...p, ...payload } : p));
                }
                setSelectedPart({ ...selectedPart, ...payload });
                setIsEditing(false);
                setIsCreating(false);

                // Price Intelligence Check
                checkPriceNetwork(payload.ID, payload.UnitCost);
                setStatus({ type: 'success', message: 'Part saved successfully.' });
            } else {
                const data = await res.json();
                setStatus({ type: 'error', message: data.error || "Failed to save part." });
            }
        } catch (err) {
            setStatus({ type: 'error', message: 'Fatal save error.' });
        }
        window.__TRIER_OVERRIDE_PASS__ = null;
    };

    const checkPriceNetwork = async (partId, localCost, silent = false) => {
        if (!partId || isNaN(localCost)) return;
        if (ignoredParts.includes(partId)) return;

        try {
            const res = await fetch(`/api/v2/network/sync/${encodeURIComponent(partId)}`);
            const data = await res.json();
            
            if (data.found && data.cheapest) {
                const networkBest = data.cheapest.UnitCostNum;
                const pctDiff = ((localCost - networkBest) / localCost) * 100;
                if (localCost > networkBest && networkBest > 0 && pctDiff >= priceAlertThreshold) {
                    const alertData = {
                        partId,
                        localPrice: localCost,
                        betterPrice: networkBest,
                        sourcePlant: data.cheapest.plantLabel,
                        sourcePlantId: data.cheapest.plantId,
                        vendId: data.cheapest.data.VendorID,
                        vendorName: data.cheapest.data.VendorName || data.cheapest.data.VendID
                    };
                    
                    if (silent) {
                        // Just set it so it shows in the UI banner
                        setPriceAlert(alertData);
                    } else {
                        setPriceAlert(alertData);
                    }
                } else if (localCost <= networkBest) {
                    // Clear if deal is gone
                    setPriceAlert(null);
                }
            }
        } catch (e) { console.error("Price check error:", e); }
    };

    const handleIgnorePrice = async () => {
        if (!priceAlert) return;
        try {
            await fetch('/api/v2/network/ignore-price', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plantId: localStorage.getItem('selectedPlantId'),
                    partId: priceAlert.partId,
                    userId: localStorage.getItem('username')
                })
            });
            setIgnoredParts([...ignoredParts, priceAlert.partId]);
            setPriceAlert(null);
            setStatus({ type: 'success', message: 'Price discrepancy will be ignored for this part.' });
        } catch (e) { setStatus({ type: 'error', message: 'Failed to ignore alert.' }); }
    };

    const handleImportVendorInfo = async () => {
        if (!priceAlert || !priceAlert.vendId) {
            setStatus({ type: 'error', message: "No Vendor Information Available for this part in the network match." });
            return;
        }
        setIsSaving(true);
        try {
            const res = await fetch(`/api/v2/network/vendor/${priceAlert.vendId}?plantId=${priceAlert.sourcePlantId}`);
            if (!res.ok) throw new Error("Failed to fetch vendor");
            const vendorData = await res.json();
            
            await fetch('/api/v2/network/vendor/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vendorData })
            });
            
            // Update the local part with the new vendor and price
            await fetch(`/api/parts/${priceAlert.partId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ VendorID: priceAlert.vendId, UnitCost: priceAlert.betterPrice })
            });
            
            setStatus({ type: 'success', message: `Vendor info and better price ($${priceAlert.betterPrice}) imported from ${priceAlert.sourcePlant}!` });
            setPriceAlert(null);
            fetchParts();
        } catch (err) {
            setStatus({ type: 'error', message: "Vendor import failed." });
        } finally {
            setIsSaving(false);
        }
    };

    const handleContactManager = async () => {
        if (!priceAlert) return;
        setStatus({ type: '', message: '' });
        try {
            const res = await fetch(`/api/v2/network/site-contacts/${encodeURIComponent(priceAlert.sourcePlantId)}`);
            if (!res.ok) throw new Error("Failed to contact network");
            const managers = await res.json();
            if (managers.length === 0) {
                setStatus({ type: 'error', message: "No contact information found for this site." });
            }
            setPlantManagers(managers || []);
        } catch (e) { setStatus({ type: 'error', message: "Failed to fetch site contact info." }); }
    };

    const handleDeletePart = () => {
        if (!selectedPart) return;
        setDialog({
            type: 'error',
            title: 'Permanent Deletion',
            message: `Are you SURE you want to permanently delete part ${selectedPart.ID}? This cannot be undone.`,
            confirmLabel: 'Delete Permanently',
            onConfirm: performDeletePart,
            onCancel: () => setDialog(null)
        });
    };

    const performDeletePart = async () => {
        setDialog(null);
        try {
            const res = await fetch(`/api/parts/${encodeURIComponent(selectedPart.ID)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            if (res.ok) {
                setSelectedPart(null);
                fetchParts();
                setStatus({ type: 'success', message: 'Part deleted successfully.' });
            } else {
                const data = await res.json();
                setStatus({ type: 'error', message: data.error || "Delete failed." });
            }
        } catch (err) {
            setStatus({ type: 'error', message: 'Fatal error during deletion.' });
        }
    };

    const handlePrint = () => {
        if (selectedPart) {
            window.triggerTrierPrint('part', selectedPart);
        } else {
            // New: Specialized Parts Catalog Print
            window.triggerTrierPrint('catalog-internal', { type: 'parts', 
                items: parts 
            });
        }
    };

    const toggleSort = (field) => {
        const normalizedField = field.toLowerCase();
        if (sort === normalizedField) {
            setOrder(order === 'ASC' ? 'DESC' : 'ASC');
        } else {
            setSort(normalizedField);
            setOrder('ASC');
        }
    };

    const renderStatus = () => {
        if (!status.message) return null;
        return (
            <div style={{
                background: status.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: status.type === 'error' ? '#f87171' : '#34d399',
                padding: '12px 20px',
                borderRadius: '16px',
                border: status.type === 'error' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '15px',
                marginBottom: '20px',
                backdropFilter: 'blur(10px)',
                boxShadow: status.type === 'error' ? '0 0 20px rgba(239, 68, 68, 0.1)' : '0 0 20px rgba(16, 185, 129, 0.1)',
                animation: 'slideInDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {status.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, letterSpacing: '0.01em' }}>{status.message}</span>
                </div>
                <button onClick={() => setStatus({ type: '', message: '' })} title={t('parts.dismissThisNotificationTip')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'inherit', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', transition: 'all 0.2s' }} className="hover-bright">
                    <X size={14} />
                </button>
                <style>{`
                    @keyframes slideInDown {
                        from { transform: translateY(-20px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                    @keyframes bounceIn {
                        from { transform: scale(0.9); opacity: 0; }
                        50% { transform: scale(1.05); }
                        to { transform: scale(1); opacity: 1; }
                    }
                    @keyframes pulseGlow {
                        0% { box-shadow: 0 0 0px rgba(16, 185, 129, 0); }
                        50% { box-shadow: 0 0 15px rgba(16, 185, 129, 0.3); }
                        100% { box-shadow: 0 0 0px rgba(16, 185, 129, 0); }
                    }
                    .hover-bright:hover { filter: brightness(1.3); }
                `}</style>
            </div>
        );
    }


    return (
        <>
        <div className="glass-card" style={{ padding: 'var(--card-padding)', flex: 1, display: 'flex', flexDirection: 'column' }} title={t('parts.inventoryPartsCatalogManagement')}>
            {renderStatus()}
            <div className={selectedPart ? 'no-print' : ''} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                {/* Header */}
                <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} title={t('parts.inventoryControlHeader')} className="no-print">
                    <div style={{ display: 'flex', gap: '25px', alignItems: 'center' }}>
                        <h2 style={{ fontSize: '1.2rem' }} title={t('parts.fullListOfAll')}>{t('parts.partsCatalogInventory')}</h2>

                        {/* Financial Summary */}
                        <div style={{ display: 'flex', gap: '15px' }} title={t('parts.operationalStockMetrics')}>
                            <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.3)' }} title={t('parts.cumulativeValueOfAll')}>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('parts.inventoryValue')}</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#f59e0b' }}>
                                    ${parseFloat(stats.totalValue || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </div>
                            </div>
                            {stats.lowStockCount > 0 && (
                                <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }} title={t('parts.criticalAlertNumberOf')}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('parts.lowStockItems')}</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#ef4444' }}>
                                        {stats.lowStockCount}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>



                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* 1. Refresh */}
                        <button onClick={() => { fetchParts(); fetch('/api/parts/stats').then(r => r.json()).then(setStats); }} className="btn-primary btn-sm" title={t('parts.reloadInventory')}>
                            <RefreshCw size={18} className={loading ? 'spinning' : ''} />
                        </button>
                        {/* 2. Print Catalog */}
                        <button className="btn-primary btn-sm" onClick={handlePrint} title={t('parts.printThePartsCatalogAsTip')}>
                            <Printer size={16} /> {t('parts.printCatalog')}
                        </button>
                        {/* 3. Bulk Enrich */}
                        <button 
                            className="btn-secondary btn-sm" 
                            onClick={handleBulkEnrich} 
                            disabled={bulkStatus.active}
                            style={{ opacity: bulkStatus.active ? 0.5 : 1 }}
                            title={t('parts.automaticallyScanAllUnlinked')}
                        >
                            <Globe size={16} className={bulkStatus.active ? 'spinning' : ''} /> 
                            {bulkStatus.active ? 'Enriching...' : 'Bulk Enrich'}
                        </button>
                        {/* 4. Price Alert Threshold Selector — near the price alert badges */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }} title={t('parts.minimumPriceDifferencePercentageToTip')}>
                            <TrendingDown size={14} style={{ color: '#f59e0b' }} />
                            <select
                                value={priceAlertThreshold}
                                onChange={e => {
                                    const val = parseInt(e.target.value, 10);
                                    setPriceAlertThreshold(val);
                                    localStorage.setItem(`priceAlertThreshold_${plantId || 'default'}`, val);
                                }}
                                style={{ background: 'transparent', border: 'none', color: '#f59e0b', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', outline: 'none' }}
                                title={t('parts.setTheMinimumPriceDifferenceTip')}
                            >
                                <option value="5">≥ 5%</option>
                                <option value="10">≥ 10%</option>
                                <option value="15">≥ 15%</option>
                                <option value="20">≥ 20%</option>
                                <option value="25">≥ 25%</option>
                            </select>
                        </div>
                        {/* 5. + New Part */}
                        <button
                            className={isForeignPlant ? 'btn-secondary btn-sm' : 'btn-save'}
                            onClick={handleNew}
                            title={isForeignPlant ? 'Unlock editing to add a new part at this location' : 'Register a new inventory part'}
                        >
                            <Plus size={18} /> {t('parts.newPart')}
                        </button>
                    </div>
                </div>

                {bulkStatus.active && (
                    <div style={{ 
                        background: 'rgba(99, 102, 241, 0.1)', 
                        padding: '12px 20px', 
                        borderRadius: '12px', 
                        marginBottom: '15px',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{t('parts.enrichmentEngineBackgroundDiscovery')}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{bulkStatus.processed} / {bulkStatus.total} Parts ({Math.round((bulkStatus.processed / (bulkStatus.total || 1)) * 100)}%)</span>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ 
                                height: '100%', 
                                width: `${(bulkStatus.processed / (bulkStatus.total || 1)) * 100}%`, 
                                background: 'linear-gradient(90deg, var(--primary), #818cf8)',
                                transition: 'width 0.5s ease'
                            }}></div>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {t('parts.currentlyAnalyzing')} <strong style={{ color: 'white' }}>{bulkStatus.currentPart}</strong>
                        </div>
                    </div>
                )}

                {/* Consumable Burn Rate per Labor Hour Operational Knowledge Alert */}
                <div style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.1) 0%, rgba(168,85,247,0.02) 100%)', border: '1px solid rgba(168,85,247,0.2)', borderLeft: '3px solid #a855f7', borderRadius: 8, padding: 16, marginBottom: 15, display: 'flex', gap: 15, alignItems: 'flex-start' }} className="no-print">
                    <div style={{ background: 'rgba(168,85,247,0.15)', padding: 10, borderRadius: 10, flexShrink: 0 }}>
                        <AlertTriangle size={20} color="#a855f7" />
                    </div>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                            Consumable Burn Rate KPI <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>MONITORING ACTIVE</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: 4, lineHeight: 1.5 }}>
                            Trier OS mathematically tracks unassigned consumable inventory consumption against active logged maintenance labor hours (Wrench Time). Significant standard deviation spikes will generate warnings pointing to untracked borrowing, hoarding, or loss from open tool cribs.
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }} title={t('parts.filteringSuite')} className="no-print">
                    <SearchBar value={search} onChange={setSearch} placeholder={t('parts.searchPartOrDescription')} style={{ flex: 1, minWidth: 250 }} title={t('parts.searchPartsByIdDescriptionTip')} />

                    <select
                        value={classFilter}
                        onChange={e => setClassFilter(e.target.value)}
                        style={{ minWidth: '150px' }}
                        title={t('parts.filterPartsByClassificationCategoryTip')}
                    >
                        <option value="">{t('parts.allCategories')}</option>
                        {classes.map((c, idx) => (
                            <option key={`${c.id || idx}-${idx}`} value={c.id}>{c.label}</option>
                        ))}
                    </select>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '0 10px', border: '1px solid var(--glass-border)', borderRadius: '6px', background: lowStockOnly ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
                        <input type="checkbox" checked={lowStockOnly} onChange={e => setLowStockOnly(e.target.checked)} title={t('parts.showOnlyPartsBelowTheirTip')} />
                        <span style={{ fontSize: '0.9rem', color: lowStockOnly ? '#ef4444' : 'inherit' }}>{t('parts.lowStockOnly')}</span>
                    </label>
                </div>

                {/* Data Table */}
                <div style={{ border: '1px solid var(--glass-border)', borderRadius: '8px' }} title={t('parts.primaryInventoryTable')}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th onClick={() => toggleSort('ID')} style={{ cursor: 'pointer' }}>
                                    Part # {sort === 'id' && (order === 'ASC' ? '↑' : '↓')}
                                </th>
                                <th onClick={() => toggleSort('Description')} style={{ cursor: 'pointer' }}>
                                    Description {sort === 'description' && (order === 'ASC' ? '↑' : '↓')}
                                </th>
                                <th onClick={() => toggleSort('ClassID')} style={{ cursor: 'pointer' }}>
                                    Category {sort === 'classid' && (order === 'ASC' ? '↑' : '↓')}
                                </th>
                                <th onClick={() => toggleSort('Location')} style={{ cursor: 'pointer' }}>
                                    Location {sort === 'location' && (order === 'ASC' ? '↑' : '↓')}
                                </th>
                                <th onClick={() => toggleSort('Usage')} style={{ cursor: 'pointer' }}>
                                    High Use {sort === 'usage' && (order === 'ASC' ? '↑' : '↓')}
                                </th>
                                <th onClick={() => toggleSort('Stock')} style={{ cursor: 'pointer' }}>
                                    On Hand {sort === 'stock' && (order === 'ASC' ? '↑' : '↓')}
                                </th>
                                <th onClick={() => toggleSort('OrdMin')} style={{ cursor: 'pointer' }}>
                                    Min {sort === 'ordmin' && (order === 'ASC' ? '↑' : '↓')}
                                </th>
                                <th onClick={() => toggleSort('UnitCost')} style={{ cursor: 'pointer' }}>
                                    Cost {sort === 'unitcost' && (order === 'ASC' ? '↑' : '↓')}
                                </th>
                                <th style={{ textAlign: 'right', paddingRight: '20px' }} className="no-print">{t('parts.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        <RefreshCw className="spinning" size={24} style={{ marginBottom: '10px' }} />
                                        <p>{t('parts.queryingInventory')}</p>
                                    </td>
                                </tr>
                            ) : parts.length === 0 ? (
                                <tr>
                                    <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        {t('parts.noPartsFound')}
                                    </td>
                                </tr>
                            ) : [...parts].sort((a, b) => {
                                // Sort parts with biggest discount first
                                const aLocal = parseFloat((a.UnitCost || '0').toString().replace(/[^0-9.]/g, '')) || 0;
                                const bLocal = parseFloat((b.UnitCost || '0').toString().replace(/[^0-9.]/g, '')) || 0;
                                const aAlert = bulkAlerts[a.ID];
                                const bAlert = bulkAlerts[b.ID];
                                const aPct = (aAlert && aLocal > 0 && !ignoredParts.includes(a.ID)) ? ((aLocal - aAlert.UnitCostNum) / aLocal) * 100 : -1;
                                const bPct = (bAlert && bLocal > 0 && !ignoredParts.includes(b.ID)) ? ((bLocal - bAlert.UnitCostNum) / bLocal) * 100 : -1;
                                // Only sort by discount if both exceed threshold, otherwise keep original order
                                if (aPct >= priceAlertThreshold && bPct >= priceAlertThreshold) return bPct - aPct;
                                if (aPct >= priceAlertThreshold) return -1;
                                if (bPct >= priceAlertThreshold) return 1;
                                return 0;
                            }).map((p, idx) => (
                                <tr key={`${p.ID}-${idx}`}>
                                    <td style={{ fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {p.ID}
                                        {p.EnrichmentConflict === 1 && (
                                            <div title={t('parts.networkConflictMetadataMismatch')} style={{ color: '#f59e0b', display: 'flex' }}>
                                                <AlertTriangle size={16} />
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ maxWidth: '300px' }}>{p.Description}</td>
                                    <td><span className="badge badge-gray">{p.ClassID || 'Unscheduled'}</span></td>
                                    <td>{p.Location || '--'}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        {p.usageCount > 0 ? (
                                            <span style={{ 
                                                background: p.usageCount > 10 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.1)',
                                                color: p.usageCount > 10 ? '#10b981' : '#6366f1',
                                                padding: '2px 8px',
                                                borderRadius: '10px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600
                                            }}>
                                                {p.usageCount} Units
                                            </span>
                                        ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>0</span>}
                                    </td>
                                    <td style={{ fontWeight: 'bold', color: (p.Stock <= p.OrdMin) ? '#ef4444' : 'inherit' }}>
                                        {p.Stock <= p.OrdMin && p.HighestCriticality && (
                                            <span title={`Linked to a Class-${p.HighestCriticality} asset`} style={{
                                                display: 'inline-block', marginRight: 5, width: 18, height: 18, borderRadius: 4, lineHeight: '18px', textAlign: 'center',
                                                fontSize: '0.65rem', fontWeight: 800, verticalAlign: 'middle',
                                                background: p.HighestCriticality === 'A' ? 'rgba(239,68,68,0.2)' : p.HighestCriticality === 'B' ? 'rgba(245,158,11,0.2)' : 'rgba(148,163,184,0.2)',
                                                color: p.HighestCriticality === 'A' ? '#ef4444' : p.HighestCriticality === 'B' ? '#f59e0b' : '#94a3b8'
                                            }}>{p.HighestCriticality}</span>
                                        )}
                                        {p.Stock}
                                    </td>
                                    <td>{p.OrdMin}</td>
                                    <td>${parseFloat(p.UnitCost || 0).toFixed(2)}</td>
                                    <td style={{ textAlign: 'right', minWidth: '240px', paddingRight: '20px' }} className="no-print">
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
                                            {/* LOW PRICE ALERT BADGE */}
                                            {bulkAlerts[p.ID] && bulkAlerts[p.ID].UnitCostNum < parseFloat((p.UnitCost || '0').toString().replace(/[^0-9.]/g, '')) && !ignoredParts.includes(p.ID) && (((parseFloat((p.UnitCost || '0').toString().replace(/[^0-9.]/g, '')) - bulkAlerts[p.ID].UnitCostNum) / parseFloat((p.UnitCost || '0').toString().replace(/[^0-9.]/g, ''))) * 100 >= priceAlertThreshold) && (
                                                <div 
                                                    title={`Better Price Found: $${bulkAlerts[p.ID].UnitCostNum.toFixed(2)} at ${bulkAlerts[p.ID].plantLabel}`}
                                                    style={{
                                                        background: 'rgba(16, 185, 129, 0.15)',
                                                        color: '#10b981',
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.65rem',
                                                        fontWeight: 'bold',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        animation: 'pulseGlow 2s infinite',
                                                        cursor: 'pointer',
                                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                    onClick={() => handleView(p.ID)}
                                                >
                                                    <TrendingDown size={14} />
                                                    {t('parts.lowPrice')}
                                                </div>
                                            )}

                                            <button 
                                                onClick={() => handleView(p.ID)} 
                                                className="btn-view-standard"
                                                style={{ 
                                                    width: '100px',
                                                    flexShrink: 0,
                                                    transition: 'all 0.3s ease'
                                                }}
                                                title={`View full details for part ${p.ID}`}
                                            >
                                                <Eye size={18} /> {t('parts.view')}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--glass-border)' }} className="no-print">
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Showing {parts.length > 0 ? (meta.page - 1) * meta.limit + 1 : 0} - {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} records
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button disabled={meta.page <= 1} onClick={() => fetchParts(meta.page - 1)} className="btn-nav" title={t('parts.goToPreviousPageOfTip')}><ChevronLeft size={18} /></button>
                        <span style={{ fontSize: '0.85rem' }}>Page {meta.page} of {meta.totalPages}</span>
                        <button disabled={meta.page >= meta.totalPages} onClick={() => fetchParts(meta.page + 1)} className="btn-nav" title={t('parts.goToNextPageOfTip')}><ChevronRight size={18} /></button>
                    </div>
                </div>
            </div>

        </div>

        {/* Modal Logic (Selection/Edit) */}
        {selectedPart && (
            <div className="modal-overlay" onClick={() => setSelectedPart(null)}>
                <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()}>
                    {/* Detail/Edit fields here - similar structure to AssetsView */}
                    <ActionBar
                        title={isCreating ? t('parts.newPart') : (isEditing ? `Editing: ${selectedPart.ID}` : `Part: ${selectedPart.ID}`)}
                        icon={<Package size={20} />}
                        isEditing={isEditing}
                        isCreating={isCreating}
                        onEdit={handleEditClick}
                        onSave={handleSave}
                        onPrint={handlePrint}
                        onClose={() => setSelectedPart(null)}
                        onDelete={handleDeletePart}
                        onCancel={() => { setIsEditing(false); setEditData(selectedPart); }}
                        showDelete={!isForeignPlant}
                    />
                    <div className="scroll-area" style={{ flex: 1, padding: '30px', overflowY: 'auto', minHeight: 0 }}>
                        {selectedPart.EnrichmentConflict === 1 && (
                            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', borderRadius: '12px', padding: '15px', marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center' }}>
                                <div style={{ color: '#f59e0b' }}><AlertTriangle size={24} /></div>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ margin: '0 0 5px 0', color: '#f59e0b' }}>{t('parts.networkMismatchFlagged')}</h4>
                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem' }}>The Trier Logistics Network suggests manufacturer data that conflicts with your local record.</p>
                                    <button 
                                        onClick={async () => {
                                            await handleEnrich();
                                            setShowConflictResolver(true);
                                        }}
                                        className="btn-edit btn-sm"
                                        title={t('parts.reviewAndResolveTheDataTip')}
                                    >
                                        <AlertTriangle size={14} style={{ marginRight: '6px' }} /> {t('parts.resolveConflicts')}
                                    </button>
                                </div>
                            </div>
                        )}
                        {/* Master Dairy Catalog Alignment Prompt */}
                        {alignmentPrompt && !isEditing && (
                            <div style={{
                                background: 'rgba(99, 102, 241, 0.06)',
                                border: '1px solid rgba(99, 102, 241, 0.3)',
                                borderRadius: '12px',
                                padding: '16px',
                                marginBottom: '20px',
                                animation: 'slideInDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                    <div>
                                        <h4 style={{ margin: 0, color: '#818cf8', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Info size={16} /> Catalog Alignment Available
                                        </h4>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                                            This part differs from the <strong style={{ color: '#e2e8f0' }}>Master Dairy Catalog</strong> in {alignmentPrompt.diffs.length} field{alignmentPrompt.diffs.length !== 1 ? 's' : ''}
                                            {' · '}{alignmentPrompt.confidence}% match
                                        </p>
                                    </div>
                                    <button onClick={() => setAlignmentPrompt(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }} title={t('parts.alignmentPromptTip')}>
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* Diff table */}
                                <div style={{ borderRadius: '8px', overflow: 'hidden', marginBottom: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                                <th style={{ padding: '6px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Field</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'left', color: '#f87171', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Local Value</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'left', color: '#34d399', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Master Catalog</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {alignmentPrompt.diffs.map(d => (
                                                <tr key={d.field} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                                    <td style={{ padding: '6px 10px', color: '#94a3b8', fontWeight: 600 }}>{d.label}</td>
                                                    <td style={{ padding: '6px 10px', color: d.type === 'missing' ? '#475569' : '#f87171' }}>
                                                        {d.type === 'missing' ? <em style={{ color: '#475569' }}>empty</em> : d.localValue}
                                                    </td>
                                                    <td style={{ padding: '6px 10px', color: '#34d399', fontWeight: 600 }}>{d.masterValue}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        onClick={handleAcceptAlignment}
                                        className="btn-primary btn-sm"
                                     title={t('parts.alignWithCatalogTip')}>
                                        ✓ Align with Catalog
                                    </button>
                                    <button 
                                        onClick={() => setAlignmentPrompt(null)}
                                        className="btn-nav"
                                     title={t('parts.dismissTip')}>
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        )}
                        {isEditing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div className="panel-box" style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('parts.partIdCautionChanging')}</label>
                                    <input 
                                        type="text" 
                                        value={editData.ID || ''} 
                                        onChange={e => setEditData({...editData, ID: e.target.value})}
                                        onBlur={e => { if (isCreating && e.target.value) checkCatalogOnPartId(e.target.value); }}
                                        style={{ width: '100%', fontSize: '1.2rem', fontWeight: 'bold' }}
                                        title={t('parts.uniquePartIdentifierChangingThisTip')}
                                    />
                                </div>

                                {/* Master Dairy Catalog Import Prompt */}
                                {catalogPrompt && (
                                    <div style={{
                                        background: catalogPrompt.tier === 1 ? 'rgba(99, 102, 241, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                                        border: catalogPrompt.tier === 1 ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                                        borderRadius: '12px',
                                        padding: '16px',
                                        animation: 'slideInDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                            <div>
                                                <h4 style={{ margin: 0, color: catalogPrompt.tier === 1 ? '#818cf8' : '#34d399', fontSize: '0.9rem' }}>
                                                    {catalogPrompt.tier === 1 ? '📚 Master Dairy Catalog Match' : '🏭 Cross-Plant Match Found'}
                                                </h4>
                                                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                                                    Found in <strong style={{ color: '#e2e8f0' }}>{catalogPrompt.source}</strong>
                                                    {' · '}{catalogPrompt.confidence}% confidence ({catalogPrompt.matchType?.replace(/_/g, ' ')})
                                                </p>
                                            </div>
                                            <button onClick={() => setCatalogPrompt(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }} title={t('parts.catalogPromptTip')}>
                                                <X size={16} />
                                            </button>
                                        </div>

                                        {/* Preview fields */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                                            {Object.entries(catalogPrompt.fields).filter(([,v]) => v).map(([key, val]) => (
                                                <div key={key} style={{
                                                    background: 'rgba(255,255,255,0.04)',
                                                    borderRadius: '8px',
                                                    padding: '8px 10px',
                                                    border: '1px solid rgba(255,255,255,0.06)',
                                                }}>
                                                    <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                                    </div>
                                                    <div style={{ fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 600 }}>
                                                        {String(val)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <button
                                                onClick={handleAcceptCatalogImport}
                                                className="btn-primary"
                                                style={{
                                                    background: catalogPrompt.tier === 1 ? '#6366f1' : '#10b981',
                                                    color: '#fff',
                                                    border: 'none',
                                                    padding: '7px 18px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 700,
                                                }}
                                             title={t('parts.importDataTip')}>
                                                ✓ Import Data
                                            </button>
                                            <button 
                                                onClick={() => setCatalogPrompt(null)}
                                                className="btn-primary"
                                                style={{
                                                    background: 'rgba(255,255,255,0.06)',
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    padding: '7px 18px',
                                                    fontSize: '0.8rem',
                                                }}
                                             title="Skip">
                                                Skip
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="panel-box">
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>DESCRIPTION</label>
                                    <input 
                                        type="text" 
                                        value={editData.Description || ''} 
                                        onChange={e => setEditData({...editData, Description: e.target.value})}
                                        style={{ width: '100%' }}
                                        title={t('parts.fullDescriptionOfThisPartTip')}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div className="panel-box">
                                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('parts.categoryClass')}</label>
                                        <select 
                                            value={editData.ClassID || ''} 
                                            onChange={e => setEditData({...editData, ClassID: e.target.value})}
                                            style={{ width: '100%' }}
                                            title={t('parts.classificationCategoryForThisPartTip')}
                                        >
                                            <option value="">{t('parts.none')}</option>
                                            {classes.map((c, idx) => <option key={`${c.id || idx}-${idx}`} value={c.id}>{c.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="panel-box">
                                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>MANUFACTURER</label>
                                        <input 
                                            type="text" 
                                            list="manuf-list"
                                            value={editData.Manufacturer || ''} 
                                            onChange={e => setEditData({...editData, Manufacturer: e.target.value})}
                                            style={{ width: '100%' }}
                                            placeholder={t('parts.egGrundfosTetraPak')}
                                            title={t('parts.knownManufacturerOfThisPartTip')}
                                        />
                                        <datalist id="manuf-list">
                                            {manufacturers.map(m => <option key={m} value={m} />)}
                                        </datalist>
                                    </div>
                                </div>

                                <div className="panel-box">
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>LOCATION</label>
                                    <input 
                                        type="text" 
                                        value={editData.Location || ''} 
                                        onChange={e => setEditData({...editData, Location: e.target.value})}
                                        style={{ width: '100%' }}
                                        placeholder={t('parts.binA101')}
                                        title={t('parts.warehouseBinOrShelfLocationTip')}
                                    />
                                </div>

                                {/* Part Enrichment Section */}
                                <div className="panel-box" style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                        <h3 style={{ fontSize: '0.9rem', margin: 0, color: '#10b981', textTransform: 'uppercase' }}>{t('parts.manufacturerEnrichment')}</h3>
                                        <button 
                                            className="btn-primary" 
                                            onClick={handleEnrich}
                                            disabled={enriching}
                                            style={{ padding: '5px 12px', fontSize: '0.75rem', background: '#10b981' }}
                                            title={t('parts.queryGlobalManufacturerDatabasesForTip')}
                                        >
                                            {enriching ? 'Enriching...' : 'Enrich from Global Network'}
                                        </button>
                                    </div>
                                    
                                    {enrichedData ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            {Object.entries(enrichedData.attributes || {}).map(([key, val]) => (
                                                <div key={key} style={{ fontSize: '0.8rem' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>{key}: </span>
                                                    <span style={{ fontWeight: 600 }}>{val}</span>
                                                </div>
                                            ))}
                                            <div style={{ gridColumn: 'span 2', marginTop: '10px' }}>
                                                <button 
                                                    className="btn-primary" 
                                                    onClick={handleSyncEnrichment}
                                                    style={{ padding: '4px 10px', fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid #10b981' }}
                                                    title={t('parts.applyTheEnrichedDataToTip')}
                                                >
                                                    <RefreshCw size={12} style={{ marginRight: '5px' }} /> {t('parts.syncToRecord')}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                            No enriched data available for this part. Click enrich to query global catalogs.
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                                    <div className="panel-box">
                                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>ON HAND</label>
                                        <input 
                                            type="number" 
                                            value={editData.Stock === 0 ? '' : (editData.Stock || '')} 
                                            onChange={e => setEditData({...editData, Stock: e.target.value === '' ? '' : parseFloat(e.target.value)})}
                                            style={{ width: '100%' }}
                                            title={t('parts.currentQuantityOfThisPartTip')}
                                        />
                                    </div>
                                    <div className="panel-box">
                                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('parts.minQty')}</label>
                                        <input 
                                            type="number" 
                                            value={editData.OrdMin === 0 ? '' : (editData.OrdMin || '')} 
                                            onChange={e => setEditData({...editData, OrdMin: e.target.value === '' ? '' : parseFloat(e.target.value)})}
                                            style={{ width: '100%' }}
                                            title={t('parts.minimumStockLevelBeforeReorderTip')}
                                        />
                                    </div>
                                    <div className="panel-box">
                                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>UNIT COST ($)</label>
                                        <input 
                                            type="number" 
                                            step="0.01"
                                            value={editData.UnitCost === 0 ? '' : (editData.UnitCost || '')} 
                                            onChange={e => setEditData({...editData, UnitCost: e.target.value === '' ? '' : parseFloat(e.target.value)})}
                                            style={{ width: '100%' }}
                                            title={t('parts.costPerUnitInUsTip')}
                                        />
                                    </div>
                                </div>

                                <div className="panel-box" style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                                    <h3 style={{ fontSize: '0.9rem', marginBottom: '15px', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('parts.vendorInformation')}</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('parts.vendorId')}</label>
                                            <input 
                                                type="text" 
                                                value={editData.VendorID || ''} 
                                                onChange={e => setEditData({...editData, VendorID: e.target.value.toUpperCase()})}
                                                style={{ width: '100%' }}
                                                placeholder={t('parts.egMcmaster')}
                                                title={t('parts.vendorIdentificationCodeTip')}
                                            />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('parts.companyName')}</label>
                                                <input 
                                                    type="text" 
                                                    value={editData.VendorName || ''} 
                                                    onChange={e => setEditData({...editData, VendorName: e.target.value})}
                                                    style={{ width: '100%' }}
                                                    placeholder={t('parts.egMcmastercarr')}
                                                    title={t('parts.fullVendorCompanyNameTip')}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('parts.contactName')}</label>
                                                <input 
                                                    type="text" 
                                                    value={editData.VendorContact || ''} 
                                                    onChange={e => setEditData({...editData, VendorContact: e.target.value})}
                                                    style={{ width: '100%' }}
                                                    title={t('parts.primaryContactPersonAtThisTip')}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('parts.streetAddress')}</label>
                                            <input 
                                                type="text" 
                                                value={editData.VendorAddr || ''} 
                                                onChange={e => setEditData({...editData, VendorAddr: e.target.value})}
                                                style={{ width: '100%' }}
                                                title={t('parts.vendorStreetAddressTip')}
                                            />
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '15px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('parts.city')}</label>
                                                <input 
                                                    type="text" 
                                                    value={editData.VendorCity || ''} 
                                                    onChange={e => setEditData({...editData, VendorCity: e.target.value})}
                                                    style={{ width: '100%' }}
                                                    title={t('parts.vendorCityTip')}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('parts.state')}</label>
                                                <input 
                                                    type="text" 
                                                    value={editData.VendorState || ''} 
                                                    onChange={e => setEditData({...editData, VendorState: e.target.value})}
                                                    style={{ width: '100%' }}
                                                    placeholder={t('parts.stPlaceholder')}
                                                    title={t('parts.vendorStateAbbreviationTip')}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('parts.zip')}</label>
                                                <input 
                                                    type="text" 
                                                    value={editData.VendorZip || ''} 
                                                    onChange={e => setEditData({...editData, VendorZip: e.target.value})}
                                                    style={{ width: '100%' }}
                                                    title={t('parts.vendorZipOrPostalCodeTip')}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('parts.phoneNumber')}</label>
                                                <input 
                                                    type="text" 
                                                    value={editData.VendorPhone || ''} 
                                                    onChange={e => setEditData({...editData, VendorPhone: e.target.value})}
                                                    style={{ width: '100%' }}
                                                    title={t('parts.vendorPhoneNumberTip')}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('parts.emailAddress')}</label>
                                                <input 
                                                    type="email" 
                                                    value={editData.VendorEmail || ''} 
                                                    onChange={e => setEditData({...editData, VendorEmail: e.target.value})}
                                                    style={{ width: '100%' }}
                                                    title={t('parts.vendorEmailAddressTip')}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{t('parts.websiteUrl')}</label>
                                                <input 
                                                    type="text" 
                                                    value={editData.VendorWebsite || ''} 
                                                    onChange={e => setEditData({...editData, VendorWebsite: e.target.value})}
                                                    style={{ width: '100%' }}
                                                    placeholder={t('parts.http')}
                                                    title={t('parts.vendorWebsiteUrlTip')}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="detail-grid">
                                <div className="panel-box" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                    <div className="detail-row"><span className="detail-label">{t('parts.partId')}</span> <strong style={{ fontSize: '1.2rem', color: 'var(--primary)' }}>{selectedPart.ID}</strong></div>
                                    <div className="detail-row" style={{ marginTop: '10px' }}><span className="detail-label">{t('parts.description')}</span> <span style={{ fontSize: '1.1rem' }}>{selectedPart.Description}</span></div>
                                </div>

                                {priceAlert && priceAlert.partId === selectedPart.ID && (
                                    <div style={{ 
                                        marginTop: '15px', 
                                        background: 'rgba(16, 185, 129, 0.1)', 
                                        border: '1px solid rgba(16, 185, 129, 0.3)', 
                                        borderRadius: '16px', 
                                        padding: '15px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '15px',
                                        animation: 'pulseGlow 2s infinite'
                                    }}>
                                        <div style={{ background: '#10b981', color: '#fff', borderRadius: '50%', padding: '8px', display: 'flex' }}>
                                            <TrendingDown size={20} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#10b981', textTransform: 'uppercase' }}>{t('parts.sourcingIntelligenceAlert')}</div>
                                            <div style={{ color: '#fff', fontSize: '0.95rem' }}>
                                                <strong>{priceAlert.sourcePlant}</strong> {t('parts.pays')} <strong>${priceAlert.betterPrice.toFixed(2)}</strong>. 
                                                You could save <strong>${(priceAlert.localPrice - priceAlert.betterPrice).toFixed(2)}</strong> per unit.
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
                                    <div className="panel-box">
                                        <div className="detail-row"><span className="detail-label">{t('parts.category')}</span> {selectedPart.ClassID || '--'}</div>
                                        <div className="detail-row"><span className="detail-label">{t('parts.location')}</span> {selectedPart.Location || '--'}</div>
                                    </div>
                                    <div className="panel-box">
                                        <div className="detail-row"><span className="detail-label">{t('parts.onHand')}</span> <strong style={{ color: selectedPart.Stock <= selectedPart.OrdMin ? '#ef4444' : '#34d399' }}>{selectedPart.Stock}</strong></div>
                                        <div className="detail-row"><span className="detail-label">{t('parts.minThreshold')}</span> {selectedPart.OrdMin}</div>
                                        <div className="detail-row"><span className="detail-label">{t('parts.unitCost')}</span> ${parseFloat(selectedPart.UnitCost || 0).toFixed(2)}</div>
                                    </div>
                                </div>

                                {(selectedPart.VendorName || selectedPart.VendorPhone || selectedPart.VendorEmail) && (
                                    <div className="panel-box" style={{ marginTop: '15px', background: 'rgba(99, 102, 241, 0.05)' }}>
                                        <h3 style={{ fontSize: '0.9rem', marginBottom: '15px', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('parts.vendorDetails')}</h3>
                                        <div className="detail-row"><span className="detail-label">{t('parts.supplier')}</span> <strong>{selectedPart.VendorName || '--'}</strong></div>
                                        <div className="detail-row"><span className="detail-label">{t('parts.contact')}</span> {selectedPart.VendorContact || '--'}</div>
                                        <div className="detail-row"><span className="detail-label">{t('parts.phone')}</span> {selectedPart.VendorPhone || '--'}</div>
                                        <div className="detail-row"><span className="detail-label">Email:</span> {selectedPart.VendorEmail || '--'}</div>
                                        <div className="detail-row"><span className="detail-label">{t('parts.website')}</span> {selectedPart.VendorWebsite ? <a href={selectedPart.VendorWebsite} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>{selectedPart.VendorWebsite}</a> : '--'}</div>
                                        <div className="detail-row">
                                            <span className="detail-label">{t('parts.address')}</span> 
                                            <span>
                                                {selectedPart.VendorAddr ? `${selectedPart.VendorAddr}, ` : ''}
                                                {selectedPart.VendorCity ? `${selectedPart.VendorCity} ` : ''}
                                                {selectedPart.VendorState || ''} {selectedPart.VendorZip || ''}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* ── OUT OF STOCK BANNER with substitute suggestion ── */}
                                {selectedPart.Stock <= 0 && substitutes.hasInStockSubstitutes && (
                                    <div style={{ marginTop: '15px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '12px', padding: '15px', display: 'flex', gap: '15px', alignItems: 'center', animation: 'pulseGlow 2s infinite' }}>
                                        <div style={{ background: '#f59e0b', color: '#fff', borderRadius: '50%', padding: '10px', display: 'flex' }}>
                                            <AlertTriangle size={22} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚠️ Out of Stock — Substitute Available</div>
                                            <div style={{ fontSize: '0.9rem', color: '#fff', marginTop: '4px' }}>
                                                <strong>{substitutes.inStockSubstitutes[0]?.partNumber}</strong> — {substitutes.inStockSubstitutes[0]?.description}
                                                {substitutes.inStockSubstitutes[0]?.location && <span> · Bin: <strong>{substitutes.inStockSubstitutes[0].location}</strong></span>}
                                                {substitutes.inStockSubstitutes[0]?.stock != null && <span> · Qty: <strong>{substitutes.inStockSubstitutes[0].stock}</strong></span>}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── SUBSTITUTES + INTELLIGENCE SIDE-BY-SIDE ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>

                                {/* ── SUBSTITUTES / CROSS-REFERENCE SECTION ── */}
                                <div className="panel-box" style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <h3 style={{ fontSize: '0.9rem', margin: 0, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>🔄 Substitutes & Cross-References</h3>
                                        <button 
                                            onClick={() => setAddSubMode(!addSubMode)}
                                            className="btn-primary"
                                            style={{ padding: '4px 12px', fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--primary)', border: '1px solid var(--primary)' }}
                                            title={t('parts.addAPlantlevelSubstitutePartTip')}
                                        >
                                            <Plus size={14} style={{ marginRight: '4px' }} /> Add Substitute
                                        </button>
                                    </div>

                                    {addSubMode && (
                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'flex-end' }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>SUBSTITUTE PART ID</label>
                                                <input type="text" value={newSubId} onChange={e => setNewSubId(e.target.value)} placeholder={t('parts.enterPartIdPlaceholder')} style={{ width: '100%', fontSize: '0.85rem' }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>NOTES</label>
                                                <input type="text" value={newSubComment} onChange={e => setNewSubComment(e.target.value)} placeholder={t('parts.compatibilityNotesPlaceholder')} style={{ width: '100%', fontSize: '0.85rem' }} />
                                            </div>
                                            <button title="Button action"
                                                onClick={async () => {
                                                    if (!newSubId.trim()) return;
                                                    try {
                                                        const res = await fetch(`/api/parts/${encodeURIComponent(selectedPart.ID)}/substitutes`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                                                            body: JSON.stringify({ substituteId: newSubId.trim(), comment: newSubComment.trim() })
                                                        });
                                                        if (res.ok) {
                                                            setNewSubId(''); setNewSubComment(''); setAddSubMode(false);
                                                            // Refresh substitutes
                                                            const subRes = await fetch(`/api/parts/${encodeURIComponent(selectedPart.ID)}/substitutes`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } });
                                                            if (subRes.ok) setSubstitutes(await subRes.json());
                                                            setStatus({ type: 'success', message: 'Substitute linked successfully.' });
                                                        } else {
                                                            const err = await res.json();
                                                            setStatus({ type: 'error', message: err.error || 'Failed to add substitute.' });
                                                        }
                                                    } catch (e) { setStatus({ type: 'error', message: 'Failed to add substitute.' }); }
                                                }}
                                                className="btn-primary"
                                                style={{ padding: '8px 16px', background: '#10b981', border: 'none', whiteSpace: 'nowrap' }}
                                            >Link</button>
                                            <button onClick={() => { setAddSubMode(false); setNewSubId(''); setNewSubComment(''); }} style={{ padding: '8px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} title={t('parts.addSubModeTip')}>✕</button>
                                        </div>
                                    )}

                                    {substitutes.substitutes.length === 0 ? (
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '15px' }}>
                                            No cross-references found for this part.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {substitutes.substitutes.map((sub, idx) => (
                                                <div key={`item-${idx}`} style={{
                                                    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                                                    borderRadius: '8px', background: 'rgba(255,255,255,0.03)',
                                                    border: `1px solid ${sub.inStock ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.08)'}`,
                                                    transition: 'all 0.2s'
                                                }}>
                                                    <div style={{ width: '24px', textAlign: 'center' }}>
                                                        {sub.source === 'master' ? (
                                                            <span title={t('parts.masterCatalogCrossreferenceTip')} style={{ fontSize: '1rem' }}>📘</span>
                                                        ) : (
                                                            <span title={t('parts.plantlevelSubstituteTip')} style={{ fontSize: '1rem' }}>🏭</span>
                                                        )}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            <strong style={{ color: 'var(--primary)', fontSize: '0.9rem' }}>{sub.partNumber}</strong>
                                                            {sub.verified && <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700 }}>✓ VERIFIED</span>}
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{sub.description}</div>
                                                        {sub.notes && <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginTop: '2px', fontStyle: 'italic' }}>{sub.notes}</div>}
                                                    </div>
                                                    <div style={{ textAlign: 'right', minWidth: '80px' }}>
                                                        {sub.stock != null ? (
                                                            <>
                                                                <div style={{ fontWeight: 700, color: sub.inStock ? '#10b981' : '#ef4444', fontSize: '0.9rem' }}>
                                                                    {sub.inStock ? `✅ Qty: ${sub.stock}` : '❌ Out'}
                                                                </div>
                                                                {sub.location && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sub.location}</div>}
                                                            </>
                                                        ) : (
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Not in local inv.</span>
                                                        )}
                                                    </div>
                                                    {sub.source === 'plant' && (
                                                        <button 
                                                            onClick={async () => {
                                                                try {
                                                                    await fetch(`/api/parts/${encodeURIComponent(selectedPart.ID)}/substitutes/${encodeURIComponent(sub.partNumber)}`, {
                                                                        method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
                                                                    });
                                                                    const subRes = await fetch(`/api/parts/${encodeURIComponent(selectedPart.ID)}/substitutes`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } });
                                                                    if (subRes.ok) setSubstitutes(await subRes.json());
                                                                } catch (e) { /* ignore */ }
                                                            }}
                                                            title={t('parts.removeThisSubstituteLinkTip')}
                                                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', opacity: 0.6 }}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* ── PART INTELLIGENCE PANEL ── */}
                                <div className="panel-box" style={{ background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                    <h3 style={{ fontSize: '0.9rem', margin: '0 0 12px', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                        📊 Part Intelligence
                                    </h3>
                                    {!partIntel ? (
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '15px' }}>Loading intelligence data...</div>
                                    ) : partIntel.totalUsageCount === 0 && !partIntel.catalogSpecs ? (
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '15px' }}>No usage data or catalog specs available.</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {/* Usage Stats Row */}
                                            {partIntel.totalUsageCount > 0 && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                                                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#818cf8' }}>{partIntel.totalUsageCount}</div>
                                                        <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase' }}>Times Used</div>
                                                    </div>
                                                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#34d399' }}>{Math.round(partIntel.totalQtyUsed)}</div>
                                                        <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase' }}>Qty Consumed</div>
                                                    </div>
                                                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f59e0b' }}>${Math.round(partIntel.totalCostSpent).toLocaleString()}</div>
                                                        <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase' }}>Total Spend</div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* MTBF / Replacement Interval */}
                                            {partIntel.avgReplacementInterval && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: '8px', padding: '8px 12px', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                                                    <span style={{ fontSize: '1rem' }}>⏱️</span>
                                                    <div>
                                                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2e8f0' }}>Avg. Replacement: <span style={{ color: '#818cf8' }}>{partIntel.avgReplacementInterval} days</span></div>
                                                        <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Based on {partIntel.totalUsageCount} work orders across all plants</div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Failure Reasons */}
                                            {partIntel.topFailureReasons.length > 0 && (
                                                <div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>Top Failure Reasons</div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                        {partIntel.topFailureReasons.map(f => (
                                                            <span key={f.reason} style={{
                                                                background: f.reason === 'Scheduled PM' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                                                                color: f.reason === 'Scheduled PM' ? '#34d399' : '#f87171',
                                                                padding: '3px 8px',
                                                                borderRadius: '6px',
                                                                fontSize: '0.7rem',
                                                                fontWeight: 600,
                                                                border: f.reason === 'Scheduled PM' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.15)',
                                                            }}>
                                                                {f.reason} ({f.count})
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Catalog Specs */}
                                            {partIntel.catalogSpecs && typeof partIntel.catalogSpecs === 'object' && (
                                                <div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>Specifications</div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                                        {Object.entries(partIntel.catalogSpecs).map(([k, v]) => (
                                                            <div key={k} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '5px 8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                                <span style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase' }}>{k.replace(/_/g, ' ')}</span>
                                                                <div style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: 600 }}>{String(v)}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Equipment Types + Lead Time + Price */}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                                {partIntel.equipmentTypes.map(et => (
                                                    <span key={et} style={{
                                                        background: 'rgba(99, 102, 241, 0.1)',
                                                        color: '#818cf8',
                                                        padding: '3px 8px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.65rem',
                                                        fontWeight: 600,
                                                        border: '1px solid rgba(99, 102, 241, 0.2)',
                                                    }}>
                                                        🏭 {et}
                                                    </span>
                                                ))}
                                                {partIntel.leadTimeDays && (
                                                    <span style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '3px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 600, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                                        📦 {partIntel.leadTimeDays}d lead
                                                    </span>
                                                )}
                                                {partIntel.priceRange && (
                                                    <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', padding: '3px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 600, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                                        💰 ${partIntel.priceRange.min} – ${partIntel.priceRange.max}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Date range */}
                                            {partIntel.firstUsed && (
                                                <div style={{ fontSize: '0.7rem', color: '#475569', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '6px', marginTop: '2px' }}>
                                                    History: {partIntel.firstUsed} → {partIntel.lastUsed}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                </div> {/* end substitutes + intelligence grid */}

                                {/* ── Photo & File Attachments ── */}
                                <GenericAttachments entityType="parts" entityId={selectedPart.ID} />

                                {/* ── Where-Used Analysis ── */}
                                <WhereUsedPanel partId={selectedPart.ID} />
                            </div>
                        )}
                    </div>
                    <div className="modal-footer" style={{ display: 'flex', gap: '12px', padding: '20px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--glass-border)' }}>
                        {isEditing ? (
                            <>
                                <button onClick={() => { if (isCreating) setSelectedPart(null); setIsEditing(false); setEditData(selectedPart); }} className="btn-nav" title={t('parts.cancelEditingAndDiscardChangesTip')} style={{ flex: 1 }}>{t('parts.cancel')}</button>
                                <button onClick={handleSave} className="btn-save" title={isCreating ? 'Add this new part to the catalog' : 'Save all changes to this part'} style={{ flex: 1, border: 'none' }}>{t('parts.saveChanges')}</button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setSelectedPart(null)} className="btn-nav" title={t('parts.closePartDetailViewTip')} style={{ flex: 1 }}>{t('parts.close')}</button>
                                <button onClick={handleEditClick} className="btn-primary" title={isForeignPlant ? 'Unlock editing privileges for this location' : 'Modify this part record'} style={{ flex: 1 }}>{t('parts.editPart')}</button>
                                {hasFullAdminAccess && (
                                    <button onClick={handleDeletePart} className="btn-danger" title={t('parts.permanentlyDeleteThisPartFromTip')} style={{ padding: '10px' }}>
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* PRICE ALERT MODAL */}
        {priceAlert && (
            <div className="modal-overlay" style={{ zIndex: 11000 }}>
                <div className="glass-card" style={{ width: '90%', maxWidth: '500px', padding: '30px', animation: 'fadeIn 0.3s ease-out', position: 'relative' }}>
                    {status.message && (
                        <div style={{
                            position: 'absolute',
                            top: '-20px',
                            left: '20px',
                            right: '20px',
                            background: status.type === 'error' ? '#ef4444' : '#10b981',
                            color: '#fff',
                            padding: '12px 20px',
                            borderRadius: '12px',
                            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
                            zIndex: 12000,
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            border: '1px solid rgba(255,255,255,0.2)',
                            animation: 'bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
                        }}>
                            <div style={{ background: 'rgba(255,255,255,0.2)', padding: '5px', borderRadius: '50%', display: 'flex' }}>
                                {status.type === 'error' ? <AlertTriangle size={18} /> : <Info size={18} />}
                            </div>
                            {status.message}
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#10b981', marginBottom: '20px' }}>
                        <TrendingDown size={32} />
                        <h2 style={{ margin: 0 }}>{t('parts.betterPriceFound')}</h2>
                    </div>
                    
                    <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)', marginBottom: '20px' }}>
                        <p style={{ margin: '0 0 10px 0', fontSize: '1.1rem' }}>
                            <strong>{priceAlert.sourcePlant}</strong> {t('parts.pays')} <strong>${Number(priceAlert.betterPrice).toFixed(2)}</strong> for this item. 
                            You are currently paying <strong>${Number(priceAlert.localPrice).toFixed(2)}</strong>.
                        </p>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            Supplier: {priceAlert.vendorName}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {priceAlert.vendId ? (
                            <button onClick={handleImportVendorInfo} disabled={isSaving} className="btn-save" title={t('parts.importVendorDetailsAndBetterTip')} style={{ padding: '12px' }}>
                                <Globe size={18} style={{ marginRight: '8px' }} /> {isSaving ? 'Importing...' : 'Import Vendor & Pricing'}
                            </button>
                        ) : (
                            <div style={{ 
                                padding: '15px', 
                                background: 'rgba(239, 68, 68, 0.1)', 
                                color: '#f87171', 
                                borderRadius: '12px', 
                                fontSize: '0.85rem', 
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <AlertTriangle size={24} />
                                <div>
                                    <strong>{t('parts.noVendorInformationFound')}</strong> Pricing cannot be imported automatically. Please contact the site to verify procurement details.
                                </div>
                            </div>
                        )}
                        
                        <button onClick={handleContactManager} className="btn-primary" title={t('parts.viewContactInformationForTheTip')} style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', border: '1px solid #6366f1' }}>
                            <User size={18} style={{ marginRight: '8px' }} /> {t('parts.openSiteContacts')}
                        </button>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button onClick={() => setPriceAlert(null)} className="btn-secondary" title={t('parts.dismissThisAlertAndReviewTip')} style={{ flex: 1, padding: '12px' }}>{t('parts.reviewLater')}</button>
                            <button onClick={handleIgnorePrice} className="btn-danger-glass" title={t('parts.permanentlyIgnorePriceAlertsForTip')} style={{ flex: 1, padding: '12px' }}>{t('parts.ignorePermanently')}</button>
                        </div>
                    </div>

                    {plantManagers.length > 0 && (
                        <div style={{ marginTop: '25px', padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                            <h4 style={{ margin: '0 0 15px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Site Contacts at {priceAlert.sourcePlant}</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {plantManagers.map((m, idx) => (
                                    <div key={m.Username || m.DisplayName || idx} style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                                        <div style={{ fontWeight: 'bold' }}>{m.DisplayName || m.Username}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{m.Title || 'Management'}</div>
                                        <div style={{ display: 'flex', gap: '15px', marginTop: '8px' }}>
                                            {m.Phone && <a href={`tel:${m.Phone}`} style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '5px', textDecoration: 'none', fontSize: '0.85rem' }}><Phone size={14} /> {m.Phone}</a>}
                                            {m.Email && <a href={`mailto:${m.Email}`} style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '5px', textDecoration: 'none', fontSize: '0.85rem' }}><Mail size={14} /> {t('parts.email')}</a>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* CONFLICT RESOLUTION MODAL */}
        {showConflictResolver && (
            <div className="modal-overlay" style={{ zIndex: 11000 }}>
                <div className="glass-card" style={{ width: '90%', maxWidth: '850px', padding: '0', overflow: 'hidden', animation: 'fadeIn 0.2s ease-out' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(245, 158, 11, 0.1)' }}>
                        <h2 style={{ margin: 0, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <AlertTriangle size={24} /> {t('parts.dataConflictResolution')}
                        </h2>
                        <button onClick={() => setShowConflictResolver(false)} title={t('parts.closeConflictResolverTip')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}><X size={24} /></button>
                    </div>

                    <div style={{ padding: '30px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                        {/* LOCAL RECORD */}
                        <div className="panel-box" style={{ border: '1px solid #6366f1' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: 'var(--primary)' }}>
                                <Settings size={20} />
                                <h3 style={{ margin: 0, fontSize: '1rem', textTransform: 'uppercase' }}>{t('parts.currentLocalRecord')}</h3>
                            </div>
                            
                            <div className="detail-row"><span className="detail-label">{t('parts.manufacturer')}</span> <strong>{selectedPart.Manufacturer || '--'}</strong></div>
                            <div className="detail-row"><span className="detail-label">{t('parts.category')}</span> {classes.find(c => c.id === selectedPart.ClassID)?.label || selectedPart.ClassID || '--'}</div>
                            
                            <div style={{ marginTop: '30px' }}>
                                <button 
                                    onClick={handleDismissConflict}
                                    disabled={isResolving}
                                    className="btn-primary" 
                                    style={{ width: '100%', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', border: '1px solid #6366f1' }}
                                    title={t('parts.keepYourCurrentLocalDataTip')}
                                >
                                    {isResolving ? 'Processing...' : 'Keep Local & Dismiss Flag'}
                                </button>
                            </div>
                        </div>

                        {/* NETWORK INTELLIGENCE */}
                        <div className="panel-box" style={{ border: '1px solid #10b981' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: '#10b981' }}>
                                <Globe size={20} />
                                <h3 style={{ margin: 0, fontSize: '1rem', textTransform: 'uppercase' }}>{t('parts.networkIntelligence')}</h3>
                            </div>

                            {enriching ? (
                                <div style={{ textAlign: 'center', padding: '40px' }}>
                                    <RefreshCw className="spinning" size={24} style={{ marginBottom: '10px', color: '#10b981' }} />
                                    <p style={{ color: 'var(--text-muted)' }}>{t('parts.queryingGlobalNetwork')}</p>
                                </div>
                            ) : enrichedData ? (
                                <>
                                    <div className="detail-row">
                                        <span className="detail-label">{t('parts.manufacturer')}</span> 
                                        <strong style={{ color: enrichedData.manufacturer !== (selectedPart.Manufacturer || '') ? '#10b981' : 'inherit' }}>
                                            {enrichedData.manufacturer || '--'}
                                        </strong>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">{t('parts.category')}</span> 
                                        {enrichedData.attributes?.Category || '--'}
                                    </div>

                                    <div style={{ marginTop: '30px' }}>
                                        <button 
                                            onClick={handleAcceptNetwork}
                                            disabled={isResolving}
                                            className="btn-primary" 
                                            style={{ width: '100%', background: '#10b981', border: 'none' }}
                                            title={t('parts.replaceLocalDataWithTheTip')}
                                        >
                                            {isResolving ? 'Processing...' : 'Accept Network Data'}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    {t('parts.noNetworkMetadataFound')}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ padding: '15px 30px', background: 'rgba(255,255,255,0.03)', fontSize: '0.85rem', color: 'var(--text-muted)', borderTop: '1px solid var(--glass-border)' }}>
                        <strong>{t('parts.note')}</strong> Resolving a conflict will clear the warning icon from your inventory view. You can always re-run enrichment later.
                    </div>
                </div>
            </div>
        )}
        {dialog && <SmartDialog {...dialog} />}


        </>
    );
}
