// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Mini Map
 * ====================
 * Compact embedded Leaflet map rendering a single location pin. Used in
 * Asset, Fleet Vehicle, and Contractor detail panels to show GPS location
 * inline without navigating away to the full USMapView.
 *
 * KEY FEATURES:
 *   - Single pin at specified lat/lng with optional tooltip label
 *   - OpenStreetMap tiles — no API key required
 *   - Non-interactive by default (no scroll zoom, no drag) to prevent
 *     accidental map interaction when scrolling through detail panels
 *   - Configurable height and initial zoom level
 *   - Responsive: fills 100% of parent container width
 *
 * @param {number}  lat      — Decimal degrees latitude (required)
 * @param {number}  lng      — Decimal degrees longitude (required)
 * @param {string}  [label]  — Tooltip text shown on the pin marker
 * @param {number}  [height] — Map height in pixels (default 180)
 * @param {number}  [zoom]   — Initial zoom level (default 16)
 */
import React from 'react';
import { MapContainer, TileLayer, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Emoji pin icon — avoids the Webpack leaflet PNG import issue entirely.
const pinIcon = L.divIcon({
    className: '',
    html: '<div style="font-size:22px;line-height:1;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.6))">📍</div>',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    tooltipAnchor: [0, -24],
});

export default function MiniMap({ lat, lng, label, height = 180, zoom = 16 }) {
    if (!lat || !lng) return null;

    return (
        <div style={{
            height,
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.1)',
            marginTop: 12,
        }}>
            <MapContainer
                center={[lat, lng]}
                zoom={zoom}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                scrollWheelZoom={false}
                dragging={false}
                doubleClickZoom={false}
                attributionControl={false}
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[lat, lng]} icon={pinIcon}>
                    {label && (
                        <Tooltip permanent direction="top">
                            <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{label}</span>
                        </Tooltip>
                    )}
                </Marker>
            </MapContainer>
        </div>
    );
}
