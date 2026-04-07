// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — PWA Offline Status Bar
 * ===================================
 * Network connectivity banner and offline mode indicator. Persists across
 * all views as a fixed bottom bar when the app detects no connectivity.
 * Part of Trier OS's PWA offline-first architecture.
 *
 * KEY FEATURES:
 *   - Online/offline detection via navigator.onLine + window events
 *   - Sync queue counter: shows number of pending actions queued in OfflineDB
 *   - Auto-sync: when connectivity is restored, triggers delta sync automatically
 *   - Retry button: manual sync trigger if auto-sync doesn't fire
 *   - OfflineDB integration: all pending WO creates/updates/parts consumed
 *     are queued in IndexedDB and replayed on reconnect
 *   - "Working Offline" banner: visible reminder that data may not be current
 *   - Dismissible: users can hide the bar (reappears if sync fails)
 *
 * SYNC BEHAVIOR:
 *   1. Actions made offline are queued to OfflineDB (IndexedDB)
 *   2. On reconnect, OfflineDB.sync() replays queued requests in order
 *   3. Conflicts: server wins for reads; last-write-wins for WO status updates
 */
import React, { useState, useEffect, useRef } from 'react';
import OfflineDB from '../utils/OfflineDB.js';
import { useTranslation } from '../i18n/index.jsx';

/**
 * OfflineStatusBar — Renders a persistent banner when the app goes offline.
 * Shows sync progress when reconnecting. Auto-dismisses on success.
 */
export default function OfflineStatusBar() {
    const { t } = useTranslation();
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingCount, setPendingCount] = useState(0);
    const [syncStatus, setSyncStatus] = useState(null); // null | 'syncing' | 'done' | 'error'
    const [syncMessage, setSyncMessage] = useState('');
    const [showBanner, setShowBanner] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const dismissTimer = useRef(null);

    useEffect(() => {
        let active = true;
        // Start connectivity monitor
        OfflineDB.startConnectivityMonitor(async (online) => {
            setIsOnline(online);
            setDismissed(false);

            if (online) {
                // Back online — replay queue
                const pending = await OfflineDB.getPendingCount();
                if (pending > 0) {
                    setSyncStatus('syncing');
                    setSyncMessage(`Syncing ${pending} change${pending !== 1 ? 's' : ''}...`);
                    
                    const result = await OfflineDB.replayQueue((current, total) => {
                        setSyncMessage(`Syncing ${current} of ${total}...`);
                    });

                    if (result.failed > 0 || result.conflicts > 0) {
                        setSyncStatus('error');
                        setSyncMessage(`${result.sent} synced, ${result.failed} failed, ${result.conflicts} conflicts`);
                    } else {
                        setSyncStatus('done');
                        setSyncMessage(`✅ Back online — ${result.sent} change${result.sent !== 1 ? 's' : ''} synced successfully`);
                        // Auto-dismiss after 4s
                        dismissTimer.current = setTimeout(() => {
                            setShowBanner(false);
                            setSyncStatus(null);
                        }, 4000);
                    }
                } else {
                    setSyncStatus('done');
                    setSyncMessage('✅ Connection restored');
                    dismissTimer.current = setTimeout(() => {
                        setShowBanner(false);
                        setSyncStatus(null);
                    }, 3000);
                }
            } else {
                setSyncStatus(null);
                setSyncMessage('');
            }
        });

        // Poll pending count every 5s when offline
        const interval = setInterval(async () => {
            const count = await OfflineDB.getPendingCount();
            setPendingCount(count);
        }, 5000);

        return () => {
            active = false;
            clearInterval(interval);
            if (dismissTimer.current) clearTimeout(dismissTimer.current);
        };
    }, []);

    // Show banner when offline or syncing
    useEffect(() => {
        if (!isOnline || syncStatus === 'syncing' || syncStatus === 'done' || syncStatus === 'error') {
            setShowBanner(true);
        }
    }, [isOnline, syncStatus]);

    if (!showBanner || dismissed) return null;

    const isOffline = !isOnline && syncStatus !== 'done';
    const isSyncing = syncStatus === 'syncing';
    const isDone = syncStatus === 'done';
    const isError = syncStatus === 'error';

    const bgColor = isOffline ? 'rgba(245, 158, 11, 0.95)' :
                    isSyncing ? 'rgba(59, 130, 246, 0.95)' :
                    isDone ? 'rgba(16, 185, 129, 0.95)' :
                    isError ? 'rgba(239, 68, 68, 0.95)' :
                    'rgba(245, 158, 11, 0.95)';

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 99998,
            background: bgColor,
            color: '#fff',
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            fontSize: '0.85rem',
            fontWeight: 600,
            boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
            animation: 'slideDown 0.3s ease',
            backdropFilter: 'blur(8px)'
        }}>
            {isOffline && (
                <>
                    <span style={{ fontSize: '1.1rem' }}>📡</span>
                    <span>{t('offlineStatusBar.offlineModeChangesAreSaved')}</span>
                    {pendingCount > 0 && (
                        <span style={{
                            background: 'rgba(255,255,255,0.2)',
                            padding: '2px 10px',
                            borderRadius: '12px',
                            fontSize: '0.75rem'
                        }}>
                            🔄 {pendingCount} pending
                        </span>
                    )}
                </>
            )}

            {isSyncing && (
                <>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>🔄</span>
                    <span>{syncMessage}</span>
                </>
            )}

            {isDone && <span>{syncMessage}</span>}

            {isError && (
                <>
                    <span>⚠️ {syncMessage}</span>
                    <button 
                        onClick={() => setDismissed(true)}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            color: '#fff',
                            padding: '4px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                        }}
                        title={t('offlineStatusBar.dismissThisSyncErrorNotificationTip')}
                    >
                        Dismiss
                    </button>
                </>
            )}

            <style>{`
                @keyframes slideDown {
                    from { transform: translateY(-100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
