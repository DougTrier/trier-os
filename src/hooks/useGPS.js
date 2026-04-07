// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - GPS Location Hook
 * ==================================================
 * React hook that captures the device's GPS coordinates using
 * the browser Geolocation API. Used by mobile technicians to
 * geo-tag work order start/completion locations for field audit.
 */
import { useState, useCallback } from 'react';

/**
 * useGPS — Captures browser GPS coordinates for work order location logging.
 * Returns { coords, error, loading, capture }
 * - capture() → Promise<{ lat, lng, accuracy }> or null if unavailable
 * - Non-blocking: never prevents WO actions even if GPS fails
 */
export default function useGPS() {
    const [coords, setCoords] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const capture = useCallback(() => {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                setError('Geolocation not supported');
                resolve(null);
                return;
            }

            setLoading(true);
            setError(null);

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const result = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: Math.round(position.coords.accuracy)
                    };
                    setCoords(result);
                    setLoading(false);
                    resolve(result);
                },
                (err) => {
                    setError(err.message);
                    setLoading(false);
                    resolve(null); // Don't reject — GPS failure should never block work
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000
                }
            );
        });
    }, []);

    return { coords, error, loading, capture };
}
