// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Online Status Detection Hook
 * ==================================================
 * React hook that monitors network connectivity via navigator.onLine
 * and online/offline window events. Drives the OfflineStatusBar
 * and controls whether API calls or IndexedDB fallback is used.
 */
import { useState, useEffect } from 'react';

/**
 * useOnlineStatus - Reliability Hook
 * Tracks the browser's connectivity to provide UI feedback 
 * for "Cooler-Proof" operations.
 */
export default function useOnlineStatus() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const goOnline = () => setIsOnline(true);
        const goOffline = () => setIsOnline(false);

        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);

        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    return isOnline;
}
