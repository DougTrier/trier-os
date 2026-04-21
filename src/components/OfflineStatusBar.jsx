// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — PWA Offline Status Bar
 * ===================================
 * Network connectivity banner and offline mode indicator. Persists across
 * all views as a fixed top bar when the app detects no connectivity or an
 * in-flight sync event.
 *
 * SYNC STATE MACHINE (explicit — not ad-hoc booleans):
 *   IDLE           — no pending activity, banner hidden
 *   DRAINING       — actively replaying queue to central server
 *   AUTH_EXPIRED   — drain halted; session cookie expired mid-outage; queue preserved
 *   COMPLETED      — drain finished, all items synced; auto-dismisses after 4s
 *   REVIEW_REQUIRED — drain finished with errors/conflicts; user must review
 *
 * AUTH EXPIRY FLOW:
 *   1. replayQueue() returns { authExpired: true, remainingCount } on first 401
 *   2. OfflineStatusBar sets AUTH_EXPIRED state and dispatches 'trier-session-expired'
 *   3. App.jsx listens and calls setIsAuthenticated(false) → shows LoginView
 *   4. After login, App.jsx dispatches 'trier-session-restored'
 *   5. OfflineStatusBar listens and calls triggerDrain() automatically — no user action
 *
 * MOUNT-TIME DRAIN:
 *   On mount, if navigator.onLine and queue is non-empty, drain fires immediately.
 *   This covers the page-reload-while-online case after a prior offline session.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import OfflineDB from '../utils/OfflineDB.js';
import LanHub from '../utils/LanHub.js';
import { useTranslation } from '../i18n/index.jsx';

// Explicit sync state constants — prevents string-comparison sprawl as new states are added
const SYNC = {
    IDLE:             'idle',
    DRAINING:         'draining',
    AUTH_EXPIRED:     'auth_expired',
    COMPLETED:        'completed',
    REVIEW_REQUIRED:  'review_required',
};

export default function OfflineStatusBar() {
    const { t } = useTranslation();
    const [isOnline, setIsOnline]               = useState(navigator.onLine);
    const [pendingCount, setPendingCount]        = useState(0);
    const [syncState, setSyncState]             = useState(SYNC.IDLE);
    const [syncMessage, setSyncMessage]          = useState('');
    const [showBanner, setShowBanner]           = useState(false);
    const [dismissed, setDismissed]             = useState(false);
    const [hubTokenExpired, setHubTokenExpired] = useState(false);
    const [syncErrors, setSyncErrors]           = useState([]);
    const [showReview, setShowReview]           = useState(false);
    const dismissTimer  = useRef(null);
    // Prevents concurrent drain calls (e.g., 'online' event + 'trier-session-restored' racing).
    const isDrainingRef = useRef(false);

    const triggerDrain = useCallback(async () => {
        if (isDrainingRef.current) return;
        const count = await OfflineDB.getPendingCount();
        if (count === 0) {
            setSyncState(SYNC.COMPLETED);
            setSyncMessage(t('offlineStatusBar.connectionRestored', '✅ Connection restored'));
            dismissTimer.current = setTimeout(() => {
                setShowBanner(false);
                setSyncState(SYNC.IDLE);
            }, 3000);
            return;
        }

        isDrainingRef.current = true;
        setSyncState(SYNC.DRAINING);
        setSyncMessage(`Syncing ${count} change${count !== 1 ? 's' : ''}...`);

        const result = await OfflineDB.replayQueue((current, total) => {
            setSyncMessage(`Syncing ${current} of ${total}...`);
        });
        isDrainingRef.current = false;

        if (result.authExpired) {
            // Valid scans are preserved in the queue — only auth state is stale.
            // Dispatch to App.jsx to show LoginView; drain resumes on session-restored.
            const n = result.remainingCount;
            setSyncState(SYNC.AUTH_EXPIRED);
            setSyncMessage(`${n} scan${n !== 1 ? 's' : ''} preserved — session expired`);
            console.warn(`[OfflineStatusBar] Sync paused — auth expired. ${n} items preserved in queue.`);
            window.dispatchEvent(new CustomEvent('trier-session-expired'));
        } else if (result.failed > 0 || result.conflicts > 0) {
            setSyncState(SYNC.REVIEW_REQUIRED);
            setSyncMessage(`${result.sent} synced, ${result.failed} failed, ${result.conflicts} conflicts`);
            OfflineDB.getSyncErrors().then(errs => setSyncErrors(errs)).catch(() => {});
        } else {
            setSyncState(SYNC.COMPLETED);
            const n = result.sent;
            setSyncMessage(`✅ Back online — ${n} change${n !== 1 ? 's' : ''} synced successfully`);
            dismissTimer.current = setTimeout(() => {
                setShowBanner(false);
                setSyncState(SYNC.IDLE);
            }, 4000);
        }
    }, []); // all deps (state setters, OfflineDB) are stable references

    useEffect(() => {
        let active = true;

        OfflineDB.startConnectivityMonitor(async (online) => {
            if (!active) return;
            setIsOnline(online);
            setDismissed(false);
            if (online) {
                await triggerDrain();
            } else {
                setSyncState(SYNC.IDLE);
                setSyncMessage('');
            }
        });

        LanHub.onTokenExpired(() => setHubTokenExpired(true));

        // After App.jsx completes re-auth, it fires this event so drain resumes
        // automatically without requiring the user to do anything beyond logging in.
        const onSessionRestored = () => {
            setSyncState(SYNC.IDLE);
            setHubTokenExpired(false);
            triggerDrain();
        };
        window.addEventListener('trier-session-restored', onSessionRestored);

        // Drain queue items that accumulated before this component mounted.
        // Handles the page-reload-while-online case after a prior offline session.
        if (navigator.onLine) {
            OfflineDB.getPendingCount().then(count => {
                if (count > 0 && active) triggerDrain();
            }).catch(() => {});
        }

        const interval = setInterval(async () => {
            const count = await OfflineDB.getPendingCount();
            setPendingCount(count);
        }, 5000);

        return () => {
            active = false;
            clearInterval(interval);
            clearTimeout(dismissTimer.current);
            window.removeEventListener('trier-session-restored', onSessionRestored);
        };
    }, [triggerDrain]);

    useEffect(() => {
        if (!isOnline || syncState !== SYNC.IDLE) setShowBanner(true);
    }, [isOnline, syncState]);

    if (!showBanner || dismissed) return null;

    const isOffline        = !isOnline && syncState !== SYNC.COMPLETED;
    const isDraining       = syncState === SYNC.DRAINING;
    const isCompleted      = syncState === SYNC.COMPLETED;
    const isReviewRequired = syncState === SYNC.REVIEW_REQUIRED;
    const isAuthExpired    = syncState === SYNC.AUTH_EXPIRED;

    const bgColor = isAuthExpired    ? 'rgba(245, 158, 11, 0.95)'
                  : isOffline        ? 'rgba(245, 158, 11, 0.95)'
                  : isDraining       ? 'rgba(59, 130, 246, 0.95)'
                  : isCompleted      ? 'rgba(16, 185, 129, 0.95)'
                  : isReviewRequired ? 'rgba(239, 68, 68, 0.95)'
                  :                    'rgba(245, 158, 11, 0.95)';

    return (
        <>
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
            backdropFilter: 'blur(8px)',
        }}>
            {isOffline && !isAuthExpired && (
                <>
                    <span style={{ fontSize: '1.1rem' }}>📡</span>
                    <span>{t('offlineStatusBar.offlineModeChangesAreSaved')}</span>
                    {pendingCount > 0 && (
                        <span style={{
                            background: 'rgba(255,255,255,0.2)',
                            padding: '2px 10px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                        }}>
                            🔄 {pendingCount} pending
                        </span>
                    )}
                    {hubTokenExpired && (
                        <span style={{
                            background: 'rgba(0,0,0,0.2)',
                            padding: '2px 10px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            opacity: 0.9,
                        }}>
                            ⚠️ {t('offlineStatusBar.hubTokenExpired', 'Hub unavailable — local queue only')}
                        </span>
                    )}
                </>
            )}

            {isAuthExpired && (
                <>
                    <span style={{ fontSize: '1.1rem' }}>🔐</span>
                    <span>{syncMessage}</span>
                    <span style={{
                        background: 'rgba(0,0,0,0.18)',
                        padding: '2px 10px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                    }}>
                        {t('offlineStatusBar.authExpiredNote', 'Queued scans are safe — log in to resume sync')}
                    </span>
                </>
            )}

            {isDraining && (
                <>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>🔄</span>
                    <span>{syncMessage}</span>
                </>
            )}

            {isCompleted && <span>{syncMessage}</span>}

            {isReviewRequired && (
                <>
                    <span>⚠️ {syncMessage}</span>
                    {syncErrors.length > 0 && (
                        <button
                            onClick={() => setShowReview(r => !r)}
                            style={{
                                background: 'rgba(255,255,255,0.2)',
                                border: 'none', color: '#fff',
                                padding: '4px 12px', borderRadius: '6px',
                                cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold',
                            }}
                        >
                            {showReview
                                ? t('offlineStatusBar.hideReview', 'Hide')
                                : t('offlineStatusBar.reviewIssues', `Review ${syncErrors.length} issue${syncErrors.length !== 1 ? 's' : ''}`)}
                        </button>
                    )}
                    <button
                        onClick={() => {
                            OfflineDB.clearSyncErrors().catch(() => {});
                            setSyncErrors([]);
                            setShowReview(false);
                            setDismissed(true);
                        }}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none', color: '#fff',
                            padding: '4px 12px', borderRadius: '6px',
                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold',
                        }}
                        title={t('offlineStatusBar.dismissThisSyncErrorNotificationTip')}
                    >
                        {t('common.dismiss', 'Dismiss')}
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

        {/* Review panel — one level below the banner so it doesn't overlap the controls */}
        {showReview && syncErrors.length > 0 && (
            <div style={{
                position: 'fixed', top: 40, left: 0, right: 0, zIndex: 99997,
                background: 'rgba(17,24,39,0.97)', backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(239,68,68,0.3)',
                padding: '12px 20px', maxHeight: 260, overflowY: 'auto',
            }}>
                <div style={{ fontSize: '0.78rem', color: '#f87171', fontWeight: 700, marginBottom: 8 }}>
                    {t('offlineStatusBar.syncErrorsTitle', 'Sync Errors — Re-scan these assets when the server is available')}
                </div>
                {syncErrors.map(err => (
                    <div key={err.id} style={{
                        display: 'flex', gap: 12, alignItems: 'center',
                        padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
                        fontSize: '0.78rem', color: '#e2e8f0',
                    }}>
                        <span style={{
                            background: err.syncResult === 'conflict' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)',
                            color: err.syncResult === 'conflict' ? '#fbbf24' : '#f87171',
                            padding: '1px 7px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700,
                            whiteSpace: 'nowrap',
                        }}>
                            {err.syncResult === 'conflict' ? 'CONFLICT' : err.syncResult?.toUpperCase()}
                        </span>
                        <span style={{ flex: 1 }}>
                            {err.assetId
                                ? `${t('offlineStatusBar.asset', 'Asset')} ${err.assetId}`
                                : err.endpoint}
                        </span>
                        {err.scanId && (
                            <span style={{ opacity: 0.4, fontSize: '0.7rem', fontFamily: 'monospace' }}>
                                {err.scanId.slice(0, 8)}…
                            </span>
                        )}
                        <span style={{ opacity: 0.4, fontSize: '0.7rem' }}>
                            {err.timestamp ? new Date(err.timestamp).toLocaleTimeString() : ''}
                        </span>
                    </div>
                ))}
            </div>
        )}
        </>
    );
}
