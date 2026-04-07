// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Enterprise Map View (US Plant Location Map)
 * ========================================================
 * Interactive enterprise map showing all plant and facility locations
 * on a 2D Leaflet map or 3D Cesium globe. The primary geographic overview
 * for corporate users managing multi-site operations.
 *
 * MODES:
 *   2D Map  — React-Leaflet with OSM/satellite tile layers, state boundaries (GeoJSON),
 *             and custom plant pin markers with status-colored icons
 *   3D Globe — Lazy-loaded CesiumGlobeView (only initialized when user switches to 3D)
 *              to avoid loading the 200KB+ Cesium bundle on initial page load
 *
 * MAP PIN FEATURES:
 *   Click a pin        — Opens tooltip with plant name, leader contacts, and quick stats
 *   Pin status colors  — Green: active | Yellow: under construction | Red: inactive/closed
 *   Add/edit pins      — Admin users can drag-drop new pins and fill property details
 *   Pin types          — Plant, Warehouse, Office, Vendor, Other
 *
 * LAYERS (LayersControl):
 *   Base:    OpenStreetMap, Satellite (ESRI), Topo
 *   Overlay: State boundaries (GeoJSON), Plant labels, County lines
 *
 * API CALLS:
 *   GET /api/map-pins           All map pins for the enterprise
 *   GET /api/leadership/all     Enterprise leadership directory for pin tooltips
 *   POST/PUT/DELETE /api/map-pins  Pin CRUD for admin users
 *
 * PERFORMANCE: CesiumGlobeView is React.lazy() wrapped and only loaded on demand.
 *   Leaflet icon fix applied at module level for webpack/Vite bundler compatibility.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { useTranslation } from '../i18n/index.jsx';
import { MapContainer, TileLayer, WMSTileLayer, Marker, Popup, useMap, LayersControl, GeoJSON, Tooltip, ZoomControl, CircleMarker, LayerGroup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import usStatesData from '../data/us-states.json';

// Lazy-load the heavy Cesium globe (only loaded when user switches to 3D)
const CesiumGlobeView = lazy(() => import('./CesiumGlobeView'));

// ── Fix Leaflet default icons in bundlers ────────────────────────────
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const iconShadow = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';
L.Marker.prototype.options.icon = L.icon({
    iconUrl, iconRetinaUrl, shadowUrl: iconShadow,
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

// ── Pin Type Config ────────────────────────────────────────────
const PIN_TYPES = [
    { id: 'Plant', emoji: '🏭', color: '#ef4444', label: 'Plant' },
    { id: 'Branch', emoji: '🏢', color: '#3b82f6', label: 'Branch' },
    { id: 'Corporate', emoji: '🏛️', color: '#a855f7', label: 'Corporate HQ' },
    { id: 'Warehouse', emoji: '📦', color: '#f59e0b', label: 'Warehouse' },
    { id: 'Distribution', emoji: '🚚', color: '#10b981', label: 'Distribution Point' },
    { id: 'Notes', emoji: '📌', color: '#8b5cf6', label: 'Notes' },
];

// ── Marker Icon Factory ────────────────────────────────────────────
const iconCache = new Map();
const getIcon = (pinType, isSelected = false) => {
    const config = PIN_TYPES.find(p => p.id === pinType) || PIN_TYPES[0];
    const key = `${config.id}_${isSelected}`;
    if (iconCache.has(key)) return iconCache.get(key);

    const size = isSelected ? 44 : 36;
    const icon = L.divIcon({
        className: 'custom-map-pin',
        html: `<div style="
            background: radial-gradient(circle at 30% 30%, ${config.color}, ${config.color}dd);
            width: ${size}px; height: ${size}px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            display: flex; align-items: center; justify-content: center;
            border: 2px solid ${isSelected ? '#38bdf8' : 'rgba(255,255,255,0.3)'};
            box-shadow: ${isSelected ? '0 0 20px #38bdf8' : '0 6px 12px rgba(0,0,0,0.4)'};
            transition: all 0.25s ease;
        "><div style="transform: rotate(45deg); font-size: ${isSelected ? 22 : 18}px; line-height: 1;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));">${config.emoji}</div></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
        popupAnchor: [0, -size]
    });
    iconCache.set(key, icon);
    return icon;
};

// ── Map Controller for fly-to ────────────────────────────
const MapController = ({ flyTo }) => {
    const map = useMap();
    useEffect(() => {
        if (flyTo) map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom || 12, { duration: 1.5 });
    }, [flyTo, map]);

    // Push zoom controls down to clear the Map/Globe/Radar buttons
    useEffect(() => {
        const container = map.getContainer();
        const style = document.createElement('style');
        style.textContent = `.leaflet-top.leaflet-left .leaflet-control-zoom { margin-top: 120px !important; }`;
        container.appendChild(style);
        return () => style.remove();
    }, [map]);

    return null;
};

// ── Map Click Handler (add pins + weather) ────────────────────────────────
const MapClickHandler = ({ onMapClick, addMode, showWeather, onWeatherClick, onZoomChange }) => {
    const map = useMap();

    useEffect(() => {
        const handleZoom = () => onZoomChange(map.getZoom());
        map.on('zoomend', handleZoom);
        return () => map.off('zoomend', handleZoom);
    }, [map, onZoomChange]);

    useEffect(() => {
        const handler = (e) => {
            if (addMode) {
                onMapClick(e.latlng);
            } else if (onWeatherClick) {
                onWeatherClick(e.latlng.lat, e.latlng.lng);
            }
        };
        map.on('click', handler);
        return () => map.off('click', handler);
    }, [addMode, map, onMapClick, onWeatherClick]);
    return null;
};

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────
export default function USMapView({ plantId, plantLabel }) {
    const { t } = useTranslation();
    const [pins, setPins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPin, setSelectedPin] = useState(null);
    const [addMode, setAddMode] = useState(false);
    const [addType, setAddType] = useState('Plant');
    const [showEditor, setShowEditor] = useState(false);
    const [editData, setEditData] = useState({});
    const [flyTo, setFlyTo] = useState(null);
    const [filterType, setFilterType] = useState('All');
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState('map'); // 'map' or 'globe'
    const [showWeather, setShowWeather] = useState(false);
    const [radarFrames, setRadarFrames] = useState([]);  // [{ time, path, isForecast }]
    const [radarIndex, setRadarIndex] = useState(0);
    const [radarPlaying, setRadarPlaying] = useState(true);
    const [weatherPopup, setWeatherPopup] = useState(null);
    const [zoom, setZoom] = useState(5);

    // ── Real-time Intelligence Layers ──
    const [showEarthquakes, setShowEarthquakes] = useState(false);
    const [earthquakes, setEarthquakes] = useState([]);
    const [showTraffic, setShowTraffic] = useState(false);

    // Derive current radar URL from active frame (RainViewer or NOAA HRRR)
    const activeFrame = radarFrames[radarIndex];
    let radarUrl = null;
    if (activeFrame) {
        if (activeFrame.source === 'noaa') {
            // NOAA HRRR Forecast Tile
            radarUrl = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/hrrr-ref-${activeFrame.minutes}/{z}/{x}/{y}.png`;
        } else {
            // RainViewer Radar Tile
            radarUrl = `https://tilecache.rainviewer.com${activeFrame.path}/256/{z}/{x}/{y}/6/1_1.png`;
        }
    }

    // ── Fetch radar frames from RainViewer ──
    useEffect(() => {
        if (!showWeather) { setRadarFrames([]); setRadarIndex(0); return; }
        const fetchRadar = async () => {
            try {
                const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
                const data = await res.json();
                const past = (data?.radar?.past || []).map(f => ({ ...f, isForecast: false, source: 'rv' }));
                const nowcast = (data?.radar?.nowcast || []).map(f => ({ ...f, isForecast: true, source: 'rv' }));

                const allFrames = [...past, ...nowcast];
                setRadarFrames(allFrames);
                // Start at the last "past" frame (current conditions)
                setRadarIndex(Math.max(0, past.length - 1));
            } catch (err) { console.warn('[Weather] Radar fetch failed:', err); }
        };
        fetchRadar();
        const interval = setInterval(fetchRadar, 300000);
        return () => clearInterval(interval);
    }, [showWeather]);

    // ── Animate through radar frames ──
    useEffect(() => {
        if (!radarPlaying || radarFrames.length === 0 || !showWeather) return;
        const timer = setInterval(() => {
            setRadarIndex(prev => (prev + 1) % radarFrames.length);
        }, 1500);
        return () => clearInterval(timer);
    }, [radarPlaying, radarFrames.length, showWeather]);

    // ── Fetch Intelligence Layers (via Proxy) ──
    useEffect(() => {
        if (showEarthquakes && earthquakes.length === 0) {
            fetch('/api/intelligence/earthquakes')
                .then(r => r.json()).then(data => setEarthquakes(data.features || []))
                .catch(err => console.warn('[USMap] Earthquake fetch failed:', err));
        }
    }, [showEarthquakes, earthquakes.length]);



    // ── Fetch weather forecast + alerts from NWS ──
    const fetchWeather = useCallback(async (lat, lng) => {
        setWeatherPopup({ lat, lng, loading: true, forecast: null, alerts: null });
        try {
            // Step 1: Get forecast grid point
            const pointRes = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`, {
                headers: { 'User-Agent': 'TrierOS/2.0' }
            });
            const pointData = await pointRes.json();
            const forecastUrl = pointData?.properties?.forecast;

            // Step 2: Get forecast
            let forecast = null;
            if (forecastUrl) {
                const fRes = await fetch(forecastUrl, { headers: { 'User-Agent': 'TrierOS/2.0' } });
                const fData = await fRes.json();
                forecast = fData?.properties?.periods?.slice(0, 4) || [];
            }

            // Step 3: Get active alerts
            let alerts = [];
            try {
                const alertRes = await fetch(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`, {
                    headers: { 'User-Agent': 'TrierOS/2.0' }
                });
                const alertData = await alertRes.json();
                alerts = alertData?.features?.map(f => ({
                    event: f.properties.event,
                    severity: f.properties.severity,
                    headline: f.properties.headline,
                    description: f.properties.description?.substring(0, 300),
                })) || [];
            } catch (ignored) { }

            // Step 4: High-precision Reverse Geocoding (Overrides NWS sloppy 2.5km grid city interpolation)
            let exactCity = pointData?.properties?.relativeLocation?.properties?.city;
            let exactState = pointData?.properties?.relativeLocation?.properties?.state;
            try {
                const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
                if (apiKey) {
                    const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`);
                    const geoData = await geoRes.json();
                    if (geoData.results && geoData.results.length > 0) {
                        const comps = geoData.results[0].address_components;
                        const cityComp = comps.find(c => c.types.includes('locality') || c.types.includes('sublocality'));
                        const stateComp = comps.find(c => c.types.includes('administrative_area_level_1'));
                        if (cityComp) exactCity = cityComp.short_name;
                        if (stateComp) exactState = stateComp.short_name;
                    }
                } else {
                    const osRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`);
                    const osData = await osRes.json();
                    if (osData && osData.address) {
                        const c = osData.address.city || osData.address.town || osData.address.village || osData.address.municipality;
                        const s = osData.address.state;
                        // For Illinois (e.g. State), OSM often returns full name "Illinois". Let's try to map it or just use it.
                        // We will just use NWS State and OSM City to ensure State is abbreviated nicely.
                        if (c) exactCity = c;
                    }
                }
            } catch (ignored) { /* Fallback to NWS natively */ }

            setWeatherPopup({ lat, lng, loading: false, forecast, alerts, city: exactCity, state: exactState });
        } catch (err) {
            console.warn('[Weather] Forecast fetch failed:', err);
            setWeatherPopup(prev => prev ? { ...prev, loading: false, error: 'Weather data unavailable for this location' } : null);
        }
    }, []);


    const authHeaders = useMemo(() => ({
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json',
        'x-plant-id': plantId || localStorage.getItem('selectedPlantId') || ''
    }), [plantId]);

    // ── Fetch pins ──
    const fetchPins = useCallback(async () => {
        try {
            const res = await fetch('/api/map-pins', { headers: authHeaders });
            const data = await res.json();
            setPins(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('[USMap] Failed to load pins:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchPins(); }, []);

    // ── Create pin ──
    const handleMapClick = useCallback(async (latlng) => {
        if (!addMode) return;
        const newPin = {
            lat: latlng.lat, lng: latlng.lng,
            pinType: addType, label: '',
            plantId: plantId || '', createdBy: localStorage.getItem('currentUser') || ''
        };
        try {
            const res = await fetch('/api/map-pins', {
                method: 'POST', headers: authHeaders, body: JSON.stringify(newPin)
            });
            const created = await res.json();
            setPins(prev => [created, ...prev]);
            setSelectedPin(created.id);
            setEditData(created);
            setShowEditor(true);
            setAddMode(false);
        } catch (err) {
            console.error('[USMap] Create pin error:', err);
        }
    }, [addMode, addType, plantId]);

    // Handle map click — weather check or pin add
    const handleWeatherOrPinClick = useCallback((latlng) => {
        if (addMode) {
            handleMapClick(latlng);
        } else if (showWeather) {
            fetchWeather(latlng.lat, latlng.lng);
        }
    }, [addMode, showWeather, handleMapClick, fetchWeather]);

    // ── Update pin ──
    const handleSave = async () => {
        if (!editData.id) return;
        try {
            const res = await fetch(`/api/map-pins/${editData.id}`, {
                method: 'PUT', headers: authHeaders, body: JSON.stringify(editData)
            });
            const updated = await res.json();
            setPins(prev => prev.map(p => p.id === updated.id ? updated : p));
            setShowEditor(false);
        } catch (err) {
            console.error('[USMap] Update error:', err);
        }
    };

    // ── Delete pin ──
    const handleDelete = async (id) => {
        if (!window.confirm(t('map.confirmDelete', 'Delete this pin permanently?'))) return;
        try {
            await fetch(`/api/map-pins/${id}`, { method: 'DELETE', headers: authHeaders });
            setPins(prev => prev.filter(p => p.id !== id));
            setShowEditor(false);
            setSelectedPin(null);
        } catch (err) {
            console.error('[USMap] Delete error:', err);
        }
    };

    // ── Filter & search ──
    const filtered = pins.filter(p => {
        if (filterType !== 'All' && p.pinType !== filterType) return false;
        if (search) {
            const s = search.toLowerCase();
            return (p.label || '').toLowerCase().includes(s)
                || (p.city || '').toLowerCase().includes(s)
                || (p.state || '').toLowerCase().includes(s)
                || (p.address || '').toLowerCase().includes(s)
                || (p.notes || '').toLowerCase().includes(s);
        }
        return true;
    });

    const handleGeocode = async (e) => {
        if (e.key !== 'Enter' || !search) return;
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&format=json&limit=1`);
            const data = await res.json();
            if (data && data.length > 0) {
                const { lat, lon } = data[0];
                setFlyTo({ lat: parseFloat(lat), lng: parseFloat(lon), zoom: 18 });
            }
        } catch (err) {
            console.warn('[USMap] Geocoding failed:', err);
        }
    };

    // ── Styles ──
    const panelBg = 'rgba(15, 23, 42, 0.95)';
    const cardBg = 'rgba(30, 41, 59, 0.8)';
    const border = 'rgba(71, 85, 105, 0.4)';

    return (
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {/* ════ TOP-LEFT CONTROLS OVERLAY ════ */}
            <div style={{
                position: 'absolute', top: 12, left: 340, zIndex: 1000,
                display: 'flex', gap: 8, alignItems: 'center'
            }}>
                {/* Map / Globe Toggle */}
                <div style={{
                    display: 'flex', borderRadius: 10, overflow: 'hidden',
                    border: '1px solid rgba(99,102,241,0.4)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(12px)',
                }}>
                    <button onClick={() => setViewMode('map')}
                        style={{
                            padding: '8px 16px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                            border: 'none', display: 'flex', alignItems: 'center', gap: 6,
                            background: viewMode === 'map' ? 'rgba(99,102,241,0.35)' : 'rgba(15,23,42,0.85)',
                            color: viewMode === 'map' ? '#c7d2fe' : '#64748b',
                            transition: 'all 0.25s ease',
                        }}>
                        <span style={{ fontSize: 16 }}>🗺️</span> {t('map.viewMap', 'Map')}
                    </button>
                    <button onClick={() => setViewMode('globe')}
                        style={{
                            padding: '8px 16px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                            border: 'none', display: 'flex', alignItems: 'center', gap: 6,
                            background: viewMode === 'globe' ? 'rgba(99,102,241,0.35)' : 'rgba(15,23,42,0.85)',
                            color: viewMode === 'globe' ? '#c7d2fe' : '#64748b',
                            transition: 'all 0.25s ease',
                        }}>
                        <span style={{ fontSize: 16 }}>🌍</span> {t('map.viewGlobe', 'Globe')}
                    </button>
                </div>

                {/* Weather Radar Toggle */}
                <button onClick={() => { setShowWeather(w => !w); setWeatherPopup(null); }}
                    style={{
                        padding: '8px 16px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 800,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        border: showWeather ? '1px solid rgba(16,185,129,0.6)' : '1px solid rgba(99,102,241,0.4)',
                        background: showWeather ? 'rgba(16,185,129,0.25)' : 'rgba(15,23,42,0.85)',
                        color: showWeather ? '#6ee7b7' : '#64748b',
                        boxShadow: showWeather ? '0 0 16px rgba(16,185,129,0.3)' : '0 4px 20px rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(12px)', transition: 'all 0.25s ease',
                    }}>
                    <span style={{ fontSize: 16 }}>🌦️</span> {t('map.weatherToggle', 'Weather')}
                </button>

                {/* Intelligence Layer Toggles */}
                <div style={{
                    display: 'flex', borderRadius: 10, overflow: 'hidden',
                    border: '1px solid rgba(71,85,105,0.4)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(12px)',
                }}>
                    <button onClick={() => setShowEarthquakes(!showEarthquakes)}
                        style={{
                            padding: '8px 12px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                            border: 'none', borderRight: '1px solid rgba(71,85,105,0.4)',
                            background: showEarthquakes ? 'rgba(239,68,68,0.2)' : 'rgba(15,23,42,0.85)',
                            color: showEarthquakes ? '#f87171' : '#64748b',
                            transition: 'all 0.2s',
                        }}>🌋 {t('map.layerQuakes', 'Quakes')}</button>
                    <button onClick={() => setShowTraffic(!showTraffic)}
                        style={{
                            padding: '8px 12px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                            border: 'none',
                            background: showTraffic ? 'rgba(99,102,241,0.2)' : 'rgba(15,23,42,0.85)',
                            color: showTraffic ? '#818cf8' : '#64748b',
                            transition: 'all 0.2s',
                        }}>🛣️ {t('map.layerRoads', 'Roads')}</button>
                </div>
            </div>

            {/* ════ TRIER OS LOGO (bottom-left) ════ */}
            <div style={{
                position: 'absolute', bottom: 12, left: 340, zIndex: 1000,
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(15,23,42,0.75)', borderRadius: 10,
                padding: '6px 14px', backdropFilter: 'blur(12px)',
                border: '1px solid rgba(71,85,105,0.3)',
            }}>
                <img src="/assets/TrierOS_Logo.png" alt="Trier OS" style={{ height: 24, width: 'auto', opacity: 0.9 }} />
                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em' }}>{t('map.enterpriseMapBadge', 'ENTERPRISE MAP')}</span>
            </div>

            {/* ════ WEATHER POPUP ════ */}
            {weatherPopup && (
                <div style={{
                    position: 'absolute', bottom: 60, right: 20, zIndex: 1200,
                    width: 380, maxHeight: 450, overflowY: 'auto',
                    background: 'rgba(15,23,42,0.96)', borderRadius: 14,
                    border: '1px solid rgba(71,85,105,0.5)',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(16px)',
                }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(71,85,105,0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f1f5f9' }}>
                                🌦️ {weatherPopup.city ? `${weatherPopup.city}, ${weatherPopup.state}` : t('map.weatherPopupTitle', 'Weather')}
                            </div>
                            <div style={{ fontSize: '0.6rem', color: '#64748b', fontFamily: 'monospace' }}>
                                {weatherPopup.lat?.toFixed(4)}, {weatherPopup.lng?.toFixed(4)}
                            </div>
                        </div>
                        <button onClick={() => setWeatherPopup(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                    </div>

                    <div style={{ padding: '12px 16px' }}>
                        {weatherPopup.loading && (
                            <div style={{ textAlign: 'center', padding: 20, color: '#6366f1', fontWeight: 700 }}>
                                <span style={{ fontSize: 24, display: 'block', marginBottom: 8, animation: 'spin 2s linear infinite' }}>🌦️</span>
                                {t('map.loadingForecast', 'Loading forecast...')}
                            </div>
                        )}

                        {weatherPopup.error && (
                            <div style={{ color: '#f59e0b', fontSize: '0.8rem', padding: 10 }}>⚠️ {weatherPopup.error}</div>
                        )}

                        {/* Active Alerts */}
                        {weatherPopup.alerts?.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>⚠️ {t('map.activeAlerts', 'Active Alerts')}</div>
                                {weatherPopup.alerts.map((a, i) => (
                                    <div key={i} style={{
                                        padding: '8px 10px', borderRadius: 8, marginBottom: 4,
                                        background: a.severity === 'Extreme' ? 'rgba(239,68,68,0.2)' : a.severity === 'Severe' ? 'rgba(245,158,11,0.2)' : 'rgba(99,102,241,0.1)',
                                        border: `1px solid ${a.severity === 'Extreme' ? 'rgba(239,68,68,0.4)' : a.severity === 'Severe' ? 'rgba(245,158,11,0.3)' : 'rgba(99,102,241,0.2)'}`,
                                    }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: a.severity === 'Extreme' ? '#f87171' : a.severity === 'Severe' ? '#f59e0b' : '#818cf8' }}>{a.event}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 2 }}>{a.headline}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {weatherPopup.alerts?.length === 0 && !weatherPopup.loading && (
                            <div style={{ fontSize: '0.7rem', color: '#10b981', marginBottom: 10, fontWeight: 700 }}>✅ {t('map.noActiveAlerts', 'No active weather alerts')}</div>
                        )}

                        {/* Forecast */}
                        {weatherPopup.forecast?.length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{t('map.forecast', 'Forecast')}</div>
                                {weatherPopup.forecast.map((p, i) => (
                                    <div key={i} style={{
                                        padding: '8px 10px', borderRadius: 8, marginBottom: 4,
                                        background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(71,85,105,0.3)',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e2e8f0' }}>{p.name}</span>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f59e0b' }}>{p.temperature}°{p.temperatureUnit}</span>
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 2 }}>{p.shortForecast}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* GLOBAL GIS SEARCH BUTTON */}
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(71,85,105,0.4)' }}>
                            <button 
                                onClick={async () => {
                                    try {
                                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${weatherPopup.lat}&lon=${weatherPopup.lng}&zoom=10&addressdetails=1`);
                                        const data = await res.json();
                                        const county = data?.address?.county || '';
                                        const state = data?.address?.state || weatherPopup.state || '';
                                        if (county) {
                                            const query = `${county} ${state} GIS Property Tax Portal`;
                                            const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
                                            window.open(url, '_blank');
                                        } else {
                                            alert('Could not auto-determine county from these coordinates.');
                                        }
                                    } catch(e) {
                                        alert('Failed to connect to location services.');
                                    }
                                }}
                                style={{
                                    width: '100%', padding: '10px', borderRadius: 8,
                                    border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.15)',
                                    color: '#10b981', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    transition: 'all 0.2s'
                                }}
                                onMouseOver={e => e.currentTarget.style.background = 'rgba(16,185,129,0.25)'}
                                onMouseOut={e => e.currentTarget.style.background = 'rgba(16,185,129,0.15)'}
                            >
                                🌍 {t('map.autoSearchGisGlobal', 'Lookup Regional GIS')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════ RADAR ANIMATION TIMELINE ════ */}
            {showWeather && radarFrames.length > 0 && (
                <div style={{
                    position: 'absolute', bottom: 50, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 1100, display: 'flex', alignItems: 'center', gap: 10,
                    background: 'rgba(15,23,42,0.92)', borderRadius: 12,
                    padding: '8px 18px', backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(71,85,105,0.4)',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.5)', minWidth: 420,
                }}>
                    {/* Play/Pause */}
                    <button onClick={() => setRadarPlaying(p => !p)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 18, color: '#818cf8', padding: 0, lineHeight: 1
                    }}>
                        {radarPlaying ? '⏸' : '▶️'}
                    </button>

                    {/* Scrubber */}
                    <input
                        type="range" min={0} max={radarFrames.length - 1} value={radarIndex}
                        onChange={e => { setRadarPlaying(false); setRadarIndex(Number(e.target.value)); }}
                        style={{ flex: 1, accentColor: '#6366f1', cursor: 'pointer', height: 6 }}
                    />

                    {/* Timestamp / Frame Label */}
                    <div style={{ minWidth: 100, textAlign: 'right' }}>
                        <div style={{
                            fontSize: '0.65rem', fontWeight: 800,
                            color: radarFrames[radarIndex]?.source === 'noaa' ? '#818cf8' : radarFrames[radarIndex]?.isForecast ? '#f59e0b' : '#6ee7b7',
                            textTransform: 'uppercase', letterSpacing: '0.04em'
                        }}>
                            {radarFrames[radarIndex]?.source === 'noaa' ? '🛰️ NOAA 18H' : radarFrames[radarIndex]?.isForecast ? '🔮 NOWCAST' : '📡 LIVE'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#f1f5f9', fontFamily: 'monospace', fontWeight: 700 }}>
                            {radarFrames[radarIndex]?.time
                                ? new Date(radarFrames[radarIndex].time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : '--:--'
                            }
                        </div>
                        {radarFrames[radarIndex]?.label && (
                            <div style={{ fontSize: '0.55rem', color: '#64748b' }}>{radarFrames[radarIndex].label}</div>
                        )}
                    </div>
                </div>
            )}
            {/* ════ LEFT SIDEBAR ════ */}
            <div style={{
                width: 320, minWidth: 320, background: panelBg,
                borderRight: `1px solid ${border}`, display: 'flex', flexDirection: 'column',
                overflow: 'hidden', backdropFilter: 'blur(20px)', zIndex: 500,
                paddingTop: 100
            }}>
                {/* Header */}
                <div style={{ padding: '16px', borderBottom: `1px solid ${border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <span style={{ fontSize: 24 }}>🗺️</span>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#f1f5f9' }}>{t('map.sidebarTitle', 'Enterprise Map')}</h2>
                            <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                {t('map.sidebarSubtitle', 'Property & Locations')}
                            </span>
                        </div>
                    </div>

                    {/* Search */}
                    <input
                        type="text" placeholder={t('map.searchPlaceholder', 'Search locations or addresses...')} value={search}
                        onChange={e => setSearch(e.target.value)}
                        onKeyDown={handleGeocode}
                        style={{
                            width: '100%', padding: '8px 12px', borderRadius: 8,
                            border: `1px solid ${border}`, background: 'rgba(255,255,255,0.06)',
                            color: '#f1f5f9', fontSize: '0.8rem', outline: 'none', marginBottom: 8
                        }}
                    />

                    {/* Filter row */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setFilterType('All')}
                            style={{
                                padding: '4px 10px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 700,
                                border: filterType === 'All' ? '1px solid #6366f1' : `1px solid ${border}`,
                                background: filterType === 'All' ? 'rgba(99,102,241,0.2)' : 'transparent',
                                color: filterType === 'All' ? '#818cf8' : '#94a3b8', cursor: 'pointer'
                            }}>{t('map.filterAll', 'ALL')}</button>
                        {PIN_TYPES.map(pt => (
                            <button key={pt.id}
                                onClick={() => setFilterType(pt.id)}
                                style={{
                                    padding: '4px 8px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 700,
                                    border: filterType === pt.id ? `1px solid ${pt.color}` : `1px solid ${border}`,
                                    background: filterType === pt.id ? `${pt.color}22` : 'transparent',
                                    color: filterType === pt.id ? pt.color : '#94a3b8', cursor: 'pointer'
                                }}>{pt.emoji} {pt.id}</button>
                        ))}
                    </div>
                </div>

                {/* Pin list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {loading && <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>{t('map.loading', 'Loading...')}</div>}
                    {!loading && filtered.length === 0 && (
                        <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                            {t('map.noLocationsFound', 'No locations found. Click "Add Pin" to place one.')}
                        </div>
                    )}
                    {filtered.map(pin => {
                        const cfg = PIN_TYPES.find(p => p.id === pin.pinType) || PIN_TYPES[0];
                        return (
                            <div key={pin.id}
                                onClick={() => {
                                    setSelectedPin(pin.id);
                                    setFlyTo({ lat: pin.lat, lng: pin.lng });
                                }}
                                style={{
                                    padding: '10px 12px', borderRadius: 10, marginBottom: 4, cursor: 'pointer',
                                    background: selectedPin === pin.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                                    border: selectedPin === pin.id ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                                    transition: 'all 0.2s'
                                }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 18 }}>{cfg.emoji}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {pin.label || t('map.unnamedLocation', 'Unnamed Location')}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                                            {[pin.city, pin.state].filter(Boolean).join(', ') || `${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}`}
                                        </div>
                                    </div>
                                    <span style={{
                                        fontSize: '0.55rem', fontWeight: 800, color: cfg.color,
                                        background: `${cfg.color}15`, padding: '2px 6px', borderRadius: 4,
                                        textTransform: 'uppercase', letterSpacing: '0.04em'
                                    }}>{cfg.id}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Add pin controls */}
                <div style={{ padding: '12px 16px', borderTop: `1px solid ${border}` }}>
                    {addMode ? (
                        <div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ animation: 'pulse 1.5s infinite' }}>📍</span> {t('map.clickToPlacePin', 'Click on the map to place a pin')}
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                                {PIN_TYPES.map(pt => (
                                    <button key={pt.id} onClick={() => setAddType(pt.id)}
                                        style={{
                                            padding: '4px 8px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 700,
                                            border: addType === pt.id ? `2px solid ${pt.color}` : `1px solid ${border}`,
                                            background: addType === pt.id ? `${pt.color}22` : 'transparent',
                                            color: addType === pt.id ? pt.color : '#94a3b8', cursor: 'pointer'
                                        }}>{pt.emoji} {pt.id}</button>
                                ))}
                            </div>
                            <button onClick={() => setAddMode(false)}
                                style={{
                                    width: '100%', padding: '8px', borderRadius: 8, cursor: 'pointer',
                                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                                    color: '#f87171', fontSize: '0.75rem', fontWeight: 700
                                }}>{t('map.cancel', 'Cancel')}</button>
                        </div>
                    ) : (
                        <button onClick={() => setAddMode(true)}
                            style={{
                                width: '100%', padding: '10px', borderRadius: 10, cursor: 'pointer',
                                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                                color: '#818cf8', fontSize: '0.8rem', fontWeight: 800,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                            }}>
                            <span style={{ fontSize: 16 }}>＋</span> {t('map.addPin', 'Add Pin')}
                        </button>
                    )}
                    <div style={{ fontSize: '0.6rem', color: '#475569', textAlign: 'center', marginTop: 6 }}>
                        {pins.length} total location{pins.length !== 1 ? 's' : ''}
                    </div>
                </div>
            </div>

            {/* ════ MAP / GLOBE ════ */}
            <div style={{ flex: 1, position: 'relative' }}>
                {addMode && (
                    <div style={{
                        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
                        background: 'rgba(245,158,11,0.95)', color: '#000', padding: '10px 24px',
                        borderRadius: 12, fontWeight: 800, fontSize: '0.85rem',
                        boxShadow: '0 8px 24px rgba(245,158,11,0.4)', display: 'flex', alignItems: 'center', gap: 8
                    }}>
                        📍 {t('map.addModePrompt', 'Click anywhere on the')} {viewMode === 'globe' ? t('map.viewGlobe', 'Globe').toLowerCase() : t('map.viewMap', 'Map').toLowerCase()} {t('map.addModePromptSuffix', 'to place a')} {PIN_TYPES.find(p => p.id === addType)?.label || t('map.pin', 'pin')}
                    </div>
                )}

                {/* 2D Leaflet Map */}
                {viewMode === 'map' && (
                    <MapContainer
                        center={[39.8283, -98.5795]}
                        zoom={5}
                        minZoom={3}
                        zoomControl={false}
                        preferCanvas={true}
                        style={{ height: '100%', width: '100%', background: '#0f172a' }}
                        doubleClickZoom={false}
                    >
                        <MapController flyTo={flyTo} />
                        <MapClickHandler
                            onMapClick={handleMapClick}
                            addMode={addMode}
                            showWeather={showWeather}
                            onWeatherClick={fetchWeather}
                            onZoomChange={setZoom}
                        />
                        <ZoomControl position="topleft" />

                        <LayersControl position="topright">
                            <LayersControl.BaseLayer checked name="Dark">
                                <LayerGroup>
                                    <TileLayer
                                        attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                                        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                                        maxNativeZoom={16}
                                        maxZoom={20}
                                    />
                                    {/* Make the label/road overlay a permanently attached part of the Dark base map */}
                                    <TileLayer
                                        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
                                        opacity={0.8}
                                        zIndex={400}
                                        maxNativeZoom={16}
                                        maxZoom={20}
                                    />
                                </LayerGroup>
                            </LayersControl.BaseLayer>
                            <LayersControl.BaseLayer name="Standard">
                                <TileLayer
                                    attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
                                    maxNativeZoom={19}
                                    maxZoom={20}
                                />
                            </LayersControl.BaseLayer>
                            <LayersControl.BaseLayer name="Satellite">
                                <TileLayer
                                    attribution='&copy; ESRI Satellite'
                                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                    maxNativeZoom={19}
                                    maxZoom={20}
                                />
                            </LayersControl.BaseLayer>
                        </LayersControl>

                        {/* Weather Radar Overlay (animated) */}
                        {showWeather && radarUrl && (
                            <TileLayer
                                key={radarUrl}
                                url={radarUrl}
                                opacity={0.6}
                                zIndex={400}
                                maxNativeZoom={6}
                                maxZoom={18}
                            />
                        )}

                        {/* State borders */}
                        <GeoJSON
                            data={usStatesData}
                            style={{ color: '#5BC0DE', weight: 1.5, opacity: 0.25, fillOpacity: 0 }}
                            interactive={false}
                        />

                        {/* Intelligence Layer: Earthquakes */}
                        {showEarthquakes && earthquakes.map((q, i) => {
                            const [lng, lat] = q.geometry.coordinates;
                            const mag = q.properties.mag;
                            const color = mag > 5 ? '#ef4444' : mag > 3 ? '#f59e0b' : '#3b82f6';
                            return (
                                <CircleMarker
                                    key={`quake-${i}`}
                                    center={[lat, lng]}
                                    radius={mag * 2}
                                    pathOptions={{ color, fillColor: color, fillOpacity: 0.4 }}
                                >
                                    <Popup>
                                        <div style={{ fontWeight: 800, color: '#ef4444' }}>{t('map.earthquake', 'Earthquake')}</div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>{q.properties.place}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{t('map.magnitude', 'Magnitude:')} {mag}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{new Date(q.properties.time).toLocaleString()}</div>
                                    </Popup>
                                </CircleMarker>
                            );
                        })}


                        {/* Intelligence Layer: Traffic & Infrastructure */}
                        {showTraffic && (
                            <>
                                {/* Road/Infrastructure Overlay — CartoDB Labels (no API key required) */}
                                <TileLayer
                                    key="infra-overlay"
                                    url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
                                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                                    opacity={0.5}
                                    zIndex={405}
                                />
                                {/* Enterprise Configuration: Glowing Road Infrastructure (Traffic Glow) */}
                                {import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? (
                                    <TileLayer
                                        key="google-traffic-legal"
                                        url={`https://maps.googleapis.com/maps/vt?pb=!1m5!1m4!1i{z}!2i{x}!3i{y}!4i256!2m3!1e0!2sm!3i635398603!3m17!2sen-US!3sUS!4sUS!5e18!12m4!1e68!2m2!1sset!2sRoadmap!12m3!1e37!2m1!1ssmartmaps!4e0&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`}
                                        attribution="&copy; Google Maps"
                                        opacity={1.0}
                                        zIndex={410}
                                    />
                                ) : (
                                    <TileLayer
                                        key="google-traffic-live"
                                        url="https://mt1.google.com/vt/lyrs=h,traffic&x={x}&y={y}&z={z}"
                                        attribution="&copy; Google Maps (Unauth Fallback)"
                                        opacity={1.0}
                                        crossOrigin="anonymous"
                                        zIndex={410}
                                    />
                                )}
                            </>
                        )}

                        {/* Pins */}
                        {filtered.map(pin => (
                            <Marker
                                key={pin.id}
                                position={[pin.lat, pin.lng]}
                                icon={getIcon(pin.pinType, selectedPin === pin.id)}
                                eventHandlers={{
                                    click: () => {
                                        setSelectedPin(pin.id);
                                        setEditData(pin);
                                        setShowEditor(true);
                                    }
                                }}
                            >
                                <Tooltip direction="top" offset={[0, -20]} opacity={0.9}>
                                    <div style={{ fontWeight: 'bold', color: '#1e293b' }}>{pin.label || t('map.unnamed', 'Unnamed')}</div>
                                    <div style={{ fontSize: '10px', color: '#475569' }}>
                                        {[pin.city, pin.state].filter(Boolean).join(', ')} ({(PIN_TYPES.find(p => p.id === pin.pinType) || PIN_TYPES[0]).label})
                                    </div>
                                </Tooltip>
                            </Marker>
                        ))}
                    </MapContainer>
                )}

                {/* 3D Cesium Globe */}
                {viewMode === 'globe' && (
                    <Suspense fallback={
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#0a0a1a', color: '#6366f1', fontSize: '1rem', fontWeight: 700, gap: 12 }}>
                            <span style={{ fontSize: 32, animation: 'spin 2s linear infinite' }}>🌍</span>
                            {t('map.loading3DGlobe', 'Loading 3D Globe...')}
                        </div>
                    }>
                        <CesiumGlobeView
                            pins={filtered}
                            selectedPin={selectedPin}
                            flyTo={flyTo}
                            onPinClick={(pinId) => {
                                const pin = pins.find(p => p.id === pinId);
                                if (pin) {
                                    setSelectedPin(pinId);
                                    setEditData(pin);
                                    setShowEditor(true);
                                }
                            }}
                            onMapClick={(latlng) => handleWeatherOrPinClick(latlng)}
                            addMode={addMode}
                            showTraffic={showTraffic}
                        />
                    </Suspense>
                )}
            </div>

            {/* ════ PROPERTY EDITOR PANEL ════ */}
            {showEditor && editData.id && (
                <div style={{
                    width: 400, minWidth: 400, background: panelBg,
                    borderLeft: `1px solid ${border}`, overflowY: 'auto',
                    backdropFilter: 'blur(20px)', zIndex: 500
                }}>
                    <div style={{ padding: '16px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#f1f5f9' }}>
                            {(PIN_TYPES.find(p => p.id === editData.pinType) || PIN_TYPES[0]).emoji} {t('map.locationDetails', 'Location Details')}
                        </h3>
                        <button onClick={() => { setShowEditor(false); setSelectedPin(null); }}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                    </div>

                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Pin Type */}
                        <div>
                            <label style={labelStyle}>{t('map.pinType', 'Pin Type')}</label>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {PIN_TYPES.map(pt => (
                                    <button key={pt.id} onClick={() => setEditData(d => ({ ...d, pinType: pt.id }))}
                                        style={{
                                            padding: '6px 10px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 700,
                                            border: editData.pinType === pt.id ? `2px solid ${pt.color}` : `1px solid ${border}`,
                                            background: editData.pinType === pt.id ? `${pt.color}22` : 'transparent',
                                            color: editData.pinType === pt.id ? pt.color : '#94a3b8', cursor: 'pointer'
                                        }}>{pt.emoji} {pt.label}</button>
                                ))}
                            </div>
                        </div>

                        {/* Basic Info */}
                        <Field label={t('map.fieldLocationName', 'Location Name')} value={editData.label} onChange={v => setEditData(d => ({ ...d, label: v }))} />
                        <Field label={t('map.fieldAddress', 'Address')} value={editData.address} onChange={v => setEditData(d => ({ ...d, address: v }))} />
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                            <Field label={t('map.fieldCity', 'City')} value={editData.city} onChange={v => setEditData(d => ({ ...d, city: v }))} />
                            <Field label={t('map.fieldState', 'State')} value={editData.state} onChange={v => setEditData(d => ({ ...d, state: v }))} />
                            <Field label={t('map.fieldZip', 'Zip')} value={editData.zip} onChange={v => setEditData(d => ({ ...d, zip: v }))} />
                        </div>

                        {/* Property Data Section */}
                        <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12 }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                                {t('map.sectionPropertyData', 'Property Data')}
                            </div>
                            <Field label={t('map.fieldCounty', 'County')} value={editData.county} onChange={v => setEditData(d => ({ ...d, county: v }))} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                                <Field label={t('map.fieldAcreage', 'Acreage')} value={editData.acreage} onChange={v => setEditData(d => ({ ...d, acreage: v }))} />
                                <Field label={t('map.fieldParcelId', 'Parcel ID')} value={editData.parcelId} onChange={v => setEditData(d => ({ ...d, parcelId: v }))} />
                            </div>
                            <Field label={t('map.fieldPropertyClass', 'Property Class')} value={editData.propertyClass} onChange={v => setEditData(d => ({ ...d, propertyClass: v }))} mt />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                                <Field label={t('map.fieldPropertyValue', 'Est. Value')} value={editData.propertyValue} onChange={v => setEditData(d => ({ ...d, propertyValue: v }))} />
                                <Field label={t('map.fieldTaxAmount', 'Tax Amount')} value={editData.taxAmount} onChange={v => setEditData(d => ({ ...d, taxAmount: v }))} />
                            </div>
                            <Field label={t('map.fieldLegalDescription', 'Legal Description')} value={editData.legalDescription} onChange={v => setEditData(d => ({ ...d, legalDescription: v }))} textarea mt />
                        </div>

                        {/* External Links */}
                        <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12 }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                                {t('map.sectionExternalResources', 'External Resources')}
                            </div>
                            <button 
                                onClick={async () => {
                                    try {
                                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${editData.lat}&lon=${editData.lng}&zoom=10&addressdetails=1`);
                                        const data = await res.json();
                                        const county = data?.address?.county || '';
                                        const state = data?.address?.state || editData.state || '';
                                        if (county) {
                                            setEditData(d => ({...d, county}));
                                            const query = `${county} ${state} GIS Property Tax Portal`;
                                            const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
                                            window.open(url, '_blank');
                                        } else {
                                            alert('Could not auto-determine county from these coordinates.');
                                        }
                                    } catch(e) {
                                        alert('Failed to connect to location services.');
                                    }
                                }}
                                style={{
                                    width: '100%', padding: '8px', marginBottom: 12, borderRadius: 8,
                                    border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.1)',
                                    color: '#10b981', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    transition: 'all 0.2s'
                                }}
                                onMouseOver={e => e.currentTarget.style.background = 'rgba(16,185,129,0.2)'}
                                onMouseOut={e => e.currentTarget.style.background = 'rgba(16,185,129,0.1)'}
                            >
                                🌍 {t('map.autoSearchGis', 'Auto-Search Local GIS (Free)')}
                            </button>
                            <LinkField label={t('map.fieldGisPortal', 'County GIS Portal')} value={editData.gisUrl} onChange={v => setEditData(d => ({ ...d, gisUrl: v }))} />
                            <LinkField label={t('map.fieldRecorderOfDeeds', 'Recorder of Deeds')} value={editData.recorderOfDeedsUrl} onChange={v => setEditData(d => ({ ...d, recorderOfDeedsUrl: v }))} />
                            <LinkField label={t('map.fieldTaxRecords', 'Tax Records')} value={editData.taxRecordsUrl} onChange={v => setEditData(d => ({ ...d, taxRecordsUrl: v }))} />
                        </div>

                        {/* Notes */}
                        <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12 }}>
                            <Field label={t('map.fieldNotes', 'Notes')} value={editData.notes} onChange={v => setEditData(d => ({ ...d, notes: v }))} textarea />
                        </div>

                        {/* Coordinates (read-only) */}
                        <div style={{ background: cardBg, borderRadius: 8, padding: '8px 12px', border: `1px solid ${border}` }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('map.coordinates', 'Coordinates')}</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>
                                {editData.lat?.toFixed(6)}, {editData.lng?.toFixed(6)}
                            </div>
                        </div>

                        {/* Source info */}
                        {editData.createdBy && (
                            <div style={{ fontSize: '0.6rem', color: '#475569' }}>
                                {t('map.createdBy', 'Created by')} <strong style={{ color: '#94a3b8' }}>{editData.createdBy}</strong>
                                {editData.plantId && <> {t('map.createdAt', 'at')} <strong style={{ color: '#94a3b8' }}>{editData.plantId.replace(/_/g, ' ')}</strong></>}
                            </div>
                        )}

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <button onClick={handleSave} className="btn-save"
                                style={{
                                    flex: 1, padding: '10px', borderRadius: 10, fontWeight: 800, fontSize: '0.8rem',
                                    cursor: 'pointer', border: 'none',
                                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white'
                                }}>{t('map.save', 'Save')}</button>
                            <button onClick={() => handleDelete(editData.id)}
                                style={{
                                    padding: '10px 16px', borderRadius: 10, fontWeight: 700, fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171'
                                }}>{t('map.delete', 'Delete')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Reusable field components ──
const labelStyle = {
    display: 'block', fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4
};
const inputStyle = {
    width: '100%', padding: '7px 10px', borderRadius: 6,
    border: '1px solid rgba(71,85,105,0.4)', background: 'rgba(255,255,255,0.06)',
    color: '#f1f5f9', fontSize: '0.8rem', outline: 'none'
};

function Field({ label, value, onChange, textarea, mt }) {
    return (
        <div style={mt ? { marginTop: 8 } : undefined}>
            <label style={labelStyle}>{label}</label>
            {textarea ? (
                <textarea value={value || ''} onChange={e => onChange(e.target.value)}
                    rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            ) : (
                <input value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle} />
            )}
        </div>
    );
}

function LinkField({ label, value, onChange }) {
    const { t } = useTranslation();
    return (
        <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>{label}</label>
            <div style={{ display: 'flex', gap: 6 }}>
                <input value={value || ''} onChange={e => onChange(e.target.value)}
                    placeholder="https://..." style={{ ...inputStyle, flex: 1 }} />
                {value && (
                    <a href={value} target="_blank" rel="noopener noreferrer"
                        style={{
                            padding: '6px 10px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 700,
                            background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
                            color: '#f59e0b', textDecoration: 'none', whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: 4
                        }}>{t('map.openLink', 'Open ↗')}</a>
                )}
            </div>
        </div>
    );
}
