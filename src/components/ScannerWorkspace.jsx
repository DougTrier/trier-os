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

import React, { useState, useCallback } from 'react';
import { Scan, Home } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import ScanCapture from './ScanCapture';
import ScanActionPrompt from './ScanActionPrompt';
import { useTranslation } from '../i18n/index.jsx';

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
