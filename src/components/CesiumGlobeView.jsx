// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Cesium 3D Globe View
 * ==================================
 * 3D globe visualization of enterprise plant locations using CesiumJS.
 * Lazy-loaded from USMapView.jsx (React.lazy) — only initialized when the
 * user explicitly switches to 3D mode to avoid loading the ~200KB Cesium bundle
 * on every page load.
 *
 * FEATURES:
 *   3D Globe        — CesiumJS globe with terrain, atmosphere, and day/night cycle
 *   Plant Pins      — Color-coded billboard markers per pin type
 *                     Plant (red), Branch (blue), Warehouse (amber), Distribution (green)
 *   Pin Tooltips    — Click a pin to open an HTML overlay with plant name and details
 *   Camera Flight   — Animated camera fly-to when a pin is selected from the list
 *   Emoji Labels    — Each pin type has a corresponding emoji: 🏭 🏢 📦 🚚 📌
 *
 * PIN COLORS: Lazily evaluated (Cesium.Color can't be called at module top-level with Vite).
 *   Color resolution deferred to getPinColor() which calls Cesium.Color.fromCssColorString().
 *
 * DATA: Receives pins[] prop from USMapView (fetched via /api/map-pins).
 *   No direct API calls — all data passed as props for clean separation.
 *
 * @param {Array}  pins        - Array of map pin objects from /api/map-pins
 * @param {string} selectedPin - ID of the currently selected pin (triggers fly-to)
 */
import React, { useEffect, useRef } from 'react';
import { useTranslation } from '../i18n/index.jsx';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// ── Pin colors (lazy — Cesium.Color can't be called at module top-level with Vite) ──
const PIN_COLOR_CSS = {
    Plant: '#ef4444', Branch: '#3b82f6', Warehouse: '#f59e0b',
    Distribution: '#10b981', Notes: '#8b5cf6',
};
const PIN_EMOJI = {
    Plant: '🏭', Branch: '🏢', Warehouse: '📦', Distribution: '🚚', Notes: '📌'
};
function getPinColor(type) {
    return Cesium.Color.fromCssColorString(PIN_COLOR_CSS[type] || PIN_COLOR_CSS.Plant);
}

export default function CesiumGlobeView({
    pins = [], selectedPin, flyTo, onPinClick, onMapClick, addMode, showTraffic
}) {
    const { t } = useTranslation();
    const containerRef = useRef(null);
    const viewerRef = useRef(null);
    const bordersSourceRef = useRef(null);
    const trafficLayerRef = useRef(null);

    // Build viewer on mount
    useEffect(() => {
        if (!containerRef.current) return;
        Cesium.Ion.defaultAccessToken = undefined;

        const viewer = new Cesium.Viewer(containerRef.current, {
            baseLayerPicker: false,
            imageryProvider: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            selectionIndicator: false,
            infoBox: false,
            timeline: false,
            animation: false,
            navigationHelpButton: false,
            fullscreenButton: false,
            vrButton: false,
            creditContainer: document.createElement('div'),
            skyBox: false,
            skyAtmosphere: new Cesium.SkyAtmosphere(),
            contextOptions: { webgl: { alpha: true } }
        });

        // Layer 1: ESRI Satellite imagery
        viewer.imageryLayers.addImageryProvider(
            new Cesium.UrlTemplateImageryProvider({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                credit: new Cesium.Credit('ESRI'),
                maximumLevel: 19,
                tilingScheme: new Cesium.WebMercatorTilingScheme()
            })
        );

        // Layer 2: ESRI Places and Boundaries (labels, cities, borders) — Standard map component always visible
        const bordersLayer = viewer.imageryLayers.addImageryProvider(
            new Cesium.UrlTemplateImageryProvider({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
                credit: new Cesium.Credit('ESRI Reference'),
                maximumLevel: 19,
                tilingScheme: new Cesium.WebMercatorTilingScheme()
            })
        );
        bordersLayer.alpha = 0.8;

        // Layer 3: ESRI Transportation (roads) — Standard map component always visible
        const transportationLayer = viewer.imageryLayers.addImageryProvider(
            new Cesium.UrlTemplateImageryProvider({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
                credit: new Cesium.Credit('ESRI Roads'),
                maximumLevel: 19,
                tilingScheme: new Cesium.WebMercatorTilingScheme()
            })
        );
        transportationLayer.alpha = 0.6;

        // Also load GeoJSON state borders as polylines for the crisp cyan outlines
        (async () => {
            try {
                const statesModule = await import('../data/us-states.json');
                const ds = await Cesium.GeoJsonDataSource.load(statesModule.default || statesModule, {
                    stroke: Cesium.Color.fromCssColorString('#5BC0DE').withAlpha(0.6),
                    strokeWidth: 2,
                    fill: Cesium.Color.TRANSPARENT,
                    clampToGround: false
                });
                // Set all polylines to height 0 — this enables outlines (clampToGround disables them)
                const entities = ds.entities.values;
                for (let i = 0; i < entities.length; i++) {
                    const e = entities[i];
                    if (e.polygon) {
                        e.polygon.height = 0;
                        e.polygon.outline = true;
                        e.polygon.outlineColor = Cesium.Color.fromCssColorString('#5BC0DE').withAlpha(0.6);
                        e.polygon.outlineWidth = 2;
                        e.polygon.material = Cesium.Color.TRANSPARENT;
                    }
                }
                if (viewer && !viewer.isDestroyed()) {
                    viewer.dataSources.add(ds);
                    bordersSourceRef.current = ds;
                }
            } catch (err) {
                if (viewer && !viewer.isDestroyed()) {
                    console.warn('[Globe] State borders GeoJSON load failed:', err);
                }
            }
        })();

        // Globe settings
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0a1a');
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.showGroundAtmosphere = true;
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a365d');
        viewer.scene.screenSpaceCameraController.maximumZoomDistance = 25000000;

        // Camera starts looking at US
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-98.5795, 39.8283, 8000000),
            duration: 0
        });

        // Click handler
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click) => {
            // Check entity (pin) click
            const picked = viewer.scene.pick(click.position);
            if (Cesium.defined(picked) && picked.id && picked.id._pinId) {
                if (onPinClick) onPinClick(picked.id._pinId);
                return;
            }
            // Map click
            const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
            if (cartesian) {
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                const lat = Cesium.Math.toDegrees(cartographic.latitude);
                const lng = Cesium.Math.toDegrees(cartographic.longitude);
                if (onMapClick) onMapClick({ lat, lng });
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        viewerRef.current = viewer;

        return () => {
            handler.destroy();
            if (viewer && !viewer.isDestroyed()) viewer.destroy();
            viewerRef.current = null;
        };
    }, []);

    // ── Toggle Google Traffic Layer (glow effect) ──
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;

        if (showTraffic && !trafficLayerRef.current) {
            // Add the glowing neon green Google Traffic layer when toggled ON
            const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
            const url = apiKey 
                ? `https://maps.googleapis.com/maps/vt?pb=!1m5!1m4!1i{z}!2i{x}!3i{y}!4i256!2m3!1e0!2sm!3i635398603!3m17!2sen-US!3sUS!4sUS!5e18!12m4!1e68!2m2!1sset!2sRoadmap!12m3!1e37!2m1!1ssmartmaps!4e0&key=${apiKey}`
                : 'https://mt1.google.com/vt/lyrs=h,traffic&x={x}&y={y}&z={z}';
            
            const provider = new Cesium.UrlTemplateImageryProvider({
                url,
                credit: new Cesium.Credit(apiKey ? 'Google Maps Official' : 'Google Maps Fallback'),
                maximumLevel: 19,
                tilingScheme: new Cesium.WebMercatorTilingScheme()
            });

            const layer = new Cesium.ImageryLayer(provider, { alpha: 1.0 });
            viewer.imageryLayers.add(layer);
            trafficLayerRef.current = layer;
        } else if (!showTraffic && trafficLayerRef.current) {
            // Remove the traffic layer if toggled OFF
            viewer.imageryLayers.remove(trafficLayerRef.current, true);
            trafficLayerRef.current = null;
        }
    }, [showTraffic]);

    // ── Update pins ──
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;
        viewer.entities.removeAll();

        pins.forEach(pin => {
            const color = getPinColor(pin.pinType);
            const emoji = PIN_EMOJI[pin.pinType] || '📍';
            const isSelected = selectedPin === pin.id;

            const entity = viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(pin.lng, pin.lat),
                point: {
                    pixelSize: isSelected ? 18 : 12,
                    color: color,
                    outlineColor: isSelected ? Cesium.Color.fromCssColorString('#38bdf8') : Cesium.Color.WHITE,
                    outlineWidth: isSelected ? 3 : 1.5,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
                label: {
                    text: `${emoji} ${pin.label || t('cesiumGlobe.unnamed', 'Unnamed')}`,
                    font: '13px Inter, sans-serif',
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 3,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(0, -20),
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    show: isSelected || viewer.camera.positionCartographic.height < 3000000,
                }
            });
            entity._pinId = pin.id;
        });
    }, [pins, selectedPin]);

    // Fly to generic location (e.g. search result)
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed() || !flyTo) return;
        // height: Balanced zoom (18) in 2D is ~1000m in 3D
        const height = (flyTo.zoom >= 18) ? 1000 : 200000;
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(flyTo.lng, flyTo.lat, height),
            duration: 1.5
        });
    }, [flyTo]);

    // Fly to selected pin
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed() || !selectedPin) return;
        const pin = pins.find(p => p.id === selectedPin);
        if (pin) {
            viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(pin.lng, pin.lat, 200000),
                duration: 1.5
            });
        }
    }, [selectedPin]);

    return (
        <div ref={containerRef} style={{
            width: '100%', height: '100%', position: 'relative',
            background: '#0a0a1a'
        }} />
    );
}
