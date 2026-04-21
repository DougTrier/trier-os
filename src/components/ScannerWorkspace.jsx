// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * ScannerWorkspace.jsx — Scan State Machine — Floor-Level View
 * =============================================================
 * Thin orchestrator that sequences the two-step scan flow:
 *
 *   Step 1 — ScanCapture  : acquire asset code (wedge / camera / numeric)
 *   Step 2 — ScanActionPrompt : present context-adaptive action buttons
 *
 * State is managed locally and resets to capture after every completed action
 * so the tech is immediately ready for the next scan. Errors surface inline
 * rather than crashing the view — the tech can retry without navigating away.
 *
 * This component has no business logic of its own. The scan state machine
 * lives entirely in POST /api/scan (ScanCapture) and POST /api/scan/action
 * (ScanActionPrompt). This view only sequences them and handles the reset.
 *
 * -- PROPS ----------------------------------------------------------------
 *   plantId   {string}   Plant DB scope, passed down to both child components
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Scan, Home } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import ScanCapture from './ScanCapture';
import ScanActionPrompt from './ScanActionPrompt';
import { useTranslation } from '../i18n/index.jsx';
import OfflineDB from '../utils/OfflineDB.js';

export default function ScannerWorkspace({ plantId }) {
    const { t } = useTranslation();
    const userId = localStorage.getItem('userId') || localStorage.getItem('userRole') || 'unknown';
    const location = useLocation();
    const navigate = useNavigate();

    // Capture route state once on mount. effectivePlantId is derived at render time
    // so a QR-embedded plant always wins over the prop fallback.
    const effectivePlantId = location.state?.plantId || plantId;

    // step: 'capture' | 'prompt' | 'done'
    const [step, setStep] = useState('capture');
    const [scanResult, setScanResult]   = useState(null);
    const [error, setError]             = useState('');
    // pendingAssetId is stored in state so it can be explicitly cleared after first use,
    // preventing ScanCapture from re-auto-submitting when it remounts after an action.
    const [pendingAssetId, setPendingAssetId] = useState(location.state?.pendingAssetId || null);
    const [resumePrompt, setResumePrompt]     = useState(null); // { pendingAssetId } — stale submitting session

    // ── Session save/restore — survives app close while server is down ────────
    const SESSION_KEY = 'scanSession';

    useEffect(() => {
        OfflineDB.getMeta(SESSION_KEY).then(saved => {
            if (!saved) return;
            if (saved.step === 'prompt' && saved.scanResult) {
                setScanResult(saved.scanResult);
                setPendingAssetId(saved.pendingAssetId || null);
                setStep('prompt');
            } else if (saved.step === 'submitting' && saved.submittedAt && (Date.now() - saved.submittedAt) < 60000) {
                // App crashed mid-flight — offer to re-scan the same asset
                setResumePrompt({ pendingAssetId: saved.pendingAssetId });
                OfflineDB.setMeta(SESSION_KEY, null).catch(() => {});
            }
        }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (step === 'capture' && !scanResult) {
            OfflineDB.setMeta(SESSION_KEY, null).catch(() => {});
        } else {
            OfflineDB.setMeta(SESSION_KEY, { step, scanResult, pendingAssetId, ts: Date.now() }).catch(() => {});
        }
    }, [step, scanResult, pendingAssetId]);

    // ScanCapture fires this when the server returns a branch response
    const handleScanResult = useCallback((result) => {
        setScanResult(result);
        setError('');
        setStep('prompt');
    }, []);

    // ScanActionPrompt fires this when the chosen action completes.
    // 1. Clear pendingAssetId in the same React batch as setStep so ScanCapture
    //    mounts with initialAssetId=null — prevents in-session auto-submit loop.
    // 2. Replace the history entry (no state) so a pull-to-refresh reload doesn't
    //    restore pendingAssetId and fire a new scan on mount.
    const handleActionComplete = useCallback(() => {
        setScanResult(null);
        setError('');
        setPendingAssetId(null);
        setStep('capture');
        navigate('/scanner', { replace: true });
    }, [navigate]);

    const handleError = useCallback((msg) => {
        setError(msg);
        setStep('capture');
    }, []);

    return (
        <div style={{ minHeight: '100vh', background: 'transparent', padding: '32px 16px' }}>

            {/* ── Header ───────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Scan size={22} color="#10b981" />
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>
                        {t('scanner.title', 'Smart Scanner')}
                    </span>
                </div>
                <button
                    onClick={() => navigate('/')}
                    title={t('app.missionControl', 'Mission Control')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'rgba(245,158,11,0.1)',
                        border: '1px solid rgba(245,158,11,0.25)',
                        borderRadius: 8, color: '#f59e0b',
                        fontSize: '0.75rem', fontWeight: 600,
                        padding: '6px 12px', cursor: 'pointer',
                    }}
                >
                    <Home size={14} />
                    {t('app.missionControl', 'Mission Control')}
                </button>
            </div>

            {/* ── Resume prompt — shown when app crashed mid-scan ───────── */}
            {/* ScanCapture wrote a 'submitting' session to IndexedDB before
                the fetch; if the app crashed or the tab closed before the
                server responded, this prompt appears on the next open so the
                tech knows to verify the scan landed or re-scan the asset.
                Re-scan button restores pendingAssetId so ScanCapture
                auto-submits immediately without requiring another physical scan. */}
            {resumePrompt && (
                <div style={{
                    maxWidth: 440, margin: '0 auto 20px',
                    background: 'rgba(245,158,11,0.12)',
                    border: '1px solid rgba(245,158,11,0.35)',
                    borderRadius: 10, padding: '14px 18px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    fontSize: '0.85rem', color: '#fcd34d',
                }}>
                    <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                    <span style={{ flex: 1 }}>
                        {t('scanner.resumePrompt', 'Your last scan may not have completed — check status or re-scan.')}
                        {/* Show the asset ID so the tech can verify in the WO list
                            before deciding whether to re-scan or dismiss */}
                        {resumePrompt.pendingAssetId && (
                            <span style={{ opacity: 0.7, marginLeft: 6, fontSize: '0.75rem' }}>
                                ({resumePrompt.pendingAssetId})
                            </span>
                        )}
                    </span>
                    {/* Clicking Re-scan injects the saved assetId back into
                        ScanCapture via pendingAssetId, triggering auto-submit */}
                    <button
                        onClick={() => {
                            if (resumePrompt.pendingAssetId) setPendingAssetId(resumePrompt.pendingAssetId);
                            setResumePrompt(null);
                        }}
                        style={{
                            background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)',
                            borderRadius: 6, color: '#fcd34d', padding: '4px 10px',
                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                        }}
                    >
                        {t('scanner.reScan', 'Re-scan')}
                    </button>
                    <button
                        onClick={() => setResumePrompt(null)}
                        style={{
                            background: 'none', border: 'none',
                            color: 'rgba(252,211,77,0.5)', cursor: 'pointer', fontSize: '1rem',
                        }}
                        title={t('common.dismiss', 'Dismiss')}
                    >
                        ×
                    </button>
                </div>
            )}

            {/* ── Main content area ─────────────────────────────────────── */}
            <div style={{ maxWidth: 440, margin: '0 auto' }}>

                {step === 'capture' && (
                    <ScanCapture
                        plantId={effectivePlantId}
                        userId={userId}
                        onResult={handleScanResult}
                        onError={handleError}
                        initialAssetId={pendingAssetId}
                    />
                )}

                {step === 'prompt' && scanResult && (
                    <ScanActionPrompt
                        plantId={effectivePlantId}
                        userId={userId}
                        scanId={scanResult.scanId}
                        deviceTimestamp={scanResult.deviceTimestamp}
                        branchResponse={scanResult}
                        onActionComplete={handleActionComplete}
                        onCancel={handleActionComplete}
                    />
                )}

            </div>
        </div>
    );
}
